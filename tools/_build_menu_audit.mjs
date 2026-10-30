/**
 * _build_menu_audit.mjs —— 生成「主界面布局 · 实际页面验收」单文件页
 *
 * 与 _build_skill_preview.mjs 同法：把依赖模块 base64 内联，使页面可 file:// 双击打开。
 *
 * 用法：node tools/_build_menu_audit.mjs
 * 产物：tools/preview_menu_layout.html
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const MODULES = [
  'js/game/render.js',
  'js/game/screens/skill-loadout.js',
  'js/game/icons/skills.js',
  'js/game/icons/special-blocks.js',
  'js/game/fx/firewall.js',
  'js/game/fx/firepillar.js',
  'js/game/ui.js',
  'js/game/screens/codex.js',
  'js/game/screens/relics.js',
  'js/config.js',
  'js/config/monsters.js',
  'js/config/towers.js',
  'js/config/skills.js',
  'js/config/relics.js',
  'js/relics/queries.js',
  'js/game/screens/account-menu.js',
  'js/game/icons/chip-skin.js',

  'js/global-skills.js',
  'js/skills/global-catalog.js',
  'js/skills/global-loadout.js',
  'js/skills/global-runtime.js',
  'js/config/global-balance.js',
];

const missing = MODULES.filter((m) => !existsSync(resolve(ROOT, m)));
if (missing.length) {
  console.error('缺少模块：\n  ' + missing.join('\n  '));
  process.exit(1);
}

const entries = MODULES.map((m) => {
  const b64 = Buffer.from(readFileSync(resolve(ROOT, m), 'utf8'), 'utf8').toString('base64');
  return `  ${JSON.stringify(m)}: ${JSON.stringify(b64)}`;
});

const tpl = readFileSync(resolve(HERE, '_menu_audit_template.html'), 'utf8');
const MARK = '/*__MODULES__*/';
if (!tpl.includes(MARK)) {
  console.error('模板缺少占位标记 ' + MARK);
  process.exit(1);
}

const out = tpl.replace(MARK, '\n' + entries.join(',\n') + '\n');
const outPath = resolve(HERE, 'preview_menu_layout.html');
writeFileSync(outPath, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log('内联模块 ' + MODULES.length + ' 个');
console.log('产物：tools/preview_menu_layout.html  ' + kb + ' KB');
if (out.includes(MARK)) { console.error('自检失败：占位未替换'); process.exit(1); }
console.log('自检通过');
