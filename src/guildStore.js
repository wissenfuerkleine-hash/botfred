const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'guildConfig.json');

const DEFAULTS = {
  waitingRoomChannelId: null,
  requestChannelId: null,
  offices: [],
  // Vom Bot-Besitzer im /admin-panel gesetzt: sperrt die komplette Bot-Funktion auf diesem Server
  locked: false,
  // Anpassbare Texte
  dmMessage: 'Du bist dem Warteraum auf **{server}** beigetreten. Wähle unten aus, zu wem du möchtest.',
  closedMessage: 'Der Support ist gerade außerhalb der Öffnungszeiten. Bitte versuche es später erneut.',
  // "Allgemeine Anfrage" – kein festes Büro, nur Rolle+Emoji, Nutzer landet
  // bei Annahme im Channel der annehmenden Person (muss in dieser Kategorie sein).
  generalOffice: {
    enabled: false,
    emoji: '🔔',
    roleId: null,
    categoryId: null,
  },
  // Musik
  musicMode: 'local', // 'local' | 'file-url' | 'youtube' | 'spotify'
  musicSource: null, // URL / Spotify-Link, je nach musicMode
  volume: 100, // 0-100
  // Öffnungszeiten
  openingHours: {
    enabled: false,
    start: '09:00',
    end: '18:00',
    timezone: 'Europe/Berlin',
  },
};

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

function withDefaults(cfg) {
  return {
    ...DEFAULTS,
    ...cfg,
    openingHours: { ...DEFAULTS.openingHours, ...(cfg?.openingHours || {}) },
    generalOffice: { ...DEFAULTS.generalOffice, ...(cfg?.generalOffice || {}) },
  };
}

function getGuild(guildId) {
  const all = loadAll();
  if (!all[guildId]) {
    all[guildId] = { ...DEFAULTS, openingHours: { ...DEFAULTS.openingHours } };
    saveAll(all);
  }
  return withDefaults(all[guildId]);
}

function updateGuild(guildId, patch) {
  const all = loadAll();
  const current = withDefaults(all[guildId]);
  all[guildId] = { ...current, ...patch };
  saveAll(all);
  return all[guildId];
}

function setWaitingRoom(guildId, channelId) {
  return updateGuild(guildId, { waitingRoomChannelId: channelId });
}

function setRequestChannel(guildId, channelId) {
  return updateGuild(guildId, { requestChannelId: channelId });
}

function setDmMessage(guildId, text) {
  return updateGuild(guildId, { dmMessage: text });
}

function setClosedMessage(guildId, text) {
  return updateGuild(guildId, { closedMessage: text });
}

function setMusic(guildId, mode, source) {
  return updateGuild(guildId, { musicMode: mode, musicSource: source });
}

function setVolume(guildId, volume) {
  return updateGuild(guildId, { volume });
}

function setOpeningHours(guildId, { enabled, start, end, timezone }) {
  const current = getGuild(guildId).openingHours;
  const merged = {
    enabled: enabled ?? current.enabled,
    start: start ?? current.start,
    end: end ?? current.end,
    timezone: timezone ?? current.timezone,
  };
  return updateGuild(guildId, { openingHours: merged });
}

function setGeneralOffice(guildId, { enabled, emoji, roleId, categoryId }) {
  const current = getGuild(guildId).generalOffice;
  const merged = {
    enabled: enabled ?? current.enabled,
    emoji: emoji ?? current.emoji,
    roleId: roleId !== undefined ? roleId : current.roleId,
    categoryId: categoryId !== undefined ? categoryId : current.categoryId,
  };
  return updateGuild(guildId, { generalOffice: merged });
}

function setLocked(guildId, locked) {
  return updateGuild(guildId, { locked });
}

function addOffice(guildId, name, channelId, emoji = null, roleId = null) {
  const guild = getGuild(guildId);
  if (guild.offices.some((o) => o.channelId === channelId)) {
    return { ok: false, reason: 'exists' };
  }
  guild.offices.push({ name, channelId, emoji: emoji || null, roleId: roleId || null });
  updateGuild(guildId, { offices: guild.offices });
  return { ok: true };
}

function removeOffice(guildId, channelId) {
  const guild = getGuild(guildId);
  const before = guild.offices.length;
  const offices = guild.offices.filter((o) => o.channelId !== channelId);
  updateGuild(guildId, { offices });
  return offices.length < before;
}

function getOfficeByChannelId(guildId, channelId) {
  const guild = getGuild(guildId);
  return guild.offices.find((o) => o.channelId === channelId);
}

// Findet, in welchem Server (Guild) sich der Bot gerade befindet, anhand
// der Warteraum-Channel-ID. Wird gebraucht, wenn ein voiceStateUpdate
// serverübergreifend ausgewertet wird (jede Guild hat ihren eigenen Warteraum).
function findGuildIdByWaitingRoom(channelId) {
  const all = loadAll();
  for (const [guildId, cfg] of Object.entries(all)) {
    if (cfg.waitingRoomChannelId === channelId) return guildId;
  }
  return null;
}

module.exports = {
  getGuild,
  setWaitingRoom,
  setRequestChannel,
  setDmMessage,
  setClosedMessage,
  setMusic,
  setVolume,
  setOpeningHours,
  setGeneralOffice,
  setLocked,
  addOffice,
  removeOffice,
  getOfficeByChannelId,
  findGuildIdByWaitingRoom,
};
