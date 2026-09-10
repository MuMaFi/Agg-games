# AGG Games als Android-App

Eine dünne Hülle: ein `WebView`, der die Spiele aus `assets/` unter einer
eigenen Herkunft (`https://spiele.agg.local/`) ausliefert. Über `file://`
ginge es nicht — der WebView verweigert dort ES-Module und Importkarten,
und genau die brauchen die 3D-Spiele.

## APK bekommen

**Ohne eigenen Rechner:** Auf GitHub unter *Actions → APK bauen → Run
workflow*. Nach ein paar Minuten hängt das APK unter dem Lauf als
Artefakt `agg-games-apk`.

**Selbst bauen:** Android SDK 34 und JDK 17 vorausgesetzt.

    # Spiele einlegen
    rsync -a --exclude '.git' --exclude '.github' --exclude 'android' \
      ../ app/src/main/assets/
    ./gradlew assembleDebug     # oder: gradle assembleDebug

Das fertige APK liegt in `app/build/outputs/apk/debug/`.

## Installieren

Das APK ist mit dem Fehlersuch-Schlüssel signiert. Auf dem Telefon muss
für die Datei-App bzw. den Browser einmal *Unbekannte Apps installieren*
erlaubt werden. Für den Play Store bräuchte es einen eigenen Schlüssel und
einen `release`-Bau.

## Ohne APK

Die Seite ist auch eine PWA: im Browser aufrufen, *Zum Startbildschirm
hinzufügen*, danach läuft sie im Vollbild und offline.
