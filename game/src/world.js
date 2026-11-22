// The game itself: state, the tick, alarm, loot, panel, exit, scoring.
// Browser and Node share this file: no DOM, no rendering here.

import {
  WALLS,
  STATUE,
  COVER,
  LOOT,
  ROUTE_LOOT,
  EXIT,
  PANEL,
  START,
  GUARDS,
  CAMERAS,
  ALARM_GUARD_RATE,
  ALARM_CAM_RATE,
  ALARM_DECAY,
  HUNT_ALARM,
  TOUCH_DIST,
  CAM_OFF_TIME,
  PANEL_COOLDOWN,
  LOOT_TIME_BONUS_BASE,
  LOOT_TIME_BONUS_RATE,
} from './config.js';
import { dist } from './vision.js';
import { createPlayer, updatePlayer } from './player.js';
import { createGuard, updateGuard } from './guards.js';
import { createCamera, updateCamera } from './cameras.js';

// Everything a body or a sightline can hit.
export const SOLIDS = [...WALLS, STATUE, ...COVER];

export function circleHits(x, y, r, solids) {
  for (const s of solids) {
    const cx = Math.max(s.x, Math.min(x, s.x + s.w));
    const cy = Math.max(s.y, Math.min(y, s.y + s.h));
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
  }
  return false;
}

// Move a circle by (dx,dy), one axis at a time, so it slides along
// walls instead of sticking to them.
export function moveCircle(x, y, r, dx, dy, solids) {
  let nx = x + dx;
  if (circleHits(nx, y, r, solids)) nx = x;
  let ny = y + dy;
  if (circleHits(nx, ny, r, solids)) ny = y;
  return { x: nx, y: ny };
}

export function lootValue(state) {
  return LOOT.filter((l) => state.loot[l.id]).reduce((sum, l) => sum + l.value, 0);
}

export function timeBonus(state) {
  return Math.max(0, Math.round(LOOT_TIME_BONUS_BASE - LOOT_TIME_BONUS_RATE * state.time));
}

export function scoreOf(state) {
  return lootValue(state) + timeBonus(state);
}

// A clean getaway pays: peak alarm 0 earns +250, under 20% earns +120.
// Counted only in the final score at the win, never in the live HUD
// (the HUD would otherwise drop mid-game when the player is spotted).
export function cleanBonus(state) {
  return state.peakAlarm === 0 ? 250 : state.peakAlarm < 20 ? 120 : 0;
}

// The next loot in route order, for the "Next:" hint.
export function nextLoot(state) {
  for (const id of ROUTE_LOOT) {
    const l = LOOT.find((item) => item.id === id);
    if (l && !state.loot[id]) return l;
  }
  return null;
}

export function lootCount(state) {
  return LOOT.filter((l) => state.loot[l.id]).length;
}

export function createGame() {
  return {
    status: 'title', // title | playing | win | busted
    time: 0,
    alarm: 0,
    peakAlarm: 0,
    hunt: false,
    loot: { ruby: false, mask: false, ledger: false },
    player: createPlayer(START.x, START.y),
    guards: GUARDS.map(createGuard),
    cameras: CAMERAS.map(createCamera),
    coin: null,
    smoke: null,
    camerasOffUntil: 0,
    panelCdUntil: 0,
    message: 'Press Enter — steal all three, then reach the exit.',
    messageT: 0,
    bustedReason: '',
    finalTime: 0,
    finalScore: 0,
    events: [],
    autopilot: { wp: 0, sampleT: 0, mx: 0, my: 0, sneak: false, dash: false, coinUsed: false, stuckT: 0, lastDist: Infinity, progressT: 0 },
  };
}

function bust(state, reason) {
  state.status = 'busted';
  state.bustedReason = reason;
  state.finalTime = state.time;
  state.finalScore = scoreOf(state);
  state.events.push('busted');
}

// One tick. input: { mx, my, sneak, dash, interact, coin: {x,y}|null, smoke }
export function updateGame(state, input, dt) {
  state.events = [];
  if (state.status !== 'playing') return;
  state.time += dt;
  if (state.messageT > 0) state.messageT -= dt;

  const move = (x, y, r, dx, dy) => moveCircle(x, y, r, dx, dy, SOLIDS);
  const smokeHides =
    !!state.smoke &&
    state.time < state.smoke.until &&
    dist(state.player.x, state.player.y, state.smoke.x, state.smoke.y) < 95;

  updatePlayer(state.player, input, dt, {
    move,
    time: state.time,
    onCoin: (x, y) => {
      state.coin = { x, y, until: state.time + 6 };
      state.events.push('coin');
    },
    onDash: () => {
      state.events.push('dash');
    },
    onSmoke: (x, y) => {
      state.smoke = { x, y, until: state.time + 4 };
      state.events.push('smoke');
    },
  });
  if (state.coin && state.time > state.coin.until) state.coin = null;
  if (state.smoke && state.time > state.smoke.until) state.smoke = null;

  let seenGuard = false;
  let seenCamera = false;
  for (const g of state.guards) {
    if (
      updateGuard(g, dt, {
        player: state.player,
        solids: SOLIDS,
        move,
        time: state.time,
        hunt: state.hunt,
        coin: state.coin,
        smokeHides,
      })
    ) {
      seenGuard = true;
    }
  }
  for (const cam of state.cameras) {
    if (
      updateCamera(cam, dt, {
        player: state.player,
        solids: SOLIDS,
        time: state.time,
        camerasOffUntil: state.camerasOffUntil,
        smokeHides,
      })
    ) {
      seenCamera = true;
    }
  }

  if (seenGuard) state.alarm += ALARM_GUARD_RATE * dt;
  if (seenCamera) state.alarm += ALARM_CAM_RATE * dt;
  if (!seenGuard && !seenCamera) state.alarm -= ALARM_DECAY * dt;
  state.alarm = Math.max(0, Math.min(100, state.alarm));
  state.peakAlarm = Math.max(state.peakAlarm, Math.round(state.alarm));
  state.hunt = state.alarm >= HUNT_ALARM;

  if (state.alarm >= 100) {
    bust(state, 'The alarm hit 100%.');
    return;
  }
  for (const g of state.guards) {
    if (g.mode === 'chase' && dist(g.x, g.y, state.player.x, state.player.y) < TOUCH_DIST) {
      bust(state, `${g.name} caught you.`);
      return;
    }
  }

  if (input.interact) {
    const p = state.player;
    const nearLoot = LOOT.find((l) => !state.loot[l.id] && dist(p.x, p.y, l.x, l.y) < 30);
    if (nearLoot) {
      state.loot[nearLoot.id] = true;
      state.events.push('pickup');
      state.message = `${nearLoot.name} secured — $${nearLoot.value}.`;
      state.messageT = 3;
    } else if (dist(p.x, p.y, PANEL.x, PANEL.y) < 40) {
      if (state.time >= state.panelCdUntil) {
        state.camerasOffUntil = state.time + CAM_OFF_TIME;
        state.panelCdUntil = state.time + PANEL_COOLDOWN;
        state.events.push('panel');
        state.message = 'Cameras down for 12 seconds.';
        state.messageT = 3;
      } else {
        state.message = 'Panel recharging.';
        state.messageT = 2;
      }
    } else if (dist(p.x, p.y, EXIT.x, EXIT.y) < EXIT.r) {
      if (lootCount(state) === LOOT.length) {
        state.status = 'win';
        state.finalTime = state.time;
        state.finalScore = scoreOf(state) + cleanBonus(state);
        state.events.push('win');
      } else {
        const left = LOOT.length - lootCount(state);
        state.message = `Exit locked — ${left} loot to go.`;
        state.messageT = 2;
        state.events.push('locked');
      }
    }
  }
}
