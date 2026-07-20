const {
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const PAGE_SIZE = 25; // Discord erlaubt maximal 25 Optionen pro Select-Menu

function buildOfficeSelectPayload(guild, guildConfig, page, descriptionText) {
  const offices = guildConfig.offices;
  const showGeneral = guildConfig.generalOffice?.enabled && page === 0;
  const totalPages = Math.max(1, Math.ceil(offices.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageOffices = offices.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const officeOptions = pageOffices.map((office) => {
    const channel = guild.channels.cache.get(office.channelId);
    const occupied = channel ? channel.members.size > 0 : false;
    return {
      label: office.name.slice(0, 100),
      description: occupied ? 'Belegt' : 'Frei',
      value: office.channelId,
      emoji: office.emoji || (occupied ? '🔴' : '🟢'),
    };
  });

  const generalOption = showGeneral ? [{
    label: 'Allgemeine Anfrage',
    description: 'Kein bestimmtes Büro',
    value: 'general',
    emoji: guildConfig.generalOffice.emoji || '🔔',
  }] : [];

  // Discord erlaubt max. 25 Optionen; "Allgemeine Anfrage" hat auf Seite 1 Vorrang.
  const options = [...generalOption, ...officeOptions].slice(0, PAGE_SIZE);

  const components = [];

  if (options.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`office-select:${guild.id}:${clampedPage}`)
      .setPlaceholder('Büro wählen')
      .addOptions(options);
    components.push(new ActionRowBuilder().addComponents(select));
  }

  if (totalPages > 1) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`office-page:${guild.id}:${clampedPage - 1}`)
        .setLabel('◀ Zurück')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(clampedPage === 0),
      new ButtonBuilder()
        .setCustomId(`office-page:${guild.id}:${clampedPage + 1}`)
        .setLabel('Weiter ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(clampedPage >= totalPages - 1),
    );
    components.push(navRow);
  }

  const embed = new EmbedBuilder()
    .setTitle('Büro wählen')
    .setDescription(descriptionText + (totalPages > 1 ? `\n\nSeite ${clampedPage + 1}/${totalPages}` : ''))
    .setColor(0x5865f2);

  return { embeds: [embed], components };
}

module.exports = { buildOfficeSelectPayload, PAGE_SIZE };
