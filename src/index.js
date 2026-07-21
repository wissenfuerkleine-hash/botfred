const {
  Client,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const config = require('./config');
const guildStore = require('./guildStore');
const voiceMusic = require('./voiceMusic');
const botState = require('./botState');
const { handleCommand } = require('./commands');
const interactions = require('./interactions');
const { isWithinOpeningHours } = require('./timeUtils');
const { startWebServer } = require('./web/server');
const { formatMessage } = require('./textUtils');
const { buildOfficeSelectPayload } = require('./officeSelectUI');
const adminPanel = require('./adminPanel');
const verification = require('./verification');
const support = require('./support');
const { resolveSupportAudioResource } = require('./musicSource');
const ticketing = require('./ticketing');
const backup = require('./backup');
const backupStore = require('./backupStore');

// --- Startup-Checks: bricht mit einer klaren, verständlichen Meldung ab,
// statt mit einem kryptischen Stacktrace weiter unten zu crashen. ---
function checkStartupConfigOrExit() {
  const problems = [];

  if (!config.token) {
    problems.push('DISCORD_TOKEN fehlt in der .env-Datei.');
  }
  if (!config.clientId) {
    problems.push('CLIENT_ID fehlt in der .env-Datei.');
  }

  const fs = require('fs');
  if (!fs.existsSync(require('path').resolve(__dirname, '..', '.env'))) {
    problems.push(
      'Es wurde keine .env-Datei gefunden. Kopiere .env.example zu .env ' +
      '("cp .env.example .env") und trage dort deinen Token und deine Client-ID ein.'
    );
  }

  if (problems.length > 0) {
    console.error('\n❌ Bot kann nicht starten – folgende Probleme wurden gefunden:\n');
    problems.forEach((p) => console.error(`   - ${p}`));
    console.error(
      '\nBitte beheben und "npm start" erneut ausführen. ' +
      'Mit "npm run diagnose" kannst du außerdem prüfen, ob Token/Client-ID gültig sind ' +
      'und ob die Slash-Commands bereits bei Discord registriert wurden ("npm run deploy-commands").\n'
    );
    process.exit(1);
  }
}

checkStartupConfigOrExit();

// Verhindert, dass unerwartete Fehler den Prozess ohne jede Meldung beenden
// (z. B. bei pm2 sonst nur ein stiller Neustart-Loop ohne erkennbare Ursache).
process.on('unhandledRejection', (err) => {
  console.error('❌ Unerwarteter Fehler (unhandledRejection):', err);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Unerwarteter Fehler (uncaughtException):', err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // noetig, damit DMs an Nutzer zuverlaessig ankommen/gesendet werden koennen
});

client.once('ready', () => {
  console.log(`Eingeloggt als ${client.user.tag}. Aktiv auf ${client.guilds.cache.size} Server(n).`);
  startWebServer(client);
});

// --- Warteraum-Erkennung: reagiert auf JEDEM Server unabhaengig ---
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (botState.isPaused()) return; // Bot wurde global im Dashboard pausiert
  const guildId = newState.guild.id;
  const guildConfig = guildStore.getGuild(guildId);
  if (guildConfig.locked) return; // Server wurde vom Bot-Besitzer gesperrt

  // --- Büro-Warteraum ---
  if (guildConfig.waitingRoomChannelId) {
    const joinedWaitingRoom = newState.channelId === guildConfig.waitingRoomChannelId && oldState.channelId !== newState.channelId;
    const leftWaitingRoom = oldState.channelId === guildConfig.waitingRoomChannelId && newState.channelId !== oldState.channelId;

    if (joinedWaitingRoom && !newState.member.user.bot) {
      await onUserJoinedWaitingRoom(newState);
    }
    if (leftWaitingRoom || joinedWaitingRoom) {
      await maybeLeaveEmptyWaitingRoom(newState.guild, guildConfig.waitingRoomChannelId);
    }
  }

  // --- Eigenständiger Support-Warteraum ---
  if (guildConfig.support.enabled && guildConfig.support.waitingRoomChannelId) {
    const joinedSupportRoom = newState.channelId === guildConfig.support.waitingRoomChannelId && oldState.channelId !== newState.channelId;
    const leftSupportRoom = oldState.channelId === guildConfig.support.waitingRoomChannelId && newState.channelId !== oldState.channelId;

    if (joinedSupportRoom && !newState.member.user.bot) {
      await onUserJoinedSupportRoom(newState);
    }
    if (leftSupportRoom || joinedSupportRoom) {
      await maybeLeaveEmptyWaitingRoom(newState.guild, guildConfig.support.waitingRoomChannelId);
    }
  }
});

async function onUserJoinedSupportRoom(voiceState) {
  const guild = voiceState.guild;
  const waitingRoomChannel = voiceState.channel;

  // Bot joint den Support-Warteraum und spielt (nur eigene) Wartemusik, falls
  // er nicht schon anderweitig im Server in einem Voice-Channel ist.
  if (!voiceMusic.isBotConnected(guild.id)) {
    await voiceMusic.joinWaitingRoom(waitingRoomChannel, resolveSupportAudioResource);
  }

  await support.notifySupportRequest(guild, voiceState.member);
}

async function onUserJoinedWaitingRoom(voiceState) {
  const guild = voiceState.guild;
  const waitingRoomChannel = voiceState.channel;
  const guildConfig = guildStore.getGuild(guild.id);

  // Außerhalb der Öffnungszeiten: nur Bescheid geben, kein Musik-Join, keine DM-Auswahl
  if (!isWithinOpeningHours(guildConfig.openingHours)) {
    const closedText = formatMessage(guildConfig.closedMessage, voiceState.member, guild);
    await voiceState.member.send(closedText).catch(() => {});
    return;
  }

  // Bot joint den Warteraum und spielt Wartemusik, falls noch nicht drin
  if (!voiceMusic.isBotConnected(guild.id)) {
    await voiceMusic.joinWaitingRoom(waitingRoomChannel);
  }

  if (guildConfig.offices.length === 0) {
    await voiceState.member.send('Willkommen im Warteraum! Aktuell sind aber noch keine Büros konfiguriert – bitte einen Admin informieren.').catch(() => {});
    return;
  }

  const description = formatMessage(guildConfig.dmMessage, voiceState.member, guild);
  const payload = buildOfficeSelectPayload(guild, guildConfig, 0, description);

  await voiceState.member.send(payload).catch((err) => {
    console.warn(`[DM] Konnte keine DM an ${voiceState.member.user.tag} senden: ${err.message}`);
  });
}

async function maybeLeaveEmptyWaitingRoom(guild, waitingRoomChannelId) {
  const channel = guild.channels.cache.get(waitingRoomChannelId);
  if (!channel) return;
  // Nur verlassen, wenn der Bot wirklich in GENAU diesem Warteraum sitzt -
  // sonst würde das leere Werden eines ungenutzten Warteraums den Bot
  // versehentlich aus dem jeweils anderen (aktiven) Warteraum werfen.
  if (!voiceMusic.isBotInChannel(guild.id, waitingRoomChannelId)) return;
  const nonBotMembers = channel.members.filter((m) => !m.user.bot);
  if (nonBotMembers.size === 0) {
    voiceMusic.leaveWaitingRoom(guild.id);
  }
}

// --- Interaktionen: Slash-Commands, Select-Menu, Buttons ---
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    // Admin-Panel-Login und -Interaktionen laufen immer weiter, auch wenn der
    // Bot global pausiert ist – sonst könnte man ihn im pausierten Zustand
    // nicht mehr über das Panel reaktivieren.
    const isAdminPanelInteraction = interaction.customId?.startsWith('admin-')
      || interaction.customId === 'admin-panel-auth';

    if (botState.isPaused() && !isAdminPanelInteraction) {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: 'Der Bot ist gerade global deaktiviert (Wartungsmodus).', ephemeral: true }).catch(() => {});
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'admin-panel-auth') {
      await adminPanel.handleAdminAuthModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('verify-captcha:')) {
      await verification.handleCaptchaModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket-feedback-modal:')) {
      await ticketing.handleFeedbackModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'admin-owner-add-modal') {
      await adminPanel.handleAdminOwnerAddModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('admin-nickname-modal:')) {
      await adminPanel.handleAdminNicknameModalSubmit(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'admin-profile-modal') {
      await adminPanel.handleAdminProfileModalSubmit(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('office-select:')) {
      await interactions.handleOfficeSelect(interaction, client);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('admin-server-select:')) {
      await adminPanel.handleAdminServerSelect(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket-select:')) {
      await ticketing.handleTicketSelect(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('verify:')) {
        await verification.handleVerifyButtonClick(interaction);
      } else if (interaction.customId.startsWith('support-claim:')) {
        await support.handleClaimButtonClick(interaction);
      } else if (interaction.customId.startsWith('support-close:')) {
        await support.handleSupportCloseButtonClick(interaction);
      } else if (interaction.customId.startsWith('ticket-close:')) {
        await ticketing.handleTicketClose(interaction);
      } else if (interaction.customId.startsWith('ticket-page:')) {
        await ticketing.handleTicketPage(interaction);
      } else if (interaction.customId.startsWith('ticket-star:')) {
        await ticketing.handleFeedbackStarClick(interaction);
      } else if (interaction.customId.startsWith('backup-confirm:')) {
        await handleBackupConfirm(interaction);
      } else if (interaction.customId === 'backup-cancel') {
        await interaction.update({ content: 'Wiederherstellung abgebrochen. Es wurde nichts verändert.', embeds: [], components: [] });
      } else if (interaction.customId.startsWith('office-page:')) {
        await interactions.handleOfficePage(interaction, client);
      } else if (interaction.customId.startsWith('accept:')) {
        await interactions.handleAccept(interaction, client);
      } else if (interaction.customId.startsWith('decline:')) {
        await interactions.handleDecline(interaction, client);
      } else if (interaction.customId.startsWith('close:')) {
        await interactions.handleClose(interaction, client);
      } else if (interaction.customId.startsWith('admin-page:')) {
        await adminPanel.handleAdminPage(interaction);
      } else if (interaction.customId.startsWith('admin-back:')) {
        await adminPanel.handleAdminBack(interaction);
      } else if (interaction.customId.startsWith('admin-lock-toggle:')) {
        await adminPanel.handleAdminLockToggle(interaction);
      } else if (interaction.customId.startsWith('admin-nickname-btn:')) {
        await adminPanel.handleAdminNicknameButton(interaction);
      } else if (interaction.customId === 'admin-profile-btn') {
        await adminPanel.handleAdminProfileButton(interaction);
      } else if (interaction.customId === 'admin-owners:view') {
        await adminPanel.handleAdminOwnersView(interaction);
      } else if (interaction.customId === 'admin-owner-add-btn') {
        await adminPanel.handleAdminOwnerAddButton(interaction);
      } else if (interaction.customId.startsWith('admin-owner-remove:')) {
        await adminPanel.handleAdminOwnerRemove(interaction);
      }
    }
  } catch (err) {
    console.error('Fehler bei Interaktion:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Es ist ein Fehler aufgetreten.', ephemeral: true }).catch(() => {});
    }
  }
});

async function handleBackupConfirm(interaction) {
  const [, code] = interaction.customId.split(':');
  const backupRecord = backupStore.getBackup(code);
  if (!backupRecord) {
    await interaction.update({ content: 'Dieses Backup wurde nicht mehr gefunden.', embeds: [], components: [] });
    return;
  }

  if (backup.restoringGuilds.has(interaction.guild.id)) {
    await interaction.update({ content: 'Für diesen Server läuft bereits eine Wiederherstellung.', embeds: [], components: [] });
    return;
  }

  backup.restoringGuilds.add(interaction.guild.id);
  await interaction.update({ content: '⏳ Wiederherstellung läuft ... das kann je nach Servergröße einige Minuten dauern. Bitte warten.', embeds: [], components: [] });

  try {
    await backup.restoreBackup(interaction.guild, backupRecord, async (status) => {
      await interaction.editReply({ content: `⏳ ${status}` }).catch(() => {});
    });
    await interaction.editReply({ content: '✅ Wiederherstellung abgeschlossen.' });
  } catch (err) {
    await interaction.editReply({ content: `❌ Fehler bei der Wiederherstellung: ${err.message}` }).catch(() => {});
  } finally {
    backup.restoringGuilds.delete(interaction.guild.id);
  }
}

// Prüft alle 30 Minuten, ob für einen Server ein automatisches Backup fällig ist.
setInterval(async () => {
  for (const guild of client.guilds.cache.values()) {
    const guildConfig = guildStore.getGuild(guild.id);
    if (!guildConfig.backup.autoEnabled) continue;
    const intervalMs = (guildConfig.backup.intervalHours || 24) * 60 * 60 * 1000;
    const lastBackupAt = guildConfig.backup.lastBackupAt || 0;
    if (Date.now() - lastBackupAt >= intervalMs) {
      try {
        await backup.createBackup(guild);
        console.log(`[Backup] Automatisches Backup für Guild ${guild.id} (${guild.name}) erstellt.`);
      } catch (err) {
        console.error(`[Backup] Automatisches Backup für Guild ${guild.id} fehlgeschlagen:`, err.message);
      }
    }
  }
}, 30 * 60 * 1000);

client.login(config.token).catch((err) => {
  console.error('\n❌ Login bei Discord fehlgeschlagen:', err.message);
  if (err.message?.includes('TOKEN_INVALID') || err.message?.toLowerCase().includes('token')) {
    console.error(
      '   -> Der DISCORD_TOKEN in deiner .env ist vermutlich falsch oder abgelaufen.\n' +
      '   -> Im Discord Developer Portal unter "Bot" ein neues Token erzeugen ("Reset Token") und in .env eintragen.'
    );
  }
  console.error('   -> Danach "npm run diagnose" ausführen, um Token und Command-Registrierung zu prüfen.\n');
  process.exit(1);
});
