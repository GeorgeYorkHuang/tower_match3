// v1.16.115 重开 bug 回归：第 10 波重新开局必须回到第 1 波 + 局内状态全部归零（旧 bug：清塔却从 11 波继续）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
};
global.canvas = { width: 1125, height: 2001, getContext: () => new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
    return () => undefined;
  },
  set() { return true; },
}), addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;

// 模拟打到第 10 波（撤离点）：波数 10、深度池有账、场上有敌人与塔
game.state = 'gameover';
game.run.wave = 10;
game.depthPool = 500;
game.depthMult = 1.3;
game.runShardGained = 7;
game.battleRelics = [{ id: 'fire_seed' }];
game.enemies = [{ id: 1 }];

const fb0 = game.firstBonus;
game.restart();

const errs = [];
if (game.run.wave !== 1) errs.push(`波数=${game.run.wave}（应为 1，旧 bug 为 11）`);
if (game.depthPool !== 0) errs.push(`深度池=${game.depthPool}（应为 0）`);
if (game.depthMult !== 1) errs.push(`深度倍率=${game.depthMult}（应为 1）`);
if (game.runShardGained !== 0) errs.push(`本局碎片=${game.runShardGained}（应为 0）`);
if (game.battleRelics.length !== 0) errs.push('本局圣遗物未清空');
if (game.enemies.length !== 0) errs.push('敌人未清空');
if (game.run.slotOrder.length !== 0) errs.push('塔位未清空（应由先消 4 色重新决定）');
if (game.state !== 'fighting') errs.push(`state=${game.state}（应为 fighting）`);
if (game.firstBonus !== fb0) errs.push(`每日首战加成被重开消耗：${fb0}→${game.firstBonus}`);
if (game.runSummary !== null) errs.push('结算摘要未清空');

if (errs.length) { console.error('FAIL:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log('重开归零校验 OK：波数 1 / 深度池 0 / 塔·敌人·圣遗物清空 / 首战加成不重复计数');
console.log('PASS');
