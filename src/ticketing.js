const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField,
  PermissionFlagsBits,
} = require('discord.js');
const guildStore = require('./guildStore');
const ticketStore = require('./ticketStore');

const PAGE_SIZE = 25;

function buildTicketPanelPayload(guild, guildConfig, page = 0) {
  const t = guildConfig.tickets;
  const categories = t.categories;
  const totalPages = Math.max(1, Math.ceil(categories.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageCategories = categories.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setTitle(t.panelTitle)
    .setDescription(t.panelMessage + (totalPages > 1 ? `\n\nSeite ${clampedPage + 1}/${totalPages}` : ''))
    .setColor(0x3b6fd6);
  if (t.bannerUrl) embed.setImage(t.bannerUrl);
  if (t.logoUrl) embed.setThumbnail(t.logoUrl);

  const components = [];
  if (pageCategories.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`ticket-select:${guild.id}:${clampedPage}`)
      .setPlaceholder('Kategorie wählen')
      .addOptions(pageCategories.map((c) => ({ label: c.name.slice(0, 100), value: c.id })));
    components.push(new ActionRowBuilder().addComponents(select));
  }

  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket-page:${guild.id}:${clampedPage - 1}`).setLabel('◀ Zurück').setStyle(ButtonStyle.Secondary).setDisabled(clampedPage === 0),
      new ButtonBuilder().setCustomId(`ticket-page:${guild.id}:${clampedPage + 1}`).setLabel('Weiter ▶').setStyle(ButtonStyle.Secondary).setDisabled(clampedPage >= totalPages - 1),
    ));
  }

  return { embeds: [embed], components };
}

async function handleTicketPage(interaction) {
  const [, guildId, pageStr] = interaction.customId.split(':');
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.update({ content: 'Server nicht gefunden.', embeds: [], components: [] });
  const guildConfig = guildStore.getGuild(guildId);
  await interaction.update(buildTicketPanelPayload(guild, guildConfig, parseInt(pageStr, 10)));
}

function sanitizeChannelName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 90) || 'ticket';
}

async function handleTicketSelect(interaction) {
  const [, guildId] = interaction.customId.split(':');
  const categoryTicketId = interaction.values[0];
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.update({ content: 'Server nicht gefunden.', embeds: [], components: [] });

  const guildConfig = guildStore.getGuild(guildId);
  const category = guildConfig.tickets.categories.find((c) => c.id === categoryTicketId);
  if (!category) {
    await interaction.update({ content: 'Diese Kategorie existiert nicht mehr.', embeds: [], components: [] });
    return;
  }

  if (ticketStore.hasOpenTicket(guildId, interaction.user.id, categoryTicketId)) {
    await interaction.reply({ content: 'Du hast in dieser Kategorie bereits ein offenes Ticket.', ephemeral: true });
    return;
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (category.roleId) {
    overwrites.push({ id: category.roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${sanitizeChannelName(interaction.user.username)}`,
      type: ChannelType.GuildText,
      parent: category.categoryId || undefined,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    await interaction.reply({ content: `Ticket-Channel konnte nicht erstellt werden: ${err.message}`, ephemeral: true });
    return;
  }

  ticketStore.createTicket(channel.id, {
    guildId,
    userId: interaction.user.id,
    categoryTicketId,
    categoryName: category.name,
    roleId: category.roleId,
    staffOnlyClose: category.staffOnlyClose,
  });

  const embed = new EmbedBuilder()
    .setTitle(category.name)
    .setDescription(guildConfig.tickets.openMessage)
    .setColor(0x3b6fd6)
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket-close:${channel.id}`).setLabel('🔒 Ticket schließen').setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    content: `<@${interaction.user.id}>${category.roleId ? ` <@&${category.roleId}>` : ''}`,
    embeds: [embed],
    components: [closeRow],
    allowedMentions: { users: [interaction.user.id], roles: category.roleId ? [category.roleId] : [] },
  });

  await interaction.reply({ content: `Dein Ticket wurde erstellt: ${channel}`, ephemeral: true });
}

async function handleTicketClose(interaction) {
  const [, channelId] = interaction.customId.split(':');
  const ticket = ticketStore.getTicket(channelId);
  if (!ticket) {
    await interaction.reply({ content: 'Dieses Ticket ist nicht mehr bekannt (evtl. schon geschlossen).', ephemeral: true });
    return;
  }

  const isOpener = interaction.user.id === ticket.userId;
  const hasStaffPerms = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)
    || (ticket.roleId && interaction.member.roles.cache.has(ticket.roleId));

  if (ticket.staffOnlyClose && !hasStaffPerms) {
    await interaction.reply({ content: 'Nur Teammitglieder (die zuständige Rolle oder "Kanäle verwalten") dürfen dieses Ticket schließen.', ephemeral: true });
    return;
  }
  if (!ticket.staffOnlyClose && !hasStaffPerms && !isOpener) {
    await interaction.reply({ content: 'Nur der Ticket-Ersteller oder das Team darf dieses Ticket schließen.', ephemeral: true });
    return;
  }

  const guildConfig = guildStore.getGuild(ticket.guildId);
  const t = guildConfig.tickets;

  const closedEmbed = new EmbedBuilder()
    .setTitle(t.closedTitle)
    .setDescription(t.closedMessage)
    .setColor(0x95a5a6)
    .setTimestamp();

  await interaction.reply({ embeds: [closedEmbed] });

  const guild = interaction.client.guilds.cache.get(ticket.guildId);
  const opener = guild ? await guild.members.fetch(ticket.userId).catch(() => null) : null;

  // Feedback-Anfrage per DM an den Ticket-Ersteller (falls Feedback-Kanal konfiguriert ist)
  if (opener && t.feedbackChannelId) {
    const catB64 = Buffer.from(ticket.categoryName || '').toString('base64url');
    const starRow = new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map((n) =>
        new ButtonBuilder()
          .setCustomId(`ticket-star:${n}:${ticket.guildId}:${ticket.userId}:${catB64}`)
          .setLabel('⭐'.repeat(n))
          .setStyle(ButtonStyle.Secondary)),
    );
    const feedbackEmbed = new EmbedBuilder()
      .setTitle('Wie war dein Support-Erlebnis?')
      .setDescription(`Dein Ticket **${ticket.categoryName}** auf **${guild?.name || 'dem Server'}** wurde geschlossen. Bitte bewerte kurz, wie es war.`)
      .setColor(0xf1c40f);

    await opener.send({ embeds: [feedbackEmbed], components: [starRow] }).catch(() => {});
  } else if (opener) {
    await opener.send(`Dein Ticket **${ticket.categoryName}** wurde geschlossen.`).catch(() => {});
  }

  ticketStore.deleteTicket(channelId);

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 8000);
}

async function handleFeedbackStarClick(interaction) {
  const [, stars, guildId, userId, catB64] = interaction.customId.split(':');
  const modal = new ModalBuilder()
    .setCustomId(`ticket-feedback-modal:${stars}:${guildId}:${userId}:${catB64}`)
    .setTitle('Kurzes Feedback');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Kurze Begründung (Pflichtfeld)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

async function handleFeedbackModalSubmit(interaction) {
  const [, stars, guildId, userId, catB64] = interaction.customId.split(':');
  const reason = interaction.fields.getTextInputValue('reason');
  const categoryName = Buffer.from(catB64, 'base64url').toString('utf-8') || 'Ticket';

  const guildConfig = guildStore.getGuild(guildId);
  const feedbackChannelId = guildConfig.tickets.feedbackChannelId;
  const guild = interaction.client.guilds.cache.get(guildId);

  if (feedbackChannelId && guild) {
    const feedbackChannel = await guild.channels.fetch(feedbackChannelId).catch(() => null);
    if (feedbackChannel) {
      const embed = new EmbedBuilder()
        .setTitle(`Neues Feedback — ${'⭐'.repeat(Number(stars))}${'☆'.repeat(5 - Number(stars))}`)
        .addFields(
          { name: 'Kategorie', value: categoryName, inline: true },
          { name: 'Nutzer', value: `<@${userId}>`, inline: true },
          { name: 'Bewertung', value: `${stars}/5`, inline: true },
          { name: 'Grund', value: reason },
        )
        .setColor(0xf1c40f)
        .setTimestamp();
      await feedbackChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  await interaction.reply({ content: 'Danke für dein Feedback! 🙏', ephemeral: true });
}

module.exports = {
  buildTicketPanelPayload,
  handleTicketPage,
  handleTicketSelect,
  handleTicketClose,
  handleFeedbackStarClick,
  handleFeedbackModalSubmit,
};
