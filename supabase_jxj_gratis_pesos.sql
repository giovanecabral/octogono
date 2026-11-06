-- supabase_jxj_gratis_pesos.sql, modo Online: pesos diferentes na fila e a luta grátis por dia (2026-11-06, pedido do dono).
--
-- Rodar DEPOIS de todas as outras do Online: supabase_jxj.sql,
-- supabase_jxj_narracao.sql, supabase_jxj_raio.sql,
-- supabase_jxj_movimento.sql, supabase_jxj_bot.sql,
-- supabase_jxj_motor3.sql, supabase_jxj_fase5.sql e
-- supabase_jxj_estrategia.sql. Só com a aprovação do dono, depois do backup.
-- SÓ ADITIVA: uma coluna nova em jxj_contas (luta_gratis_em, vazia), um
-- gatilho que preenche essa coluna, uma função nova (jxj_gratis_renovar) e
-- uma refeita com a MESMA assinatura (jxj_fila_parear). Não cria tabela,
-- não apaga e não reescreve dado nenhum. Pode rodar de novo sem erro.
-- Desfazer: rodar de novo supabase_jxj_fase5.sql (a jxj_fila_parear de
-- antes) e
--   drop trigger if exists jxj_contas_gratis_em on jxj_contas;
--   drop function if exists public.jxj_contas_gratis_em();
--   drop function if exists public.jxj_gratis_renovar(uuid);
-- (a coluna pode ficar: sem o gatilho e a função, ninguém lê).
--
-- O que muda:
-- 1. Pesos diferentes lutam entre si. A fila junta lutadores de qualquer
--    categoria; entre os que estão na fila naquele momento, o mesmo peso
--    vem primeiro. Medido (400 lutas por estilo, nível 1, jogo racional):
--    o mais pesado vence de 49,7% a 51,7% na média, porque a categoria só
--    mexe um pouco em poder, queixo e cardio e soma zero. Ranking da
--    temporada e torneio continuam por categoria; o bot, no peso do
--    jogador.
-- 2. A luta grátis contra gente vira uma por dia (dia de São Paulo, o
--    mesmo do limite do bot). O gatilho grava em luta_gratis_em quando a
--    luta grátis é gasta; jxj_gratis_renovar(uid), que o servidor chama
--    antes do estado, da entrada na fila e do bot, devolve a luta grátis
--    se ela foi gasta num dia anterior (ou antes desta migração, sem data).
--
-- O servidor (api/jxj.js) funciona com ou sem esta migração: sem ela
-- (PGRST202 na jxj_gratis_renovar), a luta grátis continua uma por conta,
-- a fila só junta a mesma categoria e a tela fala como antes.

alter table jxj_contas add column if not exists luta_gratis_em timestamptz;

/* grava quando a luta grátis foi gasta (o flag passou de false pra true) */
create or replace function public.jxj_contas_gratis_em() returns trigger language plpgsql as $$
begin
  if new.luta_gratis_usada and not coalesce(old.luta_gratis_usada, false) then new.luta_gratis_em := now(); end if;
  return new;
end $$;
drop trigger if exists jxj_contas_gratis_em on jxj_contas;
create trigger jxj_contas_gratis_em before update of luta_gratis_usada on jxj_contas
  for each row execute function public.jxj_contas_gratis_em();

/* devolve a luta grátis gasta num dia anterior (São Paulo); true = a regra
   por dia está ligada (o servidor manda isso pra tela) */
create or replace function public.jxj_gratis_renovar(uid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update jxj_contas set luta_gratis_usada = false
    where user_id = uid and luta_gratis_usada
      and (luta_gratis_em is null
           or (luta_gratis_em at time zone 'America/Sao_Paulo')::date < (now() at time zone 'America/Sao_Paulo')::date);
  return true;
end $$;

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
    /* 2026-11-06: qualquer peso (antes: f.categoria = eu.categoria) */
    where f.user_id <> uid and f.versao = eu.versao
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
    /* o mesmo peso primeiro, entre quem está na fila agora */
    order by (f.lutador_id = coalesce(eu.ultimo_adversario, -1)) asc, (f.categoria <> eu.categoria) asc, abs(f.rating - eu.rating) asc, f.entrou_em asc
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

-- Conferência (rodar depois; tem que dar true, true e true):
--   select exists (select 1 from information_schema.columns where table_name = 'jxj_contas' and column_name = 'luta_gratis_em') as coluna,
--          exists (select 1 from pg_proc where proname = 'jxj_gratis_renovar') as renovar,
--          position('f.categoria <> eu.categoria' in pg_get_functiondef('public.jxj_fila_parear(uuid, text, double precision, double precision, double precision)'::regprocedure)) > 0 as pesos;
