-- supabase_jxj_fase5.sql — modo Online: integridade e pareamento (2026-10-21, fase 5 do plano do Online).
--
-- Rodar DEPOIS de supabase_jxj.sql, supabase_jxj_narracao.sql,
-- supabase_jxj_raio.sql, supabase_jxj_movimento.sql, supabase_jxj_bot.sql e
-- supabase_jxj_motor3.sql. Só com a aprovação do dono, depois do backup.
-- SÓ ADITIVA: duas chaves novas em jxj_config (só se ainda não existem),
-- uma função nova de leitura (jxj_lutas_contra_gente) e duas funções
-- refeitas com a MESMA assinatura (jxj_torneio_inscrever e
-- jxj_fila_parear). Não cria tabela, não apaga e não reescreve dado
-- nenhum. Pode rodar de novo sem erro.
-- Desfazer: rodar de novo supabase_jxj.sql só no trecho da
-- jxj_torneio_inscrever e supabase_jxj_raio.sql inteiro (as versões de
-- antes), ou supabase_jxj_rollback.sql (apaga tudo do JxJ).
--
-- O que muda:
-- 1. Torneio pede 3 lutas com rating contra outros jogadores (pedido do
--    dono): luta contra bot continua valendo rating, mas não conta pra
--    entrar em torneio. Conta luta encerrada, com rating, sem bot e não
--    anulada, em que o lutador esteve (lado A ou B).
-- 2. A fila considera o nível: o par precisa ter no máximo
--    fila_nivel_base níveis de diferença (5), mais fila_nivel_seg (2) a
--    cada 10 s da espera mais longa do par, sem teto (a fila nunca trava
--    por nível; aos 30 s, quando a tela oferece o bot, já são 11). Rating
--    e raio continuam como antes. As duas chaves ficam em jxj_config pro
--    dono ajustar sem migração. Medido na simulação da temporada (fila
--    com 1 chegada a cada 10 s): par com mais de 10 níveis de diferença
--    cai de 19% pra 3%, e quem vai pro bot aos 30 s sobe de 21% pra 28%.
-- 3. jxj_lutas_contra_gente(uid): quantas lutas com rating contra gente
--    cada lutador da conta tem, pra tela mostrar quanto falta pro torneio.
--
-- O servidor (api/jxj.js) funciona com ou sem esta migração: sem ela, o
-- torneio pede 3 lutas com rating (qualquer adversário), a fila não olha
-- o nível e a tela usa a conta de lutas com rating, como antes.

insert into jxj_config (chave, valor) values
  ('fila_nivel_base', '5'::jsonb),
  ('fila_nivel_seg', '2'::jsonb)
on conflict (chave) do nothing;

/* lutas com rating contra gente de um lutador (sem bot, sem anulada) */
create or replace function public.jxj_lutas_gente_do_lutador(lid bigint) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from jxj_lutas x
   where (x.a_id = lid or x.b_id = lid) and x.status = 'encerrada' and x.com_rating and x.bot is null
     and coalesce(x.resultado->>'metodo', '') <> 'ANULADA'
$$;

create or replace function public.jxj_lutas_contra_gente(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(l.id::text, public.jxj_lutas_gente_do_lutador(l.id)), '{}'::jsonb)
    from jxj_lutadores l where l.user_id = uid
$$;

/* inscrição: principal efetivo, ativo, Pro, 3+ lutas com rating CONTRA
   GENTE, uma por conta. Na 8ª, fecha: sementes pelo rating e as quartas
   com janela de 24 h. Igual à de supabase_jxj.sql, menos a contagem. */
create or replace function public.jxj_torneio_inscrever(uid uuid, lid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jxj_lutadores; t jxj_torneios; n integer; rec record; i integer;
begin
  if public.jxj_banido(uid) then raise exception 'jxj: conta suspensa'; end if;
  l := public.jxj_meu_lutador(uid, lid);
  if not public.jxj_pro_ativo(uid) then raise exception 'jxj: torneio é do Pro'; end if;
  if l.id <> coalesce(public.jxj_principal_efetivo(uid), -1) then raise exception 'jxj: só o lutador principal entra em torneio'; end if;
  if public.jxj_lutas_gente_do_lutador(l.id) < 3 then
    raise exception 'jxj: são precisas 3 lutas com rating contra outros jogadores pra entrar em torneio (luta contra bot não conta)';
  end if;
  perform pg_advisory_xact_lock(hashtext('jxj_torneio_' || l.categoria));
  t := public.jxj_torneio_aberto(l.categoria);
  if exists (select 1 from jxj_inscricoes i join jxj_torneios x on x.id = i.torneio_id where i.user_id = uid and x.status <> 'encerrado') then
    raise exception 'jxj: você já está num torneio';
  end if;
  insert into jxj_inscricoes (torneio_id, lutador_id, user_id, rating_inscricao) values (t.id, l.id, uid, l.rating);
  select count(*) into n from jxj_inscricoes where torneio_id = t.id;
  perform public.jxj_registrar(uid, 'torneio_inscrever', jsonb_build_object('torneio', t.id, 'lutador', l.id));
  if n >= t.vagas then
    i := 0;
    for rec in select * from jxj_inscricoes where torneio_id = t.id order by rating_inscricao desc, inscrito_em loop
      i := i + 1;
      update jxj_inscricoes set semente = i where torneio_id = t.id and lutador_id = rec.lutador_id;
    end loop;
    update jxj_torneios set status = 'andamento', fase = 1, iniciado_em = now() where id = t.id;
    insert into jxj_confrontos (torneio_id, fase, ordem, a_id, b_id, janela_ate)
      select t.id, 1, o.ordem,
        (select lutador_id from jxj_inscricoes where torneio_id = t.id and semente = o.sa),
        (select lutador_id from jxj_inscricoes where torneio_id = t.id and semente = o.sb),
        now() + interval '24 hours'
      from (values (1, 1, 8), (2, 4, 5), (3, 2, 7), (4, 3, 6)) as o(ordem, sa, sb);
    perform public.jxj_torneio_aberto(l.categoria);   -- já abre o próximo
  end if;
  return jsonb_build_object('torneio', t.id, 'inscritos', n, 'vagas', t.vagas);
end $$;

/* Sinal de vida + tentativa de par: rating (faixa da espera e raio dos
   DOIS, como em supabase_jxj_raio.sql) e, agora, nível. */
create or replace function public.jxj_fila_parear(uid uuid, semente_ text, tol_base double precision, tol_seg double precision, tol_max double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu jxj_fila; ele jxj_fila; la jxj_lutadores; lb jxj_lutadores; luta jxj_lutas; c jxj_contas; tol double precision; espera double precision;
        meu_nivel integer; niv_base double precision; niv_seg double precision; cfg jsonb;
begin
  select * into c from jxj_contas where user_id = uid;
  if found and c.luta_aberta_id is not null then
    delete from jxj_fila where user_id = uid;
    return jsonb_build_object('luta', c.luta_aberta_id);
  end if;
  update jxj_fila set sinal_em = now() where user_id = uid returning * into eu;
  if not found then return jsonb_build_object('naFila', false); end if;
  perform 1 from jxj_fila where user_id = uid for update;
  select nivel into meu_nivel from jxj_lutadores where id = eu.lutador_id;
  cfg := public.jxj_cfg('fila_nivel_base');
  niv_base := case when jsonb_typeof(cfg) = 'number' then least(greatest((cfg)::text::double precision, 0), 30) else 5 end;
  cfg := public.jxj_cfg('fila_nivel_seg');
  niv_seg := case when jsonb_typeof(cfg) = 'number' then least(greatest((cfg)::text::double precision, 0), 30) else 2 end;
  select f.* into ele from jxj_fila f
    join jxj_contas cc on cc.user_id = f.user_id
    join jxj_lutadores lf on lf.id = f.lutador_id
    where f.user_id <> uid and f.categoria = eu.categoria and f.versao = eu.versao
      and f.sinal_em > now() - interval '12 seconds'
      and cc.luta_aberta_id is null
      and not public.jxj_banido(f.user_id)
      /* faixa da espera (cresce sem teto) limitada pelo raio dos DOIS; sem
         raio, o teto é tol_max (400), como antes da migração */
      and abs(f.rating - eu.rating) <= least(
            tol_base + tol_seg * floor(extract(epoch from (now() - least(f.entrou_em, eu.entrou_em))) / 10),
            coalesce(eu.raio, tol_max), coalesce(f.raio, tol_max))
      /* nível: base, mais fila_nivel_seg a cada 10 s da espera mais longa, sem teto */
      and abs(lf.nivel - coalesce(meu_nivel, lf.nivel)) <=
            niv_base + niv_seg * floor(extract(epoch from (now() - least(f.entrou_em, eu.entrou_em))) / 10)
    order by (f.lutador_id = coalesce(eu.ultimo_adversario, -1)) asc, abs(f.rating - eu.rating) asc, f.entrou_em asc
    limit 1
    for update of f skip locked;
  if not found then
    espera := extract(epoch from (now() - eu.entrou_em));
    return jsonb_build_object('naFila', true, 'esperaSeg', floor(espera),
      'tolerancia', least(tol_base + tol_seg * floor(espera / 10), coalesce(eu.raio, tol_max)), 'raio', eu.raio,
      'toleranciaNivel', niv_base + niv_seg * floor(espera / 10));
  end if;
  select * into la from jxj_lutadores where id = eu.lutador_id;
  select * into lb from jxj_lutadores where id = ele.lutador_id;
  insert into jxj_lutas (tipo, a_id, b_id, a_user, b_user, status, confirmacao_ate, fila_entrou_a, fila_entrou_b,
                         semente, compromisso, nomes)
    values ('fila', la.id, lb.id, la.user_id, lb.user_id, 'confirmacao', now() + interval '20 seconds', eu.entrou_em, ele.entrou_em,
            semente_, encode(sha256(convert_to(semente_, 'UTF8')), 'hex'),
            jsonb_build_object('a', jsonb_build_object('nome', la.nome, 'rosto', la.rosto, 'estilo', la.estilo, 'nivel', la.nivel, 'rating', la.rating, 'cartel', jsonb_build_array(la.vitorias, la.derrotas, la.empates), 'moldura', la.moldura),
                               'b', jsonb_build_object('nome', lb.nome, 'rosto', lb.rosto, 'estilo', lb.estilo, 'nivel', lb.nivel, 'rating', lb.rating, 'cartel', jsonb_build_array(lb.vitorias, lb.derrotas, lb.empates), 'moldura', lb.moldura)))
    returning * into luta;
  update jxj_contas set luta_aberta_id = luta.id where user_id in (la.user_id, lb.user_id) and luta_aberta_id is null;
  if (select count(*) from jxj_contas where luta_aberta_id = luta.id) <> 2 then
    raise exception 'jxj: par desfeito, tente de novo';   -- desfaz tudo (transação)
  end if;
  delete from jxj_fila where user_id in (la.user_id, lb.user_id);
  perform public.jxj_registrar(uid, 'par', jsonb_build_object('luta', luta.id, 'a', la.id, 'b', lb.id));
  return jsonb_build_object('luta', luta.id);
end $$;

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
