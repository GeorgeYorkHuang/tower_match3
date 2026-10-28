// v1.17.21 结算页全屏三段式骨架回归：舞台/绶带/标题/meta + 深度轨迹（比例/钳制/标签错行）+ 演出门控 + 点击跳过 + 按钮命中
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

// x(wave) = 70 + clamp(wave,0,50)/50 × 610（CONFIG.GO.TRAIL）
const TR = (() => { const c = require('../js/config.js'); return c.GO ? c.GO.TRAIL : null; })();
ok(TR && TR.x0 === 70 && TR.x1 === 680 && TR.lineY === 404 && TR.waveMax === 50, 'CONFIG.GO.TRAIL 常量在位');
const fx = (w) => 70 + 610 * Math.min(1, Math.max(0, w / 50));

const suBase = {
  payout: 500, miles: ['30 波'], chestGranted: true, chestKey: 'silver', chestName: '白银宝箱', chestSkipped: false,
  shards: 3, depthMult: 1.3, silver: 100, goldBonus: 0.2, kills: 88,
  relics: [{ id: '_t_a' }, { id: '_t_b' }], shardDetail: { _t_a: 2, _t_b: 1 },
};
const btn = {};
const draw = (su, goT) => { texts.length = 0; draws.length = 0; game.renderer.gameOver(ctx2d, { summary: su, goT }, btn); };

// ---- A. 撤离成功 wave=32：终态全元素 + 轨迹比例 + 标签错行（32 与 30 波节点 x 距 24.4 < 34 → 下移第二行 y=492）----
const suWin = Object.assign({}, suBase, { evacuated: true, wave: 32 });
draw(suWin, 99999);
ok(has('撤离成功'), 'A 主标题=撤离成功');
ok(has('抵达第 32 波 · 深度倍率 ×1.30 · 总击杀 88'), 'A meta 行');
['10波', '20波', '30波', '40波', '50波'].forEach((m) => ok(has(m), `A 里程碑节点标签 ${m}`));
ok(has('32波 · 撤离'), 'A 终点标签');
ok(Math.abs(at('30波').x - fx(30)) < 0.6 && Math.abs(at('40波').x - fx(40)) < 0.6, 'A 节点 x 比例正确');
ok(Math.abs(at('32波 · 撤离').x - fx(32)) < 0.6, 'A 终点 x 随波次比例');
ok(at('32波 · 撤离').y === 492, 'A 与 30 波节点过近 → 标签下移错行(y=492)');
ok(at('30波').y === 438, 'A 节点标签在线下第一行(y=438)');
ok(has('×2') && has('×1') && has('×600'), 'A 碎片明细胶囊 ×2/×1 + 金币 ×600');
ok(has('— 圣遗物收获 —') && has('里程碑首达'), 'A 战利品标题/里程碑行');
ok(typeof btn.hit === 'function' && btn.hit(100, 1220) && !btn.hit(700, 1220), 'A 再来一局命中区 40..360');
ok(typeof btn.toMenu === 'function' && btn.toMenu(500, 1220) && !btn.toMenu(200, 1220), 'A 返回主界面命中区 390..710');

// ---- B. 失守 wave=26：红题 + 终点标签不与 20/30 节点过近（最近差 48.8）→ 常规行 y=464 ----
const suLose = Object.assign({}, suBase, { evacuated: false, wave: 26 });
draw(suLose, 99999);
ok(has('防线失守'), 'B 主标题=防线失守');
ok(has('26波 · 失守'), 'B 终点标签');
ok(Math.abs(at('26波 · 失守').x - fx(26)) < 0.6 && at('26波 · 失守').y === 464, 'B 无邻近节点 → 常规行 y=464');

// ---- C. 波次 60：x 钳制在 680，标签显示真实波次；与 50 波节点重合 → 错行 ----
const suOver = Object.assign({}, suBase, { evacuated: true, wave: 60 });
draw(suOver, 99999);
ok(Math.abs(at('60波 · 撤离').x - 680) < 0.6, 'C 波次>50 → x 钳制 680');
ok(at('60波 · 撤离').y === 492, 'C 与 50 波节点重合 → 错行');
ok(has('50波'), 'C 50 波节点仍在');

// ---- D. 波次 7（未达任何里程碑）：全部空心节点，终点标签常规行 ----
const suEarly = Object.assign({}, suBase, { evacuated: false, wave: 7 });
draw(suEarly, 99999);
ok(has('7波 · 失守') && at('7波 · 失守').y === 464, 'D 早期失守终点标签常规行');
ok(Math.abs(at('7波 · 失守').x - fx(7)) < 0.6, 'D 早期 x 比例');

// ---- E. 演出门控：300ms 只有头部；1200ms 轨迹完、碎片/里程碑未出；终态全出 ----
draw(suWin, 300);
ok(has('撤离成功') && !has('20波') && !has('×2') && !has('里程碑首达'), 'E T=300 仅头部，轨迹/碎片/里程碑未出');
draw(suWin, 1200);
ok(has('20波') && has('32波 · 撤离') && !has('×2') && !has('里程碑首达') && !has('×600'), 'E T=1200 轨迹完、碎片/金币/里程碑未出');
draw(suWin, 99999);
ok(has('×2') && has('里程碑首达') && has('再来一局'), 'E 终态全出');

// ---- F. 空圣遗物：占位文案 ----
draw(Object.assign({}, suBase, { evacuated: true, wave: 12, relics: [] }), 1400);
ok(has('本局未获得圣遗物'), 'F 0 件圣遗物有空态文案');

// ---- G. 点击跳过：首点置 skip 吞掉，goT 传 99999；finishRun 重置 ----
game.state = 'gameover'; game.runSummary = suWin; game.gameoverSkip = false; game.restartBtn = {};
game.dispatchTouch({ x: 375, y: 600 });
ok(game.gameoverSkip === true, 'G 首点任意处置 gameoverSkip=true');
game.dispatchTouch({ x: 375, y: 600 });
ok(game.gameoverSkip === true && game.state === 'gameover', 'G 二次点击不误触（未命中按钮）');
game.state = 'evacuation'; game.run.wave = 10; game.depthPool = 500; game.meta.gold = 1000;
game.finishRun(true);
ok(game.state === 'gameover' && game.gameoverSkip === false, 'G finishRun 重置 gameoverSkip');

console.log(`PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
