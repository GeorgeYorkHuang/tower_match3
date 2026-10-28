// v1.17.22 结算页回归：3 大卡（居中/稀有度胶囊/碎片滚动/折叠）+ 账单四态 + 里程碑条 + 全歼波数口径（通关数=完全击败的波数）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
};
const texts = [];
const draws = [];   // {s,x,y} 每一次 fillText
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
    if (k === 'fillText') return (s, x, y) => { const str = String(s); texts.push(str); draws.push({ s: str, x, y }); };
    return () => undefined;
  },
  set() { return true; },
});
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const has = (s) => draws.some((d) => d.s === s);
const at = (s) => draws.find((d) => d.s === s) || {};

const TR = (() => { const c = require('../js/config.js'); return c.GO ? c.GO.TRAIL : null; })();
ok(TR && TR.x0 === 70 && TR.x1 === 680 && TR.lineY === 404 && TR.waveMax === 50, 'CONFIG.GO.TRAIL 常量在位');
const fx = (w) => 70 + 610 * Math.min(1, Math.max(0, w / 50));

const suBase = {
  payout: 500, miles: ['30 波'], chestGranted: true, chestKey: 'silver', chestName: '白银宝箱', chestSkipped: false,
  shards: 3, depthMult: 1.3, silver: 100, goldBonus: 0.2, kills: 88,
  relics: [{ id: '_t_a' }, { id: '_t_b' }], shardDetail: { _t_a: 2, _t_b: 1 },
  relicCards: [
    { id: '_t_a', rarity: 'ssr', star: 2, shards: 2 },
    { id: '_t_b', rarity: 'sr', star: 1, shards: 1 },
  ],
};
const btn = {};
const draw = (su, goT) => { texts.length = 0; draws.length = 0; game.renderer.gameOver(ctx2d, { summary: su, goT }, btn); };

// ---- A. 撤离成功 cleared=32：终态全元素 + 轨迹比例 + 标签错行 + 大卡 + 账单 ----
const suWin = Object.assign({}, suBase, { evacuated: true, wave: 32, cleared: 32 });
draw(suWin, 99999);
ok(has('撤离成功'), 'A 主标题=撤离成功');
ok(has('全歼 32 波 · 深度倍率 ×1.30 · 总击杀 88'), 'A meta 行=全歼口径');
ok(!has('抵达第 32 波 · 深度倍率 ×1.30 · 总击杀 88'), 'A 不再使用「抵达第 X 波」');
['10波', '20波', '30波', '40波', '50波'].forEach((m) => ok(has(m), `A 里程碑节点标签 ${m}`));
ok(has('32波 · 撤离'), 'A 终点标签');
ok(Math.abs(at('30波').x - fx(30)) < 0.6 && Math.abs(at('40波').x - fx(40)) < 0.6, 'A 节点 x 比例正确');
ok(at('32波 · 撤离').y === 492, 'A 与 30 波节点过近 → 标签下移错行(y=492)');
ok(has('SSR · 2★') && has('SR · 1★'), 'A 稀有度胶囊（大卡）');
ok(has('×2') && has('×1') && has('×600'), 'A 卡内碎片 ×2/×1 + 账单金币 ×600');
ok(has('已存入仓库') && has('白银宝箱'), 'A 账单右卡=已存入四态');
ok(has('— 圣遗物收获 —') && has('里程碑首达 30 波'), 'A 战利品标题/里程碑条');
ok(typeof btn.hit === 'function' && btn.hit(100, 1220) && !btn.hit(700, 1220), 'A 再来一局命中区 40..360');
ok(typeof btn.toMenu === 'function' && btn.toMenu(500, 1220) && !btn.toMenu(200, 1220), 'A 返回主界面命中区 390..710');

// ---- A2. 通关数≠到达波次：cleared=31 / wave=33 → 轨迹与 meta 按 31 ----
const suA2 = Object.assign({}, suBase, { evacuated: false, wave: 33, cleared: 31 });
draw(suA2, 99999);
ok(has('全歼 31 波 · 深度倍率 ×1.30 · 总击杀 88'), 'A2 meta 按全歼 31 波');
ok(Math.abs(at('31波 · 失守').x - fx(31)) < 0.6, 'A2 终点 x 按全歼 31 波比例');

// ---- B. 失守 wave=26/cleared=26：终点标签不与 20/30 节点过近 → 常规行 y=464 ----
const suLose = Object.assign({}, suBase, { evacuated: false, wave: 26, cleared: 26 });
draw(suLose, 99999);
ok(has('防线失守') && has('26波 · 失守'), 'B 失守主标题/终点标签');
ok(Math.abs(at('26波 · 失守').x - fx(26)) < 0.6 && at('26波 · 失守').y === 464, 'B 无邻近节点 → 常规行 y=464');

// ---- C. 波次钳制（cleared=60）----
draw(Object.assign({}, suBase, { evacuated: true, wave: 60, cleared: 60 }), 99999);
ok(Math.abs(at('60波 · 撤离').x - 680) < 0.6 && at('60波 · 撤离').y === 492, 'C cleared>50 → x 钳制 680 + 错行');

// ---- D. 早期失守（cleared=7）----
draw(Object.assign({}, suBase, { evacuated: false, wave: 7, cleared: 7 }), 99999);
ok(has('7波 · 失守') && at('7波 · 失守').y === 464 && Math.abs(at('7波 · 失守').x - fx(7)) < 0.6, 'D 早期终点标签常规行');

// ---- E. 演出门控 + 碎片数字滚动 ----
draw(suWin, 300);
ok(has('撤离成功') && !has('20波') && !has('×2') && !has('里程碑首达 30 波') && !has('SSR · 2★'), 'E T=300 仅头部');
draw(suWin, 1200);
ok(has('20波') && has('32波 · 撤离') && !has('×2') && !has('×600'), 'E T=1200 轨迹完、卡/账单未出');
draw(suWin, 1450);
ok(has('SSR · 2★') && !has('×2'), 'E T=1450 卡已弹入、碎片数字滚动未到 2（显示 0）');
draw(suWin, 99999);
ok(has('×2') && has('×600') && has('里程碑首达 30 波') && has('再来一局'), 'E 终态全出');

// ---- F. 折叠：5 件 → 显示 3 卡 + 「本局共 5 件」 ----
draw(Object.assign({}, suBase, {
  evacuated: true, wave: 20, cleared: 20,
  relicCards: [
    { id: '_t_a', rarity: 'ssr', star: 2, shards: 2 },
    { id: '_t_b', rarity: 'sr', star: 1, shards: 1 },
    { id: '_t_c', rarity: 'r', star: 0, shards: 0 },
    { id: '_t_d', rarity: 'r', star: 0, shards: 0 },
    { id: '_t_e', rarity: 'r', star: 0, shards: 0 },
  ],
}), 99999);
ok(has('本局共 5 件'), 'F 折叠提示');

// ---- G. 账单宝箱四态 ----
draw(Object.assign({}, suBase, { evacuated: false, wave: 2, cleared: 2, chestSkipped: true, chestGranted: false, chestName: null, chestKey: null }), 99999);
ok(has('本局无宝箱') && has('前三波阵亡 · 无深度宝箱'), 'G1 skipped=本局无宝箱');
draw(Object.assign({}, suBase, { evacuated: false, chestGranted: false, chestName: '黄金宝箱', chestKey: 'gold', chestSkipped: false }), 99999);
ok(has('仓库已满 · 未领取'), 'G2 槽满=仓库已满（不出现已存入）');
draw(Object.assign({}, suBase, { evacuated: true, chestGranted: true, chestExtra: '白银宝箱', chestKey: 'star', chestName: '星辉宝箱' }), 99999);
ok(has('已入库 · 加发白银宝箱'), 'G3 加发态');

// ---- H. 里程碑空态 ----
draw(Object.assign({}, suBase, { evacuated: true, wave: 12, cleared: 12, miles: [] }), 99999);
ok(has('本局无新里程碑'), 'H 里程碑空态');

// ---- I. 空圣遗物 ----
draw(Object.assign({}, suBase, { evacuated: true, wave: 12, cleared: 12, relics: [], relicCards: [] }), 1400);
ok(has('本局未获得圣遗物'), 'I 0 件空态');

// ---- J. 全歼波数统计（_tallyWaveDeaths 单元测试）----
game._waveAlive = { 3: 2, 5: 1, 6: 1 };
game._waveCleared = {};
game.run.clearedWaves = 0;
game.run.wave = 5; game.wave.plan = [];
game._tallyWaveDeaths([{ waveNo: 3 }, { waveNo: 3 }]);
ok(game.run.clearedWaves === 1, 'J1 第 3 波两怪死 → 全歼 +1');
game._tallyWaveDeaths([{ waveNo: 3 }]);
ok(game.run.clearedWaves === 1, 'J2 已记全歼的波不重复计数');
game._tallyWaveDeaths([{ waveNo: 5 }]);
ok(game.run.clearedWaves === 2, 'J3 当前波怪全死且投放完毕(plan 空) → 计入');
game.run.wave = 6; game.wave.plan = [{}, {}];   // 第 6 波还在投放
game._tallyWaveDeaths([{ waveNo: 6 }]);
ok(game.run.clearedWaves === 2, 'J4 当前波投放未完 → 暂不计入');
game.wave.plan = [];                              // 投放完毕后最后一只死亡
game._waveAlive[6] = 1;                           // 模拟后续投放再入 1 只
game._tallyWaveDeaths([{ waveNo: 6 }]);
ok(game.run.clearedWaves === 3, 'J5 投放完毕后清光 → 计入');
game.run.wave = 8; game.wave.plan = [{}];
game._waveAlive[7] = 1;                           // 第 7 波残怪 1 只仍在场上（出怪时已登记）
game._tallyWaveDeaths([{ waveNo: 7 }]);           // 第 7 波残怪在第 8 波期间死光（叠加波）
ok(game.run.clearedWaves === 4, 'J6 叠加波：前波残怪清光 → 计入第 7 波');

// ---- K. 点击跳过链路（v1.17.21 保持）----
game.state = 'gameover'; game.runSummary = suWin; game.gameoverSkip = false; game.restartBtn = {};
game.dispatchTouch({ x: 375, y: 600 });
ok(game.gameoverSkip === true, 'K 首点任意处置 gameoverSkip=true');
game.dispatchTouch({ x: 375, y: 600 });
ok(game.gameoverSkip === true && game.state === 'gameover', 'K 二次点击不误触');
game.state = 'evacuation'; game.run.wave = 10; game.depthPool = 500; game.meta.gold = 1000;
game.finishRun(true);
ok(game.state === 'gameover' && game.gameoverSkip === false, 'K finishRun 重置 gameoverSkip');
ok(typeof game.runSummary.cleared === 'number', 'K runSummary.cleared 在位');
ok(Array.isArray(game.runSummary.relicCards), 'K runSummary.relicCards 在位');

console.log(`PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
