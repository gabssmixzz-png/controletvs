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

Configure estas variáveis em Render → Environment antes de publicar:

- `ADMIN_EMAIL`: e-mail administrativo escolhido pela escola.
- `ADMIN_PASSWORD`: senha administrativa forte e exclusiva.
- `JWT_SECRET`: segredo longo e aleatório para assinar os tokens.

Quando `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem configurados, o servidor atualiza o usuário administrador existente no banco persistente durante a inicialização. Não coloque a senha diretamente nos arquivos do GitHub.

## Persistência

O armazenamento local do serviço pode ser efêmero. Para não perder banco e arquivos enviados após reinicializações ou novos deploys, configure armazenamento persistente no Render ou migre para banco/armazenamento persistentes.
