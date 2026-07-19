function isOpen(openingHours) {
  if (!openingHours || !openingHours.active) return true;
  try {
    const tz = openingHours.timezone || 'Europe/Berlin';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    const minute = parseInt(parts.find(p => p.type === 'minute').value);
    const current = hour * 60 + minute;

    const [startH, startM] = openingHours.start.split(':').map(Number);
    const [endH, endM] = openingHours.end.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;

    return current >= start && current < end;
  } catch {
    return true;
  }
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  return `${minutes} Minute${minutes !== 1 ? 'n' : ''}`;
}

module.exports = { isOpen, formatDuration };
