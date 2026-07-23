const express = require('express');
const session = require('express-session');
const path = require('path');
const { ChannelType, PermissionsBitField } = require('discord.js');
const config = require('../config');
const guildStore = require('../guildStore');
const voiceMusic = require('../voiceMusic');
const caseStore = require('../caseStore');
const botState = require('../botState');
const ownerStore = require('../ownerStore');
const backupModule = require('../backup');

const MANAGE_GUILD = BigInt(PermissionsBitField.Flags.ManageGuild);
const ADMINISTRATOR = BigInt(PermissionsBitField.Flags.Administrator);

function isOwnerUser(userId) {
  return config.ownerIds.includes(userId) || ownerStore.getDynamicOwnerIds().includes(userId);
}

function requireAuth(req, res, next) {
  if (req.session.discordUser) return next();
  return res.status(401).json({ error: 'Nicht angemeldet' });
}

// Prüft für Routen mit :id, ob der eingeloggte Nutzer auf GENAU diesem Server
// Admin-Rechte hat (oder Bot-Besitzer ist, dann geht immer alles).
function requireGuildAccess(req, res, next) {
  const guildId = req.params.id;
  if (isOwnerUser(req.session.discordUser.id)) return next();
  if (req.session.adminGuildIds?.includes(guildId)) return next();
  return res.status(403).json({ error: 'Du bist auf diesem Server kein Admin.' });
}

function requireOwner(req, res, next) {
  if (isOwnerUser(req.session.discordUser.id)) return next();
  return res.status(403).json({ error: 'Nur für den Bot-Besitzer.' });
}

function startWebServer(client) {
  if (!config.clientSecret) {
    console.warn('[Dashboard] CLIENT_SECRET ist nicht gesetzt – das Dashboard bleibt deaktiviert, bis das nachgeholt wird.');
    return;
  }

  const app = express();
  app.use(express.json());
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12, httpOnly: true }, // 12 Stunden
  }));
  app.use(express.static(path.join(__dirname, 'public')));

  const redirectUri = `${config.publicUrl}/auth/callback`;

  // --- Discord-OAuth-Login ---
  app.get('/auth/login', (req, res) => {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify guilds');
    res.redirect(url.toString());
  });

  app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/login.html?error=missing_code');

    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenRes.ok) throw new Error(`Token-Austausch fehlgeschlagen (${tokenRes.status})`);
      const tokenData = await tokenRes.json();

      const [userRes, guildsRes] = await Promise.all([
        fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
        fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
      ]);
      if (!userRes.ok || !guildsRes.ok) throw new Error('Konnte Discord-Nutzerdaten nicht abrufen');

      const user = await userRes.json();
      const guilds = await guildsRes.json();

      const adminGuildIds = guilds
        .filter((g) => {
          const perms = BigInt(g.permissions || '0');
          return g.owner || (perms & ADMINISTRATOR) !== 0n || (perms & MANAGE_GUILD) !== 0n;
        })
        .map((g) => g.id)
        // nur Server, auf denen der Bot auch tatsächlich Mitglied ist, sind relevant
        .filter((id) => client.guilds.cache.has(id));

      req.session.discordUser = { id: user.id, username: user.username, avatar: user.avatar };
      req.session.adminGuildIds = adminGuildIds;

      res.redirect('/dashboard.html');
    } catch (err) {
      console.error('[Dashboard] OAuth-Fehler:', err.message);
      res.redirect('/login.html?error=oauth_failed');
    }
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/session', (req, res) => {
    if (!req.session.discordUser) return res.json({ authenticated: false });
    res.json({
      authenticated: true,
      user: req.session.discordUser,
      isOwner: isOwnerUser(req.session.discordUser.id),
    });
  });

  // --- Server & Channels (nur Server anzeigen, auf denen der Nutzer Admin ist) ---
  app.get('/api/guilds', requireAuth, (req, res) => {
    const owner = isOwnerUser(req.session.discordUser.id);
    const guilds = [...client.guilds.cache.values()]
      .filter((g) => owner || req.session.adminGuildIds?.includes(g.id))
      .map((g) => ({ id: g.id, name: g.name }));
    res.json(guilds);
  });

  app.get('/api/guilds/:id/channels', requireAuth, requireGuildAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Server nicht gefunden' });
    try {
      const channels = await guild.channels.fetch();
      const voice = channels
        .filter((c) => c && c.type === ChannelType.GuildVoice)
        .map((c) => ({ id: c.id, name: c.name, occupied: c.members.size > 0 }));
      const text = channels.filter((c) => c && c.type === ChannelType.GuildText).map((c) => ({ id: c.id, name: c.name }));
      res.json({ voice, text });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Server-spezifischer Bot-Spitzname (Avatar/Banner sind bei Discord
  // fest an den Bot-Account gebunden und können NICHT pro Server variieren) ---
  app.get('/api/guilds/:id/nickname', requireAuth, requireGuildAccess, (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Server nicht gefunden' });
    res.json({ nickname: guild.members.me?.nickname || null });
  });

  app.post('/api/guilds/:id/nickname', requireAuth, requireGuildAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Server nicht gefunden' });
    const { nickname } = req.body || {};
    try {
      await guild.members.me.setNickname(nickname || null);
      res.json({ ok: true, nickname: guild.members.me.nickname || null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/guilds/:id/roles', requireAuth, requireGuildAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Server nicht gefunden' });
    try {
      const roles = await guild.roles.fetch();
      const list = roles
        .filter((r) => r.id !== guild.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/guilds/:id/categories', requireAuth, requireGuildAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Server nicht gefunden' });
    try {
      const channels = await guild.channels.fetch();
      const categories = channels.filter((c) => c && c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name }));
      res.json(categories);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Server sperren/entsperren (dasselbe wie im /admin-panel, nur hier auch verfügbar) ---
  app.post('/api/guilds/:id/lock', requireAuth, requireGuildAccess, (req, res) => {
    const { locked } = req.body || {};
    guildStore.setLocked(req.params.id, !!locked);
    res.json({ locked: !!locked });
  });

  // --- Verifizierung ---
  app.get('/api/guilds/:id/verification', requireAuth, requireGuildAccess, (req, res) => {
    res.json(guildStore.getGuild(req.params.id).verification);
  });
  app.post('/api/guilds/:id/verification', requireAuth, requireGuildAccess, (req, res) => {
    guildStore.setVerification(req.params.id, req.body || {});
    res.json(guildStore.getGuild(req.params.id).verification);
  });

  // --- Eigenständiges Support-Modul ---
  app.get('/api/guilds/:id/support', requireAuth, requireGuildAccess, (req, res) => {
    res.json(guildStore.getGuild(req.params.id).support);
  });
  app.post('/api/guilds/:id/support', requireAuth, requireGuildAccess, (req, res) => {
    guildStore.setSupport(req.params.id, req.body || {});
    res.json(guildStore.getGuild(req.params.id).support);
  });

  // --- RP-System ---
  app.get('/api/guilds/:id/rp', requireAuth, requireGuildAccess, (req, res) => {
    res.json(guildStore.getGuild(req.params.id).rp);
  });
  app.post('/api/guilds/:id/rp', requireAuth, requireGuildAccess, (req, res) => {
    guildStore.setRp(req.params.id, req.body || {});
    res.json(guildStore.getGuild(req.params.id).rp);
  });

  // --- Ticketsystem (Panel-Einstellungen + Kategorien-Liste) ---
  app.get('/api/guilds/:id/tickets', requireAuth, requireGuildAccess, (req, res) => {
    res.json(guildStore.getGuild(req.params.id).tickets);
  });
  app.post('/api/guilds/:id/tickets', requireAuth, requireGuildAccess, (req, res) => {
    const { categories, ...settings } = req.body || {};
    guildStore.setTicketSettings(req.params.id, settings);
    res.json(guildStore.getGuild(req.params.id).tickets);
  });
  app.post('/api/guilds/:id/tickets/categories', requireAuth, requireGuildAccess, (req, res) => {
    const { name, roleId, categoryId, staffOnlyClose } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name erforderlich' });
    const id = guildStore.addTicketCategory(req.params.id, { name, roleId, categoryId, staffOnlyClose });
    res.json({ id, tickets: guildStore.getGuild(req.params.id).tickets });
  });
  app.delete('/api/guilds/:id/tickets/categories/:categoryTicketId', requireAuth, requireGuildAccess, (req, res) => {
    guildStore.removeTicketCategory(req.params.id, req.params.categoryTicketId);
    res.json(guildStore.getGuild(req.params.id).tickets);
  });

  // --- Backup ---
  app.get('/api/guilds/:id/backup', requireAuth, requireGuildAccess, (req, res) => {
    res.json(guildStore.getGuild(req.params.id).backup);
  });
  app.post('/api/guilds/:id/backup/settings', requireAuth, requireGuildAccess, (req, res) => {
    guildStore.setBackupSettings(req.params.id, req.body || {});
    res.json(guildStore.getGuild(req.params.id).backup);
  });
  app.post('/api/guilds/:id/backup/create', requireAuth, requireGuildAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Server nicht gefunden' });
    try {
      const code = await backupModule.createBackup(guild);
      res.json({ code });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Konfiguration lesen/schreiben ---
  app.get('/api/guilds/:id/config', requireAuth, requireGuildAccess, (req, res) => {
    res.json(guildStore.getGuild(req.params.id));
  });

  app.post('/api/guilds/:id/config', requireAuth, requireGuildAccess, (req, res) => {
    const guildId = req.params.id;
    const body = req.body || {};

    if (body.waitingRoomChannelId !== undefined) guildStore.setWaitingRoom(guildId, body.waitingRoomChannelId);
    if (body.requestChannelId !== undefined) guildStore.setRequestChannel(guildId, body.requestChannelId);
    if (body.dmMessage !== undefined) guildStore.setDmMessage(guildId, body.dmMessage);
    if (body.closedMessage !== undefined) guildStore.setClosedMessage(guildId, body.closedMessage);
    if (body.musicMode !== undefined) guildStore.setMusic(guildId, body.musicMode, body.musicSource ?? null);
    if (body.volume !== undefined) {
      guildStore.setVolume(guildId, body.volume);
      voiceMusic.setVolumeLive(guildId, body.volume);
    }
    if (body.openingHours !== undefined) guildStore.setOpeningHours(guildId, body.openingHours);

    res.json(guildStore.getGuild(guildId));
  });

  // --- Büros ---
  app.post('/api/guilds/:id/offices', requireAuth, requireGuildAccess, (req, res) => {
    const { name, channelId, emoji, roleId } = req.body || {};
    if (!name || !channelId) return res.status(400).json({ error: 'name und channelId erforderlich' });
    const result = guildStore.addOffice(req.params.id, name, channelId, emoji, roleId);
    if (!result.ok) return res.status(409).json({ error: 'Dieses Büro existiert bereits' });
    res.json(guildStore.getGuild(req.params.id));
  });

  app.delete('/api/guilds/:id/offices/:channelId', requireAuth, requireGuildAccess, (req, res) => {
    guildStore.removeOffice(req.params.id, req.params.channelId);
    res.json(guildStore.getGuild(req.params.id));
  });

  // --- Statistik & Verlauf ---
  app.get('/api/guilds/:id/cases', requireAuth, requireGuildAccess, (req, res) => {
    const guildId = req.params.id;
    const guild = client.guilds.cache.get(guildId);

    const resolveUser = (userId) => {
      if (!userId) return null;
      const user = client.users.cache.get(userId);
      return user ? user.tag : userId;
    };

    const stats = caseStore.getStats(guildId);
    const open = caseStore.getOpenCases(guildId).map((c) => ({ ...c, userName: resolveUser(c.userId), accepterName: resolveUser(c.accepterId) }));
    const history = caseStore.getCases(guildId).slice(-30).reverse().map((c) => ({
      ...c,
      userName: resolveUser(c.userId),
      accepterName: resolveUser(c.accepterId),
      closedByName: resolveUser(c.closedBy),
    }));

    res.json({ stats, open, history, guildName: guild?.name });
  });

  // --- Globaler Bot-Status (Pause) & Bot-Profil: nur für den Bot-Besitzer ---
  app.get('/api/bot-status', requireAuth, requireOwner, async (req, res) => {
    let description = null;
    try {
      const appRes = await fetch('https://discord.com/api/v10/applications/@me', {
        headers: { Authorization: `Bot ${config.token}` },
      });
      if (appRes.ok) {
        const appData = await appRes.json();
        description = appData.description || '';
      }
    } catch {
      // Bio konnte nicht geladen werden - kein kritischer Fehler, Feld bleibt leer
    }

    res.json({
      paused: botState.isPaused(),
      tag: client.user?.tag,
      username: client.user?.username,
      avatarUrl: client.user?.displayAvatarURL({ size: 256 }),
      bannerUrl: client.user?.bannerURL?.({ size: 512 }) || null,
      description,
    });
  });

  app.post('/api/bot-status', requireAuth, requireOwner, (req, res) => {
    const { paused } = req.body || {};
    botState.setPaused(!!paused);
    res.json({ paused: botState.isPaused() });
  });

  app.post('/api/bot-profile', requireAuth, requireOwner, async (req, res) => {
    const { username, avatarUrl, bannerUrl, description } = req.body || {};
    const results = {};
    try {
      if (username) {
        await client.user.setUsername(username);
        results.username = 'ok';
      }
      if (avatarUrl) {
        await client.user.setAvatar(avatarUrl);
        results.avatar = 'ok';
      }
      if (bannerUrl) {
        await client.user.setBanner(bannerUrl);
        results.banner = 'ok';
      }
      if (description !== undefined) {
        const patchRes = await fetch('https://discord.com/api/v10/applications/@me', {
          method: 'PATCH',
          headers: { Authorization: `Bot ${config.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        });
        if (!patchRes.ok) throw new Error(`Bio konnte nicht gespeichert werden (${patchRes.status})`);
        results.description = 'ok';
      }
      res.json({ ok: true, ...results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(config.dashboardPort, () => {
    console.log(`[Dashboard] Läuft auf Port ${config.dashboardPort} (${config.publicUrl})`);
  });
}

module.exports = { startWebServer };
