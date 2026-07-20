const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const config = require('./config');
const guildStore = require('./guildStore');
const ownerStore = require('./ownerStore');

const AUTH_DURATION_MS = 15 * 60 * 1000; // 15 Minuten eingeloggt bleiben
const PAGE_SIZE = 25; // Discord-Limit pro Select-Menu
const ID_REGEX = /^\d{15,25}$/;

const authenticatedAdmins = new Map(); // userId -> Ablaufzeitpunkt (ms)

function isOwner(userId) {
  return ownerStore.getAllOwnerIds().includes(userId);
}

function isAuthenticated(userId) {
  const expiry = authenticatedAdmins.get(userId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    authenticatedAdmins.delete(userId);
    return false;
  }
  return true;
}

function authenticate(userId) {
  authenticatedAdmins.set(userId, Date.now() + AUTH_DURATION_MS);
}

function requireAccess(interaction) {
  if (!isOwner(interaction.user.id) || !isAuthenticated(interaction.user.id)) {
    return false;
  }
  return true;
}

// --- /admin-panel Befehl ---
async function handleAdminPanelCommand(interaction) {
  if (!isOwner(interaction.user.id)) {
    // Bewusst unspezifisch, damit niemand rausfindet, dass es diesen Befehl überhaupt gibt.
    await interaction.reply({ content: 'Unbekannter Befehl.', ephemeral: true });
    return;
  }

  if (!config.adminPanelPassword) {
    await interaction.reply({ content: 'ADMIN_PANEL_PASSWORD ist in der .env nicht gesetzt.', ephemeral: true });
    return;
  }

  if (isAuthenticated(interaction.user.id)) {
    const payload = await buildGuildListPayload(interaction.client, 0);
    await interaction.reply(payload);
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('admin-panel-auth')
    .setTitle('Admin-Panel Login');

  const passwordInput = new TextInputBuilder()
    .setCustomId('password')
    .setLabel('Passwort')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(passwordInput));
  await interaction.showModal(modal);
}

async function handleAdminAuthModalSubmit(interaction) {
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: 'Unbekannter Befehl.', ephemeral: true });
    return;
  }
  const entered = interaction.fields.getTextInputValue('password');
  if (entered !== config.adminPanelPassword) {
    await interaction.reply({ content: 'Falsches Passwort.', ephemeral: true });
    return;
  }
  authenticate(interaction.user.id);
  const payload = await buildGuildListPayload(interaction.client, 0);
  await interaction.reply(payload);
}

// --- Serverliste ---
async function buildGuildListPayload(client, page) {
  const guilds = [...client.guilds.cache.values()];
  const totalPages = Math.max(1, Math.ceil(guilds.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageGuilds = guilds.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const options = pageGuilds.map((g) => {
    const locked = guildStore.getGuild(g.id).locked;
    return {
      label: g.name.slice(0, 100),
      description: `${g.memberCount ?? '?'} Mitglieder${locked ? ' — GESPERRT' : ''}`,
      value: g.id,
      emoji: locked ? '🔒' : '🟢',
    };
  });

  const components = [];
  if (options.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`admin-server-select:${clampedPage}`)
      .setPlaceholder('Server wählen')
      .addOptions(options);
    components.push(new ActionRowBuilder().addComponents(select));
  }

  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`admin-page:${clampedPage - 1}`).setLabel('◀ Zurück').setStyle(ButtonStyle.Secondary).setDisabled(clampedPage === 0),
      new ButtonBuilder().setCustomId(`admin-page:${clampedPage + 1}`).setLabel('Weiter ▶').setStyle(ButtonStyle.Secondary).setDisabled(clampedPage >= totalPages - 1),
    ));
  }

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin-owners:view').setLabel('👤 Besitzer verwalten').setStyle(ButtonStyle.Secondary),
  ));

  const embed = new EmbedBuilder()
    .setTitle(`Admin-Panel — Server (${guilds.length})`)
    .setDescription(`Wähle einen Server, um Details zu sehen und ihn zu sperren/entsperren.${totalPages > 1 ? `\nSeite ${clampedPage + 1}/${totalPages}` : ''}`)
    .setColor(0x2c3e50);

  return { embeds: [embed], components, ephemeral: true };
}

async function handleAdminPage(interaction) {
  if (!requireAccess(interaction)) {
    await interaction.reply({ content: 'Nicht angemeldet. Bitte erneut /admin-panel ausführen.', ephemeral: true });
    return;
  }
  const [, pageStr] = interaction.customId.split(':');
  const payload = await buildGuildListPayload(interaction.client, parseInt(pageStr, 10));
  await interaction.update(payload);
}

async function handleAdminBack(interaction) {
  if (!requireAccess(interaction)) {
    await interaction.reply({ content: 'Nicht angemeldet. Bitte erneut /admin-panel ausführen.', ephemeral: true });
    return;
  }
  await interaction.update(await buildGuildListPayload(interaction.client, 0));
}

// --- Server-Detailansicht ---
async function buildGuildDetailPayload(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return { content: 'Server nicht gefunden (der Bot wurde evtl. entfernt).', embeds: [], components: [] };
  }
  const owner = await guild.fetchOwner().catch(() => null);
  const guildConfig = guildStore.getGuild(guildId);

  const embed = new EmbedBuilder()
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      { name: 'Eigentümer', value: owner ? `${owner.user.tag}\n(${owner.id})` : 'Unbekannt', inline: true },
      { name: 'Mitglieder', value: String(guild.memberCount ?? '?'), inline: true },
      { name: 'Status', value: guildConfig.locked ? '🔒 Gesperrt' : '🟢 Aktiv', inline: true },
      { name: 'Warteraum', value: guildConfig.waitingRoomChannelId ? `<#${guildConfig.waitingRoomChannelId}>` : '_nicht gesetzt_', inline: true },
      { name: 'Anfrage-Kanal', value: guildConfig.requestChannelId ? `<#${guildConfig.requestChannelId}>` : '_nicht gesetzt_', inline: true },
      { name: 'Büros', value: String(guildConfig.offices.length), inline: true },
    )
    .setColor(guildConfig.locked ? 0xc9584f : 0x2ecc71);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin-lock-toggle:${guildId}`)
      .setLabel(guildConfig.locked ? 'Entsperren' : 'Sperren')
      .setStyle(guildConfig.locked ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin-back:0')
      .setLabel('◀ Zur Serverliste')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

async function handleAdminServerSelect(interaction) {
  if (!requireAccess(interaction)) {
    await interaction.reply({ content: 'Nicht angemeldet. Bitte erneut /admin-panel ausführen.', ephemeral: true });
    return;
  }
  const guildId = interaction.values[0];
  await interaction.update(await buildGuildDetailPayload(interaction.client, guildId));
}

async function handleAdminLockToggle(interaction) {
  if (!requireAccess(interaction)) {
    await interaction.reply({ content: 'Nicht angemeldet. Bitte erneut /admin-panel ausführen.', ephemeral: true });
    return;
  }
  const [, guildId] = interaction.customId.split(':');
  const guildConfig = guildStore.getGuild(guildId);
  guildStore.setLocked(guildId, !guildConfig.locked);
  await interaction.update(await buildGuildDetailPayload(interaction.client, guildId));
}

// --- Besitzer verwalten ---
async function buildOwnersPayload(client) {
  const envOwners = config.ownerIds;
  const extraOwners = ownerStore.getExtraOwnerIds();
  const allIds = [...new Set([...envOwners, ...extraOwners])];

  const lines = await Promise.all(allIds.map(async (id) => {
    const user = await client.users.fetch(id).catch(() => null);
    const label = user ? `${user.tag}` : 'Unbekannter Nutzer';
    const source = envOwners.includes(id) ? '_(fest in .env, nur dort entfernbar)_' : '';
    return `• **${label}** (${id}) ${source}`;
  }));

  const embed = new EmbedBuilder()
    .setTitle('Admin-Panel — Besitzer')
    .setDescription(allIds.length ? lines.join('\n') : '_Keine Besitzer eingetragen._')
    .setColor(0x2c3e50);

  const removableIds = extraOwners.slice(0, 4); // max 4 Remove-Buttons + Hinzufügen-Button passen in eine Reihe
  const removeButtons = removableIds.map((id) =>
    new ButtonBuilder()
      .setCustomId(`admin-owner-remove:${id}`)
      .setLabel(`Entfernen: ${id.slice(-4)}`)
      .setStyle(ButtonStyle.Danger));

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin-owner-add-btn').setLabel('➕ Besitzer hinzufügen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin-back:0').setLabel('◀ Zur Serverliste').setStyle(ButtonStyle.Secondary),
  );

  const components = removeButtons.length
    ? [new ActionRowBuilder().addComponents(...removeButtons), actionRow]
    : [actionRow];

  return { embeds: [embed], components, ephemeral: true };
}

async function handleAdminOwnersView(interaction) {
  if (!requireAccess(interaction)) {
    await interaction.reply({ content: 'Nicht angemeldet. Bitte erneut /admin-panel ausführen.', ephemeral: true });
    return;
  }
  await interaction.update(await buildOwnersPayload(interaction.client));
}

async function handleAdminOwnerAddButton(interaction) {
  if (!requireAccess(interaction)) {
    await interaction.reply({ content: 'Nicht angemeldet. Bitte erneut /admin-panel ausführen.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId('admin-owner-add-modal')
    .setTitle('Besitzer hinzufügen');

  const idInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('Discord-User-ID')
    .setPlaceholder('z. B. 482938102847383922')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(idInput));
  await interaction.showModal(modal);
}

async function handleAdminOwnerAddModalSubmit(interaction) {
  if (!requireAccess(interaction)) {
    await interaction.reply({ content: 'Nicht angemeldet. Bitte erneut /admin-panel ausführen.', ephemeral: true });
    return;
  }
  const userId = interaction.fields.getTextInputValue('user_id').trim();
  if (!ID_REGEX.test(userId)) {
    await interaction.reply({ content: 'Das sieht nicht nach einer gültigen Discord-User-ID aus (nur Zahlen, meist 17-19 Stellen).', ephemeral: true });
    return;
  }
  const result = ownerStore.addOwner(userId);
  if (!result.ok) {
    await interaction.reply({ content: 'Diese ID ist bereits als Besitzer eingetragen.', ephemeral: true });
    return;
  }
  await interaction.reply(await buildOwnersPayload(interaction.client));
}

async function handleAdminOwnerRemove(interaction) {
  if (!requireAccess(interaction)) {
    await interaction.reply({ content: 'Nicht angemeldet. Bitte erneut /admin-panel ausführen.', ephemeral: true });
    return;
  }
  const [, userId] = interaction.customId.split(':');
  ownerStore.removeOwner(userId);
  await interaction.update(await buildOwnersPayload(interaction.client));
}

module.exports = {
  handleAdminPanelCommand,
  handleAdminAuthModalSubmit,
  handleAdminPage,
  handleAdminBack,
  handleAdminServerSelect,
  handleAdminLockToggle,
  handleAdminOwnersView,
  handleAdminOwnerAddButton,
  handleAdminOwnerAddModalSubmit,
  handleAdminOwnerRemove,
};
