// Pure geometry: vision cones and line of sight. No game state, no DOM.

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// Is the target inside a cone of `range` and `halfAngle` around `dir`?
export function inCone(ox, oy, dir, range, halfAngle, tx, ty) {
  const d = dist(ox, oy, tx, ty);
  if (d > range) return false;
  if (d < 1) return true;
  return Math.abs(angleDiff(angleTo(ox, oy, tx, ty), dir)) <= halfAngle;
}

// Does the segment (x1,y1)-(x2,y2) hit the rectangle? Slab method:
// clip the segment against each axis slab, keep the overlap.
function segHitsRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x1 < r.x || x1 > r.x + r.w) return false;
  } else {
    let t1 = (r.x - x1) / dx;
    let t2 = (r.x + r.w - x1) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (y1 < r.y || y1 > r.y + r.h) return false;
  } else {
    let t1 = (r.y - y1) / dy;
    let t2 = (r.y + r.h - y1) / dy;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// True when nothing solid stands between the two points.
export function hasLOS(x1, y1, x2, y2, solids) {
  for (const s of solids) {
    if (segHitsRect(x1, y1, x2, y2, s)) return false;
  }
  return true;
}

// Full sight check: inside the cone AND a clear line of sight.
export function canSee(ox, oy, dir, range, halfAngle, tx, ty, solids) {
  return inCone(ox, oy, dir, range, halfAngle, tx, ty) && hasLOS(ox, oy, tx, ty, solids);
}
