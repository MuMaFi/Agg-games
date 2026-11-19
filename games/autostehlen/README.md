# Illegal Autostehlen VI

Open World in einer Küstenstadt bei Sonnenuntergang: zu Fuß, im Auto, im Boot
und im Flugzeug. Verkehr, Fußgänger, Polizei mit bis zu fünf Sternen,
Kurieraufträge und Geld auf der Straße. Läuft im Browser, ohne Build.

`index.html` braucht einen Webserver (ES-Module lädt der Browser nicht vom
Dateisystem). Über GitHub Pages läuft alles; lokal genügt:

```bash
python3 -m http.server 8000     # im Wurzelverzeichnis des Projekts
# dann http://localhost:8000/games/autostehlen/ aufrufen
```

## Dateien

| Datei | Inhalt |
|---|---|
| `spiel.js` | Spielschleife, Fahrphysik, Verkehr, Polizei, Leute, Aufträge, Kamera, HUD, Karte, Ton, Menüs |
| `welt.js` | die Stadt: Straßennetz, Blöcke, Häuser, Brücken, Ufer, Kollision |
| `fahrzeugbau.js` | lädt die echten Modelle und bringt sie in eine Form (siehe unten) |
| `modelle.js` | selbst gebaute Boote, Flugzeuge, Hubschrauber |
| `texturen.js` | alle Texturen, beim Start auf Leinwände gemalt |
| `modelle/*.glb` | Autos und Spielfigur, verkleinert (zusammen rund 6 MB) |
| `bilder/logo.png` | das Logo, neu gezeichnet mit `werkzeug/autostehlen-logo.py` |

three.js kommt aus `../bloxrot/lib/`, die Nachbearbeitung (Bloom) aus `lib/`.

## Die Modelle

`fahrzeugbau.js` lädt jedes Auto und baut es um: vorne ist +z, Boden bei y = 0,
Länge in Metern. Die Karosserie wird je Material zu einem Mesh zusammengefasst,
damit ein Auto nur noch eine Handvoll Zeichenaufrufe kostet. Die Räder werden
zu vier eigenen Gelenken: beim Ford liegen sie als eigene Knoten vor, beim
Muscle-Car in einem gemeinsamen Mesh (wird nach Vierteln aufgeteilt), beim BMW
hängen sie an Knochen (die Haut wird gebacken und nach Knochen getrennt).
Der Lack ist eine Materialfarbe und wird für Verkehr, Polizei und Taxi
umgefärbt.

Die Spielfigur hat nur eine Gehanimation. Stehen ist der Moment im Clip, in
dem beide Füße am Boden und dicht beieinander sind; Rennen ist derselbe Clip,
schneller abgespielt. Die Vorwärtsdrift der Hüfte wird beim Laden entfernt.

## Herkunft und Lizenzen

| Teil | Quelle | Lizenz |
|---|---|---|
| Limousine | „Low poly Foxbody sedan“ von Daniel Zhabotinsky, [Sketchfab](https://sketchfab.com/3d-models/low-poly-foxbody-sedan-3d4f0d584c6945c8b14d081968073586) | CC BY 4.0 |
| BMW E30 | „(Low-poly) BMW E30 (free download)“ von KrStolorz, [Sketchfab](https://sketchfab.com/3d-models/low-poly-bmw-e30-free-download-e453bdae0ee1423ea79f1322db1c7459) | CC BY 4.0 |
| Muscle-Car | „LowPoly Game model“ von archer1533, [Sketchfab](https://sketchfab.com/3d-models/lowpoly-game-model-c429b45462524c03a460ace11f596f95) | CC BY 4.0 |
| Spielfigur | „Nathan Animated 003 – Walking 3D Man“ von Renderpeople, [Sketchfab](https://sketchfab.com/3d-models/nathan-animated-003-walking-3d-man-143a2b1ea5eb4385ae90a73657aca3bc) | CC BY 4.0 |
| Hochhäuser | „Miami style condominium“ und „Hi rise apartment building“ von aitortilla01 (Sketchfab) | CC BY 4.0 |
| Palmen | „Date Palm“ von evolveduk, „Phoenix Palm: Cities Skylines“ von TheHyperChimp (Sketchfab) | CC BY 4.0 |
| Waffen | „H&K USP 9mm Pistol“ (Elisei), „Revolver Navy Colt 1851 Silver“ (Johan Pindeville), „Sawed-off Shotgun“ (Matthew-David), „Low-Poly Mini Uzi“ (TastyTony), „M4A1 Rifle“ (ErhanMatur), alle Sketchfab | CC BY 4.0 |
| Spiegelwasser | `lib/Water.js` und `bilder/wassernormalen.jpg` aus den three.js-Beispielen | MIT |
| Schrift | Pricedown von Ray Larabie (Typodermic Fonts) | freie Schrift |
| three.js | three.js-Autoren | MIT |

Die Modelle wurden verkleinert (Texturen höchstens 1024 px, die Figur 2048 px)
und neu zusammengesetzt. Die Credits stehen auch im Spiel im Hauptmenü.
