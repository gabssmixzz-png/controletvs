-- School Roku CMS: armazenamento persistente do estado atual.
-- Mantém a estrutura JSON existente para evitar quebrar as rotas durante a migração.
create table if not exists public.school_roku_state (
  id text primary key check (id = 'main'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.school_roku_state enable row level security;
-- O backend acessará esta tabela com a chave secreta no servidor.
-- Não crie políticas públicas para anon/authenticated.
