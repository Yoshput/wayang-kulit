// =========================================================
// STYLIZED WAYANG BLOOD, HIT-SPARKS & PROJECTILE SYSTEM
// WebGL2-Integrated Object-Pooled Particle Pipeline
// =========================================================

const MAX_PARTICLES = 256;
const BLOOD_KEY = 'wayang.bloodFx';

// Realistic Gamelan Kendang / Plak Sound Synthesizer via Web Audio API
class HitSoundSynthesizer {
  constructor() {
    this.ctx = null;
  }

  _init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Kendang Plak / Sabet hit strike
  playHit(heavy = false) {
    try {
      this._init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Slendro percussion pitch drop
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(heavy ? 220 : 340, t);
      osc.frequency.exponentialRampToValueAtTime(heavy ? 55 : 90, t + (heavy ? 0.22 : 0.14));

      gain.gain.setValueAtTime(heavy ? 0.55 : 0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.24 : 0.15));

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + (heavy ? 0.25 : 0.16));

      // Extra resonant snap click
      const snap = this.ctx.createOscillator();
      const snapGain = this.ctx.createGain();
      snap.type = 'sine';
      snap.frequency.setValueAtTime(heavy ? 850 : 1200, t);
      snap.frequency.exponentialRampToValueAtTime(100, t + 0.05);
      snapGain.gain.setValueAtTime(0.3, t);
      snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      snap.connect(snapGain);
      snapGain.connect(this.ctx.destination);
      snap.start(t);
      snap.stop(t + 0.06);
    } catch {
      // Audio context might be blocked or unavailable
    }
  }

  // Gong / Ultimate reverberation
  playUltimateGong() {
    try {
      this._init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(54, t + 1.8);

      gain.gain.setValueAtTime(0.65, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 2.0);
    } catch {}
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = new Array(MAX_PARTICLES).fill(null).map(() => ({
      active: false,
      type: 'blood', // 'blood' | 'spark' | 'projectile' | 'heal'
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 4,
      length: 12,
      life: 0,
      maxLife: 1.0,
      alpha: 1.0,
      gravity: 480,
      colorA: [0.35, 0.02, 0.02],
      colorB: [0.85, 0.08, 0.05],
      seed: 1.0,
      meta: null,
    }));

    this.trauma = 0; // 0 to 1 for screen shake
    this.shakeOffset = [0, 0];
    this.soundSynth = new HitSoundSynthesizer();
    this.bloodEnabled = this._loadBloodPreference();
  }

  _loadBloodPreference() {
    try {
      const stored = localStorage.getItem(BLOOD_KEY);
      return stored !== null ? stored === 'true' : true; // Default ON
    } catch {
      return true;
    }
  }

  setBloodEnabled(enabled) {
    this.bloodEnabled = !!enabled;
    try {
      localStorage.setItem(BLOOD_KEY, String(this.bloodEnabled));
    } catch {}
  }

  // Trigger screen trauma (shake)
  addTrauma(amount) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  // Spawn Stylized Crimson Blood Sparks at impact point
  spawnBlood(x, y, damage, dirX = 1) {
    if (!this.bloodEnabled) return;
    const count = Math.min(24, Math.max(5, Math.floor(damage * 0.9)));
    for (let i = 0; i < count; i++) {
      const p = this._findDeadParticle();
      if (!p) break;

      const angle = (Math.random() - 0.5) * 1.6 + (dirX > 0 ? 0 : Math.PI);
      const speed = 180 + Math.random() * 420;

      p.active = true;
      p.type = 'blood';
      p.x = x + (Math.random() - 0.5) * 14;
      p.y = y + (Math.random() - 0.5) * 14;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - (80 + Math.random() * 160);
      p.size = 2.5 + Math.random() * 4.5;
      p.length = 8 + Math.random() * 18;
      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.35;
      p.alpha = 1.0;
      p.gravity = 620;
      // Deep leather crimson to ruby red
      p.colorA = [0.28, 0.02, 0.02];
      p.colorB = [0.82, 0.06, 0.04];
      p.seed = Math.random() * 10;
    }
  }

  // Spawn Golden Hit Sparks (Tatahan Prada Emas Flash)
  spawnHitSparks(x, y, dirX = 1) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const p = this._findDeadParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 220 + Math.random() * 380;

      p.active = true;
      p.type = 'spark';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 2.0 + Math.random() * 3.0;
      p.length = 6 + Math.random() * 14;
      p.life = 0;
      p.maxLife = 0.25 + Math.random() * 0.2;
      p.alpha = 1.0;
      p.gravity = 250;
      // Brilliant gold leaf sparks
      p.colorA = [0.85, 0.65, 0.15];
      p.colorB = [1.0, 0.92, 0.55];
      p.seed = Math.random() * 20;
    }
  }

  // Spawn Healing / Meditation Aura Particles
  spawnHealAura(x, y, radius = 40) {
    const count = 3;
    for (let i = 0; i < count; i++) {
      const p = this._findDeadParticle();
      if (!p) break;

      p.active = true;
      p.type = 'heal';
      p.x = x + (Math.random() - 0.5) * radius;
      p.y = y + 20 + Math.random() * 30;
      p.vx = (Math.random() - 0.5) * 40;
      p.vy = -(80 + Math.random() * 120); // floats up
      p.size = 3.5 + Math.random() * 4.0;
      p.length = 8;
      p.life = 0;
      p.maxLife = 0.7 + Math.random() * 0.4;
      p.alpha = 0.9;
      p.gravity = -40; // upward buoyancy
      // Divine emerald / amber soothing glow
      p.colorA = [0.12, 0.65, 0.35];
      p.colorB = [0.65, 1.0, 0.75];
      p.seed = Math.random() * 5;
    }
  }

  _findDeadParticle() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.particles[i].active) return this.particles[i];
    }
    return null;
  }

  // Update physics for all active particles & screen trauma
  update(dt) {
    // 1. Screen Shake Decay (Trauma squared algorithm)
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
      const shakePower = this.trauma * this.trauma;
      const maxOffset = 22 * shakePower;
      const angle = Math.random() * Math.PI * 2;
      this.shakeOffset = [Math.cos(angle) * maxOffset, Math.sin(angle) * maxOffset];
    } else {
      this.shakeOffset = [0, 0];
    }

    // 2. Step Active Particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      // Physics integration
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Alpha fade out
      const progress = p.life / p.maxLife;
      p.alpha = Math.max(0, 1.0 - progress);
    }
  }

  // Convert particles to WebGL stick items so they get illuminated by the blencong
  // and cast projected soft shadows onto the kelir mori!
  toRenderItems() {
    const items = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active || p.alpha <= 0.01) continue;

      // Compute streak velocity vector
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const nx = (p.vx / speed) * p.length;
      const ny = (p.vy / speed) * p.length;

      items.push({
        kind: 'stick',
        id: `fx_part_${i}`,
        style: 'particle',
        alpha: p.alpha,
        colorA: p.colorA,
        colorB: p.colorB,
        seed: p.seed,
        pts: [
          { p: [p.x - nx * 0.4, p.y - ny * 0.4], w: p.size * 0.4 },
          { p: [p.x, p.y], w: p.size },
          { p: [p.x + nx * 0.6, p.y + ny * 0.6], w: p.size * 0.2 },
        ],
        ties: [],
      });
    }
    return items;
  }
}
