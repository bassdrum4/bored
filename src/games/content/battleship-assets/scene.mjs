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
const flashEl = $('cineFlash');
const scene = new T.Scene();
scene.background = new T.Color(0x92a0a2);
scene.fog = new T.FogExp2(0x92a0a2, .0031);
const camera = new T.PerspectiveCamera(44, innerWidth / innerHeight, .1, 1800);
const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
// The scene is a backdrop for a DOM board. Shots render at full scale; while the board
// is in charge it renders smaller and slower so hover and clicks stay ahead of the waves.
const maxRatio = Math.min(devicePixelRatio || 1, 1.6), restRatio = Math.min(devicePixelRatio || 1, 1.25);
let pixelRatio = maxRatio;
function setRatio(r) {
  if (Math.abs(r - pixelRatio) < .01) return;
  pixelRatio = r;
  renderer.setPixelRatio(r);
  renderer.setSize(innerWidth, innerHeight);
}
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
host.appendChild(renderer.domElement);
$('error')?.remove();

// Late sun off the port bow: a warm key raking across the water, cool sky fill, and a
// glitter path running out to the horizon behind the enemy grid.
const sun = new T.DirectionalLight(0xffbe78, 2.4);
sun.position.set(-104, 40, -166);
const fill = new T.DirectionalLight(0x9fc2d6, .62);
fill.position.set(70, 34, 95);
scene.add(sun, fill, new T.HemisphereLight(0xb9d2df, 0x1a2b34, 1.0));

const sky = new T.Mesh(new T.SphereGeometry(700, 32, 20), new T.ShaderMaterial({
  side: T.BackSide, depthWrite: false, uniforms: { time: { value: 0 } },
  vertexShader: `varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `
uniform float time;varying vec3 p;
void main(){
  vec3 d=normalize(p);
  float h=max(d.y,0.);
  // Deep steel overhead falling to warm dust at the waterline.
  vec3 c=mix(vec3(.58,.52,.46),vec3(.08,.17,.25),pow(h,.42));
  vec3 sd=normalize(vec3(-.52,.20,-.83));
  float s=max(dot(d,sd),0.);
  c+=vec3(1.,.55,.22)*pow(s,6.)*.34;
  c+=vec3(1.,.84,.56)*pow(s,60.)*1.1;
  c+=vec3(1.,.96,.84)*pow(s,4000.)*2.4;
  // Cloud banks drifting east, lit from underneath by the low sun.
  vec2 uv=d.xz/(h+.17);
  float cl=sin(uv.x*2.1+sin(uv.y*1.5+time*.06)*1.3+time*.04)*cos(uv.y*1.8-time*.03);
  cl+=.5*sin(uv.x*5.3-uv.y*2.9+time*.05)+.2*cos(uv.y*11.+uv.x*4.);
  float band=smoothstep(.3,1.,cl)*smoothstep(.015,.19,h);
  band*=1.-smoothstep(.72,1.,h)*.55;
  vec3 cloud=mix(vec3(.30,.32,.34),vec3(.98,.86,.72),smoothstep(.1,.75,s));
  c=mix(c,cloud,band*.55);
  gl_FragColor=vec4(c,1.);
}`
}));
scene.add(sky);

const sea = new T.Mesh(new T.PlaneGeometry(1600, 1600, 220, 220), new T.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: `uniform float time;varying vec3 w;void main(){vec3 p=position;p.z=.45*sin(p.x*.18+time*1.2)+.24*cos(p.y*.32-time*.9)+.06*sin((p.x+p.y)*.7+time);w=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`, fragmentShader: `
uniform float time;varying vec3 w;
void main(){
  float d=length(cameraPosition.xz-w.xz);
  float near=1.-smoothstep(30.,300.,d);
  float a=sin(w.x*.18+time*1.2), b=cos(w.z*.32-time*.9), c0=sin((w.x-w.z)*.7+time);
  float s1=sin(dot(w.xz,vec2(1.7,-1.1))+time*1.7);
  float s2=sin(dot(w.xz,vec2(-3.3,2.6))-time*2.3);
  float s3=sin(dot(w.xz,vec2(2.9,3.4))+time*2.1);
  float s4=sin(dot(w.xz,vec2(-5.2,-4.1))-time*3.1);
  // Chop only where it can be seen; the far sea stays glassy so the glitter path reads.
  vec3 n=normalize(vec3(-.081*cos(w.x*.18+time*1.2)-.045*c0-.028*s1*near-.014*s2*near-.009*s4*near,1.,.077*sin(w.z*.32+time*.9)+.045*c0+.026*s3*near+.013*s4*near));
  vec3 v=normalize(cameraPosition-w);
  vec3 sd=normalize(vec3(-.52,.20,-.83));
  vec3 hv=normalize(sd+v);
  float fres=pow(1.-max(dot(n,v),0.),3.);
  float glint=pow(max(dot(n,hv),0.),150.);
  float sheen=pow(max(dot(n,hv),0.),12.);
  // Sea stays sea: cool reflection everywhere, warm light only in the sun path.
  vec3 c=mix(vec3(.016,.09,.115),mix(vec3(.26,.36,.40),vec3(.38,.38,.36),smoothstep(40.,340.,d)),fres*.9);
  // Twinkle the path so it breaks into points of light instead of one flat sheen.
  float tw=.72+.28*sin(w.x*.42+time*1.3)*sin(w.z*.37-time*1.1);
  // A long road of light laid toward the sun, the way low sunlight sits on a swell.
  float path=pow(max(dot(normalize(cameraPosition.xz-w.xz),normalize(-sd.xz)),0.),26.);
  float reach=smoothstep(12.,240.,d);
  c+=vec3(1.,.76,.48)*(glint*1.5*tw+sheen*.06+path*reach*(.045+.1*tw));
  c+=smoothstep(.96,1.,a*.65+b*.35)*.07;
  // Cloud shadows drift across the swell.
  c*=1.-smoothstep(.1,.9,sin(w.x*.012+time*.05)*cos(w.z*.014-time*.04))*.1;
  c=mix(c,vec3(.38,.44,.46),clamp((1.-exp(-d*.0032))*.38+smoothstep(90.,380.,d)*.34,0.,.72));
  gl_FragColor=vec4(c,1.);
}` }));
sea.rotation.x = -Math.PI / 2;
scene.add(sea);
// Flat ocean out to the horizon so the detailed swell never ends inside the frame.
const farSea = new T.Mesh(new T.PlaneGeometry(9000, 9000), new T.MeshBasicMaterial({ color: 0x2b4e58 }));
farSea.rotation.x = -Math.PI / 2;
farSea.position.y = -1.25;
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

// The enemy battery sits beyond its grid; it only appears when it fires back.
const battery = makeShip(30);
battery.userData.shipType = 'battleship';
battery.userData.length = 30;
battery.position.set(13, 0, -104);
battery.rotation.y = Math.PI;
battery.visible = false;
scene.add(battery);

const grid = new T.Group(); scene.add(grid);
const cell = 6.5, originX = -29.25, originZ = -65;
const gridVerts = [];
for (let i = 0; i <= 10; i++) {
  let x = originX - cell / 2 + i * cell, z = originZ - cell / 2 + i * cell;
  gridVerts.push(x, .8, originZ - cell / 2, x, .8, originZ + cell * 9.5, originX - cell / 2, .8, z, originX + cell * 9.5, .8, z)
}
// The grid is painted on the water: every frame each vertex takes the swell's height at its own x/z.
const gridPos = new Float32Array(gridVerts);
const gridGeo = new T.BufferGeometry();
gridGeo.setAttribute('position', new T.Float32BufferAttribute(gridPos, 3));
const gridLines = new T.LineSegments(gridGeo, new T.LineBasicMaterial({ color: 0xc4e3da, transparent: true, opacity: .26 }));
grid.add(gridLines);
const marks = new T.Group(); grid.add(marks);

const UP = new T.Vector3(0, 1, 0);
const baseCam = new T.Vector3(91, 89, 119), baseLook = new T.Vector3(0, 0, -26);
camera.position.copy(baseCam);
camera.lookAt(baseLook);
const camPos = baseCam.clone(), look = baseLook.clone();

let ships = [], occupied = new Map(), busy = false, cinematic = true, soundOn = false, shot = null, finish = null;
let ownModels = [], ownKey = '', clock = new T.Clock(), elapsed = 0, ac = null, shake = 0;
// slow: the world clock during an impact. whip / fovKick / blowout are the camera and flash impulses.
let slow = 1, fovKick = 0, whip = 0, blowout = 0, cineMode = 'full', lastFlash = -1;
let turnAim = false, aimYaw = null, aimRoom = false, holdPose = null;
const aimPos = new T.Vector3(), aimFocus = new T.Vector3();
const particles = [], billows = [], rings = [], flashes = [], scorches = [], burns = [];
const burnPulse = { at: 0, index: 0 };
// Delayed beats inside a shot (a plume that keeps building, a wave that keeps running).
const later = [];
function after(sec, fn) { later.push({ at: elapsed + sec, fn }) }

function pos(i) { return new T.Vector3(originX + (i % 10) * cell, .7, originZ + Math.floor(i / 10) * cell) }

// My own fleet sits on its own grid, nearer the camera. Same swell runs under both.
const OWN_Z = 83;
function ownPos(i) { return new T.Vector3(originX + (i % 10) * cell, 0, OWN_Z + Math.floor(i / 10) * cell) }

/* ------------------------------------------------------------ your turn */
// While it is your turn the board owns the lower screen, so the camera settles into the
// strip above it: low off the port quarter, looking down the line of fire, guns out.
// The framing is derived from the space the board actually leaves, so it holds at any size.
function aimFraming() {
  const cmd = document.querySelector('main .command');
  const raw = cmd ? cmd.getBoundingClientRect().top : innerHeight * .3;
  // On a phone, or a laptop that has no strip left above the board, stay wide.
  aimRoom = raw >= 120;
  if (!aimRoom) return;
  const band = clamp(raw, innerHeight * .18, innerHeight * .62);
  const tanH = Math.tan(camera.fov * Math.PI / 360);
  // Low off the port quarter, close enough that the hull and guns read at this size.
  // Narrow screens see less sideways, so back off until the hull still fits, but never
  // past the own fleet's grid (z 83) or its ships sail into the shot.
  const dist = clamp(20.4 * innerHeight / band * clamp(1.5 / camera.aspect, 1, 1.9), 40, 80);
  const az = 57 * Math.PI / 180, el = 13 * Math.PI / 180;
  aimPos.set(
    player.position.x - Math.sin(az) * Math.cos(el) * dist,
    Math.sin(el) * dist,
    player.position.z + Math.cos(az) * Math.cos(el) * dist
  );
  const row = clamp(band * .28, innerHeight * .06, innerHeight * .45);
  const dx = player.position.x - aimPos.x, dz = player.position.z - aimPos.z;
  const elev = Math.atan2(8.6 - aimPos.y, Math.hypot(dx, dz));
  const pitch = elev - Math.atan(((innerHeight / 2 - row) / (innerHeight / 2)) * tanH);
  // Aim a touch left of the hull so the ship sits right of centre with its target water beside it.
  const bearing = Math.atan2(dx, -dz) - .07;
  aimFocus.set(aimPos.x + Math.sin(bearing) * 200, aimPos.y + Math.tan(pitch) * 200, aimPos.z - Math.cos(bearing) * 200);
}
const waveAt = (x, z) => .45 * Math.sin(x * .18 + elapsed * 1.2) + .24 * Math.cos(z * .32 + elapsed * .9) + .12 * Math.sin((x - z) * .7 + elapsed);
function floatShip(g, amp = 1) {
  g.position.y = waveAt(g.position.x, g.position.z) * amp;
  return g.position.y;
}

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
    g.position.set(((cells[0] % 10 + cells.at(-1) % 10) / 2 - 4.5) * cell, 0, OWN_Z + (Math.floor(cells[0] / 10) + Math.floor(cells.at(-1) / 10)) / 2 * cell);
    g.rotation.y = cells[1] - cells[0] === 1 ? Math.PI / 2 : 0;
    g.userData.cells = cells.slice();
    scene.add(g);
    ownModels.push(g);
  });
}

const TYPES = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'];
// Waterline per class, as a fraction of the model's total height (masts included).
const DRAFT = { carrier: .105, battleship: .075, cruiser: .13, submarine: .18, destroyer: .125 };
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

const flashLight = new T.PointLight(0xffa45c, 0, 150, 2);
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
    gravity: opts.gravity ?? (opts.hit ? 1 : 9), base: opts.size ?? 2, grow: opts.grow ?? 1.8,
    sx: opts.sx ?? 1, sy: opts.sy ?? 1
  });
}

function sparks(at, amount = 70, hot = true, speed = 1) {
  for (let i = 0; i < amount; i++) {
    const color = hot ? (i % 3 === 0 ? 0xffd27b : i % 3 === 1 ? 0xe66c31 : 0x4c545a) : (i % 3 ? 0xc7e8ee : 0xffffff);
    const m = new T.Mesh(particleGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: .95 }));
    m.position.copy(at);
    m.scale.setScalar(.08 + Math.random() * .2);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, r = Math.random() * (hot ? 10 : 5) * speed;
    particles.push({ mesh: m, v: new T.Vector3(Math.cos(a) * r, 3 + Math.random() * (hot ? 12 : 22) * speed, Math.sin(a) * r), life: 1.2 + Math.random() * 1.4, max: 2.6, gravity: hot ? 7 : 16 });
  }
}

function ring(at, color = 0xffa962, from = 2, to = 16, life = .9, y = .9, opacity = .85) {
  const material = new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false });
  const mesh = new T.Mesh(new T.RingGeometry(.94, 1, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(at); mesh.position.y = y;
  scene.add(mesh);
  rings.push({ mesh, t: 0, life, from, to, opacity });
}

// The hit is layered like a real one: a white-hot core, a rolling orange fireball,
// embers that cool as they fall, then a plume that keeps climbing after the flash is gone.
function fireball(at) {
  const tones = [0xfff6dc, 0xffb45e, 0xd3601f];
  for (let i = 0; i < 3; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: puffTexture, color: tones[i], transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .95 }));
    s.position.copy(at).add(new T.Vector3(0, .5 + i * .7, 0));
    s.scale.setScalar(3 + i * 2.4);
    scene.add(s);
    flashes.push({ sprite: s, t: 0, life: .22 + i * .16, size: 8 + i * 6, alpha: [1, .8, .5][i], grow: 1.7 });
  }
}
function embers(at, amount = 28) {
  for (let i = 0; i < amount; i++) {
    const m = new T.Sprite(new T.SpriteMaterial({ map: puffTexture, color: i % 3 ? 0xffb066 : 0xffd9a0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .9 }));
    m.position.copy(at).add(new T.Vector3((Math.random() - .5) * 5, Math.random() * 3, (Math.random() - .5) * 5));
    m.scale.setScalar(.3 + Math.random() * .5);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 13;
    particles.push({ mesh: m, v: new T.Vector3(Math.cos(a) * r, 8 + Math.random() * 16, Math.sin(a) * r), life: 1.5 + Math.random() * 1.6, max: 3.1, gravity: -1.4 });
  }
}
// A pale disc left on the surface after a near miss, spreading and thinning out.
function foam(at, size = 8, life = 2.6) {
  const m = new T.Mesh(new T.CircleGeometry(1, 28), new T.MeshBasicMaterial({ color: 0xd8edf0, transparent: true, opacity: .22, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(at).setY(.92);
  scene.add(m);
  rings.push({ mesh: m, t: 0, life, from: size * .45, to: size, opacity: .22 });
}
// A fire that outlives the shot, so a burning hit reads from the board too.
function fireGlow(at) {
  const s = new T.Sprite(new T.SpriteMaterial({ map: puffTexture, color: 0xff9848, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .4 }));
  s.position.copy(at);
  s.scale.setScalar(2.6);
  scene.add(s);
  return s;
}

function explode(at) {
  sparks(at, 70, true);
  embers(at, 30);
  debris(at, 10);
  fireball(at);
  after(.03, () => waterColumn(at.clone().setY(.3), 1.25));
  for (let j = 0; j < 16; j++) puff(at, { atlas: atlasTexture && j < 8, frame: j, color: j < 8 ? 0xffac55 : 0x4a5359, hit: true, additive: j < 8, size: j < 8 ? 4 : 3, life: 1.5 + j * .16, rise: 3 + Math.random() * 5, gravity: 1.2, grow: 2.4 });
  flashLight.position.copy(at).setY(5);
  flashLight.intensity = 420;
  shake = .7;
  after(.16, () => {
    for (let j = 0; j < 9; j++) puff(at, { color: j < 3 ? 0x8f5a34 : 0x39434a, size: 3.4, life: 2.6 + Math.random() * 1.4, rise: 4 + Math.random() * 5, spread: 2.4, gravity: -.5, grow: 2.8, opacity: .34 });
  });
}

function splash(at) {
  sparks(at, 48, false, 1);
  for (let j = 0; j < 18; j++) puff(at, { color: j % 4 ? 0xdff2f7 : 0xffffff, additive: j % 2 === 0, size: 1.2, life: .85 + Math.random() * .55, rise: 15 + Math.random() * 12, spread: 1.8, gravity: 16, grow: .9, opacity: .5 });
  waterColumn(at, 1.2);
  foam(at, 11, 3);
  ring(at, 0xbfe4ec, 2, 16, .9);
  ring(at, 0xe8fbff, 1, 6, .45, 1.05);
  shake = .22;
}

// Debris: plates and frames thrown off the hull, spinning until they hit the water.
const debrisGeo = new T.BoxGeometry(1, 1, 1);
const debrisMats = [new T.MeshStandardMaterial({ color: 0x2a3236, metalness: .35, roughness: .85 }), new T.MeshStandardMaterial({ color: 0x707c7a, metalness: .2, roughness: .9 })];
function debris(at, amount = 10) {
  for (let i = 0; i < amount; i++) {
    const m = new T.Mesh(debrisGeo, debrisMats[i % 2]);
    m.position.copy(at).add(new T.Vector3((Math.random() - .5) * 3, Math.random() * 2, (Math.random() - .5) * 3));
    m.scale.set(.2 + Math.random() * .5, .07 + Math.random() * .14, .3 + Math.random() * .7);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 24;
    particles.push({
      mesh: m, shared: true, splash: true, life: 1.8 + Math.random() * 1.6, max: 3.4, gravity: 26,
      v: new T.Vector3(Math.cos(a) * r, 9 + Math.random() * 19, Math.sin(a) * r),
      spin: new T.Vector3((Math.random() - .5) * 14, (Math.random() - .5) * 14, (Math.random() - .5) * 14)
    });
  }
}

// A column of water thrown up by a near miss: stretched sprites that rise, spread and fall back.
function waterColumn(at, power = 1) {
  for (let j = 0; j < 12; j++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 3.6;
    puff(at.clone().add(new T.Vector3(Math.cos(a) * r, .2, Math.sin(a) * r)), {
      color: j % 4 ? 0xe4f6fa : 0xffffff, additive: j < 4, opacity: .46,
      size: (1.6 + Math.random() * 1.6) * power, life: 1.15 + Math.random() * .7,
      rise: 24 + Math.random() * 16, spread: 5, gravity: 22, grow: 1.7, sx: 1.5, sy: 4.2
    })
  }
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
    const spread = b.base * (.5 + u * b.grow); b.o.scale.set(spread * b.sx, spread * b.sy, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.v.y -= p.gravity * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    if (p.spin) { p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt }
    if (!p.shared) p.mesh.material.opacity = Math.max(0, p.life / p.max);
    if (p.splash && !p.wet && p.mesh.position.y < .2) {
      p.wet = true;
      puff(p.mesh.position.clone().setY(.5), { color: 0xdff2f7, size: .7, life: .45, rise: 3, spread: 2, gravity: 11, grow: 2, opacity: .3 });
    }
    if (p.life <= 0 || p.mesh.position.y < -.6) {
      scene.remove(p.mesh);
      if (!p.shared) p.mesh.material.dispose();
      particles.splice(i, 1)
    }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const u = clamp(r.t / r.life, 0, 1);
    r.mesh.scale.setScalar(r.from + (r.to - r.from) * u);
    r.mesh.material.opacity = (1 - u) * (r.opacity ?? .55);
    if (u >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); r.mesh.geometry.dispose(); rings.splice(i, 1) }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t += dt; const u = f.t / f.life;
    f.sprite.material.opacity = (1 - u) * (f.alpha ?? .9);
    f.sprite.scale.setScalar(f.size * (.4 + u * (f.grow ?? 1.6)));
    if (u >= 1) { scene.remove(f.sprite); f.sprite.material.dispose(); flashes.splice(i, 1) }
  }
  flashLight.intensity *= Math.exp(-dt * 4.5);
  shake *= Math.exp(-dt * 4.2);
}

function muzzleFlash(at) {
  // Two sprites: a white core and a wide orange bloom, both gone in a third of a second.
  for (let i = 0; i < 2; i++) {
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: puffTexture, color: i ? 0xffb15e : 0xfff3d0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: i ? .8 : 1 }));
    sprite.position.copy(at);
    sprite.scale.setScalar(i ? 6 : 2.4);
    scene.add(sprite);
    flashes.push({ sprite, t: 0, life: i ? .34 : .1, size: i ? 13 : 5, alpha: i ? .55 : 1, grow: i ? 1.5 : 2.2 });
  }
  for (let j = 0; j < 14; j++) puff(at, { color: j < 5 ? 0xffc070 : 0x8b9297, additive: j < 5, size: 2.2, life: .8 + Math.random() * 1.1, rise: 1 + Math.random() * 3.6, spread: 5, gravity: -.6, grow: 2.8, opacity: .5 });
  // The pressure of the report runs out across the water under the guns.
  ring(at.clone().setY(.9), 0xffc98a, 2, 36, .55);
  flashLight.position.copy(at).setY(at.y + 1);
  flashLight.intensity = 240;
  shake = Math.max(shake, .3);
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
// A real ogive: flat base, a copper driving band, a pointed cap.
const shellProfile = [[.001, -1], [.104, -1], [.138, -.95], [.146, -.87], [.146, -.3], [.142, .05], [.132, .32], [.115, .52], [.088, .70], [.052, .86], [.001, 1.0]]
  .map(([r, y]) => new T.Vector2(r, y));
const projectile = new T.Mesh(new T.LatheGeometry(shellProfile, 18), new T.MeshStandardMaterial({ color: 0x59645f, metalness: .75, roughness: .44, emissive: 0x160c05 }));
const shellBand = new T.Mesh(new T.CylinderGeometry(.156, .156, .1, 18), new T.MeshStandardMaterial({ color: 0x8a5a30, metalness: .8, roughness: .45 }));
shellBand.position.y = -.6;
const shellTracer = new T.Sprite(new T.SpriteMaterial({ map: puffTexture, color: 0xffbf7a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .5 }));
shellTracer.position.y = -.95;
shellTracer.scale.setScalar(.38);
projectile.add(shellBand, shellTracer);
projectile.scale.setScalar(1.15);
projectile.visible = false;
scene.add(projectile);
const trailGlow = new T.SpriteMaterial({ map: puffTexture, color: 0xffd7a2, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .26 });
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

function muzzleFrom(g, target) {
  g.updateMatrixWorld(true);
  const turrets = g.userData.turrets || [];
  if (turrets.length) {
    const p = new T.Vector3();
    turrets[0].getWorldPosition(p);
    const flat = target.clone().sub(p); flat.y = 0; flat.normalize();
    p.addScaledVector(flat, 2.6); p.y += .8;
    if (p.distanceTo(g.position) < (g.userData.length || 24) && p.y > 0) return p;
  }
  const fwd = new T.Vector3(0, 0, -1).applyQuaternion(g.quaternion); fwd.y = 0; fwd.normalize();
  return g.position.clone().addScaledVector(fwd, (g.userData.length || 24) * .3).add(new T.Vector3(0, 5.2, 0));
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
const T_AIM = 1.0, T_FIRE = 1.3, T_HIT = 3.5, T_END = 4.95;
let lastFrame = 0;

function startShot(kind, cell, hit, sunk) {
  return new Promise(resolve => {
    if (shot) window.ironTide.skip();
    if (!cinematic || cineMode === 'off' || !host) { resolve(); return }
    const gun = kind === 'in' ? battery : player;
    gun.updateMatrixWorld(true);
    const target = kind === 'in' ? ownPos(cell) : pos(cell);
    const deck = waveAt(target.x, target.z);
    target.y = deck + (kind === 'in' ? (hit ? 1.7 : .16) : .45);
    const start = muzzleFrom(gun, target);
    const dist = start.distanceTo(target);
    const ctrl = start.clone().lerp(target, .5);
    ctrl.y = Math.max(start.y, target.y) + dist * (kind === 'in' ? .26 : .33);
    const dir = target.clone().sub(start).normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    finish = resolve;
    slow = 1; blowout = 0; fovKick = 0; whip = 0;
    // Brief plays the same beats on a compressed clock; skip and the 9 s guard are untouched.
    // from: where the player left the camera, so the take opens on that exact frame.
    shot = { kind, cell, hit, sunk, gun, target, start, ctrl, dir, yaw, from: { p: camPos.clone(), l: look.clone() }, t: 0, impacted: false, fired: false, rate: (kind === 'in' ? 1.2 : 1) * (cineMode === 'brief' ? 2.15 : 1) };
    if (kind === 'in') { battery.visible = true; grid.visible = false }
    reticle.position.copy(target);
    holdPose = null;
    reticle.visible = kind === 'out'; retPulse.material.opacity = 0;
    bearingLine.visible = kind === 'out';
    if (kind === 'out') layBearing(start, target);
    caption(cellName(cell) + (kind === 'in' ? ' · incoming' : ' · firing'), 'fire');
    projectile.visible = false;
    trailTimer = 0;
  });
}
const fire = (i, hit, sunk) => startShot('out', i, hit, sunk);
const incoming = (i, hit, sunk) => startShot('in', i, hit, sunk);

function impact(s) {
  if (s.impacted) return;
  s.impacted = true;
  projectile.visible = false;
  reticle.visible = false;
  bearingLine.visible = false;
  // The hit lands hard: a frame of white, the world drops into slow motion, the lens punches.
  blowout = s.hit ? .55 : .22;
  slow = s.hit ? .34 : .5;
  fovKick = s.hit ? 6 : 3;
  whip *= .35;
  if (s.hit) explode(s.target); else splash(s.target);
  ring(s.target, s.hit ? 0xffc07a : 0xd6f2f8, s.kind === 'in' ? 2 : 3, s.kind === 'in' ? 18 : 30, 1.1);
  sound(s.hit ? 'hit' : 'miss');
  if (s.kind === 'in') {
    if (s.hit) {
      const sc = new T.Mesh(new T.CircleGeometry(1.5, 20), new T.MeshBasicMaterial({ color: 0x101619, transparent: true, opacity: .6, depthWrite: false }));
      sc.rotation.x = -Math.PI / 2;
      sc.position.copy(s.target).setY(s.target.y - .5);
      scene.add(sc); scorches.push(sc);
      burns.push({ at: s.target.clone().setY(1.4), fire: fireGlow(s.target.clone().setY(1.1)) });
    }
    if (s.sunk) {
      caption(cellName(s.cell) + ' · ' + NAMES[s.sunk.index].toLowerCase() + ' lost', 'sunk');
      const m = ownModels.find(g => g.userData.cells && g.userData.cells.includes(s.cell));
      if (m && m.userData.sinkStart == null) {
        m.userData.baseY = m.position.y;
        m.userData.sinkStart = elapsed;
        m.userData.sinkRoll = Math.random() < .5 ? -1 : 1;
      }
    } else caption(cellName(s.cell) + (s.hit ? ' · hit' : ' · miss'), s.hit ? 'hit' : 'miss');
    return;
  }
  const mark = new T.Mesh(new T.RingGeometry(1.2, 1.7, 32), new T.MeshBasicMaterial({ color: s.hit ? 0xf18a52 : 0xd4eff7, transparent: true, opacity: .75, side: T.DoubleSide, depthWrite: false }));
  mark.rotation.x = -Math.PI / 2;
  mark.position.copy(s.target); mark.position.y = 1;
  marks.add(mark);
  if (s.hit) burns.push({ at: s.target.clone().setY(.6), fire: fireGlow(s.target.clone().setY(.9)) });
  if (s.sunk) {
    caption(cellName(s.cell) + ' · ' + NAMES[s.sunk.index].toLowerCase() + ' sunk', 'sunk');
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
  } else if (s.hit) caption(cellName(s.cell) + ' · hit', 'hit');
  else caption(cellName(s.cell) + ' · miss', 'miss');
}

function finishShot() {
  // Park on the last frame so the pause after a hit keeps its smoke, not the overview.
  holdPose = { p: camPos.clone(), l: look.clone(), until: elapsed + 1.4 };
  shot = null;
  later.length = 0;
  slow = 1; fovKick = 0; whip = 0; blowout = 0;
  if (flashEl) flashEl.style.opacity = '0';
  projectile.visible = false;
  reticle.visible = false;
  bearingLine.visible = false;
  battery.visible = false;
  grid.visible = true;
  if (finish) { finish(); finish = null }
}

function skip() {
  if (shot) { impact(shot); shot.impacted = true; }
  projectile.visible = false;
  reticle.visible = false;
  bearingLine.visible = false;
  battery.visible = false;
  grid.visible = true;
  if (shot) shot = null;
  later.length = 0;
  slow = 1; fovKick = 0; whip = 0; blowout = 0;
  if (flashEl) flashEl.style.opacity = '0';
  if (finish) { finish(); finish = null }
  document.body.dataset.shot = '';
}

function setup() {
  marks.clear();
  for (const s of scorches) { scene.remove(s); s.geometry.dispose(); s.material.dispose() }
  scorches.length = 0;
  for (const b of burns) if (b.fire) { scene.remove(b.fire); b.fire.material.dispose() }
  burns.length = 0; burnPulse.index = 0; later.length = 0;
  slow = 1; fovKick = 0; whip = 0; blowout = 0;
  if (flashEl) flashEl.style.opacity = '0';
  projectile.visible = false;
  reticle.visible = false;
  bearingLine.visible = false;
  battery.visible = false;
  grid.visible = true;
  camera.position.copy(baseCam);
  camPos.copy(baseCam); look.copy(baseLook); camera.up.copy(UP);
  camera.fov = 44; camera.updateProjectionMatrix();
  if (shot) { shot = null; if (finish) { finish(); finish = null } }
  turnAim = false;
  busy = false;
}

/* --------------------------------------------------------------- sound */
// Four layers instead of one sample: a body thump, a filtered noise crack, a long
// low tail for the distance, and the recorded sample underneath when it loaded.
const kit = { master: null, noise: null };
function noiseBuffer(seconds = 2) {
  const n = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return n;
}
function ensureAudio() {
  ac ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  if (!kit.master) {
    kit.master = ac.createGain(); kit.master.gain.value = .85; kit.master.connect(ac.destination);
    kit.noise = noiseBuffer(2);
  }
  return kit.master;
}
// A bed of low surf under everything, so a shot has silence to break.
let amb = null;
function ambience() {
  if (!soundOn || amb) return;
  try {
    const out = ensureAudio();
    const src = ac.createBufferSource(); src.buffer = kit.noise; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 460; f.Q.value = .3;
    const g = ac.createGain(); g.gain.value = .0001;
    src.connect(f).connect(g).connect(out);
    src.start();
    g.gain.setTargetAtTime(.045, ac.currentTime, 2);
    const lfo = ac.createOscillator(); lfo.frequency.value = .06;
    const lg = ac.createGain(); lg.gain.value = 150;
    lfo.connect(lg).connect(f.frequency); lfo.start();
    amb = { g };
  } catch { }
}
function duckAmbience() {
  if (!amb) return;
  try {
    amb.g.gain.setTargetAtTime(.008, ac.currentTime, .12);
    amb.g.gain.setTargetAtTime(.045, ac.currentTime + 1.2, 2.4);
  } catch { }
}
function noiseLayer({ at = 0, dur = .5, type = 'lowpass', from = 1200, to = 200, q = .7, gain = .3, attack = .005 }) {
  if (!soundOn) return;
  try {
    const out = ensureAudio(), t0 = ac.currentTime + at;
    const src = ac.createBufferSource(); src.buffer = kit.noise; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0); src.stop(t0 + dur + .05);
  } catch { }
}
function toneLayer({ at = 0, dur = .6, from = 90, to = 32, gain = .5, type = 'sine' }) {
  if (!soundOn) return;
  try {
    const out = ensureAudio(), t0 = ac.currentTime + at;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(12, to), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + dur + .05);
  } catch { }
}
function sound(key) {
  if (!soundOn) return;
  ambience();
  const url = audioUrls[key];
  if (url) { const a = new Audio(url); a.volume = key === 'fire' ? .45 : .5; a.play().catch(() => { }) }
  if (key === 'fire') {
    toneLayer({ dur: .9, from: 120, to: 28, gain: .5 });
    noiseLayer({ dur: .55, from: 1800, to: 180, gain: .28, q: .8 });
    noiseLayer({ at: .02, dur: 2.2, from: 320, to: 90, gain: .1 });
    // The shell's fall: a thin tone dropping away from the muzzle.
    toneLayer({ at: .02, dur: 1.9, from: 1300, to: 330, gain: .04 });
  } else if (key === 'hit') {
    toneLayer({ dur: 1.5, from: 92, to: 26, gain: .55 });
    noiseLayer({ dur: 1.1, from: 2600, to: 160, gain: .3, q: .6 });
    noiseLayer({ at: .04, dur: .5, from: 5200, to: 900, gain: .1, type: 'highpass', q: .4 });
    noiseLayer({ at: .06, dur: 2.6, from: 240, to: 70, gain: .09 });
    noiseLayer({ at: .18, dur: 3.4, from: 160, to: 45, gain: .07 });
    toneLayer({ at: .01, dur: 2.6, from: 3150, to: 2950, gain: .02 });
    duckAmbience();
  } else {
    noiseLayer({ dur: .9, from: 3600, to: 420, gain: .24, q: .5 });
    noiseLayer({ at: .02, dur: .45, from: 1400, to: 300, gain: .09, type: 'bandpass', q: 1.2 });
    toneLayer({ at: .02, dur: .5, from: 150, to: 45, gain: .14 });
  }
}

/* ----------------------------------------------------------------- loop */
function update(now = 0) {
  requestAnimationFrame(update);
  // Board frames get a lighter budget than shot frames; the swell reads fine at 20 fps.
  if (document.hidden || now - lastFrame < (shot ? 29 : 50)) return;
  lastFrame = now;
  const dt = Math.min(clock.getDelta(), .1);
  // Slow motion on impact: the sea, smoke, debris and the shell all run on this clock.
  slow = damp(slow, 1, 2.4, dt);
  const sdt = dt * slow;
  elapsed += sdt;
  sea.material.uniforms.time.value = elapsed;
  sky.material.uniforms.time.value = elapsed;
  while (later.length && later[0].at <= elapsed) later.shift().fn();
  updateFx(sdt);
  if (flashEl) {
    blowout = blowout > .002 ? blowout * Math.exp(-dt * 9) : 0;
    const level = Math.min(.6, blowout);
    if (Math.abs(level - lastFlash) > .004) { lastFlash = level; flashEl.style.opacity = level.toFixed(3) }
  }
  if (grid.visible) {
    for (let i = 0; i < gridPos.length; i += 3) gridPos[i + 1] = waveAt(gridPos[i], gridPos[i + 2]) + .12;
    gridGeo.attributes.position.needsUpdate = true;
  }

  // Ships ride the same swell the shader draws, so they sit in the water instead of on it.
  floatShip(player, .94);
  player.rotation.x = (waveAt(player.position.x, player.position.z - 10) - waveAt(player.position.x, player.position.z + 10)) * .03;
  player.rotation.z = (waveAt(player.position.x - 8, player.position.z) - waveAt(player.position.x + 8, player.position.z)) * .018;
  for (const g of ownModels) {
    if (g.userData.sinkStart != null) {
      const st = elapsed - g.userData.sinkStart;
      g.position.y = (g.userData.baseY || 0) - Math.min(16, st * 1.15);
      g.rotation.z = Math.min(.65, st * .055) * (g.userData.sinkRoll || 1);
      if (st > 22) g.visible = false;
      continue;
    }
    // A ship abeam of the turn camera would clip the edge of the frame; keep it out of the lens.
    g.visible = !(turnAim && !shot && g.position.distanceTo(camera.position) < 58);
    g.position.y = waveAt(g.position.x, g.position.z) * .9;
    g.rotation.z = .03 * Math.sin(elapsed * .85 + g.position.z * .04);
  }
  if (battery.visible) {
    floatShip(battery, .94);
    battery.rotation.x = -(waveAt(battery.position.x, battery.position.z - 10) - waveAt(battery.position.x, battery.position.z + 10)) * .03;
  }
  for (const s of ships) {
    if (!s.sunk) continue;
    const t = elapsed - s.model.userData.sinkStart;
    s.model.position.y = -Math.min(15, t * 1.1);
    s.model.rotation.z = Math.min(.6, t * .05);
    if (t < 14 && Math.random() < .28) puff(s.model.position.clone().add(new T.Vector3((Math.random() - .5) * 8, 3 + Math.random() * 5, (Math.random() - .5) * 8)), { color: 0x2b3338, size: 4, life: 2.4, rise: 5 + Math.random() * 4, gravity: -.4, grow: 2.6, opacity: .4 });
    if (t > 20) s.model.visible = false;
  }

  // Damage stays: wrecks keep smoking for the rest of the round, one puff at a time.
  if (burns.length && elapsed > burnPulse.at) {
    burnPulse.at = elapsed + .3;
    const b = burns[burnPulse.index++ % burns.length];
    puff(b.at.clone().add(new T.Vector3((Math.random() - .5) * 2.4, 1 + Math.random() * 2, (Math.random() - .5) * 2.4)), { color: 0x2b3237, size: 2.4, life: 3.6, rise: 3.6 + Math.random() * 2.6, spread: 1.5, gravity: -.5, grow: 2.2, opacity: .24 });
  }
  for (const b of burns) if (b.fire) b.fire.material.opacity = .24 + .16 * Math.sin(elapsed * 7.5 + b.at.x * .7) + Math.random() * .06;

  let desired = baseCam.clone(), focus = baseLook.clone(), lambda = 3.4, fovGoal = 44, bank = 0, action = 0;
  if (turnAim && aimRoom && !shot && cineMode !== 'off') {
    /* --- your turn: hold on the ship, guns sweeping the enemy water ------ */
    // A slow arc so the framing breathes without drifting off the target water.
    const a = Math.sin(elapsed * .17) * .05;
    // A slow push-in over the hold, so the frame is never quite still.
    const push = 1 - .018 * (1 - Math.cos(elapsed * .11));
    const ox = (aimPos.x - player.position.x) * push, oz = (aimPos.z - player.position.z) * push;
    desired.set(player.position.x + ox * Math.cos(a) - oz * Math.sin(a), aimPos.y, player.position.z + ox * Math.sin(a) + oz * Math.cos(a));
    focus.copy(aimFocus);
    lambda = 1.8; fovGoal = 42; action = .4;
    for (const turret of (player.userData.turrets || [])) {
      turret.rotation.y = turn(turret.rotation.y, aimYaw ?? Math.sin(elapsed * .23) * .13, 1 - Math.exp(-dt * 1.7));
      if (turret.userData.barrels) for (const b of turret.userData.barrels) b.rotation.x = damp(b.rotation.x, Math.PI / 2 - .3, 1.6, dt);
    }
  } else if (shot) {
    const s = shot;
    // The shell hangs in its last half-second: the clock eases down as it nears the target.
    const hang = s.kind === 'out' && s.t > T_HIT - .55 && s.t < T_HIT ? .52 + .48 * clamp((T_HIT - s.t) / .55, 0, 1) : 1;
    s.t += sdt * (s.rate || 1) * hang;
    const t = s.t; action = 1; holdPose = null;
    for (const turret of (s.gun.userData.turrets || [])) {
      turret.rotation.y = turn(turret.rotation.y, s.yaw, 1 - Math.exp(-dt * 5.5));
      if (turret.userData.barrels) for (const b of turret.userData.barrels) b.rotation.x = damp(b.rotation.x, Math.PI / 2 - .2, 4, dt);
    }

    if (s.kind === 'out') {
      /* --- your shot: one take, board to hit ------------------------------ */
      // Nothing cuts: the take opens on the camera the player was holding, eases down
      // onto the bow as the guns train, rides out with the shell, then peels back into
      // the impact orbit. Each rig is blended into the next over a window, never snapped.
      const fit = clamp(1.45 / camera.aspect, 1, 2);
      const lift = 1 + (fit - 1) * .5;
      const aimK = smooth(clamp(t / T_AIM, 0, 1));
      const gunPos = player.position.clone().add(new T.Vector3(31 * fit, 3.3 * lift, 27 * fit).lerp(new T.Vector3(22 * fit, 10 * lift, 16 * fit), aimK));
      const gunFocus = player.position.clone().add(new T.Vector3(0, 7, -7)).lerp(s.target, .22 * aimK);
      if (s.from) { gunPos.lerp(s.from.p, 1 - aimK); gunFocus.lerp(s.from.l, 1 - aimK) }

      const u = clamp((t - T_FIRE) / (T_HIT - T_FIRE), 0, 1);
      const p = bezier(s.start, s.ctrl, s.target, u);
      const tan = tangent(s.start, s.ctrl, s.target, u);
      const side = new T.Vector3().crossVectors(tan, UP).normalize();
      const shellPos = p.clone().addScaledVector(tan, -3.2 * clamp(1.3 / camera.aspect, 1, 1.4)).addScaledVector(UP, 2.2 - u * .7).addScaledVector(side, 2.6);
      const shellFocus = p.clone().lerp(s.target, .36 + u * .3);

      const k = clamp((t - T_HIT) / (T_END - T_HIT), 0, 1);
      const a = .55 + k * 1.35, orbit = (42 - k * 8) * clamp(1.3 / camera.aspect, 1, 1.6);
      const h = (s.hit ? 5.5 : 4.5) + k * k * 21;
      const hitPos = s.target.clone().add(new T.Vector3(Math.cos(a) * orbit, h, Math.sin(a) * orbit));
      const hitFocus = s.target.clone().add(new T.Vector3(0, (s.hit ? 3.5 : 1.5) + k * 2, 0));

      // Windows overlap the beats they join, so the camera is always mid-move, never cut.
      const onShell = smooth(clamp((t - T_FIRE + .6) / 1, 0, 1));
      const onHit = smooth(clamp((t - T_HIT + .45) / 1.05, 0, 1));
      desired.copy(gunPos).lerp(shellPos, onShell).lerp(hitPos, onHit);
      focus.copy(gunFocus).lerp(shellFocus, onShell).lerp(hitFocus, onHit);
      lambda = 2.6 + 5.4 * onShell * (1 - onHit);
      fovGoal = 42 + 7 * onShell * (1 - onHit) + 8 * onHit;
      bank = .1 * onShell * (1 - onHit);

      reticle.visible = t < T_FIRE;
      if (t < T_FIRE) {
        const pulse = .5 + .5 * Math.sin(elapsed * 6);
        retPulse.material.opacity = .18 + pulse * .35;
        retPulse.scale.setScalar(1 + pulse * .25);
      }
      if (t >= T_FIRE && t < T_HIT) {
        if (!s.fired) {
          s.fired = true; whip = .8; fovKick = -3.5; blowout = .14;
          muzzleFlash(s.start);
          sound('fire');
          for (const turret of (s.gun.userData.turrets || [])) {
            if (turret.userData.restZ != null) turret.position.z = turret.userData.restZ + 1.1;
          }
        }
        projectile.visible = true;
        projectile.position.copy(p);
        projectile.quaternion.setFromUnitVectors(UP, tan);
        trailTimer += dt;
        if (trailTimer > .028) {
          trailTimer = 0;
          const sprite = new T.Sprite(trailGlow.clone());
          sprite.position.copy(p).addScaledVector(tan, -.75);
          scene.add(sprite);
          flashes.push({ sprite, t: 0, life: .55, size: 1.5, alpha: .22, grow: 2.4 });
          if (Math.random() < .6) puff(p.clone().addScaledVector(tan, -1.2), { color: 0xe2dfcd, size: .7, life: 1.2, rise: .4, spread: .5, gravity: .8, grow: 4, opacity: .18 });
        }
      }
      if (t >= T_HIT) {
        if (!s.impacted) impact(s);
        reticle.visible = false;
        if (s.hit && Math.random() < .5) puff(s.target.clone().add(new T.Vector3((Math.random() - .5) * 6, 1, (Math.random() - .5) * 6)), { color: 0x3a4046, size: 3, life: 2.2, rise: 3 + Math.random() * 4, gravity: -.8, grow: 2.4, opacity: .35 });
      }
      if (t >= T_END) finishShot();
    } else {
      /* --- the reply: one take, waterline to the hit ----------------------- */
      // Same discipline as your own shot: nothing cuts. The camera eases off the frame
      // the last take ended on, holds the waterline while the guns train, then follows
      // the shell home and settles into the impact orbit — every join is a blend.
      // Narrow portrait screens see a much thinner slice of the world, so pull back.
      const fit = clamp(1.45 / camera.aspect, 1, 2);
      const aimK = smooth(clamp(t / T_AIM, 0, 1));
      // Waterline cam: the enemy's guns come to bear seen from just above the swell.
      const b = s.gun.position;
      // Port broadside: the sun is north-west, so this is the lit side of the enemy ship.
      const waterPos = b.clone().add(new T.Vector3(-58 * fit, 2.8 * fit, 7 * fit).lerp(new T.Vector3(-45 * fit, 8 * fit, 5 * fit), aimK));
      const waterFocus = b.clone().add(new T.Vector3(0, 8.5, .5));
      // Open on the exact frame the player was left on, then settle onto the waterline.
      if (s.from) { waterPos.lerp(s.from.p, 1 - aimK); waterFocus.lerp(s.from.l, 1 - aimK) }

      const u = clamp((t - T_FIRE) / (T_HIT - T_FIRE), 0, 1);
      const p = bezier(s.start, s.ctrl, s.target, u);
      const tan = tangent(s.start, s.ctrl, s.target, u);
      const side = new T.Vector3().crossVectors(tan, UP).normalize();
      const chasePos = p.clone().addScaledVector(tan, -6 * clamp(1.3 / camera.aspect, 1, 1.5)).addScaledVector(UP, 4.4 - u * 1.4).addScaledVector(side, 5);
      const chaseFocus = p.clone().lerp(s.target, .42 + u * .25);

      const k = clamp((t - T_HIT) / (T_END - T_HIT), 0, 1);
      const a = .55 + k * 1.35, orbit = (42 - k * 8) * clamp(1.3 / camera.aspect, 1, 1.6);
      // Start down in the spray at the waterline and crane up as the smoke climbs.
      const h = (s.hit ? 5.5 : 4.5) + k * k * 21;
      const hitPos = s.target.clone().add(new T.Vector3(Math.cos(a) * orbit, h, Math.sin(a) * orbit));
      const hitFocus = s.target.clone().add(new T.Vector3(0, (s.hit ? 3.5 : 1.5) + k * 2, 0));

      // Windows overlap the beats they join. The camera leans off the waterline as the
      // guns fire and is already drifting onto the impact before the shell lands, so
      // the frame is always moving through the join instead of jumping across it.
      const onShell = smooth(clamp((t - T_FIRE + .25) / 1.1, 0, 1));
      const onHit = smooth(clamp((t - T_HIT + .45) / 1.05, 0, 1));
      desired.copy(waterPos).lerp(chasePos, onShell).lerp(hitPos, onHit);
      focus.copy(waterFocus).lerp(chaseFocus, onShell).lerp(hitFocus, onHit);
      // The take opens far from the enemy's flank, so the approach has to track its own
      // path instead of trailing it; by the time the guns are framed it has settled.
      const track = 4.6 + 9.4 * (1 - aimK) + 4.4 * onShell;
      lambda = track + (3.2 - track) * onHit;
      fovGoal = 46 + 9 * onShell * (1 - onHit) + 4 * onHit;
      bank = .1 * onShell * (1 - onHit);

      if (t >= T_FIRE && t < T_HIT) {
        if (!s.fired) {
          s.fired = true; whip = 1; fovKick = -3.5; blowout = .16;
          muzzleFlash(s.start);
          sound('fire');
          for (const turret of (s.gun.userData.turrets || [])) {
            if (turret.userData.restZ != null) turret.position.z = turret.userData.restZ + 1.1;
          }
        }
        projectile.visible = true;
        projectile.position.copy(p);
        projectile.quaternion.setFromUnitVectors(UP, tan);
        trailTimer += dt;
        if (trailTimer > .028) {
          trailTimer = 0;
          const sprite = new T.Sprite(trailGlow.clone());
          sprite.position.copy(p).addScaledVector(tan, -.75);
          scene.add(sprite);
          flashes.push({ sprite, t: 0, life: .55, size: 1.5, alpha: .22, grow: 2.4 });
          if (Math.random() < .6) puff(p.clone().addScaledVector(tan, -1.2), { color: 0xe2dfcd, size: .7, life: 1.2, rise: .4, spread: .5, gravity: .8, grow: 4, opacity: .18 });
        }
      }
      if (t >= T_HIT) {
        if (!s.impacted) impact(s);
        if (s.hit && Math.random() < .5) puff(s.target.clone().add(new T.Vector3((Math.random() - .5) * 6, 1, (Math.random() - .5) * 6)), { color: 0x3a4046, size: 3, life: 2.2, rise: 3 + Math.random() * 4, gravity: -.8, grow: 2.4, opacity: .35 });
      }
      if (t >= T_END) finishShot();
    }
  } else if (holdPose && elapsed < holdPose.until) {
    /* --- between your shot and the reply: stay on the hit ------------------ */
    desired.copy(holdPose.p);
    focus.copy(holdPose.l);
    lambda = 1.4; fovGoal = 50; action = .3;
  }

  for (const turret of (player.userData.turrets || [])) {
    if (turret.userData.restZ != null) turret.position.z = damp(turret.position.z, turret.userData.restZ, 6, dt);
  }
  fovKick *= Math.exp(-dt * 5.5);
  whip *= Math.exp(-dt * 6.5);
  camera.fov = damp(camera.fov, fovGoal + fovKick, 3.5, dt);
  camera.updateProjectionMatrix();
  camPos.lerp(desired, 1 - Math.exp(-dt * lambda));
  look.lerp(focus, 1 - Math.exp(-dt * (lambda + .8)));
  camera.position.copy(camPos);
  // Handheld: a slow drift that grows while a shot plays, so nothing sits perfectly still.
  const hh = action ? .32 : .09;
  camera.position.x += (Math.sin(elapsed * 1.7) * .55 + Math.sin(elapsed * 4.3 + 1.1) * .2) * hh;
  camera.position.y += (Math.sin(elapsed * 2.2 + .6) * .4 + Math.sin(elapsed * 5.1 + 2.2) * .15) * hh;
  if (shake > .002) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake * .7;
    camera.position.z += (Math.random() - .5) * shake;
  }
  camera.up.copy(UP);
  const drift = Math.sin(elapsed * .9) * .005 + Math.sin(elapsed * 2.7 + .4) * .0025;
  if (bank || drift) camera.up.set(-(bank + drift), 1, 0).normalize();
  camera.lookAt(look);
  // Whip: a short yaw kick on firing, gone in a fraction of a second.
  if (whip > .002) camera.rotateY(whip * .05);
  setRatio(shot ? maxRatio : restRatio);
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
  wrapper.updateMatrixWorld(true);
  bounds.setFromObject(wrapper); bounds.getSize(size); bounds.getCenter(center);
  // 20% of the whole bbox includes the mast, which buries the hull; use a per-class waterline.
  const draft = size.y * (DRAFT[g.userData.shipType] ?? .06);
  wrapper.position.set(-center.x, a.zero ? 0 : -(bounds.min.y + draft), -center.z);
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
  if (battery.userData.shipType === type) applyModel(battery);
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
  if (soundOn) { try { ensureAudio() } catch { } }
};
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (turnAim) aimFraming();
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
    if (v) { try { ensureAudio() } catch { } }
  },
  mode(v) {
    cineMode = v === 'brief' || v === 'off' ? v : 'full';
    return cineMode;
  },
  fire,
  incoming,
  aim(i) {
    // The square under the cursor: the ship's turrets train on it while you choose.
    const target = Number.isInteger(i) && i >= 0 ? pos(i) : null;
    aimYaw = target ? Math.atan2(-(target.x - player.position.x), -(target.z - player.position.z)) : null;
    return aimYaw;
  },
  turn(on) {
    if (!!on !== turnAim) { turnAim = !!on; if (turnAim) aimFraming(); }
    return turnAim;
  },
  status() {
    const bs = new T.Box3().setFromObject(battery).getSize(new T.Vector3());
    return { loaded: [...loaded], errors: [...errors], player: !!player.userData.assetApplied, own: ownModels.map(x => !!x.userData.assetApplied), cam: camera.position.toArray().map(n => +n.toFixed(1)), look: look.toArray().map(n => +n.toFixed(1)), battery: { pos: battery.position.toArray().map(n => +n.toFixed(1)), vis: battery.visible, size: bs.toArray().map(n => +n.toFixed(1)) }, shot: shot ? { kind: shot.kind, t: +shot.t.toFixed(2), rate: shot.rate } : null, mode: cineMode, slow: +slow.toFixed(2), flash: +blowout.toFixed(2), burns: burns.length, grid: grid.visible };
  }
};
window.dispatchEvent(new Event('iron-tide-ready'));
