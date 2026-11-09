const TalentRuntime = require('./talents/runtime.js');
const Bosses = require('./bosses/index.js');
const ChainFlight = require('./chain-flight.js');
const GlobalCast = require('./combat/global-cast.js');
const Linkage = require('./combat/linkage.js');
const Impacts = require('./combat/impacts.js');
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
 *       电：连锁弹跳 / 麻痹 / 球形闪电 / 极光电击 / 雷暴 / 活电 / 导电 / 电磁过载
 *       回旋镖：穿透 / 折返增伤 / 飞距 / 攻速 / 回收 / 双镖 / 暴击 / 范围回旋
 *       炮：溅射 / 重击 / 穿透弹 / 炮台座 / 震击 / 引信 / 弹幕 / 阵地加固
 *   - 敌人状态：灼烧/中毒 DoT、冰冻、麻痹、减速、腐蚀、连击
 *   - 协同：爆燃×毒爆、冰冻×连锁、炮溅射×火溅射（爆炸/连锁增伤）
 *
 * 运行环境：微信小游戏（CommonJS），纯逻辑无渲染；视觉仍由 game.fx 表现。
 */
const CONFIG = require('./config.js');
const EnergyState = require('./config/energy-state.js');

/* =====================================================================
 * SKILL_NUM —— 技能行为数值表（重构 ）
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
  e._iceSlow = null;      // 冰塔冰缓独立状态（与其他减速乘区叠加）
  e._genericSlow = null;  // 其他来源减速状态
  e._iceSlowT = 0;
  e._genericSlowT = 0;
  e.corrode = null;       // {mult, ttl} 受伤加深
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
    this.bCatch = {};       // 回旋镖接镖冷却计时（未学接镖：接镖后 0.5s 才投下一镖）
    this._nextDmg = {};     // 回旋镖·接镖 C 续投：下镖伤害加成（）
  }

  reset() { return Lifecycle.reset(this); }

  /* ---------- 工具 ---------- */
  /** 出战塔对象（：测试战场单塔模式——仅 slotOrder 内塔生效，旧塔周期技/技能链立即停用） */
  tower(key) {
    const t = this.game.run.effects.tower(key);
    if (t && t._activationDelay > 0) return null;
    const order = this.game.run.slotOrder;
    if (t && order && order.length && !order.includes(key)) return null;
    return t;
  }
  /** 技能数值等级（：统一口径 = 激活?1+分支:0；与原版激活 1 档/分支逐级+1 一致，满级 4 档） */
  lv(key, name) {
    const b = this.tower(key);
    if (!b) return 0;
    const ef = b.pool.find((e) => e.name === name);
    return ef ? ef.level : 0;
  }
  /** 分支等级（A/B/C）——分支独立成长（火塔重构起：分支加成按各自分支等级） */
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
    iv /= 1+TalentRuntime.bonus(this.game.run,key).speed;
    // 冰·低温全塔：全塔 +10%/级，冰塔额外 +15%/级
    const chill = Math.max(this.lv('ice', '低温全塔'), 0);
    if (chill > 0) iv /= (1 + 0.10 * chill + (key === 'ice' ? 0.15 * chill : 0));
    // 回旋镖·接镖 A 已改为飞行速度提升（，见发射段 bDur），不再提供攻速加成
    // 圣物·疾风戒：全塔攻速 +8%/级
    const m = this.game.meta;
    const spdLv = (m && m.relicBonus && m.relicBonus().speed) || 0;
    if (spdLv > 0) iv /= (1 + 0.08 * spdLv);
    // 攻速戒指（局内圣遗物）：全塔攻击间隔缩短 N%（按星级）
    const spdR = this.relicVal('cm_speed');
    if (spdR > 0) iv /= (1 + spdR / 100);
    const relicSpd = this.relicVal(`r_${key}_spd`);
    if (relicSpd > 0) iv /= (1 + relicSpd / 100);
    // 塔专属攻速圣遗物（火塔熔炉之息已改为火柱伤害，不再提供攻速）。
    const TOWER_ASPD = { ice: 'ice_marrow', electric: 'elec_light', cannon: 'can_rapid', boomerang: 'boo_speed' };
    const aspR = this.relicVal(TOWER_ASPD[key]);
    if (aspR > 0) iv /= (1 + aspR / 100);
    // 疾电1★/2★：电塔攻击间隔缩短 8%/12%；3★：麻痹叠层每层 +10% 攻速（3 秒窗口，最多 2 层）
    if (key === 'electric') {
      const fR = this.relicVal('elec_fast');
      if (fR > 0) iv /= (1 + fR / 100);
      const hs = this.game.run._elecHaste;
      if (hs && hs.ttl > 0 && hs.n > 0) iv /= (1 + 0.10 * hs.n);
    }
    // 局内商店限时攻速乘区；购买次数不影响强度。
    const store = this.game.run.storeBuff ? this.game.run.storeBuff() : { spd: 0 };
    if (store.speedMultiplier != null) iv /= store.speedMultiplier;
    else if (store.spd > 0) iv /= (1 + 0.15 * store.spd);
    // 智慧典籍3★：升级触发全塔 3 秒攻速 +20%（窗口秒数由 run._tomeBuffTtl 承载，combat.update 递减）
    if (this.game.run._tomeBuffTtl > 0) iv /= 1.2;
    return Math.max(COMBAT_BALANCE.minAttackInterval, iv / (this.game.run.gsState && this.game.run.gsState.haste > 0 ? GS_BALANCE.haste.speedMultiplier : 1)) / Bosses.attackScale(this.game, key);
  }

  /** 塔当前射程（射程/技能叠加） */
  range(key) { return Targeting.range(this, key); }

  /** 圣遗物当前星级数值（1★=desc / 2★=star2 文本最后数字）；未获得返回 0 */
  relicVal(id) {
    const g = this.game;
    const run = g && g.run;
    if (!run || !run.relicRun || run.relicRun(id) <= 0) return 0;
    const star = run._testStar3 && run._testStar3[id] ? 3
      : Math.max(run._talentCenterId===id?1:0,(g.meta && g.meta.starOf) ? g.meta.starOf(id) : 1);
    const configured = CONFIG.RELIC_VALUES && CONFIG.RELIC_VALUES[id] && CONFIG.RELIC_VALUES[id].primary;
    if (configured) return configured[star] || 0;
    const revised = CONFIG.RELIC_REWORK && CONFIG.RELIC_REWORK.RELIC_VALUES[id] && CONFIG.RELIC_REWORK.RELIC_VALUES[id].primary;
    if (revised) return revised[star] || 0;
    return CONFIG.relicNum(id, star);
  }

  /** 塔圣遗物「伤害类」乘区：desc 与 star2 均描述伤害 → 该塔所有伤害（普攻+技能同源）×(1+ΣN%) */
  relicTowerDmg(key) {
    const g = this.game;
    const run = g && g.run;
    if (!run || !run.runRelic) return 0;
    const cat = CONFIG.RELIC_RUN.tower[key];
    if (!cat) return 0;
    let sum = this.relicVal(`r_${key}_atk`);
    cat.forEach((d) => {
      // 火塔圣遗物已各自在对应火伤/周期技能挂点结算，禁止再由文案推断为全塔伤害乘区。
      if (key === 'fire' || key === 'ice' || key === 'poison' || key === 'electric' || key === 'cannon' || key === 'boomerang') return; // 重做卡牌效果由对应状态/技能挂点结算，避免误加成全塔。
      if (run.relicRun(d.id) > 0 && d.desc && d.star2 && /伤害/.test(d.desc) && /伤害/.test(d.star2)) {
        sum += this.relicVal(d.id);
      }
    });
    return sum;
  }

  /** 单次攻击伤害：towerDps × 攻击间隔（保持总 DPS 口径）；isSkill=true 表示技能/DoT 上下文（全局充能3★ 技能伤加成只吃技能） */
  shotDmg(key, isSkill, isTowerSkill) { return Damage.shotDmg(this, key, isSkill, isTowerSkill); }

  /** 周期技弱化倍率：塔能量耗尽 → 周期 ×1.5（伤害弱化已由 shotDmg 统一 ×0.5） */
  _weakPeriod(key) { return Linkage._weakPeriod(this, key); }

  /* ---------- 三消连消技 ---------- */

  /** 周期技能 timer 映射：连锁技能随机释放（tick 内 timer 到点即施放） */
  static PERIODIC_TIMERS() { return Linkage.periodicTimers(); }

  /** 连锁技能：随机释放对应塔一个已激活周期技能（不受周期影响）。
   *  将对应 timer 置为超阈值 → 下一帧 tick 立即施放一次；无已激活周期技返回 false（run 侧补能量）。 */
  castPeriodicNow(key) { return Linkage.castPeriodicNow(this, key); }

  /** 连锁攻击：在消除格位置（x,y）生成对应塔子弹，寻敌=最近（首枚）+ 主目标上方 40px 截面随机（其余），
   *  攻击力不受塔能量影响（剔除弱化态）。 */
  spawnChainShots(ent) { return Linkage.spawnChainShots(this, ent); }


  /** 周期技能施放扣能量：能量 >= 成本时扣除并全额施放；不足则弱化施放（不扣，伤害 ×0.5） */
  castEnergy(key, name) { return Linkage.castEnergy(this, key, name); }

  /** 毒·毒性强化（）：选择后中毒 DoT 由 10% 提升为 15%（+50% 单跳）；A 每级 18%/21%/24%（档位式）；B 时长 +2/+4/+6s（档位式） */
  dotBoost() { return Statuses.dotBoost(this); }

  /* ---------- 主更新：弹道命中 → 状态推进 → 塔攻击 → 周期技 → 死亡触发 ---------- */
  update(dt) { return Lifecycle.update(this, dt, initEnemyState); }

  /* ---------- 弹道与召唤物推进（重构：主循环子方法） ---------- */

  /** 单枚飞行弹道推进一帧；返回 false 表示命中结算/耗尽，应移除 */
  addProjectile(shot, visual) { return Projectiles.addProjectile(this, shot, visual); }

  stepShot(s, dt) {
    const g = this.game;
    const finishShot = () => {
      if (s.visual) s.visual.t = s.visual.dur;
      return false;
    };
    s.t += dt;
    if (s.t < 0) return true;
    // 碎裂弹锁定目标至其死亡；目标死亡后保留最后位置，继续飞行并在到点时分裂。
    if (s.trackTarget && s.target && s.target.hp > 0 && g.enemies.includes(s.target)) {
      s.tx = s.target.x; s.ty = s.target.y;
      if (s.visual) { s.visual.tx = s.tx; s.visual.ty = s.ty; }
    }
    if (s.chainFlight) return ChainFlight.advance(this, s, dt);
    if (s.orb || s.ballLightning) return ElectricTower.stepOrb(this, s, dt);
    if (s.bounce) return BoomerangTower.stepBounce(this, s, dt);
    if (s.scatter) {
      // 散射弹沿途碰撞；普通弹命中即消失，带穿透次数的弹命中后继续飞行。
      const hitE = this.scatterCheck(s);
      if (hitE) {
        if (s.pierceMaxHits) {
          s._pierceHitSet = s._pierceHitSet || new Set();
          s._pierceHitSet.add(hitE);
          s.pierceHitCount = (s.pierceHitCount || 0) + 1;
          const isLastPierceHit = s.pierceHitCount >= s.pierceMaxHits || !this.hasRemainingScatterTarget(s);
          if (s.onHit) s.onHit(hitE, s.dmg, s, isLastPierceHit);
          if (isLastPierceHit) return finishShot();
          return true;
        }
        if (s.onHit) s.onHit(hitE, s.dmg, s, true);
        return finishShot();
      }
      return s.t < s.dur;
    }
    if (s.t >= s.dur) {
      if (s.sweep) this.sweepDamage(s, dt);
      else if (s.onReach) s.onReach(s);
      else {
        if (s.key === 'cannon' && s.target && this.game.predictEnemyPosition) {
          s.impactPosition = this.game.predictEnemyPosition(s.target, dt);
        }
        this.resolveShot(s);
      }
      // 磁场3★：球形闪电的雷球游走结束时原地爆炸（60% 伤害，半径 80）
      if (s.ballLightning && this.game.run.relic3('elec_magnet')) {
        this.explode(s.x, s.y, 80, this.shotDmg('electric', false, true) * 0.6, 'electric', undefined, undefined, undefined, '球形闪电');   // 标注
      }
      return false;
    }
    if (s.sweep) this.sweepDamage(s, dt);
    return true;
  }

  /** 延迟爆炸推进（炮引信 / 炮火支援落点 / 冰花延迟结算） */
  updateDelayed(dt) { return Areas.updateDelayed(this, dt); }

  /** 地面持续区域推进（火·余烬直伤 / 毒·毒池·毒沼直伤+每秒叠毒+泥沼减速） */
  updateGroundDots(dt) { return Areas.updateGroundDots(this, dt); }

  /** 毒·毒棒推进（）：独立攻击周边 200px 敌人（直伤 + 叠毒），持续结束消失 */
  updatePoisonSticks(dt) { return PoisonTower.updatePoisonSticks(this, dt); }

  /** 炮·地雷阵推进：飞行中不可引爆，落地布设 0.3s 后可引爆；C 碎雷星状散射弹片 */
  updateMines(dt) { return CannonTower.updateMines(this, dt); }

  /** 炮·炮台推进：独立炮击最靠墙敌人（直伤+爆炸），持续结束消失 */
  updateTurrets(dt) { return CannonTower.updateTurrets(this, dt); }

  /** 回旋镖·风暴镖推进（）：三同心圈旋转十字飞镖，每镖独立命中 10% 伤害，命中不消失 */
  updateStorms(dt) { return BoomerangTower.updateStorms(this, dt); }

  /** 回旋镖·风痕推进：路径伤害区，C 卷痕减速 */
  updateWindTrails(dt) { return BoomerangTower.updateWindTrails(this, dt); }

  /** 回旋镖·风眼涡旋推进（2026-11-01）：牵引聚敌 + 减速，结束收尾爆炸 */
  updateVortexes(dt) { return BoomerangTower.updateVortexes(this, dt); }

  /* ---------- 敌人状态推进 ---------- */
  tickStatus(e, dt) {
    Statuses.tickBaseStatus(this, e, dt);
    PoisonTower.tickEnemyStatus(this, e, dt);
  }

  /* ---------- 伤害结算 ---------- */
  damage(e, dmg, srcKey, kind, skill) { return Damage.damage(this, e, dmg, srcKey, kind, skill); }   // 透传 skill（伤害统计）

  /* ---------- 死亡触发：各塔死亡技能（爆燃/毒爆/霜星/扩散/回收/致死） ---------- */
  onKill(e) { return Death.onKill(this, e); }

  /* ---------- 三消联动：塔额外攻击一次（多消形状触发不同攻击特效） ---------- */
  bonusStrike(key, shape) { return Linkage.bonusStrike(this, key, shape); }

  /* ---------- 塔攻击调度 ---------- */
  tickTower(key, dt) { return Attacks.tickTower(this, key, dt); }

  /** 选择攻击目标（）：射程内直线距离最近的一个怪物（更智能：优先打靠近塔的威胁） */
  pickTarget(key) { return Targeting.pickTarget(this, key); }

  /** 额外目标：主目标 Y 轴往上 40px 截面范围（水平带 [main.y-40, main.y]）内的随机敌人；带内无其他敌人时回退主目标 */
  pickAltTarget(key, main) { return Targeting.pickAltTarget(this, key, main); }

  /** 单塔一次攻击：选目标 → 发弹道（表现层） + 登记命中回调 */
  attackOnce(key) { return Attacks.attackOnce(this, key); }

  /* ---------- 弹道命中结算 ---------- */
  resolveShot(s) { return Projectiles.resolveShot(this, s); }

  /** 散射弹道（无目标）沿途碰撞检测（）：按 t/dur 线性插值当前位置，命中半径内敌人返回该敌，未命中返回 null */
  scatterCheck(s) { return Projectiles.scatterCheck(this, s); }
  hasRemainingScatterTarget(s) { return Projectiles.hasRemainingScatterTarget(this, s); }

  /** 回旋镖轨迹点：二次 Bézier 出程越过目标 200 码，之后沿另一侧抛物线绕回 */
  sweepPos(s, p) { return Projectiles.sweepPos(s, p); }

  /** 回旋镖沿途伤害（）：椭圆大弧扫过路径上的所有敌人，每敌单镖最多命中一次；折返 C 宽返吸附 +20%/级；风痕留痕 */
  sweepDamage(s) { return BoomerangTower.sweepDamage(this, s); }

  /**
   * 普攻 debuff 统一判定（）：普攻与**普攻强化攻击**（电·连锁/活电、火·多重火球、
   *   冰·多重冰锥/碎冰、镖·多镖等）命中均走此判定——各塔基础 20% 概率，学对应 dot 强化技能后
   *   概率提升（公式与普攻一致：基础 20% + 技能 +25%[电·麻痹为 +20%] + A 分支每级 +15%）
   */
  tryAttackDebuff(key, o, dmg) { return Impacts.tryAttackDebuff(this, key, o, dmg); }

  /* ---------- 六塔命中行为 ---------- */
  hit(key, e, dmg, projectile) { return Impacts.hit(this, key, e, dmg, projectile); }

  /* ============ 火塔（重构：点燃/灼烧/火柱/大火球/爆燃/多重火球/烈焰墙/火雨） ============ */
  /** 火塔普攻命中统一挂点（3★ 圣遗物）：hitFire 与多重火球 strike 共用，保证所有普攻路径生效
   *  焰雨3★：火球命中同一目标 3 次 → 下次命中必为三连火球（追加 3 发等额伤害 + 三连火花爆发）
   *  熔炉之息3★：每 5 次普攻附带一次免费火柱（150% 伤害·半径120，不耗能量）
   *  火焰弹射（1★/2★）：普攻 25%/40% 概率额外发射一枚火球；3★：弹射火球命中时 50% 概率返还 1 点能量 */
  _attackFireOnHit(e, dmg) { return FireTower._attackFireOnHit(this, e, dmg); }

  /** 火塔普攻级挂点（每攻击一次判定一次，与弹道数量无关）：
   *  熔炉之息3★：每 5 次普攻附带一次免费火柱（150% 伤害·半径120，不耗能量）
   *  火焰弹射（1★/2★）：普攻 25%/40% 概率额外发射一枚火球；3★：弹射火球命中时 50% 概率返还 1 点能量 */
  _fireAttackOnAttack(target, dmg) { return FireTower._fireAttackOnAttack(this, target, dmg); }

  /** 薄壳：火塔弹道命中入口（未学多重火球的普攻弹道 resolveShot → hit() → hitFire） */
  hitFire(e, dmg) { return FireTower.hitFire(this, e, dmg); }

  /** 多重火球重做：一次普攻从塔口扇形飞出 n 枚火球——
   *   中心一枚锁定主目标（弹道末端跟随、命中才结算），其余以主目标方向为基准两侧扇形 scatter（沿途碰撞命中即止）；
   *   每枚命中走完整结算（灼烧/焰雨三连/大火球爆炸/多重火球 C 散射分裂）。
   *   解决原"普攻先命中再从目标处散射"的割裂感 */
  _fireMultiShot(e, dmg, fromTriple) { return FireTower._fireMultiShot(this, e, dmg, fromTriple); }

  /** 火塔普攻命中伤害段（灼烧判定/大火球/多重火球）：单发普攻弹道命中路径执行；多重火球路径走 strike 回调 */
  _fireAttackHit(e, dmg) { return FireTower._fireAttackHit(this, e, dmg); }

  /** 单发大火球爆炸（普攻单发 / 焰雨追加火球共用；含爆核1★/2★ 半径扩大与 3★ 边缘击退点燃） */
  _fireSingleBlast(e, dmg) { return FireTower._fireSingleBlast(this, e, dmg); }

  /** 火球命中统一结算（焰雨三连 / 焰雨1★2★ 追加火球共用）：
   *  伤害 + 统一灼烧判定 + 多重火球 C 散射分裂 + 大火球爆炸——即三连在多重火球/大火球下多次触发其攻击效果 */
  _fireImpact(o, d, ang) { return FireTower._fireImpact(this, o, d, ang); }

  applyBurn(e, dmg, src) { return Statuses.applyBurn(this, e, dmg, src); }



  tickFire(dt) { return FireTower.tickFire(this, dt); }

  // ===== tickIce =====


  /* ============ 冰塔 ============ */

  /** 多重冰锥重做：一次普攻从塔口扇形飞出 n 枚冰锥——
   *   中心一枚锁定主目标（弹道末端跟随、命中才结算），其余以主目标方向为基准两侧扇形 scatter（沿途碰撞命中即止）；
   *   C 增殖分支保留：10/14/18 枚超小型冰锥各自索敌独立飞行 */
  _iceMultiShot(e, dmg) { return IceTower._iceMultiShot(this, e, dmg); }

  hitIce(e, dmg, projectile, options) { return IceTower.hitIce(this, e, dmg, projectile, options); }

  tickIce(dt) { return IceTower.tickIce(this, dt); }

  // ===== tickElectric =====


  /* ============ 电塔 ============ */
  hitElectric(e, dmg, projectile) { return ElectricTower.hitElectric(this, e, dmg, projectile); }

  tickElectric(dt) { return ElectricTower.tickElectric(this, dt); }

  // ===== tickPoison =====


  /* ============ 毒塔（重做：基础中毒 20% 概率叠层 / 剧毒 / 毒爆 / 毒池 / 毒棒 / 毒性强化 / 瘟疫 / 毒藤 / 瘴气） ============ */
  hitPoison(e, dmg) { return PoisonTower.hitPoison(this, e, dmg); }

  /** 毒·中毒叠层（）：每层每秒 = 单发伤害×10%，基础持续 5 秒，上限 5 层（毒性强化 C +2/级）；
   *  剧毒 B 时长 +2s/级（不变）；剧毒 C 每跳间隔 -0.1/-0.2/-0.3s（1s → 0.9/0.8/0.7s） */
  applyPoison(e, dmg, src, layers) { return Statuses.applyPoison(this, e, dmg, src, layers); }

  /** 当前中毒层数（毒爆 B 继承用） */
  poisonStack(e) { return Statuses.poisonStack(this, e); }

  /** 塔口坐标（普攻/技能弹道统一发射点，统一口径）：
   *  正式战斗：塔位槽布局（槽中心）；测试战场：单塔出战大槽（渲染 testFieldLayer 硬编码 x=15/y=1053，中心 65,1103）
   *  槽数恒用渲染固定值（正式 4 槽），不随已激活塔数变化——得塔前/后塔位坐标稳定（旧实现 n=slotOrder.length，1 塔时算成单槽居中 → 塔区中心） */
  tickPoison(dt) { return PoisonTower.tickPoison(this, dt); }

  // ===== tickCannon =====


  /* ============ 炮塔（重炮/震击/碎裂弹/双管齐射/炮火支援/地雷阵/炮台/军火库） ============ */
  hitCannon(e, dmg, impactPosition) { return CannonTower.hitCannon(this, e, dmg, impactPosition); }

  /** 范围爆炸（含击退/减速）；爆炸颜色按塔类型 */
  tickCannon(dt) { return CannonTower.tickCannon(this, dt); }

  // ===== tickBoomerang =====


  /* ============ 回旋镖塔 ============ */
  /* ============ 回旋镖塔（重做：折返增伤/多镖/接镖/风暴镖/弹力镖/风痕/风眼涡旋；猎手标记 2026-11-01 删除） ============ */
  hitBoomerang(e, dmg) { return BoomerangTower.hitBoomerang(this, e, dmg); }

  /* 普攻流血（回旋镖塔重做）：每移动 10px 结算 4% 攻击伤害（每 100px 跳 40%）；「放血」：基础 +25% 概率（20→45%）/ A 刺骨 +15%/级（45→90%）/ B 时长 +1s/级 / C 溃烂 每 10px 伤害 4%→6/8/10% */
  applyBleed(e, dmg) { return Statuses.applyBleed(this, e, dmg); }

  tickBoomerang(dt) { return BoomerangTower.tickBoomerang(this, dt); }

  /* ---------- 视觉 ---------- */


  /* ============ 公共：状态 / 几何 / 通用 ============ */
  applySlow(e, mult, ttl, source) { return Statuses.applySlow(this, e, mult, ttl, source); }
  refreshSlow(e) { return Statuses.refreshSlow(e); }

  /** 冰塔 3★ helper：冻结（Boss 时长 ×0.6 递减，design R3 建议） */
  freezeE(e, dur) { return Statuses.freezeE(this, e, dur); }

  /** 暴雪3★：冰锥命中已冰缓的敌人时 30% 概率引发冰爆（60% 伤害·半径80） */
  iceHitFx(o, d) { return IceTower.iceHitFx(this, o, d); }

  towerMuzzle(key) { return Targeting.towerMuzzle(this, key); }

  /** 技能现有范围判定：仅检查纵向距离（与普攻直线距离不同，本轮保留原行为） */
  inTowerRange(key, x, y) { return Targeting.inTowerRange(this, key, x, y); }

  hasDot(e, type) { return Statuses.hasDot(e, type); }

  explode(x, y, r, dmg, key, knock, slowAfter, exclude, skill) { return Damage.explode(this, x, y, r, dmg, key, knock, slowAfter, exclude, skill); }   // 透传 skill（伤害统计）

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

  /* ---------- 全局技能：消耗累计充能释放（1 次 = chargePerUse 点） ---------- */
  /** 释放全局技能：'shuffle' 打乱棋盘所有方块 / 'refill' 所有塔补充能量；累计充能不足返回 false */
  castGlobal(which) { return GlobalCast.castGlobal(this, which); }

  /** 洗牌全局技能附带「技能齐发」：周期技计时器置满（下帧各触发一次并复位）+ 每塔按已激活技能总数追加等量普攻 */
  castGlobalBurst() { return GlobalCast.castGlobalBurst(this); }
}

module.exports = { CombatSystem, initEnemyState };
