// All drawing: the museum room, guards and cones, cameras, loot, HUD,
// and the title / win / busted overlays. Reads state, writes pixels.

import {
  VIEW_W,
  VIEW_H,
  WALLS,
  STATUE,
  COVER,
  LOOT,
  EXIT,
  PANEL,
  CAM_RANGE,
  CAM_HALF_ANGLE,
  VISION_RANGE,
  VISION_HALF_ANGLE,
} from './config.js';
import { lootCount, nextLoot, scoreOf, SOLIDS } from './world.js';

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

// Ray from (x,y) along (dx,dy); distance to the first solid hit within
// `maxD`, or null. Slab method on the ray parameter t.
function rayHitRect(x, y, dx, dy, r, maxD) {
  let tmin = 0;
  let tmax = maxD;
  if (dx === 0) {
    if (x < r.x || x > r.x + r.w) return null;
  } else {
    let t1 = (r.x - x) / dx;
    let t2 = (r.x + r.w - x) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (dy === 0) {
    if (y < r.y || y > r.y + r.h) return null;
  } else {
    let t1 = (r.y - y) / dy;
    let t2 = (r.y + r.h - y) / dy;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// A vision cone clipped by walls and cover: cast rays across the cone,
// stop each one at the first solid, and fill the resulting polygon.
// A crate that keeps you safe no longer looks lit up.
function conePath(ctx, x, y, dir, range, halfAngle) {
  const N = 48;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i <= N; i++) {
    const a = dir - halfAngle + (2 * halfAngle * i) / N;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let r = range;
    for (const s of SOLIDS) {
      const t = rayHitRect(x, y, dx, dy, s, range);
      if (t !== null && t < r) r = t;
    }
    ctx.lineTo(x + dx * r, y + dy * r);
  }
  ctx.closePath();
}

function drawRoom(ctx, state) {
  // Floor: dark tiles.
  ctx.fillStyle = '#171a26';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#141724';
  const tile = 80;
  for (let y = 0; y < VIEW_H; y += tile) {
    for (let x = 0; x < VIEW_W; x += tile) {
      if (((x + y) / tile) % 2 === 0) ctx.fillRect(x, y, tile, tile);
    }
  }
  // Gold runner down the middle of the room.
  ctx.fillStyle = 'rgba(212, 175, 55, 0.07)';
  ctx.fillRect(600, 20, 80, 680);

  // Walls.
  for (const w of WALLS) {
    ctx.fillStyle = '#2b3048';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#3a4066';
    if (w.w > w.h) ctx.fillRect(w.x, w.y, w.w, 3);
    else ctx.fillRect(w.x, w.y, 3, w.h);
  }

  // Statue island: pedestal and bust.
  ctx.fillStyle = '#3a3f58';
  ctx.fillRect(STATUE.x, STATUE.y, STATUE.w, STATUE.h);
  ctx.fillStyle = '#4a5070';
  ctx.fillRect(STATUE.x + 8, STATUE.y + 8, STATUE.w - 16, STATUE.h - 16);
  ctx.fillStyle = '#c9cddb';
  ctx.beginPath();
  ctx.arc(STATUE.x + STATUE.w / 2, STATUE.y + 32, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(STATUE.x + STATUE.w / 2 - 22, STATUE.y + 48, 44, 30);

  // Cover blocks: display cases and plants.
  for (const b of COVER) {
    if (b.kind === 'case') {
      ctx.fillStyle = '#6b5a2e';
      ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      ctx.fillStyle = 'rgba(120, 160, 220, 0.20)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(b.x + 6, b.y + 5, b.w - 12, 4);
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2 + 4, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#7a4a2b';
      ctx.fillRect(b.x + b.w / 2 - 12, b.y + b.h - 16, 24, 16);
      ctx.fillStyle = '#2f7a3d';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2 - 10, b.y + b.h / 2, 13, 0, Math.PI * 2);
      ctx.arc(b.x + b.w / 2 + 10, b.y + b.h / 2 - 4, 13, 0, Math.PI * 2);
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2 - 12, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Exit door on the bottom wall.
  const unlocked = lootCount(state) === LOOT.length;
  ctx.fillStyle = unlocked ? '#1f7a3d' : '#7a2e2e';
  ctx.fillRect(EXIT.x - 40, VIEW_H - 20, 80, 20);
  ctx.fillStyle = unlocked ? '#2fd47a' : '#ff7a6b';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(unlocked ? 'EXIT OPEN' : 'EXIT', EXIT.x, VIEW_H - 10);

  // Camera panel.
  ctx.fillStyle = '#2b3048';
  ctx.fillRect(PANEL.x - 14, PANEL.y - 10, 28, 20);
  const panelReady = state.time >= state.panelCdUntil;
  ctx.fillStyle = panelReady ? '#2fd47a' : '#ffb02e';
  ctx.beginPath();
  ctx.arc(PANEL.x, PANEL.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9aa0b5';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('PANEL', PANEL.x, PANEL.y + 20);
}

function drawLoot(ctx, state) {
  for (const l of LOOT) {
    if (state.loot[l.id]) continue;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 3 + l.x);
    ctx.fillStyle = l.color;
    ctx.globalAlpha = 0.14 + 0.1 * pulse;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (l.id === 'ruby') {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
    } else if (l.id === 'mask') {
      ctx.beginPath();
      ctx.ellipse(l.x, l.y, 13, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#171a26';
      ctx.fillRect(l.x - 8, l.y - 2, 6, 3);
      ctx.fillRect(l.x + 2, l.y - 2, 6, 3);
      ctx.fillStyle = l.color;
    } else {
      ctx.fillRect(l.x - 11, l.y - 8, 22, 16);
      ctx.fillStyle = 'rgba(23, 26, 38, 0.8)';
      ctx.fillRect(l.x - 7, l.y - 4, 14, 2);
      ctx.fillRect(l.x - 7, l.y + 1, 14, 2);
      ctx.fillStyle = l.color;
    }
    ctx.fillStyle = '#e8eaf2';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${l.value}`, l.x, l.y + 26);
  }
}

function drawCameras(ctx, state) {
  for (const cam of state.cameras) {
    const off = state.time < state.camerasOffUntil;
    // Sweeping cone, clipped by walls and cover.
    conePath(ctx, cam.x, cam.y, cam.angle, CAM_RANGE, CAM_HALF_ANGLE);
    ctx.fillStyle = off ? 'rgba(150, 155, 175, 0.05)' : 'rgba(255, 210, 63, 0.10)';
    ctx.fill();
    // Mount.
    ctx.fillStyle = off ? '#555a6e' : '#c9a227';
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#171a26';
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, 3, 0, Math.PI * 2);
    ctx.fill();
    // Label BELOW the camera, never above: the HUD sits at the top.
    ctx.fillStyle = off ? '#7a7f92' : '#ffd23f';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cam.name, cam.x, cam.y + 26);
  }
}

function drawGuards(ctx, state) {
  for (const g of state.guards) {
    // Vision cone, clipped by walls and cover.
    conePath(ctx, g.x, g.y, g.dir, VISION_RANGE, VISION_HALF_ANGLE);
    ctx.fillStyle = g.seeing ? 'rgba(255, 60, 60, 0.22)' : g.color + '22';
    ctx.fill();
    // Body.
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#171a26';
    ctx.beginPath();
    ctx.arc(g.x, g.y, 14, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 9, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = '#171a26';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x + Math.cos(g.dir) * 13, g.y + Math.sin(g.dir) * 13);
    ctx.stroke();
    // Name initial.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.name[0], g.x, g.y + 0.5);
    // Spotted!
    if (g.seeing) {
      ctx.fillStyle = '#ff3c3c';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('!', g.x, g.y - 26);
    }
  }
}

function drawPlayer(ctx, state) {
  const p = state.player;
  // Thrown coin on the floor.
  if (state.coin) {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(state.coin.x, state.coin.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.coin.x, state.coin.y, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Smoke cloud.
  if (state.smoke && state.time < state.smoke.until) {
    ctx.fillStyle = 'rgba(180, 185, 200, 0.30)';
    for (const [dx, dy, r] of [[-22, 6, 26], [18, -8, 30], [0, 12, 24], [-4, -18, 22]]) {
      ctx.beginPath();
      ctx.arc(state.smoke.x + dx, state.smoke.y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Rook: dark cloak, gold trim, facing wedge.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 10, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c1f2e';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#d4af37';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, 11, p.dir - 0.35, p.dir + 0.35);
  ctx.closePath();
  ctx.fill();
  if (p.sneaking) {
    ctx.fillStyle = '#9aa0b5';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('sneak', p.x, p.y - 22);
  }
}

function drawHUD(ctx, state) {
  // Alarm bar, top centre.
  const bx = 490;
  const bw = 300;
  const by = 14;
  ctx.fillStyle = 'rgba(10, 12, 20, 0.65)';
  ctx.fillRect(bx - 70, by - 6, bw + 140, 28);
  ctx.fillStyle = '#262a3d';
  ctx.fillRect(bx, by, bw, 14);
  const frac = state.alarm / 100;
  ctx.fillStyle = state.alarm >= 60 ? '#ff3c3c' : state.alarm >= 40 ? '#ffb02e' : '#2fd47a';
  ctx.fillRect(bx, by, bw * frac, 14);
  ctx.fillStyle = '#e8eaf2';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('ALARM', bx - 62, by + 7);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(state.alarm)}%`, bx + bw + 62, by + 7);
  if (state.hunt) {
    ctx.fillStyle = '#ff3c3c';
    ctx.textAlign = 'center';
    ctx.fillText('HUNT MODE', 640, by + 32);
  }

  // Left: loot and score.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8eaf2';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`LOOT ${lootCount(state)}/3`, 24, 22);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(`$${scoreOf(state)}`, 24, 44);
  // Right: tools and timer.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e8eaf2';
  ctx.fillText(`COINS ${state.player.coins}   SMOKE ${state.player.smoke}`, VIEW_W - 24, 22);
  ctx.fillText(fmtTime(state.time), VIEW_W - 24, 44);

  // Bottom hint.
  const next = nextLoot(state);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c9cddb';
  ctx.font = '14px system-ui, sans-serif';
  const hint = next ? `Next: ${next.name} ($${next.value})` : 'All loot secured — reach the exit!';
  ctx.fillText(hint, 640, VIEW_H - 52);
  if (state.messageT > 0) {
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(state.message, 640, VIEW_H - 30);
  }
}

function overlay(ctx, title, lines, color) {
  ctx.fillStyle = 'rgba(5, 6, 12, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText(title, 640, 250);
  ctx.fillStyle = '#e8eaf2';
  ctx.font = '17px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, 640, 310 + i * 30));
}

export function render(ctx, state) {
  drawRoom(ctx, state);
  drawLoot(ctx, state);
  drawCameras(ctx, state);
  drawGuards(ctx, state);
  drawPlayer(ctx, state);
  if (state.status !== 'title') drawHUD(ctx, state);

  if (state.status === 'title') {
    overlay(ctx, 'THE MERIDIAN JOB', [
      'A one-room heist. Steal the Ruby, the Mask and the Ledger, then reach the exit.',
      'WASD move · Shift sneak · Space dash · Click throw a coin · F smoke · E loot / panel / exit',
      'Guards and cameras raise the alarm. At 60% they hunt. At 100% you are busted.',
      '',
      'Press Enter to start',
    ], '#d4af37');
  } else if (state.status === 'win') {
    const peak = state.peakAlarm;
    const line =
      peak === 0
        ? 'Peak alarm 0% — the room never knew you were there.'
        : peak < 20
          ? `Peak alarm ${peak}% — a whisper of an alarm, and you were already gone.`
          : peak < 60
            ? `Peak alarm ${peak}% — the alarm climbed, but you were faster.`
            : `Peak alarm ${peak}% — they nearly had you. Nearly doesn't pay.`;
    overlay(ctx, 'CLEAN GETAWAY', [
      `Score $${state.finalScore}   ·   Time ${fmtTime(state.finalTime)}   ·   Loot 3/3`,
      line,
      '',
      'Press R to play again',
    ], '#2fd47a');
  } else if (state.status === 'busted') {
    overlay(ctx, 'BUSTED', [
      state.bustedReason,
      `Score $${state.finalScore}   ·   Time ${fmtTime(state.finalTime)}`,
      '',
      'Press R to try again',
    ], '#ff3c3c');
  }
}
