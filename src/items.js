// =========================================================
// ARENA ITEM DROPS & HEIRLOOM (PUSAKA) MECHANICS
// Interactive Pickup: Kendi Amerta & Wijayakusuma
// =========================================================

export const ITEM_TYPES = {
  KENDI_AMERTA: {
    id: 'kendi_amerta',
    name: 'Kendi Amerta',
    nameEn: 'Amerta Nectar Flask',
    healHp: 25,
    energyBonus: 15,
    colorA: [0.15, 0.75, 0.45],
    colorB: [0.75, 1.0, 0.85],
    desc: 'Air suci keabadian memulihkan 25 HP!',
    descEn: 'Sacred immortality nectar restored 25 HP!',
  },
  WIJAYAKUSUMA: {
    id: 'wijayakusuma',
    name: 'Bunga Wijayakusuma',
    nameEn: 'Wijayakusuma Bloom',
    healHp: 38,
    energyBonus: 35,
    colorA: [0.85, 0.65, 0.15],
    colorB: [1.0, 0.95, 0.65],
    desc: 'Bunga pusaka dewa memulihkan raga dan energi!',
    descEn: 'Divine blossom deeply restores vitality and energy!',
  },
  KERIS_PUSAKA: {
    id: 'keris_pusaka',
    name: 'Keris Kyai Jalak',
    nameEn: 'Ancient Kris Relic',
    healHp: 10,
    energyBonus: 40,
    attackBuff: 1.25, // +25% attack
    buffDuration: 7.0,
    colorA: [0.75, 0.25, 0.85],
    colorB: [0.95, 0.75, 1.0],
    desc: 'Pusaka sakral meningkatkan daya serang +25%!',
    descEn: 'Sacred kris bestows +25% attack power surge!',
  },
};

export class ArenaItemManager {
  constructor() {
    this.items = [];
    this.spawnTimer = 16.0; // first spawn at 16s into round
    this.minSpawnInterval = 18.0;
    this.maxSpawnInterval = 28.0;
  }

  reset() {
    this.items = [];
    this.spawnTimer = 15.0;
  }

  // Spawn an item dropping from top of stage
  spawnItem(view) {
    const types = [ITEM_TYPES.KENDI_AMERTA, ITEM_TYPES.WIJAYAKUSUMA, ITEM_TYPES.KERIS_PUSAKA];
    const type = types[Math.floor(Math.random() * types.length)];
    const margin = view.w * 0.22;
    const x = view.x + margin + Math.random() * (view.w - margin * 2);
    const startY = view.y + 40;
    const groundY = view.y + view.h * 0.68 + Math.random() * 40;

    this.items.push({
      type,
      x,
      y: startY,
      targetY: groundY,
      vy: 140, // falling velocity
      radius: 36,
      bobPhase: Math.random() * Math.PI * 2,
      active: true,
      lifetime: 18.0, // despawns after 18 seconds if unclaimed
    });
  }

  update(dt, view, puppets, onPickup = () => {}) {
    // 1. Spawner timer
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.items.filter((it) => it.active).length < 2) {
        this.spawnItem(view);
      }
      this.spawnTimer = this.minSpawnInterval + Math.random() * (this.maxSpawnInterval - this.minSpawnInterval);
    }

    // 2. Update active items
    for (const item of this.items) {
      if (!item.active) continue;

      item.lifetime -= dt;
      if (item.lifetime <= 0) {
        item.active = false;
        continue;
      }

      // Falling physics towards ground
      if (item.y < item.targetY) {
        item.y += item.vy * dt;
        if (item.y >= item.targetY) {
          item.y = item.targetY;
        }
      } else {
        // Floating gentle bob on ground
        item.bobPhase += dt * 3.2;
        item.y = item.targetY + Math.sin(item.bobPhase) * 6;
      }

      // 3. Collision check with puppets (player 1 and player 2)
      for (let pIdx = 0; pIdx < puppets.length; pIdx++) {
        const p = puppets[pIdx];
        if (!p) continue;

        // Check puppet body anchor position
        const bodyDist = Math.hypot(p.pos.x - item.x, p.pos.y - item.y);
        // Check puppet arm grips
        const armLDist = p.arms?.L?.target ? Math.hypot(p.arms.L.target.x - item.x, p.arms.L.target.y - item.y) : 999;
        const armRDist = p.arms?.R?.target ? Math.hypot(p.arms.R.target.x - item.x, p.arms.R.target.y - item.y) : 999;

        const hit = bodyDist < item.radius + 40 || armLDist < item.radius + 25 || armRDist < item.radius + 25;
        if (hit) {
          item.active = false;
          onPickup(item, pIdx);
          break;
        }
      }
    }
  }

  // Render items as ornate glowing heirloom artifacts in WebGL
  toRenderItems() {
    const renderItems = [];
    for (let idx = 0; idx < this.items.length; idx++) {
      const it = this.items[idx];
      if (!it.active) continue;

      const s = 1.0;
      const x = it.x;
      const y = it.y;
      const colA = it.type.colorA;
      const colB = it.type.colorB;

      // Stylized Kendi Jug / Sacred Flower contour
      renderItems.push({
        kind: 'stick',
        id: `arena_item_${idx}_body`,
        style: 'particle',
        alpha: 0.95,
        colorA: colA,
        colorB: colB,
        seed: 4.2,
        pts: [
          { p: [x, y - 24 * s], w: 4 * s },
          { p: [x, y - 10 * s], w: 7 * s },
          { p: [x, y + 8 * s], w: 18 * s },
          { p: [x, y + 22 * s], w: 14 * s },
        ],
        ties: [],
      });

      // Spout / decorative crest
      renderItems.push({
        kind: 'stick',
        id: `arena_item_${idx}_spout`,
        style: 'particle',
        alpha: 0.9,
        colorA: [1.0, 0.85, 0.35],
        colorB: [1.0, 0.95, 0.75],
        seed: 8.5,
        pts: [
          { p: [x + 8 * s, y - 2 * s], w: 4 * s },
          { p: [x + 18 * s, y - 12 * s], w: 3 * s },
        ],
        ties: [],
      });
    }
    return renderItems;
  }
}
