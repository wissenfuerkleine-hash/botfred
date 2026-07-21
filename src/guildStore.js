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
  // Verifizierungssystem: Panel mit Button, optional Captcha, Rolle geben/entfernen
  verification: {
    title: 'Verifizierung',
    message: 'Klicke unten auf den Button, um dich zu verifizieren.',
    captchaEnabled: false,
    grantRoleId: null,
    removeRoleId: null,
    bannerUrl: null,
    logoUrl: null,
  },
  // Eigenständiges Support-Modul: eigener Warteraum, eigener Ping-Kanal,
  // eigene Musik (nur eigener Datei-Link, kein YouTube/Spotify), eigene Rolle.
  support: {
    enabled: false,
    waitingRoomChannelId: null,
    pingChannelId: null,
    message: '🆘 Neuer Supportfall',
    categoryId: null,
    roleId: null,
    musicSource: null,
    volume: 100,
  },
  // Ticketsystem: Panel mit Kategorien, pro Kategorie eigene Rolle/Kategorie-Channel,
  // Schließen-Rechte, Feedback (1-5 Sterne + Grund) ins Log.
  tickets: {
    panelTitle: 'Support-Tickets',
    panelMessage: 'Wähle unten eine Kategorie, um ein Ticket zu eröffnen.',
    bannerUrl: null,
    logoUrl: null,
    openMessage: 'Danke für dein Ticket! Ein Teammitglied meldet sich gleich bei dir.',
    closedTitle: 'Ticket geschlossen',
    closedMessage: 'Dein Ticket wurde auf dem Server geschlossen.',
    feedbackChannelId: null,
    categories: [], // { id, name, roleId, categoryId, staffOnlyClose }
  },
  // Backup-System: automatische Backups + Einstellungen dazu
  backup: {
    autoEnabled: false,
    intervalHours: 24,
    lastBackupAt: null,
  },
  // RP-System: Start/Stop-Ankündigungen + Status-Panel
  rp: {
    active: false,
    startTitle: 'RP gestartet',
    startMessage: 'Das Roleplay hat begonnen!',
    startRoleId: null,
    startChannelId: null,
    stopTitle: 'RP beendet',
    stopMessage: 'Das Roleplay wurde beendet.',
    stopRoleId: null,
    stopChannelId: null,
    statusChannelId: null,
    statusMessageId: null,
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
    verification: { ...DEFAULTS.verification, ...(cfg?.verification || {}) },
    support: { ...DEFAULTS.support, ...(cfg?.support || {}) },
    tickets: {
      ...DEFAULTS.tickets,
      ...(cfg?.tickets || {}),
      categories: cfg?.tickets?.categories ?? DEFAULTS.tickets.categories,
    },
    backup: { ...DEFAULTS.backup, ...(cfg?.backup || {}) },
    rp: { ...DEFAULTS.rp, ...(cfg?.rp || {}) },
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

function setVerification(guildId, patch) {
  const current = getGuild(guildId).verification;
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return updateGuild(guildId, { verification: merged });
}

function setSupport(guildId, patch) {
  const current = getGuild(guildId).support;
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return updateGuild(guildId, { support: merged });
}

function setRp(guildId, patch) {
  const current = getGuild(guildId).rp;
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return updateGuild(guildId, { rp: merged });
}

function setBackupSettings(guildId, patch) {
  const current = getGuild(guildId).backup;
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return updateGuild(guildId, { backup: merged });
}

// --- Ticketsystem ---
function setTicketSettings(guildId, patch) {
  const current = getGuild(guildId).tickets;
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (key !== 'categories' && value !== undefined) merged[key] = value;
  }
  return updateGuild(guildId, { tickets: merged });
}

function addTicketCategory(guildId, { name, roleId, categoryId, staffOnlyClose }) {
  const tickets = getGuild(guildId).tickets;
  const id = `tc_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const categories = [...tickets.categories, { id, name, roleId: roleId || null, categoryId, staffOnlyClose: staffOnlyClose !== false }];
  updateGuild(guildId, { tickets: { ...tickets, categories } });
  return id;
}

function removeTicketCategory(guildId, id) {
  const tickets = getGuild(guildId).tickets;
  const before = tickets.categories.length;
  const categories = tickets.categories.filter((c) => c.id !== id);
  updateGuild(guildId, { tickets: { ...tickets, categories } });
  return categories.length < before;
}

function getTicketCategory(guildId, id) {
  return getGuild(guildId).tickets.categories.find((c) => c.id === id);
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
  setVerification,
  setSupport,
  setBackupSettings,
  setRp,
  setTicketSettings,
  addTicketCategory,
  removeTicketCategory,
  getTicketCategory,
  setLocked,
  addOffice,
  removeOffice,
  getOfficeByChannelId,
  findGuildIdByWaitingRoom,
};
