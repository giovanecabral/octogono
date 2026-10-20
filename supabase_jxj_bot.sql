-- supabase_jxj_bot.sql: modo Online, lutas contra bot (2026-10-19).
--
-- Rodar DEPOIS de supabase_jxj.sql, supabase_jxj_narracao.sql,
-- supabase_jxj_raio.sql e supabase_jxj_movimento.sql.
-- SÓ ADITIVA: uma coluna nova em jxj_lutas (bot, vazia em toda luta que já
-- existe), um índice, quatro funções novas (jxj_bot_configurar, jxj_bot_hoje,
-- jxj_bot_info, jxj_bot_criar) e quatro refeitas com a MESMA assinatura:
--   - jxj_gravar_troca: pula o lado sem efeitos (o do bot);
--   - jxj_luta: não conta as lutas do lutador âncora dos bots (milhares)
--     a cada consulta da tela;
--   - jxj_historico: luta contra bot sai sem o id do adversário (o âncora
--     não é um lutador de ninguém e não vira link nem rival);
--   - jxj_movimento: conta só gente (luta contra bot é uma pessoa).
-- Não apaga, não muda e não reescreve dado nenhum. Pode rodar de novo sem
-- erro. Desfazer: supabase_jxj_rollback.sql (apaga tudo do JxJ, inclusive
-- isto).
--
-- Depois de rodar, uma vez:
--   1. Criar uma conta pelo site com um e-mail seu. Ela vira a conta dos
--      bots: não precisa jogar com ela e ela não pode ter lutador no Online.
--   2. select public.jxj_bot_configurar('o-email-dessa-conta');
-- Sem o passo 2 a tela não oferece bot (jxj_bot_info diz disponivel:false).
--
-- Como funciona: o bot de cada luta é montado no servidor (api/_jxj-bot.js)
-- e gravado na própria luta (coluna bot, que nunca vai pra tela). No banco,
-- o lado B da luta é o lutador âncora da conta dos bots, aposentado (fora do
-- ranking, da fila, da temporada e do Hall), só porque a tabela pede um
-- lutador de verdade. Rating, XP, fichas, cartel e conquistas mudam só pro
-- jogador; o âncora nunca muda.
--
-- Regras (os números vêm do servidor, api/_jxj-regras.js):
--   - Pro: entra na fila e, depois de espera_s segundos sem adversário, pode
--     chamar o bot. Sem limite.
--   - Grátis que já usou a luta grátis: chama o bot direto, limite_free por
--     dia (dia de São Paulo).
--   - Grátis que ainda tem a luta grátis: pela fila, como o Pro, e conta no
--     limite do dia. A luta grátis continua guardada.
--
-- O servidor (api/jxj.js) funciona com ou sem esta migração: sem ela, a
-- tela só não oferece bot.

alter table jxj_lutas add column if not exists bot jsonb;
create index if not exists jxj_lutas_bot_conta on jxj_lutas (a_user, criada_em desc) where bot is not null;

/* Liga os bots: a conta (pelo e-mail) e o lutador âncora dela. Rodar de novo
   não duplica nada; com outro e-mail, troca a conta dos bots. */
create or replace function public.jxj_bot_configurar(email_ text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; l jxj_lutadores;
begin
  select id into u from auth.users where lower(email) = lower(trim(email_)) limit 1;
  if u is null then raise exception 'jxj: nenhuma conta com esse e-mail; crie a conta pelo site antes'; end if;
  if exists (select 1 from jxj_lutadores where user_id = u and status = 'ativo') then
    raise exception 'jxj: essa conta tem lutador no Online; use uma conta nova só pros bots';
  end if;
  perform public.jxj_conta(u);
  select * into l from jxj_lutadores where user_id = u and nome_chave = 'bot' and status = 'aposentado' order by id limit 1;
  if not found then
    insert into jxj_lutadores (user_id, slot, nome, nome_chave, rosto, categoria, estilo, status, aposentado_em)
      values (u, 1, 'Bot', 'bot', '{"v":2}'::jsonb, 'middleweight', 'striker', 'aposentado', now())
      returning * into l;
  end if;
  insert into jxj_config (chave, valor, atualizado_em) values ('bot', jsonb_build_object('user', u, 'lutador', l.id), now())
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  perform public.jxj_registrar(null, 'bot_configurado', jsonb_build_object('lutador', l.id));
  return jsonb_build_object('user', u, 'lutador', l.id);
end $$;

/* Lutas contra bot que a conta começou hoje (dia de São Paulo) */
create or replace function public.jxj_bot_hoje(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from jxj_lutas x
  where x.bot is not null and x.a_user = uid
    and x.criada_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
$$;

/* O que a tela precisa saber: se os bots estão ligados e quantas lutas
   contra bot a conta ainda tem hoje (restantes null = sem limite, Pro) */
create or replace function public.jxj_bot_info(uid uuid, limite_free integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb; pro boolean; hoje integer;
begin
  cfg := public.jxj_cfg('bot');
  pro := public.jxj_pro_ativo(uid);
  hoje := public.jxj_bot_hoje(uid);
  return jsonb_build_object(
    'disponivel', cfg is not null and (cfg->>'user')::uuid is distinct from uid,
    'pro', pro, 'hoje', hoje,
    'limite', case when pro then null else limite_free end,
    'restantes', case when pro then null else greatest(0, limite_free - hoje) end);
end $$;

/* Cria a luta contra o bot, já em andamento, com o jogador no lado A. O bot
   (perfis_, nome_b, bot_) vem pronto do servidor; aqui ficam as regras de
   acesso e a trava de uma luta por conta, na mesma transação. */
create or replace function public.jxj_bot_criar(uid uuid, lid bigint, semente_ text, perfis_ jsonb, estado_ jsonb,
  nome_b jsonb, bot_ jsonb, prazo_ms integer, espera_s integer, limite_free integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cfg jsonb; bot_user uuid; bot_lid bigint; c jxj_contas; l jxj_lutadores; pro boolean; f jxj_fila; pela_fila boolean; nova jxj_lutas;
begin
  if public.jxj_banido(uid) then raise exception 'jxj: conta suspensa'; end if;
  cfg := public.jxj_cfg('bot');
  if cfg is null then raise exception 'jxj: as lutas contra bot ainda não foram ligadas'; end if;
  bot_user := (cfg->>'user')::uuid;
  bot_lid := (cfg->>'lutador')::bigint;
  if uid = bot_user then raise exception 'jxj: esta é a conta dos bots'; end if;
  if bot_ is null or nome_b is null or perfis_ is null or estado_ is null then raise exception 'jxj: bot inválido'; end if;
  perform public.jxj_conta(uid);
  select * into c from jxj_contas where user_id = uid for update;
  -- clique duplo, ou par com gente achado ao mesmo tempo: fica a luta que já existe
  if c.luta_aberta_id is not null then return jsonb_build_object('luta', c.luta_aberta_id, 'jaAberta', true); end if;
  l := public.jxj_meu_lutador(uid, lid);
  if not public.jxj_utilizavel(l) then raise exception 'jxj: esse lutador está inativo (slot extra sem Pro)'; end if;
  pro := public.jxj_pro_ativo(uid);
  pela_fila := pro or not c.luta_gratis_usada;
  if pela_fila then
    select * into f from jxj_fila where user_id = uid for update;
    if not found or f.entrou_em > now() - make_interval(secs => espera_s) then
      raise exception 'jxj: o bot aparece depois de % segundos na fila sem adversário', espera_s;
    end if;
    if f.lutador_id <> lid then raise exception 'jxj: o lutador da fila é outro'; end if;
  end if;
  if not pro and public.jxj_bot_hoje(uid) >= limite_free then
    raise exception 'jxj: as % lutas contra bot de hoje já foram usadas; o limite volta à meia-noite', limite_free;
  end if;
  insert into jxj_lutas (tipo, a_id, b_id, a_user, b_user, status, confirmado_a, confirmado_b, fila_entrou_a,
                         semente, compromisso, nomes, perfis, estado, iniciada_em, prazo, com_rating, versao, bot)
    values ('fila', l.id, bot_lid, uid, bot_user, 'andamento', true, true, case when pela_fila then f.entrou_em end,
            semente_, encode(sha256(convert_to(semente_, 'UTF8')), 'hex'),
            jsonb_build_object('a', jsonb_build_object('nome', l.nome, 'rosto', l.rosto, 'estilo', l.estilo, 'nivel', l.nivel, 'rating', l.rating,
                                                       'cartel', jsonb_build_array(l.vitorias, l.derrotas, l.empates), 'moldura', l.moldura),
                               'b', nome_b || jsonb_build_object('bot', true)),
            perfis_, estado_, now(), now() + make_interval(secs => prazo_ms / 1000.0), true, 1, bot_)
    returning * into nova;
  update jxj_contas set luta_aberta_id = nova.id where user_id = uid;
  delete from jxj_fila where user_id = uid;
  perform public.jxj_registrar(uid, 'bot', jsonb_build_object('luta', nova.id, 'lutador', lid));
  return jsonb_build_object('luta', nova.id);
end $$;

/* Igual à de supabase_jxj.sql, com uma diferença: o lado sem efeitos (o do
   bot) é pulado, então o âncora nunca ganha XP, rating, cartel nem fichas.
   Luta entre gente manda os dois lados, como antes. */
create or replace function public.jxj_gravar_troca(lid bigint, versao_ integer, round_ smallint, troca_ smallint,
  acao_a_ text, acao_b_ text, eventos_ jsonb, estado_ jsonb, prazo_ms integer, fim_ jsonb, efeitos_ jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; lado text; e jsonb; lid_lut bigint; uid_ uuid; fichas_dia integer; dar integer; t jxj_temporadas; conf jxj_confrontos;
begin
  select * into l from jxj_lutas where id = lid for update;
  if not found or l.status <> 'andamento' or l.versao <> versao_ or l.round <> round_ or l.troca <> troca_ then
    return jsonb_build_object('gravou', false);
  end if;
  insert into jxj_trocas (luta_id, round, troca, acao_a, acao_b, eventos) values (lid, round_, troca_, acao_a_, acao_b_, eventos_);
  if fim_ is null then
    update jxj_lutas set estado = estado_, round = (estado_->>'round')::smallint, troca = (estado_->>'troca')::smallint,
      prazo = now() + make_interval(secs => prazo_ms / 1000.0), versao = versao + 1
      where id = lid;
    return jsonb_build_object('gravou', true, 'fim', false);
  end if;
  t := public.jxj_temporada_garantir();
  update jxj_lutas set estado = estado_, status = 'encerrada', encerrada_em = now(), resultado = fim_, efeitos = efeitos_,
    prazo = null, versao = versao + 1 where id = lid;
  update jxj_contas set luta_aberta_id = null where luta_aberta_id = lid;
  for lado in select unnest(array['a', 'b']) loop
    e := efeitos_->lado;
    if e is null or jsonb_typeof(e) <> 'object' then continue; end if;
    lid_lut := case when lado = 'a' then l.a_id else l.b_id end;
    uid_ := case when lado = 'a' then l.a_user else l.b_user end;
    update jxj_lutadores set
      xp = xp + (e->>'xp')::integer,
      nivel = public.jxj_nivel_do_xp(xp + (e->>'xp')::integer),
      vitorias = vitorias + case when e->>'resultado' = 'vitoria' then 1 else 0 end,
      derrotas = derrotas + case when e->>'resultado' = 'derrota' then 1 else 0 end,
      empates = empates + case when e->>'resultado' = 'empate' then 1 else 0 end,
      kos = kos + case when e->>'resultado' = 'vitoria' and fim_->>'metodo' in ('KO', 'TKO') then 1 else 0 end,
      finalizacoes = finalizacoes + case when e->>'resultado' = 'vitoria' and fim_->>'metodo' = 'FIN' then 1 else 0 end,
      wos = wos + case when e->>'resultado' = 'derrota' and fim_->>'metodo' = 'WO' then 1 else 0 end,
      rating = coalesce((e->'rating'->>'r')::double precision, rating),
      rd = coalesce((e->'rating'->>'rd')::double precision, rd),
      vol = coalesce((e->'rating'->>'vol')::double precision, vol),
      lutas_rating = lutas_rating + case when e ? 'rating' then 1 else 0 end,
      ultima_luta_rating = case when e ? 'rating' then now() else ultima_luta_rating end
      where id = lid_lut;
    if e ? 'rating' then
      insert into jxj_rating_hist (lutador_id, luta_id, temporada, rating_antes, rating_depois, rd_depois)
        values (lid_lut, lid, t.numero, (e->'ratingAntes'->>'r')::double precision, (e->'rating'->>'r')::double precision, (e->'rating'->>'rd')::double precision);
    end if;
    if coalesce((e->>'fichas')::integer, 0) > 0 then
      select coalesce(sum(delta), 0) into fichas_dia from jxj_fichas where user_id = uid_ and motivo = 'luta' and criado_em > now() - interval '24 hours';
      dar := greatest(0, least((e->>'fichas')::integer, 120 - fichas_dia));
      if dar > 0 then
        update jxj_contas set fichas = fichas + dar where user_id = uid_;
        insert into jxj_fichas (user_id, delta, motivo, ref) values (uid_, dar, 'luta', lid::text);
      end if;
    end if;
    perform public.jxj_dar_conquista(lid_lut, uid_, x) from jsonb_array_elements_text(coalesce(e->'conquistas', '[]'::jsonb)) x;
  end loop;
  if l.confronto_id is not null then
    select * into conf from jxj_confrontos where id = l.confronto_id for update;
    if conf.vencedor_id is null then
      update jxj_confrontos set vencedor_id = case
          when fim_->>'vencedor' = 'a' then l.a_id
          when fim_->>'vencedor' = 'b' then l.b_id
          else (select id from jxj_lutadores where id in (l.a_id, l.b_id) order by rating desc, id limit 1) end,
        motivo = case when fim_->>'vencedor' is null then 'empate_rating' else 'luta' end
        where id = l.confronto_id;
    end if;
  end if;
  perform public.jxj_registrar(null, 'luta_encerrada', jsonb_build_object('luta', lid, 'metodo', fim_->>'metodo', 'vencedor', fim_->>'vencedor'));
  return jsonb_build_object('gravou', true, 'fim', true);
end $$;

/* Igual à de supabase_jxj.sql, menos as contas do lado B quando a luta é
   contra bot: o âncora acumula todas as lutas contra bot, e contar isso a
   cada consulta da tela (uma por segundo por jogador) pesaria à toa. O
   servidor não usa esses campos do lado do bot. */
create or replace function public.jxj_luta(lid bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('luta', to_jsonb(l),
    'acoes', coalesce((select jsonb_agg(to_jsonb(a)) from jxj_acoes a where a.luta_id = l.id and a.round = l.round and a.troca = l.troca), '[]'::jsonb),
    'trocas', coalesce((select jsonb_agg(to_jsonb(t) order by t.round, t.troca) from jxj_trocas t where t.luta_id = l.id), '[]'::jsonb),
    'lutadorA', (select to_jsonb(x) from jxj_lutadores x where x.id = l.a_id),
    'lutadorB', (select to_jsonb(x) from jxj_lutadores x where x.id = l.b_id),
    'conquistasA', coalesce((select jsonb_agg(c.conquista) from jxj_conquistas c where c.lutador_id = l.a_id), '[]'::jsonb),
    'conquistasB', case when l.bot is not null then '[]'::jsonb
      else coalesce((select jsonb_agg(c.conquista) from jxj_conquistas c where c.lutador_id = l.b_id), '[]'::jsonb) end,
    'lutasHojeA', (select count(*) from jxj_lutas x where x.status = 'encerrada' and x.id <> l.id and (x.a_id = l.a_id or x.b_id = l.a_id) and x.encerrada_em > now() - interval '24 hours'),
    'lutasHojeB', case when l.bot is not null then 0
      else (select count(*) from jxj_lutas x where x.status = 'encerrada' and x.id <> l.id and (x.a_id = l.b_id or x.b_id = l.b_id) and x.encerrada_em > now() - interval '24 hours') end,
    'ultimoEntreEles', case when l.bot is not null then null
      else (select case when x.resultado->>'vencedor' is null then 'empate'
                        when (x.a_id = l.a_id) = (x.resultado->>'vencedor' = 'a') then 'a' else 'b' end
            from jxj_lutas x where x.status = 'encerrada' and x.id <> l.id
              and ((x.a_id = l.a_id and x.b_id = l.b_id) or (x.a_id = l.b_id and x.b_id = l.a_id))
            order by x.encerrada_em desc limit 1) end,
    'agora', now())
  from jxj_lutas l where l.id = lid
$$;

/* Igual à de supabase_jxj.sql, menos o id do adversário nas lutas contra
   bot: o âncora não é lutador de ninguém (o nome e o selo do bot vêm em
   adversario, que é o nomes.b da luta). */
create or replace function public.jxj_historico(lid bigint, pagina integer) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'em') desc), '[]'::jsonb) from (
    select jsonb_build_object('luta', l.id, 'tipo', l.tipo, 'em', l.encerrada_em,
      'lado', case when l.a_id = lid then 'a' else 'b' end,
      'adversario', case when l.a_id = lid then l.nomes->'b' else l.nomes->'a' end,
      'adversarioId', case when l.bot is not null then null when l.a_id = lid then l.b_id else l.a_id end,
      'resultado', l.resultado, 'comRating', l.com_rating,
      'ratingDelta', round(coalesce((l.efeitos->(case when l.a_id = lid then 'a' else 'b' end)->'rating'->>'r')::double precision
                                  - (l.efeitos->(case when l.a_id = lid then 'a' else 'b' end)->'ratingAntes'->>'r')::double precision, 0))) as x
    from jxj_lutas l where (l.a_id = lid or l.b_id = lid) and l.status = 'encerrada'
    order by l.encerrada_em desc limit 20 offset greatest(0, pagina) * 20) s
$$;

/* Igual à de supabase_jxj_movimento.sql, contando gente: luta contra bot é
   uma pessoa, e luta contra bot largada (prazo vencido há mais de um minuto)
   não conta. */
create or replace function public.jxj_movimento()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'fila', (select count(*) from jxj_fila where sinal_em > now() - interval '12 seconds'),
    'lutando', (select coalesce(sum(case when bot is null then 2 else 1 end), 0) from jxj_lutas
                where status in ('confirmacao', 'andamento') and (bot is null or prazo > now() - interval '1 minute'))
  )
$$;

/* permissões: as funções novas também só a service_role executa (mesmo
   bloco do supabase_jxj.sql, repetido porque roda depois dele) */
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'jxj\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
