// v1.16.112 焰雨3★ 三连行为验证：门控 + 命中计数 + 触发 3 连
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
const here = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'combat.js'), 'utf8');
// 提取 _attackFireOnHit 方法体（到下一个 '  }' 顶层闭合）
const m = src.match(/_attackFireOnHit\(e, dmg\) \{([\s\S]*?)\n  \}/);
if (!m) { console.error('FAIL: _attackFireOnHit not found'); process.exit(1); }
const body = m[1];
const fn = new Function('ctx', 'e', 'dmg', body.replace(/\bthis\./g, 'ctx.'));

function makeCtx(owned) {
  const run = {
    _fireTripleNext: false,
    relic3: () => owned,
  };
  const g = { run, fx: [] };
  const hits = [];
  return {
    game: g,
    damage: (e, d, k) => hits.push({ d, k }),
    fxFlash: () => {}, fxParticle: () => {}, fxRing: () => {},
    _hits: hits,
  };
}

// 1) 未拥有 → 纯计数但永不触发
{
  const ctx = makeCtx(false);
  const e = { x: 0, y: 0, _fireHits: 0 };
  for (let i = 0; i < 6; i++) fn(ctx, e, 10);
  if (ctx._hits.length !== 0) { console.error('FAIL1: 无圣遗物不应触发三连', ctx._hits.length); process.exit(1); }
  if (ctx.game.run._fireTripleNext) { console.error('FAIL1b: 无圣遗物不应置三连标记'); process.exit(1); }
  console.log('PASS1: 无 3★ 门控不触发');
}

// 2) 拥有 3★ → 同一目标第 3 次命中置标记，第 4 次命中触发 3 连（3 次等额伤害）
{
  const ctx = makeCtx(true);
  const e = { x: 0, y: 0, _fireHits: 0 };
  fn(ctx, e, 10); fn(ctx, e, 10); fn(ctx, e, 10);
  if (!ctx.game.run._fireTripleNext) { console.error('FAIL2: 第3次命中后应置三连标记'); process.exit(1); }
  fn(ctx, e, 10);   // 第4次命中 → 三连
  if (ctx._hits.length !== 3) { console.error('FAIL3: 应触发3连=3次伤害，实际', ctx._hits.length); process.exit(1); }
  if (ctx.game.run._fireTripleNext) { console.error('FAIL4: 触发后标记应清空'); process.exit(1); }
  ctx._hits.forEach((h) => { if (h.d !== 10) { console.error('FAIL5: 三连伤害应等额', h); process.exit(1); } });
  if (!ctx.game.fx.some((f) => f.type === 'floatText')) { console.error('FAIL5b: 三连应产生触发确认飘字'); process.exit(1); }
  console.log('PASS2: 3★ 三连计数+触发+等额伤害+飘字确认 OK');
}

// 3) 不同敌人各自独立计数（命中分散不累计）
{
  const ctx = makeCtx(true);
  const a = { x: 0, y: 0, _fireHits: 0 }, b = { x: 0, y: 0, _fireHits: 0 };
  fn(ctx, a, 10); fn(ctx, b, 10); fn(ctx, a, 10);
  if (ctx.game.run._fireTripleNext) { console.error('FAIL6: 分散命中不应置标记'); process.exit(1); }
  if (a._fireHits !== 2 || b._fireHits !== 1) { console.error('FAIL7: 独立计数错误', a._fireHits, b._fireHits); process.exit(1); }
  console.log('PASS3: 命中按目标独立计数 OK');
}

console.log('\nALL PASS (fire_rain 3★ 三连)');
