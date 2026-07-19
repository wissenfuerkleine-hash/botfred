require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registriere ${commands.length} Slash-Commands global...`);
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log(`✅ ${data.length} Commands erfolgreich registriert.`);
  } catch (error) {
    console.error('❌ Fehler beim Registrieren der Commands:', error);
  }
})();
