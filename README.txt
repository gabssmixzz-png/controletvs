ATUALIZAÇÃO DO BACKEND SCHOOL ROKU

Arquivos incluídos: server.js e db.js.

1. Faça backup dos arquivos atuais.
2. Substitua server.js e db.js pelos arquivos deste pacote.
3. No Render, configure um Persistent Disk montado em /var/data.
4. Configure a variável de ambiente STORAGE_DIR=/var/data.
5. Se já houver dados no serviço, copie primeiro a pasta data/ e a pasta uploads/ atuais para o disco montado /var/data (mantendo /var/data/data/db.json e /var/data/uploads/...). Não configure STORAGE_DIR antes de preservar os dados existentes.
6. Confirme que ADMIN_EMAIL, ADMIN_PASSWORD e JWT_SECRET estão configuradas no Render.
7. Faça commit/deploy e confirme https://controletvs.onrender.com/api/health.

O server.js associa cada código de pareamento ao ID exato da TV criada, habilita HTTP Range para streaming de vídeo e valida caminhos da pasta de mídia. O db.js passa a gravar o banco JSON dentro de STORAGE_DIR/data.

Não substitua auth.js, seed.js, index.html ou package.json por causa desta atualização.
