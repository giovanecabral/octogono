-- supabase_jxj_estrategia.sql: modo Online, estratégia por informação (2026-10-27).
--
-- Rodar DEPOIS de supabase_jxj_fase5.sql, com a aprovação do dono, antes
-- do deploy. Só aditiva; pode rodar de novo sem erro.
-- Fase 1 (mão à vista): sobe a versão de balanceamento pra 3 (motor v4). A
-- mão mora no estado da luta; nenhuma tabela pra ela.
-- Fase 2 (sinais e blefe): tabela jxj_sinais (a postura de cada lado na
-- troca aberta), jxj_enviar_sinal (grava uma vez, só na etapa do sinal) e
-- jxj_sinais_abertos (leitura do servidor). Sem esta parte, o servidor
-- funciona sem sinais (como na fase 1).
-- Desfazer a fase 2: drop function public.jxj_enviar_sinal(uuid, bigint,
-- smallint, smallint, text, integer); drop function
-- public.jxj_sinais_abertos(bigint); drop table jxj_sinais;
--
-- O código e o banco precisam dizer o mesmo número: com o banco em 2 e o
-- código em 3, a tela promete o respec grátis e o banco cobra as fichas.
-- Desfazer (só junto com a volta do código pra versão 2):
--   update jxj_config set valor = '2'::jsonb, atualizado_em = now() where chave = 'versao_balanceamento';
update jxj_config set valor = '3'::jsonb, atualizado_em = now() where chave = 'versao_balanceamento';
select chave, valor from jxj_config where chave = 'versao_balanceamento';

-- Fase 2 (sinais e blefe): o sinal de cada lado na troca aberta.
create table if not exists jxj_sinais (
  luta_id bigint not null references jxj_lutas(id) on delete cascade,
  round smallint not null,
  troca smallint not null,
  lado char(1) not null check (lado in ('a', 'b')),
  familia text not null check (familia in ('golpes', 'queda', 'defesa', 'pressao')),
  enviado_em timestamptz not null default now(),
  primary key (luta_id, round, troca, lado)
);
alter table jxj_sinais enable row level security;

/* Grava o sinal de quem luta, uma vez por troca, só na etapa do sinal (o
   começo da troca: até faltar acao_ms pro prazo). */
create or replace function public.jxj_enviar_sinal(uid uuid, lid bigint, round_ smallint, troca_ smallint, familia_ text, acao_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; lado_ char(1);
begin
  select * into l from jxj_lutas where id = lid;
  if not found or (l.a_user <> uid and l.b_user <> uid) then raise exception 'jxj: luta não encontrada'; end if;
  if l.status <> 'andamento' then raise exception 'jxj: a luta não está em andamento'; end if;
  if l.round <> round_ or l.troca <> troca_ then raise exception 'jxj: essa troca já foi resolvida'; end if;
  if l.prazo - make_interval(secs => acao_ms / 1000.0) < now() then raise exception 'jxj: a etapa do sinal acabou'; end if;
  lado_ := case when l.a_user = uid then 'a' else 'b' end;
  insert into jxj_sinais (luta_id, round, troca, lado, familia) values (lid, round_, troca_, lado_, familia_)
    on conflict (luta_id, round, troca, lado) do nothing;
  return jsonb_build_object('gravou', found);
end $$;

/* Os sinais da troca aberta da luta (só o servidor lê; a vista decide o
   que mostrar a quem). */
create or replace function public.jxj_sinais_abertos(lid bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('lado', s.lado, 'familia', s.familia, 'enviado_em', s.enviado_em)), '[]'::jsonb)
    from jxj_sinais s join jxj_lutas l on l.id = s.luta_id and s.round = l.round and s.troca = l.troca
   where l.id = lid
$$;

/* permissões: as funções novas também só a service_role executa */
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'jxj\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

