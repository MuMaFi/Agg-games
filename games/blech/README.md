# BLECHSCHADEN

Ein Draufsicht-Städter im Aufbau von GTA 2: offene Stadt, jedes Auto lässt sich
kapern, Aufträge kommen aus gelben Telefonzellen, und die Polizei hat ein gutes
Gedächtnis.

Läuft im Browser, ohne Build. `index.html` braucht einen Webserver (ES-Module
lädt der Browser nicht vom Dateisystem):

```bash
python3 -m http.server 8000     # im Wurzelverzeichnis des Projekts
# dann http://localhost:8000/games/blech/ aufrufen
```

## Die Stadt

`stadt.js` erzeugt sie aus einem Startwert — dieselbe Zahl, dieselbe Stadt.
Straßenachsen in unregelmäßigen Abständen, die Blöcke dazwischen werden
rekursiv in Parzellen geschnitten und bebaut; ein Zehntel wird Park, ein
weiteres Parkplatz. Ergebnis: 3600 × 2900 Einheiten, rund 430 Häuser, knapp
50 % bebaut, dazu ein Straßengraph aus 72 Knoten für Verkehr und Wegsuche.

`zeichnen.js` malt sie **einmal** auf eine eigene Leinwand (rund 280 ms). Pro
Bild wird nur noch der sichtbare Ausschnitt kopiert — dadurch kostet die Stadt
im laufenden Spiel nichts mehr. Alle Häuser werfen Schatten in dieselbe
Richtung, und je mehr Stockwerke, desto länger: das gibt der Draufsicht Höhe,
ohne 3D zu brauchen.

## Was in der Stadt los ist

* **98 Fahrzeuge**, davon 40 im fließenden Verkehr. Sie folgen dem
  Straßengraph, halten sich rechts der Mitte und bremsen für alles, was vor
  ihnen steht.
* **140 Fußgänger** auf den Gehwegen. Sie rennen weg, wenn geschossen wird oder
  ein Wagen zu schnell näher kommt.
* **Fahndung in fünf Stufen.** Sie steigt bei jedem Schuss, stärker bei
  Treffern, am stärksten gegen Polizisten; ohne Zwischenfall kühlt sie nach
  14 Sekunden langsam ab. Ab Stufe 1 kommen Streifen zu Fuß, ab Stufe 2 im
  Wagen und schießen zurück.
* **Beute** liegt herum: Waffen und Verbandskästen.

## Waffen

| Waffe | Schaden | Takt | Streuung | Magazin |
|---|---|---|---|---|
| Fäuste | 9 | 0,34 s | Nahkampf, 26 | — |
| Schläger | 24 | 0,48 s | Nahkampf, 36 | — |
| Pistole | 17 | 0,26 s | 0,035 | 120 |
| Schrotflinte | 11 × 6 Kugeln | 0,78 s | 0,20 | 48 |
| MP | 10 | 0,085 s | 0,075 | 260 |

Gezielt wird mit der Maus (der Spieler dreht sich zum Zeiger) oder in
Blickrichtung mit der Leertaste.

## Fahrmodell

Draufsicht-Arcade: Die Geschwindigkeit wird in Längs- und Queranteil zerlegt,
der Queranteil pro Bild gedämpft. Viel Dämpfung heißt Grip, wenig heißt
Driften — die Handbremse setzt sie fast auf null. Der Lenkeinschlag wirkt
proportional zum Tempo, im Stand lenkt nichts.

## Aufträge

`missionen.js` enthält eine Kette aus acht Aufträgen. Jeder besteht aus
Schritten, die das Spiel der Reihe nach abarbeitet:

| Schritt | Bedeutung |
|---|---|
| `fahre` | einen Punkt erreichen (`imWagen: true` verlangt das Auto) |
| `liefere` | wie `fahre`, anderer Text |
| `sammle` | mehrere verstreute Punkte einsammeln |
| `raeume` | alle Gegner im Umkreis ausschalten |
| `entkomme` | die Fahndung wieder auf null bringen |

Orte sind bewusst zufällig gesetzt: Die Stadt entsteht aus einem Startwert,
feste Koordinaten würden bei jeder Änderung am Generator ins Leere zeigen.

## Steuerung

| | |
|---|---|
| Gehen / Fahren | `W` `A` `S` `D` oder Pfeiltasten |
| Ein- und Aussteigen | `E` |
| Schießen | `Leertaste` oder Maustaste |
| Waffe wechseln | `Q`, `1`–`5` oder Mausrad |
| Handbremse | `Shift` |
| Karte groß | `M` |

Auf dem Handy: Knüppel links, Feuer / Ein-Aus / Waffe rechts.

## Werkbank

`window.__spiel` liegt offen: `setzen(x,y)`, `gib(waffe, munition)`,
`fahndung(stufe)` sowie Zugriff auf alle Listen. Damit lässt sich jeder
Zustand direkt herstellen, ohne ihn erst erspielen zu müssen.
