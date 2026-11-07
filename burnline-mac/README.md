# Burnline für macOS

Burnline als eigene Mac-App, gebaut mit Electron. Der Inhalt ist dieselbe
`../burnline.html`, nur mit lokalen Schriften (läuft offline) und einem
Knopf für **System-Audio** (Spotify, Apple Music & Co. direkt mitschneiden).

## Installieren

1. Die passende ZIP entpacken:
   - `Burnline-mac-arm64.zip` für Macs mit Apple-Chip (M1, M2, M3, M4 …)
   - `Burnline-mac-x64.zip` für ältere Macs mit Intel-Chip (bauen mit `ARCHS="arm64 x64" npm run build:mac`)
2. `Burnline.app` in den Ordner **Programme** ziehen.
3. Einmal im Terminal ausführen (die App ist nicht bei Apple notariell beglaubigt):

   ```bash
   xattr -cr /Applications/Burnline.app && codesign --force --deep --sign - /Applications/Burnline.app
   ```

4. Burnline normal öffnen. Beim ersten Mikrofon- oder System-Audio-Start fragt macOS nach der Erlaubnis.

## Selbst bauen

```bash
npm install
npm start          # zum Ausprobieren
npm run build:mac  # baut dist/Burnline-mac-arm64.zip und dist/Burnline-mac-x64.zip
```

`prepare.js` kopiert vor jedem Start und Build die aktuelle `../burnline.html`
nach `app/index.html`. Änderungen am Visualizer also immer in `burnline.html` machen.
