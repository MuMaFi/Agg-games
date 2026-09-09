import * as THREE from 'three';
/** Billboard text label built from a canvas texture. */
export class TextSprite extends THREE.Sprite {
    canvas;
    ctx;
    opts;
    lastText = '';
    constructor(text, options = {}) {
        const canvas = document.createElement('canvas');
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
        });
        super(material);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.opts = {
            fontSize: options.fontSize ?? 48,
            color: options.color ?? '#ffffff',
            outline: options.outline ?? 'rgba(0,0,0,0.85)',
            background: options.background ?? '',
            worldHeight: options.worldHeight ?? 0.5,
            bold: options.bold ?? true,
        };
        this.setText(text);
    }
    setText(text) {
        if (text === this.lastText)
            return;
        this.lastText = text;
        const { fontSize, color, outline, background, worldHeight, bold } = this.opts;
        const font = `${bold ? '900 ' : ''}${fontSize}px "Segoe UI", Arial, sans-serif`;
        this.ctx.font = font;
        const metrics = this.ctx.measureText(text);
        const pad = fontSize * 0.4;
        const w = Math.ceil(metrics.width + pad * 2);
        const h = Math.ceil(fontSize * 1.5);
        this.canvas.width = Math.max(2, w);
        this.canvas.height = Math.max(2, h);
        const ctx = this.ctx;
        ctx.clearRect(0, 0, w, h);
        if (background) {
            ctx.fillStyle = background;
            const r = h * 0.35;
            ctx.beginPath();
            ctx.roundRect(0, 0, w, h, r);
            ctx.fill();
        }
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = fontSize * 0.16;
        ctx.strokeStyle = outline;
        ctx.strokeText(text, w / 2, h / 2);
        ctx.fillStyle = color;
        ctx.fillText(text, w / 2, h / 2);
        const tex = this.material.map;
        tex.needsUpdate = true;
        this.scale.set((w / h) * worldHeight, worldHeight, 1);
    }
}
/** Short-lived rising "+$N" indicator. */
export class FloatingText {
    sprite;
    life = 0;
    maxLife = 1.1;
    velY;
    constructor(text, color, position, scene, worldHeight = 0.55) {
        this.sprite = new TextSprite(text, { color, worldHeight, fontSize: 44 });
        this.sprite.position.copy(position);
        this.velY = 1.4;
        scene.add(this.sprite);
    }
    /** Returns false when expired (and removes itself from the scene). */
    update(dt) {
        this.life += dt;
        this.sprite.position.y += this.velY * dt;
        const mat = this.sprite.material;
        mat.opacity = Math.max(0, 1 - this.life / this.maxLife);
        if (this.life >= this.maxLife) {
            this.sprite.parent?.remove(this.sprite);
            mat.map?.dispose();
            mat.dispose();
            return false;
        }
        return true;
    }
}
/**
 * A burst of "$" signs launched on parabolic arcs (up and outward, pulled
 * back down by gravity) — played when collecting money from a brainrot.
 */
export class MoneyBurst {
    particles = [];
    life = 0;
    maxLife = 1.25;
    gravity = 12;
    constructor(position, scene, count = 7) {
        for (let i = 0; i < count; i++) {
            const sprite = new TextSprite('$', {
                color: '#5dff5d',
                outline: 'rgba(0,60,0,0.9)',
                worldHeight: 0.4 + Math.random() * 0.2,
                fontSize: 48,
            });
            sprite.position.copy(position);
            sprite.position.y += 0.4;
            const angle = Math.random() * Math.PI * 2;
            const radial = 1.2 + Math.random() * 2.2;
            const vel = new THREE.Vector3(Math.cos(angle) * radial, 4.5 + Math.random() * 3.0, Math.sin(angle) * radial);
            scene.add(sprite);
            this.particles.push({ sprite, vel });
        }
    }
    update(dt) {
        this.life += dt;
        const fade = Math.max(0, 1 - this.life / this.maxLife);
        for (const p of this.particles) {
            p.vel.y -= this.gravity * dt;
            p.sprite.position.addScaledVector(p.vel, dt);
            p.sprite.material.opacity = fade;
        }
        if (this.life >= this.maxLife) {
            for (const p of this.particles) {
                p.sprite.parent?.remove(p.sprite);
                const mat = p.sprite.material;
                mat.map?.dispose();
                mat.dispose();
            }
            return false;
        }
        return true;
    }
}
