/**
 * Cria usuário admin padrão se o banco estiver vazio.
 */
const { load, save, id, now } = require('./db');
const { hashPassword } = require('./auth');

function seed() {
  const db = load();
  if (db.users.length === 0) {
    db.users.push({
      id: id('usr_'),
      email: 'admin@escola.local',
      name: 'Administrador',
      passwordHash: hashPassword('admin123'),
      role: 'admin',
      createdAt: now(),
    });
    save(db);
    console.log('[seed] Usuário admin criado: admin@escola.local / admin123');
  }
  return db;
}

module.exports = { seed };
