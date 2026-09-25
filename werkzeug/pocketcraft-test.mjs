// Prüft den Musterabgleich von Pocketcraft ohne Browser:
// node werkzeug/pocketcraft-test.mjs
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../games/pocketcraft/');
const ctx = { console, Math, Float32Array, Uint8Array, Int8Array, Int32Array, Uint32Array, Uint16Array, ArrayBuffer, Map, Set, Object, Array, JSON, performance };
ctx.globalThis = ctx; vm.createContext(ctx);
for(const f of ['grund.js','texturen.js','bloecke.js','welt.js','gelaende.js','wasser.js','wetter.js','handwerk.js','befehle.js'])
  vm.runInContext(fs.readFileSync(dir + f, 'utf8'), ctx, { filename: f });
vm.runInContext('initBlocks(); buildBlockTables(); buildFaceTables(); initItems(); initRecipes(); initSmelt();', ctx);
let ok = 0, fehler = 0;
const pruef = (bed, text) => { if(bed) ok++; else { fehler++; console.log('FEHLER', text); } };
const T = code => vm.runInContext(code, ctx);

T(`
globalThis.__muster = (r, g, ox, oy, spiegel) => {
  const raster = new Array(9).fill(null);
  if(r.formlos){ r.zutaten.forEach((z, k) => raster[k] = { id:z[0], n:1 }); return raster; }
  for(let y=0; y<r.h; y++) for(let x=0; x<r.w; x++){
    const z = r.zellen[y*r.w + (spiegel ? r.w-1-x : x)];
    if(z) raster[(oy+y)*g + ox + x] = { id:z[0], n:1 };
  }
  return raster;
};`);
const n = T('REZEPTE.length');
for(let i = 0; i < n; i++){
  const name = T(`nameOf(REZEPTE[${i}].out)`);
  for(const g of [2, 3]){
    const passt = T(`!REZEPTE[${i}].gross || ${g} === 3`);
    const w = T(`REZEPTE[${i}].w`), h = T(`REZEPTE[${i}].h`);
    if(w > g || h > g) continue;
    for(let oy = 0; oy + h <= g; oy++) for(let ox = 0; ox + w <= g; ox++) for(const sp of [false, true]){
      const treffer = T(`(() => { const r = REZEPTE[${i}]; const m = rasterRezept(__muster(r, ${g}, ${ox}, ${oy}, ${sp}), ${g}); return m === r; })()`);
      pruef(treffer, `${name} im ${g}er-Raster bei ${ox},${oy}${sp ? ' gespiegelt' : ''}`);
    }
    if(!passt) pruef(w > 2 || h > 2, `${name}: groß markiert, passt aber ins 2er-Raster`);
  }
}
// Kein Muster darf ein anderes Ergebnis liefern (doppelte Muster)
const sig = T(`REZEPTE.map(r => r.formlos ? 'f:' + r.zutaten.map(z => z[0]).sort().join(',') : r.w + 'x' + r.h + ':' + r.zellen.map(z => z ? z[0] : '_').join(','))`);
pruef(new Set(sig).size === sig.length, 'doppelte Muster: ' + sig.filter((s, i) => sig.indexOf(s) !== i).join(' | '));

// Falsche Muster geben nichts
pruef(T(`rasterRezept([{id:B.PLANKS,n:1},null,{id:B.PLANKS,n:1},null], 2).out === ITEM.stick`), 'zwei Bretter untereinander sind Stöcke');
pruef(T(`rasterRezept([{id:B.PLANKS,n:1},null,null,{id:B.PLANKS,n:1}], 2)`) === null, 'zwei Bretter diagonal sind kein Rezept');
pruef(T(`rasterRezept([{id:B.PLANKS,n:1},{id:B.PLANKS,n:1},null,null], 2)`) === null, 'zwei Bretter nebeneinander sind kein Rezept');
pruef(T(`rasterRezept([null,{id:B.PLANKS,n:1},null,{id:B.PLANKS,n:1}], 2) === REZEPTE.find(r => r.out === ITEM.stick)`), 'Stöcke rechts in der Spalte');
pruef(T(`rasterRezept([{id:B.LOG,n:5},null,null,null], 2).out === B.PLANKS`), 'ein Stamm irgendwo gibt Bretter');
pruef(T(`rasterRezept([null,null,null,{id:B.LOG,n:1}], 2).out === B.PLANKS`), 'Stamm unten rechts');
pruef(T(`rasterRezept([{id:B.LOG,n:1},{id:B.LOG,n:1},null,null], 2)`) === null, 'zwei Stämme sind kein Rezept');
// Spitzhacke mit gemischtem Material geht nicht
pruef(T(`rasterRezept([{id:B.PLANKS,n:1},{id:B.COBBLE,n:1},{id:B.PLANKS,n:1}, null,{id:ITEM.stick,n:1},null, null,{id:ITEM.stick,n:1},null], 3)`) === null, 'gemischte Spitzhacke');
pruef(T(`rasterRezept([{id:B.COBBLE,n:1},{id:B.COBBLE,n:1},{id:B.COBBLE,n:1}, null,{id:ITEM.stick,n:1},null, null,{id:ITEM.stick,n:1},null], 3).out === ITEM.stone_pickaxe`), 'Steinspitzhacke');
// Axt gespiegelt
pruef(T(`rasterRezept([{id:ITEM.iron,n:1},{id:ITEM.iron,n:1},null, {id:ITEM.stick,n:1},{id:ITEM.iron,n:1},null, {id:ITEM.stick,n:1},null,null], 3).out === ITEM.iron_axe`), 'Eisenaxt gespiegelt links');
pruef(T(`rasterRezept([{id:ITEM.iron,n:1},{id:ITEM.iron,n:1},null, null,{id:ITEM.stick,n:1},null, {id:ITEM.stick,n:1},null,null], 3)`) === null, 'Axt mit krummem Stiel ist keine');
pruef(T(`rasterRezept([null,{id:ITEM.iron,n:1},{id:ITEM.iron,n:1}, null,{id:ITEM.stick,n:1},{id:ITEM.iron,n:1}, null,{id:ITEM.stick,n:1},null], 3).out === ITEM.iron_axe`), 'Eisenaxt gespiegelt');

// Namen der Werkzeuge
pruef(T(`nameOf(ITEM.wood_pickaxe)`) === 'Holzspitzhacke', 'Name Holzspitzhacke: ' + T(`nameOf(ITEM.wood_pickaxe)`));
pruef(T(`nameOf(ITEM.stone_axe)`) === 'Steinaxt', 'Name Steinaxt: ' + T(`nameOf(ITEM.stone_axe)`));
pruef(T(`nameOf(ITEM.gold_hoe)`) === 'Goldhacke', 'Name Goldhacke');
// Schwert macht mehr Schaden als Schaufel
pruef(T(`items[ITEM.iron_sword].dmg > items[ITEM.iron_shovel].dmg && items[ITEM.iron_sword].dmg > items[ITEM.iron_pickaxe].dmg`), 'Schwert schlägt am härtesten');
// alte Nummern unverändert
const alt = { stick:256, coal:257, iron:258, gold:259, diamond:260, pork_raw:261, pork_cook:262, apple:263,
  wood_pickaxe:264, wood_axe:265, wood_shovel:266, wood_sword:267, stone_pickaxe:268, diamond_sword:279 };
for(const [k, v] of Object.entries(alt)) pruef(T(`ITEM.${k}`) === v, `Nummer von ${k}: ${T(`ITEM.${k}`)} statt ${v}`);
pruef(T('B.SNOW') === 27 && T('blocks[27].name') === 'Schnee', 'Blocknummern der ersten Fassung');
// jede Textur, die ein Block oder Gegenstand nennt, gibt es
T('buildTextures()');
const fehlend = T(`(() => { const f = []; for(const b of blocks) if(b){ for(const t of b.faces) if(TEX[t] === undefined) f.push(b.name + ':' + t); if(b.icon && TEX[b.icon] === undefined) f.push(b.name + ':' + b.icon); if(b.dirFront && TEX[b.dirFront] === undefined) f.push(b.dirFront); }
  for(const it of Object.values(items)) if(TEX[it.tex] === undefined) f.push(it.name + ':' + it.tex); return f; })()`);
pruef(fehlend.length === 0, 'fehlende Texturen: ' + fehlend.join(', '));
pruef(T('texNames.length') < 256, 'höchstens 255 Texturschichten (Byte im Gitter)');
// Ausbluten: keine durchsichtigen schwarzen Texel mehr
const schwarz = T(`(() => { let n = 0; texData.forEach((d, k) => { if(texNames[k].startsWith('crack')) return; for(let i=0;i<d.length;i+=4) if(d[i+3]===0 && d[i]+d[i+1]+d[i+2]===0) n++; }); return n; })()`);
pruef(schwarz === 0, 'durchsichtige schwarze Texel: ' + schwarz);


// Wasser, das fließt: Raute um eine Quelle, Versiegen, Wasserfall, Eimer-Trick, Wegspülen, Strömung
T(`
globalThis.W = new World('wassertest');
globalThis.S = W.stroemung = new Stroemung(W);
for(let cx = -2; cx <= 2; cx++) for(let cz = -2; cz <= 2; cz++) W.ensureChunk(cx, cz);
// Becken: Boden aus Stein auf y=60, Luft darüber
globalThis.bau = () => { for(let x = -24; x <= 24; x++) for(let z = -24; z <= 24; z++){ W.setBlock(x, 60, z, B.STONE); for(let y = 61; y < 70; y++) W.setBlock(x, y, z, B.AIR); } S.naechste.clear(); };
globalThis.laufen = n => { for(let i = 0; i < n; i++){ if(!S.naechste.size) return i; S.schritt(); } return n; };
globalThis.zaehl = (f) => { let n = 0; for(let x = -24; x <= 24; x++) for(let z = -24; z <= 24; z++) for(let y = 55; y < 70; y++) if(f(W.getBlock(x, y, z), x, y, z)) n++; return n; };
bau();
`);
// 1. eine Quelle auf flachem Boden: Raute mit Radius 7
T(`W.setBlock(0, 61, 0, B.WATER); S.melden(0, 61, 0);`);
const schritte = T('laufen(60)');
pruef(schritte < 60, 'Fluss kommt zur Ruhe: ' + schritte + ' Schritte');
pruef(T('W.getBlock(1, 61, 0)') === T('flussId(7)'), 'neben der Quelle Stärke 7');
pruef(T('W.getBlock(7, 61, 0)') === T('flussId(1)'), 'sieben weiter Stärke 1');
pruef(T('W.getBlock(8, 61, 0)') === T('B.AIR'), 'acht weiter trocken');
pruef(T('W.getBlock(3, 61, 4)') === T('flussId(1)'), 'schräg: Abstand 7 hat Stärke 1');
pruef(T('W.getBlock(4, 61, 4)') === T('B.AIR'), 'schräg: Abstand 8 trocken');
pruef(T('zaehl(id => isWasser(id))') === 1 + 2*7*8, 'Raute hat 113 Wasserblöcke: ' + T('zaehl(id => isWasser(id))'));
// 2. Quelle weg: alles versiegt
T(`W.setBlock(0, 61, 0, B.AIR); S.melden(0, 61, 0);`);
T('laufen(80)');
pruef(T('zaehl(id => isWasser(id))') === 0, 'ohne Quelle versiegt alles: ' + T('zaehl(id => isWasser(id))'));
// 3. Wasserfall: Quelle auf einem Sockel, fällt hinunter und breitet sich unten aus
T(`bau(); for(let y = 61; y <= 65; y++) W.setBlock(0, y, 0, B.STONE); W.setBlock(0, 66, 0, B.WATER); S.melden(0, 66, 0);`);
T('laufen(80)');
pruef(T('W.getBlock(1, 66, 0)') === T('flussId(7)'), 'oben: Stärke 7 neben der Quelle');
pruef(T('[65,64,63,62,61].every(y => W.getBlock(1, y, 0) === B.FALL)'), 'daneben fällt es bis zum Boden: ' + T('[66,65,64,63,62,61].map(y => W.getBlock(1, y, 0))'));
pruef(T('W.getBlock(2, 61, 0)') === T('flussId(7)') && T('W.getBlock(8, 61, 0)') === T('flussId(1)'), 'unten breitet es sich neu mit 7 aus');
pruef(T('W.getBlock(2, 66, 0)') === T('B.AIR'), 'oben fließt es nicht über den Rand hinaus: ' + T('[W.getBlock(2,66,0), W.getBlock(3,66,0)]'));
// 4. Quelle am Sockel weg: Fall versiegt
T(`W.setBlock(0, 66, 0, B.AIR); S.melden(0, 66, 0);`);
T('laufen(100)');
pruef(T('zaehl(id => isWasser(id))') === 0, 'Wasserfall versiegt: ' + T('zaehl(id => isWasser(id))'));
// 5. zwei Quellen mit einer Lücke: die Lücke wird eine Quelle
T(`bau(); for(let x = -1; x <= 3; x++) for(let z = -1; z <= 1; z++) W.setBlock(x, 61, z, B.STONE);
   W.setBlock(0, 61, 0, B.AIR); W.setBlock(1, 61, 0, B.AIR); W.setBlock(2, 61, 0, B.AIR);
   W.setBlock(0, 61, 0, B.WATER); S.melden(0, 61, 0); W.setBlock(2, 61, 0, B.WATER); S.melden(2, 61, 0);`);
T('laufen(20)');
pruef(T('W.getBlock(1, 61, 0)') === T('B.WATER'), 'zwei Quellen machen eine dritte: ' + T('W.getBlock(1, 61, 0)'));
// 6. Fackel und Blume werden weggespült
T(`bau(); globalThis.weg = []; S.wegspuelen = (x, y, z, id) => weg.push(id); W.setBlock(2, 61, 0, B.TORCH); W.setBlock(0, 61, 2, B.ROSE);
   W.setBlock(0, 61, 0, B.WATER); S.melden(0, 61, 0);`);
T('laufen(40)');
pruef(T('weg.includes(B.TORCH) && weg.includes(B.ROSE)'), 'Fackel und Blume weggespült: ' + T('weg'));
pruef(T('isWasser(W.getBlock(2, 61, 0)) && isWasser(W.getBlock(0, 61, 2))'), 'dort ist jetzt Wasser');
// 7. Wände halten es auf, eine Tür auch
T(`bau(); S.wegspuelen = null; for(let z = -3; z <= 3; z++) W.setBlock(2, 61, z, B.COBBLE); W.setBlock(2, 61, 0, doorId(0,0,0)); W.setBlock(0, 61, 0, B.WATER); S.melden(0, 61, 0);`);
T('laufen(60)');
pruef(T('W.getBlock(3, 61, 0)') === T('B.AIR') && T('isWasser(W.getBlock(1, 61, 0))'), 'Tür und Mauer halten das Wasser auf');
// 8. Strömung zieht bergab
T(`bau(); W.setBlock(0, 61, 0, B.WATER); S.melden(0, 61, 0);`); T('laufen(60)');
const zug = T('S.zug(3, 61, 0)');
pruef(zug[0] > 0.9, 'Strömung zieht von der Quelle weg: ' + JSON.stringify(zug));
pruef(T('S.zug(0, 61, 0)').every(v => v === 0), 'eine Quelle zieht nicht');
// 9. Block in fließendes Wasser setzen: hinter dem Block trocknet es aus, wenn es keinen anderen Weg gibt
T(`bau(); for(let x = -1; x <= 10; x++){ W.setBlock(x, 61, -1, B.COBBLE); W.setBlock(x, 61, 1, B.COBBLE); } W.setBlock(-1, 61, 0, B.COBBLE);
   W.setBlock(0, 61, 0, B.WATER); S.melden(0, 61, 0);`); T('laufen(40)');
pruef(T('W.getBlock(7, 61, 0)') === T('flussId(1)'), 'im Graben fließt es sieben weit');
T(`W.setBlock(3, 61, 0, B.COBBLE); S.melden(3, 61, 0);`); T('laufen(40)');
pruef(T('[4,5,6,7].every(x => W.getBlock(x, 61, 0) === B.AIR)') && T('W.getBlock(2, 61, 0)') === T('flussId(6)'), 'hinter dem Damm trocknet der Graben: ' + T('[1,2,3,4,5,6,7].map(x => W.getBlock(x, 61, 0))'));
// 10. gespeichertes Wasser rechnet nach dem Erzeugen weiter
T(`globalThis.W2 = new World('wassertest'); W2.mods = W.mods; globalThis.S2 = W2.stroemung = new Stroemung(W2); for(let cx = -2; cx <= 2; cx++) for(let cz = -2; cz <= 2; cz++) W2.ensureChunk(cx, cz);`);
pruef(T('S2.naechste.size') > 0, 'nach dem Laden ist gegossenes Wasser angemeldet: ' + T('S2.naechste.size'));
// Hühner: Pfeil mit Feder oder Faden, gebratenes Hähnchen, Eier stapeln bis 16
pruef(T(`rasterRezept([{id:ITEM.flint,n:1},null,null, {id:ITEM.stick,n:1},null,null, {id:ITEM.feather,n:1},null,null], 3).out === ITEM.arrow`), 'Pfeil mit Feder');
pruef(T(`rasterRezept([{id:ITEM.flint,n:1},null,null, {id:ITEM.stick,n:1},null,null, {id:ITEM.string,n:1},null,null], 3).out === ITEM.arrow`), 'Pfeil mit Faden');
pruef(T(`SMELT[ITEM.chicken_raw] === ITEM.chicken_cooked && items[ITEM.egg].stack === 16`), 'Hähnchen im Ofen, Eier zu 16');
pruef(T(`ITEM.chicken_raw > ITEM.leather_boots && B.FLUSS === 62 && B.FALL === 69 && blocks[B.FALL].name === 'Wasser'`), 'neue Nummern hinten angehängt');

// Plattenspieler: acht Bretter um einen Diamanten; mit Platte ein eigener Block, der beim Abbauen den leeren gibt
pruef(T(`rasterRezept([{id:B.PLANKS,n:1},{id:B.PLANKS,n:1},{id:B.PLANKS,n:1}, {id:B.PLANKS,n:1},{id:ITEM.diamond,n:1},{id:B.PLANKS,n:1}, {id:B.PLANKS,n:1},{id:B.PLANKS,n:1},{id:B.PLANKS,n:1}], 3).out === B.JUKEBOX`), 'Plattenspieler-Rezept');
pruef(T(`B.JUKEBOX === 70 && B.JUKEBOX_VOLL === 71 && blocks[B.JUKEBOX_VOLL].drop === B.JUKEBOX && !blocks[B.JUKEBOX_VOLL].item && items[ITEM.platte].stack === 1`), 'Plattenspieler-Blöcke und Schallplatte');

// Gelände: alte Welten behalten ihres (Fassung 1), neue bekommen Berge, Nadelwald, Schnee und Höhlen (Fassung 2)
T(`globalThis.summe = (seed, gen) => { const W = new World(seed, gen); let h = 2166136261 >>> 0;
  for(const [cx, cz] of [[0,0],[1,0],[0,1],[-1,-1],[5,-3],[-12,7],[40,40],[-63,18],[100,-100],[3,250]]){
    W.ensureChunk(cx, cz); const c = W.getChunk(cx, cz);
    for(const a of [c.blocks, c.hmap, c.biome]) for(let i = 0; i < a.length; i++){ h ^= a[i]; h = Math.imul(h, 16777619) >>> 0; }
  }
  return h.toString(16); };`);
for(const [seed, soll] of [['pruefwelt', '96ae74c4'], ['taschenwelt', '3f9020af']]){
  const ist = T(`summe(${JSON.stringify(seed)}, 1)`);
  pruef(ist === soll, `altes Gelände unverändert (${seed}): ${ist} statt ${soll}`);
}
const neu1 = T(`summe('pruefwelt', 2)`), neu2 = T(`summe('pruefwelt', 2)`);
pruef(neu1 === neu2 && neu1 !== '96ae74c4', 'neues Gelände: gleicher Startwert, gleiche Welt — und eine andere als früher');
T(`globalThis.G = new World('pruefwelt', 2);`);
pruef(T(`G.column(93, -348).h >= 80 && G.column(93, -348).biome === BIO.MOUNT && G.column(93, -348).kalt`), 'ein verschneiter Gipfel bei 93, −348');
pruef(T(`(() => { G.ensureChunk(-5, 18); let st = 0, na = 0, sd = 0; for(const id of G.getChunk(-5, 18).blocks){ if(id === B.FICHTENSTAMM) st++; if(id === B.FICHTENNADELN) na++; if(id === B.SCHNEEDECKE) sd++; } return st > 20 && na > 100 && sd > 50; })()`),
  'im Nadelwald stehen Fichten unter einer Schneedecke');
pruef(T(`(() => { G.ensureChunk(-4, -3); return G.getBlock(-56, 13, -40) === B.AIR && G.heightAt(-56, -40) > 35; })()`), 'eine Höhle tief unter der Erde');
pruef(T(`B.SCHNEEDECKE === 72 && B.FICHTENSTAMM === 73 && B.FICHTENNADELN === 74 && !blocks[B.SCHNEEDECKE].solid`), 'neue Blöcke hinten angehängt, durch Schnee läuft man');

// Wetter: Regen hält an Dächern, Laub, Wasser; fällt als Schnee, wo es kalt ist; die Wüste bleibt trocken
T(`globalThis.Netz = { istHost: false, istGast: false, hatGaeste(){ return false; } }; globalThis.Sfx = { ctx: null };
globalThis.RW = new World('regentest');
for(let cx = -2; cx <= 1; cx++) for(let cz = -2; cz <= 1; cz++) RW.ensureChunk(cx, cz);
for(let x = -20; x <= 20; x++) for(let z = -20; z <= 20; z++){ RW.setBlock(x, 60, z, B.STONE); for(let y = 61; y < WH; y++) RW.setBlock(x, y, z, B.AIR); }
globalThis.Game = { world: RW, player: { x: 0.5, y: 61, z: 0.5, headInWater: false }, regeln: Object.assign({}, REGELN_START), spielerOrte(){ return [this.player]; } };`);
pruef(T(`regenBoden(RW, 3, 3)`) === 61, 'auf freiem Feld kommt Regen am Boden an');
T(`RW.setBlock(3, 70, 3, B.GLASS); RW.setBlock(4, 66, 4, B.LEAVES); RW.setBlock(5, 61, 5, B.WATER); RW.setBlock(6, 61, 6, B.SCHNEEDECKE); RW.setBlock(7, 61, 7, B.TORCH);`);
pruef(T(`regenBoden(RW, 3, 3) === 71 && regenBoden(RW, 4, 4) === 67 && regenBoden(RW, 5, 5) === 61.875 && regenBoden(RW, 6, 6) === 61.125 && regenBoden(RW, 7, 7) === 61`),
  'Glas, Laub, Wasser und Schneedecke halten Regen auf, eine Fackel nicht');
pruef(T(`regenBoden(RW, 500, 500)`) === T('WH'), 'wo nichts geladen ist, regnet es nicht');
T(`Wetter.laden({ regen: true, rest: 50 })`);
pruef(T(`Wetter.regen && Wetter.staerke === 1 && Wetter.rest === 50`), 'Regen aus dem Spielstand');
T(`Wetter.laden(null)`);
pruef(T(`!Wetter.regen && Wetter.staerke === 0 && Wetter.rest >= 300 && Wetter.rest <= 900`), 'eine neue Welt beginnt klar: ' + T('Wetter.rest'));
T(`Wetter.laden({ regen: false, rest: 99999 })`);
pruef(T(`Wetter.rest`) === 900, 'zu lange Wartezeiten werden gekürzt');
// von allein: nach der Wartezeit fängt es an, gleitet in 6 s zur vollen Stärke, hört wieder auf
T(`Wetter.laden({ regen: false, rest: 1 }); for(let i = 0; i < 30; i++) Wetter.tick(0.05, false);`);
pruef(T(`Wetter.regen && Wetter.rest >= 118 && Wetter.rest <= 300 && Wetter.staerke > 0 && Wetter.staerke < 0.1`), 'es fängt von selbst an zu regnen: ' + T('Wetter.text()'));
T(`for(let i = 0; i < 140; i++) Wetter.tick(0.05, false);`);
pruef(T(`Wetter.staerke === 1 && Wetter.aktiv === WETTER_N`), 'nach ein paar Sekunden regnet es richtig');
pruef(T(`(() => { let n = 0; for(let i = 0; i < Wetter.aktiv; i++){ const a = Wetter.art[i]; if(a === ART_REGEN){ n++; if(Wetter.y[i] < Wetter.boden[i]) return false; } else if(a === ART_SCHNEE) return false; } return n > 500; })()`),
  'Tropfen fallen über dem Boden, Schnee gibt es hier nicht');
pruef(T(`(() => { for(let i = 0; i < Wetter.aktiv; i++) if(Wetter.art[i] !== ART_WARTET && Math.floor(Wetter.x[i]) === 3 && Math.floor(Wetter.z[i]) === 3 && Wetter.y[i] < 71) return false; return true; })()`),
  'unter dem Glas bleibt es trocken');
pruef(T(`!Wetter.regnetAn(3, 61, 3) && Wetter.regnetAn(2, 61, 2)`), 'Felder unter dem Glas gießt der Regen nicht');
// in einer Höhle: kein Tropfen
T(`for(let x = -20; x <= 20; x++) for(let z = -20; z <= 20; z++) RW.setBlock(x, 80, z, B.STONE); Wetter.leeren(); for(let i = 0; i < 40; i++) Wetter.tick(0.05, false);`);
pruef(T(`Wetter.art.every(a => a === ART_WARTET)`), 'unter der Decke regnet es nicht');
T(`for(let x = -20; x <= 20; x++) for(let z = -20; z <= 20; z++) RW.setBlock(x, 80, z, B.AIR);`);
T(`Wetter.rest = 0.01; Wetter.tick(0.05, false);`);
pruef(T(`!Wetter.regen && Wetter.rest >= 299`), 'der Regen hört wieder auf');
T(`Wetter.laden({ regen: true, rest: 100 }); Wetter.klar();`);
pruef(T(`!Wetter.regen && Wetter.staerke === 0`), 'nach dem Schlafen ist es klar');
// Schnee: im Nadelwald liegt nach dem Wegräumen bald wieder eine Schneedecke
T(`Game.world = G; Game.player = { x: -79.5, y: 46, z: 296.5, headInWater: false };
for(let cx = -7; cx <= -3; cx++) for(let cz = 16; cz <= 20; cz++) G.ensureChunk(cx, cz);
globalThis.weg = 0; for(let x = -95; x <= -64; x++) for(let z = 281; z <= 312; z++) for(let y = WH - 1; y > 0; y--) if(G.getBlock(x, y, z) === B.SCHNEEDECKE){ G.setBlock(x, y, z, B.AIR); weg++; }
Wetter.laden({ regen: true, rest: 200 }); for(let i = 0; i < 1200; i++) Wetter.tick(0.05, false);`);
const schnee = T(`(() => { let n = 0; for(let x = -95; x <= -64; x++) for(let z = 281; z <= 312; z++) for(let y = WH - 1; y > 0; y--) if(G.getBlock(x, y, z) === B.SCHNEEDECKE){ n++; break; } return n; })()`);
pruef(T('weg') > 100 && schnee > 100, 'es schneit wieder zu: ' + schnee + ' Decken nach einer Minute, ' + T('weg') + ' weggeräumt');
pruef(T(`(() => { for(let x = -95; x <= -64; x++) for(let z = 281; z <= 312; z++) for(let y = 1; y < WH; y++) if(G.getBlock(x, y, z) === B.SCHNEEDECKE){ const u = G.getBlock(x, y - 1, z); if(!(isOpaqueCube(u) || u === B.LEAVES || u === B.FICHTENNADELN) || !G.kaltAt(x, z)) return false; } return true; })()`),
  'Schnee liegt nur auf festem Boden oder Nadeln und nur, wo es kalt ist');
pruef(T(`(() => { let s = 0; for(let i = 0; i < Wetter.aktiv; i++) if(Wetter.art[i] === ART_SCHNEE) s++; return s > 500; })()`), 'im Nadelwald fällt Schnee');
pruef(T(`!Wetter.regnetAn(-79, 45, 296)`), 'Schnee gießt nicht');
T(`Wetter.aus()`);

// Befehle: Namen wie im Spiel und wie beim Vorbild, Zahlen mit Einheiten, ~-Koordinaten, Vorschläge
T(`globalThis.DAY_LEN = 720;`);                  // steht in spiel.js
pruef(T(`dingNummer('diamant') === ITEM.diamond && dingNummer('minecraft:diamond') === ITEM.diamond && dingNummer('Diamant') === ITEM.diamond`), 'Diamant auf Deutsch und wie beim Vorbild');
pruef(T(`dingNummer('cobblestone') === B.COBBLE && dingNummer('bruchstein') === B.COBBLE && dingNummer('oak_log') === B.LOG && dingNummer('iron_ingot') === ITEM.iron`), 'Bruchstein, Holzstamm, Eisenbarren');
pruef(T(`dingNummer('wheat') === ITEM.wheat && dingNummer('weizen') === ITEM.wheat`), 'wheat ist der Weizen zum Tragen, nicht das Feld');
pruef(T(`dingNummer('löwenzahn') === B.DANDELION && dingNummer('loewenzahn') === B.DANDELION && dingNummer('hohes gras') === null`), 'Umlaute beide Male, Hohes Gras gibt es nicht');
pruef(T(`dingNummer('luft') === B.AIR && dingNummer('water') === B.WATER && dingNummer('weisse_wolle') === B.WOOL`), 'Luft, Wasser, Wolle');
pruef(T(`Befehle.zahl('10s', 't') === 200 && Befehle.zahl('100', 't') === 100 && Befehle.zahl('1d', 's') === DAY_LEN && Befehle.zahl('20t', 's') === 1 && Befehle.zahl('x') === null`), 'Zahlen mit Einheiten');
pruef(JSON.stringify(T(`Befehle.koord(['~', '~5', '10'], 0, { x: 1.25, y: 60, z: 3 }, false)`)) === '[1.25,65,10.5]', 'Koordinaten: ~ relativ, ganze Zahlen in die Blockmitte');
pruef(JSON.stringify(T(`Befehle.koord(['~', '~-1', '-3'], 0, { x: 1.75, y: 60.4, z: 3 }, true)`)) === '[1,59,-3]', 'Blockkoordinaten');
pruef(T(`Befehle.koord(['1', 'a', '3'], 0, { x: 0, y: 0, z: 0 }, false)`) === null, 'kaputte Koordinaten');
T(`globalThis.Netz = { istHost: false, istGast: false, hatGaeste(){ return false; }, ich: { id: 'a', name: 'Spieler 123', farbe: 0 }, gaeste: new Map(), andere: new Map() };
   Game.player = Object.assign(Game.player, { x: 0.5, y: 61, z: 0.5 }); Game.targetBlock = () => null;`);
const v1 = T(`Befehle.vorschlaege('/ga').liste`);
pruef(v1.includes('gamemode') && v1.includes('gamerule'), 'Vorschläge für /ga: ' + v1);
const v2 = T(`Befehle.vorschlaege('/give dia').liste`);
pruef(v2.includes('diamant') && v2.includes('diamantschwert'), 'Vorschläge für /give dia: ' + v2.slice(0, 5));
pruef(T(`Befehle.vorschlaege('/zeit set mi').liste.join()`) === 'mittag,midnight,mitternacht', 'Vorschläge für /zeit set mi');
pruef(T(`Befehle.vorschlaege('/gamemode k').liste`).includes('kreativ'), 'Vorschläge für /gamemode k');
pruef(T(`Befehle.vorschlaege('/tp @').liste.join()`) === '@s,@a,@p,@r', 'Ziele');
pruef(T(`Befehle.ziele('spieler_123', Befehle.ichSelbst())[0].name`) === 'Spieler 123', 'Namen mit Leerzeichen findet man mit _');
pruef(T(`Befehle.vorschlaege('Hallo')`) === null, 'kein Schrägstrich, keine Vorschläge');

console.log(`${ok} bestanden, ${fehler} fehlgeschlagen`);
process.exit(fehler ? 1 : 0);
