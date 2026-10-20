-- Online: lutas contra bot por jeito (personalidade) e força, sem dado
-- pessoal (2026-10-20, fase 1 do plano do Online). Só leitura: nada é
-- gravado nem alterado.
--
-- Não precisa de migração: cada luta contra bot já guarda, na própria linha
-- de jxj_lutas, os dados do bot (coluna bot: jeito em 'pers', habilidade em
-- 's', força em 'rating', nível e estilo) e o resultado; cada troca guarda
-- os eventos, inclusive quem leu o outro ('leu', motor v3). Estas consultas
-- só juntam. Nenhuma coluna de conta, e-mail, nome ou id sai daqui.
--
-- Uso: SQL Editor do Supabase, rodar uma consulta de cada vez e comparar com
-- a tabela do simulador (LEIA-ME, "Bots com personalidade"). Força: fraco é
-- habilidade abaixo de 0,34 (jogador até uns 1490 de rating), forte é 0,67
-- ou mais (jogador de uns 1525 pra cima).

-- consulta 1: resultado por jeito e força
with lutas as (
  select
    coalesce(l.bot->>'pers', 'sem jeito') as jeito,
    case when coalesce((l.bot->>'s')::numeric, 0) < 0.34 then 'fraco'
         when (l.bot->>'s')::numeric < 0.67 then 'médio' else 'forte' end as forca,
    (l.bot->>'rating')::numeric as rating_bot,
    (l.nomes->'a'->>'rating')::numeric as rating_jogador,
    l.resultado->>'metodo' as metodo,
    l.resultado->>'vencedor' as vencedor,
    l.id as luta
  from jxj_lutas l
  where l.bot is not null and l.status = 'encerrada' and l.resultado->>'metodo' <> 'ANULADA'
),
leituras as (
  select t.luta_id as luta,
    count(*) filter (where t.acao_a is not null) as trocas,
    count(*) filter (where t.acao_a is not null and exists (select 1 from jsonb_array_elements(t.eventos) ev where ev->>'tipo' = 'leu' and ev->>'quem' = 'a')) as jogador_leu,
    count(*) filter (where t.acao_a is not null and exists (select 1 from jsonb_array_elements(t.eventos) ev where ev->>'tipo' = 'leu' and ev->>'quem' = 'b')) as bot_leu
  from jxj_trocas t join lutas on lutas.luta = t.luta_id
  group by t.luta_id
)
select lutas.jeito, lutas.forca,
  count(*) as lutas,
  round(100.0 * count(*) filter (where vencedor = 'a') / nullif(count(*) filter (where vencedor is not null), 0), 1) as vitorias_jogador_pct,
  round(avg(rating_jogador)) as rating_medio_jogador,
  round(avg(rating_bot)) as rating_medio_bot,
  round(100.0 * sum(le.jogador_leu) / nullif(sum(le.trocas), 0), 1) as trocas_lidas_pelo_jogador_pct,
  round(100.0 * sum(le.bot_leu) / nullif(sum(le.trocas), 0), 1) as trocas_lidas_pelo_bot_pct,
  count(*) filter (where metodo in ('KO', 'TKO')) as nocautes,
  count(*) filter (where metodo = 'FIN') as finalizacoes,
  count(*) filter (where metodo = 'DEC') as decisoes,
  count(*) filter (where metodo = 'WO') as wo
from lutas left join leituras le on le.luta = lutas.luta
group by lutas.jeito, lutas.forca
order by lutas.jeito, lutas.forca;

-- consulta 2: em que troca o jogador passa a ler cada jeito (jogo real)
select coalesce(l.bot->>'pers', 'sem jeito') as jeito,
  (t.round - 1) * 4 + t.troca as troca_n,
  count(*) as trocas,
  round(100.0 * count(*) filter (where exists (select 1 from jsonb_array_elements(t.eventos) ev where ev->>'tipo' = 'leu' and ev->>'quem' = 'a')) / count(*), 1) as lidas_pelo_jogador_pct
from jxj_lutas l join jxj_trocas t on t.luta_id = l.id
where l.bot is not null and l.status = 'encerrada' and t.acao_a is not null
group by 1, 2
order by 1, 2;
