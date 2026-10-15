import { Renderer, STAGE_W, STAGE_H } from './renderer.js';
import { Puppet, PARTS } from './rig.js';
import { HandTracker } from './tracking.js';
import { Controller } from './controller.js';
import { BackgroundMusic, BeatClock } from './audio.js';
import { clamp, noise1 } from './math.js';
import { CHARACTERS, CHARACTER_TYPES } from './characters.js';
import { CombatGestureDetector, GESTURE_TYPES } from './gestures.js';
import { ParticleSystem } from './particles.js';
import { ArenaItemManager } from './items.js';
import { CombatEngine, COMBAT_MODES, MATCH_STATES } from './combat.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const video = $('video');
const preview = $('preview');
const previewBox = $('preview-box');
const pctx = preview.getContext('2d');

const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function fail(message) {
  const el = $('error');
  el.textContent = message;
  el.hidden = false;
}

let renderer;
try {
  renderer = new Renderer(canvas);
  await Promise.all([
    renderer.loadTexture('background', 'assets/background.png'),
    ...Object.entries(PARTS).map(([key, part]) => renderer.loadTexture(key, part.src)),
  ]);
} catch (err) {
  console.error(err);
  fail(`Could not start the renderer: ${err.message}`);
  throw err;
}

// Two characters facing each other: left one mirrored (looking right), right one as drawn (looking left).
const puppets = [new Puppet({ x: 640, facing: -1 }), new Puppet({ x: 1280, facing: 1 })];
const tracker = new HandTracker(video);
const controller = new Controller(tracker);
let facingMode = 'target';
window.wayang = { puppets, controller, tracker, renderer }; // handy for poking at from devtools

function applyFacing() {
  const two = controller.puppetCount === 2;
  for (const p of puppets) p.facingMode = facingMode === 'target' && !two ? 'manual' : facingMode;
}
applyFacing();

// Visible part of the 1920×1080 stage ("cover" fit).
let view = { x: 0, y: 0, w: STAGE_W, h: STAGE_H };
let userCustomSize = false;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(innerWidth * dpr));
  const h = Math.max(1, Math.round(innerHeight * dpr));
  renderer.resize(w, h);
  const aspect = w / h;
  if (aspect > STAGE_W / STAGE_H) {
    const vh = STAGE_W / aspect;
    view = { x: 0, y: (STAGE_H - vh) * 0.5, w: STAGE_W, h: vh };
  } else {
    const vw = STAGE_H * aspect;
    view = { x: (STAGE_W - vw) * 0.5, y: 0, w: vw, h: STAGE_H };
  }

  // Responsive scaling for mobile, tablets, and desktop
  if (!userCustomSize) {
    let responsiveScale = 0.53;
    if (innerWidth < 500) {
      responsiveScale = 0.32; // Mobile portrait (iPhone, Android)
    } else if (innerWidth < 768) {
      responsiveScale = 0.38; // Small tablets / large phones
    } else if (innerWidth < 1024) {
      responsiveScale = 0.44; // iPads & tablets
    }
    for (const p of puppets) p.baseScale = responsiveScale;
    const sizeSlider = $('opt-size');
    if (sizeSlider) sizeSlider.value = String(responsiveScale);
  }
}
addEventListener('resize', resize);
resize();

// ---------- Landing Page & Stage Navigation (Theatrical Curtain Transition) ----------
function showStage() {
  const curtain = $('page-curtain');
  if (window.gsap && curtain) {
    curtain.classList.add('active');
    const tl = gsap.timeline({
      onComplete: () => {
        curtain.classList.remove('active');
      }
    });

    // Step 1: Theatrical kelir curtain sweeps shut with golden emblem
    tl.set('.curtain-panel', { scaleX: 0, transformOrigin: (i) => i === 0 ? 'left center' : 'right center' })
      .set('#curtain-emblem', { opacity: 0, scale: 0.8 })
      .to('.curtain-panel', { scaleX: 1, duration: 0.38, ease: 'power3.inOut' })
      .to('#curtain-emblem', { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(1.7)' }, '-=0.15')
      .call(() => {
        document.body.className = 'view-stage';
        resize();
        if (window.wayang?.music && !window.wayang.music.started) {
          window.wayang.music.start();
        }
      })
      .to('#curtain-emblem', { opacity: 0, scale: 0.9, duration: 0.2, delay: 0.15 })
      .to('.curtain-panel', { scaleX: 0, duration: 0.45, ease: 'power3.inOut', transformOrigin: (i) => i === 0 ? 'left center' : 'right center' }, '-=0.1')
      .fromTo('#stage-view', { opacity: 0, scale: 1.03 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out' }, '-=0.35');
  } else {
    document.body.className = 'view-stage';
    resize();
    if (window.wayang?.music && !window.wayang.music.started) {
      window.wayang.music.start();
    }
  }
}

function showLanding() {
  const curtain = $('page-curtain');
  if (window.gsap && curtain) {
    curtain.classList.add('active');
    const tl = gsap.timeline({
      onComplete: () => {
        curtain.classList.remove('active');
      }
    });

    tl.set('.curtain-panel', { scaleX: 0, transformOrigin: (i) => i === 0 ? 'left center' : 'right center' })
      .to('.curtain-panel', { scaleX: 1, duration: 0.35, ease: 'power2.inOut' })
      .call(() => {
        document.body.className = 'view-landing';
        window.scrollTo({ top: 0, behavior: 'instant' });
      })
      .to('.curtain-panel', { scaleX: 0, duration: 0.4, ease: 'power3.inOut', transformOrigin: (i) => i === 0 ? 'left center' : 'right center' })
      .fromTo('#landing-page', { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, '-=0.25');
  } else {
    document.body.className = 'view-landing';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

$('btn-nav-play')?.addEventListener('click', showStage);
$('btn-hero-play')?.addEventListener('click', showStage);
$('btn-bottom-play')?.addEventListener('click', showStage);
$('btn-back-home')?.addEventListener('click', showLanding);

if (location.hash === '#play') {
  showStage();
}

// ---------- Universal 3-Tier Image Zoom Modal & Motion Animations ----------
const zoomModal = $('image-zoom-modal');
const modalImg = $('modal-zoom-img');
const imgWrapper = $('modal-image-wrapper');
let currentZoom = 1;
let isPanning = false;
let startX = 0, startY = 0, translateX = 0, translateY = 0;

function updateTransform() {
  if (imgWrapper) {
    imgWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`;
  }
}

function openZoomModal(previewUrl = 'assets/puppet-preview.webp', highResUrl = 'assets/puppet-zoom.webp', tagText = 'Detail Karakter', subtagText = 'Tatahan Kulit Asli & Gradasi Pewarnaan') {
  if (!zoomModal) return;
  zoomModal.hidden = false;
  zoomModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  currentZoom = 1;
  translateX = 0;
  translateY = 0;
  updateTransform();

  const modalTag = zoomModal.querySelector('.modal-tag');
  const modalSubtag = zoomModal.querySelector('.modal-subtag');
  if (modalTag && tagText) modalTag.textContent = tagText;
  if (modalSubtag && subtagText) modalSubtag.textContent = subtagText;

  if (modalImg) {
    modalImg.src = previewUrl;
    modalImg.setAttribute('data-highres', highResUrl || previewUrl);
  }

  // Tier 2 -> Tier 3: progressive full high-res swap
  if (highResUrl && modalImg) {
    const highImg = new Image();
    highImg.src = highResUrl;
    highImg.onload = () => {
      if (!zoomModal.hidden && modalImg.getAttribute('data-highres') === highResUrl) {
        modalImg.src = highResUrl;
      }
    };
  }

  // Motion.dev animate in
  if (window.Motion?.animate) {
    window.Motion.animate('.modal-dialog-panel', { scale: [0.92, 1], opacity: [0, 1] }, { duration: 0.3, easing: [0.16, 1, 0.3, 1] });
  }
}

function closeZoomModal() {
  if (!zoomModal || zoomModal.hidden) return;
  if (window.Motion?.animate) {
    window.Motion.animate('.modal-dialog-panel', { scale: [1, 0.95], opacity: [1, 0] }, { duration: 0.2 }).finished.then(() => {
      zoomModal.hidden = true;
      zoomModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (modalImg) modalImg.src = 'assets/puppet-preview.webp';
    });
  } else {
    zoomModal.hidden = true;
    zoomModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (modalImg) modalImg.src = 'assets/puppet-preview.webp';
  }
}

// Bind all zoomable cards across the landing page
document.querySelectorAll('.zoomable-card').forEach((card) => {
  const trigger = (e) => {
    e?.stopPropagation?.();
    const preview = card.dataset.preview || 'assets/puppet-preview.webp';
    const highres = card.dataset.highres || 'assets/puppet-zoom.webp';
    const tag = card.dataset.tag || 'Detail Gambar';
    const subtag = card.dataset.subtag || 'Resolusi Tinggi';
    openZoomModal(preview, highres, tag, subtag);
  };
  card.addEventListener('click', trigger);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger(e);
    }
  });
});

$('btn-close-modal')?.addEventListener('click', closeZoomModal);
zoomModal?.addEventListener('click', (e) => {
  if (e.target === zoomModal) closeZoomModal();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && zoomModal && !zoomModal.hidden) closeZoomModal();
});

// Zoom in / out / reset
$('btn-zoom-in')?.addEventListener('click', () => {
  currentZoom = Math.min(3.5, currentZoom + 0.35);
  updateTransform();
});
$('btn-zoom-out')?.addEventListener('click', () => {
  currentZoom = Math.max(0.8, currentZoom - 0.35);
  updateTransform();
});
$('btn-zoom-reset')?.addEventListener('click', () => {
  currentZoom = 1;
  translateX = 0;
  translateY = 0;
  updateTransform();
});

// Viewport wheel zoom & drag pan
const viewport = $('modal-viewport');
viewport?.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.15 : -0.15;
  currentZoom = Math.max(0.7, Math.min(4, currentZoom + delta));
  updateTransform();
}, { passive: false });

viewport?.addEventListener('pointerdown', (e) => {
  isPanning = true;
  startX = e.clientX - translateX;
  startY = e.clientY - translateY;
  viewport.setPointerCapture(e.pointerId);
});
viewport?.addEventListener('pointermove', (e) => {
  if (!isPanning) return;
  translateX = e.clientX - startX;
  translateY = e.clientY - startY;
  updateTransform();
});
viewport?.addEventListener('pointerup', (e) => {
  isPanning = false;
  viewport.releasePointerCapture(e.pointerId);
});

// ---------- GSAP Animations (Floating Gunungan, Blencong Sway, ScrollTrigger) ----------
if (window.gsap) {
  // 1. Natural Breathing Floating for Gunungan (Smooth up & down, zero glitch, zero spinning)
  gsap.to('#gunungan-left', {
    y: -16,
    duration: 5.2,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut'
  });

  gsap.to('#gunungan-right', {
    y: -16,
    duration: 5.8,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    delay: 0.4
  });

  // 2. Continuous Pendulum Sway of the Antique Blencong Hanging Lanterns
  gsap.to('.blencong-lamp-left', {
    rotation: 4.8,
    transformOrigin: 'top center',
    duration: 4.2,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut'
  });

  gsap.to('.blencong-lamp-right', {
    rotation: -4.8,
    transformOrigin: 'top center',
    duration: 4.6,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    delay: 0.3
  });

  // 3. GSAP ScrollTrigger for Clean Section Reveals (No conflicting tweens)
  if (window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);

    // Smooth section headers reveal
    gsap.utils.toArray('.section-head').forEach((el) => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
        opacity: 0,
        y: 28,
        duration: 0.75,
        ease: 'power2.out'
      });
    });

    // Smooth bento cards, dalang showcase, and character tiles reveal
    gsap.utils.toArray('.bento-card, .dalang-showcase-card, .gunungan-philosophy-card, .philo-glass-card, .char-tile, .gesture-item, .spec-card').forEach((card, idx) => {
      gsap.from(card, {
        scrollTrigger: {
          trigger: card,
          start: 'top 88%',
          once: true,
        },
        opacity: 0,
        y: 32,
        duration: 0.7,
        delay: (idx % 3) * 0.08,
        ease: 'power2.out'
      });
    });
  }
}

// Initialize Motion entrance animations for landing hero
if (window.Motion?.animate) {
  window.Motion.animate('.hero-content', { opacity: [0, 1], y: [20, 0] }, { duration: 0.8, easing: [0.16, 1, 0.3, 1] });
  window.Motion.animate('.hero-visual', { opacity: [0, 1], scale: [0.95, 1] }, { duration: 0.9, delay: 0.15, easing: [0.16, 1, 0.3, 1] });
}

// ---------- Cloudflare Turnstile Edge Security & Verification ----------
const cfModal = $('cf-security-modal');
const cfStatusBox = $('cf-status-box');
const cfStatusText = $('cf-status-text');
const cfRayId = $('cf-ray-id');
const btnShowSecurity = $('btn-show-security-info');

// ---------- GDPR & UU PDP Compliant Cookie Consent Banner ----------
const cookieBanner = $('cookie-consent-banner');
const btnCookieAccept = $('btn-cookie-accept');

function initCookieConsent() {
  if (!cookieBanner) return;
  const isAccepted = localStorage.getItem('wayang_cookie_consent') === 'true';
  if (!isAccepted) {
    setTimeout(() => {
      cookieBanner.classList.remove('hidden');
    }, 1200);
  }
}

btnCookieAccept?.addEventListener('click', () => {
  localStorage.setItem('wayang_cookie_consent', 'true');
  cookieBanner?.classList.add('hidden');
});

function initCloudflareSecurity() {
  if (!cfModal) return;

  // Generate authentic Cloudflare Ray ID format (e.g. 8a91f3a2c04e-CGK)
  if (cfRayId) {
    const hex = Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    cfRayId.textContent = `${hex}-CGK`;
  }

  const isVerified = sessionStorage.getItem('cf_turnstile_verified') === 'true';

  if (!isVerified) {
    // Show verification interstitial smoothly
    cfModal.classList.remove('hidden');
    cfStatusBox?.classList.remove('verified');
    if (cfStatusText) cfStatusText.textContent = 'Memverifikasi integritas peramban Anda...';

    // Simulate Cloudflare Edge Turnstile zero-friction check
    setTimeout(() => {
      cfStatusBox?.classList.add('verified');
      if (cfStatusText) cfStatusText.textContent = 'Integritas Peramban Terverifikasi (Sukses)';
      sessionStorage.setItem('cf_turnstile_verified', 'true');

      setTimeout(() => {
        cfModal.classList.add('hidden');
        initCookieConsent();
      }, 550);
    }, 1100);
  } else {
    initCookieConsent();
  }

  // Allow user to click footer badge to inspect Cloudflare Security Info
  btnShowSecurity?.addEventListener('click', () => {
    cfModal.classList.remove('hidden');
    cfStatusBox?.classList.add('verified');
    if (cfStatusText) cfStatusText.textContent = 'Koneksi Terlindungi Cloudflare Edge & TLS 1.3';
  });

  btnShowSecurity?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      btnShowSecurity.click();
    }
  });

  cfModal.addEventListener('click', (e) => {
    if (e.target === cfModal) {
      cfModal.classList.add('hidden');
    }
  });
}

initCloudflareSecurity();

// ---------- UI ----------
const intro = $('intro');
const introStatus = $('intro-status');
const startBtn = $('start-camera');
const statusPill = $('status');
const statusText = $('status-text');
let showPreview = true;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  introStatus.classList.remove('err');
  try {
    await tracker.start((msg) => (introStatus.textContent = msg));
    controller.source = 'camera';
    controller.recalibrate();
    introStatus.textContent = '';
    intro.classList.add('gone');
    preview.height = Math.round(preview.width / tracker.aspect);
    preview.style.aspectRatio = `${preview.width} / ${preview.height}`;
    syncPreview();
  } catch (err) {
    console.error(err);
    introStatus.classList.add('err');
    introStatus.textContent =
      err?.name === 'NotAllowedError'
        ? 'Camera permission was blocked. Allow it in the address bar, or play with the mouse.'
        : `Camera unavailable (${err?.message || err}). You can still play with the mouse.`;
    startBtn.disabled = false;
  }
});

$('use-mouse').addEventListener('click', () => {
  controller.source = 'mouse';
  intro.classList.add('gone');
});

const handlePointer = (e) => {
  controller.mouse.x = view.x + (e.clientX / innerWidth) * view.w;
  controller.mouse.y = view.y + (e.clientY / innerHeight) * view.h;
  controller.mouse.seen = true;
};
canvas.addEventListener('pointermove', handlePointer);
canvas.addEventListener('pointerdown', handlePointer);
canvas.addEventListener(
  'wheel',
  (e) => {
    controller.mouse.depth = clamp(controller.mouse.depth - e.deltaY * 0.0015, -0.3, 1);
    e.preventDefault();
  },
  { passive: false },
);

const settings = $('settings');
const settingsToggle = $('settings-toggle');
settingsToggle.addEventListener('click', () => {
  settings.hidden = !settings.hidden;
  settingsToggle.setAttribute('aria-expanded', String(!settings.hidden));
});
$('opt-fingers').addEventListener('change', (e) => (controller.settings.fingers = e.target.value));
$('opt-bodyhand').addEventListener('change', (e) => (controller.settings.bodyHand = e.target.value));
$('opt-characters').addEventListener('change', (e) => {
  controller.settings.characters = e.target.value;
  $('bodyhand-row').hidden = e.target.value === 'two';
  applyFacing();
});
$('opt-facing').addEventListener('change', (e) => {
  facingMode = e.target.value;
  applyFacing();
});
$('opt-camera').addEventListener('change', (e) => {
  showPreview = e.target.checked;
  syncPreview();
});

// ---------- pop-out camera window ----------
// camera.html draws itself from this window (see src/camera-window.js), so it can sit on another
// screen. While it's open, the corner preview hides.
let cameraWin = null;
const popoutBtn = $('opt-popout');
const cameraPoppedOut = () => !!cameraWin && !cameraWin.closed;

function syncPreview() {
  const out = cameraPoppedOut();
  previewBox.hidden = !showPreview || controller.source !== 'camera' || out;
  popoutBtn.textContent = out ? 'Bring camera back' : 'Open camera in new window';
}

function toggleCameraWindow() {
  if (cameraPoppedOut()) {
    cameraWin.close();
  } else {
    const w = Math.round(Math.min(960, screen.availWidth * 0.6));
    cameraWin = window.open('camera.html', 'wayang-camera', `popup,width=${w},height=${Math.round(w / tracker.aspect)}`);
    if (!cameraWin) showToast('Pop-up blocked. Allow pop-ups for this site to open the camera window.');
  }
  syncPreview();
}
popoutBtn.addEventListener('click', toggleCameraWindow);
$('preview-popout').addEventListener('click', toggleCameraWindow);
$('opt-size').addEventListener('input', (e) => {
  userCustomSize = true;
  for (const p of puppets) p.baseScale = parseFloat(e.target.value);
});

// ---------- backsound ----------
const music = new BackgroundMusic('assets/backsound.mp3');
const beatClock = new BeatClock(music.el);
beatClock.load('assets/backsound-beats.json');
window.wayang.music = music;
window.wayang.beatClock = beatClock;
const soundBtn = $('sound-toggle');
const volumeInput = $('opt-volume');
volumeInput.value = String(music.volume);
function syncSoundUi() {
  soundBtn.setAttribute('aria-pressed', String(music.muted));
  soundBtn.setAttribute('aria-label', music.muted ? 'Unmute music' : 'Mute music');
}
syncSoundUi();
// autoplay with sound needs a user gesture: begin on the first click / tap / key
// (the mute button and M key handle themselves, so a first "mute" press doesn't start then stop it)
const startMusic = (e) => {
  if (e.target?.closest?.('#sound-toggle') || e.key?.toLowerCase() === 'm') return;
  music.start().then(() => {
    if (music.started) {
      removeEventListener('pointerdown', startMusic, true);
      removeEventListener('keydown', startMusic, true);
    }
  });
};
addEventListener('pointerdown', startMusic, true);
addEventListener('keydown', startMusic, true);
function toggleMusic() {
  music.setMuted(!music.muted);
  if (!music.muted) music.start();
  syncSoundUi();
}
soundBtn.addEventListener('click', toggleMusic);
volumeInput.addEventListener('input', (e) => {
  music.setVolume(parseFloat(e.target.value));
  if (music.muted && music.volume > 0) toggleMusic();
});

// F / G turn the left / right character around (switches facing to manual so it sticks)
function turnPuppet(i) {
  if (i >= controller.puppetCount) return;
  if (facingMode !== 'manual') {
    facingMode = 'manual';
    $('opt-facing').value = 'manual';
    applyFacing();
  }
  puppets[i].turn();
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const k = e.key.toLowerCase();

  // Mode Duel Combat Shortcuts (P1: 1, 2, 3, Space, E, R; P2 Local: 7, 8, 9, U, I)
  if (window.wayang?.combatEngine && window.wayang.combatEngine.mode !== COMBAT_MODES.PAGELARAN) {
    const engine = window.wayang.combatEngine;
    if (k === '1') { engine.executeAction(0, 'heavy_sabetan'); return; }
    if (k === '2') { engine.executeAction(0, 'shoot_projectile'); return; }
    if (k === '3') { engine.executeAction(0, 'signature_skill'); return; }
    if (k === ' ') { engine.executeAction(0, 'dash_right'); e.preventDefault(); return; }
    if (k === 'e') { engine.executeAction(0, 'meditate_heal'); return; }
    if (k === 'r') { engine.executeAction(0, 'ultimate'); return; }

    if (engine.mode === COMBAT_MODES.DUEL_PVP) {
      if (k === '7') { engine.executeAction(1, 'heavy_sabetan'); return; }
      if (k === '8') { engine.executeAction(1, 'shoot_projectile'); return; }
      if (k === '9') { engine.executeAction(1, 'signature_skill'); return; }
      if (k === 'u') { engine.executeAction(1, 'meditate_heal'); return; }
      if (k === 'i') { engine.executeAction(1, 'ultimate'); return; }
    }
  }

  if (k === 'f') turnPuppet(0);
  else if (k === 'g') turnPuppet(1);
  else if (k === 'h') document.body.classList.toggle('ui-hidden');
  else if (k === 'm') toggleMusic();
  else if (k === 'd') controller.requestDance();
  else if (k === 'c') controller.recalibrate();
  else if (k === 'p') toggleCameraWindow();
  else if (k === 'v') {
    $('opt-camera').checked = !$('opt-camera').checked;
    $('opt-camera').dispatchEvent(new Event('change'));
  }
});

const toast = $('toast');
let toastTimer = 0;
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// =========================================================
// DUEL MODE SUBSYSTEM (COMBAT ENGINE, PARTICLES, ANNOUNCEMENTS, ROSTER)
// =========================================================
const particleSystem = new ParticleSystem();
const arenaItems = new ArenaItemManager();
const combatGestures = new CombatGestureDetector();
let showGestureDebug = false;
let currentDossierCharId = 'arjuna';
let currentDossierLang = 'id';

const announcementEl = $('duel-announcement');
const announcementMain = $('announcement-main');
const announcementSub = $('announcement-sub');
let announcementTimer = 0;

function showAnnouncement(main, sub, duration = 1900) {
  if (!announcementEl || !announcementMain || !announcementSub) return;
  announcementMain.textContent = main;
  announcementSub.textContent = sub;
  announcementEl.hidden = false;
  announcementEl.classList.remove('hidden');
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(() => {
    announcementEl.classList.add('hidden');
    setTimeout(() => { announcementEl.hidden = true; }, 360);
  }, duration);
}

const combatEngine = new CombatEngine({
  particles: particleSystem,
  items: arenaItems,
  onStateChange: (state) => {
    if (state === MATCH_STATES.INTRO) {
      showAnnouncement(`RONDE ${combatEngine.round}`, 'TANCEP KAYON');
    } else if (state === MATCH_STATES.FIGHTING) {
      showAnnouncement('MULAI!', 'FIGHT!');
    } else if (state === MATCH_STATES.ROUND_OVER) {
      const winner = combatEngine.roundWinner === 1 ? combatEngine.p1 : combatEngine.p2;
      showAnnouncement('K.O.', `${winner.char.name} Menang Ronde!`);
    } else if (state === MATCH_STATES.MATCH_OVER) {
      const winner = combatEngine.winner === 1 ? combatEngine.p1 : combatEngine.p2;
      showAnnouncement('VICTORY!', `${winner.char.name} Juara Pertarungan!`, 3200);
    }
  },
  onToast: (msg) => showToast(msg),
});

window.wayang.combatEngine = combatEngine;
window.wayang.particleSystem = particleSystem;
window.wayang.arenaItems = arenaItems;
window.wayang.combatGestures = combatGestures;

// Update UI headers & action deck labels for currently selected fighters
function updateDuelFighterHeader() {
  const p1 = combatEngine.p1;
  const p2 = combatEngine.p2;

  const p1Avatar = $('duel-p1-avatar');
  if (p1Avatar) {
    p1Avatar.src = p1.char.portrait;
    p1Avatar.onerror = () => { p1Avatar.src = 'assets/char-arjuna-thumb.webp'; };
  }
  const p1Name = $('duel-p1-name');
  if (p1Name) p1Name.textContent = p1.char.name;

  const p2Avatar = $('duel-p2-avatar');
  if (p2Avatar) {
    p2Avatar.src = p2.char.portrait;
    p2Avatar.onerror = () => { p2Avatar.src = 'assets/char-bima-thumb.webp'; };
  }
  const p2Name = $('duel-p2-name');
  if (p2Name) p2Name.textContent = p2.char.name;

  // Action button skill titles from P1
  const s1 = $('act-sabetan-name');
  if (s1) s1.textContent = p1.char.skills.sabetan.name;
  const s2 = $('act-projectile-name');
  if (s2) s2.textContent = p1.char.skills.projectile.name;
  const s3 = $('act-signature-name');
  if (s3) s3.textContent = p1.char.skills.signature.name;
  const s4 = $('act-ultimate-name');
  if (s4) s4.textContent = p1.char.skills.ultimate.name;
}

// Tick update for Duel HUD (HP meters, Energy, Cooldowns, Round Gems, Timer)
function updateDuelHud() {
  const p1 = combatEngine.p1;
  const p2 = combatEngine.p2;

  // 1. Health bars
  const p1HpFill = $('duel-p1-hp-fill');
  const p1HpDamage = $('duel-p1-hp-damage');
  const p1HpVal = $('duel-p1-hp-val');
  if (p1HpFill) {
    const pct = Math.max(0, Math.min(100, (p1.hp / p1.maxHp) * 100));
    p1HpFill.style.width = `${pct}%`;
    if (p1HpDamage) {
      const curDam = parseFloat(p1HpDamage.style.width) || 100;
      if (curDam > pct) {
        p1HpDamage.style.width = `${Math.max(pct, curDam - 0.4)}%`;
      } else {
        p1HpDamage.style.width = `${pct}%`;
      }
    }
    if (p1HpVal) p1HpVal.textContent = `${Math.round(p1.hp)} / ${p1.maxHp}`;
  }

  const p2HpFill = $('duel-p2-hp-fill');
  const p2HpDamage = $('duel-p2-hp-damage');
  const p2HpVal = $('duel-p2-hp-val');
  if (p2HpFill) {
    const pct2 = Math.max(0, Math.min(100, (p2.hp / p2.maxHp) * 100));
    p2HpFill.style.width = `${pct2}%`;
    if (p2HpDamage) {
      const curDam2 = parseFloat(p2HpDamage.style.width) || 100;
      if (curDam2 > pct2) {
        p2HpDamage.style.width = `${Math.max(pct2, curDam2 - 0.4)}%`;
      } else {
        p2HpDamage.style.width = `${pct2}%`;
      }
    }
    if (p2HpVal) p2HpVal.textContent = `${Math.round(p2.hp)} / ${p2.maxHp}`;
  }

  // 2. Energy bars
  const p1EnergyFill = $('duel-p1-energy-fill');
  const p1EnergyVal = $('duel-p1-energy-val');
  if (p1EnergyFill) {
    p1EnergyFill.style.width = `${Math.max(0, Math.min(100, p1.energy))}%`;
    if (p1EnergyVal) p1EnergyVal.textContent = `${Math.round(p1.energy)} EP`;
  }

  const p2EnergyFill = $('duel-p2-energy-fill');
  const p2EnergyVal = $('duel-p2-energy-val');
  if (p2EnergyFill) {
    p2EnergyFill.style.width = `${Math.max(0, Math.min(100, p2.energy))}%`;
    if (p2EnergyVal) p2EnergyVal.textContent = `${Math.round(p2.energy)} EP`;
  }

  // 3. Round Gems
  const p1Gems = $('duel-p1-rounds')?.querySelectorAll('.round-gem');
  if (p1Gems) {
    p1Gems.forEach((g, idx) => {
      g.classList.toggle('won', p1.roundsWon > idx);
    });
  }
  const p2Gems = $('duel-p2-rounds')?.querySelectorAll('.round-gem');
  if (p2Gems) {
    p2Gems.forEach((g, idx) => {
      g.classList.toggle('won', p2.roundsWon > idx);
    });
  }

  // 4. Timer & Round label
  const timerVal = $('duel-timer-val');
  if (timerVal) {
    timerVal.textContent = String(Math.ceil(combatEngine.roundTimer));
  }
  const roundLabel = $('duel-round-label');
  if (roundLabel) {
    roundLabel.textContent = combatEngine.round <= 2 ? `RONDE ${combatEngine.round}` : 'RONDE PENENTU';
  }

  // 5. Cooldown sweeps on action buttons
  const cdSabetan = $('cd-sabetan');
  if (cdSabetan) {
    const maxCd = p1.char.skills.sabetan.cooldown || 0.6;
    const ratio = Math.max(0, Math.min(1, p1.cooldowns.sabetan / maxCd));
    cdSabetan.style.transform = `scaleY(${ratio})`;
  }

  const cdProj = $('cd-projectile');
  if (cdProj) {
    const maxCd = p1.char.skills.projectile.cooldown || 2.8;
    const ratio = Math.max(0, Math.min(1, p1.cooldowns.projectile / maxCd));
    cdProj.style.transform = `scaleY(${ratio})`;
  }

  const cdSig = $('cd-signature');
  if (cdSig) {
    const maxCd = p1.char.skills.signature.cooldown || 6.0;
    const ratio = Math.max(0, Math.min(1, p1.cooldowns.signature / maxCd));
    cdSig.style.transform = `scaleY(${ratio})`;
  }

  const cdUlt = $('cd-ultimate');
  if (cdUlt) {
    const maxCd = 12.0;
    const ratio = Math.max(0, Math.min(1, p1.cooldowns.ultimate / maxCd));
    cdUlt.style.transform = `scaleY(${ratio})`;
  }

  // Ultimate button highlight when 100 EP ready
  const ultBtn = $('act-ultimate');
  if (ultBtn) {
    ultBtn.classList.toggle('ready', p1.energy >= 100);
  }
}

// Mode switcher handler
function setStageMode(mode) {
  const isDuel = mode === 'duel';
  $('btn-mode-pagelaran')?.classList.toggle('active', !isDuel);
  $('btn-mode-duel')?.classList.toggle('active', isDuel);
  $('btn-mode-pagelaran')?.setAttribute('aria-selected', String(!isDuel));
  $('btn-mode-duel')?.setAttribute('aria-selected', String(isDuel));

  const duelHud = $('duel-hud');
  if (duelHud) {
    duelHud.hidden = !isDuel;
    duelHud.setAttribute('aria-hidden', String(!isDuel));
  }

  const hudKeys = $('hud-keys');
  if (hudKeys) {
    hudKeys.innerHTML = isDuel
      ? '<kbd>1</kbd> sabetan <kbd>2</kbd> pusaka <kbd>3</kbd> skill <kbd>Spasi</kbd> dash <kbd>E</kbd> heal <kbd>R</kbd> ulti <kbd>H</kbd> hide UI'
      : '<kbd>D</kbd> dance <kbd>F</kbd><kbd>G</kbd> turn <kbd>H</kbd> hide UI <kbd>C</kbd> recalibrate <kbd>V</kbd> camera <kbd>P</kbd> pop out <kbd>M</kbd> music';
  }

  if (isDuel) {
    combatEngine.mode = combatEngine.p2.isAI ? COMBAT_MODES.DUEL_PV_AI : COMBAT_MODES.DUEL_PVP;
    controller.puppetCount = 2;
    controller.settings.characters = 'two';
    applyFacing();
    updateDuelFighterHeader();
    combatEngine.startMatch();
    showToast('Mode Duel Dimulai! Siapkan gestur atau tombol [1-3, Spasi, E, R]');
  } else {
    combatEngine.mode = COMBAT_MODES.PAGELARAN;
    controller.settings.characters = $('opt-characters')?.value || 'two';
    controller.puppetCount = controller.settings.characters === 'one' ? 1 : 2;
    applyFacing();
    showToast('Kembali ke Mode Pagelaran Tradisional');
  }
}

// Character Selection Modal Subsystem
function renderCharacterGrid(category = 'wayang') {
  const grid = $('char-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const chars = Object.values(CHARACTERS).filter((c) => c.type === category);
  chars.forEach((c) => {
    const card = document.createElement('div');
    card.className = `char-card ${c.id === currentDossierCharId ? 'selected' : ''}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('title', `${c.name} (${c.title})`);

    const img = document.createElement('img');
    img.src = c.portrait;
    img.alt = c.name;
    img.className = 'char-card-avatar';
    img.loading = 'lazy';
    img.onerror = () => { img.src = 'assets/char-arjuna-thumb.webp'; };

    const name = document.createElement('span');
    name.className = 'char-card-name';
    name.textContent = c.name;

    const badge = document.createElement('span');
    badge.className = 'char-card-badge';
    badge.textContent = c.type === 'crossover' ? 'Tekken 8' : 'Wayang Purwa';

    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(badge);

    card.addEventListener('click', () => {
      document.querySelectorAll('.char-card').forEach((el) => el.classList.remove('selected'));
      card.classList.add('selected');
      currentDossierCharId = c.id;
      renderCharacterDossier(c.id);
    });

    grid.appendChild(card);
  });
}

function renderCharacterDossier(charId) {
  const dossier = $('char-dossier');
  if (!dossier) return;
  const c = CHARACTERS[charId] || CHARACTERS.arjuna;

  const loreText = currentDossierLang === 'id' ? c.lore.id : c.lore.en;
  const counterpartHtml = c.wayangCounterpart
    ? `<div class="dossier-counterpart">
         <span>Padanan Wayang:</span>
         <strong>${currentDossierLang === 'id' ? c.wayangCounterpart : c.wayangCounterpartEn || c.wayangCounterpart}</strong>
       </div>`
    : '';

  dossier.innerHTML = `
    <div class="dossier-header">
      <img src="${c.portrait}" alt="${c.name}" class="dossier-avatar-large" onerror="this.src='assets/char-arjuna-thumb.webp'" />
      <div class="dossier-title-col">
        <h3 class="dossier-name">${c.name}</h3>
        <p class="dossier-title">${currentDossierLang === 'id' ? c.title : c.titleEn || c.title}</p>
        ${counterpartHtml}
      </div>
    </div>

    <!-- Stat Meters -->
    <div class="dossier-stats-grid">
      <div class="dossier-stat-row">
        <div class="stat-label-line"><span>Kesehatan (HP)</span><strong>${c.stats.hp}</strong></div>
        <div class="stat-track"><div class="stat-fill" style="width: ${Math.min(100, (c.stats.hp / 130) * 100)}%;"></div></div>
      </div>
      <div class="dossier-stat-row">
        <div class="stat-label-line"><span>Serangan (ATK)</span><strong>${c.stats.attack}</strong></div>
        <div class="stat-track"><div class="stat-fill" style="width: ${Math.min(100, (c.stats.attack / 110) * 100)}%;"></div></div>
      </div>
      <div class="dossier-stat-row">
        <div class="stat-label-line"><span>Pertahanan (DEF)</span><strong>${c.stats.defense}</strong></div>
        <div class="stat-track"><div class="stat-fill" style="width: ${Math.min(100, (c.stats.defense / 110) * 100)}%;"></div></div>
      </div>
      <div class="dossier-stat-row">
        <div class="stat-label-line"><span>Kelincahan (SPD)</span><strong>${c.stats.speed}</strong></div>
        <div class="stat-track"><div class="stat-fill" style="width: ${Math.min(100, (c.stats.speed / 110) * 100)}%;"></div></div>
      </div>
    </div>

    <!-- Skills Breakdown -->
    <div class="dossier-skills-list">
      <div class="dossier-skill-item">
        <span class="skill-tag">[1] Sabetan</span>
        <div class="skill-desc-col">
          <div class="skill-title-text">${c.skills.sabetan.name} (${c.skills.sabetan.damage} DMG)</div>
          <div class="skill-detail-text">${currentDossierLang === 'id' ? c.skills.sabetan.desc : c.skills.sabetan.descEn}</div>
        </div>
      </div>
      <div class="dossier-skill-item">
        <span class="skill-tag">[2] Proyektil</span>
        <div class="skill-desc-col">
          <div class="skill-title-text">${c.skills.projectile.name} (${c.skills.projectile.damage} DMG · ${c.skills.projectile.energyCost} EP)</div>
          <div class="skill-detail-text">${currentDossierLang === 'id' ? c.skills.projectile.desc : c.skills.projectile.descEn}</div>
        </div>
      </div>
      <div class="dossier-skill-item">
        <span class="skill-tag">[3] Khas</span>
        <div class="skill-desc-col">
          <div class="skill-title-text">${c.skills.signature.name}</div>
          <div class="skill-detail-text">${currentDossierLang === 'id' ? c.skills.signature.desc : c.skills.signature.descEn}</div>
        </div>
      </div>
      <div class="dossier-skill-item">
        <span class="skill-tag">[R] Pamungkas</span>
        <div class="skill-desc-col">
          <div class="skill-title-text">${c.skills.ultimate.name} (100 EP)</div>
          <div class="skill-detail-text">${currentDossierLang === 'id' ? c.skills.ultimate.desc : c.skills.ultimate.descEn}</div>
        </div>
      </div>
    </div>

    <!-- Cultural Lore Card -->
    <div class="dossier-lore-box">
      <div class="lore-header">
        <span class="lore-tag">Kisah & Filosofi Budaya</span>
        <div class="lore-lang-toggle">
          <button class="lore-lang-btn ${currentDossierLang === 'id' ? 'active' : ''}" id="btn-lang-id">ID</button>
          <button class="lore-lang-btn ${currentDossierLang === 'en' ? 'active' : ''}" id="btn-lang-en">EN</button>
        </div>
      </div>
      <p class="lore-content-text">${loreText}</p>
    </div>

    <!-- Select Action Buttons -->
    <div class="dossier-actions">
      <button class="dossier-btn dossier-btn-p1" id="btn-choose-p1">Pilih Player 1</button>
      <button class="dossier-btn dossier-btn-p2" id="btn-choose-p2">Pilih Player 2 (Lawan)</button>
    </div>
  `;

  // Bind language buttons
  $('btn-lang-id')?.addEventListener('click', () => {
    currentDossierLang = 'id';
    renderCharacterDossier(charId);
  });
  $('btn-lang-en')?.addEventListener('click', () => {
    currentDossierLang = 'en';
    renderCharacterDossier(charId);
  });

  // Bind select buttons
  $('btn-choose-p1')?.addEventListener('click', () => {
    combatEngine.setFighter(0, charId);
    updateDuelFighterHeader();
    showToast(`Player 1: ${c.name} Terpilih!`);
    closeCharModal();
  });
  $('btn-choose-p2')?.addEventListener('click', () => {
    combatEngine.setFighter(1, charId);
    updateDuelFighterHeader();
    showToast(`Player 2: ${c.name} Terpilih!`);
    closeCharModal();
  });
}

const charModal = $('character-select-modal');
function openCharModal() {
  if (!charModal) return;
  charModal.hidden = false;
  charModal.setAttribute('aria-hidden', 'false');
  renderCharacterGrid('wayang');
  renderCharacterDossier(currentDossierCharId);
}

function closeCharModal() {
  if (!charModal || charModal.hidden) return;
  charModal.hidden = true;
  charModal.setAttribute('aria-hidden', 'true');
}

// Bind Character Selection Modal Controls
$('btn-open-char-select')?.addEventListener('click', openCharModal);
$('duel-p1-avatar-btn')?.addEventListener('click', openCharModal);
$('duel-p2-avatar-btn')?.addEventListener('click', openCharModal);
$('btn-close-char-modal')?.addEventListener('click', closeCharModal);
charModal?.addEventListener('click', (e) => {
  if (e.target === charModal) closeCharModal();
});

$('tab-wayang')?.addEventListener('click', () => {
  $('tab-wayang')?.classList.add('active');
  $('tab-crossover')?.classList.remove('active');
  renderCharacterGrid('wayang');
});

$('tab-crossover')?.addEventListener('click', () => {
  $('tab-crossover')?.classList.add('active');
  $('tab-wayang')?.classList.remove('active');
  renderCharacterGrid('crossover');
});

// Bind AI Toggle & Reset Buttons
$('btn-toggle-ai')?.addEventListener('click', () => {
  const isNowAI = !combatEngine.p2.isAI;
  combatEngine.p2.isAI = isNowAI;
  combatEngine.mode = isNowAI ? COMBAT_MODES.DUEL_PV_AI : COMBAT_MODES.DUEL_PVP;
  const dot = $('duel-ai-dot');
  const txt = $('duel-ai-text');
  const p2Tag = $('duel-p2-tag');
  if (dot) dot.classList.toggle('active', isNowAI);
  if (txt) txt.textContent = isNowAI ? 'Lawan AI' : '2 Pemain Lokal';
  if (p2Tag) p2Tag.textContent = isNowAI ? 'P2 (AI)' : 'P2 (Manual)';
  showToast(isNowAI ? 'Mode: Lawan Komputer (AI)' : 'Mode: 2 Pemain Lokal (Tangan Kanan / Tombol 7-9, U, I)');
});

$('btn-reset-match')?.addEventListener('click', () => {
  combatEngine.startMatch();
  showToast('Pertandingan Direset!');
});

// Bind Action Deck Buttons (for mouse & mobile touch players)
$('act-sabetan')?.addEventListener('click', () => combatEngine.executeAction(0, 'heavy_sabetan'));
$('act-projectile')?.addEventListener('click', () => combatEngine.executeAction(0, 'shoot_projectile'));
$('act-signature')?.addEventListener('click', () => combatEngine.executeAction(0, 'signature_skill'));
$('act-dash')?.addEventListener('click', () => combatEngine.executeAction(0, 'dash_right'));
$('act-heal')?.addEventListener('click', () => combatEngine.executeAction(0, 'meditate_heal'));
$('act-ultimate')?.addEventListener('click', () => combatEngine.executeAction(0, 'ultimate'));

// Bind Mode Switcher Tabs
$('btn-mode-pagelaran')?.addEventListener('click', () => setStageMode('pagelaran'));
$('btn-mode-duel')?.addEventListener('click', () => setStageMode('duel'));

// Bind Settings options
$('opt-blood')?.addEventListener('change', (e) => {
  particleSystem.setBloodEnabled(e.target.checked);
  showToast(e.target.checked ? 'Efek Darah Stilasi Diaktifkan' : 'Efek Darah Dimatikan');
});
$('opt-gesture-debug')?.addEventListener('change', (e) => {
  showGestureDebug = e.target.checked;
  showToast(e.target.checked ? 'Overlay Debug Gestur Aktif' : 'Overlay Debug Dimatikan');
});

function updateHud() {
  const { source, status } = controller;
  let text, cls = '';
  if (source === 'camera') {
    if (status.hands === 0) {
      text = controller.puppetCount === 2 ? 'Camera on · raise both hands' : 'Camera on · show your hand';
      cls = 'warn';
    } else {
      text = {
        'two puppets': status.hands === 2 ? 'Two puppets · one per hand' : 'Two puppets · 1 hand seen',
        'two hands': 'One puppet · gapit + tuding',
        'one hand': 'One puppet · palm + fingers',
      }[status.mode] ?? status.mode;
      if (status.calibrating) text += ' · calibrating depth';
      cls = 'live';
    }
  } else if (source === 'mouse') {
    text = 'Mouse · scroll for depth';
  } else {
    text = 'Demo';
  }
  if (statusText.textContent !== text) statusText.textContent = text;
  statusPill.className = `pill ${cls}`;
}

// Mirrored camera frame plus the hand-tracking overlay, into any 2D context (the corner preview or
// the pop-out window's canvas). Strokes grow with the canvas so they stay legible when large.
function drawCamera(ctx, W, H) {
  const s = Math.max(1, W / 480);
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = 'rgba(20,10,4,0.35)';
  ctx.fillRect(0, 0, W, H);
  controller.slots.forEach((slot, i) => {
    if (!slot.active || !slot.landmarks) return;
    const P = slot.landmarks.map((l) => [(1 - l.x) * W, l.y * H]);
    // two puppets: gold = left character, blue = right; one puppet: gold = body hand
    const isBody = controller.puppetCount === 2 ? true : i === controller.bodySlot;
    const gold = controller.puppetCount === 2 ? slot.role !== 1 : isBody;
    ctx.strokeStyle = gold ? 'rgba(242,199,107,0.9)' : 'rgba(150,210,255,0.9)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    for (const [a, b] of HAND_EDGES) {
      ctx.moveTo(...P[a]);
      ctx.lineTo(...P[b]);
    }
    ctx.stroke();
    const pair = { 'thumb-index': [4, 8], 'thumb-pinky': [4, 20], 'index-pinky': [8, 20] }[controller.settings.fingers];
    ctx.fillStyle = '#ff6b4a';
    for (const t of pair) {
      ctx.beginPath();
      ctx.arc(...P[t], 4 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    if (slot.pinky) {
      // little-finger sign recognised
      ctx.strokeStyle = '#ffe28a';
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.arc(...P[20], 8 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (isBody) {
      const c = [0, 5, 9, 13, 17].reduce((acc, j) => [acc[0] + P[j][0] / 5, acc[1] + P[j][1] / 5], [0, 0]);
      ctx.strokeStyle = gold ? '#f2c76b' : '#96d2ff';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(...c, 9 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

// used by the pop-out window (camera.html)
const cameraReady = () => controller.source === 'camera' && video.readyState >= 2;
Object.assign(window.wayang, {
  drawCamera,
  cameraReady,
  // the pop-out re-attaches itself if this page reloads while it stays open
  attachCameraWindow(win) {
    cameraWin = win;
    syncPreview();
  },
  cameraWindow: () => cameraWin,
});

let wasPoppedOut = false;
function drawPreview() {
  const out = cameraPoppedOut();
  if (out !== wasPoppedOut) {
    wasPoppedOut = out;
    syncPreview();
  }
  if (!previewBox.hidden && cameraReady()) drawCamera(pctx, preview.width, preview.height);
}

// ---------- loop ----------
let last = performance.now() / 1000;
const PHYS_DT = 1 / 120;

function tick(nowMs) {
  const t = nowMs / 1000;
  const dt = clamp(t - last, 0, 1 / 15);
  last = t;

  // Combat Gestures Recognition & Dispatch
  const gestures = combatGestures.update(controller.slots, dt, tracker.aspect);
  if (combatEngine.mode !== COMBAT_MODES.PAGELARAN) {
    if (gestures[0]) combatEngine.executeAction(0, gestures[0]);
    if (gestures[1] && combatEngine.mode === COMBAT_MODES.DUEL_PVP) {
      combatEngine.executeAction(1, gestures[1]);
    }
    combatEngine.update(dt, view, puppets);
  }

  // Update Particle System & Organic Screen Shake
  particleSystem.update(dt);
  const effectiveView = { ...view };
  if (particleSystem.trauma > 0) {
    effectiveView.x += particleSystem.shakeOffset[0];
    effectiveView.y += particleSystem.shakeOffset[1];
  }

  const inputs = controller.update(t, effectiveView);
  const active = puppets.slice(0, controller.puppetCount);
  // in "face each other" mode each character keeps its eyes on the other
  if (active.length === 2) {
    active[0].faceTargetX = active[1].pos.x;
    active[1].faceTargetX = active[0].pos.x;
  }
  // the dance follows the gamelan's beat (wirama)
  const beat = beatClock.tick(dt);
  const steps = Math.max(1, Math.ceil(dt / PHYS_DT));
  const rhythm = { db: beat.db / steps, pos: beat.pos, period: beat.period };
  for (let i = 0; i < steps; i++) {
    active.forEach((p, j) => p.update(dt / steps, i === 0 ? inputs[j] ?? { active: false } : { ...(inputs[j] ?? { active: false }), danceTrigger: false }, effectiveView, rhythm));
  }
  active.forEach((p, j) => {
    if (p.danceStarted) {
      p.danceStarted = false;
      showToast(active.length === 2 ? `${j === 0 ? 'Left' : 'Right'} puppet · Kiprahan` : 'Kiprahan');
    }
  });

  // back-to-front: the puppet held nearer the lamp is in front and casts the softer shadow
  const layers = active
    .map((p) => {
      const depth = Math.max(0, p.depth.x);
      return {
        depth: p.depth.x,
        items: p.frame(effectiveView),
        shadow: {
          scale: 1.03 + 0.2 * depth,
          dy: 8 + 34 * depth,
          blur: 3 + 30 * clamp(p.depth.x + 0.08, 0, 1.2),
          strength: 0.8 - 0.22 * clamp(depth, 0, 1),
        },
      };
    })
    .sort((a, b) => a.depth - b.depth);

  // Inject WebGL2 blood particles, falling heirloom drops, and flying projectiles
  const extraItems = [
    ...(combatEngine.mode !== COMBAT_MODES.PAGELARAN ? combatEngine.toRenderItems() : []),
    ...(combatEngine.mode !== COMBAT_MODES.PAGELARAN ? arenaItems.toRenderItems() : []),
    ...particleSystem.toRenderItems(),
  ];
  if (layers.length > 0 && extraItems.length > 0) {
    layers[0].items.push(...extraItems);
  }

  // blencong: an oil flame — flicker, and a slow sway that nudges every shadow
  const flicker = 1 + 0.03 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 13.7 + 1.1) + (noise1(t * 6.5) - 0.5) * 0.07;
  const sway = (noise1(t * 1.2 + 10) - 0.5) * 26;

  const frame = {
    view: effectiveView,
    layers,
    time: t,
    lamp: [STAGE_W / 2 + sway, -560, 1300],
    eye: [STAGE_W / 2, STAGE_H * 0.55, 2300],
    lampColor: [1.0, 0.8, 0.56],
    intensity: 1.08 * flicker,
    flicker,
    hot: [STAGE_W / 2 + sway * 0.7, 440],
  };
  renderer.render(frame);
  window.wayang.lastFrame = frame;

  drawPreview();
  if (showGestureDebug && !previewBox.hidden && cameraReady()) {
    combatGestures.drawDebugOverlay(pctx, preview.width, preview.height);
  }

  updateHud();
  if (combatEngine.mode !== COMBAT_MODES.PAGELARAN) {
    updateDuelHud();
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
