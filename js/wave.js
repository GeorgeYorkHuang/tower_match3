/**
 * wave.js —— 波次导演：生成本波敌人投放计划、按间隔陆续放怪、生成单只敌人
 * 持有 game 引用以访问 run / enemies / 状态 / BGM；持有 ly 以取布局坐标
 */
const CONFIG = require('./config.js');
const { initEnemyState } = require('./combat.js');
const WAVE_DUR = CONFIG.WAVE.seconds; // 40s

/** 波次导演：负责"本波出怪"的完整生命周期 */
class WaveDirector {
  constructor(game, ly) {
    this.game = game;
    this.ly = ly;
    this.plan = [];       // 投放计划（未出场敌人队列）
    this.timer = 0;       // 距下次放出的计时
    this.interval = 0.5;  // 放出间隔
    this._eid = 0;        // 敌人 id 自增
    this.hasBoss = false;
    this.enemyTotalHp = 0;
  }

  /** 开始新一波：结算 run、清场、生成投放计划、切战斗状态 */
  start() {
    const g = this.game;
    g.run.startWave();
    g.waveTime = 0;
    g.enemies = [];
    this.buildPlan();
    g.state = 'fighting';
    g.selected = null;
    g.swapped = false;
    if (g.bgm && !g._bgmStarted) {
      g._bgmStarted = true;
      try { g.bgm.play(); } catch (e) {}
    }
  }

  /** 本波普通怪类型混合（按波次解锁）：波3+ 出快速怪(20%)，波6+ 加重甲怪(20%) */
  _typeMix(w) {
    if (w >= 6) return ['normal', 'normal', 'normal', 'runner', 'tank'];
    if (w >= 3) return ['normal', 'normal', 'normal', 'normal', 'runner'];
    return ['normal'];
  }

  /** 生成本波敌人的投放计划（不立即出场，由 tick 按间隔陆续放出） */
  buildPlan() {
    const w = this.game.run.wave;
    const total = CONFIG.ENEMY.hpBase * Math.pow(CONFIG.ENEMY.hpGrowth, w - 1);
    let count = (6 + 3 * w) * 2; // v1.8：每波敌人数量翻倍（单只血量随 count 均分，总血量口径不变）
    const hasBoss = w >= 5 && w % CONFIG.ENEMY.bossEvery === 0; // 每 5 波（5,10,15...）
    const eliteCount = CONFIG.ENEMY.elitePerWave || 1;          // 每波固定精英
    const mix = this._typeMix(w);
    // 类型系数归一化：保持本波总血量≈total（与 run.endWave 结算口径一致）
    const avg = mix.reduce((s, t) => s + CONFIG.ENEMY.types[t].hpMult, 0) / mix.length;
    const eliteAvg = CONFIG.ENEMY.types.elite.hpMult / avg;
    this.plan = [];
    this.timer = 0;
    this._eid = 0;
    const bossN = hasBoss ? 1 : 0;
    const normalCount = count - bossN - eliteCount;
    if (hasBoss) {
      const bossHp = (total / count) * CONFIG.ENEMY.bossHpMult;
      const rest = (total - bossHp) / Math.max(normalCount + eliteCount, 1);
      for (let i = 0; i < normalCount; i++) {
        const tp = mix[i % mix.length];
        this.plan.push({ type: tp, hp: rest * (CONFIG.ENEMY.types[tp].hpMult / avg), offset: 0.5 + Math.random() * 0.5, isBoss: false });
      }
      for (let i = 0; i < eliteCount; i++) {
        this.plan.push({ type: 'elite', hp: rest * eliteAvg, offset: 0.5 + Math.random() * 0.5, isBoss: false });
      }
      this.plan.push({ type: 'boss', hp: bossHp, offset: 0.5 + Math.random() * 0.3, isBoss: true }); // Boss 最后出场
    } else {
      const base = total / count;
      for (let i = 0; i < normalCount; i++) {
        const tp = mix[i % mix.length];
        this.plan.push({ type: tp, hp: base * (CONFIG.ENEMY.types[tp].hpMult / avg), offset: 0.5 + Math.random() * 0.5, isBoss: false });
      }
      for (let i = 0; i < eliteCount; i++) {
        this.plan.push({ type: 'elite', hp: base * eliteAvg, offset: 0.5 + Math.random() * 0.5, isBoss: false });
      }
    }
    // 前 75% 波时长内放完，避免同屏堆叠
    this.interval = Math.max(0.35, (WAVE_DUR * 0.75) / this.plan.length);
    this.hasBoss = hasBoss;
    this.enemyTotalHp = total;
  }

  /** 每帧推进投放：到间隔放出一只 */
  tick(dt) {
    if (!this.plan.length) return;
    this.timer += dt;
    while (this.timer >= this.interval && this.plan.length) {
      this.timer -= this.interval;
      this.spawnOne();
    }
  }

  /** 按投放计划放出一只敌人 */
  spawnOne() {
    if (!this.plan.length) return;
    const it = this.plan.shift();
    const entryY = this.ly.areaY + this.ly.entryH;
    const wallY = this.ly.wallY;
    const speed = (wallY - entryY) / WAVE_DUR;
    this.pushEnemy(it.hp, entryY, speed, it.offset, it.isBoss, it.type);
  }

  /** 敌人入列（id / 位置 / 血量 / 速度 / 类型 / 攻城攻击参数 / A1 状态字段） */
  pushEnemy(hp, entryY, speed, offset, isBoss, type) {
    const tcfg = CONFIG.ENEMY.types[type] || CONFIG.ENEMY.types.normal;
    const size = isBoss ? CONFIG.LAYOUT.enemy.boss : (CONFIG.LAYOUT.enemy[type] || CONFIG.LAYOUT.enemy.normal);
    const atkKey = isBoss ? 'boss' : (type || 'normal');
    const e = {
      id: this._eid++,
      x: this.ly.areaX + size / 2 + Math.random() * (this.ly.areaW - size),
      y: entryY + 20 * offset,
      hp, maxHp: hp, isBoss, type: type || 'normal',
      speed: speed * (isBoss ? 0.8 : tcfg.spdMult),
      attack: CONFIG.ENEMY.attack[atkKey] || CONFIG.ENEMY.attack.normal,        // 攻城每次伤害
      attackInterval: CONFIG.ENEMY.attackInterval[atkKey] || CONFIG.ENEMY.attackInterval.normal, // 攻城攻击间隔
      attackT: 0,
    };
    this.game.enemies.push(initEnemyState(e));
  }
}

module.exports = { WaveDirector };
