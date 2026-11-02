# Migração Supabase — School Roku CMS

Esta branch prepara a migração sem alterar a branch main nem disparar o deploy atual.

## Modelo de dados
A tabela `public.school_roku_state` guarda o estado atual do CMS em JSONB. Isso preserva o formato usado pelo backend (`users`, `devices`, `contents`, `playlists`, `publications`, `priorityAlerts`, `pairingCodes`, `auditLog`, `settings`, `fairDemo`) e reduz o risco de incompatibilidade.

## Ainda NÃO publicar
O backend atual usa chamadas síncronas `load()/save()` e grava uploads em disco local. A migração completa exige:
1. Adaptar as chamadas de persistência para operações assíncronas PostgreSQL.
2. Migrar o estado JSON existente antes de ativar o novo backend.
3. Trocar `/api/upload` e `/media/*` para Supabase Storage, mantendo suporte a HTTP Range para vídeo Roku.
4. Validar login, CRUD, pareamento, playlist e streaming.

## Variáveis futuras no Render
- `DATABASE_URL`: conexão PostgreSQL do Supabase (preferir conexão compatível com o ambiente Render).
- `SUPABASE_URL`: URL do projeto.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta somente no servidor; nunca no navegador ou Roku.
- `SUPABASE_STORAGE_BUCKET`: `school-roku-media`.

Não configure as variáveis nem execute o deploy até o backend adaptado e a migração dos dados serem testados. Não habilite acesso público à tabela.

## Implementação nesta branch
- `db.js` usa a tabela JSONB via Supabase REST e mantém cópia local; se a conexão remota falhar, o servidor não inicia em modo vazio.
- `server.js` faz upload e entrega de mídia pelo bucket privado, incluindo suporte a requisições HTTP Range para vídeo.
- Sem as variáveis Supabase, o backend mantém o modo local antigo para desenvolvimento.
- O estado local existente é enviado apenas quando a tabela ainda não tem a linha `main`. Se já houver estado remoto, ele prevalece.

## Configurar no Render (somente depois de executar o SQL e revisar a branch)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e opcionalmente `SUPABASE_STORAGE_BUCKET=school-roku-media`.
Nunca coloque a service role key no GitHub, painel web ou app Roku.
