const prism = require('prism-media');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const playdl = require('play-dl');
const { getData: getSpotifyData } = require('spotify-url-info')(fetch);
const config = require('./config');

// prism-media sucht sonst nach einem global installierten "ffmpeg" im PATH.
// Wir zeigen stattdessen auf das mitgelieferte ffmpeg-static, damit kein
// separates System-FFmpeg installiert werden muss.
if (!process.env.FFMPEG_PATH) {
  process.env.FFMPEG_PATH = require('ffmpeg-static');
}

// Für 'local' (mitgelieferte Standard-Datei) und 'file-url' (eigener Link,
// z. B. ein hochgeladenes mp3 auf einem File-Host): FFmpeg kann sowohl
// lokale Pfade als auch HTTP(S)-URLs direkt als Input nehmen.
function resourceFromFfmpegInput(input, volume) {
  const ffmpeg = new prism.FFmpeg({
    args: [
      '-i', input,
      '-analyzeduration', '0',
      '-loglevel', '0',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
    ],
  });
  const resource = createAudioResource(ffmpeg, { inputType: StreamType.Raw, inlineVolume: true });
  resource.volume.setVolume(volume / 100);
  return resource;
}

async function resourceFromYoutube(url, volume) {
  const info = await playdl.stream(url);
  const resource = createAudioResource(info.stream, { inputType: info.type, inlineVolume: true });
  resource.volume.setVolume(volume / 100);
  return resource;
}

async function resourceFromSpotify(spotifyLink, volume) {
  // Spotify liefert keine Rohaudiodaten an Bots aus. Wir lesen nur Titel +
  // Interpret vom Link ab und suchen dann den passenden Song auf YouTube.
  const track = await getSpotifyData(spotifyLink);
  const title = track.title || track.name || '';
  const artist = track.artist || (Array.isArray(track.artists) ? track.artists.map((a) => a.name).join(' ') : '');
  const query = `${artist} ${title}`.trim() || spotifyLink;

  const results = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
  if (!results || results.length === 0) {
    throw new Error(`Kein passendes YouTube-Video für "${query}" gefunden.`);
  }
  return resourceFromYoutube(results[0].url, volume);
}

// Erstellt eine frische, abspielbare AudioResource passend zur Konfiguration
// des Servers. Wird bei jedem Loop-Durchlauf neu aufgerufen (Streams sind
// nur einmal abspielbar).
async function resolveAudioResource(guildConfig) {
  const { musicMode, musicSource, volume } = guildConfig;

  if (musicMode === 'file-url' && musicSource) {
    return resourceFromFfmpegInput(musicSource, volume);
  }
  if (musicMode === 'youtube' && musicSource) {
    return resourceFromYoutube(musicSource, volume);
  }
  if (musicMode === 'spotify' && musicSource) {
    return resourceFromSpotify(musicSource, volume);
  }
  // Fallback: lokale Standard-Datei aus .env (MUSIC_FILE)
  return resourceFromFfmpegInput(config.musicFile, volume);
}

module.exports = { resolveAudioResource };
