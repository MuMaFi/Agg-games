/* Pocketcraft · Skins
   Wie man aussieht — für die anderen im Mehrspieler und an der eigenen Hand:
   OG: Pocketcrafts eigene Figur (Hemd in der gewählten Farbe), Steve: die
   Figur aus dem Minecraft-Paket (braucht die eigene client.jar), oder ein
   eigener Skin im Format des Vorbilds: 64 × 64 (auch das alte 64 × 32),
   ebenso verkleinert oder vergrößert in 16 × 16, 32 × 32 und 128 × 128.
   Die äußere Schicht (Hut, Jacke, Ärmel, Hosenbeine) wird mitgezeichnet;
   schmale Arme (wie Alex) erkennt Pocketcraft am Bild.

   Gezeichnet wird mit Minecrafts Spielermodell (mcwesen.js). Den eigenen
   Skin bekommt der Host beim Beitreten, er verteilt alle an alle. */
'use strict';

const SKIN_KEY = 'pocketcraft.skin.v1';
const SKIN_GROESSEN = [16, 32, 64, 128];
const SKIN_MAX = 160000;                    // so lang darf ein Skin als data:-Adresse sein

/** Pixel aus einer data:-Adresse */
function skinPixel(url){
  return new Promise((ok, nein) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const c = cv.getContext('2d', { willReadFrequently:true });
      c.drawImage(img, 0, 0);
      ok({ w: img.width, h: img.height, d: c.getImageData(0, 0, img.width, img.height).data });
    };
    img.onerror = () => nein(new Error('Das Bild lässt sich nicht lesen.'));
    img.src = url;
  });
}
/** Ein alter Skin (doppelt so breit wie hoch) bekommt die untere Hälfte wie beim Vorbild:
    linkes Bein und linker Arm als Spiegelbild der rechten, ohne äußere Schicht */
function skinAlt(px){
  const f = px.w/64, d = new Uint8ClampedArray(px.w*px.w*4);
  d.set(px.d.subarray(0, px.w*px.h*4));
  const kopie = (x, y, dx, dy, w, h) => {
    for(let j = 0; j < h*f; j++) for(let i = 0; i < w*f; i++){
      const q = ((y*f + j)*px.w + x*f + i)*4, z = ((y*f + dy*f + j)*px.w + x*f + dx*f + (w*f - 1 - i))*4;
      d[z] = d[q]; d[z+1] = d[q+1]; d[z+2] = d[q+2]; d[z+3] = d[q+3];
    }
  };
  kopie(4, 16, 16, 32, 4, 4); kopie(8, 16, 16, 32, 4, 4); kopie(0, 20, 24, 32, 4, 12); kopie(4, 20, 16, 32, 4, 12);
  kopie(8, 20, 8, 32, 4, 12); kopie(12, 20, 16, 32, 4, 12); kopie(44, 16, -8, 32, 4, 4); kopie(48, 16, -8, 32, 4, 4);
  kopie(40, 20, 0, 32, 4, 12); kopie(44, 20, -8, 32, 4, 12); kopie(48, 20, -16, 32, 4, 12); kopie(52, 20, -8, 32, 4, 12);
  return { w: px.w, h: px.w, d };
}
/** schmale Arme? Beim Vorbild bleibt dann die vierte Spalte des rechten Arms (x 54 … 55, y 20 … 31) leer */
function skinSchmal(px){
  const f = px.w/64;
  for(let y = 20; y < 32; y++){ const p = ((Math.floor(y*f))*px.w + Math.floor(54*f))*4; if(px.d[p+3] > 0) return false; }
  return true;
}

const Skin = {
  art: null, bild: null,                    // 'og' · 'steve' · 'eigen' (bild: data:-Adresse); null: noch nicht gewählt
  _cache: new Map(),                        // Schlüssel → { teile, hand } oder Promise

  laden(){
    try{
      const d = JSON.parse(localStorage.getItem(SKIN_KEY));
      if(d && ['og', 'steve', 'eigen'].includes(d.art)){ this.art = d.art; this.bild = typeof d.bild === 'string' ? d.bild : null; }
    }catch(e){}
    if(this.art === 'eigen' && !this.bild) this.art = null;
  },
  /** was gilt: noch nichts gewählt — wie bisher, mit dem Minecraft-Paket Steve, sonst OG */
  wirksam(){ return this.art || (typeof McWesen !== 'undefined' && McWesen.an ? 'steve' : 'og'); },
  sichern(){ try{ localStorage.setItem(SKIN_KEY, JSON.stringify({ art: this.art, bild: this.bild })); }catch(e){} },
  setzen(art){
    this.art = art; this.sichern();
    if(typeof Netz !== 'undefined' && Netz.skinGeaendert) Netz.skinGeaendert();
  },
  /** fürs Netz: kurz, der eigene Skin als Bild */
  netz(){ const a = this.wirksam(); return a === 'eigen' && this.bild ? { a:'eigen', b:this.bild } : { a }; },
  /** was aus dem Netz kommt, nur in Ordnung gebracht weitergeben */
  pruefen(s){
    if(!s || typeof s !== 'object') return { a:'og' };
    if(s.a === 'eigen' && typeof s.b === 'string' && s.b.startsWith('data:image/png;base64,') && s.b.length <= SKIN_MAX) return { a:'eigen', b:s.b };
    return { a: s.a === 'steve' ? 'steve' : 'og' };
  },

  /** eine hochgeladene Datei prüfen und übernehmen */
  async hochladen(datei){
    if(!datei) return;
    if(datei.size > 2*1024*1024) throw new Error('Die Datei ist zu groß.');
    const url = await new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => nein(r.error); r.readAsDataURL(datei); });
    const px = await skinPixel(url);
    if(!SKIN_GROESSEN.includes(px.w) || (px.h !== px.w && px.h !== px.w/2))
      throw new Error('Ein Skin ist ' + SKIN_GROESSEN.map(g => g + ' × ' + g).join(', ') + ' groß (oder halb so hoch). Dieses Bild ist ' + px.w + ' × ' + px.h + '.');
    // als PNG neu schreiben: klein, und nichts anderes als Pixel geht übers Netz
    const cv = document.createElement('canvas'); cv.width = px.w; cv.height = px.h;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.d), px.w, px.h), 0, 0);
    const png = cv.toDataURL('image/png');
    if(png.length > SKIN_MAX) throw new Error('Dieser Skin ist zu detailreich für das Netz — versuch eine kleinere Fassung.');
    this.bild = png;
    this.setzen('eigen');
  },

  /** Pixel eines Skins (im 64 × 64-Aufbau) oder null; s = { a, b } */
  async _pixel(s){
    if(s.a === 'steve') return typeof McPaket !== 'undefined' && McPaket.texturen ? McPaket._px('entity/player/wide/steve') : null;
    if(s.a !== 'eigen' || !s.b) return null;
    const px = await skinPixel(s.b);
    return px.h === px.w/2 ? skinAlt(px) : px;
  },
  /** Teile (Figur) und Hand für einen Skin; noch nicht fertig: null, und im Hintergrund bauen */
  fertig(s){
    if(!s || s.a === 'og') return null;
    const k = s.a === 'eigen' ? 'e:' + s.b.length + ':' + s.b.slice(-48) : 's';
    const c = this._cache.get(k);
    if(c && !c.then) return c;
    if(!c) this._cache.set(k, this._bauen(s).then(r => { this._cache.set(k, r); return r; }, () => { this._cache.set(k, null); return null; }));
    return null;
  },
  async _bauen(s){
    const px = await this._pixel(s);
    if(!px) return null;
    const modell = s.a === 'eigen' && skinSchmal(px) ? 'player_slim' : 'player';
    McWesen._neu = false;
    const teile = McWesen._bauen(modell, px), hand = McWesen._handBauen(px, modell);
    if(texData.length > (gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || 256)) return null;
    if(McWesen._neu){ gl.deleteTexture(R.texArr); R.buildTexArray(); McWesen._neu = false; }
    return { teile, hand };
  },
  /** die eigene Hand: Teile oder null für Pocketcrafts Arm */
  hand(){
    if(this.wirksam() === 'og') return null;
    const r = this.fertig(this.netz());
    return r ? r.hand : null;
  },

  /* — Bilder für die Oberfläche — */
  /** Gesicht mit Hut, 8 × 8 hochskaliert; für OG Pocketcrafts Gesicht */
  async kopfURL(s){
    if(!s || s.a === 'og') return typeof iconURL === 'function' ? iconURL('m_sp_gesicht') : '';
    const px = await this._pixel(s).catch(() => null);
    if(!px) return iconURL('m_sp_gesicht');
    const f = px.w/64, cv = document.createElement('canvas'); cv.width = cv.height = 8*f;
    const c = cv.getContext('2d'), img = c.createImageData(8*f, 8*f);
    for(const [u, v] of [[8, 8], [40, 8]]) for(let y = 0; y < 8*f; y++) for(let x = 0; x < 8*f; x++){
      const q = ((v*f + y)*px.w + u*f + x)*4, o = (y*8*f + x)*4, a = px.d[q+3]/255;
      if(!a) continue;
      for(let k = 0; k < 3; k++) img.data[o+k] = px.d[q+k]*a + img.data[o+k]*(1 - a);
      img.data[o+3] = 255;
    }
    c.putImageData(img, 0, 0);
    return cv.toDataURL();
  },
  /** Ansicht von vorn (16 × 32 Einheiten): Kopf, Körper, Arme, Beine, jeweils mit äußerer Schicht */
  async vorschau(cv, s){
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height); c.imageSmoothingEnabled = false;
    const e = cv.width/16;
    if(!s || s.a === 'og'){
      const teil = (n, x, y, w, h) => c.drawImage(layerCanvas(n), x*e, y*e, w*e, h*e);
      teil('m_sp_gesicht', 4, 0, 8, 8); teil('m_sp_hemd', 4, 8, 8, 12); teil('m_sp_arm', 0, 8, 4, 12); teil('m_sp_arm', 12, 8, 4, 12);
      teil('m_sp_hose', 4, 20, 4, 12); teil('m_sp_hose', 8, 20, 4, 12);
      return;
    }
    const px = await this._pixel(s).catch(() => null);
    if(!px) return;
    const f = px.w/64, schmal = s.a === 'eigen' && skinSchmal(px), aw = schmal ? 3 : 4;
    const bild = document.createElement('canvas'); bild.width = px.w; bild.height = px.h;
    bild.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.d), px.w, px.h), 0, 0);
    const teil = (u, v, w, h, x, y) => c.drawImage(bild, u*f, v*f, w*f, h*f, x*e, y*e, w*e, h*e);
    // innen, dann außen: Kopf/Hut, Körper/Jacke, rechter Arm (links im Bild), linker Arm, Beine
    teil(8, 8, 8, 8, 4, 0); teil(20, 20, 8, 12, 4, 8); teil(44, 20, aw, 12, 4 - aw, 8); teil(36, 52, aw, 12, 12, 8);
    teil(4, 20, 4, 12, 4, 20); teil(20, 52, 4, 12, 8, 20);
    teil(40, 8, 8, 8, 4, 0); teil(20, 36, 8, 12, 4, 8); teil(44, 36, aw, 12, 4 - aw, 8); teil(52, 52, aw, 12, 12, 8);
    teil(4, 36, 4, 12, 4, 20); teil(4, 52, 4, 12, 8, 20);
  },
};
Skin.laden();
