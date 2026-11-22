// Staging for screenshots (?shot=) and the autopilot that drives it.
// The autopilot is also the playtest driver: it must WIN the game.

import {
  ROUTE,
  SAMPLE_DT,
  CAM_RANGE,
  CAM_HALF_ANGLE,
  VISION_RANGE,
  VISION_HALF_ANGLE,
  WALK_SPEED,
} from './config.js';
import { dist, canSee } from './vision.js';
import { SOLIDS, moveCircle, circleHits, createGame, updateGame, nextLoot, lootCount } from './world.js';

// Route waypoint of each loot: Ruby 5, Ledger 9, Mask 15.
const LOOT_WP = { ruby: 5, ledger: 9, mask: 15 };
const DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [0, 0], // wait: sometimes the right move is to stand still
];

export function getShotParam() {
  if (typeof window === 'undefined' || !window.location) return null;
  return new URLSearchParams(window.location.search).get('shot');
}

// Danger of standing at (cx,cy): 500 when a guard or camera can see the
// spot, less when a guard is merely close.
function dangerAt(state, cx, cy) {
  let danger = 0;
  for (const g of state.guards) {
    if (canSee(g.x, g.y, g.dir, VISION_RANGE, VISION_HALF_ANGLE, cx, cy, SOLIDS)) {
      danger += 500;
    } else {
      const d = dist(cx, cy, g.x, g.y);
      if (d < 70) danger += 150 * (1 - d / 70);
    }
  }
  if (state.time < state.camerasOffUntil) return danger;
  for (const cam of state.cameras) {
    if (canSee(cam.x, cam.y, cam.angle, CAM_RANGE, CAM_HALF_ANGLE, cx, cy, SOLIDS)) {
      danger += 500;
    }
  }
  return danger;
}

function stepGame(state, inputFn, seconds) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    if (state.status !== 'playing') break;
    updateGame(state, inputFn(state, 1 / 60), 1 / 60);
  }
}

// The autopilot: follow the wing-aware route, re-scoring 8 directions
// plus waiting every SAMPLE_DT, and wait a cone out instead of walking
// through it. When a guard gives chase, the route is forgotten until
// the chase is broken: run from the guard, full speed, and break the
// line of sight. `reckless` ignores danger (used for the alarm staging).
export function autopilotInput(state, dt, reckless = false) {
  const ap = state.autopilot;
  const p = state.player;

  // Backtrack when a loot was missed: its waypoint lies behind us.
  const loot = nextLoot(state);
  if (loot && LOOT_WP[loot.id] < ap.wp) ap.wp = LOOT_WP[loot.id];

  // Grab loot / use the exit the moment we are close enough.
  if (loot && dist(p.x, p.y, loot.x, loot.y) < 28) {
    return { mx: 0, my: 0, sneak: false, dash: false, interact: true, coin: null, smoke: false };
  }
  if (!loot && lootCount(state) === 3 && dist(p.x, p.y, 640, 682) < 40) {
    return { mx: 0, my: 0, sneak: false, dash: false, interact: true, coin: null, smoke: false };
  }

  // Clear the west wing before the Mask run: a coin pulls Marlo off
  // the gap while we cross behind him. The coin must land where he
  // can SEE it from his beat — (300,450) is inside his cone when he
  // walks the north leg, and walking to it turns him away from the gap.
  if (!ap.coinUsed && ap.wp === 10 && loot && loot.id === 'mask' && dist(p.x, p.y, 570, 280) < 25) {
    ap.coinUsed = true;
    return { mx: 0, my: 0, sneak: false, dash: false, interact: false, coin: { x: 300, y: 450 }, smoke: false };
  }

  ap.sampleT += dt;
  if (ap.sampleT < SAMPLE_DT) {
    return {
      mx: ap.mx,
      my: ap.my,
      sneak: ap.sneak,
      dash: ap.dash,
      interact: false,
      coin: null,
      smoke: false,
    };
  }
  ap.sampleT = 0;
  ap.dash = false;

  // A chase overrides the route: flee until the guard loses us.
  const threat =
    state.guards.find((g) => g.mode === 'chase') ||
    state.guards.find((g) => g.seeing && dist(p.x, p.y, g.x, g.y) < 120);
  if (threat && !reckless) {
    let best = null;
    for (const [dx, dy] of DIRS) {
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const moved = moveCircle(p.x, p.y, 14, ux * WALK_SPEED * SAMPLE_DT, uy * WALK_SPEED * SAMPLE_DT, SOLIDS);
      const gain = dist(moved.x, moved.y, threat.x, threat.y) - dist(p.x, p.y, threat.x, threat.y);
      const danger = dangerAt(state, moved.x, moved.y);
      // Breaking the line of sight matters far more than raw distance:
      // running straight away from a chaser keeps you inside their cone.
      const score = (danger === 0 ? 500 : 0) + gain * 3 - danger * 0.2;
      if (!best || score > best.score) best = { score, mx: ux, my: uy };
    }
    ap.mx = best.mx;
    ap.my = best.my;
    ap.sneak = false;
    // Dash when the chaser is right on top of us.
    if (dist(p.x, p.y, threat.x, threat.y) < 70 && p.dashCd <= 0) ap.dash = true;
    return {
      mx: ap.mx,
      my: ap.my,
      sneak: false,
      dash: ap.dash,
      interact: false,
      coin: null,
      smoke: false,
    };
  }

  const target = ROUTE[Math.min(ap.wp, ROUTE.length - 1)];
  const here = dist(p.x, p.y, target[0], target[1]);
  if (here < 18 && ap.wp < ROUTE.length - 1) {
    ap.wp += 1;
    ap.lastDist = Infinity;
    ap.progressT = 0;
  }

  // Stuck watch: no progress toward the waypoint for a while.
  if (here < ap.lastDist - 2) {
    ap.lastDist = here;
    ap.progressT = 0;
  } else {
    ap.progressT += SAMPLE_DT;
  }
  const force = ap.progressT > 2.5;
  if (force) ap.progressT = 0;

  // Never knowingly walk into a watched spot: among the steps, only
  // the unwatched ones (danger < 500) compete on progress. If every
  // step is watched, stand in the least-watched spot and wait for the
  // cone to move on — that is what makes the route survive a phase
  // shift instead of depending on one lucky timing.
  let best = null;
  let safest = null;
  for (const [dx, dy] of DIRS) {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const moved = moveCircle(p.x, p.y, 14, ux * WALK_SPEED * SAMPLE_DT, uy * WALK_SPEED * SAMPLE_DT, SOLIDS);
    const progress = dist(p.x, p.y, target[0], target[1]) - dist(moved.x, moved.y, target[0], target[1]);
    const danger = reckless || force ? 0 : dangerAt(state, moved.x, moved.y);
    const score = progress * 3 - danger;
    if (!safest || danger < safest.danger) safest = { score, danger, mx: ux, my: uy };
    if (danger < 500 && (!best || score > best.score)) best = { score, danger, mx: ux, my: uy };
  }
  if (!best) best = safest;

  // Sneak when a guard is close or the chosen step is watched.
  let nearGuard = false;
  for (const g of state.guards) {
    if (dist(p.x, p.y, g.x, g.y) < 170) nearGuard = true;
  }
  ap.mx = best.mx;
  ap.my = best.my;
  ap.sneak = nearGuard || best.danger > 0;
  return {
    mx: ap.mx,
    my: ap.my,
    sneak: ap.sneak,
    dash: false,
    interact: false,
    coin: null,
    smoke: false,
  };
}

// Run one staging in place. After this the frame is frozen (main.js
// never advances it), so a screenshot is exactly this state.
//
// Nothing here assigns an alarm, a mode or a score: every number in
// the frame is earned by stepping the real game. Rook is only ever
// *placed* (teleported to a staging spot); the alarm, the cones and
// the chase all come out of updateGame.
const HOLD = { mx: 0, my: 0, sneak: false, dash: false, interact: false, coin: null, smoke: false };
// Inside CAM 1's sweep, out of every guard's beat.
const CAM_SPOT = [478, 252];
// South of the statue: no guard or camera ever sees this spot.
const WAIT_SPOT = [640, 450];

// Step with the hold input until `cond(state)` is true, or
// `maxSeconds` pass. Returns whether the condition was met.
function stepUntil(state, cond, maxSeconds) {
  const n = Math.round(maxSeconds * 60);
  for (let i = 0; i < n; i++) {
    if (state.status !== 'playing' || cond(state)) break;
    updateGame(state, HOLD, 1 / 60);
  }
  return state.status === 'playing' && cond(state);
}

// True when Inez is far enough from (x,y) that she cannot see Rook there.
function inezFar(state, x, y) {
  const inez = state.guards.find((g) => g.name === 'Inez');
  return !!inez && dist(inez.x, inez.y, x, y) > 350;
}

export function stageShot(state, shot) {
  if (shot === 'start') return; // title screen over the fresh room
  state.status = 'playing';
  if (shot === 'play') {
    // Autopilot until the second loot (Ledger), then stage the tension:
    // put Rook in Inez's cone and freeze the moment the alarm bites.
    // Cover target: red cone on Rook, alarm 25–50%, LOOT 2/3.
    while (state.status === 'playing' && lootCount(state) < 2 && state.time < 120) {
      updateGame(state, autopilotInput(state, 1 / 60), 1 / 60);
    }
    if (state.status === 'playing' && lootCount(state) === 2) {
      const inez = state.guards.find((g) => g.name === 'Inez');
      let spot = null;
      for (const d of [180, 150, 120, 90]) {
        const sx = inez.x + Math.cos(inez.dir) * d;
        const sy = inez.y + Math.sin(inez.dir) * d;
        if (sx > 40 && sx < 1240 && sy > 40 && sy < 680 && !circleHits(sx, sy, 14, SOLIDS)) {
          spot = [sx, sy];
          break;
        }
      }
      if (spot) {
        state.player.x = spot[0];
        state.player.y = spot[1];
        stepUntil(state, (s) => s.alarm >= 28, 6);
      }
    }
    if (state.status !== 'playing') {
      // The tension staging got Rook caught: fall back to plain play
      // so the cover is still a real frame, never a faked one.
      const fresh = createGame();
      for (const k of Object.keys(fresh)) state[k] = fresh[k];
      state.status = 'playing';
      stepGame(state, (s, dt) => autopilotInput(s, dt), 12);
    }
  } else if (shot === 'alarm') {
    // Organic alarm: Rook waits where nobody looks, then steps into
    // CAM 1's sweep until the camera alone pushes the alarm past 60.
    // The frame shows a real camera cone on Rook + HUNT MODE.
    state.player.x = WAIT_SPOT[0];
    state.player.y = WAIT_SPOT[1];
    stepUntil(state, (s) => inezFar(s, CAM_SPOT[0], CAM_SPOT[1]), 40);
    if (state.status === 'playing') {
      state.player.x = CAM_SPOT[0];
      state.player.y = CAM_SPOT[1];
      stepUntil(state, (s) => s.alarm >= 60, 10);
    }
    if (state.status !== 'playing' || state.alarm < 50) {
      // Staging failed: fall back to plain play, never a faked number.
      const fresh = createGame();
      for (const k of Object.keys(fresh)) state[k] = fresh[k];
      state.status = 'playing';
      stepGame(state, (s, dt) => autopilotInput(s, dt), 12);
    }
  } else if (shot === 'win') {
    while (state.status === 'playing' && state.time < 240) {
      updateGame(state, autopilotInput(state, 1 / 60), 1 / 60);
    }
  }
}
