// Shared in-memory state – kein circular dependency
// guildId -> { connection, player, sessions: Map<userId, sessionData> }
const guildState = new Map();

function getState(guildId) {
  if (!guildState.has(guildId)) {
    guildState.set(guildId, { connection: null, player: null, sessions: new Map() });
  }
  return guildState.get(guildId);
}

function getBusyOfficeIds(guildId) {
  const sessions = getState(guildId).sessions;
  const busy = new Set();
  for (const s of sessions.values()) {
    if (s.officeChannelId && s.acceptedBy) busy.add(s.officeChannelId);
  }
  return busy;
}

module.exports = { getState, getBusyOfficeIds };
