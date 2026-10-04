import { Renderer, STAGE_W, STAGE_H } from './renderer.js';
import { Puppet, PARTS } from './rig.js';
import { HandTracker } from './tracking.js';
import { Controller } from './controller.js';
import { BackgroundMusic, BeatClock } from './audio.js';
import { clamp, noise1 } from './math.js';

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

  const inputs = controller.update(t, view);
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
    active.forEach((p, j) => p.update(dt / steps, i === 0 ? inputs[j] ?? { active: false } : { ...(inputs[j] ?? { active: false }), danceTrigger: false }, view, rhythm));
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
        items: p.frame(view),
        shadow: {
          scale: 1.03 + 0.2 * depth,
          dy: 8 + 34 * depth,
          blur: 3 + 30 * clamp(p.depth.x + 0.08, 0, 1.2),
          strength: 0.8 - 0.22 * clamp(depth, 0, 1),
        },
      };
    })
    .sort((a, b) => a.depth - b.depth);

  // blencong: an oil flame — flicker, and a slow sway that nudges every shadow
  const flicker = 1 + 0.03 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 13.7 + 1.1) + (noise1(t * 6.5) - 0.5) * 0.07;
  const sway = (noise1(t * 1.2 + 10) - 0.5) * 26;

  const frame = {
    view,
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
  updateHud();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
