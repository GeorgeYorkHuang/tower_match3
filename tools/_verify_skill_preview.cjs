/**
 * _verify_skill_preview.cjs —— 预览页加载链路的无头验证
 *
 * 做三件事：
 *   1. 从 tools/preview_skill_loadout.html 里解析出 MOD_SRC，复现页面里的内联 CommonJS 加载器；
 *   2. 用记录型 canvas ctx 分别跑「旧 render.js 方法」与「新 skill-loadout 模块」；
 *   3. 断言两者绘制调用序列逐条相同（无随机/时间依赖，序列相同 ⇒ 像素相同），并打印调用统计。
 *
 * Canvas 2D 的绘制是确定性的：只要 fillStyle/strokeStyle/坐标/文本完全一致，落像素必然一致。
 * 因此这条断言等价于预览页里的像素差分，但可在 CI 里跑。
 *
 * 用法：node tools/_verify_skill_preview.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(__dirname, 'preview_skill_loadout.html');

/* ---------- 1. 从产物 HTML 里取 MOD_SRC ---------- */
const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/const MOD_SRC = \{([\s\S]*?)\};<\/script>/);
if (!m) {
  console.error('FAIL 产物里找不到 MOD_SRC');
  process.exit(1);
}
const MOD_SRC = JSON.parse('{' + m[1] + '}');
console.log('从产物解析出内联模块 ' + Object.keys(MOD_SRC).length + ' 个');

/* ---------- 2. 复现页面加载器 ---------- */
const factories = {};
for (const p of Object.keys(MOD_SRC)) {
  const src = Buffer.from(MOD_SRC[p], 'base64').toString('utf8');
  factories[p] = new Function('require', 'module', 'exports', src + '\n//# sourceURL=' + p);
}
function resolvePath(from, req) {
  if (req.charAt(0) !== '.') return req;
  const parts = from.split('/').slice(0, -1).concat(req.split('/'));
  const out = [];
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
}
const cache = {};
function makeRequire(from) {
  return function (req) {
    const target = resolvePath(from, req);
    if (cache[target]) return cache[target].exports;
    const f = factories[target];
    if (!f) throw new Error('未内联模块：' + target + '（来自 ' + from + '）');
    const mod = { exports: {} };
    cache[target] = mod;
    f(makeRequire(target), mod, mod.exports);
    return mod.exports;
  };
}
const reqRoot = makeRequire('preview.js');

let Renderer, createSkillLoadout, skillIcon;
try {
  Renderer = reqRoot('js/game/render.js').Renderer;
  createSkillLoadout = reqRoot('js/game/screens/skill-loadout.js').createSkillLoadout;
  skillIcon = reqRoot('js/game/icons/skills.js').skillIcon;
  console.log('模块加载 OK：Renderer / createSkillLoadout / skillIcon');
} catch (e) {
  console.error('FAIL 模块加载异常：' + e.message);
  process.exit(1);
}

/* ---------- 3. 记录型 ctx ---------- */
/* 渐变对象按 ctx 内序号命名（不是全局计数器），否则两次 run 的编号不同会造成假差异 */
function makeGrad(seq) {
  const id = 'g' + seq;
  const stops = [];
  return { __id: id, __stops: stops, addColorStop: (o, c) => stops.push([o, c]), _kind: 'grad' };
}
function norm(v) {
  if (v && v._kind === 'grad') return { grad: v.__id, stops: v.__stops };
  return v;
}
function makeCtx() {
  const ops = [];
  let gradN = 0;
  const ctx = {
    _ops: ops,
    canvas: { width: 750, height: 1626 },
    font: '10px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter',
    shadowBlur: 0, shadowColor: 'transparent',
  };
  const rec = (op) => (...a) => ops.push({ op, a: a.map(norm) });
  const passthrough = ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke',
    'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fillRect', 'strokeRect',
    'clearRect', 'translate', 'scale', 'rotate', 'setTransform', 'transform', 'clip',
    'bezierCurveTo', 'quadraticCurveTo', 'drawImage', 'fillText', 'strokeText'];
  for (const k of passthrough) ctx[k] = rec(k);
  ctx.createLinearGradient = (...a) => { ops.push({ op: 'createLinearGradient', a: a.map(norm) }); return makeGrad(++gradN); };
  ctx.createRadialGradient = (...a) => { ops.push({ op: 'createRadialGradient', a: a.map(norm) }); return makeGrad(++gradN); };
  ctx.measureText = (s) => {
    const sz = parseInt((ctx.font.match(/(\d+)px/) || [0, 16])[1], 10);
    let w = 0;
    for (const ch of String(s)) w += ch.charCodeAt(0) > 0x2e80 ? sz : sz * 0.55;
    return { width: w };
  };
  return ctx;
}

/* 属性赋值也要记录（fillStyle 等直接影响像素） */
function wrapProps(ctx) {
  for (const k of ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign',
    'textBaseline', 'globalAlpha', 'lineCap', 'lineJoin', 'shadowBlur', 'shadowColor']) {
    let v = ctx[k];
    Object.defineProperty(ctx, k, {
      get() { return v; },
      set(nv) { v = nv; ctx._ops.push({ op: 'set.' + k, a: [norm(nv)] }); },
      configurable: true, enumerable: true,
    });
  }
  return ctx;
}

/* ---------- 4. 两套实现 ---------- */
const oldR = Object.create(Renderer.prototype);
const IMPL_OLD = {
  skillCards: (...a) => oldR._menuSkillCards(...a),
  matchCfg: (...a) => oldR.menuMatchCfg(...a),
  globalCfg: (...a) => oldR.menuGlobalCfg(...a),
};
const L = createSkillLoadout({
  panelShell: Renderer.prototype._menuPanelShell,
  skillIcon,
  wrapText: Renderer.prototype.wrapText,
});
const IMPL_NEW = { skillCards: L.skillCards, matchCfg: L.menuMatchCfg, globalCfg: L.menuGlobalCfg };

/* ---------- 5. 状态 × 屏幕（与预览页同表） ---------- */
const STATES = {
  fresh: () => ({
    matchSkills: { match4: 'row', match5: 'rainbow', chain: 'attack' },
    globalSkills: { slots: ['shuffle', 'refill'] },
    skillUnlocks: {}, panel: {},
  }),
  bought: () => ({
    matchSkills: { match4: 'row', match5: 'rainbow', chain: 'attack' },
    globalSkills: { slots: ['shuffle', 'forge'] },
    skillUnlocks: {
      match4: ['row', 'col', 'cross'], match5: ['rainbow', 'scan'],
      chain: ['attack'], global: ['shuffle', 'forge', 'haste'],
    },
    panel: {},
  }),
  custom: () => ({
    matchSkills: { match4: 'random', match5: 'scan', chain: 'attack' },
    globalSkills: { slots: ['haste', 'barrier'] },
    skillUnlocks: { global: ['shuffle', 'haste', 'barrier', 'forge'] },
    panel: {},
  }),
};
const SCREENS = [
  { id: 'home', panel: null, draw: (L2, c, s, p) => {
      L2.skillCards(c, s, p, '三消技能', s.matchSkills, 55, 990, 640, 200, true);
      L2.skillCards(c, s, p, '全局技能', s.globalSkills, 55, 1254, 640, 200, false);
    } },
  { id: 'match4', panel: { slot: 'match4' }, draw: (L2, c, s, p) => L2.matchCfg(c, s, p) },
  { id: 'match5', panel: { slot: 'match5' }, draw: (L2, c, s, p) => L2.matchCfg(c, s, p) },
  { id: 'chain', panel: { slot: 'chain' }, draw: (L2, c, s, p) => L2.matchCfg(c, s, p) },
  { id: 'gp1', panel: { index: 0, page: 0 }, draw: (L2, c, s, p) => L2.globalCfg(c, s, p) },
  { id: 'gp3', panel: { index: 1, page: 2 }, draw: (L2, c, s, p) => L2.globalCfg(c, s, p) },
];

function run(impl, screen, stateKey) {
  const ctx = wrapProps(makeCtx());
  const s = STATES[stateKey]();
  if (screen.panel) Object.assign(s.panel, screen.panel);
  const hits = [];
  const push = (key, data, x, y, w, h) => hits.push({ key, data, x, y, w, h });
  screen.draw(impl, ctx, s, push);
  return { ops: ctx._ops, hits };
}

/* ---------- 6. 断言 ---------- */
let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  ' + extra : '')); }
}

for (const stateKey of Object.keys(STATES)) {
  console.log('\n[状态 ' + stateKey + ']');
  for (const sc of SCREENS) {
    const a = run(IMPL_NEW, sc, stateKey);
    const b = run(IMPL_OLD, sc, stateKey);
    const same = JSON.stringify(a.ops) === JSON.stringify(b.ops);
    ok(same, sc.id.padEnd(7) + ' 绘制序列等价',
      'ops=' + a.ops.length + ' hits=' + a.hits.length +
      (same ? '' : ' 首个差异 idx=' + firstDiff(a.ops, b.ops)));
    ok(a.ops.length > 30, sc.id.padEnd(7) + ' 确有绘制发生', 'ops=' + a.ops.length);
    ok(JSON.stringify(a.hits) === JSON.stringify(b.hits), sc.id.padEnd(7) + ' 命中区等价');
  }
}

function firstDiff(x, y) {
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (JSON.stringify(x[i]) !== JSON.stringify(y[i])) return i;
  return n;
}

/* 关键命中键必须存在 */
console.log('\n[命中键覆盖]');
const home = run(IMPL_NEW, SCREENS[0], 'fresh').hits;
ok(home.filter((h) => h.key === 'matchCfg').length === 3, '主页三消 3 个 matchCfg');
ok(home.filter((h) => h.key === 'globalCfg').length === 2, '主页全局 2 个 globalCfg（GlobalSkills.slots 返回双槽）');
const g1 = run(IMPL_NEW, SCREENS[4], 'fresh').hits;
ok(g1.filter((h) => h.key === 'mSkill').length === 6, '全局第 1 页 6 张 mSkill');
ok(g1.some((h) => h.key === 'globalPage' && h.data === 1), '第 1 页有「下一页 globalPage=1」');
ok(!g1.some((h) => h.key === 'globalPage' && h.data === -1), '第 1 页无「上一页」');
const g3 = run(IMPL_NEW, SCREENS[5], 'fresh').hits;
ok(g3.some((h) => h.key === 'globalPage' && h.data === 1), '第 3 页有「上一页 globalPage=1」');
ok(!g3.some((h) => h.key === 'globalPage' && h.data === 3), '第 3 页无「下一页」');
ok(g1.some((h) => h.key === 'panelClose'), '面板有 panelClose');

console.log('\n' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
