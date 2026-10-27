/* v1.16.127 战场切换箭头方向断言：左侧朝左(stagePrev) / 右侧朝右(stageNext)
 * 采集两条三角形路径的实际顶点坐标（含 translate/scale 变换），不依赖图形库 */
const { Renderer } = require('../js/game/render.js');

function mockCtx() {
  const st = { tx: 0, ty: 0, sx: 1, sy: 1 };
  const stack = [];
  let path = [];
  const tris = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    measureText: () => ({ width: 100 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    save() { stack.push({ ...st }); },
    restore() { const p = stack.pop(); if (p) Object.assign(st, p); },
    translate(x, y) { st.tx += x; st.ty += y; },
    scale(x, y) { st.sx *= x; st.sy *= y; },
    beginPath() { path = []; },
    moveTo(x, y) { path.push({ x: st.tx + x * st.sx, y: st.ty + y * st.sy }); },
    lineTo(x, y) { path.push({ x: st.tx + x * st.sx, y: st.ty + y * st.sy }); },
    closePath() {},
    fill() { if (path.length === 3) tris.push(path.map((p) => ({ ...p }))); },
    fillRect() {}, strokeRect() {}, stroke() {}, arc() {}, arcTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, fillText() {}, strokeText() {},
    rect() {}, drawImage() {}, clip() {}, setTransform() {}, rotate() {},
  };
  return { ctx, tris };
}

/** 三角形：两底点共享同一 x，剩下那个点是顶点 */
function apexOf(t) {
  const xs = t.map((p) => Math.round(p.x * 10) / 10);
  const uniq = xs.filter((v, i) => xs.indexOf(v) === i);
  if (uniq.length !== 2) return null;
  const baseX = xs.filter((v) => xs.filter((w) => w === v).length === 2)[0];
  const idx = xs.findIndex((v) => v !== baseX);
  return { apexX: xs[idx], baseX, centerX: (Math.min(...xs) + Math.max(...xs)) / 2 };
}

const r = new Renderer();
const s = {
  tab: 'battle', gold: 12345, diamond: 8, stage: 'ancient', chests: 2, chestOpenSec: 30,
  relics: [], daily: { picks: [] }, panel: null,
  codexSel: 'fire', towerCodex: { fire: 1, ice: 1, poison: 1, electric: 1 },
};
const { ctx, tris } = mockCtx();
const hits = r.menuLayer(ctx, s);

let fails = 0;
const fail = (m) => { console.error('FAIL ' + m); fails++; };

// 1) 命中键：左箭头 stagePrev、右箭头 stageNext，且左右顺序正确
const prev = hits.filter((h) => h.key === 'stagePrev');
const next = hits.filter((h) => h.key === 'stageNext');
if (prev.length !== 1) fail(`stagePrev 命中区数量=${prev.length}（应为 1）`);
if (next.length !== 1) fail(`stageNext 命中区数量=${next.length}（应为 1）`);
if (prev[0] && next[0] && !(prev[0].rect.x < next[0].rect.x)) fail(`stagePrev.x=${prev[0].rect.x} 未在 stageNext.x=${next[0].rect.x} 左侧`);

// 2) 箭头朝向：左侧三角顶点朝左（apex < base），右侧朝右（apex > base）
const arrows = tris.map(apexOf).filter(Boolean)
  .filter((a) => Math.abs(a.baseX - a.apexX) > 1 && Math.abs(a.baseX - a.apexX) < 20);
arrows.sort((a, b) => a.centerX - b.centerX);
if (arrows.length !== 2) {
  fail(`识别到箭头三角 ${arrows.length} 个（应为 2）`);
} else {
  const [L, R] = arrows;
  if (!(L.apexX < L.baseX)) fail(`左侧箭头未朝左：apex=${L.apexX} base=${L.baseX}`);
  if (!(R.apexX > R.baseX)) fail(`右侧箭头未朝右：apex=${R.apexX} base=${R.baseX}`);
  // 3) 图标与命中区位置一致（同一侧）
  if (prev[0] && Math.abs(L.centerX - (prev[0].rect.x + prev[0].rect.w / 2)) > 8) {
    fail(`左侧箭头中心 ${L.centerX.toFixed(0)} 与 stagePrev 命中区中心 ${(prev[0].rect.x + prev[0].rect.w / 2).toFixed(0)} 不重合`);
  }
  console.log(`左箭头 apex=${L.apexX} base=${L.baseX}（朝左） 右箭头 apex=${R.apexX} base=${R.baseX}（朝右）`);
}

if (!fails) console.log('PASS 战场切换箭头：左=朝左(prev) / 右=朝右(next)');
process.exit(fails ? 1 : 0);
