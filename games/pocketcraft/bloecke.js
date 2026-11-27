/* Pocketcraft · Blöcke und Gegenstände
   Die Nummern sind Teil jedes Spielstands. Neue Blöcke und Gegenstände
   werden deshalb nur hinten angehängt, nie dazwischen geschoben. */
'use strict';

/* ── Block-Register ────────────────────────────────────────────────── */
/* Block-Nummern: 1…255 wie seit jeher; die Gegenstände belegen 256…;
   was danach an Blöcken kam, liegt ab BLOCK2 (die Chunks speichern 16 Bit) */
const BLOCK2 = 512, BMAX = 1024;
const B = { AIR:0, STONE:1, GRASS:2, DIRT:3, COBBLE:4, PLANKS:5, SAND:6, GRAVEL:7, LOG:8,
  LEAVES:9, GLASS:10, WATER:11, BEDROCK:12, COAL_ORE:13, IRON_ORE:14, GOLD_ORE:15, DIAMOND_ORE:16,
  TABLE:17, FURNACE:18, FURNACE_LIT:19, TORCH:20, TALLGRASS:21, ROSE:22, DANDELION:23,
  CACTUS:24, STONEBRICK:25, SANDSTONE:26, SNOW:27,
  CHEST:28, LADDER:29 /* …32, je Wand */, BED:33, FARMLAND:34, WHEAT:35 /* …38, je Stufe */,
  IRON_BLOCK:39, GOLD_BLOCK:40, DIAMOND_BLOCK:41, DOOR:42 /* …57 */, WOOL:58 /* …61, je Farbe */,
  FLUSS:62 /* …68, fließendes Wasser, Stärke 7…1 */, FALL:69 /* fallendes Wasser */,
  JUKEBOX:70, JUKEBOX_VOLL:71 /* mit Schallplatte */,
  SCHNEEDECKE:72, FICHTENSTAMM:73, FICHTENNADELN:74,
  REDSTONE_ERZ:75, REDSTONEBLOCK:76, RS_LAMPE:77 /* 78 an */, DRUCKPLATTE:79 /* 80 gedrückt */,
  RS_FACKEL:81 /* …85 an, 86…90 aus */, HEBEL:91 /* …95 aus, 96…100 an */, KNOPF:101 /* …105, 106…110 gedrückt */,
  STAUB:111 /* …126: Redstone-Leitung mit Ladung 0…15 */,
  VERSTAERKER:127 /* …158: Richtung + 4·(Verzögerung − 1) + 16·an */,
  KOLBEN:159 /* …170: Richtung + 6·ausgefahren */, KLEBKOLBEN:171 /* …182 */, KOLBENKOPF:183 /* …188: Richtung (ob er klebt, sagt der Kolben dahinter) */, LAVA:189, FACKEL_WAND:190 /* …193: Fackel an der Wand, Richtung zur Wand SEITE[s] */, NETHERRACK:194,
  TREPPE:195 /* …226: 8·Art + Richtung + 4·umgedreht */, STUFE:227 /* …236: 2·Art + oben */,
  BETT:237 /* …246: je Farbe, das rote ist B.BED */, KORNBLUME:247,
  KUERBIS:248, GESCHNITZT:249 /* …252: das Gesicht schaut zur Seite SEITE[r] */,
  BETTKOPF:253 /* Kopfteil eines Betts, jede Farbe: die Farbe trägt das Fußteil daneben */,
  OBSIDIAN:254, BRAUSTAND:255,
  // ab hier 16 Bit — der Wirrwald im Nether
  WIRR_NYZEL:512 /* Wirr-Nezel: Netherrack mit blaugrünem Bewuchs */, WIRR_STIEL:513, WIRR_WARZE:514,
  WIRR_WURZELN:515, WIRR_PILZ:516, PILZLICHT:517,
  NETHERZIEGEL:518, SPAWNER:519 /* Monsterspawner der Festungen */, FEUER:520,
  // das End
  ENDRAHMEN:521, ENDRAHMEN_AUGE:522, ENDPORTAL:523, ENDSTEIN:524, DRACHENEI:525,
  LAPIS_ERZ:526, LAPIS_BLOCK:527,
  // bunte Blöcke (16 Farben wie FARBEN) und Ton
  WOLLE2:528 /* …539: die zwölf Farben, die Schafe nicht haben */, BETON:540 /* …555 */, KERAMIK:556 /* ungefärbt */,
  KERAMIK_F:557 /* …572 */, GLAS_F:573 /* …588: gefärbtes Glas */, TON:589,
  // die übrigen Redstone-Bauteile
  HOLZKNOPF:590 /* …599 wie KNOPF */, PLATTE_HOLZ:600 /* 601 gedrückt */, PLATTE_GOLD:602 /* 603 */, PLATTE_EISEN:604 /* 605 */,
  BEOBACHTER:606 /* …617: Richtung (RICHTUNG6, dorthin schaut das Gesicht) + 6·an */,
  TAGESSENSOR:618 /* …621: an + 2·umgekehrt */, ZIELBLOCK:622 /* 623 getroffen */, NOTENBLOCK:624 /* …648: Ton 0…24 */,
  TNT:649, EISENTUER:650 /* …665 wie DOOR */, FALLTUER:666 /* …681: Seite + 4·offen + 8·oben */, EISENFALLTUER:682 /* …697 */,
  SPENDER:698 /* …709: Richtung + 6·ausgelöst */, WERFER:710 /* …721 */, TRICHTER:722 /* …726: 0 nach unten, 1…4 zur Seite SEITE[r − 1] */,
  KOMPARATOR:727 /* …742: Richtung + 4·subtrahieren + 8·an */, KUPFERLEUCHTE:743 /* …746: an + 2·gespeist */,
  SCHLEIMBLOCK:747, HONIGBLOCK:748, SKULK:749 /* 750 an */, FALLENTRUHE:751 /* 752 offen */ };

/* Die sechzehn Farben des Vorbilds, in seiner Reihenfolge. rgb: die Farbe
   des Farbstoffs; wolle: die Nummer der Wolle in dieser Farbe (die vier
   Schaffarben gibt es seit jeher, die anderen ab B.WOLLE2) */
const FARBEN = [
  { key:'weiss',     mc:'white',      name:'Weiß',      adj:'Weiße',      rgb:[233, 236, 236] },
  { key:'orange',    mc:'orange',     name:'Orange',    adj:'Orange',     rgb:[240, 118, 19] },
  { key:'magenta',   mc:'magenta',    name:'Magenta',   adj:'Magenta',    rgb:[189, 68, 179] },
  { key:'hellblau',  mc:'light_blue', name:'Hellblau',  adj:'Hellblaue',  rgb:[58, 175, 217] },
  { key:'gelb',      mc:'yellow',     name:'Gelb',      adj:'Gelbe',      rgb:[248, 198, 39] },
  { key:'hellgruen', mc:'lime',       name:'Hellgrün',  adj:'Hellgrüne',  rgb:[112, 185, 25] },
  { key:'rosa',      mc:'pink',       name:'Rosa',      adj:'Rosa',       rgb:[237, 141, 172] },
  { key:'grau',      mc:'gray',       name:'Grau',      adj:'Graue',      rgb:[62, 68, 71] },
  { key:'hellgrau',  mc:'light_gray', name:'Hellgrau',  adj:'Hellgraue',  rgb:[142, 142, 134] },
  { key:'tuerkis',   mc:'cyan',       name:'Türkis',    adj:'Türkise',    rgb:[21, 137, 145] },
  { key:'lila',      mc:'purple',     name:'Lila',      adj:'Lila',       rgb:[121, 42, 172] },
  { key:'blau',      mc:'blue',       name:'Blau',      adj:'Blaue',      rgb:[53, 57, 157] },
  { key:'braun',     mc:'brown',      name:'Braun',     adj:'Braune',     rgb:[114, 71, 40] },
  { key:'gruen',     mc:'green',      name:'Grün',      adj:'Grüne',      rgb:[84, 109, 27] },
  { key:'rot',       mc:'red',        name:'Rot',       adj:'Rote',       rgb:[160, 39, 34] },
  { key:'schwarz',   mc:'black',      name:'Schwarz',   adj:'Schwarze',   rgb:[20, 21, 25] },
];
{
  const alt = { weiss:0, hellgrau:1, schwarz:2, braun:3 };
  let n = 0;
  for(const f of FARBEN) f.wolle = alt[f.key] !== undefined ? B.WOOL + alt[f.key] : B.WOLLE2 + n++;
}
const farbeNr = key => FARBEN.findIndex(f => f.key === key);
/** Farbwort mit Endung — Orange, Magenta, Rosa und Lila beugt man nicht */
const farbAdj = (f, endung) => ['orange', 'magenta', 'rosa', 'lila'].includes(f.key) ? f.name : f.name + endung;
const isBeton = id => id >= B.BETON && id < B.BETON + 16;
const isKeramik = id => id === B.KERAMIK || (id >= B.KERAMIK_F && id < B.KERAMIK_F + 16);
const isGlasF = id => id >= B.GLAS_F && id < B.GLAS_F + 16;

/* Natürliche Schaffarben — Wolle gibt es in genau diesen vier */
const WOLLE = [
  { name:'Weiße Wolle',     tint:[1, 1, 1],          anteil:.82 },
  { name:'Hellgraue Wolle', tint:[.66, .66, .64],    anteil:.06 },
  { name:'Schwarze Wolle',  tint:[.2, .2, .22],      anteil:.06 },
  { name:'Braune Wolle',    tint:[.56, .39, .26],    anteil:.06 },
];
const isWool = id => (id >= B.WOOL && id < B.WOOL + 4) || (id >= B.WOLLE2 && id < B.WOLLE2 + 12);

/* Wasser: B.WATER ist eine Quelle (Meer, Eimer). Was davon wegfließt, trägt
   seine Stärke im Block: 7 gleich neben der Quelle, 1 am Rand. Fallendes
   Wasser ist voll, aber keine Quelle — ohne Nachschub von oben versiegt es. */
const isWasser = id => id === B.WATER || (id >= B.FLUSS && id <= B.FALL);
const flussId = staerke => B.FLUSS + 7 - staerke;
/** 8 für Quelle und fallendes Wasser, sonst die Stärke, 0 ohne Wasser */
const wasserMenge = id => id === B.WATER || id === B.FALL ? 8 : (id >= B.FLUSS && id < B.FALL ? 7 - (id - B.FLUSS) : 0);

/* Seiten, wie sie Leiter und Tür benutzen: 0 +X, 1 −X, 2 +Z, 3 −Z */
const SEITE = [[1,0],[-1,0],[0,1],[0,-1]];

/* Redstone. Fackel, Hebel und Knopf hängen irgendwo: Anbau 0 heißt auf dem
   Boden (der tragende Block liegt darunter), 1…4 an der Wand — der tragende
   Block liegt bei SEITE[Anbau − 1], wie bei der Leiter. Die Leitung trägt
   ihre Ladung (0…15) in der Nummer, wie das Wasser seine Stärke. */
const rsFackel = (an, anbau) => B.RS_FACKEL + (an ? 0 : 5) + anbau;
const hebelId = (an, anbau) => B.HEBEL + (an ? 5 : 0) + anbau;
const knopfId = (an, anbau, holz) => (holz ? B.HOLZKNOPF : B.KNOPF) + (an ? 5 : 0) + anbau;
const isHolzknopf = id => id >= B.HOLZKNOPF && id < B.HOLZKNOPF + 10;
const knopfBasis = id => isHolzknopf(id) ? B.HOLZKNOPF : B.KNOPF;
/** derselbe Knopf, gedrückt oder nicht */
const knopfUm = (id, an) => knopfBasis(id) + (an ? 5 : 0) + (id - knopfBasis(id)) % 5;
const staubId = ladung => B.STAUB + ladung;
const isRSFackel = id => id >= B.RS_FACKEL && id < B.RS_FACKEL + 10;
const isHebel = id => id >= B.HEBEL && id < B.HEBEL + 10;
const isKnopf = id => (id >= B.KNOPF && id < B.KNOPF + 10) || isHolzknopf(id);
const isStaub = id => id >= B.STAUB && id < B.STAUB + 16;
const isPlatte = id => id === B.DRUCKPLATTE || id === B.DRUCKPLATTE + 1 || (id >= B.PLATTE_HOLZ && id < B.PLATTE_HOLZ + 6);
/** die ungedrückte Platte derselben Art */
const platteBasis = id => id === B.DRUCKPLATTE || id === B.DRUCKPLATTE + 1 ? B.DRUCKPLATTE : B.PLATTE_HOLZ + ((id - B.PLATTE_HOLZ) & ~1);
const platteGedrueckt = id => id === platteBasis(id) + 1;
const isLampe = id => id === B.RS_LAMPE || id === B.RS_LAMPE + 1;
const staubLadung = id => id - B.STAUB;
/** Anbau eines hängenden Bauteils, sonst −1 */
const rsAnbau = id => isRSFackel(id) ? (id - B.RS_FACKEL) % 5 : isHebel(id) ? (id - B.HEBEL) % 5 : isKnopf(id) ? (id - knopfBasis(id)) % 5 : -1;
/** an, gedrückt, leuchtend? */
const rsAn = id => isRSFackel(id) ? id < B.RS_FACKEL + 5 : isHebel(id) ? id >= B.HEBEL + 5 : isKnopf(id) ? id >= knopfBasis(id) + 5
  : isVerstaerker(id) ? id >= B.VERSTAERKER + 16 : isPlatte(id) ? platteGedrueckt(id)
  : isBeobachter(id) ? beobAn(id) : isKomparator(id) ? kompAn(id) : isTagessensor(id) ? tagAn(id) : isKupferleuchte(id) ? kupferAn(id)
  : id === B.RS_LAMPE + 1 || id === B.ZIELBLOCK + 1 || id === B.SKULK + 1 || id === B.FALLENTRUHE + 1;
/* Verstärker: gibt Strom nur nach vorn weiter (Richtung wie SEITE), nach 1…4
   Zehntelsekunden. Kolben zeigen in eine von sechs Richtungen, die erste nach oben. */
const RICHTUNG6 = [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
const verstaerkerId = (an, stufe, r) => B.VERSTAERKER + (an ? 16 : 0) + (stufe - 1)*4 + r;
const isVerstaerker = id => id >= B.VERSTAERKER && id < B.VERSTAERKER + 32;
const vRichtung = id => (id - B.VERSTAERKER) & 3;
const vStufe = id => (((id - B.VERSTAERKER) >> 2) & 3) + 1;
const kolbenId = (klebrig, aus, r) => (klebrig ? B.KLEBKOLBEN : B.KOLBEN) + (aus ? 6 : 0) + r;
const isKolben = id => id >= B.KOLBEN && id < B.KOLBEN + 24;
const kolbenKlebrig = id => id >= B.KLEBKOLBEN;
const kolbenAus = id => (id - B.KOLBEN) % 12 >= 6;
const kolbenRichtung = id => (id - B.KOLBEN) % 6;
const kopfId = (klebrig, r) => B.KOLBENKOPF + r;
const isKopf = id => id >= B.KOLBENKOPF && id < B.KOLBENKOPF + 6;
const kopfRichtung = id => id - B.KOLBENKOPF;
/** klebt der Kopf? Das weiß der Kolben, an dem er hängt; get(x, y, z) liest Blöcke */
function kopfKlebrigBei(get, x, y, z, id){
  const [dx, dy, dz] = RICHTUNG6[kopfRichtung(id)], b = get(x - dx, y - dy, z - dz);
  return isKolben(b) && kolbenKlebrig(b);
}
/* Bis 26.11 hatten klebrige Köpfe eigene Nummern (189 … 194, heute Lava und
   frei): in alten Spielständen werden sie beim Laden zu den gewöhnlichen. */
/** Fackel an der Wand: s = Seite, an der die Wand ist (wie SEITE) */
const fackelWand = s => B.FACKEL_WAND + s;
const isWandfackel = id => id >= B.FACKEL_WAND && id < B.FACKEL_WAND + 4;
const altNummer = id => id >= 189 && id <= 194 ? id - 6 : id;
/** Punkt eines nach oben zeigenden Modells (Sechzehntel) in Richtung r drehen — nur echte Drehungen */
function drehe6(x, y, z, r){
  switch(r){
    case 1: return [x, 16 - y, 16 - z];
    case 2: return [y, 16 - x, z];
    case 3: return [16 - y, x, z];
    case 4: return [x, 16 - z, y];
    case 5: return [x, z, 16 - y];
    default: return [x, y, z];
  }
}
function drehBox(b, r){
  const a = drehe6(b[0], b[1], b[2], r), c = drehe6(b[3], b[4], b[5], r);
  return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])];
}
/** der Kasten eines Knopfs: 6 × 4 Pixel, 2 dick (gedrückt 1), am Boden flach */
function knopfBox(anbau, gedrueckt){
  const d = gedrueckt ? 1 : 2;
  if(anbau === 0) return [5, 0, 6, 11, d, 10];
  return [[16-d,6,5,16,10,11], [0,6,5,d,10,11], [5,6,16-d,11,10,16], [5,6,0,11,10,d]][anbau - 1];
}
/* Treppen: je Art acht Nummern — die Richtung (wie SEITE: dorthin liegt die
   hohe Stufe) und ob sie umgedreht an der Decke hängt. Ob eine Treppe gerade
   ist oder eine Ecke bildet, ergibt sich wie beim Vorbild aus den Nachbarn. */
const TREPPEN = [
  { name:'Holztreppe',        stoff:B.PLANKS,     mc:'oak_stairs' },
  { name:'Bruchsteintreppe',  stoff:B.COBBLE,     mc:'cobblestone_stairs' },
  { name:'Steinziegeltreppe', stoff:B.STONEBRICK, mc:'stone_brick_stairs' },
  { name:'Sandsteintreppe',   stoff:B.SANDSTONE,  mc:'sandstone_stairs' },
];
const treppeId = (art, r, oben) => B.TREPPE + art*8 + (oben ? 4 : 0) + r;
const isTreppe = id => id >= B.TREPPE && id < B.TREPPE + TREPPEN.length*8;
const treppeArt = id => (id - B.TREPPE) >> 3;
const treppeRichtung = id => (id - B.TREPPE) & 3;
const treppeOben = id => ((id - B.TREPPE) & 4) !== 0;
/* Die Stufe besteht aus Vierteln, Bit qz·2 + qx (qx = 1: die Hälfte bei +X).
   HALB[r]: die Hälfte zur Seite SEITE[r]. */
const TREPPE_HALB = [0b1010, 0b0101, 0b1100, 0b0011];
/** welche Viertel die Stufe füllt: gerade eine Hälfte; steht hinter ihr eine
    Treppe quer, nur ein Viertel (Außenecke), steht sie davor, drei (Innenecke) */
function treppeForm(get, x, y, z, id){
  const r = treppeRichtung(id), oben = treppeOben(id), [dx, dz] = SEITE[r];
  const quer = n => isTreppe(n) && treppeOben(n) === oben && (treppeRichtung(n) >> 1) !== (r >> 1);
  const gleich = n => isTreppe(n) && treppeRichtung(n) === r && treppeOben(n) === oben;
  const hinten = get(x + dx, y, z + dz);
  if(quer(hinten)){
    const r2 = treppeRichtung(hinten), [ex, ez] = SEITE[r2];
    if(!gleich(get(x - ex, y, z - ez))) return TREPPE_HALB[r] & TREPPE_HALB[r2];
  }
  const vorn = get(x - dx, y, z - dz);
  if(quer(vorn)){
    const r2 = treppeRichtung(vorn), [ex, ez] = SEITE[r2];
    if(!gleich(get(x + ex, y, z + ez))) return TREPPE_HALB[r] | TREPPE_HALB[r2];
  }
  return TREPPE_HALB[r];
}
/** Kästen einer Treppe in Sechzehnteln nach out: erst die Platte, dann je
    Viertel der Stufe einer; gibt die Anzahl zurück */
function treppeKaesten(form, oben, out){
  let n = 0;
  const put = (x0, y0, z0, x1, y1, z1) => { const o = n++*6; out[o] = x0; out[o+1] = y0; out[o+2] = z0; out[o+3] = x1; out[o+4] = y1; out[o+5] = z1; };
  put(0, oben ? 8 : 0, 0, 16, oben ? 16 : 8, 16);
  for(let q = 0; q < 4; q++) if(form >> q & 1){
    const qx = (q & 1)*8, qz = (q >> 1)*8;
    put(qx, oben ? 0 : 8, qz, qx + 8, oben ? 8 : 16, qz + 8);
  }
  return n;
}
/* Stufen (halbe Blöcke): unten oder oben im Block. Zwei gleiche übereinander
   werden der volle Block ihres Stoffs — zwei Steinstufen also Stein. */
const STUFEN = [
  { name:'Holzstufe',         stoff:B.PLANKS,     mc:'oak_slab' },
  { name:'Bruchsteinstufe',   stoff:B.COBBLE,     mc:'cobblestone_slab' },
  { name:'Steinstufe',        stoff:B.STONE,      mc:'stone_slab' },
  { name:'Steinziegelstufe',  stoff:B.STONEBRICK, mc:'stone_brick_slab' },
  { name:'Sandsteinstufe',    stoff:B.SANDSTONE,  mc:'sandstone_slab' },
];
const stufeId = (art, oben) => B.STUFE + art*2 + (oben ? 1 : 0);
const isStufe = id => id >= B.STUFE && id < B.STUFE + STUFEN.length*2;
const stufeArt = id => (id - B.STUFE) >> 1;
const stufeOben = id => ((id - B.STUFE) & 1) === 1;

/* Betten in Farben. Das rote ist das alte (B.BED); gefärbt wird ein Bett mit
   Blumen, Kaktus, Knochenmehl, Kohle oder Erde, oder man baut es gleich aus
   Wolle in ihrer Farbe. farbe: die Decke, in 0…255. */
const BETTEN = [
  { key:'weiss',   name:'Weißes Bett',     farbe:[236, 236, 230], mc:'white_bed' },
  { key:'grau',    name:'Hellgraues Bett', farbe:[160, 160, 156], mc:'light_gray_bed' },
  { key:'schwarz', name:'Schwarzes Bett',  farbe:[52, 50, 58],    mc:'black_bed' },
  { key:'braun',   name:'Braunes Bett',    farbe:[128, 82, 48],   mc:'brown_bed' },
  { key:'gelb',    name:'Gelbes Bett',     farbe:[246, 206, 52],  mc:'yellow_bed' },
  { key:'orange',  name:'Oranges Bett',    farbe:[246, 128, 30],  mc:'orange_bed' },
  { key:'gruen',   name:'Grünes Bett',     farbe:[96, 170, 40],   mc:'green_bed' },
  { key:'blau',    name:'Blaues Bett',     farbe:[58, 88, 214],   mc:'blue_bed' },
  { key:'lila',    name:'Lila Bett',       farbe:[146, 58, 196],  mc:'purple_bed' },
  { key:'rosa',    name:'Rosa Bett',       farbe:[246, 142, 180], mc:'pink_bed' },
];
const bettId = key => B.BETT + BETTEN.findIndex(b => b.key === key);
const isBett = id => id === B.BED || id === B.BETTKOPF || (id >= B.BETT && id < B.BETT + BETTEN.length);
/* Betten sind wie beim Vorbild zwei Blöcke lang: das Fußteil trägt die Farbe
   (B.BED, B.BETT + i), das Kopfteil ist für alle Farben B.BETTKOPF. Für
   jede Farbe und Richtung eine eigene Nummer gäbe es nicht — die Nummern
   sind fast alle vergeben. Die beiden finden sich über die Nachbarschaft. */
const bettSchluessel = id => id === B.BED ? 'rot' : (id >= B.BETT && id < B.BETT + BETTEN.length ? BETTEN[id - B.BETT].key : 'rot');
const BETT_TEILE = ['head_up', 'head_east', 'head_west', 'foot_up', 'foot_east', 'foot_west', 'foot_south'];
/** Seite (Index in SEITE) zum anderen Teil des Betts, oder −1; get(x, y, z) liest Blöcke */
function bettPartner(get, x, y, z, id){
  const kopf = id === B.BETTKOPF;
  for(let k = 0; k < 4; k++){
    const n = get(x + SEITE[k][0], y, z + SEITE[k][1]);
    if(kopf ? (isBett(n) && n !== B.BETTKOPF) : n === B.BETTKOPF) return k;
  }
  return -1;
}
const ladderId = s => B.LADDER + s;
const isLadder = id => id >= B.LADDER && id < B.LADDER + 4;
const isWheat = id => id >= B.WHEAT && id < B.WHEAT + 4;
const isGeschnitzt = id => id >= B.GESCHNITZT && id < B.GESCHNITZT + 4;
/* Tür: Hälfte (0 unten, 1 oben) · offen · Seite, an der das Blatt steht */
const doorId = (oben, offen, seite, basis = B.DOOR) => basis + (oben ? 8 : 0) + (offen ? 4 : 0) + seite;
const isEisentuer = id => id >= B.EISENTUER && id < B.EISENTUER + 16;
const isDoor = id => (id >= B.DOOR && id < B.DOOR + 16) || isEisentuer(id);
const doorInfo = id => { const basis = isEisentuer(id) ? B.EISENTUER : B.DOOR, k = id - basis; return { basis, oben: k >= 8, offen: (k & 4) !== 0, seite: k & 3 }; };
/* Beim Öffnen schwingt das Blatt an die Nachbarseite */
const DOOR_AUF = [2, 3, 1, 0];

/* ── Die übrigen Redstone-Bauteile ─────────────────────────────────── */
/* Beobachter: das Gesicht schaut in Richtung RICHTUNG6[r]; ändert sich der
   Block davor, gibt er hinten einen kurzen Puls */
const beobId = (r, an) => B.BEOBACHTER + r + (an ? 6 : 0);
const isBeobachter = id => id >= B.BEOBACHTER && id < B.BEOBACHTER + 12;
const beobRichtung = id => (id - B.BEOBACHTER) % 6;
const beobAn = id => id >= B.BEOBACHTER + 6;
/* Tageslichtsensor: Strom bei Tag — umgekehrt bei Nacht */
const isTagessensor = id => id >= B.TAGESSENSOR && id < B.TAGESSENSOR + 4;
const tagAn = id => ((id - B.TAGESSENSOR) & 1) === 1;
const tagUmgekehrt = id => ((id - B.TAGESSENSOR) & 2) === 2;
const tagId = (an, umgekehrt) => B.TAGESSENSOR + (an ? 1 : 0) + (umgekehrt ? 2 : 0);
const isNotenblock = id => id >= B.NOTENBLOCK && id < B.NOTENBLOCK + 25;
/* Falltüren: Seite, zu der sie aufklappen (wie SEITE), offen, oben im Block */
const isFalltuer = id => id >= B.FALLTUER && id < B.FALLTUER + 32;
const isEisenfalltuer = id => id >= B.EISENFALLTUER && id < B.EISENFALLTUER + 16;
const falltuerBasis = id => isEisenfalltuer(id) ? B.EISENFALLTUER : B.FALLTUER;
const falltuerInfo = id => { const k = id - falltuerBasis(id); return { seite: k & 3, offen: (k & 4) !== 0, oben: (k & 8) !== 0 }; };
const falltuerId = (basis, seite, offen, oben) => basis + seite + (offen ? 4 : 0) + (oben ? 8 : 0);
function falltuerBox(seite, offen, oben){
  if(offen) return blattBox(seite, 3);
  return oben ? [0, 13, 0, 16, 16, 16] : [0, 0, 0, 16, 3, 16];
}
/* Spender und Werfer: Richtung wie beim Kolben, ausgelöst, solange Strom anliegt */
const isSpender = id => id >= B.SPENDER && id < B.SPENDER + 12;
const isWerfer = id => id >= B.WERFER && id < B.WERFER + 12;
const auswurfBasis = id => isWerfer(id) ? B.WERFER : B.SPENDER;
const auswurfRichtung = id => (id - auswurfBasis(id)) % 6;
const auswurfAus = id => id - auswurfBasis(id) >= 6;
const auswurfId = (basis, r, aus) => basis + r + (aus ? 6 : 0);
/* Trichter: 0 gibt nach unten ab, 1…4 zur Seite SEITE[r − 1] */
const isTrichter = id => id >= B.TRICHTER && id < B.TRICHTER + 5;
const trichterZiel = id => { const r = id - B.TRICHTER; return r === 0 ? [0, -1, 0] : [SEITE[r - 1][0], 0, SEITE[r - 1][1]]; };
/* Komparator: wie der Verstärker gerichtet; vergleicht oder subtrahiert */
const isKomparator = id => id >= B.KOMPARATOR && id < B.KOMPARATOR + 16;
const kompRichtung = id => (id - B.KOMPARATOR) & 3;
const kompMinus = id => ((id - B.KOMPARATOR) & 4) === 4;
const kompAn = id => ((id - B.KOMPARATOR) & 8) === 8;
const kompId = (r, minus, an) => B.KOMPARATOR + r + (minus ? 4 : 0) + (an ? 8 : 0);
/* Kupferleuchte: schaltet bei jedem neuen Strom um */
const isKupferleuchte = id => id >= B.KUPFERLEUCHTE && id < B.KUPFERLEUCHTE + 4;
const kupferAn = id => ((id - B.KUPFERLEUCHTE) & 1) === 1;
const kupferGespeist = id => ((id - B.KUPFERLEUCHTE) & 2) === 2;
const kupferId = (an, gespeist) => B.KUPFERLEUCHTE + (an ? 1 : 0) + (gespeist ? 2 : 0);
const isFallentruhe = id => id === B.FALLENTRUHE || id === B.FALLENTRUHE + 1;
/** Behälter mit Fächern in world.chests: wie viele */
const behaelterGroesse = id => id === B.CHEST || isFallentruhe(id) ? 27 : isSpender(id) || isWerfer(id) ? 9 : isTrichter(id) ? 5 : 0;
/** Richtung in RICHTUNG6, in die ein Block mit Gesicht zum Spieler zeigen soll (f: Blickrichtung) */
function richtungZumSpieler(f){
  const ax = Math.abs(f[0]), ay = Math.abs(f[1]), az = Math.abs(f[2]);
  return ay > ax && ay > az ? (f[1] > 0 ? 1 : 0) : ax > az ? (f[0] > 0 ? 3 : 2) : (f[2] > 0 ? 5 : 4);
}
/** Fläche (wie faces: +X, −X, +Y, −Y, +Z, −Z) für eine Richtung in RICHTUNG6 */
const R6_FLAECHE = [2, 3, 0, 1, 4, 5];
/** Bilder eines Würfels, der in Richtung r schaut: vorn, hinten, sonst Seite (oben/unten eigene, wenn waagerecht) */
function gerichteteFlaechen(r, vorne, hinten, seite, oben, unten){
  const f = [seite, seite, oben || seite, unten || oben || seite, seite, seite];
  if(r < 2){ f[0] = f[1] = f[4] = f[5] = seite; f[2] = f[3] = seite; }
  const v = R6_FLAECHE[r];
  f[v] = vorne; f[v ^ 1] = hinten;
  return f;
}

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
  for(let k = 0; k < 8; k++)
    defBlock(B.FLUSS + k,{name:'Wasser', tex:'water0', solid:false, opaque:false, model:'liquid', hardness:-1, replaceable:true, item:false});
  defBlock(B.JUKEBOX,{name:'Plattenspieler', tex:['jukebox_top','planks','jukebox_side'], hardness:2, tool:'axe'});
  defBlock(B.JUKEBOX_VOLL,{name:'Plattenspieler', tex:['jukebox_top_voll','planks','jukebox_side'], hardness:2, tool:'axe',
    drop:B.JUKEBOX, item:false});
  // dünner Schnee: zwei Sechzehntel hoch, man geht hindurch, ein Block darauf ersetzt ihn
  defBlock(B.SCHNEEDECKE,{name:'Schneedecke', tex:'snow', model:'box', box:[0,0,0,16,2,16], solid:false, opaque:false,
    hardness:.1, tool:'shovel', replaceable:true, icon:'i_schneedecke'});
  defBlock(B.FICHTENSTAMM,{name:'Fichtenstamm', tex:['fichte_top','fichte_top','fichte_side'], hardness:2, tool:'axe'});
  defBlock(B.FICHTENNADELN,{name:'Fichtennadeln', tex:'fichtennadeln', hardness:.2, opaque:false, model:'cutout'});
  // Redstone
  defBlock(B.REDSTONE_ERZ,{name:'Redstone-Erz', tex:'rs_erz', hardness:3, tool:'pickaxe', tier:3});
  defBlock(B.REDSTONEBLOCK,{name:'Redstoneblock', tex:'rs_block', hardness:5, tool:'pickaxe', tier:1, rs:true});
  defBlock(B.RS_LAMPE,{name:'Redstonelampe', tex:'rs_lampe', hardness:.3, rs:true});
  defBlock(B.RS_LAMPE + 1,{name:'Redstonelampe', tex:'rs_lampe_an', hardness:.3, light:15, drop:B.RS_LAMPE, item:false, rs:true});
  defBlock(B.DRUCKPLATTE,{name:'Steindruckplatte', tex:'stone', model:'box', box:[1,0,1,15,2,15], solid:false, opaque:false,
    hardness:.5, tool:'pickaxe', icon:'i_druckplatte', rs:true});
  defBlock(B.DRUCKPLATTE + 1,{name:'Steindruckplatte', tex:'stone', model:'box', box:[1,0,1,15,1,15], solid:false, opaque:false,
    hardness:.5, tool:'pickaxe', icon:'i_druckplatte', drop:B.DRUCKPLATTE, item:false, rs:true});
  for(let a = 0; a < 5; a++){
    defBlock(rsFackel(true, a),{name:'Redstonefackel', tex:'rs_fackel', model:'rsfackel', solid:false, opaque:false, light:7,
      hardness:.05, drop:B.RS_FACKEL, item:a === 0, icon:'rs_fackel', rs:true});
    defBlock(rsFackel(false, a),{name:'Redstonefackel', tex:'rs_fackel_aus', model:'rsfackel', solid:false, opaque:false,
      hardness:.05, drop:B.RS_FACKEL, item:false, icon:'rs_fackel', rs:true});
    for(const an of [false, true]){
      defBlock(hebelId(an, a),{name:'Hebel', tex:'cobble', model:'hebel', solid:false, opaque:false, hardness:.5,
        drop:B.HEBEL, item:!an && a === 0, icon:'i_hebel', rs:true});
      defBlock(knopfId(an, a),{name:'Steinknopf', tex:'stone', model:'box', box:knopfBox(a, an), solid:false, opaque:false,
        hardness:.5, drop:B.KNOPF, item:!an && a === 0, icon:'i_knopf', rs:true});
    }
  }
  for(let l = 0; l < 16; l++)
    defBlock(staubId(l),{name:'Redstone-Leitung', tex:'rs_staub' + l, model:'staub', solid:false, opaque:false, hardness:0,
      drop:'redstone', item:false, rs:true});
  // Verstärker: flach wie eine Steinplatte, zwei Fackeln darauf
  for(const an of [false, true]) for(let st = 1; st <= 4; st++) for(let r = 0; r < 4; r++)
    defBlock(verstaerkerId(an, st, r),{name:'Redstone-Verstärker', tex:['rs_verstaerker','stone','stone'], model:'verstaerker',
      solid:false, opaque:false, hardness:0, drop:B.VERSTAERKER, item:!an && st === 1 && r === 0, icon:'i_verstaerker', rs:true});
  // Kolben: eingefahren ein voller Block; ausgefahren ein kürzerer Fuß und davor der Kopf
  for(const kl of [false, true]) for(let r = 0; r < 6; r++){
    const name = kl ? 'Klebriger Kolben' : 'Kolben', oben = kl ? 'kolben_oben_klebrig' : 'kolben_oben';
    defBlock(kolbenId(kl, false, r),{name, tex:[oben,'kolben_unten','kolben_seite'], model:'kolben', hardness:1.5, tool:'pickaxe',
      drop:kolbenId(kl, false, 0), item:r === 0, rs:true});
    defBlock(kolbenId(kl, true, r),{name, tex:['kolben_innen','kolben_unten','kolben_seite'], model:'kolben', opaque:false,
      box:drehBox([0,0,0,16,12,16], r), hardness:1.5, tool:'pickaxe', drop:kolbenId(kl, false, 0), item:false, rs:true});
    if(!kl) defBlock(kopfId(kl, r),{name:'Kolbenkopf', tex:[oben,'kolben_oben','kolben_seite'], model:'kolben', opaque:false,
      box:drehBox([0,12,0,16,16,16], r), hardness:1.5, tool:'pickaxe', drop:B.AIR, item:false, rs:true});
  }
  defBlock(B.BEDROCK,{name:'Grundgestein', tex:'bedrock', hardness:-1, item:false});
  defBlock(B.COAL_ORE,{name:'Kohleerz', tex:'coal_ore', hardness:3, tool:'pickaxe', tier:1, drop:'i_coal'});
  defBlock(B.IRON_ORE,{name:'Eisenerz', tex:'iron_ore', hardness:3, tool:'pickaxe', tier:2});
  defBlock(B.GOLD_ORE,{name:'Golderz', tex:'gold_ore', hardness:3, tool:'pickaxe', tier:3});
  defBlock(B.DIAMOND_ORE,{name:'Diamanterz', tex:'diamond_ore', hardness:3, tool:'pickaxe', tier:3, drop:'i_diamond'});
  defBlock(B.TABLE,{name:'Werkbank', tex:['craft_side','craft_side','craft_top','planks','craft_front','craft_front'], hardness:2.5, tool:'axe'});
  defBlock(B.FURNACE,{name:'Ofen', tex:['furn_top','furn_top','furn_side'], hardness:3.5, tool:'pickaxe', tier:1, dirFront:'furn_front'});
  defBlock(B.FURNACE_LIT,{name:'Ofen', tex:['furn_top','furn_top','furn_side'], hardness:3.5, tool:'pickaxe', tier:1, light:13, drop:B.FURNACE, dirFront:'furn_lit', item:false});
  defBlock(B.TORCH,{name:'Fackel', tex:'torch', model:'torch', solid:false, opaque:false, light:14, hardness:.05});
  // an der Wand: schräg wie beim Vorbild (und wie die Redstonefackel), fällt ab, wenn die Wand fehlt
  for(let s = 0; s < 4; s++) defBlock(fackelWand(s),{name:'Fackel', tex:'torch', model:'wandfackel', solid:false, opaque:false, light:14,
    hardness:.05, drop:B.TORCH, item:false, icon:'torch', wand:s});
  defBlock(B.TALLGRASS,{name:'Hohes Gras', tex:'tallgrass', model:'cross', solid:false, opaque:false, hardness:.05, drop:B.AIR, replaceable:true, item:false});
  defBlock(B.ROSE,{name:'Mohn', tex:'rose', model:'cross', solid:false, opaque:false, hardness:.05, replaceable:true});
  defBlock(B.DANDELION,{name:'Löwenzahn', tex:'dandelion', model:'cross', solid:false, opaque:false, hardness:.05, replaceable:true});
  defBlock(B.CACTUS,{name:'Kaktus', tex:['cactus_top','cactus_top','cactus_side'], hardness:.4, opaque:false, model:'cutout', kaktus:true, hurt:1});
  defBlock(B.STONEBRICK,{name:'Steinziegel', tex:'stonebrick', hardness:2, tool:'pickaxe', tier:1});
  defBlock(B.SANDSTONE,{name:'Sandstein', tex:['sandstone_top','sandstone_top','sandstone'], hardness:1.6, tool:'pickaxe', tier:1});
  defBlock(B.SNOW,{name:'Schnee', tex:'snow', hardness:.4, tool:'shovel'});

  defBlock(B.CHEST,{name:'Truhe', tex:['chest_top','chest_top','chest_side'], hardness:2.5, tool:'axe', dirFront:'chest_front'});
  for(let s = 0; s < 4; s++)
    defBlock(ladderId(s),{name:'Leiter', tex:'ladder', model:'box', box:blattBox(s, 1), solid:false, opaque:false,
      climbable:true, hardness:.4, tool:'axe', drop:B.LADDER, item:s === 0, icon:'ladder', wand:s});
  defBlock(B.BED,{name:'Rotes Bett', tex:['bed_top','planks','bed_side'], model:'bett', box:[0,0,0,16,9,16], opaque:false,
    hardness:.3, mc:'red_bed'});
  defBlock(B.FARMLAND,{name:'Ackerboden', tex:['farmland','dirt','dirt'], model:'box', box:[0,0,0,16,15,16], opaque:false,
    hardness:.6, tool:'shovel', drop:B.DIRT, item:false});
  for(let s = 0; s < 4; s++)
    defBlock(B.WHEAT + s,{name:'Weizen', tex:'wheat' + s, model:'cross', solid:false, opaque:false, hardness:0.02,
      item:false, stufe:s});
  defBlock(B.IRON_BLOCK,{name:'Eisenblock', tex:'iron_block', hardness:4, tool:'pickaxe', tier:2});
  defBlock(B.GOLD_BLOCK,{name:'Goldblock', tex:'gold_block', hardness:4, tool:'pickaxe', tier:3});
  defBlock(B.DIAMOND_BLOCK,{name:'Diamantblock', tex:'diamond_block', hardness:4.5, tool:'pickaxe', tier:3});
  // Lapislazuli: wie beim Vorbild ab der Steinspitzhacke, das Erz gibt vier bis neun Stück
  defBlock(B.LAPIS_ERZ,{name:'Lapislazulierz', tex:'lapis_erz', hardness:3, tool:'pickaxe', tier:2, mc:'lapis_ore'});
  defBlock(B.LAPIS_BLOCK,{name:'Lapislazuliblock', tex:'lapis_block', hardness:3, tool:'pickaxe', tier:2, mc:'lapis_block'});
  WOLLE.forEach((f, k) => defBlock(B.WOOL + k, { name:f.name, tex:'wool' + k, hardness:.8, tool:'shears' }));
  for(let oben = 0; oben < 2; oben++) for(let offen = 0; offen < 2; offen++) for(let s = 0; s < 4; s++){
    const t = oben ? 'door_top' : 'door_bottom';
    defBlock(doorId(oben, offen, s),{name:'Holztür', tex:t, model:'box', box:blattBox(s, 3), opaque:false,
      hardness:2, tool:'axe', drop:B.DOOR, item:!oben && !offen && s === 0, icon:'i_door'});
  }
  // Lava: leuchtet, heiß, zäh; nicht abzubauen, man kann Blöcke hineinsetzen. Mit Wasser wird sie zu Obsidian (wasser.js)
  defBlock(B.LAVA,{name:'Lava', tex:'lava', solid:false, light:15, hardness:-1, item:false, replaceable:true, drop:B.AIR, mc:'lava'});
  // Netherrack: der Stein des Nethers, weich, mit jeder Spitzhacke
  defBlock(B.NETHERRACK,{name:'Netherrack', tex:'netherrack', hardness:.4, tool:'pickaxe', tier:1, mc:'netherrack'});
  // Obsidian: nur mit der Diamantspitzhacke, und das dauert (beim Vorbild 9,4 Sekunden)
  defBlock(B.OBSIDIAN,{name:'Obsidian', tex:'obsidian', hardness:80, tool:'pickaxe', tier:4, mc:'obsidian'});
  // Wirrwald (Nether): Nezel ist Netherrack mit Bewuchs und gibt abgebaut Netherrack;
  // Stiele wie Stämme, Warzenblöcke als Krone, darin Pilzlicht, das leuchtet
  defBlock(B.WIRR_NYZEL,{name:'Wirr-Nezel', tex:['wirr_nyzel','netherrack','wirr_nyzel_seite'], hardness:.4, tool:'pickaxe', tier:1,
    drop:B.NETHERRACK, mc:'warped_nylium'});
  defBlock(B.WIRR_STIEL,{name:'Wirrstiel', tex:['wirr_stiel_oben','wirr_stiel_oben','wirr_stiel'], hardness:2, tool:'axe', mc:'warped_stem'});
  defBlock(B.WIRR_WARZE,{name:'Wirrwarzenblock', tex:'wirr_warze', hardness:1, tool:'hoe', mc:'warped_wart_block'});
  defBlock(B.WIRR_WURZELN,{name:'Wirrwurzeln', tex:'wirr_wurzeln', model:'cross', solid:false, opaque:false, hardness:.05,
    replaceable:true, mc:'warped_roots'});
  defBlock(B.WIRR_PILZ,{name:'Wirrpilz', tex:'wirr_pilz', model:'cross', solid:false, opaque:false, hardness:.05, mc:'warped_fungus'});
  defBlock(B.PILZLICHT,{name:'Pilzlicht', tex:'pilzlicht', hardness:1, tool:'hoe', light:15, mc:'shroomlight'});
  // Netherfestungen: aus Netherziegeln, in der Halle ein Spawner, aus dem Lohen kommen
  defBlock(B.NETHERZIEGEL,{name:'Netherziegel', tex:'netherziegel', hardness:2, tool:'pickaxe', tier:1, mc:'nether_bricks'});
  // Feuer: mit dem Feuerzeug auf einen Block gesetzt; brennt aus — auf Netherrack für immer
  defBlock(B.FEUER,{name:'Feuer', tex:'feuer', model:'cross', solid:false, opaque:false, light:15, hardness:0, drop:B.AIR, item:false,
    replaceable:true, mc:'fire'});
  // Das End: Rahmen im Portalraum der Festung (mit Enderauge voll), das Portal, Endstein, das Drachenei
  defBlock(B.ENDRAHMEN,{name:'Endportalrahmen', tex:['endrahmen_oben','endstein','endrahmen_seite'], model:'box', box:[0,0,0,16,13,16],
    opaque:false, hardness:-1, mc:'end_portal_frame'});
  defBlock(B.ENDRAHMEN_AUGE,{name:'Endportalrahmen mit Auge', tex:['endrahmen_auge','endstein','endrahmen_seite'], model:'box', box:[0,0,0,16,13,16],
    opaque:false, hardness:-1, item:false, drop:B.AIR});
  defBlock(B.ENDPORTAL,{name:'Endportal', tex:'endportal', model:'box', box:[0,0,0,16,12,16], solid:false, opaque:false, light:15,
    hardness:-1, item:false, drop:B.AIR, mc:'end_portal'});
  defBlock(B.ENDSTEIN,{name:'Endstein', tex:'endstein', hardness:3, tool:'pickaxe', tier:1, mc:'end_stone'});
  defBlock(B.DRACHENEI,{name:'Drachenei', tex:'drachenei', model:'box', box:[2,0,2,14,15,14], opaque:false, hardness:3, light:1, mc:'dragon_egg'});
  defBlock(B.SPAWNER,{name:'Monsterspawner', tex:'spawner', hardness:5, tool:'pickaxe', tier:1, opaque:false, model:'cutout', drop:B.AIR, mc:'spawner'});
  // Braustand wie beim Vorbild: Stab, drei Fußplatten, drei Arme; steht in der Dorfkirche beim Priester
  defBlock(B.BRAUSTAND,{name:'Braustand', tex:'braustand', icon:'braustand', model:'braustand', box:[1,0,1,15,2,15], opaque:false,
    hardness:.5, tool:'pickaxe', tier:1, mc:'brewing_stand'});
  defBlock(B.BETTKOPF,{name:'Bett', tex:['bed_top','planks','bed_side'], model:'bett', box:[0,0,0,16,9,16], opaque:false,
    hardness:.3, item:false, drop:B.AIR});
  BETTEN.forEach((b, i) => defBlock(B.BETT + i,{name:b.name, tex:['bett_' + b.key,'planks','bed_side'], model:'bett', box:[0,0,0,16,9,16],
    opaque:false, hardness:.3}));
  // Kürbis; mit der Schere geschnitzt, schaut er einen an — auf vier Eisenblöcken wird daraus ein Golem
  defBlock(B.KUERBIS,{name:'Kürbis', tex:['kuerbis_oben','kuerbis_oben','kuerbis'], hardness:1, tool:'axe', mc:'pumpkin'});
  for(let r = 0; r < 4; r++){
    const f = ['kuerbis','kuerbis','kuerbis_oben','kuerbis_oben','kuerbis','kuerbis'];
    f[[0, 1, 4, 5][r]] = 'kuerbis_gesicht';
    defBlock(B.GESCHNITZT + r,{name:'Geschnitzter Kürbis', tex:f, hardness:1, tool:'axe', drop:B.GESCHNITZT, item:r === 0});
  }
  defBlock(B.KORNBLUME,{name:'Kornblume', tex:'kornblume', model:'cross', solid:false, opaque:false, hardness:.05, replaceable:true});
  // Stufen: wie ihr Stoff, aber nur halb so hoch; Licht fällt hinein, nicht hindurch
  STUFEN.forEach((t, art) => {
    const st = blocks[t.stoff];
    for(const oben of [false, true])
      defBlock(stufeId(art, oben),{name:t.name, tex:st.faces, model:'box', box: oben ? [0,8,0,16,16,16] : [0,0,0,16,8,16], opaque:false,
        lichtStau:true, hardness:st.hardness, tool:st.tool, tier:st.tier, drop:stufeId(art, false), item:!oben});
  });
  // Treppen: so hart wie ihr Stoff, mit denselben Bildern; fest, aber nicht undurchsichtig
  TREPPEN.forEach((t, art) => {
    const st = blocks[t.stoff];
    for(let oben = 0; oben < 2; oben++) for(let r = 0; r < 4; r++)
      defBlock(treppeId(art, r, oben),{name:t.name, tex:st.faces, model:'treppe', opaque:false, lichtStau:true, hardness:st.hardness,
        tool:st.tool, tier:st.tier, drop:treppeId(art, 0, false), item:!oben && r === 0});
  });
  initBlocksMehr();
}

/* Seit 26.11: alle sechzehn Farben (Wolle, Beton, Keramik, Glas), Ton und die
   übrigen Redstone-Bauteile des Vorbilds */
function initBlocksMehr(){
  FARBEN.forEach((f, i) => {
    if(f.wolle >= B.WOLLE2) defBlock(f.wolle, { name:farbAdj(f, 'e') + ' Wolle', tex:'wolle_' + f.key, hardness:.8, tool:'shears', mc:f.mc + '_wool' });
    defBlock(B.BETON + i, { name:farbAdj(f, 'er') + ' Beton', tex:'beton_' + f.key, hardness:1.8, tool:'pickaxe', tier:1, mc:f.mc + '_concrete' });
    defBlock(B.KERAMIK_F + i, { name:farbAdj(f, 'e') + ' Keramik', tex:'keramik_' + f.key, hardness:1.25, tool:'pickaxe', tier:1, mc:f.mc + '_terracotta' });
    defBlock(B.GLAS_F + i, { name:farbAdj(f, 'es') + ' Glas', tex:'glas_' + f.key, hardness:.3, opaque:false, durchscheinend:true, drop:B.AIR,
      mc:f.mc + '_stained_glass' });
  });
  defBlock(B.KERAMIK, { name:'Keramik', tex:'keramik', hardness:1.25, tool:'pickaxe', tier:1, mc:'terracotta' });
  defBlock(B.TON, { name:'Ton', tex:'ton', hardness:.6, tool:'shovel', mc:'clay' });

  // Holzknopf: wie der aus Stein, bleibt aber anderthalb Sekunden gedrückt
  for(let a = 0; a < 5; a++) for(const an of [false, true])
    defBlock(knopfId(an, a, true), { name:'Holzknopf', tex:'planks', model:'box', box:knopfBox(a, an), solid:false, opaque:false,
      hardness:.5, tool:'axe', drop:B.HOLZKNOPF, item:!an && a === 0, icon:'i_holzknopf', rs:true });
  // Druckplatten aus Holz, Gold (leicht) und Eisen (schwer)
  for(const [b, name, tex, tool, icon] of [[B.PLATTE_HOLZ, 'Holzdruckplatte', 'planks', 'axe', 'i_platte_holz'],
      [B.PLATTE_GOLD, 'Leichte Wägeplatte', 'gold_block', 'pickaxe', 'i_platte_gold'], [B.PLATTE_EISEN, 'Schwere Wägeplatte', 'iron_block', 'pickaxe', 'i_platte_eisen']])
    for(const an of [false, true])
      defBlock(b + (an ? 1 : 0), { name, tex, model:'box', box: an ? [1,0,1,15,1,15] : [1,0,1,15,2,15], solid:false, opaque:false,
        hardness:.5, tool, drop:b, item:!an, icon, rs:true });
  // Beobachter: schaut mit dem Gesicht auf einen Block, gibt hinten einen Puls, wenn der sich ändert
  for(let r = 0; r < 6; r++) for(const an of [false, true])
    defBlock(beobId(r, an), { name:'Beobachter', tex:gerichteteFlaechen(r, 'beob_vorne', an ? 'beob_hinten_an' : 'beob_hinten', 'beob_seite', 'beob_oben', 'beob_oben'),
      hardness:3, tool:'pickaxe', tier:1, drop:beobId(4, false), item:r === 4 && !an, rs:true });
  // Tageslichtsensor: eine Platte, die bei Tag Strom gibt (umgekehrt bei Nacht)
  for(const um of [false, true]) for(const an of [false, true])
    defBlock(tagId(an, um), { name: um ? 'Tageslichtsensor (umgekehrt)' : 'Tageslichtsensor', tex:[um ? 'tag_oben_um' : 'tag_oben', 'tag_seite', 'tag_seite'],
      model:'box', box:[0,0,0,16,6,16], opaque:false, lichtStau:true, hardness:.2, tool:'axe', drop:B.TAGESSENSOR, item:!an && !um, rs:true });
  for(const an of [false, true])
    defBlock(B.ZIELBLOCK + (an ? 1 : 0), { name:'Zielblock', tex:['ziel_oben','ziel_oben','ziel_seite'], hardness:.5, tool:'hoe', drop:B.ZIELBLOCK, item:!an, rs:true });
  for(let t = 0; t < 25; t++)
    defBlock(B.NOTENBLOCK + t, { name:'Notenblock', tex:'notenblock', hardness:.8, tool:'axe', drop:B.NOTENBLOCK, item:t === 0, rs:true, ton:t });
  defBlock(B.TNT, { name:'TNT', tex:['tnt_oben','tnt_unten','tnt_seite'], hardness:0, rs:true });
  // Eisentür: nur Redstone macht sie auf
  for(let oben = 0; oben < 2; oben++) for(let offen = 0; offen < 2; offen++) for(let s = 0; s < 4; s++)
    defBlock(doorId(oben, offen, s, B.EISENTUER), { name:'Eisentür', tex: oben ? 'eisentuer_oben' : 'eisentuer_unten', model:'box', box:blattBox(s, 3),
      opaque:false, hardness:5, tool:'pickaxe', tier:1, drop:B.EISENTUER, item:!oben && !offen && s === 0, icon:'i_eisentuer', rs:true });
  // Falltüren aus Holz (mit der Hand) und Eisen (nur mit Redstone)
  for(const [b, name, tex, h, tool] of [[B.FALLTUER, 'Holzfalltür', 'falltuer', 3, 'axe'], [B.EISENFALLTUER, 'Eisenfalltür', 'eisenfalltuer', 5, 'pickaxe']])
    for(let k = 0; k < 16; k++){
      const s = k & 3, offen = (k & 4) !== 0, oben = (k & 8) !== 0;
      defBlock(b + k, { name, tex, model:'box', box:falltuerBox(s, offen, oben), opaque:false, hardness:h, tool, tier: tool === 'pickaxe' ? 1 : 0,
        drop:b, item:k === 0, icon:tex, rs:true });
    }
  // Spender (schießt, gießt, zündet) und Werfer (wirft nur aus)
  for(const [b, name, vorne] of [[B.SPENDER, 'Spender', 'spender'], [B.WERFER, 'Werfer', 'werfer']])
    for(let r = 0; r < 6; r++) for(const aus of [false, true])
      defBlock(auswurfId(b, r, aus), { name, tex:gerichteteFlaechen(r, r < 2 ? vorne + '_vorne_hoch' : vorne + '_vorne', 'furn_top', 'furn_side', 'furn_top', 'furn_top'),
        hardness:3.5, tool:'pickaxe', tier:1, drop:auswurfId(b, 4, false), item:r === 4 && !aus, rs:true });
  // Trichter: zieht Dinge von oben herein und gibt sie weiter, wohin sein Rohr zeigt
  for(let r = 0; r < 5; r++)
    defBlock(B.TRICHTER + r, { name:'Trichter', tex:['trichter_oben','trichter_aussen','trichter_aussen'], model:'trichter', opaque:false,
      hardness:3, tool:'pickaxe', tier:1, drop:B.TRICHTER, item:r === 0, icon:'i_trichter', rs:true });
  // Komparator: flach wie der Verstärker; vorn eine Fackel, hinten zwei
  for(let k = 0; k < 16; k++)
    defBlock(B.KOMPARATOR + k, { name:'Redstone-Komparator', tex:['rs_komparator','stone','stone'], model:'komparator', solid:false, opaque:false,
      hardness:0, drop:B.KOMPARATOR, item:k === 0, icon:'i_komparator', rs:true });
  for(let k = 0; k < 4; k++)
    defBlock(B.KUPFERLEUCHTE + k, { name:'Kupferleuchte', tex: k & 1 ? 'kupferleuchte_an' : 'kupferleuchte', light: k & 1 ? 15 : 0,
      hardness:3, tool:'pickaxe', tier:1, drop:B.KUPFERLEUCHTE, item:k === 0, rs:true });
  // Schleim- und Honigblock: durchscheinend; Kolben nehmen mit, was an ihnen klebt
  defBlock(B.SCHLEIMBLOCK, { name:'Schleimblock', tex:'schleimblock', opaque:false, durchscheinend:true, hardness:0, mc:'slime_block' });
  defBlock(B.HONIGBLOCK, { name:'Honigblock', tex:['honig_oben','honig_unten','honig_seite'], opaque:false, durchscheinend:true, hardness:0, mc:'honey_block' });
  for(const an of [false, true])
    defBlock(B.SKULK + (an ? 1 : 0), { name:'Skulk-Sensor', tex:['skulk_oben','skulk_unten','skulk_seite'], model:'box', box:[0,0,0,16,8,16], opaque:false,
      lichtStau:true, light:1, hardness:1.5, tool:'hoe', drop:B.SKULK, item:!an, rs:true });
  for(const an of [false, true])
    defBlock(B.FALLENTRUHE + (an ? 1 : 0), { name:'Redstone-Truhe', tex:['fallentruhe_oben','fallentruhe_oben','fallentruhe_seite'], dirFront:'fallentruhe_vorne',
      hardness:2.5, tool:'axe', drop:B.FALLENTRUHE, item:!an, rs:true });
}

/* ── Gegenstände (ID ≥ 256) ────────────────────────────────────────── */
const ITEM0 = 256;
const items = {};   // id → def
const ITEM = {};    // key → id
let nextItem = ITEM0;
function defItem(key, o){
  const id = nextItem++;
  items[id] = Object.assign({ id, key, name:key, tex:'i_'+key, stack:64,
    tool:null, tier:0, speed:1, dmg:1, tempo:4, dur:0, food:0, heal:0, fuel:0, armor:null }, o);
  ITEM[key] = id; return id;
}
const WERKZEUGART = { pickaxe:['Spitzhacke',2], axe:['Axt',3], shovel:['Schaufel',1], sword:['Schwert',4], hoe:['Hacke',0] };
/* Schaden und Schlagtempo (Schläge je Sekunde) wie beim Vorbild seit der
   Kampf-Überarbeitung: Schwerter schnell, Äxte langsam und hart. Was hier
   nicht steht (Hand, Blöcke, andere Dinge): 1 Schaden, Tempo 4. */
const KAMPF = {
  sword:   { wood:[4, 1.6], gold:[4, 1.6], stone:[5, 1.6], iron:[6, 1.6], diamond:[7, 1.6] },
  axe:     { wood:[7, 0.8], gold:[7, 1.0], stone:[9, 0.8], iron:[9, 0.9], diamond:[9, 1.0] },
  pickaxe: { wood:[2, 1.2], gold:[2, 1.2], stone:[3, 1.2], iron:[4, 1.2], diamond:[5, 1.2] },
  shovel:  { wood:[2.5, 1], gold:[2.5, 1], stone:[3.5, 1], iron:[4.5, 1], diamond:[5.5, 1] },
  hoe:     { wood:[1, 1],   gold:[1, 1],   stone:[1, 2],   iron:[1, 3],   diamond:[1, 4] },
};
function defTool(mk, mn, kk, tier, mult, dur, fuel){
  const [kn] = WERKZEUGART[kk], [dmg, tempo] = KAMPF[kk][mk];
  defItem(mk + '_' + kk, { name: mn + kn.toLowerCase(), stack:1, tool:kk, tier, speed:1 + mult*1.6, dmg, tempo, dur, fuel });
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

  // Hühner
  defItem('chicken_raw',{name:'Rohes Hähnchen', food:2});
  defItem('chicken_cooked',{name:'Gebratenes Hähnchen', food:6});
  defItem('feather',{name:'Feder'});
  defItem('egg',{name:'Ei', stack:16});
  // für den Plattenspieler
  defItem('platte',{name:'Schallplatte', stack:1});
  // Redstone: gesetzt wird daraus eine Leitung
  defItem('redstone',{name:'Redstone', tex:'i_redstone'});
  // Schleime lassen ihn fallen
  defItem('slimeball',{name:'Schleimball', tex:'i_schleimball'});
  // Dorfbewohner tauschen dafür
  defItem('emerald',{name:'Smaragd', tex:'i_smaragd'});
  defItem('lapis',{name:'Lapislazuli', tex:'i_lapis'});
  // zündet ein Netherportal in einem Obsidianrahmen (welt: portale)
  defItem('feuerzeug',{name:'Feuerzeug', tex:'i_feuerzeug', stack:1, dur:64});
  // von der Lohe: Rute (brennt lange, für den Braustand) und Staub daraus
  defItem('lohenrute',{name:'Lohenrute', tex:'i_lohenrute', fuel:2400});
  defItem('lohenstaub',{name:'Lohenstaub', tex:'i_lohenstaub'});
  // vom Enderman: geworfen bringt sie einen dorthin, wo sie aufschlägt
  defItem('enderperle',{name:'Enderperle', tex:'i_enderperle', stack:16});
  // Netherrack im Ofen gebrannt; vier ergeben einen Block Netherziegel
  defItem('netherziegel',{name:'Netherziegelstein', tex:'i_netherziegel'});
  // Lohenstaub und Enderperle: zeigt einmal den Weg zum Ende
  defItem('enderauge',{name:'Enderauge', tex:'i_enderauge'});

  // 26.11 — nur hinten anhängen: die Nummern stehen in den Spielständen
  defItem('lava_bucket',{name:'Lavaeimer', stack:1, fuel:16000});
  FARBEN.forEach(f => defItem('farbe_' + f.key, { name:farbAdj(f, 'er') + ' Farbstoff', tex:'i_farbe_' + f.key }));
  defItem('schwarzpulver',{name:'Schwarzpulver', tex:'i_schwarzpulver'});
  defItem('windrute',{name:'Windrute', tex:'i_windrute'});
  defItem('schwerer_kern',{name:'Schwerer Kern', tex:'i_schwerer_kern'});
  // Streitkolben: langsam, aber aus dem Fall ein Schlag, der mit jedem Block Fallhöhe härter wird
  defItem('streitkolben',{name:'Streitkolben', tex:'i_streitkolben', stack:1, dmg:6, tempo:0.6, dur:500, tool:'streitkolben'});
  defItem('windkugel',{name:'Windkugel', tex:'i_windkugel'});
  // Speere: ein Stich reicht weiter als ein Schwert; gehalten ein Sturmangriff, je schneller, desto härter
  for(const [mk, mn, dmg, tempo, dur] of [['wood','Holz',2,1.5,59], ['stone','Stein',3,1.35,131], ['iron','Eisen',4,1.1,250],
      ['gold','Gold',2,1.25,32], ['diamond','Diamant',5,1,1561]])
    defItem(mk + '_speer', { name: mn + 'speer', tex:'i_' + mk + '_speer', stack:1, dmg, tempo, dur, tool:'speer' });
  // Wurfscheiben: fliegen durch alle Gegner hindurch, prallen an Wänden ab und kommen zurück
  for(const [mk, mn, dmg, dur] of [['iron','Eisen',5,250], ['gold','Gold',4,60], ['diamond','Diamant',7,1561]])
    defItem(mk + '_scheibe', { name: mn + 'wurfscheibe', tex:'i_' + mk + '_scheibe', stack:1, dmg:2, scheibe:dmg, dur, tool:'scheibe' });
}

/* ── Hilfen für Slot-Inhalte ───────────────────────────────────────── */
const isBlockId = id => id > 0 && (id < ITEM0 || (id >= BLOCK2 && id < BMAX));
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
  if(isTreppe(id)) return isoTreppeURL(b.faces[2], b.faces[4]);
  if(isStufe(id)) return isoStufeURL(b.faces[2], b.faces[4], b.faces[0]);
  if(isBett(id)) return isoBettURL(b.faces[2], b.faces[4]);
  return isoIconURL(b.faces[2], b.dirFront || b.faces[4], b.faces[0]);
}
