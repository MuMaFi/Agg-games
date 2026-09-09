import * as THREE from 'three';
import { Daumen } from './daumen.js';
/**
 * Keyboard + mouse controls with a third-person orbit camera.
 * Click the canvas to lock the pointer; WASD to run, Space to jump,
 * Left-click / F to swing the bat, E to interact.
 */
export class PlayerController {
    entity;
    camera;
    dom;
    /** Meshes the camera should not clip through (the map). */
    occluders = [];
    occlusionRay = new THREE.Raycaster();
    keys = new Set();
    yaw = Math.PI; // look toward -Z initially
    pitch = 0.42;
    dist = 8.5;
    interactQueued = false;
    swingQueued = false;
    pointerLocked = false;
    daumen = null;         // Daumensteuerung, sobald ein Finger da war
    constructor(entity, camera, dom) {
        this.entity = entity;
        this.camera = camera;
        this.dom = dom;
        window.addEventListener('keydown', (e) => {
            if (e.repeat)
                return;
            this.keys.add(e.code);
            if (e.code === 'KeyE')
                this.interactQueued = true;
            if (e.code === 'KeyF')
                this.swingQueued = true;
            if (e.code === 'Space') {
                e.preventDefault();
                this.entity.jump();
            }
        });
        window.addEventListener('keyup', (e) => this.keys.delete(e.code));
        window.addEventListener('blur', () => this.keys.clear());
        this.dom.addEventListener('mousedown', (e) => {
            if (this.daumen && this.daumen.aktiv)
                return;               // am Telefon gibt es keinen Pointer-Lock
            if (!this.pointerLocked) {
                this.dom.requestPointerLock();
                return;
            }
            if (e.button === 0)
                this.swingQueued = true;
        });
        document.addEventListener('pointerlockchange', () => {
            this.pointerLocked = document.pointerLockElement === this.dom;
        });
        document.addEventListener('mousemove', (e) => {
            if (!this.pointerLocked)
                return;
            this.yaw -= e.movementX * 0.0026;
            this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * 0.0022, -0.15, 1.25);
        });
        window.addEventListener('wheel', (e) => {
            this.dist = THREE.MathUtils.clamp(this.dist + Math.sign(e.deltaY) * 0.8, 4, 16);
        });
        this.daumen = new Daumen({
            springen: () => this.entity.jump(),
            schlagen: () => { this.swingQueued = true; },
            nutzen: () => { this.interactQueued = true; },
            umsehen: (dx, dy) => {
                this.yaw -= dx * 0.0060;
                this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0050, -0.15, 1.25);
            },
        });
    }
    consumeInteract() {
        const v = this.interactQueued;
        this.interactQueued = false;
        return v;
    }
    consumeSwing() {
        const v = this.swingQueued;
        this.swingQueued = false;
        return v;
    }
    update(dt) {
        // movement relative to camera yaw
        let fwd = 0;
        let strafe = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))
            fwd += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))
            fwd -= 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
            strafe -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight'))
            strafe += 1;
        /* Der Knüppel gibt Zwischenwerte her: leicht gedrückt heißt langsam.
           Deshalb wird unten nur noch gekürzt, was länger als eins ist,
           statt jede Richtung auf volles Tempo zu normieren. */
        if (this.daumen && (this.daumen.knueppel.x !== 0 || this.daumen.knueppel.y !== 0)) {
            strafe += this.daumen.knueppel.x;
            fwd -= this.daumen.knueppel.y;
        }
        const intent = new THREE.Vector2(0, 0);
        if (fwd !== 0 || strafe !== 0) {
            const sin = Math.sin(this.yaw);
            const cos = Math.cos(this.yaw);
            // camera-forward on the xz plane is (sin(yaw)*-1? ) — derive from camera
            const forward = new THREE.Vector2(-sin, -cos); // camera looks toward entity from offset
            const right = new THREE.Vector2(-forward.y, forward.x);
            intent.addScaledVector(forward, fwd);
            intent.addScaledVector(right, strafe);
            if (intent.lengthSq() > 1)
                intent.normalize();
        }
        this.entity.moveIntent.copy(intent);
        // when the player swings, face the camera direction for an aimed hit
        if (this.entity.isSwinging) {
            this.entity.faceToward(Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw)));
        }
        // third-person orbit camera
        const target = this.entity.position.clone();
        target.y += 1.5;
        const offset = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.dist);
        const desired = target.clone().add(offset);
        // pull the camera in front of any map geometry blocking the view
        if (this.occluders.length > 0) {
            const dir = desired.clone().sub(target);
            const len = dir.length();
            dir.normalize();
            this.occlusionRay.set(target, dir);
            this.occlusionRay.far = len;
            const hits = this.occlusionRay.intersectObjects(this.occluders, true);
            if (hits.length > 0 && hits[0].distance < len) {
                desired.copy(target).addScaledVector(dir, Math.max(1.2, hits[0].distance - 0.4));
            }
        }
        const lerp = 1 - Math.pow(0.0001, dt);
        this.camera.position.lerp(desired, lerp);
        this.camera.lookAt(target);
    }
}
