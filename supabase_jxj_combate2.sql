-- supabase_jxj_combate2.sql: modo Online, combate v2 (velocidade, prioridade
-- e deck; 2026-11-12). Docs: docs/combat-v2.md.
--
-- Rodar DEPOIS de supabase_jxj_gratis_pesos.sql, com a aprovação do dono.
-- Só aditiva; pode rodar de novo sem erro. Rodar NÃO liga o combate novo:
-- a flag entra desligada. Sem esta migração, o servidor nunca cria luta do
-- combate v2 (a carta da troca não teria onde ficar).
--
-- O que entra:
-- 1. jxj_acoes.carta: a carta jogada na troca (com deck, duas cartas da
--    mesma família são jogadas diferentes; familia continua sendo a
--    categoria, pro check e pra postura).
-- 2. jxj_lutadores.deck: o deck que o jogador montou (null = o deck padrão
--    do estilo). Quem valida é o servidor (api/_jxj-cartas.js, validarDeck).
-- 3. jxj_config 'combate_v2': false (ninguém), true (todos) ou
--    {"contas": ["<uuid>", ...]} (só essas contas). Luta nova é v2 quando os
--    dois lados estão liberados; luta contra bot continua na v1 até os bots
--    jogarem com cartas.
-- 4. Funções: jxj_enviar_carta, jxj_salvar_deck e jxj_decks (só a
--    service_role executa, como as outras). A carta da troca aberta o
--    servidor lê pela jxj_luta (to_jsonb da ação); a tela nunca vê a dele.
--
-- Ligar pra um grupo pequeno (exemplo):
--   update jxj_config set valor = '{"contas": ["<uuid 1>", "<uuid 2>"]}'::jsonb, atualizado_em = now() where chave = 'combate_v2';
-- Ligar pra todos:   update jxj_config set valor = 'true'::jsonb, atualizado_em = now() where chave = 'combate_v2';
-- Desligar (volta):  update jxj_config set valor = 'false'::jsonb, atualizado_em = now() where chave = 'combate_v2';
-- Desligar não mexe em luta que já começou: ela termina na versão em que nasceu.
--
-- Conferir depois de rodar (o resultado esperado: false, true, true, 3):
--   select (select valor from jxj_config where chave = 'combate_v2') as flag,
--          exists(select 1 from information_schema.columns where table_name = 'jxj_acoes' and column_name = 'carta') as carta,
--          exists(select 1 from information_schema.columns where table_name = 'jxj_lutadores' and column_name = 'deck') as deck,
--          (select count(*) from pg_proc where proname in ('jxj_enviar_carta', 'jxj_salvar_deck', 'jxj_decks')) as funcoes;
--
-- Desfazer: drop function public.jxj_enviar_carta(uuid, bigint, smallint,
-- smallint, text, text); drop function public.jxj_salvar_deck(uuid,
-- bigint, jsonb); drop function
-- public.jxj_decks(uuid); alter table jxj_acoes drop column carta; alter
-- table jxj_lutadores drop column deck; delete from jxj_config where chave
-- = 'combate_v2';

alter table jxj_acoes add column if not exists carta text;
alter table jxj_lutadores add column if not exists deck jsonb;
insert into jxj_config (chave, valor) values ('combate_v2', 'false'::jsonb) on conflict (chave) do nothing;

/* A carta da troca: uma por lado por troca (a mesma de novo = idempotente;
   outra = recusa). Mesmas conferências da jxj_enviar_acao. */
create or replace function public.jxj_enviar_carta(uid uuid, lid bigint, round_ smallint, troca_ smallint, familia_ text, carta_ text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; lado_ char(1); existente text;
begin
  select * into l from jxj_lutas where id = lid;
  if not found or (l.a_user <> uid and l.b_user <> uid) then raise exception 'jxj: luta não encontrada'; end if;
  if l.status <> 'andamento' then raise exception 'jxj: a luta não está em andamento'; end if;
  if l.round <> round_ or l.troca <> troca_ then raise exception 'jxj: essa troca já foi resolvida'; end if;
  if l.prazo + interval '3 seconds' < now() then raise exception 'jxj: o prazo da troca acabou'; end if;
  if carta_ is null or length(carta_) > 40 then raise exception 'jxj: carta inválida'; end if;
  lado_ := case when l.a_user = uid then 'a' else 'b' end;
  insert into jxj_acoes (luta_id, round, troca, lado, familia, carta) values (lid, round_, troca_, lado_, familia_, carta_)
    on conflict (luta_id, round, troca, lado) do nothing;
  if not found then
    select carta into existente from jxj_acoes where luta_id = lid and round = round_ and troca = troca_ and lado = lado_;
    if existente is distinct from carta_ then raise exception 'jxj: a ação desta troca já foi enviada'; end if;
  end if;
  return jsonb_build_object('enviada', true, 'lado', lado_);
end $$;

/* o deck do lutador (o servidor já validou); deck_ null volta pro deck padrão */
create or replace function public.jxj_salvar_deck(uid uuid, lid bigint, deck_ jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update jxj_lutadores set deck = deck_ where id = lid and user_id = uid and status = 'ativo';
  if not found then raise exception 'jxj: lutador não encontrado'; end if;
  return jsonb_build_object('salvo', true);
end $$;

/* os decks montados dos lutadores da conta ({id: deck}) */
create or replace function public.jxj_decks(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(l.id::text, l.deck), '{}'::jsonb)
    from jxj_lutadores l where l.user_id = uid and l.status = 'ativo' and l.deck is not null
$$;

/* permissões: as funções novas também só a service_role executa */
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'jxj\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
