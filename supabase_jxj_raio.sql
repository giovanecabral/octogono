-- supabase_jxj_raio.sql — modo Online: o jogador escolhe a diferença máxima de rating na fila (2026-10-04).
--
-- Rodar DEPOIS de supabase_jxj.sql e supabase_jxj_narracao.sql.
-- SÓ ADITIVA: uma coluna nova em jxj_fila (vazia = comportamento de antes),
-- uma trava de valor nessa coluna, uma função nova (jxj_fila_entrar_raio) e
-- a jxj_fila_parear refeita com a MESMA assinatura. Não apaga, não muda e
-- não reescreve dado nenhum. Pode rodar de novo sem erro.
-- Desfazer: supabase_jxj_rollback.sql (apaga tudo do JxJ, inclusive isto).
--
-- O que muda:
-- 1. jxj_fila.raio: a diferença máxima de rating que o jogador aceita
--    (100, 200, 400 ou 2000, que é "qualquer diferença"). Vazio = como
--    antes: até 400, crescendo com a espera.
-- 2. jxj_fila_entrar_raio(uid, lid, raio_): entra na fila pela mesma
--    jxj_fila_entrar de sempre (todas as travas dela valem) e grava o raio,
--    numa transação só.
-- 3. jxj_fila_parear: o par precisa caber no raio dos DOIS e na faixa da
--    espera (100 pontos, mais 25 a cada 10 s). Sem raio, a faixa para em
--    400, igual a hoje; com raio, para no raio (2000 deixa a faixa crescer
--    até achar alguém).
--
-- O servidor (api/jxj.js) funciona com ou sem esta migração: sem ela, a
-- fila segue como hoje e a tela avisa que o filtro ainda não está ligado.

alter table jxj_fila add column if not exists raio double precision;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jxj_fila_raio_valido') then
    alter table jxj_fila add constraint jxj_fila_raio_valido check (raio is null or raio in (100, 200, 400, 2000));
  end if;
end $$;

create or replace function public.jxj_fila_entrar_raio(uid uuid, lid bigint, raio_ double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if raio_ is not null and raio_ not in (100, 200, 400, 2000) then
    raise exception 'jxj: diferença de rating inválida';
  end if;
  r := public.jxj_fila_entrar(uid, lid);
  update jxj_fila set raio = raio_ where user_id = uid;
  return r || jsonb_build_object('raio', raio_);
end $$;

/* Sinal de vida + tentativa de par, agora com o raio de cada um. */
create or replace function public.jxj_fila_parear(uid uuid, semente_ text, tol_base double precision, tol_seg double precision, tol_max double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu jxj_fila; ele jxj_fila; la jxj_lutadores; lb jxj_lutadores; luta jxj_lutas; c jxj_contas; tol double precision; espera double precision;
begin
  select * into c from jxj_contas where user_id = uid;
  if found and c.luta_aberta_id is not null then
    delete from jxj_fila where user_id = uid;
    return jsonb_build_object('luta', c.luta_aberta_id);
  end if;
  update jxj_fila set sinal_em = now() where user_id = uid returning * into eu;
  if not found then return jsonb_build_object('naFila', false); end if;
  perform 1 from jxj_fila where user_id = uid for update;
  select f.* into ele from jxj_fila f
    join jxj_contas cc on cc.user_id = f.user_id
    where f.user_id <> uid and f.categoria = eu.categoria and f.versao = eu.versao
      and f.sinal_em > now() - interval '12 seconds'
      and cc.luta_aberta_id is null
      and not public.jxj_banido(f.user_id)
      /* faixa da espera (cresce sem teto) limitada pelo raio dos DOIS; sem
         raio, o teto é tol_max (400), como antes da migração */
      and abs(f.rating - eu.rating) <= least(
            tol_base + tol_seg * floor(extract(epoch from (now() - least(f.entrou_em, eu.entrou_em))) / 10),
            coalesce(eu.raio, tol_max), coalesce(f.raio, tol_max))
    order by (f.lutador_id = coalesce(eu.ultimo_adversario, -1)) asc, abs(f.rating - eu.rating) asc, f.entrou_em asc
    limit 1
    for update of f skip locked;
  if not found then
    espera := extract(epoch from (now() - eu.entrou_em));
    return jsonb_build_object('naFila', true, 'esperaSeg', floor(espera),
      'tolerancia', least(tol_base + tol_seg * floor(espera / 10), coalesce(eu.raio, tol_max)), 'raio', eu.raio);
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
