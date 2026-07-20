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
  if (!guildConfig.waitingRoomChannelId) return; // Server hat noch keinen Warteraum konfiguriert

  const joinedWaitingRoom = newState.channelId === guildConfig.waitingRoomChannelId && oldState.channelId !== newState.channelId;
  const leftWaitingRoom = oldState.channelId === guildConfig.waitingRoomChannelId && newState.channelId !== oldState.channelId;

  if (joinedWaitingRoom && !newState.member.user.bot) {
    await onUserJoinedWaitingRoom(newState);
  }

  if (leftWaitingRoom || joinedWaitingRoom) {
    await maybeLeaveEmptyWaitingRoom(newState.guild, guildConfig.waitingRoomChannelId);
  }
});

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

    if (interaction.isModalSubmit() && interaction.customId === 'admin-owner-add-modal') {
      await adminPanel.handleAdminOwnerAddModalSubmit(interaction);
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

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('office-page:')) {
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

client.login(config.token);
