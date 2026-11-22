// Rook, the thief: walk, sneak, dash, throw a coin, drop smoke.
// Movement is axis-separated through ctx.move so Rook slides along
// walls instead of sticking to them. No rendering here, no DOM.

import {
  PLAYER_R,
  WALK_SPEED,
  SNEAK_SPEED,
  DASH_SPEED,
  DASH_TIME,
  DASH_COOLDOWN,
} from './config.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    dir: -Math.PI / 2, // facing up, into the room
    coins: 5,
    smoke: 2,
    dashT: 0,
    dashCd: 0,
    coinCd: 0,
    sneaking: false,
    moving: false,
  };
}

// input: { mx, my, sneak, dash, coin: {x,y}|null, smoke: bool }
// ctx: { move(x, y, r, dx, dy), time, onCoin(x, y), onSmoke(x, y) }
export function updatePlayer(p, input, dt, ctx) {
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.dashT = Math.max(0, p.dashT - dt);
  p.coinCd = Math.max(0, p.coinCd - dt);

  let mx = input.mx || 0;
  let my = input.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  p.moving = len > 0.01;
  // Sneaking is a stance, not a speed: crouching still behind cover
  // still counts as sneaking (vision range 140, not 230).
  p.sneaking = !!input.sneak;

  if (input.dash && p.dashCd <= 0 && p.moving) {
    p.dashT = DASH_TIME;
    p.dashCd = DASH_COOLDOWN;
    if (ctx.onDash) ctx.onDash();
  }

  const speed = p.dashT > 0 ? DASH_SPEED : p.sneaking ? SNEAK_SPEED : WALK_SPEED;
  if (p.moving) {
    p.dir = Math.atan2(my, mx);
    const next = ctx.move(p.x, p.y, PLAYER_R, mx * speed * dt, my * speed * dt);
    p.x = next.x;
    p.y = next.y;
  }

  // A coin throw has a 1.5 s cooldown: no rapid-fire distraction.
  if (input.coin && p.coins > 0 && p.coinCd <= 0) {
    p.coins -= 1;
    p.coinCd = 1.5;
    ctx.onCoin(input.coin.x, input.coin.y);
  }
  if (input.smoke && p.smoke > 0) {
    p.smoke -= 1;
    ctx.onSmoke(p.x, p.y);
  }
}
