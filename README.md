# School Roku CMS — Backend

Este pacote usa arquivos diretamente na raiz do repositório GitHub, como no layout exibido na captura.

## Render (Web Service)

- Branch: `main`
- Root Directory: deixe vazio
- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: Node.js

O Render fornece `PORT` automaticamente. O servidor também usa `RENDER_EXTERNAL_URL` para montar links públicos de mídia.

## Arquivos esperados na raiz do GitHub

`server.js`, `db.js`, `auth.js`, `seed.js`, `index.html` e `package.json`.

O servidor cria automaticamente as pastas `data/`, `uploads/images/` e `uploads/videos/`.

## Verificação

- `/` abre o painel
- `/api/health` verifica a API

## Acesso inicial

- E-mail: `admin@escola.local`
- Senha: `admin123`

Altere a senha inicial e configure `JWT_SECRET` nas variáveis de ambiente antes de usar com dados reais.

## Persistência

O armazenamento local do serviço pode ser efêmero. Para não perder banco e arquivos enviados após reinicializações ou novos deploys, configure armazenamento persistente no Render ou migre para banco/armazenamento persistentes.
