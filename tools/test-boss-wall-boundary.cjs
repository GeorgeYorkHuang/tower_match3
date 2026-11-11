/** Boss 真实体型停步、长帧越界、受击后震、攻城与炮击预测边界回归。 */
'use strict';
const assert = require('assert');
const path = require('path');
const root = process.env.TOWER_TEST_ROOT || path.resolve(__dirname, '..');
const fixture = require(root + '/tools/moving-battle-fixture.cjs');
const Main = require(root + '/js/game/main.js');
const CONFIG = require(root + '/js/config.js');
const sizeOf = require(root + '/js/enemy-size.js');
const Galvin = require(root + '/js/bosses/galvin.js');
const Feedback = require(root + '/js/game/fx/hit-feedback.js');
const {createEnemyLayer} = require(root + '/js/game/layers/enemies.js');
const EPS = 1e-7;
function close(a, b, label) { assert(Math.abs(a - b) < EPS, `${label}: ${a} != ${b}`); }
function create(field, wave) {
  const g = new Main();
  g.menuStage = field; g.saveData = null; g.save.save = () => {}; g.newRun(false);
  g.run.wave = wave - 1; g.wave.start();
  while (g.wave.plan.length && !g.enemies.some(enemy => enemy.isBoss)) g.wave.spawnOne();
  const e = g.enemies.find(enemy => enemy.isBoss);
  assert(e, `${field}/W${wave} 必须走原生 Boss 出生`);
  return {g, e};
}
let cases = 0, renderPasses = 0;
function check(g, e) {
  const expectedWall = g.ly.wallY - sizeOf(e, CONFIG.LAYOUT.enemy) / 2 - 3;
  const stop = e.bossStandoffY == null ? expectedWall : Math.min(expectedWall, e.bossStandoffY);
  const hp = e.hp, attack = e.attack;
  e._bossStun = 0; e.frozen = 0; e._vineT = 0;
  for (const dt of [1/60, .2, 2, 20]) {
    e.y = stop - .01;
    const initial = e.y;
    const predicted = g.predictEnemyPosition(e, dt);
    close(e.y, initial, '预测不能写回实体位置');
    g.moveEnemy(e, dt);
    assert(e.y + sizeOf(e, CONFIG.LAYOUT.enemy) / 2 + 3 <= g.ly.wallY + EPS, 'Boss 贴图下沿与后震不能进入塔区');
    close(e.y, stop, '长帧仍停在边界'); close(predicted.y, e.y, '炮击预测与实际移动共用边界');
  }
  // 纠正已经越界的旧位置，冻结与阶段眩晕也不能阻止边界修复。
  for (const held of ['frozen', '_vineT', '_bossStun']) {
    e.y = g.ly.wallY + 80; e[held] = 1;
    g.moveEnemy(e, .2); close(e.y, stop, '受控越界纠正'); e[held] = 0;
  }
  // 使用真实敌人绘制入口覆盖毒池命中后震的整段周期，非仅检查逻辑坐标。
  const layer = createEnemyLayer({loadImg:()=>null,drawImg:()=>false,IMG_SRC:{}});
  layer.drawEnemyBody = (ctx, enemy, x, y, size) => {
    assert(y + size <= g.ly.wallY + EPS, '真实受击绘制下沿不能越界'); renderPasses++;
  };
  for (const name of ['drawEnemyDebuffs','drawEnemyBar','drawEnemyDebuffIcons']) layer[name] = () => {};
  const ctx = {globalAlpha:1,save(){},restore(){}};
  e.y = stop;
  for (let ms=0; ms<=150; ms+=10) {
    Feedback.record(e, 'dot', '毒池'); Feedback.step([e], ms/1000);
    layer.enemies.call(layer,ctx,[e]);
  }
  // 原生攻城入口必须在新脚底边界开始扣血，不能继续等待旧中心坐标。
  if (e.bossStandoffY == null || e.bossStandoffY >= expectedWall) {
    g.enemies = [e]; g.run.lineHp = g.run.lineMaxHp = 10000;
    e.paralyzed = 0; e.attackT = 0; e.y = expectedWall - .1;
    g.siegeEnemies(e.attackInterval); close(g.run.lineHp,10000,'未到墙不攻城');
    e.y = expectedWall; g.siegeEnemies(e.attackInterval);
    assert(g.run.lineHp < 10000, 'Boss 到新边界仍能正常攻城');
  }
  close(e.hp,hp,'不改 Boss 血量'); close(e.attack,attack,'不改 Boss 攻击力'); cases++;
}
try {
  for (const [field,wave] of [
    ['ancient',5], ['ancient',20], ['ancient',40], ['ancient',60],
    ['lava',20], ['frost',20], ['prologue_awakening',10], ['prologue_trial',20], ['prologue_gate',40],
  ]) {
    const {g,e} = create(field,wave); check(g,e);
    if (e.bossId === 'altar_galvin') for(const child of Galvin.split(g,e)) check(g,child);
  }
  const {g} = create('ancient',5);
  close(g.enemyWallLine({type:'normal'}),g.ly.wallY-20,'普通怪保留既有攻城距离');
  close(g.enemyWallLine({type:'normal',size:72}),g.ly.wallY-36,'普通怪显式尺寸口径不变');
  console.log(`PASS ${cases} native Boss forms, ${renderPasses} body/hit render passes, long-frame clamp, frozen correction, siege and predicted landings.`);
} finally { fixture.restore(); }
