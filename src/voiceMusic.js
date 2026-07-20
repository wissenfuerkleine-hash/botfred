const {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const guildStore = require('./guildStore');
const { resolveAudioResource } = require('./musicSource');

// Pro Server (guildId) merken wir uns Connection + Player + aktuelle Resource,
// damit mehrere Server gleichzeitig unabhaengig voneinander Wartemusik
// abspielen koennen und die Lautstaerke live (ohne Neustart) aenderbar ist.
const sessions = new Map(); // guildId -> { connection, player, currentResource }

async function playLoop(guildId, player) {
  const guildConfig = guildStore.getGuild(guildId);
  try {
    const resource = await resolveAudioResource(guildConfig);
    const session = sessions.get(guildId);
    if (session) session.currentResource = resource;
    player.play(resource);
  } catch (err) {
    console.error(`[Musik] Konnte Musikquelle fuer Guild ${guildId} nicht laden:`, err.message);
  }
}

async function joinWaitingRoom(voiceChannel) {
  const guildId = voiceChannel.guild.id;
  if (sessions.has(guildId)) {
    return; // Bot ist bereits in diesem Server im Warteraum
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

  sessions.set(guildId, { connection, player, currentResource: null });
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
  setVolumeLive,
};
