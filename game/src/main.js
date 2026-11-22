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

const shot = getShotParam();
if (shot) {
  stageShot(state, shot);
  render(ctx, state);
  // Frozen: the frame loop never advances, so a screenshot of this
  // page is exactly the staged state.
} else {
  const keys = new Set();
  let coinTarget = null;

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    sounds.ensure();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Enter') {
      if (state.status === 'title') state.status = 'playing';
      else if (state.status === 'win' || state.status === 'busted') {
        state = createGame();
        state.status = 'playing';
      }
    }
    if (e.code === 'KeyR' && state.status !== 'title') {
      state = createGame();
      state.status = 'playing';
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('click', (e) => {
    // A click on the title / win / busted screens must not queue a
    // coin that fires on the first frame of the next game.
    if (state.status !== 'playing') return;
    sounds.ensure();
    const rect = canvas.getBoundingClientRect();
    coinTarget = {
      x: ((e.clientX - rect.left) / rect.width) * 1280,
      y: ((e.clientY - rect.top) / rect.height) * 720,
    };
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.status === 'playing') {
      const mx =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const my =
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      const input = {
        mx,
        my,
        sneak: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        dash: keys.has('Space'),
        interact: keys.has('KeyE'),
        coin: coinTarget,
        smoke: keys.has('KeyF'),
      };
      coinTarget = null;
      keys.delete('Space');
      keys.delete('KeyE');
      keys.delete('KeyF');
      updateGame(state, input, dt);
      for (const ev of state.events) sounds.play(ev);
    }
    render(ctx, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
