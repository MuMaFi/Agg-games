# Blockwerk

Ein Baukasten zum Programmieren mit Blöcken — für Android, geschrieben in
Java, ohne eine einzige Bibliothek. Figuren bewegen, sprechen, malen,
spielen Töne und reagieren auf Fingertipps, Tasten und das Kippen des
Telefons. Die Bedienung ist von Blocksprachen wie Scratch inspiriert, Bilder,
Klänge und Code sind eigene.

## APK bekommen

**Ohne eigenen Rechner:** Liegt Blockwerk in einem eigenen Repository, auf
GitHub unter *Actions → APK bauen → Run workflow*. Nach ein paar Minuten
hängt das APK unter dem Lauf als Artefakt `blockwerk-apk`. (GitHub führt
Workflows nur aus `.github/workflows` im Wurzelverzeichnis aus — in einem
Unterordner eines anderen Repositorys schläft die Datei.)

**Selbst bauen:** Android SDK 34 und JDK 17 vorausgesetzt.

    gradle assembleRelease

Das fertige APK liegt in `app/build/outputs/apk/release/`. Es ist mit einem
festen Schlüssel signiert (`blockwerk.keystore`, liegt offen im Archiv), so
lässt sich jede neue Fassung über die alte installieren und die Projekte
bleiben erhalten. Für den Play Store bräuchte es einen geheimen Schlüssel.

## Bedienung

* **Blöcke ziehen:** aus der Palette nach rechts auf die Skriptfläche. Ein
  Block rastet unter, über oder in einem anderen ein, sobald er nah genug ist;
  ein grauer Schatten zeigt vorher, wo. Werteblöcke (rund oder spitz) passen
  in die Felder anderer Blöcke.
* **Löschen:** Block zurück auf die Palette ziehen — oder lange drücken.
* **Starten:** die grüne Flagge startet alle Skripte mit „Wenn Flagge
  angeklickt“. Einen Stapel antippen startet nur ihn (er leuchtet gelb),
  nochmal antippen hält ihn an. Ein Werteblock zeigt beim Antippen seinen Wert.
* **Felder ändern:** Zahl oder Text antippen; Auswahlfelder öffnen eine Liste.
* **Lange drücken** öffnet Menüs: auf Blöcken (duplizieren, löschen), auf der
  leeren Fläche (aufräumen) und auf Figuren (Kostüme, umbenennen, löschen).
* **Zoomen:** zwei Finger auf der Skriptfläche, oder die Knöpfe unten rechts.
* **Figuren:** „Neue Figur“ — aus der Bibliothek, selbst gemalt oder als Foto.
  Auf der Bühne lassen sich Figuren mit dem Finger verschieben.
* **Vollbild:** Ist ein Projekt auf Tasten angewiesen, erscheinen Pfeiltasten
  und eine Leertaste zum Antippen. Eine Tastatur am Gerät geht auch.

Projekte werden von selbst gespeichert. Über das Menü lassen sich mehrere
anlegen, öffnen, als `.blockwerk`-Datei exportieren und wieder importieren.
Unter *Beispiele* liegen sechs fertige Projekte zum Abschauen.

## Was drin ist

| Gruppe     | Blöcke |
|------------|--------|
| Bewegung   | gehen, drehen, gehe zu / gleite zu (Position, Finger, Figur, Zufall), Richtung, x/y, abprallen, Drehtyp |
| Aussehen   | sagen/denken (mit Dauer), Kostüm und Bühnenbild wechseln, Größe, Effekte (Farbe, Helligkeit, Durchsichtigkeit), zeigen/verstecken, Ebenen |
| Klang      | 13 eingebaute Klänge, Noten mit 7 Instrumenten, Lautstärke |
| Ereignisse | Flagge, Taste, Figur/Bühne angetippt, Bühnenbildwechsel, Nachrichten senden und empfangen (auch mit Warten) |
| Steuerung  | warten, wiederhole (n mal, fortlaufend, bis), falls/sonst, warte bis, stoppe, Klone |
| Fühlen     | berührt Finger/Rand/Figur/Farbe, Entfernung, fragen und Antwort, Tasten, Finger x/y, **Neigung des Telefons**, Stoppuhr, Eigenschaften anderer Figuren, Datum und Uhrzeit |
| Operatoren | Rechnen, Zufall, Vergleiche, und/oder/nicht, Texte verbinden und zerlegen, mod, runden, Mathefunktionen |
| Variablen  | anlegen, setzen, ändern, auf der Bühne anzeigen |
| Stift      | malen, Farbe und Dicke, Abdruck, alles löschen |

Dazu ein Malprogramm für Kostüme und Bühnenbilder (Pinsel, Radierer, Füllen,
Linie, Rechteck, Kreis, Spiegeln, Rückgängig).

## Wie es innen funktioniert

* `Motor` führt die Skripte aus: jedes laufende Skript ist ein Faden mit
  eigenem Stapel, alle Fäden laufen abwechselnd im Takt von 30 Bildern je
  Sekunde. Am Ende jedes Schleifendurchlaufs gibt ein Faden ab. Solange sich
  nichts sichtbar ändert, kommen die Fäden innerhalb eines Bildes mehrmals
  dran — Zählschleifen rechnen schnell, Bewegungen bleiben sichtbar.
* `Bloecke` beschreibt alle Blöcke in einer Zeile je Block, `BlockMaler`
  ordnet und zeichnet sie, `EditorView` kümmert sich um Palette, Ziehen und
  Einrasten.
* `Bibliothek` zeichnet Figuren und Bühnenbilder zur Laufzeit, `Klang`
  erzeugt alle Klänge synthetisch und mischt sie auf eine AudioTrack.

## Prüfen

    gradle testDebugUnitTest

Die Prüfungen laufen mit Robolectric und echter Android-Grafik auf dem
Rechner: sie ziehen Blöcke per simulierter Berührung zusammen, lassen alle
Beispiele laufen und legen Bildschirmfotos unter `app/build/bilder/` ab.
