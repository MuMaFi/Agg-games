/* Pocketcraft · Wesen */
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   WESEN — Physik, Spieler, Mobs, liegende Gegenstände
   ═══════════════════════════════════════════════════════════════════ */
const GRAV = 30, TERMINAL = 58;

function aabbBlocks(world, x0,y0,z0, x1,y1,z1, cb){
  const ix0 = Math.floor(x0), ix1 = Math.floor(x1);
  const iy0 = Math.floor(y0), iy1 = Math.floor(y1);
  const iz0 = Math.floor(z0), iz1 = Math.floor(z1);
  for(let y=iy0; y<=iy1; y++) for(let z=iz0; z<=iz1; z++) for(let x=ix0; x<=ix1; x++){
    const id = world.getBlock(x,y,z);
    if(id !== B.AIR && cb(id, x, y, z) === false) return false;
  }
  return true;
}

/** Achsenweise Kollisionsauflösung für eine AABB (Mitte x/z, Fuß y) */
function moveAABB(world, e, dx, dy, dz){
  const hw = e.w/2, h = e.h, E = 1e-6;
  /* Blöcke tragen einen Kollisionskasten: ein Bett ist 9/16 hoch, eine
     Tür nur ein Brett an einer Seite. Die meisten sind aber voll. */
  const hits = (px,py,pz) => {
    const ax0 = px-hw, ax1 = px+hw, ay1 = py+h, az0 = pz-hw, az1 = pz+hw;
    const x0 = Math.floor(ax0+E), x1 = Math.floor(ax1-E);
    const y0 = Math.floor(py+E),  y1 = Math.floor(ay1-E);
    const z0 = Math.floor(az0+E), z1 = Math.floor(az1-E);
    for(let y=y0; y<=y1; y++) for(let z=z0; z<=z1; z++) for(let x=x0; x<=x1; x++){
      const id = world.getBlock(x,y,z);
      if(SOL[id] !== 1) continue;
      if(VOLL[id] === 1) return true;
      const o = id*6;
      if(ax0 < x+COLL[o+3]-E && ax1 > x+COLL[o]+E && py < y+COLL[o+4]-E && ay1 > y+COLL[o+1]+E &&
         az0 < z+COLL[o+5]-E && az1 > z+COLL[o+2]+E) return true;
    }
    return false;
  };
  const step = (v, axis) => {
    const n = Math.max(1, Math.ceil(Math.abs(v)/0.2));
    const s = v/n;
    for(let i=0;i<n;i++){
      const ox = e.x, oy = e.y, oz = e.z;
      if(axis===0) e.x += s; else if(axis===1) e.y += s; else e.z += s;
      if(hits(e.x, e.y, e.z)){
        // bis an die Berührung heran, sonst schwebt man über halben Blöcken
        let lo = 0, hi = 1;
        for(let k=0; k<6; k++){
          const m = (lo+hi)/2;
          const tx = axis===0 ? ox + s*m : ox, ty = axis===1 ? oy + s*m : oy, tz = axis===2 ? oz + s*m : oz;
          if(hits(tx, ty, tz)) hi = m; else lo = m;
        }
        e.x = axis===0 ? ox + s*lo : ox; e.y = axis===1 ? oy + s*lo : oy; e.z = axis===2 ? oz + s*lo : oz;
        return true;
      }
    }
    return false;
  };
  e.onGround = false;
  if(dy !== 0){ if(step(dy,1)){ if(dy < 0) e.onGround = true; e.vy = 0; } }
  const bx = step(dx,0);
  const bz = step(dz,2);
  return { bx, bz };
}

function inBlockOfType(world, e, pred){
  const hw = e.w/2;
  const x0 = Math.floor(e.x-hw), x1 = Math.floor(e.x+hw);
  const y0 = Math.floor(e.y), y1 = Math.floor(e.y+e.h-0.01);
  const z0 = Math.floor(e.z-hw), z1 = Math.floor(e.z+hw);
  for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++)
    if(pred(world.getBlock(x,y,z))) return true;
  return false;
}

/* ── Spieler ───────────────────────────────────────────────────────── */
class Player{
  constructor(){
    this.x = 0; this.y = 70; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.w = 0.6; this.h = 1.8; this.eye = 1.62;
    this.onGround = false; this.stepUp = true;
    this.health = 20; this.maxHealth = 20;
    this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 20; this.maxAir = 20;
    this.inWater = false; this.headInWater = false;
    this.fallFrom = null; this.hurtTimer = 0; this.regenTimer = 0; this.starveTimer = 0;
    this.creative = false; this.flying = false;
    this.dead = false; this.deathCause = '';
    this.bob = 0; this.swing = 0; this.swinging = false;
    this.spawnX = 0; this.spawnY = 70; this.spawnZ = 0;
  }
  eyeY(){ return this.y + this.eye - (this.sneaking ? 0.22 : 0); }
  forward(){
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw)*cp, Math.sin(this.pitch), -Math.cos(this.yaw)*cp];
  }
  hurt(dmg, cause, kx, kz){
    if(this.creative || this.dead || this.hurtTimer > 0.35) return;
    if(kx !== undefined) dmg = Ruestung.abfangen(dmg);      // Rüstung hilft gegen Wesen
    this.health -= dmg; this.hurtTimer = 0.5;
    if(kx !== undefined){ this.vx += kx*5.5; this.vz += kz*5.5; this.vy = Math.max(this.vy, 5); }
    if(this.health <= 0){ this.health = 0; this.dead = true; this.deathCause = cause || ''; }
    return true;
  }
  addExhaustion(v){ this.exhaustion += v; }
}

/* ── Mob-Modelle ───────────────────────────────────────────────────
   Jedes Wesen besteht aus Kästen. wenn(m) blendet einen Kasten aus (das
   geschorene Schaf hat keine Wolle mehr), farbe(m) färbt ihn (Wollfarbe),
   pivot legt den Drehpunkt fest, wenn er nicht oben am Kasten liegt.
   beute(m) sagt, was beim Tod fallen gelassen wird. */
const zufallN = (a, b) => a + ((Math.random()*(b - a + 1))|0);
const MOBS = {
  pig: {
    name:'Schwein', w:0.9, h:0.9, health:10, speed:1.5, hostile:false, laut:'pig',
    beute: () => [[ITEM.pork_raw, zufallN(1, 3)]],
    parts:[
      { n:'body', box:[-0.31,0.42,-0.5, 0.62,0.5,1.0], tex:'m_pig' },
      { n:'head', box:[-0.25,0.4,-0.94, 0.5,0.5,0.44], tex:'m_pig', face:'m_pig_face', anim:'head' },
      { n:'l0', box:[-0.28,0.0,-0.44, 0.25,0.44,0.25], tex:'m_pig_leg', anim:'leg', ph:0 },
      { n:'l1', box:[ 0.03,0.0,-0.44, 0.25,0.44,0.25], tex:'m_pig_leg', anim:'leg', ph:1 },
      { n:'l2', box:[-0.28,0.0, 0.2,  0.25,0.44,0.25], tex:'m_pig_leg', anim:'leg', ph:1 },
      { n:'l3', box:[ 0.03,0.0, 0.2,  0.25,0.44,0.25], tex:'m_pig_leg', anim:'leg', ph:0 },
    ]
  },
  cow: {
    name:'Kuh', w:0.9, h:1.4, health:10, speed:1.3, hostile:false, laut:'kuh',
    beute: () => [[ITEM.leather, zufallN(0, 2)], [ITEM.beef_raw, zufallN(1, 3)]],
    parts:[
      { n:'body', box:[-0.375,0.75,-0.56, 0.75,0.625,1.125], tex:'m_kuh' },
      { n:'head', box:[-0.25,0.94,-0.94, 0.5,0.5,0.4], tex:'m_kuh', face:'m_kuh_face', anim:'head' },
      { n:'horn0', box:[-0.33,1.32,-0.84, 0.09,0.2,0.09], tex:'m_horn' },
      { n:'horn1', box:[ 0.24,1.32,-0.84, 0.09,0.2,0.09], tex:'m_horn' },
      { n:'euter', box:[-0.12,0.66,0.12, 0.24,0.1,0.28], tex:'m_euter' },
      { n:'l0', box:[-0.34,0.0,-0.5, 0.25,0.75,0.25], tex:'m_kuh_bein', anim:'leg', ph:0 },
      { n:'l1', box:[ 0.09,0.0,-0.5, 0.25,0.75,0.25], tex:'m_kuh_bein', anim:'leg', ph:1 },
      { n:'l2', box:[-0.34,0.0, 0.25, 0.25,0.75,0.25], tex:'m_kuh_bein', anim:'leg', ph:1 },
      { n:'l3', box:[ 0.09,0.0, 0.25, 0.25,0.75,0.25], tex:'m_kuh_bein', anim:'leg', ph:0 },
    ]
  },
  sheep: {
    name:'Schaf', w:0.9, h:1.3, health:8, speed:1.35, hostile:false, laut:'schaf',
    beute: m => (m.geschoren ? [] : [[B.WOOL + m.wolle, 1]]).concat([[ITEM.mutton_raw, zufallN(1, 2)]]),
    parts:[
      { n:'wolle', box:[-0.36,0.6,-0.5, 0.72,0.62,1.0], tex:'m_schaf_wolle', wenn: m => !m.geschoren, farbe: m => WOLLE[m.wolle].tint },
      { n:'body', box:[-0.26,0.7,-0.42, 0.52,0.44,0.84], tex:'m_schaf_haut', wenn: m => m.geschoren },
      { n:'head', box:[-0.19,0.9,-0.8, 0.38,0.38,0.38], tex:'m_schaf_haut', face:'m_schaf_face', anim:'head' },
      { n:'kappe', box:[-0.21,1.2,-0.76, 0.42,0.12,0.32], tex:'m_schaf_wolle', wenn: m => !m.geschoren, farbe: m => WOLLE[m.wolle].tint },
      { n:'l0', box:[-0.3,0.0,-0.42, 0.2,0.7,0.2], tex:'m_schaf_bein', anim:'leg', ph:0 },
      { n:'l1', box:[ 0.1,0.0,-0.42, 0.2,0.7,0.2], tex:'m_schaf_bein', anim:'leg', ph:1 },
      { n:'l2', box:[-0.3,0.0, 0.22, 0.2,0.7,0.2], tex:'m_schaf_bein', anim:'leg', ph:1 },
      { n:'l3', box:[ 0.1,0.0, 0.22, 0.2,0.7,0.2], tex:'m_schaf_bein', anim:'leg', ph:0 },
    ]
  },
  zombie: {
    name:'Zombie', w:0.6, h:1.95, health:20, speed:2.3, hostile:true, dmg:3, laut:'zombie',
    beute: () => [],
    parts:[
      { n:'head', box:[-0.25,1.42,-0.25, 0.5,0.5,0.5], tex:'m_zsk', face:'m_zface', anim:'head' },
      { n:'body', box:[-0.25,0.67,-0.13, 0.5,0.75,0.25], tex:'m_zshirt' },
      { n:'arm0', box:[-0.38,0.67,-0.13, 0.13,0.75,0.25], tex:'m_zsk', anim:'arm', ph:0 },
      { n:'arm1', box:[ 0.25,0.67,-0.13, 0.13,0.75,0.25], tex:'m_zsk', anim:'arm', ph:1 },
      { n:'leg0', box:[-0.25,0.0,-0.13, 0.25,0.68,0.25], tex:'m_zpants', anim:'leg', ph:0 },
      { n:'leg1', box:[ 0.0, 0.0,-0.13, 0.25,0.68,0.25], tex:'m_zpants', anim:'leg', ph:1 },
    ]
  },
  skeleton: {
    name:'Skelett', w:0.6, h:1.95, health:20, speed:2.0, hostile:true, dmg:0, fernkampf:true, laut:'skelett',
    beute: () => [[ITEM.bone, zufallN(0, 2)], [ITEM.arrow, zufallN(0, 2)]].concat(Math.random() < 0.08 ? [[ITEM.bow, 1]] : []),
    parts:[
      { n:'head', box:[-0.25,1.42,-0.25, 0.5,0.5,0.5], tex:'m_skelett', face:'m_skelett_face', anim:'head' },
      { n:'body', box:[-0.22,0.67,-0.1, 0.44,0.75,0.2], tex:'m_skelett_brust' },
      { n:'arm0', box:[-0.32,0.67,-0.06, 0.1,0.75,0.12], tex:'m_skelett_glied', anim:'arm', ph:0 },
      { n:'arm1', box:[ 0.22,0.67,-0.06, 0.1,0.75,0.12], tex:'m_skelett_glied', anim:'arm', ph:1 },
      { n:'bogen', box:[0.04,1.0,-0.84, 0.46,0.66,0.02], tex:'m_bogen' },
      { n:'leg0', box:[-0.19,0.0,-0.06, 0.12,0.68,0.12], tex:'m_skelett_glied', anim:'leg', ph:0 },
      { n:'leg1', box:[ 0.07,0.0,-0.06, 0.12,0.68,0.12], tex:'m_skelett_glied', anim:'leg', ph:1 },
    ]
  }
};

/** Schafe sind meist weiß; Grau, Schwarz und Braun kommen seltener vor */
function wollfarbe(){
  let r = Math.random();
  for(let k = 0; k < WOLLE.length; k++){ r -= WOLLE[k].anteil; if(r <= 0) return k; }
  return 0;
}

class Mob{
  constructor(type, x, y, z){
    const d = MOBS[type];
    this.type = type; this.def = d;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = d.w; this.h = d.h; this.yaw = Math.random()*TAU;
    this.health = d.health; this.onGround = false; this.stepUp = true;
    this.wander = 0; this.wanderYaw = this.yaw; this.moving = false;
    this.hurtTimer = 0; this.attackCd = 0; this.walkPhase = 0; this.dead = false;
    this.jumpCd = 0; this.age = 0; this.headYaw = 0;
    this.schussCd = 1 + Math.random()*1.5; this.seite = Math.random() < .5 ? 1 : -1; this.seiteT = 0;
    if(type === 'sheep'){ this.wolle = wollfarbe(); this.geschoren = false; this.wolleT = 0; }
  }
}

/* ── Pfeile ─────────────────────────────────────────────────────────
   Fliegen mit Schwerkraft, prüfen unterwegs Blöcke und Wesen. Pfeile des
   Spielers, die im Boden stecken, kann man wieder aufheben. */
class Pfeil{
  constructor(x, y, z, vx, vy, vz, dmg, vomSpieler){
    this.x = x; this.y = y; this.z = z; this.vx = vx; this.vy = vy; this.vz = vz;
    this.dmg = dmg; this.vomSpieler = vomSpieler;
    this.alter = 0; this.steckt = false; this.weg = false;
  }
}

/* ── Liegende Gegenstände ──────────────────────────────────────────── */
class Drop{
  constructor(id, count, x, y, z){
    this.id = id; this.count = count;
    this.x = x; this.y = y; this.z = z;
    this.vx = (Math.random()-.5)*2; this.vy = 2.4; this.vz = (Math.random()-.5)*2;
    this.w = 0.28; this.h = 0.28; this.onGround = false; this.stepUp = false;
    this.age = 0; this.pickDelay = 0.5; this.dead = false;
  }
}
