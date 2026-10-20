-- JxJ (na tela, Online): motor v3 (2026-10-20), leitura que decide, grogue e
-- finalização encaixada. Número de combate novo, então a versão de
-- balanceamento sobe pra 2 (VERSAO_BALANCEAMENTO em api/_jxj-arvores.js):
-- cada lutador ganha um respec grátis e a fila passa a juntar só lutadores
-- da versão 2.
--
-- O código e o banco precisam dizer o mesmo número. Rode ANTES do deploy:
-- com o banco em 1 e o código em 2, a tela promete o respec grátis e o
-- banco cobra as fichas.
--
-- Só muda um valor de configuração; não cria, não apaga e não mexe em
-- nenhum dado de jogador. Roda depois de supabase_jxj_bot.sql.
-- Desfazer (só junto com a volta do código pra versão 1):
--   update jxj_config set valor = '1'::jsonb, atualizado_em = now() where chave = 'versao_balanceamento';
update jxj_config set valor = '2'::jsonb, atualizado_em = now() where chave = 'versao_balanceamento';
select chave, valor from jxj_config where chave = 'versao_balanceamento';
