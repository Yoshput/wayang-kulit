// =========================================================
// DUEL COMBAT ENGINE, STATE MACHINE & HIT DETECTION
// Best-of-3 Rounds, Adaptive AI, Projectiles & Hitboxes
// =========================================================

import { CHARACTERS } from './characters.js';

export const COMBAT_MODES = {
  PAGELARAN: 'pagelaran', // Original classical mode
  DUEL_PV_AI: 'duel_pv_ai', // Player vs AI
  DUEL_PVP: 'duel_pvp',   // 2 Hands / 2 Players local
};

export const MATCH_STATES = {
  SELECT: 'select',
  INTRO: 'intro',
  FIGHTING: 'fighting',
  ROUND_OVER: 'round_over',
  MATCH_OVER: 'match_over',
};

export class CombatEngine {
  constructor({ particles, items, onStateChange = () => {}, onToast = () => {} }) {
    this.particles = particles;
    this.items = items;
    this.onStateChange = onStateChange;
    this.onToast = onToast;

    this.mode = COMBAT_MODES.PAGELARAN;
    this.state = MATCH_STATES.SELECT;

    this.round = 1;
    this.maxRounds = 3;
    this.roundTimer = 60.0;
    this.stateTimer = 0;

    this.p1 = this._createFighterState('arjuna', false);
    this.p2 = this._createFighterState('kazuya', true);

    this.projectiles = [];
    this.winner = null; // 1 or 2
    this.roundWinner = null;
    this.gununganTransition = 1.0; // 1.0 = planted, 0.0 = cleared
    this.gununganPlanting = true;
  }

  _createFighterState(charId, isAI = false) {
    const char = CHARACTERS[charId] || CHARACTERS.arjuna;
    return {
      charId,
      char,
      hp: char.stats.hp,
      maxHp: char.stats.hp,
      energy: 30, // start with a little energy
      roundsWon: 0,
      cooldowns: {
        sabetan: 0,
        projectile: 0,
        signature: 0,
        ultimate: 0,
        heal: 0,
      },
      buffs: {
        attack: 1.0,
        defense: 0,
        timer: 0,
      },
      invulnerableTimer: 0,
      hitstunTimer: 0,
      isMeditating: false,
      isAttacking: false,
      attackTimer: 0,
      activeHitbox: null,
      isAI,
      aiActionTimer: 1.0,
      stats: { ...char.stats },
    };
  }

  setFighter(playerIndex, charId) {
    const char = CHARACTERS[charId];
    if (!char) return;
    if (playerIndex === 0) {
      this.p1 = this._createFighterState(charId, false);
    } else {
      this.p2 = this._createFighterState(charId, this.mode === COMBAT_MODES.DUEL_PV_AI);
    }
  }

  startMatch() {
    this.round = 1;
    this.p1.roundsWon = 0;
    this.p2.roundsWon = 0;
    this.winner = null;
    this.items.reset();
    this.startRound();
  }

  startRound() {
    this.p1.hp = this.p1.maxHp;
    this.p2.hp = this.p2.maxHp;
    this.p1.energy = 30;
    this.p2.energy = 30;
    this.p1.hitstunTimer = 0;
    this.p2.hitstunTimer = 0;
    this.p1.isMeditating = false;
    this.p2.isMeditating = false;
    this.projectiles = [];
    this.roundTimer = 60.0;
    this.roundWinner = null;

    this.state = MATCH_STATES.INTRO;
    this.stateTimer = 2.2; // 2.2s round intro
    this.gununganTransition = 1.0;
    this.gununganPlanting = false; // lifts up
    this.onToast(`Ronde ${this.round} — Siap Bertarung!`);
    this.onStateChange(this.state);
  }

  // Trigger attack/skill for a fighter
  executeAction(playerIdx, action) {
    if (this.state !== MATCH_STATES.FIGHTING) return;
    const attacker = playerIdx === 0 ? this.p1 : this.p2;
    const opponent = playerIdx === 0 ? this.p2 : this.p1;
    if (attacker.hitstunTimer > 0) return; // unable to act during hitstun

    const skills = attacker.char.skills;

    // 1. Sabetan (Heavy Strike)
    if (action === 'heavy_sabetan' && attacker.cooldowns.sabetan <= 0) {
      attacker.cooldowns.sabetan = skills.sabetan.cooldown;
      attacker.isAttacking = true;
      attacker.attackTimer = 0.28;
      attacker.isMeditating = false;
      attacker.energy = Math.min(100, attacker.energy + (skills.sabetan.energyGain || 10));
      attacker.activeHitbox = {
        type: 'melee',
        damage: skills.sabetan.damage * (attacker.buffs.attack || 1.0),
        lifesteal: skills.sabetan.lifesteal || 0,
        radius: 75,
      };
      this.particles.soundSynth.playHit(false);
    }

    // 2. Shoot Projectile (Panah / Pusaka)
    else if (action === 'shoot_projectile' && attacker.cooldowns.projectile <= 0) {
      if (attacker.energy >= skills.projectile.energyCost) {
        attacker.energy -= skills.projectile.energyCost;
        attacker.cooldowns.projectile = skills.projectile.cooldown;
        attacker.isMeditating = false;

        const dir = playerIdx === 0 ? 1 : -1;
        const startX = playerIdx === 0 ? 640 : 1280; // approximate stage position
        this.projectiles.push({
          owner: playerIdx,
          x: startX,
          y: 560,
          vx: (skills.projectile.speed || 750) * dir,
          vy: 0,
          radius: 28,
          damage: skills.projectile.damage * (attacker.buffs.attack || 1.0),
          colorA: attacker.char.accentColor === '#ef4444' ? [0.85, 0.15, 0.15] : [0.95, 0.85, 0.35],
          colorB: [1.0, 0.95, 0.65],
          type: skills.projectile.projectileType || 'arrow',
          life: 2.2,
        });
        this.particles.soundSynth.playHit(false);
      } else {
        this.onToast(playerIdx === 0 ? 'Energi Belum Cukup!' : '');
      }
    }

    // 3. Signature Skill
    else if (action === 'signature_skill' && attacker.cooldowns.signature <= 0) {
      if (attacker.energy >= (skills.signature.energyCost || 30)) {
        attacker.energy -= skills.signature.energyCost || 30;
        attacker.cooldowns.signature = skills.signature.cooldown;
        attacker.isMeditating = false;

        // Apply skill effects: Buff, Heal, or Burst
        if (skills.signature.healAmount) {
          attacker.hp = Math.min(attacker.maxHp, attacker.hp + skills.signature.healAmount);
          this.particles.spawnHealAura(playerIdx === 0 ? 640 : 1280, 560);
          this.onToast(`${attacker.char.name}: +${skills.signature.healAmount} HP`);
        }
        if (skills.signature.defenseBuff) {
          attacker.buffs.defense = skills.signature.defenseBuff;
          attacker.buffs.timer = skills.signature.duration || 4.0;
        }
        if (skills.signature.damage) {
          // Melee burst / dash strike
          attacker.isAttacking = true;
          attacker.attackTimer = 0.35;
          attacker.activeHitbox = {
            type: 'signature',
            damage: skills.signature.damage * (attacker.buffs.attack || 1.0),
            radius: 95,
          };
        }
        this.particles.soundSynth.playHit(true);
      }
    }

    // 4. Ultimate (Dua Tangan Merapat / Full Energy)
    else if (action === 'ultimate' && attacker.cooldowns.ultimate <= 0) {
      if (attacker.energy >= 100) {
        attacker.energy = 0;
        attacker.cooldowns.ultimate = 12.0;
        attacker.isMeditating = false;

        // Flash kelir screen & heavy sound
        this.particles.addTrauma(0.85);
        this.particles.soundSynth.playUltimateGong();
        this.onToast(`⚡ ULTIMATE: ${skills.ultimate.name}!`);

        // Heavy damage dealing burst
        const dmg = skills.ultimate.damage;
        this.applyDamage(opponent, dmg, playerIdx === 0 ? 1 : -1, true);

        if (skills.ultimate.healAmount) {
          attacker.hp = Math.min(attacker.maxHp, attacker.hp + skills.ultimate.healAmount);
          this.particles.spawnHealAura(playerIdx === 0 ? 640 : 1280, 560, 60);
        }
      } else {
        this.onToast('Butuh 100% Energi untuk Ultimate!');
      }
    }

    // 5. Dash / Evade
    else if (action === 'dash_left' || action === 'dash_right') {
      attacker.invulnerableTimer = 0.35; // I-frames during dash
      attacker.isMeditating = false;
      this.particles.spawnHitSparks(playerIdx === 0 ? 640 : 1280, 600);
    }

    // 6. Meditation Heal (Telapak Atas)
    else if (action === 'meditate_heal') {
      attacker.isMeditating = true;
    }
  }

  // Damage calculation & response
  applyDamage(target, rawDamage, dirX = 1, isUltimate = false) {
    if (target.invulnerableTimer > 0) return; // dodged

    // Calculate defense reduction
    const defMultiplier = 1.0 - (target.buffs.defense || 0);
    const finalDamage = Math.max(3, Math.round(rawDamage * defMultiplier));

    target.hp = Math.max(0, target.hp - finalDamage);
    target.hitstunTimer = isUltimate ? 0.6 : 0.25;
    target.isMeditating = false; // heal broken by damage!

    // Screen Shake & Blood/Spark VFX
    this.particles.addTrauma(isUltimate ? 0.7 : 0.28);
    const targetX = target === this.p1 ? 640 : 1280;
    this.particles.spawnBlood(targetX, 580, finalDamage, dirX);
    this.particles.spawnHitSparks(targetX, 580, dirX);
    this.particles.soundSynth.playHit(isUltimate || finalDamage > 22);

    // Check KO
    if (target.hp <= 0) {
      this.onKnockout(target === this.p1 ? 2 : 1);
    }
  }

  onKnockout(roundWinner) {
    if (this.state !== MATCH_STATES.FIGHTING) return;
    this.roundWinner = roundWinner;
    const winnerFighter = roundWinner === 1 ? this.p1 : this.p2;
    winnerFighter.roundsWon++;

    this.state = MATCH_STATES.ROUND_OVER;
    this.stateTimer = 3.0; // 3 seconds K.O. celebration
    this.gununganPlanting = true; // tancep kayon
    this.particles.addTrauma(0.5);

    if (winnerFighter.roundsWon >= 2) {
      this.winner = roundWinner;
      this.onToast(`K.O.! ${winnerFighter.char.name} Menang Pertarungan!`);
    } else {
      this.onToast(`K.O.! Ronde ${this.round} dimenangkan ${winnerFighter.char.name}`);
    }
    this.onStateChange(this.state);
  }

  // Simple, engaging Fighting Game AI for Player 2
  updateAI(dt, p2Puppet, p1Puppet) {
    if (!this.p2.isAI || this.state !== MATCH_STATES.FIGHTING) return;

    this.p2.aiActionTimer -= dt;
    if (this.p2.aiActionTimer <= 0) {
      this.p2.aiActionTimer = 0.45 + Math.random() * 0.45;

      const p1X = p1Puppet.pos.x;
      const p2X = p2Puppet.pos.x;
      const dist = Math.abs(p2X - p1X);

      // 1. Ultimate if ready
      if (this.p2.energy >= 100) {
        this.executeAction(1, 'ultimate');
        return;
      }

      // 2. Low HP & distant -> meditate heal
      if (this.p2.hp < 40 && dist > 450 && Math.random() < 0.6) {
        this.executeAction(1, 'meditate_heal');
        return;
      }

      // 3. Close range -> Heavy Sabetan or Signature
      if (dist < 260) {
        if (Math.random() < 0.4 && this.p2.cooldowns.signature <= 0) {
          this.executeAction(1, 'signature_skill');
        } else {
          this.executeAction(1, 'heavy_sabetan');
        }
        return;
      }

      // 4. Mid/Long range -> Shoot Projectile
      if (dist > 320 && Math.random() < 0.65) {
        this.executeAction(1, 'shoot_projectile');
        return;
      }
    }
  }

  // Main combat update tick
  update(dt, view, puppets) {
    if (this.mode === COMBAT_MODES.PAGELARAN) return;

    // 1. Gunungan Kayon transition animation
    if (this.gununganPlanting) {
      this.gununganTransition = Math.min(1.0, this.gununganTransition + dt * 1.8);
    } else {
      this.gununganTransition = Math.max(0.0, this.gununganTransition - dt * 1.5);
    }

    // 2. State Machine updates
    if (this.state === MATCH_STATES.INTRO) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = MATCH_STATES.FIGHTING;
        this.onStateChange(this.state);
        this.onToast('MULAI! / FIGHT!');
      }
    } else if (this.state === MATCH_STATES.FIGHTING) {
      // Round timer countdown
      this.roundTimer = Math.max(0, this.roundTimer - dt);
      if (this.roundTimer <= 0) {
        // Time out: highest HP wins
        const rWin = this.p1.hp >= this.p2.hp ? 1 : 2;
        this.onKnockout(rWin);
      }

      // Fighter cooldowns & buff decay
      for (const f of [this.p1, this.p2]) {
        for (const k in f.cooldowns) {
          if (f.cooldowns[k] > 0) f.cooldowns[k] = Math.max(0, f.cooldowns[k] - dt);
        }
        if (f.buffs.timer > 0) {
          f.buffs.timer -= dt;
          if (f.buffs.timer <= 0) {
            f.buffs.defense = 0;
            f.buffs.attack = 1.0;
          }
        }
        if (f.invulnerableTimer > 0) f.invulnerableTimer -= dt;
        if (f.hitstunTimer > 0) f.hitstunTimer -= dt;

        // Meditation heal tick
        if (f.isMeditating) {
          f.hp = Math.min(f.maxHp, f.hp + dt * 12.0); // heal 12 HP/sec
          const fxX = f === this.p1 ? puppets[0]?.pos.x || 640 : puppets[1]?.pos.x || 1280;
          this.particles.spawnHealAura(fxX, 580, 30);
        }

        // Melee attack hitbox decay
        if (f.isAttacking) {
          f.attackTimer -= dt;
          if (f.attackTimer <= 0) {
            f.isAttacking = false;
            f.activeHitbox = null;
          }
        }
      }

      // Check Melee Hitboxes between fighters
      if (puppets.length >= 2) {
        const p1ArmX = puppets[0].arms?.L?.target?.x || puppets[0].pos.x + 80;
        const p1ArmY = puppets[0].arms?.L?.target?.y || puppets[0].pos.y;
        const p2ArmX = puppets[1].arms?.L?.target?.x || puppets[1].pos.x - 80;
        const p2ArmY = puppets[1].arms?.L?.target?.y || puppets[1].pos.y;

        // P1 melee hits P2 body
        if (this.p1.activeHitbox) {
          const distToP2 = Math.hypot(p1ArmX - puppets[1].pos.x, p1ArmY - (puppets[1].pos.y - 100));
          if (distToP2 < this.p1.activeHitbox.radius + 60) {
            this.applyDamage(this.p2, this.p1.activeHitbox.damage, 1);
            if (this.p1.activeHitbox.lifesteal) {
              this.p1.hp = Math.min(this.p1.maxHp, this.p1.hp + this.p1.activeHitbox.damage * this.p1.activeHitbox.lifesteal);
            }
            this.p1.activeHitbox = null; // consume hit
          }
        }

        // P2 melee hits P1 body
        if (this.p2.activeHitbox) {
          const distToP1 = Math.hypot(p2ArmX - puppets[0].pos.x, p2ArmY - (puppets[0].pos.y - 100));
          if (distToP1 < this.p2.activeHitbox.radius + 60) {
            this.applyDamage(this.p1, this.p2.activeHitbox.damage, -1);
            if (this.p2.activeHitbox.lifesteal) {
              this.p2.hp = Math.min(this.p2.maxHp, this.p2.hp + this.p2.activeHitbox.damage * this.p2.activeHitbox.lifesteal);
            }
            this.p2.activeHitbox = null; // consume hit
          }
        }
      }

      // 3. Projectiles physics & hit detection
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const proj = this.projectiles[i];
        proj.life -= dt;
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;

        // Check collision with target puppet
        const targetPuppet = proj.owner === 0 ? puppets[1] : puppets[0];
        const targetFighter = proj.owner === 0 ? this.p2 : this.p1;

        if (targetPuppet && targetFighter) {
          const dist = Math.hypot(proj.x - targetPuppet.pos.x, proj.y - (targetPuppet.pos.y - 100));
          if (dist < proj.radius + 65) {
            this.applyDamage(targetFighter, proj.damage, Math.sign(proj.vx));
            this.projectiles.splice(i, 1);
            continue;
          }
        }

        // Out of bounds or expired
        if (proj.life <= 0 || proj.x < view.x - 100 || proj.x > view.x + view.w + 100) {
          this.projectiles.splice(i, 1);
        }
      }

      // 4. Update Arena Item Pickups
      this.items.update(dt, view, puppets, (item, pIdx) => {
        const fighter = pIdx === 0 ? this.p1 : this.p2;
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + item.type.healHp);
        fighter.energy = Math.min(100, fighter.energy + item.type.energyBonus);
        if (item.type.attackBuff) {
          fighter.buffs.attack = item.type.attackBuff;
          fighter.buffs.timer = item.type.buffDuration;
        }
        this.particles.spawnHealAura(puppets[pIdx].pos.x, puppets[pIdx].pos.y - 50, 45);
        this.particles.soundSynth.playHit(false);
        this.onToast(`${fighter.char.name} mengambil ${item.type.name}!`);
      });

      // 5. AI update
      if (puppets.length >= 2) {
        this.updateAI(dt, puppets[1], puppets[0]);
      }
    } else if (this.state === MATCH_STATES.ROUND_OVER) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.winner) {
          this.state = MATCH_STATES.MATCH_OVER;
          this.onStateChange(this.state);
        } else {
          this.round++;
          this.startRound();
        }
      }
    }
  }

  // Render projectiles & Kayon into WebGL layer items
  toRenderItems() {
    const renderItems = [];

    // 1. Flying Projectiles
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      const dir = Math.sign(p.vx) || 1;
      renderItems.push({
        kind: 'stick',
        id: `projectile_${i}`,
        style: 'particle',
        alpha: 0.95,
        colorA: p.colorA,
        colorB: p.colorB,
        seed: 7.5,
        pts: [
          { p: [p.x - dir * 32, p.y], w: 2.5 },
          { p: [p.x, p.y], w: 7.5 },
          { p: [p.x + dir * 28, p.y], w: 1.5 },
        ],
        ties: [],
      });
    }

    // 2. Central Gunungan Kayon (Tancep Kayon Transition)
    if (this.gununganTransition > 0.01) {
      const gX = 960;
      // Gunungan descends from top or rises from gedebog floor
      const gY = 540 + (1.0 - this.gununganTransition) * 450;
      const alpha = Math.min(1.0, this.gununganTransition * 1.2);

      renderItems.push({
        kind: 'stick',
        id: 'tancep_kayon_stem',
        style: 'gapit',
        alpha,
        pts: [
          { p: [gX, gY - 260], w: 8 },
          { p: [gX, gY], w: 16 },
          { p: [gX, gY + 380], w: 24 },
        ],
        ties: [[20, 10], [180, 14]],
      });
    }

    return renderItems;
  }
}
