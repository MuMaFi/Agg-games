# Burnline für Android

Ein WebView, der `../burnline.html` als App ausliefert, plus:
mehrere Songs auf einmal auswählen, Mikrofon-Freigabe und Video-Export
direkt nach **Filme/Burnline** (in der Galerie sichtbar, Android 10+).

## Bauen

Android SDK 34 und JDK 17 vorausgesetzt.

```bash
node prepare.js                         # legt die aktuelle burnline.html + Schriften in assets/
echo "sdk.dir=$ANDROID_HOME" > local.properties
gradle assembleRelease -Pfassung=2      # Fassung hochzählen, damit das neue APK über das alte passt
```

Das APK liegt danach in `app/build/outputs/apk/release/app-release.apk`.

## Signatur

Signiert mit `burnline.keystore` (Passwort `android`, liegt offen im Repo,
wie bei den AGG-Apps). So lässt sich jede neue Fassung über die alte
installieren. Für den Play Store bräuchte es einen geheimen Schlüssel.
