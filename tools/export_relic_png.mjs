// 将 relic_icons/svg 渲染为游戏可用 PNG（256x256，透明背景不需要——图标自带底）
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from 'file:///C:/Users/kindf/.workbuddy/binaries/node/workspace/node_modules/@resvg/resvg-js/index.js';

const ROOT = process.argv[2] || 'F:/workspace/towerdefence/relic_icons';
const SIZE = 256;
let n = 0;
for (const catDir of fs.readdirSync(path.join(ROOT, 'svg'))) {
  const inDir = path.join(ROOT, 'svg', catDir);
  const outDir = path.join(ROOT, 'png', catDir);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(inDir).filter(f => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(inDir, f), 'utf8');
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
    fs.writeFileSync(path.join(outDir, f.replace('.svg', '.png')), png);
    n++;
  }
}
console.log(`OK: ${n} PNG -> ${ROOT}/png`);
