-- Painel do lançamento (só leitura): rodar no SQL Editor do Supabase.
-- Últimos 7 dias, dia de São Paulo.
with dias as (
  select generate_series((now() at time zone 'America/Sao_Paulo')::date - 6,
                         (now() at time zone 'America/Sao_Paulo')::date, interval '1 day')::date as dia
),
u as (select (created_at at time zone 'America/Sao_Paulo')::date as dia,
             raw_app_meta_data->>'provider' as via, email_confirmed_at from auth.users),
c as (select (concluida_em at time zone 'America/Sao_Paulo')::date as dia from carreiras_usuario),
p as (select distinct on (asaas_payment_id) (processado_em at time zone 'America/Sao_Paulo')::date as dia, valor
      from pagamentos_processados
      where evento in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'CONFIRMADO_NO_RETORNO')
      order by asaas_payment_id, processado_em),
o as (select (encerrada_em at time zone 'America/Sao_Paulo')::date as dia, bot is not null as contra_bot
      from jxj_lutas where status = 'encerrada')
select d.dia,
  (select count(*) from u where u.dia = d.dia) as cadastros,
  (select count(*) from u where u.dia = d.dia and u.via = 'email') as por_email,
  (select count(*) from u where u.dia = d.dia and u.via = 'email' and u.email_confirmed_at is not null) as email_confirmado,
  (select count(*) from c where c.dia = d.dia) as carreiras_terminadas,
  (select count(*) from p where p.dia = d.dia) as pro_vendidos,
  (select coalesce(sum(p.valor), 0) from p where p.dia = d.dia) as receita_reais,
  (select count(*) from o where o.dia = d.dia and not o.contra_bot) as online_gente,
  (select count(*) from o where o.dia = d.dia and o.contra_bot) as online_bot
from dias d
order by d.dia desc;

-- Funil desde o começo
select
  (select count(*) from auth.users) as contas,
  (select count(distinct user_id) from saves) as comecaram_carreira,
  (select count(distinct user_id) from saves where luta_n >= 1) as passaram_da_luta_1,
  (select count(distinct user_id) from saves where luta_n >= 5) as passaram_da_luta_5,
  (select count(distinct user_id) from carreiras_usuario) as terminaram_carreira,
  (select count(*) from assinaturas where pro and (expira_em is null or expira_em > now())) as pro_ativos,
  (select count(*) from auth.users where raw_app_meta_data->>'provider' = 'email'
     and email_confirmed_at is null and created_at > now() - interval '2 days') as email_sem_confirmar_48h;
