const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { getOrCreateGuildConfig, updateGuildConfig } = require('./config');
const { buildOfficeSelectMessage } = require('./officeSelectUI');
const { getSession, setSession, deleteSession, getAllSessions, leaveWaitingRoom } = require('./voiceMusic');
const { formatText } = require('./textUtils');
const { formatDuration } = require('./timeUtils');
const adminPanel = require('./adminPanel');

async function handle(interaction, client) {
  try {
    if (interaction.isChatInputCommand()) return handleCommand(interaction, client);
    if (interaction.isStringSelectMenu()) return handleSelect(interaction, client);
    if (interaction.isButton()) return handleButton(interaction, client);
    if (interaction.isModalSubmit()) return handleModal(interaction, client);
  } catch (e) {
    console.error('[Interactions] Error:', e);
    const reply = { content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(reply).catch(() => {});
    else interaction.reply(reply).catch(() => {});
  }
}

// ─── COMMANDS ────────────────────────────────────────────────────────────────

async function handleCommand(interaction, client) {
  const { commandName, guildId } = interaction;

  if (!guildId && commandName !== 'admin-panel') {
    return interaction.reply({ content: 'Dieser Befehl ist nur auf Servern verfügbar.', ephemeral: true });
  }

  switch (commandName) {
    case 'setup-warteraum': return cmdSetupWarteraum(interaction);
    case 'setup-anfragekanal': return cmdSetupAnfragekanal(interaction);
    case 'buero': return cmdBuero(interaction);
    case 'settings': return cmdSettings(interaction, client);
    case 'status': return cmdStatus(interaction);
    case 'admin-panel': return adminPanel.handleAdminPanel(interaction, client);
  }
}

async function cmdSetupWarteraum(interaction) {
  const channel = interaction.options.getChannel('channel');
  const channelId = channel?.id || interaction.options.getString('channel_id');
  if (!channelId) return interaction.reply({ content: '❌ Bitte Channel oder Channel-ID angeben.', ephemeral: true });
  updateGuildConfig(interaction.guildId, { waitingRoomId: channelId });
  return interaction.reply({ content: `✅ Warteraum gesetzt: <#${channelId}>`, ephemeral: true });
}

async function cmdSetupAnfragekanal(interaction) {
  const channel = interaction.options.getChannel('channel');
  const channelId = channel?.id || interaction.options.getString('channel_id');
  if (!channelId) return interaction.reply({ content: '❌ Bitte Channel oder Channel-ID angeben.', ephemeral: true });
  updateGuildConfig(interaction.guildId, { requestChannelId: channelId });
  return interaction.reply({ content: `✅ Anfrage-Kanal gesetzt: <#${channelId}>`, ephemeral: true });
}

async function cmdBuero(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = getOrCreateGuildConfig(interaction.guildId);

  if (sub === 'list') {
    if (!cfg.offices.length) return interaction.reply({ content: 'Keine Büros konfiguriert.', ephemeral: true });
    const list = cfg.offices.map((o, i) => `${i + 1}. ${o.emoji || '🏢'} **${o.name}** – <#${o.channelId}>`).join('\n');
    return interaction.reply({ content: `**Büros (${cfg.offices.length}):**\n${list}`, ephemeral: true });
  }

  if (sub === 'add' || sub === 'add-id') {
    const name = interaction.options.getString('name');
    const emoji = interaction.options.getString('emoji') || '🏢';
    const channel = interaction.options.getChannel('channel');
    const channelId = channel?.id || interaction.options.getString('channel_id');
    if (!channelId) return interaction.reply({ content: '❌ Channel angeben.', ephemeral: true });
    if (cfg.offices.find(o => o.channelId === channelId)) {
      return interaction.reply({ content: '❌ Dieses Büro ist bereits eingetragen.', ephemeral: true });
    }
    cfg.offices.push({ name, channelId, emoji });
    updateGuildConfig(interaction.guildId, { offices: cfg.offices });
    return interaction.reply({ content: `✅ Büro **${name}** (${emoji}) hinzugefügt.`, ephemeral: true });
  }

  if (sub === 'remove' || sub === 'remove-id') {
    const channel = interaction.options.getChannel('channel');
    const channelId = channel?.id || interaction.options.getString('channel_id');
    if (!channelId) return interaction.reply({ content: '❌ Channel angeben.', ephemeral: true });
    const before = cfg.offices.length;
    cfg.offices = cfg.offices.filter(o => o.channelId !== channelId);
    if (cfg.offices.length === before) return interaction.reply({ content: '❌ Büro nicht gefunden.', ephemeral: true });
    updateGuildConfig(interaction.guildId, { offices: cfg.offices });
    return interaction.reply({ content: `✅ Büro entfernt.`, ephemeral: true });
  }
}

async function cmdSettings(interaction, client) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'dm-text') {
    const text = interaction.options.getString('text');
    updateGuildConfig(guildId, { dmText: text });
    return interaction.reply({ content: `✅ DM-Text gesetzt.`, ephemeral: true });
  }
  if (sub === 'closed-text') {
    const text = interaction.options.getString('text');
    updateGuildConfig(guildId, { closedText: text });
    return interaction.reply({ content: `✅ Geschlossen-Text gesetzt.`, ephemeral: true });
  }
  if (sub === 'musik-datei') {
    const url = interaction.options.getString('url');
    updateGuildConfig(guildId, { musicSource: { type: 'url', url } });
    return interaction.reply({ content: `✅ Musik-Datei gesetzt.`, ephemeral: true });
  }
  if (sub === 'musik-youtube') {
    const url = interaction.options.getString('url');
    updateGuildConfig(guildId, { musicSource: { type: 'youtube', url } });
    return interaction.reply({ content: `✅ YouTube-Musik gesetzt.`, ephemeral: true });
  }
  if (sub === 'musik-spotify') {
    const url = interaction.options.getString('link');
    updateGuildConfig(guildId, { musicSource: { type: 'spotify', url } });
    return interaction.reply({ content: `✅ Spotify-Musik gesetzt.`, ephemeral: true });
  }
  if (sub === 'lautstaerke') {
    const pct = interaction.options.getInteger('prozent');
    updateGuildConfig(guildId, { volume: pct });
    const { startMusic } = require('./voiceMusic');
    await startMusic(guildId);
    return interaction.reply({ content: `✅ Lautstärke auf **${pct}%** gesetzt.`, ephemeral: true });
  }
  if (sub === 'oeffnungszeiten') {
    const active = interaction.options.getBoolean('aktiv');
    const start = interaction.options.getString('start') || '09:00';
    const end = interaction.options.getString('ende') || '18:00';
    const tz = interaction.options.getString('zeitzone') || 'Europe/Berlin';
    updateGuildConfig(guildId, { openingHours: { active, start, end, timezone: tz } });
    return interaction.reply({ content: `✅ Öffnungszeiten ${active ? 'aktiviert' : 'deaktiviert'}: ${start}–${end} (${tz})`, ephemeral: true });
  }
}

async function cmdStatus(interaction) {
  const cfg = getOrCreateGuildConfig(interaction.guildId);
  const src = cfg.musicSource || {};
  const musikInfo = src.type === 'youtube' ? `YouTube: ${src.url}` :
    src.type === 'spotify' ? `Spotify: ${src.url}` :
    src.type === 'url' ? `URL: ${src.url}` : `Lokale Datei`;
  const oh = cfg.openingHours || {};

  const embed = new EmbedBuilder()
    .setTitle(`📋 Status: ${interaction.guild.name}`)
    .addFields(
      { name: 'Warteraum', value: cfg.waitingRoomId ? `<#${cfg.waitingRoomId}>` : '❌ Nicht gesetzt', inline: true },
      { name: 'Anfrage-Kanal', value: cfg.requestChannelId ? `<#${cfg.requestChannelId}>` : '❌ Nicht gesetzt', inline: true },
      { name: 'Büros', value: `${cfg.offices.length}`, inline: true },
      { name: 'Musik', value: musikInfo, inline: false },
      { name: 'Lautstärke', value: `${cfg.volume ?? 50}%`, inline: true },
      { name: 'Öffnungszeiten', value: oh.active ? `${oh.start}–${oh.end} (${oh.timezone})` : 'Deaktiviert', inline: true },
      { name: 'DM-Text', value: (cfg.dmText || '').slice(0, 200) || '–', inline: false },
    )
    .setColor(0x5865F2);

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ─── SELECT MENUS ────────────────────────────────────────────────────────────

async function handleSelect(interaction, client) {
  const { customId } = interaction;

  if (customId.startsWith('office_select_')) {
    return handleOfficeSelect(interaction, client);
  }
  if (customId === 'admin_guild_select') {
    return adminPanel.handleGuildSelect(interaction, client);
  }
  if (customId === 'admin_remove_owner_select') {
    return adminPanel.handleRemoveOwnerSelect(interaction);
  }
}

async function handleOfficeSelect(interaction, client) {
  const value = interaction.values[0];
  if (value === 'none') return interaction.deferUpdate();

  // value format: office_{guildId}_{index}
  const parts = value.split('_');
  const guildId = parts[1];
  const officeIndex = parseInt(parts[2]);

  const cfg = getOrCreateGuildConfig(guildId);
  const office = cfg.offices[officeIndex];
  if (!office) return interaction.reply({ content: '❌ Büro nicht gefunden.', ephemeral: true });

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: '❌ Server nicht gefunden.', ephemeral: true });

  const userId = interaction.user.id;
  const session = getSession(guildId, userId);
  if (!session) {
    return interaction.update({ content: 'Session abgelaufen. Bitte erneut dem Warteraum beitreten.', components: [] });
  }

  // Update session
  session.officeChannelId = office.channelId;
  session.officeIndex = officeIndex;
  setSession(guildId, userId, session);

  // Disable select in DM
  await interaction.update({ content: `✅ Du hast **${office.emoji || '🏢'} ${office.name}** gewählt. Warte auf Bestätigung...`, components: [] });

  // Post request in request channel
  if (!cfg.requestChannelId) return;
  const requestChannel = guild.channels.cache.get(cfg.requestChannelId);
  if (!requestChannel) return;

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  const displayName = member?.displayName || interaction.user.username;

  const embed = new EmbedBuilder()
    .setTitle('📥 Neue Büro-Anfrage')
    .setDescription(`**${displayName}** möchte **${office.emoji || '🏢'} ${office.name}** betreten.`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: 'Nutzer', value: `<@${userId}>`, inline: true },
      { name: 'Büro', value: `<#${office.channelId}>`, inline: true },
    )
    .setColor(0xFEE75C)
    .setTimestamp();

  const acceptBtn = new ButtonBuilder()
    .setCustomId(`accept_${guildId}_${userId}`)
    .setLabel('✅ Annehmen')
    .setStyle(ButtonStyle.Success);

  const rejectBtn = new ButtonBuilder()
    .setCustomId(`reject_${guildId}_${userId}`)
    .setLabel('❌ Ablehnen')
    .setStyle(ButtonStyle.Danger);

  const msg = await requestChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(acceptBtn, rejectBtn)] });

  session.requestMessageId = msg.id;
  session.requestChannelId = requestChannel.id;
  setSession(guildId, userId, session);
}

// ─── BUTTONS ────────────────────────────────────────────────────────────────

async function handleButton(interaction, client) {
  const { customId } = interaction;

  if (customId.startsWith('office_page_')) {
    return handleOfficePage(interaction, client);
  }
  if (customId.startsWith('accept_')) {
    const [, guildId, userId] = customId.split('_');
    return handleAccept(interaction, client, guildId, userId);
  }
  if (customId.startsWith('reject_')) {
    const [, guildId, userId] = customId.split('_');
    return handleReject(interaction, client, guildId, userId);
  }
  if (customId.startsWith('close_case_')) {
    const parts = customId.split('_');
    const guildId = parts[2];
    const userId = parts[3];
    return handleCloseCase(interaction, client, guildId, userId);
  }
  if (customId === 'admin_back_to_list') {
    return adminPanel.showGuildList(interaction, client);
  }
  if (customId.startsWith('admin_toggle_')) {
    const guildId = customId.replace('admin_toggle_', '');
    return adminPanel.handleToggleGuild(interaction, client, guildId);
  }
  if (customId === 'admin_manage_owners') {
    return adminPanel.handleManageOwners(interaction);
  }
  if (customId === 'admin_add_owner') {
    return adminPanel.handleAddOwner(interaction);
  }
  if (customId === 'page_info_noop') {
    return interaction.deferUpdate();
  }
}

async function handleOfficePage(interaction, client) {
  // customId: office_page_{guildId}_{page}
  const parts = interaction.customId.split('_');
  const guildId = parts[2];
  const page = parseInt(parts[3]);
  if (isNaN(page) || page < 0) return interaction.deferUpdate();

  const cfg = getOrCreateGuildConfig(guildId);
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.deferUpdate();

  const { content, components } = buildOfficeSelectMessage(guild, cfg, page);

  const session = getSession(guildId, interaction.user.id);
  if (session) { session.page = page; setSession(guildId, interaction.user.id, session); }

  return interaction.update({ content: content || undefined, components });
}

async function handleAccept(interaction, client, guildId, userId) {
  if (!interaction.member.permissions.has('MoveMembers')) {
    return interaction.reply({ content: '❌ Du hast keine Berechtigung zum Verschieben.', ephemeral: true });
  }

  const session = getSession(guildId, userId);
  if (!session) return interaction.reply({ content: '❌ Session nicht gefunden (abgelaufen?).', ephemeral: true });

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: '❌ Server nicht gefunden.', ephemeral: true });

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);

  // Move member to office
  try {
    if (member?.voice?.channelId) {
      await member.voice.setChannel(session.officeChannelId);
    }
  } catch (e) {
    console.error('[Accept] Move failed:', e.message);
  }

  // Grant channel permission
  try {
    const officeChannel = guild.channels.cache.get(session.officeChannelId);
    if (officeChannel) {
      await officeChannel.permissionOverwrites.edit(userId, { ViewChannel: true, Connect: true });
    }
  } catch (e) {
    console.error('[Accept] Permission grant failed:', e.message);
  }

  session.acceptedBy = interaction.user.id;
  setSession(guildId, userId, session);

  // Update request message
  const cfg = getOrCreateGuildConfig(guildId);
  const office = cfg.offices.find(o => o.channelId === session.officeChannelId);

  const embed = new EmbedBuilder()
    .setTitle('✅ Anfrage angenommen')
    .setDescription(`<@${userId}> wurde von <@${interaction.user.id}> in **${office?.emoji || '🏢'} ${office?.name || 'Büro'}** verschoben.`)
    .setColor(0x57F287)
    .setTimestamp();

  const closeBtn = new ButtonBuilder()
    .setCustomId(`close_case_${guildId}_${userId}`)
    .setLabel('🔒 Fall schließen')
    .setStyle(ButtonStyle.Secondary);

  await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
}

async function handleReject(interaction, client, guildId, userId) {
  const session = getSession(guildId, userId);
  const cfg = getOrCreateGuildConfig(guildId);
  const office = cfg.offices.find(o => o.channelId === session?.officeChannelId);

  const embed = new EmbedBuilder()
    .setTitle('❌ Anfrage abgelehnt')
    .setDescription(`Die Anfrage von <@${userId}> für **${office?.emoji || '🏢'} ${office?.name || 'Büro'}** wurde von <@${interaction.user.id}> abgelehnt.`)
    .setColor(0xED4245)
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });

  // Notify user via DM
  try {
    const guild = client.guilds.cache.get(guildId);
    const member = guild?.members.cache.get(userId) || await guild?.members.fetch(userId).catch(() => null);
    if (member) await member.send('❌ Deine Büro-Anfrage wurde abgelehnt.');
  } catch {}

  deleteSession(guildId, userId);
}

async function handleCloseCase(interaction, client, guildId, userId) {
  const session = getSession(guildId, userId);
  if (!session) return interaction.reply({ content: '❌ Fall bereits geschlossen.', ephemeral: true });

  const duration = formatDuration(Date.now() - session.startTime);
  const cfg = getOrCreateGuildConfig(guildId);
  const office = cfg.offices.find(o => o.channelId === session.officeChannelId);
  const guild = client.guilds.cache.get(guildId);

  // Revoke channel permission + disconnect
  try {
    const officeChannel = guild?.channels.cache.get(session.officeChannelId);
    if (officeChannel) {
      await officeChannel.permissionOverwrites.delete(userId);
      const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      if (member?.voice?.channelId === session.officeChannelId) {
        await member.voice.disconnect();
      }
    }
  } catch (e) {
    console.error('[CloseCase] Error:', e.message);
  }

  const embed = new EmbedBuilder()
    .setTitle('🔒 Fall geschlossen')
    .addFields(
      { name: 'Nutzer', value: `<@${userId}>`, inline: true },
      { name: 'Büro', value: `${office?.emoji || '🏢'} ${office?.name || 'Büro'}`, inline: true },
      { name: 'Dauer', value: duration, inline: true },
      { name: 'Angenommen von', value: session.acceptedBy ? `<@${session.acceptedBy}>` : '–', inline: true },
      { name: 'Geschlossen von', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setColor(0x99AAB5)
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
  deleteSession(guildId, userId);
}

// ─── MODALS ──────────────────────────────────────────────────────────────────

async function handleModal(interaction, client) {
  const { customId } = interaction;
  if (customId === 'admin_login_modal') return adminPanel.handleAdminLoginModal(interaction, client);
  if (customId === 'admin_add_owner_modal') return adminPanel.handleAddOwnerModal(interaction, client);
}

module.exports = { handle };
