-- supabase_jxj_v2_todos.sql: modo Online, o combate de cartas (combate v2) pra
-- TODOS (2026-11-19, pedido do dono: "o online que está só pra mim está
-- melhor, então coloque ele").
--
-- Rodar DEPOIS de supabase_jxj_combate2.sql (é ela que cria a chave
-- combate_v2), com a aprovação do dono e o backup de sempre. Só mexe numa
-- chave de jxj_config: nenhuma tabela, coluna ou função muda. Pode rodar de
-- novo sem erro.
--
-- O que faz:
-- 1. Guarda o valor de agora da flag (hoje {"contas": [uuid do dono]}) em
--    combate_v2_antes, só na primeira vez (rodar de novo não apaga o guardado).
-- 2. Liga a flag pra todos: combate_v2 = true. Toda luta nova (fila, bot,
--    revanche, torneio) nasce no combate de cartas; luta que já começou
--    termina na versão em que nasceu.
-- 3. Confere no fim: o select devolve ligado = true.
--
-- Voltar pro só-dono (o valor guardado no passo 1):
--   update jxj_config set valor = (select valor from jxj_config where chave = 'combate_v2_antes'), atualizado_em = now()
--     where chave = 'combate_v2' and exists (select 1 from jxj_config where chave = 'combate_v2_antes');
-- Desligar pra todo mundo:
--   update jxj_config set valor = 'false'::jsonb, atualizado_em = now() where chave = 'combate_v2';
-- Conferir a volta: select valor from jxj_config where chave = 'combate_v2';

insert into jxj_config (chave, valor)
  select 'combate_v2_antes', valor from jxj_config where chave = 'combate_v2'
  on conflict (chave) do nothing;

update jxj_config set valor = 'true'::jsonb, atualizado_em = now() where chave = 'combate_v2';

/* conferência: true quando o combate de cartas está ligado pra todos */
select coalesce((select valor = 'true'::jsonb from jxj_config where chave = 'combate_v2'), false) as ligado;
