const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const guildStore = require('./guildStore');
const caseStore = require('./caseStore');
const { buildOfficeSelectPayload } = require('./officeSelectUI');
const { formatMessage } = require('./textUtils');

// customId-Schema:
//   Select-Menu (DM):        office-select:<guildId>:<page>
//   Seiten-Button (DM):      office-page:<guildId>:<page>
//   Annehmen-Button:         accept:<guildId>:<userId>:<officeChannelId>
//   Ablehnen-Button:         decline:<guildId>:<userId>:<officeChannelId>
//   Fall-schliessen-Button:  close:<guildId>:<userId>:<officeChannelId>:<acceptedAtEpochMs>:<accepterId>

async function handleOfficeSelect(interaction, client) {
  const [, guildId] = interaction.customId.split(':');
  const officeChannelId = interaction.values[0];
  const isGeneral = officeChannelId === 'general';

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    await interaction.update({ content: 'Der Server wurde nicht gefunden (bin ich noch Mitglied?).', embeds: [], components: [] });
    return;
  }

  const guildConfig = guildStore.getGuild(guildId);
  const office = isGeneral
    ? { name: 'Allgemeine Anfrage', emoji: guildConfig.generalOffice.emoji, roleId: guildConfig.generalOffice.roleId }
    : guildConfig.offices.find((o) => o.channelId === officeChannelId);
  if (!office) {
    await interaction.update({ content: 'Dieses Büro existiert nicht mehr. Bitte erneut versuchen.', embeds: [], components: [] });
    return;
  }

  const requestChannel = await guild.channels.fetch(guildConfig.requestChannelId).catch(() => null);
  if (!requestChannel) {
    await interaction.update({ content: 'Der Anfrage-Kanal wurde auf dem Server nicht gefunden. Bitte einen Admin informieren.', embeds: [], components: [] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Neue Büroanfrage')
    .setDescription(isGeneral
      ? `<@${interaction.user.id}> hat eine ${office.emoji || ''} **allgemeine Anfrage** gestellt (kein bestimmtes Büro).`
      : `<@${interaction.user.id}> möchte zu ${office.emoji || ''} **${office.name}**.`)
    .setColor(0xf1c40f)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept:${guildId}:${interaction.user.id}:${officeChannelId}`)
      .setLabel('Annehmen')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`decline:${guildId}:${interaction.user.id}:${officeChannelId}`)
      .setLabel('Ablehnen')
      .setStyle(ButtonStyle.Danger),
  );

  const sentMessage = await requestChannel.send({
    content: office.roleId ? `<@&${office.roleId}>` : undefined,
    embeds: [embed],
    components: [row],
    allowedMentions: office.roleId ? { roles: [office.roleId] } : undefined,
  });

  caseStore.createCase(guildId, sentMessage.id, {
    officeChannelId: isGeneral ? null : officeChannelId,
    officeName: office.name,
    userId: interaction.user.id,
    requestedAt: Date.now(),
    status: 'pending',
  });

  await interaction.update({
    content: `Anfrage für ${office.emoji || ''} **${office.name}** wurde gesendet. Du wirst benachrichtigt, sobald jemand reagiert.`,
    embeds: [],
    components: [],
  });
}

async function handleOfficePage(interaction, client) {
  const [, guildId, pageStr] = interaction.customId.split(':');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    await interaction.update({ content: 'Der Server wurde nicht gefunden.', embeds: [], components: [] });
    return;
  }
  const guildConfig = guildStore.getGuild(guildId);
  const description = formatMessage(guildConfig.dmMessage, interaction.member ?? { user: interaction.user }, guild);
  const payload = buildOfficeSelectPayload(guild, guildConfig, parseInt(pageStr, 10), description);
  await interaction.update(payload);
}

async function handleAccept(interaction, client) {
  const [, guildId, userId, officeChannelId] = interaction.customId.split(':');
  const isGeneral = officeChannelId === 'general';
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Server nicht gefunden.', ephemeral: true });

  // Nur Leute mit "Kanäle verwalten"/Moderationsrechten duerfen annehmen/ablehnen
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers)) {
    await interaction.reply({ content: 'Dir fehlt die Berechtigung, Anfragen anzunehmen (benötigt: Mitglieder verschieben).', ephemeral: true });
    return;
  }

  const guildConfig = guildStore.getGuild(guildId);
  const office = isGeneral
    ? { name: 'Allgemeine Anfrage', emoji: guildConfig.generalOffice.emoji }
    : guildConfig.offices.find((o) => o.channelId === officeChannelId);
  const member = await guild.members.fetch(userId).catch(() => null);

  if (!office || !member) {
    await interaction.update({ content: 'Büro oder Nutzer nicht mehr gefunden.', embeds: [], components: [] });
    return;
  }

  if (!member.voice.channelId) {
    await interaction.reply({ content: 'Der Nutzer ist gerade in keinem Voice-Channel mehr.', ephemeral: true });
    return;
  }

  // Bei einer allgemeinen Anfrage gibt es kein festes Büro – der Nutzer wird
  // stattdessen zu dem Voice-Channel gemovt, in dem die annehmende Person
  // gerade selbst sitzt. Ist eine Kategorie konfiguriert, muss die annehmende
  // Person dort auch tatsächlich gerade in einem Channel dieser Kategorie sein.
  let targetChannelId = officeChannelId;
  if (isGeneral) {
    const accepterVoiceChannel = interaction.member.voice.channel;
    if (!accepterVoiceChannel) {
      await interaction.reply({ content: 'Du musst selbst in einem Voice-Channel sein, damit der Nutzer zu dir gemovt werden kann.', ephemeral: true });
      return;
    }
    const requiredCategoryId = guildConfig.generalOffice.categoryId;
    if (requiredCategoryId && accepterVoiceChannel.parentId !== requiredCategoryId) {
      await interaction.reply({ content: `Du musst in einem Voice-Channel der Büro-Kategorie sein, um allgemeine Anfragen anzunehmen (aktuell: <#${accepterVoiceChannel.id}>, gehört nicht zur konfigurierten Kategorie).`, ephemeral: true });
      return;
    }
    targetChannelId = accepterVoiceChannel.id;
  }

  await member.voice.setChannel(targetChannelId).catch(async (err) => {
    await interaction.reply({ content: `Konnte nicht verschieben: ${err.message}`, ephemeral: true });
  });

  // Nutzer bekommt Sicht-/Beitritts-Recht für den Ziel-Channel, damit er ihn
  // überhaupt sehen/betreten kann (falls der Channel privat/versteckt ist).
  const targetChannel = guild.channels.cache.get(targetChannelId);
  if (targetChannel) {
    await targetChannel.permissionOverwrites.create(member.id, { ViewChannel: true, Connect: true }).catch(() => {});
  }

  const acceptedAt = Date.now();
  caseStore.updateCase(guildId, interaction.message.id, {
    status: 'accepted',
    acceptedAt,
    accepterId: interaction.user.id,
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`close:${guildId}:${userId}:${targetChannelId}:${acceptedAt}:${interaction.user.id}`)
      .setLabel('Fall schließen')
      .setStyle(ButtonStyle.Secondary),
  );

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x2ecc71)
    .addFields({ name: 'Status', value: `Angenommen von <@${interaction.user.id}>, verschoben zu ${office.emoji || ''} **${office.name}**\nAngenommen: <t:${Math.floor(acceptedAt / 1000)}:f>` });

  await interaction.update({ embeds: [updatedEmbed], components: [closeRow] });

  await member.send(`Deine Büroanfrage für ${office.emoji || ''} **${office.name}** wurde angenommen. Du wurdest in den Voice-Channel verschoben.`).catch(() => {});
}

async function handleDecline(interaction, client) {
  const [, guildId, userId, officeChannelId] = interaction.customId.split(':');
  const guild = client.guilds.cache.get(guildId);

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers)) {
    await interaction.reply({ content: 'Dir fehlt die Berechtigung, Anfragen abzulehnen (benötigt: Mitglieder verschieben).', ephemeral: true });
    return;
  }

  const guildConfig = guild ? guildStore.getGuild(guildId) : null;
  const office = guildConfig?.offices.find((o) => o.channelId === officeChannelId);

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xe74c3c)
    .addFields({ name: 'Status', value: `Abgelehnt von <@${interaction.user.id}>` });

  caseStore.updateCase(guildId, interaction.message.id, {
    status: 'declined',
    declinedAt: Date.now(),
    declinedBy: interaction.user.id,
  });

  await interaction.update({ embeds: [updatedEmbed], components: [] });

  const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
  if (member) {
    await member.send(`Deine Büroanfrage${office ? ` für ${office.emoji || ''} **${office.name}**` : ''} wurde leider abgelehnt.`).catch(() => {});
  }
}

async function handleClose(interaction, client) {
  const [, guildId, userId, officeChannelId, acceptedAtStr, accepterId] = interaction.customId.split(':');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Server nicht gefunden.', ephemeral: true });

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers)) {
    await interaction.reply({ content: 'Dir fehlt die Berechtigung, den Fall zu schließen (benötigt: Mitglieder verschieben).', ephemeral: true });
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null);

  // Nutzer aus dem Büro-Voice-Channel trennen, falls er noch dort ist.
  if (member?.voice.channelId === officeChannelId) {
    await member.voice.setChannel(null).catch(() => {});
  }

  // Sicht-/Beitritts-Recht für den Büro-Channel wieder entziehen, damit der
  // Channel für den Nutzer wieder unsichtbar/unzugänglich ist.
  const officeChannel = guild.channels.cache.get(officeChannelId);
  if (officeChannel && member) {
    await officeChannel.permissionOverwrites.delete(member.id).catch(() => {});
  }

  const acceptedAtMs = Number(acceptedAtStr);
  const durationMinutes = Number.isFinite(acceptedAtMs) ? Math.max(0, Math.round((Date.now() - acceptedAtMs) / 60000)) : null;

  caseStore.updateCase(guildId, interaction.message.id, {
    status: 'closed',
    closedAt: Date.now(),
    closedBy: interaction.user.id,
    durationMinutes,
  });

  const statusLines = [`Geschlossen von <@${interaction.user.id}>`];
  if (accepterId) statusLines.push(`Bearbeitet von <@${accepterId}>`);
  if (durationMinutes !== null) statusLines.push(`Dauer: ${durationMinutes} Minute${durationMinutes === 1 ? '' : 'n'}`);

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x95a5a6)
    .addFields({ name: 'Fall', value: statusLines.join('\n') });

  await interaction.update({ embeds: [updatedEmbed], components: [] });

  if (member) {
    await member.send('Dein Fall wurde als abgeschlossen markiert. Danke!').catch(() => {});
  }
}

module.exports = {
  handleOfficeSelect,
  handleOfficePage,
  handleAccept,
  handleDecline,
  handleClose,
};
