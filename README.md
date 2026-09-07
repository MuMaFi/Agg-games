# AGG Games

Eine Landingpage, die alle fünf Spiele an einem Ort versammelt — und die Spiele
gleich mit. Kein Server, kein Build, keine Installation: `index.html` im Browser
öffnen und losspielen.

## Was drin liegt

| Spiel | Art | Datei |
|---|---|---|
| **Taschenwelt** | Survival-Voxelspiel, 3D | `games/taschenwelt.html` |
| **Found Tape — Sublevel 0** | Backrooms-Horror, Ego-Perspektive | `games/foundtape.html` |
| **Snapshade** | Farbgedächtnis | `games/snapshade.html` |
| **Mario — Mini Jump ’n’ Run** | Jump ’n’ Run, 2D | `games/mario.html` |
| **KernClicker** | Idle / Clicker | `games/kernclicker.html` |

Jede Datei ist für sich vollständig und läuft auch einzeln weitergegeben.
`games/foundtape.html` ist mit rund 8 MB die größte — dort stecken three.js,
Texturen, Modell und Musik mit drin.

## Online stellen (GitHub Pages)

Die Seite besteht nur aus statischen Dateien, deshalb genügt eine Einstellung:

**Settings → Pages → Source: „Deploy from a branch“ → Branch: dieser Branch, Ordner: `/ (root)`**

Danach liegt das Regal unter `https://mumafi.github.io/Agg-games/`. Die Datei
`.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert.

## Die Spiele aktualisieren

Die Spieldateien sind Kopien aus ihren Heimat-Projekten. Kommt dort eine neue
Fassung, wird sie hier drüberkopiert:

```bash
cp ../SNAPSHADE/dist/foundtape.html games/foundtape.html
cp ../SNAPSHADE/snapshade.html      games/snapshade.html
cp ../marioana/index.html           games/mario.html
cp ../Kern-clicker/index.html       games/kernclicker.html
```

* [MuMaFi/SNAPSHADE](https://github.com/MuMaFi/SNAPSHADE) — Found Tape & Snapshade
* [MuMaFi/marioana](https://github.com/MuMaFi/marioana) — Mini Jump ’n’ Run
* [MuMaFi/Kern-clicker](https://github.com/MuMaFi/Kern-clicker) — KernClicker

Taschenwelt wohnt direkt hier; ein eigenes Heimat-Projekt gibt es dafür nicht.

## Ein Spiel dazustellen

1. Die Spieldatei nach `games/` legen.
2. In `index.html` eine `<a class="card">` kopieren, `href`, `--accent`,
   `data-cat`, Cover, Titel und Text anpassen.
3. Die Zahl in der passenden Filter-Schaltfläche und im Kopf (`5 Spiele`)
   hochzählen.

Die Filter arbeiten über `data-cat`; mehrere Kategorien werden mit Leerzeichen
getrennt (`data-cat="3d horror"`).
