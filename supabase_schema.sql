-- supabase_schema.sql — rodar uma vez no editor SQL do painel do Supabase
-- (supabase.com > seu projeto > SQL Editor > New query > colar isto > Run).
--
-- Cria a tabela de conquistas por usuário e a Row Level Security que
-- garante que ninguém lê ou escreve conquista de outro usuário. auth.users
-- já existe por padrão em todo projeto Supabase (é o Auth dele) — não
-- precisa criar tabela de usuário nenhuma, só referenciar.

create table if not exists conquistas_usuario (
  user_id uuid not null references auth.users(id) on delete cascade,
  conquista_id text not null,
  desbloqueada_em timestamptz not null default now(),
  primary key (user_id, conquista_id)
);

alter table conquistas_usuario enable row level security;

-- cada usuário só enxerga as próprias linhas
create policy "usuário lê só as próprias conquistas"
  on conquistas_usuario for select
  using (auth.uid() = user_id);

-- cada usuário só grava linhas com o próprio user_id — mesmo que o client
-- seja adulterado (DevTools), o Postgres recusa insert/upsert com
-- user_id de outra pessoa, porque auth.uid() vem do JWT da sessão, não
-- de um campo que o navegador manda
create policy "usuário grava só as próprias conquistas"
  on conquistas_usuario for insert
  with check (auth.uid() = user_id);

-- sem policy de update nem delete, de propósito: conquista não se edita
-- nem se desfaz depois de desbloqueada, só existe ou não existe. Menos
-- superfície de RLS pra errar.

-- ---------------------------------------------------------------------
-- carreiras_usuario (2026-09-09) — histórico de carreiras concluídas,
-- uma linha por carreira. `seed` já é único por carreira (é o mesmo
-- número usado nos links de desafio, sorteado uma vez no início da
-- carreira) — serve de chave sem precisar de id substituto novo.
-- Mesmo padrão de RLS de conquistas_usuario acima.

create table if not exists carreiras_usuario (
  user_id uuid not null references auth.users(id) on delete cascade,
  seed bigint not null,
  nome_lutador text not null,
  cartel text not null,
  nota text not null,
  concluida_em timestamptz not null default now(),
  primary key (user_id, seed)
);

alter table carreiras_usuario enable row level security;

create policy "usuário lê só as próprias carreiras"
  on carreiras_usuario for select
  using (auth.uid() = user_id);

create policy "usuário grava só as próprias carreiras"
  on carreiras_usuario for insert
  with check (auth.uid() = user_id);

-- sem update/delete de propósito, mesmo raciocínio de conquistas:
-- carreira concluída é história, não se edita depois.

-- ---------------------------------------------------------------------
-- assinaturas (2026-09-21) — status Pro por usuário, plano Pro (ver
-- PENDENCIAS.md, item "Plano Pro", em construção — vira seção do
-- LEIA-ME.md quando o plano Pro estiver funcionando de ponta a
-- ponta). Diferente de conquistas_usuario/
-- carreiras_usuario: aqui o USUÁRIO NÃO ESCREVE NUNCA. Só o servidor
-- (service_role, no webhook da Asaas em api/webhook-asaas.js) grava
-- "pro". Se tivesse policy de insert/update pro usuário comum, bastaria
-- abrir o DevTools e chamar supabase.from('assinaturas').upsert(...)
-- pra virar Pro de graça — por isso a única policy abaixo é de leitura.
create table if not exists assinaturas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pro boolean not null default false,
  plano text not null default 'mensal' check (plano in ('unico','mensal')),
  asaas_customer_id text,
  asaas_payment_id text,       -- pagamento que ATIVOU o pro atual
  expira_em timestamptz,       -- 2026-09-22: R$9,99 libera 30 dias, sem
                                -- cobrança automática (não é assinatura
                                -- recorrente da Asaas) — cada pagamento
                                -- confirmado SOMA 30 dias (a partir de
                                -- agora, ou do fim do período ainda
                                -- ativo, ver ativarPro() em
                                -- api/webhook-asaas.js). null só antes
                                -- do 1º pagamento.
  atualizado_em timestamptz not null default now()
);

alter table assinaturas enable row level security;

create policy "usuário lê só a própria assinatura"
  on assinaturas for select
  using (auth.uid() = user_id);

-- sem policy de insert/update/delete pro usuário comum, de propósito
-- (ver comentário acima) — service_role ignora RLS por padrão no
-- Supabase, não precisa de policy própria pra escrever aqui.

-- ---------------------------------------------------------------------
-- pagamentos_processados (2026-09-21) — livro-razão de todo evento de
-- webhook da Asaas já tratado, por asaas_payment_id. Dois motivos de
-- existir:
-- 1. Idempotência: a Asaas pode reenviar o MESMO evento de webhook
--    (reentrega conhecida). Sem isto, um reenvio de PAYMENT_CONFIRMED
--    reprocessaria a ativação; com isto, api/webhook-asaas.js confere
--    se o asaas_payment_id já tem linha ANTES de escrever em
--    assinaturas — se tem, responde 200 sem fazer nada de novo.
-- 2. Auditoria: cada linha registra o EVENTO que causou a mudança
--    ("PAYMENT_CONFIRMED", "PAYMENT_REFUNDED", etc.) e o valor
--    confirmado DIRETO na API da Asaas (GET /payments/{id}, nunca só o
--    corpo do webhook) — é o que evita um evento forjado com
--    status/valor adulterado (ex. R$0,01) virar Pro de graça.
-- Chave é (asaas_payment_id, evento), NÃO só asaas_payment_id: um mesmo
-- pagamento passa por MAIS de um evento real na vida dele (PAYMENT_CONFIRMED
-- e, depois, talvez PAYMENT_REFUNDED) — com PK de uma coluna só, a segunda
-- linha (o estorno) bateria em "já processado" pelo primeiro evento e seria
-- IGNORADA, deixando pro=true pra sempre depois de um estorno real. Achado
-- por inspeção antes de escrever api/webhook-asaas.js, não em produção.
create table if not exists pagamentos_processados (
  asaas_payment_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  evento text not null,             -- nome do evento de webhook que gerou esta linha
  status text not null,             -- status confirmado via GET na API da Asaas, não o do corpo do webhook
  valor numeric(10,2) not null,     -- valor confirmado via GET na API da Asaas, idem
  processado_em timestamptz not null default now(),
  primary key (asaas_payment_id, evento)
);

-- MIGRAÇÃO — rode isto uma vez no painel se a tabela acima já existe com
-- a PK antiga (uma coluna só). "create table if not exists" não conserta
-- tabela já criada — sem isto, a tabela fica com o bug do comentário
-- acima mesmo com este arquivo atualizado.
-- alter table pagamentos_processados drop constraint pagamentos_processados_pkey;
-- alter table pagamentos_processados add primary key (asaas_payment_id, evento);

alter table pagamentos_processados enable row level security;

create policy "usuário lê só os próprios pagamentos"
  on pagamentos_processados for select
  using (auth.uid() = user_id);

-- sem insert/update/delete pro usuário, mesmo motivo de assinaturas —
-- só o webhook (service_role) escreve aqui.

-- ---------------------------------------------------------------------
-- aceites_termos (2026-09-21) — registro jurídico de aceite dos Termos
-- de Uso, gravado no clique de "Confirmar pagamento" (não no cadastro
-- — cadastro e pagamento podem estar bem separados no tempo, o aceite
-- que importa juridicamente é o de quando dinheiro troca de mão). Fica
-- Ativado em 2026-09-22 (Termos Versão 4, TERMOS_PUBLICADOS=true no
-- painel da Vercel) — ver PENDENCIAS.md, item "Plano Pro", pro histórico
-- de quando isso ligou. Diferente de assinaturas/pagamentos_processados: AQUI
-- o usuário escreve direto (é ele quem aceita, no clique, antes do
-- pagamento existir) — mesmo padrão de RLS de conquistas_usuario.
create table if not exists aceites_termos (
  user_id uuid not null references auth.users(id) on delete cascade,
  versao_termos text not null,      -- versão ou hash do texto aceito — se os termos mudarem, vira aceite novo, não sobrescreve
  aceito_em timestamptz not null default now(),
  primary key (user_id, versao_termos)
);

alter table aceites_termos enable row level security;

create policy "usuário lê só os próprios aceites"
  on aceites_termos for select
  using (auth.uid() = user_id);

create policy "usuário grava só os próprios aceites"
  on aceites_termos for insert
  with check (auth.uid() = user_id);

-- sem update/delete, de propósito: aceite não se edita nem se apaga,
-- é registro histórico — mesmo raciocínio de conquistas/carreiras.

-- =====================================================================
-- REVAMP FASE 3 (2026-09-27): rodar SÓ este bloco se as tabelas acima
-- já existem no projeto (create ... if not exists não recria nada, mas
-- create policy repetida dá erro de "already exists").
-- =====================================================================

-- ---------------------------------------------------------------------
-- saves — carreira EM ANDAMENTO, até 3 por conta. Diferente de
-- carreiras_usuario (histórico, imutável): save é sobrescrito o tempo
-- todo e apagado quando a carreira acaba ou o jogador libera o espaço.
-- Mesmo padrão de RLS de sempre: cada um lê, grava e apaga só o que é
-- seu (auth.uid() vem do JWT, não do client).
create table if not exists saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  versao smallint not null,
  dados jsonb not null,
  nome text not null,
  divisao text not null,
  modo text not null,
  cartel text not null,
  luta_n smallint not null,
  campeao boolean not null default false,
  rosto jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table saves enable row level security;
create policy "usuário lê só os próprios saves" on saves for select using (auth.uid() = user_id);
create policy "usuário cria só os próprios saves" on saves for insert with check (auth.uid() = user_id);
create policy "usuário atualiza só os próprios saves" on saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "usuário apaga só os próprios saves" on saves for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- placar — carreiras ENCERRADAS de todos os jogadores (página Ranking).
-- Leitura pública (é um ranking); ESCRITA só pelo servidor
-- (api/placar.js com service_role, que valida plausibilidade antes). Sem
-- policy de insert/update/delete pro usuário comum, de propósito, mesmo
-- raciocínio de assinaturas: com policy de insert, bastava o DevTools
-- pra se colocar em 1º lugar. user_id fica legível (UUID aleatório, sem
-- e-mail): é o que deixa a tela mostrar "sua melhor posição".
create table if not exists placar (
  user_id uuid not null references auth.users(id) on delete cascade,
  seed bigint not null,
  nome_lutador text not null,
  divisao text not null,
  modo text not null check (modo in ('normal','lenda')),
  pontuacao integer not null check (pontuacao between 0 and 10000),
  cartel text not null,
  nota text not null,
  cinturoes smallint not null default 0,
  rosto jsonb,
  criado_em timestamptz not null default now(),
  primary key (user_id, seed)
);
create index if not exists placar_ordem on placar (modo, pontuacao desc);
alter table placar enable row level security;
create policy "placar é público" on placar for select using (true);

-- ---------------------------------------------------------------------
-- Painel de admin (2026-09-28) — api/admin.js, tela #/admin.
-- Quem acessa: o dono (e-mail em ADMIN_DONO_EMAIL, variável da Vercel) e
-- quem estiver em `admins`. As três tabelas não têm policy de escrita
-- pro usuário: só o servidor (service_role) mexe. `banidos` deixa cada um
-- ler só a própria linha (o jogo pode avisar "conta suspensa").
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  adicionado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
alter table admins enable row level security;

create table if not exists banidos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  motivo text,
  banido_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
alter table banidos enable row level security;
drop policy if exists "usuário vê se está banido" on banidos;
create policy "usuário vê se está banido" on banidos for select using (auth.uid() = user_id);

create table if not exists admin_log (
  id bigserial primary key,
  admin_id uuid not null,
  admin_email text,
  acao text not null,
  alvo_id uuid,
  alvo_email text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
alter table admin_log enable row level security;

-- ranking esconde conta banida (a função lê `banidos` por cima da RLS)
create or replace function public.esta_banido(uid uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists(select 1 from banidos b where b.user_id = uid) $$;
drop policy if exists "placar é público" on placar;
drop policy if exists "placar é público, menos banido" on placar;
create policy "placar é público, menos banido" on placar for select using (not public.esta_banido(user_id));

-- lista de jogadores do painel: só o servidor chama (service_role)
create or replace function public.admin_listar_usuarios(busca text default '', limite int default 50, deslocamento int default 0)
returns table(id uuid, email text, criado_em timestamptz, ultimo_acesso timestamptz,
              pro boolean, plano text, expira_em timestamptz, banido boolean, motivo_ban text,
              carreiras bigint, no_placar bigint, admin boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
         coalesce(a.pro, false), a.plano, a.expira_em,
         (b.user_id is not null), b.motivo,
         (select count(*) from carreiras_usuario c where c.user_id = u.id),
         (select count(*) from placar p where p.user_id = u.id),
         exists(select 1 from admins ad where ad.user_id = u.id)
  from auth.users u
  left join assinaturas a on a.user_id = u.id
  left join banidos b on b.user_id = u.id
  where coalesce(busca, '') = '' or u.email ilike '%' || busca || '%'
  order by u.created_at desc
  limit least(greatest(limite, 1), 200) offset greatest(deslocamento, 0)
$$;
revoke execute on function public.admin_listar_usuarios(text, int, int) from public, anon, authenticated;
grant execute on function public.admin_listar_usuarios(text, int, int) to service_role;

-- ---------------------------------------------------------------------
-- Cota de IA por conta (plano de evolução, etapa 2, 2026-10-01) —
-- api/ai.js + api/_pro.js. A amostra grátis do Pro (coletiva e entrevista
-- da 1ª luta sem o Pro) gasta do grupo 'amostra': LIMITE_AMOSTRA_IA
-- chamadas (variável da Vercel; 6 se vazia) a cada 24 h por CONTA, não
-- por carreira. 'geral' fica reservado pro teto do Pro (etapa 6).
-- Só o servidor (service_role) chama as funções; o jogador não lê nem
-- grava a tabela (RLS ligada e nenhuma policy). Nada aqui apaga ou muda
-- tabela que já existe. `chamadas` é a conta da janela atual (a devolução
-- desconta); `total` é histórico: toda chamada que já foi contada, nunca
-- diminui.
create table if not exists uso_ia (
  user_id uuid not null references auth.users(id) on delete cascade,
  grupo text not null check (grupo in ('amostra', 'geral')),
  janela_inicio timestamptz not null default now(),
  chamadas integer not null default 0,
  total integer not null default 0,
  primary key (user_id, grupo)
);
alter table uso_ia enable row level security;

-- Conta uma chamada e confere o limite NUM comando só: duas chamadas ao
-- mesmo tempo disputam a mesma linha, o Postgres trava a linha e a
-- segunda confere o limite já com a primeira contada. Janela de 24 h a
-- partir da 1ª chamada; vencida, recomeça do 1. Recusa não conta nada.
-- Limite 0 (ou vazio) recusa sempre. Devolve o início da janela em que a
-- chamada foi contada (o servidor guarda pra uma eventual devolução), ou
-- null quando recusa.
create or replace function public.consumir_uso_ia(uid uuid, grupo_ text, limite integer)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare janela timestamptz;
begin
  if limite is null or limite < 1 then return null; end if;
  insert into uso_ia as u (user_id, grupo, janela_inicio, chamadas, total)
  values (uid, grupo_, now(), 1, 1)
  on conflict (user_id, grupo) do update set
    janela_inicio = case when u.janela_inicio < now() - interval '24 hours' then now() else u.janela_inicio end,
    chamadas = case when u.janela_inicio < now() - interval '24 hours' then 1 else u.chamadas + 1 end,
    total = u.total + 1
  where u.janela_inicio < now() - interval '24 hours' or u.chamadas < limite
  returning janela_inicio into janela;
  return janela;
end $$;
revoke execute on function public.consumir_uso_ia(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consumir_uso_ia(uuid, text, integer) to service_role;

-- A IA falhou depois de contar (OpenRouter fora, timeout, resposta
-- vazia): devolve a unidade SÓ se a janela em que ela foi contada
-- (`janela`, o que consumir_uso_ia devolveu) ainda é a janela atual e não
-- venceu. Janela anterior ou vencida: não mexe em nada. O total não
-- diminui.
create or replace function public.devolver_uso_ia(uid uuid, grupo_ text, janela timestamptz)
returns void language sql security definer set search_path = public as $$
  update uso_ia set chamadas = greatest(chamadas - 1, 0)
  where user_id = uid and grupo = grupo_
    and janela_inicio = janela
    and janela_inicio >= now() - interval '24 hours'
$$;
revoke execute on function public.devolver_uso_ia(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.devolver_uso_ia(uuid, text, timestamptz) to service_role;

-- Monitorar (só leitura, no SQL Editor; o LEIA-ME "Amostra grátis" explica):
--   contas que usaram a amostra nas últimas 24 h, e quantas bateram o limite:
--     select count(*) as contas, count(*) filter (where chamadas >= 6) as no_limite
--     from uso_ia where grupo = 'amostra' and janela_inicio > now() - interval '24 hours';
--   chamadas da amostra contadas desde sempre (inclui as devolvidas porque a IA falhou):
--     select sum(total) from uso_ia where grupo = 'amostra';
