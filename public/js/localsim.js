// Bot darurat di HP, dipakai hanya jika tombol darurat ditekan saat WebSocket putus.
// Menghasilkan pesan dengan bentuk yang sama seperti backend.

const NAMES = ['Budi', 'Sari', 'Agus', 'Dewi', 'Rina', 'Yusuf', 'Putu', 'Made', 'Nanda', 'Fajar', 'Ucok', 'Maya'];
const EVENTS_PER_SECOND = 8;
const BOT_COUNT = 60;

export class LocalSim {
  constructor(wilayah, push) {
    this.push = push;
    this.codes = wilayah.kubu.map((k) => k.code);
    this.provinces = wilayah.provinces;
    this.timer = 0;
    this.seq = 0;
    this.group = 0;
    this.bots = [];
    for (let i = 0; i < BOT_COUNT; i += 1) {
      this.bots.push({
        user: { id: `local_${i}`, handle: `local_${i}`, nick: `${NAMES[i % NAMES.length]}${i}`, isFollower: false },
        team: this.codes[Math.floor(Math.random() * Math.random() * this.codes.length)],
        joined: false,
        lastChat: 0,
      });
    }
  }

  get running() {
    return this.timer !== 0;
  }

  start() {
    if (!this.running) this.timer = setInterval(() => this.tick(), 1000 / EVENTS_PER_SECOND);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
  }

  emit(type, data, user) {
    this.seq += 1;
    this.push({ v: 1, type, id: `local-${this.seq}`, ts: Date.now(), user, data });
  }

  gift(bot, id, name, unitCoins, tier) {
    this.group += 1;
    this.emit('GIFT_TRIGGER', {
      giftId: id, giftName: name, unitCoins, delta: 1, coins: unitCoins, streakTotal: 1,
      streakId: `local:${this.group}`, streakEnded: true, tier, team: bot.team,
    }, bot.user);
  }

  tick() {
    const bot = this.bots[Math.floor(Math.random() * this.bots.length)];
    if (!bot.joined) {
      bot.joined = true;
      const options = this.provinces.filter((p) => p.kubu === bot.team);
      const province = Math.random() < 0.7 ? options[Math.floor(Math.random() * options.length)].name : null;
      this.emit('CHAT_ACTION', { action: 'TEAM_JOIN', team: bot.team, province }, bot.user);
      return;
    }
    const roll = Math.random();
    if (roll < 0.72) {
      this.emit('CHAT_ACTION', { action: 'DASH', team: bot.team, province: null }, bot.user);
    } else if (roll < 0.82) {
      this.emit('CHAT_ACTION', { action: 'RALLY', team: bot.team, province: null }, bot.user);
    } else if (roll < 0.93) {
      this.emit('LIKE_BATCH', { likes: { [bot.team]: 12 } });
    } else if (roll < 0.985) {
      this.gift(bot, 5655, 'Mawar', 1, 'MICRO');
    } else if (roll < 0.996) {
      this.gift(bot, 6104, 'Topi', 30, 'MID');
    } else if (roll < 0.9995) {
      this.gift(bot, 5585, 'Confetti', 100, 'SULTAN');
    } else {
      this.gift(bot, 6202, 'Galaksi', 1000, 'MEGA');
    }
  }
}
