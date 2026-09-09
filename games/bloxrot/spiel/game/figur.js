import * as THREE from 'three';

/**
 * Die Spielfigur — aus Kisten gebaut, nicht geladen.
 *
 * Vorher steckte hier ein fertiges Avatarmodell aus dem Netz. Das ist raus:
 * eine Klotzfigur ist in dreißig Zeilen gebaut, wiegt nichts und gehört uns.
 *
 * Der Rest des Spiels erwartet ein Skelett, in dem sich Knochen über ihre
 * Namen finden lassen (`findBone` in assets.js sucht nach 'torso', 'head',
 * 'left'+'arm' und so weiter) und das ohne Animationsspuren auskommt —
 * ohne Clips schaltet character.js von selbst auf die gerechnete Bewegung
 * um. Beides erfüllt diese Figur: die Gelenke sind echte THREE.Bone, die
 * Kisten hängen als Kinder daran.
 *
 * Gelenke sitzen dort, wo sich das Glied drehen soll — Schulter und Hüfte
 * oben, das Fleisch hängt darunter. Sonst rudert die Figur um ihre Mitte.
 */

const HAUT = 0xe0b48a;
const HEMD = 0x3f8ecc;
const HOSE = 0x2f3b52;
const SCHUH = 0x22282f;

function kiste(b, h, t, farbe, y = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(b, h, t),
    new THREE.MeshLambertMaterial({ color: farbe })
  );
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

/** Ein Gelenk mit einem Glied, das nach unten weghängt. */
function glied(name, x, y, b, h, t, farbe, schuh) {
  const knochen = new THREE.Bone();
  knochen.name = name;
  knochen.position.set(x, y, 0);
  knochen.add(kiste(b, h, t, farbe, -h / 2));
  if (schuh) knochen.add(kiste(b * 1.06, h * 0.16, t * 1.12, SCHUH, -h + h * 0.08));
  return knochen;
}

/**
 * @returns {{scene: THREE.Group, animations: THREE.AnimationClip[]}}
 *   dieselbe Form, die der GLTF-Loader liefert — damit bleibt der Aufrufer
 *   in assets.js unverändert.
 */
export function baueFigur() {
  const wurzel = new THREE.Group();
  wurzel.name = 'Figur';

  // Rumpf: Hüfte als Ursprung, Brustkasten darüber
  const torso = new THREE.Bone();
  torso.name = 'Torso';
  torso.position.y = 0.82;
  torso.add(kiste(0.62, 0.72, 0.36, HEMD, 0.36));
  torso.add(kiste(0.64, 0.16, 0.38, HOSE, 0.04));   // Bund
  wurzel.add(torso);

  // Kopf: breiter als hoch, mit Visierstreifen — bewusst keine Kugel und
  // keine Zylinderform, damit die Figur ihr eigenes Gesicht behält.
  const kopf = new THREE.Bone();
  kopf.name = 'Head';
  kopf.position.y = 0.72;
  const schaedel = kiste(0.52, 0.44, 0.46, HAUT, 0.22);
  kopf.add(schaedel);
  const visier = kiste(0.44, 0.13, 0.02, 0x1b2230, 0.26);
  visier.position.z = 0.235;
  kopf.add(visier);
  const schopf = kiste(0.54, 0.1, 0.48, 0x4a3526, 0.47);
  kopf.add(schopf);
  torso.add(kopf);

  // Arme: Schultern außen oben am Rumpf
  const armL = glied('LeftArm', 0.42, 0.66, 0.2, 0.62, 0.22, HEMD);
  const armR = glied('RightArm', -0.42, 0.66, 0.2, 0.62, 0.22, HEMD);
  torso.add(armL, armR);
  // Hand als leeres Gelenk am Armende — daran hängt später der Schläger
  for (const [arm, name] of [[armL, 'LeftArmEnd'], [armR, 'RightArmEnd']]) {
    const hand = new THREE.Bone();
    hand.name = name;
    hand.position.y = -0.62;
    arm.add(hand);
  }
  // Hände: ein Stück Haut am unteren Ende des Ärmels
  armL.add(kiste(0.21, 0.15, 0.23, HAUT, -0.55));
  armR.add(kiste(0.21, 0.15, 0.23, HAUT, -0.55));

  // Beine
  torso.add(
    glied('LeftLeg', 0.17, 0.02, 0.24, 0.78, 0.26, HOSE, true),
    glied('RightLeg', -0.17, 0.02, 0.24, 0.78, 0.26, HOSE, true)
  );

  return { scene: wurzel, animations: [] };
}
