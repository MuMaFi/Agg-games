# Musik für Pocketcraft

Hier liegt die Musik des Spiels. Auf dem Titelbild laufen die Stücke in
zufälliger Reihenfolge durch. In der Welt kommt ab und zu eins, mit ein paar
Minuten Ruhe dazwischen. In den Optionen gibt es einen eigenen Regler dafür.
Das Spiel zeigt keine Titel und keine Namen an.

Was im Unterordner `platten/` liegt, läuft nicht im Hintergrund, sondern
ist eine Schallplatte: Man legt sie im Spiel in einen Plattenspieler, dann
spielt sie aus seiner Richtung. Solange sie in der Nähe läuft, schweigt die
Hintergrundmusik. Im Moment gibt es im Spiel eine Schallplatte; sie spielt
das erste Stück aus `platten/`.

## Stücke hinzufügen oder austauschen

1. Die Audiodateien hier in diesen Ordner legen, am besten als **MP3** —
   Schallplatten in den Unterordner `platten/`.
   Auf GitHub geht das im Browser: Ordner öffnen, *Add file → Upload files*.
2. Fertig. Der Workflow „Musik einlesen“ (`.github/workflows/musik.yml`)
   springt beim Hochladen an:
   - Er wandelt WAV, FLAC, M4A, OGG und AIFF in MP3 um und entfernt die
     großen Originale.
   - Er nimmt Metadaten und eingebettete Bilder aus den Dateien. Der Ton
     bleibt dabei unverändert.
   - Er misst die Lautheit und trägt eine Pegelangabe in `liste.json` ein,
     damit alle Stücke gleich laut klingen.

Selbst ausführen geht auch: `python3 werkzeug/musik-einlesen.py games/pocketcraft/musik`.

Die Musik steht **nicht** unter einer freien Lizenz wie die Geräusche. Alle
Rechte liegen beim Urheber; Weiterverwenden nur mit dessen Erlaubnis.
