import * as THREE from 'three';
import { formatMoney } from './catalog.js';
import { RETURN_FLIGHT_TIME, RETURN_FLIGHT_ARC } from './config.js';
import { TextSprite } from './textSprite.js';
let nextItemId = 1;
/**
 * A single collectible Brainrot character in the world. It can ride the
 * conveyor, lie on the ground, be carried over a character's head, stand in
 * a base slot printing money, or fly back home after a thief gets batted.
 */
export class BrainrotItem {
    id = nextItemId++;
    def;
    rarity;
    root;
    state = 'conveyor';
    /** Entity currently carrying this item (state === 'carried'). */
    carrier = null;
    /** Base this item is stored in (state === 'stored'). */
    storedIn = null;
    storedSlot = -1;
    /** If the item was stolen out of a base, where it must fly back to. */
    stolenFromBase = null;
    stolenFromSlot = -1;
    mixer = null;
    nameSprite;
    infoSprite;
    // return-flight interpolation
    flightT = 0;
    flightFrom = new THREE.Vector3();
    flightTo = new THREE.Vector3();
    onFlightDone = null;
    constructor(assets, def, rarity) {
        this.def = def;
        this.rarity = rarity;
        const model = assets.makeBrainrot(def.id, rarity.scale);
        this.root = model.root;
        if (model.clips.length > 0) {
            this.mixer = new THREE.AnimationMixer(model.mixerTarget);
            // Prefer the longest clip; merged-animation FBX exports often include
            // tiny technical clips alongside the real loop.
            let best = model.clips[0];
            for (const c of model.clips)
                if (c.duration > best.duration)
                    best = c;
            const action = this.mixer.clipAction(best);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.timeScale = 0.9 + Math.random() * 0.25;
            action.play();
            // de-sync clones so the belt doesn't look like a chorus line
            this.mixer.update(Math.random() * best.duration);
        }
        this.nameSprite = new TextSprite(def.name, {
            color: rarity.color,
            worldHeight: 0.42,
            fontSize: 46,
        });
        this.infoSprite = new TextSprite('', {
            color: '#ffffff',
            worldHeight: 0.34,
            fontSize: 40,
            background: 'rgba(0,0,0,0.45)',
        });
        this.nameSprite.position.y = rarity.scale + 0.75;
        this.infoSprite.position.y = rarity.scale + 0.35;
        this.root.add(this.nameSprite);
        this.root.add(this.infoSprite);
        this.refreshLabel();
    }
    refreshLabel() {
        this.nameSprite.setText(`${this.def.name}`);
        switch (this.state) {
            case 'conveyor':
            case 'ground':
                this.infoSprite.setText(`${this.rarity.label} • ${formatMoney(this.rarity.price)}`);
                break;
            case 'stored':
                this.infoSprite.setText(`${formatMoney(this.rarity.incomePerSec)}/s`);
                break;
            case 'carried':
                this.infoSprite.setText(this.stolenFromBase ? 'STOLEN!' : this.rarity.label);
                break;
            case 'returning':
                this.infoSprite.setText('Fliegt zurück…');
                break;
        }
        this.infoSprite.visible = true;
        this.nameSprite.visible = true;
    }
    /** Begin the smooth automatic flight back to its original base slot. */
    startReturnFlight(target, onDone) {
        this.state = 'returning';
        this.carrier = null;
        this.flightT = 0;
        this.root.getWorldPosition(this.flightFrom);
        this.flightTo.copy(target);
        this.onFlightDone = onDone;
        this.refreshLabel();
    }
    update(dt) {
        if (this.mixer)
            this.mixer.update(dt);
        if (this.state === 'returning') {
            this.flightT += dt / RETURN_FLIGHT_TIME;
            const t = Math.min(this.flightT, 1);
            const ease = t * t * (3 - 2 * t); // smoothstep
            const pos = new THREE.Vector3().lerpVectors(this.flightFrom, this.flightTo, ease);
            pos.y += Math.sin(Math.PI * ease) * RETURN_FLIGHT_ARC;
            this.root.position.copy(pos);
            this.root.rotation.y += dt * 6; // celebratory spin on the way home
            if (t >= 1) {
                this.root.rotation.y = 0;
                const cb = this.onFlightDone;
                this.onFlightDone = null;
                if (cb)
                    cb();
            }
        }
        else if (this.state === 'conveyor' || this.state === 'ground') {
            // idle bob so loose items feel alive
            this.root.rotation.y += dt * (this.state === 'conveyor' ? 0.8 : 0.4);
        }
    }
    dispose() {
        this.root.parent?.remove(this.root);
        this.root.traverse((c) => {
            const mesh = c;
            if (mesh.isMesh) {
                mesh.geometry?.dispose();
            }
        });
    }
}
