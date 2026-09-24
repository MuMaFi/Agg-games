// Prüft den Musterabgleich von Pocketcraft ohne Browser:
// node werkzeug/pocketcraft-test.mjs
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../games/pocketcraft/');
const ctx = { console, Math, Float32Array, Uint8Array, Int8Array, Int32Array, Uint32Array, Uint16Array, ArrayBuffer, Map, Set, Object, Array, JSON, performance };
ctx.globalThis = ctx; vm.createContext(ctx);
for(const f of ['grund.js','texturen.js','bloecke.js','welt.js','wasser.js','handwerk.js'])
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

console.log(`${ok} bestanden, ${fehler} fehlgeschlagen`);
process.exit(fehler ? 1 : 0);
