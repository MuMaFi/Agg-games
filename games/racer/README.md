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

## Woher die Strecke ihre Ideallinie hat

Das Streckenmodell bringt keine Wegdaten mit — nur Geometrie. Die Mittellinie
ist deshalb aus dem Modell selbst herausgerechnet:

1. Nur die Meshes mit dem Material `road_mat` von oben orthografisch als
   schwarz-weiße Maske gerendert. Vier farbige Marker an bekannten
   Weltkoordinaten liefern die exakte Umrechnung Pixel ↔ Welt.
2. Maske gesäubert (kleine Löcher zu, Splitter weg) und skelettiert.
3. Sackgassen abgeschnitten, bis nur noch Ringe übrig waren — damit fallen
   Boxengasse und Zufahrten heraus.
4. Im verbleibenden Kreuzungsgraph den **längsten geschlossenen Kreis** gesucht:
   5 Kreuzungen, 8 Kanten, längster Kreis 2551 Pixel.
5. Gleichmäßig auf 4 Einheiten abgetastet, geglättet — 248 Stützpunkte,
   **991 m Runde**.
6. Höhe und Fahrbahnkanten je Punkt per Strahl gemessen, mit demselben kurzen
   Strahl, den auch der Wagen benutzt.

Das Ergebnis liegt in `strecke.js`. Fällt die Strecke mal aus, muss nur dieses
eine Modul neu erzeugt werden.

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

Der Wagen liegt per Strahl auf der Fahrbahn. Die Streckengrenzen kommen aus der
Mittellinie: jenseits von Kante + 2,2 wird nur der Anteil **senkrecht** zur
Bande gebrochen, längs rutscht der Wagen weiter — sonst klebt er nach dem
ersten Kontakt fest.

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

Weitere Haken: `__vermessen()` misst Höhe und Kanten neu, `__probeBahn()`
prüft die Fahrbahnerkennung punktweise.

## Herkunft

Strecke und Fahrzeuge sind mitgebrachte glTF-Modelle (Sketchfab-Export) und
liegen unverändert unter `assets/`. Die Bibliotheken unter `lib/` sind
three.js 0.160 und three-mesh-bvh 0.7 — beigelegt, damit das Spiel ohne Netz
läuft.
