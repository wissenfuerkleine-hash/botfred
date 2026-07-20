const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'caseHistory.json');
const MAX_CASES_PER_GUILD = 500; // verhindert unbegrenztes Wachstum der Datei

function loadAll() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveAll(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

function createCase(guildId, caseId, data) {
  const all = loadAll();
  if (!all[guildId]) all[guildId] = [];
  all[guildId].push({ id: caseId, ...data });
  if (all[guildId].length > MAX_CASES_PER_GUILD) {
    all[guildId] = all[guildId].slice(-MAX_CASES_PER_GUILD);
  }
  saveAll(all);
}

function updateCase(guildId, caseId, patch) {
  const all = loadAll();
  const list = all[guildId] || [];
  const idx = list.findIndex((c) => c.id === caseId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  saveAll(all);
}

function getCases(guildId) {
  const all = loadAll();
  return all[guildId] || [];
}

function getOpenCases(guildId) {
  return getCases(guildId).filter((c) => c.status === 'pending' || c.status === 'accepted');
}

function getStats(guildId) {
  const cases = getCases(guildId);
  const closed = cases.filter((c) => c.status === 'closed' && typeof c.durationMinutes === 'number');
  const avgDurationMinutes = closed.length
    ? Math.round(closed.reduce((sum, c) => sum + c.durationMinutes, 0) / closed.length)
    : null;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const totalToday = cases.filter((c) => c.requestedAt >= todayStart.getTime()).length;

  return {
    openCount: getOpenCases(guildId).length,
    totalCases: cases.length,
    totalClosed: closed.length,
    avgDurationMinutes,
    totalToday,
  };
}

module.exports = { createCase, updateCase, getCases, getOpenCases, getStats };
