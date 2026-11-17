/* Road to NC II · COC 2 crimping close-up
 * Hybrid look: a Blender (Cycles) render of the workbench is the background,
 * and Three.js draws the interactive props on top: cable, RJ45 plug, crimper.
 * The Three.js camera uses the Blender camera's exact position/FOV (camera.json),
 * so the props sit in the same space as the rendered bench and cast shadows onto it.
 *
 * openCrimpCloseup(host, opts) → Promise<{ close() }>
 *   opts.end      the game's cable-end state (order, plug{f,flip}, L, boot, crimp)
 *   opts.colors   the game's COLORS table
 *   opts.steps    [[label, done], ...]  (4 rows, the last one is the current step)
 *   opts.title    task text, opts.progress  e.g. "0 / 1"
 *   opts.time     () => "mm:ss"
 *   opts.onRelease(p)  p = 0…100 how far the handles were squeezed
 *   opts.onCancel()    player backed out from the pause menu
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BASE = new URL('./', import.meta.url).href;
const MM = 0.0037;          // 1 mm of a real RJ45 in scene metres (the plug is drawn oversized, like the reference art)
const SQUEEZE_MS = 1250;
const PLUG_Y = -.0075;      // plug centre height inside the die slot (crimper frame)     // same timing as the game's hold-to-squeeze bar

/* ------------------------------------------------------------------ assets (loaded once) */
let ASSETS = null;
function loadAssets() {
  if (!ASSETS) ASSETS = (async () => {
    const [cam, env] = await Promise.all([
      fetch(BASE + 'camera.json').then(r => r.json()),
      new THREE.TextureLoader().loadAsync(BASE + 'env.jpg'),   // studio HDRI from Blender, downsized
    ]);
    await new Promise((res, rej) => { const i = new Image(); i.onload = res; i.onerror = rej; i.src = BASE + 'bench_bg.jpg'; });
    return { cam, env };
  })();
  return ASSETS;
}
export const preload = () => loadAssets();

/* ------------------------------------------------------------------ HUD */
const CSS = `
.cc-root{position:absolute;inset:0;z-index:30;overflow:hidden;border-radius:6px;background:#2b2116 center/100% 100% no-repeat;font-family:"Segoe UI",Roboto,system-ui,sans-serif;color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;cursor:pointer}
.cc-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.cc-p{position:absolute;background:rgba(24,30,44,.88);border:.12em solid #3d4a64;border-radius:.85em;box-shadow:0 .3em 1em rgba(0,0,0,.35);cursor:default}
.cc-task{left:1.2%;top:2%;width:26.5%;display:flex;gap:.8em;padding:.75em 1em .8em .9em;line-height:1.25}
.cc-task .ic{flex:none;width:2.3em;height:2.3em;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffd23f,#f2a900);color:#1b2333;display:grid;place-items:center;font-weight:900;font-size:1.35em;box-shadow:inset 0 -.12em 0 rgba(0,0,0,.2);margin-top:.35em}
.cc-task b.h{display:block;font-size:1.3em;letter-spacing:.02em;margin-bottom:.15em}
.cc-task .t{font-size:1.02em}
.cc-task .pr{margin-top:.35em;font-weight:800;font-size:1.06em}.cc-task .pr span{color:#f5c518}
.cc-steps{left:1.2%;top:23.5%;width:23%;padding:.45em;display:flex;flex-direction:column;gap:.3em}
.cc-step{display:flex;align-items:center;gap:.55em;padding:.32em .45em;border-radius:.6em;border:.14em solid transparent;font-size:.86em;line-height:1.2}
.cc-step .n{flex:none;width:1.75em;height:1.75em;border-radius:50%;background:#262d3d;border:.1em solid #4a5672;display:grid;place-items:center;font-weight:900;font-size:1.05em}
.cc-step .th{flex:none;width:4.2em;height:2.6em;border-radius:.35em;background:#1a2030;display:grid;place-items:center;overflow:hidden}
.cc-step .th svg{width:100%;height:100%}
.cc-step .lb{flex:1;min-width:0}
.cc-step .ck{flex:none;width:1.45em;height:1.45em;border-radius:.3em;background:#2fbf5a;display:grid;place-items:center;box-shadow:0 0 0 .12em #1d8c3e inset}
.cc-step .ck svg{width:80%}
.cc-step.cur{border-color:#f5b400;background:rgba(245,180,0,.06)}.cc-step.cur .n{background:#f5b400;border-color:#f5b400;color:#1b2333}
.cc-tr{position:absolute;right:1.2%;top:2%;display:flex;gap:.6em}
.cc-time{position:static;display:flex;align-items:center;gap:.5em;padding:.35em .9em .35em .6em;font-weight:800;font-size:1.55em;font-variant-numeric:tabular-nums}
.cc-time svg{width:1.25em;height:1.25em}
.cc-pause{position:static;width:2.75em;height:2.75em;display:grid;place-items:center;cursor:pointer;font-size:1.55em;padding:0;color:#fff}
.cc-pause i{display:inline-block;width:.22em;height:.85em;background:#fff;border-radius:.06em;margin:0 .09em}
.cc-inset{position:absolute;left:1.6%;bottom:3%;width:16.5%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 40%,#d9dde3,#a9b0ba);border:.35em solid #2c3344;box-shadow:0 .3em 1em rgba(0,0,0,.4),inset 0 0 0 .14em #4a5672;overflow:visible}
.cc-inset svg{position:absolute;inset:6%;width:88%;height:88%}
.cc-inset b{position:absolute;left:50%;bottom:-.9em;transform:translateX(-50%);background:#1d4fa8;border:.14em solid #dfe8f6;border-radius:.45em;padding:.08em .7em;font-size:1.2em;font-weight:900;letter-spacing:.04em;white-space:nowrap}
.cc-hint{right:1.2%;bottom:3%;display:flex;align-items:center;gap:.7em;padding:.7em 1.2em .7em .9em;font-size:1.3em;font-weight:600;line-height:1.15}
.cc-hint svg{width:1.6em;height:2.3em;flex:none}
.cc-hint .bar{position:absolute;left:.7em;right:.7em;bottom:.35em;height:.22em;border-radius:.2em;background:rgba(255,255,255,.12);overflow:hidden}
.cc-hint .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#f5b400,#ffd23f)}
.cc-hint.full .bar i{background:#2fbf5a}
.cc-root.held .cc-hint{border-color:#f5b400}
.cc-click{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%) scale(.6);font-size:3.2em;font-weight:900;color:#fff;text-shadow:0 .08em 0 #1b2333,0 0 .5em rgba(245,180,0,.8);opacity:0;transition:opacity .15s,transform .25s cubic-bezier(.3,1.6,.5,1);pointer-events:none;font-style:italic}
.cc-click.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.cc-menu{position:absolute;inset:0;background:rgba(5,8,14,.55);display:grid;place-items:center;cursor:default}
.cc-menu .box{background:rgba(24,30,44,.96);border:.12em solid #3d4a64;border-radius:.9em;padding:1.2em 1.4em;text-align:center;min-width:16em}
.cc-menu h3{margin:0 0 .8em;font-size:1.5em}
.cc-menu button{display:block;width:100%;margin:.45em 0;padding:.6em 1em;border-radius:.6em;border:0;font:inherit;font-weight:800;font-size:1.05em;cursor:pointer}
.cc-menu .go{background:#f5b400;color:#1b2333}.cc-menu .no{background:#2c3446;color:#fff;border:.1em solid #4a5672}
.cc-load{position:absolute;inset:0;display:grid;place-items:center;font-weight:700;font-size:1.3em;background:rgba(10,12,18,.55)}
.cc-hide{display:none!important}
@media (max-aspect-ratio:1/1){.cc-steps{display:none}}
`;
const ICON = {
  check: '<svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  watch: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13.5" r="8"/><path d="M12 13.5V9M9.5 2.5h5M12 2.5v3M18.5 6.5l1.6-1.6"/></svg>',
  mouse: '<svg viewBox="0 0 32 46"><rect x="2" y="2" width="28" height="42" rx="14" fill="#f4f6f9" stroke="#c9ced6" stroke-width="2"/><path d="M16 2v15" stroke="#9aa3b0" stroke-width="2"/><path d="M3 16V16A13 13 0 0 1 16 3V17H3Z" fill="#2a3346"/><rect x="14" y="8" width="4" height="7" rx="2" fill="#9aa3b0"/></svg>',
  strip: '<svg viewBox="0 0 84 52"><rect x="2" y="20" width="40" height="14" rx="7" fill="#1f66dc"/><ellipse cx="42" cy="27" rx="4" ry="7" fill="#1650b0"/>' + ['#f28c28', '#2fa84f', '#2f6fe0', '#8a5a2b'].map((c, i) => `<path d="M44 ${23 + i * 2.4}Q60 ${14 + i * 8} 80 ${6 + i * 13}" stroke="${c}" stroke-width="3" fill="none"/><path d="M44 ${24 + i * 2.4}Q60 ${17 + i * 8} 80 ${10 + i * 13}" stroke="#f4f4f4" stroke-width="2" fill="none"/>`).join('') + '</svg>',
  arrange: '<svg viewBox="0 0 84 52"><rect x="4" y="6" width="76" height="40" rx="5" fill="#2c3a55"/>' + ['#f8d6b8', '#f28c28', '#cfe9d4', '#2f6fe0', '#cfdcf8', '#2fa84f', '#e7d6c6', '#8a5a2b'].map((c, i) => `<rect x="${9 + i * 8.8}" y="10" width="6.6" height="32" rx="2" fill="${c}"/>`).join('') + '</svg>',
  plug: '<svg viewBox="0 0 84 52"><rect x="26" y="6" width="32" height="40" rx="4" fill="#dff0f8" fill-opacity=".75" stroke="#b6cfdb" stroke-width="2"/>' + [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="${29.5 + i * 3.4}" y="9" width="2" height="9" fill="#d9b24a"/>`).join('') + '<rect x="32" y="40" width="20" height="10" fill="#1f66dc"/></svg>',
  crimp: '<svg viewBox="0 0 84 52"><path d="M8 12h30l6 8v12l-6 8H8z" fill="#2a2d33"/><rect x="12" y="20" width="14" height="12" fill="#0d0e10"/><path d="M40 22L80 10l2 7-38 11z" fill="#1f6fe0"/><path d="M40 30l40 12-2 7-38-11z" fill="#1f6fe0"/><circle cx="36" cy="26" r="3.5" fill="#6b717b"/></svg>',
};

function hudHTML(o) {
  const thumbs = [ICON.strip, ICON.arrange, ICON.plug, ICON.crimp];
  return `
  <div class="cc-p cc-task"><span class="ic">!</span><div><b class="h">TASK:</b><div class="t">${o.title}</div><div class="pr">Progress: <span>${o.progress}</span></div></div></div>
  <div class="cc-p cc-steps">${o.steps.map((s, i) => `<div class="cc-step ${i === o.steps.length - 1 ? 'cur' : ''}"><span class="n">${i + 1}</span><span class="th">${thumbs[i] || ''}</span><span class="lb">${s[0]}</span>${s[1] ? `<span class="ck">${ICON.check}</span>` : ''}</div>`).join('')}</div>
  <div class="cc-tr"><div class="cc-p cc-time">${ICON.watch}<span class="tt">${o.time()}</span></div><button class="cc-p cc-pause" title="Pause" aria-label="Pause"><span><i></i><i></i></span></button></div>
  <div class="cc-inset">${insetSVG(o)}<b>FRONT VIEW</b></div>
  <div class="cc-p cc-hint">${ICON.mouse}<span>Hold and press<br>to crimp</span><span class="bar"><i></i></span></div>
  <div class="cc-click">CLICK!</div>`;
}
/* top view of the plug as the player built it (actual wire order, not the answer) */
function insetSVG(o) {
  const E = o.end, flip = E.plug && E.plug.flip, order = flip ? E.order.slice().reverse() : E.order;
  const wires = order.map((k, i) => {
    const c = o.colors[k], x = 47 + i * 13.2;
    const stripe = c.s ? `<rect x="${x}" y="58" width="9" height="104" rx="4" fill="url(#ccs${i})"/>` : '';
    return `<defs><pattern id="ccs${i}" width="9" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="9" height="12" fill="#f6f6f6"/><rect width="9" height="5" fill="${c.c}"/></pattern></defs>
      <rect x="${x}" y="58" width="9" height="104" rx="4" fill="${c.s ? '#f6f6f6' : c.c}"/>${stripe}`;
  }).join('');
  return `<svg viewBox="0 0 200 200"><rect x="38" y="20" width="124" height="150" rx="14" fill="#eef7fb" fill-opacity=".55" stroke="#c9dde7" stroke-width="3"/>
   ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="${47 + i * 13.2}" y="26" width="9" height="30" rx="1.5" fill="#d9b24a" stroke="#a8861d" stroke-width="1"/>`).join('')}
   ${wires}<rect x="58" y="150" width="84" height="44" rx="6" fill="#1f66dc"/><rect x="58" y="150" width="84" height="8" fill="#174fb0"/>
   ${flip ? '<rect x="76" y="6" width="48" height="12" rx="3" fill="#cfe2ec"/>' : ''}
   <text x="22" y="40" font-size="13" font-weight="800" fill="#2c3344" font-family="Arial">1</text><text x="170" y="40" font-size="13" font-weight="800" fill="#2c3344" font-family="Arial">8</text></svg>`;
}

/* ------------------------------------------------------------------ 3D props */
function stripeTexture(hexColor) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#f6f6f6'; x.fillRect(0, 0, 64, 64); x.fillStyle = hexColor;
  for (let k = -2; k < 4; k++) { x.beginPath(); x.moveTo(k * 32, 0); x.lineTo(k * 32 + 16, 0); x.lineTo(k * 32 + 48, 64); x.lineTo(k * 32 + 32, 64); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function roundedRectShape(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0); return s;
}
const MAT = () => ({
  gun: new THREE.MeshStandardMaterial({ color: 0x33373f, metalness: .5, roughness: .3 }),
  gunDark: new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: .4, roughness: .55 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xaab2bc, metalness: 1, roughness: .26 }),
  bolt: new THREE.MeshStandardMaterial({ color: 0x4a4f58, metalness: .9, roughness: .3 }),
  grip: new THREE.MeshPhysicalMaterial({ color: 0x1f6be0, roughness: .3, clearcoat: .8, clearcoatRoughness: .25 }),
  cable: new THREE.MeshPhysicalMaterial({ color: 0x1d63d8, roughness: .3, clearcoat: .6, clearcoatRoughness: .3 }),
  boot: new THREE.MeshPhysicalMaterial({ color: 0x2b72e6, roughness: .35, clearcoat: .4 }),
  clear: new THREE.MeshPhysicalMaterial({ color: 0xeef8fc, roughness: .06, metalness: 0, transparent: true, opacity: .42, clearcoat: 1, clearcoatRoughness: .05, depthWrite: false, side: THREE.DoubleSide }),
  clearEdge: new THREE.MeshPhysicalMaterial({ color: 0xdff0f8, roughness: .1, transparent: true, opacity: .55, depthWrite: false }),
  gold: new THREE.MeshStandardMaterial({ color: 0xe2bb52, metalness: 1, roughness: .22 }),
  goldPressed: new THREE.MeshStandardMaterial({ color: 0xb08a2c, metalness: 1, roughness: .32 }),
  shadow: new THREE.ShadowMaterial({ color: 0x3b2410, opacity: .38 }),
});

function buildCrimper(M) {
  const g = new THREE.Group(); g.name = 'crimper';
  const D = .042;
  // C-shaped head: the plug sits in the open slot on the left
  const s = new THREE.Shape();
  const X0 = -.054, X1 = .072, Y0 = -.064, Y1 = .064, SL = -.014, SY = .029, r = .016;
  s.moveTo(X0 + r, Y1); s.lineTo(X1 - r, Y1); s.quadraticCurveTo(X1, Y1, X1, Y1 - r); s.lineTo(X1, Y0 + r); s.quadraticCurveTo(X1, Y0, X1 - r, Y0);
  s.lineTo(X0 + r, Y0); s.quadraticCurveTo(X0, Y0, X0, Y0 + r); s.lineTo(X0, -SY); s.lineTo(SL - .006, -SY); s.quadraticCurveTo(SL, -SY, SL, -SY + .006);
  s.lineTo(SL, SY - .006); s.quadraticCurveTo(SL, SY, SL - .006, SY); s.lineTo(X0, SY); s.lineTo(X0, Y1 - r); s.quadraticCurveTo(X0, Y1, X0 + r, Y1);
  const head = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: true, bevelThickness: .005, bevelSize: .005, bevelSegments: 4, curveSegments: 10 }), M.gun);
  head.position.z = -D / 2; g.add(head);
  // dark back wall of the slot so we look into a cavity, not through the tool
  const back = new THREE.Mesh(new THREE.BoxGeometry(-X0 + SL + .004, SY * 2 + .002, .006), M.gunDark);
  back.position.set((X0 + SL) / 2, 0, -D / 2 + .004); g.add(back);
  // raised front plate with the brand stamp
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRectShape(.012, -.05, .064, .05, .012), { depth: .004, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 3 }), M.gun);
  plate.position.z = D / 2 + .003; g.add(plate);
  const stc = document.createElement('canvas'); stc.width = 256; stc.height = 128; const sx = stc.getContext('2d');
  sx.fillStyle = '#c9ced6'; sx.font = '900 86px Arial Black, Arial'; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('NC2', 128, 58);
  sx.font = 'bold 22px Arial'; sx.fillText('RJ45 · 8P8C', 128, 112);
  const stt = new THREE.CanvasTexture(stc); stt.colorSpace = THREE.SRGBColorSpace;
  const stamp = new THREE.Mesh(new THREE.PlaneGeometry(.04, .02), new THREE.MeshStandardMaterial({ map: stt, transparent: true, metalness: .6, roughness: .4 }));
  stamp.position.set(.038, -.002, D / 2 + .0095); g.add(stamp);
  // upper die (punch) that comes down on the contacts
  const punch = new THREE.Group(); punch.name = 'punch';
  const pb = new THREE.Mesh(new RoundedBoxGeometry(.032, .012, .036, 2, .0015), M.steel); pb.position.y = .0062; punch.add(pb);
  for (let i = 0; i < 8; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(.026, .0028, .0016), M.steel); t.position.set(0, -.0004, (i - 3.5) * 1.02 * MM); punch.add(t); }
  punch.position.set(-.034, .016, 0); g.add(punch); g.userData.punch = punch;
  // bolts
  const bolt = (x, y, rr) => { const b = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, D + .022, 28), M.bolt); c.rotation.x = Math.PI / 2; b.add(c);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(rr * .62, rr * .18, 8, 24), M.steel); cap.position.z = D / 2 + .011; b.add(cap); b.position.set(x, y, 0); g.add(b); return b; };
  bolt(.046, .034, .0105); bolt(.026, -.036, .0125); bolt(.002, .045, .008);
  // handles: upper fixed, lower pivots at the lower bolt
  const handle = (len, up) => {
    const h = new THREE.Group();
    const core = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRectShape(0, -.012, len, .012, .008), { depth: .02, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 3 }), M.gun);
    core.position.z = -.01; h.add(core);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(.0205, len * .62, 10, 24), M.grip); grip.rotation.z = -Math.PI / 2; grip.scale.set(1, 1, .88);
    grip.position.x = len * .58; h.add(grip);
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(.0215, .004, 8, 28), M.grip); ridge.rotation.y = Math.PI / 2; ridge.scale.set(1, 1, 1); ridge.position.x = len * .58 - len * .31 - .004; h.add(ridge);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.0215, 20, 14), M.grip); cap.scale.set(.6, 1, .88); cap.position.x = len * .58 + len * .31 + .016; h.add(cap);
    return h;
  };
  const upper = handle(.36, true); upper.position.set(.05, .03, 0); upper.rotation.z = TUNE.upper; g.add(upper);
  const lowerPivot = new THREE.Group(); lowerPivot.position.set(.026, -.036, 0); g.add(lowerPivot);
  const lower = handle(.37, false); lower.position.set(.006, 0, 0); lowerPivot.add(lower);
  g.userData.lowerPivot = lowerPivot; g.userData.upper = upper;
  // return spring between the handles
  const pts = []; for (let k = 0; k <= 160; k++) { const t = k / 160, a = t * 26 * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * .006, -t, Math.sin(a) * .006)); }
  const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, .0017, 6), M.steel); spring.name = 'spring'; g.add(spring); g.userData.spring = spring;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function buildPlug(M, E, colors) {
  /* plug frame: nose at x = 0, cable toward −x, contacts on +y (−y when the plug went on upside-down) */
  const g = new THREE.Group(); g.name = 'plug';
  const flip = !!(E.plug && E.plug.flip), sy = flip ? -1 : 1, Lp = 21, Hp = 8, Wp = 11.7;
  const f = E.plug ? E.plug.f : E.L + 2, wireTip = -f + (E.L || 13);
  // wires (behind the clear shell, drawn first)
  const order = E.order, pitch = 1.02;
  order.forEach((k, i) => {
    const c = colors[k], z = (flip ? 1 : -1) * (i - 3.5) * pitch * MM;
    const x0 = -f * MM, x1 = Math.min(-.6, wireTip) * MM, y = sy * 1.2 * MM;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x0 - 1 * MM, y * .2, z * .45), new THREE.Vector3(x0 + 2.5 * MM, y, z), new THREE.Vector3(x1, y, z)]);
    const mt = c.s ? new THREE.MeshPhysicalMaterial({ map: stripeTexture(c.c), roughness: .35, clearcoat: .5 }) : new THREE.MeshPhysicalMaterial({ color: c.c, roughness: .35, clearcoat: .5 });
    if (c.s) mt.map.repeat.set(Math.max(2, Math.round((x1 - x0) / (2.2 * MM))), 1);
    const w = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .48 * MM, 10, false), mt); w.castShadow = true; g.add(w);
    const capm = new THREE.Mesh(new THREE.CircleGeometry(.48 * MM, 10), new THREE.MeshStandardMaterial({ color: 0xc78a4a, metalness: 1, roughness: .3 }));
    capm.position.set(x1, y, z); capm.rotation.y = Math.PI / 2; g.add(capm);
  });
  // jacket inside / just behind the plug
  const jacketLen = Math.max(0, Lp - f) + 8;
  const jk = new THREE.Mesh(new THREE.CylinderGeometry(2.6 * MM, 2.6 * MM, jacketLen * MM, 24), M.cable);
  jk.rotation.z = Math.PI / 2; jk.position.x = (-f - jacketLen / 2) * MM; jk.castShadow = true; g.add(jk);
  // clear shell
  const shell = new THREE.Mesh(new RoundedBoxGeometry(Lp * MM, Hp * MM, Wp * MM, 3, .9 * MM), M.clear);
  shell.position.x = -Lp / 2 * MM; shell.renderOrder = 2; shell.castShadow = true; g.add(shell);
  const rear = new THREE.Mesh(new RoundedBoxGeometry(5 * MM, Hp * MM * .98, Wp * MM * .98, 2, .8 * MM), M.clearEdge); rear.position.x = -(Lp - 2.5) * MM; rear.renderOrder = 3; g.add(rear);
  // latch
  const clip = new THREE.Mesh(new RoundedBoxGeometry(12 * MM, .9 * MM, 5.6 * MM, 2, .3 * MM), M.clearEdge);
  clip.position.set(-8.5 * MM, -sy * (Hp / 2 + .9) * MM, 0); clip.rotation.z = sy * .16; clip.renderOrder = 3; g.add(clip);
  // contacts
  const pins = [];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(3.4 * MM, 1.6 * MM, .5 * MM), M.gold);
    p.position.set(-2.4 * MM, sy * (Hp / 2 - .2) * MM, (i - 3.5) * pitch * MM); p.userData.y0 = p.position.y; p.castShadow = true; g.add(p); pins.push(p);
  }
  g.userData.pins = pins; g.userData.sy = sy;
  if (E.boot) {
    const pts = []; const L0 = Lp + .6, L1 = Lp + 13;
    pts.push(new THREE.Vector2(2.65 * MM, L1 * MM));
    for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector2((3.1 + t * 1.5 + (k % 2 ? .22 : 0)) * MM, (L1 - t * (L1 - L0)) * MM)); }
    pts.push(new THREE.Vector2(2.65 * MM, L0 * MM));
    const boot = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), M.boot); boot.rotation.z = Math.PI / 2; boot.castShadow = true; g.add(boot);
  }
  return g;
}

/* layout constants (tuned against the reference screenshots) */
export const TUNE = {
  k: 1.62,                         // crimper/plug/cable size multiplier
  at: [.60, .56, .10],             // crimper die: screen x, screen y, height above the bench (m)
  rot: [.30, .34, -.20],          // roll, yaw, pitch after facing the camera
  upper: -.30,                     // upper handle angle relative to the head (head is tilted so the plug points down-left)
  open: -.72, shut: -.47,          // lower handle angle, handles open / squeezed shut
};

/* ------------------------------------------------------------------ main */
export async function openCrimpCloseup(host, o) {
  if (!document.getElementById('cc-css')) { const st = document.createElement('style'); st.id = 'cc-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.className = 'cc-root'; root.style.backgroundImage = `url(${BASE}bench_bg.jpg)`;
  root.innerHTML = '<div class="cc-load">Loading the workbench…</div>'; host.appendChild(root);
  const fit = () => { root.style.fontSize = (root.clientWidth / 1600 * 19.5).toFixed(2) + 'px'; };
  fit();
  let A;
  try { A = await loadAssets(); } catch (e) { root.remove(); throw e; }
  const canvas = document.createElement('canvas'); root.innerHTML = ''; root.appendChild(canvas);
  root.insertAdjacentHTML('beforeend', hudHTML(o));
  const $ = s => root.querySelector(s);

  /* renderer + camera matching the Blender render */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;        // Blender view transform "Standard"
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const C = A.cam, expo = Math.pow(2, C.exposure || 0);
  const camera = new THREE.PerspectiveCamera(C.vfov, C.aspect, .01, 20);
  camera.position.fromArray(C.pos); camera.lookAt(new THREE.Vector3().fromArray(C.target)); camera.updateMatrixWorld(true);
  const pmrem = new THREE.PMREMGenerator(renderer);
  A.env.mapping = THREE.EquirectangularReflectionMapping; A.env.colorSpace = THREE.SRGBColorSpace;
  const envRT = pmrem.fromEquirectangular(A.env); scene.environment = envRT.texture; scene.environmentIntensity = 1.35 * expo;
  scene.environmentRotation.y = Math.PI * .61;
  const sunDir = new THREE.Vector3().fromArray(C.sunDir).normalize();
  const sun = new THREE.DirectionalLight(0xfff3e6, 3.0 * expo);
  const focus = new THREE.Vector3(.08, .06, .1);
  sun.position.copy(focus).addScaledVector(sunDir, -1.6); sun.target.position.copy(focus);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .004; sun.shadow.radius = 5;
  Object.assign(sun.shadow.camera, { left: -.55, right: .55, top: .55, bottom: -.55, near: .2, far: 3.2 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), MAT().shadow); ground.rotation.x = -Math.PI / 2; ground.position.y = .0005; ground.receiveShadow = true; scene.add(ground);

  /* screen anchor → world point on a horizontal plane (keeps the layout tied to the reference framing) */
  const ray = new THREE.Raycaster();
  const onPlane = (sx, sy, h) => { ray.setFromCamera(new THREE.Vector2(sx * 2 - 1, 1 - sy * 2), camera); const t = (h - ray.ray.origin.y) / ray.ray.direction.y; return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t); };

  const M = MAT(), E = o.end;
  const crimper = buildCrimper(M), K = TUNE.k;
  crimper.position.copy(onPlane(TUNE.at[0], TUNE.at[1], TUNE.at[2]));
  crimper.lookAt(camera.position); crimper.rotateZ(TUNE.rot[0]); crimper.rotateY(TUNE.rot[1]); crimper.rotateX(TUNE.rot[2]); crimper.scale.setScalar(K);
  scene.add(crimper);
  const plug = buildPlug(M, E, o.colors);
  plug.position.set(-.019, PLUG_Y, 0); crimper.add(plug);
  crimper.updateMatrixWorld(true);

  /* cable: from the plug back out of the slot, then down onto the bench and out of frame (bottom-left) */
  const jEdge = new THREE.Vector3((-(E.plug ? E.plug.f : 15) - 8) * MM, 0, 0); plug.localToWorld(jEdge);
  const back1 = plug.localToWorld(new THREE.Vector3((-(E.plug ? E.plug.f : 15) - 30) * MM, 0, 0));
  const cablePts = [jEdge, back1, onPlane(.22, .86, .028), onPlane(.06, 1.02, .011), onPlane(-.12, 1.2, .009)];
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts, false, 'catmullrom', .35), 220, 2.6 * MM * K, 20, false), M.cable);
  cable.castShadow = true; scene.add(cable);


  /* ---------------- squeeze interaction ---------------- */
  const lp = crimper.userData.lowerPivot, punch = crimper.userData.punch, pins = plug.userData.pins;
  const OPEN = TUNE.open, SHUT = TUNE.shut, PUNCH_UP = .016, PUNCH_DN = PLUG_Y + (4 - .2 + .8 - .7) * MM;
  let held = false, t0 = 0, p = 0, vis = 0, done = false, seated = 0, closing = false, raf = 0, last = 0, paused = false;
  const bar = $('.cc-hint .bar i');
  const ctx = new (window.AudioContext || window.webkitAudioContext || Object)();
  const click = () => { try { const t = ctx.currentTime, os = ctx.createOscillator(), gn = ctx.createGain(); os.type = 'square'; os.frequency.setValueAtTime(1800, t); os.frequency.exponentialRampToValueAtTime(300, t + .05); gn.gain.setValueAtTime(.25, t); gn.gain.exponentialRampToValueAtTime(.001, t + .08); os.connect(gn).connect(ctx.destination); os.start(t); os.stop(t + .09); } catch (e) {} };
  const press = e => { if (done || paused || closing) return; if (e && e.target.closest && e.target.closest('.cc-pause,.cc-menu')) return; held = true; t0 = performance.now() - p / 100 * SQUEEZE_MS * 0; p = 0; root.classList.add('held'); try { ctx.resume && ctx.resume(); } catch (er) {} };
  const release = () => { if (!held) return; held = false; root.classList.remove('held'); finish(); };
  const finish = () => {
    if (done) return; done = true; const P = Math.round(p);
    if (P >= 100) { seated = 1; click(); $('.cc-click').classList.add('on'); $('.cc-hint').classList.add('full'); }
    else if (P >= 30) seated = Math.max(seated, .45);
    setTimeout(() => { if (!closing) o.onRelease && o.onRelease(P); }, P >= 100 ? 900 : 450);
  };
  root.addEventListener('pointerdown', e => { if (e.button && e.button !== 0) return; if (e.target.closest && e.target.closest('.cc-pause,.cc-menu')) return; press(e); if (held && root.setPointerCapture) root.setPointerCapture(e.pointerId); });
  root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release); root.addEventListener('lostpointercapture', release);
  const kd = e => { if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } if (e.key === 'Escape') pause(); };
  const ku = e => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); release(); } };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  const pause = () => {
    if (done || paused) return; paused = true; held = false; p = 0; root.classList.remove('held');
    root.insertAdjacentHTML('beforeend', '<div class="cc-menu"><div class="box"><h3>Paused</h3><button class="go">▶ Resume</button><button class="no">← Back to the bench</button></div></div>');
    $('.cc-menu .go').onclick = ev => { ev.stopPropagation(); $('.cc-menu').remove(); paused = false; };
    $('.cc-menu .no').onclick = ev => { ev.stopPropagation(); o.onCancel && o.onCancel(); };
  };
  $('.cc-pause').onclick = e => { e.stopPropagation(); pause(); };
  $('.cc-pause').onpointerdown = e => e.stopPropagation();

  /* ---------------- render loop ---------------- */
  const size = () => { const w = root.clientWidth, h = root.clientHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fit(); };
  const ro = new ResizeObserver(size); ro.observe(root); size();
  let tick = 0;
  const frame = ts => {
    raf = requestAnimationFrame(frame); const dt = Math.min(.05, (ts - (last || ts)) / 1000); last = ts;
    if (held) { p = Math.min(100, (performance.now() - t0) / SQUEEZE_MS * 100); if (p >= 100) { held = false; root.classList.remove('held'); finish(); } }
    const target = done ? (seated >= 1 ? 1 : 0) : held ? p / 100 : 0;
    vis += (target - vis) * (1 - Math.exp(-dt * (held ? 22 : 9)));
    if (api.debug.force != null) vis = api.debug.force;
    lp.rotation.z = OPEN + (SHUT - OPEN) * vis;
    { const up = crimper.userData.upper, a = up.rotation.z, U = new THREE.Vector3(up.position.x + Math.cos(a) * .075, up.position.y + Math.sin(a) * .075 - .01, 0);
      const b = lp.rotation.z, Lw = new THREE.Vector3(lp.position.x + Math.cos(b) * .095 + .006, lp.position.y + Math.sin(b) * .095 + .01, 0);
      const sp = crimper.userData.spring, dv = Lw.clone().sub(U); sp.position.copy(U); sp.rotation.set(0, 0, Math.atan2(dv.x, -dv.y)); sp.scale.set(1, dv.length(), 1); }
    const punchY = PUNCH_UP + (PUNCH_DN - PUNCH_UP) * Math.max(vis, seated * .999);
    punch.position.y = punchY;
    const squash = Math.max(0, Math.min(1, (PUNCH_UP - punchY) / (PUNCH_UP - PUNCH_DN) * 1.6 - .6));
    const sink = Math.max(squash, seated);
    pins.forEach(pn => { pn.position.y = pn.userData.y0 - plug.userData.sy * sink * .7 * MM; pn.material = sink > .95 ? M.goldPressed : M.gold; });
    bar.style.width = (done ? (seated >= 1 ? 100 : p) : held ? p : 0) + '%';
    if (++tick % 30 === 0) { const tt = $('.cc-time .tt'); if (tt) tt.textContent = o.time(); }
    renderer.render(scene, camera);
  };

  const api = window.__cc = {
    close() {
      closing = true; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      scene.traverse(x => { if (x.isMesh && x.geometry) x.geometry.dispose(); });
      envRT.dispose(); pmrem.dispose(); renderer.dispose(); try { ctx.close && ctx.close(); } catch (e) {}
      root.remove();
    },
    debug: { scene, camera, crimper, plug, renderer, TUNE, force: null },
  };
  raf = requestAnimationFrame(frame);
  return api;
}
