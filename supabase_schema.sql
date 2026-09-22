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
