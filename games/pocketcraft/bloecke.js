/* Pocketcraft · Blöcke und Gegenstände
   Die Nummern sind Teil jedes Spielstands. Neue Blöcke und Gegenstände
   werden deshalb nur hinten angehängt, nie dazwischen geschoben. */
'use strict';

/* ── Block-Register ────────────────────────────────────────────────── */
const B = { AIR:0, STONE:1, GRASS:2, DIRT:3, COBBLE:4, PLANKS:5, SAND:6, GRAVEL:7, LOG:8,
  LEAVES:9, GLASS:10, WATER:11, BEDROCK:12, COAL_ORE:13, IRON_ORE:14, GOLD_ORE:15, DIAMOND_ORE:16,
  TABLE:17, FURNACE:18, FURNACE_LIT:19, TORCH:20, TALLGRASS:21, ROSE:22, DANDELION:23,
  CACTUS:24, STONEBRICK:25, SANDSTONE:26, SNOW:27,
  CHEST:28, LADDER:29 /* …32, je Wand */, BED:33, FARMLAND:34, WHEAT:35 /* …38, je Stufe */,
  IRON_BLOCK:39, GOLD_BLOCK:40, DIAMOND_BLOCK:41, DOOR:42 /* …57 */, WOOL:58 /* …61, je Farbe */ };

/* Natürliche Schaffarben — Wolle gibt es in genau diesen vier */
const WOLLE = [
  { name:'Weiße Wolle',     tint:[1, 1, 1],          anteil:.82 },
  { name:'Hellgraue Wolle', tint:[.66, .66, .64],    anteil:.06 },
  { name:'Schwarze Wolle',  tint:[.2, .2, .22],      anteil:.06 },
  { name:'Braune Wolle',    tint:[.56, .39, .26],    anteil:.06 },
];
const isWool = id => id >= B.WOOL && id < B.WOOL + 4;

/* Seiten, wie sie Leiter und Tür benutzen: 0 +X, 1 −X, 2 +Z, 3 −Z */
const SEITE = [[1,0],[-1,0],[0,1],[0,-1]];
const ladderId = s => B.LADDER + s;
const isLadder = id => id >= B.LADDER && id < B.LADDER + 4;
const isWheat = id => id >= B.WHEAT && id < B.WHEAT + 4;
/* Tür: Hälfte (0 unten, 1 oben) · offen · Seite, an der das Blatt steht */
const doorId = (oben, offen, seite) => B.DOOR + (oben ? 8 : 0) + (offen ? 4 : 0) + seite;
const isDoor = id => id >= B.DOOR && id < B.DOOR + 16;
const doorInfo = id => { const k = id - B.DOOR; return { oben: k >= 8, offen: (k & 4) !== 0, seite: k & 3 }; };
/* Beim Öffnen schwingt das Blatt an die Nachbarseite */
const DOOR_AUF = [2, 3, 1, 0];

const blocks = [];
/** faces-Reihenfolge: +X, -X, +Y(oben), -Y(unten), +Z, -Z */
function defBlock(id, o){
  const t = o.tex;
  let f;
  if(typeof t === 'string') f = [t,t,t,t,t,t];
  else if(t.length === 3) f = [t[2],t[2],t[0],t[1],t[2],t[2]];  // [oben, unten, seite]
  else f = t;
  blocks[id] = Object.assign({
    id, name:'?', model:'cube', solid:true, opaque:true, light:0, hardness:1,
    tool:null, tier:0, drop:null, tint:0, climbable:false, hurt:0, replaceable:false, item:true,
    box:null, icon:null
  }, o, { faces:f });
}

/** Kasten in Sechzehnteln für die Seite s eines dünnen Blatts */
function blattBox(s, dicke){
  const d = dicke;
  return [[16-d,0,0,16,16,16],[0,0,0,d,16,16],[0,0,16-d,16,16,16],[0,0,0,16,16,d]][s];
}

function initBlocks(){
  defBlock(B.AIR,{name:'Luft', tex:'stone', solid:false, opaque:false, model:'none', replaceable:true, item:false});
  defBlock(B.STONE,{name:'Stein', tex:'stone', hardness:1.5, tool:'pickaxe', tier:1, drop:B.COBBLE});
  defBlock(B.GRASS,{name:'Grasblock', tex:['grass_top','dirt','grass_side'], hardness:.6, tool:'shovel', drop:B.DIRT});
  defBlock(B.DIRT,{name:'Erde', tex:'dirt', hardness:.5, tool:'shovel'});
  defBlock(B.COBBLE,{name:'Bruchstein', tex:'cobble', hardness:2, tool:'pickaxe', tier:1});
  defBlock(B.PLANKS,{name:'Holzbretter', tex:'planks', hardness:2, tool:'axe'});
  defBlock(B.SAND,{name:'Sand', tex:'sand', hardness:.5, tool:'shovel'});
  defBlock(B.GRAVEL,{name:'Kies', tex:'gravel', hardness:.6, tool:'shovel'});
  defBlock(B.LOG,{name:'Holzstamm', tex:['log_top','log_top','log_side'], hardness:2, tool:'axe'});
  defBlock(B.LEAVES,{name:'Laub', tex:'leaves', hardness:.2, opaque:false, model:'cutout'});
  defBlock(B.GLASS,{name:'Glas', tex:'glass', hardness:.3, opaque:false, model:'cutout', drop:B.AIR});
  defBlock(B.WATER,{name:'Wasser', tex:'water0', solid:false, opaque:false, model:'liquid', hardness:-1, replaceable:true, item:false});
  defBlock(B.BEDROCK,{name:'Grundgestein', tex:'bedrock', hardness:-1, item:false});
  defBlock(B.COAL_ORE,{name:'Kohleerz', tex:'coal_ore', hardness:3, tool:'pickaxe', tier:1, drop:'i_coal'});
  defBlock(B.IRON_ORE,{name:'Eisenerz', tex:'iron_ore', hardness:3, tool:'pickaxe', tier:2});
  defBlock(B.GOLD_ORE,{name:'Golderz', tex:'gold_ore', hardness:3, tool:'pickaxe', tier:3});
  defBlock(B.DIAMOND_ORE,{name:'Diamanterz', tex:'diamond_ore', hardness:3, tool:'pickaxe', tier:3, drop:'i_diamond'});
  defBlock(B.TABLE,{name:'Werkbank', tex:['craft_top','planks','craft_side'], hardness:2.5, tool:'axe'});
  defBlock(B.FURNACE,{name:'Ofen', tex:['furn_top','furn_top','furn_side'], hardness:3.5, tool:'pickaxe', tier:1, dirFront:'furn_front'});
  defBlock(B.FURNACE_LIT,{name:'Ofen', tex:['furn_top','furn_top','furn_side'], hardness:3.5, tool:'pickaxe', tier:1, light:13, drop:B.FURNACE, dirFront:'furn_lit', item:false});
  defBlock(B.TORCH,{name:'Fackel', tex:'torch', model:'torch', solid:false, opaque:false, light:14, hardness:.05});
  defBlock(B.TALLGRASS,{name:'Hohes Gras', tex:'tallgrass', model:'cross', solid:false, opaque:false, hardness:.05, drop:B.AIR, replaceable:true, item:false});
  defBlock(B.ROSE,{name:'Mohn', tex:'rose', model:'cross', solid:false, opaque:false, hardness:.05, replaceable:true});
  defBlock(B.DANDELION,{name:'Löwenzahn', tex:'dandelion', model:'cross', solid:false, opaque:false, hardness:.05, replaceable:true});
  defBlock(B.CACTUS,{name:'Kaktus', tex:['cactus_top','cactus_top','cactus_side'], hardness:.4, opaque:false, model:'cutout', hurt:1});
  defBlock(B.STONEBRICK,{name:'Steinziegel', tex:'stonebrick', hardness:2, tool:'pickaxe', tier:1});
  defBlock(B.SANDSTONE,{name:'Sandstein', tex:['sandstone_top','sandstone_top','sandstone'], hardness:1.6, tool:'pickaxe', tier:1});
  defBlock(B.SNOW,{name:'Schnee', tex:'snow', hardness:.4, tool:'shovel'});

  defBlock(B.CHEST,{name:'Truhe', tex:['chest_top','chest_top','chest_side'], hardness:2.5, tool:'axe', dirFront:'chest_front'});
  for(let s = 0; s < 4; s++)
    defBlock(ladderId(s),{name:'Leiter', tex:'ladder', model:'box', box:blattBox(s, 1), solid:false, opaque:false,
      climbable:true, hardness:.4, tool:'axe', drop:B.LADDER, item:s === 0, icon:'ladder', wand:s});
  defBlock(B.BED,{name:'Strohbett', tex:['bed_top','planks','bed_side'], model:'box', box:[0,0,0,16,9,16], opaque:false,
    hardness:.3, icon:'i_bed'});
  defBlock(B.FARMLAND,{name:'Ackerboden', tex:['farmland','dirt','dirt'], model:'box', box:[0,0,0,16,15,16], opaque:false,
    hardness:.6, tool:'shovel', drop:B.DIRT, item:false});
  for(let s = 0; s < 4; s++)
    defBlock(B.WHEAT + s,{name:'Weizen', tex:'wheat' + s, model:'cross', solid:false, opaque:false, hardness:0.02,
      item:false, stufe:s});
  defBlock(B.IRON_BLOCK,{name:'Eisenblock', tex:'iron_block', hardness:4, tool:'pickaxe', tier:2});
  defBlock(B.GOLD_BLOCK,{name:'Goldblock', tex:'gold_block', hardness:4, tool:'pickaxe', tier:3});
  defBlock(B.DIAMOND_BLOCK,{name:'Diamantblock', tex:'diamond_block', hardness:4.5, tool:'pickaxe', tier:3});
  WOLLE.forEach((f, k) => defBlock(B.WOOL + k, { name:f.name, tex:'wool' + k, hardness:.8, tool:'shears' }));
  for(let oben = 0; oben < 2; oben++) for(let offen = 0; offen < 2; offen++) for(let s = 0; s < 4; s++){
    const t = oben ? 'door_top' : 'door_bottom';
    defBlock(doorId(oben, offen, s),{name:'Holztür', tex:t, model:'box', box:blattBox(s, 3), opaque:false,
      hardness:2, tool:'axe', drop:B.DOOR, item:!oben && !offen && s === 0, icon:'i_door'});
  }
}

/* ── Gegenstände (ID ≥ 256) ────────────────────────────────────────── */
const ITEM0 = 256;
const items = {};   // id → def
const ITEM = {};    // key → id
let nextItem = ITEM0;
function defItem(key, o){
  const id = nextItem++;
  items[id] = Object.assign({ id, key, name:key, tex:'i_'+key, stack:64,
    tool:null, tier:0, speed:1, dmg:1, dur:0, food:0, heal:0, fuel:0, armor:null }, o);
  ITEM[key] = id; return id;
}
const WERKZEUGART = { pickaxe:['Spitzhacke',2], axe:['Axt',3], shovel:['Schaufel',1], sword:['Schwert',4], hoe:['Hacke',0] };
function defTool(mk, mn, kk, tier, mult, dur, fuel){
  const [kn, bonus] = WERKZEUGART[kk];
  defItem(mk + '_' + kk, { name: mn + kn.toLowerCase(), stack:1, tool:kk, tier, speed:1 + mult*1.6,
    dmg:1 + bonus + tier, dur, fuel });
}
function initItems(){
  // Reihenfolge der ersten 24 wie in der ersten Fassung — alte Spielstände
  defItem('stick',{name:'Stock', fuel:100});
  defItem('coal',{name:'Kohle', tex:'i_coal', fuel:800});
  defItem('iron',{name:'Eisenbarren', tex:'i_iron'});
  defItem('gold',{name:'Goldbarren', tex:'i_gold'});
  defItem('diamond',{name:'Diamant', tex:'i_diamond'});
  defItem('pork_raw',{name:'Rohes Schweinefleisch', tex:'i_pork_raw', food:3});
  defItem('pork_cook',{name:'Gebratenes Schweinefleisch', tex:'i_pork_cook', food:8});
  defItem('apple',{name:'Apfel', tex:'i_apple', food:4});
  const tiers = [['wood','Holz',1,2,240,300],['stone','Stein',2,4,320,0],
                 ['iron','Eisen',3,6,500,0],['diamond','Diamant',4,8,1560,0]];
  for(const [mk,mn,tier,mult,dur,fuel] of tiers)
    for(const kk of ['pickaxe','axe','shovel','sword']) defTool(mk, mn, kk, tier, mult, dur, kk === 'sword' ? 0 : fuel);

  // ab hier neu
  for(const kk of ['pickaxe','axe','shovel','sword']) defTool('gold', 'Gold', kk, 1, 12, 100, 0);
  for(const [mk,mn,tier,mult,dur,fuel] of [...tiers.slice(0,3), ['gold','Gold',1,12,100,0], tiers[3]])
    defTool(mk, mn, 'hoe', tier, mult, dur, fuel);
  defItem('seeds',{name:'Weizenkörner'});
  defItem('wheat',{name:'Weizen'});
  defItem('bread',{name:'Brot', food:5});
  defItem('bucket',{name:'Eimer', stack:16});
  defItem('water_bucket',{name:'Wassereimer', stack:1});
  defItem('golden_apple',{name:'Goldener Apfel', food:4, heal:8});
  const RUEST = [['helmet','helm',0],['chestplate','brustpanzer',1],['leggings','hose',2],['boots','stiefel',3]];
  const RMAT = [['iron','Eisen',[2,6,5,2],[165,240,225,195]], ['gold','Gold',[2,5,3,1],[77,112,105,91]],
                ['diamond','Diamant',[3,8,6,3],[363,528,495,429]]];
  for(const [mk, mn, pts, durs] of RMAT) for(const [rk, rn, slot] of RUEST)
    defItem(mk + '_' + rk, { name: mn + rn, stack:1, dur: durs[slot], armor: { slot, pts: pts[slot] } });

  // Pocketcraft: Kühe, Schafe, Skelette
  defItem('leather',{name:'Leder'});
  defItem('beef_raw',{name:'Rohes Rindfleisch', food:3});
  defItem('beef_cooked',{name:'Steak', food:8});
  defItem('mutton_raw',{name:'Rohes Hammelfleisch', food:2});
  defItem('mutton_cooked',{name:'Gebratenes Hammelfleisch', food:6});
  defItem('bone',{name:'Knochen'});
  defItem('bone_meal',{name:'Knochenmehl'});
  defItem('arrow',{name:'Pfeil'});
  defItem('bow',{name:'Bogen', stack:1, dur:384, tool:'bow'});
  defItem('string',{name:'Faden'});
  defItem('shears',{name:'Schere', stack:1, dur:238, tool:'shears', speed:5});
  defItem('milk_bucket',{name:'Milcheimer', stack:1, food:4});
  defItem('flint',{name:'Feuerstein'});
  const LEDER = [['helmet','Lederkappe',1,55],['chestplate','Lederjacke',3,80],['leggings','Lederhose',2,75],['boots','Lederstiefel',1,65]];
  LEDER.forEach(([rk, name, pts, dur], slot) => defItem('leather_' + rk, { name, stack:1, dur, armor:{ slot, pts } }));
}

/* ── Hilfen für Slot-Inhalte ───────────────────────────────────────── */
const isBlockId = id => id > 0 && id < ITEM0;
function defOf(id){ return isBlockId(id) ? blocks[id] : items[id]; }
function nameOf(id){ const d = defOf(id); return d ? d.name : '?'; }
function stackOf(id){ return isBlockId(id) ? 64 : (items[id] ? items[id].stack : 64); }
/** wird als flaches Bild gezeigt (Hand, liegend, Symbol)? */
function isFlat(id){
  if(!isBlockId(id)) return true;
  const b = blocks[id];
  return !!(b.icon || b.model === 'cross' || b.model === 'torch');
}
function flatTexOf(id){
  if(isBlockId(id)){ const b = blocks[id]; return b.icon || b.faces[0]; }
  return items[id] ? items[id].tex : 'stone';
}
/** Bild-URL für die Oberfläche: Würfel in Iso-Ansicht oder flaches Bild */
function iconFor(id){
  if(isFlat(id)) return iconURL(flatTexOf(id));
  const b = blocks[id];
  return isoIconURL(b.faces[2], b.dirFront || b.faces[4], b.faces[0]);
}
