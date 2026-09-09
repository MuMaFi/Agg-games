import * as THREE from 'three';
import { BAT_COOLDOWN, BAT_SWING_TIME, CARRY_SPEED_MULT, GRAVITY, HIT_KNOCKBACK, HIT_STUN_TIME, JUMP_VELOCITY, PLAYER_HEIGHT, TURN_LERP, } from './config.js';
import { TextSprite } from './textSprite.js';
let nextEntityId = 1;
/**
 * A walking, bat-swinging, brainrot-carrying character. The player and every
 * AI bot share this implementation; only the controllers differ.
 *
 * Animation comes from the R6 rig's own clips (Idle / RunAnim / Jump / Fall),
 * with the Tool clip overlaid for bat attacks. The bat is mounted on the
 * right hand bone so swings track the animated arm.
 */
export class Entity {
    id = nextEntityId++;
    name;
    isPlayer;
    colorHex;
    money;
    home;
    root;
    rig;
    world;
    // movement state
    moveIntent = new THREE.Vector2(0, 0); // x/z plane, normalized
    baseSpeed;
    velY = 0;
    grounded = true;
    knockback = new THREE.Vector3();
    stunTimer = 0;
    targetYaw = 0;
    hasMoved = false;
    // combat state
    swingCooldown = 0;
    swingT = -1; // -1 = not swinging, else seconds into the swing
    swingHitConsumed = true;
    // animation
    mixer = null;
    actions = new Map();
    loco = 'idle';
    toolAction = null;
    // carrying
    carried = null;
    carryMount;
    armBase = new Map();
    // cosmetics
    nameplate;
    constructor(opts) {
        this.name = opts.name;
        this.isPlayer = opts.isPlayer;
        this.world = opts.world;
        this.baseSpeed = opts.speed;
        this.money = opts.money;
        this.colorHex = '#' + new THREE.Color(opts.color).getHexString();
        this.rig = opts.assets.makeCharacter(opts.hueShift);
        this.root = new THREE.Group();
        // With its animation clips playing, the R6 rig faces +Z — same as
        // game-forward, so no flip is needed (verified empirically).
        this.root.add(this.rig.root);
        for (const b of [this.rig.bones.leftArm, this.rig.bones.rightArm]) {
            if (b)
                this.armBase.set(b, b.quaternion.clone());
        }
        // ---- animation clips ----
        if (this.rig.clips.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.rig.mixerTarget);
            const grab = (key, needle, exclude) => {
                const clip = this.rig.clips.find((c) => {
                    const n = c.name.toLowerCase();
                    return n.includes(needle) && (!exclude || !n.includes(exclude));
                });
                if (clip)
                    this.actions.set(key, this.mixer.clipAction(clip));
            };
            grab('idle', '|idle', 'idle2');
            grab('run', 'runanim');
            grab('walk', 'walkanim');
            grab('jump', '|jump');
            grab('fall', '|fall');
            grab('tool', '|tool');
            if (!this.actions.has('run') && this.actions.has('walk')) {
                this.actions.set('run', this.actions.get('walk'));
            }
            const idle = this.actions.get('idle');
            if (idle) {
                idle.play();
                // de-sync crowd idles
                this.mixer.update(Math.random() * 2);
            }
            this.toolAction = this.actions.get('tool') ?? null;
            if (this.toolAction) {
                this.toolAction.setLoop(THREE.LoopOnce, 1);
                const dur = this.toolAction.getClip().duration;
                this.toolAction.timeScale = dur / BAT_SWING_TIME;
            }
        }
        // ---- bat mounted on the right hand ----
        const bat = opts.assets.makeBat();
        const hand = this.rig.bones.rightArmEnd ?? this.rig.bones.rightArm;
        if (hand) {
            const mount = new THREE.Group();
            hand.add(mount);
            this.rig.root.updateWorldMatrix(true, true);
            // cancel the rig's internal scale so the bat keeps world size
            const ws = new THREE.Vector3();
            hand.getWorldScale(ws);
            const avg = Math.max((Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3, 1e-6);
            mount.scale.setScalar(1 / avg);
            // orient the bat to continue outward along the arm (shoulder -> hand),
            // regardless of how this rig's bone axes are authored
            const shoulder = this.rig.bones.rightArm ?? hand;
            const shoulderPos = new THREE.Vector3();
            const handPos = new THREE.Vector3();
            shoulder.getWorldPosition(shoulderPos);
            hand.getWorldPosition(handPos);
            const dirWorld = handPos.clone().sub(shoulderPos);
            if (dirWorld.lengthSq() < 1e-8)
                dirWorld.set(0, -1, 0);
            dirWorld.normalize();
            const handWorldQuat = new THREE.Quaternion();
            hand.getWorldQuaternion(handWorldQuat);
            const dirLocal = dirWorld.clone().applyQuaternion(handWorldQuat.clone().invert());
            mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirLocal);
            // grip slightly above the hand tip so the knob sits in the fist
            bat.position.y = -0.12;
            mount.add(bat);
        }
        else {
            // no usable hand bone: hold it at the hip
            bat.position.set(PLAYER_HEIGHT * 0.32, PLAYER_HEIGHT * 0.45, 0.1);
            bat.rotation.z = -0.4;
            this.root.add(bat);
        }
        // Carried brainrots ride above the head, classic steal-a-brainrot style.
        this.carryMount = new THREE.Group();
        this.carryMount.position.set(0, PLAYER_HEIGHT + 0.15, 0);
        this.root.add(this.carryMount);
        this.nameplate = new TextSprite(this.name, {
            color: this.colorHex,
            worldHeight: 0.38,
            fontSize: 44,
        });
        this.nameplate.position.set(0, PLAYER_HEIGHT + 0.55, 0);
        this.root.add(this.nameplate);
    }
    get position() {
        return this.root.position;
    }
    get isStunned() {
        return this.stunTimer > 0;
    }
    get isSwinging() {
        return this.swingT >= 0;
    }
    get speed() {
        return this.baseSpeed * (this.carried ? CARRY_SPEED_MULT : 1);
    }
    faceToward(yaw) {
        this.targetYaw = yaw;
        this.hasMoved = true;
    }
    facingDirection() {
        return new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
    }
    jump() {
        if (this.grounded && !this.isStunned) {
            this.velY = JUMP_VELOCITY;
            this.grounded = false;
        }
    }
    /** Try to begin a bat swing. Returns true if the swing started. */
    startSwing() {
        if (this.swingCooldown > 0 || this.isStunned || this.swingT >= 0)
            return false;
        this.swingT = 0;
        this.swingHitConsumed = false;
        this.swingCooldown = BAT_COOLDOWN;
        if (this.toolAction) {
            this.toolAction.reset();
            this.toolAction.fadeIn(0.05);
            this.toolAction.play();
        }
        return true;
    }
    /**
     * Returns true exactly once per swing, at the moment the bat reaches the
     * front of its arc. The Game performs hit detection at that instant.
     */
    consumeSwingImpact() {
        if (this.swingT >= 0 && !this.swingHitConsumed && this.swingT >= BAT_SWING_TIME * 0.45) {
            this.swingHitConsumed = true;
            return true;
        }
        return false;
    }
    /** Got smacked: knockback away from the attacker plus a stun. */
    applyHit(fromPosition) {
        const away = this.position.clone().sub(fromPosition);
        away.y = 0;
        if (away.lengthSq() < 1e-4)
            away.set(0, 0, 1);
        away.normalize().multiplyScalar(HIT_KNOCKBACK);
        this.knockback.add(away);
        this.stunTimer = HIT_STUN_TIME;
        this.velY = Math.max(this.velY, 4.5);
        this.grounded = false;
    }
    /** Attach an item above this character's head. */
    pickUp(item) {
        this.carried = item;
        item.carrier = this;
        item.state = 'carried';
        item.root.position.set(0, 0, 0);
        item.root.rotation.set(0, 0, 0);
        this.carryMount.add(item.root);
        item.refreshLabel();
    }
    /** Detach the carried item, leaving it at this character's position. */
    releaseCarried() {
        const item = this.carried;
        if (!item)
            return null;
        this.carried = null;
        item.carrier = null;
        const worldPos = new THREE.Vector3();
        item.root.getWorldPosition(worldPos);
        this.carryMount.remove(item.root);
        item.root.position.copy(worldPos);
        item.root.rotation.set(0, 0, 0);
        return item;
    }
    setLoco(state) {
        if (state === this.loco)
            return;
        const from = this.actions.get(this.loco);
        const to = this.actions.get(state);
        this.loco = state;
        if (from && to && from !== to) {
            to.reset();
            to.play();
            from.crossFadeTo(to, 0.16, false);
        }
        else if (to && !to.isRunning()) {
            to.reset().play();
        }
    }
    update(dt) {
        // --- timers ---
        if (this.stunTimer > 0)
            this.stunTimer = Math.max(0, this.stunTimer - dt);
        if (this.swingCooldown > 0)
            this.swingCooldown = Math.max(0, this.swingCooldown - dt);
        // --- horizontal movement ---
        const intent = this.isStunned ? new THREE.Vector2(0, 0) : this.moveIntent;
        const moving = intent.lengthSq() > 1e-4;
        const speed = this.speed;
        if (moving) {
            this.position.x += intent.x * speed * dt;
            this.position.z += intent.y * speed * dt;
            this.targetYaw = Math.atan2(intent.x, intent.y);
            this.hasMoved = true;
        }
        // knockback impulse decays quickly
        if (this.knockback.lengthSq() > 1e-4) {
            this.position.x += this.knockback.x * dt;
            this.position.z += this.knockback.z * dt;
            this.knockback.multiplyScalar(Math.max(0, 1 - dt * 5.5));
        }
        this.world.clampToMap(this.position);
        // --- vertical: gravity, jumps and floor snapping ---
        const groundY = this.world.groundHeightAt(this.position.x, this.position.z);
        this.velY -= GRAVITY * dt;
        this.position.y += this.velY * dt;
        if (this.position.y <= groundY) {
            this.position.y = groundY;
            this.velY = 0;
            this.grounded = true;
        }
        else if (this.position.y - groundY < 0.05 && this.velY <= 0) {
            this.position.y = groundY;
            this.velY = 0;
            this.grounded = true;
        }
        else if (this.velY > 0 || this.position.y - groundY > 0.05) {
            this.grounded = false;
        }
        if (this.grounded && groundY > this.position.y) {
            this.position.y = groundY;
        }
        // --- facing ---
        if (this.hasMoved) {
            let delta = this.targetYaw - this.root.rotation.y;
            while (delta > Math.PI)
                delta -= Math.PI * 2;
            while (delta < -Math.PI)
                delta += Math.PI * 2;
            this.root.rotation.y += delta * Math.min(1, TURN_LERP * dt);
        }
        // --- animation state machine ---
        if (this.mixer) {
            if (!this.grounded) {
                this.setLoco(this.velY > 0.5 ? 'jump' : 'fall');
            }
            else if (moving) {
                this.setLoco('run');
                const run = this.actions.get('run');
                if (run)
                    run.timeScale = THREE.MathUtils.clamp(speed / 7.5, 0.6, 1.6);
            }
            else {
                this.setLoco('idle');
            }
            this.mixer.update(dt);
            // carrying overrides both arms to reach up and hold the brainrot
            if (this.carried) {
                for (const [bone, base] of this.armBase) {
                    const up = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -2.6);
                    bone.quaternion.copy(base).multiply(up);
                }
            }
        }
        // --- swing timing ---
        if (this.swingT >= 0) {
            this.swingT += dt;
            if (this.swingT >= BAT_SWING_TIME) {
                this.swingT = -1;
                this.toolAction?.fadeOut(0.12);
            }
        }
        // stunned characters wobble
        if (this.isStunned) {
            this.rig.root.rotation.z = Math.sin(performance.now() / 50) * 0.12;
        }
        else {
            this.rig.root.rotation.z = 0;
        }
    }
    setNameplateSuffix(suffix) {
        this.nameplate.setText(suffix ? `${this.name} ${suffix}` : this.name);
    }
    distanceTo(other) {
        return this.position.distanceTo(other.position);
    }
}
