const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const guildStore = require('./guildStore');
const voiceMusic = require('./voiceMusic');
const adminPanel = require('./adminPanel');
const botState = require('./botState');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-warteraum')
    .setDescription('Legt fest, welcher Voice-Channel der Warteraum ist.')
    .addChannelOption((opt) =>
      opt.setName('channel')
        .setDescription('Voice-Channel, der als Warteraum dient')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false))
    .addStringOption((opt) =>
      opt.setName('channel_id')
        .setDescription('Alternativ: Channel-ID direkt eingeben')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('setup-anfragekanal')
    .setDescription('Legt fest, in welchem Text-Channel Büroanfragen gepostet werden.')
    .addChannelOption((opt) =>
      opt.setName('channel')
        .setDescription('Text-Channel für Büroanfragen')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addStringOption((opt) =>
      opt.setName('channel_id')
        .setDescription('Alternativ: Channel-ID direkt eingeben')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('buero')
    .setDescription('Büros verwalten')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('add')
        .setDescription('Fügt ein Büro hinzu (Channel per Auswahl)')
        .addStringOption((opt) => opt.setName('name').setDescription('Anzeigename, z. B. "Henris Büro"').setRequired(true))
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('Voice-Channel des Büros')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji für die Anzeige, z. B. 🧑‍💼').setRequired(false))
        .addRoleOption((opt) => opt.setName('role').setDescription('Rolle, die bei einer Anfrage für dieses Büro gepingt wird').setRequired(false)))
    .addSubcommand((sub) =>
      sub.setName('add-id')
        .setDescription('Fügt ein Büro über die Channel-ID hinzu (falls der Channel nicht auswählbar ist)')
        .addStringOption((opt) => opt.setName('name').setDescription('Anzeigename, z. B. "Henris Büro"').setRequired(true))
        .addStringOption((opt) => opt.setName('channel_id').setDescription('Channel-ID des Voice-Channels').setRequired(true))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji für die Anzeige, z. B. 🧑‍💼').setRequired(false))
        .addStringOption((opt) => opt.setName('role_id').setDescription('Rollen-ID, die bei einer Anfrage gepingt wird').setRequired(false)))
    .addSubcommand((sub) =>
      sub.setName('remove')
        .setDescription('Entfernt ein Büro')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('Voice-Channel des Büros')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('remove-id')
        .setDescription('Entfernt ein Büro über die Channel-ID')
        .addStringOption((opt) => opt.setName('channel_id').setDescription('Channel-ID des Büros').setRequired(true)))
    .addSubcommand((sub) => sub.setName('list').setDescription('Zeigt alle konfigurierten Büros')),

  // ---- Setup-Panel: Texte, Musik, Lautstärke, Öffnungszeiten ----
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Setup-Panel: DM-Text, Musik, Lautstärke, Öffnungszeiten')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('dm-text')
        .setDescription('Legt den Text der DM-Nachricht mit der Büro-Auswahl fest')
        .addStringOption((opt) =>
          opt.setName('text')
            .setDescription('Text. Platzhalter: {user} = Nutzername, {server} = Servername')
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('closed-text')
        .setDescription('Legt den Text fest, der außerhalb der Öffnungszeiten gesendet wird')
        .addStringOption((opt) =>
          opt.setName('text')
            .setDescription('Text. Platzhalter: {user} = Nutzername, {server} = Servername')
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('musik-datei')
        .setDescription('Wartemusik über einen direkten Datei-Link setzen (z. B. hochgeladenes mp3)')
        .addStringOption((opt) =>
          opt.setName('url')
            .setDescription('Direkter Link zur Audiodatei (mp3/ogg/wav)')
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('musik-youtube')
        .setDescription('Wartemusik über einen YouTube-Link setzen')
        .addStringOption((opt) =>
          opt.setName('url')
            .setDescription('YouTube-Video- oder Playlist-Link')
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('musik-spotify')
        .setDescription('Wartemusik über einen Spotify-Link setzen (wird als YouTube-Suche abgespielt)')
        .addStringOption((opt) =>
          opt.setName('link')
            .setDescription('Spotify-Track-Link')
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('lautstaerke')
        .setDescription('Legt die Lautstärke der Wartemusik fest (0-100)')
        .addIntegerOption((opt) =>
          opt.setName('prozent')
            .setDescription('Lautstärke in Prozent')
            .setMinValue(0)
            .setMaxValue(100)
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('oeffnungszeiten')
        .setDescription('Legt die Öffnungszeiten des Supports fest')
        .addBooleanOption((opt) => opt.setName('aktiv').setDescription('Öffnungszeiten aktivieren/deaktivieren').setRequired(true))
        .addStringOption((opt) => opt.setName('start').setDescription('Startzeit, Format HH:MM, z. B. 09:00').setRequired(false))
        .addStringOption((opt) => opt.setName('ende').setDescription('Endzeit, Format HH:MM, z. B. 18:00').setRequired(false))
        .addStringOption((opt) => opt.setName('zeitzone').setDescription('z. B. Europe/Berlin (Standard)').setRequired(false))),

  new SlashCommandBuilder()
    .setName('allgemeines-buero')
    .setDescription('"Allgemeine Anfrage" einrichten (kein festes Büro, nur Rolle + Emoji + Kategorie)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((opt) => opt.setName('aktiv').setDescription('Allgemeine Anfrage in der Büro-Auswahl anzeigen?').setRequired(true))
    .addStringOption((opt) => opt.setName('emoji').setDescription('Emoji für die Anzeige, z. B. 🔔').setRequired(false))
    .addRoleOption((opt) => opt.setName('role').setDescription('Rolle, die bei einer allgemeinen Anfrage gepingt wird').setRequired(false))
    .addStringOption((opt) => opt.setName('role_id').setDescription('Alternativ: Rollen-ID direkt eingeben').setRequired(false))
    .addChannelOption((opt) =>
      opt.setName('kategorie')
        .setDescription('Kategorie, in der die allgemeinen Büro-Channels liegen')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false))
    .addStringOption((opt) => opt.setName('kategorie_id').setDescription('Alternativ: Kategorie-ID direkt eingeben').setRequired(false)),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Zeigt die aktuelle Konfiguration des Support-Bots auf diesem Server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Eigenständiger, prominenter Befehl für Öffnungszeiten (macht dasselbe wie
  // /settings oeffnungszeiten + /settings closed-text, nur bequemer erreichbar)
  new SlashCommandBuilder()
    .setName('buerozeiten')
    .setDescription('Öffnungszeiten des Supports festlegen')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((opt) => opt.setName('aktiv').setDescription('Öffnungszeiten aktivieren/deaktivieren').setRequired(true))
    .addStringOption((opt) => opt.setName('start').setDescription('Startzeit, Format HH:MM, z. B. 09:00').setRequired(false))
    .addStringOption((opt) => opt.setName('ende').setDescription('Endzeit, Format HH:MM, z. B. 18:00').setRequired(false))
    .addStringOption((opt) => opt.setName('zeitzone').setDescription('z. B. Europe/Berlin (Standard)').setRequired(false))
    .addStringOption((opt) => opt.setName('geschlossen_text').setDescription('Text, der außerhalb der Öffnungszeiten gesendet wird').setRequired(false)),

  // Bot-weites Admin-Panel: nur für den/die Bot-Besitzer (per OWNER_IDS in .env),
  // zusätzlich per Passwort geschützt. Auf Servern nur für Admins sichtbar,
  // per DM für den Besitzer immer nutzbar.
  new SlashCommandBuilder()
    .setName('admin-panel')
    .setDescription('Bot-weites Admin-Panel (nur für den Bot-Besitzer)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(true),
].map((c) => c.toJSON());

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

async function handleCommand(interaction) {
  const { commandName, guildId } = interaction;

  if (commandName === 'admin-panel') {
    await adminPanel.handleAdminPanelCommand(interaction);
    return;
  }

  if (botState.isPaused()) {
    await interaction.reply({ content: 'Der Bot ist gerade global deaktiviert (Wartungsmodus).', ephemeral: true });
    return;
  }

  // Server, die vom Bot-Besitzer im /admin-panel gesperrt wurden, ignorieren alle anderen Befehle
  if (guildId && guildStore.getGuild(guildId).locked) {
    await interaction.reply({ content: 'Der Bot wurde für diesen Server gesperrt.', ephemeral: true });
    return;
  }

  if (commandName === 'setup-warteraum') {
    const channel = interaction.options.getChannel('channel');
    const channelId = interaction.options.getString('channel_id');
    const resolvedId = channel?.id || channelId?.trim();
    if (!resolvedId) {
      await interaction.reply({ content: 'Bitte entweder `channel` auswählen oder `channel_id` eingeben.', ephemeral: true });
      return;
    }
    if (!channel) {
      const fetched = await interaction.guild.channels.fetch(resolvedId).catch(() => null);
      if (!fetched) {
        await interaction.reply({ content: 'Kein Channel mit dieser ID gefunden.', ephemeral: true });
        return;
      }
    }
    guildStore.setWaitingRoom(guildId, resolvedId);
    await interaction.reply({ content: `Warteraum gesetzt auf <#${resolvedId}>.`, ephemeral: true });
    return;
  }

  if (commandName === 'setup-anfragekanal') {
    const channel = interaction.options.getChannel('channel');
    const channelId = interaction.options.getString('channel_id');
    const resolvedId = channel?.id || channelId?.trim();
    if (!resolvedId) {
      await interaction.reply({ content: 'Bitte entweder `channel` auswählen oder `channel_id` eingeben.', ephemeral: true });
      return;
    }
    if (!channel) {
      const fetched = await interaction.guild.channels.fetch(resolvedId).catch(() => null);
      if (!fetched) {
        await interaction.reply({ content: 'Kein Channel mit dieser ID gefunden.', ephemeral: true });
        return;
      }
    }
    guildStore.setRequestChannel(guildId, resolvedId);
    await interaction.reply({ content: `Anfrage-Kanal gesetzt auf <#${resolvedId}>.`, ephemeral: true });
    return;
  }

  if (commandName === 'buero') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const name = interaction.options.getString('name');
      const channel = interaction.options.getChannel('channel');
      const emoji = interaction.options.getString('emoji');
      const role = interaction.options.getRole('role');
      const result = guildStore.addOffice(guildId, name, channel.id, emoji, role?.id);
      if (!result.ok) {
        await interaction.reply({ content: 'Dieser Channel ist bereits als Büro registriert.', ephemeral: true });
      } else {
        await interaction.reply({ content: `Büro ${emoji || ''} **${name}** (${channel}) hinzugefügt.${role ? ` Anfragen pingen ${role}.` : ''}`, ephemeral: true });
      }
      return;
    }

    if (sub === 'add-id') {
      const name = interaction.options.getString('name');
      const channelId = interaction.options.getString('channel_id').trim();
      const emoji = interaction.options.getString('emoji');
      const roleId = interaction.options.getString('role_id')?.trim() || null;

      if (!/^\d{15,25}$/.test(channelId)) {
        await interaction.reply({ content: 'Das sieht nicht nach einer gültigen Channel-ID aus (nur Zahlen, meist 17-19 Stellen).', ephemeral: true });
        return;
      }
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        await interaction.reply({ content: 'Kein Channel mit dieser ID auf diesem Server gefunden.', ephemeral: true });
        return;
      }
      if (roleId) {
        if (!/^\d{15,25}$/.test(roleId)) {
          await interaction.reply({ content: 'Das sieht nicht nach einer gültigen Rollen-ID aus.', ephemeral: true });
          return;
        }
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
          await interaction.reply({ content: 'Keine Rolle mit dieser ID auf diesem Server gefunden.', ephemeral: true });
          return;
        }
      }
      const result = guildStore.addOffice(guildId, name, channelId, emoji, roleId);
      if (!result.ok) {
        await interaction.reply({ content: 'Dieser Channel ist bereits als Büro registriert.', ephemeral: true });
      } else {
        await interaction.reply({ content: `Büro ${emoji || ''} **${name}** (<#${channelId}>) hinzugefügt.${roleId ? ` Anfragen pingen <@&${roleId}>.` : ''}`, ephemeral: true });
      }
      return;
    }

    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel');
      const removed = guildStore.removeOffice(guildId, channel.id);
      await interaction.reply({
        content: removed ? `Büro für ${channel} entfernt.` : `Kein Büro für ${channel} gefunden.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'remove-id') {
      const channelId = interaction.options.getString('channel_id').trim();
      const removed = guildStore.removeOffice(guildId, channelId);
      await interaction.reply({
        content: removed ? `Büro für Channel-ID ${channelId} entfernt.` : `Kein Büro mit dieser Channel-ID gefunden.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'list') {
      const guildConfig = guildStore.getGuild(guildId);
      if (guildConfig.offices.length === 0) {
        await interaction.reply({ content: 'Es sind noch keine Büros konfiguriert.', ephemeral: true });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`Konfigurierte Büros (${guildConfig.offices.length})`)
        .setDescription(guildConfig.offices.map((o) => `${o.emoji || '•'} **${o.name}** — <#${o.channelId}>${o.roleId ? ` — pingt <@&${o.roleId}>` : ''}`).join('\n').slice(0, 4000))
        .setColor(0x3498db);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  if (commandName === 'allgemeines-buero') {
    const aktiv = interaction.options.getBoolean('aktiv');
    const emoji = interaction.options.getString('emoji');
    const role = interaction.options.getRole('role');
    const roleIdInput = interaction.options.getString('role_id')?.trim();
    const kategorie = interaction.options.getChannel('kategorie');
    const kategorieIdInput = interaction.options.getString('kategorie_id')?.trim();

    let roleId = role?.id ?? roleIdInput ?? undefined;
    if (roleIdInput && !role) {
      if (!/^\d{15,25}$/.test(roleIdInput)) {
        await interaction.reply({ content: 'Das sieht nicht nach einer gültigen Rollen-ID aus.', ephemeral: true });
        return;
      }
      const fetchedRole = await interaction.guild.roles.fetch(roleIdInput).catch(() => null);
      if (!fetchedRole) {
        await interaction.reply({ content: 'Keine Rolle mit dieser ID auf diesem Server gefunden.', ephemeral: true });
        return;
      }
    }

    let categoryId = kategorie?.id ?? kategorieIdInput ?? undefined;
    if (kategorieIdInput && !kategorie) {
      if (!/^\d{15,25}$/.test(kategorieIdInput)) {
        await interaction.reply({ content: 'Das sieht nicht nach einer gültigen Kategorie-ID aus.', ephemeral: true });
        return;
      }
      const fetchedCategory = await interaction.guild.channels.fetch(kategorieIdInput).catch(() => null);
      if (!fetchedCategory || fetchedCategory.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content: 'Keine Kategorie mit dieser ID auf diesem Server gefunden.', ephemeral: true });
        return;
      }
    }

    const updated = guildStore.setGeneralOffice(guildId, { enabled: aktiv, emoji, roleId, categoryId });
    await interaction.reply({
      content: `Allgemeine Anfrage ${updated.generalOffice.enabled ? 'aktiviert' : 'deaktiviert'}.${updated.generalOffice.roleId ? ` Pingt <@&${updated.generalOffice.roleId}>.` : ''}${updated.generalOffice.categoryId ? ` Annehmen geht nur aus Kategorie <#${updated.generalOffice.categoryId}>.` : ' Keine Kategorie gesetzt – Annehmen geht aus jedem Voice-Channel.'}`,
      ephemeral: true,
    });
    return;
  }

  if (commandName === 'buerozeiten') {
    const aktiv = interaction.options.getBoolean('aktiv');
    const start = interaction.options.getString('start');
    const ende = interaction.options.getString('ende');
    const zeitzone = interaction.options.getString('zeitzone');
    const geschlossenText = interaction.options.getString('geschlossen_text');

    if (start && !TIME_REGEX.test(start)) {
      await interaction.reply({ content: 'Ungültige Startzeit. Bitte Format HH:MM verwenden, z. B. 09:00.', ephemeral: true });
      return;
    }
    if (ende && !TIME_REGEX.test(ende)) {
      await interaction.reply({ content: 'Ungültige Endzeit. Bitte Format HH:MM verwenden, z. B. 18:00.', ephemeral: true });
      return;
    }

    const updated = guildStore.setOpeningHours(guildId, { enabled: aktiv, start, end: ende, timezone: zeitzone });
    if (geschlossenText) guildStore.setClosedMessage(guildId, geschlossenText);

    await interaction.reply({
      content: `Öffnungszeiten ${updated.openingHours.enabled ? 'aktiviert' : 'deaktiviert'}: ${updated.openingHours.start} - ${updated.openingHours.end} (${updated.openingHours.timezone})${geschlossenText ? '\nText außerhalb der Zeiten aktualisiert.' : ''}`,
      ephemeral: true,
    });
    return;
  }

  if (commandName === 'settings') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'dm-text') {
      const text = interaction.options.getString('text');
      guildStore.setDmMessage(guildId, text);
      await interaction.reply({ content: 'DM-Text aktualisiert. Vorschau:\n\n' + text.replace('{user}', interaction.user.username).replace('{server}', interaction.guild.name), ephemeral: true });
      return;
    }

    if (sub === 'closed-text') {
      const text = interaction.options.getString('text');
      guildStore.setClosedMessage(guildId, text);
      await interaction.reply({ content: 'Text für "außerhalb der Öffnungszeiten" aktualisiert.', ephemeral: true });
      return;
    }

    if (sub === 'musik-datei') {
      const url = interaction.options.getString('url');
      guildStore.setMusic(guildId, 'file-url', url);
      await interaction.reply({ content: `Wartemusik gesetzt auf eigene Datei: ${url}\nGilt ab dem nächsten Loop-Durchlauf bzw. dem nächsten Beitritt zum Warteraum.`, ephemeral: true });
      return;
    }

    if (sub === 'musik-youtube') {
      const url = interaction.options.getString('url');
      guildStore.setMusic(guildId, 'youtube', url);
      await interaction.reply({ content: `Wartemusik gesetzt auf YouTube-Link: ${url}`, ephemeral: true });
      return;
    }

    if (sub === 'musik-spotify') {
      const link = interaction.options.getString('link');
      guildStore.setMusic(guildId, 'spotify', link);
      await interaction.reply({ content: `Wartemusik gesetzt auf Spotify-Link: ${link}\nHinweis: Spotify liefert keine Audiodaten an Bots – der Song wird anhand von Titel/Interpret automatisch auf YouTube gesucht und von dort abgespielt.`, ephemeral: true });
      return;
    }

    if (sub === 'lautstaerke') {
      const prozent = interaction.options.getInteger('prozent');
      guildStore.setVolume(guildId, prozent);
      voiceMusic.setVolumeLive(guildId, prozent);
      await interaction.reply({ content: `Lautstärke auf ${prozent}% gesetzt.`, ephemeral: true });
      return;
    }

    if (sub === 'oeffnungszeiten') {
      const aktiv = interaction.options.getBoolean('aktiv');
      const start = interaction.options.getString('start');
      const ende = interaction.options.getString('ende');
      const zeitzone = interaction.options.getString('zeitzone');

      if (start && !TIME_REGEX.test(start)) {
        await interaction.reply({ content: 'Ungültige Startzeit. Bitte Format HH:MM verwenden, z. B. 09:00.', ephemeral: true });
        return;
      }
      if (ende && !TIME_REGEX.test(ende)) {
        await interaction.reply({ content: 'Ungültige Endzeit. Bitte Format HH:MM verwenden, z. B. 18:00.', ephemeral: true });
        return;
      }

      const updated = guildStore.setOpeningHours(guildId, { enabled: aktiv, start, end: ende, timezone: zeitzone });
      await interaction.reply({
        content: `Öffnungszeiten ${updated.openingHours.enabled ? 'aktiviert' : 'deaktiviert'}: ${updated.openingHours.start} - ${updated.openingHours.end} (${updated.openingHours.timezone})`,
        ephemeral: true,
      });
    }
    return;
  }

  if (commandName === 'status') {
    const g = guildStore.getGuild(guildId);
    const waitingRoom = g.waitingRoomChannelId ? `<#${g.waitingRoomChannelId}>` : '_nicht gesetzt_';
    const requestChannel = g.requestChannelId ? `<#${g.requestChannelId}>` : '_nicht gesetzt_';
    const offices = g.offices.length
      ? g.offices.map((o) => `• **${o.name}** — <#${o.channelId}>`).join('\n')
      : '_keine Büros konfiguriert_';

    const musicLabel = {
      local: 'Standard-Datei (aus .env MUSIC_FILE)',
      'file-url': `Eigener Link: ${g.musicSource || '-'}`,
      youtube: `YouTube: ${g.musicSource || '-'}`,
      spotify: `Spotify (über YouTube): ${g.musicSource || '-'}`,
    }[g.musicMode] || 'unbekannt';

    const embed = new EmbedBuilder()
      .setTitle(`Support-Bot Status — ${interaction.guild.name}`)
      .setColor(0x5865f2)
      .addFields(
        { name: 'Warteraum', value: waitingRoom, inline: true },
        { name: 'Anfrage-Kanal', value: requestChannel, inline: true },
        { name: 'Lautstärke', value: `${g.volume}%`, inline: true },
        { name: 'Büros', value: offices },
        { name: 'Musikquelle', value: musicLabel },
        {
          name: 'Öffnungszeiten',
          value: g.openingHours.enabled
            ? `${g.openingHours.start} - ${g.openingHours.end} (${g.openingHours.timezone})`
            : 'Deaktiviert (rund um die Uhr geöffnet)',
        },
        { name: 'DM-Text', value: g.dmMessage },
        { name: 'Text außerhalb Öffnungszeiten', value: g.closedMessage },
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { commands, handleCommand };
