// The two sweeping security cameras. A camera watches a cone that
// swings around its base angle; the panel (E) kills both for 12 s.
// Pure logic: no drawing, no DOM.

import {
  CAM_RANGE,
  CAM_HALF_ANGLE,
  CAM_SWEEP,
  CAM_SWEEP_PERIOD,
} from './config.js';
import { canSee } from './vision.js';

export function createCamera(def, index) {
  return {
    name: def.name,
    x: def.x,
    y: def.y,
    baseAngle: def.baseAngle,
    phase: index * 1.7, // fixed offset per camera: deterministic
    angle: def.baseAngle,
    seeing: false,
  };
}

// ctx: { player, solids, time, camerasOffUntil, smokeHides }
export function updateCamera(cam, dt, ctx) {
  void dt;
  cam.angle =
    cam.baseAngle + CAM_SWEEP * Math.sin((2 * Math.PI * ctx.time) / CAM_SWEEP_PERIOD + cam.phase);
  const off = ctx.time < ctx.camerasOffUntil;
  cam.seeing =
    !off &&
    !ctx.smokeHides &&
    canSee(cam.x, cam.y, cam.angle, CAM_RANGE, CAM_HALF_ANGLE, ctx.player.x, ctx.player.y, ctx.solids);
  return cam.seeing;
}
