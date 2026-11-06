/* Pocketcraft · Minecraft-Paket
   Wer Minecraft Java besitzt, kann Pocketcraft dessen Texturen und
   Geräusche geben. Nichts davon liegt bei AGG Games: die Bilder kommen
   entweder direkt von Mojangs Servern (die client.jar der aktuellen
   Fassung) oder aus der eigenen client.jar im .minecraft-Ordner, die
   Geräusche von Mojangs Servern oder aus dem eigenen assets-Ordner.
   Alles bleibt in diesem Browser (IndexedDB) und lässt sich jederzeit
   wieder entfernen.

   Mojangs Geräte-Server erlaubt Webseiten nicht, die Geräusche als Daten
   zu lesen. Kommen sie von dort, spielt sie deshalb ein einfaches
   Audio-Element ab — ohne Richtung, nur leiser mit der Entfernung. Aus dem
   eigenen assets-Ordner klingen sie wie die eigenen Geräusche aus ihrer
   Richtung. */
'use strict';

/* ── Was wird woraus ─────────────────────────────────────────────── */
/* Färbungen wie in der Ebene (»Plains«): Gras, Laub und Wasser sind in
   Minecraft grau und werden erst im Spiel eingefärbt. */
const MCF = { gras:[145, 189, 89], laub:[119, 171, 47], fichte:[97, 153, 97], wasser:[63, 118, 228], leder:[160, 101, 64] };

/** Pocketcraft-Textur → Pfad unter assets/minecraft/textures/ (ohne .png)
    oder { p, farbe, drauf, draufFarbe, bild (Animationsbild), alpha, riss } */
const MC_TEX = {
  stone:'block/stone', cobble:'block/cobblestone', dirt:'block/dirt',
  grass_top:{ p:'block/grass_block_top', farbe:MCF.gras },
  grass_side:{ p:'block/grass_block_side', drauf:'block/grass_block_side_overlay', draufFarbe:MCF.gras },
  grass_side_snow:'block/grass_block_snow',
  sand:'block/sand', gravel:'block/gravel', bedrock:'block/bedrock',
  sandstone:'block/sandstone', sandstone_top:'block/sandstone_top', snow:'block/snow', stonebrick:'block/stone_bricks',
  log_side:'block/oak_log', log_top:'block/oak_log_top', planks:'block/oak_planks',
  fichte_side:'block/spruce_log', fichte_top:'block/spruce_log_top',
  fichtennadeln:{ p:'block/spruce_leaves', farbe:MCF.fichte }, leaves:{ p:'block/oak_leaves', farbe:MCF.laub },
  glass:'block/glass', cactus_side:'block/cactus_side', cactus_top:'block/cactus_top',
  coal_ore:'block/coal_ore', iron_ore:'block/iron_ore', gold_ore:'block/gold_ore', diamond_ore:'block/diamond_ore',
  kuerbis:'block/pumpkin_side', kuerbis_oben:'block/pumpkin_top', kuerbis_gesicht:'block/carved_pumpkin',
  iron_block:'block/iron_block', gold_block:'block/gold_block', diamond_block:'block/diamond_block',
  wool0:'block/white_wool', wool1:'block/light_gray_wool', wool2:'block/black_wool', wool3:'block/brown_wool',
  craft_top:'block/crafting_table_top', craft_side:'block/crafting_table_side', craft_front:'block/crafting_table_front',
  furn_side:'block/furnace_side', furn_top:'block/furnace_top', furn_front:'block/furnace_front', furn_lit:'block/furnace_front_on',
  jukebox_side:'block/jukebox_side', jukebox_top:'block/jukebox_top', jukebox_top_voll:'block/jukebox_top',
  rs_erz:'block/redstone_ore', rs_block:'block/redstone_block', rs_verstaerker:'block/repeater', rs_verstaerker_an:'block/repeater_on',
  kolben_oben:'block/piston_top', kolben_oben_klebrig:'block/piston_top_sticky', kolben_seite:'block/piston_side',
  kolben_unten:'block/piston_bottom', kolben_innen:'block/piston_inner',
  rs_lampe:'block/redstone_lamp', rs_lampe_an:'block/redstone_lamp_on',
  farmland:'block/farmland', ladder:'block/ladder', door_top:'block/oak_door_top', door_bottom:'block/oak_door_bottom',
  torch:'block/torch', rs_fackel:'block/redstone_torch', rs_fackel_aus:'block/redstone_torch_off', hebel:'block/lever',
  tallgrass:{ p:'block/short_grass', farbe:MCF.gras }, rose:'block/poppy', dandelion:'block/dandelion', kornblume:'block/cornflower',
  i_stick:'item/stick', i_coal:'item/coal', i_iron:'item/iron_ingot', i_gold:'item/gold_ingot', i_diamond:'item/diamond',
  i_pork_raw:'item/porkchop', i_pork_cook:'item/cooked_porkchop', i_apple:'item/apple', i_golden_apple:'item/golden_apple',
  i_seeds:'item/wheat_seeds', i_wheat:'item/wheat', i_bread:'item/bread', i_bucket:'item/bucket', i_water_bucket:'item/water_bucket',
  i_milk_bucket:'item/milk_bucket', i_door:'item/oak_door', i_leather:'item/leather',
  i_beef_raw:'item/beef', i_beef_cooked:'item/cooked_beef', i_mutton_raw:'item/mutton', i_mutton_cooked:'item/cooked_mutton',
  i_chicken_raw:'item/chicken', i_chicken_cooked:'item/cooked_chicken', i_bone:'item/bone', i_bone_meal:'item/bone_meal',
  i_arrow:'item/arrow', i_bow:'item/bow', i_string:'item/string', i_shears:'item/shears', i_flint:'item/flint',
  i_feather:'item/feather', i_redstone:'item/redstone', i_schleimball:'item/slime_ball', i_smaragd:'item/emerald',
  i_egg:'item/egg', i_verstaerker:'item/repeater', i_hebel:'block/lever',
};
/* Betten (zweiteilig, Bilder je Farbe und Seite; siehe emitBett in welt.js) */
for(const [key, mc] of [['rot', 'red_bed'], ...BETTEN.map(b => [b.key, b.mc])])
  for(const t of BETT_TEILE) MC_TEX['bettmc_' + key + '_' + t] = 'block/' + mc + '_' + t;
MC_TEX.bettmc_unten = 'block/bed_down'; MC_TEX.bettmc_kopf_nord = 'block/bed_head_north';
MC_TEX.lava = { p:'block/lava_still', bild:0 }; MC_TEX.netherrack = 'block/netherrack'; MC_TEX.portal = { p:'block/nether_portal', bild:0 };
MC_TEX.i_feuerzeug = 'item/flint_and_steel';
Object.assign(MC_TEX, { wirr_nyzel:'block/warped_nylium', wirr_nyzel_seite:'block/warped_nylium_side', wirr_stiel:{ p:'block/warped_stem', bild:0 },
  wirr_stiel_oben:'block/warped_stem_top', wirr_warze:'block/warped_wart_block', wirr_wurzeln:'block/warped_roots', wirr_pilz:'block/warped_fungus',
  pilzlicht:'block/shroomlight', netherziegel:'block/nether_bricks', spawner:'block/spawner', i_netherziegel:'item/nether_brick', i_lohenrute:'item/blaze_rod', i_lohenstaub:'item/blaze_powder', i_enderperle:'item/ender_pearl' }); MC_TEX.obsidian = 'block/obsidian'; MC_TEX.braustand = 'block/brewing_stand'; MC_TEX.braustand_fuss = 'block/brewing_stand_base';
/** Bilder, für die es ohne Paket keine eigene Lage gibt (Betten, Fußplatten des Braustands) */
const mcZusatz = n => n.startsWith('bettmc_') || n === 'braustand_fuss';
for(let f = 0; f < WATER_FRAMES; f++) MC_TEX['water' + f] = { p:'block/water_still', farbe:MCF.wasser, bild:f*4, alpha:188 };
for(let s = 0; s < 8; s++) MC_TEX['crack' + s] = { p:'block/destroy_stage_' + Math.round(s*9/7), riss:true };
for(const [w, mw] of [['wheat0', 0], ['wheat1', 2], ['wheat2', 5], ['wheat3', 7]]) MC_TEX[w] = 'block/wheat_stage' + mw;
for(const [pc, mc] of [['wood', 'wooden'], ['stone', 'stone'], ['iron', 'iron'], ['gold', 'golden'], ['diamond', 'diamond']])
  for(const t of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) MC_TEX['i_' + pc + '_' + t] = 'item/' + mc + '_' + t;
for(const [pc, mc] of [['iron', 'iron'], ['gold', 'golden'], ['diamond', 'diamond']])
  for(const t of ['helmet', 'chestplate', 'leggings', 'boots']) MC_TEX['i_' + pc + '_' + t] = 'item/' + mc + '_' + t;
for(const t of ['helmet', 'chestplate', 'leggings', 'boots'])
  MC_TEX['i_leather_' + t] = { p:'item/leather_' + t, farbe:MCF.leder, drauf:'item/leather_' + t + '_overlay' };

/** alle Bildpfade, die aus der client.jar gebraucht werden */
function mcBildPfade(){
  const s = new Set(typeof mcWesenPfade === 'function' ? mcWesenPfade() : []);
  for(const v of Object.values(MC_TEX)){
    if(typeof v === 'string') s.add(v); else { s.add(v.p); if(v.drauf) s.add(v.drauf); }
  }
  return [...s];
}

/* Geräusche: Pocketcraft-Name → Dateien unter minecraft/sounds/ (ohne .ogg) */
const mcV = (p, n) => n ? Array.from({ length:n }, (_, i) => p + (i + 1)) : [p];
const MC_KLANG = {
  essen:mcV('random/eat', 3), kaputt:mcV('random/break'), autsch:mcV('damage/hit', 3), aufheben:mcV('random/pop'),
  tuer_auf:mcV('random/door_open'), tuer_zu:mcV('random/door_close'),
  truhe_auf:mcV('random/chestopen'), truhe_zu:mcV('random/chestclosed'),
  platsch:['liquid/splash', 'liquid/splash2'], schwimmen:mcV('liquid/swim', 18),
  ruestung_leder:mcV('item/armor/equip_leather', 6), ruestung_eisen:mcV('item/armor/equip_iron', 6),
  ruestung_diamant:mcV('item/armor/equip_diamond', 6),
  bogen:mcV('random/bow'), pfeil:mcV('random/bowhit', 4), werfen:mcV('random/bow'), schere:mcV('mob/sheep/shear'),
  kuh:mcV('mob/cow/say', 4), kuh_au:mcV('mob/cow/hurt', 3), schwein:mcV('mob/pig/say', 3), schwein_au:mcV('mob/pig/say', 3),
  schaf:mcV('mob/sheep/say', 3), huhn:mcV('mob/chicken/say', 3), huhn_au:mcV('mob/chicken/hurt', 2), ei_legen:mcV('mob/chicken/plop'),
  zombie:mcV('mob/zombie/say', 3), zombie_au:mcV('mob/zombie/hurt', 2), zombie_tot:mcV('mob/zombie/death'),
  skelett:mcV('mob/skeleton/say', 3), skelett_au:mcV('mob/skeleton/hurt', 4), skelett_tot:mcV('mob/skeleton/death'),
  schleim_sprung:mcV('mob/slime/big', 4), schleim_landen:mcV('mob/slime/small', 5),
  schleim_au:mcV('mob/slime/big', 4), schleim_tot:mcV('mob/slime/big', 4),
  dorf_hmm:mcV('mob/villager/idle', 3), dorf_au:mcV('mob/villager/hit', 4),
  schalter:mcV('random/click'), kolben_raus:mcV('tile/piston/out'), kolben_rein:mcV('tile/piston/in'),
  angriff_stark:mcV('entity/player/attack/strong', 6), angriff_schwach:mcV('entity/player/attack/weak', 4),
  angriff_krit:mcV('entity/player/attack/crit', 3), angriff_schwung:mcV('entity/player/attack/sweep', 7),
  angriff_rueck:mcV('entity/player/attack/knockback', 4),
  ghast_laut:mcV('mob/ghast/moan', 7), ghast_au:mcV('mob/ghast/scream', 5), ghast_tot:['mob/ghast/death'], ghast_feuer:['mob/ghast/fireball4'],
  lohe_laut:mcV('mob/blaze/breathe', 4), lohe_au:mcV('mob/blaze/hit', 4), lohe_tot:['mob/blaze/death'], lohe_feuer:['mob/ghast/fireball4'],
  ender_laut:mcV('mob/endermen/idle', 5), ender_au:mcV('mob/endermen/hit', 4), ender_tot:['mob/endermen/death'],
  ender_schrei:mcV('mob/endermen/scream', 4), ender_tele:['mob/endermen/portal', 'mob/endermen/portal2'],
  wither_laut:mcV('mob/wither_skeleton/idle', 3), wither_au:mcV('mob/wither_skeleton/hurt', 4), wither_tot:mcV('mob/wither_skeleton/death', 2),
};
/* Blöcke: Minecraft klingt beim Laufen und Hacken mit »step«, beim Abbauen
   und Setzen mit »dig« — Hacken eine Oktave tiefer, Abbauen und Setzen
   etwas tiefer, Metall höher. */
const MC_STOFF = { stein:'stone', metall:'stone', erde:'gravel', gras:'grass', sand:'sand', kies:'gravel', holz:'wood',
  blatt:'grass', pflanze:'grass', glas:'stone', schnee:'snow', wolle:'cloth' };
const MC_STEP = { grass:6, gravel:4, stone:6, sand:5, snow:4, wood:6, cloth:4 };
for(const [g, n] of Object.entries(MC_STEP)){ MC_KLANG['mc:step/' + g] = mcV('step/' + g, n); MC_KLANG['mc:dig/' + g] = mcV('dig/' + g, 4); }
MC_KLANG['mc:glas'] = mcV('random/glass', 3);
// die Namen, die Pocketcraft ohne Block benutzt (Sfx.play('step') usw.)
Object.assign(MC_KLANG, {
  schritt_gras:MC_KLANG['mc:step/grass'], schritt_erde:MC_KLANG['mc:step/gravel'], schritt_kies:MC_KLANG['mc:step/gravel'],
  schritt_stein:MC_KLANG['mc:step/stone'], schritt_sand:MC_KLANG['mc:step/sand'], schritt_schnee:MC_KLANG['mc:step/snow'],
  schritt_holz:MC_KLANG['mc:step/wood'], schritt_wolle:MC_KLANG['mc:step/cloth'],
  hacken_erde:MC_KLANG['mc:step/gravel'], setzen:MC_KLANG['mc:dig/grass'],
});

function mcKlangPfade(){
  const s = new Set();
  for(const l of Object.values(MC_KLANG)) for(const p of l) s.add('minecraft/sounds/' + p + '.ogg');
  return [...s];
}

/* ── ZIP lesen (eine .jar ist eine ZIP-Datei) ─────────────────────── */
async function mcZip(blob){
  const n = blob.size, endeLen = Math.min(n, 65557);
  const ende = new DataView(await blob.slice(n - endeLen).arrayBuffer());
  let p = -1;
  for(let i = endeLen - 22; i >= 0; i--) if(ende.getUint32(i, true) === 0x06054b50){ p = i; break; }
  if(p < 0) throw new Error('Das ist keine .jar-Datei.');
  const anzahl = ende.getUint16(p + 10, true), cdLen = ende.getUint32(p + 12, true), cdStart = ende.getUint32(p + 16, true);
  const cd = new DataView(await blob.slice(cdStart, cdStart + cdLen).arrayBuffer());
  const td = new TextDecoder(), liste = new Map();
  let q = 0;
  for(let i = 0; i < anzahl && q + 46 <= cd.byteLength; i++){
    if(cd.getUint32(q, true) !== 0x02014b50) break;
    const nl = cd.getUint16(q + 28, true), xl = cd.getUint16(q + 30, true), kl = cd.getUint16(q + 32, true);
    liste.set(td.decode(new Uint8Array(cd.buffer, cd.byteOffset + q + 46, nl)),
      { art:cd.getUint16(q + 10, true), len:cd.getUint32(q + 20, true), ab:cd.getUint32(q + 42, true) });
    q += 46 + nl + xl + kl;
  }
  return {
    hat: name => liste.has(name),
    async lesen(name){
      const e = liste.get(name);
      if(!e) return null;
      const k = new DataView(await blob.slice(e.ab, e.ab + 30).arrayBuffer());
      if(k.getUint32(0, true) !== 0x04034b50) throw new Error('Die .jar-Datei ist beschädigt.');
      const start = e.ab + 30 + k.getUint16(26, true) + k.getUint16(28, true), roh = blob.slice(start, start + e.len);
      if(e.art === 0) return roh.arrayBuffer();
      if(e.art === 8) return new Response(roh.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      throw new Error('unbekannte Packart ' + e.art);
    },
  };
}

/* ── Speicher in diesem Browser ──────────────────────────────────── */
const McDB = {
  _db: null,
  oeffnen(){
    if(this._db) return this._db;
    this._db = new Promise((ok, nein) => {
      if(!window.indexedDB) return nein(new Error('Dieser Browser kann nichts dauerhaft speichern.'));
      const r = indexedDB.open('pocketcraft-minecraft', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('paket');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => nein(r.error);
      r.onblocked = () => nein(new Error('blockiert'));
    });
    this._db.catch(() => { this._db = null; });
    return this._db;
  },
  async tu(modus, fn){
    const db = await this.oeffnen();
    return new Promise((ok, nein) => {
      const t = db.transaction('paket', modus), r = fn(t.objectStore('paket'));
      t.oncomplete = () => ok(r && r.result); t.onerror = () => nein(t.error); t.onabort = () => nein(t.error);
    });
  },
  get(k){ return this.tu('readonly', s => s.get(k)); },
  set(k, v){ return this.tu('readwrite', s => s.put(v, k)); },
  weg(k){ return this.tu('readwrite', s => s.delete(k)); },
};

/* ── Bilder umrechnen ────────────────────────────────────────────── */
async function mcPixel(buf){
  const blob = new Blob([buf], { type:'image/png' });
  let bild;
  try{ bild = await createImageBitmap(blob, { premultiplyAlpha:'none', colorSpaceConversion:'none' }); }
  catch(e){
    bild = await new Promise((ok, nein) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nein; i.src = URL.createObjectURL(blob); });
  }
  const w = bild.width, h = bild.height, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently:true });
  c.drawImage(bild, 0, 0);
  return { w, h, d: c.getImageData(0, 0, w, h).data };
}
/** ein Bild in Pocketcraft-Größe (TS × TS), aus Bild nr eines Animationsstreifens */
function mcBildAus(px, nr){
  const g = px.w, bilder = Math.max(1, Math.floor(px.h/g)), oben = Math.min(nr || 0, bilder - 1)*g;
  const d = new Uint8Array(TS*TS*4);
  for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
    const q = ((oben + ((y*g/TS) | 0))*g + ((x*g/TS) | 0))*4, i = (y*TS + x)*4;
    d[i] = px.d[q]; d[i+1] = px.d[q+1]; d[i+2] = px.d[q+2]; d[i+3] = px.d[q+3];
  }
  return d;
}
function mcFaerben(d, f){ for(let i = 0; i < d.length; i += 4){ d[i] = d[i]*f[0]/255; d[i+1] = d[i+1]*f[1]/255; d[i+2] = d[i+2]*f[2]/255; } }

const McPaket = {
  texturen: null,          // { version, quelle, bilder: { pfad: ArrayBuffer } }
  klaenge: null,           // { art: 'mojang', urls: { pfad: url } } oder { art: 'lokal', daten: { pfad: ArrayBuffer } }
  texAn: false, klangAn: false,
  _fertig: {}, _orig: {}, _geladen: false,

  /** beim Start: Gespeichertes holen und einschalten, was eingeschaltet war */
  async start(){
    try{
      this.texturen = (await McDB.get('texturen')) || null;
      this.klaenge = (await McDB.get('klaenge')) || null;
    }catch(e){}
    this._geladen = true;
    const s = Game.settings;
    if(s.mcTexturen && this.texturen && !s.klassik){
      await this.texturenSetzen(true);
      if(!this.hatWesen()) setTimeout(() => hint('Minecraft-Paket: einmal neu laden, dann sehen auch Tiere, Hand und Inventar aus wie in Minecraft', 5200), 1500);
    }
    else if(s.mcTexturen){ s.mcTexturen = false; Game.saveOpts(); }
    this.klaengeSetzen(!!s.mcKlaenge && !!this.klaenge);
    if(typeof Menue !== 'undefined' && Menue.aktiv === 'minecraft') this.zeigen();
  },

  /* — Texturen — */
  /** Pixel eines Bilds aus dem Paket (Pfad ohne .png), gemerkt */
  async _px(p){
    const c = this._pxCache || (this._pxCache = {});
    if(c[p] !== undefined) return c[p];
    const b = this.texturen && this.texturen.bilder[p + '.png'];
    c[p] = b ? await mcPixel(b).catch(() => null) : null;
    return c[p];
  },
  /** sind Tiere, Hand und Oberfläche im Paket? (ältere Pakete hatten nur Blöcke und Gegenstände) */
  hatWesen(){ return !!(this.texturen && this.texturen.bilder['entity/cow/cow_temperate.png']); },
  async _umrechnen(){
    if(Object.keys(this._fertig).length) return this._fertig;
    const hol = p => this._px(p);
    for(const [name, v] of Object.entries(MC_TEX)){
      if(TEX[name] === undefined && !mcZusatz(name)) continue;
      const o = typeof v === 'string' ? { p:v } : v, grund = await hol(o.p);
      if(!grund) continue;
      const d = mcBildAus(grund, o.bild);
      if(o.farbe) mcFaerben(d, o.farbe);
      if(o.drauf){
        const ob = await hol(o.drauf);
        if(ob){
          const e = mcBildAus(ob, 0);
          if(o.draufFarbe) mcFaerben(e, o.draufFarbe);
          for(let i = 0; i < d.length; i += 4){
            const a = e[i+3]/255;
            if(!a) continue;
            for(let k = 0; k < 3; k++) d[i+k] = e[i+k]*a + d[i+k]*(1 - a);
            d[i+3] = Math.max(d[i+3], e[i+3]);
          }
        }
      }
      if(o.alpha) for(let i = 3; i < d.length; i += 4) if(d[i]) d[i] = Math.min(d[i], o.alpha);
      // Risse malt Minecraft multiplizierend (hell und dunkel um Mittelgrau); hier wird geblendet
      if(o.riss) for(let i = 0; i < d.length; i += 4){
        if(d[i+3] < 128){ d[i] = d[i+1] = d[i+2] = d[i+3] = 0; continue; }
        const f = 2*(d[i]*.3 + d[i+1]*.59 + d[i+2]*.11)/255;
        if(f < 1){ d[i] = d[i+1] = d[i+2] = 0; d[i+3] = Math.round((1 - f)*255); }
        else { d[i] = d[i+1] = d[i+2] = 255; d[i+3] = Math.round(Math.min(1, f - 1)*255); }
      }
      ausbluten(d);
      this._fertig[name] = d;
    }
    const truhe = await hol(MC_TRUHE);
    if(truhe) Object.assign(this._fertig, mcTruhe(truhe));
    return this._fertig;
  },
  async texturenSetzen(an){
    an = !!an && !!this.texturen;
    if(an === this.texAn) return true;
    if(an){
      if(typeof Klassik !== 'undefined' && Klassik.an){ Klassik.setzen(false); Game.settings.klassik = false; }
      let neu;
      try{ neu = await this._umrechnen(); }catch(e){ return false; }
      const alle = Object.keys(neu), betten = alle.filter(mcZusatz), namen = alle.filter(n => !mcZusatz(n));
      if(!namen.length) return false;
      for(const n of namen){
        const L = TEX[n];
        if(!(n in this._orig)) this._orig[n] = texData[L];
        texData[L] = neu[n];
      }
      this.texAn = true;
      texturenNeuLaden(namen);
      this._bettenSetzen(betten, neu);
      // Wesen, Hand und Truhe aus Minecrafts Modellen (mcwesen.js), einmal je Paket
      if(!this._wesenFertig && this.hatWesen()){
        this._wesenFertig = true;
        try{ await McWesen.bauen(p => this._px(p)); }catch(e){ console.warn('Minecraft-Wesen:', e); }
      }
      McWesen.setzen(true);
      McGui.setzen(true, this.texturen.bilder);
    } else {
      const namen = Object.keys(this._orig);
      for(const n of namen) texData[TEX[n]] = this._orig[n];
      this.texAn = false;
      texturenNeuLaden(namen);
      if(this.bettenAn){ this.bettenAn = false; this._chunksNeu(); }
      McWesen.setzen(false);
      McGui.setzen(false);
    }
    return true;
  },

  /* Betten: Minecraft hat je Farbe, Teil und Seite ein Bild. Blöcke dürfen
     nur Bildlagen unter 256 benutzen (das Gitter der Chunks zählt in Bytes,
     texturen.js füllt sie schon ganz). Platz schafft ein Tausch: ein Bild,
     das nur Wesen und Gegenstände brauchen (i_, m_, p_), wandert ans Ende —
     die werden beim Zeichnen über ihren Namen gefunden. */
  bettenAn: false,
  _chunkLage(name){
    if(texNames.length + 1 > (gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || 256)) return -1;
    for(let k = 0; k < Math.min(256, texNames.length); k++){
      const alt = texNames[k];
      if(!/^(i_|m_|p_)/.test(alt)) continue;
      TEX[alt] = texNames.length; texNames.push(alt); texData.push(texData[k]);
      texNames[k] = name; TEX[name] = k;
      return k;
    }
    return -1;
  },
  _bettenSetzen(betten, neu){
    if(!betten.length) return;
    let neueLage = false;
    for(const n of betten){
      if(TEX[n] === undefined){ if(this._chunkLage(n) < 0) return; neueLage = true; }
      texData[TEX[n]] = neu[n];
    }
    if(neueLage){ gl.deleteTexture(R.texArr); R.buildTexArray(); _layerCanvas.clear(); _iconCache.clear(); }
    else R.lagenNeu(betten);
    this.bettenAn = true;
    this._chunksNeu();
  },
  /** alle sichtbaren Chunks neu bauen (die Betten wechseln ihre Bilder) */
  _chunksNeu(){
    if(Game.world && Game.meshes) for(const k of Game.meshes.keys()) Game.world.dirty.add(k);
  },

  /* — Geräusche — */
  _audio: [], _puffer: new Map(),
  klaengeSetzen(an){ this.klangAn = !!an && !!this.klaenge && this.kannKlaenge(); },
  /** Geräusche von Mojangs Server gehen nur, wo ein Audio-Element Ogg spielt und leiser gestellt werden kann */
  kannKlaenge(){
    if(!this.klaenge || this.klaenge.art === 'lokal') return true;
    if(this._kann === undefined){
      try{
        const a = document.createElement('audio');
        a.volume = .5;
        this._kann = !!a.canPlayType('audio/ogg; codecs="vorbis"') && Math.abs(a.volume - .5) < .01;
      }catch(e){ this._kann = false; }
    }
    return this._kann;
  },
  /** Blockgeräusch: Name in MC_KLANG und Tonhöhe, oder null */
  blockKlang(art, stoff){
    if(!this.klangAn) return null;
    const g = MC_STOFF[stoff];
    if(!g) return stoff === 'wasser' ? { name: art === 'schritt' ? 'schwimmen' : 'platsch', rate:1 } : null;
    const hoch = stoff === 'metall' ? 1.5 : 1;
    if(art === 'schritt') return { name:'mc:step/' + g, rate:hoch };
    if(art === 'hacken') return { name:'mc:step/' + g, rate:.5*hoch };
    if(art === 'weg' && stoff === 'glas') return { name:'mc:glas', rate:1 };
    return { name:'mc:dig/' + g, rate:.8*hoch };
  },
  /** von Sfx.probe gerufen: true, wenn ein Minecraft-Geräusch läuft */
  klingt(name, o, weit){
    if(!this.klangAn) return false;
    const liste = MC_KLANG[name];
    if(!liste) return false;
    const pfad = 'minecraft/sounds/' + liste[(Math.random()*liste.length) | 0] + '.ogg';
    const k = this.klaenge;
    if(k.art === 'lokal'){
      const buf = this._puffer.get(pfad);
      if(buf) return Sfx.abspielen(buf, o, weit);
      if(buf === undefined && k.daten[pfad]){
        this._puffer.set(pfad, null);
        const r = Sfx.ctx.decodeAudioData(k.daten[pfad].slice(0), b => this._puffer.set(pfad, b), () => {});
        if(r && r.then) r.then(b => this._puffer.set(pfad, b), () => {});
      }
      return false;
    }
    const url = k.urls && k.urls[pfad];
    if(!url) return false;
    let laut = (o.gain !== undefined ? o.gain : 1)*Sfx.laut;
    if(o.x !== undefined && Sfx._ort){
      const d = Math.hypot(o.x - Sfx._ort[0], o.y - Sfx._ort[1], o.z - Sfx._ort[2]);
      if(d > 2) laut *= Math.max(0, 1 - (d - 2)/Math.max(1, weit - 2));
    }
    if(laut < .01) return true;
    let a = this._audio.find(e => e.dataset.p === pfad && (e.paused || e.ended));
    if(!a){
      a = new Audio(url); a.dataset.p = pfad; a.preload = 'auto';
      this._audio.push(a);
      // nicht beliebig viele: Handys erlauben nur eine Handvoll Audio-Elemente
      if(this._audio.length > 40){ const i = this._audio.findIndex(e => e.paused || e.ended); if(i >= 0) this._audio.splice(i, 1); }
    } else a.currentTime = 0;
    a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = false;
    a.playbackRate = clamp(o.rate || 1, .25, 4);
    a.volume = clamp(laut, 0, 1);
    a.play().catch(() => {});
    return true;
  },

  /* — Laden — */
  _status(t, anteil){
    const s = $('#mcStatus'); if(s){ s.textContent = t; s.classList.remove('fehler'); }
    const b = $('#mcBalken'); if(b){ b.parentNode.style.visibility = anteil === undefined ? 'hidden' : 'visible'; b.style.width = Math.round((anteil || 0)*100) + '%'; }
  },
  _fehler(e){
    this._arbeit = false;
    const s = $('#mcStatus'); if(s){ s.textContent = 'Das hat nicht geklappt: ' + (e && e.message || e); s.classList.add('fehler'); }
    const b = $('#mcBalken'); if(b) b.parentNode.style.visibility = 'hidden';
    this.knoepfe();
  },
  async _json(url){
    const r = await fetch(url, { cache:'no-cache' });
    if(!r.ok) throw new Error('Mojangs Server antwortet nicht (' + r.status + ')');
    return r.json();
  },
  /** die neueste Vollversion bei Mojang */
  async _version(){
    const m = await this._json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const id = m.latest.release, v = m.versions.find(x => x.id === id);
    return { id, info: await this._json(v.url) };
  },
  async _herunter(url, groesse, text){
    const r = await fetch(url);
    if(!r.ok || !r.body) throw new Error('Download fehlgeschlagen (' + r.status + ')');
    const gesamt = +r.headers.get('content-length') || groesse || 0, teile = [], leser = r.body.getReader();
    let da = 0;
    for(;;){
      const { done, value } = await leser.read();
      if(done) break;
      teile.push(value); da += value.length;
      this._status(text + ' ' + Math.round(da/1048576) + ' von ' + Math.round(gesamt/1048576) + ' MB', gesamt ? da/gesamt : 0);
    }
    return new Blob(teile);
  },
  /** die Bilder aus einer client.jar ziehen */
  async _ausJar(jar, quelle, version){
    if(typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser ist zu alt zum Entpacken. Ein aktueller Chrome, Firefox oder Safari kann es.');
    this._status('Texturen werden entpackt …', 0);
    const z = await mcZip(jar), pfade = mcBildPfade(), bilder = {};
    if(!z.hat('assets/minecraft/textures/block/stone.png')) throw new Error('In dieser Datei sind keine Minecraft-Texturen. Gesucht ist die client.jar, zum Beispiel .minecraft/versions/1.21/1.21.jar.');
    if(!version){
      try{ version = JSON.parse(new TextDecoder().decode(await z.lesen('version.json'))).name; }catch(e){ version = '?'; }
    }
    let i = 0;
    for(const p of pfade){
      const b = await z.lesen('assets/minecraft/textures/' + p + '.png').catch(() => null);
      if(b) bilder[p + '.png'] = b;
      this._status('Texturen werden entpackt …', ++i/pfade.length);
    }
    this.texturen = { version, quelle, zeit: Date.now(), bilder };
    this._fertig = {}; this._pxCache = {}; this._wesenFertig = false;
    await McDB.set('texturen', this.texturen);
    return Object.keys(bilder).length;
  },
  async _klaengeVonMojang(info){
    this._status('Geräusche werden gesucht …', .5);
    if(!info) info = (await this._version()).info;
    const idx = (await this._json(info.assetIndex.url)).objects, urls = {};
    for(const p of mcKlangPfade()){
      const o = idx[p];
      if(o) urls[p] = 'https://resources.download.minecraft.net/' + o.hash.slice(0, 2) + '/' + o.hash;
    }
    this.klaenge = { art:'mojang', version: info.id, urls };
    this._puffer.clear();
    await McDB.set('klaenge', this.klaenge);
  },
  async vonMojang(){
    if(this._arbeit) return;
    this._arbeit = true; this.knoepfe();
    try{
      this._status('Mojang wird gefragt …', 0);
      const { id, info } = await this._version();
      const jar = await this._herunter(info.downloads.client.url, info.downloads.client.size, 'Minecraft ' + id + ' wird geladen:');
      const n = await this._ausJar(jar, 'mojang', id);
      if(!this.klaenge || this.klaenge.art !== 'lokal') await this._klaengeVonMojang(info);
      this._arbeit = false;
      await this._einschalten(n);
    }catch(e){ this._fehler(e); }
  },
  async ausDatei(datei){
    if(!datei || this._arbeit) return;
    this._arbeit = true; this.knoepfe();
    try{
      const n = await this._ausJar(datei, 'datei');
      // Geräusche: wenn noch keine da sind, von Mojang (klappt das nicht, bleibt es bei Pocketcrafts eigenen)
      if(!this.klaenge) await this._klaengeVonMojang().catch(() => {});
      this._arbeit = false;
      await this._einschalten(n);
    }catch(e){ this._fehler(e); }
  },
  /** der assets-Ordner aus .minecraft: indexes/*.json sagt, welche Datei in objects/ welches Geräusch ist */
  async ausOrdner(dateien){
    dateien = [...(dateien || [])];
    if(!dateien.length || this._arbeit) return;
    this._arbeit = true; this.knoepfe();
    try{
      this._status('Der Ordner wird durchsucht …', 0);
      const rel = f => (f.webkitRelativePath || f.name).replace(/\\/g, '/');
      const objekte = new Map(), indexe = [];
      for(const f of dateien){
        const r = rel(f), m = r.match(/(?:^|\/)objects\/[0-9a-f]{2}\/([0-9a-f]{40})$/);
        if(m) objekte.set(m[1], f);
        else if(/(?:^|\/)indexes\/[^/]+\.json$/.test(r)) indexe.push(f);
      }
      if(!indexe.length || !objekte.size) throw new Error('Das ist nicht der assets-Ordner. Gesucht ist .minecraft/assets (darin liegen indexes und objects).');
      indexe.sort((a, b) => b.lastModified - a.lastModified);
      const pfade = mcKlangPfade(), daten = {};
      let idx = null;
      for(const f of indexe){
        const o = JSON.parse(await f.text()).objects || {};
        if(o['minecraft/sounds/step/grass1.ogg']){ idx = o; break; }
      }
      if(!idx) throw new Error('In diesem assets-Ordner sind keine Minecraft-Geräusche.');
      let i = 0;
      for(const p of pfade){
        const f = idx[p] && objekte.get(idx[p].hash);
        if(f) daten[p] = await f.arrayBuffer();
        this._status('Geräusche werden eingelesen …', ++i/pfade.length);
      }
      if(!Object.keys(daten).length) throw new Error('Die Geräusch-Dateien fehlen im Ordner objects.');
      this.klaenge = { art:'lokal', zeit: Date.now(), daten };
      this._puffer.clear();
      await McDB.set('klaenge', this.klaenge);
      this._arbeit = false;
      Game.settings.mcKlaenge = true; Game.saveOpts();
      this.klaengeSetzen(true);
      this.zeigen();
      hint('Minecraft-Geräusche sind an', 2200);
    }catch(e){ this._fehler(e); }
  },
  async _einschalten(n){
    Game.settings.mcTexturen = true; Game.settings.klassik = false;
    if(this.klaenge) Game.settings.mcKlaenge = true;
    Game.saveOpts();
    this.texAn = false;                      // neu umrechnen, auch wenn schon eingeschaltet
    for(const k of Object.keys(this._orig)) texData[TEX[k]] = this._orig[k];
    await this.texturenSetzen(true);
    this.klaengeSetzen(Game.settings.mcKlaenge);
    this.zeigen();
    hint('Minecraft-Texturen sind an', 2200);
  },
  async entfernen(){
    if(this._arbeit) return;
    await this.texturenSetzen(false);
    this.klaengeSetzen(false);
    this.texturen = this.klaenge = null; this._fertig = {}; this._pxCache = {}; this._wesenFertig = false; this._puffer.clear(); this._audio = [];
    Game.settings.mcTexturen = Game.settings.mcKlaenge = false; Game.saveOpts();
    try{ await McDB.weg('texturen'); await McDB.weg('klaenge'); }catch(e){}
    this.zeigen();
  },

  /* — Bildschirm — */
  init(knopf){
    knopf('#mcMojang', () => this.vonMojang());
    knopf('#mcJar', () => $('#mcJarDatei').click());
    knopf('#mcOrdner', () => $('#mcOrdnerWahl').click());
    $('#mcJarDatei').addEventListener('change', e => { this.ausDatei(e.target.files && e.target.files[0]); e.target.value = ''; });
    $('#mcOrdnerWahl').addEventListener('change', e => { this.ausOrdner(e.target.files); e.target.value = ''; });
    knopf('#mcTexAn', async () => {
      const an = !this.texAn;
      if(await this.texturenSetzen(an)){ Game.settings.mcTexturen = an; Game.saveOpts(); }
      this.zeigen();
    });
    knopf('#mcKlangAn', () => {
      Game.settings.mcKlaenge = !this.klangAn;
      this.klaengeSetzen(Game.settings.mcKlaenge); Game.saveOpts(); this.zeigen();
    });
    knopf('#mcWeg', () => this.entfernen());
    knopf('#mcFertig', () => {
      const z = Menue._mcZurueck || 'optionen'; Menue._mcZurueck = null;
      Menue.zeige(z); if(z === 'skins') Menue.skinsZeigen();
    });
  },
  zeigen(){
    if(!this._arbeit){
      const t = this.texturen, k = this.klaenge;
      if(!this._geladen) this._status('…');
      else if(!t) this._status('Noch nichts geladen.');
      else this._status('Minecraft ' + t.version + ' · ' + Object.keys(t.bilder).length + ' Bilder ' +
        (this.hatWesen() ? '' : '(älteres Paket: neu laden für Tiere, Hand und Inventar) ') +
        (t.quelle === 'datei' ? 'aus deiner client.jar' : 'von Mojang') +
        (k ? ' · Geräusche ' + (k.art === 'lokal' ? 'aus deinem assets-Ordner' : 'von Mojang') : '') +
        (k && !this.kannKlaenge() ? ' (spielt dieser Browser nicht ab — nimm den assets-Ordner)' : ''));
    }
    this.knoepfe();
  },
  knoepfe(){
    const t = !!this.texturen, k = !!this.klaenge, b = !!this._arbeit;
    for(const id of ['#mcMojang', '#mcJar', '#mcOrdner']) $(id).disabled = b;
    $('#mcTexAn').disabled = b || !t;
    $('#mcKlangAn').disabled = b || !k || !this.kannKlaenge();
    $('#mcWeg').disabled = b || (!t && !k);
    $('#mcTexAn').textContent = 'Minecraft-Texturen: ' + (this.texAn ? 'An' : 'Aus');
    $('#mcKlangAn').textContent = 'Minecraft-Geräusche: ' + (this.klangAn ? 'An' : 'Aus');
  },
};
