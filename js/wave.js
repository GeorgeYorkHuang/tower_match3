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
    this._freezeDone = false;   // v1.16.78 冻结时刻：每波首个敌人冰冻
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
    // v1.16.78 深渊诅咒被动：怪物总血量 ×1.15^诅咒层数
    const total = CONFIG.ENEMY.hpBase * Math.pow(CONFIG.ENEMY.hpGrowth, w - 1)
      * Math.pow(1.15, this.game.run.curseStacks || 0);
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

  /** 本波怪物等级（tier）：每 5 波升一档，血量/攻击/减伤随关卡质量提升（v1.16.11） */
  tierOf(w) {
    const n = (CONFIG.ENEMY.tiers || []).length;
    if (!n) return {};
    const wi = (w && w > 0) ? w : 1;
    const idx = Math.min(n - 1, Math.floor((wi - 1) / CONFIG.ENEMY.tierEvery));
    return CONFIG.ENEMY.tiers[idx] || {};
  }

  /** 按投放计划放出一只敌人 */
  spawnOne() {
    if (!this.plan.length) return;
    const it = this.plan.shift();
    const entryY = this.ly.areaY + this.ly.entryH;
    const wallY = this.ly.wallY;
    const speed = (wallY - entryY) / WAVE_DUR;
    this.pushEnemy(it.hp, entryY, speed, it.offset, it.isBoss, it.type, it.tier);
  }

  /** 敌人入列（id / 位置 / 血量 / 速度 / 类型 / 攻城攻击参数 / A1 状态字段） */
  pushEnemy(hp, entryY, speed, offset, isBoss, type, tier) {
    const tcfg = CONFIG.ENEMY.types[type] || CONFIG.ENEMY.types.normal;
    const size = isBoss ? CONFIG.LAYOUT.enemy.boss : (CONFIG.LAYOUT.enemy[type] || CONFIG.LAYOUT.enemy.normal);
    const atkKey = isBoss ? 'boss' : (type || 'normal');
    // v1.16.11 怪物等级：tier 放大血量/攻击并附加减伤；精英/Boss 在 tier 基础上再叠自带 armor
    const wv = (this.game.run && this.game.run.wave) || 1;
    const tierCfg = tier || this.tierOf(wv);
    const mult = tierCfg.hpMult || 1;
    const armor = Math.min(0.85, (tierCfg.armor || 0) + (isBoss ? CONFIG.ENEMY.bossArmor : 0) + ((tcfg.armor || 0) * (type === 'elite' ? 1 : 0)));
    const e = {
      id: this._eid++,
      x: this.ly.areaX + size / 2 + Math.random() * (this.ly.areaW - size),
      y: entryY + 20 * offset,
      hp: hp * mult, maxHp: hp * mult, isBoss, type: type || 'normal',
      tier: Math.floor((wv - 1) / CONFIG.ENEMY.tierEvery) + (type === 'elite' ? 2 : type === 'tank' ? 1 : isBoss ? 4 : 0), // 展示等级 = 波档 + 类型档
      armor,
      speed: speed * (isBoss ? 0.8 : tcfg.spdMult),
      attack: (CONFIG.ENEMY.attack[atkKey] || CONFIG.ENEMY.attack.normal) * (tierCfg.atkMult || 1), // 攻城每次伤害（随 tier 提升）
      attackInterval: CONFIG.ENEMY.attackInterval[atkKey] || CONFIG.ENEMY.attackInterval.normal, // 攻城攻击间隔
      attackT: 0,
    };
    const en = initEnemyState(e);
    // v1.16.78 冻结时刻：每波首个敌人被冰冻 N 秒（按星级）；v1.16.96 3★：其后 60 码内 2 名敌人各冻 2 秒
    if (!this._freezeDone) {
      const frz = this.game.run.relicNum('cm_freeze');
      if (frz > 0) en.frozen = frz;
      if (this.game.run.relic3('cm_freeze')) {
        const cands = this.game.enemies.filter((o) => o.hp > 0 && !(o.frozen > 0) && Math.abs(o.y - en.y) <= 60 && o.y > en.y);
        cands.slice(0, 2).forEach((o) => { o.frozen = Math.max(o.frozen || 0, 2); });
      }
      this._freezeDone = true;
    }
    this.game.enemies.push(en);
  }
}

module.exports = { WaveDirector };
