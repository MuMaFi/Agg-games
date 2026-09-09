import { BrainrotItem } from './items.js';
import { rollBrainrot, rollRarity } from './catalog.js';
import { CONVEYOR_MAX_ITEMS, CONVEYOR_SPAWN_INTERVAL, CONVEYOR_SPEED } from './config.js';
/**
 * The central red-carpet conveyor: continually spawns random brainrots at the
 * start of the carpet and marches them down its length. Anyone can walk up
 * and buy them off the belt before they reach the end and despawn.
 */
export class Conveyor {
    items = [];
    spawnTimer = 1.0; // first spawn comes quickly
    assets;
    scene;
    layout;
    direction;
    beltLength;
    onSpawn = null;
    onDespawn = null;
    constructor(assets, scene, layout) {
        this.assets = assets;
        this.scene = scene;
        this.layout = layout;
        this.direction = layout.conveyorEnd.clone().sub(layout.conveyorStart).normalize();
        this.beltLength = layout.conveyorEnd.distanceTo(layout.conveyorStart);
    }
    update(dt) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.items.length < CONVEYOR_MAX_ITEMS) {
            this.spawnOne();
            this.spawnTimer = CONVEYOR_SPAWN_INTERVAL * (0.75 + Math.random() * 0.5);
        }
        const step = this.direction.clone().multiplyScalar(CONVEYOR_SPEED * dt);
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            if (item.state !== 'conveyor') {
                // Someone bought/grabbed it: no longer the belt's problem.
                this.items.splice(i, 1);
                continue;
            }
            item.root.position.add(step);
            const traveled = item.root.position.clone().sub(this.layout.conveyorStart).dot(this.direction);
            if (traveled >= this.beltLength) {
                this.items.splice(i, 1);
                this.onDespawn?.(item);
                item.dispose();
            }
        }
    }
    spawnOne() {
        const def = rollBrainrot();
        const rarity = rollRarity();
        const item = new BrainrotItem(this.assets, def, rarity);
        item.state = 'conveyor';
        item.root.position.copy(this.layout.conveyorStart);
        // face down the belt
        item.root.lookAt(this.layout.conveyorEnd.clone().setY(this.layout.conveyorStart.y));
        this.scene.add(item.root);
        item.refreshLabel();
        this.items.push(item);
        this.onSpawn?.(item);
    }
    /** Claim an item off the belt (buyer pays elsewhere). */
    take(item) {
        const i = this.items.indexOf(item);
        if (i >= 0)
            this.items.splice(i, 1);
    }
    /** Nearest purchasable item to a world position, within maxDist. */
    nearestTo(pos, maxDist) {
        let best = null;
        let bestD = maxDist;
        for (const item of this.items) {
            const d = item.root.position.distanceTo(pos);
            if (d < bestD) {
                bestD = d;
                best = item;
            }
        }
        return best;
    }
}
