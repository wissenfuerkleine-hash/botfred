const {
  joinVoiceChannel,
  createAudioPlayer,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const { createResource } = require('./musicSource');
const { getOrCreateGuildConfig } = require('./config');
const { formatText } = require('./textUtils');
const { getState } = require('./state');

async function startMusic(guildId) {
  const state = getState(guildId);
  if (!state.connection) return;
  const cfg = getOrCreateGuildConfig(guildId);

  if (state.player) {
    state.player.stop(true);
  }

  const player = createAudioPlayer();
  state.player = player;
  state.connection.subscribe(player);

  const volume = (cfg.volume ?? 50) / 100;

  async function playOnce() {
    try {
      const resource = await createResource(cfg);
      if (resource.volume) resource.volume.setVolume(volume);
      player.play(resource);
    } catch (e) {
      console.error('[Music] playOnce error:', e.message);
    }
  }

  player.on(AudioPlayerStatus.Idle, () => {
    setTimeout(playOnce, 500);
  });

  player.on('error', (err) => {
    console.error('[Music] Player error:', err.message);
    setTimeout(playOnce, 2000);
  });

  await playOnce();
}

async function handleUserJoined(client, guild, member, cfg) {
  const guildId = guild.id;
  const state = getState(guildId);

  // Join voice if not already connected
  if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
    const connection = joinVoiceChannel({
      channelId: cfg.waitingRoomId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        connection.destroy();
        state.connection = null;
        state.player = null;
      }
    });

    state.connection = connection;
    await startMusic(guildId);
  }

  const userId = member.id;
  if (state.sessions.has(userId)) return;

  // Lazy-require to avoid circular dependency
  const { buildOfficeSelectMessage } = require('./officeSelectUI');

  try {
    const dmChannel = await member.createDM();
    const dmText = formatText(cfg.dmText || 'Hallo {user}, bitte wähle ein Büro:', {
      user: member.displayName,
      server: guild.name,
    });

    const { components } = buildOfficeSelectMessage(guild, cfg, 0);
    const msg = await dmChannel.send({ content: dmText, components });

    state.sessions.set(userId, {
      requestMessageId: null,
      requestChannelId: cfg.requestChannelId,
      officeChannelId: null,
      acceptedBy: null,
      startTime: Date.now(),
      dmMessageId: msg.id,
      dmChannelId: dmChannel.id,
      page: 0,
    });
  } catch (e) {
    console.error('[Bot] DM fehlgeschlagen:', e.message);
  }
}

function leaveWaitingRoom(guildId) {
  const state = getState(guildId);
  if (state.player) { state.player.stop(true); state.player = null; }
  const conn = getVoiceConnection(guildId);
  if (conn) conn.destroy();
  state.connection = null;
}

function getSession(guildId, userId) {
  return getState(guildId).sessions.get(userId);
}

function setSession(guildId, userId, data) {
  getState(guildId).sessions.set(userId, data);
}

function deleteSession(guildId, userId) {
  getState(guildId).sessions.delete(userId);
}

module.exports = {
  handleUserJoined,
  leaveWaitingRoom,
  startMusic,
  getSession,
  setSession,
  deleteSession,
};
