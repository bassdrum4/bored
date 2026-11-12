// Puffer Party's reef. Everything here is drawn, not loaded: one cached layer
// for the water, the light and the coral, then perches and bubbles on top.
const seed = n => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return v - Math.floor(v);
};
const step = v => Math.round(v / 2) * 2;

function poly(c, points, color) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(step(x), step(y)) : c.moveTo(step(x), step(y)));
  c.closePath();
  c.fill();
}

// A branching fan coral: wide at the top, rooted at (x, base).
function coral(c, x, base, height, width, phase, color) {
  const rows = Math.max(4, Math.floor(height / 16));
  c.fillStyle = color;
  for (let i = 0; i < rows; i++) {
    const y = base - i * 16;
    const spread = (i / rows) * width;
    const sway = Math.sin(i * .5 + phase) * 3;
    c.fillRect(step(x - 2 + sway), step(y - 16), 5, 18);
    if (i < 2) continue;
    for (const dir of [-1, 1]) {
      const reach = spread * .8 + 8;
      poly(c, [
        [x + sway, y], [x + sway + dir * reach * .3, y - 7],
        [x + sway + dir * reach, y - 13], [x + sway + dir * reach * .9, y - 20],
        [x + sway + dir * reach * .35, y - 12], [x + sway, y - 5]
      ], color);
    }
  }
}

function weed(c, x, base, height, phase, color) {
  c.fillStyle = color;
  for (let y = 0; y < height; y += 5) {
    const sway = Math.sin(y * .05 + phase) * 7 + Math.sin(y * .12) * 2;
    c.fillRect(step(x + sway), step(base - y), 4, 7);
    if (y % 30 === 0) c.fillRect(step(x + sway) + 3, step(base - y) - 5, 4, 8);
  }
}

export class Reef {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.seats = [];
    this.lowPower = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.bubbles = [];
    this.base = document.createElement('canvas');
    this.resize();
  }

  resize() {
    const w = Math.max(320, this.canvas.clientWidth || innerWidth);
    const h = Math.max(320, this.canvas.clientHeight || innerHeight);
    this.w = w;
    this.h = h;
    // The reef is drawn at half resolution and scaled up: it stays pixel-crisp
    // and costs nothing on a phone.
    this.canvas.width = Math.ceil(w / 2);
    this.canvas.height = Math.ceil(h / 2);
    this.base.width = this.canvas.width;
    this.base.height = this.canvas.height;
    const ctx = this.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    this.seedBubbles();
    this.paint();
  }

  seedBubbles() {
    const count = this.lowPower ? 12 : 34;
    this.bubbles = Array.from({ length: count }, (_, i) => ({
      x: seed(i + 3) * this.w,
      y: seed(i + 61) * this.h,
      r: 1 + seed(i + 17) * 2.4,
      speed: 8 + seed(i + 29) * 22,
      drift: (seed(i + 44) - .5) * 10,
      alpha: .12 + seed(i + 8) * .32
    }));
  }

  paint() {
    const c = this.base.getContext('2d');
    const w = this.base.width;
    const h = this.base.height;
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#3d8aaa');
    sky.addColorStop(.18, '#2f7b9c');
    sky.addColorStop(.46, '#1e5c7d');
    sky.addColorStop(.74, '#103f5b');
    sky.addColorStop(.92, '#0a2437');
    sky.addColorStop(1, '#071a29');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);

    // Sun shafts.
    for (const [x, dx, alpha] of [[w * .18, 90, .07], [w * .44, 140, .09], [w * .78, 70, .06]]) {
      poly(c, [[x, -20], [x + 26, -20], [x + 26 + dx, h * .92], [x + dx, h * .92]], `rgba(198,236,255,${alpha})`);
    }

    // Coral walls, thicker at the edges like the reference.
    coral(c, w * .05, h * .98, h * .62, w * .16, 1, '#081a2b');
    coral(c, w * .02, h * .96, h * .46, w * .13, 4, '#061423');
    coral(c, w * .96, h * .97, h * .58, w * .15, 7, '#081a2b');
    coral(c, w * .99, h * .94, h * .40, w * .12, 2, '#061423');
    for (const [x, base, height, phase] of [[.09, .99, .3, 1], [.16, .995, .2, 5], [.88, .99, .26, 3], [.93, .995, .18, 8]]) {
      weed(c, w * x, h * base, h * height, phase, '#04101d');
    }

    // Water grain and caustic specks.
    for (let i = 0; i < w * h / 26; i++) {
      const x = step(seed(i + 5) * w);
      const y = step(seed(i + 91) * h);
      const p = seed(i + 37);
      c.fillStyle = p > .82 ? 'rgba(196,232,250,.07)' : 'rgba(4,16,28,.10)';
      c.fillRect(x, y, p > .95 ? 2 : 1, 1);
    }
    for (let i = 0; i < 26; i++) {
      const x = step(seed(i + 11) * w);
      const y = step(seed(i + 71) * h * .82);
      c.strokeStyle = 'rgba(196,236,255,.10)';
      c.lineWidth = 1;
      c.strokeRect(x, y, 4, 3);
    }

    // Seabed haze at the very bottom.
    const floor = c.createLinearGradient(0, h * .70, 0, h);
    floor.addColorStop(0, 'rgba(4,12,22,0)');
    floor.addColorStop(1, 'rgba(3,8,16,.92)');
    c.fillStyle = floor;
    c.fillRect(0, h * .70, w, h * .30);
  }

  perch(c, x, y, scale = 1) {
    const w = 44 * scale;
    const top = y + 15 * scale;
    c.fillStyle = 'rgba(2,6,14,.45)';
    c.beginPath();
    c.ellipse(x, top + 16 * scale, w * 1.02, 5 * scale, 0, 0, Math.PI * 2);
    c.fill();
    poly(c, [[x - w, top], [x + w, top], [x + w * .92, top + 13 * scale], [x + w * .58, top + 18 * scale], [x - w * .58, top + 18 * scale], [x - w * .92, top + 13 * scale]], '#0f2334');
    c.fillStyle = '#163247';
    c.beginPath();
    c.ellipse(x, top, w, 6 * scale, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1d4059';
    c.beginPath();
    c.ellipse(x - 2, top - 2, w * .78, 3.6 * scale, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(120,186,214,.28)';
    for (let i = 0; i < 5; i++) {
      c.fillRect(step(x - w * .6 + seed(i + x) * w * 1.2), step(top - 1 + seed(i + y) * 4), 2, 1);
    }
  }

  draw(seats = this.seats, now = performance.now()) {
    const ctx = this.ctx;
    const s = this.canvas.width / this.w;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, this.w, this.h);

    this.seats = seats;
    for (const seat of seats) this.perch(ctx, seat.x, seat.y, seat.scale || 1);

    const dt = Math.min(.05, (now - (this.last || now)) / 1000 || .016);
    this.last = now;
    if (!this.lowPower) {
      for (const bubble of this.bubbles) {
        bubble.y -= bubble.speed * dt;
        bubble.x += bubble.drift * dt;
        if (bubble.y < -6) {
          bubble.y = this.h + 6;
          bubble.x = Math.random() * this.w;
        }
        ctx.strokeStyle = `rgba(198,232,248,${bubble.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  start() {
    const loop = now => {
      this.draw(this.seats, now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
