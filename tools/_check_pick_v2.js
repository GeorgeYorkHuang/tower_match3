/* 临时校验（不提交）：验证 config.js 文案字段形态 + effects.js _choices() 按分支等级取档正确 */
const path = require('path');
const CONFIG = require(path.resolve(__dirname, '../js/config.js'));
const { EffectManager } = require(path.resolve(__dirname, '../js/effects.js'));

let fails = 0;
const TOKEN = ['fire', 'ice', 'poison', 'electric', 'boomerang', 'cannon'];
let skillCount = 0, branchCount = 0;

TOKEN.forEach((tk) => {
  (CONFIG.EFFECT_POOLS[tk] || []).forEach((sk) => {
    skillCount++;
    if (!sk.pick || typeof sk.pick !== 'string' || !sk.pick.trim()) { console.error('PICK MISSING:', tk, sk.name); fails++; }
    ['ap', 'bp', 'cp'].forEach((f) => {
      const v = sk[f];
      if (!Array.isArray(v) || v.length !== 3) { console.error('NOT ARRAY(3):', tk, sk.name, f); fails++; return; }
      v.forEach((s, i) => { if (!s || typeof s !== 'string') { console.error('TIER EMPTY:', tk, sk.name, f, i); fails++; } });
      branchCount += 3;
    });
  });
});
console.log('field check: skills =', skillCount, '(expect 48), branch tiers =', branchCount, '(expect 144)');

// 取档验证：激活火塔「点燃」，分支 Lv 0/1/2 时 _choices() 分支卡 desc 应分别为档1/档2/档3
const mgr = new EffectManager({ rng: () => 0.5 });
const t = mgr.towers.fire;
t.level = 1;
const ef = t.pool.find((e) => e.name === '点燃');
if (!ef) { console.error('fire 点燃 not found'); fails++; }
ef.act = true;
t.activeNames.push('点燃');
t.pool.find((e) => e.name === '点燃').branches.A = 0;
let c0 = t._choices().find((c) => c.name === '点燃' && c.type === 'branch' && c.branch === 'A');
t.pool.find((e) => e.name === '点燃').branches.A = 1;
let c1 = t._choices().find((c) => c.name === '点燃' && c.type === 'branch' && c.branch === 'A');
t.pool.find((e) => e.name === '点燃').branches.A = 2;
let c2 = t._choices().find((c) => c.name === '点燃' && c.type === 'branch' && c.branch === 'A');
t.pool.find((e) => e.name === '点燃').branches.A = 3;
let c3 = t._choices().find((c) => c.name === '点燃' && c.type === 'branch' && c.branch === 'A');
const exp0 = CONFIG.EFFECT_POOLS.fire.find((s) => s.name === '点燃').ap[0];
const exp1 = CONFIG.EFFECT_POOLS.fire.find((s) => s.name === '点燃').ap[1];
const exp2 = CONFIG.EFFECT_POOLS.fire.find((s) => s.name === '点燃').ap[2];
if (!c0 || c0.desc !== exp0) { console.error('TIER0 WRONG:', c0 && c0.desc, 'EXP:', exp0); fails++; }
if (!c1 || c1.desc !== exp1) { console.error('TIER1 WRONG:', c1 && c1.desc, 'EXP:', exp1); fails++; }
if (!c2 || c2.desc !== exp2) { console.error('TIER2 WRONG:', c2 && c2.desc, 'EXP:', exp2); fails++; }
if (c3 && c3.desc !== exp2) { console.error('TIER3 CAP WRONG:', c3 && c3.desc, 'EXP:', exp2); fails++; }

// 技能卡 desc 用 pick（火塔未激活技能卡，如「火柱」）
const skillCand = mgr.towers.fire._choices().find((c) => c.type === 'skill' && c.name === '火柱');
if (!skillCand || skillCand.desc !== CONFIG.EFFECT_POOLS.fire.find((s) => s.name === '火柱').pick) {
  console.error('SKILL CARD DESC NOT PICK:', skillCand && skillCand.desc); fails++;
}

console.log(fails === 0 ? 'ALL_OK' : ('FAILS = ' + fails));
process.exit(fails === 0 ? 0 : 1);
