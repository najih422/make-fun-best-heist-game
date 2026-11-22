// Browser glue: input, the frame loop, screenshot staging freeze.
// The game logic lives in world.js; this file only wires it to the page.

import { createGame, updateGame } from './world.js';
import { render } from './render.js';
import { SoundBank } from './audio.js';
import { getShotParam, stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const sounds = new SoundBank();

let state = createGame();

// --- Input state, module scope so a restart can reset it ---
// Touch feeds the same input object as the keyboard: joystick ->
// mx/my (analog, player.js normalises), SNEAK is a latching stance,
// DASH/SMOKE/USE are one-frame pulses like Space/F/E.
let joyX = 0;
let joyY = 0;
let sneakToggle = false;
let dashQ = false;
let smokeQ = false;
let interactQ = false;
let coinTarget = null;
let joyPointer = null;
let lastBtnPress = 0; // when the START button was last pressed (ms)
let pressPos = null; // where the last canvas press started (client px)
let pressTime = 0; // when that press started (ms)
let joyEl = null;
let knobEl = null;
let sneakBtn = null;

// A fresh game must start with clean input: a finger still on the
// (now hidden) joystick when the player is busted leaves joyX/joyY
// stuck, so the new game walks by itself; a latched SNEAK (and any
// queued pulse) would carry over the same way.
function resetInputSticky() {
  joyX = 0;
  joyY = 0;
  sneakToggle = false;
  dashQ = false;
  smokeQ = false;
  interactQ = false;
  coinTarget = null;
  joyPointer = null;
  pressPos = null;
  if (knobEl) knobEl.style.transform = 'translate(-50%, -50%)';
  if (sneakBtn) sneakBtn.classList.remove('on');
}

function startGame() {
  if (state.status === 'title') {
    resetInputSticky();
    state.status = 'playing';
  } else if (state.status === 'win' || state.status === 'busted') {
    resetInputSticky();
    state = createGame();
    state.status = 'playing';
  }
}

const shot = getShotParam();
if (shot) {
  stageShot(state, shot);
  render(ctx, state);
  // Frozen: the frame loop never advances, so a screenshot of this
  // page is exactly the staged state.
} else {
  const keys = new Set();

  // --- Touch controls (only wired on touch devices) ---
  // The overlay in index.html stays hidden on desktop, so screenshots
  // and the desktop game are untouched.
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) {
    document.body.classList.add('touch');
    joyEl = document.getElementById('joy');
    knobEl = document.getElementById('knob');
    sneakBtn = document.getElementById('btn-sneak');
    const DEADZONE = 0.12; // tiny accidental offsets must not move Rook
    const joyMove = (e) => {
      const r = joyEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len < DEADZONE) {
        joyX = 0;
        joyY = 0;
        knobEl.style.transform = 'translate(-50%, -50%)';
        return;
      }
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      joyX = dx;
      joyY = dy;
      const maxOff = r.width / 2 - knobEl.getBoundingClientRect().width / 2;
      knobEl.style.transform = `translate(-50%, -50%) translate(${dx * maxOff}px, ${dy * maxOff}px)`;
    };
    joyEl.addEventListener('pointerdown', (e) => {
      // A second finger on the joystick must not steal the first
      // finger's pointer (its pointerup would then be ignored and
      // the joystick would stick).
      if (joyPointer !== null) return;
      e.preventDefault();
      joyPointer = e.pointerId;
      joyEl.setPointerCapture(e.pointerId);
      joyMove(e);
    });
    joyEl.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyPointer) joyMove(e);
    });
    const joyEnd = (e) => {
      if (e.pointerId !== joyPointer) return;
      joyPointer = null;
      joyX = 0;
      joyY = 0;
      knobEl.style.transform = 'translate(-50%, -50%)';
    };
    joyEl.addEventListener('pointerup', joyEnd);
    joyEl.addEventListener('pointercancel', joyEnd);

    const bindBtn = (id, fn) => {
      document.getElementById(id).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sounds.ensure();
        fn();
      });
    };
    bindBtn('btn-dash', () => {
      dashQ = true;
    });
    bindBtn('btn-smoke', () => {
      smokeQ = true;
    });
    bindBtn('btn-interact', () => {
      interactQ = true;
    });
    bindBtn('btn-sneak', () => {
      sneakToggle = !sneakToggle;
      sneakBtn.classList.toggle('on', sneakToggle);
    });
    bindBtn('btn-start', () => {
      // Tapping START hides the button; the tap's click retargets
      // to the canvas, so the canvas click handler ignores clicks
      // for a moment after a START press (see below).
      lastBtnPress = performance.now();
      startGame();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    sounds.ensure();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Enter') startGame();
    if (e.code === 'KeyR' && state.status !== 'title') {
      resetInputSticky();
      state = createGame();
      state.status = 'playing';
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  // Where a canvas press started, so a drag (press and release far
  // apart) can be told apart from a tap in the click handler below.
  canvas.addEventListener('pointerdown', (e) => {
    if (state.status !== 'playing') return;
    if (e.button !== 0) return; // primary button only
    pressPos = { x: e.clientX, y: e.clientY };
    pressTime = performance.now();
  });
  canvas.addEventListener('click', (e) => {
    // A click on the title / win / busted screens must not queue a
    // coin that fires on the first frame of the next game.
    if (state.status !== 'playing') return;
    // Tapping START hides the button and the tap's click retargets
    // to the canvas; ignore clicks for a moment after a START press.
    // (click, not pointerdown: a mouse drag must not throw a coin,
    // right-click must not throw one, and a synthetic el.click()
    // from an automated player must still work.)
    if (performance.now() - lastBtnPress < 200) return;
    // A drag fires a click too, but its release is far from the
    // press; only a tap (release near the press) throws a coin. A
    // synthetic click has no recent press, so it is always allowed.
    if (pressPos && performance.now() - pressTime < 500) {
      if (Math.hypot(e.clientX - pressPos.x, e.clientY - pressPos.y) > 12) return;
    }
    sounds.ensure();
    const rect = canvas.getBoundingClientRect();
    coinTarget = {
      x: ((e.clientX - rect.left) / rect.width) * 1280,
      y: ((e.clientY - rect.top) / rect.height) * 720,
    };
  });

  // Debug handle for automated play-testing; harmless in normal play.
  window.__meridian = {
    get state() {
      return state;
    },
    get joy() {
      return { x: joyX, y: joyY };
    },
    get sneak() {
      return sneakToggle;
    },
  };

  let last = performance.now();
  let lastStatus = state.status;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.status === 'playing') {
      const mx =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) +
        joyX;
      const my =
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) +
        joyY;
      const input = {
        mx,
        my,
        sneak: keys.has('ShiftLeft') || keys.has('ShiftRight') || sneakToggle,
        dash: keys.has('Space') || dashQ,
        interact: keys.has('KeyE') || interactQ,
        coin: coinTarget,
        smoke: keys.has('KeyF') || smokeQ,
      };
      coinTarget = null;
      keys.delete('Space');
      keys.delete('KeyE');
      keys.delete('KeyF');
      dashQ = false;
      smokeQ = false;
      interactQ = false;
      updateGame(state, input, dt);
      for (const ev of state.events) sounds.play(ev);
    }
    if (state.status !== lastStatus) {
      lastStatus = state.status;
      document.getElementById('stage').dataset.status = state.status;
    }
    render(ctx, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
