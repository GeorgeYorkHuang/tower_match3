const CONFIG = require('../js/config.js');
const pools = CONFIG.EFFECT_POOLS;
let out = '';
for (const [key, list] of Object.entries(pools)) {
  out += `\n=== ${key} ===\n`;
  for (const e of list) {
    out += `【${e.name}】\n`;
    for (const br of ['a', 'b', 'c']) {
      out += `  ${br.toUpperCase()} ${e[br].split('：')[0] || ''}：${e[br + 'p']}\n`;
    }
  }
}
const fs = require('fs');
fs.writeFileSync('tools/_branch_dump.txt', out, 'utf-8');
console.log(out);
