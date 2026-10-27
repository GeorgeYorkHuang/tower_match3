// v1.17 回归测试：①三选一重掷（200/400/800/1600 计费/上限/金币不足）②击杀金币等级系数（50波≈2倍）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = {};
const wxHandlers = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; }, onTouchMove(fn) { wxHandlers.move = fn; }, onTouchEnd(fn) { wxHandlers.end = fn; },
};
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
    return () => undefined;
  },
  set() { return true; },
});
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const CONFIG = require('../js/config.js');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

/* ---------- ① 击杀金币等级系数 ---------- */
console.log('[1] 击杀金币等级系数');
const K = CONFIG.KILL_DROP;
ok(K.killGold[0] === 5 && K.killGold[1] === 10, '基础区间 5~10');
ok(K.goldLevelMult(1) === 1.0, 'Lv1 系数 1.0');
ok(K.goldLevelMult(5) === 1.5, 'Lv5 系数 1.5');
ok(K.goldLevelMult(9) === 2.0, 'Lv9 系数 2.0');
ok(Math.abs(K.goldLevelMult(10) - 2.125) < 1e-9, 'Lv10 系数 2.125');
// 波50 mix = Lv9 60% + Lv10 40% → 平均系数 ≈ 2.05（用户目标：波1 的 ~2 倍）
const mix40 = CONFIG.ENEMY.levelMix(40);
const avgK = mix40.reduce((s, lv) => s + K.goldLevelMult(lv), 0) / mix40.length;
ok(Math.abs(avgK - 2.05) < 0.01, `波40 平均系数 ${avgK.toFixed(3)} ≈ 2.05（≈波1 的 2 倍）`);
// 单怪收益区间：Lv1 5~10、Lv9 10~20（×系数后）
ok(K.goldLevelMult(1) * K.killGold[0] === 5 && K.goldLevelMult(1) * K.killGold[1] === 10, 'Lv1 单怪 5~10');
ok(K.goldLevelMult(9) * K.killGold[0] === 10 && K.goldLevelMult(9) * K.killGold[1] === 20, 'Lv9 单怪 10~20');
ok(K.eliteGoldMult === 3 && K.bossGoldMult === 8, '精英×3 / Boss×8');

/* ---------- ② 重掷费用配置 ---------- */
console.log('[2] 重掷费用档');
ok(JSON.stringify(CONFIG.RELIC_REROLL.costs) === '[200,400,800,1600]', '费用 200/400/800/1600 指数增长');

/* ---------- ③ 重掷逻辑（真实 game） ---------- */
console.log('[3] rerollRelicPick 计费/上限/不足');
// 初始候选（构造三选一窗口）
game.relicPick = { candidates: [{ id: 'a', name: 'A', icon: 'x', desc: 'd', run: true }, { id: 'b', name: 'B', icon: 'x', desc: 'd', run: true }, { id: 'c', name: 'C', icon: 'x', desc: 'd', run: true }], star3: false };
game.relicPickHits = [];
game.run.gold = 500;
// 第一次重掷：200
const oldCands = game.relicPick.candidates;
ok(game.rerollRelicPick() === true, '第1次重掷成功');
ok(game.run.gold === 300, `扣 200 → gold=300 实际 ${game.run.gold}`);
ok(game.relicPick.rerolls === 1, 'rerolls=1');
ok(game.relicPick.candidates.length === 3, '重掷后仍有 3 个候选');
// 第二次：400（补足金币到 800）
game.run.gold += 500;
ok(game.rerollRelicPick() === true, '第2次重掷成功（400）');
ok(game.run.gold === 400, `扣 400 → gold=400 实际 ${game.run.gold}`);
ok(game.relicPick.rerolls === 2, 'rerolls=2');
// 第三次：金币不足（gold=100 < 800）→ 拒绝，不扣费不换候选
game.run.gold = 100;
const c2 = game.relicPick.candidates;
ok(game.rerollRelicPick() === false, '金币不足拒绝');
ok(game.relicPick.candidates === c2, '不足时不刷新候选');
ok(game.relicPick.rerolls === 2, '不足时不加次数');
// 第四次（补足金币）：800
game.run.gold = 2000;
ok(game.rerollRelicPick() === true, '第3次重掷成功（800）');
ok(game.run.gold === 1200, `扣 800 → gold=1200 实际 ${game.run.gold}`);
ok(game.relicPick.rerolls === 3, 'rerolls=3');
// 第五次：1600（最后一次，补足金币到 3000）
game.run.gold += 1800;
ok(game.rerollRelicPick() === true, '第4次重掷成功（1600）');
ok(game.run.gold === 1400, `扣 1600 → gold=1400 实际 ${game.run.gold}`);
ok(game.relicPick.rerolls === 4, 'rerolls=4');
// 第六次：达上限拒绝
ok(game.rerollRelicPick() === false, '达上限拒绝');
ok(game.relicPick.rerolls === 4, '上限后次数不再增加');

/* ---------- ④ 候选抽取（普通模式返回 ≤3） ---------- */
console.log('[4] _rollRelicCandidates 候选池');
const cands = game._rollRelicCandidates(false);
ok(Array.isArray(cands) && cands.length >= 1 && cands.length <= 3, `普通模式候选 ${cands ? cands.length : 0} 个（1~3）`);
if (cands && cands.length) {
  ok(cands.every((c) => c.id && c.name && c.desc && c.run === true), '候选字段齐全（id/name/desc/run）');
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
