const fs = require('fs');
const path = require('path');
const config = require('./config');

const FILE_PATH = path.join(__dirname, '..', 'owners.json');

function load() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({ ids: [] }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
  } catch {
    return { ids: [] };
  }
}

function save(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

// IDs, die per .env (OWNER_IDS) fest eingetragen sind – nicht über das Panel entfernbar
function isEnvOwner(userId) {
  return config.ownerIds.includes(userId);
}

// Nur die im Panel dynamisch hinzugefügten IDs
function getExtraOwnerIds() {
  return load().ids;
}

// Env-Owner + im Panel hinzugefügte Owner zusammen, ohne Duplikate
function getAllOwnerIds() {
  return [...new Set([...config.ownerIds, ...getExtraOwnerIds()])];
}

function addOwner(userId) {
  if (isEnvOwner(userId)) return { ok: false, reason: 'already-env' };
  const data = load();
  if (data.ids.includes(userId)) return { ok: false, reason: 'exists' };
  data.ids.push(userId);
  save(data);
  return { ok: true };
}

function removeOwner(userId) {
  if (isEnvOwner(userId)) return { ok: false, reason: 'is-env' }; // Env-Owner nur in .env entfernbar
  const data = load();
  const before = data.ids.length;
  data.ids = data.ids.filter((id) => id !== userId);
  save(data);
  return { ok: data.ids.length < before };
}

module.exports = {
  isEnvOwner,
  getExtraOwnerIds,
  getAllOwnerIds,
  addOwner,
  removeOwner,
};
