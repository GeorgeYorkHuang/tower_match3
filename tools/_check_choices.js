/**
 * _check_choices.js —— 验证 _choices() 候选 desc 走短字段（pick/ap/bp/cp）（过程文件，非交付）
 */
const CONFIG = require('../js/config.js');
const { TowerBuild } = require('../js/effects.js');

const bad = [];
for (const key of Object.keys(CONFIG.EFFECT_POOLS)) {
  const b = new TowerBuild(key);
  const cfg = CONFIG.EFFECT_POOLS[key];
  // 技能卡：未激活 → desc === cfg.pick
  const skill = b._choices().find((c) => c.type === 'skill');
  if (skill) {
    const c = cfg.find((e) => e.name === skill.name);
    if (skill.desc !== c.pick) bad.push(`${key}/${skill.name} 技能卡 desc≠pick: ${skill.desc}`);
  }
  // 分支卡：把第一个技能置为已激活且分支未选 → 出分支卡，desc === cfg.ap/bp/cp
  b.activeNames.push(cfg[0].name);
  b.pool[0].act = true;
  const br = b._choices().find((c) => c.type === 'branch');
  if (br) {
    const c = cfg[0];
    const expect = c[br.branch.toLowerCase() + 'p'];
    if (br.desc !== expect) bad.push(`${key}/${br.name} 分支卡 desc≠${br.branch}p: ${br.desc} vs ${expect}`);
  }
}
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
console.log('_choices 候选 desc 全部走 pick/ap/bp/cp 短描述，验证通过');
