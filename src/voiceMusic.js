const {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const guildStore = require('./guildStore');
const { resolveAudioResource, resolveSupportAudioResource } = require('./musicSource');

// Pro Server (guildId) merken wir uns Connection + Player + aktuelle Resource,
// damit mehrere Server gleichzeitig unabhaengig voneinander Wartemusik
// abspielen koennen und die Lautstaerke live (ohne Neustart) aenderbar ist.
// WICHTIG: Discord erlaubt pro Server nur EINE Voice-Verbindung gleichzeitig -
// wenn z.B. Buero- und Support-Warteraum gleichzeitig aktiv waeren, gewinnt,
// wer zuerst da war; der jeweils andere Warteraum bekommt trotzdem ganz normal
// seine Benachrichtigungen/Movement, nur eben ohne Musik dazu.
const sessions = new Map(); // guildId -> { connection, player, currentResource, resolveResource }

async function playLoop(guildId, player) {
  const session = sessions.get(guildId);
  if (!session) return;
  try {
    const guildConfig = guildStore.getGuild(guildId);
    const resource = await session.resolveResource(guildConfig);
    session.currentResource = resource;
    player.play(resource);
  } catch (err) {
    console.error(`[Musik] Konnte Musikquelle fuer Guild ${guildId} nicht laden:`, err.message);
  }
}

// resolveResource: async (guildConfig) => AudioResource - je nach Warteraum
// (Buero vs. Support) wird eine andere Quelle aufgeloest.
async function joinWaitingRoom(voiceChannel, resolveResource = resolveAudioResource) {
  const guildId = voiceChannel.guild.id;
  if (sessions.has(guildId)) {
    return; // Bot ist bereits in diesem Server in einem Voice-Channel
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    // Musik/Stream ist zu Ende -> von vorne (Loop). Wird neu aufgeloest,
    // damit zwischenzeitliche Aenderungen (Lautstaerke, neue Quelle) greifen.
    playLoop(guildId, player);
  });

  player.on('error', (err) => {
    console.error(`[Musik] Fehler im Player (Guild ${guildId}):`, err.message);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch (err) {
    console.error(`[Voice] Verbindung fuer Guild ${guildId} nicht bereit geworden:`, err.message);
    connection.destroy();
    return;
  }

  sessions.set(guildId, { connection, player, currentResource: null, resolveResource });
  await playLoop(guildId, player);
}

function leaveWaitingRoom(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;
  session.player.stop();
  session.connection.destroy();
  sessions.delete(guildId);
}

function isBotConnected(guildId) {
  return sessions.has(guildId);
}

// Ist der Bot gerade in GENAU diesem Voice-Channel (nicht nur irgendeinem im Server)?
function isBotInChannel(guildId, channelId) {
  const session = sessions.get(guildId);
  return session?.connection?.joinConfig?.channelId === channelId;
}

// Aendert die Lautstaerke sofort, wenn der Bot gerade in diesem Server spielt
// (ohne auf das Ende des aktuellen Tracks zu warten).
function setVolumeLive(guildId, volumePercent) {
  const session = sessions.get(guildId);
  if (session?.currentResource?.volume) {
    session.currentResource.volume.setVolume(volumePercent / 100);
  }
}

module.exports = {
  joinWaitingRoom,
  leaveWaitingRoom,
  isBotConnected,
  isBotInChannel,
  setVolumeLive,
};
