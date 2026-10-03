-- supabase_jxj_narracao.sql — JxJ: narração por IA com reserva e teto (2026-10-03).
--
-- Rodar DEPOIS de supabase_jxj.sql (usa jxj_lutas, jxj_config e jxj_cfg).
-- SÓ ADITIVA: duas colunas novas em jxj_lutas (vazias), uma tabela nova
-- (jxj_narracao_uso), uma linha nova em jxj_config e três funções novas.
-- Não apaga, não muda e não reescreve dado nenhum. Pode rodar de novo sem
-- erro (if not exists / on conflict do nothing / create or replace).
-- Desfazer: supabase_jxj_rollback.sql (apaga tudo do JxJ, inclusive isto).
--
-- O que resolve (auditoria de segurança de 2026-10-03):
-- 1. Só quem lutou pede a narração: a reserva confere o uid.
-- 2. Uma geração paga por vez em cada luta: a reserva é tomada com a linha
--    da luta travada (for update); quem chega com outra reserva em curso
--    recebe "gerando" e tenta de novo. A reserva vence em 30 s, então uma
--    chamada que caiu no meio não trava a narração pra sempre.
-- 3. Teto diário global de chamadas pagas à IA: jxj_config
--    'narracao_ia_dia' (padrão 300; 0 desliga a IA; valor inválido vira
--    300). Esgotado o teto, a narração sai do molde local: a luta nunca
--    fica sem narração.
--
-- Mudar o teto (sem deploy):
--   update jxj_config set valor = '500'::jsonb, atualizado_em = now() where chave = 'narracao_ia_dia';

alter table jxj_lutas add column if not exists narracao_reserva uuid;
alter table jxj_lutas add column if not exists narracao_reservada_em timestamptz;

-- uso da IA por dia (horário de Brasília); só o servidor lê e grava
create table if not exists jxj_narracao_uso (
  dia date primary key,
  chamadas integer not null default 0 check (chamadas >= 0)
);
alter table jxj_narracao_uso enable row level security;

insert into jxj_config (chave, valor) values ('narracao_ia_dia', '300'::jsonb) on conflict (chave) do nothing;

/* Teto do dia: conta 1 chamada se ainda cabe e diz se pode chamar a IA.
   Um comando só (insert ... on conflict ... where): duas chamadas ao
   mesmo tempo disputam a mesma linha e nunca passam do teto. */
create or replace function public.jxj_narracao_cota_ia() returns boolean
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; lim integer; hoje date := (now() at time zone 'America/Sao_Paulo')::date; n integer;
begin
  cfg := public.jxj_cfg('narracao_ia_dia');
  lim := case when jsonb_typeof(cfg) = 'number' then least(greatest((cfg)::text::numeric, 0), 100000)::integer else 300 end;
  if lim <= 0 then return false; end if;
  insert into jxj_narracao_uso (dia, chamadas) values (hoje, 1)
    on conflict (dia) do update set chamadas = jxj_narracao_uso.chamadas + 1
    where jxj_narracao_uso.chamadas < lim
    returning chamadas into n;
  return n is not null;
end $$;

/* Reserva a geração da narração de uma luta encerrada, só pra quem lutou.
   Devolve:
     {narracao}        se a luta já tem narração (nada é gerado);
     {gerando: true}   se outra geração está em curso (reserva com menos de 30 s);
     {reserva, ia}     reserva = token desta geração; ia = pode chamar a IA
                       (quer_ia e o teto do dia contou esta chamada).
   quer_ia = o servidor tem a IA configurada (sem ela, nada é contado). */
create or replace function public.jxj_narracao_reservar(uid uuid, lid bigint, quer_ia boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; token uuid;
begin
  select * into l from jxj_lutas where id = lid for update;
  if not found or (l.a_user <> uid and l.b_user <> uid) then raise exception 'jxj: luta não encontrada'; end if;
  if l.status <> 'encerrada' then raise exception 'jxj: a luta ainda não acabou'; end if;
  if l.narracao is not null then return jsonb_build_object('narracao', l.narracao); end if;
  if l.narracao_reserva is not null and l.narracao_reservada_em > now() - interval '30 seconds' then
    return jsonb_build_object('gerando', true);
  end if;
  token := gen_random_uuid();
  update jxj_lutas set narracao_reserva = token, narracao_reservada_em = now() where id = lid;
  return jsonb_build_object('reserva', token, 'ia', coalesce(quer_ia, false) and public.jxj_narracao_cota_ia());
end $$;

/* Grava a narração de quem tem a reserva (uma vez só) e devolve a que
   ficou na luta. Reserva vencida e tomada por outro pedido: não grava, e
   a narração que vale é a do pedido que tem a reserva. */
create or replace function public.jxj_narracao_concluir(lid bigint, reserva_ uuid, texto text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n integer; atual text;
begin
  update jxj_lutas set narracao = left(texto, 1200), narracao_reserva = null, narracao_reservada_em = null
    where id = lid and status = 'encerrada' and narracao is null and narracao_reserva = reserva_;
  get diagnostics n = row_count;
  select narracao into atual from jxj_lutas where id = lid;
  return jsonb_build_object('gravou', n > 0, 'narracao', atual);
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
