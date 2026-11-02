# School Roku CMS — Backend

## Estrutura do projeto

**Importante:** mantenha as pastas `src/` e `public/` como estão neste ZIP.
Não envie apenas os arquivos de dentro delas para a raiz do GitHub.

## Configuração no Render

Crie um serviço do tipo **Web Service** conectado a este repositório:

- Branch: `main`
- Root Directory: deixe vazio
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

O Render fornece a variável `PORT` automaticamente. O servidor já a utiliza.
O endereço público dos arquivos de mídia usa automaticamente `RENDER_EXTERNAL_URL`.
Se preferir, você pode definir `PUBLIC_BASE_URL` com a URL pública do serviço.

## Verificação

Depois do deploy, abra:

- `/` para acessar o painel
- `/api/health` para verificar se a API está respondendo

A rota de saúde deve retornar JSON com `ok: true`.

## Login inicial

- E-mail: `admin@escola.local`
- Senha: `admin123`

**Segurança:** depois do primeiro acesso, altere a senha padrão e configure uma variável
`JWT_SECRET` longa e aleatória no ambiente do Render.

## Observação sobre armazenamento

O banco JSON e os arquivos enviados ficam nas pastas `data/` e `uploads/`.
Em hospedagens com sistema de arquivos efêmero, esses dados podem ser perdidos em
um novo deploy ou reinicialização. Para uso contínuo, configure um Persistent Disk
no Render (se disponível no seu plano) montado em um caminho persistente e adapte
as pastas de dados/uploads para esse caminho, ou migre para banco e armazenamento
persistentes. Não considere o armazenamento local efêmero como backup.
