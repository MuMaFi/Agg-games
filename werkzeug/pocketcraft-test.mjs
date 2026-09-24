// Prüft den Musterabgleich von Pocketcraft ohne Browser:
// node werkzeug/pocketcraft-test.mjs
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../games/pocketcraft/');
const ctx = { console, Math, Float32Array, Uint8Array, Int8Array, Int32Array, Uint32Array, Uint16Array, ArrayBuffer, Map, Set, Object, Array, JSON, performance };
ctx.globalThis = ctx; vm.createContext(ctx);
for(const f of ['grund.js','texturen.js','bloecke.js','welt.js','handwerk.js'])
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

console.log(`${ok} bestanden, ${fehler} fehlgeschlagen`);
process.exit(fehler ? 1 : 0);
