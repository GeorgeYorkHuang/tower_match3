/**
 * _check_picktext.js —— 校验 config EFFECT_POOLS 的 pick/ap/bp/cp 完整性（过程文件，非交付）
 * 断言：48 技能均有 pick（≤30 字）；144 分支均有 ap/bp/cp（≤30 字）；原文 desc/a/b/c 仍保留
 */
const CONFIG = require('../js/config.js');
const pools = CONFIG.EFFECT_POOLS;
let bad = [];
let nSkills = 0, nBranches = 0;
for (const [key, list] of Object.entries(pools)) {
  for (const e of list) {
    nSkills++;
    if (typeof e.pick !== 'string' || !e.pick) bad.push(`${key}/${e.name} 缺 pick`);
    else if (e.pick.length > 30) bad.push(`${key}/${e.name} pick ${e.pick.length}字超30: ${e.pick}`);
    if (typeof e.desc !== 'string' || !e.desc) bad.push(`${key}/${e.name} 缺 desc`);
    for (const br of ['a', 'b', 'c']) {
      nBranches++;
      const pk = br + 'p';
      if (typeof e[pk] !== 'string' || !e[pk]) bad.push(`${key}/${e.name} 缺 ${pk}`);
      else if (e[pk].length > 30) bad.push(`${key}/${e.name} ${pk} ${e[pk].length}字超30: ${e[pk]}`);
      if (typeof e[br] !== 'string' || !e[br]) bad.push(`${key}/${e.name} 缺 ${br}(详细)`);
    }
  }
}
console.log(`技能 ${nSkills} 条 / 分支 ${nBranches} 条`);
if (bad.length) { console.log(`共 ${bad.length} 处问题:`); bad.forEach((b) => console.log(' - ' + b)); process.exit(1); }
console.log('pick/ap/bp/cp 完整性校验通过：全部存在且 ≤30 字，详细 desc/a/b/c 保留');
