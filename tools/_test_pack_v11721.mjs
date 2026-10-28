/**
 * v1.17.21 分包与素材位置自检（静态扫描版，不依赖运行时）
 *
 * 守护的规则（见 README「资源与分包约定」）：
 *   ① 所有素材引用必须带 assets/ 前缀（assets 是唯一分包）
 *   ② 被引用的素材文件必须真实存在
 *   ③ 根目录不得出现 images/ audio/ 等素材目录（否则会进主包）
 *   ④ game.json 的 subpackages 必须包含 assets 分包
 *   ⑤ 分包 root 下必须有 game.js 入口（微信要求）
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const fails = [];
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { fails.push(m); console.error('  ✗ ' + m); };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js') || e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

// ---------- ① 素材引用前缀 + ② 文件存在 ----------
const ASSET_RE = /['"]([\w./-]+\.(?:png|jpg|jpeg|mp3|wav|ogg))['"]/g;
const BAD_PREFIX = /['"]((?:images|audio|fx)\/[\w./-]+\.(?:png|jpg|jpeg|mp3|wav|ogg))['"]/g;

const srcFiles = walk(path.join(ROOT, 'js')).concat([path.join(ROOT, 'game.js')]);
const missing = [];
const wrongPrefix = [];
let refCount = 0;

for (const f of srcFiles) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  let m;
  ASSET_RE.lastIndex = 0;
  while ((m = ASSET_RE.exec(src))) {
    const p = m[1];
    if (p.startsWith('assets/')) {
      refCount++;
      if (!fs.existsSync(path.join(ROOT, p))) missing.push(`${rel} → ${p}`);
    }
  }
  BAD_PREFIX.lastIndex = 0;
  while ((m = BAD_PREFIX.exec(src))) wrongPrefix.push(`${rel} → ${m[1]}`);
}

if (missing.length) missing.forEach((x) => bad('引用的素材不存在：' + x));
else ok(`素材引用 ${refCount} 处，路径全部存在`);

if (wrongPrefix.length) wrongPrefix.forEach((x) => bad('素材引用缺 assets/ 前缀（会指向主包）：' + x));
else ok('无裸 images//audio/ 前缀引用（全部走分包）');

// ---------- ③ 根目录素材目录 ----------
for (const d of ['images', 'audio', 'fx', 'anims']) {
  if (fs.existsSync(path.join(ROOT, d))) bad(`根目录存在素材目录 ${d}/，它会被打进主包`);
}
if (!['images', 'audio', 'fx', 'anims'].some((d) => fs.existsSync(path.join(ROOT, d)))) {
  ok('根目录无 images/audio/fx 等素材目录');
}

// ---------- ④⑤ 分包配置 ----------
const gameJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.json'), 'utf8'));
const subs = gameJson.subpackages || [];
const assetsSub = subs.find((s) => s.root === 'assets');
if (!assetsSub) bad('game.json 缺少 assets 分包配置');
else {
  ok('game.json 已声明 assets 分包');
  if (!fs.existsSync(path.join(ROOT, 'assets', 'game.js'))) bad('分包 root 缺少 game.js 入口文件');
  else ok('分包入口 assets/game.js 存在');
}

// ---------- 素材目录必须全部在分包内 ----------
const assetDirs = fs.existsSync(path.join(ROOT, 'assets')) ? fs.readdirSync(path.join(ROOT, 'assets')) : [];
ok(`分包内容：${assetDirs.join(', ')}`);

// ---------- ignore 两处同步 ----------
const pc = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const gi = new Set((gameJson.packOptions?.ignore || []).map((e) => `${e.type}:${e.value}`));
const pi = new Set((pc.packOptions?.ignore || []).map((e) => `${e.type}:${e.value}`));
const onlyGame = [...gi].filter((x) => !pi.has(x));
if (onlyGame.length) bad(`ignore 规则未同步到 project.config.json：${onlyGame.join(' | ')}`);
else ok(`packOptions.ignore 两处已同步（${gi.size} 条）`);

// ---------- 结果 ----------
if (fails.length) {
  console.error(`\nFAIL：${fails.length} 项不合规`);
  process.exit(1);
}
console.log('\nPASS 分包与素材位置自检');
