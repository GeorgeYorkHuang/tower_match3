#!/usr/bin/env node
/**
 * _audit_domain_refs.cjs —— R10 数据所有权只读审计（不改任何文件、不写盘）
 *
 * 四项扫描：
 *   A. Meta.fromJSON 快照引用共享键（恢复边界无拷贝直接引用调用方对象的字段）→ R08 隔离修复范围参考
 *   B. Meta 字段跨文件写入点（meta.js 之外的 meta.<field> = / game.meta.<field> = 赋值）
 *   C. 本地存储读写入口（wx.*StorageSync 全部出现位置）
 *   D. save() 调用点（game.save.save()）
 *   E. 疑似死配置键（config 定义后全库无读取点，白名单手工维护）
 *
 * 运行：node tools/_audit_domain_refs.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function listJs(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (name !== 'node_modules') out.push(...listJs(p)); }
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = listJs(path.join(ROOT, 'js'));
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');
const lines = (src) => src.split('\n');

console.log('== R10 数据所有权只读审计 ==\n');

/* A. fromJSON 共享引用键 */
const metaSrc = read(path.join(ROOT, 'js/meta.js'));
console.log('[A] Meta.fromJSON 恢复边界——直接引用快照（无拷贝）的键：');
const shared = [];
lines(metaSrc).forEach((l, i) => {
  const m = l.match(/m\.(\w+)\s*=\s*d\.(\w+)\s*(?:\|\|[^;]*)?;/);
  if (m && !/slice\(|Object\.assign|JSON\.parse/.test(l)) shared.push({ key: m[1], line: i + 1 });
});
shared.forEach((s) => console.log(`  meta.js:${s.line}  m.${s.key} = d.${s.key}...  ← 与调用方快照共享引用（R08 范围）`));
console.log(`  小计 ${shared.length} 键\n`);

/* B. Meta 字段跨文件写入点 */
console.log('[B] meta.js 之外的 Meta 字段直接赋值：');
let bCount = 0;
for (const f of files) {
  if (rel(f) === 'js/meta.js') continue;
  lines(read(f)).forEach((l, i) => {
    const m = l.match(/(?:game\.meta|meta)\.(\w+)\s*=(?!=)\s*[^=]/);
    if (m && !/\b==\b|\b===\b|=>/.test(l)) { console.log(`  ${rel(f)}:${i + 1}  ${l.trim().slice(0, 90)}`); bCount++; }
  });
}
console.log(`  小计 ${bCount} 处（其中 account.js 测试档预设 / main.js 调试面板为已知登记项）\n`);

/* C. 存储入口 */
console.log('[C] wx 本地存储读写入口：');
let cCount = 0;
for (const f of files) {
  lines(read(f)).forEach((l, i) => {
    if (/wx\.(get|set|remove)StorageSync/.test(l)) { console.log(`  ${rel(f)}:${i + 1}  ${l.trim().slice(0, 80)}`); cCount++; }
  });
}
console.log(`  小计 ${cCount} 处（预期仅 save.js）\n`);

/* D. save() 调用点 */
console.log('[D] game.save.save() 调用点：');
let dCount = 0;
for (const f of files) {
  lines(read(f)).forEach((l, i) => {
    if (/game\.save\.save\(\)/.test(l)) { console.log(`  ${rel(f)}:${i + 1}  ${l.trim().slice(0, 80)}`); dCount++; }
  });
}
console.log(`  小计 ${dCount} 处\n`);

/* E. 疑似死配置键（手工维护白名单，发现新死键时追加） */
console.log('[E] 疑似死配置键（定义后无读取点）：');
const candidates = ['speedDiamond', 'PENALTY_RATIO', 'DIRECT_FIRST'];
for (const key of candidates) {
  let hits = 0;
  for (const f of files) {
    const src = read(f);
    if (rel(f) === 'js/config.js') continue; // 定义处不计
    if (new RegExp('\\.' + key + '\\b').test(src)) hits++;
  }
  console.log(`  ${key}: js/ 内（除 config.js 定义处）读取点 ${hits} 处${hits === 0 ? '  ← 死配置' : ''}`);
}
console.log('\n== 审计完成（只读，未修改文件） ==');
