// SELURUH suara game: synth prosedural Web Audio, bus, musik, limiter. Tanpa berkas audio.

const STORE_KEY = 'perangWarnaAudio';
const PRIORITY = { PHASE: 3, HIGH: 2, MID: 1, LOW: 0 };

// Nama suara, prioritas, dan bus. Urutan sesuai tabel 9.3 prompt.
export const SOUND_NAMES = [
  'join', 'dash', 'rally', 'clash', 'coin', 'combo', 'elite', 'meteorFall', 'impact', 'takeover',
  'revenge', 'rage', 'wave', 'captain', 'tick', 'start', 'overtime', 'tickHot', 'suddenDeath',
  'victory', 'mvp', 'crown', 'streakBreak', 'disconnect',
];

const SOUND_PRIORITY = {
  join: PRIORITY.MID, dash: PRIORITY.LOW, rally: PRIORITY.MID, clash: PRIORITY.LOW, coin: PRIORITY.MID,
  combo: PRIORITY.MID, elite: PRIORITY.HIGH, meteorFall: PRIORITY.PHASE, impact: PRIORITY.PHASE,
  takeover: PRIORITY.PHASE, revenge: PRIORITY.HIGH, rage: PRIORITY.HIGH, wave: PRIORITY.MID,
  captain: PRIORITY.MID, tick: PRIORITY.PHASE, start: PRIORITY.PHASE, overtime: PRIORITY.PHASE,
  tickHot: PRIORITY.PHASE, suddenDeath: PRIORITY.PHASE, victory: PRIORITY.HIGH, mvp: PRIORITY.HIGH,
  crown: PRIORITY.HIGH, streakBreak: PRIORITY.HIGH, disconnect: PRIORITY.PHASE,
};

let ctx = null;
let settings = {
  volume: { master: 0.8, sfx: 0.7, music: 0.25, ui: 0.5 },
  musicOn: true,
  muted: false,
};
let audioCfg = {
  bpm: 112, bpmOvertime: 132, maxVoices: 24, cooldownMs: {}, duckDb: -8, duckSeconds: 1.5, talkModeDb: -12,
};

const buses = {};
let masterGain, talkGain, compressor, analyser, musicDuck;
let noiseBuffer = null;
let driveCurve = null;
let voices = [];
let lastPlayed = {};
let joinBoostDb = 0;
let talkOn = false;
let resumeTimer = 0;
let statDropped = 0;
let statPlayed = 0;
let statPeakVoices = 0;
let schedulerId = 0;

const dbToGain = (db) => Math.pow(10, db / 20);
const rand = (min, max) => min + Math.random() * (max - min);

// ----- identitas nada: lima nada bernuansa slendro (kira-kira 240 cent per langkah) -----
const BASE_FREQ = 261.63;
const SLENDRO_CENTS = [0, 240, 480, 720, 960];
function scaleFreq(step, baseFreq = BASE_FREQ) {
  const octave = Math.floor(step / 5);
  const degree = ((step % 5) + 5) % 5;
  return baseFreq * Math.pow(2, octave + SLENDRO_CENTS[degree] / 1200);
}
const teamStep = (team) => (Number.isInteger(team) && team >= 0 ? team : 0);
const teamFreq = (team) => scaleFreq(teamStep(team));

// ----- satu suara: kumpulan node yang dilepas bersama saat semua sumbernya selesai -----
class Voice {
  constructor(name, bus, gain) {
    this.name = name;
    this.prio = SOUND_PRIORITY[name] ?? PRIORITY.LOW;
    this.startedAt = ctx.currentTime;
    this.nodes = [];
    this.sources = [];
    this.pending = 0;
    this.killed = false;
    this.released = false;
    this.detune = rand(-30, 30);
    this.out = ctx.createGain();
    this.out.gain.value = gain * rand(0.9, 1.1);
    this.out.connect(buses[bus]);
    this.nodes.push(this.out);
  }

  node(audioNode) {
    this.nodes.push(audioNode);
    return audioNode;
  }

  track(source) {
    this.sources.push(source);
    this.pending += 1;
    source.onended = () => {
      source.disconnect();
      this.pending -= 1;
      if (this.pending <= 0) this.release();
    };
    return source;
  }

  release() {
    if (this.released) return;
    this.released = true;
    for (const n of this.nodes) n.disconnect();
    this.nodes.length = 0;
    this.sources.length = 0;
    const index = voices.indexOf(this);
    if (index >= 0) voices.splice(index, 1);
  }

  kill() {
    if (this.killed || this.released) return;
    this.killed = true;
    const now = ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, 0.008);
    for (const source of this.sources) {
      try { source.stop(now + 0.04); } catch { /* sumber sudah berhenti */ }
    }
  }

  env(attack, peak, decay, start, target) {
    const g = this.node(ctx.createGain());
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, start + attack + decay);
    g.connect(target ?? this.out);
    return g;
  }

  // Oscillator dengan envelope. opts: to (glide), glide, attack, target, detune.
  tone(type, freq, start, duration, peak, opts = {}) {
    const osc = this.track(ctx.createOscillator());
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, start + (opts.glide ?? duration));
    osc.detune.value = this.detune + (opts.detune ?? 0);
    const attack = opts.attack ?? 0.004;
    osc.connect(this.env(attack, peak, Math.max(0.005, duration - attack), start, opts.target));
    osc.start(start);
    osc.stop(start + duration + 0.02);
    return osc;
  }

  // Noise dari buffer bersama, lewat filter opsional. filter: {type, from, to, q}
  noise(start, duration, peak, filter, opts = {}) {
    const src = this.track(ctx.createBufferSource());
    src.buffer = noiseBuffer;
    src.loop = true;
    src.detune.value = this.detune;
    let head = src;
    if (filter) {
      const f = this.node(ctx.createBiquadFilter());
      f.type = filter.type;
      f.Q.value = filter.q ?? 1;
      f.frequency.setValueAtTime(filter.from, start);
      if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, start + duration);
      src.connect(f);
      head = f;
    }
    head.connect(this.env(opts.attack ?? 0.003, peak, Math.max(0.005, duration - (opts.attack ?? 0.003)), start, opts.target));
    src.start(start, Math.random() * 1.5);
    src.stop(start + duration + 0.02);
    return src;
  }

  lowpass(from, to, start, sweep, q = 1) {
    const f = this.node(ctx.createBiquadFilter());
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, start);
    if (to) f.frequency.exponentialRampToValueAtTime(to, start + sweep);
    f.connect(this.out);
    return f;
  }

  drive() {
    const shaper = this.node(ctx.createWaveShaper());
    shaper.curve = driveCurve;
    shaper.connect(this.out);
    return shaper;
  }
}

// ----- resep suara (tabel 9.3) -----
function impactInto(v, start) {
  const drive = v.drive();
  v.noise(start, 0.9, 0.9, { type: 'lowpass', from: 300, q: 0.7 }, { target: drive });
  v.tone('sine', 80, start, 0.7, 0.85, { to: 40, target: drive });
}

function gongInto(v, start, freq = 110) {
  const ratios = [1, 1.48, 2.1, 2.7, 3.4, 4.2]; // maksimal 6 oscillator
  ratios.forEach((ratio, index) => {
    v.tone('sine', freq * ratio, start, 3 - index * 0.25, 0.26 / (index * 0.6 + 1), { attack: 0.006 });
  });
}

function arp(v, type, freqs, start, stepSeconds, noteSeconds, peak) {
  freqs.forEach((f, index) => v.tone(type, f, start + index * stepSeconds, noteSeconds, peak));
}

function kentongan(v, start, peak) {
  v.noise(start, 0.03, peak, { type: 'bandpass', from: 1800, q: 6 });
}

const RECIPES = {
  join(v, t, o) {
    const f = teamFreq(o.team);
    v.tone('triangle', f, t, 0.13, 0.5, { to: f * 2, glide: 0.08 });
  },
  dash(v, t) {
    v.noise(t, 0.18, 0.28, { type: 'bandpass', from: 600, to: 2400, q: 1.4 });
  },
  rally(v, t, o) {
    const f = teamFreq(o.team);
    const lp = v.lowpass(400, 3800, t, 0.09);
    [f, f * 1.5, f * 2].forEach((freq) => v.tone('sawtooth', freq, t, 0.25, 0.16, { target: lp }));
  },
  clash(v, t) {
    v.tone('square', 1200, t, 0.025, 0.05);
  },
  coin(v, t, o) {
    const step = ((Math.max(1, o.streak ?? 1) - 1) % 12);
    const shift = Math.pow(2, step / 12);
    v.tone('sine', 988 * shift, t, 0.06, 0.28);
    v.tone('sine', 1319 * shift, t + 0.06, 0.06, 0.28);
  },
  combo(v, t, o) {
    const level = Math.max(1, Math.min(3, o.intensity ?? 1));
    const base = 523.25 * Math.pow(2, (level - 1) / 6);
    const notes = [1, 1.25, 1.5, 2];
    arp(v, 'square', notes.map((n) => base * n), t, 0.06 + level * 0.015, 0.1 + level * 0.05, 0.14);
    if (level >= 2) arp(v, 'square', notes.map((n) => base * n * 2), t + 0.3 + level * 0.06, 0.06, 0.12, 0.1);
    if (level >= 3) v.tone('triangle', base * 4, t + 0.75, 0.5, 0.2);
  },
  elite(v, t) {
    const lp = v.lowpass(300, 5000, t, 0.4);
    v.tone('sawtooth', 220, t, 0.42, 0.3, { to: 660, glide: 0.4, target: lp });
    v.noise(t + 0.34, 0.16, 0.14, { type: 'highpass', from: 2500 });
  },
  meteorFall(v, t) {
    v.tone('sine', 2000, t, 0.9, 0.24, { to: 300, glide: 0.9, attack: 0.05 });
  },
  impact(v, t) {
    impactInto(v, t);
  },
  takeover(v, t) {
    v.noise(t, 1.5, 0.3, { type: 'highpass', from: 300, to: 6000 }, { attack: 1.2 });
    v.tone('sawtooth', 110, t, 1.5, 0.14, { to: 880, glide: 1.5, attack: 1.2 });
    impactInto(v, t + 1.5);
    gongInto(v, t + 1.5);
  },
  revenge(v, t) {
    [0, 0.2].forEach((offset, index) => {
      const lp = v.lowpass(1400, 500, t + offset, 0.18);
      const root = index === 0 ? 110 : 98;
      [root, root * 1.2].forEach((f) => v.tone('sawtooth', f, t + offset, 0.18, 0.24, { target: lp }));
    });
  },
  rage(v, t) {
    const osc = v.tone('sine', 500, t, 0.8, 0.22, { attack: 0.02 });
    [0.2, 0.4, 0.6, 0.8].forEach((offset, index) => {
      osc.frequency.linearRampToValueAtTime(index % 2 === 0 ? 900 : 500, t + offset);
    });
  },
  wave(v, t, o) {
    const step = teamStep(o.team);
    const freqs = [0, 1, 2, 3, 5].map((n) => scaleFreq(step + n));
    arp(v, 'triangle', freqs, t, 0.08, 0.2, 0.3);
  },
  captain(v, t) {
    v.tone('sine', 1568, t, 0.6, 0.22);
    v.tone('sine', 1568 * 2.76, t, 0.35, 0.08);
  },
  tick(v, t) {
    kentongan(v, t, 0.75);
  },
  start(v, t) {
    [0, 0.13, 0.26].forEach((offset) => kentongan(v, t + offset, 0.8));
    const whistle = v.tone('sine', 2200, t + 0.42, 0.55, 0.22, { attack: 0.02 });
    const lfo = v.track(ctx.createOscillator());
    const depth = v.node(ctx.createGain());
    lfo.frequency.value = 22;
    depth.gain.value = 70;
    lfo.connect(depth);
    depth.connect(whistle.frequency);
    lfo.start(t + 0.42);
    lfo.stop(t + 1);
  },
  overtime(v, t) {
    v.tone('sawtooth', 300, t, 1.2, 0.17, { to: 1500, glide: 1.2, attack: 0.05 });
    v.tone('sine', 600, t, 1.2, 0.14, { to: 2200, glide: 1.2, attack: 0.05 });
  },
  tickHot(v, t, o) {
    const level = Math.max(0, Math.min(1, o.intensity ?? 0.5));
    kentongan(v, t, 0.45 + level * 0.55);
  },
  victory(v, t, o) {
    const step = teamStep(o.team);
    const melody = [0, 2, 4, 5, 4, 5, 7, 10];
    melody.forEach((n, index) => {
      const long = index === melody.length - 1;
      v.tone('triangle', scaleFreq(step + n), t + index * 0.16, long ? 0.8 : 0.22, 0.32);
      v.tone('sawtooth', scaleFreq(step + n) / 2, t + index * 0.16, long ? 0.8 : 0.2, 0.07);
    });
    gongInto(v, t + 1.3, 110);
  },
  mvp(v, t) {
    arp(v, 'sine', [1046.5, 1318.5, 1568], t, 0.11, 0.35, 0.26);
  },
  crown(v, t) {
    arp(v, 'triangle', [523.25, 659.25, 784, 1046.5, 1318.5, 1568, 2093], t, 0.09, 0.32, 0.22);
    v.noise(t + 0.45, 0.65, 0.09, { type: 'highpass', from: 6000 }, { attack: 0.15 });
  },
  streakBreak(v, t) {
    v.noise(t, 0.5, 0.42, { type: 'highpass', from: 4000 });
    for (let i = 0; i < 8; i += 1) v.tone('square', rand(2500, 7000), t + rand(0.01, 0.34), 0.018, 0.1);
  },
  disconnect(v, t) {
    v.tone('sine', 660, t, 0.18, 0.3);
    v.tone('sine', 440, t + 0.18, 0.28, 0.3);
  },
};

// ----- musik latar: lookahead scheduler -----
const LOOKAHEAD = 0.1;
const SCHEDULER_MS = 25;
const STEPS_PER_BAR = 16;
const LOOP_STEPS = STEPS_PER_BAR * 8;
const BAR_ROOTS = [0, 0, 3, 3, 2, 2, 4, 1];
const BASS_PATTERN = [0, -1, -1, 0, -1, -1, 2, -1, 0, -1, -1, 0, -1, 3, -1, 2];

const music = {
  level: -1,
  step: 0,
  nextTime: 0,
  stepsScheduled: 0,
  heart: false,
  heartNext: 0,
};

function musicNote(type, freq, start, duration, peak, toFreq) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, start + duration * 0.8);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(peak, start + Math.min(0.01, duration / 4));
  env.gain.exponentialRampToValueAtTime(0.0008, start + duration);
  osc.connect(env);
  env.connect(buses.music);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function musicNoise(start, duration, peak, filterType, freq) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  src.buffer = noiseBuffer;
  src.loop = true;
  filter.type = filterType;
  filter.frequency.value = freq;
  env.gain.setValueAtTime(peak, start);
  env.gain.exponentialRampToValueAtTime(0.0008, start + duration);
  src.connect(filter);
  filter.connect(env);
  env.connect(buses.music);
  src.onended = () => { src.disconnect(); filter.disconnect(); env.disconnect(); };
  src.start(start, Math.random() * 1.5);
  src.stop(start + duration + 0.02);
}

function musicPad(start, duration, root) {
  const lowpass = ctx.createBiquadFilter();
  const env = ctx.createGain();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 800;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(0.16, start + duration * 0.25);
  env.gain.setValueAtTime(0.16, start + duration * 0.7);
  env.gain.linearRampToValueAtTime(0.0001, start + duration);
  lowpass.connect(env);
  env.connect(buses.music);
  const freqs = [scaleFreq(root, 130.81), scaleFreq(root + 3, 130.81)];
  let open = freqs.length;
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(lowpass);
    osc.onended = () => {
      osc.disconnect();
      open -= 1;
      if (open === 0) { lowpass.disconnect(); env.disconnect(); }
    };
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

function scheduleStep(step, time, stepSeconds) {
  const level = music.level;
  const inBar = step % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR);
  const root = BAR_ROOTS[bar];

  if (level <= 2 && inBar === 0 && bar % 2 === 0) musicPad(time, stepSeconds * STEPS_PER_BAR * 2, root);

  if (level === 0) {
    if (inBar % 4 === 2) musicNoise(time, 0.04, 0.12, 'highpass', 7000);
    return;
  }
  if (level === 3) {
    if (inBar % 8 === 0) musicNote('sine', 150, time, 0.28, 0.95, 50);
    return;
  }
  if (inBar % 4 === 0) musicNote('sine', 150, time, 0.2, 0.95, 50);
  if (inBar % 2 === 0) musicNoise(time, 0.04, inBar % 4 === 2 ? 0.26 : 0.14, 'highpass', 7000);
  const bass = BASS_PATTERN[inBar];
  if (bass >= 0) musicNote('triangle', scaleFreq(root + bass, 65.41), time, stepSeconds * 1.7, 0.5);
  if (level === 2) {
    if (inBar % 8 === 4) musicNoise(time, 0.11, 0.42, 'bandpass', 1900);
    if (inBar % 4 === 3) musicNote('sine', 240, time, 0.09, 0.3, 150);
  }
}

function heartBeat(time) {
  if (!makeRoom(PRIORITY.PHASE)) return;
  const voice = spawnVoice('suddenDeath', 'sfx', 1);
  voice.tone('sine', 60, time, 0.16, 0.85);
  voice.tone('sine', 60, time + 0.24, 0.2, 0.7);
}

function schedulerTick() {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const horizon = now + LOOKAHEAD;

  if (music.level >= 0 && settings.musicOn) {
    if (music.nextTime < now) music.nextTime = now + 0.02; // tab sempat tidur: lompat, jangan menumpuk
    const bpm = music.level === 2 ? audioCfg.bpmOvertime : audioCfg.bpm;
    const stepSeconds = 60 / bpm / 4;
    while (music.nextTime < horizon) {
      scheduleStep(music.step, music.nextTime, stepSeconds);
      music.stepsScheduled += 1;
      music.step = (music.step + 1) % LOOP_STEPS;
      music.nextTime += stepSeconds;
    }
  }

  if (music.heart) {
    if (music.heartNext < now) music.heartNext = now + 0.02;
    while (music.heartNext < horizon) {
      heartBeat(music.heartNext);
      music.heartNext += 60 / 72;
    }
  }
}

// ----- manajemen suara -----
function spawnVoice(name, bus, gain) {
  const voice = new Voice(name, bus, gain);
  voices.push(voice);
  return voice;
}

function makeRoom(prio) {
  const limit = audioCfg.maxVoices;
  let live = 0;
  let victim = null;
  for (const voice of voices) {
    if (voice.killed) continue;
    live += 1;
    if (voice.prio < prio && (victim === null || voice.prio < victim.prio ||
      (voice.prio === victim.prio && voice.startedAt < victim.startedAt))) {
      victim = voice;
    }
  }
  if (live < limit) return true;
  if (victim === null) return false;
  victim.kill();
  return true;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch { /* localStorage bisa diblokir; pengaturan cukup berlaku di sesi ini */ }
}

function restore() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (stored && typeof stored === 'object') {
      settings.volume = { ...settings.volume, ...stored.volume };
      if (typeof stored.musicOn === 'boolean') settings.musicOn = stored.musicOn;
    }
  } catch { /* data tersimpan rusak atau storage diblokir: pakai bawaan */ }
}

function applyMasterGain() {
  if (!ctx) return;
  masterGain.gain.setTargetAtTime(settings.muted ? 0 : settings.volume.master, ctx.currentTime, 0.015);
}

function resumeNow() {
  if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
  ctx.resume().catch(() => { /* akan dicoba lagi oleh timer di bawah */ });
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    if (document.visibilityState === 'visible') resumeNow();
  }, 1000);
}

export const Audio = {
  configure(config) {
    audioCfg = { ...audioCfg, ...config };
    if (config.volume) settings.volume = { ...settings.volume, ...config.volume };
    if (typeof config.musicOn === 'boolean') settings.musicOn = config.musicOn;
    restore();
  },

  // Dipanggil dari tombol MULAI, wajib di dalam handler sentuhan pengguna.
  init({ muted = false } = {}) {
    if (ctx) {
      resumeNow();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    ctx = new AudioCtor({ latencyHint: 'interactive' });
    settings.muted = muted;

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    masterGain = ctx.createGain();
    talkGain = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    musicDuck = ctx.createGain();
    for (const bus of ['sfx', 'music', 'ui']) {
      buses[bus] = ctx.createGain();
      buses[bus].gain.value = settings.volume[bus];
    }
    buses.sfx.connect(masterGain);
    buses.ui.connect(masterGain);
    buses.music.connect(musicDuck);
    musicDuck.connect(masterGain);
    masterGain.gain.value = muted ? 0 : settings.volume.master;
    masterGain.connect(talkGain);
    talkGain.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(ctx.destination);

    // Buffer noise dan kurva distorsi dibuat sekali lalu dipakai ulang.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
    driveCurve = new Float32Array(1024);
    for (let i = 0; i < driveCurve.length; i += 1) {
      const x = (i / (driveCurve.length - 1)) * 2 - 1;
      driveCurve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
    }

    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') resumeNow();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resumeNow();
    });
    window.addEventListener('pointerdown', resumeNow, { passive: true });
    ctx.resume().catch(() => {});
    schedulerId = setInterval(schedulerTick, SCHEDULER_MS);
  },

  get ready() {
    return ctx !== null;
  },

  play(name, options = {}) {
    if (!ctx || ctx.state === 'closed') return false;
    if (name === 'suddenDeath') {
      music.heart = true;
      music.heartNext = ctx.currentTime + 0.02;
      return true;
    }
    const recipe = RECIPES[name];
    if (!recipe) return false;

    const now = performance.now();
    const cooldown = audioCfg.cooldownMs[name] ?? 0;
    if (cooldown > 0 && now - (lastPlayed[name] ?? -Infinity) < cooldown) {
      if (name === 'join') joinBoostDb = Math.min(3, joinBoostDb + 0.5);
      return false;
    }
    if (!makeRoom(SOUND_PRIORITY[name] ?? PRIORITY.LOW)) {
      statDropped += 1;
      return false;
    }
    lastPlayed[name] = now;

    let gain = 1;
    if (name === 'join') {
      gain = dbToGain(joinBoostDb);
      joinBoostDb = 0;
    }
    const voice = spawnVoice(name, name === 'disconnect' ? 'ui' : 'sfx', gain);
    recipe(voice, ctx.currentTime + 0.005, options);
    statPlayed += 1;
    statPeakVoices = Math.max(statPeakVoices, voices.length);

    if (name === 'impact' || name === 'victory') this.duck(audioCfg.duckDb, audioCfg.duckSeconds);
    if (name === 'takeover') {
      // Takeover: momen besarnya baru datang setelah riser 1.5 detik.
      this.duck(audioCfg.duckDb, audioCfg.duckSeconds + 1.5);
    }
    return true;
  },

  stop(name) {
    if (name === 'suddenDeath') music.heart = false;
  },

  setVolume(bus, value) {
    const clamped = Math.max(0, Math.min(1, Number(value) || 0));
    settings.volume[bus] = clamped;
    save();
    if (!ctx) return;
    if (bus === 'master') applyMasterGain();
    else if (buses[bus]) buses[bus].gain.setTargetAtTime(clamped, ctx.currentTime, 0.015);
  },

  getVolume(bus) {
    return settings.volume[bus];
  },

  setMusicEnabled(on) {
    settings.musicOn = Boolean(on);
    save();
  },

  get musicEnabled() {
    return settings.musicOn;
  },

  // 0-3 sesuai tabel 9.4. Nilai negatif menghentikan musik (Penobatan).
  setMusicIntensity(level) {
    if (level === music.level) return;
    const wasOff = music.level < 0;
    music.level = level;
    if (wasOff && ctx) {
      music.nextTime = ctx.currentTime + 0.05;
      music.step = 0;
    }
  },

  get musicIntensity() {
    return music.level;
  },

  duck(db, seconds) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const param = musicDuck.gain;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(dbToGain(db), now, 0.03);
    param.setTargetAtTime(1, now + seconds, 0.2);
  },

  talkMode(on) {
    talkOn = Boolean(on);
    if (ctx) talkGain.gain.setTargetAtTime(talkOn ? dbToGain(audioCfg.talkModeDb) : 1, ctx.currentTime, 0.05);
    return talkOn;
  },

  get talkOn() {
    return talkOn;
  },

  toggleMute() {
    settings.muted = !settings.muted;
    applyMasterGain();
    return settings.muted;
  },

  get muted() {
    return settings.muted;
  },

  get analyser() {
    return analyser;
  },

  stats() {
    return {
      state: ctx ? ctx.state : 'none',
      voices: voices.filter((v) => !v.killed).length,
      peakVoices: statPeakVoices,
      played: statPlayed,
      dropped: statDropped,
      musicLevel: music.level,
      musicSteps: music.stepsScheduled,
      currentTime: ctx ? ctx.currentTime : 0,
    };
  },

  resetPeak() {
    statPeakVoices = 0;
  },
};
