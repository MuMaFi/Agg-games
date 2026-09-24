#!/usr/bin/env python3
"""Musik für Pocketcraft einlesen.

Aufruf:  python3 werkzeug/musik-einlesen.py games/pocketcraft/musik

- WAV, FLAC, M4A/AAC, OGG/Opus und AIFF werden zu MP3 (160 kbit/s), das
  Original fliegt danach aus dem Ordner (MP3 ist, was jeder Browser kann).
- MP3s mit mehr als 256 kbit/s werden auf 160 kbit/s verkleinert.
- Aus jeder MP3 fliegen Metadaten und eingebettete Bilder (Künstler, Album,
  Titel, Links, Cover): Das Spiel nennt die Musik nirgends. Der Ton selbst
  wird dabei nur kopiert, nicht neu kodiert — er bleibt Bit für Bit gleich.
- Jeder Titel bekommt eine Pegelangabe „db“ (wie ReplayGain): gemessen nach
  EBU R128, Ziel −18 LUFS, ohne die Spitze über −0,5 dBFS zu heben. Das Spiel
  gleicht damit leise und laute Titel an, ohne die Datei anzufassen.
- Stücke im Unterordner platten/ werden genauso behandelt, laufen aber
  nicht als Hintergrundmusik: Sie sind Schallplatten für den Plattenspieler
  (in liste.json unter "platten").
- liste.json wird neu geschrieben; von Hand gesetzte Pegel bleiben.

Braucht ffmpeg (auf GitHub-Läufern vorhanden; sonst geht auch das
Python-Paket imageio-ffmpeg).
"""
import json, os, re, shutil, subprocess, sys

UMWANDELN = {'.wav', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.aif', '.aiff', '.wma'}
ZIEL_LUFS, SPITZE_MAX = -18.0, -0.5


def ffmpeg():
    p = shutil.which('ffmpeg')
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit('ffmpeg fehlt (apt install ffmpeg oder pip install imageio-ffmpeg)')


FF = ffmpeg()
OHNE_ANGABEN = ['-map_metadata', '-1', '-map_chapters', '-1', '-id3v2_version', '0', '-write_id3v1', '0']


def untersuchen(pfad):
    """Bitrate, und ob Angaben oder ein Bild drinstecken"""
    aus = subprocess.run([FF, '-hide_banner', '-i', pfad], capture_output=True, text=True).stderr
    b = re.search(r'bitrate:\s*(\d+)\s*kb/s', aus)
    angaben = '(attached pic)' in aus or bool(re.search(r'^\s{4,}(title|artist|album|comment|track|date|genre)\s*:', aus, re.M | re.I))
    return (int(b.group(1)) if b else 0), angaben


def pegel(pfad):
    """Lautheit (LUFS) und Spitze (dBFS) nach EBU R128 → Anpassung in dB"""
    aus = subprocess.run([FF, '-hide_banner', '-nostats', '-i', pfad, '-map', '0:a:0', '-af', 'ebur128=peak=true',
                          '-f', 'null', '-'], capture_output=True, text=True).stderr
    i = re.findall(r'I:\s*(-?[\d.]+)\s*LUFS', aus)
    p = re.findall(r'Peak:\s*(-?[\d.]+)\s*dBFS', aus)
    if not i:
        return 0.0
    lufs, spitze = float(i[-1]), float(p[-1]) if p else 0.0
    return round(min(ZIEL_LUFS - lufs, SPITZE_MAX - spitze), 1)


def einlesen(ordner):
    """Umwandeln, verkleinern, Angaben entfernen — nur die Dateien direkt im Ordner"""
    for name in sorted(os.listdir(ordner)):
        pfad = os.path.join(ordner, name)
        endung = os.path.splitext(name)[1].lower()
        if not os.path.isfile(pfad):
            continue
        if endung in UMWANDELN:
            print('wandle um:', name)
            subprocess.run([FF, '-v', 'error', '-y', '-i', pfad, '-map', '0:a:0', '-codec:a', 'libmp3lame', '-b:a', '160k']
                           + OHNE_ANGABEN + [os.path.splitext(pfad)[0] + '.mp3'], check=True)
            os.remove(pfad)
        elif endung == '.mp3':
            br, angaben = untersuchen(pfad)
            tmp = pfad + '.tmp.mp3'
            if br > 256:
                print(f'verkleinere: {name} ({br} kbit/s)')
                subprocess.run([FF, '-v', 'error', '-y', '-i', pfad, '-map', '0:a:0', '-codec:a', 'libmp3lame', '-b:a', '160k']
                               + OHNE_ANGABEN + [tmp], check=True)
                os.replace(tmp, pfad)
            elif angaben:
                print('Angaben und Bild entfernt:', name)
                subprocess.run([FF, '-v', 'error', '-y', '-i', pfad, '-map', '0:a:0', '-c:a', 'copy'] + OHNE_ANGABEN + [tmp], check=True)
                os.replace(tmp, pfad)


def liste(ordner, praefix, alte_pegel):
    """alle MP3s eines Ordners mit Pegel; praefix ist der Weg ab musik/"""
    titel = []
    for name in sorted(os.listdir(ordner), key=str.lower):
        if name.lower().endswith('.mp3') and os.path.isfile(os.path.join(ordner, name)):
            datei = praefix + name
            titel.append({'datei': datei, 'db': alte_pegel[datei] if datei in alte_pegel else pegel(os.path.join(ordner, name))})
    return titel


def main(ordner):
    liste_pfad = os.path.join(ordner, 'liste.json')
    try:
        alt = json.load(open(liste_pfad, encoding='utf-8'))
    except (OSError, ValueError):
        alt = {}
    alte_pegel = {t['datei']: t['db'] for art in ('titel', 'platten') for t in alt.get(art, [])
                  if isinstance(t, dict) and t.get('datei') and 'db' in t}

    einlesen(ordner)
    daten = {'titel': liste(ordner, '', alte_pegel)}
    platten = os.path.join(ordner, 'platten')
    if os.path.isdir(platten):
        einlesen(platten)
        daten['platten'] = liste(platten, 'platten/', alte_pegel)
    with open(liste_pfad, 'w', encoding='utf-8') as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f"{len(daten['titel'])} Titel, {len(daten.get('platten', []))} Schallplatten in {liste_pfad}")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'games/pocketcraft/musik')
