/**
 * _build_special_preview.mjs —— 生成「特殊方块染色贴图」实机渲染验收页
 *
 * 为什么构建：file:// 下无法 fetch 本地源码，把模块 base64 内联成单文件 HTML。
 * 页面里的图形全部由真实 render.js 的 board()/drawCell() 绘制。
 *
 * 用法：node tools/_build_special_preview.mjs
 * 产物：tools/preview_special_chip.html（已被打包 ignore，不进小游戏包）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const MODULES = [
  'js/game/render.js',
  'js/game/fx/firewall.js',
  'js/game/fx/firepillar.js',
  'js/game/screens/skill-loadout.js',
  'js/game/icons/skills.js',
  'js/game/icons/special-blocks.js',
  'js/game/icons/special-chip.js',
  'js/game/ui.js',
  'js/config.js',
  'js/global-skills.js',
  'js/config/global-balance.js',
];

const missing = MODULES.filter((m) => !existsSync(resolve(ROOT, m)));
if (missing.length) {
  console.error('缺少模块：\n  ' + missing.join('\n  '));
  process.exit(1);
}

const entries = MODULES.map((m) =>
  `  ${JSON.stringify(m)}: ${JSON.stringify(Buffer.from(readFileSync(resolve(ROOT, m), 'utf8'), 'utf8').toString('base64'))}`);

const tpl = readFileSync(resolve(HERE, '_special_preview_template.html'), 'utf8');
const MARK = '/*__MODULES__*/';
if (!tpl.includes(MARK)) { console.error('模板缺少占位标记 ' + MARK); process.exit(1); }
const out = tpl.replace(MARK, '\n' + entries.join(',\n') + '\n');
const outPath = resolve(HERE, 'preview_special_chip.html');
writeFileSync(outPath, out, 'utf8');

const problems = [];
if (out.includes(MARK)) problems.push('占位未被替换');
for (const m of MODULES) if (!out.includes(JSON.stringify(m))) problems.push('缺源码：' + m);
const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log('built tools/preview_special_chip.html  ' + kb + 'KB  modules=' + MODULES.length);
if (problems.length) { console.error('自检失败：\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('selfcheck PASS');
