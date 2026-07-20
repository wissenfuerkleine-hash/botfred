const { REST, Routes } = require('discord.js');
const config = require('./config');
const { commands } = require('./commands');

async function main() {
  if (!config.token || !config.clientId) {
    console.error('DISCORD_TOKEN und CLIENT_ID muessen in .env gesetzt sein.');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(config.token);

  console.log(`Registriere ${commands.length} globale Slash-Commands ...`);
  await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
  console.log('Fertig. Globale Commands koennen bis zu 1 Stunde brauchen, bis sie ueberall sichtbar sind.');
}

main().catch((err) => {
  console.error('Fehler beim Registrieren der Commands:', err);
  process.exit(1);
});
