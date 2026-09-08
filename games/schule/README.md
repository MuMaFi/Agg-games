# NACHSITZEN

Ein Schulhaus aus der Ich-Perspektive: sieben Hefte einsammeln, in jedem drei
Rechenaufgaben lösen, dann durch einen der drei Ausgänge. Herr Kreide hat
nichts dagegen, dass du die Hefte holst — er wird nur mit jedem Heft und jedem
Rechenfehler schneller.

Eigenes Spiel im Genre der Schul-Verfolgungsspiele: eigener Code, eigene
Grafik, keine fremden Assets. Läuft im Browser ohne Build, braucht aber einen
Webserver (ES-Module lädt der Browser nicht vom Dateisystem):

```bash
python3 -m http.server 8000     # im Wurzelverzeichnis des Projekts
# dann http://localhost:8000/games/schule/ aufrufen
```

## Wie es gerendert wird

Ein **Raycaster**, kein 3D-Framework. Pro Bildspalte geht ein Strahl per DDA
durchs Gitter; die getroffene Wand wird als Texturspalte direkt in einen
`Uint32Array`-Puffer geschrieben, der am Ende mit einem `putImageData` auf die
Leinwand geht. Figuren und Gegenstände kommen danach als Billboards, sortiert
nach Entfernung und gegen den Tiefenpuffer der Wandstrahlen geprüft.

**Boden und Decke sind texturiert**, nicht flach gefüllt: Für jede Bildzeile
unterhalb des Horizonts steht der Abstand fest, daraus ergibt sich die
Weltposition, die man Spalte für Spalte weiterschiebt; die Decke ist dieselbe
Zeile gespiegelt. Das ist der größte Unterschied im Bild — Fliesen mit Fugen
und Deckenplatten mit Leuchtröhren statt zweier Farbverläufe.

Die Innenauflösung ist fest 240 Zeilen hoch, die Breite folgt dem
Seitenverhältnis. Hart hochskaliert (`image-rendering: pixelated`) — das gibt
den groben Look und läuft mit 60 fps.

Alle Texturen sind im Code gezeichnet, nicht geladen: Flurwand mit grünem
Sockel, Spindreihe, Klassenraumtür mit Fensterchen, Tafel, Ausgangsschild,
Linoleumboden, Deckenplatte. Dazu zwei Wandvarianten — Plakat und
Anschlagbrett —, die über einen Streuwert aus den Zellkoordinaten verteilt
werden, damit die Gänge nicht alle gleich aussehen.

Figuren bekommen beim Backen automatisch einen dunklen Umriss: jedes
durchsichtige Pixel neben einem undurchsichtigen wird eingefärbt. Ohne das
verschwimmen sie mit der Wand dahinter.

## Das Schulhaus

`schule.js` erzeugt es aus einem Startwert. Flurachsen in unregelmäßigen
Abständen und zwei Zellen breit, die Felder dazwischen werden Klassenräume mit
je einer Tür und einer Tafel, ein paar bleiben massiv.

Wichtig dabei: zwischen Flur und Klassenraum muss eine **Wandzelle** stehen
bleiben. Anfangs begannen die Räume direkt am Gang — die Räume flossen in die
Flure über, und das Schulhaus wirkte wie eine offene Lagerhalle statt wie ein
Gebäude. Ein Prüflauf zählt heute 0 Raumkanten ohne Wand zum Flur. Spinde setzen sich an
Flurwände, drei Ausgänge werden an die Außenwände gebrochen. Ergebnis bei
Startwert 1998: 45 × 45 Zellen, 12 Klassenräume, 3 Ausgänge — und jeder Raum
vom Start aus erreichbar (per Breitensuche geprüft).

Dieselbe Breitensuche treibt auch die Verfolger: `wegSuche()` liefert den
kürzesten Weg über das Gitter, Wände und Spinde sind gesperrt.

## Herr Kreide

Er hört dich, nicht sieht dich. Ausgelöst wird er von:

* **Rennen** im Umkreis von 13 Zellen (mit Energiedrink bleibst du leise),
* **jedem gelösten Heft**,
* **jeder falschen Antwort** — die zieht ihn quer durchs Haus,
* Sichtkontakt unter 4,5 Zellen.

Sein Tempo: `1,35 + 0,30 × (Hefte + Rechenfehler)` Zellen pro Sekunde. Beim
siebten Heft ohne Fehler ist er also rund doppelt so schnell wie am Anfang —
mit ein paar Fehlern deutlich mehr. Ohne Reiz wandert er zu zufälligen Punkten.

## Der Direktor

Läuft seine eigenen Wege. Erwischt er dich beim **Rennen im Flur** in Sicht und
unter 7 Zellen, versetzt er dich in einen weit entfernten Raum und macht neun
Sekunden Pause. Kein Spielende — aber der Weg zum nächsten Heft ist hin.

## Gegenstände

| | Wirkung |
|---|---|
| **Energiedrink** | 18 s schneller *und* leise — Rennen ruft Herrn Kreide nicht |
| **Seifenstück** | hinter sich ablegen; er rutscht aus und liegt 5 s |
| **Zonk-Riegel** | acht Zellen hinter dich geworfen, er läuft dem Krach nach |

`1` `2` `3` benutzen sie, `E` nimmt auf.

## Die Aufgaben

Drei je Heft. Die Schwierigkeit wählst du im Startbildschirm, sie wird
gespeichert. Jede Stufe schaltet eine neue Aufgabenart frei; gewürfelt wird aus
allen bisher freigeschalteten, mit Übergewicht auf der neuesten — dadurch
steigt es an, ohne dass Heft 6 plötzlich leichter ist als Heft 3. Die dritte
Aufgabe eines Hefts zählt als ein Heft mehr.

| Stufe | was vorkommt | größtes Ergebnis |
|---|---|---|
| **Leicht** (Voreinstellung) | Plus und Minus, ein- und zweistellig | 43 |
| **Normal** | dazu das kleine Einmaleins und Division daraus | 88 |
| **Schwer** | bis 12 × 12, zweistellig, mit Zwischenschritt | 159 |

Minus wird nie negativ, Division geht immer glatt auf. Der Druck soll aus der
Verfolgung kommen, nicht aus dem Kopfrechnen. Falsch heißt nicht verloren — es
macht Herrn Kreide nur schneller.

## Eigene Grafiken

Der Ordner `assets/` ist ein Austauschpunkt: Liegt dort eine PNG mit passendem
Namen, ersetzt sie die eingebaute Zeichnung; fehlt sie, bleibt es bei der
gezeichneten. Namen und Maße stehen in `assets/LIESMICH.md`. Nur eigenes
Material dort ablegen.

## Steuerung

| | |
|---|---|
| Gehen | `W` `A` `S` `D` |
| Umsehen | Maus (Klick fängt den Zeiger) oder `←` `→` |
| Rennen | `Shift` — laut! |
| Aufnehmen / benutzen | `E`, Gegenstände `1` `2` `3` |
| Maus freigeben | `Esc` |

Auf dem Handy: Knüppel links, rechte Bildhälfte zum Umsehen, zwei Knöpfe.

## Werkbank

`window.__schule` liegt offen: `setzen(x,y)`, `alleHefte()`, Zugriff auf
Spieler, Verfolger, Hefte und Gegenstände.
