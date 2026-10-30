// v1.16.114 焰雨3★ 三连重构行为验证：门控 + 命中计数 + 三连=3 条真实火球弹道（命中走完整结算）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CombatSystem } = require('../js/combat.js');
// Exercise the actual compatibility entry and fire module; do not parse source method bodies.
const fn = (ctx, e, dmg) => CombatSystem.prototype._attackFireOnHit.call(ctx, e, dmg);

function makeCtx(owned) {
  const run = {
    _fireTripleNext: false,
    relic3: () => owned,
  };
  const g = { run, fx: [] };
  const impacts = [];
  return {
    game: g,
    damage: (e, d, k) => { e._dmgLog = e._dmgLog || []; e._dmgLog.push(d); },
    fxFlash: () => {}, fxParticle: () => {}, fxRing: () => {},
    towerMuzzle: () => ({ x: 100, y: 900 }),
    range: () => 200,
    shots: [],
    addProjectile: CombatSystem.prototype.addProjectile,
    _fireImpact: (o, d, ang) => impacts.push({ o, d, ang }),
    _impacts: impacts,
    _hits: impacts,
  };
}

// 1) 未拥有 → 纯计数但永不触发
{
  const ctx = makeCtx(false);
  const e = { x: 0, y: 0, _fireHits: 0 };
  for (let i = 0; i < 6; i++) fn(ctx, e, 10);
  if (ctx.shots.length !== 0) { console.error('FAIL1: 无圣遗物不应产生弹道'); process.exit(1); }
  if (ctx.game.run._fireTripleNext) { console.error('FAIL1b: 无圣遗物不应置三连标记'); process.exit(1); }
  console.log('PASS1: 无 3★ 门控不触发');
}

// 2) 拥有 3★ → 同一目标第 3 次命中置标记，第 4 次命中触发三连 = 3 条真实火球弹道（每条约含 10 伤害）
{
  const ctx = makeCtx(true);
  const e = { x: 300, y: 700, _fireHits: 0 };
  fn(ctx, e, 10); fn(ctx, e, 10); fn(ctx, e, 10);
  if (!ctx.game.run._fireTripleNext) { console.error('FAIL2: 第3次命中后应置三连标记'); process.exit(1); }
  fn(ctx, e, 10);   // 第4次命中 → 三连
  if (ctx.shots.length !== 3) { console.error('FAIL3: 应创建 3 条火球弹道，实际', ctx.shots.length); process.exit(1); }
  ctx.shots.forEach((s) => {
    if (s.dmg !== 10 || s.key !== 'fire' || typeof s.onHit !== 'function') { console.error('FAIL4: 三连弹道参数错误', s); process.exit(1); }
  });
  if (ctx.game.run._fireTripleNext) { console.error('FAIL5: 触发后标记应清空'); process.exit(1); }
  if (!ctx.game.fx.some((f) => f.type === 'floatText')) { console.error('FAIL5b: 三连应产生触发确认飘字'); process.exit(1); }
  // 命中结算链路：任一条弹道命中 → _fireImpact 完整结算（灼烧/大火球/分裂）
  const s0 = ctx.shots[0];
  s0.onHit(e, s0.dmg);
  if (ctx._impacts.length !== 1 || ctx._impacts[0].d !== 10) { console.error('FAIL6: 弹道命中应走完整结算', ctx._impacts); process.exit(1); }
  console.log('PASS2: 三连=3条真实弹道+命中完整结算+飘字 OK');
}

// 3) 不同敌人各自独立计数（命中分散不累计）
{
  const ctx = makeCtx(true);
  const a = { x: 0, y: 0, _fireHits: 0 }, b = { x: 0, y: 0, _fireHits: 0 };
  fn(ctx, a, 10); fn(ctx, b, 10); fn(ctx, a, 10);
  if (ctx.game.run._fireTripleNext) { console.error('FAIL7: 分散命中不应置标记'); process.exit(1); }
  if (a._fireHits !== 2 || b._fireHits !== 1) { console.error('FAIL8: 独立计数错误', a._fireHits, b._fireHits); process.exit(1); }
  console.log('PASS3: 命中按目标独立计数 OK');
}

console.log('\nALL PASS (fire_rain 3★ 三连真实弹道)');
