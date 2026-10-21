/**
 * sim_combat.js —— 真实战斗路径难度模拟（A1 回归验证）
 * 复用真实代码路径：GameMain.stepEnemies → CombatSystem + WaveDirector + Run，
 * 验证「真实单体攻击节奏」下难度曲线是否成立（对比抽象口径破防波次基线 ~14）。
 * 运行：node tools/sim_combat.js
 */
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; },
  setStorageSync(k, v) { store[k] = v; },
};
const ctx2d = new Proxy({}, { get() { return () => undefined; }, set() { return true; } });
global.canvas = { width: 375, height: 667, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const CONFIG = require('../js/config.js');

function runSim(seed, maxWave) {
  const rng = (() => { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  // v1.16.5 确定性修复：战斗概率（combat.js 的 Math.random）也走种子，消除跑间随机噪声
  const origRandom = Math.random;
  Math.random = rng;
  const run = game.run;
  run.rng = rng;
  run._weights = run._weightsFor();
  run._directDone = 0;
  game.state = 'fighting';
  const rows = [];
  let w = 0;
  const SHAPE_SIZE = { '3': 3, '4': 4, L5: 5, '5': 5 };
  while (w < maxWave) {
    game.wave.start();
    w = run.wave;
    // 波内 5 次消除（对齐 simulateRun 操作模型）
    for (let i = 0; i < CONFIG.WAVE.matchesPerWave; i++) {
      const r = rng();
      let shape = '3';
      if (r < CONFIG.WAVE.matchDist['3'] + CONFIG.WAVE.matchDist['4']) shape = r < CONFIG.WAVE.matchDist['3'] ? '3' : '4';
      else shape = (r < CONFIG.WAVE.matchDist['3'] + CONFIG.WAVE.matchDist['4'] + CONFIG.WAVE.matchDist['L5']) ? 'L5' : '5';
      let color;
      if (run._directDone < CONFIG.DIRECT_FIRST && run._directDone < run._directSeq.length) color = run._directSeq[run._directDone++];
      else color = run._pickColor();
      run.applyMatch(color, shape, SHAPE_SIZE[shape]);
    }
    // 战斗直到清场（真实波次口径：#7 打完怪才算波完成）；超时 80s 视为守不住
    const dt = 1 / 60;
    let kills = 0, reachedWall = 0;
    let t = 0;
    const maxT = 80;
    const wallLine = game.ly.wallY - 10;
    let cleared = false;
    while (t < maxT && !run.broken) {
      const preCount = game.enemies.length;
      game.wave.tick(dt);
      game.stepEnemies(dt);
      if (game.enemies.length < preCount) kills += preCount - game.enemies.length;
      reachedWall = game.enemies.filter((e) => e.y >= wallLine).length;
      t += dt;
      if (game.wave.plan.length === 0 && game.enemies.length === 0) { cleared = true; break; }
    }
    if (cleared) t -= dt; // 减去多走的一帧
    // 波末：三选一自动 + 结算（真实路径跳过抽象漏怪扣血）
    run.effects.settleAuto();
    const res = run.endWave(true);
    const lv = (k) => run.effects.tower(k) ? run.effects.tower(k).level : 0;
    rows.push({
      wave: w,
      fire: lv('fire'), ice: lv('ice'), poison: lv('poison'), electric: lv('electric'), boomerang: lv('boomerang'),
      line: Math.round(run.lineHp), kills, reachedWall, clearSec: Math.round(t * 10) / 10,
      boss: game.wave.hasBoss, cleared,
    });
    if (run.broken) break;
  }
  Math.random = origRandom;
  return { breakWave: run.broken ? run.wave : null, rows };
}

const seeds = [1, 7, 20261017, 42, 99, 555];
const all = seeds.map((s) => runSim(s, 20));
console.log('种子 | 破防波次 | 各波 [波次:城墙hp/清场秒/击杀/到墙怪]');
all.forEach((res, i) => {
  const chain = res.rows.map((r) => `${r.wave}:${r.line}/${r.clearSec}/${r.kills}/${r.reachedWall}${r.cleared ? '' : '×'}`).join(' ');
  console.log(`  #${seeds[i]} | ${res.breakWave === null ? '20+未破' : res.breakWave} | ${chain}`);
});
// 汇总节奏：前 5 波城墙平均剩余
const early = all.flatMap((r) => r.rows.filter((x) => x.wave <= 5).map((x) => x.line));
const mid = all.flatMap((r) => r.rows.filter((x) => x.wave >= 6 && x.wave <= 10).map((x) => x.line));
console.log(`\n前5波城墙剩余均值 ${Math.round(early.reduce((a, b) => a + b, 0) / early.length)} / 2000`);
console.log(`6-10波城墙剩余均值 ${Math.round(mid.reduce((a, b) => a + b, 0) / mid.length)} / 2000`);
console.log(`破防波次分布: ${all.map((r) => r.breakWave).join(', ')}`);
