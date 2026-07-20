require('dotenv').config();
const { REST, Routes } = require('discord.js');

async function main() {
  console.log('--- Bot-Diagnose ---\n');

  const token = process.env.DISCORD_TOKEN;
  const clientIdFromEnv = process.env.CLIENT_ID;

  if (!token) {
    console.log('❌ DISCORD_TOKEN fehlt in der .env. Ohne das geht gar nichts.');
    return;
  }
  if (!clientIdFromEnv) {
    console.log('❌ CLIENT_ID fehlt in der .env.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  // 1) Gehört der Token wirklich zur App mit dieser CLIENT_ID?
  let app;
  try {
    app = await rest.get(Routes.oauth2CurrentApplication());
  } catch (err) {
    console.log('❌ DISCORD_TOKEN ist ungültig oder abgelaufen. Fehler:', err.message);
    console.log('   -> Im Developer Portal unter "Bot" ein neues Token generieren ("Reset Token") und in .env eintragen.');
    return;
  }

  console.log(`✅ Token ist gültig. Zugehörige App: "${app.name}" (ID: ${app.id})`);

  if (app.id !== clientIdFromEnv) {
    console.log(`❌ PROBLEM GEFUNDEN: CLIENT_ID in deiner .env (${clientIdFromEnv}) passt NICHT zur echten App-ID (${app.id}).`);
    console.log(`   -> Trage in .env ein: CLIENT_ID=${app.id}`);
    console.log('   -> Danach npm run deploy-commands erneut ausführen.');
    return;
  }
  console.log('✅ CLIENT_ID in .env stimmt mit der echten App-ID überein.');

  // 2) Sind global Commands überhaupt registriert?
  let commands;
  try {
    commands = await rest.get(Routes.applicationCommands(app.id));
  } catch (err) {
    console.log('❌ Konnte registrierte Commands nicht abrufen:', err.message);
    return;
  }

  if (!commands || commands.length === 0) {
    console.log('❌ PROBLEM GEFUNDEN: Es sind aktuell 0 globale Commands bei Discord registriert.');
    console.log('   -> Führe npm run deploy-commands aus und schau, ob dabei ein Fehler erscheint.');
    return;
  }

  console.log(`✅ ${commands.length} globale Commands sind bei Discord registriert:`);
  commands.forEach((c) => console.log(`   - /${c.name}`));

  console.log('\nWenn hier alles ✅ ist, aber die Commands in Discord trotzdem nicht auftauchen:');
  console.log('1. Discord-App komplett schließen und neu öffnen (nicht nur minimieren).');
  console.log('2. Prüfen, ob der Bot beim Einladen wirklich mit "applications.commands" UND "bot" Scope autorisiert wurde');
  console.log('   (im Zweifel: Bot aus dem Server entfernen und über eine frisch erzeugte OAuth2-URL neu einladen).');
  console.log('3. Bis zu 1 Stunde warten (globale Commands brauchen bei Discord manchmal etwas, bis sie überall ankommen).');
}

main().catch((err) => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
