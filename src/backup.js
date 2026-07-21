const {
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const backupStore = require('./backupStore');
const guildStore = require('./guildStore');

// Läuft gerade eine Wiederherstellung für diesen Server? (verhindert Doppel-Klicks/parallele Restores)
const restoringGuilds = new Set();

function serializeGuild(guild) {
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: r.permissions.bitfield.toString(),
    }));

  const categories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ name: c.name, position: c.position }));

  const channels = guild.channels.cache
    .filter((c) => c.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      name: c.name,
      type: c.type,
      topic: c.topic || null,
      position: c.position,
      parentCategoryName: c.parent?.name || null,
      bitrate: c.type === ChannelType.GuildVoice ? c.bitrate : undefined,
      userLimit: c.type === ChannelType.GuildVoice ? c.userLimit : undefined,
      overwrites: [...c.permissionOverwrites.cache.values()].map((ow) => ({
        type: ow.type, // 0 = role, 1 = member
        roleName: ow.type === 0 ? guild.roles.cache.get(ow.id)?.name : null,
        userId: ow.type === 1 ? ow.id : null,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString(),
      })),
    }));

  return { roles, categories, channels };
}

async function createBackup(guild) {
  const data = serializeGuild(guild);
  const code = backupStore.saveBackup(guild.id, guild.name, data);
  guildStore.setBackupSettings(guild.id, { lastBackupAt: Date.now() });
  return code;
}

function buildRestoreConfirmation(code, backup) {
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Server wirklich wiederherstellen?')
    .setDescription(
      `Backup vom **${new Date(backup.createdAt).toLocaleString('de-DE')}** (ursprünglich von Server **${backup.guildName}**).\n\n`
      + `**Das hier ist nicht rückgängig zu machen:**\n`
      + `- ALLE aktuellen Channels und Kategorien auf diesem Server werden gelöscht\n`
      + `- ALLE aktuellen Rollen (außer @everyone und bot-verwaltete) werden gelöscht\n`
      + `- Danach werden Rollen/Kategorien/Channels aus dem Backup neu angelegt\n\n`
      + `Bist du **wirklich sicher**?`,
    )
    .setColor(0xc9584f);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`backup-confirm:${code}`).setLabel('Ja, alles ersetzen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('backup-cancel').setLabel('Abbrechen').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

async function restoreBackup(guild, backup, onProgress) {
  // 1) Alles Bestehende löschen
  onProgress?.('Lösche bestehende Channels ...');
  for (const channel of [...guild.channels.cache.values()]) {
    await channel.delete().catch(() => {});
  }
  onProgress?.('Lösche bestehende Rollen ...');
  for (const role of [...guild.roles.cache.values()]) {
    if (role.id === guild.id || role.managed) continue;
    await role.delete().catch(() => {});
  }

  // 2) Rollen neu anlegen (Reihenfolge: höchste Position zuerst, wie gespeichert)
  onProgress?.('Lege Rollen an ...');
  const roleNameMap = new Map();
  for (const r of backup.data.roles) {
    const role = await guild.roles.create({
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: BigInt(r.permissions),
    }).catch(() => null);
    if (role) roleNameMap.set(r.name, role);
  }

  // 3) Kategorien anlegen
  onProgress?.('Lege Kategorien an ...');
  const categoryNameMap = new Map();
  for (const cat of backup.data.categories) {
    const category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory }).catch(() => null);
    if (category) categoryNameMap.set(cat.name, category);
  }

  // 4) Channels anlegen (mit auf neue Rollen gemappten Berechtigungen)
  onProgress?.('Lege Channels an ...');
  for (const ch of backup.data.channels) {
    const overwrites = ch.overwrites
      .map((ow) => {
        if (ow.roleName) {
          const role = roleNameMap.get(ow.roleName);
          if (!role) return null;
          return { id: role.id, allow: BigInt(ow.allow), deny: BigInt(ow.deny) };
        }
        if (ow.userId) {
          return { id: ow.userId, allow: BigInt(ow.allow), deny: BigInt(ow.deny) };
        }
        return null;
      })
      .filter(Boolean);

    await guild.channels.create({
      name: ch.name,
      type: ch.type,
      topic: ch.topic || undefined,
      parent: ch.parentCategoryName ? categoryNameMap.get(ch.parentCategoryName)?.id : undefined,
      bitrate: ch.bitrate,
      userLimit: ch.userLimit,
      permissionOverwrites: overwrites,
    }).catch(() => {});
  }
}

module.exports = {
  createBackup,
  buildRestoreConfirmation,
  restoreBackup,
  restoringGuilds,
};
