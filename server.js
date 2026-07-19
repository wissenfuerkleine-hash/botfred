const express = require('express');
const session = require('express-session');
const path = require('path');
const { getOrCreateGuildConfig, updateGuildConfig, getAllConfigs } = require('./config');

function startDashboard(client) {
  const port = parseInt(process.env.DASHBOARD_PORT || '3000');
  const password = process.env.DASHBOARD_PASSWORD || '';
  const secret = process.env.SESSION_SECRET || 'changeme-secret';

  if (!password) {
    console.log('[Dashboard] DASHBOARD_PASSWORD nicht gesetzt – Dashboard deaktiviert.');
    return;
  }

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(session({ secret, resave: false, saveUninitialized: false, cookie: { maxAge: 3600000 } }));
  app.use(express.static(path.join(__dirname)));

  function requireLogin(req, res, next) {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  app.get('/login', (req, res) => {
    res.send(loginPage(''));
  });

  app.post('/login', (req, res) => {
    if (req.body.password === password) {
      req.session.loggedIn = true;
      res.redirect('/');
    } else {
      res.send(loginPage('❌ Falsches Passwort.'));
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────
  app.get('/', requireLogin, (req, res) => {
    const guildId = req.query.guild;
    const guilds = [...client.guilds.cache.values()];
    const cfg = guildId ? getOrCreateGuildConfig(guildId) : null;
    const guild = guildId ? client.guilds.cache.get(guildId) : null;
    res.send(dashboardPage(guilds, guild, cfg, guildId));
  });

  // ── API: Save settings ─────────────────────────────────────────────────────
  app.post('/api/save', requireLogin, (req, res) => {
    const { guildId, section, ...data } = req.body;
    if (!guildId) return res.json({ ok: false, error: 'No guildId' });

    const cfg = getOrCreateGuildConfig(guildId);

    if (section === 'channels') {
      if (data.waitingRoomId) updateGuildConfig(guildId, { waitingRoomId: data.waitingRoomId });
      if (data.requestChannelId) updateGuildConfig(guildId, { requestChannelId: data.requestChannelId });
    }
    if (section === 'texts') {
      updateGuildConfig(guildId, {
        dmText: data.dmText || cfg.dmText,
        closedText: data.closedText || cfg.closedText,
      });
    }
    if (section === 'music') {
      updateGuildConfig(guildId, {
        musicSource: { type: data.musicType || 'file', url: data.musicUrl || null },
        volume: parseInt(data.volume) || 50,
      });
    }
    if (section === 'hours') {
      updateGuildConfig(guildId, {
        openingHours: {
          active: data.active === 'true' || data.active === true,
          start: data.start || '09:00',
          end: data.end || '18:00',
          timezone: data.timezone || 'Europe/Berlin',
        },
      });
    }

    res.json({ ok: true });
  });

  app.listen(port, () => {
    console.log(`[Dashboard] Läuft auf Port ${port}`);
  });
}

// ─── HTML Templates ────────────────────────────────────────────────────────

function loginPage(error) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login – Office Support Bot</title>
<link rel="stylesheet" href="/style.css"></head>
<body class="center-page">
<div class="login-box">
  <h1>🤖 Office Support Bot</h1>
  <h2>Dashboard Login</h2>
  ${error ? `<p class="error">${error}</p>` : ''}
  <form method="POST" action="/login">
    <input type="password" name="password" placeholder="Passwort" required autofocus>
    <button type="submit">Einloggen</button>
  </form>
</div></body></html>`;
}

function dashboardPage(guilds, guild, cfg, selectedGuildId) {
  const guildOptions = guilds.map(g =>
    `<option value="${g.id}" ${g.id === selectedGuildId ? 'selected' : ''}>${g.name}</option>`
  ).join('');

  const musicTypes = ['file', 'url', 'youtube', 'spotify'];
  const musicTypeOptions = musicTypes.map(t =>
    `<option value="${t}" ${cfg?.musicSource?.type === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  const voiceChannels = guild
    ? [...guild.channels.cache.values()].filter(c => c.type === 2)
    : [];
  const textChannels = guild
    ? [...guild.channels.cache.values()].filter(c => c.type === 0)
    : [];

  const vcOptions = (selected) => voiceChannels.map(c =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.name}</option>`
  ).join('');
  const tcOptions = (selected) => textChannels.map(c =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.name}</option>`
  ).join('');

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard – Office Support Bot</title>
<link rel="stylesheet" href="/style.css"></head>
<body>
<header>
  <h1>🤖 Office Support Bot – Dashboard</h1>
  <a href="/logout" class="logout-btn">Ausloggen</a>
</header>
<main>
  <div class="server-select">
    <form method="GET" action="/">
      <label>Server auswählen:</label>
      <select name="guild" onchange="this.form.submit()">
        <option value="">-- Server wählen --</option>
        ${guildOptions}
      </select>
    </form>
  </div>

  ${!cfg ? '<p class="hint">Bitte einen Server auswählen.</p>' : `
  <div class="cards">

    <div class="card">
      <h2>📢 Kanäle</h2>
      <form class="ajax-form" data-section="channels" data-guild="${selectedGuildId}">
        <label>Warteraum-Voice-Channel:
          <select name="waitingRoomId">
            ${vcOptions(cfg.waitingRoomId)}
          </select>
        </label>
        <label>Anfrage-Kanal (Text):
          <select name="requestChannelId">
            ${tcOptions(cfg.requestChannelId)}
          </select>
        </label>
        <button type="submit">Speichern</button>
        <span class="save-msg"></span>
      </form>
    </div>

    <div class="card">
      <h2>💬 Texte</h2>
      <form class="ajax-form" data-section="texts" data-guild="${selectedGuildId}">
        <label>DM-Text (Platzhalter: {user}, {server}):
          <textarea name="dmText" rows="3">${cfg.dmText || ''}</textarea>
        </label>
        <label>Geschlossen-Text:
          <textarea name="closedText" rows="3">${cfg.closedText || ''}</textarea>
        </label>
        <button type="submit">Speichern</button>
        <span class="save-msg"></span>
      </form>
    </div>

    <div class="card">
      <h2>🎵 Musik</h2>
      <form class="ajax-form" data-section="music" data-guild="${selectedGuildId}">
        <label>Musikquelle:
          <select name="musicType">${musicTypeOptions}</select>
        </label>
        <label>URL / Pfad:
          <input type="text" name="musicUrl" value="${cfg.musicSource?.url || ''}" placeholder="https://... oder leer für lokale Datei">
        </label>
        <label>Lautstärke (0–100):
          <input type="number" name="volume" min="0" max="100" value="${cfg.volume ?? 50}">
        </label>
        <button type="submit">Speichern</button>
        <span class="save-msg"></span>
      </form>
    </div>

    <div class="card">
      <h2>🕐 Öffnungszeiten</h2>
      <form class="ajax-form" data-section="hours" data-guild="${selectedGuildId}">
        <label>Aktiv:
          <select name="active">
            <option value="false" ${!cfg.openingHours?.active ? 'selected' : ''}>Nein</option>
            <option value="true" ${cfg.openingHours?.active ? 'selected' : ''}>Ja</option>
          </select>
        </label>
        <label>Startzeit: <input type="time" name="start" value="${cfg.openingHours?.start || '09:00'}"></label>
        <label>Endzeit: <input type="time" name="end" value="${cfg.openingHours?.end || '18:00'}"></label>
        <label>Zeitzone: <input type="text" name="timezone" value="${cfg.openingHours?.timezone || 'Europe/Berlin'}"></label>
        <button type="submit">Speichern</button>
        <span class="save-msg"></span>
      </form>
    </div>

    <div class="card">
      <h2>🏢 Büros (${(cfg.offices || []).length})</h2>
      <ul class="office-list">
        ${(cfg.offices || []).map((o, i) => `<li>${o.emoji || '🏢'} <b>${o.name}</b> — <code>#${o.channelId}</code></li>`).join('') || '<li>Keine Büros</li>'}
      </ul>
      <p class="hint">Büros per <code>/buero add</code> im Discord hinzufügen.</p>
    </div>

  </div>
  `}
</main>
<script>
document.querySelectorAll('.ajax-form').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.guildId = form.dataset.guild;
    data.section = form.dataset.section;
    const res = await fetch('/api/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const json = await res.json();
    const msg = form.querySelector('.save-msg');
    msg.textContent = json.ok ? '✅ Gespeichert' : '❌ Fehler';
    setTimeout(() => msg.textContent = '', 3000);
  });
});
</script>
</body></html>`;
}

module.exports = { startDashboard };
