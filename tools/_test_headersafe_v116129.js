/* v1.16.129 主界面顶部安全区断言
 * 禁用区（750×1626 逻辑坐标，取自真机/设计稿 1:1 测量）：
 *   灵动岛  ISLAND = { x:250, y:22,  w:250, h:74 }  → 底 y=96
 *   微信胶囊 CAPSULE = { x:552, y:100, w:174, h:64 } → 底 y=164
 * 规则：页面顶部的标题与货币不得与上述任一矩形相交；货币胶囊须整体落在 y>=168；
 *       内容首屏（塔图鉴页签行）须在顶部带之下，不压货币胶囊。 */
const { Renderer } = require('../js/game/render.js');

const ISLAND = { x: 250, y: 22, w: 250, h: 74 };
const CAPSULE = { x: 552, y: 100, w: 174, h: 64 };
const HEADER_SAFE_TOP = 168;

function mockCtx() {
  const state = { texts: [], boxes: [], points: [] };
  const ctx = {
    font: '26px sans-serif', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    measureText: (t) => ({ width: String(t).length * 14 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() { state.points = []; },
    moveTo(x, y) { state.points.push([x, y]); },
    lineTo(x, y) { state.points.push([x, y]); },
    arcTo(x1, y1, x2, y2) { state.points.push([x1, y1], [x2, y2]); },
    quadraticCurveTo(x1, y1, x2, y2) { state.points.push([x1, y1], [x2, y2]); },
    bezierCurveTo(a, b, c, d, e, f) { state.points.push([a, b], [c, d], [e, f]); },
    arc(x, y, r) { state.points.push([x - r, y - r], [x + r, y + r]); },
    closePath() {},
    rect(x, y, w, h) { state.points.push([x, y], [x + w, y + h]); },
    fill() {
      if (!state.points.length) return;
      const xs = state.points.map((p) => p[0]), ys = state.points.map((p) => p[1]);
      state.boxes.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    },
    stroke() {}, fillRect() {}, strokeRect() {}, clip() {}, drawImage() {},
    fillText(t, x, y) {
      const m = /(\d+)px/.exec(ctx.font);
      state.texts.push({ t: String(t), x, y, size: m ? +m[1] : 20 });
    },
    strokeText() {},
  };
  return { ctx, state };
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const textBox = (t) => ({ x: t.x - (String(t.t).length * t.size) / 2, y: t.y - t.size * 0.82, w: String(t.t).length * t.size, h: t.size * 1.1 });

let fails = 0;
const fail = (m) => { console.error('FAIL ' + m); fails++; };
const r = new Renderer();
const base = {
  gold: 12345, diamond: 8, stage: 'ancient', chests: 2, chestOpenSec: 30,
  relics: [], daily: { picks: [] }, panel: null, codexSel: 'fire',
  towerCodex: { fire: 1, ice: 1, poison: 1, electric: 1 }, relicStars: {}, runCodex: {}, shards: {}, relicScroll: 0, chestsOpen: 0,
};

for (const tab of ['battle', 'shop', 'relic', 'codex']) {
  const { ctx, state } = mockCtx();
  const items = [];
  const push = (key, data, x, y, w, h) => items.push({ key, data, rect: { x, y, w, h } });
  r.menuLayer(ctx, { ...base, tab }, push);

  // 顶部带（y < 236）内的文字：不得与岛/胶囊相交，且基线必须在各自安全位置
  state.texts.filter((t) => t.y < 236).forEach((t) => {
    const b = textBox(t);
    if (overlap(b, ISLAND)) fail(`[${tab}] 文字「${t.t}」压到灵动岛 (y=${t.y})`);
    if (overlap(b, CAPSULE)) fail(`[${tab}] 文字「${t.t}」压到小程序胶囊 (y=${t.y})`);
    if (t.y < HEADER_SAFE_TOP + 30) fail(`[${tab}] 文字「${t.t}」基线 y=${t.y} 过于靠上（应 ≥ ${HEADER_SAFE_TOP + 30}）`);
  });

  // 顶部带内的填充块（标题/货币胶囊底）不得进岛或进胶囊
  state.boxes.filter((b) => b.y < 236).forEach((b) => {
    if (overlap(b, ISLAND)) fail(`[${tab}] 元素 y=${b.y.toFixed(0)} h=${b.h.toFixed(0)} 压到灵动岛`);
    if (overlap(b, CAPSULE)) fail(`[${tab}] 元素 y=${b.y.toFixed(0)} h=${b.h.toFixed(0)} 压到小程序胶囊`);
  });

  // 货币胶囊：整体在 y>=168，右边缘不越过 660
  const pills = state.boxes.filter((b) => b.y >= HEADER_SAFE_TOP && b.y < 200 && b.h >= 44 && b.h <= 60);
  if (pills.length < 2) fail(`[${tab}] 顶部货币胶囊数量=${pills.length}（应为 2）`);
  pills.forEach((p) => {
    if (p.y < HEADER_SAFE_TOP) fail(`[${tab}] 货币胶囊 top=${p.y.toFixed(0)} 进入 y<${HEADER_SAFE_TOP} 危险带`);
    if (p.x + p.w > 660) fail(`[${tab}] 货币胶囊右边缘 ${(p.x + p.w).toFixed(0)} 越过 660`);
  });
}

// 塔图鉴页签行不得压货币胶囊
{
  const { ctx } = mockCtx();
  const items = r.menuLayer(ctx, { ...base, tab: 'codex' }, []);
  const tabs = items.filter((i) => i.key === 'codexSel');
  if (!tabs.length) fail('塔图鉴缺少塔页签命中区');
  else if (tabs[0].rect.y < 228) fail(`塔页签行 top=${tabs[0].rect.y} 与货币胶囊底部重叠（应 ≥ 228）`);
}

if (!fails) console.log('PASS 顶部安全区：标题/货币避开灵动岛(y<96)与胶囊(y<164)，塔页签行让位到 230');
process.exit(fails ? 1 : 0);
