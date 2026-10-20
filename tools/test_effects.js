/**
 * test_effects.js —— 特效三选一逻辑单测（node 直接运行）
 * 运行：node tools/test_effects.js
 * 覆盖：候选生成 / 首选保底 / 目标加权 / 激活与槽满替换 / 升级封顶 /
 *       待选队列结算 / 协同检测 / DPS 乘区 / P0 池
 */
const assert = require('assert');
const CONFIG = require('../js/config.js');
const { EffectManager } = require('../js/effects.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

/** 确定性 LCG 随机数（测试可复现，消除 flaky） */
function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function freshManager(seed = 1) {
  const m = new EffectManager({ rng: seededRng(seed) });
  Object.keys(m.towers).forEach((k) => m.towers[k].unlock());
  return m;
}

/* 1. 候选生成：3 个、不重复、来自该塔池 */
t('候选生成：3 个、不重复、属于该塔池', () => {
  const m = freshManager();
  const fire = m.tower('fire');
  fire.pending = 1;
  const queue = m.settlePending();
  assert.strictEqual(queue.length, 1);
  const cands = queue[0].candidates;
  assert.strictEqual(cands.length, CONFIG.EFFECT.pickSize);
  assert.strictEqual(new Set(cands.map((e) => e.name)).size, cands.length, '候选不得重复');
  const poolNames = CONFIG.EFFECT_POOLS.fire.map((e) => e.name);
  cands.forEach((e) => assert.ok(poolNames.includes(e.name), `${e.name} 应属于火塔全技能池`));
});

/* 2. 首选保底：首次三选一候选必含标志特效（fire→燃爆） */
t('首选保底：首次候选必含标志特效', () => {
  for (let i = 0; i < 50; i++) {
    const m = freshManager();
    m.tower('fire').pending = 1;
    const q = m.settlePending();
    assert.ok(q[0].candidates.some((e) => e.name === '燃爆'), 'fire 首次候选应含燃爆');
  }
});

/* 3. 目标加权：targeting 自动路径优先目标 */
t('targeting 自动路径选目标特效', () => {
  const m = freshManager();
  const poison = m.tower('poison');
  poison.pending = 1;
  m.settleAuto();
  assert.ok(poison.hasActive('毒爆'), '毒塔首次自动结算应激活毒爆');
});

/* 4. 激活与槽满锁定（v1.13.4：满 3 技能后三选一不再刷新未激活技能，只升级已有技能） */
t('槽满后三选一不再刷新未激活技能（同技能每轮限 1 张升级卡）', () => {
  const m = freshManager();
  const fire = m.tower('fire');
  // 直接构造 3 槽满：燃爆 + 大火球 + 火柱
  fire.applyChoice(fire.pool.find((e) => e.name === '燃爆'));
  fire.applyChoice(fire.pool.find((e) => e.name === '大火球'));
  fire.applyChoice(fire.pool.find((e) => e.name === '火柱'));
  assert.strictEqual(fire.activeNames.length, 3);
  // 槽满后激活未激活技能应被拒绝（防御）
  const newEf = fire.pool.find((e) => e.name === '灼烧叠层');
  const res = fire.applyChoice(newEf);
  assert.ok(!res.ok, '槽满后激活新技能应被拒绝');
  assert.strictEqual(fire.activeNames.length, 3, '槽数保持 3');
  // 三选一候选：只出分支升级卡，不出未激活技能
  fire.pending = 1;
  const q = m.settlePending();
  const cands = q[0].candidates;
  assert.ok(cands.length > 0, '槽满后仍有升级候选');
  cands.forEach((c) => assert.strictEqual(c.type, 'branch', '槽满后只出升级分支卡'));
  assert.ok(cands.every((c) => c.name !== '灼烧叠层'), '未激活技能不应出现');
  const names = cands.map((c) => c.name);
  assert.strictEqual(new Set(names).size, names.length, '同一技能每轮升级最多 1 张卡');
});

/* 5. v1.13.5 分支锁定：技能任一分支升级后，其余分支移出池；选中分支可升到 Lv3 后移出候选池 */
t('特效分支锁定：只升已选分支至 Lv3 后移出候选池', () => {
  const m = freshManager();
  const elec = m.tower('electric');
  // 自动路径持续选目标（连锁）——首次升级锁定 A 分支，此后只升 A
  elec.pending = 20;
  m.settleAuto();
  const chain = elec.pool.find((e) => e.name === '连锁');
  assert.strictEqual(chain.level, CONFIG.EFFECT.maxLevel, '目标特效应升满');
  assert.strictEqual(chain.branches.A, CONFIG.EFFECT.maxLevel, '分支 A 应升满（锁定线）');
  assert.strictEqual(chain.branches.B, 0, '分支 B 应移出池（未选不升）');
  assert.strictEqual(chain.branches.C, 0, '分支 C 应移出池（未选不升）');
  // 锁定分支满级后不再出现在候选
  elec.pending = 1;
  const q = m.settlePending();
  if (q.length) q[0].candidates.forEach((e) => assert.notStrictEqual(e.name, '连锁'));
});

/* 6. 待选队列：pending=N 生成 N 组；applyChoice 消费 */
t('待选队列逐组结算', () => {
  const m = freshManager();
  const ice = m.tower('ice');
  ice.pending = 3;
  const q = m.settlePending();
  assert.strictEqual(q.length, 3, `pending=3 应生成 3 组，实际 ${q.length}`);
  q.forEach((g) => {
    const before = ice.pending;
    const res = m.applyChoice('ice', g.candidates[0]);
    assert.ok(res.ok);
    assert.strictEqual(ice.pending, before - 1, '每次应用扣 1 待选');
  });
  assert.strictEqual(ice.pending, 0);
});

/* 7. 协同检测：燃爆+毒爆 → done */
t('协同检测（燃爆×毒爆）', () => {
  const m = freshManager();
  m.tower('fire').applyChoice(m.tower('fire').pool.find((e) => e.name === '燃爆'));
  m.tower('poison').applyChoice(m.tower('poison').pool.find((e) => e.name === '毒爆'));
  m.updateSynergies();
  const s = m.synergyStatus();
  assert.ok(s[0].done, '燃爆×毒爆 协同应达成');
  assert.ok(!s[1].done, '冰冻×连锁 未激活不应达成');
});

/* 8. DPS 乘区：等级成长 × 特效乘区 × 协同乘区 */
t('DPS 计算含全部乘区', () => {
  const m = freshManager();
  const fire = m.tower('fire');
  assert.strictEqual(fire.dps(false), 30, 'Lv1 无特效 = baseDps 30');
  // 升到 Lv2：30 × 1.25 = 37.5
  fire.gainExp(CONFIG.EXP.perCell * 3); // +12 → 需要 30，未升级
  fire.exp = 30; fire.level = 1;
  // 直接构造：level=2
  fire.exp = 0; fire.level = 2;
  assert.ok(Math.abs(fire.dps(false) - 30 * 1.25) < 1e-9);
  // 激活 1 个 Lv1 特效：×(1+0.15)
  fire.applyChoice(fire.pool.find((e) => e.name === '燃爆'));
  const d = fire.dps(false);
  assert.ok(Math.abs(d - 30 * 1.25 * 1.15) < 1e-9, `DPS=${d}`);
  // 协同：×(1+0.5)
  m.synergyDone[0] = true;
  const ds = fire.dps(true);
  assert.ok(Math.abs(ds - 30 * 1.25 * 1.15 * 1.5) < 1e-9, `协同 DPS=${ds}`);
});

/* 9. 惩罚经验：未获得塔不吸收 */
t('未解锁塔不吸收经验', () => {
  const m = new EffectManager();
  const fire = m.tower('fire');
  fire.gainExp(50);
  assert.strictEqual(fire.level, 0, '未解锁塔不得升级');
  assert.strictEqual(fire.exp, 0);
});

/* 10. 技能池：每塔特效数 = EFFECT_POOLS 全表（全池口径 poolP0=false） */
t('技能池数量（全 8 特效）', () => {
  const m = new EffectManager();
  Object.keys(m.towers).forEach((k) => {
    const full = CONFIG.EFFECT_POOLS[k].length;
    assert.strictEqual(m.tower(k).pool.length, full, `${k} 应为 ${full} 特效`);
  });
});

/* 11. v1.11 两级候选：未激活技能（技能卡）+ 已激活技能分支（分支卡） */
t('v1.11 两级候选：技能卡 + 分支卡混池', () => {
  const m = freshManager();
  const fire = m.tower('fire');
  fire.applyChoice({ name: '点燃', type: 'skill', fromTower: 'fire' }); // 激活：分支 A Lv1
  const all = fire._choices();
  const skills = all.filter((e) => e.type === 'skill');
  const branches = all.filter((e) => e.type === 'branch');
  assert.strictEqual(skills.length, 7, '未激活技能卡 = 池 8 - 已激活 1');
  assert.strictEqual(branches.length, 1, '已激活技能每轮最多 1 张分支卡（v1.13.4）');
  assert.strictEqual(branches[0].name, '点燃', '分支卡来自已激活技能');
  assert.ok(['A', 'B', 'C'].includes(branches[0].branch), '分支卡带分支标识');
  assert.ok(branches[0].branchLv >= 0 && branches[0].branchLv < CONFIG.EFFECT.maxLevel, '分支等级在 0-2');
});

/* 12. v1.11 分支独立升级：分支卡只升对应分支 */
t('v1.11 分支独立升级：只升对应分支', () => {
  const m = freshManager();
  const fire = m.tower('fire');
  fire.applyChoice({ name: '点燃', type: 'skill', fromTower: 'fire' });
  const ef = fire.pool.find((e) => e.name === '点燃');
  const res = fire.applyChoice({ name: '点燃', type: 'branch', branch: 'B', branchLv: 0, fromTower: 'fire' });
  assert.ok(res.ok && res.leveled, '分支卡应升级');
  assert.strictEqual(ef.branches.A, 1, 'A 不变');
  assert.strictEqual(ef.branches.B, 1, 'B +1');
  assert.strictEqual(ef.branches.C, 0, 'C 不变');
  assert.strictEqual(ef.level, 1, '派生 level = max(A,B,C)');
});

/* 13. v1.11 升级三选一跨塔混池：候选带来源塔，含两级类型 */
t('v1.11 升级三选一跨塔混池', () => {
  const m = freshManager();
  m.tower('fire').applyChoice({ name: '点燃', type: 'skill', fromTower: 'fire' });
  m.tower('ice').applyChoice({ name: '冰冻', type: 'skill', fromTower: 'ice' });
  const all = [].concat(m.tower('fire')._choices(), m.tower('ice')._choices());
  assert.ok(all.some((e) => e.fromTower === 'fire' && e.type === 'skill'), '应含火塔未激活技能卡');
  assert.ok(all.some((e) => e.fromTower === 'ice' && e.type === 'branch'), '应含冰塔已激活技能分支卡');
  m.tower('fire').pending = 1;
  const q = m.buildUpgradeQueue(['fire', 'ice']);
  assert.strictEqual(q.length, 1, '1 次待选 1 组');
  q[0].candidates.forEach((e) => {
    assert.ok(['fire', 'ice'].includes(e.fromTower), '候选带来源塔');
  });
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
