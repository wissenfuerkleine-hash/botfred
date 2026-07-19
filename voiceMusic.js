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
const { buildOfficeSelectMessage } = require('./officeSelectUI');

// guildId -> { connection, player, sessions: Map<userId, sessionData> }
const guildState = new Map();

function getState(guildId) {
  if (!guildState.has(guildId)) {
    guildState.set(guildId, { connection: null, player: null, sessions: new Map() });
  }
  return guildState.get(guildId);
}

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

  // Send DM with office selection
  const userId = member.id;
  if (state.sessions.has(userId)) return; // already in session

  try {
    const dmChannel = await member.createDM();
    const { content, components } = buildOfficeSelectMessage(guild, cfg, 0);
    const dmText = formatText(cfg.dmText || 'Hallo {user}, bitte wähle ein Büro:', {
      user: member.displayName,
      server: guild.name,
    });

    const msg = await dmChannel.send({ content: dmText + '\n\u200B', components });
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
    console.error('[Bot] DM failed:', e.message);
  }
}

function leaveWaitingRoom(guildId) {
  const state = getState(guildId);
  if (state.player) { state.player.stop(true); state.player = null; }
  const conn = getVoiceConnection(guildId);
  if (conn) conn.destroy();
  state.connection = null;
}

function setVolume(guildId, percent) {
  const state = getState(guildId);
  if (state.player) {
    // Re-start music to apply volume via new resource
    const cfg = getOrCreateGuildConfig(guildId);
    cfg.volume = percent;
    startMusic(guildId);
  }
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

function getAllSessions(guildId) {
  return getState(guildId).sessions;
}

function getBusyOfficeIds(guildId) {
  const sessions = getState(guildId).sessions;
  const busy = new Set();
  for (const s of sessions.values()) {
    if (s.officeChannelId && s.acceptedBy) busy.add(s.officeChannelId);
  }
  return busy;
}

module.exports = {
  handleUserJoined,
  leaveWaitingRoom,
  setVolume,
  startMusic,
  getSession,
  setSession,
  deleteSession,
  getAllSessions,
  getBusyOfficeIds,
};
