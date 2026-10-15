// =========================================================
// ADVANCED COMBAT GESTURE RECOGNIZER & FALLBACK CONTROLS
// Real-Time MediaPipe Landmark Pattern Matching with Smoothing
// =========================================================

// MediaPipe 21 Hand Landmarks indices
const WRIST = 0;
const THUMB_CMC = 1, THUMB_MCP = 2, THUMB_IP = 3, THUMB_TIP = 4;
const INDEX_MCP = 5, INDEX_PIP = 6, INDEX_DIP = 7, INDEX_TIP = 8;
const MIDDLE_MCP = 9, MIDDLE_PIP = 10, MIDDLE_DIP = 11, MIDDLE_TIP = 12;
const RING_MCP = 13, RING_PIP = 14, RING_DIP = 15, RING_TIP = 16;
const PINKY_MCP = 17, PINKY_PIP = 18, PINKY_DIP = 19, PINKY_TIP = 20;

export const GESTURE_TYPES = {
  NONE: 'none',
  FIST: 'fist',               // Kepalan tangan -> Serangan Kuat (Sabetan)
  TWO_FINGERS: 'two_fingers', // Dua Jari (Telunjuk+Tengah) -> Proyektil (Panah/Pusaka)
  THREE_FINGERS: 'three_fingers', // Tiga Jari -> Skill Khas Karakter
  SWIPE_DASH: 'swipe_dash',   // Swipe Horizontal Cepat -> Dash / Menghindar
  PRAYER_ULTIMATE: 'prayer_ultimate', // Dua Tangan Merapat -> Ultimate
  PALM_UP_HEAL: 'palm_up_heal', // Telapak Menghadap Atas Ditahan -> Meditasi Heal
};

export class CombatGestureDetector {
  constructor() {
    this.history = [];
    this.maxHistory = 15; // ~250ms at 60 FPS
    this.prevPalm = [null, null]; // [slot0, slot1]
    this.palmVelocities = [[0, 0], [0, 0]];
    this.healHoldTimer = [0, 0]; // seconds held in palm-up
    this.healTargetDuration = 1.35; // ~1.35-1.5s hold required for meditation heal
    this.debounceTimers = {
      fist: [0, 0],
      two_fingers: [0, 0],
      three_fingers: [0, 0],
      swipe_dash: [0, 0],
      ultimate: 0,
    };
    this.detectedGestures = [GESTURE_TYPES.NONE, GESTURE_TYPES.NONE];
    this.lastTriggeredAction = [null, null];
    this.debugInfo = [{}, {}];
  }

  // Analyze finger curl/extension states
  _analyzeFingers(lms, aspect) {
    if (!lms || lms.length < 21) return null;
    const P = lms.map((l) => [(1 - l.x) * aspect, l.y, l.z || 0]);
    const d = (i, j) => Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
    const d3 = (i, j) => Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]);

    // Extension metric: ratio of tip-to-wrist distance relative to pip-to-wrist
    const extRatio = (tip, pip, mcp) => {
      const tipDist = d(WRIST, tip);
      const pipDist = d(WRIST, pip);
      const mcpDist = d(WRIST, mcp);
      return {
        tipPip: tipDist / Math.max(pipDist, 1e-4),
        tipMcp: tipDist / Math.max(mcpDist, 1e-4),
        isExtended: tipDist > pipDist * 1.15 && tipDist > mcpDist * 1.35,
        isCurled: tipDist < pipDist * 1.05 || tipDist < mcpDist * 1.12,
      };
    };

    const thumb = {
      dist: d(THUMB_TIP, INDEX_MCP),
      isExtended: d(THUMB_TIP, THUMB_MCP) > d(THUMB_IP, THUMB_MCP) * 1.25 && d(THUMB_TIP, INDEX_MCP) > 0.08,
      isCurled: d(THUMB_TIP, INDEX_MCP) < 0.09 || d(THUMB_TIP, PINKY_MCP) < 0.12,
    };

    const index = extRatio(INDEX_TIP, INDEX_PIP, INDEX_MCP);
    const middle = extRatio(MIDDLE_TIP, MIDDLE_PIP, MIDDLE_MCP);
    const ring = extRatio(RING_TIP, RING_PIP, RING_MCP);
    const pinky = extRatio(PINKY_TIP, PINKY_PIP, PINKY_MCP);

    // Palm center & normal
    const palm = [
      (P[WRIST][0] + P[INDEX_MCP][0] + P[MIDDLE_MCP][0] + P[RING_MCP][0] + P[PINKY_MCP][0]) / 5,
      (P[WRIST][1] + P[INDEX_MCP][1] + P[MIDDLE_MCP][1] + P[RING_MCP][1] + P[PINKY_MCP][1]) / 5,
    ];

    // Palm orientation vector (wrist -> middle MCP)
    const palmDir = [P[MIDDLE_MCP][0] - P[WRIST][0], P[MIDDLE_MCP][1] - P[WRIST][1]];
    const palmLength = Math.hypot(palmDir[0], palmDir[1]) || 1;
    const normDir = [palmDir[0] / palmLength, palmDir[1] / palmLength];

    // Palm plane normal (cross product between index-to-pinky and wrist-to-middle)
    const v1 = [P[INDEX_MCP][0] - P[PINKY_MCP][0], P[INDEX_MCP][1] - P[PINKY_MCP][1], P[INDEX_MCP][2] - P[PINKY_MCP][2]];
    const v2 = [P[MIDDLE_MCP][0] - P[WRIST][0], P[MIDDLE_MCP][1] - P[WRIST][1], P[MIDDLE_MCP][2] - P[WRIST][2]];
    const normal = [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0],
    ];
    const nLen = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    const unitNormal = [normal[0] / nLen, normal[1] / nLen, normal[2] / nLen];

    return {
      P,
      palm,
      normDir,
      unitNormal,
      fingers: { thumb, index, middle, ring, pinky },
    };
  }

  // Update gesture state on each frame
  update(slots, dt = 1 / 60, aspect = 16 / 9) {
    const actions = [null, null];
    const now = performance.now();

    // Check two-hand ultimate: palms close together
    let twoHandUltimate = false;
    if (slots[0]?.active && slots[1]?.active && slots[0].rawPalm && slots[1].rawPalm) {
      const palmDist = Math.hypot(slots[0].rawPalm[0] - slots[1].rawPalm[0], slots[0].rawPalm[1] - slots[1].rawPalm[1]);
      if (palmDist < 0.22 && this.debounceTimers.ultimate <= 0) {
        twoHandUltimate = true;
        this.debounceTimers.ultimate = 2.5; // debounce ultimate
      }
    }
    if (this.debounceTimers.ultimate > 0) this.debounceTimers.ultimate -= dt;

    for (let i = 0; i < 2; i++) {
      const slot = slots[i];
      // Decrement debounce timers for this slot
      for (const k of ['fist', 'two_fingers', 'three_fingers', 'swipe_dash']) {
        if (this.debounceTimers[k][i] > 0) this.debounceTimers[k][i] -= dt;
      }

      if (!slot || !slot.active || !slot.landmarks) {
        this.detectedGestures[i] = GESTURE_TYPES.NONE;
        this.healHoldTimer[i] = 0;
        this.prevPalm[i] = null;
        this.debugInfo[i] = { active: false };
        continue;
      }

      const analyzed = this._analyzeFingers(slot.landmarks, aspect);
      if (!analyzed) continue;

      const { palm, normDir, unitNormal, fingers } = analyzed;
      const { thumb, index, middle, ring, pinky } = fingers;

      // Track palm horizontal speed for Swipe Dash
      let vx = 0;
      if (this.prevPalm[i]) {
        vx = (palm[0] - this.prevPalm[i][0]) / Math.max(dt, 1e-3);
      }
      this.prevPalm[i] = palm;
      this.palmVelocities[i] = [vx, 0];

      let detected = GESTURE_TYPES.NONE;
      let actionTriggered = null;

      // 1. Check Two-Hand Ultimate
      if (twoHandUltimate) {
        detected = GESTURE_TYPES.PRAYER_ULTIMATE;
        actionTriggered = 'ultimate';
      }

      // 2. Check Swipe Dash (Rapid horizontal swipe |vx| > 1.8)
      else if (Math.abs(vx) > 1.75 && this.debounceTimers.swipe_dash[i] <= 0) {
        detected = GESTURE_TYPES.SWIPE_DASH;
        actionTriggered = vx > 0 ? 'dash_right' : 'dash_left';
        this.debounceTimers.swipe_dash[i] = 0.65;
      }

      // 3. Check Palm Up (Meditation Heal): Palm horizontal, facing up, fingers open
      // normDir pointing somewhat upward, palm facing camera/ceiling, all 4 fingers extended
      else if (
        unitNormal[2] < -0.35 && // palm facing towards camera / upwards
        index.isExtended &&
        middle.isExtended &&
        ring.isExtended &&
        pinky.isExtended
      ) {
        this.healHoldTimer[i] += dt;
        detected = GESTURE_TYPES.PALM_UP_HEAL;
        if (this.healHoldTimer[i] >= this.healTargetDuration) {
          actionTriggered = 'meditate_heal';
        }
      } else {
        this.healHoldTimer[i] = Math.max(0, this.healHoldTimer[i] - dt * 2.0); // decay quickly if broken

        // 4. Check Fist (Kepal tangan -> Serangan Kuat / Sabetan)
        // All fingers curled
        const isFist = index.isCurled && middle.isCurled && ring.isCurled && pinky.isCurled;
        if (isFist && this.debounceTimers.fist[i] <= 0) {
          detected = GESTURE_TYPES.FIST;
          actionTriggered = 'heavy_sabetan';
          this.debounceTimers.fist[i] = 0.55;
        }

        // 5. Check Two Fingers (Telunjuk + Tengah extended -> Proyektil Panah/Pusaka)
        else if (
          index.isExtended &&
          middle.isExtended &&
          ring.isCurled &&
          pinky.isCurled &&
          this.debounceTimers.two_fingers[i] <= 0
        ) {
          detected = GESTURE_TYPES.TWO_FINGERS;
          actionTriggered = 'shoot_projectile';
          this.debounceTimers.two_fingers[i] = 0.65;
        }

        // 6. Check Three Fingers (Index + Middle + Ring extended -> Skill Khas Karakter)
        else if (
          index.isExtended &&
          middle.isExtended &&
          ring.isExtended &&
          pinky.isCurled &&
          this.debounceTimers.three_fingers[i] <= 0
        ) {
          detected = GESTURE_TYPES.THREE_FINGERS;
          actionTriggered = 'signature_skill';
          this.debounceTimers.three_fingers[i] = 0.8;
        }
      }

      this.detectedGestures[i] = detected;
      actions[i] = actionTriggered;

      // Debug metrics for display
      this.debugInfo[i] = {
        active: true,
        gesture: detected,
        action: actionTriggered,
        vx: vx.toFixed(2),
        healHold: this.healHoldTimer[i].toFixed(2),
        fingers: {
          idx: index.isExtended ? 'UP' : index.isCurled ? 'FIST' : 'MID',
          mid: middle.isExtended ? 'UP' : middle.isCurled ? 'FIST' : 'MID',
          rng: ring.isExtended ? 'UP' : ring.isCurled ? 'FIST' : 'MID',
          pky: pinky.isExtended ? 'UP' : pinky.isCurled ? 'FIST' : 'MID',
        },
      };
    }

    return actions;
  }

  // Draw optional debug overlay on top of camera preview canvas
  drawDebugOverlay(ctx, width, height) {
    if (!ctx) return;
    ctx.save();
    ctx.font = '10px monospace';
    for (let i = 0; i < 2; i++) {
      const info = this.debugInfo[i];
      if (!info.active) continue;
      const x = i === 0 ? 8 : width - 110;
      const y = height - 52;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(x - 4, y - 10, 106, 48);
      ctx.fillStyle = info.action ? '#4ade80' : '#facc15';
      ctx.fillText(`Hand ${i === 0 ? 'L' : 'R'}: ${info.gesture}`, x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Act: ${info.action || 'idle'}`, x, y + 12);
      ctx.fillText(`Heal: ${(Number(info.healHold) || 0).toFixed(1)}s / ${this.healTargetDuration}s`, x, y + 24);
      if (info.fingers) {
        ctx.fillText(`F: ${info.fingers.idx}|${info.fingers.mid}|${info.fingers.rng}|${info.fingers.pky}`, x, y + 36);
      }
    }
    ctx.restore();
  }
}
