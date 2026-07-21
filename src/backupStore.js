const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_PATH = path.join(__dirname, '..', 'backups.json');

function loadAll() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveAll(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

function normalizeCode(code) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateCode() {
  // z. B. "A1B2-C3D4-E5F6" - kurz genug zum Abtippen, lang genug um nicht erratbar zu sein
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function saveBackup(guildId, guildName, data) {
  const all = loadAll();
  const code = generateCode();
  all[normalizeCode(code)] = { displayCode: code, guildId, guildName, createdAt: Date.now(), data };
  saveAll(all);
  return code;
}

function getBackup(code) {
  const all = loadAll();
  return all[normalizeCode(code)] || null;
}

module.exports = { saveBackup, getBackup };
