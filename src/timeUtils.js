// Prüft, ob "jetzt" (in der angegebenen Zeitzone) zwischen start und end liegt.
// start/end im Format "HH:MM". Unterstützt auch über-Mitternacht-Zeiträume
// (z. B. start=22:00, end=06:00).
function isWithinOpeningHours(openingHours) {
  if (!openingHours || !openingHours.enabled) return true; // Öffnungszeiten deaktiviert = immer offen

  const { start, end, timezone } = openingHours;
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: timezone || 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const nowMinutes = parseInt(hour, 10) * 60 + parseInt(minute, 10);

  const [startH, startM] = start.split(':').map((n) => parseInt(n, 10));
  const [endH, endM] = end.split(':').map((n) => parseInt(n, 10));
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes === endMinutes) return true; // 24h geöffnet

  if (startMinutes < endMinutes) {
    // normaler Zeitraum, z. B. 09:00 - 18:00
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // Zeitraum geht über Mitternacht, z. B. 22:00 - 06:00
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

module.exports = { isWithinOpeningHours };
