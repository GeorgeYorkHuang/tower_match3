/**
 * _build_skill_shot.mjs —— 生成裸渲染单页 tools/_skill_shot.html
 * 与 _build_skill_preview.mjs 同一内联机制，但无 UI 外壳，
 * 配合 Edge headless --screenshot 出全分辨率单屏图：
 *   node tools/_build_skill_shot.mjs
 *   msedge --headless=new --disable-gpu --window-size=750,1626 \
 *          --screenshot=out.png "file:///.../tools/_skill_shot.html#screen=home&state=fresh"
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const MODULES = [
  'js/game/render.js',
  'js/game/screens/home.js',
  'js/game/screens/menu-shop.js',
  'js/game/screens/menu-header.js',
  'js/game/screens/skill-loadout.js',
  'js/game/icons/skills.js',
  'js/game/icons/special-blocks.js',
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
  'js/game/fx/firewall.js',      // v1.17 视觉验收：render.js 21:06 起新增依赖
  'js/game/fx/firepillar.js',
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

const tpl = readFileSync(resolve(HERE, '_skill_shot_template.html'), 'utf8');
const MARK = '/*__MODULES__*/';
if (!tpl.includes(MARK)) {
  console.error('模板缺少占位标记');
  process.exit(1);
}
const out = tpl.replace(MARK, '\n' + entries.join(',\n') + '\n');
writeFileSync(resolve(HERE, '_skill_shot.html'), out, 'utf8');
console.log('产物：tools/_skill_shot.html  ' + (Buffer.byteLength(out) / 1024).toFixed(1) + ' KB');
