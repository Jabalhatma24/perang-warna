// Koneksi WebSocket ke backend dengan reconnect otomatis (1, 2, 5, 10 detik).

const BACKOFF_MS = [1000, 2000, 5000, 10000];

export class Net {
  // getRole() dipanggil setiap HELLO supaya host yang sudah digantikan tetap menjadi view.
  constructor({ getRole, onMessage, onOpen, onClose }) {
    this.getRole = getRole;
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.ws = null;
    this.attempt = 0;
    this.seq = 0;
    this.everOpened = false;
  }

  get isOpen() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.everOpened = true;
      this.send('HELLO', { role: this.getRole() });
      this.onOpen?.();
    };
    ws.onmessage = (event) => {
      try {
        this.onMessage(JSON.parse(event.data));
      } catch (error) {
        console.warn('Pesan backend tidak bisa dibaca', error);
      }
    };
    ws.onclose = () => {
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
      this.attempt += 1;
      this.onClose?.();
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  send(type, data) {
    if (!this.isOpen) return false;
    this.seq += 1;
    this.ws.send(JSON.stringify({ v: 1, type, id: `c${this.seq}`, ts: Date.now(), data }));
    return true;
  }
}
