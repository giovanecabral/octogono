-- supabase_funil_rollback.sql: desfaz supabase_funil.sql.
--
-- APAGA OS DADOS DO FUNIL (a tabela funil_eventos inteira) e as duas
-- funções dele. Não toca em nenhuma outra tabela: carreira, conta, Pro,
-- pagamento e JxJ ficam como estão.
--
-- Antes de rodar: backup do banco (Supabase > Database > Backups).
-- Depois de rodar, o jogo segue igual: o navegador recebe PGRST202 e fica
-- em silêncio, e o bloco Funil do painel de admin avisa que a migração
-- não rodou.
--
-- A suíte funil do testar.js roda este arquivo num Postgres local (PGlite)
-- e confere que só o que é do funil some.

drop function if exists public.funil_registrar(uuid, text);
drop function if exists public.funil_por_dia(integer);
drop table if exists public.funil_eventos;
