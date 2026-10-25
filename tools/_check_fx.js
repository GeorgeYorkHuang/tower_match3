/**
 * _check_fx.js —— mock canvas 逐 type 跑 fx() 抓崩溃（过程文件，非交付）
 * 9c1dcc9 拆分后 22 个 handler 在真实渲染路径是否抛异常
 */
const { Renderer } = require('../js/game/render.js');

// mock ctx：任意方法 no-op，任意属性可读写
const ctx = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (!(k in t)) t[k] = () => {};
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; },
});

const r = new Renderer(); // layout() 依赖 CONFIG，无 wx

function fobj(over) {
  return Object.assign({
    type: 'shot', kind: 'line', key: 'fire',
    x: 100, y: 100, tx: 200, ty: 300, x0: 50, y0: 50, x1: 300, y1: 500,
    t: 0.5, dur: 1, color: '#ffffff', r: 60, R: 120, w: 100, h: 30,
    seed: 3, scale: 1, speed: 100, size: 5, n: 6, spread: 40,
    width: 4, rMax: 60, delay: 0, offset: 0, fly: null, ref: null,
    darts: [], path: null, target: null, aim: false, f: 1,
  }, over || {});
}

const cases = [
  ['shot/line/fire', fobj({ type: 'shot', kind: 'line', key: 'fire' })],
  ['shot/line/ice', fobj({ type: 'shot', kind: 'line', key: 'ice' })],
  ['shot/line/else', fobj({ type: 'shot', kind: 'line', key: 'poison' })],
  ['shot/bolt', fobj({ type: 'shot', kind: 'bolt', target: { hp: 10, x: 400, y: 300 } })],
  ['shot/arc', fobj({ type: 'shot', kind: 'arc' })],
  ['shot/zigzag', fobj({ type: 'shot', kind: 'zigzag', path: [{ x: 1, y: 2 }] })],
  ['shot/zigzag/null', fobj({ type: 'shot', kind: 'zigzag', path: null })],
  ['shot/storm', fobj({ type: 'shot', kind: 'storm' })],
  ['shot/frostorb', fobj({ type: 'shot', kind: 'frostorb' })],
  ['shot/icewall', fobj({ type: 'shot', kind: 'icewall' })],
  ['shot/icebloom', fobj({ type: 'shot', kind: 'icebloom' })],
  ['shot/orb', fobj({ type: 'shot', kind: 'orb', ref: { x: 100, y: 100 } })],
  ['shot/bounce', fobj({ type: 'shot', kind: 'bounce', ref: { x: 100, y: 100 } })],
  ['shot/mortar', fobj({ type: 'shot', kind: 'mortar' })],
  ['hitwall', fobj({ type: 'hitwall' })],
  ['bullet', fobj({ type: 'bullet' })],
  ['strikeShell', fobj({ type: 'strikeShell' })],
  ['strike', fobj({ type: 'strike' })],
  ['boom', fobj({ type: 'boom' })],
  ['flash', fobj({ type: 'flash' })],
  ['vine', fobj({ type: 'vine' })],
  ['thorn', fobj({ type: 'thorn' })],
  ['mine/fly', fobj({ type: 'mine', fly: { dur: 1, sx: 100, sy: 100, tx: 300, ty: 400 } })],
  ['mine/land', fobj({ type: 'mine' })],
  ['turret', fobj({ type: 'turret' })],
  ['turret/atk', fobj({ type: 'turret', attackT: 0.1 })],
  ['cyclone', fobj({ type: 'cyclone', darts: [{ a: 0.5, r: 40 }] })],
  ['cyclone/empty', fobj({ type: 'cyclone' })],
  ['pillar/p0', fobj({ type: 'pillar', t: 0.05 })],
  ['pillar/p1', fobj({ type: 'pillar', t: 0.4 })],
  ['pillar/p2', fobj({ type: 'pillar', t: 0.75 })],
  ['pillar/p3', fobj({ type: 'pillar', t: 0.9 })],
  ['fireWall', fobj({ type: 'fireWall' })],
  ['rain', fobj({ type: 'rain' })],
  ['raindrop/fall', fobj({ type: 'raindrop', t: 0.2 })],
  ['raindrop/boom', fobj({ type: 'raindrop', t: 0.6 })],
  ['particle', fobj({ type: 'particle' })],
  ['ring', fobj({ type: 'ring' })],
  ['beam', fobj({ type: 'beam', x1: 100, y1: 100, x2: 300, y2: 300 })],
  ['beamp/p0', fobj({ type: 'beamp', t: 0.1 })],
  ['beamp/p1', fobj({ type: 'beamp', t: 0.9 })],
  ['match', fobj({ type: 'match', color: 'red' })],
  ['match/nocolor', fobj({ type: 'match' })],
];

let fail = 0;
for (const [name, f] of cases) {
  try {
    r.fx(ctx, [f]);
  } catch (e) {
    fail++;
    console.log(`[CRASH] ${name}: ${e.message}  @ ${(e.stack || '').split('\n')[1]}`);
  }
}
// t<0 过滤
try { r.fx(ctx, [fobj({ type: 'boom', t: -1 })]); } catch (e) { fail++; console.log(`[CRASH] t<0: ${e.message}`); }
// 未知 type（dispatch 应安全跳过）
try { r.fx(ctx, [fobj({ type: 'unknown_xyz' })]); } catch (e) { fail++; console.log(`[CRASH] unknown type: ${e.message}`); }

console.log(fail ? `存在 ${fail} 个崩溃` : '全部 45 个 fx 用例渲染通过，无崩溃');
process.exit(fail ? 1 : 0);
