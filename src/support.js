const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require('discord.js');
const guildStore = require('./guildStore');
const caseStore = require('./caseStore');

// customId-Schema:
//   Übernehmen-Button:      support-claim:<guildId>:<userId>
//   Schließen-Button:       support-close:<guildId>:<userId>:<channelId>:<claimedAtMs>:<claimerId>

async function notifySupportRequest(guild, member) {
  const guildConfig = guildStore.getGuild(guild.id);
  const s = guildConfig.support;
  const pingChannel = await guild.channels.fetch(s.pingChannelId).catch(() => null);
  if (!pingChannel) {
    console.warn(`[Support] Ping-Kanal für Guild ${guild.id} nicht gefunden.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(s.message || 'Neuer Supportfall')
    .setDescription(`<@${member.id}> wartet im Support-Warteraum.`)
    .setColor(0xe67e22)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`support-claim:${guild.id}:${member.id}`)
      .setLabel('Übernehmen')
      .setStyle(ButtonStyle.Success),
  );

  const sentMessage = await pingChannel.send({
    content: s.roleId ? `<@&${s.roleId}>` : undefined,
    embeds: [embed],
    components: [row],
    allowedMentions: s.roleId ? { roles: [s.roleId] } : undefined,
  });

  caseStore.createCase(guild.id, sentMessage.id, {
    officeChannelId: null,
    officeName: 'Support',
    userId: member.id,
    requestedAt: Date.now(),
    status: 'pending',
  });
}

async function handleClaimButtonClick(interaction) {
  const [, guildId, userId] = interaction.customId.split(':');
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Server nicht gefunden.', ephemeral: true });

  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.MoveMembers)) {
    await interaction.reply({ content: 'Dir fehlt die Berechtigung, Supportfälle zu übernehmen (benötigt: Mitglieder verschieben).', ephemeral: true });
    return;
  }

  const guildConfig = guildStore.getGuild(guildId);
  const s = guildConfig.support;
  const member = await guild.members.fetch(userId).catch(() => null);

  if (!member) {
    await interaction.update({ content: 'Nutzer nicht mehr gefunden.', embeds: [], components: [] });
    return;
  }
  if (!member.voice.channelId) {
    await interaction.reply({ content: 'Der Nutzer ist gerade in keinem Voice-Channel mehr.', ephemeral: true });
    return;
  }

  const claimerVoiceChannel = interaction.member.voice.channel;
  if (!claimerVoiceChannel) {
    await interaction.reply({ content: 'Du musst selbst in einem Voice-Channel sein, damit der Nutzer zu dir gemovt werden kann.', ephemeral: true });
    return;
  }
  if (s.categoryId && claimerVoiceChannel.parentId !== s.categoryId) {
    await interaction.reply({ content: 'Du musst in einem Voice-Channel der konfigurierten Support-Kategorie sein, um Fälle zu übernehmen.', ephemeral: true });
    return;
  }

  await member.voice.setChannel(claimerVoiceChannel.id).catch(async (err) => {
    await interaction.reply({ content: `Konnte nicht verschieben: ${err.message}`, ephemeral: true });
  });

  await claimerVoiceChannel.permissionOverwrites.create(member.id, { ViewChannel: true, Connect: true }).catch(() => {});

  const claimedAt = Date.now();
  caseStore.updateCase(guildId, interaction.message.id, {
    status: 'accepted',
    acceptedAt: claimedAt,
    accepterId: interaction.user.id,
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`support-close:${guildId}:${userId}:${claimerVoiceChannel.id}:${claimedAt}:${interaction.user.id}`)
      .setLabel('Fall schließen')
      .setStyle(ButtonStyle.Secondary),
  );

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x2ecc71)
    .addFields({ name: 'Status', value: `Übernommen von <@${interaction.user.id}>\nÜbernommen: <t:${Math.floor(claimedAt / 1000)}:f>` });

  await interaction.update({ embeds: [updatedEmbed], components: [closeRow] });

  await member.send('Dein Supportfall wurde übernommen. Du wurdest in den entsprechenden Voice-Channel verschoben.').catch(() => {});
}

async function handleSupportCloseButtonClick(interaction) {
  const [, guildId, userId, channelId, claimedAtStr, claimerId] = interaction.customId.split(':');
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Server nicht gefunden.', ephemeral: true });

  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.MoveMembers)) {
    await interaction.reply({ content: 'Dir fehlt die Berechtigung, den Fall zu schließen (benötigt: Mitglieder verschieben).', ephemeral: true });
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null);

  if (member?.voice.channelId === channelId) {
    await member.voice.setChannel(null).catch(() => {});
  }
  const channel = guild.channels.cache.get(channelId);
  if (channel && member) {
    await channel.permissionOverwrites.delete(member.id).catch(() => {});
  }

  const claimedAtMs = Number(claimedAtStr);
  const durationMinutes = Number.isFinite(claimedAtMs) ? Math.max(0, Math.round((Date.now() - claimedAtMs) / 60000)) : null;

  caseStore.updateCase(guildId, interaction.message.id, {
    status: 'closed',
    closedAt: Date.now(),
    closedBy: interaction.user.id,
    durationMinutes,
  });

  const statusLines = [`Geschlossen von <@${interaction.user.id}>`];
  if (claimerId) statusLines.push(`Bearbeitet von <@${claimerId}>`);
  if (durationMinutes !== null) statusLines.push(`Dauer: ${durationMinutes} Minute${durationMinutes === 1 ? '' : 'n'}`);

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x95a5a6)
    .addFields({ name: 'Fall', value: statusLines.join('\n') });

  await interaction.update({ embeds: [updatedEmbed], components: [] });

  if (member) {
    await member.send('Dein Supportfall wurde als abgeschlossen markiert. Danke!').catch(() => {});
  }
}

module.exports = { notifySupportRequest, handleClaimButtonClick, handleSupportCloseButtonClick };
