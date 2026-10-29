/**
 * _build_skill_preview.mjs —— 生成「技能配置页面拆分验收台」单文件预览
 *
 * 为什么需要构建：浏览器 file:// 下无法 fetch 本地源码（CORS），
 * 所以把依赖模块 base64 内联进 HTML，双击即可打开，不需要起本地服务器。
 *
 * 用法：node tools/_build_skill_preview.mjs
 * 产物：tools/preview_skill_loadout.html（已被打包 ignore，不进小游戏包）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** 需要内联的模块（相对项目根）；顺序无关，按需 require */
const MODULES = [
  'js/game/render.js',
  'js/game/screens/skill-loadout.js',
  'js/game/icons/skills.js',
  'js/game/icons/special-blocks.js',
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

const entries = MODULES.map((m) => {
  const src = readFileSync(resolve(ROOT, m), 'utf8');
  const b64 = Buffer.from(src, 'utf8').toString('base64');
  return `  ${JSON.stringify(m)}: ${JSON.stringify(b64)}`;
});

const tplPath = resolve(HERE, '_skill_preview_template.html');
const tpl = readFileSync(tplPath, 'utf8');
const MARK = '/*__MODULES__*/';
if (!tpl.includes(MARK)) {
  console.error('模板缺少占位标记 ' + MARK);
  process.exit(1);
}

const out = tpl.replace(MARK, '\n' + entries.join(',\n') + '\n');
const outPath = resolve(HERE, 'preview_skill_loadout.html');
writeFileSync(outPath, out, 'utf8');

/* ---- 自检 ---- */
const problems = [];
if (out.includes(MARK)) problems.push('占位未被替换');
for (const m of MODULES) if (!out.includes(JSON.stringify(m))) problems.push('缺源码：' + m);
const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);

console.log('内联模块 ' + MODULES.length + ' 个：');
for (const m of MODULES) {
  const kb1 = (readFileSync(resolve(ROOT, m)).length / 1024).toFixed(1);
  console.log('  ' + m.padEnd(44) + kb1 + ' KB');
}
console.log('\n产物：tools/preview_skill_loadout.html  ' + kb + ' KB');
if (problems.length) {
  console.error('自检失败：\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('自检通过');
