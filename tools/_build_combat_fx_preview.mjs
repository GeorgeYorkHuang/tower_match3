/**
 * _build_combat_fx_preview.mjs —— 生成战斗表现预览单页（连消全格弹道 + 伤害数字）
 * 与 _build_skill_shot.mjs 同一内联机制（模块源码 base64 内联，浏览器端极简 CJS 加载器）。
 *
 *   node tools/_build_combat_fx_preview.mjs
 *   msedge --headless=new --disable-gpu --window-size=750,1200 \
 *          --screenshot=art/_w_accept/combat_fx_preview.png \
 *          "file:///.../tools/_combat_fx_preview.html"
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const MODULES = [
  'js/config.js',
  'js/config/monsters.js',
  'js/config/towers.js',
  'js/config/skills.js',
  'js/config/relics.js',
  'js/relics/queries.js',
  'js/config/combat-presentation.js',
  'js/game/fx/damage-numbers.js',
  'js/skills/chain-attacks.js',
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

const tpl = readFileSync(resolve(HERE, '_combat_fx_preview_template.html'), 'utf8');
const MARK = '/*__MODULES__*/';
if (!tpl.includes(MARK)) {
  console.error('模板缺少占位标记');
  process.exit(1);
}
const out = tpl.replace(MARK, '\n' + entries.join(',\n') + '\n');
writeFileSync(resolve(HERE, '_combat_fx_preview.html'), out, 'utf8');
console.log('产物：tools/_combat_fx_preview.html  ' + (Buffer.byteLength(out) / 1024).toFixed(1) + ' KB');
