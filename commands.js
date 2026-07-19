const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-warteraum')
    .setDescription('Setzt den Warteraum-Voice-Channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('channel').setDescription('Voice-Channel').setRequired(false))
    .addStringOption(o => o.setName('channel_id').setDescription('Channel-ID (falls nicht im Dropdown)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('setup-anfragekanal')
    .setDescription('Setzt den Anfrage-Kanal (Text)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('channel').setDescription('Text-Channel').setRequired(false))
    .addStringOption(o => o.setName('channel_id').setDescription('Channel-ID').setRequired(false)),

  new SlashCommandBuilder()
    .setName('buero')
    .setDescription('Büros verwalten')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('add').setDescription('Büro hinzufügen')
      .addStringOption(o => o.setName('name').setDescription('Name des Büros').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Voice-Channel').setRequired(false))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(false)))
    .addSubcommand(sub => sub.setName('add-id').setDescription('Büro per ID hinzufügen')
      .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))
      .addStringOption(o => o.setName('channel_id').setDescription('Channel-ID').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(false)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Büro entfernen')
      .addChannelOption(o => o.setName('channel').setDescription('Voice-Channel').setRequired(false)))
    .addSubcommand(sub => sub.setName('remove-id').setDescription('Büro per ID entfernen')
      .addStringOption(o => o.setName('channel_id').setDescription('Channel-ID').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('Alle Büros anzeigen')),

  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Einstellungen ändern')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('dm-text').setDescription('DM-Text der Büroauswahl')
      .addStringOption(o => o.setName('text').setDescription('Text (Platzhalter: {user}, {server})').setRequired(true)))
    .addSubcommand(sub => sub.setName('closed-text').setDescription('Text bei geschlossenem Büro')
      .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)))
    .addSubcommand(sub => sub.setName('musik-datei').setDescription('Musik-URL (direkte Datei)')
      .addStringOption(o => o.setName('url').setDescription('Direkter Link zur Audiodatei').setRequired(true)))
    .addSubcommand(sub => sub.setName('musik-youtube').setDescription('Wartemusik von YouTube')
      .addStringOption(o => o.setName('url').setDescription('YouTube-URL').setRequired(true)))
    .addSubcommand(sub => sub.setName('musik-spotify').setDescription('Wartemusik von Spotify')
      .addStringOption(o => o.setName('link').setDescription('Spotify-Link').setRequired(true)))
    .addSubcommand(sub => sub.setName('lautstaerke').setDescription('Lautstärke (0–100 %)')
      .addIntegerOption(o => o.setName('prozent').setDescription('0–100').setMinValue(0).setMaxValue(100).setRequired(true)))
    .addSubcommand(sub => sub.setName('oeffnungszeiten').setDescription('Öffnungszeiten')
      .addBooleanOption(o => o.setName('aktiv').setDescription('Öffnungszeiten aktivieren').setRequired(true))
      .addStringOption(o => o.setName('start').setDescription('Startzeit z.B. 09:00').setRequired(false))
      .addStringOption(o => o.setName('ende').setDescription('Endzeit z.B. 18:00').setRequired(false))
      .addStringOption(o => o.setName('zeitzone').setDescription('Zeitzone z.B. Europe/Berlin').setRequired(false))),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Aktuelle Konfiguration des Servers anzeigen')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('admin-panel')
    .setDescription('Globales Admin-Panel (nur Bot-Besitzer)'),
];

module.exports = commands.map(c => c.toJSON());
