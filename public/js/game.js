// Inti game: loop, arena, fase ronde, gift, HUD. Host adalah otoritas; view hanya menampilkan snapshot.
import { Audio } from './audio.js';
import { Net } from './net.js';
import { LocalSim } from './localsim.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
// Khusus pengujian: ?speed=10 mempercepat durasi fase saja, bukan simulasi arena.
const PHASE_SPEED = Math.max(0.1, Number(params.get('speed')) || 1);

const W = 1080;
const H = 1920;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
const TAU = Math.PI * 2;
const TEAM_COUNT = 7;
const CELL_EMPTY = 0;
const COLOR_WHITE = 7;
const COLOR_GOLD = 8;
const COLOR_COUNT = 9;
const PHASE_LABEL = {
  PREP: 'PERSIAPAN', BATTLE: 'PERTEMPURAN', OVERTIME: 'OVERTIME', SUDDEN: 'SUDDEN DEATH', CROWN: 'PENOBATAN',
};

let role = params.get('role') === 'view' ? 'view' : 'host';
let cfg;
let wilayah;
let teams = [];
const teamIndex = new Map();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let renderScale = 1;

// ----- zona tata letak -----
let hudTop = 0;
let hudH = 0;
let arenaTop = 0;
let arenaH = 0;
let bannerTop = 0;
let bannerH = 0;
let decoTop = 0;
let cols = 96;
let rows = 68;
let cellCount = 0;
let cellW = 1;
let cellH = 1;

// ----- status jaringan & papan skor -----
let net = null;
let backendUp = false;
let lastMeteorTarget = -1;
let lastMeteorFrac = 0;
let localSim = null;
let status = { source: 'tiktok', connected: false, detail: 'Menghubungkan...', simActive: false };
let viewerCount = 0;
let viewClients = 0;
let scoreboard = null;
const pendingResults = [];

// ----- status ronde -----
let phase = 'PREP';
let phaseEnd = 0;
let phaseLeft = 0;
let lastWholeSecond = -1;
let round = 0;
let suddenUsed = false;
let bootId = '';
let battleStartedAt = 0;
let simulatedThisRound = false;
let crownResult = null;
let crownMvpAt = 0;
let nextFireworkAt = 0;

// ----- grid wilayah -----
let grid;
let pixels;
let gridImage;
let gridCtx;
let gridCanvas;
let gridDirty = false;
const palette = new Uint32Array(TEAM_COUNT + 1);
const counts = new Int32Array(TEAM_COUNT + 1);
const lossBuf = new Int32Array(TEAM_COUNT + 1);

// ----- kubu -----
const baseX = new Float32Array(TEAM_COUNT);
const baseY = new Float32Array(TEAM_COUNT);
const underdog = new Float32Array(TEAM_COUNT).fill(1);
const underdogTarget = new Float32Array(TEAM_COUNT).fill(1);
const rageUntil = new Float64Array(TEAM_COUNT);
const rageReadyAt = new Float64Array(TEAM_COUNT);
const revengeUntil = new Float64Array(TEAM_COUNT);
const takeoverUntil = new Float64Array(TEAM_COUNT);
const spirit = new Float32Array(TEAM_COUNT);
const activeMembers = new Int32Array(TEAM_COUNT);
const mergeCounts = new Int32Array(TEAM_COUNT);
const labelBudget = new Int8Array(TEAM_COUNT);
const PREP_LABELS_PER_TEAM = 3;
const PERIMETER_ORDER = ['JAWA', 'PAPUA', 'SULAWESI', 'BALI_NUSRA', 'KALIMANTAN', 'SUMATERA', 'MALUKU'];
const SLOT_POSITIONS = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0, 1], [0, 0.5]];
let perimeterTeams = [];
let nextUnderdogAt = 0;
let nextRageCheckAt = 0;

// ----- penonton & prajurit -----
const viewers = new Map();
const soldiers = [];
let freeSlots;
let freeTop = 0;
let activeSoldiers = 0;
let maxSoldiers = 300;
let hashCols = 0;
let hashRows = 0;
let hashHead;
let hashNext;
const HASH_SIZE = 64;
let labelScale = 1.25;

// ----- partikel (SoA) -----
let maxParticles = 800;
let pX;
let pY;
let pVX;
let pVY;
let pLife;
let pMax;
let pSize;
let pColor;
let pNext = 0;
let pAlive = 0;

// ----- efek gift -----
const METEOR_MAX = 8;
const WAVE_MAX = 4;
const meteors = [];
const waves = [];
const pendingTakeovers = [];
const deferredGifts = [];
const combos = new Map();
let shakeUntil = 0;
let shakeMag = 0;
let flashUntil = 0;

// ----- antrean event masuk -----
const queue = [];
let queueHead = 0;

// ----- antrean suara: dimainkan di luar loop render -----
const SFX_CAPACITY = 256;
const sfxNames = new Array(SFX_CAPACITY);
const sfxTeams = new Int8Array(SFX_CAPACITY);
const sfxStreaks = new Int32Array(SFX_CAPACITY);
const sfxIntensity = new Float32Array(SFX_CAPACITY);
const sfxOptions = { team: 0, streak: 0, intensity: 0 };
let sfxHead = 0;
let sfxTail = 0;

// ----- banner -----
let bannerUntil = 0;
let bannerPriority = 0;
let bannerText = '';
let bannerColor = '#ffffff';
let bannerDirty = true;
const BANNER_TIP_H = 40;
const BASE_TAG_H = 36;
let tips = [''];
let tipIndex = 0;
let nextTipAt = 0;
let tipText = '';
let baseTagSprites = [];

// ----- kanvas cache -----
let bgCanvas;
let hudCanvas;
let hudCtx;
let bannerCanvas;
let bannerCtx;
let overlayCanvas;
let overlayCtx;
let overlayKind = '';
let prasastiCanvas = null;
let prasastiKey = '';
let prasastiOffset = 0;
let baseSprites = [];
let soldierSprites = [];
let glowSprites = [];
let edgeSprite;
let crownSprite;
let starSprite;
let rageSprite;
let nextHudAt = 0;

// ----- view -----
let viewSoldiers = new Float32Array(0);
let viewSoldierCount = 0;

// ----- pengukuran -----
let lastFrameMs = 0;
let fpsFrames = 0;
let fpsWindowStart = 0;
let fps = 0;
let nextDebugAt = 0;
let worstFrameMs = 0;
let frameCostSum = 0;
let frameCostCount = 0;
let frameCostMs = 0;
let frameCostMax = 0;
let debugForceSudden = false;

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
const nowSeconds = () => performance.now() / 1000;
const random = (min, max) => min + Math.random() * (max - min);
const fighting = () => phase === 'BATTLE' || phase === 'OVERTIME' || phase === 'SUDDEN';

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function makeCanvas(width, height) {
  const element = document.createElement('canvas');
  element.width = Math.max(1, Math.ceil(width));
  element.height = Math.max(1, Math.ceil(height));
  return element;
}

function sfx(name, team = -1, streak = 0, intensity = 0) {
  const next = (sfxTail + 1) % SFX_CAPACITY;
  if (next === sfxHead) return;
  sfxNames[sfxTail] = name;
  sfxTeams[sfxTail] = team;
  sfxStreaks[sfxTail] = streak;
  sfxIntensity[sfxTail] = intensity;
  sfxTail = next;
}

function flushSfx() {
  while (sfxHead !== sfxTail) {
    sfxOptions.team = sfxTeams[sfxHead] < 0 ? undefined : sfxTeams[sfxHead];
    sfxOptions.streak = sfxStreaks[sfxHead];
    sfxOptions.intensity = sfxIntensity[sfxHead];
    Audio.play(sfxNames[sfxHead], sfxOptions);
    sfxHead = (sfxHead + 1) % SFX_CAPACITY;
  }
}

// ======================================================================
// Persiapan aset dan tata letak
// ======================================================================
function setupTeams() {
  teams = wilayah.kubu.slice().sort((a, b) => a.no - b.no);
  teams.forEach((team, index) => {
    teamIndex.set(team.code, index);
    team.rgb = hexToRgb(team.color);
  });
  perimeterTeams = PERIMETER_ORDER.map((code) => teamIndex.get(code));
}

function setupLayout() {
  const layout = cfg.layout;
  hudTop = layout.topEmptyEnd * H;
  hudH = (layout.hudEnd - layout.topEmptyEnd) * H;
  arenaTop = layout.hudEnd * H;
  arenaH = (layout.arenaEnd - layout.hudEnd) * H;
  bannerTop = layout.arenaEnd * H;
  bannerH = (layout.bannerEnd - layout.arenaEnd) * H;
  decoTop = layout.bannerEnd * H;
  cols = cfg.grid.cols;
  rows = cfg.grid.rows;
  cellCount = cols * rows;
  cellW = W / cols;
  cellH = arenaH / rows;
}

function setupGrid() {
  grid = new Uint8Array(cellCount);
  gridCanvas = makeCanvas(cols, rows);
  gridCtx = gridCanvas.getContext('2d');
  gridImage = gridCtx.createImageData(cols, rows);
  pixels = new Uint32Array(gridImage.data.buffer);
  const dark = [14, 17, 30];
  const compose = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  palette[CELL_EMPTY] = compose(dark[0], dark[1], dark[2]);
  teams.forEach((team, index) => {
    const mix = (channel) => Math.round(team.rgb[channel] * 0.62 + dark[channel] * 0.38);
    palette[index + 1] = compose(mix(0), mix(1), mix(2));
  });
  clearGrid();
}

function clearGrid() {
  grid.fill(CELL_EMPTY);
  pixels.fill(palette[CELL_EMPTY]);
  counts.fill(0);
  counts[CELL_EMPTY] = cellCount;
  gridDirty = true;
}

function radialSprite(size, stops) {
  const sprite = makeCanvas(size, size);
  const c = sprite.getContext('2d');
  const gradient = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  c.fillStyle = gradient;
  c.fillRect(0, 0, size, size);
  return sprite;
}

function setupSprites() {
  const colorRgb = (index) => {
    if (index === COLOR_WHITE) return [255, 255, 255];
    if (index === COLOR_GOLD) return [255, 214, 90];
    return teams[index].rgb;
  };

  glowSprites = [];
  for (let index = 0; index < COLOR_COUNT; index += 1) {
    const [r, g, b] = colorRgb(index);
    glowSprites.push(radialSprite(64, [
      [0, `rgba(${r},${g},${b},1)`],
      [0.35, `rgba(${r},${g},${b},0.55)`],
      [1, `rgba(${r},${g},${b},0)`],
    ]));
  }

  soldierSprites = teams.map((team) => {
    const sprite = makeCanvas(64, 64);
    const c = sprite.getContext('2d');
    c.beginPath();
    c.arc(32, 32, 28, 0, TAU);
    c.fillStyle = team.color;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.beginPath();
    c.arc(25, 24, 7, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fill();
    return sprite;
  });

  baseSprites = teams.map((team) => {
    const sprite = makeCanvas(120, 120);
    const c = sprite.getContext('2d');
    c.beginPath();
    c.arc(60, 60, 52, 0, TAU);
    c.fillStyle = team.color;
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.font = `800 46px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 7;
    c.strokeStyle = '#07080f';
    c.fillStyle = '#ffffff';
    c.strokeText(team.label, 60, 62);
    c.fillText(team.label, 60, 62);
    return sprite;
  });

  // Papan nama markas: penjelas singkatan sekaligus angka untuk gabung.
  baseTagSprites = teams.map((team) => {
    const text = `${team.no} ${shortName(team)}`;
    const font = `800 26px ${FONT}`;
    const measure = makeCanvas(1, 1).getContext('2d');
    measure.font = font;
    const width = Math.ceil(measure.measureText(text).width) + 22;
    const sprite = makeCanvas(width * 2, BASE_TAG_H * 2);
    const c = sprite.getContext('2d');
    c.scale(2, 2);
    roundedRect(c, 1, 1, width - 2, BASE_TAG_H - 2, 9);
    c.fillStyle = 'rgba(6,8,18,0.88)';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = team.color;
    c.stroke();
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.fillText(text, width / 2, BASE_TAG_H / 2 + 1);
    return sprite;
  });

  crownSprite = makeCanvas(84, 60);
  {
    const c = crownSprite.getContext('2d');
    c.beginPath();
    c.moveTo(6, 54);
    c.lineTo(2, 14);
    c.lineTo(24, 32);
    c.lineTo(42, 4);
    c.lineTo(60, 32);
    c.lineTo(82, 14);
    c.lineTo(78, 54);
    c.closePath();
    c.fillStyle = '#ffd25a';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#402c00';
    c.stroke();
  }

  starSprite = makeCanvas(40, 40);
  {
    const c = starSprite.getContext('2d');
    c.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? 18 : 8;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(20 + Math.cos(angle) * radius, 20 + Math.sin(angle) * radius);
    }
    c.closePath();
    c.fillStyle = '#ffd25a';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#402c00';
    c.stroke();
  }

  rageSprite = radialSprite(64, [
    [0, 'rgba(255,40,30,0)'],
    [0.55, 'rgba(255,40,30,0.15)'],
    [0.8, 'rgba(255,40,30,0.75)'],
    [1, 'rgba(255,40,30,0)'],
  ]);

  edgeSprite = makeCanvas(8, 256);
  {
    const c = edgeSprite.getContext('2d');
    const gradient = c.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, 'rgba(255,30,20,0.95)');
    gradient.addColorStop(1, 'rgba(255,30,20,0)');
    c.fillStyle = gradient;
    c.fillRect(0, 0, 8, 256);
  }

  bgCanvas = makeCanvas(270, 480);
  {
    const c = bgCanvas.getContext('2d');
    const gradient = c.createLinearGradient(0, 0, 0, 480);
    gradient.addColorStop(0, '#080a18');
    gradient.addColorStop(0.5, '#0b0e22');
    gradient.addColorStop(1, '#05060d');
    c.fillStyle = gradient;
    c.fillRect(0, 0, 270, 480);
    for (let i = 0; i < 70; i += 1) {
      c.fillStyle = `rgba(255,255,255,${random(0.05, 0.35).toFixed(2)})`;
      c.fillRect(Math.random() * 270, Math.random() * 480, 1, 1);
    }
  }

  hudCanvas = makeCanvas(W, hudH);
  hudCtx = hudCanvas.getContext('2d');
  bannerCanvas = makeCanvas(W, bannerH);
  bannerCtx = bannerCanvas.getContext('2d');
  overlayCanvas = makeCanvas(W, arenaH);
  overlayCtx = overlayCanvas.getContext('2d');
}

function setupPools() {
  maxSoldiers = cfg.limits.soldiers;
  maxParticles = cfg.limits.particles;
  freeSlots = new Int16Array(maxSoldiers);
  for (let i = 0; i < maxSoldiers; i += 1) {
    soldiers.push({
      index: i, active: false, team: 0, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, retargetAt: 0,
      viewer: null, born: 0, protectUntil: 0, eliteUntil: 0, dashUntil: 0, captain: false,
      battalion: 1, hasGift: false, lastCell: -1, radius: 14, mass: 1, wear: 0, label: null, labelReady: false,
      lastActionAt: 0,
    });
    freeSlots[freeTop] = i;
    freeTop += 1;
  }
  hashCols = Math.ceil(W / HASH_SIZE) + 1;
  hashRows = Math.ceil(arenaH / HASH_SIZE) + 1;
  hashHead = new Int16Array(hashCols * hashRows);
  hashNext = new Int16Array(maxSoldiers);

  pX = new Float32Array(maxParticles);
  pY = new Float32Array(maxParticles);
  pVX = new Float32Array(maxParticles);
  pVY = new Float32Array(maxParticles);
  pLife = new Float32Array(maxParticles);
  pMax = new Float32Array(maxParticles);
  pSize = new Float32Array(maxParticles);
  pColor = new Uint8Array(maxParticles);

  for (let i = 0; i < METEOR_MAX; i += 1) {
    meteors.push({ active: false, x: 0, y: 0, startX: 0, startY: 0, start: 0, end: 0, team: 0, target: -1, frac: 0 });
  }
  for (let i = 0; i < WAVE_MAX; i += 1) {
    waves.push({ active: false, cx: 0, cy: 0, radius: 0, team: 0, quota: 0, painted: 0 });
  }
}

function resize() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cssW = W * scale;
  const cssH = H * scale;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.left = `${(window.innerWidth - cssW) / 2}px`;
  canvas.style.top = `${(window.innerHeight - cssH) / 2}px`;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  renderScale = canvas.width / W;
  labelScale = clamp(renderScale, 1, 1.25);
}

function layoutBases() {
  const inset = 62;
  const shift = Math.max(0, round - 1);
  perimeterTeams.forEach((team, order) => {
    const slot = SLOT_POSITIONS[(order + shift) % SLOT_POSITIONS.length];
    baseX[team] = inset + slot[0] * (W - inset * 2);
    baseY[team] = arenaTop + inset + slot[1] * (arenaH - inset * 2);
  });
}

// ======================================================================
// Grid wilayah
// ======================================================================
function setCell(index, value) {
  const previous = grid[index];
  if (previous === value) return 0;
  counts[previous] -= 1;
  counts[value] += 1;
  lossBuf[previous] += 1;
  grid[index] = value;
  pixels[index] = palette[value];
  gridDirty = true;
  return 1;
}

function paintDisk(cx, cy, radius, value) {
  const limit = radius * radius + radius * 0.5;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const y = cy + dy;
    if (y < 0 || y >= rows) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = cx + dx;
      if (x < 0 || x >= cols || dx * dx + dy * dy > limit) continue;
      setCell(y * cols + x, value);
    }
  }
}

function paintCircleCapped(cx, cy, radius, value, cap) {
  const r2 = radius * radius;
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(rows - 1, Math.ceil(cy + radius));
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(cols - 1, Math.ceil(cx + radius));
  let changed = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (changed >= cap) return changed;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) changed += setCell(y * cols + x, value);
    }
  }
  return changed;
}

const paintedCells = () => cellCount - counts[CELL_EMPTY];

function territoryShare(team) {
  const painted = paintedCells();
  return painted > 0 ? counts[team + 1] / painted : 0;
}

function rankedLeader(exclude) {
  let best = -1;
  let bestCount = -1;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    if (team !== exclude && counts[team + 1] > bestCount) {
      bestCount = counts[team + 1];
      best = team;
    }
  }
  return best;
}

function smallestTeam() {
  let best = 0;
  let bestCount = Infinity;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    if (counts[team + 1] < bestCount) {
      bestCount = counts[team + 1];
      best = team;
    }
  }
  return best;
}

const cellX = (x) => clamp(Math.floor(x / cellW), 0, cols - 1);
const cellY = (y) => clamp(Math.floor((y - arenaTop) / cellH), 0, rows - 1);

// ======================================================================
// Prajurit
// ======================================================================
function releaseSoldier(soldier) {
  if (!soldier.active) return;
  soldier.active = false;
  if (soldier.viewer && soldier.viewer.soldier === soldier) soldier.viewer.soldier = null;
  soldier.viewer = null;
  soldier.labelReady = false;
  freeSlots[freeTop] = soldier.index;
  freeTop += 1;
  activeSoldiers -= 1;
}

// Pool penuh: dua prajurit non-gift tertua dari kubu terbesar dilebur jadi batalion.
function mergeOldest() {
  const perTeam = mergeCounts;
  perTeam.fill(0);
  for (let i = 0; i < maxSoldiers; i += 1) {
    const soldier = soldiers[i];
    if (soldier.active && !soldier.hasGift) perTeam[soldier.team] += 1;
  }
  let team = 0;
  for (let t = 1; t < TEAM_COUNT; t += 1) if (perTeam[t] > perTeam[team]) team = t;

  let oldest = null;
  let second = null;
  for (let i = 0; i < maxSoldiers; i += 1) {
    const soldier = soldiers[i];
    if (!soldier.active || soldier.hasGift || soldier.team !== team) continue;
    if (oldest === null || soldier.born < oldest.born) {
      second = oldest;
      oldest = soldier;
    } else if (second === null || soldier.born < second.born) {
      second = soldier;
    }
  }
  if (oldest && second) {
    second.battalion += oldest.battalion;
    releaseSoldier(oldest);
    return;
  }

  let fallback = oldest;
  if (!fallback) {
    for (let i = 0; i < maxSoldiers; i += 1) {
      const soldier = soldiers[i];
      if (soldier.active && (fallback === null || soldier.born < fallback.born)) fallback = soldier;
    }
  }
  if (fallback) releaseSoldier(fallback);
}

function prepareLabel(soldier, viewer) {
  if (!soldier.label) {
    soldier.label = makeCanvas(240 * labelScale, 48 * labelScale);
    soldier.labelScale = labelScale;
  }
  const c = soldier.label.getContext('2d');
  const scale = soldier.labelScale;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, soldier.label.width, soldier.label.height);
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.fillStyle = '#ffffff';
  c.font = `700 22px ${FONT}`;
  c.strokeText(viewer.nick, 120, 22);
  c.fillText(viewer.nick, 120, 22);
  if (viewer.province) {
    c.lineWidth = 3;
    c.fillStyle = '#d7dcf0';
    c.font = `600 16px ${FONT}`;
    c.strokeText(viewer.province, 120, 42);
    c.fillText(viewer.province, 120, 42);
  }
  soldier.labelReady = true;
}

function spawnSoldier(team, viewer, hasGift, now) {
  if (freeTop === 0) mergeOldest();
  if (freeTop === 0) return null;
  freeTop -= 1;
  const soldier = soldiers[freeSlots[freeTop]];
  const angle = Math.random() * TAU;
  const distance = random(20, 56);
  soldier.active = true;
  soldier.team = team;
  soldier.x = clamp(baseX[team] + Math.cos(angle) * distance, 8, W - 8);
  soldier.y = clamp(baseY[team] + Math.sin(angle) * distance, arenaTop + 8, arenaTop + arenaH - 8);
  soldier.vx = 0;
  soldier.vy = 0;
  soldier.tx = soldier.x;
  soldier.ty = soldier.y;
  soldier.retargetAt = 0;
  soldier.viewer = viewer;
  soldier.born = now;
  soldier.protectUntil = now + cfg.gameplay.spawnProtectSeconds;
  soldier.eliteUntil = 0;
  soldier.dashUntil = 0;
  soldier.captain = false;
  soldier.battalion = 1;
  soldier.wear = 0;
  soldier.hasGift = hasGift;
  soldier.lastCell = -1;
  soldier.lastActionAt = now;
  soldier.labelReady = false;
  activeSoldiers += 1;
  if (viewer) {
    viewer.soldier = soldier;
    prepareLabel(soldier, viewer);
  }
  return soldier;
}

function chooseTarget(soldier, now) {
  const team = soldier.team + 1;
  soldier.retargetAt = now + random(0.7, 1.6);
  if (!fighting()) {
    soldier.tx = clamp(baseX[soldier.team] + random(-90, 90), 8, W - 8);
    soldier.ty = clamp(baseY[soldier.team] + random(-90, 90), arenaTop + 8, arenaTop + arenaH - 8);
    return;
  }
  const reach = 320;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const x = clamp(soldier.x + random(-reach, reach), 8, W - 8);
    const y = clamp(soldier.y + random(-reach, reach), arenaTop + 8, arenaTop + arenaH - 8);
    if (grid[cellY(y) * cols + cellX(x)] !== team) {
      soldier.tx = x;
      soldier.ty = y;
      return;
    }
  }
  soldier.tx = random(8, W - 8);
  soldier.ty = random(arenaTop + 8, arenaTop + arenaH - 8);
}

function killSoldier(soldier) {
  spawnParticles(soldier.x, soldier.y, soldier.team, 6, 180, 0.45);
  sfx('clash');
  releaseSoldier(soldier);
}

function updateSoldierStats(soldier, dt, now) {
  const team = soldier.team;
  const multiplier = underdog[team];
  const u = cfg.underdog;
  const isElite = soldier.eliteUntil > now;
  const sizeBonus = Math.min(u.maxSizeBonus, (multiplier - 1) * (u.maxSizeBonus / Math.max(0.001, u.max - 1)));
  const battalionSize = 1 + Math.min(1, (soldier.battalion - 1) * 0.08);
  soldier.radius = cfg.gameplay.soldierRadius * (1 + sizeBonus) * (isElite ? 1.5 : 1) * battalionSize;
  let mass = multiplier * (1 + (soldier.battalion - 1) * 0.25);
  if (isElite) mass *= cfg.gameplay.eliteMass;
  if (soldier.captain) mass *= cfg.gameplay.captainMass;
  if (takeoverUntil[team] > now) mass *= cfg.gift.takeoverStrength;
  // Kemenangan tabrakan menguras massa dan pulih perlahan. Tanpa ini prajurit Underdog x3
  // mengalahkan lawan tanpa batas, sehingga satu orang bisa menyapu kubu berisi puluhan orang.
  if (soldier.wear > 0) soldier.wear = Math.max(0, soldier.wear - cfg.gameplay.wearRecoverPerSecond * dt);
  soldier.mass = Math.max(0.05, mass - soldier.wear);
}

function updateSoldiers(dt, now) {
  const isFighting = fighting();
  const u = cfg.underdog;
  const baseSpeed = cfg.gameplay.soldierSpeed;
  for (let i = 0; i < maxSoldiers; i += 1) {
    const soldier = soldiers[i];
    if (!soldier.active) continue;
    updateSoldierStats(soldier, dt, now);
    const team = soldier.team;
    const multiplier = underdog[team];

    let speed = baseSpeed * (1 + (multiplier - 1) * u.speedFactor);
    if (!isFighting) speed *= 0.35;
    if (rageUntil[team] > now) speed *= cfg.rage.speed;
    if (soldier.dashUntil > now) speed *= cfg.gameplay.dashSpeed;
    if (soldier.eliteUntil > now) speed *= 1.25;

    let dx = soldier.tx - soldier.x;
    let dy = soldier.ty - soldier.y;
    let distance = Math.sqrt(dx * dx + dy * dy);
    if (now >= soldier.retargetAt || distance < 12) {
      chooseTarget(soldier, now);
      dx = soldier.tx - soldier.x;
      dy = soldier.ty - soldier.y;
      distance = Math.sqrt(dx * dx + dy * dy);
    }
    const inverse = distance > 0.001 ? 1 / distance : 0;
    const blend = Math.min(1, dt * 6);
    soldier.vx += (dx * inverse * speed - soldier.vx) * blend;
    soldier.vy += (dy * inverse * speed - soldier.vy) * blend;
    soldier.x = clamp(soldier.x + soldier.vx * dt, 6, W - 6);
    soldier.y = clamp(soldier.y + soldier.vy * dt, arenaTop + 6, arenaTop + arenaH - 6);

    if (isFighting) {
      const cx = cellX(soldier.x);
      const cy = cellY(soldier.y);
      const cell = cy * cols + cx;
      if (cell !== soldier.lastCell) {
        soldier.lastCell = cell;
        const wide = multiplier >= u.paintRadius2At || soldier.eliteUntil > now || takeoverUntil[team] > now;
        paintDisk(cx, cy, wide ? 2 : 1, team + 1);
      }
    }
  }
  if (isFighting) resolveCollisions(now);
}

function resolveCollisions(now) {
  hashHead.fill(-1);
  for (let i = 0; i < maxSoldiers; i += 1) {
    const soldier = soldiers[i];
    if (!soldier.active) continue;
    const bx = Math.floor(soldier.x / HASH_SIZE);
    const by = Math.floor((soldier.y - arenaTop) / HASH_SIZE);
    const bucket = by * hashCols + bx;
    hashNext[i] = hashHead[bucket];
    hashHead[bucket] = i;
  }

  for (let i = 0; i < maxSoldiers; i += 1) {
    const a = soldiers[i];
    if (!a.active) continue;
    const bx = Math.floor(a.x / HASH_SIZE);
    const by = Math.floor((a.y - arenaTop) / HASH_SIZE);
    for (let oy = by - 1; oy <= by + 1 && a.active; oy += 1) {
      if (oy < 0 || oy >= hashRows) continue;
      for (let ox = bx - 1; ox <= bx + 1 && a.active; ox += 1) {
        if (ox < 0 || ox >= hashCols) continue;
        let j = hashHead[oy * hashCols + ox];
        while (j !== -1 && a.active) {
          const nextJ = hashNext[j];
          if (j > i) {
            const b = soldiers[j];
            if (b.active) collidePair(a, b, now);
          }
          j = nextJ;
        }
      }
    }
  }
}

function collidePair(a, b, now) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const reach = a.radius + b.radius;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= reach * reach) return;

  if (a.team === b.team) {
    if (distanceSquared > 0.01) {
      const distance = Math.sqrt(distanceSquared);
      const push = ((reach - distance) / distance) * 0.15;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
    }
    return;
  }
  if (a.protectUntil > now || b.protectUntil > now) return;

  const difference = a.mass - b.mass;
  const aLoses = Math.abs(difference) < 0.001 ? Math.random() < 0.5 : difference < 0;
  const winner = aLoses ? b : a;
  const loser = aLoses ? a : b;
  winner.wear += Math.min(1, loser.mass) * cfg.gameplay.clashWear;
  winner.mass = Math.max(0.05, winner.mass - Math.min(1, loser.mass) * cfg.gameplay.clashWear);
  killSoldier(loser);
}

// ======================================================================
// Partikel
// ======================================================================
function spawnParticles(x, y, color, amount, speed, life) {
  for (let i = 0; i < amount; i += 1) {
    const index = pNext;
    pNext = (pNext + 1) % maxParticles;
    if (pLife[index] <= 0) pAlive += 1;
    const angle = Math.random() * TAU;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    pX[index] = x;
    pY[index] = y;
    pVX[index] = Math.cos(angle) * velocity;
    pVY[index] = Math.sin(angle) * velocity;
    pLife[index] = life * (0.6 + Math.random() * 0.4);
    pMax[index] = pLife[index];
    pSize[index] = 14 + Math.random() * 20;
    pColor[index] = color;
  }
}

function updateParticles(dt) {
  const drag = Math.max(0, 1 - dt * 2.4);
  for (let i = 0; i < maxParticles; i += 1) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) {
      pAlive -= 1;
      continue;
    }
    pX[i] += pVX[i] * dt;
    pY[i] += pVY[i] * dt;
    pVX[i] *= drag;
    pVY[i] *= drag;
  }
}

// ======================================================================
// Banner
// ======================================================================
function showBanner(text, color, seconds, priority, now = nowSeconds()) {
  if (now < bannerUntil && priority < bannerPriority) return;
  bannerText = text;
  bannerColor = color;
  bannerUntil = now + seconds;
  bannerPriority = priority;
  bannerDirty = true;
}

function fitFont(c, text, maxWidth, size, weight = 800, minSize = 20) {
  let current = size;
  c.font = `${weight} ${current}px ${FONT}`;
  while (c.measureText(text).width > maxWidth && current > minSize) {
    current -= 2;
    c.font = `${weight} ${current}px ${FONT}`;
  }
}

function shortName(team) {
  return team.short || team.name;
}

// Host tidak bersuara, jadi game sendiri yang menjelaskan aturannya.
function buildTips() {
  const { rallySoldiers, spiritSoldiers } = cfg.gameplay;
  const { MID, SULTAN, MEGA } = cfg.gift.tiers;
  const join = 'Belum ikut? Ketik angka kubumu, 1 sampai 7';
  return [
    join,
    'Warna terluas saat waktu habis dapat +1 WIN',
    'Komentar apa saja: prajuritmu melesat',
    `Ketik GAS: panggil ${rallySoldiers} prajurit tambahan`,
    `Tap layar: isi Bar Semangat, penuh = ${spiritSoldiers} prajurit`,
    join,
    'Follow atau share: prajuritmu naik pangkat jadi Kapten',
    `Gift kecil: tambah prajurit • ${MID}+ koin: Prajurit Elite`,
    `Gift ${SULTAN}+ koin: Meteor • ${MEGA}+ koin: Takeover`,
    'Prajurit kalah? Komentar lagi untuk bangkit',
    'Kubu kecil dapat bonus Underdog: prajurit lebih besar dan cepat',
    'Penyawer terbesar di kubu pemenang jadi MVP',
  ];
}

function currentTip() {
  if (phase === 'PREP') return 'Mau pindah kubu? Ketik angka lain, hanya saat Persiapan';
  if (phase === 'OVERTIME') return `OVERTIME: efek gift ${cfg.gift.overtimeMultiplier}x lipat!`;
  if (phase === 'SUDDEN') return 'SUDDEN DEATH: selisih terlalu tipis, rebut wilayah terakhir!';
  if (phase === 'CROWN') return 'Ronde baru segera mulai, siapkan angka kubumu!';
  return tips[tipIndex];
}

// Baris kubu digambar selebar teksnya, karena panjang nama tiap kubu berbeda.
function drawTeamRow(c, row, y) {
  const labels = row.map((team) => `${team.no} ${shortName(team)}`);
  const gap = 40;
  const total = labels.reduce((sum, text) => sum + c.measureText(text).width, 0) + gap * (row.length - 1);
  let x = (W - total) / 2;
  c.textAlign = 'left';
  row.forEach((team, index) => {
    c.fillStyle = team.color;
    c.fillText(labels[index], x, y);
    x += c.measureText(labels[index]).width + gap;
  });
  c.textAlign = 'center';
}

function renderBanner(now) {
  const active = now < bannerUntil;
  if (!active && bannerText !== '') {
    bannerText = '';
    bannerPriority = 0;
    bannerDirty = true;
  }
  if (now >= nextTipAt) {
    nextTipAt = now + cfg.help.tipSeconds;
    tipIndex = (tipIndex + 1) % tips.length;
  }
  const tip = currentTip();
  if (tip !== tipText) {
    tipText = tip;
    bannerDirty = true;
  }
  if (!bannerDirty) return;
  bannerDirty = false;
  const c = bannerCtx;
  const mainH = bannerH - BANNER_TIP_H;
  c.clearRect(0, 0, W, bannerH);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (bannerText) {
    fitFont(c, bannerText, W - 60, 56, 800, 24);
    c.lineWidth = 8;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.fillStyle = bannerColor;
    c.strokeText(bannerText, W / 2, mainH / 2);
    c.fillText(bannerText, W / 2, mainH / 2);
  } else {
    c.fillStyle = '#ffffff';
    c.font = `800 36px ${FONT}`;
    c.fillText('Ketik 1-7 atau nama provinsimu', W / 2, mainH * 0.18);
    c.font = `800 32px ${FONT}`;
    drawTeamRow(c, teams.slice(0, 4), mainH * 0.53);
    drawTeamRow(c, teams.slice(4), mainH * 0.85);
  }
  // Baris tips selalu tampil, supaya penonton baru tetap terbantu saat banner ramai oleh gift.
  c.fillStyle = 'rgba(255,255,255,0.1)';
  c.fillRect(0, mainH + 2, W, BANNER_TIP_H - 2);
  c.fillStyle = '#ffd25a';
  fitFont(c, tipText, W - 40, 28, 700, 20);
  c.fillText(tipText, W / 2, mainH + 2 + (BANNER_TIP_H - 2) / 2);
}

// ======================================================================
// Penonton dan aksi chat
// ======================================================================
function getViewer(user) {
  let viewer = viewers.get(user.id);
  if (!viewer) {
    viewer = { id: user.id, nick: user.nick, team: -1, province: null, soldier: null, round: 0, lastAction: 0, coins: 0 };
    viewers.set(user.id, viewer);
  }
  viewer.nick = user.nick;
  return viewer;
}

function joinRound(viewer, team, province, now) {
  viewer.team = team;
  viewer.round = round;
  viewer.coins = 0;
  if (province) viewer.province = province;
  viewer.lastAction = now;
  viewer.soldier = null;
}

function ensureSoldier(viewer, now) {
  return viewer.soldier || spawnSoldier(viewer.team, viewer, false, now);
}

function handleChat(message, now) {
  if (phase === 'CROWN') return;
  const { action, team: code, province } = message.data;
  const team = teamIndex.get(code);
  if (team === undefined || !message.user) return;
  const viewer = getViewer(message.user);
  const isMember = viewer.round === round && viewer.team >= 0;

  if (action === 'TEAM_JOIN') {
    if (isMember && viewer.team !== team && phase === 'PREP') {
      // Pindah kubu hanya sah di fase Persiapan.
      if (viewer.soldier) releaseSoldier(viewer.soldier);
      viewer.team = team;
      viewer.province = province;
      viewer.lastAction = now;
      ensureSoldier(viewer, now);
      sfx('join', team);
      return;
    }
    if (isMember) {
      viewer.lastAction = now;
      ensureSoldier(viewer, now);
      return;
    }
    joinRound(viewer, team, province, now);
    viewer.province = province;
    ensureSoldier(viewer, now);
    sfx('join', team);
    return;
  }

  // Keputusan #2: kubu ronde ini mengikuti catatan frontend, bukan kubu terakhir di backend.
  if (!isMember) joinRound(viewer, team, null, now);
  viewer.lastAction = now;
  const soldier = ensureSoldier(viewer, now);
  if (!fighting() || !soldier) return;
  soldier.lastActionAt = now;

  if (action === 'DASH') {
    soldier.dashUntil = now + cfg.gameplay.dashSeconds;
    soldier.retargetAt = 0;
    sfx('dash');
  } else if (action === 'RALLY') {
    for (let i = 0; i < cfg.gameplay.rallySoldiers; i += 1) spawnSoldier(viewer.team, null, false, now);
    sfx('rally', viewer.team);
  }
}

function handleLikes(message) {
  const likes = message.data.likes || {};
  for (const code of Object.keys(likes)) {
    const team = teamIndex.get(code);
    if (team !== undefined) spirit[team] += Number(likes[code]) || 0;
  }
}

function checkSpirit(now) {
  if (!fighting()) return;
  const threshold = cfg.gameplay.spiritLikes;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    if (spirit[team] < threshold) continue;
    spirit[team] -= threshold;
    for (let i = 0; i < cfg.gameplay.spiritSoldiers; i += 1) spawnSoldier(team, null, false, now);
    spawnParticles(baseX[team], baseY[team], team, 24, 320, 0.7);
    sfx('wave', team);
    showBanner(`Bar Semangat ${teams[team].name} penuh!`, teams[team].color, 1.8, 1, now);
  }
}

function handleCaptain(message, now) {
  if (phase === 'CROWN' || !message.user) return;
  const team = teamIndex.get(message.data.team);
  if (team === undefined) return;
  const viewer = getViewer(message.user);
  if (viewer.round !== round || viewer.team < 0) joinRound(viewer, team, null, now);
  viewer.lastAction = now;
  const soldier = ensureSoldier(viewer, now);
  if (soldier) {
    soldier.captain = true;
    soldier.lastActionAt = now;
    spawnParticles(soldier.x, soldier.y, COLOR_GOLD, 12, 200, 0.5);
  }
  sfx('captain');
  showBanner(`${viewer.nick} naik pangkat jadi Kapten`, '#ffd25a', 1.6, 1, now);
}

// ======================================================================
// Gift
// ======================================================================
function giftEffectMultiplier(team, now) {
  let value = 1;
  if (phase === 'OVERTIME') value *= cfg.gift.overtimeMultiplier;
  if (revengeUntil[team] > now) value *= cfg.gift.revengeMultiplier;
  return value;
}

function territoryFraction(perLog, coins, multiplier) {
  return Math.min(cfg.gift.maxEventTerritory, perLog * Math.log10(Math.max(10, coins)) * multiplier);
}

function handleGift(message, now) {
  const data = message.data;
  if (!message.user) return;
  if (data.delta <= 0) {
    if (data.streakEnded) combos.delete(data.streakId);
    return;
  }
  const viewer = getViewer(message.user);
  let team = viewer.round === round && viewer.team >= 0 ? viewer.team : teamIndex.get(data.team);
  if (team === undefined) team = smallestTeam();

  if (fighting()) {
    applyGift(viewer, team, data, now);
    return;
  }
  // Di luar pertempuran arena kosong: efek ditahan sampai ronde berikutnya mulai.
  if (data.tier !== 'MICRO' || deferredGifts.length < cfg.gift.deferredMax) {
    deferredGifts.push({ viewer, team, data });
  }
  sfx('coin', -1, 1);
  showBanner(`${viewer.nick}: ${data.giftName}, efek aktif saat perang mulai`, '#ffd25a', 2, 1, now);
}

function applyGift(viewer, team, data, now) {
  if (viewer.round !== round || viewer.team < 0) joinRound(viewer, team, null, now);
  viewer.lastAction = now;
  viewer.coins += data.coins;
  team = viewer.team;
  const color = teams[team].color;
  const multiplier = giftEffectMultiplier(team, now);

  if (data.tier === 'MICRO') {
    giftMicro(viewer, team, data, multiplier, now);
  } else if (data.tier === 'MID') {
    giftMid(viewer, team, data, multiplier, now);
    showBanner(`${viewer.nick} • ${data.giftName} • Prajurit Elite!`, color, 2.2, 2, now);
  } else if (data.tier === 'SULTAN') {
    const target = launchMeteor(team, data.coins, multiplier, now);
    const targetName = target >= 0 ? teams[target].name : 'arena';
    showBanner(`${viewer.nick} • ${data.giftName} • Meteor ke ${targetName}!`, color, 3, 3, now);
  } else {
    startTakeover(viewer, team, data.coins, multiplier, now);
    showBanner(`${viewer.nick} • ${data.giftName} • TAKEOVER!`, '#ffd25a', 4, 4, now);
  }
}

function giftMicro(viewer, team, data, multiplier, now) {
  const amount = Math.min(cfg.gift.microMaxPerEvent, Math.round(data.coins * multiplier));
  for (let i = 0; i < amount; i += 1) spawnSoldier(team, null, true, now);

  const soldier = ensureSoldier(viewer, now);
  const x = soldier ? soldier.x : baseX[team];
  const y = soldier ? soldier.y : baseY[team];
  const radius = 2 + Math.log10(Math.max(1, data.coins)) * multiplier;
  const cap = Math.floor(cfg.gift.maxEventTerritory * cellCount);
  paintCircleCapped(cellX(x), cellY(y), radius, team + 1, cap);
  spawnParticles(x, y, team, 6, 150, 0.4);
  if (soldier) soldier.lastActionAt = now;

  const previous = combos.get(data.streakId) || 0;
  const combo = previous + data.delta;
  if (data.streakEnded) combos.delete(data.streakId);
  else combos.set(data.streakId, combo);
  sfx('coin', -1, combo);

  const milestones = [10, 25, 50];
  for (let level = 0; level < milestones.length; level += 1) {
    if (previous < milestones[level] && combo >= milestones[level]) sfx('combo', -1, 0, level + 1);
  }
  showBanner(`${viewer.nick} • ${data.giftName} • x${combo} COMBO`, teams[team].color, 1.6, 1, now);
}

function giftMid(viewer, team, data, multiplier, now) {
  const elites = clamp(Math.round(Math.log10(Math.max(10, data.coins)) * multiplier), 1, 5);
  const until = now + cfg.gift.eliteSeconds;
  const own = ensureSoldier(viewer, now);
  if (own) {
    own.eliteUntil = until;
    own.hasGift = true;
    own.lastActionAt = now;
    spawnParticles(own.x, own.y, team, 16, 260, 0.55);
  }
  for (let i = 1; i < elites; i += 1) {
    const extra = spawnSoldier(team, null, true, now);
    if (extra) extra.eliteUntil = until;
  }
  sfx('elite');
}

function launchMeteor(team, coins, multiplier, now) {
  const target = rankedLeader(team);
  lastMeteorTarget = target;
  const frac = territoryFraction(0.02, coins, multiplier);
  lastMeteorFrac = frac;
  const meteor = meteors.find((m) => !m.active);
  const cell = findMeteorCell(target);
  const x = (cell % cols + 0.5) * cellW;
  const y = arenaTop + (Math.floor(cell / cols) + 0.5) * cellH;
  if (!meteor) {
    impactMeteor(x, y, team, target, frac, now);
    return target;
  }
  meteor.active = true;
  meteor.team = team;
  meteor.target = target;
  meteor.frac = frac;
  meteor.x = x;
  meteor.y = y;
  meteor.startX = x + (x < W / 2 ? 260 : -260);
  meteor.startY = arenaTop - 340;
  meteor.start = now;
  meteor.end = now + 0.9;
  sfx('meteorFall');
  return target;
}

function findMeteorCell(target) {
  const value = target + 1;
  let best = -1;
  let bestScore = -1;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const index = Math.floor(Math.random() * cellCount);
    if (grid[index] !== value) continue;
    let score = 0;
    const x = index % cols;
    const y = Math.floor(index / cols);
    for (let probe = 0; probe < 8; probe += 1) {
      const nx = clamp(x + Math.floor(random(-5, 6)), 0, cols - 1);
      const ny = clamp(y + Math.floor(random(-5, 6)), 0, rows - 1);
      if (grid[ny * cols + nx] === value) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best >= 0 ? best : Math.floor(rows / 2) * cols + Math.floor(cols / 2);
}

function impactMeteor(x, y, team, target, frac, now) {
  const radiusCells = Math.sqrt((frac * cellCount) / Math.PI);
  const cap = Math.floor(cfg.gift.maxEventTerritory * cellCount);
  paintCircleCapped(x / cellW, (y - arenaTop) / cellH, radiusCells, team + 1, cap);

  const reach = radiusCells * Math.max(cellW, cellH);
  for (let i = 0; i < maxSoldiers; i += 1) {
    const soldier = soldiers[i];
    if (!soldier.active || soldier.team === team) continue;
    const dx = soldier.x - x;
    const dy = soldier.y - y;
    if (dx * dx + dy * dy < reach * reach) killSoldier(soldier);
  }

  spawnParticles(x, y, team, 70, 620, 0.9);
  spawnParticles(x, y, COLOR_GOLD, 40, 420, 0.7);
  shake(0.45, 18, now);
  flashUntil = now + 0.12;
  sfx('impact');
  if (target >= 0 && counts[target + 1] > 0) triggerRevenge(target, now);
}

function triggerRevenge(team, now) {
  revengeUntil[team] = now + cfg.gift.revengeSeconds;
  sfx('revenge');
  showBanner(`BALAS DENDAM ${teams[team].name}: efek gift x1.5`, teams[team].color, 2.4, 2, now);
}

function startTakeover(viewer, team, coins, multiplier, now) {
  pendingTakeovers.push({
    at: now + 1.5,
    team,
    frac: territoryFraction(0.045, coins, multiplier),
    x: baseX[team],
    y: baseY[team],
  });
  sfx('takeover');
  addPrasastiLocal(viewer.nick);
}

function launchWave(item, now) {
  const wave = waves.find((w) => !w.active);
  takeoverUntil[item.team] = now + cfg.gift.takeoverSeconds;
  shake(0.6, 22, now);
  flashUntil = now + 0.16;
  if (!wave) return;
  wave.active = true;
  wave.cx = item.x / cellW;
  wave.cy = (item.y - arenaTop) / cellH;
  wave.radius = 0;
  wave.team = item.team;
  wave.quota = Math.floor(item.frac * cellCount);
  wave.painted = 0;
  lossBuf.fill(0);
}

function updateWaves(dt, now) {
  for (let i = pendingTakeovers.length - 1; i >= 0; i -= 1) {
    if (now >= pendingTakeovers[i].at) {
      launchWave(pendingTakeovers[i], now);
      pendingTakeovers.splice(i, 1);
    }
  }
  const maxRadius = cols + rows;
  for (let i = 0; i < WAVE_MAX; i += 1) {
    const wave = waves[i];
    if (!wave.active) continue;
    const previous = wave.radius;
    wave.radius += dt * 46;
    const r2 = wave.radius * wave.radius;
    const inner = previous * previous;
    const minY = Math.max(0, Math.floor(wave.cy - wave.radius));
    const maxY = Math.min(rows - 1, Math.ceil(wave.cy + wave.radius));
    const minX = Math.max(0, Math.floor(wave.cx - wave.radius));
    const maxX = Math.min(cols - 1, Math.ceil(wave.cx + wave.radius));
    for (let y = minY; y <= maxY && wave.painted < wave.quota; y += 1) {
      for (let x = minX; x <= maxX && wave.painted < wave.quota; x += 1) {
        const dx = x - wave.cx;
        const dy = y - wave.cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && d2 >= inner) wave.painted += setCell(y * cols + x, wave.team + 1);
      }
    }
    if (wave.painted >= wave.quota || wave.radius > maxRadius) {
      wave.active = false;
      let victim = -1;
      let lost = 0;
      for (let team = 0; team < TEAM_COUNT; team += 1) {
        if (team !== wave.team && lossBuf[team + 1] > lost) {
          lost = lossBuf[team + 1];
          victim = team;
        }
      }
      if (victim >= 0) triggerRevenge(victim, now);
    }
  }
}

function updateMeteors(now) {
  for (let i = 0; i < METEOR_MAX; i += 1) {
    const meteor = meteors[i];
    if (!meteor.active) continue;
    if (now >= meteor.end) {
      meteor.active = false;
      impactMeteor(meteor.x, meteor.y, meteor.team, meteor.target, meteor.frac, now);
    }
  }
}

function shake(seconds, magnitude, now) {
  shakeUntil = now + seconds;
  shakeMag = magnitude;
}

function flushDeferredGifts(now) {
  for (const item of deferredGifts) {
    const team = item.viewer.round === round && item.viewer.team >= 0 ? item.viewer.team : item.team;
    applyGift(item.viewer, team, item.data, now);
  }
  deferredGifts.length = 0;
}

// ======================================================================
// Underdog dan Rage
// ======================================================================
function recomputeUnderdog(now) {
  const u = cfg.underdog;
  activeMembers.fill(0);
  for (const viewer of viewers.values()) {
    if (viewer.round === round && viewer.team >= 0 && now - viewer.lastAction <= u.activeWindowSeconds) {
      activeMembers[viewer.team] += 1;
    }
  }
  let total = 0;
  let teamsWithMembers = 0;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    total += activeMembers[team];
    if (activeMembers[team] > 0) teamsWithMembers += 1;
  }
  const average = teamsWithMembers > 0 ? total / teamsWithMembers : 0;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    underdogTarget[team] = activeMembers[team] > 0
      ? clamp(Math.sqrt(average / activeMembers[team]), u.min, u.max)
      : 1;
  }
}

function updateUnderdog(dt, now) {
  if (now >= nextUnderdogAt) {
    nextUnderdogAt = now + cfg.underdog.recalcSeconds;
    recomputeUnderdog(now);
  }
  const blend = Math.min(1, dt * 0.8);
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    underdog[team] += (underdogTarget[team] - underdog[team]) * blend;
  }
}

function checkRage(now) {
  if (now < nextRageCheckAt || !fighting()) return;
  nextRageCheckAt = now + 1;
  const r = cfg.rage;
  if (now - battleStartedAt < r.graceSeconds) return;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    if (activeMembers[team] === 0 || now < rageReadyAt[team]) continue;
    if (territoryShare(team) < r.threshold) {
      rageUntil[team] = now + r.seconds;
      rageReadyAt[team] = now + r.seconds + r.cooldownSeconds;
      sfx('rage', team);
      showBanner(`RAGE MODE: ${teams[team].name} melesat!`, teams[team].color, 2.2, 2, now);
    }
  }
}

// ======================================================================
// Fase ronde
// ======================================================================
function setPhase(next, seconds) {
  phase = next;
  phaseEnd = performance.now() + (seconds * 1000) / PHASE_SPEED;
  lastWholeSecond = -1;
  overlayKind = '';
}

function clearArena() {
  for (let i = 0; i < maxSoldiers; i += 1) {
    if (soldiers[i].active) releaseSoldier(soldiers[i]);
  }
  for (let i = 0; i < METEOR_MAX; i += 1) meteors[i].active = false;
  for (let i = 0; i < WAVE_MAX; i += 1) waves[i].active = false;
  pendingTakeovers.length = 0;
  combos.clear();
  clearGrid();
  rageUntil.fill(0);
  rageReadyAt.fill(0);
  revengeUntil.fill(0);
  takeoverUntil.fill(0);
  spirit.fill(0);
  underdog.fill(1);
  underdogTarget.fill(1);
}

function enterPrep() {
  round += 1;
  suddenUsed = false;
  crownResult = null;
  simulatedThisRound = Boolean(status.simActive || (localSim && localSim.running));
  layoutBases();
  clearArena();
  setPhase('PREP', cfg.phases.prep);
  nextUnderdogAt = 0;
  Audio.stop('suddenDeath');
  Audio.setMusicIntensity(0);
}

function enterBattle(now) {
  setPhase('BATTLE', cfg.phases.battle);
  battleStartedAt = now;
  nextRageCheckAt = now + 1;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    if (activeMembers[team] > 0 || hasSoldier(team)) paintDisk(cellX(baseX[team]), cellY(baseY[team]), 3, team + 1);
  }
  for (let i = 0; i < maxSoldiers; i += 1) {
    if (soldiers[i].active) soldiers[i].retargetAt = 0;
  }
  sfx('start');
  Audio.setMusicIntensity(1);
  showBanner('PERANG DIMULAI!', '#ffffff', 1.8, 2, now);
  flushDeferredGifts(now);
}

function hasSoldier(team) {
  for (let i = 0; i < maxSoldiers; i += 1) {
    if (soldiers[i].active && soldiers[i].team === team) return true;
  }
  return false;
}

function topTwoGap() {
  let first = 0;
  let second = 0;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    const share = territoryShare(team);
    if (share > first) {
      second = first;
      first = share;
    } else if (share > second) {
      second = share;
    }
  }
  return first > 0 && second > 0 ? first - second : Infinity;
}

function enterCrown(now) {
  setPhase('CROWN', cfg.phases.crown);
  Audio.stop('suddenDeath');
  Audio.setMusicIntensity(-1);

  const painted = paintedCells();
  const winnerIndex = painted > 0 ? rankedLeader(-1) : -1;
  const territory = {};
  teams.forEach((team, index) => {
    territory[team.code] = Math.round(territoryShare(index) * 1000) / 10;
  });

  let mvp = null;
  if (winnerIndex >= 0) {
    for (const viewer of viewers.values()) {
      if (viewer.round === round && viewer.team === winnerIndex && viewer.coins > 0 && (!mvp || viewer.coins > mvp.coins)) {
        mvp = { id: viewer.id, nick: viewer.nick, coins: viewer.coins };
      }
    }
  }

  const winnerCode = winnerIndex >= 0 ? teams[winnerIndex].code : null;
  const streak = scoreboard ? scoreboard.streak : { team: null, count: 0 };
  const breaksStreak = winnerCode !== null && streak.count >= 3 && streak.team !== winnerCode;
  const nextCount = winnerCode !== null && streak.team === winnerCode ? streak.count + 1 : 1;
  crownResult = { winner: winnerIndex, mvp, territory, breaksStreak, crown: nextCount === 3 };

  const result = {
    roundId: `${bootId}-${round}`,
    round,
    winner: winnerCode,
    territory,
    mvp,
    simulated: simulatedThisRound || Boolean(localSim && localSim.running),
  };
  pendingResults.push(result);
  net?.send('ROUND_RESULT', result);
  applyResultLocally(winnerCode, mvp);

  if (winnerIndex >= 0) {
    sfx('victory', winnerIndex);
    crownMvpAt = mvp ? now + 2.2 : 0;
    if (crownResult.breaksStreak) {
      sfx('streakBreak');
      showBanner(`PEMUTUS STREAK: ${teams[winnerIndex].name}!`, teams[winnerIndex].color, 5, 4, now);
    } else if (crownResult.crown) {
      sfx('crown');
      showBanner(`${teams[winnerIndex].name} 3 kali beruntun: MAHKOTA!`, '#ffd25a', 5, 4, now);
    }
    nextFireworkAt = now;
  } else {
    crownMvpAt = 0;
  }
}

// Win langsung tampil walau backend sedang putus; SCOREBOARD berikutnya menjadi sumber kebenaran.
function applyResultLocally(winnerCode, mvp) {
  if (!scoreboard || winnerCode === null) return;
  scoreboard.session[winnerCode] = (scoreboard.session[winnerCode] || 0) + 1;
  if (scoreboard.streak.team === winnerCode) scoreboard.streak.count += 1;
  else scoreboard.streak = { team: winnerCode, count: 1 };
  if (mvp && !simulatedThisRound) {
    scoreboard.hallOfFame = [{ ...mvp, team: winnerCode, round }, ...scoreboard.hallOfFame].slice(0, 5);
  }
}

function updatePhase(now) {
  const left = (phaseEnd - performance.now()) / 1000 * PHASE_SPEED;
  phaseLeft = Math.max(0, left);
  const whole = Math.ceil(phaseLeft);
  if (whole !== lastWholeSecond) {
    lastWholeSecond = whole;
    if (phase === 'PREP' && whole >= 1 && whole <= 5) sfx('tick');
    if ((phase === 'OVERTIME' || phase === 'SUDDEN') && whole >= 1 && whole <= 10) {
      sfx('tickHot', -1, 0, (10 - whole) / 9);
    }
  }
  if (left > 0) return;

  if (phase === 'PREP') {
    enterBattle(now);
  } else if (phase === 'BATTLE') {
    setPhase('OVERTIME', cfg.phases.overtime);
    sfx('overtime');
    Audio.setMusicIntensity(2);
    showBanner('OVERTIME: efek gift x2!', '#ff5a4d', 2.4, 3, now);
  } else if (phase === 'OVERTIME') {
    if (!suddenUsed && (debugForceSudden || topTwoGap() < cfg.suddenDeath.threshold)) {
      suddenUsed = true;
      setPhase('SUDDEN', cfg.phases.suddenDeath);
      sfx('suddenDeath');
      Audio.setMusicIntensity(3);
      showBanner('SUDDEN DEATH!', '#ff5a4d', 2.4, 3, now);
    } else {
      enterCrown(now);
    }
  } else if (phase === 'SUDDEN') {
    enterCrown(now);
  } else {
    enterPrep();
  }
}

// ======================================================================
// Pesan masuk
// ======================================================================
function enqueue(message) {
  const backlog = queue.length - queueHead;
  const important = message.type === 'GIFT_TRIGGER' || message.type === 'CAPTAIN';
  if (backlog >= cfg.limits.queueMax && !important) return;
  queue.push(message);
}

function onMessage(message) {
  switch (message.type) {
    case 'STATUS':
      status = message.data;
      if (status.simActive) simulatedThisRound = true;
      break;
    case 'SCOREBOARD':
      scoreboard = message.data;
      reconcilePending();
      overlayKind = '';
      break;
    case 'HOST_INFO':
      viewClients = message.data.viewClients;
      if (role === 'host' && message.data.active === false) becomeViewer();
      break;
    case 'STATE_SNAPSHOT':
      if (role === 'view') applySnapshot(message.data);
      break;
    case 'JOIN':
      viewerCount = message.data.viewerCount;
      break;
    case 'CHAT_ACTION':
    case 'GIFT_TRIGGER':
    case 'LIKE_BATCH':
    case 'CAPTAIN':
      if (role === 'host') enqueue(message);
      break;
    default:
      break;
  }
}

function reconcilePending() {
  const known = scoreboard.recentRoundIds || [];
  for (let i = pendingResults.length - 1; i >= 0; i -= 1) {
    if (known.includes(pendingResults[i].roundId)) pendingResults.splice(i, 1);
  }
}

function drainQueue(now) {
  let processed = 0;
  const limit = cfg.limits.eventsPerFrame;
  while (queueHead < queue.length && processed < limit) {
    const message = queue[queueHead];
    queue[queueHead] = undefined;
    queueHead += 1;
    processed += 1;
    switch (message.type) {
      case 'CHAT_ACTION': handleChat(message, now); break;
      case 'GIFT_TRIGGER': handleGift(message, now); break;
      case 'LIKE_BATCH': handleLikes(message); break;
      case 'CAPTAIN': handleCaptain(message, now); break;
      default: break;
    }
  }
  if (queueHead > 512 && queueHead * 2 > queue.length) {
    queue.splice(0, queueHead);
    queueHead = 0;
  }
}

function becomeViewer() {
  role = 'view';
  localSim?.stop();
  Audio.setMusicIntensity(-1);
  Audio.stop('suddenDeath');
  queue.length = 0;
  queueHead = 0;
  document.getElementById('takeover').hidden = false;
}

// ======================================================================
// Snapshot host -> view
// ======================================================================
function buildSnapshot() {
  let raw = '';
  for (let i = 0; i < cellCount; i += 1) raw += String.fromCharCode(grid[i]);
  const flat = [];
  for (let i = 0; i < maxSoldiers; i += 1) {
    const soldier = soldiers[i];
    if (soldier.active) flat.push(Math.round(soldier.x), Math.round(soldier.y), soldier.team, Math.round(soldier.radius));
  }
  return {
    phase,
    left: Math.round(phaseLeft * 10) / 10,
    round,
    grid: btoa(raw),
    soldiers: flat,
    underdog: Array.from(underdog, (value) => Math.round(value * 100) / 100),
    spirit: Array.from(spirit, (value) => Math.round(value)),
    banner: bannerText,
    bannerColor,
    crown: crownResult,
  };
}

function sendSnapshot() {
  if (role === 'host' && viewClients > 0 && net?.isOpen && round > 0) net.send('STATE_SNAPSHOT', buildSnapshot());
}

function applySnapshot(data) {
  const raw = atob(data.grid);
  counts.fill(0);
  for (let i = 0; i < cellCount && i < raw.length; i += 1) {
    const value = raw.charCodeAt(i);
    grid[i] = value;
    pixels[i] = palette[value];
    counts[value] += 1;
  }
  gridDirty = true;
  if (data.round !== round) {
    round = data.round;
    layoutBases();
  }
  if (data.phase !== phase) overlayKind = '';
  phase = data.phase;
  phaseLeft = data.left;
  phaseEnd = performance.now() + (data.left * 1000) / PHASE_SPEED;
  crownResult = data.crown;
  data.underdog.forEach((value, index) => { underdog[index] = value; });
  data.spirit.forEach((value, index) => { spirit[index] = value; });
  if (data.banner !== bannerText || data.bannerColor !== bannerColor) {
    bannerText = data.banner;
    bannerColor = data.bannerColor;
    bannerUntil = data.banner ? nowSeconds() + 2 : 0;
    bannerDirty = true;
  }
  if (viewSoldiers.length < data.soldiers.length) viewSoldiers = new Float32Array(data.soldiers.length);
  viewSoldiers.set(data.soldiers);
  viewSoldierCount = data.soldiers.length / 4;
}

// ======================================================================
// Render
// ======================================================================
function formatTime(seconds) {
  const whole = Math.ceil(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

function roundedRect(c, x, y, width, height, radius) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, width, height, radius);
  else c.rect(x, y, width, height); // browser HP lama
}

function renderHud(now) {
  const c = hudCtx;
  const scale = hudH / 192;
  const rowTimer = 44 * scale;
  const rowWin = 33 * scale;
  const rowPercent = 50 * scale;
  c.clearRect(0, 0, W, hudH);
  c.textBaseline = 'middle';

  // Timer, fase, status koneksi
  const hot = phase === 'OVERTIME' || phase === 'SUDDEN';
  c.textAlign = 'left';
  c.fillStyle = hot ? '#ff5a4d' : '#ffffff';
  c.font = `800 44px ${FONT}`;
  const timerText = formatTime(phaseLeft);
  c.fillText(timerText, 20, rowTimer / 2);
  const timerWidth = c.measureText(timerText).width;
  c.font = `700 26px ${FONT}`;
  c.fillText(PHASE_LABEL[phase] || '', 36 + timerWidth, rowTimer / 2);

  c.textAlign = 'right';
  c.fillStyle = '#c4c9de';
  c.font = `600 22px ${FONT}`;
  c.fillText(`Ronde ${round} • ${viewerCount} penonton`, W - 52, rowTimer / 2);
  c.beginPath();
  c.arc(W - 28, rowTimer / 2, 11, 0, TAU);
  c.fillStyle = status.connected ? '#34c759' : '#ff3b30';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = '#ffffff';
  c.stroke();

  // Papan Win 2 baris (4 + 3)
  const session = scoreboard ? scoreboard.session : null;
  const streak = scoreboard ? scoreboard.streak : null;
  const badgeAt = cfg.underdog.badgeAt;
  teams.forEach((team, index) => {
    const isTop = index < 4;
    const slots = isTop ? 4 : 3;
    const cellWidth = W / slots;
    const x = (isTop ? index : index - 4) * cellWidth + 8;
    const y = rowTimer + (isTop ? 0 : rowWin);
    const chipH = rowWin - 5;
    c.fillStyle = team.color;
    roundedRect(c, x, y + 2, 50, chipH, 7);
    c.fill();
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    c.lineWidth = 4;
    c.textAlign = 'center';
    c.font = `800 22px ${FONT}`;
    c.strokeText(team.label, x + 25, y + rowWin / 2);
    c.fillText(team.label, x + 25, y + rowWin / 2);
    c.textAlign = 'left';
    c.font = `700 22px ${FONT}`;
    const name = shortName(team);
    c.fillText(name, x + 56, y + rowWin / 2);
    const winsX = x + 64 + c.measureText(name).width;
    c.fillStyle = '#ffd25a';
    c.font = `800 28px ${FONT}`;
    const wins = session ? String(session[team.code] || 0) : '0';
    c.fillText(wins, winsX, y + rowWin / 2);
    let cursor = winsX + 4 + c.measureText(wins).width;
    if (streak && streak.team === team.code && streak.count >= 3) {
      c.drawImage(crownSprite, cursor, y + 5, 28, 20);
      cursor += 32;
    }
    if (underdog[index] >= badgeAt) {
      c.fillStyle = '#ffd25a';
      c.font = `700 20px ${FONT}`;
      const badge = `Underdog x${underdog[index].toFixed(1)}`;
      const fits = c.measureText(badge).width + 20 <= cellWidth - (cursor - x);
      c.fillText(fits ? badge : `x${underdog[index].toFixed(1)}`, cursor, y + rowWin / 2);
    }
  });

  // Persentase wilayah
  const percentY = rowTimer + rowWin * 2;
  const slot = W / TEAM_COUNT;
  teams.forEach((team, index) => {
    const x = index * slot;
    const percent = Math.round(territoryShare(index) * 100);
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    c.font = `800 18px ${FONT}`;
    c.fillText(team.label, x + 4, percentY + rowPercent / 2);
    c.fillStyle = team.color;
    c.font = `800 40px ${FONT}`;
    c.fillText(`${percent}%`, x + 30, percentY + rowPercent / 2);
  });

  // Bar wilayah 7 warna + Bar Semangat tipis di bawahnya
  const barY = percentY + rowPercent;
  const barH = 16 * scale;
  const painted = paintedCells();
  c.fillStyle = '#20243a';
  c.fillRect(0, barY, W, barH);
  if (painted > 0) {
    let x = 0;
    for (let team = 0; team < TEAM_COUNT; team += 1) {
      const width = (counts[team + 1] / painted) * W;
      c.fillStyle = teams[team].color;
      c.fillRect(x, barY, width + 0.5, barH);
      x += width;
    }
  }
  const spiritY = barY + barH + 2;
  const spiritH = Math.max(4, hudH - spiritY - 1);
  const threshold = cfg.gameplay.spiritLikes;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    c.fillStyle = '#20243a';
    c.fillRect(team * slot + 3, spiritY, slot - 6, spiritH);
    c.fillStyle = teams[team].color;
    c.fillRect(team * slot + 3, spiritY, (slot - 6) * Math.min(1, spirit[team] / threshold), spiritH);
  }
  nextHudAt = now + 0.25;
}

function renderKlasemen() {
  const c = overlayCtx;
  c.clearRect(0, 0, W, arenaH);
  c.fillStyle = 'rgba(6,8,18,0.72)';
  c.fillRect(0, 0, W, arenaH);
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillStyle = '#ffd25a';
  c.font = `800 46px ${FONT}`;
  c.fillText('KLASEMEN ABADI', W / 2, 178);

  const allTime = scoreboard ? scoreboard.allTime : {};
  const ordered = teams
    .map((team, index) => ({ team, index, wins: allTime[team.code] || 0 }))
    .sort((a, b) => b.wins - a.wins || a.team.no - b.team.no);
  ordered.forEach((row, position) => {
    const y = 226 + position * 44;
    c.textAlign = 'left';
    c.fillStyle = row.team.color;
    roundedRect(c, 210, y - 19, 58, 38, 8);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = `800 24px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(row.team.label, 239, y);
    c.textAlign = 'left';
    c.font = `700 30px ${FONT}`;
    c.fillText(row.team.name, 282, y);
    c.textAlign = 'right';
    c.font = `800 34px ${FONT}`;
    c.fillText(String(row.wins), W - 228, y);
  });

  const hall = scoreboard ? scoreboard.hallOfFame : [];
  c.textAlign = 'center';
  c.fillStyle = '#ffd25a';
  c.font = `800 28px ${FONT}`;
  c.fillText('HALL OF FAME', W / 2, 532);
  c.fillStyle = '#ffffff';
  c.font = `600 26px ${FONT}`;
  if (hall.length === 0) {
    c.fillText('Belum ada MVP. Jadilah yang pertama!', W / 2, 572);
  } else {
    // Dua kolom di tengah supaya nama panjang tidak menabrak markas di sudut.
    const slotW = 350;
    hall.slice(0, 5).forEach((entry, index) => {
      const text = `${entry.nick} (${entry.coins})`;
      const x = hall.length === 1 ? W / 2 : W / 2 + (index % 2 === 0 ? -slotW / 2 : slotW / 2);
      fitFont(c, text, slotW - 10, 26, 600);
      c.fillText(text, x, 572 + Math.floor(index / 2) * 36);
    });
  }
}

function renderHowTo() {
  const c = overlayCtx;
  const { rallySoldiers, spiritSoldiers } = cfg.gameplay;
  const { MICRO, MID, SULTAN, MEGA } = cfg.gift.tiers;
  const left = 196;
  const right = W - 196;
  c.clearRect(0, 0, W, arenaH);
  c.fillStyle = 'rgba(6,8,18,0.94)';
  roundedRect(c, left, 154, right - left, arenaH - 166, 18);
  c.fill();
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillStyle = '#ffd25a';
  c.font = `800 46px ${FONT}`;
  c.fillText('CARA MAIN', W / 2, 192);
  c.fillStyle = '#ffffff';
  fitFont(c, 'Warna terluas saat waktu habis, dia menang!', right - left - 32, 28, 700);
  c.fillText('Warna terluas saat waktu habis, dia menang!', W / 2, 238);

  const rows = [
    ['Ketik 1-7', 'Gabung kubu, angkanya di markas'],
    ['Komentar', 'Prajuritmu melesat'],
    ['Ketik GAS', `Tambah ${rallySoldiers} prajurit`],
    ['Tap layar', `Bar Semangat penuh = ${spiritSoldiers} prajurit`],
    ['Follow/share', 'Prajuritmu jadi Kapten'],
  ];
  rows.forEach(([key, effect], index) => {
    const y = 292 + index * 52;
    c.textAlign = 'left';
    c.fillStyle = '#ffd25a';
    c.font = `800 28px ${FONT}`;
    c.fillText(key, left + 18, y);
    c.fillStyle = '#ffffff';
    fitFont(c, effect, right - left - 232, 27, 600);
    c.fillText(effect, left + 214, y);
  });

  c.textAlign = 'center';
  c.fillStyle = '#ffd25a';
  c.font = `800 28px ${FONT}`;
  c.fillText('Kirim gift', W / 2, 562);
  c.fillStyle = '#ffffff';
  const gifts = `${MICRO}+ koin: Tambah prajurit • ${MID}+ koin: Elite`;
  const bigGifts = `${SULTAN}+ koin: Meteor • ${MEGA}+ koin: Takeover`;
  fitFont(c, bigGifts, right - left - 32, 27, 600);
  c.fillText(gifts, W / 2, 604);
  c.fillText(bigGifts, W / 2, 644);
  c.fillStyle = '#c4c9de';
  fitFont(c, 'Prajurit kalah? Komentar lagi untuk bangkit', right - left - 32, 25, 600);
  c.fillText('Prajurit kalah? Komentar lagi untuk bangkit', W / 2, 700);
}

// Cara Main tampil lebih dulu. Selama belum ada riwayat, Klasemen masih kosong jadi tidak perlu ditampilkan.
function prepPage() {
  const allTime = scoreboard ? Object.values(scoreboard.allTime || {}) : [];
  const hall = scoreboard ? scoreboard.hallOfFame || [] : [];
  const hasHistory = allTime.some(Boolean) || hall.length > 0;
  const elapsed = cfg.phases.prep - phaseLeft;
  return !hasHistory || elapsed < cfg.help.prepHowToSeconds ? 'howto' : 'klasemen';
}

function renderCrownOverlay() {
  const c = overlayCtx;
  c.clearRect(0, 0, W, arenaH);
  c.fillStyle = 'rgba(6,8,18,0.72)';
  c.fillRect(0, 0, W, arenaH);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (!crownResult || crownResult.winner < 0) {
    c.fillStyle = '#ffffff';
    c.font = `800 56px ${FONT}`;
    c.fillText('Belum ada pemenang', W / 2, arenaH / 2 - 30);
    c.font = `600 32px ${FONT}`;
    c.fillText('Ketik 1-7 di ronde berikutnya', W / 2, arenaH / 2 + 34);
    return;
  }
  const team = teams[crownResult.winner];
  c.drawImage(crownSprite, W / 2 - 84, 60, 168, 120);
  c.fillStyle = team.color;
  c.font = `800 44px ${FONT}`;
  c.fillText(team.label, W / 2, 210);
  let size = 76;
  c.font = `800 ${size}px ${FONT}`;
  while (c.measureText(team.name).width > W - 80 && size > 40) {
    size -= 4;
    c.font = `800 ${size}px ${FONT}`;
  }
  c.lineWidth = 8;
  c.strokeStyle = 'rgba(0,0,0,0.8)';
  c.strokeText(team.name, W / 2, 280);
  c.fillText(team.name, W / 2, 280);
  c.fillStyle = '#ffffff';
  c.font = `800 44px ${FONT}`;
  c.fillText(`MENANG +1 WIN • ${crownResult.territory[team.code]}%`, W / 2, 360);

  if (crownResult.mvp) {
    c.fillStyle = '#ffd25a';
    c.font = `800 40px ${FONT}`;
    c.fillText(`MVP: ${crownResult.mvp.nick}`, W / 2, 440);
    c.fillStyle = '#ffffff';
    c.font = `600 30px ${FONT}`;
    c.fillText(`${crownResult.mvp.coins} koin`, W / 2, 490);
  }
  const hall = scoreboard ? scoreboard.hallOfFame : [];
  if (hall.length > 0) {
    c.fillStyle = '#ffd25a';
    c.font = `800 28px ${FONT}`;
    c.fillText('HALL OF FAME', W / 2, 560);
    c.fillStyle = '#ffffff';
    c.font = `600 24px ${FONT}`;
    hall.slice(0, 5).forEach((entry, index) => {
      const slotW = W / Math.min(3, hall.length);
      c.fillText(`${entry.nick} (${entry.coins})`, slotW * ((index % 3) + 0.5), 604 + Math.floor(index / 3) * 36);
    });
  }
}

function ensureOverlay() {
  if (phase === 'PREP') {
    const page = prepPage();
    if (overlayKind !== page) {
      if (page === 'howto') renderHowTo();
      else renderKlasemen();
      overlayKind = page;
    }
  } else if (phase === 'CROWN' && overlayKind !== 'crown') {
    renderCrownOverlay();
    overlayKind = 'crown';
  }
}

function addPrasastiLocal(nick) {
  if (scoreboard && !scoreboard.prasasti.includes(nick)) scoreboard.prasasti.push(nick);
}

function ensurePrasasti() {
  const names = scoreboard ? scoreboard.prasasti : null;
  if (!names || names.length === 0) {
    prasastiCanvas = null;
    prasastiKey = '';
    return;
  }
  const key = names.join('|');
  if (key === prasastiKey) return;
  prasastiKey = key;
  const text = `PRASASTI SULTAN • ${names.join(' • ')} •`;
  const measure = bannerCtx;
  measure.font = `800 42px ${FONT}`;
  const width = Math.min(4000, Math.ceil(measure.measureText(text).width) + 80);
  prasastiCanvas = makeCanvas(width, 64);
  const c = prasastiCanvas.getContext('2d');
  c.font = `800 42px ${FONT}`;
  c.textBaseline = 'middle';
  c.fillStyle = '#ffd25a';
  c.fillText(text, 0, 32);
}

function drawLiveSoldiers(now) {
  const lod = activeSoldiers > cfg.gameplay.labelLodThreshold;
  for (let i = 0; i < maxSoldiers; i += 1) {
    const s = soldiers[i];
    if (!s.active) continue;
    const r = s.radius;
    if (s.eliteUntil > now) {
      const size = r * 4.4;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowSprites[s.team], s.x - size / 2, s.y - size / 2, size, size);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (rageUntil[s.team] > now) {
      const size = r * 3;
      ctx.drawImage(rageSprite, s.x - size / 2, s.y - size / 2, size, size);
    }
    ctx.drawImage(soldierSprites[s.team], s.x - r, s.y - r, r * 2, r * 2);
    if (s.captain) ctx.drawImage(starSprite, s.x - 13, s.y - r - 22, 26, 26);
  }
  const isPrep = phase === 'PREP';
  if (isPrep) labelBudget.fill(PREP_LABELS_PER_TEAM);
  for (let i = 0; i < maxSoldiers; i += 1) {
    const s = soldiers[i];
    if (!s.active || !s.labelReady) continue;
    if (lod && !s.captain && s.eliteUntil <= now && now - s.lastActionAt > 4) continue;
    if (isPrep) {
      // Saat Persiapan semua prajurit berkumpul di markas: tampilkan nama yang baru bergabung saja.
      if (now - s.lastActionAt > 3 || labelBudget[s.team] === 0) continue;
      labelBudget[s.team] -= 1;
    }
    const y = clamp(s.y - s.radius - 50, arenaTop, arenaTop + arenaH - 48);
    ctx.drawImage(s.label, s.x - 120, y, 240, 48);
  }
}

function drawViewSoldiers() {
  for (let i = 0; i < viewSoldierCount; i += 1) {
    const offset = i * 4;
    const r = viewSoldiers[offset + 3];
    ctx.drawImage(soldierSprites[viewSoldiers[offset + 2]], viewSoldiers[offset] - r, viewSoldiers[offset + 1] - r, r * 2, r * 2);
  }
}

function drawParticles() {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < maxParticles; i += 1) {
    const life = pLife[i];
    if (life <= 0) continue;
    const size = pSize[i];
    ctx.globalAlpha = life / pMax[i];
    ctx.drawImage(glowSprites[pColor[i]], pX[i] - size / 2, pY[i] - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawEffects(now) {
  for (let i = 0; i < METEOR_MAX; i += 1) {
    const meteor = meteors[i];
    if (!meteor.active) continue;
    const t = clamp((now - meteor.start) / (meteor.end - meteor.start), 0, 1);
    const eased = t * t;
    const x = meteor.startX + (meteor.x - meteor.startX) * eased;
    const y = meteor.startY + (meteor.y - meteor.startY) * eased;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprites[COLOR_GOLD], x - 80, y - 80, 160, 160);
    ctx.drawImage(glowSprites[meteor.team], x - 50, y - 50, 100, 100);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5 + t * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(meteor.x, meteor.y, 70 * (1.4 - t), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < WAVE_MAX; i += 1) {
    const wave = waves[i];
    if (!wave.active) continue;
    ctx.strokeStyle = teams[wave.team].color;
    ctx.lineWidth = 16;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(wave.cx * cellW, arenaTop + wave.cy * cellH, wave.radius * cellW, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function render(now) {
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bgCanvas, 0, 0, W, H);

  // Dekorasi bawah: Prasasti Sultan berjalan pelan
  ensurePrasasti();
  if (prasastiCanvas) {
    const speedWidth = prasastiCanvas.width + W;
    prasastiOffset = (prasastiOffset + 0.7) % speedWidth;
    ctx.globalAlpha = 0.28;
    ctx.drawImage(prasastiCanvas, W - prasastiOffset, decoTop + 40, prasastiCanvas.width, 64);
    ctx.globalAlpha = 1;
  }

  if (now >= nextHudAt) renderHud(now);
  ctx.drawImage(hudCanvas, 0, hudTop, W, hudH);

  // Arena
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, arenaTop, W, arenaH);
  ctx.clip();
  if (now < shakeUntil) {
    const strength = shakeMag * ((shakeUntil - now) / 0.6);
    ctx.translate(Math.sin(now * 90) * strength, Math.cos(now * 71) * strength);
  }
  if (gridDirty) {
    gridCtx.putImageData(gridImage, 0, 0);
    gridDirty = false;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(gridCanvas, 0, arenaTop, W, arenaH);
  ctx.imageSmoothingEnabled = true;

  ensureOverlay();
  if (phase === 'PREP' && overlayKind === 'klasemen') ctx.drawImage(overlayCanvas, 0, arenaTop, W, arenaH);

  if (role === 'host') drawLiveSoldiers(now);
  else drawViewSoldiers();

  // Kartu Cara Main di atas prajurit supaya tetap terbaca saat banyak yang bergabung.
  if (phase === 'PREP' && overlayKind === 'howto') ctx.drawImage(overlayCanvas, 0, arenaTop, W, arenaH);

  // Markas digambar di atas prajurit supaya label dan namanya selalu terbaca.
  const streak = scoreboard ? scoreboard.streak : null;
  for (let team = 0; team < TEAM_COUNT; team += 1) {
    ctx.drawImage(baseSprites[team], baseX[team] - 50, baseY[team] - 50, 100, 100);
    const tag = baseTagSprites[team];
    const tagW = tag.width / 2;
    const tagBelow = baseY[team] + 52 + BASE_TAG_H <= arenaTop + arenaH;
    const tagY = tagBelow ? baseY[team] + 52 : baseY[team] - 52 - BASE_TAG_H;
    ctx.drawImage(tag, clamp(baseX[team] - tagW / 2, 6, W - 6 - tagW), tagY, tagW, BASE_TAG_H);
    if (streak && streak.count >= 3 && teams[team].code === streak.team) {
      const crownY = tagBelow ? baseY[team] - 92 : tagY - 50;
      ctx.drawImage(crownSprite, baseX[team] - 34, Math.max(arenaTop, crownY), 68, 48);
    }
  }
  drawParticles();
  drawEffects(now);
  if (phase === 'CROWN') ctx.drawImage(overlayCanvas, 0, arenaTop, W, arenaH);
  if (now < flashUntil) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(0, arenaTop, W, arenaH);
  }
  ctx.restore();

  renderBanner(now);
  ctx.drawImage(bannerCanvas, 0, bannerTop, W, bannerH);

  // Tepi layar berdenyut merah saat Overtime dan Sudden Death
  if (phase === 'OVERTIME' || phase === 'SUDDEN') {
    const beat = phase === 'SUDDEN' ? 7.5 : 5;
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(now * beat);
    ctx.drawImage(edgeSprite, 0, arenaTop, W, 56);
    ctx.save();
    ctx.translate(0, arenaTop + arenaH);
    ctx.scale(1, -1);
    ctx.drawImage(edgeSprite, 0, 0, W, 56);
    ctx.restore();
    ctx.save();
    ctx.translate(0, arenaTop + arenaH);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(edgeSprite, 0, 0, arenaH, 56);
    ctx.restore();
    ctx.save();
    ctx.translate(W, arenaTop);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(edgeSprite, 0, 0, arenaH, 56);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ======================================================================
// Loop utama
// ======================================================================
function updateHost(dt, now) {
  drainQueue(now);
  updatePhase(now);
  updateUnderdog(dt, now);
  checkRage(now);
  checkSpirit(now);
  updateSoldiers(dt, now);
  updateMeteors(now);
  updateWaves(dt, now);
  updateParticles(dt);

  if (phase === 'CROWN') {
    if (crownMvpAt > 0 && now >= crownMvpAt) {
      crownMvpAt = 0;
      sfx('mvp');
    }
    if (crownResult && crownResult.winner >= 0 && now >= nextFireworkAt) {
      nextFireworkAt = now + 0.45;
      spawnParticles(random(120, W - 120), arenaTop + random(80, arenaH - 80), crownResult.winner, 26, 480, 0.8);
    }
  }
  if (meteorsAreFlying()) spawnMeteorTrails();
}

function meteorsAreFlying() {
  for (let i = 0; i < METEOR_MAX; i += 1) if (meteors[i].active) return true;
  return false;
}

function spawnMeteorTrails() {
  const now = nowSeconds();
  for (let i = 0; i < METEOR_MAX; i += 1) {
    const meteor = meteors[i];
    if (!meteor.active) continue;
    const t = clamp((now - meteor.start) / (meteor.end - meteor.start), 0, 1);
    const eased = t * t;
    spawnParticles(
      meteor.startX + (meteor.x - meteor.startX) * eased,
      meteor.startY + (meteor.y - meteor.startY) * eased,
      COLOR_GOLD, 2, 90, 0.35,
    );
  }
}

function frame(timestamp) {
  requestAnimationFrame(frame);
  const elapsedMs = timestamp - lastFrameMs;
  lastFrameMs = timestamp;
  const dt = Math.min(0.05, Math.max(0, elapsedMs / 1000));
  const now = timestamp / 1000;
  const costStart = DEBUG ? performance.now() : 0;

  if (role === 'host') {
    updateHost(dt, now);
  } else {
    phaseLeft = Math.max(0, (phaseEnd - performance.now()) / 1000 * PHASE_SPEED);
  }
  render(now);
  if (DEBUG) {
    const cost = performance.now() - costStart;
    frameCostSum += cost;
    frameCostCount += 1;
    if (cost > frameCostMax) frameCostMax = cost;
  }

  fpsFrames += 1;
  if (elapsedMs > worstFrameMs && fpsFrames > 2) worstFrameMs = elapsedMs;
  if (timestamp - fpsWindowStart >= 1000) {
    fps = (fpsFrames * 1000) / (timestamp - fpsWindowStart);
    fpsFrames = 0;
    fpsWindowStart = timestamp;
    frameCostMs = frameCostCount > 0 ? frameCostSum / frameCostCount : 0;
    frameCostSum = 0;
    frameCostCount = 0;
  }
  if (DEBUG && now >= nextDebugAt) updateDebug(now);
}

function updateDebug(now) {
  nextDebugAt = now + 0.25;
  const audio = Audio.stats();
  const element = document.getElementById('debug');
  element.textContent =
    `FPS ${fps.toFixed(1)} (terburuk ${worstFrameMs.toFixed(0)} ms)  JS ${frameCostMs.toFixed(1)} ms\n` +
    `prajurit ${role === 'host' ? activeSoldiers : viewSoldierCount}/${maxSoldiers}\n` +
    `partikel ${pAlive}/${maxParticles}\n` +
    `antrean ${queue.length - queueHead}\n` +
    `suara ${audio.voices} (dibuang ${audio.dropped})  musik ${audio.musicLevel}\n` +
    `peran ${role}  fase ${phase}  ronde ${round}`;
  window.__pw = {
    fps, worstFrameMs, frameCostMs, frameCostMax, activeSoldiers, pAlive, phase, round, role, status, scoreboard, counts: Array.from(counts),
    underdog: Array.from(underdog), activeMembers: Array.from(activeMembers),
    rage: teams.map((_, team) => rageUntil[team] > now),
    revenge: teams.map((_, team) => revengeUntil[team] > now),
    queue: queue.length - queueHead,
    painted: paintedCells(),
    share: teams.map((_, team) => territoryShare(team)),
    audio,
    resetWorst() { worstFrameMs = 0; frameCostMax = 0; },
    forceSudden() { debugForceSudden = true; },
    liveCounts() { return Array.from(counts); },
    lastMeteorTarget() { return lastMeteorTarget; },
    lastMeteorFrac() { return lastMeteorFrac; },
    bases: Array.from(baseX).map((x, i) => [x, baseY[i]]),
    inject(message) { onMessage(message); },
    pendingResults: pendingResults.length,
    cellCount,
    giftsWaiting: deferredGifts.length,
    overlayKind,
    tipText,
    bannerText,
    phaseLeft,
  };
}

// ======================================================================
// Kontrol operator
// ======================================================================
let toastTimer = 0;
function toast(text) {
  const element = document.getElementById('toast');
  element.textContent = text;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 2600);
}

function emergencySimToggle() {
  if (role !== 'host') return;
  if (net?.isOpen) {
    const on = !status.simActive;
    net.send('SIM_TOGGLE', { on });
    toast(on ? 'Bot simulasi backend: NYALA' : 'Bot simulasi backend: MATI');
    return;
  }
  if (!localSim) localSim = new LocalSim(wilayah, (message) => onMessage(message));
  if (localSim.running) {
    localSim.stop();
    toast('Bot lokal: MATI');
  } else {
    localSim.start();
    simulatedThisRound = true;
    toast('Backend putus. Bot lokal: NYALA');
  }
}

function setupLongPress() {
  let timer = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
  };
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const y = ((event.clientY - rect.top) / rect.height) * H;
    if (y > hudTop) return;
    if (x < W * 0.25) timer = setTimeout(emergencySimToggle, 2000);
    else if (x > W * 0.75) timer = setTimeout(openAudioPanel, 2000);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(type, cancel);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

function openAudioPanel() {
  syncAudioPanel();
  document.getElementById('audioPanel').hidden = false;
}

function syncAudioPanel() {
  document.getElementById('volMaster').value = Audio.getVolume('master');
  document.getElementById('volSfx').value = Audio.getVolume('sfx');
  document.getElementById('volMusic').value = Audio.getVolume('music');
  document.getElementById('musicToggle').checked = Audio.musicEnabled;
  document.getElementById('talkBtn').setAttribute('aria-pressed', String(Audio.talkOn));
}

function setupAudioPanel() {
  const bind = (id, bus) => {
    document.getElementById(id).addEventListener('input', (event) => Audio.setVolume(bus, event.target.value));
  };
  bind('volMaster', 'master');
  bind('volSfx', 'sfx');
  bind('volMusic', 'music');
  document.getElementById('musicToggle').addEventListener('change', (event) => Audio.setMusicEnabled(event.target.checked));
  document.getElementById('panelClose').addEventListener('click', () => {
    document.getElementById('audioPanel').hidden = true;
  });
  document.getElementById('talkBtn').addEventListener('click', toggleTalk);
  document.getElementById('takeoverBtn').addEventListener('click', () => location.reload());
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.key === 'm' || event.key === 'M') toast(Audio.toggleMute() ? 'Suara dibisukan' : 'Suara menyala');
    if (event.key === 't' || event.key === 'T') toggleTalk();
  });
}

function toggleTalk() {
  const on = Audio.talkMode(!Audio.talkOn);
  document.getElementById('talkBtn').setAttribute('aria-pressed', String(on));
  toast(on ? 'Mode Bicara: NYALA' : 'Mode Bicara: MATI');
}

// Penahan layar: Wake Lock jika tersedia (butuh HTTPS), jika tidak video senyap berulang.
let wakeLock = null;
async function keepScreenOn() {
  const video = document.getElementById('keepAwake');
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      return;
    } catch (error) {
      console.info('Wake Lock tidak tersedia, memakai video senyap', error);
    }
  }
  try {
    await video.play();
  } catch (error) {
    console.warn('Video penahan layar gagal diputar', error);
  }
}

function setupKeepAwake() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (wakeLock === null || wakeLock.released)) keepScreenOn();
  });
}

function startFullscreen() {
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return;
  Promise.resolve(request.call(root, { navigationUI: 'hide' }))
    .then(() => screen.orientation?.lock?.('portrait'))
    .catch((error) => console.info('Fullscreen atau kunci orientasi tidak didukung', error));
}

function beginGame() {
  bootId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  net = new Net({
    getRole: () => role,
    onMessage,
    onOpen: () => {
      backendUp = true;
      for (const result of pendingResults) net.send('ROUND_RESULT', result);
    },
    onClose: () => {
      status = { ...status, connected: false, simActive: false, detail: 'Backend terputus' };
      // Suara mengikuti koneksi ke backend, bukan status sumber chat TikTok.
      if (role === 'host' && backendUp) sfx('disconnect');
      backendUp = false;
    },
  });
  net.connect();
  setInterval(flushSfx, 15);
  setInterval(sendSnapshot, 500);
  setInterval(() => {
    // Membersihkan COMBO dari streak yang sudah lama tidak aktif.
    if (combos.size > 200) combos.clear();
  }, 5000);

  if (role === 'host') enterPrep();
  else layoutBases();

  const start = performance.now();
  lastFrameMs = start;
  fpsWindowStart = start;
  requestAnimationFrame(frame);
}

function setupStartScreen() {
  const screenEl = document.getElementById('start');
  const soundBtn = document.getElementById('soundBtn');
  let soundOn = true;
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊 Suara menyala' : '🔇 Mulai tanpa suara';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Mulai dengan suara' : 'Mulai tanpa suara');
  });
  document.getElementById('startBtn').addEventListener('click', () => {
    Audio.init({ muted: !soundOn });
    startFullscreen();
    keepScreenOn();
    screenEl.hidden = true;
    beginGame();
  }, { once: true });
  screenEl.hidden = false;
}

async function boot() {
  const [configResponse, wilayahResponse] = await Promise.all([fetch('config.json'), fetch('wilayah.json')]);
  cfg = await configResponse.json();
  wilayah = await wilayahResponse.json();

  if (params.get('sfxtest') === '1') {
    const { runSfxTest } = await import('./sfxtest.js');
    runSfxTest(cfg, wilayah);
    return;
  }

  Audio.configure(cfg.audio);
  setupTeams();
  setupLayout();
  setupGrid();
  tips = buildTips();
  setupSprites();
  setupPools();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  setupAudioPanel();
  setupLongPress();
  setupKeepAwake();
  document.getElementById('debug').hidden = !DEBUG;
  layoutBases();

  if (role === 'view') beginGame();
  else setupStartScreen();
}

boot().catch((error) => {
  console.error(error);
  const element = document.getElementById('fatal');
  element.textContent = `Game gagal dimuat: ${error.message}. Pastikan backend berjalan, lalu muat ulang halaman.`;
  element.hidden = false;
});
