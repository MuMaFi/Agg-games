# NACHTSCHICHT

Ein Sim-Cade-Rennspiel im Browser. Ein echter Rundkurs, zwei Wagen, Zeitnahme
mit Geist und ein Risikozähler namens PULS.

## Wichtig: die Seite braucht einen Webserver

Anders als die übrigen Spiele der Sammlung lässt sich `index.html` **nicht per
Doppelklick** öffnen. Der Browser verweigert vom Dateisystem aus das Laden der
Modelle (rund 40 MB glTF). Über GitHub Pages läuft alles; lokal genügt:

```bash
python3 -m http.server 8000     # im Wurzelverzeichnis des Projekts
# dann http://localhost:8000/games/racer/ aufrufen
```

## Freie Fahrt auf dem ganzen Netz

Es gibt **keine Leitplanken**. Gefahren wird überall, wo Asphalt liegt — auch
auf Boxengasse, Zufahrten und den Abschnitten, die zu keinem Rundkurs gehören.
Eine Stichprobe von 900 Punkten, gleichmäßig über das gesamte Straßennetz
gestreut, wird zu **99,4 %** als Asphalt erkannt; 551 dieser Punkte liegen
abseits des gewerteten Kurses.

Der Rundkurs bleibt trotzdem gewertet: Wer ihn abkürzt (mehr als 0,7 s neben
der Bahn), bekommt seine Zeit angezeigt, aber sie zählt nicht als Bestzeit.
`Enter` setzt den Wagen auf den nächsten Punkt des Kurses zurück.

### Boxengasse

Die Boxengasse war nie gesperrt — sie ist Teil von `road_mat` und lag von
Anfang an im befahrbaren Netz. Eine Erreichbarkeitsprüfung über das ganze
Gelände belegt das: ein Raster von 2,5 m, an jedem Punkt **alle** Asphaltebenen
gesammelt (nur so lässt sich eine Brücke von einer Kreuzung unterscheiden),
Nachbarn nur bei fahrbarem Höhenunterschied verbunden — von der Startlinie aus
sind **100 % der Fahrbahn erreichbar**, die 198 Rasterzellen der Boxengasse
eingeschlossen.

Was fehlte, war der Weg dorthin: sie liegt jenseits der Brücke, rund 200 m vom
Rundkurs entfernt. Deshalb ist sie jetzt

* im Menü als **Startplatz wählbar** (der Wagen setzt vor den Garagen auf),
* auf der Minimap **türkis markiert**, damit man sie im Netz findet.

Ihre Geometrie steckt in `boxengasse.js`: 385 m lang, 7,4 m breit, aus dem
schmalen Band zwischen Boxenmauer und Garagen gewonnen — begrenzt auf den
Bereich, in dem Gasse und Hauptgerade wirklich nebeneinanderliegen und eine
Mauer dazwischen steht. Ein Querschnitt zeigt beide auf derselben Höhe
(7,55 m im Westen, 3,79 m im Osten), getrennt durch 2,7–5,8 m ohne Asphalt.

## Woher die Strecke ihre Ideallinie hat

Das Streckenmodell bringt keine Wegdaten mit — nur Geometrie. Die Mittellinie
ist deshalb aus dem Modell selbst herausgerechnet:

1. Nur die Meshes mit dem Material `road_mat` von oben orthografisch als
   schwarz-weiße Maske gerendert. Vier farbige Marker an bekannten
   Weltkoordinaten liefern die exakte Umrechnung Pixel ↔ Welt.
2. Maske gesäubert (kleine Löcher zu, Splitter weg) und skelettiert.
3. Im Kreuzungsgraph **alle** geschlossenen Kreise gesucht: 8 Kreuzungen,
   12 Kanten, 10 verschiedene Kreise zwischen 467 m und 1978 m.
4. Jeden Kandidaten in 3D nachgemessen und die unfahrbaren verworfen (siehe
   unten). Übrig bleibt der längste echte Rundkurs.
5. Gleichmäßig auf 4 Einheiten abgetastet, geglättet — 248 Stützpunkte,
   **991,6 m Runde, 11 Kurven, 13 m Höhenunterschied**.
6. Höhe und Fahrbahnkanten je Punkt per Strahl gemessen, mit demselben kurzen
   Strahl, den auch der Wagen benutzt.

Das Ergebnis liegt in `strecke.js`, das Straßennetz für die Karte in `karte.js`.

### Zwei Fallen, die dabei zuschnappten

**Die orthografische Kamera spannt relativ zu ihrer eigenen Position auf.**
`left`/`right` sind Abstände von der Kamera, keine Weltkoordinaten. Die erste
Maske war deshalb um 56 Einheiten verschoben und links beschnitten — ein
Sechstel der Strecke fehlte, ohne dass das Ergebnis kaputt aussah. Jetzt wird
symmetrisch um die Kameramitte aufgespannt.

**Die langen Kreise gibt es nur in der Draufsicht.** Mit der vollständigen
Maske findet die Suche Kreise bis 1978 m — sie sehen nach einem
Grand-Prix-Kurs aus. An einer Stelle führt der Kurs aber über sich selbst
hinweg, und das 2D-Skelett verschmilzt die beiden Ebenen zu einer Kreuzung.
Die Nachmessung zeigt es eindeutig: dort springt die Fahrbahnhöhe um 9,3 m
zwischen zwei Punkten, die 4 m auseinanderliegen.

| Kandidat | Höhensprung | Urteil |
|---|---|---|
| 1977,9 m | 9,34 m | Brücke — nicht zusammenhängend |
| 1953,2 m | 9,35 m | Brücke |
| 1945,9 m | 9,34 m | Brücke |
| 1921,1 m | 9,35 m | Brücke |
| 1475,6 m | 9,33 m | Brücke |
| 1450,8 m | 9,34 m | Brücke |
| **991,6 m** | **0,43 m** | **fahrbar** |
| 959,6 m | 0,43 m | fahrbar |
| 926,1 m | 0,40 m | fahrbar |
| 467,2 m | 0,34 m | Brücke |

Der Asphalt jenseits der Brücke ist deshalb kein Rundkurs — befahrbar ist er
trotzdem, und genau dafür gibt es die freie Fahrt.

## Fahrmodell

Einspurmodell mit Schräglaufwinkeln und sättigenden Reifenkräften — kein
starrer Körper, keine Physik-Bibliothek:

* Lenkwinkel schwindet mit dem Tempo.
* Schräglaufwinkel vorn/hinten aus Quergeschwindigkeit und Drehrate.
* Reifenkraft linear mit Deckel — jenseits davon rutscht es.
* Handbremse nimmt der Hinterachse 70 % Seitenhalt.
* Neben der Bahn fällt der Grip auf 60 %, in der Luft auf 12 %.
* Steigung zieht am Wagen — der Kurs hat 13 m Höhenunterschied.
* Feste Teilschritte von 1/120 s, damit das Reifenmodell bei Bildratenschwankung
  nicht ausbricht.

Der Wagen liegt per Strahl auf der Fahrbahn. Es wird zuerst nur gegen das
Fahrbahn-Mesh gestrahlt und erst bei einem Fehlschlag gegen Gras und Sand —
das Gelände-Mesh spannt sich über die ganze Karte und liegt stellenweise über
dem Asphalt, ein gemeinsamer Strahl würde den Wagen dauernd als neben der Bahn
melden. Fällt er aus der Welt, setzt er auf die zuletzt befahrene Stelle
zurück.

## Selbsttest

Weil ein Rennspiel sich nicht per Einheitstest prüfen lässt, fährt ein Regler
die Strecke ohne zu zeichnen ab:

```js
window.__probelauf(240, 1/60)   // Sekunden, Schrittweite
```

Er meldet Rundenzeiten, Spitzentempo, Zeitanteil neben der Bahn und
Bandenkontakte. Messwerte des eingebauten Reglers (konservativ eingestellt):

| Wagen | Runde | Spitze | neben der Bahn | Bandenkontakte |
|---|---|---|---|---|
| Dodge Charger | 66,2 s | 94 km/h | 3,2 % | 0 |
| McLaren P1 | 59,3 s | 123 km/h | 8,0 % | 16 |

Weitere Haken: `__vermessen()` misst Höhe und Kanten neu, `__hoehenPruefen()`
prüft eine beliebige Ringlinie auf Höhensprünge, `__abdeckung()` streut Punkte
über das ganze Netz und meldet, wie viel davon als Asphalt erkannt wird.

## Herkunft

Strecke und Fahrzeuge sind mitgebrachte glTF-Modelle (Sketchfab-Export) und
liegen unverändert unter `assets/`. Die Bibliotheken unter `lib/` sind
three.js 0.160 und three-mesh-bvh 0.7 — beigelegt, damit das Spiel ohne Netz
läuft.
