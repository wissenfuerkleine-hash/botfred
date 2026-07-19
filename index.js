require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const interactions = require('./interactions');
const voiceMusic = require('./voiceMusic');
const { getOrCreateGuildConfig } = require('./config');
const { isOpen } = require('./timeUtils');
const { startDashboard } = require('./server');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', () => {
  console.log(`[Bot] Eingeloggt als ${client.user.tag}`);
  console.log(`[Bot] Aktiv auf ${client.guilds.cache.size} Server(n)`);
  startDashboard(client);
});

client.on('interactionCreate', (interaction) => {
  interactions.handle(interaction, client);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    await handleVoiceUpdate(oldState, newState);
  } catch (e) {
    console.error('[VoiceStateUpdate] Error:', e.message);
  }
});

async function handleVoiceUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;

  const cfg = getOrCreateGuildConfig(guild.id);
  if (!cfg.waitingRoomId) return;
  if (cfg.blocked) return;

  const userId = newState.member?.id || oldState.member?.id;
  const isBot = newState.member?.user.bot || oldState.member?.user.bot;
  if (isBot) return;

  const joinedWaiting = newState.channelId === cfg.waitingRoomId &&
    oldState.channelId !== cfg.waitingRoomId;

  const leftWaiting = oldState.channelId === cfg.waitingRoomId &&
    newState.channelId !== cfg.waitingRoomId;

  if (joinedWaiting) {
    // Check opening hours
    if (cfg.openingHours?.active && !isOpen(cfg.openingHours)) {
      try {
        const closedText = cfg.closedText || 'Wir haben derzeit geschlossen. Bitte versuche es später erneut.';
        await newState.member.send(closedText);
      } catch {}
      return;
    }

    await voiceMusic.handleUserJoined(client, guild, newState.member, cfg);
  }

  if (leftWaiting) {
    // Check if waiting room is now empty
    const waitingChannel = guild.channels.cache.get(cfg.waitingRoomId);
    if (waitingChannel) {
      const humans = waitingChannel.members.filter(m => !m.user.bot);
      if (humans.size === 0) {
        voiceMusic.leaveWaitingRoom(guild.id);
      }
    }
  }
}

client.on('error', (err) => console.error('[Client] Error:', err));

process.on('unhandledRejection', (err) => console.error('[Unhandled]', err));

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('[Bot] Login fehlgeschlagen:', err.message);
  process.exit(1);
});
