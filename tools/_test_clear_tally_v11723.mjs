// v1.17.23 修复回归：全歼波数恒 0 + 总击杀恒 0
// 根因 1：combat.update 末尾把尸体 filter 掉（combat.js 死亡清场），main.stepEnemies 里挂了
//         _tallyWaveDeaths 的那处过滤永远看不到死亡 → clearedWaves 恒 0（轨迹条不走、通关数恒「全歼 0 波」）。
//         修复：combat 死亡清场处先归集死亡再回调 game._tallyWaveDeaths。
// 根因 2：combat.kills 只在 reset 初始化、从不自增 → 结算页「总击杀」自 v1.16.106 起恒 0。
//         修复：damage() 致死按 srcKey 计数；腐化3★致死（不走 damage()）归毒塔。
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
};
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
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

// ---- A. 有塔整波全歼 → clearedWaves=1 ----
game.newRun();
game.run.slotOrder = ['fire'];
game.wave.start();
for (let f = 0; f < 400 && (game.wave.plan.length || game.enemies.length); f++) {
  game.wave.tick(2.0);
  game.enemies.forEach((e) => { e.hp = 0; });
  game.stepEnemies(0.016);
}
ok(game.run.clearedWaves === 1, `A 整波全歼计 1（实际 ${game.run.clearedWaves}）`);

// ---- B. 投放未完不计数（当前波怪死光但 plan 还有 → 暂不计） ----
game.newRun();
game.run.slotOrder = ['fire'];
game.wave.start();
game.wave.tick(2.0);                                   // 只投一批（plan 尚有余量）
game.enemies.forEach((e) => { e.hp = 0; });
game.stepEnemies(0.016);
ok(game.run.clearedWaves === 0, `B 投放未完 → 不计全歼（实际 ${game.run.clearedWaves}）`);
// 后续投放重新登记存活，投完全歼后才计
for (let f = 0; f < 400 && (game.wave.plan.length || game.enemies.length); f++) {
  game.wave.tick(2.0);
  game.enemies.forEach((e) => { e.hp = 0; });
  game.stepEnemies(0.016);
}
ok(game.run.clearedWaves === 1, `B 补投后全歼 → 计 1（实际 ${game.run.clearedWaves}）`);

// ---- C. 跨波残怪：第 1 波留 1 只拖到第 2 波才死 → 计入第 1 波；第 2 波投完全歼 → 计入第 2 波 ----
game.newRun();
game.run.slotOrder = ['fire'];
game.wave.start();
for (let f = 0; f < 400 && game.wave.plan.length; f++) {
  game.wave.tick(2.0);
  game.enemies.filter((e) => e.hp > 0).slice(1).forEach((e) => { e.hp = 0; });   // 留第一只
}
game.stepEnemies(0.016);
ok(game.run.clearedWaves === 0, `C1 残怪未清 → 不计（实际 ${game.run.clearedWaves}）`);
game.wave.start(true);                                 // 叠加波：保留残怪
game.wave.tick(2.0);
ok(game.enemies.some((e) => e.waveNo === 2), 'C2 第 2 波怪 waveNo=2');
game.enemies.filter((e) => e.waveNo === 1).forEach((e) => { e.hp = 0; });
game.stepEnemies(0.016);
ok(game.run.clearedWaves === 1, `C3 前波残怪死光 → 计入第 1 波（实际 ${game.run.clearedWaves}）`);
for (let f = 0; f < 400 && (game.wave.plan.length || game.enemies.some((e) => e.hp > 0)); f++) {
  game.wave.tick(2.0);
  game.enemies.forEach((e) => { e.hp = 0; });
  game.stepEnemies(0.016);
}
ok(game.run.clearedWaves === 2, `C4 第 2 波计满（实际 ${game.run.clearedWaves}）`);

// ---- D. 击杀归属：damage() 致死 → kills[srcKey]++；汇总 = 结算页「总击杀」 ----
game.combat.kills = {};
const dummy = { hp: 10, maxHp: 100, armor: 0, dots: [], id: 999, x: 0, y: 0, corrode: null, _mark: 0 };
game.combat.damage(dummy, 999, 'electric');
ok(game.combat.kills.electric === 1, `D damage 致死归属 electric（${JSON.stringify(game.combat.kills)}）`);
const ks = Object.values(game.combat.kills).reduce((a, b) => a + b, 0);
ok(ks === 1, `D 总击杀汇总=${ks}（修复前恒 0）`);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
