const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const guildStore = require('./guildStore');

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const captchaChallenges = new Map(); // `${guildId}:${userId}` -> { code, expiresAt }

function generateCode(length = 5) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen (I,O,0,1)
  let code = '';
  for (let i = 0; i < length; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function buildVerificationPanel(guild, guildConfig) {
  const v = guildConfig.verification;
  const embed = new EmbedBuilder()
    .setTitle(v.title)
    .setDescription(v.message)
    .setColor(0x3b6fd6);

  if (v.bannerUrl) embed.setImage(v.bannerUrl);
  if (v.logoUrl) embed.setThumbnail(v.logoUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`verify:${guild.id}`)
      .setLabel('✅ Verifizieren')
      .setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [row] };
}

async function applyVerificationRoles(interactionMember, guildConfig) {
  const v = guildConfig.verification;
  const results = { granted: false, removed: false, errors: [] };

  if (v.grantRoleId) {
    try {
      await interactionMember.roles.add(v.grantRoleId);
      results.granted = true;
    } catch (err) {
      results.errors.push(`Rolle konnte nicht vergeben werden: ${err.message}`);
    }
  }
  if (v.removeRoleId) {
    try {
      await interactionMember.roles.remove(v.removeRoleId);
      results.removed = true;
    } catch (err) {
      results.errors.push(`Rolle konnte nicht entfernt werden: ${err.message}`);
    }
  }
  return results;
}

async function handleVerifyButtonClick(interaction) {
  const guildId = interaction.guild.id;
  const guildConfig = guildStore.getGuild(guildId);
  const v = guildConfig.verification;

  if (v.captchaEnabled) {
    const code = generateCode();
    captchaChallenges.set(`${guildId}:${interaction.user.id}`, { code, expiresAt: Date.now() + CAPTCHA_TTL_MS });

    const modal = new ModalBuilder()
      .setCustomId(`verify-captcha:${guildId}`)
      .setTitle('Verifizierung');

    const input = new TextInputBuilder()
      .setCustomId('code')
      .setLabel(`Gib diesen Code ein: ${code}`)
      .setStyle(TextInputStyle.Short)
      .setMinLength(code.length)
      .setMaxLength(code.length)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  const results = await applyVerificationRoles(interaction.member, guildConfig);
  await interaction.reply({
    content: results.errors.length
      ? `Verifiziert, aber es gab Probleme:\n${results.errors.join('\n')}\n(Prüfe, ob die Bot-Rolle über den zugewiesenen Rollen steht und "Rollen verwalten" hat.)`
      : 'Du bist jetzt verifiziert! ✅',
    ephemeral: true,
  });
}

async function handleCaptchaModalSubmit(interaction) {
  const [, guildId] = interaction.customId.split(':');
  const key = `${guildId}:${interaction.user.id}`;
  const challenge = captchaChallenges.get(key);
  const entered = interaction.fields.getTextInputValue('code').trim().toUpperCase();

  if (!challenge || Date.now() > challenge.expiresAt) {
    captchaChallenges.delete(key);
    await interaction.reply({ content: 'Der Code ist abgelaufen. Bitte klicke erneut auf "Verifizieren".', ephemeral: true });
    return;
  }

  if (entered !== challenge.code) {
    captchaChallenges.delete(key);
    await interaction.reply({ content: 'Falscher Code. Bitte klicke erneut auf "Verifizieren", um einen neuen Code zu bekommen.', ephemeral: true });
    return;
  }

  captchaChallenges.delete(key);
  const guildConfig = guildStore.getGuild(guildId);
  const results = await applyVerificationRoles(interaction.member, guildConfig);
  await interaction.reply({
    content: results.errors.length
      ? `Verifiziert, aber es gab Probleme:\n${results.errors.join('\n')}\n(Prüfe, ob die Bot-Rolle über den zugewiesenen Rollen steht und "Rollen verwalten" hat.)`
      : 'Du bist jetzt verifiziert! ✅',
    ephemeral: true,
  });
}

module.exports = { buildVerificationPanel, handleVerifyButtonClick, handleCaptchaModalSubmit };
