let currentGuildId = null;
let currentChannels = { voice: [], text: [] };
let isOwnerSession = false;

async function requireSession() {
  const res = await fetch('/api/session');
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = 'login.html';
    return null;
  }
  isOwnerSession = !!data.isOwner;
  return data;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = 'login.html';
    return null;
  }
  return res.json();
}

function fillSelect(select, items, { placeholder } = {}) {
  select.innerHTML = '';
  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    select.appendChild(opt);
  }
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    select.appendChild(opt);
  });
}

async function loadGuildList() {
  const guilds = await api('/api/guilds');
  const select = document.getElementById('guild-select');
  fillSelect(select, guilds);
  if (guilds.length > 0) {
    currentGuildId = guilds[0].id;
    select.value = currentGuildId;
    await loadGuild(currentGuildId);
  }
  select.addEventListener('change', async (e) => {
    currentGuildId = e.target.value;
    await loadGuild(currentGuildId);
  });
}

async function loadGuild(guildId) {
  const [channels, cfg] = await Promise.all([
    api(`/api/guilds/${guildId}/channels`),
    api(`/api/guilds/${guildId}/config`),
  ]);
  currentChannels = channels;

  fillSelect(document.getElementById('waitingRoomChannelId'), channels.voice, { placeholder: '– wählen –' });
  fillSelect(document.getElementById('requestChannelId'), channels.text, { placeholder: '– wählen –' });
  fillSelect(document.getElementById('new-office-channel'), channels.voice, { placeholder: '– Büro-Channel wählen –' });

  document.getElementById('waitingRoomChannelId').value = cfg.waitingRoomChannelId || '';
  document.getElementById('requestChannelId').value = cfg.requestChannelId || '';
  document.getElementById('dmMessage').value = cfg.dmMessage;
  document.getElementById('closedMessage').value = cfg.closedMessage;

  document.querySelectorAll('input[name="musicMode"]').forEach((r) => {
    r.checked = r.value === cfg.musicMode;
  });
  document.getElementById('musicSource').value = cfg.musicMode === 'local' ? '' : (cfg.musicSource || '');
  document.getElementById('volume').value = cfg.volume;
  document.getElementById('volume-value').textContent = `${cfg.volume}%`;

  document.getElementById('hoursEnabled').checked = cfg.openingHours.enabled;
  document.getElementById('hoursStart').value = cfg.openingHours.start;
  document.getElementById('hoursEnd').value = cfg.openingHours.end;
  document.getElementById('hoursTimezone').value = cfg.openingHours.timezone;

  renderOffices(cfg.offices, channels.voice);
  await loadCases(guildId);

  const nicknameData = await api(`/api/guilds/${guildId}/nickname`);
  document.getElementById('guildNickname').value = nicknameData?.nickname || '';
}

function timeAgo(ms) {
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const hours = Math.round(diffMin / 60);
  return `vor ${hours} Std.`;
}

const STATUS_LABELS = {
  pending: 'Wartet',
  accepted: 'Angenommen',
  closed: 'Geschlossen',
  declined: 'Abgelehnt',
};

async function loadCases(guildId) {
  const data = await api(`/api/guilds/${guildId}/cases`);
  if (!data) return;

  const tiles = document.getElementById('stat-tiles');
  tiles.innerHTML = `
    <div class="stat-tile"><div class="num">${data.stats.openCount}</div><div class="label">Offen</div></div>
    <div class="stat-tile"><div class="num">${data.stats.totalToday}</div><div class="label">Heute</div></div>
    <div class="stat-tile"><div class="num">${data.stats.avgDurationMinutes ?? '–'}</div><div class="label">Ø Minuten</div></div>
    <div class="stat-tile"><div class="num">${data.stats.totalClosed}</div><div class="label">Geschlossen gesamt</div></div>
  `;

  const openList = document.getElementById('open-cases-list');
  openList.innerHTML = data.open.length
    ? data.open.map((c) => `
        <div class="case-row">
          <span>${c.officeName} — ${c.userName || c.userId}</span>
          <span class="badge ${c.status}">${STATUS_LABELS[c.status] || c.status}</span>
          <span class="hint">${timeAgo(c.requestedAt)}</span>
        </div>`).join('')
    : '<div class="hint">Gerade keine offenen Fälle.</div>';

  const historyList = document.getElementById('case-history-list');
  historyList.innerHTML = data.history.length
    ? data.history.map((c) => `
        <div class="case-row">
          <span>${c.officeName} — ${c.userName || c.userId}</span>
          <span class="badge ${c.status}">${STATUS_LABELS[c.status] || c.status}</span>
          <span class="hint">${c.durationMinutes != null ? `${c.durationMinutes} Min.` : timeAgo(c.requestedAt)}</span>
        </div>`).join('')
    : '<div class="hint">Noch keine Fälle in der Historie.</div>';
}

// Live-Aktualisierung der Statistik alle 15 Sekunden
setInterval(() => {
  if (currentGuildId) loadCases(currentGuildId);
}, 15000);

function renderOffices(offices, voiceChannels) {
  const list = document.getElementById('office-list');
  list.innerHTML = '';
  if (offices.length === 0) {
    list.innerHTML = '<div class="hint">Noch keine Büros angelegt.</div>';
    return;
  }
  offices.forEach((office) => {
    const channelInfo = voiceChannels.find((c) => c.id === office.channelId);
    const occupied = channelInfo ? channelInfo.occupied : false;
    const div = document.createElement('div');
    div.className = 'office-item';
    div.innerHTML = `
      <span><span class="dot ${occupied ? 'busy' : 'free'}"></span>${office.name} <span class="hint mono" style="display:inline;">(${channelInfo ? channelInfo.name : office.channelId})</span></span>
      <button class="danger" data-remove="${office.channelId}">Entfernen</button>
    `;
    list.appendChild(div);
  });
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/guilds/${currentGuildId}/offices/${btn.dataset.remove}`, { method: 'DELETE' });
      await loadGuild(currentGuildId);
    });
  });
}

function flashStatus(id) {
  const el = document.getElementById(`status-${id}`);
  el.textContent = 'Gespeichert ✓';
  setTimeout(() => { el.textContent = ''; }, 2000);
}

document.getElementById('volume').addEventListener('input', (e) => {
  document.getElementById('volume-value').textContent = `${e.target.value}%`;
});

document.querySelectorAll('button[data-save]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const kind = btn.dataset.save;

    if (kind === 'nickname') {
      const nickname = document.getElementById('guildNickname').value.trim();
      const result = await api(`/api/guilds/${currentGuildId}/nickname`, { method: 'POST', body: JSON.stringify({ nickname }) });
      const statusEl = document.getElementById('status-nickname');
      if (result?.error) {
        statusEl.textContent = `Fehler: ${result.error}`;
        statusEl.style.color = 'var(--red)';
      } else {
        statusEl.textContent = 'Gespeichert ✓';
        statusEl.style.color = 'var(--green)';
      }
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
      return;
    }

    let body = {};

    if (kind === 'channels') {
      body = {
        waitingRoomChannelId: document.getElementById('waitingRoomChannelId').value || null,
        requestChannelId: document.getElementById('requestChannelId').value || null,
      };
    } else if (kind === 'messages') {
      body = {
        dmMessage: document.getElementById('dmMessage').value,
        closedMessage: document.getElementById('closedMessage').value,
      };
    } else if (kind === 'music') {
      const mode = document.querySelector('input[name="musicMode"]:checked')?.value || 'file-url';
      body = {
        musicMode: mode,
        musicSource: document.getElementById('musicSource').value,
        volume: parseInt(document.getElementById('volume').value, 10),
      };
    } else if (kind === 'hours') {
      body = {
        openingHours: {
          enabled: document.getElementById('hoursEnabled').checked,
          start: document.getElementById('hoursStart').value,
          end: document.getElementById('hoursEnd').value,
          timezone: document.getElementById('hoursTimezone').value,
        },
      };
    }

    await api(`/api/guilds/${currentGuildId}/config`, { method: 'POST', body: JSON.stringify(body) });
    flashStatus(kind);
  });
});

document.getElementById('add-office').addEventListener('click', async () => {
  const name = document.getElementById('new-office-name').value.trim();
  const channelId = document.getElementById('new-office-channel').value;
  if (!name || !channelId) return;
  await api(`/api/guilds/${currentGuildId}/offices`, { method: 'POST', body: JSON.stringify({ name, channelId }) });
  document.getElementById('new-office-name').value = '';
  await loadGuild(currentGuildId);
});

async function loadBotStatus() {
  const status = await api('/api/bot-status');
  if (!status) return;
  const btn = document.getElementById('pause-toggle');
  btn.textContent = status.paused ? '▶ Bot aktivieren' : '⏸ Bot pausieren';
  btn.dataset.paused = status.paused ? '1' : '0';
  document.getElementById('botUsername').value = status.username || '';
  document.getElementById('botAvatarUrl').value = status.avatarUrl || '';
  document.getElementById('botBannerUrl').value = status.bannerUrl || '';
}

document.getElementById('pause-toggle').addEventListener('click', async () => {
  const btn = document.getElementById('pause-toggle');
  const nextPaused = btn.dataset.paused !== '1';
  await api('/api/bot-status', { method: 'POST', body: JSON.stringify({ paused: nextPaused }) });
  await loadBotStatus();
});

document.getElementById('save-bot-profile').addEventListener('click', async () => {
  const username = document.getElementById('botUsername').value.trim();
  const avatarUrl = document.getElementById('botAvatarUrl').value.trim();
  const bannerUrl = document.getElementById('botBannerUrl').value.trim();
  const statusEl = document.getElementById('status-bot-profile');
  statusEl.textContent = 'Speichere...';
  const result = await api('/api/bot-profile', { method: 'POST', body: JSON.stringify({ username, avatarUrl, bannerUrl }) });
  if (result?.error) {
    statusEl.textContent = `Fehler: ${result.error}`;
    statusEl.style.color = 'var(--red)';
  } else {
    statusEl.textContent = 'Übernommen ✓';
    statusEl.style.color = 'var(--green)';
  }
  setTimeout(() => { statusEl.textContent = ''; }, 4000);
});

document.getElementById('logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = 'login.html';
});

(async function init() {
  const session = await requireSession();
  if (!session) return;

  const userLabel = document.getElementById('user-label');
  if (userLabel) userLabel.textContent = session.user.username;

  if (isOwnerSession) {
    await loadBotStatus();
  } else {
    // Bot-weite Einstellungen (Pause, Avatar/Name/Banner) sind nur für den Bot-Besitzer
    document.getElementById('pause-toggle').style.display = 'none';
    const botProfileCard = document.getElementById('bot-profile-card');
    if (botProfileCard) botProfileCard.style.display = 'none';
  }

  await loadGuildList();
})();
