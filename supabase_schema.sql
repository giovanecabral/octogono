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
