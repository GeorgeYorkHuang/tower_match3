/**
 * _check_enemies.js —— mock canvas 跑敌人渲染层（de4e579 拆分产物）抓崩溃（过程文件，非交付）
 */
const { Renderer } = require('../js/game/render.js');

const ctx = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (!(k in t)) t[k] = () => {};
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; },
});
const r = new Renderer();

function enemy(over) {
  return Object.assign({
    id: 1, x: 375, y: 500, hp: 100, maxHp: 100, speed: 20,
    frozen: 0, paralyzed: 0, slow: null, corrode: null, overload: null,
    _mark: 0, _markT: 0, dots: [], delayHp: 100, isElite: false, isBoss: false,
    kind: 'normal', size: 1,
  }, over || {});
}

const cases = [
  ['normal', enemy({})],
  ['elite', enemy({ isElite: true })],
  ['boss', enemy({ isBoss: true })],
  ['frozen', enemy({ frozen: 1.5 })],
  ['slow', enemy({ slow: { mult: 0.5, ttl: 2 } })],
  ['paralyzed', enemy({ paralyzed: 1.5 })],
  ['mark', enemy({ _mark: 3, _markT: 4 })],
  ['dots/burn', enemy({ dots: [{ type: 'burn', stack: 3, ttl: 2 }] })],
  ['dots/poison', enemy({ dots: [{ type: 'poison', stack: 2, ttl: 2 }] })],
  ['dots/unknown', enemy({ dots: [{ type: 'zzz_unknown', stack: 1, ttl: 2 }] })],
  ['vine', enemy({ _vineT: 1.2 })],
  ['all', enemy({ frozen: 1, paralyzed: 1, _mark: 2, _markT: 3, slow: { mult: 0.5, ttl: 1 }, dots: [{ type: 'burn', stack: 3, ttl: 1 }, { type: 'poison', stack: 2, ttl: 1 }], _vineT: 0.5, delayHp: 70, isElite: true })],
  ['zero-hp', enemy({ hp: 0, delayHp: 0 })],
  ['low-hp', enemy({ hp: 1, delayHp: 30 })],
];

let fail = 0;
for (const [name, e] of cases) {
  try {
    r.enemies(ctx, [e], 0);
    r.enemies(ctx, [e], 0.1); // 两帧推进
  } catch (ex) {
    fail++;
    console.log(`[CRASH] ${name}: ${ex.message} @ ${(ex.stack || '').split('\n')[1]}`);
  }
}
console.log(fail ? `存在 ${fail} 个敌人渲染崩溃` : '全部 14 个敌人渲染用例通过，无崩溃');
process.exit(fail ? 1 : 0);
