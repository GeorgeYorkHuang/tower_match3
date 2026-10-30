const Lifecycle = require('./combat/lifecycle.js');
const Attacks = require('./combat/attacks.js');
const Areas = require('./combat/areas.js');
const BoomerangTower = require('./combat/towers/boomerang.js');
const CannonTower = require('./combat/towers/cannon.js');
const PoisonTower = require('./combat/towers/poison.js');
const ElectricTower = require('./combat/towers/electric.js');
const IceTower = require('./combat/towers/ice.js');
const FireTower = require('./combat/towers/fire.js');
const Statuses = require('./combat/statuses.js');
const Damage = require('./combat/damage.js');
const Projectiles = require('./combat/projectiles.js');
const Targeting = require('./combat/targeting.js');
const Death = require('./combat/death.js');
const COMBAT_BALANCE = require('./config/combat-common.js');
/**
 * combat.js —— 真实战斗系统（A1 技能行为差异化）
 * =====================================================================
 * 取代 main.js 中「totalDps()×dt 从最靠城墙敌人抽象削血」的旧机制：
 *   - 每座塔按自己的 atkInterval 独立攻击（真实节奏、真实目标、真实弹道）
 *   - 单次攻击伤害 dmg = towerDps(key) × atkInterval(key)，保持既有 DPS 口径
 *   - 每次命中按塔类型 + 已激活技能执行真实行为：
 *       火：点燃 DoT（炽焰/炽热/余烬）/ 灼烧 / 火柱 / 大火球 / 爆燃（几率引爆+灼烧爆裂）/ 多重火球 / 烈焰墙 / 火雨（区域多段）
 *       冰：寒霜 / 冰冻 / 冰穿刺 / 多重冰锥 / 冰花 / 冬珠 / 碎冰 / 冰墙
 *       毒：剧毒 DoT / 扩散 / 毒爆 / 腐蚀 / 毒雾 / 瘟疫 / 致死 / 毒性强化
 *       电：连锁弹跳 / 麻痹 / 过载 / 极光电击 / 雷暴 / 活电 / 充能 / 电磁场
 *       回旋镖：穿透 / 折返增伤 / 飞距 / 攻速 / 回收 / 双镖 / 暴击 / 范围回旋
 *       炮：溅射 / 重击 / 穿透弹 / 炮台座 / 震击 / 引信 / 弹幕 / 阵地加固
 *   - 敌人状态：灼烧/中毒 DoT、冰冻、麻痹、减速、腐蚀、连击/过载层数
 *   - 协同：爆燃×毒爆、冰冻×连锁、炮溅射×火溅射（爆炸/连锁增伤）
 *
 * 运行环境：微信小游戏（CommonJS），纯逻辑无渲染；视觉仍由 game.fx 表现。
 */
const CONFIG = require('./config.js');
const GlobalSkills = require('./global-skills.js');

/* =====================================================================
 * SKILL_NUM —— 技能行为数值表（重构 v1.16.43）
 * 档位数组约定：arr[lv]，lv = 分支等级（0=未学，取 arr[0]，通常为 0/无效值）。
 * 展示文案在 config.js EFFECT_POOLS（desc/a/b/c）；此处是**行为数值**单源，
 * combat 内一律经 SKILL_NUM 取数，禁止散落魔法数组。
 * ===================================================================== */
const SKILL_NUM = require('./config/tower-skills.js');
const GS_BALANCE = require('./config/global-balance.js');

/** 敌人状态初始化（wave.pushEnemy 时调用） */
function initEnemyState(e) {
  e.dots = [];            // [{type:'burn'|'poison', dps, ttl, stack, maxStack, tickT, src}]
  e.frozen = 0;           // 冻结剩余秒（不能移动/攻击）
  e.paralyzed = 0;        // 麻痹剩余秒（不能攻击）
  e.slow = null;          // {mult, ttl} 减速
  e.corrode = null;       // {mult, ttl} 受伤加深
  e.overload = null;      // {n, ttl} 电过载层数
  e.hitCount = 0;         // 累计命中次数（电充能）
  e.lastDmgKey = null;    // 最近一次伤害来源塔
  // 攻城参数默认值兜底（手造敌人/旧数据）
  if (e.attack === undefined) e.attack = CONFIG.ENEMY.attack.normal;
  if (e.attackInterval === undefined) e.attackInterval = CONFIG.ENEMY.attackInterval.normal;
  if (e.attackT === undefined) e.attackT = 0;
  // 血条延迟尾条：直接伤害瞬间掉血后尾条缓慢收缩（区分「直接伤一跳」与「持续伤平滑掉」）
  if (e.delayHp === undefined) e.delayHp = e.maxHp || e.hp;
  return e;
}

class CombatSystem {
  constructor(game) {
    this.game = game;
    this.shots = [];        // 飞行中弹道（命中在 dur 结束时结算）
    this.delayed = [];      // 延迟爆炸（炮引信）
    this.timers = {};       // 周期技计时
    this.atkTimers = {};    // 每塔攻击计时
    this.kills = {};        // 每塔击杀计数（回收/充能联动）
    this.bWait = {};        // 回旋镖：镖在飞行中 → true（接回后才能投下一个）
    this.bCatch = {};       // v1.16.42 回旋镖接镖冷却计时（未学接镖：接镖后 0.5s 才投下一镖）
    this._nextDmg = {};     // 回旋镖·接镖 C 续投：下镖伤害加成（v1.16）
  }

  reset() { return Lifecycle.reset(this); }

  /* ---------- 工具 ---------- */
  /** 出战塔对象（v1.16.4：测试战场单塔模式——仅 slotOrder 内塔生效，旧塔周期技/技能链立即停用） */
  tower(key) {
    const t = this.game.run.effects.tower(key);
    const order = this.game.run.slotOrder;
    if (t && order && order.length && !order.includes(key)) return null;
    return t;
  }
  /** 技能数值等级（v1.16.5：统一口径 = 激活?1+分支:0；与原版激活 1 档/分支逐级+1 一致，满级 4 档） */
  lv(key, name) {
    const b = this.tower(key);
    if (!b) return 0;
    const ef = b.pool.find((e) => e.name === name);
    return ef ? ef.level : 0;
  }
  /** 分支等级（A/B/C）——分支独立成长（v1.13 火塔重构起：分支加成按各自分支等级） */
  branchLv(key, name, br) {
    const b = this.tower(key);
    if (!b) return 0;
    const ef = b.pool.find((e) => e.name === name);
    return ef && ['A', 'B', 'C'].includes(br) ? (ef.branches[br] || 0) : 0;
  }
  has(key, name) { return this.lv(key, name) > 0; }
  enemies() { return this.game.enemies; }
  ly() { return this.game.ly; }

  /** 塔当前攻击间隔（攻速类技能叠加） */
  interval(key) {
    const cfg = CONFIG.TOWERS[key];
    let iv = cfg.atkInterval;
    // 冰·低温全塔：全塔 +10%/级，冰塔额外 +15%/级
    const chill = Math.max(this.lv('ice', '低温全塔'), 0);
    if (chill > 0) iv /= (1 + 0.10 * chill + (key === 'ice' ? 0.15 * chill : 0));
    // 回旋镖·接镖 A 已改为飞行速度提升（v1.16.5，见发射段 bDur），不再提供攻速加成
    // 炮·双管齐射 C 速射：+12%/级（v1.16.14 军火库重做后不再提供攻速）
    if (key === 'cannon') iv /= (1 + 0.12 * this.branchLv('cannon', '双管齐射', 'C'));
    // 电·充能：命中累计攻速 +5%/层（上限 5×lv 层；A 扩容上限+5/级、B 快充每层+10%、C 共享全塔）
    const charge = this.lv('electric', '充能');
    if (charge > 0 && (key === 'electric' || this.branchLv('electric', '充能', 'C') > 0)) {
      const e = this.tower('electric');
      const cap = 5 * charge + 5 * this.branchLv('electric', '充能', 'A');
      const layers = Math.min(cap, e ? e._chargeLayers || 0 : 0);
      if (layers > 0) iv /= (1 + (0.05 + 0.05 * this.branchLv('electric', '充能', 'B')) * layers);
    }
    // 圣物·疾风戒：全塔攻速 +8%/级
    const m = this.game.meta;
    const spdLv = (m && m.relicBonus && m.relicBonus().speed) || 0;
    if (spdLv > 0) iv /= (1 + 0.08 * spdLv);
    // v1.16.78 攻速戒指（局内圣遗物）：全塔攻击间隔缩短 N%（按星级）
    const spdR = this.relicVal('cm_speed');
    if (spdR > 0) iv /= (1 + spdR / 100);
    // v1.16.114 塔专属攻速圣遗物（1★/2★）：熔炉之息/寒髓/电光/速射/疾风回旋 按塔生效
    const TOWER_ASPD = { fire: 'fire_forge', ice: 'ice_marrow', electric: 'elec_light', cannon: 'can_rapid', boomerang: 'boo_speed' };
    const aspR = this.relicVal(TOWER_ASPD[key]);
    if (aspR > 0) iv /= (1 + aspR / 100);
    // v1.16.77 局内商店·攻速强化：+15%/层（本局临时）
    const store = this.game.run.storeBuff ? this.game.run.storeBuff() : { spd: 0 };
    if (store.spd > 0) iv /= (1 + 0.15 * store.spd);
    // v1.16.96 智慧典籍3★：升级触发全塔 3 秒攻速 +20%（窗口秒数由 run._tomeBuffTtl 承载，combat.update 递减）
    if (this.game.run._tomeBuffTtl > 0) iv /= 1.2;
    // v1.16.101 快充3★：充能满层释放过载脉冲，全塔攻速 +20%（持续 3 秒，触发后清层重计）
    if (this.game.run._elecPulseTtl > 0) iv /= 1.2;
    // v1.16.96 焚天3★：火柱/火墙/火雨施放后 3 秒内全塔攻速 +25%
    if (this.game.run._burnallTtl > 0) iv /= 1.25;
    return Math.max(COMBAT_BALANCE.minAttackInterval, iv / (this.game.run.gsState && this.game.run.gsState.haste > 0 ? GS_BALANCE.haste.speedMultiplier : 1));
  }

  /** 塔当前射程（射程/技能叠加） */
  range(key) { return Targeting.range(this, key); }

  /** v1.16.78 圣遗物当前星级数值（1★=desc / 2★=star2 文本最后数字）；未获得返回 0 */
  relicVal(id) {
    const g = this.game;
    const run = g && g.run;
    if (!run || !run.relicRun || run.relicRun(id) <= 0) return 0;
    const star = (g.meta && g.meta.starOf) ? g.meta.starOf(id) : 1;
    return CONFIG.relicNum(id, star);
  }

  /** v1.16.78 塔圣遗物「伤害类」乘区：desc 与 star2 均描述伤害 → 该塔所有伤害（普攻+技能同源）×(1+ΣN%) */
  relicTowerDmg(key) {
    const g = this.game;
    const run = g && g.run;
    if (!run || !run.runRelic) return 0;
    const cat = CONFIG.RELIC_RUN.tower[key];
    if (!cat) return 0;
    let sum = 0;
    cat.forEach((d) => {
      if (run.relicRun(d.id) > 0 && d.desc && d.star2 && /伤害/.test(d.desc) && /伤害/.test(d.star2)) {
        sum += this.relicVal(d.id);
      }
    });
    return sum;
  }

  /** 单次攻击伤害：towerDps × 攻击间隔（保持总 DPS 口径）；isSkill=true 表示技能/DoT 上下文（v1.16.96 全局充能3★ 技能伤加成只吃技能） */
  shotDmg(key, isSkill) { return Damage.shotDmg(this, key, isSkill); }

  /** v1.16.77 周期技弱化倍率：塔能量耗尽 → 周期 ×1.5（伤害弱化已由 shotDmg 统一 ×0.5） */
  _weakPeriod(key) {
    const t = this.tower(key);
    return t && t.energy <= 0 ? CONFIG.GLOBAL_SKILL.weakPeriod : 1;
  }

  /* ---------- v5.2 三消连消技 ---------- */

  /** 周期技能 timer 映射：连锁技能随机释放（tick 内 timer 到点即施放） */
  static PERIODIC_TIMERS() {
    return {
      fire: { '火柱': 'firePillar', '烈焰墙': 'fireWall', '火雨': 'fireRain' },
      ice: { '冰花': 'iceFlower', '冬珠': 'frostOrb', '冰墙': 'iceWall' },
      electric: { '极光电击': 'arc', '雷暴': 'storm' },                 // 活电=命中触发，非周期施放
      poison: { '毒池': 'pool', '毒棒': 'stick', '毒藤': 'vine' },      // 瘴气=驻场被动
      cannon: { '炮火支援': 'support', '地雷阵': 'mine', '炮台': 'turret' },
      boomerang: { '风暴镖': 'storm', '弹力镖': 'ringN' },               // 风痕=命中触发
    };
  }

  /** 连锁技能：随机释放对应塔一个已激活周期技能（不受周期影响）。
   *  将对应 timer 置为超阈值 → 下一帧 tick 立即施放一次；无已激活周期技返回 false（run 侧补能量）。 */
  castPeriodicNow(key) {
    const map = CombatSystem.PERIODIC_TIMERS()[key];
    if (!map) return false;
    const names = Object.keys(map).filter((n) => this.lv(key, n) > 0);
    if (!names.length) return false;
    const name = names[Math.floor(Math.random() * names.length)];
    this.timers[map[name]] = (this.timers[map[name]] || 0) + 1e9;   // 下一帧 tick 立即施放
    // 施放确认飘字（金色，棋盘联动反馈）
    if (this.game && this.game.run && this.game.run.fxTarget) {
      this.game.run.fxTarget.push({ type: 'floatText', text: name, x: 375, y: 300, t: 0, dur: 0.9, size: 18, color: '#f7c948' });
    }
    return true;
  }

  /** 连锁攻击：在消除格位置（x,y）生成对应塔子弹，寻敌=最近（首枚）+ 主目标上方 40px 截面随机（其余），
   *  攻击力不受塔能量影响（剔除弱化态）。 */
  spawnChainShots(ent) {
    const g = this.game;
    const { key, x, y } = ent;
    const main = this.pickTarget(key);
    if (!main) return;
    let dmg = this.shotDmg(key);
    const t = this.tower(key);
    if (t && t.energy <= 0) dmg /= CONFIG.GLOBAL_SKILL.weakDmg;   // 去弱化：不受能量影响
    const cfg = CONFIG.TOWERS[key];
    const tint = { fire: '#e74c3c', ice: '#7fd4ff', poison: '#52be80', electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d' }[key] || '#ffd24a';
    const dur = cfg.shot.dur;
    // 每枚独立寻敌：主目标上方 40px 截面带内随机敌人（带内无其他敌人则回退主目标），避免所有子弹打向同一个敌人
    const target = this.pickAltTarget(key, main);
    this.addProjectile({ key, target, dmg, t: 0, dur, sx: x, sy: y }, { type: 'shot', kind: cfg.shot.kind, color: tint, x, y, tx: target.x, ty: target.y, t: 0, dur, key });
    g.playSfx('shot', 0.25);
    // 消除格迸发小闪光（连消触发反馈）
    this.fxFlash(x, y, tint);
  }


  /** v1.16.77 周期技能施放扣能量：能量 >= 成本时扣除并全额施放；不足则弱化施放（不扣，伤害 ×0.5） */
  castEnergy(key, name) {
    const t = this.tower(key);
    if (!t) return;
    const cost = (CONFIG.SKILL_ENERGY && CONFIG.SKILL_ENERGY[name]) || 0;
    if (cost <= 0) return;
    if (t.energy < cost) return;
    t.energy = Math.max(0, t.energy - cost);
  }

  /** 毒·毒性强化（v1.16.21）：选择后中毒 DoT 由 10% 提升为 15%（+50% 单跳）；A 每级 18%/21%/24%（档位式）；B 时长 +2/+4/+6s（档位式） */
  dotBoost() { return Statuses.dotBoost(this); }

  /* ---------- 主更新：弹道命中 → 状态推进 → 塔攻击 → 周期技 → 死亡触发 ---------- */
  update(dt) { return Lifecycle.update(this, dt, initEnemyState); }

  /* ---------- 弹道与召唤物推进（v1.16.43 重构：主循环子方法） ---------- */

  /** 单枚飞行弹道推进一帧；返回 false 表示命中结算/耗尽，应移除 */
  addProjectile(shot, visual) { return Projectiles.addProjectile(this, shot, visual); }

  stepShot(s, dt) {
    const g = this.game;
    s.t += dt;
    if (s.t < 0) return true;
    if (s.orb) {
      // v1.16.21 游走电球（活电扩散）：每帧随机转向漂移（转向幅度加大 ±1.6 rad，配合等分初角更像四周扩散），命中 34px 内敌人即结算消失，dur 耗尽消散
      s.ang += (Math.random() - 0.5) * SKILL_NUM.electric['活电'].turnJitter;
      s.x += Math.cos(s.ang) * s.speed * dt;
      s.y += Math.sin(s.ang) * s.speed * dt;
      const hitE = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - s.x, o.y - s.y) < SKILL_NUM.electric['活电'].hitRadius);
      if (hitE) {
        if (s.fx) s.fx.t = s.fx.dur;
        this.damage(hitE, s.dmg, 'electric');
        this.tryAttackDebuff('electric', hitE, s.dmg);   // v1.16.53 活电电球属普攻强化：统一麻痹判定（吃麻痹技能加成）
        // v1.16.101 电球3★：电球游走路径留电痕 1 秒，触碰敌人受 10% 伤害
        if (this.game.run.relic3('elec_orb')) {
          this.groundDots = this.groundDots || [];
          this.groundDots.push({ x: hitE.x, y: hitE.y, r: 50, ttl: 1, dps: this.shotDmg('electric') * 0.1, key: 'electric' });
          this.fxRing(hitE.x, hitE.y, '#f4d03f', 50, 0.4, 3);
        }
        this.fxFlash(hitE.x, hitE.y, '#f4d03f');
        this.fxParticle(hitE.x, hitE.y, '#f4d03f', 5, 30, 0.3, 120, 4);
        return false;
      }
      return s.t < s.dur;
    }
    if (s.bounce) return BoomerangTower.stepBounce(this, s, dt);
    if (s.scatter) {
      // v1.13.13：无目标散射弹道——沿途真实碰撞，命中即结算并消失；射界尽头（dur 耗尽）未命中也消失
      const hitE = this.scatterCheck(s);
      if (hitE) {
        if (s.onHit) s.onHit(hitE, s.dmg);
        return false;
      }
      return s.t < s.dur;
    }
    if (s.t >= s.dur) {
      if (s.sweep) this.sweepDamage(s, dt);
      else this.resolveShot(s);
      return false;
    }
    if (s.sweep) this.sweepDamage(s, dt);
    return true;
  }

  /** 延迟爆炸推进（炮引信 / 炮火支援落点 / 冰花延迟结算） */
  updateDelayed(dt) { return Areas.updateDelayed(this, dt); }

  /** 地面持续区域推进（火·余烬直伤 / 毒·毒池·毒沼直伤+每秒叠毒+泥沼减速） */
  updateGroundDots(dt) { return Areas.updateGroundDots(this, dt); }

  /** 毒·毒棒推进（v1.15）：独立攻击周边 200px 敌人（直伤 + 叠毒），持续结束消失 */
  updatePoisonSticks(dt) { return PoisonTower.updatePoisonSticks(this, dt); }

  /** 炮·地雷阵推进：飞行中不可引爆，落地布设 0.3s 后可引爆；C 碎雷星状散射弹片 */
  updateMines(dt) { return CannonTower.updateMines(this, dt); }

  /** 炮·炮台推进：独立炮击最靠墙敌人（直伤+爆炸），持续结束消失 */
  updateTurrets(dt) { return CannonTower.updateTurrets(this, dt); }

  /** 回旋镖·风暴镖推进（v1.16.21）：三同心圈旋转十字飞镖，每镖独立命中 10% 伤害，命中不消失 */
  updateStorms(dt) { return BoomerangTower.updateStorms(this, dt); }

  /** 回旋镖·风痕推进：路径伤害区，C 卷痕减速 */
  updateWindTrails(dt) { return BoomerangTower.updateWindTrails(this, dt); }

  /* ---------- 敌人状态推进 ---------- */
  tickStatus(e, dt) {
    Statuses.tickBaseStatus(this, e, dt);
    PoisonTower.tickEnemyStatus(this, e, dt);
  }

  /* ---------- 伤害结算 ---------- */
  damage(e, dmg, srcKey, kind) { return Damage.damage(this, e, dmg, srcKey, kind); }

  /* ---------- 死亡触发：各塔死亡技能（爆燃/毒爆/霜星/扩散/回收/致死） ---------- */
  onKill(e) { return Death.onKill(this, e); }

  /* ---------- 三消联动：塔额外攻击一次（多消形状触发不同攻击特效） ---------- */
  bonusStrike(key, shape) {
    const g = this.game;
    const t = this.tower(key);
    if (!t || t.level === 0) return;
    // v1.16.77 能量：三消额外攻击同样耗 0.5 能量；能量耗尽不取消，伤害走弱化态（shotDmg 内 ×0.5）
    // v1.16.96 弹药箱3★：能量不足时从备用能量库借用
    g.run.spendAttackEnergy(t);
    const tgt = this.pickTarget(key);
    if (!tgt) return;
    const dmg = this.shotDmg(key);
    const tint = CONFIG.TOWERS[key].color || '#fff';
    if (shape === '3') {
      // 三连：单发直击
      this.damage(tgt, dmg, key);
      this.fxFlash(tgt.x, tgt.y, tint, 0.3);
      this.fxParticle(tgt.x, tgt.y - 8, tint, 4, 40, 0.4, 120, 4);
    } else if (shape === '4') {
      // 直4：双发（第二发 50%）
      this.damage(tgt, dmg, key);
      this.damage(tgt, dmg * 0.5, key);
      this.fxFlash(tgt.x, tgt.y, tint, 0.35);
      this.fxRing(tgt.x, tgt.y, tint, 36, 0.35, 3);
    } else if (shape === 'L5' || shape === '5') {
      // L5/直5：溅射爆
      this.explode(tgt.x, tgt.y, 72, dmg, key, 0, false);
      this.fxRing(tgt.x, tgt.y, tint, 60, 0.4, 4);
    } else {
      // 6+ 大消：大范围高伤爆
      this.explode(tgt.x, tgt.y, 110, dmg * 1.5, key, 0, false);
      this.fxRing(tgt.x, tgt.y, tint, 90, 0.5, 5);
      this.fxFlash(tgt.x, tgt.y, '#ffffff', 0.4);
    }
  }

  /* ---------- 塔攻击调度 ---------- */
  tickTower(key, dt) { return Attacks.tickTower(this, key, dt); }

  /** 选择攻击目标（v1.16.130）：射程内直线距离最近的一个怪物（更智能：优先打靠近塔的威胁） */
  pickTarget(key) { return Targeting.pickTarget(this, key); }

  /** v1.16.130 额外目标：主目标 Y 轴往上 40px 截面范围（水平带 [main.y-40, main.y]）内的随机敌人；带内无其他敌人时回退主目标 */
  pickAltTarget(key, main) { return Targeting.pickAltTarget(this, key, main); }

  /** 单塔一次攻击：选目标 → 发弹道（表现层） + 登记命中回调 */
  attackOnce(key) { return Attacks.attackOnce(this, key); }

  /* ---------- 弹道命中结算 ---------- */
  resolveShot(s) { return Projectiles.resolveShot(this, s); }

  /** 散射弹道（无目标）沿途碰撞检测（v1.13.13）：按 t/dur 线性插值当前位置，命中半径内敌人返回该敌，未命中返回 null */
  scatterCheck(s) { return Projectiles.scatterCheck(this, s); }

  /** 回旋镖轨迹点（v1.9）：椭圆大弧——镖从塔出发，划弧越过投掷方向最远点后继续绕回塔（非原路径折返） */
  sweepPos(s, p) { return Projectiles.sweepPos(s, p); }

  /** 回旋镖沿途伤害（v1.16）：椭圆大弧扫过路径上的所有敌人，每敌单镖最多命中一次；折返 C 宽返吸附 +20%/级；风痕留痕 */
  sweepDamage(s) { return BoomerangTower.sweepDamage(this, s); }

  /**
   * 普攻 debuff 统一判定（v1.16.53）：普攻与**普攻强化攻击**（电·连锁/活电/电磁场、火·多重火球、
   *   冰·多重冰锥/碎冰、镖·多镖等）命中均走此判定——各塔基础 20% 概率，学对应 dot 强化技能后
   *   概率提升（公式与普攻一致：基础 20% + 技能 +25%[电·麻痹为 +20%] + A 分支每级 +15%）
   */
  tryAttackDebuff(key, o, dmg) {
    if (key === 'fire') {
      // 灼烧（v1.16.21）：基础 20%；学「点燃」+25%（A 炽焰每级再 +15%）
      const ignite = this.lv('fire', '点燃');
      let burnProb = SKILL_NUM.fire['点燃'].baseProbability;
      if (ignite > 0) burnProb += SKILL_NUM.fire['点燃'].learnedProbability + SKILL_NUM.fire['点燃'].probabilityPerBranch * this.branchLv('fire', '点燃', 'A');
      burnProb += this.relicVal('fire_fuel') / 100;   // v1.16.114 薪柴1★/2★：普攻灼烧概率 +20%/30%
      // v1.16.96 薪柴3★：灼烧概率触顶（≥80%）时，多余的判定转为 +10% 灼烧伤害（失败部分累积，上限 +50%）
      if (this.game.run.relic3('fire_fuel') && burnProb >= 0.8) {
        if (Math.random() < 0.8) this.applyBurn(o, dmg, 'fire');
        else this.game.run._fuelBoost = Math.min(50, (this.game.run._fuelBoost || 0) + 10);
      } else if (Math.random() < burnProb) this.applyBurn(o, dmg, 'fire');
    } else if (key === 'ice') {
      // 冰缓（v1.16.21）：基础 20%；学寒霜 +25% + A 极寒每级 +15%（45→60→75→90%）；B 凝结 时长 +1/+2/+3s；C 深寒 减速幅度 +10%/20%/30%
      const frost = this.lv('ice', '寒霜');
      const probSlow = SKILL_NUM.ice['寒霜'].baseProbability + (frost > 0 ? SKILL_NUM.ice['寒霜'].learnedProbability + SKILL_NUM.ice['寒霜'].probabilityPerBranch * this.branchLv('ice', '寒霜', 'A') : 0) + this.relicVal('ice_extreme') / 100;   // v1.16.114 极寒1★/2★
      // v1.16.99 极寒3★：冰缓概率触顶（≥80%）时，多余判定转为 0.3 秒冻结
      const ext = this.game.run.relic3('ice_extreme') && probSlow >= 0.8;
      const slowOK = ext ? Math.random() < 0.8 : Math.random() < probSlow;
      if (slowOK) {
        const mult = SKILL_NUM.ice['寒霜'].baseSlow + SKILL_NUM.ice['寒霜'].slowMult[this.branchLv('ice', '寒霜', 'C')] + this.relicVal('ice_spike') / 100;   // v1.16.114 霜刺1★/2★
        const ttl = SKILL_NUM.ice['寒霜'].duration + SKILL_NUM.ice['寒霜'].ttl[this.branchLv('ice', '寒霜', 'B')];
        this.applySlow(o, mult, ttl);
        this.fxParticle(o.x, o.y, '#a9d6f5', 6, 50, 0.5, 80, 5);
      } else if (ext) {
        this.freezeE(o, 0.3);
      }
      // 冰冻（v1.16.21）：学技能后 20% 概率冻结 + A 档位；B 深结 时长 +1/1.5/2s
      const frzLv = this.lv('ice', '冰冻');
      if (frzLv > 0) {
        const prob = SKILL_NUM.ice['冰冻'].baseProbability + SKILL_NUM.ice['冰冻'].prob[this.branchLv('ice', '冰冻', 'A')];
        if (Math.random() < prob) {
          const dur = SKILL_NUM.ice['冰冻'].baseDuration + SKILL_NUM.ice['冰冻'].dur[this.branchLv('ice', '冰冻', 'B')];
          o.frozen = Math.max(o.frozen || 0, dur);
          this.fxFlash(o.x, o.y, '#d6f0ff', 0.28);
          this.fxRing(o.x, o.y, '#7fd4ff', 46, 0.4, 4);
          this.fxParticle(o.x, o.y, '#b8e6ff', 10, 60, 0.5, 130, 5);
        }
      }
    } else if (key === 'electric') {
      ElectricTower.tryAttackDebuff(this, o, dmg);
    } else if (key === 'poison') {
      PoisonTower.tryAttackDebuff(this, o, dmg);
    } else if (key === 'boomerang') {
      BoomerangTower.tryAttackDebuff(this, o, dmg);
    }
  }

  /* ---------- 六塔命中行为 ---------- */
  hit(key, e, dmg) {
    const g = this.game;
    ElectricTower.onAnyTowerHit(this, e);

    if (key === 'fire') this.hitFire(e, dmg);
    else if (key === 'ice') this.hitIce(e, dmg);
    else if (key === 'poison') this.hitPoison(e, dmg);
    else if (key === 'electric') this.hitElectric(e, dmg);
    else if (key === 'boomerang') this.hitBoomerang(e, dmg);
    else if (key === 'cannon') this.hitCannon(e, dmg);

    // 命中计数（电·充能）
    e.hitCount++;
    // 命中特效：按塔类型爆发专属粒子（v1.13.2 增强：数量更多 + 命中冲击环 + 双色火花）
    const HIT_FX = { fire: '#ff7043', ice: '#7fd4ff', poison: '#7ee2a8', electric: '#f4d03f', boomerang: '#c39bd3', cannon: '#d89e63' };
    this.fxParticle(e.x, e.y, HIT_FX[key] || '#ffffff', 8, 52, 0.4, 140, 5);
    this.fxParticle(e.x, e.y, '#ffffff', 4, 30, 0.25, 110, 3);
    this.fxRing(e.x, e.y, HIT_FX[key] || '#ffffff', 30, 0.28, 3);
    this.fxFlash(e.x, e.y, '#ffffff', 0.25);
  }

  /* ============ 火塔（v1.13 重构：点燃/灼烧/火柱/大火球/爆燃/多重火球/烈焰墙/火雨） ============ */
  /** v1.16.112 火塔普攻命中统一挂点（3★ 圣遗物）：hitFire 与多重火球 strike 共用，保证所有普攻路径生效
   *  焰雨3★：火球命中同一目标 3 次 → 下次命中必为三连火球（追加 3 发等额伤害 + 三连火花爆发）
   *  熔炉之息3★：每 5 次普攻附带一次免费火柱（150% 伤害·半径120，不耗能量）
   *  火焰弹射（1★/2★）：普攻 25%/40% 概率额外发射一枚火球；3★：弹射火球命中时 50% 概率返还 1 点能量 */
  _attackFireOnHit(e, dmg) { return FireTower._attackFireOnHit(this, e, dmg); }

  /** v1.16.112 火塔普攻级挂点（每攻击一次判定一次，与弹道数量无关）：
   *  熔炉之息3★：每 5 次普攻附带一次免费火柱（150% 伤害·半径120，不耗能量）
   *  火焰弹射（1★/2★）：普攻 25%/40% 概率额外发射一枚火球；3★：弹射火球命中时 50% 概率返还 1 点能量 */
  _fireAttackOnAttack() { return FireTower._fireAttackOnAttack(this); }

  /** v1.16.112 薄壳：火塔弹道命中入口（未学多重火球的普攻弹道 resolveShot → hit() → hitFire） */
  hitFire(e, dmg) { return FireTower.hitFire(this, e, dmg); }

  /** v1.16.130 多重火球重做：一次普攻从塔口扇形飞出 n 枚火球——
   *   中心一枚锁定主目标（弹道末端跟随、命中才结算），其余以主目标方向为基准两侧扇形 scatter（沿途碰撞命中即止）；
   *   每枚命中走完整结算（灼烧/焰雨三连/大火球爆炸/多重火球 C 散射分裂）。
   *   解决原"普攻先命中再从目标处散射"的割裂感 */
  _fireMultiShot(e, dmg) { return FireTower._fireMultiShot(this, e, dmg); }

  /** v1.16.112 火塔普攻命中伤害段（灼烧判定/大火球/多重火球）：单发普攻弹道命中路径执行；多重火球路径走 strike 回调 */
  _fireAttackHit(e, dmg) { return FireTower._fireAttackHit(this, e, dmg); }

  /** v1.16.114 单发大火球爆炸（普攻单发 / 焰雨追加火球共用；含爆核1★/2★ 半径扩大与 3★ 边缘击退点燃） */
  _fireSingleBlast(e, dmg) { return FireTower._fireSingleBlast(this, e, dmg); }

  /** v1.16.114 火球命中统一结算（焰雨三连 / 焰雨1★2★ 追加火球共用）：
   *  伤害 + 统一灼烧判定 + 多重火球 C 散射分裂 + 大火球爆炸——即三连在多重火球/大火球下多次触发其攻击效果 */
  _fireImpact(o, d, ang) { return FireTower._fireImpact(this, o, d, ang); }

  applyBurn(e, dmg, src) { return Statuses.applyBurn(this, e, dmg, src); }



  tickFire(dt) { return FireTower.tickFire(this, dt); }

  // ===== tickIce =====


  /* ============ 冰塔 ============ */

  /** v1.16.130 多重冰锥重做：一次普攻从塔口扇形飞出 n 枚冰锥——
   *   中心一枚锁定主目标（弹道末端跟随、命中才结算），其余以主目标方向为基准两侧扇形 scatter（沿途碰撞命中即止）；
   *   C 增殖分支保留：10/14/18 枚超小型冰锥各自索敌独立飞行 */
  _iceMultiShot(e, dmg) { return IceTower._iceMultiShot(this, e, dmg); }

  hitIce(e, dmg) { return IceTower.hitIce(this, e, dmg); }

  tickIce(dt) { return IceTower.tickIce(this, dt); }

  // ===== tickElectric =====


  /* ============ 电塔 ============ */
  hitElectric(e, dmg) { return ElectricTower.hitElectric(this, e, dmg); }

  tickElectric(dt) { return ElectricTower.tickElectric(this, dt); }

  // ===== tickPoison =====


  /* ============ 毒塔（v1.15 重做：基础中毒 20% 概率叠层 / 剧毒 / 毒爆 / 毒池 / 毒棒 / 毒性强化 / 瘟疫 / 毒藤 / 瘴气） ============ */
  hitPoison(e, dmg) { return PoisonTower.hitPoison(this, e, dmg); }

  /** 毒·中毒叠层（v1.16.21）：每层每秒 = 单发伤害×10%，基础持续 5 秒，上限 5 层（毒性强化 C +2/级）；
   *  剧毒 B 时长 +2s/级（不变）；剧毒 C 每跳间隔 -0.1/-0.2/-0.3s（1s → 0.9/0.8/0.7s） */
  applyPoison(e, dmg, src, layers) { return Statuses.applyPoison(this, e, dmg, src, layers); }

  /** 当前中毒层数（毒爆 B 继承用） */
  poisonStack(e) { return Statuses.poisonStack(this, e); }

  /** 塔口坐标（普攻/技能弹道统一发射点，v1.16.37 统一口径）：
   *  正式战斗：塔位槽布局（槽中心）；测试战场：单塔出战大槽（渲染 testFieldLayer 硬编码 x=15/y=1053，中心 65,1103）
   *  v1.16.39 槽数恒用渲染固定值（正式 4 槽），不随已激活塔数变化——得塔前/后塔位坐标稳定（旧实现 n=slotOrder.length，1 塔时算成单槽居中 → 塔区中心） */
  tickPoison(dt) { return PoisonTower.tickPoison(this, dt); }

  // ===== tickCannon =====


  /* ============ 炮塔（v1.16 重做：重炮/震击/贯穿弹/双管齐射/炮火支援/地雷阵/炮台/军火库） ============ */
  hitCannon(e, dmg) { return CannonTower.hitCannon(this, e, dmg); }

  /** 范围爆炸（含击退/减速）；爆炸颜色按塔类型 */
  tickCannon(dt) { return CannonTower.tickCannon(this, dt); }

  // ===== tickBoomerang =====


  /* ============ 回旋镖塔 ============ */
  /* ============ 回旋镖塔（v1.16 重做：折返增伤/穿透/多镖/接镖/猎手标记/风暴镖/镖阵/风痕） ============ */
  hitBoomerang(e, dmg) { return BoomerangTower.hitBoomerang(this, e, dmg); }

  /* 普攻流血（v1.16.21 回旋镖塔重做）：每移动 10px 结算 4% 攻击伤害（每 100px 跳 40%）；「放血」：基础 +25% 概率（20→45%）/ A 刺骨 +15%/级（45→90%）/ B 时长 +1s/级 / C 溃烂 每 10px 伤害 4%→6/8/10% */
  applyBleed(e, dmg) { return Statuses.applyBleed(this, e, dmg); }

  tickBoomerang(dt) { return BoomerangTower.tickBoomerang(this, dt); }

  /* ---------- 视觉 ---------- */


  /* ============ 公共：状态 / 几何 / 通用 ============ */
  applySlow(e, mult, ttl) { return Statuses.applySlow(this, e, mult, ttl); }

  /** v1.16.98 冰塔 3★ helper：冻结（Boss 时长 ×0.6 递减，design R3 建议） */
  freezeE(e, dur) { return Statuses.freezeE(this, e, dur); }

  /** v1.16.98 暴雪3★：冰锥命中已冰缓的敌人时 30% 概率引发冰爆（60% 伤害·半径80） */
  iceHitFx(o, d) { return IceTower.iceHitFx(this, o, d); }

  towerMuzzle(key) { return Targeting.towerMuzzle(this, key); }

  /** 技能现有范围判定：仅检查纵向距离（与普攻直线距离不同，本轮保留原行为） */
  inTowerRange(key, x, y) { return Targeting.inTowerRange(this, key, x, y); }

  hasDot(e, type) { return Statuses.hasDot(e, type); }

  explode(x, y, r, dmg, key, knock, slowAfter, exclude) { return Damage.explode(this, x, y, r, dmg, key, knock, slowAfter, exclude); }

  /* ---------- 周期技（按塔分节：火/冰/电/毒/炮/回旋镖） ---------- */
  /** 周期技总入口（兼容旧调用/测试；update 已按塔直接调度） */
  tickPeriodic(dt) {
    this.tickFire(dt);
    this.tickIce(dt);
    this.tickElectric(dt);
    this.tickPoison(dt);
    this.tickCannon(dt);
    this.tickBoomerang(dt);
  }

  // ===== tickFire =====
  /* ---------- 视觉 ---------- */

  fxFlash(x, y, color) {
    this.game.fx.push({ type: 'flash', x, y, t: 0, dur: 0.3, color });
  }
  /** 粒子爆发（命中/DoT/技能落点） */
  fxParticle(x, y, color, n, spread, dur, speed, size) {
    this.game.fx.push({ type: 'particle', x, y, color, n, spread, dur, speed, size, t: 0 });
  }
  /** 扩散环（冰冻/爆炸/周期技冲击） */
  fxRing(x, y, color, rMax, dur, width) {
    this.game.fx.push({ type: 'ring', x, y, color, rMax, dur, width, t: 0 });
  }
  /** 两点连线（电连锁/电弧/毒链） */
  fxBeam(x1, y1, x2, y2, color, dur, width) {
    this.game.fx.push({ type: 'beam', x1, y1, x2, y2, color, dur, width, t: 0 });
  }

  /* ---------- v1.12 全局技能：消耗累计充能释放（1 次 = chargePerUse 点） ---------- */
  /** 释放全局技能：'shuffle' 打乱棋盘所有方块 / 'refill' 所有塔补充能量；累计充能不足返回 false */
  castGlobal(which) {
    const g = this.game;
    if (!g.run.spendAmmo(which)) return false;
    const GS = CONFIG.GLOBAL_SKILL;
    const index = which === 'shuffle' ? 0 : 1;
    which = (g.run.globalSlots || ['shuffle','refill'])[index];
    if (which !== 'shuffle' && which !== 'refill') return GlobalSkills.cast(this,which);
    if (which === 'shuffle') {
      // 全局洗牌：打乱当前三消棋盘所有方块（重新生成，无初始三消）
      const b = g.run.board;
      if (b) b.grid = b.genBoard();
      g.anim = null;                       // 清掉进行中交换/消除动画，避免与新棋盘渲染冲突
      g.selected = null; g.pickCell = null;
      this.fxFlash(375, 800, '#ff8c42', 0.5);
      this.fxRing(375, 800, '#ff8c42', 300, 0.5, 8);
      g.toast && g.toast('🔀 全局洗牌', '#ff8c42');
      // v1.16.89 洗牌重做：额外触发一遍已有技能——周期技计时器置满立即触发一次 + 全体塔按已激活技能数追加普攻
      const n = this.castGlobalBurst();
      if (n > 0) g.toast && g.toast(`⚡ 技能齐发 · 全塔普攻 ×${n}`, '#ff8c42');
      // v1.16.96 战术转移3★：洗牌后 2 秒内全塔伤害 ×1.3（shotDmg 统一乘区）
      if (g.run.relic3('cm_shuffle')) g.run._shuffleBuffTtl = 2;
    } else {
      // 能量补给：所有已解锁塔各 +refillEnergy（封顶能量上限）
      let refilled = 0;
      Object.keys(g.run.slotOrder).forEach((_, i) => {
        const tk = g.run.slotOrder[i];
        const tw = g.run.effects.tower(tk);
        if (!tw || tw.level <= 0) return;
        const before = tw.energy;
        tw.energy = Math.min(before + GS.refillEnergy, g.run.armoryEnergyMax());
        refilled += tw.energy - before;
      });
      this.fxFlash(375, 800, '#7ef0a3', 0.5);
      this.fxRing(375, 800, '#7ef0a3', 300, 0.5, 8);
      g.toast && g.toast(`🔋 能量补给 +${GS.refillEnergy}`, '#7ef0a3');
      if (refilled > 0) g.toast && g.toast(`全场补给 ${Math.round(refilled)} 点`, '#7ef0a3');
    }
    return true;
  }

  /** v1.16.89 洗牌全局技能附带「技能齐发」：周期技计时器置满（下帧各触发一次并复位）+ 每塔按已激活技能总数追加等量普攻 */
  castGlobalBurst() {
    const g = this.game;
    // 统计已激活技能数（周期技 + 非周期技，含默认激活与三选一获取，level>0 即算）
    let n = 0;
    g.run.slotOrder.slice().forEach((key) => {
      const t = this.tower(key);
      if (!t || t.level === 0) return;
      n += (t.pool || []).filter((e) => e.level > 0).length;
    });
    // 周期技立即触发一遍：全部周期计时器置满 → 以极小 dt 推进各周期技 tick（越过阈值即触发并复位计时）
    Object.keys(this.timers).forEach((k) => { this.timers[k] = 9999; });
    this.tickFire(0.001); this.tickIce(0.001); this.tickElectric(0.001);
    this.tickPoison(0.001); this.tickCannon(0.001); this.tickBoomerang(0.001);
    // 每塔额外普攻 N 次（N = 已激活技能总数；无目标时 attackOnce 内部静默跳过）
    if (n > 0) g.run.slotOrder.slice().forEach((key) => {
      for (let i = 0; i < n; i++) this.attackOnce(key);
    });
    return n;
  }
}

module.exports = { CombatSystem, initEnemyState };
