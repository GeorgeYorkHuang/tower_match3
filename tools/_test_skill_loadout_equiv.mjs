// R2 技能配置页拆分 · 等价性回归
// 做法：同一 mock 状态下，分别跑「render.js 旧方法」与「screens/skill-loadout.js 新模块」，
//       录制全部 canvas 调用序列（方法名 + 参数）与命中区列表，要求逐条完全一致。
// 覆盖：主页两行技能卡（三消/全局）/ 三消三槽面板 / 全局面板 3 页 / 已解锁-未解锁-已选中 三种状态。
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
};
global.canvas = { width: 1125, height: 2001, getContext: () => makeCtx(() => {}), addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};

const { Renderer } = require('../js/game/render.js');
const { createSkillLoadout } = require('../js/game/screens/skill-loadout.js');
const CONFIG = require('../js/config.js');
const GlobalSkills = require('../js/global-skills.js');

/** 录制型 ctx：记录每一次绘制调用（方法名 + 可序列化参数） */
function makeCtx(sink) {
  const grad = (kind) => ({ __grad: kind, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } });
  const handler = {
    get(_t, key) {
      if (key === 'measureText') return (s) => { sink.push(['measureText', String(s)]); return { width: String(s).length * 13 }; };
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...a) => { const g = grad(key); sink.push([key, ...a]); return g; };
      }
      if (key === 'canvas') return global.canvas;
      return (...a) => { sink.push([key, ...a]); };
    },
    set(_t, key, v) { sink.push(['set', key, v]); return true; },
  };
  return new Proxy({ font: '' }, handler);
}

const renderer = new Renderer();
const SL = createSkillLoadout({
  panelShell: renderer._menuPanelShell.bind(renderer),
  skillIcon: renderer._skillIcon.bind(renderer),
  wrapText: renderer.wrapText.bind(renderer),
});

/** 跑一次绘制，返回 {calls, hits} */
const run = (fn) => {
  const calls = [], hits = [];
  const ctx = makeCtx(calls);
  const push = (key, data, x, y, w, h) => hits.push([key, data, x, y, w, h]);
  fn(ctx, push);
  return { calls, hits };
};

let pass = 0, fail = 0;
const diff = (a, b) => {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const sa = JSON.stringify(a[i]), sb = JSON.stringify(b[i]);
    if (sa !== sb) return `#${i}\n  旧: ${sa}\n  新: ${sb}`;
  }
  return null;
};
const cmp = (name, oldRun, newRun) => {
  const d1 = diff(oldRun.calls, newRun.calls);
  const d2 = diff(oldRun.hits, newRun.hits);
  if (d1 || d2) { fail++; console.error(`FAIL ${name}\n  calls: ${d1 || 'OK'}\n  hits: ${d2 || 'OK'}`); }
  else pass++;
};

// ---------- 样例状态 ----------
const mkState = (over = {}) => Object.assign({
  gold: 12345, diamond: 30, tab: 'battle',
  matchSkills: { match4: 'row', match5: 'rainbow', chain: 'attack' },
  globalSkills: { slots: ['shuffle', 'forge'] },
  skillUnlocks: {},
  panel: null,
}, over);

// 1. 主页两行：三消（默认解锁）/ 全局
for (const isMatch of [true, false]) {
  const s = mkState();
  const label = isMatch ? '三消技能' : '全局技能';
  const cfg = isMatch ? s.matchSkills : GlobalSkills.slots(s.globalSkills);
  const y = isMatch ? 990 : 1254;
  const oldRun = run((ctx, push) => renderer._menuSkillCards(ctx, s, push, label, cfg, 55, y, 640, 200, isMatch));
  const newRun = run((ctx, push) => SL.skillCards(ctx, s, push, label, cfg, 55, y, 640, 200, isMatch));
  const wantHits = isMatch ? 3 : 2;   // 三消 3 槽；全局双槽（GlobalSkills.slots 固定 2 个）
  if (oldRun.calls.length < 30 || newRun.hits.length !== wantHits) {
    fail++; console.error(`FAIL skillCards/${label} 未真实绘制（calls=${oldRun.calls.length} hits=${newRun.hits.length}/${wantHits}）`);
  }
  cmp(`skillCards/${label}`, oldRun, newRun);
}

// 2. 主页两行：边界状态（自定义技能 / 槽位缺失 / 未解锁不影响卡片渲染）
{
  const s = mkState({ matchSkills: { match4: 'random', match5: 'ice', chain: 'poison' }, globalSkills: { slots: ['tide', 'heal'] } });
  cmp('skillCards/三消·非默认组合',
    run((ctx, push) => renderer._menuSkillCards(ctx, s, push, '三消技能', s.matchSkills, 55, 990, 640, 200, true)),
    run((ctx, push) => SL.skillCards(ctx, s, push, '三消技能', s.matchSkills, 55, 990, 640, 200, true)));
  cmp('skillCards/全局·非默认组合',
    run((ctx, push) => renderer._menuSkillCards(ctx, s, push, '全局技能', GlobalSkills.slots(s.globalSkills), 55, 1254, 640, 200, false)),
    run((ctx, push) => SL.skillCards(ctx, s, push, '全局技能', GlobalSkills.slots(s.globalSkills), 55, 1254, 640, 200, false)));
}

// 3. 三消三槽面板：默认槽 / 已解锁混合 / 已选中非默认
for (const slot of ['match4', 'match5', 'chain']) {
  const s = mkState({ panel: { type: 'matchCfg', slot }, skillUnlocks: { [slot]: ['ice'] } });
  cmp(`menuMatchCfg/${slot}`,
    run((ctx, push) => renderer.menuMatchCfg(ctx, s, push)),
    run((ctx, push) => SL.menuMatchCfg(ctx, s, push)));
}

// 4. 全局面板：3 页 × 双槽
for (const index of [0, 1]) {
  for (const page of [0, 1, 2]) {
    const s = mkState({ panel: { type: 'globalCfg', index, page }, skillUnlocks: { global: [] } });
    cmp(`menuGlobalCfg/index${index}/page${page}`,
      run((ctx, push) => renderer.menuGlobalCfg(ctx, s, push)),
      run((ctx, push) => SL.menuGlobalCfg(ctx, s, push)));
  }
}

// 5. skillOwned 纯函数一致性
{
  const cases = [
    [{ skillUnlocks: {} }, 'match4', 'row'],
    [{ skillUnlocks: {} }, 'match4', 'ice'],
    [{ skillUnlocks: { match4: ['ice'] } }, 'match4', 'ice'],
    [{ skillUnlocks: { match4: ['ice'] } }, 'match4', 'row'],
    [{ skillUnlocks: { global: ['forge'] } }, 'global', 'shuffle'],
    [{ skillUnlocks: { global: ['forge'] } }, 'global', 'forge'],
  ];
  let bad = 0;
  cases.forEach(([s, slot, id]) => {
    const a = renderer._skillOwned(s, slot, id), b = SL.skillOwned(s, slot, id);
    if (a !== b) { bad++; console.error(`FAIL skillOwned(${slot},${id}) 旧=${a} 新=${b}`); }
  });
  if (bad) fail += bad; else pass++;
}

// 6. 面板外壳缺失保护：未注入 panelShell 时必须显式报错（不允许静默降级）
{
  const naked = createSkillLoadout({});
  let threw = false;
  try { naked.menuMatchCfg(makeCtx([]), mkState({ panel: { slot: 'match4' } }), () => {}); } catch (e) { threw = /panelShell/.test(e.message); }
  if (threw) pass++; else { fail++; console.error('FAIL 未注入 panelShell 时未抛错'); }
}

// 7. 命中区键名与数据形状（引用旧实现为基准，断言新模块命中数一致）
{
  const s = mkState({ panel: { type: 'globalCfg', index: 1, page: 1 } });
  const oldH = run((ctx, push) => renderer.menuGlobalCfg(ctx, s, push)).hits;
  const newH = run((ctx, push) => SL.menuGlobalCfg(ctx, s, push)).hits;
  const keys = (h) => h.map((x) => x[0]).join(',');
  if (keys(oldH) === keys(newH) && newH.filter((h) => h[0] === 'mSkill').length === 6) pass++;
  else { fail++; console.error(`FAIL 命中键序列：旧=[${keys(oldH)}] 新=[${keys(newH)}]`); }
}

// 8. v1.17 视觉验收：面板高度随候选行数自适应（绝对几何锁定）
//    注：Codex 接入后 render 旧方法已委托本模块，第 3/4/7 节变成「自己比自己」，
//    这里改用绝对坐标断言锁住新行为，防止以后回归。
{
  const panelHOf = (r) => {
    for (const c of r.calls) {
      if (c[0] === 'arcTo' && c[1] === 725 && c[3] === 25) return c[2] - 180;   // 面板主体 roundRect（x=25,w=700）
    }
    return -1;
  };
  const want = { match4: 956, match5: 688, chain: 420 };   // 卡区 120+rows*268-16 + 底留白 48（rows=3/2/1）
  let bad = 0;
  for (const slot of Object.keys(want)) {
    const h = panelHOf(run((ctx, push) => SL.menuMatchCfg(ctx, mkState({ panel: { type: 'matchCfg', slot } }), push)));
    if (h !== want[slot]) { bad++; console.error(`FAIL 面板高度 ${slot}: got ${h}, want ${want[slot]}`); }
  }
  // 全局：满页（6 条）保持旧几何 1060 / 翻页键 y=1150；末页（4 条）缩到 792 / 上一页键 y=882
  const g0 = run((ctx, push) => SL.menuGlobalCfg(ctx, mkState({ panel: { type: 'globalCfg', index: 0, page: 0 } }), push));
  const g2 = run((ctx, push) => SL.menuGlobalCfg(ctx, mkState({ panel: { type: 'globalCfg', index: 1, page: 2 } }), push));
  const pagerY = (r) => { const h = r.hits.find((x) => x[0] === 'globalPage'); return h ? h[3] : -1; };
  if (panelHOf(g0) !== 1060) { bad++; console.error(`FAIL 全局满页高度: ${panelHOf(g0)} (want 1060)`); }
  if (pagerY(g0) !== 1150) { bad++; console.error(`FAIL 满页翻页键 y: ${pagerY(g0)} (want 1150)`); }
  if (panelHOf(g2) !== 792) { bad++; console.error(`FAIL 全局末页高度: ${panelHOf(g2)} (want 792)`); }
  if (pagerY(g2) !== 882) { bad++; console.error(`FAIL 末页翻页键 y: ${pagerY(g2)} (want 882)`); }
  if (bad) fail += bad; else pass++;
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
