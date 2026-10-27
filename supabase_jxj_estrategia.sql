-- supabase_jxj_estrategia.sql: modo Online, estratégia por informação (2026-10-27).
--
-- Rodar DEPOIS de supabase_jxj_fase5.sql, com a aprovação do dono, antes
-- do deploy. Fase 1 (mão à vista): só sobe a versão de balanceamento pra 3
-- (motor v4). A mão mora no estado da luta; nenhuma tabela nova. As fases
-- seguintes (sinais) entram neste mesmo arquivo antes do deploy.
--
-- O código e o banco precisam dizer o mesmo número: com o banco em 2 e o
-- código em 3, a tela promete o respec grátis e o banco cobra as fichas.
-- Desfazer (só junto com a volta do código pra versão 2):
--   update jxj_config set valor = '2'::jsonb, atualizado_em = now() where chave = 'versao_balanceamento';
update jxj_config set valor = '3'::jsonb, atualizado_em = now() where chave = 'versao_balanceamento';
select chave, valor from jxj_config where chave = 'versao_balanceamento';
