// Echo Command — game data definitions.
// All times are in simulation ticks unless suffixed otherwise.

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const BASE_LOOP_SECONDS = 60;
export const BASE_MAX_LOOPS = 6;

// Loop identity colors (hex ints for three.js, css strings derived in ui).
export const LOOP_COLORS = [
  0x3fa9ff, // 1 blue
  0xb06bff, // 2 purple
  0x3dff9c, // 3 green
  0xffa03c, // 4 orange
  0xff4d5e, // 5 red
  0x35e8d8, // 6 teal
  0xffe14d, // 7 yellow
  0xff6bd5, // 8 magenta
];

// Deuteranopia/protanopia-friendlier alternative: blue / yellow / white /
// orange / violet / teal — separated by luminance as well as hue.
export const LOOP_COLORS_CB = [
  0x3f8cff,
  0xffd23c,
  0xf2f4ff,
  0xff8c2a,
  0x9a6bff,
  0x35e8d8,
  0x9dffb0,
  0xff6bd5,
];

export const TEAM = { ALLY: 0, ENEMY: 1, NEUTRAL: 2 };

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'Assault Rifle', key: 'AR',
    desc: 'Reliable full-auto rifle. Steady damage at any range.',
    dmg: 9, cooldown: 8, spread: 0.045, pellets: 1, speed: 52, ttl: 70,
    kind: 'bullet', size: 0.09, kick: 0.35, sfx: 'rifle',
    unlock: null,
  },
  shotgun: {
    id: 'shotgun', name: 'Breach Shotgun', key: 'SG',
    desc: 'Seven-pellet burst. Devastating up close, weak at range.',
    dmg: 7, cooldown: 46, spread: 0.16, pellets: 7, speed: 44, ttl: 26,
    kind: 'bullet', size: 0.08, kick: 1.4, sfx: 'shotgun',
    unlock: null,
  },
  pulse: {
    id: 'pulse', name: 'Pulse Rifle', key: 'PL',
    desc: 'Three-round energy bursts. High impact, moderate rate.',
    dmg: 13, cooldown: 30, spread: 0.02, pellets: 1, burst: 3, burstGap: 4,
    speed: 60, ttl: 80, kind: 'plasma', size: 0.14, kick: 0.5, sfx: 'pulse',
    unlock: { stat: 'missions', n: 2, label: 'Clear 2 missions' },
  },
  railgun: {
    id: 'railgun', name: 'Railgun', key: 'RG',
    desc: 'Instant piercing lance. Punches through every target in line.',
    dmg: 64, cooldown: 78, spread: 0, pellets: 1, speed: 0, ttl: 0,
    kind: 'beam', range: 46, kick: 2.2, sfx: 'railgun',
    unlock: { stat: 'missions', n: 5, label: 'Clear 5 missions' },
  },
  launcher: {
    id: 'launcher', name: 'Grenade Launcher', key: 'GL',
    desc: 'Arcing grenades. Area damage — dangerous to your own echoes.',
    dmg: 46, cooldown: 64, spread: 0.03, pellets: 1, speed: 26, ttl: 60,
    kind: 'grenade', aoe: 3.6, size: 0.16, kick: 1.1, sfx: 'thump',
    unlock: { stat: 'missions', n: 8, label: 'Clear 8 missions' },
  },
  arc: {
    id: 'arc', name: 'Arc Cannon', key: 'AC',
    desc: 'Lightning that chains between up to four targets.',
    dmg: 26, cooldown: 40, spread: 0, pellets: 1, speed: 0, ttl: 0,
    kind: 'chain', range: 20, chains: 3, chainRange: 8, kick: 0.7, sfx: 'arc',
    unlock: { stat: 'boss', n: 1, label: 'Defeat a sector boss' },
  },
  flamer: {
    id: 'flamer', name: 'Flame Projector', key: 'FP',
    desc: 'Short-range cone of fire. Melts groups, ignores shields.',
    dmg: 3, cooldown: 3, spread: 0.22, pellets: 2, speed: 20, ttl: 24,
    kind: 'flame', size: 0.22, kick: 0.05, sfx: 'flame', ignoreShield: true,
    unlock: { stat: 'missions', n: 12, label: 'Clear 12 missions' },
  },
};

export const ABILITIES = {
  turret: {
    id: 'turret', name: 'Sentry Turret', key: 'TUR',
    desc: 'Deploys an auto-targeting turret for 25 seconds.',
    cd: 20 * TICK_RATE, duration: 25 * TICK_RATE, sfx: 'deploy',
    unlock: null,
  },
  blink: {
    id: 'blink', name: 'Blink', key: 'BLK',
    desc: 'Instantly translocate a short distance toward your aim.',
    cd: 7 * TICK_RATE, range: 9, sfx: 'blink',
    unlock: null,
  },
  dome: {
    id: 'dome', name: 'Shield Dome', key: 'DOM',
    desc: 'Projects a dome that blocks enemy fire for 7 seconds.',
    cd: 18 * TICK_RATE, duration: 7 * TICK_RATE, radius: 4.2, sfx: 'dome',
    unlock: null,
  },
  emp: {
    id: 'emp', name: 'EMP Burst', key: 'EMP',
    desc: 'Stuns nearby enemies for 3.5s and wipes hostile projectiles.',
    cd: 16 * TICK_RATE, radius: 8, stun: 3.5 * TICK_RATE, sfx: 'emp',
    unlock: { stat: 'missions', n: 3, label: 'Clear 3 missions' },
  },
  mines: {
    id: 'mines', name: 'Minefield', key: 'MIN',
    desc: 'Scatters five proximity mines at the target point.',
    cd: 22 * TICK_RATE, count: 5, dmg: 40, aoe: 2.8, sfx: 'deploy',
    unlock: { stat: 'missions', n: 6, label: 'Clear 6 missions' },
  },
  decoy: {
    id: 'decoy', name: 'Decoy', key: 'DCY',
    desc: 'Projects a hologram that draws enemy fire for 6 seconds.',
    cd: 15 * TICK_RATE, duration: 6 * TICK_RATE, sfx: 'blink',
    unlock: { stat: 'missions', n: 9, label: 'Clear 9 missions' },
  },
  orbital: {
    id: 'orbital', name: 'Orbital Strike', key: 'ORB',
    desc: 'Calls a devastating strike after a 1.5 second lock-on.',
    cd: 30 * TICK_RATE, delay: 1.5 * TICK_RATE, dmg: 120, aoe: 5, range: 24,
    sfx: 'orbitalMark',
    unlock: { stat: 'boss', n: 1, label: 'Defeat a sector boss' },
  },
  overclock: {
    id: 'overclock', name: 'Overclock', key: 'OVC',
    desc: '+60% fire rate and +35% speed for 6 seconds.',
    cd: 24 * TICK_RATE, duration: 6 * TICK_RATE, sfx: 'overclock',
    unlock: { stat: 'missions', n: 15, label: 'Clear 15 missions' },
  },
};

export const ENEMIES = {
  infantry: {
    id: 'infantry', name: 'Infantry', hp: 34, speed: 4.2, radius: 0.45,
    range: 11, aggro: 17, dmg: 5, fireCd: 52, burst: 3, burstGap: 6,
    projSpeed: 26, credits: 8, score: 10,
  },
  heavy: {
    id: 'heavy', name: 'Heavy', hp: 130, speed: 2.3, radius: 0.72,
    range: 12, aggro: 16, dmg: 18, fireCd: 130, projSpeed: 20, aoe: 2.2,
    credits: 22, score: 30,
  },
  shieldbearer: {
    id: 'shieldbearer', name: 'Aegis Carrier', hp: 60, speed: 3.0,
    radius: 0.55, range: 9, aggro: 16, dmg: 4, fireCd: 70, projSpeed: 24,
    shieldRadius: 3.4, credits: 20, score: 25,
  },
  sniper: {
    id: 'sniper', name: 'Marksman', hp: 30, speed: 2.6, radius: 0.42,
    range: 26, aggro: 30, dmg: 34, fireCd: 210, aimTime: 66,
    credits: 18, score: 25,
  },
  drone: {
    id: 'drone', name: 'Strike Drone', hp: 16, speed: 6.4, radius: 0.4,
    range: 8, aggro: 22, dmg: 3, fireCd: 34, projSpeed: 30, flying: true,
    credits: 6, score: 8,
  },
  walker: {
    id: 'walker', name: 'Walker', hp: 420, speed: 1.7, radius: 1.15,
    range: 15, aggro: 20, dmg: 12, fireCd: 46, projSpeed: 24, volley: 4,
    credits: 70, score: 120, elite: true,
  },
  boss: {
    id: 'boss', name: 'Bastion Core', hp: 1600, speed: 0, radius: 2.2,
    range: 24, aggro: 99, dmg: 10, fireCd: 30, projSpeed: 22,
    credits: 400, score: 1000, boss: true,
  },
};

export const MISSION_TYPES = {
  reactors: {
    id: 'reactors', name: 'Reactor Purge',
    brief: 'Destroy every reactor within a single loop. Reactors rebuild when the timeline resets — split your echoes across them.',
  },
  nodes: {
    id: 'nodes', name: 'Node Capture',
    brief: 'Capture every control node in one loop. A node needs a commander or echo standing on it — bodies on points win this.',
  },
  terminals: {
    id: 'terminals', name: 'Data Heist',
    brief: 'Hack all terminals within one loop. Hacking requires an uninterrupted presence — echoes hack exactly as you did.',
  },
  extraction: {
    id: 'extraction', name: 'Extraction Hold',
    brief: 'Charge the extraction beacon by holding the zone. Keep allies inside until the charge completes — then survive it.',
  },
  boss: {
    id: 'boss', name: 'Bastion Assault',
    brief: 'The Bastion Core is shielded by four pylons that self-repair after 8 seconds. All four must be down at once. One commander cannot do this. Six of you can.',
  },
  endless: {
    id: 'endless', name: 'Endless Protocol',
    brief: 'Hold the arena as long as the timeline lasts. Each loop escalates the response. When the commander falls, the record ends.',
  },
};

// Run upgrades (bought at shops / labs during a run).
export const UPGRADES = [
  { id: 'looptime', name: 'Temporal Buffer', cost: 90, max: 3,
    desc: '+10 seconds of loop duration.' },
  { id: 'maxloops', name: 'Echo Battery', cost: 130, max: 2,
    desc: '+1 maximum loop per mission.' },
  { id: 'hp', name: 'Composite Plating', cost: 70, max: 3,
    desc: '+25 commander and echo hull.' },
  { id: 'dmg', name: 'Munitions Lab', cost: 80, max: 3,
    desc: '+15% weapon damage for all timelines.' },
  { id: 'cdr', name: 'Coolant Loop', cost: 75, max: 2,
    desc: '20% faster ability cooldowns.' },
  { id: 'speed', name: 'Servo Boost', cost: 60, max: 2,
    desc: '+12% movement speed.' },
  { id: 'echoguard', name: 'Phase Anchor', cost: 100, max: 2,
    desc: 'Echoes take 30% less damage.' },
  { id: 'regen', name: 'Nanite Weave', cost: 85, max: 2,
    desc: 'Commander regenerates 2 hull per second.' },
];

export const PLAYER_BASE = {
  hp: 100, speed: 6.2, sprint: 8.9, radius: 0.42,
};

// Persistent unlock thresholds are declared on WEAPONS/ABILITIES above.
export const SECTOR_COLS = 8;

export const GFX_PRESETS = {
  low:    { name: 'Low',    pixelRatio: 0.75, shadows: false, shadowRes: 512,  bloom: false, particles: 0.4 },
  medium: { name: 'Medium', pixelRatio: 1.0,  shadows: true,  shadowRes: 1024, bloom: true,  particles: 0.7 },
  high:   { name: 'High',   pixelRatio: 1.0,  shadows: true,  shadowRes: 2048, bloom: true,  particles: 1.0 },
  ultra:  { name: 'Ultra',  pixelRatio: 1.5,  shadows: true,  shadowRes: 2048, bloom: true,  particles: 1.3 },
};

export const DEFAULT_SETTINGS = {
  gfx: 'high',
  masterVol: 0.8,
  musicVol: 0.7,
  sfxVol: 0.9,
  uiScale: 1.0,
  colorblind: false,
  screenshake: true,
  camSmoothing: true,
};

export function loopColor(i, colorblind) {
  const pal = colorblind ? LOOP_COLORS_CB : LOOP_COLORS;
  return pal[i % pal.length];
}

export function cssColor(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
