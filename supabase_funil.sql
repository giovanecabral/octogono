-- supabase_funil.sql: funil do lançamento (2026-11-19), contado no nosso
-- banco porque o Vercel Hobby não grava os eventos do Vercel Analytics.
--
-- Rodar DEPOIS de supabase_schema.sql. Não depende de nenhuma migração do
-- JxJ. O dono roda no SQL Editor do Supabase, com backup antes e com a
-- aprovação dele (regra de sempre).
-- SÓ ADITIVA: uma tabela nova (funil_eventos) e duas funções novas
-- (funil_registrar e funil_por_dia). Nenhuma tabela, coluna ou função que
-- já existe muda. Pode rodar de novo sem erro.
-- Desfazer: supabase_funil_rollback.sql.
--
-- Sem dado pessoal: a sessão é um uuid aleatório que o navegador sorteia e
-- guarda no localStorage (funil:sessao). Nada de e-mail, conta, IP ou
-- navegador. O "pagou" vem do servidor (api/_pro.js), com uma sessão
-- tirada do id do pagamento (sha-256), então cada pagamento conta uma vez.
--
-- Cada sessão conta cada evento UMA vez (chave primária sessao + evento):
-- o funil é "quantas sessões chegaram a cada etapa", não "quantas vezes".
-- O dia é o de São Paulo, o da primeira vez que a sessão chegou ali.
--
-- Quem grava: o navegador, com a chave pública (anon), só pela função
-- funil_registrar, que aceita só a lista fechada de eventos abaixo.
-- Ninguém lê a tabela direto (RLS ligada, nenhuma policy, nenhum grant).
-- Quem lê: só api/admin.js (ação "funil", com a chave de serviço), pela
-- função funil_por_dia.
--
-- O jogo funciona com ou sem esta migração: sem ela, o PostgREST responde
-- PGRST202 e o navegador fica em silêncio.

create table if not exists funil_eventos (
  sessao uuid not null,
  evento text not null check (evento in (
    'abriu', 'criou_conta', 'terminou_draft', 'terminou_luta_1', 'terminou_carreira',
    'abriu_online', 'terminou_treino_online', 'luta_online_1',
    'viu_pro', 'iniciou_pagamento', 'pagou')),
  dia date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  criado_em timestamptz not null default now(),
  primary key (sessao, evento)
);
create index if not exists funil_eventos_dia on funil_eventos (dia, evento);
alter table funil_eventos enable row level security;
-- o Supabase dá select/insert/update/delete em tabela nova pros papéis do
-- cliente; aqui ninguém de fora mexe na tabela, só as funções
revoke all on table funil_eventos from public, anon, authenticated;

-- Grava um evento de uma sessão. Devolve true quando gravou e false quando
-- recusou (evento fora da lista, sessão vazia, teto do dia) ou quando a
-- sessão já tinha esse evento. Nunca dá erro por causa do que veio do
-- navegador: o evento é cortado em 40 caracteres antes de comparar.
-- Teto de 50 mil linhas por dia: alguém sorteando sessões não enche o
-- banco (o lançamento espera centenas por dia).
create or replace function public.funil_registrar(sessao uuid, evento text)
returns boolean language sql volatile security definer set search_path = public as $$
  with novo as (
    insert into funil_eventos (sessao, evento)
    select funil_registrar.sessao, left(funil_registrar.evento, 40)
    where funil_registrar.sessao is not null
      and left(funil_registrar.evento, 40) in (
        'abriu', 'criou_conta', 'terminou_draft', 'terminou_luta_1', 'terminou_carreira',
        'abriu_online', 'terminou_treino_online', 'luta_online_1',
        'viu_pro', 'iniciou_pagamento', 'pagou')
      and (select count(*) from funil_eventos f
           where f.dia = (now() at time zone 'America/Sao_Paulo')::date) < 50000
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from novo)
$$;
revoke execute on function public.funil_registrar(uuid, text) from public;
grant execute on function public.funil_registrar(uuid, text) to anon, authenticated, service_role;

-- Leitura do painel de admin: sessões distintas por dia e evento, nos
-- últimos `dias` dias (de São Paulo, hoje incluído; entre 1 e 90).
create or replace function public.funil_por_dia(dias integer default 14)
returns table (dia date, evento text, sessoes bigint)
language sql stable security definer set search_path = public as $$
  select f.dia, f.evento, count(distinct f.sessao)
  from funil_eventos f
  where f.dia > (now() at time zone 'America/Sao_Paulo')::date - least(greatest(coalesce(funil_por_dia.dias, 14), 1), 90)
  group by f.dia, f.evento
  order by f.dia desc, f.evento
$$;
revoke execute on function public.funil_por_dia(integer) from public, anon, authenticated;
grant execute on function public.funil_por_dia(integer) to service_role;

-- Conferência (rodar depois; tem que dar true, true, true e false):
--   select exists (select 1 from pg_class where relname = 'funil_eventos' and relrowsecurity) as tabela_com_rls,
--          exists (select 1 from pg_proc where proname = 'funil_registrar') as registrar,
--          exists (select 1 from pg_proc where proname = 'funil_por_dia') as leitura,
--          has_table_privilege('anon', 'public.funil_eventos', 'select') as anon_le_a_tabela;
-- Ver o funil no SQL Editor (o painel #/admin mostra o mesmo):
--   select * from public.funil_por_dia(14);
