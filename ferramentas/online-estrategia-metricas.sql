-- Online com estratégia (motor v4, no ar desde 2026-10-28): como as lutas
-- estão sendo jogadas. SÓ LEITURA: não muda nada no banco. Rodar no SQL
-- Editor do Supabase; o resultado é uma tabela "métrica | valor".
--
-- Janela: as lutas encerradas nos últimos 7 dias (troque o "7 days" se
-- quiser outra). O treino guiado roda só no navegador e não aparece aqui.
--
-- Como ler:
--   postura que estourou o tempo: o lado não mostrou a postura nos 5 s.
--     Acima de uns 20%, os 5 s estão curtos (proposta: 7 s).
--   finta: a ação foi diferente da postura. No equilíbrio medido, perto
--     de 30%; muito abaixo, ninguém blefa; muito acima, a postura não diz nada.
--   ação que estourou o tempo: o lado não escolheu a ação nos 12 s.
--   W.O.: alguém faltou 3 trocas seguidas (abandono).
-- Lado do bot não conta nas posturas, fintas e ausências (só gente).
with lutas as (
  select l.id, l.bot is not null as contra_bot, l.resultado->>'metodo' as metodo,
         l.encerrada_em - l.iniciada_em as duracao
    from jxj_lutas l
   where l.status = 'encerrada'
     and coalesce((l.estado->>'v')::int, 0) >= 4
     and l.encerrada_em >= now() - interval '7 days'
),
trocas as (
  select t.luta_id, t.round, t.troca, t.eventos, lu.contra_bot
    from jxj_trocas t join lutas lu on lu.id = t.luta_id
),
lados as (   -- cada lado de gente em cada troca que teve a etapa da postura
  select tr.luta_id, tr.round, tr.troca, tr.eventos, x.lado
    from trocas tr cross join lateral (values ('a'), ('b')) as x(lado)
   where tr.eventos @> '[{"tipo": "sinais"}]'::jsonb
     and (x.lado = 'a' or not tr.contra_bot)
)
select 'lutas encerradas (7 dias)' as metrica, count(*)::text as valor from lutas
union all select 'lutas contra bot', count(*) filter (where contra_bot)::text from lutas
union all select 'nocaute (%)', round(100.0 * count(*) filter (where metodo in ('KO', 'TKO')) / nullif(count(*), 0), 1)::text from lutas
union all select 'finalização (%)', round(100.0 * count(*) filter (where metodo = 'FIN') / nullif(count(*), 0), 1)::text from lutas
union all select 'decisão (%)', round(100.0 * count(*) filter (where metodo = 'DEC') / nullif(count(*), 0), 1)::text from lutas
union all select 'W.O. (%)', round(100.0 * count(*) filter (where metodo = 'WO') / nullif(count(*), 0), 1)::text from lutas
union all select 'duração média (minutos)', round((extract(epoch from avg(duracao)) / 60.0)::numeric, 1)::text from lutas
union all select 'trocas por luta (média)', round(avg(n), 1)::text from (select count(*) as n from trocas group by luta_id) z
union all select 'postura que estourou o tempo (%)',
  round(100.0 * count(*) filter (where s.luta_id is null) / nullif(count(*), 0), 1)::text
  from lados ld left join jxj_sinais s on s.luta_id = ld.luta_id and s.round = ld.round and s.troca = ld.troca and s.lado = ld.lado
union all select 'finta (% das trocas com postura)',
  round(100.0 * count(*) filter (where ld.eventos @> jsonb_build_array(jsonb_build_object('tipo', 'finta', 'quem', ld.lado))) / nullif(count(*), 0), 1)::text
  from lados ld
union all select 'ação que estourou o tempo (%)',
  round(100.0 * count(*) filter (where ld.eventos @> jsonb_build_array(jsonb_build_object('tipo', 'ausente', 'quem', ld.lado))) / nullif(count(*), 0), 1)::text
  from lados ld;
