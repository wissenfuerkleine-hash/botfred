# Office Support Bot

Discord-Bot: Wenn jemand einem Warteraum-Voice-Channel beitritt, joint der Bot
den Channel und spielt Wartemusik. Der Nutzer bekommt per DM eine Büro-Auswahl
(mit Anzeige, ob ein Büro frei oder belegt ist). Nach der Auswahl wird eine
Anfrage im Anfrage-Kanal gepostet, die per Button angenommen oder abgelehnt
werden kann. Bei Annahme wird der Nutzer automatisch ins gewählte Büro
verschoben. Über "Fall schließen" wird der Vorgang beendet.

**Läuft auf beliebig vielen Servern gleichzeitig** – jeder Server konfiguriert
seinen eigenen Warteraum, Anfrage-Kanal und seine eigenen Büros per
Slash-Command. Diese Einstellungen werden automatisch in `guildConfig.json`
gespeichert (pro Server-ID getrennt).

## 1. Bot-Application erstellen

1. Auf https://discord.com/developers/applications eine neue Application anlegen.
2. Unter "Bot" einen Bot hinzufügen, Token kopieren (geheim halten!).
3. Unter "Bot" folgende **Privileged Gateway Intents** aktivieren:
   - Server Members Intent
4. Unter "OAuth2 -> URL Generator":
   - Scopes: `bot`, `applications.commands`
   - Bot-Permissions mindestens: `View Channels`, `Send Messages`,
     `Connect`, `Speak`, `Move Members`, `Manage Channels`, `Embed Links`
5. Mit der generierten URL den Bot auf beliebig viele Server einladen.

## 2. Installation

```bash
npm install
```

Für Sprachwiedergabe wird zusätzlich `ffmpeg` benötigt (wird über
`ffmpeg-static` automatisch mitgeliefert, kein separates Installieren nötig).

## 3. Konfiguration

`.env.example` nach `.env` kopieren und ausfüllen:

```
DISCORD_TOKEN=dein-bot-token
CLIENT_ID=deine-application-id
MUSIC_FILE=./assets/wait-music.mp3
```

Eigene Wartemusik-Datei (mp3) in `assets/` ablegen (nur Musik verwenden,
an der du die Rechte hast).

## 4. Slash-Commands registrieren (einmalig, global)

```bash
npm run deploy-commands
```

Globale Commands können bis zu 1 Stunde brauchen, bis sie auf allen Servern
sichtbar sind.

## 5. Bot starten

```bash
npm start
```

## 6. Pro Server einrichten

Auf jedem Server, auf dem der Bot ist, führt ein Admin (Berechtigung
"Server verwalten") einmalig aus:

```
/setup-warteraum channel:#warteraum
/setup-anfragekanal channel:#büroanfragen
/buero add name:"Henris Büro" channel:#büro-henri emoji:🧑‍💼
/buero add name:"Annas Büro" channel:#büro-anna emoji:👩‍💼
```

Falls ein Channel in der Auswahl nicht auftaucht (z. B. bei sehr vielen
Channels), geht es auch direkt über die Channel-ID:
```
/buero add-id name:"Henris Büro" channel_id:123456789012345678 emoji:🧑‍💼
/setup-warteraum channel_id:123456789012345678
```

Weitere Befehle:
- `/buero list` – zeigt alle konfigurierten Büros
- `/buero remove channel:#büro-henri` – entfernt ein Büro (per Auswahl)
- `/buero remove-id channel_id:...` – entfernt ein Büro (per ID)

Es gibt **kein festes Limit** an Büros (auch 50+ sind kein Problem) – ab mehr
als 25 Büros zeigt die DM-Auswahl automatisch "Zurück/Weiter"-Buttons zum
Blättern, da Discord pro Dropdown maximal 25 Einträge erlaubt.

### Setup-Panel (`/settings ...`)

- `/settings dm-text text:"..."` – Text der DM mit der Büro-Auswahl.
  Platzhalter: `{user}` (Nutzername), `{server}` (Servername)
- `/settings closed-text text:"..."` – Text, der außerhalb der Öffnungszeiten gesendet wird
- `/settings musik-datei url:"https://.../mein-song.mp3"` – eigene Audiodatei per direktem Link
  (z. B. selbst irgendwo hochgeladen; muss ein **direkter** Link zur Datei sein, keine Weiterleitungsseite)
- `/settings musik-youtube url:"https://youtube.com/watch?v=..."` – Wartemusik von YouTube
- `/settings musik-spotify link:"https://open.spotify.com/track/..."` – Spotify-Link;
  Titel/Interpret werden ausgelesen und der Song automatisch auf YouTube gesucht und abgespielt
  (Spotify selbst gibt keine Audiodaten an Bots heraus – siehe Hinweis unten)
- `/settings lautstaerke prozent:50` – Lautstärke 0–100 %, wirkt sofort auf laufende Musik
- `/settings oeffnungszeiten aktiv:true start:09:00 ende:18:00 zeitzone:Europe/Berlin` –
  außerhalb dieses Zeitraums bekommt niemand die Büro-Auswahl, sondern nur den `closed-text`

### Status ansehen (`/status`)

Zeigt kompakt die aktuelle Konfiguration des Servers: Warteraum, Anfrage-Kanal,
Büros, Musikquelle, Lautstärke, Öffnungszeiten und die aktuellen Texte.

## Ablauf

1. Nutzer joint den Warteraum-Voice-Channel.
2. Bot joint denselben Channel und spielt Wartemusik in Dauerschleife.
3. Nutzer bekommt eine DM mit Dropdown "Büro wählen" (zeigt eigenes Emoji je Büro,
   sowie 🟢 frei / 🔴 belegt; bei über 25 Büros mit "Zurück/Weiter"-Buttons zum Blättern).
4. Nach Auswahl erscheint im Anfrage-Kanal eine Nachricht mit "Annehmen"/"Ablehnen".
5. Bei "Annehmen" wird der Nutzer automatisch in den Büro-Voice-Channel verschoben,
   und es erscheint ein "Fall schließen"-Button.
6. Beim Klick auf "Fall schließen" wird der Nutzer aus dem Büro-Channel getrennt,
   und in der Nachricht steht: wer den Fall geschlossen hat, wer ihn bearbeitet
   (angenommen) hat, und wie viele Minuten der Fall insgesamt gedauert hat.
7. Sobald der Warteraum leer ist, verlässt der Bot ihn wieder und stoppt die Musik.

## Globales Admin-Panel (`/admin-panel`) – nur für den Bot-Besitzer

Das ist ein server-übergreifendes Panel nur für dich als Betreiber des Bots
(nicht für normale Server-Admins). Zeigt alle Server, auf denen der Bot ist,
inkl. Server-Icon, Eigentümer und Mitgliederzahl – und erlaubt, einen Server
komplett zu sperren (der Bot ignoriert dann alle Befehle und reagiert nicht
mehr auf den Warteraum dort).

### Einrichtung

In `.env`:
```
OWNER_IDS=deine-discord-user-id
ADMIN_PANEL_PASSWORD=bxY_EV3s3HsV0vIn9csbbT4t
```

Deine Discord-User-ID bekommst du so: Discord-Einstellungen → Erweitert →
"Entwicklermodus" aktivieren → dann Rechtsklick auf dein eigenes Profil →
"ID kopieren". Mehrere Besitzer-IDs sind kommagetrennt möglich.

Das Passwort oben ist ein zufällig generierter Vorschlag – kannst du so
übernehmen oder durch ein eigenes ersetzen.

### Nutzung

1. `/admin-panel` ausführen (geht auf jedem Server, auf dem der Bot ist, oder
   direkt per DM an den Bot).
2. Es öffnet sich ein Passwort-Popup (Modal) – Passwort eingeben.
3. Danach erscheint eine Liste aller Server (mit 🟢 aktiv / 🔒 gesperrt).
4. Server aus der Liste auswählen → Detailansicht mit Icon, Eigentümer,
   Mitgliederzahl, aktueller Konfiguration.
5. Button "Sperren"/"Entsperren" klicken, um den Bot dort ein-/auszuschalten.

Der Login gilt 15 Minuten, danach muss das Passwort erneut eingegeben werden.
Wer nicht in `OWNER_IDS` steht, bekommt bei `/admin-panel` nur "Unbekannter
Befehl." zu sehen – der Befehl verrät also nach außen nicht, dass es ihn gibt.

### Weitere Besitzer hinzufügen (ohne .env-Änderung/Neustart)

Im Panel gibt es unten den Button "👤 Besitzer verwalten":
- **➕ Besitzer hinzufügen** öffnet ein Eingabefenster für eine weitere
  Discord-User-ID – die Person kann danach sofort `/admin-panel` benutzen.
- Dynamisch hinzugefügte Besitzer lassen sich dort auch wieder per
  "Entfernen"-Button löschen.
- Besitzer, die fest in `OWNER_IDS` in der `.env` stehen, werden als
  "fest in .env" markiert und lassen sich nur dort entfernen (Schutz, damit
  man sich nicht selbst aussperrt).

## RP-System

Start-/Stop-Ankündigungen fürs Roleplay, plus ein dauerhaftes Status-Panel
mit Mitgliederzahl.

### Einrichtung

```
/rp-start-setup titel:"RP gestartet" nachricht:"Das Roleplay hat begonnen!" rolle:@RPler channel:#ankuendigungen
/rp-stop-setup titel:"RP beendet" nachricht:"Das Roleplay wurde beendet." rolle:@RPler channel:#ankuendigungen
/rp-status-setup channel:#rp-status
```

Alle Parameter bei den `-setup`-Befehlen sind einzeln optional (nur was du
angibst, wird geändert); für Rolle/Channel gibt's auch `_id`-Varianten.

### Nutzung

- `/rp-start` – sendet die konfigurierte Start-Ankündigung (mit Rollen-Ping)
  und aktualisiert das Status-Panel auf 🟢 gestartet.
- `/rp-stop` – sendet die Stop-Ankündigung, Status-Panel wird 🔴 gestoppt.
- `/rp-status` – für **jeden** nutzbar, zeigt eine **nur für dich sichtbare**
  (ephemere) Kurzübersicht: aktueller RP-Status + aktuelle Mitgliederzahl.
- Das Panel aus `/rp-status-setup` bleibt dauerhaft im Kanal stehen und wird
  bei jedem `/rp-start`/`/rp-stop` automatisch aktualisiert (bearbeitet die
  bestehende Nachricht, statt eine neue zu senden).

## Backup-System

**⚠️ Mächtige, potenziell zerstörerische Funktion** – lies dir das genau durch,
bevor du `/backup-wiederherstellen` benutzt.

```
/backup-erstellen
```
Erstellt ein Backup von Rollen, Kategorien und Channels (inkl. Berechtigungen)
dieses Servers und gibt dir einen **Code** (z. B. `A1B2-C3D4-E5F6`), den nur
du siehst. Diesen Code gut aufbewahren – er wird nirgendwo sonst angezeigt.

```
/backup-wiederherstellen code:A1B2-C3D4-E5F6
```
Zeigt zuerst eine **Sicherheitsabfrage** ("Ja, alles ersetzen" / "Abbrechen").
Erst nach Bestätigung passiert etwas. Bei Bestätigung wird:
1. Aktuell **alle** Channels/Kategorien gelöscht
2. Aktuell **alle** Rollen gelöscht (außer `@everyone` und bot-verwaltete Rollen)
3. Rollen, Kategorien und Channels aus dem Backup neu angelegt (inkl. Berechtigungen,
   soweit die referenzierten Rollen/Nutzer noch existieren bzw. neu angelegt wurden)

Das kann bei größeren Servern **mehrere Minuten** dauern (Discord limitiert,
wie schnell Channels/Rollen angelegt werden können) – der Bot gibt
Zwischenstatus-Updates in der ursprünglichen Nachricht aus.

**Hinweis:** Ein Backup-Code lässt sich grundsätzlich auf jedem Server
einsetzen, auf dem der Bot ist (nicht nur dem Ursprungsserver) – praktisch,
falls du eine Serverstruktur als Vorlage auf einen anderen Server übertragen
willst, aber genau deshalb ist die Sicherheitsabfrage wichtig.

### Automatische Backups

```
/backup-setup aktiv:true intervall_stunden:24
```
Erstellt automatisch alle X Stunden ein neues Backup im Hintergrund (der Bot
prüft alle 30 Minuten, ob eins fällig ist). Mit `aktiv:false` wieder
ausschalten.

## Ticketsystem

Ein drittes, eigenständiges Modul: klassisches Ticket-Panel mit mehreren
Kategorien, pro Kategorie eigene Kategorie (für die Ticket-Channels), eigene
zuständige Rolle, eigene Schließen-Rechte. Plus 1-5-Sterne-Feedback mit Grund
nach dem Schließen.

### Einrichtung

```
/setup-ticket-panel titel:"Support-Tickets" nachricht:"Wähle unten eine Kategorie." banner_url:"https://.../banner.png" logo_url:"https://.../logo.png" ticket_text:"Danke für dein Ticket, wir melden uns gleich." geschlossen_titel:"Ticket geschlossen" geschlossen_text:"Dein Ticket wurde geschlossen." feedback_kanal:#ticket-feedback

/ticket-kategorie add name:"Allgemeiner Support" kategorie:#Tickets-Allgemein rolle:@Support nur_team_schliesst:true
/ticket-kategorie add name:"Bug melden" kategorie:#Tickets-Bugs rolle:@Entwickler

/ticketpanel-senden channel:#ticket-eroeffnen
```

Weitere Befehle: `/ticket-kategorie liste` (zeigt alle Kategorien mit ID),
`/ticket-kategorie remove id:...` (entfernen). Für Kategorie/Rolle gibt's
auch `_id`-Varianten falls die normale Auswahl mal nicht reicht.

### Ablauf

1. Nutzer sieht das Panel (Titel, Text, Banner, Logo) mit einem Dropdown zur
   Kategorie-Auswahl.
2. Nach Auswahl wird automatisch ein **privater Ticket-Channel** in der
   konfigurierten Kategorie erstellt (nur Ersteller + zuständige Rolle + Bot
   sehen ihn), mit deinem `ticket_text` als Willkommensnachricht und einem
   "🔒 Ticket schließen"-Button.
3. Schließen darf: standardmäßig **nur das Team** (zuständige Rolle oder
   wer "Kanäle verwalten" hat). Mit `nur_team_schliesst:false` darf auch der
   Ticket-Ersteller selbst schließen.
4. Beim Schließen: Nachricht mit deinem `geschlossen_titel`/`geschlossen_text`
   im Channel, der Ersteller bekommt per DM eine 1-5-Sterne-Bewertung
   angezeigt. Nach Sternewahl fragt ein Pop-up nach einer kurzen Begründung
   (Pflichtfeld) – das Ergebnis landet als Embed im `feedback_kanal`.
5. Der Ticket-Channel wird ca. 8 Sekunden nach dem Schließen automatisch
   gelöscht.

**Berechtigungen:** Der Bot braucht "Kanäle verwalten" (Manage Channels),
damit er Ticket-Channels mit den richtigen Sichtbarkeits-Rechten anlegen kann.

## Support-Modul (eigenständig, getrennt vom Büro-System)

Ein komplett unabhängiges zweites Warteraum-System, parallel zum
Büro-System nutzbar – eigener Warteraum, eigener Ping-Kanal, eigene Rolle,
eigene Musik (**nur eigener Datei-Link, bewusst kein YouTube/Spotify**).

### Einrichtung

```
/setup-support aktiv:true warteraum:#support-warteraum ping_kanal:#support-anfragen nachricht:"🆘 Neuer Supportfall" kategorie:#Support-Büros rolle:@Support musik_datei_url:"https://.../musik.mp3" lautstaerke:70
```

Alle Parameter außer `aktiv` sind einzeln optional und überschreiben nur das,
was du angibst – der Rest bleibt wie vorher. Für Warteraum/Ping-Kanal/Kategorie/
Rolle gibt's jeweils auch eine `_id`-Variante für den Fall, dass etwas nicht
in der normalen Auswahl auftaucht (`warteraum_id`, `ping_kanal_id`,
`kategorie_id`, `rolle_id`).

### Ablauf

1. Nutzer joint den Support-Warteraum → Bot joint (falls gerade keinen
   anderen Voice-Channel im Server belegt) und spielt die eigene Wartemusik.
2. Im Ping-Kanal erscheint sofort eine Nachricht (Titel = deine `nachricht`,
   pingt die konfigurierte Rolle) mit einem **"Übernehmen"**-Button.
3. Support-Mitarbeiter klickt "Übernehmen" – muss dafür selbst gerade in
   einem Voice-Channel der konfigurierten Kategorie sitzen (sonst
   Fehlermeldung). Nutzer wird dorthin gemovt.
4. "Fall schließen" beendet den Fall: Nutzer wird getrennt, verliert Sicht
   auf den Channel, Nachricht zeigt wer bearbeitet hat und wie lange es
   gedauert hat.
5. Verlässt der Nutzer den Warteraum wieder, verlässt der Bot ihn ebenfalls
   (sofern er dort auch wirklich verbunden war).

**Hinweis:** Der Bot kann pro Server nur in einem Voice-Channel gleichzeitig
sein. Sind Büro- und Support-Warteraum gleichzeitig belegt, bekommt nur
einer von beiden Musik ab – Benachrichtigungen und das Movement bei Annahme
funktionieren aber in beiden Systemen unabhängig voneinander weiter.

## Verifizierungssystem

Unabhängig vom Büro-Support-System gibt es ein Verifizierungssystem mit
Panel, optionalem Captcha und automatischer Rollenvergabe.

### Einrichtung

```
/setup-verifizierung titel:"Willkommen!" nachricht:"Klick unten, um Zugriff auf den Server zu bekommen." captcha:true rolle_geben:@Mitglied rolle_entfernen:@Unverifiziert banner_url:"https://.../banner.png" logo_url:"https://.../logo.png"
/verifizierungspanel-senden channel:#verifizierung
```

Alle Parameter bei `/setup-verifizierung` sind einzeln optional – du kannst
z. B. nur `captcha:true` ändern, ohne Titel/Text neu einzugeben; nicht
angegebene Werte bleiben wie vorher. Für Rollen gibt's jeweils auch eine
`_id`-Variante (`rolle_geben_id`, `rolle_entfernen_id`) für den Fall, dass die
Rolle nicht in der normalen Auswahl auftaucht.

### Ablauf für den Nutzer

1. Nutzer sieht das Panel (Titel, Text, optional Banner-Bild + Logo) mit
   einem "✅ Verifizieren"-Button.
2. Klick auf den Button:
   - **Ohne Captcha**: sofort verifiziert.
   - **Mit Captcha**: ein Pop-up-Fenster zeigt einen zufälligen Code
     (z. B. "Gib diesen Code ein: K7XPA"), der Nutzer tippt ihn ab und
     bestätigt. Falscher/abgelaufener Code (5 Minuten gültig) → einfach
     nochmal auf "Verifizieren" klicken für einen neuen Code.
3. Bei Erfolg: die konfigurierte Rolle wird vergeben, die andere (z. B.
   "Unverifiziert") wird entfernt.

**Wichtig:** Die Bot-Rolle muss in der Rollen-Reihenfolge **über** beiden
konfigurierten Rollen stehen und der Bot braucht die Berechtigung "Rollen
verwalten" (Manage Roles) – sonst schlägt das Vergeben/Entfernen fehl (der
Nutzer bekommt dann eine Fehlermeldung mit Erklärung angezeigt).

## Öffentlicher Bot – für beliebig viele Server

Der Bot ist bewusst **nicht** auf einen einzelnen Server fest verdrahtet:
Slash-Commands werden global registriert (`npm run deploy-commands`) und jede
Konfiguration (Warteraum, Anfrage-Kanal, Büros, Texte, Musik, Öffnungszeiten)
wird getrennt pro Server-ID in `guildConfig.json` gespeichert. Das heißt: du
kannst den Bot über den Einladungslink auf beliebig viele Discord-Server
einladen, und jeder Server richtet sich über `/setup-warteraum`, `/setup-anfragekanal`
und `/buero add` komplett selbst und unabhängig von den anderen ein.

## Hinweise zu Berechtigungen

Annehmen/Ablehnen/Fall schließen erfordert die Berechtigung "Mitglieder
verschieben" (Move Members) auf dem jeweiligen Server – nur Support-Mitarbeiter
mit dieser Rolle sollten das können.

**Für die "Büro nicht sichtbar, bis Fall angenommen"-Funktion:** Richte die
Büro-Voice-Channels am besten als **privat** ein (bei `@everyone` "Kanal
ansehen"/"Verbinden" deaktivieren, nur deine Support-Rolle behält Zugriff).
Der Bot gibt dem jeweiligen Nutzer bei Annahme automatisch Sicht-/Beitrittsrecht
für genau diesen Channel und entzieht es beim Schließen des Falls wieder – der
Channel verschwindet dann wieder aus der Kanalliste des Nutzers. Dafür braucht
der Bot die Berechtigung "Kanäle verwalten" (Manage Channels) auf dem Server
bzw. mindestens für die Büro-Channels.

## Admin-Dashboard

Das Web-Dashboard läuft jetzt mit **echtem Discord-Login** (OAuth2) statt
einem einzelnen Passwort für alle. Das heißt:

- Jeder meldet sich mit seinem **eigenen Discord-Account** an.
- Man sieht im Dashboard **nur die Server**, auf denen man selbst "Server
  verwalten" oder Administrator ist – die Auswahl passiert automatisch,
  niemand kann fremde Server sehen oder bearbeiten.
- **Bot pausieren/aktivieren** und das globale **Bot-Profil** (Name, Avatar,
  Banner) sind zusätzlich auf die `OWNER_IDS` beschränkt (nur der/die
  Bot-Besitzer sehen diese Bereiche überhaupt).

### Einrichtung

1. Discord Developer Portal → deine App → **OAuth2** (links) → **Client
   Secret** → "Reset Secret" bzw. den vorhandenen Wert kopieren.
2. Dort unter **Redirects** genau diese URL eintragen (mit deiner echten
   Server-IP/Domain und dem richtigen Port):
   ```
   http://DEINE-SERVER-IP:3000/auth/callback
   ```
3. In `.env` setzen:
   ```
   CLIENT_SECRET=der-client-secret-wert
   PUBLIC_URL=http://DEINE-SERVER-IP:3000
   DASHBOARD_PORT=3000
   SESSION_SECRET=irgendein-langer-zufälliger-text
   ```
   `PUBLIC_URL` und die Redirect-URL in Schritt 2 müssen **exakt** zusammenpassen
   (gleiches Schema, gleiche IP/Domain, gleicher Port), sonst schlägt der
   Login mit einem Fehler fehl.
4. Bot starten (`npm start`) – im Log erscheint `[Dashboard] Läuft auf Port 3000 (...)`.
5. Im Browser `http://DEINE-SERVER-IP:3000` öffnen → "Mit Discord anmelden".
6. Oben rechts den Server auswählen, in den Karten Einstellungen ändern,
   jeweils "Speichern" klicken.

Zusätzliche Funktionen im Dashboard:

- **"Statistik & Verlauf"**-Karte pro Server: aktuell offene Fälle, Fälle heute,
  durchschnittliche Bearbeitungsdauer in Minuten, Gesamtzahl geschlossener
  Fälle, sowie eine Liste der letzten ca. 30 Fälle mit Status. Aktualisiert
  sich automatisch alle 15 Sekunden.
- **Bot-Spitzname auf diesem Server**: pro Server änderbar (Discord erlaubt
  das für Bots). Avatar/Banner gelten dagegen bei Discord immer
  serverübergreifend gleich – das lässt sich technisch nicht pro Server
  trennen, das ist keine Einschränkung dieses Bots, sondern der Plattform.
- **⏸ Bot pausieren / ▶ Bot aktivieren** (nur Bot-Besitzer, oben rechts):
  schaltet den kompletten Bot auf **allen** Servern gleichzeitig aus/ein.
- **Bot-Profil** (nur Bot-Besitzer): Name/Avatar/Banner des Bot-Accounts
  ändern. Discord limitiert, wie oft das pro Zeitraum geht – bei Fehler
  erscheint eine entsprechende Meldung.

**Wichtig:** Standardmäßig ist das Dashboard nur per IP:Port erreichbar und
nicht extra verschlüsselt (kein HTTPS). Für den produktiven Einsatz im
Internet siehe Schritt 4 der Hosting-Anleitung unten (Reverse-Proxy mit
HTTPS) – dann auch `PUBLIC_URL` und die Redirect-URL im Developer Portal auf
`https://...` umstellen.

## Bot dauerhaft online halten (Hosting)

Der Bot braucht einen **durchgehend laufenden Prozess** (wegen der
Voice-Verbindung/Musik) – kein "Serverless"-Hosting wie klassische
Vercel-Functions. Empfehlung für den Einstieg: ein günstiger **VPS**
(z. B. Hetzner Cloud CX22, Netcup, Contabo – ca. 4-6 €/Monat).

### 1. Server vorbereiten (einmalig)

Auf einem frischen Ubuntu-VPS per SSH einloggen, dann:

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Node.js 20 installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# pm2 installieren (hält den Bot am Laufen, startet ihn bei Absturz neu)
sudo npm install -g pm2
```

### 2. Projekt hochladen und einrichten

Vom eigenen Rechner aus das Projekt auf den Server kopieren (z. B. per `scp`
oder `git`), dann auf dem Server:

```bash
cd office-support-bot
npm install
cp .env.example .env
nano .env   # Werte eintragen: Token, Client-ID, Dashboard-Passwort, etc.
npm run deploy-commands
```

### 3. Bot mit pm2 dauerhaft starten

```bash
pm2 start src/index.js --name office-bot
pm2 save
pm2 startup   # gibt einen Befehl aus, den du einmal kopierst und ausführst
              # -> sorgt dafür, dass der Bot auch nach einem Server-Neustart wieder startet
```

Nützliche pm2-Befehle danach:
```bash
pm2 status          # läuft der Bot?
pm2 logs office-bot  # Logs live ansehen
pm2 restart office-bot
```

### 4. Firewall / Dashboard-Zugriff

Falls du das Dashboard von außen erreichen willst:

```bash
sudo ufw allow 3000/tcp   # Dashboard-Port freigeben (Portnummer wie in .env)
```

Für einen produktiven Einsatz mit richtigem Domainnamen und HTTPS empfiehlt
sich zusätzlich ein Reverse-Proxy wie **Caddy** oder **nginx** vor dem
Dashboard (Caddy macht HTTPS-Zertifikate automatisch). Das ist optional und
kann später ergänzt werden – für den Start reicht `http://server-ip:3000`.

### Alternativen zum VPS

- **Eigener PC/Raspberry Pi zuhause**: gleiche Schritte wie oben, aber Achtung:
  wenn der Rechner ausgeht oder das Internet zuhause ausfällt, ist der Bot
  offline. Für 24/7-Betrieb ist ein VPS meist zuverlässiger.
- **Railway**: siehe eigener Abschnitt unten.
- **Fly.io** u. ä.: ähnlich wie Railway, aber meist noch etwas mehr manuelle
  Konfiguration nötig.

### Deployment auf Railway

Das Projekt enthält bereits `railway.json` und `nixpacks.toml` – die sorgen
dafür, dass Railway die nötigen Build-Werkzeuge (Python, GCC) für die
nativen Sprach-Module installiert, und dass der Bot bei einem Absturz
automatisch neu gestartet wird.

1. Neues Projekt auf railway.app anlegen, "Deploy from GitHub repo" (Projekt
   vorher in ein eigenes GitHub-Repo pushen) oder das ZIP als Repo hochladen.
2. Unter **Variables** genau dieselben Werte eintragen wie in `.env.example`
   (DISCORD_TOKEN, CLIENT_ID, CLIENT_SECRET, PUBLIC_URL, OWNER_IDS,
   ADMIN_PANEL_PASSWORD, SESSION_SECRET, ...). **Keine `.env`-Datei hochladen** –
   Railway nutzt eigene Variablen statt einer Datei.
3. `PUBLIC_URL` auf die von Railway vergebene Domain setzen, z. B.
   `https://dein-projekt.up.railway.app` (Railway setzt den Port automatisch
   über die `PORT`-Variable, das berücksichtigt der Bot automatisch).
4. Unter **Settings → Networking** einen öffentlichen Domain-Namen generieren,
   damit das Dashboard erreichbar ist.
5. Deploy abwarten, dann in den **Logs** prüfen, ob `Eingeloggt als ...`
   erscheint. Falls dort Fehler auftauchen (z. B. zu Musik/ffmpeg), läuft der
   Rest des Bots trotzdem normal weiter – dank der eingebauten Absicherung
   stürzt der ganze Prozess dadurch nicht mehr ab.
6. `npm run deploy-commands` muss einmalig **lokal** oder über die Railway-Konsole
   (Shell-Tab) ausgeführt werden, damit die Slash-Commands bei Discord
   registriert werden – das passiert nicht automatisch beim Deploy.
