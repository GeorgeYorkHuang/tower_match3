// v1.17.23 撤离判定改「全歼口径」回归：
// 旧逻辑：波末按到达波次判定（run.wave % 10 === 0）→ 超时叠加波（投放完 3s 残怪保留）同样触发，
//         用户实测「刚进入第 10 波（实际才全歼 7 波）就弹撤离决策」。
// 新逻辑：每 10 波的怪全部击杀完（clearedWaves 跨过 10/20/30…检查点）才在波末判定，
//         深度倍率 ×1.30 同步挂到检查点；「继续前进」后检查点不重复判定。
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

// 真实帧驱动：打 dt 秒；每帧把场上怪杀光（击杀走 combat 统计链路）；picking 弹窗自动消化
const drive = (sec, killAll = true) => {
  let t = 0;
  while (t < sec) {
    if (game.state === 'picking') { game.nextPick(); continue; }
    if (game.state !== 'fighting') break;
    if (killAll) game.enemies.forEach((e) => { e.hp = 0; });
    game.update(0.1);
    t += 0.1;
  }
};

// ---- A. 正常每波全歼：第 10 波清场后才弹撤离决策（旧逻辑在第 10 波超时也会弹） ----
game.newRun();
game.run.slotOrder = ['fire'];
game.wave.start();
drive(3, false);                       // 空转等待首批投放
for (let w = 1; w <= 10; w++) {
  for (let f = 0; f < 600; f++) {
    if (game.state !== 'fighting') break;
    game.wave.tick(2.0);
    game.enemies.forEach((e) => { e.hp = 0; });
    game.stepEnemies(0.016);
    if (!game.enemies.length && !game.wave.plan.length) {
      game.waveEnd();                  // 模拟 update 主循环的 allDead → waveEnd
      break;
    }
  }
  if (game.state === 'picking') { let n = 0; while (game.state === 'picking' && n++ < 30) game.nextPick(); }
  if (game.state === 'evacuation') break;
}
ok(game.state === 'evacuation', `A 每波全歼 → 第 10 波末弹撤离决策（state=${game.state}）`);
ok(game.run.clearedWaves === 10, `A 检查点=全歼 10 波（实际 ${game.run.clearedWaves}）`);
ok(Math.abs(game.depthMult - 1.30) < 1e-9, `A 深度倍率 ×1.30（实际 ${game.depthMult}）`);
ok(game.run._evacSeen === 1, `A 检查点已记录（_evacSeen=${game.run._evacSeen}）`);

// ---- B. 继续前进：第 11 波起残怪不清（clearedWaves 停在 10）→ 第 11 波末不再弹决策 ----
if (game.state === 'evacuation') {
  game.state = 'fighting';
  game.waveClearNext();                // 「继续前进」
  // 第 11 波超时路径：投放完 3s 残怪保留 → waveEnd（不杀怪）
  for (let f = 0; f < 600 && game.state === 'fighting'; f++) game.wave.tick(2.0);
  game.waveEnd();                      // 模拟超时波末
  if (game.state === 'picking') { let n = 0; while (game.state === 'picking' && n++ < 30) game.nextPick(); }
  ok(game.state !== 'evacuation', `B 未跨新检查点 → 不弹决策（state=${game.state}）`);
  ok(game.run._evacSeen === 1, `B 检查点不重复（_evacSeen=${game.run._evacSeen}）`);

  // ---- C. 残怪后续补清跨过 20：第 11 波超时未清（全歼停 10），12 起全歼，第 21 波末跨过 20 → 第二次决策 ×1.30² ----
  for (let w = 12; w <= 21; w++) {
    for (let f = 0; f < 600; f++) {
      if (game.state !== 'fighting') break;
      game.wave.tick(2.0);
      game.enemies.forEach((e) => { e.hp = 0; });
      game.stepEnemies(0.016);
      if (!game.enemies.length && !game.wave.plan.length) { game.waveEnd(); break; }
    }
    if (game.state === 'picking') { let n = 0; while (game.state === 'picking' && n++ < 30) game.nextPick(); }
    if (game.state === 'evacuation') break;
  }
  ok(game.state === 'evacuation', `C 全歼 20 波 → 第二次撤离决策（state=${game.state}）`);
  ok(game.run.clearedWaves >= 20, `C 全歼波数=${game.run.clearedWaves}`);
  ok(Math.abs(game.depthMult - 1.69) < 1e-9, `C 深度倍率 ×1.30²=1.69（实际 ${game.depthMult}）`);
}

// ---- D. 用户场景反演：超时叠加波不清怪 → 不判定撤离（核心回归） ----
game.newRun();
game.run.slotOrder = ['fire'];
game.wave.start();
// 直接快进：把 clearedWaves 拉到 7（前 9 波有 2 波未全歼，残怪在场），wave=10
for (let w = 1; w <= 9; w++) { game.wave.start(w > 1); game.run.clearedWaves = Math.min(7, w - 1); }
game.run.clearedWaves = 7;
game.wave.start(true);                 // 进入第 10 波（叠加保留残怪）
for (let f = 0; f < 600 && game.wave.plan.length; f++) game.wave.tick(2.0);   // 投完不杀
game.waveEnd();                        // 超时波末（旧逻辑在此弹撤离）
ok(game.state !== 'evacuation', `D 全歼 7 波到第 10 波末 → 不弹撤离（state=${game.state}）`);
ok(game.depthMult === 1, `D 未过检查点 → 倍率不变（实际 ${game.depthMult}）`);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
