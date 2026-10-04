-- supabase_jxj_rollback.sql — desfaz supabase_jxj.sql, supabase_jxj_narracao.sql e supabase_jxj_raio.sql (JxJ).
--
-- APAGA TODOS OS DADOS DO JXJ: lutadores, lutas, ações, rating, temporadas,
-- torneios, títulos, conquistas, fichas, limites e log do JxJ. Não toca em
-- nenhuma tabela do jogo de carreira, de conta, de Pro ou de pagamento.
--
-- Antes de rodar:
--   1. Desligar o JxJ na Vercel (JXJ_ATIVO diferente de "true") e fazer o
--      deploy, senão api/jxj.js chama função que não existe mais.
--   2. Backup do banco (Supabase > Database > Backups).
-- Depois de rodar, o site continua igual a antes do JxJ: o menu mostra o
-- JxJ como "em breve" enquanto JXJ_ATIVO estiver desligado.
--
-- A suíte jxj do testar.js roda este arquivo num Postgres local (PGlite)
-- depois de supabase_schema.sql + supabase_jxj.sql e confere que só o que
-- é do JxJ some.

do $$
declare r record;
begin
  -- nada fora do JxJ pode depender de tabela do JxJ: se depender, para aqui
  -- sem apagar nada (o "cascade" lá embaixo só pode pegar coisa do JxJ)
  for r in
    select c.conname, c.conrelid::regclass::text as tabela
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid::regclass::text like 'jxj\_%'
      and c.conrelid::regclass::text not like 'jxj\_%'
  loop
    raise exception 'a tabela % depende do JxJ (restrição %): rollback parado, nada foi apagado', r.tabela, r.conname;
  end loop;
  for r in
    select d.classid::regclass::text as tipo, d.objid
    from pg_depend d
    join pg_class t on t.oid = d.refobjid and d.refclassid = 'pg_class'::regclass
    where t.relname like 'jxj\_%' and d.classid = 'pg_rewrite'::regclass
      and not exists (select 1 from pg_rewrite w join pg_class v on v.oid = w.ev_class where w.oid = d.objid and v.relname like 'jxj\_%')
  loop
    raise exception 'existe view fora do JxJ lendo tabela do JxJ: rollback parado, nada foi apagado';
  end loop;

  -- funções jxj_* (todas as assinaturas)
  for r in
    select p.oid::regprocedure as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'jxj\_%'
  loop
    execute 'drop function if exists ' || r.f;
  end loop;
end $$;

-- tabelas jxj_* (o cascade só derruba as chaves estrangeiras entre elas,
-- conferido acima)
drop table if exists
  jxj_narracao_uso, jxj_log, jxj_limites, jxj_fichas, jxj_conquistas, jxj_titulos, jxj_confrontos,
  jxj_inscricoes, jxj_torneios, jxj_classificacao, jxj_temporadas, jxj_rating_hist,
  jxj_trocas, jxj_acoes, jxj_lutas, jxj_fila, jxj_lutadores, jxj_contas, jxj_config
cascade;
