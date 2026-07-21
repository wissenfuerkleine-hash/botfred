const { EmbedBuilder } = require('discord.js');
const guildStore = require('./guildStore');

function buildStatusEmbed(guild, guildConfig) {
  const rp = guildConfig.rp;
  return new EmbedBuilder()
    .setTitle('📊 RP-Status')
    .setDescription(rp.active ? '🟢 **RP ist gestartet**' : '🔴 **RP ist gestoppt**')
    .addFields({ name: 'Mitglieder auf dem Server', value: String(guild.memberCount ?? '?'), inline: true })
    .setColor(rp.active ? 0x2ecc71 : 0xc9584f)
    .setTimestamp();
}

// Aktualisiert das dauerhafte Status-Panel im konfigurierten Kanal (falls vorhanden).
async function refreshStatusPanel(guild) {
  const guildConfig = guildStore.getGuild(guild.id);
  const rp = guildConfig.rp;
  if (!rp.statusChannelId) return;

  const channel = await guild.channels.fetch(rp.statusChannelId).catch(() => null);
  if (!channel) return;

  const embed = buildStatusEmbed(guild, guildConfig);

  if (rp.statusMessageId) {
    const existing = await channel.messages.fetch(rp.statusMessageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] }).catch(() => {});
      return;
    }
  }

  // Noch keine Panel-Nachricht vorhanden (oder wurde gelöscht) -> neu senden
  const sent = await channel.send({ embeds: [embed] }).catch(() => null);
  if (sent) {
    guildStore.setRp(guild.id, { statusMessageId: sent.id });
  }
}

async function triggerRpStart(guild) {
  const guildConfig = guildStore.getGuild(guild.id);
  const rp = guildConfig.rp;
  guildStore.setRp(guild.id, { active: true });

  if (rp.startChannelId) {
    const channel = await guild.channels.fetch(rp.startChannelId).catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(rp.startTitle)
        .setDescription(rp.startMessage)
        .setColor(0x2ecc71)
        .setTimestamp();
      await channel.send({
        content: rp.startRoleId ? `<@&${rp.startRoleId}>` : undefined,
        embeds: [embed],
        allowedMentions: rp.startRoleId ? { roles: [rp.startRoleId] } : undefined,
      }).catch(() => {});
    }
  }

  await refreshStatusPanel(guild);
}

async function triggerRpStop(guild) {
  const guildConfig = guildStore.getGuild(guild.id);
  const rp = guildConfig.rp;
  guildStore.setRp(guild.id, { active: false });

  if (rp.stopChannelId) {
    const channel = await guild.channels.fetch(rp.stopChannelId).catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(rp.stopTitle)
        .setDescription(rp.stopMessage)
        .setColor(0xc9584f)
        .setTimestamp();
      await channel.send({
        content: rp.stopRoleId ? `<@&${rp.stopRoleId}>` : undefined,
        embeds: [embed],
        allowedMentions: rp.stopRoleId ? { roles: [rp.stopRoleId] } : undefined,
      }).catch(() => {});
    }
  }

  await refreshStatusPanel(guild);
}

module.exports = { buildStatusEmbed, refreshStatusPanel, triggerRpStart, triggerRpStop };
