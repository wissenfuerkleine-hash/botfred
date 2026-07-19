const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBusyOfficeIds } = require('./voiceMusic');

const PAGE_SIZE = 25;

function buildOfficeSelectMessage(guild, cfg, page = 0) {
  const offices = cfg.offices || [];
  const busyIds = getBusyOfficeIds(guild.id);

  const totalPages = Math.ceil(offices.length / PAGE_SIZE) || 1;
  const start = page * PAGE_SIZE;
  const slice = offices.slice(start, start + PAGE_SIZE);

  const options = slice.map((office, i) => {
    const isBusy = busyIds.has(office.channelId);
    const status = isBusy ? '🔴' : '🟢';
    return {
      label: `${office.emoji || '🏢'} ${office.name}`.slice(0, 100),
      description: `${status} ${isBusy ? 'Belegt' : 'Frei'}`.slice(0, 100),
      value: `office_${guild.id}_${start + i}`,
    };
  });

  const rows = [];

  if (options.length === 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`office_select_${guild.id}_${page}`)
      .setPlaceholder('Keine Büros konfiguriert')
      .addOptions([{ label: 'Keine Büros verfügbar', value: 'none' }])
      .setDisabled(true);
    rows.push(new ActionRowBuilder().addComponents(select));
  } else {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`office_select_${guild.id}_${page}`)
      .setPlaceholder('Büro auswählen...')
      .addOptions(options);
    rows.push(new ActionRowBuilder().addComponents(select));
  }

  if (totalPages > 1) {
    const backBtn = new ButtonBuilder()
      .setCustomId(`office_page_${guild.id}_${page - 1}`)
      .setLabel('◀ Zurück')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0);

    const nextBtn = new ButtonBuilder()
      .setCustomId(`office_page_${guild.id}_${page + 1}`)
      .setLabel('Weiter ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1);

    const pageInfo = new ButtonBuilder()
      .setCustomId('page_info_noop')
      .setLabel(`Seite ${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    rows.push(new ActionRowBuilder().addComponents(backBtn, pageInfo, nextBtn));
  }

  return { content: '', components: rows };
}

module.exports = { buildOfficeSelectMessage };
