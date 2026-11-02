/**
 * Cria ou atualiza o usuário administrador.
 * Configure ADMIN_EMAIL e ADMIN_PASSWORD nas variáveis de ambiente do Render.
 * Assim, a senha não fica gravada no repositório GitHub.
 */
const { load, save, id, now } = require('./db');
const { hashPassword } = require('./auth');

async function seed() {
  const db = load();
  const configuredEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const configuredPassword = process.env.ADMIN_PASSWORD || '';

  if (configuredEmail && configuredPassword) {
    let admin = db.users.find((u) => u.role === 'admin');
    if (!admin) {
      admin = {
        id: id('usr_'),
        name: 'Administrador',
        role: 'admin',
        createdAt: now(),
      };
      db.users.push(admin);
    }
    admin.email = configuredEmail;
    admin.passwordHash = hashPassword(configuredPassword);
    admin.name = admin.name || 'Administrador';
    admin.role = 'admin';
    await save(db);
    console.log(`[seed] Usuário administrador configurado: ${configuredEmail}`);
  } else if (db.users.length === 0) {
    // Acesso temporário apenas para instalação local; configure as variáveis no Render.
    db.users.push({
      id: id('usr_'),
      email: 'admin@escola.local',
      name: 'Administrador',
      passwordHash: hashPassword('admin123'),
      role: 'admin',
      createdAt: now(),
    });
    await save(db);
    console.log('[seed] Usuário local criado. Configure ADMIN_EMAIL e ADMIN_PASSWORD no Render.');
  }
  return db;
}

module.exports = { seed };
