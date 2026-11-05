// Halaman uji suara: ?sfxtest=1
import { Audio, SOUND_NAMES } from './audio.js';

const SUDDEN = 'suddenDeath';

export function runSfxTest(config, wilayah) {
  Audio.configure(config.audio);
  document.body.classList.add('sfxtest');
  const root = document.getElementById('sfxtest');
  root.hidden = false;
  document.getElementById('start').hidden = true;
  document.getElementById('game').hidden = true;

  let team = 0;
  let suddenOn = false;
  let peak = 0;
  let clippedSamples = 0;
  let spamTimer = 0;

  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  const section = (title) => {
    const box = el('section');
    box.append(el('h2', title));
    const body = el('div', undefined, 'grid');
    box.append(body);
    root.append(box);
    return body;
  };

  root.append(el('h1', 'Uji Suara Perang Warna'));
  const unlock = el('button', 'Nyalakan Audio', 'primary');
  root.append(unlock);

  const panels = el('div');
  panels.hidden = true;
  root.append(panels);

  const meterBox = el('section');
  const meter = el('div', undefined, 'meter');
  const meterFill = el('div', undefined, 'meter-fill');
  meter.append(meterFill);
  const readout = el('pre', '', 'readout');
  meterBox.append(el('h2', 'Meter level'), meter, readout);
  root.append(meterBox);

  const teamBody = section('Kubu untuk nada');
  const teamButtons = wilayah.kubu.map((k, index) => {
    const button = el('button', `${k.no} ${k.label}`);
    button.style.borderColor = k.color;
    button.addEventListener('click', () => {
      team = index;
      teamButtons.forEach((b, i) => b.classList.toggle('active', i === index));
    });
    teamBody.append(button);
    return button;
  });
  teamButtons[0].classList.add('active');

  const soundBody = section('Suara (tabel 9.3)');
  const comboState = { streak: 1, level: 1 };
  for (const name of SOUND_NAMES) {
    const button = el('button', name);
    button.dataset.sound = name;
    button.addEventListener('click', () => {
      if (name === SUDDEN) {
        suddenOn = !suddenOn;
        button.classList.toggle('active', suddenOn);
        if (suddenOn) Audio.play(SUDDEN);
        else Audio.stop(SUDDEN);
        return;
      }
      if (name === 'coin') {
        Audio.play('coin', { streak: comboState.streak });
        comboState.streak = comboState.streak >= 24 ? 1 : comboState.streak + 1;
        return;
      }
      if (name === 'combo') {
        Audio.play('combo', { intensity: comboState.level });
        comboState.level = comboState.level >= 3 ? 1 : comboState.level + 1;
        return;
      }
      Audio.play(name, { team, intensity: Math.random() });
    });
    soundBody.append(button);
  }

  const musicBody = section('Musik');
  const levelButtons = [];
  const levelLabels = ['0 Persiapan', '1 Pertempuran', '2 Overtime', '3 Sudden Death', 'Stop'];
  [0, 1, 2, 3, -1].forEach((level, index) => {
    const button = el('button', levelLabels[index]);
    button.dataset.music = String(level);
    button.addEventListener('click', () => {
      Audio.setMusicIntensity(level);
      levelButtons.forEach((b) => b.classList.toggle('active', b === button));
    });
    levelButtons.push(button);
    musicBody.append(button);
  });

  const stressBody = section('Uji beban');
  const spam = el('button', 'Spam 50 gift');
  spam.id = 'spam';
  spam.addEventListener('click', () => {
    clearInterval(spamTimer);
    Audio.resetPeak();
    let sent = 0;
    const pool = ['coin', 'coin', 'coin', 'elite', 'impact', 'takeover', 'meteorFall', 'coin', 'dash', 'join'];
    spamTimer = setInterval(() => {
      Audio.play(pool[sent % pool.length], { team, streak: sent + 1 });
      sent += 1;
      if (sent >= 50) clearInterval(spamTimer);
    }, 20);
  });
  stressBody.append(spam);

  const resetPeak = el('button', 'Reset puncak');
  resetPeak.addEventListener('click', () => {
    peak = 0;
    clippedSamples = 0;
    Audio.resetPeak();
  });
  stressBody.append(resetPeak);

  const talk = el('button', 'Mode Bicara');
  talk.addEventListener('click', () => talk.classList.toggle('active', Audio.talkMode(!Audio.talkOn)));
  stressBody.append(talk);

  const mixBody = section('Volume');
  for (const bus of ['master', 'sfx', 'music', 'ui']) {
    const label = el('label', bus);
    const slider = el('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = String(Audio.getVolume(bus));
    slider.addEventListener('input', () => Audio.setVolume(bus, slider.value));
    label.append(slider);
    mixBody.append(label);
  }

  // Bagian tombol baru tampil setelah audio dibuka.
  for (const child of [...root.querySelectorAll('section')]) {
    if (child !== meterBox) panels.append(child);
  }

  unlock.addEventListener('click', () => {
    Audio.init();
    unlock.hidden = true;
    panels.hidden = false;
    requestAnimationFrame(measure);
  });

  const buffer = new Float32Array(1024);
  function measure() {
    const analyser = Audio.analyser;
    if (analyser) {
      analyser.getFloatTimeDomainData(buffer);
      let level = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const value = Math.abs(buffer[i]);
        if (value > level) level = value;
        if (value >= 1) clippedSamples += 1;
      }
      if (level > peak) peak = level;
      meterFill.style.width = `${Math.min(100, level * 100).toFixed(1)}%`;
      meterFill.classList.toggle('hot', level >= 0.98);
      const stats = Audio.stats();
      readout.textContent =
        `level ${level.toFixed(3)}  puncak ${peak.toFixed(3)}  sampel pecah ${clippedSamples}\n` +
        `suara aktif ${stats.voices}  puncak suara ${stats.peakVoices}  diputar ${stats.played}  dibuang ${stats.dropped}\n` +
        `konteks ${stats.state}  musik level ${stats.musicLevel}  langkah ${stats.musicSteps}`;
      window.__sfx = { peak, clippedSamples, stats };
    }
    requestAnimationFrame(measure);
  }
}
