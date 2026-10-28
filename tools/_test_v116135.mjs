// v1.16.135 回归：①更名深窟远征 ②结算页去 emoji（贴图化）③结算「返回主界面」可点 ④设置音乐开关文案联动
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

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;   // ✦(2726) 有意保留的文本字形，排除在 2600-27BF 之外判断
const hasEmoji = (arr) => arr.filter((s) => {
  const m = s.replace(/✦/g, '');
  return EMOJI.test(m);
});

// ---- ① 主菜单标题更名 ----
game.state = 'menu'; game.menuTab = 'battle';
texts.length = 0;
game.renderer.menuLayer(ctx2d, game.menuState ? game.menuState() : {}, {});
if (!texts.includes('深窟远征')) {
  console.error('FAIL: 主菜单标题未改为「深窟远征」:', texts.slice(0, 20).join('|'));
  process.exit(1);
}
console.log('① 主菜单标题 = 深窟远征 OK');

// ---- ② 结算页无 emoji：圣遗物图案贴图化 + 无 🚪💀🧩🪙📦🏆 ----
const su = {
  evacuated: true, wave: 30, payout: 5000, miles: ['30 波'],
  chestName: '黄金宝箱', chestKey: 'gold', chestGranted: true, chestSkipped: false,
  shards: 32, shardDetail: { fire_seed: 12, ice_spike: 20 }, depthMult: 2.19, silver: 1200, goldBonus: 0.2, kills: 88,
  relics: [{ id: 'fire_seed', icon: '🌱' }, { id: 'ice_spike', icon: '❄️' }],
};
const btn = game.restartBtn = game.restartBtn || {};
texts.length = 0;
game.renderer.gameOver(ctx2d, { summary: su, goT: 99999 }, btn);
const bad = hasEmoji(texts);
if (bad.length) { console.error('FAIL: 结算页仍输出 emoji:', bad.join('|')); process.exit(1); }
const j = texts.join('|');
for (const need of ['撤离成功', '— 圣遗物收获 —', '✦', '里程碑首达', '再来一局', '返回主界面']) {
  if (!j.includes(need)) { console.error('FAIL missing:', need); process.exit(1); }
}
if (typeof btn.hit !== 'function' || typeof btn.toMenu !== 'function') {
  console.error('FAIL: 结算按钮命中函数未注册'); process.exit(1);
}
console.log('② 结算页零 emoji（圣遗物/碎片/金币/宝箱全部图标化）OK');

// ---- ③ 汇总分支「返回主界面」点击生效（回归：toMenu 为函数，旧代码调 .hit 抛 TypeError）----
game.state = 'gameover';
game.dispatchTouch({ x: 518, y: 1145 });   // toMenu 按钮中心 (X2+322+131, Y2+680+32)
if (game.state !== 'menu') { console.error(`FAIL: 返回主界面未生效 state=${game.state}`); process.exit(1); }
console.log('③ 结算页「返回主界面」点击 → 主菜单 OK');

// ---- ③b 兜底分支（无 summary）toMenu 同样生效 ----
game.state = 'gameover'; game.runSummary = null; game.restartBtn = {};
game.renderer.gameOver(ctx2d, { wave: 5, gold: 100, synDoneCount: 1, goT: 99999 }, game.restartBtn);
game.dispatchTouch({ x: 280, y: (1626 - 500) / 2 + 350 + 36 });
if (game.state !== 'menu') { console.error(`FAIL: 兜底分支返回主界面未生效 state=${game.state}`); process.exit(1); }
console.log('③b 兜底分支「返回主界面」OK');

// ---- ④ 设置弹层音乐开关：点击后按钮文案 开↔关 联动 ----
game.state = 'fighting';   // funcLayer 为战斗内弹层（menu 状态会被 onMenuTap 拦截）
game.funcLayer = { type: 'setting', version: 'vT', soundOn: true };
game.funcLayerHits = {};
game.renderer.funcLayer(ctx2d, game.funcLayer, {}, game.funcLayerHits);
if (!game.funcLayerHits.sound) { console.error('FAIL: 声音开关命中区未注册'); process.exit(1); }
const cx = 55 + 400 + 72, cy = (1626 - 500) / 2 + 148 + 28;
game.dispatchTouch({ x: cx, y: cy });
if (game.funcLayer.soundOn !== false || game.meta.soundOn !== false) {
  console.error('FAIL: 点击后 soundOn 未翻转', game.funcLayer.soundOn, game.meta.soundOn);
  process.exit(1);
}
texts.length = 0;
game.renderer.funcLayer(ctx2d, game.funcLayer, {}, game.funcLayerHits);
if (!texts.includes('关')) { console.error('FAIL: 开关文案未随状态变为「关」:', texts.join('|')); process.exit(1); }
game.dispatchTouch({ x: cx, y: cy });
texts.length = 0;
game.renderer.funcLayer(ctx2d, game.funcLayer, {}, game.funcLayerHits);
if (!texts.includes('开')) { console.error('FAIL: 再点一次未变回「开」'); process.exit(1); }
console.log('④ 设置音乐开关文案 开↔关 联动 OK');

console.log('PASS');
