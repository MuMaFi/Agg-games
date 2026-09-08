# NACHSITZEN

Ein Schulhaus aus der Ich-Perspektive: sieben Hefte einsammeln, in jedem drei
Rechenaufgaben lösen, dann durch einen der drei Ausgänge. Herr Kreide hat
nichts dagegen, dass du die Hefte holst — er kommt trotzdem. Nicht schneller
mit jedem Heft, aber im immer gleichen, unangenehmen Takt.

**Mit Ton spielen.** Das Spiel ist darauf gebaut, dass man ihn hört, bevor man
ihn sieht.

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

**Er läuft nicht — er ruckt.** Alle 1,05 s klatscht das Lineal in die Hand,
und genau in dem Moment schiebt er sich 1,5 Zellen nach vorn; dazwischen steht
er still. In der Spitze ist das 7 Zellen pro Sekunde, also weit schneller als
du (2,1 gehend) — im Mittel aber 1,43, also langsamer. Wer geradeaus rennt,
zieht davon; wer stehen bleibt und rechnet, hat ihn plötzlich im Nacken.

Der Takt bleibt die ganze Runde gleich. Hefte und Rechenfehler rufen ihn
her, machen ihn aber **nicht** schneller — auch nach dem siebten Heft nicht.
Ohne Reiz wandert er zu zufälligen Punkten.

Jeder Schlag lässt den roten Rand kurz aufflackern — auch dann, wenn er noch
hinter einer Ecke steht. Das ist die einzige Vorwarnung, und sie kommt im Takt.

## Wo er ist, sagt dir das Ohr

Anfangs stand Herr Kreide als roter Punkt auf der Karte, die ganze Runde
lang. Damit war das Spiel vorbei, bevor es anfing: man musste nie hinhören,
nur auf die Ecke unten links schauen und außen herum laufen. Die Karte zeigt
ihn jetzt gar nicht mehr — sie zeigt einen **Ping an der Stelle, an der das
Lineal zuletzt geklatscht hat**, und der verklingt über anderthalb Takte.
Man weiß also, wo er *war*.

Wo er *ist*, sagt der Klang. Jeder Schlag wird

* **leiser** mit der Entfernung (quadratisch),
* **dumpfer** — ein Tiefpass, dessen Grenze mit dem Abstand fällt, deshalb
  klingt er hinter zwei Wänden nach nichts und im selben Gang wie ein
  Peitschenhieb,
* **im Panorama dorthin gelegt**, wo er steht.

Das ist die ganze Ortung. Der Rest des Klangs ist synthetisch dazugebaut:
Netzbrummen der Leuchtstoffröhren (50/100/150 Hz plus ein schmales Zischen),
ein Nachhall aus abfallendem Rauschen für den langen Gang, Schritte am
wirklich gelaufenen Weg, ein Herzschlag, der erst ab elf Zellen Nähe
einsetzt, und irgendwo im Haus fällt hin und wieder eine Tür zu. Da ist
nichts dahinter. Es macht nur nervös. Keine Dateien, alles WebAudio —
`klang.js`.

`M` schaltet den Ton, auf dem Handy der Knopf unten rechts.

## Licht

Jede Deckenplatte hat ihren eigenen Wert. Ungefähr ein Drittel der Röhren
ist tot und bekommt eine eigene Textur mit kaltem Glas, ein paar zucken.
Danach läuft ein Weichzeichner über die Karte, damit das Licht von einer
Zelle in die nächste blutet statt an der Plattenfuge abzureißen — sonst
sieht es aus wie ein Schachbrett.

Wände werden von dem Licht angestrahlt, das **vor** ihnen steht, nicht von
ihrem eigenen Feld: der Raycaster merkt sich dafür die letzte freie Zelle,
durch die der Strahl gekommen ist.

Mit jedem Heft trägt das Licht knapp eine Zelle weniger weit (15 → 9), und
ab dem fünften Heft fällt der Strom für eine halbe bis anderthalb Sekunden
ganz aus. Das Brummen geht dabei mit. Herr Kreide wird nicht schneller —
das Haus wird enger.

Über dem Bild liegen noch eine Vignette und ein Filmkorn als eigene
CSS-Ebenen. Das kostet nichts pro Bildpunkt, der Browser schiebt beides auf
die Grafikkarte; gemessen bleiben 60 Bilder/s.

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
ruft Herrn Kreide nur her.

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
Spieler, Verfolger, Hefte und Gegenstände — dazu `st` (Sichtweite, Strom,
Uhren) und `licht` (die Lichtkarte). Einen Stromausfall erzwingt man mit
`__schule.st.ausfallUhr = 0` bei mindestens fünf Heften.
