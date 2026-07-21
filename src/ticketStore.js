const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'ticketState.json');

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

function createTicket(channelId, data) {
  const all = loadAll();
  all[channelId] = { ...data, openedAt: Date.now() };
  saveAll(all);
}

function getTicket(channelId) {
  return loadAll()[channelId] || null;
}

function deleteTicket(channelId) {
  const all = loadAll();
  delete all[channelId];
  saveAll(all);
}

// Verhindert, dass ein Nutzer mehrere offene Tickets in derselben Kategorie hat
function hasOpenTicket(guildId, userId, categoryId) {
  const all = loadAll();
  return Object.values(all).some((t) => t.guildId === guildId && t.userId === userId && t.categoryTicketId === categoryId);
}

module.exports = { createTicket, getTicket, deleteTicket, hasOpenTicket };
