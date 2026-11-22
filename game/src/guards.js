// The three guards: patrol → suspicious → chase → search, plus a
// distraction when a coin lands nearby. Movement is axis-separated
// through ctx.move so guards slide along walls instead of sticking.

import {
  GUARD_R,
  GUARD_SPEEDS,
  HUNT_MULT,
  VISION_RANGE,
  VISION_SNEAK_RANGE,
  VISION_HALF_ANGLE,
} from './config.js';
import { canSee, hasLOS, dist, angleTo } from './vision.js';

export function createGuard(def) {
  return {
    name: def.name,
    color: def.color,
    waypoints: def.waypoints,
    wp: 0,
    x: def.waypoints[0][0],
    y: def.waypoints[0][1],
    dir: Math.PI / 2,
    mode: 'patrol',
    seeT: 0,
    loseT: 0,
    lookT: 0,
    waitT: 0,
    lastSeen: null,
    seeing: false,
  };
}

function nearestWaypoint(g) {
  let best = 0;
  let bestD = Infinity;
  g.waypoints.forEach(([x, y], i) => {
    const d = dist(g.x, g.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// Walk toward (tx,ty) at `speed`, sliding along walls. True on arrival.
function stepToward(g, tx, ty, speed, dt, ctx) {
  const d = dist(g.x, g.y, tx, ty);
  if (d < 1) return true;
  const vx = (tx - g.x) / d;
  const vy = (ty - g.y) / d;
  const next = ctx.move(g.x, g.y, GUARD_R, vx * speed * dt, vy * speed * dt);
  g.dir = Math.atan2(vy, vx);
  g.x = next.x;
  g.y = next.y;
  return dist(g.x, g.y, tx, ty) < 12;
}

// ctx: { player, solids, move, time, hunt, coin, smokeHides }
// Returns true while this guard can see Rook.
export function updateGuard(g, dt, ctx) {
  const range = ctx.player.sneaking ? VISION_SNEAK_RANGE : VISION_RANGE;
  g.seeing =
    !ctx.smokeHides &&
    canSee(g.x, g.y, g.dir, range, VISION_HALF_ANGLE, ctx.player.x, ctx.player.y, ctx.solids);

  if (g.seeing) {
    g.lastSeen = { x: ctx.player.x, y: ctx.player.y };
    g.seeT += dt;
    g.loseT = 0;
    if (g.mode !== 'chase' && g.seeT > 0.45) g.mode = 'chase';
    else if (g.mode === 'patrol') g.mode = 'suspicious';
  } else {
    g.seeT = 0;
    if (g.mode === 'chase' || g.mode === 'suspicious') {
      g.loseT += dt;
      if (g.loseT > 1.2) {
        g.mode = 'search';
        g.lookT = 0;
      }
    }
  }

  // A coin landing nearby pulls a patrolling guard off its route —
  // but only if he can actually SEE it land. A coin he only hears
  // (within 300 px, no line of sight) just makes him stop and look
  // around where he stands.
  if (
    ctx.coin &&
    (g.mode === 'patrol' || g.mode === 'suspicious') &&
    dist(g.x, g.y, ctx.coin.x, ctx.coin.y) < 300
  ) {
    if (hasLOS(g.x, g.y, ctx.coin.x, ctx.coin.y, ctx.solids)) {
      g.mode = 'distracted';
      g.waitT = 0;
    } else if (g.mode === 'patrol') {
      g.mode = 'suspicious';
      g.lastSeen = { x: g.x, y: g.y };
    }
  }

  // In hunt mode the chase is faster (HUNT_MULT) and the patrol is
  // 30% faster too — a 60%+ alarm has to feel different, not cosmetic.
  const speed = (m) =>
    GUARD_SPEEDS[m] * (ctx.hunt ? (m === 'chase' ? HUNT_MULT : m === 'patrol' ? 1.3 : 1) : 1);

  if (g.mode === 'patrol') {
    const [tx, ty] = g.waypoints[g.wp];
    if (stepToward(g, tx, ty, speed('patrol'), dt, ctx)) g.wp = (g.wp + 1) % g.waypoints.length;
  } else if (g.mode === 'suspicious') {
    if (g.lastSeen && stepToward(g, g.lastSeen.x, g.lastSeen.y, speed('suspicious'), dt, ctx)) {
      g.mode = 'search';
      g.lookT = 0;
    }
  } else if (g.mode === 'chase') {
    stepToward(g, ctx.player.x, ctx.player.y, speed('chase'), dt, ctx);
    g.dir = angleTo(g.x, g.y, ctx.player.x, ctx.player.y);
  } else if (g.mode === 'search') {
    if (g.lastSeen && !stepToward(g, g.lastSeen.x, g.lastSeen.y, speed('search'), dt, ctx)) {
      // still walking to the last seen spot
    } else {
      g.lookT += dt;
      g.dir += 1.4 * dt; // scan the room
      if (g.lookT > 2.5) {
        g.mode = 'patrol';
        g.wp = nearestWaypoint(g);
      }
    }
  } else if (g.mode === 'distracted') {
    if (ctx.coin) {
      if (stepToward(g, ctx.coin.x, ctx.coin.y, speed('distracted'), dt, ctx)) {
        g.waitT += dt;
        if (g.waitT > 1.6 || ctx.time > ctx.coin.until) {
          g.mode = 'patrol';
          g.wp = nearestWaypoint(g);
        }
      }
    } else {
      g.mode = 'patrol';
      g.wp = nearestWaypoint(g);
    }
  }
  return g.seeing;
}
