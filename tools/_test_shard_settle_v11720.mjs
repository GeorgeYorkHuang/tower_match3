// v1.17.20 碎片局末结算 + 手动解锁 回归测试
// 覆盖：30% 折算张数（floor）/ 随机保留不重不漏 / 额度清空防重复入账 /
//       失守退出兜底 / 碎片不再自动解锁 / 手动解锁扣碎片 / 三选一选中即解锁不被折算回退
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
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' → ' + extra : ''}`); }
};
const eq = (a, b, name) => ok(a === b, name, `期望 ${b} 实际 ${a}`);

const SSR = 'fire_seed';   // 金：解锁阈值 8
const SR = 'fire_core';    // 紫：4
const R = 'zzz_unlisted';  // 蓝（RELIC_RARITY 未列出 → 默认 r）：2

console.log('\n=== 1. 折算张数：floor(总张数 × 0.3) ===');
[[10, 3], [9, 2], [8, 2], [4, 1], [3, 0], [2, 0], [1, 0], [0, 0]].forEach(([raw, wantKept]) => {
  game.runShardDetail = {};
  // 分散到多个 id，验证按「张」抽样
  for (let i = 0; i < raw; i++) {
    const id = i % 3 === 0 ? SSR : (i % 3 === 1 ? SR : R);
    game.runShardDetail[id] = (game.runShardDetail[id] || 0) + 1;
  }
  game.runShardGained = raw;
  const ss = game.settleRunShards(CONFIG.SHARD_SETTLE.deadRatio);
  eq(ss.raw, raw, `raw=${raw} 记账总数正确`);
  eq(ss.kept, wantKept, `raw=${raw} → 保留 ${wantKept} 张`);
  eq(ss.lost, raw - wantKept, `raw=${raw} → 损失 ${raw - wantKept} 张`);
  const sum = Object.values(ss.finalDetail).reduce((a, b) => a + b, 0);
  eq(sum, wantKept, `raw=${raw} 明细合计 == 保留张数`);
  // 保留的 id 必须都来自原始明细
  const bad = Object.keys(ss.finalDetail).filter((id) => !(id in (raw > 0 ? {} : {})) && !['fire_seed', 'fire_core', 'zzz_unlisted'].includes(id));
  ok(bad.length === 0, `raw=${raw} 保留 id 均来自掉落明细`, bad.join(','));
});

console.log('\n=== 2. 撤离全额保留 ===');
game.runShardDetail = { [SSR]: 4, [SR]: 3, [R]: 2 };
game.runShardGained = 9;
const full = game.settleRunShards(1);
eq(full.kept, 9, '撤离 9 张全留');
eq(full.lost, 0, '撤离无损失');
eq(full.finalDetail[SSR], 4, '撤离时各 id 数量不变（SSR）');
eq(full.finalDetail[SR], 3, '撤离时各 id 数量不变（SR）');

console.log('\n=== 3. meta.shards 实收 == 保留张数；重复调用不重复入账 ===');
game.meta.shards = {};
const before = JSON.parse(JSON.stringify(game.meta.shards));
game.runShardDetail = { [SSR]: 5, [SR]: 5 };
game.runShardGained = 10;
const s3 = game.settleRunShards(0.3);
const gained = Object.keys(game.meta.shards).reduce((a, id) => a + game.meta.shards[id], 0)
  - Object.keys(before).reduce((a, id) => a + (before[id] || 0), 0);
eq(gained, s3.kept, 'meta 碎片实收 == 保留张数');
const again = game.settleRunShards(0.3);
eq(again.raw, 0, '二次结算 raw=0（账本已清空）');
eq(again.kept, 0, '二次结算不会重复入账');

console.log('\n=== 4. 中途退出兜底（settleRunShardsOnExit）===');
game.meta.shards = {};
game.runShardDetail = { [SR]: 9 };
game.runShardGained = 9;
game.settleRunShardsOnExit('中途退出');
const exSum = Object.keys(game.meta.shards).reduce((a, id) => a + game.meta.shards[id], 0);
eq(exSum, 2, '中途退出 9 张按 30% 入账 2 张（不凭空丢失）');
eq(game.runShardGained, 0, '退出后账本清零');

console.log('\n=== 5. 碎片不再自动解锁 ===');
game.meta.shards = {};
game.meta.runCodex = {};
game.meta.relicStars = {};
game.meta.addShard(SSR, 8);
eq(game.meta.starOf(SSR), 0, '碎片凑到 8 张不自动解锁');
ok(game.meta.canUnlockByShard(SSR), 'canUnlockByShard 判定为可解锁');
eq(game.meta.shardNeed(SSR), 8, '金圣遗物解锁阈值 8');
eq(game.meta.shardNeed(SR), 4, '紫圣遗物解锁阈值 4');
eq(game.meta.shardNeed(R), 2, '蓝圣遗物解锁阈值 2');
game.meta.addShard(SSR, 4);
eq(game.meta.canUnlockByShard(SSR), true, '超额碎片仍可解锁');

console.log('\n=== 6. 手动解锁消耗碎片 ===');
const errU = game.meta.unlockByShard(SSR);
eq(errU, null, '解锁成功返回 null');
eq(game.meta.starOf(SSR), 1, '解锁后 1★');
eq(game.meta.shards[SSR], 4, '扣除 8 张后剩 4 张');
eq(game.meta.canUnlockByShard(SSR), false, '已解锁后不再是可解锁态');
eq(game.meta.unlockByShard(SSR), '已解锁', '重复解锁被拒');

console.log('\n=== 7. 碎片不足时拒绝解锁 ===');
game.meta.shards[SR] = 3;
eq(game.meta.canUnlockByShard(SR), false, '3/4 碎片不可解锁');
ok(/碎片不足/.test(game.meta.unlockByShard(SR) || ''), '解锁失败文案含碎片不足');
eq(game.meta.shards[SR], 3, '失败不扣碎片');

console.log('\n=== 8. 三选一选中即解锁：失守折算不回退解锁态 ===');
game.meta.shards = {};
game.meta.runCodex = {};
game.meta.relicStars = {};
game.meta.codexUnlock(SR);                 // 模拟战斗中三选一选中
eq(game.meta.starOf(SR), 1, '选中即解锁');
game.runShardDetail = { [SR]: 9 };
game.runShardGained = 9;
const s8 = game.settleRunShards(CONFIG.SHARD_SETTLE.deadRatio);   // 随后失守
eq(s8.kept, 2, '失守折算仍生效');
eq(game.meta.starOf(SR), 1, '已解锁状态不因折算回退');

console.log('\n=== 9. 随机保留不重不漏（多轮抽样校验）===');
let sampling = true;
for (let t = 0; t < 200; t++) {
  game.runShardDetail = { a: 3, b: 3, c: 4 };   // 共 10 张
  game.runShardGained = 10;
  const r = game.settleRunShards(0.3);
  const sumR = Object.values(r.finalDetail).reduce((x, y) => x + y, 0);
  if (sumR !== 3 || r.kept !== 3) { sampling = false; break; }
  // 每个 id 的保留数不得超过该 id 的掉落数
  if ((r.finalDetail.a || 0) > 3 || (r.finalDetail.b || 0) > 3 || (r.finalDetail.c || 0) > 4) { sampling = false; break; }
}
ok(sampling, '200 轮抽样：恒为 3 张且不超出各 id 掉落数');

console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
