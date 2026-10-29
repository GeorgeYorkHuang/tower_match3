// 只读扫描：tower-skills.js 的每个字段是否被代码读取（粗筛，命中仍需人工确认语义）
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config/tower-skills.js');
const files = ['../js/combat.js', '../js/game/main.js', '../js/game/render.js', '../js/config.js'];
const src = files.map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');

const rows = [];
for (const [tower, skills] of Object.entries(cfg)) {
  for (const [skill, params] of Object.entries(skills)) {
    for (const key of Object.keys(params)) {
      rows.push({ tower, skill, key, hit: new RegExp('\\.' + key + '\\b').test(src) });
    }
  }
}
const miss = rows.filter((r) => !r.hit);
console.log(`总字段 ${rows.length}｜火冰 ${rows.filter((r) => r.tower === 'fire' || r.tower === 'ice').length}｜疑似未被读取 ${miss.length}`);
for (const m of miss) console.log(`  ${m.tower}.${m.skill}.${m.key}`);
