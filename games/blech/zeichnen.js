/* ═══════════════════════════════════════════════════════════════════
   Stadtzeichner. Die Stadt ändert sich nie, also wird sie einmal auf
   eine eigene Leinwand gemalt; pro Bild wird nur noch der sichtbare
   Ausschnitt kopiert. Später Nachmittag: die Häuser werfen alle in
   dieselbe Richtung Schatten, und je mehr Stockwerke, desto länger —
   das gibt der Draufsicht Höhe, ohne 3D zu brauchen.
   ═══════════════════════════════════════════════════════════════════ */
import { zufall, STRASSE, GEHWEG } from './stadt.js';

export const SCHATTEN = {x: .58, y: .42};   // Richtung des Sonnenstands

export function malStadt(stadt){
  const c = document.createElement('canvas');
  c.width = stadt.breite; c.height = stadt.hoehe;
  const g = c.getContext('2d');

  // Grund: Erde zwischen allem
  g.fillStyle = '#4a4f45'; g.fillRect(0, 0, c.width, c.height);

  // Gehwege als breite Bänder unter den Straßen
  g.fillStyle = '#8d8b80';
  const gb = STRASSE/2 + GEHWEG;
  for(const s of stadt.strassenX) g.fillRect(s.x - gb, 0, gb*2, c.height);
  for(const s of stadt.strassenY) g.fillRect(0, s.y - gb, c.width, gb*2);
  // Bordsteinkante
  g.strokeStyle = '#a5a396'; g.lineWidth = 2;
  for(const s of stadt.strassenX){ kante(g, s.x-gb, 0, s.x-gb, c.height); kante(g, s.x+gb, 0, s.x+gb, c.height); }
  for(const s of stadt.strassenY){ kante(g, 0, s.y-gb, c.width, s.y-gb); kante(g, 0, s.y+gb, c.width, s.y+gb); }

  // Fahrbahn
  g.fillStyle = '#3a3d44';
  for(const s of stadt.strassenX) g.fillRect(s.x - STRASSE/2, 0, STRASSE, c.height);
  for(const s of stadt.strassenY) g.fillRect(0, s.y - STRASSE/2, c.width, STRASSE);

  // Mittelstreifen, an Kreuzungen ausgespart
  g.strokeStyle = '#c9c2a4'; g.lineWidth = 3; g.setLineDash([26, 22]);
  for(const s of stadt.strassenX) strichAusgespart(g, s.x, true, stadt);
  for(const s of stadt.strassenY) strichAusgespart(g, s.y, false, stadt);
  g.setLineDash([]);

  // Zebrastreifen an jeder Kreuzung
  g.fillStyle = '#d5cfb4';
  for(const a of stadt.strassenX) for(const b of stadt.strassenY) zebra(g, a.x, b.y);

  // Parks
  for(const p of stadt.parks){
    g.fillStyle = '#5c7a44'; g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = '#688a4c';
    const z = zufall(Math.round(p.x*7 + p.y));
    for(let i = 0; i < (p.w*p.h)/2600; i++)
      g.fillRect(p.x + z()*p.w, p.y + z()*p.h, 8 + z()*22, 6 + z()*14);
    // Wege
    g.strokeStyle = '#9a8f6e'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(p.x, p.y + p.h*.5); g.lineTo(p.x + p.w, p.y + p.h*.52); g.stroke();
  }
  // Parkplätze
  for(const p of stadt.parkplaetze){
    g.fillStyle = '#494c52'; g.fillRect(p.x, p.y, p.w, p.h);
    g.strokeStyle = '#c9c2a4'; g.lineWidth = 2;
    for(let x = p.x + 24; x < p.x + p.w - 12; x += 30){
      g.beginPath(); g.moveTo(x, p.y + 6); g.lineTo(x, p.y + 46); g.stroke();
      g.beginPath(); g.moveTo(x, p.y + p.h - 46); g.lineTo(x, p.y + p.h - 6); g.stroke();
    }
  }

  // Schatten aller Häuser zuerst — sonst liegen sie auf den Nachbarn
  g.fillStyle = 'rgba(20,18,26,.30)';
  for(const b of stadt.gebaeude){
    const l = b.stock * 3.4;
    g.beginPath();
    g.moveTo(b.x, b.y); g.lineTo(b.x + b.w, b.y); g.lineTo(b.x + b.w, b.y + b.h); g.lineTo(b.x, b.y + b.h);
    g.closePath();
    g.translate(SCHATTEN.x*l, SCHATTEN.y*l); g.fill();
    g.setTransform(1,0,0,1,0,0);
  }

  // Häuser
  for(const b of stadt.gebaeude) malHaus(g, b);

  // Bäume über allem
  for(const p of stadt.parks) for(const t of p.baeume) malBaum(g, t);

  return c;
}

function kante(g, x1, y1, x2, y2){ g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke(); }

function strichAusgespart(g, pos, senkrecht, stadt){
  const quer = senkrecht ? stadt.strassenY.map(s=>s.y) : stadt.strassenX.map(s=>s.x);
  const ende = senkrecht ? stadt.hoehe : stadt.breite;
  let von = 0;
  const stops = [...quer, ende].sort((a,b)=>a-b);
  for(const q of stops){
    const bis = Math.min(q - STRASSE/2 - 8, ende);
    if(bis > von + 12){
      g.beginPath();
      if(senkrecht){ g.moveTo(pos, von); g.lineTo(pos, bis); }
      else { g.moveTo(von, pos); g.lineTo(bis, pos); }
      g.stroke();
    }
    von = q + STRASSE/2 + 8;
  }
}

function zebra(g, x, y){
  const h = STRASSE/2, a = 7, l = 15;
  for(let o = -h + 6; o < h - 6; o += a*2){
    g.fillRect(x + o, y - h - l, a, l);       // oben
    g.fillRect(x + o, y + h, a, l);           // unten
    g.fillRect(x - h - l, y + o, l, a);       // links
    g.fillRect(x + h, y + o, l, a);           // rechts
  }
}

function malHaus(g, b){
  const z = zufall(b.saat);
  g.fillStyle = b.farbe; g.fillRect(b.x, b.y, b.w, b.h);
  // Dachfläche etwas dunkler zur Mitte, damit Kanten lesbar bleiben
  g.fillStyle = b.dach;
  g.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
  // Dachaufbauten
  const n = Math.floor((b.w * b.h) / 4200);
  for(let i = 0; i < n; i++){
    const w = 8 + z()*16, h = 8 + z()*14;
    const x = b.x + 8 + z()*Math.max(1, b.w - 16 - w);
    const y = b.y + 8 + z()*Math.max(1, b.h - 16 - h);
    g.fillStyle = z() < .35 ? '#5a5f66' : b.farbe;
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(x + w, y + 2, 3, h);
  }
  // Umriss
  g.strokeStyle = 'rgba(24,20,28,.55)'; g.lineWidth = 2;
  g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  // Lichtkante zur Sonne hin
  g.strokeStyle = 'rgba(255,236,196,.20)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(b.x + 1, b.y + 1); g.lineTo(b.x + b.w - 1, b.y + 1); g.stroke();
}

function malBaum(g, t){
  g.fillStyle = 'rgba(20,18,26,.28)';
  g.beginPath(); g.arc(t.x + SCHATTEN.x*11, t.y + SCHATTEN.y*11, t.r, 0, 7); g.fill();
  g.fillStyle = '#3f6b34';
  g.beginPath(); g.arc(t.x, t.y, t.r, 0, 7); g.fill();
  g.fillStyle = '#4f8340';
  g.beginPath(); g.arc(t.x - t.r*.25, t.y - t.r*.25, t.r*.62, 0, 7); g.fill();
}
