-- supabase_jxj.sql — JxJ (Jogador contra Jogador), 2026-10-01.
-- Spec: docs/superpowers/specs/2026-10-01-jxj-design.md (seção 9).
--
-- MIGRAÇÃO SÓ ADITIVA: cria tabelas e funções jxj_* e não altera nenhuma
-- tabela que já existe (lê assinaturas e banidos, nunca escreve nelas).
-- Rodar uma vez no SQL Editor do Supabase, DEPOIS do backup. Pode rodar de
-- novo sem erro (if not exists / create or replace). Desfazer:
-- supabase_jxj_rollback.sql (apaga só o que é do JxJ).
--
-- Segurança: RLS ligada em todas as tabelas e NENHUMA policy. O jogador
-- não lê nem grava nada direto: tudo passa por api/jxj.js, que confere a
-- sessão e chama as funções abaixo com a chave de serviço. As funções são
-- security definer e só a service_role executa.
--
-- Atomicidade: regra que não pode correr em paralelo (slot, principal,
-- fila, par, ação única, gravação da troca, fim da luta, temporada,
-- torneio) mora numa função, com trava de linha (for update) ou trava de
-- transação (pg_advisory_xact_lock) e conferência de versão. O cálculo do
-- combate e do Glicko-2 é JS (api/_jxj-motor.js, api/_jxj-rating.js); o
-- banco grava o resultado uma vez só.

-- ---------------------------------------------------------------- config
create table if not exists jxj_config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table jxj_config enable row level security;
insert into jxj_config (chave, valor) values
  ('categorias_ativas', '["lightweight","welterweight","middleweight","heavyweight"]'::jsonb),
  ('versao_balanceamento', '1'::jsonb),
  ('temporada_dias', '56'::jsonb),
  ('reset_temporada', '{"fator":0.5,"rdSoma":80,"rdTeto":250}'::jsonb)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------- contas e lutadores
create table if not exists jxj_contas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  principal_id bigint,
  principal_trocado_em timestamptz,
  luta_gratis_usada boolean not null default false,
  luta_aberta_id bigint,                      -- trava de "uma luta por conta"
  fichas integer not null default 0 check (fichas >= 0),
  fila_bloqueada_ate timestamptz,
  criado_em timestamptz not null default now()
);
alter table jxj_contas enable row level security;

create table if not exists jxj_lutadores (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  nome text not null check (char_length(nome) between 2 and 24),
  nome_chave text not null,
  rosto jsonb not null,
  categoria text not null,
  estilo text not null check (estilo in ('striker', 'wrestler', 'grappler', 'counter')),
  nivel smallint not null default 1 check (nivel between 1 and 30),
  xp integer not null default 0 check (xp >= 0),
  build jsonb not null default '{}'::jsonb,
  build_rev integer not null default 0,
  build_versao integer not null default 1,
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  lutas_rating integer not null default 0,
  ultima_luta_rating timestamptz,
  vitorias integer not null default 0,
  derrotas integer not null default 0,
  empates integer not null default 0,
  kos integer not null default 0,
  finalizacoes integer not null default 0,
  wos integer not null default 0,
  status text not null default 'ativo' check (status in ('ativo', 'aposentado')),
  build_publica boolean not null default false,
  moldura text not null default 'padrao',
  molduras jsonb not null default '["padrao"]'::jsonb,
  criado_em timestamptz not null default now(),
  aposentado_em timestamptz
);
alter table jxj_lutadores enable row level security;
create unique index if not exists jxj_lutadores_slot_ativo on jxj_lutadores (user_id, slot) where status = 'ativo';
create unique index if not exists jxj_lutadores_nome_ativo on jxj_lutadores (nome_chave) where status = 'ativo';
create index if not exists jxj_lutadores_ranking on jxj_lutadores (categoria, rating desc) where status = 'ativo';
create index if not exists jxj_lutadores_conta on jxj_lutadores (user_id);

do $$ begin
  alter table jxj_contas add constraint jxj_contas_principal_fk
    foreign key (principal_id) references jxj_lutadores(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- fila e lutas
create table if not exists jxj_fila (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lutador_id bigint not null unique references jxj_lutadores(id) on delete cascade,
  categoria text not null,
  rating double precision not null,
  versao integer not null,
  entrou_em timestamptz not null default now(),
  sinal_em timestamptz not null default now(),
  ultimo_adversario bigint
);
alter table jxj_fila enable row level security;
create index if not exists jxj_fila_busca on jxj_fila (categoria, versao, rating);

create table if not exists jxj_lutas (
  id bigserial primary key,
  tipo text not null check (tipo in ('fila', 'revanche', 'torneio')),
  confronto_id bigint,
  a_id bigint not null references jxj_lutadores(id),
  b_id bigint not null references jxj_lutadores(id),
  a_user uuid not null,
  b_user uuid not null,
  status text not null check (status in ('confirmacao', 'andamento', 'encerrada', 'cancelada')),
  confirmado_a boolean not null default false,
  confirmado_b boolean not null default false,
  confirmacao_ate timestamptz,
  fila_entrou_a timestamptz,
  fila_entrou_b timestamptz,
  semente text not null,
  compromisso text not null,
  perfis jsonb,
  nomes jsonb not null,
  estado jsonb,
  round smallint not null default 1,
  troca smallint not null default 1,
  prazo timestamptz,
  versao integer not null default 0,
  com_rating boolean not null default true,
  gratis_a boolean not null default false,
  gratis_b boolean not null default false,
  resultado jsonb,
  efeitos jsonb,
  narracao text,
  revanche_a timestamptz,
  revanche_b timestamptz,
  revanche_luta_id bigint,
  criada_em timestamptz not null default now(),
  iniciada_em timestamptz,
  encerrada_em timestamptz,
  check (a_id <> b_id),
  check (a_user <> b_user)
);
alter table jxj_lutas enable row level security;
create index if not exists jxj_lutas_a on jxj_lutas (a_id, criada_em desc);
create index if not exists jxj_lutas_b on jxj_lutas (b_id, criada_em desc);
create index if not exists jxj_lutas_abertas on jxj_lutas (status) where status in ('confirmacao', 'andamento');

create table if not exists jxj_acoes (
  luta_id bigint not null references jxj_lutas(id) on delete cascade,
  round smallint not null,
  troca smallint not null,
  lado char(1) not null check (lado in ('a', 'b')),
  familia text not null check (familia in ('golpes', 'queda', 'defesa', 'pressao')),
  enviada_em timestamptz not null default now(),
  primary key (luta_id, round, troca, lado)
);
alter table jxj_acoes enable row level security;

create table if not exists jxj_trocas (
  luta_id bigint not null references jxj_lutas(id) on delete cascade,
  round smallint not null,
  troca smallint not null,
  acao_a text,
  acao_b text,
  eventos jsonb not null,
  resolvida_em timestamptz not null default now(),
  primary key (luta_id, round, troca)
);
alter table jxj_trocas enable row level security;

create table if not exists jxj_rating_hist (
  id bigserial primary key,
  lutador_id bigint not null references jxj_lutadores(id) on delete cascade,
  luta_id bigint references jxj_lutas(id) on delete set null,
  temporada smallint not null,
  rating_antes double precision,
  rating_depois double precision not null,
  rd_depois double precision not null,
  motivo text not null default 'luta',
  criado_em timestamptz not null default now()
);
alter table jxj_rating_hist enable row level security;
create index if not exists jxj_rating_hist_lutador on jxj_rating_hist (lutador_id, criado_em desc);

-- ---------------------------------------------------------------- temporadas
create table if not exists jxj_temporadas (
  numero smallint primary key,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null check (status in ('ativa', 'encerrada')),
  encerrada_em timestamptz
);
alter table jxj_temporadas enable row level security;
create unique index if not exists jxj_temporada_uma_ativa on jxj_temporadas ((true)) where status = 'ativa';

create table if not exists jxj_classificacao (
  temporada smallint not null references jxj_temporadas(numero),
  categoria text not null,
  posicao integer not null,
  lutador_id bigint not null references jxj_lutadores(id) on delete cascade,
  user_id uuid not null,
  nome text not null,
  estilo text not null,
  rating double precision not null,
  vitorias integer not null,
  derrotas integer not null,
  empates integer not null,
  recompensa jsonb,
  primary key (temporada, categoria, posicao)
);
alter table jxj_classificacao enable row level security;
create index if not exists jxj_classificacao_lutador on jxj_classificacao (lutador_id);

-- ---------------------------------------------------------------- torneios e títulos
create table if not exists jxj_torneios (
  id bigserial primary key,
  categoria text not null,
  temporada smallint not null,
  status text not null check (status in ('inscricoes', 'andamento', 'encerrado')),
  vagas smallint not null default 8,
  fase smallint not null default 0,
  campeao_id bigint references jxj_lutadores(id),
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  encerrado_em timestamptz
);
alter table jxj_torneios enable row level security;
create unique index if not exists jxj_torneio_aberto on jxj_torneios (categoria) where status = 'inscricoes';

create table if not exists jxj_inscricoes (
  torneio_id bigint not null references jxj_torneios(id) on delete cascade,
  lutador_id bigint not null references jxj_lutadores(id) on delete cascade,
  user_id uuid not null,
  semente smallint,
  rating_inscricao double precision not null,
  colocacao text,
  inscrito_em timestamptz not null default now(),
  primary key (torneio_id, lutador_id),
  unique (torneio_id, user_id)
);
alter table jxj_inscricoes enable row level security;

create table if not exists jxj_confrontos (
  id bigserial primary key,
  torneio_id bigint not null references jxj_torneios(id) on delete cascade,
  fase smallint not null,
  ordem smallint not null,
  a_id bigint references jxj_lutadores(id),
  b_id bigint references jxj_lutadores(id),
  janela_ate timestamptz,
  presente_a timestamptz,
  presente_b timestamptz,
  luta_id bigint references jxj_lutas(id),
  vencedor_id bigint references jxj_lutadores(id),
  motivo text,
  unique (torneio_id, fase, ordem)
);
alter table jxj_confrontos enable row level security;

create table if not exists jxj_titulos (
  id bigserial primary key,
  lutador_id bigint not null references jxj_lutadores(id) on delete cascade,
  tipo text not null check (tipo in ('cinturao', 'temporada')),
  categoria text not null,
  temporada smallint,
  torneio_id bigint references jxj_torneios(id),
  conquistado_em timestamptz not null default now()
);
alter table jxj_titulos enable row level security;
create unique index if not exists jxj_titulo_torneio on jxj_titulos (torneio_id) where torneio_id is not null;
create unique index if not exists jxj_titulo_temporada on jxj_titulos (tipo, categoria, temporada) where tipo = 'temporada';

create table if not exists jxj_conquistas (
  lutador_id bigint not null references jxj_lutadores(id) on delete cascade,
  conquista text not null,
  conquistada_em timestamptz not null default now(),
  primary key (lutador_id, conquista)
);
alter table jxj_conquistas enable row level security;

-- ---------------------------------------------------------------- fichas, limites, auditoria
create table if not exists jxj_fichas (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  motivo text not null,
  ref text,
  criado_em timestamptz not null default now()
);
alter table jxj_fichas enable row level security;
create index if not exists jxj_fichas_conta on jxj_fichas (user_id, criado_em desc);

create table if not exists jxj_limites (
  user_id uuid not null,
  acao text not null,
  janela_inicio timestamptz not null default now(),
  contador integer not null default 0,
  primary key (user_id, acao)
);
alter table jxj_limites enable row level security;

create table if not exists jxj_log (
  id bigserial primary key,
  user_id uuid,
  acao text not null,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
alter table jxj_log enable row level security;
create index if not exists jxj_log_data on jxj_log (criado_em desc);

-- =====================================================================
-- FUNÇÕES. Todas: security definer, search_path fixo, e no fim do arquivo
-- revoke de public/anon/authenticated + grant pra service_role.
-- Erro de regra sai como exceção com mensagem que começa por "jxj:" (o
-- servidor mostra o texto depois do prefixo pro jogador).
-- =====================================================================

create or replace function public.jxj_pro_ativo(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from assinaturas a
    where a.user_id = uid and a.pro = true and (a.expira_em is null or a.expira_em > now()))
$$;

create or replace function public.jxj_banido(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from banidos b where b.user_id = uid)
$$;

create or replace function public.jxj_cfg(k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select valor from jxj_config where chave = k
$$;

/* lutador utilizável: ativo e (slot 1 ou Pro ativo) */
create or replace function public.jxj_utilizavel(l jxj_lutadores) returns boolean
language sql stable security definer set search_path = public as $$
  select l.status = 'ativo' and (l.slot = 1 or public.jxj_pro_ativo(l.user_id))
$$;

/* principal efetivo: o principal se for utilizável; senão o do slot 1 ativo */
create or replace function public.jxj_principal_efetivo(uid uuid) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare c jxj_contas; l jxj_lutadores;
begin
  select * into c from jxj_contas where user_id = uid;
  if found and c.principal_id is not null then
    select * into l from jxj_lutadores where id = c.principal_id;
    if found and public.jxj_utilizavel(l) then return l.id; end if;
  end if;
  select id into l.id from jxj_lutadores where user_id = uid and slot = 1 and status = 'ativo';
  return l.id;
end $$;

/* limite por conta e ação: true = pode; conta e confere num comando só */
create or replace function public.jxj_limite(uid uuid, acao_ text, maximo integer, segundos integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into jxj_limites as t (user_id, acao, janela_inicio, contador) values (uid, acao_, now(), 1)
  on conflict (user_id, acao) do update set
    janela_inicio = case when t.janela_inicio < now() - make_interval(secs => segundos) then now() else t.janela_inicio end,
    contador = case when t.janela_inicio < now() - make_interval(secs => segundos) then 1 else t.contador + 1 end
  where t.janela_inicio < now() - make_interval(secs => segundos) or t.contador < maximo
  returning true into ok;
  return coalesce(ok, false);
end $$;

/* nível pelo XP: mesma curva de api/_jxj-regras.js (80 + 20n pra passar
   do nível n, teto 30). A suíte jxj compara as duas. */
create or replace function public.jxj_nivel_do_xp(xp_ integer) returns smallint
language plpgsql immutable as $$
declare n integer := 1; resto integer := greatest(0, xp_);
begin
  while n < 30 and resto >= 80 + 20 * n loop resto := resto - (80 + 20 * n); n := n + 1; end loop;
  return n;
end $$;

create or replace function public.jxj_registrar(uid uuid, acao_ text, detalhe_ jsonb) returns void
language sql security definer set search_path = public as $$
  insert into jxj_log (user_id, acao, detalhe) values (uid, acao_, detalhe_)
$$;

create or replace function public.jxj_conta(uid uuid) returns jxj_contas
language plpgsql security definer set search_path = public as $$
declare c jxj_contas;
begin
  insert into jxj_contas (user_id) values (uid) on conflict (user_id) do nothing;
  select * into c from jxj_contas where user_id = uid;
  return c;
end $$;

/* ---------------------------------------------------------------- temporada
   Garante uma temporada ativa. Se a ativa venceu, encerra (classificação,
   recompensa, título do 1º, reset parcial) e abre a próxima. Trava de
   transação: duas chamadas ao mesmo tempo viram uma virada só. */
create or replace function public.jxj_temporada_garantir() returns jxj_temporadas
language plpgsql security definer set search_path = public as $$
declare t jxj_temporadas; dias integer; rst jsonb; cat text; pos integer; rec record; total integer; fichas_ integer; selo_ text;
begin
  select * into t from jxj_temporadas where status = 'ativa';
  if found and t.fim > now() then return t; end if;
  perform pg_advisory_xact_lock(hashtext('jxj_temporada'));
  select * into t from jxj_temporadas where status = 'ativa';
  if found and t.fim > now() then return t; end if;
  dias := coalesce((public.jxj_cfg('temporada_dias'))::text::integer, 56);
  rst := coalesce(public.jxj_cfg('reset_temporada'), '{"fator":0.5,"rdSoma":80,"rdTeto":250}'::jsonb);
  if found then
    -- classificação final por categoria: principal efetivo, ativo, 5+ lutas com rating
    for cat in select distinct categoria from jxj_lutadores loop
      select count(*) into total from jxj_lutadores l
        where l.categoria = cat and l.status = 'ativo' and l.lutas_rating >= 5
          and l.id = public.jxj_principal_efetivo(l.user_id) and not public.jxj_banido(l.user_id);
      pos := 0;
      for rec in select l.* from jxj_lutadores l
          where l.categoria = cat and l.status = 'ativo' and l.lutas_rating >= 5
            and l.id = public.jxj_principal_efetivo(l.user_id) and not public.jxj_banido(l.user_id)
          order by l.rating desc, l.id loop
        pos := pos + 1;
        if pos = 1 then fichas_ := 500; selo_ := 'campeao';
        elsif pos <= 10 then fichas_ := 250; selo_ := 'top10';
        elsif pos <= ceil(total / 2.0) then fichas_ := 100; selo_ := 'top50';
        else fichas_ := 40; selo_ := 'participou'; end if;
        insert into jxj_classificacao (temporada, categoria, posicao, lutador_id, user_id, nome, estilo, rating, vitorias, derrotas, empates, recompensa)
          values (t.numero, cat, pos, rec.id, rec.user_id, rec.nome, rec.estilo, rec.rating, rec.vitorias, rec.derrotas, rec.empates,
                  jsonb_build_object('fichas', fichas_, 'selo', selo_))
          on conflict do nothing;
        perform public.jxj_conta(rec.user_id);
        update jxj_contas set fichas = fichas + fichas_ where user_id = rec.user_id;
        insert into jxj_fichas (user_id, delta, motivo, ref) values (rec.user_id, fichas_, 'temporada', t.numero::text);
        if pos = 1 then
          insert into jxj_titulos (lutador_id, tipo, categoria, temporada) values (rec.id, 'temporada', cat, t.numero) on conflict do nothing;
        end if;
        if pos <= 10 then
          insert into jxj_conquistas (lutador_id, conquista) values (rec.id, 'top10_temporada') on conflict do nothing;
        end if;
      end loop;
    end loop;
    -- reset parcial de todos os lutadores (nível, XP, árvore, cartel e títulos ficam)
    insert into jxj_rating_hist (lutador_id, temporada, rating_antes, rating_depois, rd_depois, motivo)
      select id, t.numero + 1, rating,
             1500 + (rating - 1500) * (rst->>'fator')::double precision,
             least((rst->>'rdTeto')::double precision, rd + (rst->>'rdSoma')::double precision), 'reset'
      from jxj_lutadores where lutas_rating > 0;
    update jxj_lutadores set
      rating = 1500 + (rating - 1500) * (rst->>'fator')::double precision,
      rd = least((rst->>'rdTeto')::double precision, rd + (rst->>'rdSoma')::double precision)
      where lutas_rating > 0;
    update jxj_temporadas set status = 'encerrada', encerrada_em = now() where numero = t.numero;
    perform public.jxj_registrar(null, 'temporada_encerrada', jsonb_build_object('numero', t.numero));
    insert into jxj_temporadas (numero, inicio, fim, status)
      values (t.numero + 1, now(), now() + make_interval(days => dias), 'ativa') returning * into t;
  else
    insert into jxj_temporadas (numero, inicio, fim, status)
      values (1, now(), now() + make_interval(days => dias), 'ativa') returning * into t;
  end if;
  return t;
end $$;

/* ---------------------------------------------------------------- estado da conta */
create or replace function public.jxj_estado(uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c jxj_contas; t jxj_temporadas; pro boolean; ef bigint; fila jsonb; luta jsonb; lut jsonb;
begin
  c := public.jxj_conta(uid);
  t := public.jxj_temporada_garantir();
  pro := public.jxj_pro_ativo(uid);
  ef := public.jxj_principal_efetivo(uid);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'slot', l.slot, 'nome', l.nome, 'rosto', l.rosto, 'categoria', l.categoria, 'estilo', l.estilo,
      'nivel', l.nivel, 'xp', l.xp, 'build', l.build, 'buildRev', l.build_rev, 'buildVersao', l.build_versao,
      'rating', l.rating, 'rd', l.rd, 'lutasRating', l.lutas_rating,
      'vitorias', l.vitorias, 'derrotas', l.derrotas, 'empates', l.empates, 'kos', l.kos, 'finalizacoes', l.finalizacoes,
      'status', l.status, 'utilizavel', public.jxj_utilizavel(l), 'principal', l.id = c.principal_id, 'principalEfetivo', l.id = ef,
      'buildPublica', l.build_publica, 'moldura', l.moldura, 'molduras', l.molduras, 'criadoEm', l.criado_em
    ) order by l.status, l.slot), '[]'::jsonb) into lut
    from jxj_lutadores l where l.user_id = uid and l.status = 'ativo';
  select to_jsonb(f) into fila from jxj_fila f where f.user_id = uid;
  if c.luta_aberta_id is not null then
    select jsonb_build_object('id', id, 'status', status, 'tipo', tipo) into luta from jxj_lutas where id = c.luta_aberta_id;
  end if;
  return jsonb_build_object(
    'pro', pro, 'fichas', c.fichas, 'lutaGratisUsada', c.luta_gratis_usada,
    'principalId', c.principal_id, 'principalEfetivo', ef, 'principalTrocadoEm', c.principal_trocado_em,
    'trocaPrincipalEm', case when c.principal_trocado_em is null then null else c.principal_trocado_em + interval '72 hours' end,
    'filaBloqueadaAte', c.fila_bloqueada_ate,
    'lutadores', lut, 'fila', fila, 'luta', luta,
    'aposentados', (select count(*) from jxj_lutadores where user_id = uid and status = 'aposentado'),
    'temporada', jsonb_build_object('numero', t.numero, 'inicio', t.inicio, 'fim', t.fim),
    'agora', now());
end $$;

/* ---------------------------------------------------------------- lutadores */
create or replace function public.jxj_criar_lutador(uid uuid, nome_ text, chave_ text, rosto_ jsonb, categoria_ text, estilo_ text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jxj_contas; pro boolean; livre smallint; l jxj_lutadores;
begin
  if public.jxj_banido(uid) then raise exception 'jxj: conta suspensa'; end if;
  c := public.jxj_conta(uid);
  perform 1 from jxj_contas where user_id = uid for update;
  if not (public.jxj_cfg('categorias_ativas') ? categoria_) then raise exception 'jxj: categoria fechada'; end if;
  pro := public.jxj_pro_ativo(uid);
  select s into livre from generate_series(1, case when pro then 3 else 1 end) s
    where not exists (select 1 from jxj_lutadores where user_id = uid and slot = s and status = 'ativo')
    order by s limit 1;
  if livre is null then
    raise exception '%', case when pro then 'jxj: os 3 slots estão ocupados' else 'jxj: o plano grátis tem 1 slot; o Pro libera 3' end;
  end if;
  if exists (select 1 from jxj_lutadores where nome_chave = chave_ and status = 'ativo') then
    raise exception 'jxj: já existe um lutador com esse nome';
  end if;
  insert into jxj_lutadores (user_id, slot, nome, nome_chave, rosto, categoria, estilo, build_versao)
    values (uid, livre, nome_, chave_, rosto_, categoria_, estilo_, coalesce((public.jxj_cfg('versao_balanceamento'))::text::integer, 1))
    returning * into l;
  if c.principal_id is null or not exists (select 1 from jxj_lutadores where id = c.principal_id and status = 'ativo') then
    update jxj_contas set principal_id = l.id where user_id = uid;   -- o primeiro vira principal sem contar prazo
  end if;
  perform public.jxj_registrar(uid, 'criar_lutador', jsonb_build_object('lutador', l.id, 'slot', livre, 'estilo', estilo_, 'categoria', categoria_));
  return jsonb_build_object('id', l.id, 'slot', l.slot);
end $$;

/* lutador da conta, travado pra escrita */
create or replace function public.jxj_meu_lutador(uid uuid, lid bigint) returns jxj_lutadores
language plpgsql security definer set search_path = public as $$
declare l jxj_lutadores;
begin
  select * into l from jxj_lutadores where id = lid and user_id = uid for update;
  if not found then raise exception 'jxj: lutador não encontrado'; end if;
  return l;
end $$;

/* build nova já validada pelo servidor (api/_jxj-arvores.js); aqui só a
   conferência de versão (duas abas salvando ao mesmo tempo) */
create or replace function public.jxj_salvar_build(uid uuid, lid bigint, rev integer, build_ jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutadores;
begin
  l := public.jxj_meu_lutador(uid, lid);
  if l.status <> 'ativo' then raise exception 'jxj: lutador aposentado'; end if;
  if l.build_rev <> rev then raise exception 'jxj: a árvore mudou em outra aba; recarregue'; end if;
  update jxj_lutadores set build = build_, build_rev = build_rev + 1 where id = lid;
  return jsonb_build_object('buildRev', l.build_rev + 1);
end $$;

/* respec: zera a build. Custa fichas, ou grátis uma vez por versão de
   balanceamento nova (build_versao fica igual à atual depois). */
create or replace function public.jxj_respec(uid uuid, lid bigint, rev integer, custo integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutadores; c jxj_contas; versao_atual integer; gratis boolean;
begin
  l := public.jxj_meu_lutador(uid, lid);
  if l.status <> 'ativo' then raise exception 'jxj: lutador aposentado'; end if;
  if l.build_rev <> rev then raise exception 'jxj: a árvore mudou em outra aba; recarregue'; end if;
  /* árvore vazia: não há o que refazer (e não cobra) */
  if not exists (select 1 from jsonb_each_text(l.build) where value::integer > 0) then
    raise exception 'jxj: a árvore já está vazia';
  end if;
  versao_atual := coalesce((public.jxj_cfg('versao_balanceamento'))::text::integer, 1);
  gratis := l.build_versao < versao_atual;
  select * into c from jxj_contas where user_id = uid for update;
  if not gratis then
    if c.fichas < custo then raise exception 'jxj: fichas insuficientes'; end if;
    update jxj_contas set fichas = fichas - custo where user_id = uid;
    insert into jxj_fichas (user_id, delta, motivo, ref) values (uid, -custo, 'respec', lid::text);
  end if;
  update jxj_lutadores set build = '{}'::jsonb, build_rev = build_rev + 1, build_versao = versao_atual where id = lid;
  perform public.jxj_registrar(uid, 'respec', jsonb_build_object('lutador', lid, 'gratis', gratis, 'custo', case when gratis then 0 else custo end));
  return jsonb_build_object('gratis', gratis, 'buildRev', l.build_rev + 1);
end $$;

create or replace function public.jxj_trocar_principal(uid uuid, lid bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jxj_contas; l jxj_lutadores;
begin
  perform public.jxj_conta(uid);
  select * into c from jxj_contas where user_id = uid for update;
  l := public.jxj_meu_lutador(uid, lid);
  if not public.jxj_utilizavel(l) then raise exception 'jxj: esse lutador está inativo'; end if;
  if c.principal_id = lid then raise exception 'jxj: esse já é o principal'; end if;
  if c.principal_trocado_em is not null and c.principal_trocado_em > now() - interval '72 hours'
     and exists (select 1 from jxj_lutadores where id = c.principal_id and status = 'ativo') then
    raise exception 'jxj: a próxima troca de principal libera em %',
      to_char((c.principal_trocado_em + interval '72 hours') at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
  end if;
  update jxj_contas set principal_id = lid, principal_trocado_em = now() where user_id = uid;
  perform public.jxj_registrar(uid, 'trocar_principal', jsonb_build_object('de', c.principal_id, 'para', lid));
  return jsonb_build_object('principalId', lid, 'proximaTroca', now() + interval '72 hours');
end $$;

create or replace function public.jxj_aposentar(uid uuid, lid bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jxj_contas; l jxj_lutadores; novo bigint;
begin
  perform public.jxj_conta(uid);
  select * into c from jxj_contas where user_id = uid for update;
  l := public.jxj_meu_lutador(uid, lid);
  if l.status <> 'ativo' then raise exception 'jxj: lutador já aposentado'; end if;
  if c.luta_aberta_id is not null and exists (select 1 from jxj_lutas where id = c.luta_aberta_id and (a_id = lid or b_id = lid)) then
    raise exception 'jxj: termine a luta antes de aposentar';
  end if;
  if exists (select 1 from jxj_fila where lutador_id = lid) then raise exception 'jxj: saia da fila antes de aposentar'; end if;
  if exists (select 1 from jxj_inscricoes i join jxj_torneios t on t.id = i.torneio_id where i.lutador_id = lid and t.status <> 'encerrado') then
    raise exception 'jxj: ele está inscrito num torneio em andamento';
  end if;
  update jxj_lutadores set status = 'aposentado', aposentado_em = now() where id = lid;
  if c.principal_id = lid then
    select id into novo from jxj_lutadores where user_id = uid and status = 'ativo' order by slot limit 1;
    update jxj_contas set principal_id = novo where user_id = uid;
  end if;
  perform public.jxj_registrar(uid, 'aposentar', jsonb_build_object('lutador', lid));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.jxj_moldura(uid uuid, lid bigint, moldura_ text, preco integer, comprar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutadores; c jxj_contas;
begin
  l := public.jxj_meu_lutador(uid, lid);
  if comprar then
    if l.molduras ? moldura_ then raise exception 'jxj: essa moldura já é sua'; end if;
    select * into c from jxj_contas where user_id = uid for update;
    if c.fichas < preco then raise exception 'jxj: fichas insuficientes'; end if;
    update jxj_contas set fichas = fichas - preco where user_id = uid;
    insert into jxj_fichas (user_id, delta, motivo, ref) values (uid, -preco, 'moldura', moldura_);
    update jxj_lutadores set molduras = molduras || to_jsonb(moldura_), moldura = moldura_ where id = lid;
  else
    if not (l.molduras ? moldura_) then raise exception 'jxj: compre a moldura antes'; end if;
    update jxj_lutadores set moldura = moldura_ where id = lid;
  end if;
  return jsonb_build_object('moldura', moldura_);
end $$;

create or replace function public.jxj_build_publica(uid uuid, lid bigint, publica boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.jxj_meu_lutador(uid, lid);
  update jxj_lutadores set build_publica = publica where id = lid;
  return jsonb_build_object('buildPublica', publica);
end $$;

/* ---------------------------------------------------------------- fila */
create or replace function public.jxj_fila_entrar(uid uuid, lid bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jxj_contas; l jxj_lutadores; pro boolean; versao_ integer;
begin
  if public.jxj_banido(uid) then raise exception 'jxj: conta suspensa'; end if;
  perform public.jxj_conta(uid);
  select * into c from jxj_contas where user_id = uid for update;
  l := public.jxj_meu_lutador(uid, lid);
  if not public.jxj_utilizavel(l) then raise exception 'jxj: esse lutador está inativo (slot extra sem Pro)'; end if;
  if c.luta_aberta_id is not null then raise exception 'jxj: você já tem uma luta aberta'; end if;
  if c.fila_bloqueada_ate is not null and c.fila_bloqueada_ate > now() then raise exception 'jxj: aguarde um minuto pra voltar pra fila'; end if;
  pro := public.jxj_pro_ativo(uid);
  if not pro and c.luta_gratis_usada then raise exception 'jxj: a luta grátis já foi usada; o JxJ competitivo é do Pro'; end if;
  if exists (select 1 from jxj_fila where user_id = uid) then
    update jxj_fila set sinal_em = now() where user_id = uid;
    return jsonb_build_object('naFila', true);
  end if;
  versao_ := coalesce((public.jxj_cfg('versao_balanceamento'))::text::integer, 1);
  insert into jxj_fila (user_id, lutador_id, categoria, rating, versao) values (uid, lid, l.categoria, l.rating, versao_);
  perform public.jxj_registrar(uid, 'fila_entrar', jsonb_build_object('lutador', lid));
  return jsonb_build_object('naFila', true);
end $$;

create or replace function public.jxj_fila_sair(uid uuid) returns jsonb
language sql security definer set search_path = public as $$
  with d as (delete from jxj_fila where user_id = uid returning 1) select jsonb_build_object('saiu', exists(select 1 from d))
$$;

/* Sinal de vida + tentativa de par. tol = tolerância de rating calculada
   pelo servidor com o tempo de espera de cada um (a maior das duas vale).
   Par: mesma categoria e versão, outra conta, sinal recente, conta sem
   luta aberta, não banida; o mais perto em rating, evitando o último
   adversário quando há outro. Cria a luta em "confirmacao" e tira os dois
   da fila na mesma transação. semente_ vem do servidor (crypto). */
create or replace function public.jxj_fila_parear(uid uuid, semente_ text, tol_base double precision, tol_seg double precision, tol_max double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu jxj_fila; ele jxj_fila; la jxj_lutadores; lb jxj_lutadores; luta jxj_lutas; c jxj_contas; tol double precision; espera double precision;
begin
  select * into c from jxj_contas where user_id = uid;
  if found and c.luta_aberta_id is not null then
    delete from jxj_fila where user_id = uid;
    return jsonb_build_object('luta', c.luta_aberta_id);
  end if;
  update jxj_fila set sinal_em = now() where user_id = uid returning * into eu;
  if not found then return jsonb_build_object('naFila', false); end if;
  perform 1 from jxj_fila where user_id = uid for update;
  select f.* into ele from jxj_fila f
    join jxj_contas cc on cc.user_id = f.user_id
    where f.user_id <> uid and f.categoria = eu.categoria and f.versao = eu.versao
      and f.sinal_em > now() - interval '12 seconds'
      and cc.luta_aberta_id is null
      and not public.jxj_banido(f.user_id)
      and abs(f.rating - eu.rating) <= least(tol_max, tol_base + tol_seg * floor(extract(epoch from (now() - least(f.entrou_em, eu.entrou_em))) / 10))
    order by (f.lutador_id = coalesce(eu.ultimo_adversario, -1)) asc, abs(f.rating - eu.rating) asc, f.entrou_em asc
    limit 1
    for update of f skip locked;
  if not found then
    espera := extract(epoch from (now() - eu.entrou_em));
    return jsonb_build_object('naFila', true, 'esperaSeg', floor(espera),
      'tolerancia', least(tol_max, tol_base + tol_seg * floor(espera / 10)));
  end if;
  select * into la from jxj_lutadores where id = eu.lutador_id;
  select * into lb from jxj_lutadores where id = ele.lutador_id;
  insert into jxj_lutas (tipo, a_id, b_id, a_user, b_user, status, confirmacao_ate, fila_entrou_a, fila_entrou_b,
                         semente, compromisso, nomes)
    values ('fila', la.id, lb.id, la.user_id, lb.user_id, 'confirmacao', now() + interval '20 seconds', eu.entrou_em, ele.entrou_em,
            semente_, encode(sha256(convert_to(semente_, 'UTF8')), 'hex'),
            jsonb_build_object('a', jsonb_build_object('nome', la.nome, 'rosto', la.rosto, 'estilo', la.estilo, 'nivel', la.nivel, 'rating', la.rating, 'cartel', jsonb_build_array(la.vitorias, la.derrotas, la.empates), 'moldura', la.moldura),
                               'b', jsonb_build_object('nome', lb.nome, 'rosto', lb.rosto, 'estilo', lb.estilo, 'nivel', lb.nivel, 'rating', lb.rating, 'cartel', jsonb_build_array(lb.vitorias, lb.derrotas, lb.empates), 'moldura', lb.moldura)))
    returning * into luta;
  update jxj_contas set luta_aberta_id = luta.id where user_id in (la.user_id, lb.user_id) and luta_aberta_id is null;
  if (select count(*) from jxj_contas where luta_aberta_id = luta.id) <> 2 then
    raise exception 'jxj: par desfeito, tente de novo';   -- desfaz tudo (transação)
  end if;
  delete from jxj_fila where user_id in (la.user_id, lb.user_id);
  perform public.jxj_registrar(uid, 'par', jsonb_build_object('luta', luta.id, 'a', la.id, 'b', lb.id));
  return jsonb_build_object('luta', luta.id);
end $$;

/* ---------------------------------------------------------------- luta: carregar e confirmar */
/* Dados pro servidor montar a resposta (o servidor tira o que o jogador
   não pode ver: a ação do adversário na troca aberta e a semente antes do
   fim). lado = 'a', 'b' ou null (não participa). */
create or replace function public.jxj_luta(lid bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('luta', to_jsonb(l),
    'acoes', coalesce((select jsonb_agg(to_jsonb(a)) from jxj_acoes a where a.luta_id = l.id and a.round = l.round and a.troca = l.troca), '[]'::jsonb),
    'trocas', coalesce((select jsonb_agg(to_jsonb(t) order by t.round, t.troca) from jxj_trocas t where t.luta_id = l.id), '[]'::jsonb),
    'lutadorA', (select to_jsonb(x) from jxj_lutadores x where x.id = l.a_id),
    'lutadorB', (select to_jsonb(x) from jxj_lutadores x where x.id = l.b_id),
    'conquistasA', coalesce((select jsonb_agg(c.conquista) from jxj_conquistas c where c.lutador_id = l.a_id), '[]'::jsonb),
    'conquistasB', coalesce((select jsonb_agg(c.conquista) from jxj_conquistas c where c.lutador_id = l.b_id), '[]'::jsonb),
    'lutasHojeA', (select count(*) from jxj_lutas x where x.status = 'encerrada' and x.id <> l.id and (x.a_id = l.a_id or x.b_id = l.a_id) and x.encerrada_em > now() - interval '24 hours'),
    'lutasHojeB', (select count(*) from jxj_lutas x where x.status = 'encerrada' and x.id <> l.id and (x.a_id = l.b_id or x.b_id = l.b_id) and x.encerrada_em > now() - interval '24 hours'),
    'ultimoEntreEles', (select case when x.resultado->>'vencedor' is null then 'empate'
                                     when (x.a_id = l.a_id) = (x.resultado->>'vencedor' = 'a') then 'a' else 'b' end
                        from jxj_lutas x where x.status = 'encerrada' and x.id <> l.id
                          and ((x.a_id = l.a_id and x.b_id = l.b_id) or (x.a_id = l.b_id and x.b_id = l.a_id))
                        order by x.encerrada_em desc limit 1),
    'agora', now())
  from jxj_lutas l where l.id = lid
$$;

/* perfis e estado inicial calculados no JS, gravados uma vez só */
create or replace function public.jxj_luta_preparar(lid bigint, perfis_ jsonb, estado_ jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update jxj_lutas set perfis = perfis_, estado = estado_ where id = lid and perfis is null;
  return found;
end $$;

create or replace function public.jxj_luta_confirmar(uid uuid, lid bigint, prazo_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; ca jxj_contas; cb jxj_contas; pares integer;
begin
  select * into l from jxj_lutas where id = lid for update;
  if not found or (l.a_user <> uid and l.b_user <> uid) then raise exception 'jxj: luta não encontrada'; end if;
  if l.status <> 'confirmacao' then return jsonb_build_object('status', l.status); end if;
  if l.confirmacao_ate < now() then raise exception 'jxj: o prazo de confirmação acabou'; end if;
  if l.perfis is null then raise exception 'jxj: a luta ainda está sendo montada, tente de novo'; end if;
  if l.a_user = uid then update jxj_lutas set confirmado_a = true where id = lid;
  else update jxj_lutas set confirmado_b = true where id = lid; end if;
  select * into l from jxj_lutas where id = lid;
  if l.confirmado_a and l.confirmado_b then
    select * into ca from jxj_contas where user_id = l.a_user for update;
    select * into cb from jxj_contas where user_id = l.b_user for update;
    -- anti-combinação: o mesmo par vale rating no máximo 3 vezes em 24 h
    select count(*) into pares from jxj_lutas x
      where x.status = 'encerrada' and x.com_rating and x.encerrada_em > now() - interval '24 hours'
        and ((x.a_id = l.a_id and x.b_id = l.b_id) or (x.a_id = l.b_id and x.b_id = l.a_id));
    update jxj_lutas set status = 'andamento', iniciada_em = now(), round = 1, troca = 1,
      prazo = now() + make_interval(secs => prazo_ms / 1000.0),
      com_rating = (pares < 3),
      gratis_a = (not public.jxj_pro_ativo(l.a_user) and not ca.luta_gratis_usada),
      gratis_b = (not public.jxj_pro_ativo(l.b_user) and not cb.luta_gratis_usada),
      versao = versao + 1
      where id = lid;
    update jxj_contas set luta_gratis_usada = true
      where user_id in (l.a_user, l.b_user) and not public.jxj_pro_ativo(user_id);
    perform public.jxj_registrar(uid, 'luta_iniciada', jsonb_build_object('luta', lid));
  end if;
  return jsonb_build_object('status', (select status from jxj_lutas where id = lid));
end $$;

/* recusa explícita ou prazo de confirmação vencido: cancela; quem não
   confirmou fica 60 s fora da fila; quem confirmou volta pra fila com a
   mesma espera (na frente). */
create or replace function public.jxj_luta_cancelar_confirmacao(lid bigint, quem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas;
begin
  select * into l from jxj_lutas where id = lid for update;
  if not found or l.status <> 'confirmacao' then return jsonb_build_object('status', coalesce(l.status, 'inexistente')); end if;
  if quem is null and l.confirmacao_ate > now() then return jsonb_build_object('status', l.status); end if;
  update jxj_lutas set status = 'cancelada', encerrada_em = now(), versao = versao + 1 where id = lid;
  update jxj_contas set luta_aberta_id = null where luta_aberta_id = lid;
  if not l.confirmado_a or quem = l.a_user then update jxj_contas set fila_bloqueada_ate = now() + interval '60 seconds' where user_id = l.a_user; end if;
  if not l.confirmado_b or quem = l.b_user then update jxj_contas set fila_bloqueada_ate = now() + interval '60 seconds' where user_id = l.b_user; end if;
  if l.confirmado_a and (quem is null or quem <> l.a_user) then
    insert into jxj_fila (user_id, lutador_id, categoria, rating, versao, entrou_em, sinal_em, ultimo_adversario)
      select l.a_user, x.id, x.categoria, x.rating, coalesce((public.jxj_cfg('versao_balanceamento'))::text::integer, 1), l.fila_entrou_a, now(), l.b_id
      from jxj_lutadores x where x.id = l.a_id on conflict do nothing;
  end if;
  if l.confirmado_b and (quem is null or quem <> l.b_user) then
    insert into jxj_fila (user_id, lutador_id, categoria, rating, versao, entrou_em, sinal_em, ultimo_adversario)
      select l.b_user, x.id, x.categoria, x.rating, coalesce((public.jxj_cfg('versao_balanceamento'))::text::integer, 1), l.fila_entrou_b, now(), l.a_id
      from jxj_lutadores x where x.id = l.b_id on conflict do nothing;
  end if;
  perform public.jxj_registrar(quem, 'luta_cancelada', jsonb_build_object('luta', lid));
  return jsonb_build_object('status', 'cancelada');
end $$;

/* ---------------------------------------------------------------- ações e troca */
/* Uma ação por lado por troca (chave primária). Mesma ação de novo =
   idempotente; outra ação = recusa ("já enviada"). Prazo com 3 s de
   tolerância de rede. */
create or replace function public.jxj_enviar_acao(uid uuid, lid bigint, round_ smallint, troca_ smallint, familia_ text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; lado_ char(1); existente text;
begin
  select * into l from jxj_lutas where id = lid;
  if not found or (l.a_user <> uid and l.b_user <> uid) then raise exception 'jxj: luta não encontrada'; end if;
  if l.status <> 'andamento' then raise exception 'jxj: a luta não está em andamento'; end if;
  if l.round <> round_ or l.troca <> troca_ then raise exception 'jxj: essa troca já foi resolvida'; end if;
  if l.prazo + interval '3 seconds' < now() then raise exception 'jxj: o prazo da troca acabou'; end if;
  lado_ := case when l.a_user = uid then 'a' else 'b' end;
  insert into jxj_acoes (luta_id, round, troca, lado, familia) values (lid, round_, troca_, lado_, familia_)
    on conflict (luta_id, round, troca, lado) do nothing;
  if not found then
    select familia into existente from jxj_acoes where luta_id = lid and round = round_ and troca = troca_ and lado = lado_;
    if existente <> familia_ then raise exception 'jxj: a ação desta troca já foi enviada'; end if;
  end if;
  return jsonb_build_object('enviada', true, 'lado', lado_);
end $$;

/* Grava a troca resolvida pelo motor (JS). versao_ confere que ninguém
   gravou antes: a segunda resolução simultânea recebe {gravou:false} e
   não muda nada. Se a luta acabou, aplica tudo do fim na mesma transação:
   rating, XP e nível, fichas (com teto do dia), cartel, histórico de
   rating, conquistas, resultado do torneio e libera as duas contas. */
create or replace function public.jxj_gravar_troca(lid bigint, versao_ integer, round_ smallint, troca_ smallint,
  acao_a_ text, acao_b_ text, eventos_ jsonb, estado_ jsonb, prazo_ms integer, fim_ jsonb, efeitos_ jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; lado text; e jsonb; lid_lut bigint; uid_ uuid; fichas_dia integer; dar integer; t jxj_temporadas; conf jxj_confrontos;
begin
  select * into l from jxj_lutas where id = lid for update;
  if not found or l.status <> 'andamento' or l.versao <> versao_ or l.round <> round_ or l.troca <> troca_ then
    return jsonb_build_object('gravou', false);
  end if;
  insert into jxj_trocas (luta_id, round, troca, acao_a, acao_b, eventos) values (lid, round_, troca_, acao_a_, acao_b_, eventos_);
  if fim_ is null then
    update jxj_lutas set estado = estado_, round = (estado_->>'round')::smallint, troca = (estado_->>'troca')::smallint,
      prazo = now() + make_interval(secs => prazo_ms / 1000.0), versao = versao + 1
      where id = lid;
    return jsonb_build_object('gravou', true, 'fim', false);
  end if;
  t := public.jxj_temporada_garantir();
  update jxj_lutas set estado = estado_, status = 'encerrada', encerrada_em = now(), resultado = fim_, efeitos = efeitos_,
    prazo = null, versao = versao + 1 where id = lid;
  update jxj_contas set luta_aberta_id = null where luta_aberta_id = lid;
  for lado in select unnest(array['a', 'b']) loop
    e := efeitos_->lado;
    lid_lut := case when lado = 'a' then l.a_id else l.b_id end;
    uid_ := case when lado = 'a' then l.a_user else l.b_user end;
    update jxj_lutadores set
      xp = xp + (e->>'xp')::integer,
      nivel = public.jxj_nivel_do_xp(xp + (e->>'xp')::integer),
      vitorias = vitorias + case when e->>'resultado' = 'vitoria' then 1 else 0 end,
      derrotas = derrotas + case when e->>'resultado' = 'derrota' then 1 else 0 end,
      empates = empates + case when e->>'resultado' = 'empate' then 1 else 0 end,
      kos = kos + case when e->>'resultado' = 'vitoria' and fim_->>'metodo' in ('KO', 'TKO') then 1 else 0 end,
      finalizacoes = finalizacoes + case when e->>'resultado' = 'vitoria' and fim_->>'metodo' = 'FIN' then 1 else 0 end,
      wos = wos + case when e->>'resultado' = 'derrota' and fim_->>'metodo' = 'WO' then 1 else 0 end,
      rating = coalesce((e->'rating'->>'r')::double precision, rating),
      rd = coalesce((e->'rating'->>'rd')::double precision, rd),
      vol = coalesce((e->'rating'->>'vol')::double precision, vol),
      lutas_rating = lutas_rating + case when e ? 'rating' then 1 else 0 end,
      ultima_luta_rating = case when e ? 'rating' then now() else ultima_luta_rating end
      where id = lid_lut;
    if e ? 'rating' then
      insert into jxj_rating_hist (lutador_id, luta_id, temporada, rating_antes, rating_depois, rd_depois)
        values (lid_lut, lid, t.numero, (e->'ratingAntes'->>'r')::double precision, (e->'rating'->>'r')::double precision, (e->'rating'->>'rd')::double precision);
    end if;
    if coalesce((e->>'fichas')::integer, 0) > 0 then
      select coalesce(sum(delta), 0) into fichas_dia from jxj_fichas where user_id = uid_ and motivo = 'luta' and criado_em > now() - interval '24 hours';
      dar := greatest(0, least((e->>'fichas')::integer, 120 - fichas_dia));
      if dar > 0 then
        update jxj_contas set fichas = fichas + dar where user_id = uid_;
        insert into jxj_fichas (user_id, delta, motivo, ref) values (uid_, dar, 'luta', lid::text);
      end if;
    end if;
    insert into jxj_conquistas (lutador_id, conquista)
      select lid_lut, x from jsonb_array_elements_text(coalesce(e->'conquistas', '[]'::jsonb)) x on conflict do nothing;
  end loop;
  if l.confronto_id is not null then
    select * into conf from jxj_confrontos where id = l.confronto_id for update;
    if conf.vencedor_id is null then
      update jxj_confrontos set vencedor_id = case
          when fim_->>'vencedor' = 'a' then l.a_id
          when fim_->>'vencedor' = 'b' then l.b_id
          else (select id from jxj_lutadores where id in (l.a_id, l.b_id) order by rating desc, id limit 1) end,
        motivo = case when fim_->>'vencedor' is null then 'empate_rating' else 'luta' end
        where id = l.confronto_id;
    end if;
  end if;
  perform public.jxj_registrar(null, 'luta_encerrada', jsonb_build_object('luta', lid, 'metodo', fim_->>'metodo', 'vencedor', fim_->>'vencedor'));
  return jsonb_build_object('gravou', true, 'fim', true);
end $$;

/* ---------------------------------------------------------------- revanche */
create or replace function public.jxj_revanche_pedir(uid uuid, lid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jxj_lutas;
begin
  select * into l from jxj_lutas where id = lid for update;
  if not found or (l.a_user <> uid and l.b_user <> uid) then raise exception 'jxj: luta não encontrada'; end if;
  if l.status <> 'encerrada' or l.tipo = 'torneio' then raise exception 'jxj: essa luta não tem revanche'; end if;
  if l.encerrada_em < now() - interval '60 seconds' then raise exception 'jxj: o prazo da revanche acabou'; end if;
  if l.revanche_luta_id is not null then return jsonb_build_object('luta', l.revanche_luta_id); end if;
  if l.a_user = uid then update jxj_lutas set revanche_a = now() where id = lid;
  else update jxj_lutas set revanche_b = now() where id = lid; end if;
  select * into l from jxj_lutas where id = lid;
  return jsonb_build_object('pronta', l.revanche_a is not null and l.revanche_b is not null);
end $$;

/* os dois aceitaram: cria a luta nova já em andamento (perfis do JS) */
create or replace function public.jxj_revanche_criar(lid bigint, semente_ text, perfis_ jsonb, estado_ jsonb, prazo_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l jxj_lutas; nova jxj_lutas; la jxj_lutadores; lb jxj_lutadores; pares integer;
begin
  select * into l from jxj_lutas where id = lid for update;
  if l.revanche_luta_id is not null then return jsonb_build_object('luta', l.revanche_luta_id); end if;
  if l.revanche_a is null or l.revanche_b is null then raise exception 'jxj: falta o aceite do adversário'; end if;
  if exists (select 1 from jxj_contas where user_id in (l.a_user, l.b_user) and luta_aberta_id is not null) then
    raise exception 'jxj: um dos dois já está em outra luta';
  end if;
  select * into la from jxj_lutadores where id = l.a_id;
  select * into lb from jxj_lutadores where id = l.b_id;
  if not public.jxj_utilizavel(la) or not public.jxj_utilizavel(lb) then raise exception 'jxj: um dos lutadores está inativo'; end if;
  if (not public.jxj_pro_ativo(l.a_user)) or (not public.jxj_pro_ativo(l.b_user)) then
    raise exception 'jxj: revanche é do Pro (a luta grátis do plano grátis já foi usada)';
  end if;
  select count(*) into pares from jxj_lutas x
    where x.status = 'encerrada' and x.com_rating and x.encerrada_em > now() - interval '24 hours'
      and ((x.a_id = l.a_id and x.b_id = l.b_id) or (x.a_id = l.b_id and x.b_id = l.a_id));
  insert into jxj_lutas (tipo, a_id, b_id, a_user, b_user, status, confirmado_a, confirmado_b, semente, compromisso, nomes,
                         perfis, estado, iniciada_em, prazo, com_rating, versao)
    values ('revanche', l.b_id, l.a_id, l.b_user, l.a_user, 'andamento', true, true, semente_,
            encode(sha256(convert_to(semente_, 'UTF8')), 'hex'),
            jsonb_build_object('a', jsonb_build_object('nome', lb.nome, 'rosto', lb.rosto, 'estilo', lb.estilo, 'nivel', lb.nivel, 'rating', lb.rating, 'cartel', jsonb_build_array(lb.vitorias, lb.derrotas, lb.empates), 'moldura', lb.moldura),
                               'b', jsonb_build_object('nome', la.nome, 'rosto', la.rosto, 'estilo', la.estilo, 'nivel', la.nivel, 'rating', la.rating, 'cartel', jsonb_build_array(la.vitorias, la.derrotas, la.empates), 'moldura', la.moldura)),
            perfis_, estado_, now(), now() + make_interval(secs => prazo_ms / 1000.0), pares < 3, 1)
    returning * into nova;
  update jxj_contas set luta_aberta_id = nova.id where user_id in (l.a_user, l.b_user);
  update jxj_lutas set revanche_luta_id = nova.id where id = lid;
  perform public.jxj_registrar(null, 'revanche', jsonb_build_object('de', lid, 'luta', nova.id));
  return jsonb_build_object('luta', nova.id);
end $$;

create or replace function public.jxj_narracao_gravar(lid bigint, texto text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update jxj_lutas set narracao = texto where id = lid and status = 'encerrada' and narracao is null;
  return found;
end $$;

/* ---------------------------------------------------------------- leitura pública */
/* Ranking: principal efetivo, ativo, 5+ lutas com rating, luta nos
   últimos 30 dias, conta não banida. Nunca e-mail nem id de conta (o
   meu=true só marca a linha de quem pediu). */
create or replace function public.jxj_ranking(categoria_ text, busca text, pagina integer, uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with base as (
    select l.*, rank() over (order by l.rating desc, l.id) as posicao
    from jxj_lutadores l
    where l.status = 'ativo' and l.lutas_rating >= 5 and l.ultima_luta_rating > now() - interval '30 days'
      and (categoria_ is null or l.categoria = categoria_)
      and l.id = public.jxj_principal_efetivo(l.user_id) and not public.jxj_banido(l.user_id)
  ), filtro as (
    select * from base where coalesce(busca, '') = '' or nome ilike '%' || busca || '%'
  )
  select jsonb_build_object('total', (select count(*) from filtro), 'linhas', coalesce((
    select jsonb_agg(jsonb_build_object('posicao', f.posicao, 'id', f.id, 'nome', f.nome, 'rosto', f.rosto, 'estilo', f.estilo,
      'categoria', f.categoria, 'nivel', f.nivel, 'rating', round(f.rating), 'cartel', jsonb_build_array(f.vitorias, f.derrotas, f.empates),
      'variacao7d', round(f.rating - coalesce((select h.rating_depois from jxj_rating_hist h where h.lutador_id = f.id and h.criado_em < now() - interval '7 days' order by h.criado_em desc limit 1), 1500)),
      'selo', (select c.recompensa->>'selo' from jxj_classificacao c where c.lutador_id = f.id order by c.temporada desc limit 1),
      'moldura', f.moldura, 'meu', f.user_id = uid) order by f.posicao)
    from (select * from filtro order by posicao limit 50 offset greatest(0, pagina) * 50) f), '[]'::jsonb),
    'minhaPosicao', (select jsonb_build_object('posicao', b.posicao, 'id', b.id, 'nome', b.nome, 'rating', round(b.rating)) from base b where b.user_id = uid limit 1))
$$;

create or replace function public.jxj_perfil(lid bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'nome', l.nome, 'rosto', l.rosto, 'categoria', l.categoria, 'estilo', l.estilo,
    'nivel', l.nivel, 'rating', round(l.rating), 'classificado', l.lutas_rating >= 5, 'status', l.status,
    'cartel', jsonb_build_array(l.vitorias, l.derrotas, l.empates), 'kos', l.kos, 'finalizacoes', l.finalizacoes,
    'build', case when l.build_publica then l.build else null end, 'moldura', l.moldura, 'criadoEm', l.criado_em,
    'conquistas', coalesce((select jsonb_agg(jsonb_build_object('id', c.conquista, 'em', c.conquistada_em) order by c.conquistada_em) from jxj_conquistas c where c.lutador_id = l.id), '[]'::jsonb),
    'titulos', coalesce((select jsonb_agg(jsonb_build_object('tipo', t.tipo, 'categoria', t.categoria, 'temporada', t.temporada, 'torneio', t.torneio_id, 'em', t.conquistado_em) order by t.conquistado_em) from jxj_titulos t where t.lutador_id = l.id), '[]'::jsonb),
    'temporadas', coalesce((select jsonb_agg(jsonb_build_object('temporada', c.temporada, 'posicao', c.posicao, 'rating', round(c.rating), 'selo', c.recompensa->>'selo') order by c.temporada) from jxj_classificacao c where c.lutador_id = l.id), '[]'::jsonb),
    'ratingHist', coalesce((select jsonb_agg(jsonb_build_object('r', round(h.rating_depois), 'em', h.criado_em) order by h.criado_em) from (select * from jxj_rating_hist h where h.lutador_id = l.id order by h.criado_em desc limit 30) h), '[]'::jsonb))
  from jxj_lutadores l where l.id = lid and not public.jxj_banido(l.user_id)
$$;

/* histórico público de lutas encerradas de um lutador (sem semente de luta aberta) */
create or replace function public.jxj_historico(lid bigint, pagina integer) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'em') desc), '[]'::jsonb) from (
    select jsonb_build_object('luta', l.id, 'tipo', l.tipo, 'em', l.encerrada_em,
      'lado', case when l.a_id = lid then 'a' else 'b' end,
      'adversario', case when l.a_id = lid then l.nomes->'b' else l.nomes->'a' end,
      'adversarioId', case when l.a_id = lid then l.b_id else l.a_id end,
      'resultado', l.resultado, 'comRating', l.com_rating,
      'ratingDelta', round(coalesce((l.efeitos->(case when l.a_id = lid then 'a' else 'b' end)->'rating'->>'r')::double precision
                                  - (l.efeitos->(case when l.a_id = lid then 'a' else 'b' end)->'ratingAntes'->>'r')::double precision, 0))) as x
    from jxj_lutas l where (l.a_id = lid or l.b_id = lid) and l.status = 'encerrada'
    order by l.encerrada_em desc limit 20 offset greatest(0, pagina) * 20) s
$$;

/* confrontos diretos entre dois lutadores (rivalidade: só fato) */
create or replace function public.jxj_confronto_direto(x bigint, y bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lutas', count(*),
    'vitoriasX', count(*) filter (where (l.a_id = x and l.resultado->>'vencedor' = 'a') or (l.b_id = x and l.resultado->>'vencedor' = 'b')),
    'vitoriasY', count(*) filter (where (l.a_id = y and l.resultado->>'vencedor' = 'a') or (l.b_id = y and l.resultado->>'vencedor' = 'b')),
    'ultima', max(l.encerrada_em))
  from jxj_lutas l where l.status = 'encerrada' and ((l.a_id = x and l.b_id = y) or (l.a_id = y and l.b_id = x))
$$;

create or replace function public.jxj_hall() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cinturoes', coalesce((select jsonb_agg(jsonb_build_object('lutador', l.id, 'nome', l.nome, 'rosto', l.rosto, 'estilo', l.estilo,
        'categoria', t.categoria, 'torneio', t.torneio_id, 'temporada', tor.temporada, 'em', t.conquistado_em, 'status', l.status) order by t.conquistado_em desc)
      from jxj_titulos t join jxj_lutadores l on l.id = t.lutador_id left join jxj_torneios tor on tor.id = t.torneio_id
      where t.tipo = 'cinturao' and not public.jxj_banido(l.user_id)), '[]'::jsonb),
    'temporadas', coalesce((select jsonb_agg(jsonb_build_object('lutador', l.id, 'nome', l.nome, 'rosto', l.rosto, 'estilo', l.estilo,
        'categoria', t.categoria, 'temporada', t.temporada, 'status', l.status) order by t.temporada desc, t.categoria)
      from jxj_titulos t join jxj_lutadores l on l.id = t.lutador_id
      where t.tipo = 'temporada' and not public.jxj_banido(l.user_id)), '[]'::jsonb),
    'aposentados', coalesce((select jsonb_agg(jsonb_build_object('lutador', l.id, 'nome', l.nome, 'rosto', l.rosto, 'estilo', l.estilo,
        'categoria', l.categoria, 'cartel', jsonb_build_array(l.vitorias, l.derrotas, l.empates), 'titulos',
        (select count(*) from jxj_titulos t where t.lutador_id = l.id), 'em', l.aposentado_em) order by l.aposentado_em desc)
      from jxj_lutadores l where l.status = 'aposentado' and exists (select 1 from jxj_titulos t where t.lutador_id = l.id)
        and not public.jxj_banido(l.user_id)), '[]'::jsonb))
$$;

create or replace function public.jxj_temporada_info(uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jxj_temporadas; ef bigint;
begin
  t := public.jxj_temporada_garantir();
  ef := case when uid is null then null else public.jxj_principal_efetivo(uid) end;
  return jsonb_build_object('numero', t.numero, 'inicio', t.inicio, 'fim', t.fim, 'agora', now(),
    'reset', public.jxj_cfg('reset_temporada'),
    'anteriores', coalesce((select jsonb_agg(jsonb_build_object('numero', x.numero, 'fim', x.fim) order by x.numero desc) from jxj_temporadas x where x.status = 'encerrada'), '[]'::jsonb),
    'meu', case when ef is null then null else (select jsonb_build_object('id', l.id, 'nome', l.nome, 'rating', round(l.rating), 'lutasRating', l.lutas_rating,
        'lutasTemporada', (select count(*) from jxj_rating_hist h where h.lutador_id = l.id and h.temporada = t.numero and h.motivo = 'luta'))
      from jxj_lutadores l where l.id = ef) end);
end $$;

/* ---------------------------------------------------------------- torneios */
create or replace function public.jxj_torneio_aberto(categoria_ text) returns jxj_torneios
language plpgsql security definer set search_path = public as $$
declare t jxj_torneios; temp jxj_temporadas;
begin
  select * into t from jxj_torneios where categoria = categoria_ and status = 'inscricoes';
  if found then return t; end if;
  temp := public.jxj_temporada_garantir();
  insert into jxj_torneios (categoria, temporada, status) values (categoria_, temp.numero, 'inscricoes')
    on conflict do nothing returning * into t;
  if t.id is null then select * into t from jxj_torneios where categoria = categoria_ and status = 'inscricoes'; end if;
  return t;
end $$;

/* inscrição: principal efetivo, ativo, Pro, 3+ lutas com rating, uma por
   conta. Na 8ª, fecha: sementes pelo rating e as quartas com janela de 24 h. */
create or replace function public.jxj_torneio_inscrever(uid uuid, lid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jxj_lutadores; t jxj_torneios; n integer; rec record; i integer;
begin
  if public.jxj_banido(uid) then raise exception 'jxj: conta suspensa'; end if;
  l := public.jxj_meu_lutador(uid, lid);
  if not public.jxj_pro_ativo(uid) then raise exception 'jxj: torneio é do Pro'; end if;
  if l.id <> coalesce(public.jxj_principal_efetivo(uid), -1) then raise exception 'jxj: só o lutador principal entra em torneio'; end if;
  if l.lutas_rating < 3 then raise exception 'jxj: são precisas 3 lutas com rating pra entrar em torneio'; end if;
  perform pg_advisory_xact_lock(hashtext('jxj_torneio_' || l.categoria));
  t := public.jxj_torneio_aberto(l.categoria);
  if exists (select 1 from jxj_inscricoes i join jxj_torneios x on x.id = i.torneio_id where i.user_id = uid and x.status <> 'encerrado') then
    raise exception 'jxj: você já está num torneio';
  end if;
  insert into jxj_inscricoes (torneio_id, lutador_id, user_id, rating_inscricao) values (t.id, l.id, uid, l.rating);
  select count(*) into n from jxj_inscricoes where torneio_id = t.id;
  perform public.jxj_registrar(uid, 'torneio_inscrever', jsonb_build_object('torneio', t.id, 'lutador', l.id));
  if n >= t.vagas then
    i := 0;
    for rec in select * from jxj_inscricoes where torneio_id = t.id order by rating_inscricao desc, inscrito_em loop
      i := i + 1;
      update jxj_inscricoes set semente = i where torneio_id = t.id and lutador_id = rec.lutador_id;
    end loop;
    update jxj_torneios set status = 'andamento', fase = 1, iniciado_em = now() where id = t.id;
    insert into jxj_confrontos (torneio_id, fase, ordem, a_id, b_id, janela_ate)
      select t.id, 1, o.ordem,
        (select lutador_id from jxj_inscricoes where torneio_id = t.id and semente = o.sa),
        (select lutador_id from jxj_inscricoes where torneio_id = t.id and semente = o.sb),
        now() + interval '24 hours'
      from (values (1, 1, 8), (2, 4, 5), (3, 2, 7), (4, 3, 6)) as o(ordem, sa, sb);
    perform public.jxj_torneio_aberto(l.categoria);   -- já abre o próximo
  end if;
  return jsonb_build_object('torneio', t.id, 'inscritos', n, 'vagas', t.vagas);
end $$;

create or replace function public.jxj_torneio_sair(uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from jxj_inscricoes i using jxj_torneios t
    where t.id = i.torneio_id and i.user_id = uid and t.status = 'inscricoes';
  return jsonb_build_object('saiu', found);
end $$;

/* Avança os torneios em andamento: confronto com janela vencida sem luta
   aberta vira W.O. (quem apareceu passa; ninguém apareceu, passa o de
   rating maior); fase completa abre a próxima; final decidida dá título,
   colocação, XP e fichas. Chamado por quem olha torneios (sem cron). */
create or replace function public.jxj_torneios_avancar() returns void
language plpgsql security definer set search_path = public as $$
declare t jxj_torneios; c jxj_confrontos; pend integer; venc bigint[]; ra double precision; rb double precision; vid bigint; perd bigint; i integer; colocacao_ text; fichas_ integer; xp_ integer; uid_ uuid;
begin
  perform pg_advisory_xact_lock(hashtext('jxj_torneios_avancar'));
  for t in select * from jxj_torneios where status = 'andamento' loop
    for c in select * from jxj_confrontos where torneio_id = t.id and fase = t.fase and vencedor_id is null and janela_ate < now() loop
      if c.luta_id is not null and exists (select 1 from jxj_lutas where id = c.luta_id and status in ('confirmacao', 'andamento')) then continue; end if;
      if c.presente_a is not null and c.presente_b is null then vid := c.a_id;
      elsif c.presente_b is not null and c.presente_a is null then vid := c.b_id;
      else
        select rating into ra from jxj_lutadores where id = c.a_id;
        select rating into rb from jxj_lutadores where id = c.b_id;
        vid := case when ra >= rb then c.a_id else c.b_id end;
      end if;
      update jxj_confrontos set vencedor_id = vid,
        motivo = case when (c.presente_a is null) = (c.presente_b is null) then 'wo_duplo' else 'wo' end where id = c.id;
    end loop;
    select count(*) into pend from jxj_confrontos where torneio_id = t.id and fase = t.fase and vencedor_id is null;
    if pend > 0 then continue; end if;
    -- colocação de quem caiu nesta fase
    for c in select * from jxj_confrontos where torneio_id = t.id and fase = t.fase loop
      perd := case when c.vencedor_id = c.a_id then c.b_id else c.a_id end;
      colocacao_ := case t.fase when 1 then 'quartas' when 2 then 'semifinal' else 'vice' end;
      update jxj_inscricoes set colocacao = colocacao_ where torneio_id = t.id and lutador_id = perd;
    end loop;
    if t.fase = 3 then
      select vencedor_id into vid from jxj_confrontos where torneio_id = t.id and fase = 3;
      update jxj_inscricoes set colocacao = 'campeao' where torneio_id = t.id and lutador_id = vid;
      update jxj_torneios set status = 'encerrado', campeao_id = vid, encerrado_em = now() where id = t.id;
      insert into jxj_titulos (lutador_id, tipo, categoria, temporada, torneio_id) values (vid, 'cinturao', t.categoria, t.temporada, t.id) on conflict do nothing;
      insert into jxj_conquistas (lutador_id, conquista) values (vid, 'campeao_torneio') on conflict do nothing;
      update jxj_contas ct set fichas = ct.fichas + case i.colocacao when 'campeao' then 300 when 'vice' then 150 when 'semifinal' then 75 else 30 end
        from jxj_inscricoes i where i.torneio_id = t.id and i.user_id = ct.user_id;
      insert into jxj_fichas (user_id, delta, motivo, ref)
        select i.user_id, case i.colocacao when 'campeao' then 300 when 'vice' then 150 when 'semifinal' then 75 else 30 end, 'torneio', t.id::text
        from jxj_inscricoes i where i.torneio_id = t.id;
      update jxj_lutadores x set xp = x.xp + 150 + case i.colocacao when 'campeao' then 400 when 'vice' then 250 when 'semifinal' then 150 else 0 end,
        nivel = public.jxj_nivel_do_xp(x.xp + 150 + case i.colocacao when 'campeao' then 400 when 'vice' then 250 when 'semifinal' then 150 else 0 end)
        from jxj_inscricoes i where i.torneio_id = t.id and i.lutador_id = x.id;
      perform public.jxj_registrar(null, 'torneio_encerrado', jsonb_build_object('torneio', t.id, 'campeao', vid));
      continue;
    end if;
    select array_agg(vencedor_id order by ordem) into venc from jxj_confrontos where torneio_id = t.id and fase = t.fase;
    i := 0;
    while i < array_length(venc, 1) / 2 loop
      insert into jxj_confrontos (torneio_id, fase, ordem, a_id, b_id, janela_ate)
        values (t.id, t.fase + 1, i + 1, venc[2 * i + 1], venc[2 * i + 2], now() + interval '24 hours')
        on conflict do nothing;
      i := i + 1;
    end loop;
    update jxj_torneios set fase = t.fase + 1 where id = t.id;
  end loop;
end $$;

/* Entrar na sala do confronto: marca presença. Se o outro está presente
   (sinal nos últimos 30 s) e não há luta, devolve pronto=true pro
   servidor criar a luta (perfis do JS) com jxj_torneio_criar_luta. */
create or replace function public.jxj_torneio_sala(uid uuid, cid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c jxj_confrontos; la jxj_lutadores; lb jxj_lutadores; lado_ char(1);
begin
  select * into c from jxj_confrontos where id = cid for update;
  if not found then raise exception 'jxj: confronto não encontrado'; end if;
  select * into la from jxj_lutadores where id = c.a_id;
  select * into lb from jxj_lutadores where id = c.b_id;
  if la.user_id = uid then lado_ := 'a'; elsif lb.user_id = uid then lado_ := 'b'; else raise exception 'jxj: esse confronto não é seu'; end if;
  if c.vencedor_id is not null then return jsonb_build_object('decidido', true, 'vencedor', c.vencedor_id, 'luta', c.luta_id); end if;
  if c.janela_ate < now() then raise exception 'jxj: a janela desse confronto acabou'; end if;
  if lado_ = 'a' then update jxj_confrontos set presente_a = now() where id = cid;
  else update jxj_confrontos set presente_b = now() where id = cid; end if;
  select * into c from jxj_confrontos where id = cid;
  if c.luta_id is not null then return jsonb_build_object('luta', c.luta_id); end if;
  return jsonb_build_object('pronto', c.presente_a > now() - interval '30 seconds' and c.presente_b > now() - interval '30 seconds',
    'presenteA', c.presente_a, 'presenteB', c.presente_b, 'janelaAte', c.janela_ate, 'lado', lado_);
end $$;

create or replace function public.jxj_torneio_lutadores(cid bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('a', (select to_jsonb(l) from jxj_lutadores l where l.id = c.a_id),
                            'b', (select to_jsonb(l) from jxj_lutadores l where l.id = c.b_id))
  from jxj_confrontos c where c.id = cid
$$;

create or replace function public.jxj_torneio_criar_luta(cid bigint, semente_ text, perfis_ jsonb, estado_ jsonb, prazo_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jxj_confrontos; la jxj_lutadores; lb jxj_lutadores; nova jxj_lutas;
begin
  select * into c from jxj_confrontos where id = cid for update;
  if c.luta_id is not null then return jsonb_build_object('luta', c.luta_id); end if;
  if c.vencedor_id is not null or c.janela_ate < now() then raise exception 'jxj: confronto encerrado'; end if;
  select * into la from jxj_lutadores where id = c.a_id;
  select * into lb from jxj_lutadores where id = c.b_id;
  if exists (select 1 from jxj_contas where user_id in (la.user_id, lb.user_id) and luta_aberta_id is not null) then
    raise exception 'jxj: um dos dois está em outra luta';
  end if;
  insert into jxj_lutas (tipo, confronto_id, a_id, b_id, a_user, b_user, status, confirmado_a, confirmado_b, semente, compromisso, nomes,
                         perfis, estado, iniciada_em, prazo, versao)
    values ('torneio', cid, la.id, lb.id, la.user_id, lb.user_id, 'andamento', true, true, semente_,
            encode(sha256(convert_to(semente_, 'UTF8')), 'hex'),
            jsonb_build_object('a', jsonb_build_object('nome', la.nome, 'rosto', la.rosto, 'estilo', la.estilo, 'nivel', la.nivel, 'rating', la.rating, 'cartel', jsonb_build_array(la.vitorias, la.derrotas, la.empates), 'moldura', la.moldura),
                               'b', jsonb_build_object('nome', lb.nome, 'rosto', lb.rosto, 'estilo', lb.estilo, 'nivel', lb.nivel, 'rating', lb.rating, 'cartel', jsonb_build_array(lb.vitorias, lb.derrotas, lb.empates), 'moldura', lb.moldura)),
            perfis_, estado_, now(), now() + make_interval(secs => prazo_ms / 1000.0), 1)
    returning * into nova;
  update jxj_contas set luta_aberta_id = nova.id where user_id in (la.user_id, lb.user_id);
  update jxj_confrontos set luta_id = nova.id where id = cid;
  return jsonb_build_object('luta', nova.id);
end $$;

create or replace function public.jxj_torneios(categoria_ text, uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cat text;
begin
  perform public.jxj_torneios_avancar();
  for cat in select jsonb_array_elements_text(public.jxj_cfg('categorias_ativas')) loop
    perform public.jxj_torneio_aberto(cat);
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'categoria', t.categoria, 'temporada', t.temporada, 'status', t.status,
      'fase', t.fase, 'vagas', t.vagas, 'inscritos', (select count(*) from jxj_inscricoes i where i.torneio_id = t.id),
      'inscrito', exists(select 1 from jxj_inscricoes i where i.torneio_id = t.id and i.user_id = uid),
      'campeao', (select jsonb_build_object('id', l.id, 'nome', l.nome) from jxj_lutadores l where l.id = t.campeao_id),
      'encerradoEm', t.encerrado_em) order by (t.status = 'encerrado'), t.criado_em desc)
    from (select * from jxj_torneios x where (categoria_ is null or x.categoria = categoria_)
          and (x.status <> 'encerrado' or x.encerrado_em > now() - interval '30 days') order by x.criado_em desc limit 40) t), '[]'::jsonb);
end $$;

create or replace function public.jxj_torneio(tid bigint, uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.jxj_torneios_avancar();
  return (select jsonb_build_object('torneio', to_jsonb(t),
    'inscritos', coalesce((select jsonb_agg(jsonb_build_object('lutador', l.id, 'nome', l.nome, 'rosto', l.rosto, 'estilo', l.estilo,
        'semente', i.semente, 'rating', round(i.rating_inscricao), 'colocacao', i.colocacao, 'meu', i.user_id = uid) order by coalesce(i.semente, 99), i.inscrito_em)
      from jxj_inscricoes i join jxj_lutadores l on l.id = i.lutador_id where i.torneio_id = t.id), '[]'::jsonb),
    'confrontos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'fase', c.fase, 'ordem', c.ordem, 'a', c.a_id, 'b', c.b_id,
        'janelaAte', c.janela_ate, 'luta', c.luta_id, 'vencedor', c.vencedor_id, 'motivo', c.motivo,
        'presenteA', c.presente_a is not null, 'presenteB', c.presente_b is not null) order by c.fase, c.ordem)
      from jxj_confrontos c where c.torneio_id = t.id), '[]'::jsonb),
    'agora', now())
    from jxj_torneios t where t.id = tid);
end $$;

/* ---------------------------------------------------------------- permissões */
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'jxj\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
