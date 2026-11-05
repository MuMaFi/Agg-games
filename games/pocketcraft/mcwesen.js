/* Pocketcraft · Minecraft-Paket, Teil 2: Wesen, Hand, Truhe, Oberfläche
   Ist das Minecraft-Paket an (mcpaket.js), sehen auch Tiere, Monster,
   Dorfbewohner, Mitspieler, die eigene Hand, Truhen, Leiste und Inventar
   aus wie in Minecraft — mit den Bildern aus der eigenen client.jar.

   Minecraft baut seine Wesen aus Kästen und legt auf jeden ein
   ausgeklapptes Bild (»Box-UV«). Die Maße und Bildstellen unten stammen
   aus den Modell-Klassen der client.jar (createBodyLayer & Co., ausgelesen
   mit werkzeug/mc-modelle.py). Pocketcraft zeichnet Kästen mit einem Bild
   je Seite; deshalb wird hier jede Seite einmal aus dem Minecraft-Bild
   ausgeschnitten und als eigene Bildlage abgelegt.

   Koordinaten: Minecraft-Modelle zählen in Sechzehnteln, y nach unten,
   die Füße bei y = 24, vorn ist −z. Pocketcraft zählt in Blöcken, y nach
   oben, vorn ist ebenfalls −z, rechts ist +x. Daraus: x → −x/16,
   y → (24 − y)/16, z → z/16. */
'use strict';

/* Modelle aus Minecraft 26.3: je Teil p = Lage [x, y, z, Drehung x, y, z],
   c = Kästen [x, y, z, Breite, Höhe, Tiefe, u, v, Wachsen x, y, z, gespiegelt],
   k = Kinder, t = Bildgröße */
const MC_MODELLE = {"pig":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,12,-6,0,0,0],"c":[[-4,-4,-8,8,8,8,0,0,0,0,0,0],[-2,0,-9,4,3,1,16,16,0,0,0,0]]},"body":{"p":[0,11,2,1.5708,0,0],"c":[[-5,-10,-7,10,16,8,28,8,0,0,0,0]]},"right_hind_leg":{"p":[-3,18,7,0,0,0],"c":[[-2,0,-2,4,6,4,0,16,0,0,0,0]]},"left_hind_leg":{"p":[3,18,7,0,0,0],"c":[[-2,0,-2,4,6,4,0,16,0,0,0,1]]},"right_front_leg":{"p":[-3,18,-5,0,0,0],"c":[[-2,0,-2,4,6,4,0,16,0,0,0,0]]},"left_front_leg":{"p":[3,18,-5,0,0,0],"c":[[-2,0,-2,4,6,4,0,16,0,0,0,1]]}},"t":[64,64]},"cow":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,4,-8,0,0,0],"c":[[-4,-4,-6,8,8,6,0,0,0,0,0,0],[-3,1,-7,6,3,1,1,33,0,0,0,0],[-5,-5,-5,1,3,1,22,0,0,0,0,0],[4,-5,-5,1,3,1,22,0,0,0,0,0]]},"body":{"p":[0,5,2,1.5708,0,0],"c":[[-6,-10,-7,12,18,10,18,4,0,0,0,0],[-2,2,-8,4,6,1,52,0,0,0,0,0]]},"right_hind_leg":{"p":[-4,12,7,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,0]]},"left_hind_leg":{"p":[4,12,7,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,1]]},"right_front_leg":{"p":[-4,12,-5,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,0]]},"left_front_leg":{"p":[4,12,-5,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,1]]}},"t":[64,64]},"chicken":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,15,-4,0,0,0],"c":[[-2,-6,-2,4,6,3,0,0,0,0,0,0]],"k":{"beak":{"p":[0,0,0,0,0,0],"c":[[-2,-4,-4,4,2,2,14,0,0,0,0,0]]},"red_thing":{"p":[0,0,0,0,0,0],"c":[[-1,-2,-3,2,2,2,14,4,0,0,0,0]]}}},"body":{"p":[0,16,0,1.5708,0,0],"c":[[-3,-4,-3,6,8,6,0,9,0,0,0,0]]},"right_leg":{"p":[-2,19,1,0,0,0],"c":[[-1,0,-3,3,5,3,26,0,0,0,0,0]]},"left_leg":{"p":[1,19,1,0,0,0],"c":[[-1,0,-3,3,5,3,26,0,0,0,0,0]]},"right_wing":{"p":[-4,13,0,0,0,0],"c":[[0,0,-3,1,4,6,24,13,0,0,0,0]]},"left_wing":{"p":[4,13,0,0,0,0],"c":[[-1,0,-3,1,4,6,24,13,0,0,0,0]]}},"t":[64,32]},"sheep":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,6,-8,0,0,0],"c":[[-3,-4,-6,6,6,8,0,0,0,0,0,0]]},"body":{"p":[0,5,2,1.5708,0,0],"c":[[-4,-10,-7,8,16,6,28,8,0,0,0,0]]},"right_hind_leg":{"p":[-3,12,7,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,1]]},"left_hind_leg":{"p":[3,12,7,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,0]]},"right_front_leg":{"p":[-3,12,-5,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,1]]},"left_front_leg":{"p":[3,12,-5,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,0]]}},"t":[64,32]},"sheep_fur":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,6,-8,0,0,0],"c":[[-3,-4,-4,6,6,6,0,0,0.6,0.6,0.6,0]]},"body":{"p":[0,5,2,1.5708,0,0],"c":[[-4,-10,-7,8,16,6,28,8,1.75,1.75,1.75,0]]},"right_hind_leg":{"p":[-3,12,7,0,0,0],"c":[[-2,0,-2,4,6,4,0,16,0.5,0.5,0.5,0]]},"left_hind_leg":{"p":[3,12,7,0,0,0],"c":[[-2,0,-2,4,6,4,0,16,0.5,0.5,0.5,0]]},"right_front_leg":{"p":[-3,12,-5,0,0,0],"c":[[-2,0,-2,4,6,4,0,16,0.5,0.5,0.5,0]]},"left_front_leg":{"p":[3,12,-5,0,0,0],"c":[[-2,0,-2,4,6,4,0,16,0.5,0.5,0.5,0]]}},"t":[64,32]},"zombie":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,0,0,0,0,0],"c":[[-4,-8,-4,8,8,8,0,0,0,0,0,0]],"k":{"hat":{"p":[0,0,0,0,0,0],"c":[[-4,-8,-4,8,8,8,32,0,0.5,0.5,0.5,0]]}}},"body":{"p":[0,0,0,0,0,0],"c":[[-4,0,-2,8,12,4,16,16,0,0,0,0]]},"right_arm":{"p":[-5,2,0,0,0,0],"c":[[-3,-2,-2,4,12,4,40,16,0,0,0,0]]},"left_arm":{"p":[5,2,0,0,0,0],"c":[[-1,-2,-2,4,12,4,40,16,0,0,0,1]]},"right_leg":{"p":[-1.9,12,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,0]]},"left_leg":{"p":[1.9,12,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,1]]}},"t":[64,64]},"skeleton":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,0,0,0,0,0],"c":[[-4,-8,-4,8,8,8,0,0,0,0,0,0]],"k":{"hat":{"p":[0,0,0,0,0,0],"c":[[-4,-8,-4,8,8,8,32,0,0.5,0.5,0.5,0]]}}},"body":{"p":[0,0,0,0,0,0],"c":[[-4,0,-2,8,12,4,16,16,0,0,0,0]]},"right_arm":{"p":[-5,2,0,0,0,0],"c":[[-1,-2,-1,2,12,2,40,16,0,0,0,0]]},"left_arm":{"p":[5,2,0,0,0,0],"c":[[-1,-2,-1,2,12,2,40,16,0,0,0,1]]},"right_leg":{"p":[-2,12,0,0,0,0],"c":[[-1,0,-1,2,12,2,0,16,0,0,0,0]]},"left_leg":{"p":[2,12,0,0,0,0],"c":[[-1,0,-1,2,12,2,0,16,0,0,0,1]]}},"t":[64,32]},"slime_outer":{"p":[0,0,0,0,0,0],"k":{"cube":{"p":[0,0,0,0,0,0],"c":[[-4,16,-4,8,8,8,0,0,0,0,0,0]]}},"t":[64,32]},"slime_inner":{"p":[0,0,0,0,0,0],"k":{"cube":{"p":[0,0,0,0,0,0],"c":[[-3,17,-3,6,6,6,0,16,0,0,0,0]]},"right_eye":{"p":[0,0,0,0,0,0],"c":[[-3.25,18,-3.5,2,2,2,32,0,0,0,0,0]]},"left_eye":{"p":[0,0,0,0,0,0],"c":[[1.25,18,-3.5,2,2,2,32,4,0,0,0,0]]},"mouth":{"p":[0,0,0,0,0,0],"c":[[0,21,-3.5,1,1,1,32,8,0,0,0,0]]}},"t":[64,32]},"villager":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,0,0,0,0,0],"c":[[-4,-10,-4,8,10,8,0,0,0,0,0,0]],"k":{"hat":{"p":[0,0,0,0,0,0],"c":[[-4,-10,-4,8,10,8,32,0,0.51,0.51,0.51,0]],"k":{"hat_rim":{"p":[0,0,0,-1.5708,0,0],"c":[[-8,-8,-6,16,16,1,30,47,0,0,0,0]]}}},"nose":{"p":[0,-2,0,0,0,0],"c":[[-1,-1,-6,2,4,2,24,0,0,0,0,0]]}}},"body":{"p":[0,0,0,0,0,0],"c":[[-4,0,-3,8,12,6,16,20,0,0,0,0]],"k":{"jacket":{"p":[0,0,0,0,0,0],"c":[[-4,0,-3,8,20,6,0,38,0.5,0.5,0.5,0]]}}},"arms":{"p":[0,3,-1,-0.75,0,0],"c":[[-8,-2,-2,4,8,4,44,22,0,0,0,0],[4,-2,-2,4,8,4,44,22,0,0,0,1],[-4,2,-2,8,4,4,40,38,0,0,0,0]]},"right_leg":{"p":[-2,12,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,22,0,0,0,0]]},"left_leg":{"p":[2,12,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,22,0,0,0,1]]}},"t":[64,64]},"golem":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,-7,-2,0,0,0],"c":[[-4,-12,-5.5,8,10,8,0,0,0,0,0,0],[-1,-5,-7.5,2,4,2,24,0,0,0,0,0]]},"body":{"p":[0,-7,0,0,0,0],"c":[[-9,-2,-6,18,12,11,0,40,0,0,0,0],[-4.5,10,-3,9,5,6,0,70,0.5,0.5,0.5,0]]},"right_arm":{"p":[0,-7,0,0,0,0],"c":[[-13,-2.5,-3,4,30,6,60,21,0,0,0,0]]},"left_arm":{"p":[0,-7,0,0,0,0],"c":[[9,-2.5,-3,4,30,6,60,58,0,0,0,0]]},"right_leg":{"p":[-4,11,0,0,0,0],"c":[[-3.5,-3,-3,6,16,5,37,0,0,0,0,0]]},"left_leg":{"p":[5,11,0,0,0,0],"c":[[-3.5,-3,-3,6,16,5,60,0,0,0,0,1]]}},"t":[128,128]},"player":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,0,0,0,0,0],"c":[[-4,-8,-4,8,8,8,0,0,0,0,0,0]],"k":{"hat":{"p":[0,0,0,0,0,0],"c":[[-4,-8,-4,8,8,8,32,0,0.5,0.5,0.5,0]]}}},"body":{"p":[0,0,0,0,0,0],"c":[[-4,0,-2,8,12,4,16,16,0,0,0,0]],"k":{"jacket":{"p":[0,0,0,0,0,0],"c":[[-4,0,-2,8,12,4,16,32,0.25,0.25,0.25,0]]}}},"right_arm":{"p":[-5,2,0,0,0,0],"c":[[-3,-2,-2,4,12,4,40,16,0,0,0,0]],"k":{"right_sleeve":{"p":[0,0,0,0,0,0],"c":[[-3,-2,-2,4,12,4,40,32,0.25,0.25,0.25,0]]}}},"left_arm":{"p":[5,2,0,0,0,0],"c":[[-1,-2,-2,4,12,4,32,48,0,0,0,0]],"k":{"left_sleeve":{"p":[0,0,0,0,0,0],"c":[[-1,-2,-2,4,12,4,48,48,0.25,0.25,0.25,0]]}}},"right_leg":{"p":[-1.9,12,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,0]],"k":{"right_pants":{"p":[0,0,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,32,0.25,0.25,0.25,0]]}}},"left_leg":{"p":[1.9,12,0,0,0,0],"c":[[-2,0,-2,4,12,4,16,48,0,0,0,0]],"k":{"left_pants":{"p":[0,0,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,48,0.25,0.25,0.25,0]]}}}},"t":[64,64]},"player_slim":{"p":[0,0,0,0,0,0],"k":{"head":{"p":[0,0,0,0,0,0],"c":[[-4,-8,-4,8,8,8,0,0,0,0,0,0]],"k":{"hat":{"p":[0,0,0,0,0,0],"c":[[-4,-8,-4,8,8,8,32,0,0.5,0.5,0.5,0]]}}},"body":{"p":[0,0,0,0,0,0],"c":[[-4,0,-2,8,12,4,16,16,0,0,0,0]],"k":{"jacket":{"p":[0,0,0,0,0,0],"c":[[-4,0,-2,8,12,4,16,32,0.25,0.25,0.25,0]]}}},"right_arm":{"p":[-5,2,0,0,0,0],"c":[[-2,-2,-2,3,12,4,40,16,0,0,0,0]],"k":{"right_sleeve":{"p":[0,0,0,0,0,0],"c":[[-2,-2,-2,3,12,4,40,32,0.25,0.25,0.25,0]]}}},"left_arm":{"p":[5,2,0,0,0,0],"c":[[-1,-2,-2,3,12,4,32,48,0,0,0,0]],"k":{"left_sleeve":{"p":[0,0,0,0,0,0],"c":[[-1,-2,-2,3,12,4,48,48,0.25,0.25,0.25,0]]}}},"right_leg":{"p":[-1.9,12,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,16,0,0,0,0]],"k":{"right_pants":{"p":[0,0,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,32,0.25,0.25,0.25,0]]}}},"left_leg":{"p":[1.9,12,0,0,0,0],"c":[[-2,0,-2,4,12,4,16,48,0,0,0,0]],"k":{"left_pants":{"p":[0,0,0,0,0,0],"c":[[-2,0,-2,4,12,4,0,48,0.25,0.25,0.25,0]]}}}},"t":[64,64]},"chest":{"p":[0,0,0,0,0,0],"k":{"bottom":{"p":[0,0,0,0,0,0],"c":[[1,0,1,14,10,14,0,19,0,0,0,0]]},"lid":{"p":[0,9,1,0,0,0],"c":[[1,0,0,14,5,14,0,0,0,0,0,0]]},"lock":{"p":[0,9,1,0,0,0],"c":[[7,-2,14,2,4,1,0,0,0,0,0,0]]}},"t":[64,64]}};

/** je Wesen: [Modell, Bild (oder mehrere übereinander), Extras] */
const MC_BERUFE = ['farmer', 'shepherd', 'toolsmith', 'cleric'];
const MC_WESEN = {
  pig:      [['pig', 'entity/pig/pig_temperate']],
  cow:      [['cow', 'entity/cow/cow_temperate']],
  chicken:  [['chicken', 'entity/chicken/chicken_temperate']],
  sheep:    [['sheep', 'entity/sheep/sheep'], ['sheep_fur', 'entity/sheep/sheep_wool', { fell:true }]],
  zombie:   [['zombie', 'entity/zombie/zombie']],
  skeleton: [['skeleton', 'entity/skeleton/skeleton']],
  slime:    [['slime_inner', 'entity/slime/slime'], ['slime_outer', 'entity/slime/slime', { huelle:true }]],
  golem:    [['golem', 'entity/iron_golem/iron_golem']],
  spieler:  [['player', 'entity/player/wide/steve']],
};
for(let b = 0; b < MC_BERUFE.length; b++)
  MC_WESEN['villager' + b] = [['villager', ['entity/villager/villager', 'entity/villager/type/plains', 'entity/villager/profession/' + MC_BERUFE[b]]]];

/** Oberfläche: Name → Bildpfad */
const MC_GUI = {
  slot:'gui/sprites/container/slot', hotbar:'gui/sprites/hud/hotbar', auswahl:'gui/sprites/hud/hotbar_selection',
  inventar:'gui/container/inventory',
  herz:'gui/sprites/hud/heart/full', herzHalb:'gui/sprites/hud/heart/half', herzLeer:'gui/sprites/hud/heart/container',
  essen:'gui/sprites/hud/food_full', essenLeer:'gui/sprites/hud/food_empty',
  angriffGrund:'gui/sprites/hud/crosshair_attack_indicator_background', angriffVoll:'gui/sprites/hud/crosshair_attack_indicator_progress',
  ruest:'gui/sprites/hud/armor_full', ruestLeer:'gui/sprites/hud/armor_empty', luft:'gui/sprites/hud/air', luftLeer:'gui/sprites/hud/air_empty',
};
const MC_TRUHE = 'entity/chest/normal';

/** alle Bilder, die Teil 2 aus der client.jar braucht (für mcBildPfade) */
function mcWesenPfade(){
  const s = new Set([MC_TRUHE, 'item/bow', ...Object.values(MC_GUI)]);
  for(const l of Object.values(MC_WESEN)) for(const [, t] of l) for(const p of [].concat(t)) s.add(p);
  return [...s];
}

/* ── Bewegung: welcher Minecraft-Teil wie schwingt ─────────────────── */
/* Pocketcraft: rechts ist +x; Bein und Arm mit ph 1 sind die rechten,
   bei Vierbeinern gehen die Beine über Kreuz. */
const MC_ANIM = {
  head:{ anim:'head', kopf:true },
  right_leg:{ anim:'leg', ph:1 }, left_leg:{ anim:'leg', ph:0 },
  right_arm:{ anim:'arm', ph:1 }, left_arm:{ anim:'arm', ph:0 },
  right_front_leg:{ anim:'leg', ph:1 }, left_front_leg:{ anim:'leg', ph:0 },
  right_hind_leg:{ anim:'leg', ph:0 }, left_hind_leg:{ anim:'leg', ph:1 },
  right_wing:{ anim:'fluegel', ph:1 }, left_wing:{ anim:'fluegel', ph:0 },
};

/* ── Seiten ausschneiden ───────────────────────────────────────────── */
/** die sechs Seitenbilder eines Kastens, in Pocketcraft-Reihenfolge (+x, −x, +y, −y, +z, −z);
    px: Pixel des Minecraft-Bilds, sx/sy: Bildpunkte je Modell-Einheit; weich: Durchsichtigkeit
    behalten (Schleimhülle), sonst ganz oder gar nicht wie bei Minecraft */
function mcSeiten(px, sx, sy, c, weich){
  const w = c[3], h = c[4], d = c[5], u = c[6], v = c[7], spiegel = !!c[11];
  const out = [];
  for(let f = 0; f < 6; f++){
    const F = FACES[f], ST = FACE_ST[f], dat = new Uint8Array(TS*TS*4), q = [0, 0, 0];
    q[F.nAx] = F.n[F.nAx] > 0 ? 1 : 0;
    for(let j = 0; j < TS; j++) for(let i = 0; i < TS; i++){
      const s = (i + .5)/TS, t = (j + .5)/TS;
      q[ST.sAx] = ST.sFlip ? 1 - s : s; q[ST.tAx] = ST.tFlip ? 1 - t : t;
      // Stelle im Minecraft-Kasten, jeweils 0 … 1: a entlang x, b entlang y (nach unten), e entlang z
      let a = 1 - q[0];
      const b = 1 - q[1], e = q[2];
      if(spiegel) a = 1 - a;
      let U, V;
      switch(f){
        case 0: U = spiegel ? u + d + w + e*d : u + (1 - e)*d; V = v + d + b*h; break;       // Minecraft −x: »rechte Seite«
        case 1: U = spiegel ? u + (1 - e)*d : u + d + w + e*d; V = v + d + b*h; break;       // +x: linke Seite
        case 2: U = u + d + a*w; V = v + (1 - e)*d; break;                                   // oben
        case 3: U = u + d + w + a*w; V = v + (1 - e)*d; break;                               // unten
        case 4: U = u + 2*d + w + (1 - a)*w; V = v + d + b*h; break;                         // hinten
        default: U = u + d + a*w; V = v + d + b*h;                                           // vorn
      }
      const x = clamp(Math.floor(U*sx), 0, px.w - 1), y = clamp(Math.floor(V*sy), 0, px.h - 1);
      const p = (y*px.w + x)*4, o = (j*TS + i)*4;
      dat[o] = px.d[p]; dat[o+1] = px.d[p+1]; dat[o+2] = px.d[p+2]; dat[o+3] = weich ? px.d[p+3] : (px.d[p+3] > 127 ? 255 : 0);
    }
    ausbluten(dat);
    out.push(dat);
  }
  return out;
}

/** Kasten-Matrix: Einheitswürfel → Pocketcraft (oder, ohne Umrechnung, Minecraft-Raum in Blöcken) */
function mcKastenMatrix(kette, c, umrechnen){
  const L = M4.create();
  if(umrechnen){ M4.translate(L, L, 0, 1.5, 0); M4.scale(L, L, -1/16, -1/16, 1/16); }
  else M4.scale(L, L, 1/16, 1/16, 1/16);
  for(const p of kette){
    M4.translate(L, L, p[0], p[1], p[2]);
    if(p[5]) M4.rotZ(L, L, p[5]);
    if(p[4]) M4.rotY(L, L, p[4]);
    if(p[3]) M4.rotX(L, L, p[3]);
  }
  const [ox, oy, oz, w, h, d, , , gx, gy, gz] = c;
  M4.translate(L, L, ox + w + gx, oy + h + gy, oz - gz);
  M4.scale(L, L, -(w + 2*gx), -(h + 2*gy), d + 2*gz);
  return L;
}
const mcPunkt = p => [-p[0]/16, 1.5 - p[1]/16, p[2]/16];

/* ── Bilder ────────────────────────────────────────────────────────── */
function mcUebereinander(liste){
  const g = liste[0], d = new Uint8ClampedArray(g.d);
  for(const o of liste.slice(1)){
    if(!o || o.w !== g.w || o.h !== g.h) continue;
    for(let i = 0; i < d.length; i += 4){
      const a = o.d[i+3]/255;
      if(!a) continue;
      for(let k = 0; k < 3; k++) d[i+k] = o.d[i+k]*a + d[i+k]*(1 - a);
      d[i+3] = Math.max(d[i+3], o.d[i+3]);
    }
  }
  return { w:g.w, h:g.h, d };
}
function mcHash(d){
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for(let i = 0; i < d.length; i += 4){
    const v = d[i] | d[i+1] << 8 | d[i+2] << 16 | d[i+3] << 24;
    h1 = Math.imul(h1 ^ v, 16777619); h2 = Math.imul(h2 ^ (v >>> 7), 2246822519);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

const McWesen = {
  an: false, sets: {}, hand: null,
  _verfuegbar: false,

  /** Bildlage für ein Seitenbild: gleiche Bilder teilen sich eine Lage */
  _lage(d){
    const k = 'mcw:' + mcHash(d);
    if(TEX[k] === undefined){ TEX[k] = texNames.length; texNames.push(k); texData.push(d); this._neu = true; }
    return TEX[k];
  },
  /** aus einem Minecraft-Modell die Teile für Pocketcraft */
  _bauen(name, px, extra){
    const M = MC_MODELLE[name], sx = px.w/M.t[0], sy = px.h/M.t[1], teile = [];
    const kopfPunkt = M.k.head ? mcPunkt(M.k.head.p) : null;
    const gehe = (knoten, kette, oben) => {
      for(const c of knoten.c || []){
        const a = MC_ANIM[oben] || {}, seiten = mcSeiten(px, sx, sy, c, extra && extra.huelle);
        const teil = { n:oben, mc:true, L: mcKastenMatrix(kette, c, true), pivot: mcPunkt(kette[1] || [0, 0, 0]),
          lagen: new Float32Array(seiten.map(s => this._lage(s))), anim:a.anim, ph:a.ph, kopf:!!a.kopf, kopfPunkt };
        if(extra && extra.fell){ teil.wenn = m => !m.geschoren; teil.farbe = m => WOLLE[m.wolle].tint; }
        if(extra && extra.huelle) teil.huelle = true;
        teile.push(teil);
      }
      for(const [n, kind] of Object.entries(knoten.k || {})) gehe(kind, kette.concat([kind.p]), oben || n);
    };
    gehe(M, [M.p], null);
    return teile;
  },
  /** alles aus den Bildern des Pakets bauen; px(pfad) → Pixel oder null */
  async bauen(px){
    this._neu = false;
    const sets = {};
    for(const [art, liste] of Object.entries(MC_WESEN)){
      const teile = [];
      for(const [name, tex, extra] of liste){
        const bilder = [];
        for(const p of [].concat(tex)) bilder.push(await px(p));
        if(!bilder[0]) { teile.length = 0; break; }
        teile.push(...this._bauen(name, bilder.length > 1 ? mcUebereinander(bilder) : bilder[0], extra));
      }
      if(teile.length) sets[art] = teile;
    }
    // Skelett: der Bogen aufrecht in der rechten Faust, schwingt mit dem Arm
    const bogen = await px('item/bow');
    if(sets.skeleton && bogen) sets.skeleton.push(this._bogenBauen(bogen, MC_MODELLE.skeleton.k.right_arm.p));
    // Hand: der rechte Arm des Spielers mit Ärmel, im Minecraft-Raum (ohne Umrechnung)
    const steve = await px('entity/player/wide/steve');
    this.hand = steve ? this._handBauen(steve) : null;
    // nicht mehr Bildlagen, als die Grafikkarte kann
    const max = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || 256;
    if(texData.length > max){
      this.sets = {}; this.hand = null; this._verfuegbar = false;
      return false;
    }
    if(this._neu){ gl.deleteTexture(R.texArr); R.buildTexArray(); }
    this.sets = sets;
    this._verfuegbar = Object.keys(sets).length > 0;
    return true;
  },
  /** Minecrafts Bogenbild liegt schräg (Spitzen oben rechts und unten links, die
      Rundung oben links, die Sehne unten rechts). Gehalten wird er aufrecht:
      die Spitzen oben und unten, die Rundung vom Schützen weg, die Sehne zu ihm.
      Gebaut für den ausgestreckten Arm; in Ruhe hängt der Arm, deshalb liegt der
      Bogen dort um eine Vierteldrehung gekippt und kommt mit dem Arm hoch. */
  _bogenBauen(px, armLage){
    const H = 0.95, T = 1/16, leer = new Uint8Array(TS*TS*4), lagen = [];
    for(let f = 0; f < 6; f++){
      if(f > 1){ lagen.push(this._lage(leer)); continue; }
      const F = FACES[f], ST = FACE_ST[f], d = new Uint8Array(TS*TS*4), q = [0, 0, 0];
      q[F.nAx] = F.n[F.nAx] > 0 ? 1 : 0;
      for(let j = 0; j < TS; j++) for(let i = 0; i < TS; i++){
        const s0 = (i + .5)/TS, t0 = (j + .5)/TS;
        q[ST.sAx] = ST.sFlip ? 1 - s0 : s0; q[ST.tAx] = ST.tFlip ? 1 - t0 : t0;
        const hoch = q[1] - .5, vor = .5 - q[2];            // im ausgestreckten Arm: oben, nach vorn
        const s = .5 + hoch - vor, t = .5 + hoch + vor;     // Bildstelle, t von unten
        if(s < 0 || s >= 1 || t < 0 || t >= 1) continue;
        const x = Math.floor(s*px.w), y = Math.floor((1 - t)*px.h), p = (y*px.w + x)*4, o = (j*TS + i)*4;
        if(px.d[p+3] < 128) continue;
        d[o] = px.d[p]; d[o+1] = px.d[p+1]; d[o+2] = px.d[p+2]; d[o+3] = 255;
      }
      ausbluten(d);
      lagen.push(this._lage(d));
    }
    // Faust: am Ende des Arms (12 Sechzehntel unter dem Schultergelenk)
    const gelenk = mcPunkt(armLage), L = M4.create();
    M4.translate(L, L, gelenk[0], gelenk[1] - 0.7, gelenk[2]);
    M4.rotX(L, L, -Math.PI/2);
    M4.translate(L, L, -T/2, -H/2, -H/2);
    M4.scale(L, L, T, H, H);
    return { n:'bogen', mc:true, L, pivot:gelenk, lagen:new Float32Array(lagen), anim:'arm', ph:1, kopf:false };
  },
  _handBauen(px, modell){
    const M = MC_MODELLE[modell || 'player'], sx = px.w/M.t[0], sy = px.h/M.t[1], arm = M.k.right_arm, teile = [];
    const kasten = (c, kette) => teile.push({ H: mcKastenMatrix(kette, c, false),
      lagen: new Float32Array(mcSeiten(px, sx, sy, c).map(s => this._lage(s))) });
    // in der Hand ohne Drehung am Gelenk: Minecraft setzt xRot = 0 und zeichnet ab dem Gelenk
    for(const c of arm.c) kasten(c, [arm.p]);
    for(const k of Object.values(arm.k || {})) for(const c of k.c) kasten(c, [arm.p, k.p]);
    return teile;
  },
  setzen(an){ this.an = !!an && this._verfuegbar; },
  /** die Teile, mit denen ein Wesen gezeichnet wird, oder null für Pocketcrafts eigene */
  teile(m){
    if(!this.an) return null;
    if(m.type === 'villager') return this.sets['villager' + ((m.beruf | 0) % MC_BERUFE.length)] || null;
    return this.sets[m.type] || null;
  },
};

/** Matrix eines Minecraft-Teils: Wesen an seinen Platz (wie partMatrix), Schwung ums Gelenk, dann der Kasten */
function mcTeilMatrix(out, mob, part, ang){
  wesenGrund(out, mob, part.kopf, part.kopfPunkt);
  if(ang){
    const [px, py, pz] = part.pivot;
    M4.translate(out, out, px, py, pz);
    if(part.anim === 'fluegel') M4.rotZ(out, out, ang); else M4.rotX(out, out, ang);
    M4.translate(out, out, -px, -py, -pz);
  }
  return M4.mul(out, out, part.L);
}

/* ── Truhe: die Seiten aus dem Truhenmodell ─────────────────────────
   Minecraft zeichnet die Truhe als Modell (Unterteil 14 × 10 × 14, Deckel
   14 × 5 × 14 darüber, vorn das Schloss); ihr Bild liegt auf dem Kopf.
   Für Pocketcrafts Block werden Deckel und Unterteil je Seite
   übereinandergelegt und auf 16 × 16 ergänzt. */
function mcTruhe(px){
  const s = px.w/64, hol = (x, y) => { const p = (Math.floor(y*s)*px.w + Math.floor(x*s))*4; return [px.d[p], px.d[p+1], px.d[p+2], px.d[p+3]]; };
  /** 14 × 14: Deckelseite (u, 14) und Unterteilseite (u, 33), beide gestürzt; Schloss vorn */
  const seite = (u, schloss) => {
    const b = [];
    for(let y = 0; y < 14; y++) for(let x = 0; x < 14; x++)
      b.push(y < 5 ? hol(u + x, 14 + (4 - y)) : hol(u + x, 33 + (13 - y)));
    if(schloss) for(let y = 0; y < 4; y++) for(let x = 0; x < 2; x++) b[(3 + y)*14 + 6 + x] = hol(4 + x, 1 + (3 - y));
    return b;
  };
  const flaeche = (u0, v0) => { const b = []; for(let y = 0; y < 14; y++) for(let x = 0; x < 14; x++) b.push(hol(u0 + x, v0 + y)); return b; };
  /** 14 × 14 → TS × TS: ringsum eine Reihe ergänzen (Rand verdoppelt), dann scharf vergrößern */
  const gross = b => {
    const d = new Uint8Array(TS*TS*4), f = TS/16;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const sx = clamp(((x/f) | 0) - 1, 0, 13), sy = clamp(((y/f) | 0) - 1, 0, 13), c = b[sy*14 + sx], i = (y*TS + x)*4;
      d[i] = c[0]; d[i+1] = c[1]; d[i+2] = c[2]; d[i+3] = 255;
    }
    return d;
  };
  return { chest_front: gross(seite(42, true)), chest_side: gross(seite(0, false)), chest_top: gross(flaeche(28, 0)) };
}

/* ── Oberfläche: Leiste, Fächer, Inventar, Herzen ─────────────────── */
const McGui = {
  _urls: [],
  setzen(an, bilder){
    for(const u of this._urls) URL.revokeObjectURL(u);
    this._urls = [];
    const root = document.documentElement.style;
    if(an && bilder){
      const url = p => {
        const b = bilder[p + '.png'];
        if(!b) return 'none';
        const u = URL.createObjectURL(new Blob([b], { type:'image/png' }));
        this._urls.push(u);
        return 'url(' + u + ')';
      };
      for(const [k, p] of Object.entries(MC_GUI)) if(k !== 'inventar') root.setProperty('--mc-' + k, url(p));
      root.setProperty('--mc-rahmen', this._rahmen(bilder[MC_GUI.inventar + '.png']));
    }
    document.body.classList.toggle('mcGui', !!an && !!bilder);
  },
  /** Neun-Teile-Rahmen aus dem Inventarbild: Ecken und Kanten je 4 Pixel, Mitte die Fläche */
  _rahmen(buf){
    if(!buf) return 'none';
    const img = new Image(), u = URL.createObjectURL(new Blob([buf], { type:'image/png' }));
    this._urls.push(u);
    img.src = u;
    // bis das Bild da ist, ein schlichter Rahmen; dann der echte
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 12;
      const c = cv.getContext('2d'), W = 176, H = 166;
      const teil = (sx, sy, dx, dy) => c.drawImage(img, sx, sy, 4, 4, dx, dy, 4, 4);
      teil(0, 0, 0, 0); teil(W - 4, 0, 8, 0); teil(0, H - 4, 0, 8); teil(W - 4, H - 4, 8, 8);
      teil(80, 0, 4, 0); teil(80, H - 4, 4, 8); teil(0, 80, 0, 4); teil(W - 4, 80, 8, 4);
      teil(160, 6, 4, 4);
      document.documentElement.style.setProperty('--mc-rahmen', 'url(' + cv.toDataURL() + ')');
    };
    return 'none';
  },
};

/* ── Die eigene Hand, wie in Minecraft ─────────────────────────────
   Leere Hand: der rechte Arm schräg von unten rechts ins Bild, beim
   Schlagen holt er aus. Mit etwas in der Hand: Block schräg gedreht,
   Werkzeug schräg nach oben. Die Zahlen sind die aus Minecrafts
   FirstPersonHandsAndItemsRenderer und den Modellen generated/block. */
const GRAD = Math.PI/180;
/** _cam steht im Auge, Blick nach −z; danach liegt der Arm im Minecraft-Raum (Blöcke) */
function mcArmLage(m, sw){
  const g = Math.sqrt(sw);
  M4.translate(m, m, -0.3*Math.sin(g*Math.PI) + 0.64, 0.4*Math.sin(g*2*Math.PI) - 0.6, -0.4*Math.sin(sw*Math.PI) - 0.72);
  M4.rotY(m, m, 45*GRAD);
  M4.rotY(m, m, Math.sin(g*Math.PI)*70*GRAD);
  M4.rotZ(m, m, Math.sin(sw*sw*Math.PI)*-20*GRAD);
  M4.translate(m, m, -1, 3.6, 3.5);
  M4.rotZ(m, m, 120*GRAD); M4.rotX(m, m, 200*GRAD); M4.rotY(m, m, -135*GRAD);
  M4.translate(m, m, 5.6, 0, 0);
}
/** dasselbe für etwas in der Hand; block: Würfel oder flaches Bild */
function mcDingLage(m, sw, block){
  const g = Math.sqrt(sw);
  M4.translate(m, m, -0.4*Math.sin(g*Math.PI), 0.2*Math.sin(g*2*Math.PI), -0.2*Math.sin(sw*Math.PI));
  M4.translate(m, m, 0.56, -0.52, -0.72);
  M4.rotY(m, m, (45 - Math.sin(sw*sw*Math.PI)*20)*GRAD);
  const s = Math.sin(g*Math.PI);
  M4.rotZ(m, m, -s*20*GRAD); M4.rotX(m, m, -s*80*GRAD); M4.rotY(m, m, -45*GRAD);
  if(block){ M4.rotY(m, m, 45*GRAD); M4.scale(m, m, .4, .4, .4); }
  else {
    M4.translate(m, m, 1.13/16, 3.2/16, 1.13/16);
    M4.rotY(m, m, -90*GRAD); M4.rotZ(m, m, 25*GRAD);
    M4.scale(m, m, .68, .68, .68);
  }
  M4.translate(m, m, -.5, -.5, -.5);
}
/** Pocketcrafts eigener Arm, wenn kein Paket an ist: wie der Minecraft-Arm, 4 × 12 × 4,
    mit Ärmel an den Seiten, Hemd an der Schulter, Haut an der Hand */
const POCKET_HAND = { c:[-3, -2, -2, 4, 12, 4, 0, 0, 0, 0, 0, 0], p:[-5, 2, 0, 0, 0, 0] };
function pocketHand(){
  if(!pocketHand._t) pocketHand._t = [{ H: mcKastenMatrix([POCKET_HAND.p], POCKET_HAND.c, false) }];
  const t = pocketHand._t[0];
  t.lagen = new Float32Array([TEX.m_sp_arm, TEX.m_sp_arm, TEX.m_sp_hemd, TEX.m_skin, TEX.m_sp_arm, TEX.m_sp_arm]);
  return pocketHand._t;
}
