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

  /** 开始新一波：结算 run、清场（叠加波 keepEnemies=true 时保留场上剩余敌人）、生成投放计划、切战斗状态 */
  start(keepEnemies) {
    const g = this.game;
    g.run.startWave();
    g.waveTime = 0;
    if (!keepEnemies) g.enemies = [];   // v1.17.3 40s 超时叠加波：不清残怪，新一波继续出
    this._freezeDone = false;   // v1.16.78 冻结时刻：每波首个敌人冰冻
    this.buildPlan();
    // v1.17.5 本波参考时长 = 投放时长(数量×0.45) + 10s（仅用于状态条倒计时展示；实际结束=清场或投完+10s）
    this.waveDur = this.plan.length * this.interval + 10;
    g.state = 'fighting';
    g.selected = null;
    g.swapped = false;
    if (g.bgm && !g._bgmStarted) {
      g._bgmStarted = true;
      try { g.bgm.play(); } catch (e) {}
    }
  }

  /** 生成本波敌人的投放计划（不立即出场，由 tick 按间隔陆续放出）
   *  v1.17 代际重构（已确认 v2）：普通怪按 CONFIG.ENEMY.levelMix(w) 等级权重取模投放，
   *  单只血量 = 等级表值；精英/Boss 用本波主等级 × 倍率。诅咒 ×1.15^n 乘到每只血量 */
  buildPlan() {
    const w = this.game.run.wave;
    const curseMult = Math.pow(1.15, this.game.run.curseStacks || 0); // v1.16.78 深渊诅咒被动
    // v1.17.6 数量增长：基数 15，每 2 波 +1 只，每 5 波额外 +5 只（线性低增长，配合等级表强度）
    let count = 15 + Math.floor((w - 1) / 2) + Math.floor(w / 5) * 5;
    const hasBoss = w >= 5 && w % CONFIG.ENEMY.bossEvery === 0; // 每 5 波（5,10,15...）
    const eliteCount = Math.floor(count / 20);                  // v1.17.6 每 20 只怪多 1 只精英（wave1-21 无精英，22 起 1 只逐档递增）
    const mix = CONFIG.ENEMY.levelMix(w);                       // 代际权重数组（主代 + 副代 + 残留代）
    const mainLv = CONFIG.ENEMY.mainLevel(w);                   // 本波主等级（精英/Boss 属性基准）
    this.plan = [];
    this.timer = 0;
    this._eid = 0;
    this.planDoneAt = null;   // v1.17.5 投放完成时刻（game.waveTime），null=未放完
    const bossN = hasBoss ? 1 : 0;
    const normalCount = count - bossN - eliteCount;
    for (let i = 0; i < normalCount; i++) {
      const lv = mix[i % mix.length];
      const lcfg = CONFIG.ENEMY.levelOf(lv);
      this.plan.push({ lv, type: lcfg.type, hp: lcfg.hp * curseMult, offset: 0.5 + Math.random() * 0.5, isBoss: false });
    }
    for (let i = 0; i < eliteCount; i++) {
      this.plan.push({ lv: mainLv, type: 'elite', hp: CONFIG.ENEMY.levelOf(mainLv).hp * CONFIG.ENEMY.eliteHpMult * curseMult, offset: 0.5 + Math.random() * 0.5, isBoss: false });
    }
    if (hasBoss) {
      this.plan.push({ lv: mainLv, type: 'boss', hp: CONFIG.ENEMY.levelOf(mainLv).hp * CONFIG.ENEMY.bossHpMult * curseMult, offset: 0.5 + Math.random() * 0.3, isBoss: true }); // Boss 最后出场
    }
    // v1.17.5 固定投放间隔 0.45s：出怪时长 = 数量×0.45，随波次自然增长（不再是固定 30s/40s）
    this.interval = 0.45;
    this.hasBoss = hasBoss;
    this.enemyTotalHp = CONFIG.ENEMY.waveTotalHp(w, curseMult); // 与 run.endWave 结算口径一致
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

  /** 按投放计划放出一只敌人；放完最后一只时记录投放完成时刻（game.waveTime） */
  spawnOne() {
    if (!this.plan.length) return;
    const it = this.plan.shift();
    const entryY = this.ly.areaY + this.ly.entryH;
    const wallY = this.ly.wallY;
    const speed = (wallY - entryY) / WAVE_DUR;
    this.pushEnemy(it.hp, entryY, speed, it.offset, it.isBoss, it.type, it.lv);
    if (!this.plan.length) this.planDoneAt = this.game.waveTime;   // v1.17.5 投放完成时间戳
  }

  /** v1.16.131 出怪 X 坐标：避开行动区两侧灌木贴图障碍。
   *  背景图 assets/images/ui/action_area_edges.jpg 实测：左右边缘各一排灌木丛（左 0-72px / 右 678-750px，
   *  含过渡带），取安全边距 75px → 出怪中心落在 [areaX+75, areaX+areaW-75] 内（含自身尺寸内缩） */
  spawnX(size) {
    const edge = 75;
    const xMin = this.ly.areaX + edge;
    const xMax = this.ly.areaX + this.ly.areaW - edge;
    return xMin + size / 2 + Math.random() * Math.max(1, xMax - xMin - size);
  }

  /** 敌人入列（id / 位置 / 血量 / 速度 / 类型 / 攻城攻击参数 / A1 状态字段）
   *  v1.17 代际重构：lv 为代际等级，攻击/减伤/移速/展示等级由 CONFIG.ENEMY.levelOf(lv) 取值；
   *  精英/Boss 在等级表基础上叠加自带 armor 与攻击倍率 */
  pushEnemy(hp, entryY, speed, offset, isBoss, type, lv) {
    const lcfg = CONFIG.ENEMY.levelOf(lv || 1);
    const size = isBoss ? CONFIG.LAYOUT.enemy.boss : (CONFIG.LAYOUT.enemy[type] || CONFIG.LAYOUT.enemy.normal);
    const atkKey = isBoss ? 'boss' : (type || 'normal');
    const armor = Math.min(0.85, lcfg.armor
      + (isBoss ? CONFIG.ENEMY.bossArmor : 0)
      + (type === 'elite' ? (CONFIG.ENEMY.eliteArmor || CONFIG.ENEMY.types.elite.armor || 0) : 0));
    const e = {
      id: this._eid++,
      x: this.spawnX(size),
      y: entryY + 20 * offset,
      hp, maxHp: hp, isBoss, type: type || 'normal',
      genLv: lv || 1,                            // v1.17 代际等级（击杀金币/掉落按此取值）
      tier: (lv || 1) + (type === 'elite' ? 2 : type === 'tank' ? 1 : isBoss ? 4 : 0), // 展示等级 = 代际等级 + 类型档
      armor,
      speed: speed * (lcfg.spd / 1.5) * (isBoss ? 0.8 : 1), // 移速按等级表设计值归一化（Lv1 普通 = 基准 1.0）
      attack: lcfg.atk * (isBoss ? CONFIG.ENEMY.bossAtkMult : (type === 'elite' ? (CONFIG.ENEMY.eliteAtkMult || 1) : 1)), // 攻城每次伤害
      attackInterval: CONFIG.ENEMY.attackInterval[atkKey] || CONFIG.ENEMY.attackInterval.normal, // 攻城攻击间隔
      attackT: 0,
    };
    const en = initEnemyState(e);
    // v1.16.78 冻结时刻：每波首个敌人被冰冻 N 秒（按星级）；v1.16.96 3★：其后 60 码内 2 名敌人各冻 2 秒
    if (!this._freezeDone) {
      const frz = this.game.run.relicNum('cm_freeze');
      if (frz > 0) {
        en.frozen = frz;
        this.game.run.relicFx('cm_freeze', `首敌冻结 ${frz} 秒`, en.x, en.y); // v1.17 生效提示
      }
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
