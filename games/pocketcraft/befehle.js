/* Pocketcraft · Befehle
   Was im Chat mit / beginnt, ist ein Befehl — mit den Namen des Vorbilds
   (/gamemode, /give, /tp, /time, /weather, /summon, …) und deutschen
   Zweitnamen (/spielmodus, /gib, /zeit, /wetter, …). Gegenstände, Blöcke
   und Wesen heißen wie im Spiel (/give diamant 64) oder wie beim Vorbild
   (/give minecraft:diamond 64). Ziele: ein Spielername oder @s/@p (man
   selbst), @a (alle), @r (irgendwer), bei /kill auch @e (alle Wesen).
   Koordinaten dürfen mit ~ relativ sein (/tp ~ ~10 ~).

   Ausgeführt wird beim Host: Er ändert die Welt und schickt, was einen
   Mitspieler selbst betrifft (Gegenstände, Spielmodus, Ort), an dessen
   Gerät. Wer allein spielt, ist sein eigener Host. Der Host darf alles;
   Mitspieler dürfen reden (/me, /msg, /list, /seed, /hilfe), bis der Host
   sie mit /op zum Operator macht. */
'use strict';

const FUELLEN_MAX = 32768;             // Blöcke je /fill, wie beim Vorbild
const MC_TAG = 24000;                  // ein Tag des Vorbilds in Ticks
const GEBEN_MAX = 36*64;               // mehr passt nicht ins Inventar
const REGELN_START = { doDaylightCycle: true, doWeatherCycle: true, doMobSpawning: true };
const REGEL_TEXT = { doDaylightCycle: 'die Tageszeit läuft', doWeatherCycle: 'das Wetter wechselt', doMobSpawning: 'Wesen erscheinen von selbst' };

/** Namen des Vorbilds, die hier anders heißen: → Schlüssel in B (groß) oder ITEM (klein) */
const MC_NAMEN = {
  air:'AIR', cobblestone:'COBBLE', oak_planks:'PLANKS', oak_log:'LOG', oak_leaves:'LEAVES', spruce_log:'FICHTENSTAMM',
  spruce_leaves:'FICHTENNADELN', grass_block:'GRASS', crafting_table:'TABLE', stone_bricks:'STONEBRICK', snow_block:'SNOW',
  snow:'SCHNEEDECKE', oak_door:'DOOR', white_wool:'WOOL', wool:'WOOL', poppy:'ROSE', dandelion:'DANDELION', water:'WATER',
  iron_block:'IRON_BLOCK', gold_block:'GOLD_BLOCK', diamond_block:'DIAMOND_BLOCK', coal_ore:'COAL_ORE', iron_ore:'IRON_ORE',
  gold_ore:'GOLD_ORE', diamond_ore:'DIAMOND_ORE', jukebox:'JUKEBOX', ladder:'LADDER', chest:'CHEST', furnace:'FURNACE',
  iron_ingot:'iron', gold_ingot:'gold', porkchop:'pork_raw', cooked_porkchop:'pork_cook', beef:'beef_raw', cooked_beef:'beef_cooked',
  mutton:'mutton_raw', cooked_mutton:'mutton_cooked', chicken:'chicken_raw', cooked_chicken:'chicken_cooked', wheat_seeds:'seeds',
  music_disc:'platte', music_disc_13:'platte', wooden_pickaxe:'wood_pickaxe', wooden_axe:'wood_axe', wooden_shovel:'wood_shovel',
  wooden_sword:'wood_sword', wooden_hoe:'wood_hoe', golden_pickaxe:'gold_pickaxe', golden_axe:'gold_axe', golden_shovel:'gold_shovel',
  golden_sword:'gold_sword', golden_hoe:'gold_hoe', golden_helmet:'gold_helmet', golden_chestplate:'gold_chestplate',
  golden_leggings:'gold_leggings', golden_boots:'gold_boots', leather_tunic:'leather_chestplate', leather_cap:'leather_helmet',
  leather_pants:'leather_leggings',
};
const WESEN_NAMEN = { kuh:'cow', cow:'cow', schwein:'pig', pig:'pig', schaf:'sheep', sheep:'sheep', huhn:'chicken', chicken:'chicken',
  zombie:'zombie', skelett:'skeleton', skeleton:'skeleton' };
const MODI = { ueberleben:false, survival:false, s:false, '0':false, kreativ:true, creative:true, c:true, '1':true };
const TAGESZEITEN = { day:1000, tag:1000, noon:6000, mittag:6000, sunset:12000, abend:12000, night:13000, nacht:13000,
  midnight:18000, mitternacht:18000, sunrise:23000, morgen:23000 };

/** klein, ohne »minecraft:«, Umlaute ausgeschrieben, Leerzeichen als _ */
function bNorm(s){
  return String(s || '').toLowerCase().replace(/^minecraft:/, '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').replace(/[\s-]+/g, '_');
}
/** Spielernamen vergleichen: ohne Leerzeichen und _, groß wie klein */
const nameGleich = (a, b) => String(a).toLowerCase().replace(/[\s_]+/g, '') === String(b).toLowerCase().replace(/[\s_]+/g, '');
const alsWort = name => String(name).replace(/\s+/g, '_');

let _dinge = null, _dingNamen = null, _blockNamen = null, _alleDinge = null;
/** Namen → Nummer für alles, was man haben kann (und Luft und Wasser für /setblock) */
function dingeIndex(){
  if(_dinge) return _dinge;
  _dinge = new Map(); _dingNamen = []; _blockNamen = [];
  _alleDinge = new Set(katalog());
  const neu = (k, id, zeigen) => {
    if(!k || _dinge.has(k)) return;
    _dinge.set(k, id);
    if(zeigen){ _dingNamen.push(k); if(id < ITEM0) _blockNamen.push(k); }
  };
  for(const id of katalog()) neu(bNorm(nameOf(id)), id, true);
  neu('luft', B.AIR, false); neu('wasser', B.WATER, false);
  _blockNamen.push('luft', 'wasser');
  // Schlüssel aus dem Programm: Gegenstände zuerst (ITEM.wheat ist Weizen, B.WHEAT das Feld)
  for(const [k, v] of Object.entries(ITEM)) neu(bNorm(k), v, false);
  for(const [k, v] of Object.entries(B)) if(blocks[v] && blocks[v].item !== false) neu(bNorm(k), v, false);
  for(const [k, v] of Object.entries(MC_NAMEN)){ const id = B[v] !== undefined ? B[v] : ITEM[v]; if(id !== undefined) neu(k, id, false); }
  return _dinge;
}
function dingNummer(s){ const id = dingeIndex().get(bNorm(s)); return id === undefined ? null : id; }

/* ── Die Befehle ───────────────────────────────────────────────────── */
const BEFEHLE = {}, BEFEHL_LISTE = [];
/** d: syntax, text, alias, frei (auch ohne Operator), host (nur der Host),
    vorschlag(i, vorher) → Vorschläge für das i-te Wort, lauf(args, wer) */
function befehl(name, d){
  d.name = name; BEFEHLE[name] = d; BEFEHL_LISTE.push(d);
  for(const a of d.alias || []) BEFEHLE[bNorm(a)] = d;
}
/* Vorschläge */
const V_SPIELER = () => ['@s', '@a', '@p', '@r'].concat(Befehle.spielerNamen().map(alsWort));
const V_DING = () => { dingeIndex(); return _dingNamen; };
const V_BLOCK = () => { dingeIndex(); return _blockNamen; };
const V_KOORD = (achse) => {
  const t = Game.player ? Game.targetBlock() : null;
  return t ? ['~', String([t.x, t.y, t.z][achse])] : ['~'];
};
const V_ANZAHL = () => ['1', '16', '32', '64'];

befehl('hilfe', { alias:['help', '?'], syntax:'[befehl]', text:'zeigt alle Befehle oder erklärt einen', frei:true,
  vorschlag: () => BEFEHL_LISTE.filter(d => Befehle.darf(d, Befehle.ichSelbst())).map(d => d.name),
  lauf(a, wer){
    if(a[0]){
      const d = BEFEHLE[bNorm(a[0]).replace(/^\//, '')];
      if(!d) return Befehle.fehler(wer, 'Unbekannter Befehl: ' + a[0]);
      Befehle.antwort(wer, '/' + d.name + (d.syntax ? ' ' + d.syntax : '') + ' — ' + d.text +
        (d.alias && d.alias.length ? ' (auch /' + d.alias.filter(x => x !== '?').join(', /') + ')' : ''));
      return;
    }
    const l = BEFEHL_LISTE.filter(d => Befehle.darf(d, wer)).map(d => '/' + d.name);
    Befehle.antwort(wer, 'Befehle: ' + l.join(', '));
    Befehle.antwort(wer, 'Mehr zu einem: /hilfe <befehl> · Tab ergänzt beim Schreiben');
  } });

befehl('me', { syntax:'<text>', text:'erzählt, was du tust', frei:true,
  lauf(a, wer){ if(!a.length) return Befehle.fehler(wer, 'Was tust du? /me <text>'); Chat.verteilen({ art:'me', text:'* ' + wer.name + ' ' + a.join(' ') }); } });

befehl('say', { alias:['sagen'], syntax:'<text>', text:'sagt etwas an alle, hervorgehoben',
  lauf(a, wer){ if(!a.length) return Befehle.fehler(wer, 'Was willst du sagen? /say <text>'); Chat.verteilen({ text:'[' + wer.name + '] ' + a.join(' ') }); } });

befehl('msg', { alias:['tell', 'w', 'flüstern'], syntax:'<spieler> <text>', text:'flüstert einem Spieler etwas zu', frei:true,
  vorschlag: i => i === 0 ? Befehle.spielerNamen().map(alsWort) : [],
  lauf(a, wer){
    const z = Befehle.ziele(a[0], wer);
    if(!z || z.length !== 1) return Befehle.fehler(wer, 'Spieler nicht gefunden: ' + (a[0] || ''));
    const text = a.slice(1).join(' ');
    if(!text) return Befehle.fehler(wer, 'Was willst du sagen? /msg <spieler> <text>');
    Befehle.antwort(z[0], wer.name + ' flüstert dir zu: ' + text, 'privat');
    if(z[0] !== wer) Befehle.antwort(wer, 'Du flüsterst ' + z[0].name + ' zu: ' + text, 'privat');
  } });

befehl('list', { alias:['liste', 'spieler'], syntax:'', text:'wer gerade in der Welt ist', frei:true,
  lauf(a, wer){
    const l = Befehle.spielerNamen();
    Befehle.antwort(wer, 'Es ' + (l.length === 1 ? 'ist 1' : 'sind ' + l.length) + ' von ' + NETZ_MAX + ' Spielern da: ' + l.join(', '));
  } });

befehl('seed', { alias:['startwert'], syntax:'', text:'zeigt den Startwert der Welt', frei:true,
  lauf(a, wer){ Befehle.antwort(wer, 'Startwert: ' + Game.world.seedStr); } });

befehl('gamemode', { alias:['spielmodus', 'gm'], syntax:'<überleben | kreativ> [spieler]', text:'wechselt den Spielmodus',
  vorschlag: i => i === 0 ? ['kreativ', 'überleben', 'creative', 'survival'] : i === 1 ? V_SPIELER() : [],
  lauf(a, wer){
    const m = bNorm(a[0]);
    if(!(m in MODI)){
      if(['adventure', 'abenteuer', 'spectator', 'zuschauer', '2', '3'].includes(m)) return Befehle.fehler(wer, 'Den Modus gibt es in Pocketcraft nicht — nur Überleben und Kreativ');
      return Befehle.fehler(wer, 'Welcher Modus? /gamemode <überleben|kreativ> [spieler]');
    }
    const z = a[1] ? Befehle.ziele(a[1], wer) : [wer];
    if(!z) return Befehle.fehler(wer, 'Spieler nicht gefunden: ' + a[1]);
    const name = MODI[m] ? 'Kreativ' : 'Überleben';
    for(const s of z){
      Befehle.an(s, 'modus', { kreativ: MODI[m] });
      Befehle.antwort(s, 'Dein Spielmodus ist jetzt ' + name);
      if(s !== wer) Befehle.antwort(wer, 'Spielmodus von ' + s.name + ' ist jetzt ' + name);
    }
  } });

befehl('time', { alias:['zeit'], syntax:'set <tag | mittag | nacht | mitternacht | zahl> · add <zahl> · query <daytime | day>', text:'stellt die Tageszeit (ein Tag hat 24000)',
  vorschlag: (i, v) => i === 0 ? ['set', 'add', 'query'] : i === 1 && bNorm(v[0]) === 'set' ? Object.keys(TAGESZEITEN)
                      : i === 1 && bNorm(v[0]) === 'query' ? ['daytime', 'day', 'gametime'] : i === 1 ? ['1000', '6000', '12000'] : [],
  lauf(a, wer){
    const was = bNorm(a[0]), jetzt = () => Math.floor(Game.time/DAY_LEN*MC_TAG);
    if(was === 'query'){
      const q = bNorm(a[1] || 'daytime');
      if(q === 'day') return Befehle.antwort(wer, 'Tag ' + (Math.floor(Game.gesamtZeit/DAY_LEN) + 1));
      if(q === 'gametime') return Befehle.antwort(wer, 'Spielzeit: ' + Math.floor(Game.gesamtZeit/DAY_LEN*MC_TAG));
      return Befehle.antwort(wer, 'Tageszeit: ' + jetzt());
    }
    if(was !== 'set' && was !== 'add') return Befehle.fehler(wer, 'So geht es: /time set tag · /time add 1000 · /time query daytime');
    const w = bNorm(a[1]);
    const n = was === 'set' && w in TAGESZEITEN ? TAGESZEITEN[w] : Befehle.zahl(a[1], 't');
    if(n === null) return Befehle.fehler(wer, 'Keine Zeit: ' + (a[1] || '') + ' — eine Zahl oder tag, mittag, nacht, mitternacht');
    const ticks = was === 'set' ? n : jetzt() + n;
    Game.time = ((ticks % MC_TAG + MC_TAG) % MC_TAG)/MC_TAG*DAY_LEN;
    if(Netz.istHost) Netz.zeitSenden();
    Befehle.antwort(wer, 'Zeit ' + (was === 'set' ? 'auf ' : 'weiter auf ') + jetzt() + ' gestellt');
  } });

befehl('weather', { alias:['wetter'], syntax:'<klar | regen> [dauer in s]', text:'lässt es regnen oder aufklaren',
  vorschlag: i => i === 0 ? ['klar', 'regen', 'clear', 'rain'] : i === 1 ? ['60', '300', '600'] : [],
  lauf(a, wer){
    const w = bNorm(a[0]);
    const regen = ['rain', 'regen', 'thunder', 'gewitter', 'schnee'].includes(w);
    if(!regen && !['clear', 'klar', 'sonne', 'sun'].includes(w)) return Befehle.fehler(wer, 'Welches Wetter? /weather <klar|regen> [dauer]');
    const dauer = a[1] !== undefined ? Befehle.zahl(a[1], 's') : null;
    if(a[1] !== undefined && !(dauer > 0)) return Befehle.fehler(wer, 'Keine Dauer: ' + a[1]);
    Wetter.regen = regen;
    Wetter.rest = dauer ? dauer : wZufall(regen ? WETTER_REGEN : WETTER_KLAR);
    Wetter.senden();
    Befehle.antwort(wer, (regen ? 'Es regnet jetzt' : 'Das Wetter ist jetzt klar') + (w === 'thunder' || w === 'gewitter' ? ' — Gewitter gibt es noch nicht' : ''));
  } });

befehl('tp', { alias:['teleport'], syntax:'<x y z> · <spieler> · <wer> <x y z> · <wer> <spieler>', text:'bringt Spieler woanders hin',
  vorschlag: (i, v) => {
    const erstesZiel = v.length && !/^[~\d.-]/.test(v[0]);
    if(i === 0) return V_SPIELER().concat(V_KOORD(0));
    if(erstesZiel) return i === 1 ? Befehle.spielerNamen().map(alsWort).concat(V_KOORD(0)) : i <= 3 ? V_KOORD(i - 1) : [];
    return i <= 2 ? V_KOORD(i) : [];
  },
  lauf(a, wer){
    let wen = [wer], ziel = null, text = '';
    const nachSpieler = arg => {
      const z = Befehle.ziele(arg, wer);
      if(!z || z.length !== 1) return null;
      text = z[0].name; return [z[0].x, z[0].y, z[0].z];
    };
    if(a.length === 1) ziel = nachSpieler(a[0]);
    else if(a.length === 3) ziel = Befehle.koord(a, 0, wer, false);
    else if(a.length === 2 || a.length === 4){
      wen = Befehle.ziele(a[0], wer);
      if(!wen) return Befehle.fehler(wer, 'Spieler nicht gefunden: ' + a[0]);
      ziel = a.length === 2 ? nachSpieler(a[1]) : Befehle.koord(a, 1, wer, false);
    } else return Befehle.fehler(wer, 'So geht es: /tp <x y z> · /tp <spieler> · /tp <wer> <x y z>');
    if(!ziel) return Befehle.fehler(wer, a.length === 1 || a.length === 2 ? 'Spieler nicht gefunden: ' + a[a.length - 1] : 'Keine Koordinaten: ' + a.join(' '));
    const [x, y, z] = ziel;
    if(!text) text = x.toFixed(1) + ', ' + y.toFixed(1) + ', ' + z.toFixed(1);
    for(const s of wen){
      Befehle.an(s, 'tp', { x, y, z });
      Befehle.antwort(wer, (s === wer ? 'Du bist' : s.name + ' ist') + ' jetzt bei ' + text);
    }
  } });

befehl('give', { alias:['gib'], syntax:'[spieler] <gegenstand> [anzahl]', text:'gibt Gegenstände',
  vorschlag: (i, v) => {
    const mitZiel = v.length && Befehle.istZiel(v[0]);
    if(i === 0) return V_DING().concat(V_SPIELER());
    if(mitZiel) return i === 1 ? V_DING() : i === 2 ? V_ANZAHL() : [];
    return i === 1 ? V_ANZAHL() : [];
  },
  lauf(a, wer){
    let wen = [wer];
    if(a.length && Befehle.istZiel(a[0]) && !(a.length === 1 || (a.length === 2 && /^\d+$/.test(a[1]) && dingNummer(a[0]) !== null))){
      wen = Befehle.ziele(a[0], wer); a = a.slice(1);
    }
    const id = dingNummer(a[0]);
    if(id === null) return Befehle.fehler(wer, a[0] ? 'Unbekannter Gegenstand: ' + a[0] : 'Was denn? /give [spieler] <gegenstand> [anzahl]');
    if(!_alleDinge.has(id)) return Befehle.fehler(wer, nameOf(id) + ' gibt es nicht als Gegenstand');
    const n = a[1] !== undefined ? Befehle.zahl(a[1]) : 1;
    if(!(n >= 1)) return Befehle.fehler(wer, 'Keine Anzahl: ' + a[1]);
    const anzahl = Math.min(GEBEN_MAX, Math.floor(n));
    for(const s of wen){
      Befehle.an(s, 'gib', { id, n: anzahl });
      Befehle.antwort(wer, anzahl + ' × ' + nameOf(id) + ' an ' + (s === wer ? 'dich' : s.name) + ' gegeben');
    }
  } });

befehl('kill', { alias:['töten'], syntax:'[spieler | @e]', text:'tötet Spieler, mit @e alle Wesen',
  vorschlag: i => i === 0 ? ['@e'].concat(V_SPIELER()) : [],
  lauf(a, wer){
    if(bNorm(a[0]) === '@e'){
      let n = 0;
      for(const m of Game.mobs) if(!m.dead){ m.dead = true; m.health = 0; n++; }
      return Befehle.antwort(wer, n === 1 ? '1 Wesen beseitigt' : n + ' Wesen beseitigt');
    }
    const wen = a[0] ? Befehle.ziele(a[0], wer) : [wer];
    if(!wen) return Befehle.fehler(wer, 'Spieler nicht gefunden: ' + a[0]);
    for(const s of wen){ Befehle.an(s, 'toeten'); if(s !== wer) Befehle.antwort(wer, s.name + ' getötet'); }
  } });

befehl('clear', { alias:['leeren'], syntax:'[spieler]', text:'leert das Inventar',
  vorschlag: i => i === 0 ? V_SPIELER() : [],
  lauf(a, wer){
    const wen = a[0] ? Befehle.ziele(a[0], wer) : [wer];
    if(!wen) return Befehle.fehler(wer, 'Spieler nicht gefunden: ' + a[0]);
    for(const s of wen){ Befehle.an(s, 'leeren'); Befehle.antwort(wer, 'Inventar von ' + (s === wer ? 'dir' : s.name) + ' geleert'); }
  } });

befehl('summon', { alias:['beschwören'], syntax:'<wesen> [x y z]', text:'lässt ein Wesen erscheinen',
  vorschlag: i => i === 0 ? ['kuh', 'schwein', 'schaf', 'huhn', 'zombie', 'skelett'] : i <= 3 ? V_KOORD(i - 1) : [],
  lauf(a, wer){
    const art = WESEN_NAMEN[bNorm(a[0])];
    if(!art) return Befehle.fehler(wer, a[0] ? 'Unbekanntes Wesen: ' + a[0] + ' — kuh, schwein, schaf, huhn, zombie, skelett' : 'Welches Wesen? /summon <wesen> [x y z]');
    const ort = a.length >= 4 ? Befehle.koord(a, 1, wer, false) : [wer.x, wer.y, wer.z];
    if(!ort) return Befehle.fehler(wer, 'Keine Koordinaten: ' + a.slice(1).join(' '));
    const m = new Mob(art, ort[0], ort[1], ort[2], false);
    if(!m.def.hostile) m.bleibt = true;          // wie gezüchtete Tiere: sie bleiben
    Game.mobs.push(m);
    Befehle.antwort(wer, m.def.name + ' ist erschienen');
  } });

befehl('spawnpoint', { alias:['startpunkt'], syntax:'[spieler] [x y z]', text:'setzt den Startpunkt, an dem man wieder aufwacht',
  vorschlag: (i, v) => i === 0 ? V_SPIELER().concat(V_KOORD(0)) : [],
  lauf(a, wer){
    let wen = [wer];
    if(a.length && !/^[~\d.-]/.test(a[0])){ wen = Befehle.ziele(a[0], wer); if(!wen) return Befehle.fehler(wer, 'Spieler nicht gefunden: ' + a[0]); a = a.slice(1); }
    for(const s of wen){
      const ort = a.length >= 3 ? Befehle.koord(a, 0, s, false) : [s.x, s.y, s.z];
      if(!ort) return Befehle.fehler(wer, 'Keine Koordinaten: ' + a.join(' '));
      Befehle.an(s, 'startpunkt', { x: ort[0], y: ort[1], z: ort[2] });
      Befehle.antwort(wer, 'Startpunkt von ' + (s === wer ? 'dir' : s.name) + ': ' + ort.map(v => Math.floor(v)).join(', '));
    }
  } });

befehl('gamerule', { alias:['spielregel'], syntax:'[regel] [true | false]', text:'Spielregeln: ' + Object.keys(REGELN_START).join(', '),
  vorschlag: i => i === 0 ? Object.keys(REGELN_START) : i === 1 ? ['true', 'false'] : [],
  lauf(a, wer){
    if(!a.length){
      for(const k of Object.keys(REGELN_START)) Befehle.antwort(wer, k + ' = ' + Game.regeln[k] + ' (' + REGEL_TEXT[k] + ')');
      return;
    }
    const k = Object.keys(REGELN_START).find(r => r.toLowerCase() === String(a[0]).toLowerCase());
    if(!k) return Befehle.fehler(wer, 'Unbekannte Spielregel: ' + a[0] + ' — ' + Object.keys(REGELN_START).join(', '));
    if(a[1] === undefined) return Befehle.antwort(wer, k + ' = ' + Game.regeln[k]);
    const v = bNorm(a[1]), wert = ['true', 'an', 'ja', '1'].includes(v) ? true : ['false', 'aus', 'nein', '0'].includes(v) ? false : null;
    if(wert === null) return Befehle.fehler(wer, 'true oder false?');
    Game.regeln[k] = wert;
    if(Netz.istHost && Netz.hatGaeste()) Netz.anAlle({ t:'regeln', r: Game.regeln });
    Befehle.antwort(wer, k + ' ist jetzt ' + wert);
  } });

befehl('setblock', { alias:['block'], syntax:'<x y z> <block>', text:'setzt einen Block',
  vorschlag: i => i <= 2 ? V_KOORD(i) : i === 3 ? V_BLOCK() : [],
  lauf(a, wer){
    const p = Befehle.koord(a, 0, wer, true), id = dingNummer(a[3]);
    if(!p) return Befehle.fehler(wer, 'So geht es: /setblock <x y z> <block>');
    if(id === null || id >= ITEM0) return Befehle.fehler(wer, a[3] ? 'Das ist kein Block: ' + a[3] : 'Welcher Block?');
    if(!Befehle.setzbar(id)) return Befehle.fehler(wer, nameOf(id) + ' geht mit /setblock nicht');
    if(p[1] < 1 || p[1] >= WH) return Befehle.fehler(wer, 'Zu hoch oder zu tief: y geht von 1 bis ' + (WH - 1));
    Befehle.setzen(p[0], p[1], p[2], id);
    Befehle.antwort(wer, 'Block bei ' + p.join(', ') + ' gesetzt');
  } });

befehl('fill', { alias:['füllen'], syntax:'<x1 y1 z1> <x2 y2 z2> <block> [hollow | outline | keep]', text:'füllt einen Quader mit Blöcken',
  vorschlag: i => i <= 5 ? V_KOORD(i % 3) : i === 6 ? V_BLOCK() : i === 7 ? ['hollow', 'outline', 'keep', 'replace'] : [],
  lauf(a, wer){
    const p1 = Befehle.koord(a, 0, wer, true), p2 = Befehle.koord(a, 3, wer, true), id = dingNummer(a[6]);
    if(!p1 || !p2) return Befehle.fehler(wer, 'So geht es: /fill <x1 y1 z1> <x2 y2 z2> <block>');
    if(id === null || id >= ITEM0) return Befehle.fehler(wer, a[6] ? 'Das ist kein Block: ' + a[6] : 'Welcher Block?');
    if(!Befehle.setzbar(id)) return Befehle.fehler(wer, nameOf(id) + ' geht mit /fill nicht');
    const modus = bNorm(a[7] || 'replace');
    if(!['replace', 'hollow', 'outline', 'keep', 'destroy'].includes(modus)) return Befehle.fehler(wer, 'Unbekannte Art: ' + a[7]);
    const [x0, x1] = [Math.min(p1[0], p2[0]), Math.max(p1[0], p2[0])];
    const [y0, y1] = [Math.max(1, Math.min(p1[1], p2[1])), Math.min(WH - 1, Math.max(p1[1], p2[1]))];
    const [z0, z1] = [Math.min(p1[2], p2[2]), Math.max(p1[2], p2[2])];
    const n = (x1 - x0 + 1)*(y1 - y0 + 1)*(z1 - z0 + 1);
    if(y1 < y0) return Befehle.fehler(wer, 'Zu hoch oder zu tief: y geht von 1 bis ' + (WH - 1));
    if(n > FUELLEN_MAX) return Befehle.fehler(wer, 'Zu viele Blöcke: ' + n + ' (höchstens ' + FUELLEN_MAX + ')');
    const w = Game.world;
    let gesetzt = 0;
    for(let y = y0; y <= y1; y++) for(let z = z0; z <= z1; z++) for(let x = x0; x <= x1; x++){
      const rand = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
      let soll = id;
      if(modus === 'hollow' && !rand) soll = B.AIR;
      if(modus === 'outline' && !rand) continue;
      if(modus === 'keep' && w.getBlock(x, y, z) !== B.AIR && Befehle.geladen(x, z)) continue;
      if(Befehle.setzen(x, y, z, soll)) gesetzt++;
    }
    Befehle.antwort(wer, gesetzt === 1 ? '1 Block gesetzt' : gesetzt + ' Blöcke gesetzt');
  } });

befehl('op', { syntax:'<spieler>', text:'erlaubt einem Mitspieler alle Befehle', host:true,
  vorschlag: i => i === 0 ? Befehle.gastNamen() : [],
  lauf(a, wer){
    const s = Befehle.gast(a[0]);
    if(!s) return Befehle.fehler(wer, Netz.istHost ? 'Mitspieler nicht gefunden: ' + (a[0] || '') : 'Hier ist niemand außer dir');
    Game.ops.add(s.id);
    Netz.senden(s.g.conn, { t:'op', an:true });
    Befehle.antwort(s, 'Du darfst jetzt alle Befehle benutzen');
    Befehle.antwort(wer, s.name + ' darf jetzt alle Befehle benutzen');
  } });

befehl('deop', { syntax:'<spieler>', text:'nimmt einem Mitspieler die Befehle wieder', host:true,
  vorschlag: i => i === 0 ? Befehle.gastNamen() : [],
  lauf(a, wer){
    const s = Befehle.gast(a[0]);
    if(!s) return Befehle.fehler(wer, Netz.istHost ? 'Mitspieler nicht gefunden: ' + (a[0] || '') : 'Hier ist niemand außer dir');
    Game.ops.delete(s.id);
    Netz.senden(s.g.conn, { t:'op', an:false });
    Befehle.antwort(s, 'Du darfst keine Befehle mehr benutzen, nur noch reden');
    Befehle.antwort(wer, s.name + ' darf keine Befehle mehr benutzen');
  } });

befehl('kick', { alias:['rauswerfen'], syntax:'<spieler> [grund]', text:'wirft einen Mitspieler aus der Welt', host:true,
  vorschlag: i => i === 0 ? Befehle.gastNamen() : [],
  lauf(a, wer){
    const s = Befehle.gast(a[0]);
    if(!s) return Befehle.fehler(wer, Netz.istHost ? 'Mitspieler nicht gefunden: ' + (a[0] || '') : 'Hier ist niemand außer dir');
    Netz.rauswerfen(s.g, a.slice(1).join(' ') || 'Der Host hat dich aus der Welt geworfen.');
    Befehle.antwort(wer, s.name + ' wurde rausgeworfen');
  } });

/* ── Ausführen ─────────────────────────────────────────────────────── */
const Befehle = {
  op: false,                      // Gast: darf ich alle Befehle? (sagt der Host)

  /** aus dem Chat: allein oder als Host gleich hier, als Gast beim Host */
  eingeben(text){
    const wort = bNorm(text.slice(1).split(' ')[0]);
    if(Netz.istGast && !(BEFEHLE[wort] && BEFEHLE[wort].name === 'hilfe')){ Netz.senden(Netz.hostConn, { t:'befehl', text }); return; }
    this.ausfuehren(text, this.ichSelbst());
  },
  /** Host: ein Mitspieler hat einen Befehl geschickt */
  vonGast(g, text){
    const s = this.alleSpieler().find(x => x.g === g);
    if(s) this.ausfuehren(text, s);
  },
  ausfuehren(text, wer){
    const teile = text.slice(1).trim().split(/\s+/).filter(Boolean);
    if(!teile.length) return this.fehler(wer, 'Ein Befehl fehlt — /hilfe zeigt alle');
    const d = BEFEHLE[bNorm(teile[0])];
    if(!d) return this.fehler(wer, 'Unbekannter Befehl: /' + teile[0] + ' — /hilfe zeigt alle');
    if(!this.darf(d, wer))
      return this.fehler(wer, d.host ? 'Das darf nur der Host' : 'Das darfst du nicht — der Host kann dich mit /op ' + alsWort(wer.name) + ' zum Operator machen');
    try{ d.lauf(teile.slice(1), wer); }
    catch(e){ this.fehler(wer, 'Das hat nicht geklappt: ' + (e && e.message || e)); }
  },
  darf(d, wer){
    if(d.host) return !!wer.ich && !Netz.istGast;
    return d.frei || !!wer.op;
  },

  /* — Spieler — */
  /** alle Spieler, wie der Host sie kennt; der erste ist man selbst */
  alleSpieler(){
    const p = Game.player;
    const l = [{ ich:true, g:null, id: Netz.ich.id, name: Netz.ich.name, x:p.x, y:p.y, z:p.z, op: !Netz.istGast || this.op }];
    if(Netz.istHost) for(const g of Netz.gaeste.values())
      if(g.bereit) l.push({ ich:false, g, id:g.id, name:g.name, x:g.x, y:g.y, z:g.z, op: Game.ops.has(g.id) });
    return l;
  },
  ichSelbst(){ return this.alleSpieler()[0]; },
  /** Namen für /list und die Vorschläge — beim Gast die, die er sieht */
  spielerNamen(){
    if(Netz.istGast) return [Netz.ich.name].concat([...Netz.andere.values()].map(s => s.name));
    return this.alleSpieler().map(s => s.name);
  },
  gastNamen(){ return Netz.istHost ? [...Netz.gaeste.values()].filter(g => g.bereit).map(g => alsWort(g.name)) : []; },
  gast(name){ return this.alleSpieler().find(s => !s.ich && nameGleich(s.name, name || '')) || null; },
  istZiel(arg){ return /^@[spar]$/i.test(arg || '') || this.alleSpieler().some(s => nameGleich(s.name, arg || '')); },
  /** @s/@p: man selbst · @a: alle · @r: irgendwer · sonst ein Name */
  ziele(arg, wer){
    const a = String(arg || '').toLowerCase(), l = this.alleSpieler();
    if(a === '@s' || a === '@p') return [wer];
    if(a === '@a') return l;
    if(a === '@r') return [l[(Math.random()*l.length) | 0]];
    const t = l.find(s => nameGleich(s.name, a));
    return t ? [t] : null;
  },

  /* — Zahlen und Orte — */
  /** eine Zahl; mit Einheit (s Sekunden, t Ticks, d Tage) umgerechnet in grund ('s' oder 't') */
  zahl(s, grund){
    const m = /^(-?\d+(?:\.\d+)?)([std]?)$/.exec(String(s || '').toLowerCase());
    if(!m) return null;
    let v = parseFloat(m[1]);
    const e = m[2] || grund || '';
    if(grund === 's'){ if(e === 't') v /= 20; else if(e === 'd') v *= DAY_LEN; }
    if(grund === 't'){ if(e === 's') v *= 20; else if(e === 'd') v *= MC_TAG; }
    return v;
  },
  /** drei Koordinaten ab a[i]; ~ ist relativ zu wer. block: ganze Blöcke;
      sonst landen ganze Zahlen wie beim Vorbild in der Blockmitte */
  koord(a, i, wer, block){
    if(a.length < i + 3) return null;
    const basis = [wer.x, wer.y, wer.z], r = [];
    for(let k = 0; k < 3; k++){
      const s = String(a[i + k]);
      let v;
      if(s.startsWith('~')){ const d = s.length > 1 ? parseFloat(s.slice(1)) : 0; if(!Number.isFinite(d)) return null; v = basis[k] + d; }
      else { v = parseFloat(s); if(!/^-?\d+(\.\d+)?$/.test(s)) return null; if(!block && k !== 1 && !s.includes('.')) v += 0.5; }
      r.push(block ? Math.floor(v) : v);
    }
    return r;
  },

  /* — Blöcke setzen (/setblock, /fill) — */
  setzbar(id){ return !isDoor(id) && id !== B.BED && id !== B.JUKEBOX_VOLL && (id === B.AIR || id === B.WATER || (blocks[id] && blocks[id].item !== false)); },
  geladen(x, z){ const c = Game.world.getChunk(x >> 4, z >> 4); return !!c && c.state >= 1; },
  setzen(x, y, z, id){
    const w = Game.world;
    if(!this.geladen(x, z)) w.ensureChunk(x >> 4, z >> 4);
    const alt = w.getBlock(x, y, z);
    if(alt === id) return false;
    const k = x + ',' + y + ',' + z;
    // was im Block steckte, geht mit ihm (wie beim Vorbild: /setblock lässt nichts fallen)
    w.chests.delete(k); w.furnaces.delete(k); w.crops.delete(k);
    if(isDoor(alt)){
      const di = doorInfo(alt), y2 = di.oben ? y - 1 : y + 1;
      if(isDoor(w.getBlock(x, y2, z))) w.setBlock(x, y2, z, B.AIR);
    }
    return w.setBlock(x, y, z, id);
  },

  /* — Antworten und Wirkung beim Betroffenen — */
  antwort(wer, text, art){
    if(wer.ich) Chat.zeigen({ art: art || 'info', text });
    else Netz.senden(wer.g.conn, { t:'chat', art: art || 'info', text });
  },
  fehler(wer, text){ this.antwort(wer, text, 'fehler'); },
  /** etwas, das einen Spieler selbst betrifft: bei sich gleich, sonst auf seinem Gerät */
  an(s, was, d){
    const m = Object.assign({ was }, d || {});
    if(s.ich) this.anwenden(m); else Netz.senden(s.g.conn, Object.assign({ t:'anwenden' }, m));
  },
  anwenden(m){
    const p = Game.player;
    if(!p) return;
    switch(m.was){
      case 'gib': {
        const id = +m.id, n = Math.min(GEBEN_MAX, Math.max(1, m.n | 0));
        if(!(isBlockId(id) ? blocks[id] : items[id])) return;
        const rest = Inv.add(id, n);
        if(rest > 0) Game.dropItem(id, rest, p.x, p.y + 1, p.z);
        Sfx.play('pickup');
        HUD.refreshHotbar(); showItemName();
        break;
      }
      case 'modus':
        p.creative = !!m.kreativ; if(!p.creative) p.flying = false;
        if(Screens.open === 'beh') Screens.hide();
        HUD.refreshHotbar();
        break;
      case 'tp': {
        const x = +m.x, y = +m.y, z = +m.z;
        if(![x, y, z].every(Number.isFinite)) return;
        const w = Game.world, weit = Math.hypot(x - p.x, z - p.z) > Game.sicht()*CS;
        w.ensureChunk(Math.floor(x) >> 4, Math.floor(z) >> 4);        // Boden unter den Füßen, bevor man fällt
        p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; p.fallFrom = null;
        if(weit){ Game.loading = true; Game.loadDone = 0; }
        break;
      }
      case 'toeten':
        p.health = 0; p.dead = true; p.deathCause = 'Durch einen Befehl getötet';
        break;
      case 'leeren':
        Inv.slots.fill(null); Inv.ruestung.fill(null); Inv.cursor = null;
        if(Screens.open === 'beh') Screens.hide();
        HUD.refreshHotbar();
        break;
      case 'startpunkt':
        if([m.x, m.y, m.z].every(v => Number.isFinite(+v))){ p.spawnX = +m.x; p.spawnY = +m.y; p.spawnZ = +m.z; }
        break;
    }
  },

  /* — Vorschläge beim Schreiben — */
  /** { liste, hilfe } für das, was gerade im Feld steht, oder null */
  vorschlaege(text){
    if(!text.startsWith('/')) return null;
    const teile = text.slice(1).split(' '), ich = this.ichSelbst();
    if(teile.length === 1){
      const vor = bNorm(teile[0]);
      const namen = vor ? Object.keys(BEFEHLE).filter(n => n.startsWith(vor) && n !== vor && this.darf(BEFEHLE[n], ich))
                        : BEFEHL_LISTE.filter(d => this.darf(d, ich)).map(d => d.name);
      const d = BEFEHLE[vor];
      return { liste: namen.sort(), hilfe: d ? '/' + d.name + ' ' + d.syntax + ' — ' + d.text : '' };
    }
    const d = BEFEHLE[bNorm(teile[0])];
    if(!d) return { liste: [], hilfe: 'Unbekannter Befehl — /hilfe zeigt alle' };
    const vor = bNorm(teile[teile.length - 1]);
    let kand = [];
    try{ kand = d.vorschlag ? d.vorschlag(teile.length - 2, teile.slice(1, -1)) : []; }catch(e){ kand = []; }
    // kürzere zuerst: bei »dia« steht der Diamant vor dem Diamanterz
    const liste = [...new Set(kand)].filter(k => { const n = bNorm(k); return n.startsWith(vor) && n !== vor; }).sort((a, b) => a.length - b.length);
    return { liste, hilfe: '/' + d.name + (d.syntax ? ' ' + d.syntax : '') };
  },
};
