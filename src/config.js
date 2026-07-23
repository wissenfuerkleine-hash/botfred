require('dotenv').config();
const path = require('path');

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.warn(`[Config] Warnung: Umgebungsvariable ${name} ist nicht gesetzt.`);
  }
  return value;
}

// Diese Werte sind global fuer den Bot (gelten auf allen Servern).
// Server-spezifische Dinge (Warteraum, Anfrage-Kanal, Bueros) werden
// NICHT hier, sondern pro Server in guildConfig.json gespeichert und
// per Slash-Command (/setup, /office) von den jeweiligen Server-Admins
// selbst eingerichtet.
module.exports = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  clientSecret: process.env.CLIENT_SECRET,
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  musicFile: path.resolve(process.cwd(), process.env.MUSIC_FILE || './assets/wait-music.mp3'),
  dashboardPort: parseInt(process.env.PORT || process.env.DASHBOARD_PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'bitte-in-.env-aendern',
  // Discord-User-IDs, die /admin-panel und den vollen Dashboard-Zugriff auf ALLE Server haben
  ownerIds: (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  adminPanelPassword: process.env.ADMIN_PANEL_PASSWORD,
};
