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
