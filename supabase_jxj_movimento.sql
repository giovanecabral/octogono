-- supabase_jxj_movimento.sql — modo Online: quantas pessoas estão na fila e
-- lutando agora (auditoria de pré-lançamento, 2026-10-08).
--
-- Rodar DEPOIS de supabase_jxj.sql, supabase_jxj_narracao.sql e
-- supabase_jxj_raio.sql.
-- SÓ ADITIVA: uma função de leitura (jxj_movimento). Nenhuma tabela nova,
-- nenhuma coluna, nenhum dado muda. Pode rodar de novo sem erro.
-- Desfazer: supabase_jxj_rollback.sql (apaga toda função jxj_*).
--
-- Fila conta quem deu sinal nos últimos 12 segundos (o mesmo critério do
-- pareamento). Lutando conta as lutas abertas (confirmação ou andamento),
-- duas pessoas por luta. Usa o índice jxj_lutas_abertas.
--
-- O servidor (api/jxj.js) funciona com ou sem esta migração: sem ela, a
-- tela só não mostra o contador.

create or replace function public.jxj_movimento()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'fila', (select count(*) from jxj_fila where sinal_em > now() - interval '12 seconds'),
    'lutando', 2 * (select count(*) from jxj_lutas where status in ('confirmacao', 'andamento'))
  )
$$;

revoke execute on function public.jxj_movimento() from public, anon, authenticated;
grant execute on function public.jxj_movimento() to service_role;
