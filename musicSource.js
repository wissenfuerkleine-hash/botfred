const { createAudioResource, StreamType } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

async function getSpotifyYoutubeUrl(spotifyUrl) {
  try {
    const { getData } = require('spotify-url-info')(require('node-fetch'));
    const data = await getData(spotifyUrl);
    const query = `${data.name} ${data.artists ? data.artists.map(a => a.name).join(' ') : ''}`;
    const play = require('play-dl');
    const results = await play.search(query, { limit: 1 });
    if (results.length > 0) return results[0].url;
  } catch (e) {
    console.error('[Music] Spotify lookup failed:', e.message);
  }
  return null;
}

async function createResource(guildCfg) {
  const src = guildCfg.musicSource || { type: 'file', url: null };

  if (src.type === 'youtube' && src.url) {
    try {
      const play = require('play-dl');
      const stream = await play.stream(src.url);
      return createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
    } catch (e) {
      console.error('[Music] YouTube stream failed:', e.message);
    }
  }

  if (src.type === 'spotify' && src.url) {
    try {
      const ytUrl = await getSpotifyYoutubeUrl(src.url);
      if (ytUrl) {
        const play = require('play-dl');
        const stream = await play.stream(ytUrl);
        return createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
      }
    } catch (e) {
      console.error('[Music] Spotify->YouTube stream failed:', e.message);
    }
  }

  if (src.type === 'url' && src.url) {
    try {
      const { Readable } = require('stream');
      const https = require('https');
      const http = require('http');
      const mod = src.url.startsWith('https') ? https : http;
      const stream = await new Promise((resolve, reject) => {
        mod.get(src.url, res => resolve(res)).on('error', reject);
      });
      return createAudioResource(stream, { inputType: StreamType.Arbitrary, inlineVolume: true });
    } catch (e) {
      console.error('[Music] URL stream failed:', e.message);
    }
  }

  // Default: local file
  const filePath = src.url || process.env.MUSIC_FILE || path.join(__dirname, 'assets', 'wait-music.mp3');
  if (fs.existsSync(filePath)) {
    return createAudioResource(fs.createReadStream(filePath), { inputType: StreamType.Arbitrary, inlineVolume: true });
  }

  // Fallback: silent stream (no music file)
  console.warn('[Music] No music file found, playing silence.');
  const { Readable } = require('stream');
  const silence = new Readable({ read() { this.push(Buffer.alloc(3840)); this.push(null); } });
  return createAudioResource(silence, { inputType: StreamType.Raw, inlineVolume: true });
}

module.exports = { createResource };
