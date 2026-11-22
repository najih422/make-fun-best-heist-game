// The Meridian Job — shared tuning: room, walls, loot, guards, cameras.
// One job per file: this one only holds numbers, no behaviour.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const WALL = 20; // outer wall thickness
export const ROOM = { x: WALL, y: WALL, w: VIEW_W - WALL * 2, h: VIEW_H - WALL * 2 };

export const PLAYER_R = 14;
export const WALK_SPEED = 150;
export const SNEAK_SPEED = 75;
export const DASH_SPEED = 430;
export const DASH_TIME = 0.18;
export const DASH_COOLDOWN = 1.2;

export const GUARD_R = 14;
export const GUARD_SPEEDS = { patrol: 55, suspicious: 82, chase: 112, search: 60, distracted: 70 };
export const HUNT_MULT = 1.22;
export const VISION_RANGE = 230;
export const VISION_SNEAK_RANGE = 140;
export const VISION_HALF_ANGLE = (35 * Math.PI) / 180;
export const TOUCH_DIST = 26;

export const CAM_RANGE = 210;
export const CAM_HALF_ANGLE = (32 * Math.PI) / 180;
export const CAM_SWEEP = (42 * Math.PI) / 180;
export const CAM_SWEEP_PERIOD = 4.2;
export const CAM_OFF_TIME = 12;
export const PANEL_COOLDOWN = 20;

export const ALARM_GUARD_RATE = 24;
export const ALARM_CAM_RATE = 32;
export const ALARM_DECAY = 7;
export const HUNT_ALARM = 60;

export const LOOT_TIME_BONUS_BASE = 600;
export const LOOT_TIME_BONUS_RATE = 2;

// Walls: solid rectangles. Two partitions with a gap each, plus the
// outer walls (kept as solids so movement needs no special case).
export const WALLS = [
  // west partition x=400 (gap y 246..430)
  { x: 392, y: WALL, w: 16, h: 246 - WALL },
  { x: 392, y: 430, w: 16, h: VIEW_H - WALL - 430 },
  // east partition x=850 (gap y 206..380)
  { x: 842, y: WALL, w: 16, h: 206 - WALL },
  { x: 842, y: 380, w: 16, h: VIEW_H - WALL - 380 },
  // outer walls
  { x: 0, y: 0, w: VIEW_W, h: WALL },
  { x: 0, y: VIEW_H - WALL, w: VIEW_W, h: WALL },
  { x: 0, y: 0, w: WALL, h: VIEW_H },
  { x: VIEW_W - WALL, y: 0, w: WALL, h: VIEW_H },
];

// The statue island in the middle of the room.
export const STATUE = { x: 585, y: 300, w: 110, h: 90 };

// Cover blocks: display cases and plants. They block sight AND movement.
// Every patrol segment and every autopilot corridor stays clear of them.
export const COVER = [
  // west wing
  { x: 150, y: 150, w: 70, h: 44, kind: 'case' },
  { x: 250, y: 520, w: 70, h: 44, kind: 'case' },
  { x: 280, y: 180, w: 56, h: 56, kind: 'plant' },
  // centre
  { x: 480, y: 520, w: 64, h: 44, kind: 'case' },
  { x: 730, y: 120, w: 64, h: 44, kind: 'case' },
  { x: 620, y: 500, w: 60, h: 44, kind: 'plant' },
  // east wing
  { x: 940, y: 150, w: 70, h: 44, kind: 'case' },
  { x: 940, y: 520, w: 70, h: 44, kind: 'case' },
  { x: 1130, y: 420, w: 56, h: 56, kind: 'plant' },
];

export const LOOT = [
  { id: 'ruby', name: 'Sunburst Ruby', value: 500, x: 1140, y: 210, color: '#ff4d6d' },
  { id: 'mask', name: 'Golden Mask', value: 400, x: 140, y: 620, color: '#ffd23f' },
  { id: 'ledger', name: 'Emerald Ledger', value: 300, x: 640, y: 250, color: '#2fd47a' },
];

// The order the autopilot (and the "Next:" hint) takes the loot in.
export const ROUTE_LOOT = ['ruby', 'ledger', 'mask'];

export const EXIT = { x: 640, y: 682, r: 46 };
export const PANEL = { x: 640, y: 420, r: 40 };
export const START = { x: 640, y: 660 };

export const GUARDS = [
  {
    name: 'Marlo',
    color: '#4da3ff',
    waypoints: [[60, 120], [60, 600], [370, 600], [370, 120]],
  },
  {
    name: 'Inez',
    color: '#ff9f2e',
    waypoints: [[470, 150], [700, 150], [800, 250], [800, 500], [700, 600], [470, 600], [450, 380]],
  },
  {
    name: 'Bram',
    color: '#b388ff',
    waypoints: [[1060, 120], [1060, 600], [1220, 600], [1220, 120]],
  },
];

export const CAMERAS = [
  { name: 'CAM 1', x: 418, y: 72, baseAngle: Math.PI / 2 },
  { name: 'CAM 2', x: 868, y: 680, baseAngle: -Math.PI / 2 },
];

// Autopilot route: wing-aware waypoints from the door to each loot and out.
// Ruby is waypoint 5, the Ledger 9, the Mask 15, the exit 22.
export const ROUTE = [
  [760, 660], [760, 560], [760, 300], [850, 290], [1060, 290], [1140, 210],
  [1060, 290], [850, 290], [740, 250], [640, 250],
  [570, 280], [500, 340], [400, 340], [300, 340], [220, 480], [140, 620],
  [220, 480], [300, 340], [400, 340], [520, 420], [600, 560], [640, 660], [640, 682],
];

export const SAMPLE_DT = 0.12;
