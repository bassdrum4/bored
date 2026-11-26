import * as T from './three.mjs';

const asset = name => new URL(name, import.meta.url).href;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
function turn(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

/* ------------------------------------------------------------------ stage */
const host = $('scene');
const scene = new T.Scene();
scene.background = new T.Color(0x9db8c2);
scene.fog = new T.FogExp2(0x9db8c2, .0036);
const camera = new T.PerspectiveCamera(44, innerWidth / innerHeight, .1, 1800);
const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
host.appendChild(renderer.domElement);
$('error')?.remove();

const sun = new T.DirectionalLight(0xffe0a3, 2.2);
sun.position.set(-80, 45, -35);
// Fill from the camera side so ships never read as flat silhouettes against the glare.
const fill = new T.DirectionalLight(0xcfe2ea, .95);
fill.position.set(70, 34, 95);
scene.add(sun, fill, new T.HemisphereLight(0xdcefff, 0x233b4a, 1.2));

const sky = new T.Mesh(new T.SphereGeometry(700, 32, 20), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, uniforms: {}, vertexShader: `varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: `varying vec3 p;void main(){vec3 d=normalize(p);float h=max(d.y,0.);vec3 c=mix(vec3(.72,.79,.77),vec3(.19,.37,.52),pow(h,.45));vec2 uv=d.xz/(h+.22);float cl=sin(uv.x*4.+sin(uv.y*3.))*cos(uv.y*3.1+sin(uv.x*2.3));cl+=.42*sin(uv.x*9.2+uv.y*4.6)+.18*cos(uv.y*22.-uv.x*9.);c=mix(c,vec3(.87,.88,.83),smoothstep(.48,1.05,cl)*smoothstep(.03,.3,h)*.65);float s=pow(max(dot(d,normalize(vec3(-.8,.35,-.4))),0.),100.);c+=vec3(1.,.7,.35)*s;gl_FragColor=vec4(c,1.);}` }));
scene.add(sky);

const sea = new T.Mesh(new T.PlaneGeometry(4000, 4000, 100, 100), new T.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: `uniform float time;varying vec3 w;void main(){vec3 p=position;p.z=.45*sin(p.x*.18+time*1.2)+.24*cos(p.y*.32-time*.9)+.12*sin((p.x+p.y)*.7+time);w=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`, fragmentShader: `uniform float time;varying vec3 w;void main(){float d=length(cameraPosition.xz-w.xz);float near=1.-smoothstep(35.,260.,d);float a=sin(w.x*.18+time*1.2), b=cos(w.z*.32-time*.9);float s1=sin(dot(w.xz,vec2(1.7,-1.1))+time*1.7);float s2=sin(dot(w.xz,vec2(-3.3,2.6))-time*2.3);float s3=sin(dot(w.xz,vec2(2.9,3.4))+time*2.1);float s4=sin(dot(w.xz,vec2(-5.2,-4.1))+time*3.1);vec3 n=normalize(vec3(-.081*cos(w.x*.18+time*1.2)-.026*s1*near-.012*s2*near-.006*s4*near,1.,.077*sin(w.z*.32-time*.9)+.024*s3*near+.010*s4*near));vec3 v=normalize(cameraPosition-w);float f=pow(1.-max(dot(n,v),0.),3.);float spec=pow(max(dot(reflect(-normalize(vec3(-.8,.55,-.4)),n),v),0.),26.);vec3 c=mix(vec3(.018,.18,.24),vec3(.47,.62,.65),f)+vec3(.8,.66,.41)*spec*.5;float foam=smoothstep(.95,1.,a*.65+b*.35)*.1;c+=foam+s1*.007*near;c=mix(c,vec3(.6,.68,.71),clamp((1.-exp(-d*.004))*.8+smoothstep(50.,300.,d)*.55,0.,.95));gl_FragColor=vec4(c,1.);}` }));
sea.rotation.x = -Math.PI / 2;
scene.add(sea);
// Flat ocean out to the horizon so the detailed swell never ends inside the frame.
const farSea = new T.Mesh(new T.PlaneGeometry(9000, 9000), new T.MeshBasicMaterial({ color: 0x31596a }));
farSea.rotation.x = -Math.PI / 2;
farSea.position.y = -.8;
scene.add(farSea);

/* ------------------------------------------------------------------ fleet */
const mat = (color, metalness = .25, roughness = .55) => new T.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: .28 });
const steel = mat(0x6a7a80), dark = mat(0x25323a), deck = mat(0x8a7a63), black = mat(0x151f25), red = mat(0x6d3a33), cream = mat(0xa9a897);
const boxGeo = new T.BoxGeometry(1, 1, 1);
function box(g, m, x, y, z, w, h, d) { let o = new T.Mesh(boxGeo, m); o.position.set(x, y, z); o.scale.set(w, h, d); g.add(o); return o }
function cyl(g, m, x, y, z, r1, r2, h) { let o = new T.Mesh(new T.CylinderGeometry(r1, r2, h, 10), m); o.position.set(x, y, z); g.add(o); return o }

function makeShip(len = 23) {
  let g = new T.Group(); let width = len * .20; let shape = new T.Shape();
  shape.moveTo(-width * .34, -len * .5); shape.lineTo(width * .34, -len * .5); shape.lineTo(width * .5, -len * .32);
  shape.lineTo(width * .47, len * .19); shape.quadraticCurveTo(width * .28, len * .39, 0, len * .56);
  shape.quadraticCurveTo(-width * .28, len * .39, -width * .47, len * .19); shape.lineTo(-width * .5, -len * .32); shape.closePath();
  let hull = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 1.7, bevelEnabled: true, bevelSize: .25, bevelThickness: .3, bevelSegments: 1, steps: 1 }), steel);
  hull.rotation.x = -Math.PI / 2; hull.position.y = -.35; g.add(hull);
  let stripe = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: .42, bevelEnabled: false }), red);
  stripe.rotation.x = -Math.PI / 2; stripe.position.y = -.8; g.add(stripe);
  let top = new T.Mesh(new T.ShapeGeometry(shape), deck); top.rotation.x = -Math.PI / 2; top.position.y = 1.68; g.add(top);
  box(g, steel, 0, 2.1, 0, width * .72, 1.0, len * .35);
  box(g, steel, 0, 3.0, -.7, width * .54, 1.1, len * .20);
  box(g, dark, 0, 3.65, -.7, width * .53, .32, len * .19);
  for (let i = -2; i <= 2; i++) box(g, black, i * width * .09, 3.7, -len * .08, .18, .22, .07);
  cyl(g, dark, 0, 4.05, len * .08, width * .14, width * .17, 2.0);
  cyl(g, black, 0, 5.08, len * .08, width * .17, width * .17, .2);
  cyl(g, steel, 0, 5.0, -len * .12, .075, .12, 4.4);
  box(g, steel, 0, 6.3, -len * .12, width * .65, .07, .08);
  box(g, cream, 0, 7.2, -len * .12, .12, .12, 1.35);
  const turrets = [];
  for (let z of [-len * .34, len * .27, len * .40]) {
    const t = new T.Group(); t.position.set(0, 1.8, z); g.add(t);
    cyl(t, dark, 0, .15, 0, width * .28, width * .28, .3);
    box(t, steel, 0, .65, 0, width * .56, .85, width * .48);
    const barrels = [];
    for (let i of [-1, 1]) { let barrel = cyl(t, dark, i * width * .11, .75, -width * .64, .13, .17, width * .91); barrel.rotation.x = Math.PI / 2; barrels.push(barrel) }
    t.userData.barrels = barrels;
    t.userData.restZ = z;
    turrets.push(t)
  }
  for (let i = 0; i < 10; i++) { for (let s of [-1, 1]) box(g, dark, s * width * .36, 1.82, -len * .37 + i * len * .07, .11, .18, .11) }
  g.userData = { turrets, baseY: 0, damage: 0, length: len, width };
  return g
}

const player = makeShip(27);
player.userData.shipType = 'battleship';
player.position.set(0, 0, 43);
scene.add(player);

const grid = new T.Group(); scene.add(grid);
const cell = 6.5, originX = -29.25, originZ = -65;
let verts = [];
for (let i = 0; i <= 10; i++) {
  let x = originX - cell / 2 + i * cell, z = originZ - cell / 2 + i * cell;
  verts.push(x, .8, originZ - cell / 2, x, .8, originZ + cell * 9.5, originX - cell / 2, .8, z, originX + cell * 9.5, .8, z)
}
grid.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(verts, 3)), new T.LineBasicMaterial({ color: 0xc4e3da, transparent: true, opacity: .3 })));
const marks = new T.Group(); grid.add(marks);

const UP = new T.Vector3(0, 1, 0);
const baseCam = new T.Vector3(91, 89, 119), baseLook = new T.Vector3(0, 0, -26);
camera.position.copy(baseCam);
camera.lookAt(baseLook);
const camPos = baseCam.clone(), look = baseLook.clone();

let ships = [], occupied = new Map(), busy = false, cinematic = true, soundOn = false, shot = null, finish = null;
let ownModels = [], ownKey = '', clock = new T.Clock(), elapsed = 0, ac = null, shake = 0;
const particles = [], billows = [], rings = [], flashes = [];

function pos(i) { return new T.Vector3(originX + (i % 10) * cell, .7, originZ + Math.floor(i / 10) * cell) }

function setFleet(fleet) {
  const key = JSON.stringify(fleet);
  if (key === ownKey) return;
  ownKey = key;
  for (const s of ownModels) scene.remove(s);
  ownModels = [];
  fleet.forEach((cells, index) => {
    if (!cells.length) return;
    const g = makeShip(cells.length * cell * .87);
    g.userData.shipType = TYPES[index];
    g.userData.length = cells.length * cell * .87;
    styleFallback(g, TYPES[index]);
    applyModel(g);
    g.position.set(((cells[0] % 10 + cells.at(-1) % 10) / 2 - 4.5) * cell, 0, 83 + (Math.floor(cells[0] / 10) + Math.floor(cells.at(-1) / 10)) / 2 * cell);
    g.rotation.y = cells[1] - cells[0] === 1 ? Math.PI / 2 : 0;
    scene.add(g);
    ownModels.push(g);
  });
}

const TYPES = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'];
const NAMES = ['CARRIER', 'BATTLESHIP', 'CRUISER', 'SUBMARINE', 'DESTROYER'];

/* --------------------------------------------------------------- effects */
const particleGeo = new T.SphereGeometry(1, 6, 5);
const fxCanvas = document.createElement('canvas');
fxCanvas.width = fxCanvas.height = 128;
const fxctx = fxCanvas.getContext('2d');
const grad = fxctx.createRadialGradient(64, 64, 3, 64, 64, 62);
grad.addColorStop(0, 'rgba(255,255,255,1)');
grad.addColorStop(.24, 'rgba(255,255,255,.8)');
grad.addColorStop(.67, 'rgba(255,255,255,.23)');
grad.addColorStop(1, 'rgba(255,255,255,0)');
fxctx.fillStyle = grad; fxctx.fillRect(0, 0, 128, 128);
const puffTexture = new T.CanvasTexture(fxCanvas);
let atlasTexture = null;

const flashLight = new T.PointLight(0xffb066, 0, 110, 2);
scene.add(flashLight);

function puff(at, opts = {}) {
  const tex = opts.atlas ? atlasTexture : puffTexture;
  let map = tex;
  if (opts.atlas) { map = tex.clone(); map.repeat.set(1 / 3, 1 / 3); map.offset.set((opts.frame % 3) / 3, Math.floor(opts.frame / 3) / 3); map.needsUpdate = true; }
  const material = new T.SpriteMaterial({
    map, color: opts.color ?? 0xffffff, transparent: true, depthWrite: false,
    opacity: opts.opacity ?? .75, blending: opts.additive ? T.AdditiveBlending : T.NormalBlending
  });
  const o = new T.Sprite(material);
  o.position.copy(at).add(new T.Vector3((Math.random() - .5) * 2, Math.random() * 1.5, (Math.random() - .5) * 2));
  o.scale.setScalar(opts.size ?? 2);
  scene.add(o);
  billows.push({
    o, tex: map, t: 0, life: opts.life ?? 1.2, opacity: opts.opacity ?? .75,
    v: new T.Vector3((Math.random() - .5) * (opts.spread ?? 3), opts.rise ?? (opts.hit ? 4 : 8), (Math.random() - .5) * (opts.spread ?? 3)),
    gravity: opts.gravity ?? (opts.hit ? 1 : 9), base: opts.size ?? 2, grow: opts.grow ?? 1.8
  });
}

function sparks(at, amount = 70, hot = true, speed = 1) {
  for (let i = 0; i < amount; i++) {
    const color = hot ? (i % 3 === 0 ? 0xffd27b : i % 3 === 1 ? 0xe66c31 : 0x38434a) : (i % 3 ? 0xc7e8ee : 0xffffff);
    const m = new T.Mesh(particleGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: .95 }));
    m.position.copy(at);
    m.scale.setScalar(.12 + Math.random() * .34);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, r = Math.random() * (hot ? 10 : 5) * speed;
    particles.push({ mesh: m, v: new T.Vector3(Math.cos(a) * r, 3 + Math.random() * (hot ? 12 : 22) * speed, Math.sin(a) * r), life: 1.2 + Math.random() * 1.4, max: 2.6, gravity: hot ? 7 : 16 });
  }
}

function ring(at, color = 0xffa962, from = 2, to = 16, life = .9, y = .9) {
  const material = new T.MeshBasicMaterial({ color, transparent: true, opacity: .85, side: T.DoubleSide, depthWrite: false });
  const mesh = new T.Mesh(new T.RingGeometry(.94, 1, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(at); mesh.position.y = y;
  scene.add(mesh);
  rings.push({ mesh, t: 0, life, from, to });
}

function explode(at) {
  sparks(at, 80, true);
  for (let j = 0; j < 14; j++) puff(at, { atlas: atlasTexture && j < 8, frame: j, color: j < 8 ? 0xffac55 : 0x4a5359, hit: true, additive: j < 8, size: j < 8 ? 4 : 3, life: 1.5 + j * .14, rise: 3 + Math.random() * 5, gravity: 1.2, grow: 2.4 });
  ring(at, 0xffb070, 2, 30, 1.1);
  ring(at, 0xffe6bb, 1, 12, .45, 1.1);
  flashLight.position.copy(at).setY(4);
  flashLight.intensity = 260;
  shake = .55;
}

function splash(at) {
  for (let j = 0; j < 18; j++) puff(at, { color: j % 4 ? 0xdff2f7 : 0xffffff, additive: j % 2 === 0, size: 1.2, life: .85 + Math.random() * .55, rise: 15 + Math.random() * 12, spread: 1.8, gravity: 16, grow: .9, opacity: .5 });
  ring(at, 0xbfe4ec, 2, 16, .9);
  ring(at, 0xe8fbff, 1, 6, .45, 1.05);
  shake = .18;
}

function updateFx(dt) {
  for (let i = billows.length - 1; i >= 0; i--) {
    const b = billows[i]; b.t += dt; const u = b.t / b.life;
    if (u >= 1) {
      scene.remove(b.o); b.o.material.dispose();
      if (b.tex !== puffTexture) b.tex.dispose();
      billows.splice(i, 1); continue
    }
    b.o.position.addScaledVector(b.v, dt); b.v.y -= dt * b.gravity;
    b.o.material.opacity = (1 - u) * (b.opacity ?? .8);
    b.o.scale.setScalar(b.base * (.5 + u * b.grow));
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.v.y -= p.gravity * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    p.mesh.material.opacity = Math.max(0, p.life / p.max);
    if (p.life <= 0 || p.mesh.position.y < -.6) {
      scene.remove(p.mesh); p.mesh.material.dispose(); particles.splice(i, 1)
    }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const u = clamp(r.t / r.life, 0, 1);
    r.mesh.scale.setScalar(r.from + (r.to - r.from) * u);
    r.mesh.material.opacity = (1 - u) * .55;
    if (u >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); r.mesh.geometry.dispose(); rings.splice(i, 1) }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t += dt; const u = f.t / f.life;
    f.sprite.material.opacity = (1 - u) * (f.alpha ?? .9);
    f.sprite.scale.setScalar(f.size * (.4 + u * 1.6));
    if (u >= 1) { scene.remove(f.sprite); f.sprite.material.dispose(); flashes.splice(i, 1) }
  }
  flashLight.intensity *= Math.exp(-dt * 4.5);
  shake *= Math.exp(-dt * 4.2);
}

function muzzleFlash(at) {
  const material = new T.SpriteMaterial({ map: puffTexture, color: 0xffd79a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .95 });
  const sprite = new T.Sprite(material);
  sprite.position.copy(at); sprite.scale.setScalar(3);
  scene.add(sprite);
  flashes.push({ sprite, t: 0, life: .2, size: 4 });
  for (let j = 0; j < 9; j++) puff(at, { color: j < 4 ? 0xffc070 : 0x8b9297, additive: j < 4, size: 2.2, life: .7 + Math.random() * .8, rise: 1 + Math.random() * 3, spread: 4, gravity: -.6, grow: 2.6, opacity: .55 });
  flashLight.position.copy(at).setY(at.y + 1);
  flashLight.intensity = 90;
  shake = Math.max(shake, .18);
}

/* -------------------------------------------------------------- reticles */
const reticle = new T.Group(); reticle.visible = false; scene.add(reticle);
const retMat = new T.MeshBasicMaterial({ color: 0xffd9a3, transparent: true, opacity: .8, side: T.DoubleSide, depthWrite: false });
const retRing = new T.Mesh(new T.RingGeometry(2.3, 2.55, 44), retMat);
retRing.rotation.x = -Math.PI / 2; reticle.add(retRing);
for (let i = 0; i < 4; i++) {
  const tick = new T.Mesh(new T.PlaneGeometry(2.2, .16), retMat);
  tick.rotation.x = -Math.PI / 2;
  tick.rotation.z = i * Math.PI / 2;
  tick.position.set(Math.cos(i * Math.PI / 2) * 3.6, 0, Math.sin(i * Math.PI / 2) * 3.6);
  reticle.add(tick);
}
const retPulse = new T.Mesh(new T.RingGeometry(1.6, 1.8, 32), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
retPulse.rotation.x = -Math.PI / 2; reticle.add(retPulse);

const bearingGeo = new T.BufferGeometry();
const bearingPos = new Float32Array(26 * 6);
bearingGeo.setAttribute('position', new T.Float32BufferAttribute(bearingPos, 3));
const bearingLine = new T.LineSegments(bearingGeo, new T.LineBasicMaterial({ color: 0xffd9a3, transparent: true, opacity: .28 }));
bearingLine.visible = false; scene.add(bearingLine);

function layBearing(a, b) {
  const dashes = 26, gap = .55;
  for (let i = 0; i < dashes; i++) {
    const u0 = i / dashes, u1 = (i + gap) / dashes;
    bearingPos[i * 6] = a.x + (b.x - a.x) * u0; bearingPos[i * 6 + 1] = .9; bearingPos[i * 6 + 2] = a.z + (b.z - a.z) * u0;
    bearingPos[i * 6 + 3] = a.x + (b.x - a.x) * u1; bearingPos[i * 6 + 4] = .9; bearingPos[i * 6 + 5] = a.z + (b.z - a.z) * u1;
  }
  bearingGeo.attributes.position.needsUpdate = true;
}

/* ----------------------------------------------------------- the shell */
const projectile = new T.Mesh(new T.CapsuleGeometry(.13, 1.3, 3, 8), new T.MeshBasicMaterial({ color: 0xe8be86 }));
projectile.visible = false;
scene.add(projectile);
const trailGlow = new T.SpriteMaterial({ map: puffTexture, color: 0xffcf8d, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .55 });
let trailTimer = 0;

function bezier(a, c, b, u) {
  const v = 1 - u, A = v * v, B = 2 * v * u, C = u * u;
  return new T.Vector3(a.x * A + c.x * B + b.x * C, a.y * A + c.y * B + b.y * C, a.z * A + c.z * B + b.z * C);
}
function tangent(a, c, b, u) {
  return new T.Vector3(
    2 * (1 - u) * (c.x - a.x) + 2 * u * (b.x - c.x),
    2 * (1 - u) * (c.y - a.y) + 2 * u * (b.y - c.y),
    2 * (1 - u) * (c.z - a.z) + 2 * u * (b.z - c.z)
  ).normalize();
}

function muzzlePoint(target) {
  player.updateMatrixWorld(true);
  const turrets = player.userData.turrets || [];
  if (turrets.length) {
    const p = new T.Vector3();
    turrets[0].getWorldPosition(p);
    const flat = target.clone().sub(p); flat.y = 0; flat.normalize();
    p.addScaledVector(flat, 2.4); p.y += .7;
    if (p.distanceTo(player.position) < 20 && p.y > 0) return p;
  }
  return player.position.clone().add(new T.Vector3(0, 3.2, -8));
}

/* --------------------------------------------------------------- caption */
const cellName = i => String.fromCharCode(65 + Math.floor(i / 10)) + (i % 10 + 1);
function caption(text, tone) {
  const n = $('cineNotice');
  if (n) n.textContent = text;
  document.body.dataset.shot = tone || '';
  if ($('log')) $('log').textContent = text;
}

/* ------------------------------------------------------------ timeline */
const T_AIM = 1.05, T_FIRE = 1.3, T_HIT = 3.55, T_END = 5.0;
let lastFrame = 0;

function fire(i, hit, sunk) {
  return new Promise(resolve => {
    if (shot) window.ironTide.skip();
    if (!cinematic || !host) { resolve(); return }
    player.updateMatrixWorld(true);
    const target = pos(i); target.y = 1.1;
    const start = muzzlePoint(target);
    const dist = start.distanceTo(target);
    const ctrl = start.clone().lerp(target, .5);
    ctrl.y = Math.max(start.y, target.y) + dist * .33;
    const dir = target.clone().sub(start).normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    finish = resolve;
    shot = { i, hit, sunk, target, start, ctrl, dir, yaw, t: 0, impacted: false, fired: false };
    reticle.position.copy(target); reticle.position.y = 1;
    reticle.visible = true; retPulse.material.opacity = 0;
    bearingLine.visible = true; layBearing(start, target);
    caption(cellName(i) + ' · firing', 'fire');
    projectile.visible = false;
    trailTimer = 0;
  });
}

function impact(s) {
  if (s.impacted) return;
  s.impacted = true;
  projectile.visible = false;
  reticle.visible = false;
  bearingLine.visible = false;
  if (s.hit) explode(s.target); else splash(s.target);
  ring(s.target, s.hit ? 0xffc07a : 0xd6f2f8, 3, 30, 1.2);
  const mark = new T.Mesh(new T.RingGeometry(1.2, 1.7, 32), new T.MeshBasicMaterial({ color: s.hit ? 0xf18a52 : 0xd4eff7, transparent: true, opacity: .75, side: T.DoubleSide, depthWrite: false }));
  mark.rotation.x = -Math.PI / 2;
  mark.position.copy(s.target); mark.position.y = 1;
  marks.add(mark);
  sound(s.hit);
  if (s.sunk) {
    caption(cellName(s.i) + ' · ' + NAMES[s.sunk.index].toLowerCase() + ' sunk', 'sunk');
    const g = makeShip(s.sunk.cells.length * cell * .87);
    g.userData.shipType = TYPES[s.sunk.index];
    g.userData.length = s.sunk.cells.length * cell * .87;
    styleFallback(g, g.userData.shipType);
    applyModel(g);
    g.position.copy(pos(s.sunk.cells[0]).add(pos(s.sunk.cells.at(-1))).multiplyScalar(.5));
    g.position.y = 0;
    g.rotation.y = s.sunk.cells[1] - s.sunk.cells[0] === 1 ? Math.PI / 2 : 0;
    scene.add(g);
    g.userData.sinkStart = elapsed;
    ships.push({ model: g, sunk: true });
  } else if (s.hit) caption(cellName(s.i) + ' · hit', 'hit');
  else caption(cellName(s.i) + ' · miss', 'miss');
}

function finishShot() {
  shot = null;
  projectile.visible = false;
  reticle.visible = false;
  bearingLine.visible = false;
  if (finish) { finish(); finish = null }
}

function skip() {
  if (shot) { impact(shot); shot.impacted = true; }
  projectile.visible = false;
  reticle.visible = false;
  bearingLine.visible = false;
  if (shot) shot = null;
  if (finish) { finish(); finish = null }
  document.body.dataset.shot = '';
}

function setup() {
  marks.clear();
  projectile.visible = false;
  reticle.visible = false;
  bearingLine.visible = false;
  camera.position.copy(baseCam);
  camPos.copy(baseCam); look.copy(baseLook); camera.up.copy(UP);
  camera.fov = 44; camera.updateProjectionMatrix();
  if (shot) { shot = null; if (finish) { finish(); finish = null } }
  busy = false;
}

/* --------------------------------------------------------------- sound */
function sound(hit, kind) {
  if (!soundOn) return;
  const key = kind || (hit ? 'hit' : 'miss');
  const url = audioUrls[key];
  if (url) { const a = new Audio(url); a.volume = key === 'fire' ? .7 : .8; a.play().catch(() => synthSound(hit)); return }
  synthSound(hit);
}
function synthSound(hit) {
  if (!soundOn) return;
  try {
    ac ??= new AudioContext();
    let n = ac.createBuffer(1, ac.sampleRate * .7, ac.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * .12));
    let src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = n; f.type = 'lowpass'; f.frequency.value = hit ? 700 : 300; g.gain.value = .5;
    src.connect(f).connect(g).connect(ac.destination); src.start()
  } catch { }
}

/* ----------------------------------------------------------------- loop */
function update(now = 0) {
  requestAnimationFrame(update);
  if (document.hidden || now - lastFrame < 29) return;
  lastFrame = now;
  const dt = Math.min(clock.getDelta(), .1);
  elapsed += dt;
  sea.material.uniforms.time.value = elapsed;
  updateFx(dt);

  player.position.y = .23 * Math.sin(elapsed * 1.5);
  player.rotation.z = .025 * Math.sin(elapsed * .9);
  for (const g of ownModels) {
    g.position.y = .22 * Math.sin(elapsed * 1.35 + g.position.x * .12);
    g.rotation.z = .028 * Math.sin(elapsed * .85 + g.position.z * .04);
  }
  for (const s of ships) {
    if (!s.sunk) continue;
    const t = elapsed - s.model.userData.sinkStart;
    s.model.position.y = -Math.min(15, t * 1.1);
    s.model.rotation.z = Math.min(.6, t * .05);
    if (t < 14 && Math.random() < .28) puff(s.model.position.clone().add(new T.Vector3((Math.random() - .5) * 8, 3 + Math.random() * 5, (Math.random() - .5) * 8)), { color: 0x2b3338, size: 4, life: 2.4, rise: 5 + Math.random() * 4, gravity: -.4, grow: 2.6, opacity: .4 });
    if (t > 20) s.model.visible = false;
  }

  let desired = baseCam.clone(), focus = baseLook.clone(), lambda = 3.4, fovGoal = 44, bank = 0;
  if (shot) {
    const s = shot; s.t += dt; const t = s.t;
    for (const turret of (player.userData.turrets || [])) {
      turret.rotation.y = turn(turret.rotation.y, s.yaw, 1 - Math.exp(-dt * 5.5));
      if (turret.userData.barrels) for (const b of turret.userData.barrels) b.rotation.x = damp(b.rotation.x, Math.PI / 2 - .2, 4, dt);
    }

    if (t < T_FIRE) {
      /* --- guns train, camera on the ship --------------------------------- */
      const k = smooth(clamp(t / T_AIM, 0, 1));
      // Narrow portrait screens see a much thinner slice of the world, so pull back.
      const fit = clamp(1.45 / camera.aspect, 1, 2);
      const lift = 1 + (fit - 1) * .5;
      desired.copy(player.position).add(new T.Vector3(29 * fit, 14 * lift, 25 * fit).lerp(new T.Vector3(21 * fit, 9 * lift, 15 * fit), k));
      focus.copy(player.position).add(new T.Vector3(0, 5, -8)).lerp(s.target, .18 * k);
      lambda = 5.5; fovGoal = 42;
      reticle.visible = true;
      const pulse = .5 + .5 * Math.sin(elapsed * 6);
      retPulse.material.opacity = .18 + pulse * .35;
      retPulse.scale.setScalar(1 + pulse * .25);
    } else if (t < T_HIT) {
      /* --- chase cam behind the shell ------------------------------------- */
      const u = clamp((t - T_FIRE) / (T_HIT - T_FIRE), 0, 1);
      if (!s.fired) {
        s.fired = true;
        muzzleFlash(s.start);
        sound(false, 'fire');
        for (const turret of (player.userData.turrets || [])) {
          if (turret.userData.restZ != null) turret.position.z = turret.userData.restZ + 1.1;
        }
      }
      const p = bezier(s.start, s.ctrl, s.target, u);
      const tan = tangent(s.start, s.ctrl, s.target, u);
      projectile.visible = true;
      projectile.position.copy(p);
      projectile.quaternion.setFromUnitVectors(UP, tan);
      const side = new T.Vector3().crossVectors(tan, UP).normalize();

      trailTimer += dt;
      if (trailTimer > .028) {
        trailTimer = 0;
        const sprite = new T.Sprite(trailGlow.clone());
        sprite.position.copy(p);
        scene.add(sprite);
        flashes.push({ sprite, t: 0, life: .26, size: 1.05, alpha: .5 });
        if (Math.random() < .5) puff(p, { color: 0xd9d6c4, size: .8, life: .55, rise: 0, spread: .5, gravity: 1, grow: 2.2, opacity: .3 });
      }

      desired.copy(p).addScaledVector(tan, -8 * clamp(1.3 / camera.aspect, 1, 1.5)).addScaledVector(UP, 6 - u * 2.5).addScaledVector(side, 1.4);
      focus.copy(p).lerp(s.target, .42 + u * .25);
      lambda = 9; fovGoal = 55; bank = .1;
      reticle.visible = false;
    } else if (t < T_END) {
      /* --- reveal: orbit the impact point -------------------------------- */
      if (!s.impacted) impact(s);
      const k = clamp((t - T_HIT) / (T_END - T_HIT), 0, 1);
      const a = .55 + k * 1.35;
      const orbit = (44 - k * 10) * clamp(1.3 / camera.aspect, 1, 1.6);
      desired.copy(s.target).add(new T.Vector3(Math.cos(a) * orbit, 22 + Math.sin(k * Math.PI) * 6, Math.sin(a) * orbit));
      focus.copy(s.target).add(new T.Vector3(0, s.hit ? 3.5 : 1.5, 0));
      lambda = 3.2; fovGoal = 50;
      if (s.hit && Math.random() < .5) puff(s.target.clone().add(new T.Vector3((Math.random() - .5) * 6, 1, (Math.random() - .5) * 6)), { color: 0x3a4046, size: 3, life: 2.2, rise: 3 + Math.random() * 4, gravity: -.8, grow: 2.4, opacity: .35 });
    } else {
      finishShot();
    }
  }

  for (const turret of (player.userData.turrets || [])) {
    if (turret.userData.restZ != null) turret.position.z = damp(turret.position.z, turret.userData.restZ, 6, dt);
  }
  camera.fov = damp(camera.fov, fovGoal, 3.5, dt);
  camera.updateProjectionMatrix();
  camPos.lerp(desired, 1 - Math.exp(-dt * lambda));
  look.lerp(focus, 1 - Math.exp(-dt * (lambda + .8)));
  camera.position.copy(camPos);
  if (shake > .002) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake * .7;
    camera.position.z += (Math.random() - .5) * shake;
  }
  camera.up.copy(UP);
  if (bank) camera.up.set(-bank, 1, 0).normalize();
  camera.lookAt(look);
  renderer.render(scene, camera);
}

/* --------------------------------------------------------------- assets */
const assets = new Map(), loaded = new Set(), errors = new Set(), localTypes = new Set();
const audioUrls = {};
const remoteAudio = { fire: asset('fire.ogg'), hit: asset('hit.ogg'), miss: asset('miss.ogg') };

function assetStatus() {
  if ($('assetbadge')) $('assetbadge').textContent = loaded.size ? `${loaded.size} asset groups ready` : 'Built-in fleet / fallback assets';
  if ($('assetstate')) $('assetstate').textContent = `Ready: ${[...loaded].join(', ') || 'built-in graphics'}. ${errors.size ? 'Unavailable: ' + [...errors].join(', ') + '. Fallbacks active.' : ''}`;
}
function ok(k) { errors.delete(k); loaded.add(k); assetStatus() }
function fail(k) { if (!loaded.has(k)) errors.add(k); assetStatus() }

function styleFallback(g, type) {
  const len = g.userData.length;
  if (type === 'carrier') {
    for (const turret of g.userData.turrets) turret.visible = false;
    box(g, dark, 0, 2.5, 0, len * .24, .5, len * .95);
    box(g, cream, 0, 2.77, 0, .10, .04, len * .78);
    box(g, steel, len * .09, 3.4, -len * .07, len * .045, 1.5, len * .20);
    for (let i = 0; i < 7; i++) box(g, cream, -len * .075, 2.8, -len * .35 + i * len * .10, .12, .035, len * .025);
  } else if (type === 'submarine') {
    g.clear();
    const hull = new T.Mesh(new T.CapsuleGeometry(len * .075, len * .83, 5, 16), dark);
    hull.rotation.x = Math.PI / 2; hull.position.y = -.55; g.add(hull);
    box(g, steel, 0, len * .065, -len * .10, len * .075, len * .12, len * .17);
    cyl(g, steel, 0, len * .14, -len * .10, .055, .055, len * .14);
    g.userData.turrets = [];
  }
}

// The fleet models ship untextured white; pull them down to painted naval grey.
function paintModel(g) {
  g.traverse(o => {
    if (!o.isMesh || !o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m.color) continue;
      const hsl = { h: 0, s: 0, l: 0 };
      m.color.getHSL(hsl);
      if (hsl.s > .3) m.color.multiplyScalar(.8);
      else if (hsl.l < .25) m.color.setHex(0x39434a);
      else m.color.setHex(0x8d979b);
      if ('metalness' in m) { m.metalness = .08; m.roughness = .82 }
      m.envMapIntensity = .15;
    }
  });
}

function applyModel(g) {
  const a = assets.get(g.userData.shipType);
  if (!a) return;
  const obj = a.scene.clone(true);
  obj.rotation.y = a.angle;
  const wrapper = new T.Group(); wrapper.add(obj); wrapper.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(wrapper), size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  if (!Number.isFinite(size.z) || size.z < .001) return;
  if (size.x > size.z * 1.4) {
    obj.rotation.y += Math.PI / 2; wrapper.updateMatrixWorld(true);
    bounds.setFromObject(wrapper); bounds.getSize(size); bounds.getCenter(center);
  }
  const scale = g.userData.length / size.z;
  wrapper.scale.setScalar(scale);
  wrapper.position.set(-center.x * scale, a.zero ? 0 : -(bounds.min.y + size.y * .20) * scale, -center.z * scale);
  const turrets = [];
  wrapper.traverse(o => { if (/^(turret|main_gun)[_ -]?\d+$/i.test(o.name)) turrets.push(o) });
  g.clear();
  g.add(wrapper);
  paintModel(g);
  g.userData.turrets = turrets;
  g.userData.assetApplied = true;
}

function applyAll(type) {
  if (player.userData.shipType === type) applyModel(player);
  for (const s of ships) if (s.model.userData.shipType === type) applyModel(s.model);
  for (const g of ownModels) if (g.userData.shipType === type) applyModel(g);
}

let loaderPromise;
function getLoader() { return loaderPromise ??= import('./GLTFLoader.mjs').then(m => new m.GLTFLoader()) }

async function remoteModel(type, url, angle = Math.PI / 2) {
  try {
    const loader = await getLoader();
    const res = await fetch(url, { signal: AbortSignal.timeout(16000) });
    if (!res.ok) throw Error(res.status);
    const gltf = await loader.parseAsync(await res.arrayBuffer(), '');
    if (localTypes.has(type)) return;
    assets.set(type, { scene: gltf.scene, angle, zero: false });
    applyAll(type);
    ok(type);
  } catch (e) {
    if (!localTypes.has(type)) { console.warn('Fleet model failed', type, e); fail(type) }
  }
}

$('assetopen')?.addEventListener('click', () => { if ($('assets')) $('assets').hidden = false });
$('assetclose')?.addEventListener('click', () => { if ($('assets')) $('assets').hidden = true });
if ($('shipfile')) $('shipfile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const type = $('shiptype').value, bow = $('bow').value, zero = $('waterline').value === 'zero';
  try {
    const gltf = await (await getLoader()).parseAsync(await file.arrayBuffer(), '');
    localTypes.add(type);
    assets.set(type, { scene: gltf.scene, angle: ({ x: Math.PI / 2, z: Math.PI, '-z': 0, '-x': -Math.PI / 2 })[bow], zero });
    applyAll(type); ok(type);
  } catch (err) { if ($('assetstate')) $('assetstate').textContent = 'Could not import ' + file.name + ': ' + err.message }
  e.target.value = ''
};

async function loadSky() {
  try {
    const { RGBELoader } = await import('./RGBELoader.mjs');
    const response = await fetch(asset('sky.hdr'), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(response.status);
    const t = new RGBELoader().parse(await response.arrayBuffer());
    const tex = new T.DataTexture(t.data, t.width, t.height, T.RGBAFormat, t.type);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.LinearSRGBColorSpace;
    tex.needsUpdate = true;
    scene.environment = tex;
    ok('HDR sky');
  } catch (e) { fail('HDR sky') }
}
function loadAtlas() {
  new T.TextureLoader().load(asset('atlas.png'), t => { t.colorSpace = T.SRGBColorSpace; atlasTexture = t; ok('explosion atlas') }, undefined, () => fail('explosion atlas'))
}
for (const [key, url] of Object.entries(remoteAudio)) {
  const probe = new Audio();
  probe.preload = 'auto';
  probe.oncanplay = () => { audioUrls[key] = url; ok('audio ' + key); probe.oncanplay = null };
  probe.onerror = () => fail('audio ' + key);
  probe.src = url;
}

/* ------------------------------------------------------------ board hooks */
const buttons = [];
function hitAt(i) { return occupied.has(i) }

$('reset')?.addEventListener('click', () => { projectile.visible = false; setup() });
if ($('skip')) $('skip').onclick = () => { cinematic = !cinematic; $('skip').textContent = 'Cinematics: ' + (cinematic ? 'on' : 'off') };
if ($('sound')) $('sound').onclick = () => {
  soundOn = !soundOn; $('sound').textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
  if (soundOn) { try { ac ??= new AudioContext(); ac.resume() } catch { } }
};
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setup();
update();
assetStatus();
loadSky();
loadAtlas();
remoteModel('carrier', asset('carrier.glb'));
remoteModel('submarine', asset('submarine.glb'));
remoteModel('destroyer', asset('destroyer.glb'));
remoteModel('battleship', asset('battleship.glb'), 0);
remoteModel('cruiser', asset('cruiser.glb'), Math.PI / 2);

window.ironTide = {
  setFleet,
  clear() {
    setup();
    for (const s of ships) scene.remove(s.model);
    ships = [];
    document.body.dataset.shot = '';
  },
  skip,
  sound(v) {
    soundOn = v;
    if (v) { try { ac ??= new AudioContext(); ac.resume() } catch { } }
  },
  fire,
  aim(i) {
    const target = pos(i); reticle.position.copy(target); reticle.visible = true;
    bearingLine.visible = true; layBearing(player.position, target);
  },
  status() {
    return { loaded: [...loaded], errors: [...errors], player: !!player.userData.assetApplied, own: ownModels.map(x => !!x.userData.assetApplied) };
  }
};
window.dispatchEvent(new Event('iron-tide-ready'));
