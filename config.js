const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'guildConfig.json');

function loadAll() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function saveAll(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getGuildConfig(guildId) {
  return loadAll()[guildId] || null;
}

function setGuildConfig(guildId, cfg) {
  const all = loadAll();
  all[guildId] = cfg;
  saveAll(all);
}

function getOrCreateGuildConfig(guildId) {
  const all = loadAll();
  if (!all[guildId]) {
    all[guildId] = {
      waitingRoomId: null,
      requestChannelId: null,
      offices: [],
      dmText: 'Hallo {user}, willkommen auf **{server}**! Bitte wähle ein Büro:',
      closedText: 'Wir haben derzeit geschlossen. Bitte versuche es später erneut.',
      musicSource: { type: 'file', url: null },
      volume: 50,
      openingHours: { active: false, start: '09:00', end: '18:00', timezone: 'Europe/Berlin' },
      blocked: false,
    };
    saveAll(all);
  }
  return all[guildId];
}

function updateGuildConfig(guildId, updates) {
  const cfg = getOrCreateGuildConfig(guildId);
  const merged = Object.assign({}, cfg, updates);
  setGuildConfig(guildId, merged);
  return merged;
}

function getAllConfigs() {
  return loadAll();
}

module.exports = { getGuildConfig, setGuildConfig, getOrCreateGuildConfig, updateGuildConfig, getAllConfigs };
