# AGG Games als Android-App

Eine dünne Hülle: ein `WebView`, der die Spiele aus `assets/` unter einer
eigenen Herkunft (`https://spiele.agg.local/`) ausliefert. Über `file://`
ginge es nicht — der WebView verweigert dort ES-Module und Importkarten,
und genau die brauchen die 3D-Spiele.

## Zwei Apps aus einer Hülle

| Variante      | Name        | Kennung              | startet in                     |
|---------------|-------------|----------------------|--------------------------------|
| `pocketcraft` | Pocketcraft | `de.agg.pocketcraft` | `games/pocketcraft/index.html` |
| `alle`        | AGG Games   | `de.agg.spiele`      | `index.html` (Übersicht)       |

Beide lassen sich nebeneinander installieren. In der Pocketcraft-App fehlt
der Knopf zur Übersicht (die Seite erkennt die App an `AGGApp/einzeln` im
User-Agent). Die Zurück-Taste fragt erst das Spiel: Im Spiel öffnet sie die
Pause, im Menü geht sie einen Schritt zurück, erst auf dem Titelbild geht
die App in den Hintergrund. Geht die App aus dem Blick, hält das Spiel an
und sichert.

## APK bekommen

**Ohne eigenen Rechner:** Auf GitHub unter *Actions → APK bauen → Run
workflow*, App wählen (`pocketcraft`, `alle` oder `beide`). Nach ein paar
Minuten hängt das APK unter dem Lauf als Artefakt `pocketcraft-apk` bzw.
`agg-games-apk`.

**Selbst bauen:** Android SDK 34, JDK 17 und Gradle 8.9 vorausgesetzt.

    # Pocketcraft einlegen …
    mkdir -p app/src/pocketcraft/assets/games
    rsync -a ../games/pocketcraft app/src/pocketcraft/assets/games/
    cp ../games/heim.js app/src/pocketcraft/assets/games/
    gradle assemblePocketcraftRelease

    # … oder alle Spiele
    rsync -a --exclude '.git' --exclude '.github' --exclude 'android' \
      ../ app/src/alle/assets/
    gradle assembleAlleRelease

Das fertige APK liegt in `app/build/outputs/apk/<variante>/release/`.

## Installieren

Das APK ist mit einem festen Schlüssel signiert (`agg-apps.keystore`, liegt
offen im Archiv). So lässt sich jede neue Fassung über die alte
installieren, und die Welten bleiben erhalten. Auf dem Telefon muss
für die Datei-App bzw. den Browser einmal *Unbekannte Apps installieren*
erlaubt werden. Für den Play Store bräuchte es einen geheimen Schlüssel statt
des offenen.

## Ohne APK

Die Seite ist auch eine PWA: im Browser aufrufen, *Zum Startbildschirm
hinzufügen*, danach läuft sie im Vollbild und offline.
