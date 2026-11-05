# Blockwerk

Programmieren mit Blöcken auf Android — und das Ergebnis als echtes Java.
Blöcke werden auf einer Fläche zusammengesteckt, Figuren bewegen sich auf
einer Bühne, und jedes Projekt lässt sich als einzelne `.java`-Datei
speichern, die mit einem normalen JDK läuft. Die App selbst ist in Java
geschrieben und kommt ohne Bibliotheken aus.

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

## Als Java exportieren

Der Knopf **`</>`** in der Werkzeugleiste zeigt das Projekt als Java-Code.
**Als .java speichern** (dort oder im Menü) legt eine einzelne Datei ab, etwa
`Fangspiel.java`. Auf einem Rechner mit JDK ab Version 11:

    java Fangspiel.java

Es öffnet sich ein Fenster mit der Bühne, Start- und Stopp-Knopf; Tastatur
und Maus übernehmen die Rolle von Steuerkreuz und Finger. Ausgaben von
„schreibe … in die Konsole“ landen auf `System.out`.

So wird übersetzt:

| Blöcke | Java |
|--------|------|
| Figur | eine Klasse, die von `Figur` erbt (`static class Zeiger extends Figur`) |
| Bühne | `static class Hintergrund extends Buehne` |
| Wenn das Programm startet, Wenn Taste …, Wenn ich … empfange | `wennProgrammStartet(() -> { … })` usw. in `skripte()` |
| wiederhole 10 mal / fortlaufend / bis | `for (int i = 0; i < 10; i++)` / `while (true)` / `while (!…)` |
| falls … dann … sonst | `if (…) { … } else { … }` |
| Variable | statisches Feld, `double` oder `String` je nachdem, was hineingeschrieben wird |
| gehe 10 Schritte, sage …, spiele Note … | `gehe(10);`, `sage("…");`, `spieleNote(60, 0.5);` |
| schreibe … in die Konsole | `System.out.println(…);` |

Am Ende jedes Schleifendurchlaufs steht `warteAufBild();` — dort kommen die
anderen Skripte dran und die Bühne wird neu gezeichnet, genau wie in der App.
Unter dem Programm hängen die Bilder (PNG als Base64) und die Laufzeit
(`Welt`, `Ziel`, `Figur`, `Buehne`, `Klaenge`, `Wert`), die Blockwerk aus
`app/src/main/assets/laufzeit.java` mitliefert. Sie braucht nur Java SE
(Swing, Java2D, Java Sound).

Ohne Bildschirm läuft das Programm auch auf der Konsole:

    java -Dblockwerk.kopflos=3 Fangspiel.java

— drei Sekunden lang, danach werden Variablen und Figuren ausgegeben; Fragen
werden dann auf der Konsole gestellt.

## Bedienung

* **Blöcke ziehen:** aus der Palette auf die Fläche. Ein Block rastet unter,
  über oder in einem anderen ein; ein grauer Schatten zeigt vorher, wo.
  Werteblöcke (rund oder spitz) passen in die Felder anderer Blöcke. Eine
  Schleife umschließt die Blöcke darunter.
* **Löschen:** Block zurück auf die Palette ziehen — oder lange drücken.
* **Starten:** ▶ startet alle Skripte mit „Wenn das Programm startet“, ■ hält
  alles an. Einen Stapel antippen startet nur ihn (er bekommt einen blauen
  Rand), nochmal antippen hält ihn an. Ein Werteblock zeigt beim Antippen
  seinen Wert.
* **Felder ändern:** Zahl oder Text antippen; Auswahlfelder öffnen eine Liste.
* **Lange drücken** öffnet Menüs: auf Blöcken (duplizieren, löschen), auf der
  leeren Fläche (aufräumen) und auf Figuren (Kostüme, umbenennen, löschen).
* **Zoomen:** zwei Finger auf der Skriptfläche, oder die Knöpfe unten rechts.
* **Figuren:** „Neue Figur“ — aus der Bibliothek, selbst gemalt oder als Foto.
  Auf der Bühne lassen sich Figuren mit dem Finger verschieben.
* **Vollbild:** Fragt ein Projekt Tasten ab, erscheinen Pfeiltasten und eine
  Leertaste zum Antippen. Eine Tastatur am Gerät geht auch.

Projekte speichern sich von selbst. Über das Menü lassen sich mehrere
anlegen, öffnen, als `.blockwerk`-Datei weitergeben und wieder einlesen.
Unter *Beispiele* liegen sieben fertige Projekte: Quadrat zeichnen, Spirale,
Zahlenraten, Fangspiel, Pong, Partikel (Klone) und Melodie.

## Was drin ist

| Gruppe     | Blöcke |
|------------|--------|
| Bewegung   | gehen, drehen, gehe zu / gleite zu (Position, Finger, Figur, Zufall), Richtung, x/y, abprallen, Drehtyp |
| Aussehen   | sagen/denken (mit Dauer), Kostüm und Bühnenbild wechseln, Größe, Effekte (Farbe, Helligkeit, Durchsichtigkeit), zeigen/verstecken, Ebenen |
| Klang      | 10 eingebaute Klänge, Noten mit 7 Instrumenten, Lautstärke |
| Ereignisse | Programmstart, Taste, Figur/Bühne angetippt, Bühnenbildwechsel, Nachrichten senden und empfangen (auch mit Warten) |
| Steuerung  | warten, wiederhole (n mal, fortlaufend, bis), falls/sonst, warte bis, stoppe, Klone |
| Fühlen     | berührt Finger/Rand/Figur/Farbe, Entfernung, fragen und Antwort, **Konsole**, Tasten, Finger x/y, Neigung des Telefons, Stoppuhr, Eigenschaften anderer Figuren, Datum und Uhrzeit |
| Operatoren | Rechnen, Zufall, Vergleiche, und/oder/nicht, Texte verbinden und zerlegen, mod, runden, Mathefunktionen |
| Variablen  | anlegen, setzen, ändern, auf der Bühne anzeigen |
| Stift      | malen, Farbe und Dicke, Abdruck, alles löschen |

Dazu ein Malprogramm für Kostüme und Bühnenbilder (Pinsel, Radierer, Füllen,
Linie, Rechteck, Kreis, Spiegeln, Rückgängig).

## Wie es innen funktioniert

* `Motor` führt die Skripte in der App aus: jedes laufende Skript ist ein
  Faden mit eigenem Stapel, alle Fäden laufen abwechselnd im Takt von 30
  Bildern je Sekunde. Am Ende jedes Schleifendurchlaufs gibt ein Faden ab.
  Solange sich nichts sichtbar ändert, kommen die Fäden innerhalb eines Bildes
  mehrmals dran — Zählschleifen rechnen schnell, Bewegungen bleiben sichtbar.
* Die Java-Laufzeit macht dasselbe mit echten Threads, von denen immer nur
  einer läuft; `warteAufBild()` gibt an den nächsten weiter.
* `JavaExport` übersetzt die Blöcke: Typen der Ausdrücke (Zahl, Text,
  Wahrheitswert) werden statisch bestimmt, Umwandlungen nur eingefügt, wo
  nötig (`Wert.text(…)`, `Wert.zahl(…)`).
* `Bloecke` beschreibt alle Blöcke in einer Zeile je Block, `BlockMaler`
  ordnet und zeichnet sie, `EditorView` kümmert sich um Palette, Ziehen und
  Einrasten. `Bibliothek` zeichnet Figuren und Bühnenbilder zur Laufzeit,
  `Klang` erzeugt alle Klänge synthetisch.

## Prüfen

    gradle testDebugUnitTest

Die Prüfungen laufen mit Robolectric und echter Android-Grafik auf dem
Rechner: sie ziehen Blöcke per simulierter Berührung zusammen, lassen alle
Beispiele laufen und legen Bildschirmfotos unter `app/build/bilder/` ab.
Außerdem exportieren sie jedes Beispiel als Java, übersetzen es mit `javac`,
starten es ohne Fenster und legen die Dateien unter `app/build/java/` ab.
