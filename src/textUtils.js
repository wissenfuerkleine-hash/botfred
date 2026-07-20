function formatMessage(template, member, guild) {
  return template
    .replaceAll('{user}', member.user.username)
    .replaceAll('{server}', guild.name);
}

module.exports = { formatMessage };
