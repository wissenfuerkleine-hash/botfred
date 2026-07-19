const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder,
} = require('discord.js');
const { isOwner, addDynamicOwner, removeDynamicOwner, getAllOwners, getStaticOwners } = require('./ownerStore');
const { getGuildConfig, updateGuildConfig, getAllConfigs } = require('./config');

// Sessions: userId -> { expiresAt }
const adminSessions = new Map();
const SESSION_DURATION = 15 * 60 * 1000;

function isLoggedIn(userId) {
  const s = adminSessions.get(userId);
  if (!s) return false;
  if (Date.now() > s.expiresAt) { adminSessions.delete(userId); return false; }
  return true;
}

function login(userId) {
  adminSessions.set(userId, { expiresAt: Date.now() + SESSION_DURATION });
}

async function handleAdminPanel(interaction, client) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: 'Unbekannter Befehl.', ephemeral: true });
  }

  if (!isLoggedIn(interaction.user.id)) {
    const modal = new ModalBuilder()
      .setCustomId('admin_login_modal')
      .setTitle('Admin-Panel Login');
    const input = new TextInputBuilder()
      .setCustomId('admin_password')
      .setLabel('Passwort')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('Passwort eingeben...');
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  return showGuildList(interaction, client);
}

async function handleAdminLoginModal(interaction, client) {
  const password = interaction.fields.getTextInputValue('admin_password');
  if (password !== process.env.ADMIN_PANEL_PASSWORD) {
    return interaction.reply({ content: '❌ Falsches Passwort.', ephemeral: true });
  }
  login(interaction.user.id);
  return showGuildList(interaction, client);
}

async function showGuildList(interaction, client) {
  const guilds = client.guilds.cache;
  const configs = getAllConfigs();

  if (guilds.size === 0) {
    return interaction.reply({ content: 'Bot ist auf keinem Server.', ephemeral: true });
  }

  const options = [];
  for (const [id, guild] of guilds) {
    const cfg = configs[id] || {};
    const status = cfg.blocked ? '🔒' : '🟢';
    options.push({
      label: `${status} ${guild.name}`.slice(0, 100),
      description: `${guild.memberCount} Mitglieder`.slice(0, 100),
      value: `admin_guild_${id}`,
    });
    if (options.length >= 25) break;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('admin_guild_select')
    .setPlaceholder('Server auswählen...')
    .addOptions(options);

  const ownerBtn = new ButtonBuilder()
    .setCustomId('admin_manage_owners')
    .setLabel('👤 Besitzer verwalten')
    .setStyle(ButtonStyle.Secondary);

  const embed = new EmbedBuilder()
    .setTitle('🛡️ Globales Admin-Panel')
    .setDescription(`**${guilds.size}** Server aktiv\nSession läuft 15 Minuten.`)
    .setColor(0x5865F2);

  const rows = [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(ownerBtn),
  ];

  const method = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  return interaction[method]({ embeds: [embed], components: rows, ephemeral: true });
}

async function handleGuildSelect(interaction, client) {
  if (!isLoggedIn(interaction.user.id)) {
    return interaction.update({ content: '⏱️ Session abgelaufen. Bitte `/admin-panel` erneut ausführen.', embeds: [], components: [] });
  }
  const guildId = interaction.values[0].replace('admin_guild_', '');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.update({ content: 'Server nicht gefunden.', embeds: [], components: [] });

  return showGuildDetail(interaction, client, guild);
}

async function showGuildDetail(interaction, client, guild) {
  const cfg = getGuildConfig(guild.id) || {};
  let owner = 'Unbekannt';
  try { const o = await guild.fetchOwner(); owner = o.user.tag; } catch {}

  const embed = new EmbedBuilder()
    .setTitle(`Server: ${guild.name}`)
    .setThumbnail(guild.iconURL())
    .addFields(
      { name: 'Eigentümer', value: owner, inline: true },
      { name: 'Mitglieder', value: `${guild.memberCount}`, inline: true },
      { name: 'Status', value: cfg.blocked ? '🔒 Gesperrt' : '🟢 Aktiv', inline: true },
      { name: 'Warteraum', value: cfg.waitingRoomId ? `<#${cfg.waitingRoomId}>` : 'Nicht gesetzt', inline: true },
      { name: 'Anfrage-Kanal', value: cfg.requestChannelId ? `<#${cfg.requestChannelId}>` : 'Nicht gesetzt', inline: true },
      { name: 'Büros', value: `${(cfg.offices || []).length}`, inline: true },
    )
    .setColor(cfg.blocked ? 0xED4245 : 0x57F287);

  const toggleBtn = new ButtonBuilder()
    .setCustomId(`admin_toggle_${guild.id}`)
    .setLabel(cfg.blocked ? '🔓 Entsperren' : '🔒 Sperren')
    .setStyle(cfg.blocked ? ButtonStyle.Success : ButtonStyle.Danger);

  const backBtn = new ButtonBuilder()
    .setCustomId('admin_back_to_list')
    .setLabel('◀ Zurück')
    .setStyle(ButtonStyle.Secondary);

  return interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(backBtn, toggleBtn)],
    ephemeral: true,
  });
}

async function handleToggleGuild(interaction, client, guildId) {
  if (!isLoggedIn(interaction.user.id)) {
    return interaction.update({ content: '⏱️ Session abgelaufen.', embeds: [], components: [] });
  }
  const cfg = getGuildConfig(guildId) || {};
  updateGuildConfig(guildId, { blocked: !cfg.blocked });
  const guild = client.guilds.cache.get(guildId);
  if (guild) return showGuildDetail(interaction, client, guild);
  return interaction.update({ content: 'Gespeichert.', embeds: [], components: [] });
}

async function handleManageOwners(interaction) {
  if (!isLoggedIn(interaction.user.id)) {
    return interaction.update({ content: '⏱️ Session abgelaufen.', embeds: [], components: [] });
  }
  const { static: staticOwners, dynamic: dynamicOwners } = getAllOwners();

  const embed = new EmbedBuilder()
    .setTitle('👤 Besitzer verwalten')
    .addFields(
      { name: 'Fest in .env', value: staticOwners.length ? staticOwners.join('\n') : 'Keine', inline: false },
      { name: 'Dynamisch hinzugefügt', value: dynamicOwners.length ? dynamicOwners.join('\n') : 'Keine', inline: false },
    )
    .setColor(0x5865F2);

  const addBtn = new ButtonBuilder()
    .setCustomId('admin_add_owner')
    .setLabel('➕ Besitzer hinzufügen')
    .setStyle(ButtonStyle.Success);

  const removeOptions = dynamicOwners.map(id => ({ label: id, value: `remove_owner_${id}` }));

  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_back_to_list').setLabel('◀ Zurück').setStyle(ButtonStyle.Secondary),
    addBtn,
  )];

  if (removeOptions.length > 0) {
    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId('admin_remove_owner_select')
      .setPlaceholder('Dynamischen Besitzer entfernen...')
      .addOptions(removeOptions.slice(0, 25));
    rows.push(new ActionRowBuilder().addComponents(removeSelect));
  }

  return interaction.update({ embeds: [embed], components: rows, ephemeral: true });
}

async function handleAddOwner(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('admin_add_owner_modal')
    .setTitle('Besitzer hinzufügen');
  const input = new TextInputBuilder()
    .setCustomId('owner_id_input')
    .setLabel('Discord-User-ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('z.B. 123456789012345678');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function handleAddOwnerModal(interaction, client) {
  const newId = interaction.fields.getTextInputValue('owner_id_input').trim();
  if (!/^\d{17,20}$/.test(newId)) {
    return interaction.reply({ content: '❌ Ungültige Discord-ID.', ephemeral: true });
  }
  addDynamicOwner(newId);
  return interaction.reply({ content: `✅ <@${newId}> wurde als Besitzer hinzugefügt.`, ephemeral: true });
}

async function handleRemoveOwnerSelect(interaction) {
  const value = interaction.values[0].replace('remove_owner_', '');
  removeDynamicOwner(value);
  return handleManageOwners(interaction);
}

module.exports = {
  handleAdminPanel,
  handleAdminLoginModal,
  handleGuildSelect,
  handleToggleGuild,
  handleManageOwners,
  handleAddOwner,
  handleAddOwnerModal,
  handleRemoveOwnerSelect,
  showGuildList,
};
