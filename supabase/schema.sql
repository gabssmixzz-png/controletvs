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

-- Bucket privado: o backend faz o proxy da mídia para manter a chave secreta fora do Roku.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-roku-media', 'school-roku-media', false, 157286400,
 array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
 allowed_mime_types = excluded.allowed_mime_types;
