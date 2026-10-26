// v1.16.117 结算界面重做回归：圣遗物核心化（图标逐个弹出 → 碎片居中 → 次要收益最后淡入）
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
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
    if (k === 'fillText') return (s) => { texts.push(String(s)); };
    return () => undefined;
  },
  set() { return true; },
});
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const CONFIG = require('../js/config.js');

const su = {
  evacuated: true, wave: 10, payout: 500, miles: ['10 波'],
  chestName: '白银宝箱', chestGranted: true, chestSkipped: false,
  shards: 32, depthMult: 1.3, silver: 1200, goldBonus: 0.2, kills: 88,
  relics: [{ icon: '🔥' }, { icon: '❄️' }, { icon: '☠️' }],
};
const btn = {};
const draw = (goT) => { texts.length = 0; game.renderer.gameOver(ctx2d, { summary: su, goT }, btn); };

// ---- 动画分镜：T=300 时仅首个圣遗物已弹出，碎片/银币未出现 ----
draw(300);
const j300 = texts.join('|');
if (!j300.includes('🔥')) { console.error('FAIL: 首个圣遗物图标未弹出'); process.exit(1); }
if (j300.includes('❄️') || j300.includes('☠️')) { console.error('FAIL: 圣遗物未按顺序逐个弹出'); process.exit(1); }
if (j300.includes('圣遗物碎片') || j300.includes('深度结算')) { console.error('FAIL: 收益不应早于圣遗物出现'); process.exit(1); }
console.log('T=300ms 分镜 OK：圣遗物逐个弹出，收益未出现');

// ---- 动画结束后：全部元素在位 ----
draw(99999);
const j = texts.join('|');
const need = ['撤离成功', '— 圣遗物收获 —', '🔥', '❄️', '☠️', '圣遗物碎片 +32', '深度结算', '局内金币折算', '里程碑首达', '深度宝箱', '白银宝箱', '再来一局', '返回主界面'];
const miss = need.filter((n) => !j.includes(n));
if (miss.length) { console.error('FAIL missing:', miss.join(',')); process.exit(1); }
if (typeof btn.hit !== 'function' || typeof btn.toMenu !== 'function') { console.error('FAIL: 结算按钮命中区未注册'); process.exit(1); }
console.log('终态元素 OK：圣遗物图标 ×3 / 碎片居中胶囊 / 次要收益行 / 双按钮命中区');

// ---- finishRun 应记录动画时间基准 ----
game.state = 'evacuation';
game.run.wave = 10;
game.depthPool = 500;
game.meta.gold = 1000;
game.finishRun(true);
if (typeof game.gameoverAt !== 'number' || game.state !== 'gameover') {
  console.error(`FAIL: finishRun 未设置 gameoverAt/state=${game.state}`);
  process.exit(1);
}
console.log('finishRun → gameoverAt 已记录，state=gameover');
console.log('PASS');
