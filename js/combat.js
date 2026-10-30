const CannonTower = require('./combat/towers/cannon.js');
const PoisonTower = require('./combat/towers/poison.js');
const ElectricTower = require('./combat/towers/electric.js');
const IceTower = require('./combat/towers/ice.js');
const FireTower = require('./combat/towers/fire.js');
const Statuses = require('./combat/statuses.js');
const Damage = require('./combat/damage.js');
const Projectiles = require('./combat/projectiles.js');
const Targeting = require('./combat/targeting.js');
const RelicKill = require('./relics/kill-hooks.js');
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

  reset() {
    if (this.game && this.game.dmgNumbers) this.game.dmgNumbers.clear();
    this.shots = [];
    this.delayed = [];
    this.timers = {};
    this.atkTimers = {};
    this.kills = {};
    this.bWait = {};
    this.bCatch = {};          // v1.16.42 回旋镖接镖冷却计时
    this._nextDmg = {};        // 回旋镖·接镖 C 续投：下镖伤害加成（v1.16）
    this.groundDots = [];      // 火·火柱余烬 / 毒·毒池·毒沼：地面持续区域
    this.frostOrbs = [];       // 冰·冬珠：持续冰霜之球
    this.iceGrounds = [];      // v1.16.98 冰晶3★/冰雾3★：减速/降攻速地面
    this.poisonSticks = [];    // 毒·毒棒：独立攻击的召唤物（v1.15）
    this.mines = [];           // 炮·地雷阵（v1.16）
    this.turrets = [];         // 炮·炮台（v1.16）
    this.storms = [];          // 回旋镖·风暴镖（v1.16）
    this.windTrails = [];      // 回旋镖·风痕（v1.16）
    // v1.16.38 同步清理战斗实体 fx（弹道/风暴镖/炮台/地雷/地面持续区），避免切塔/清场/重开后幽灵残留
    const g = this.game;
    if (g && g.fx) {
      const entityFx = ['shot', 'cyclone', 'turret', 'mine', 'groundDot', 'frostOrb', 'poisonStick'];
      g.fx = g.fx.filter((f) => !entityFx.includes(f.type));
    }
  }

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
  update(dt) {
    const g = this.game;
    if (!g.run.slotOrder.length) return; // 无塔不战斗

    // v1.16.96 3★ 时间窗口递减：智慧典籍3★ 攻速窗口 / 战术转移3★ 洗牌伤害窗口 / 焚天3★ 攻速窗口（秒）
    if (g.run._tomeBuffTtl > 0) g.run._tomeBuffTtl = Math.max(0, g.run._tomeBuffTtl - dt);
    // v1.16.102 疾接3★：城墙无敌帧递减
    if (g.run._wallInvT > 0) g.run._wallInvT = Math.max(0, g.run._wallInvT - dt);
    if (g.run._shuffleBuffTtl > 0) g.run._shuffleBuffTtl = Math.max(0, g.run._shuffleBuffTtl - dt);
    if (g.run._burnallTtl > 0) g.run._burnallTtl = Math.max(0, g.run._burnallTtl - dt);
    // v1.16.96 余烬风暴3★：余烬弹倒计时，1 秒后射向最近敌人
    if (g.run._emberShots && g.run._emberShots.length) {
      const rem = [];
      for (const es of g.run._emberShots) {
        es.t -= dt;
        if (es.t <= 0) {
          const near = this.enemies().filter((o) => o.hp > 0).sort((a, b) => Math.hypot(a.x - es.x, a.y - es.y) - Math.hypot(b.x - es.x, b.y - es.y))[0];
          if (near) {
            this.damage(near, es.dmg, 'fire');
            this.fxFlash(near.x, near.y, '#ff9f43', 0.3);
            this.fxRing(near.x, near.y, '#ff7043', 30, 0.3, 3);
            g.fx.push({ type: 'shot', kind: 'line', color: '#ff9f43', x: es.x, y: es.y, tx: near.x, ty: near.y, t: 0, dur: 0.3, key: 'fire', aim: true, scale: 0.9 });
          }
        } else {
          rem.push(es);
        }
      }
      g.run._emberShots = rem;
    }

    // 兼容缺字段的敌人（测试/旧数据）：惰性补齐 A1 状态
    g.enemies.forEach((e) => { if (!e.dots) initEnemyState(e); });

    // 1. 飞行弹道推进与命中结算（回旋镖 sweep：沿途扫过伤害；散射 scatter：无目标沿途碰撞；其余：终点单体命中）
    for (let i = this.shots.length - 1; i >= 0; i--) {
      if (!this.stepShot(this.shots[i], dt)) { this.shots[i].finished = true; this.shots.splice(i, 1); }
    }
    // 2. 延迟爆炸（炮引信/炮火支援落点）
    this.updateDelayed(dt);
    // 3. 敌人状态推进（DoT / 控制 / 层数衰减）
    g.enemies.forEach((e) => this.tickStatus(e, dt));
    // 3.5 地面持续区域（火·余烬 / 毒·毒池·毒沼）
    this.updateGroundDots(dt);
    // 3.6 毒·毒棒召唤物
    this.updatePoisonSticks(dt);
    // 3.7 炮·地雷阵
    this.updateMines(dt);
    // 3.8 炮·炮台
    this.updateTurrets(dt);
    // 3.9 回旋镖·风暴镖
    this.updateStorms(dt);
    // 3.10 回旋镖·风痕
    this.updateWindTrails(dt);
    // 4. 塔攻击调度（每塔独立节奏）
    g.run.slotOrder.slice().forEach((key) => this.tickTower(key, dt));
    // 5. 周期技
    // 5. 周期技（按塔分节：火/冰/电/毒/炮/回旋镖）
    this.tickFire(dt);
    this.tickIce(dt);
    this.tickElectric(dt);
    this.tickPoison(dt);
    this.tickCannon(dt);
    this.tickBoomerang(dt);
    // 6. 死亡清场（死亡技能已在伤害结算处触发）
    // v1.17.23 fix：v1.17.22 把全歼统计挂在 main.stepEnemies 的尸体过滤处，但此处更早把尸体
    //   filter 掉了 → 统计永远看不到死亡，clearedWaves 恒 0（深度轨迹不走、通关数恒「全歼 0 波」）。
    //   改为在此归集死亡并回调统计（main 处保留为兜底）。
    const dead = g.enemies.filter((e) => e.hp <= 0);
    if (dead.length && g._tallyWaveDeaths) g._tallyWaveDeaths(dead);
    g.enemies = g.enemies.filter((e) => e.hp > 0);
  }

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
    if (s.bounce) {
      // v1.16.21 弹力镖（原镖阵重做，新单体）：直线飞行，碰敌人或战斗区域边缘反弹；每次碰敌造成伤害（同敌仅一次），反弹 maxB 次或超时后消失
      s.x += Math.cos(s.ang) * s.speed * dt;
      s.y += Math.sin(s.ang) * s.speed * dt;
      const aX = g.ly.areaX, aW = g.ly.areaW, aY = g.ly.areaY, aH = g.ly.areaH;
      if (s.x < aX) { s.x = aX; s.ang = Math.PI - s.ang; s.bounces++; }
      else if (s.x > aX + aW) { s.x = aX + aW; s.ang = Math.PI - s.ang; s.bounces++; }
      if (s.y < aY) { s.y = aY; s.ang = -s.ang; s.bounces++; }
      else if (s.y > aY + aH) { s.y = aY + aH; s.ang = -s.ang; s.bounces++; }
      const hitE = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - s.x, o.y - s.y) < (s.hitR || 30));
      if (hitE) {
        if (!s.hitIds[hitE.id]) {
          s.hitIds[hitE.id] = true;
          // v1.16.102 弹力3★：弹力镖每次反弹伤害 +5%（最多 +50%）
          const bounceV = this.game.run.relic3('boo_bounce') ? (1 + 0.05 * Math.min(10, s.bounces)) : 1;
          this.damage(hitE, s.dmg * bounceV, 'boomerang');
          this.fxFlash(hitE.x, hitE.y, '#c39bd3');
          this.fxParticle(hitE.x, hitE.y, '#c39bd3', 3, 18, 0.3, 90, 4);
        }
        const nx = s.x - hitE.x, ny = s.y - hitE.y;
        const nl = Math.hypot(nx, ny) || 1;
        const vx = Math.cos(s.ang), vy = Math.sin(s.ang);
        const dot = vx * (nx / nl) + vy * (ny / nl);
        s.ang = Math.atan2(vy - 2 * dot * (ny / nl), vx - 2 * dot * (nx / nl));
        s.bounces++;
      }
      if (s.bounces >= s.maxB || s.t >= s.dur) {
        if (s.fx) s.fx.t = s.fx.dur;   // v1.16.38 弹力镖提前结束（反弹满/超时）时同步结束其 fx，防止幽灵残留
        // v1.16.102 飞刃3★：弹力镖消失时 30% 概率分裂为 2 枚小镖（50% 伤害，反弹 2 次）
        if (this.game.run.relic3('boo_blade') && Math.random() < 0.3 && !s._splitDone) {
          s._splitDone = true;
          for (let k = 0; k < 2; k++) {
            const subAng = s.ang + (Math.PI / 2) * (k === 0 ? -1 : 1) + (Math.random() * 0.6 - 0.3);
            const sub = { key: 'boomerang', dmg: s.dmg * 0.5, t: 0, dur: 3, x: s.x, y: s.y, ang: subAng, speed: 380, bounce: true, bounces: 0, maxB: 2, hitR: 22, hitIds: {} };
            this.shots.push(sub);
            const subFx = { type: 'shot', kind: 'bounce', ref: sub, t: 0, dur: 3, color: '#aed6f1' };
            sub.fx = subFx;
            this.game.fx.push(subFx);
          }
        }
        return false;
      }
      return true;
    }
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
  updateDelayed(dt) {
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t += dt;
      if (d.t >= d.delay) {
        this.delayed.splice(i, 1);
        if (d.fn) { d.fn(this); continue; }   // v1.16.9 自定义延迟回调（冰花第 3 帧末结算）
        this.explode(d.x, d.y, d.r, d.dmg, d.key, d.knock, d.slowAfter);
        // v1.16.103 空袭3★：炮火支援落点 20% 概率二次轰炸（40% 伤害）
        if (d.key === 'cannon' && this.game.run.relic3('can_airstrike') && Math.random() < 0.2) {
          this.explode(d.x + (Math.random() - 0.5) * 40, d.y + (Math.random() - 0.5) * 40, d.r * 0.7, d.dmg * 0.4, 'cannon');
        }
        // 炮火支援 C 焦土：落点留燃烧地面 2s（每秒 30% 伤害）
        if (d.ember > 0) {
          this.groundDots = this.groundDots || [];
          this.groundDots.push({ x: d.x, y: d.y, r: d.r * 0.6, ttl: 2, dps: this.shotDmg('cannon', true) * 0.24 * d.ember, key: 'fire' });
        }
      }
    }
  }

  /** 地面持续区域推进（火·余烬直伤 / 毒·毒池·毒沼直伤+每秒叠毒+泥沼减速） */
  updateGroundDots(dt) {
    if (!this.groundDots || !this.groundDots.length) return;
    for (let i = this.groundDots.length - 1; i >= 0; i--) {
      const gd = this.groundDots[i];
      gd.ttl -= dt;
      if (gd.ttl <= 0) { this.groundDots.splice(i, 1); continue; }
      this.enemies().forEach((o) => {
        if (o.hp <= 0) return;
        const dist = Math.hypot(o.x - gd.x, o.y - gd.y);
        if (dist > gd.r) {
          // v1.16.100 腐沼3★：毒池边缘生成毒雾环，进出敌人各叠 1 层毒
          if (gd.ring && dist <= gd.r * 1.1) {
            gd._ft = (gd._ft || 0) + dt;
            while (gd._ft >= 1) {
              gd._ft -= 1;
              this.applyPoison(o, this.shotDmg('poison', true), 'poison', 1);
              this.fxParticle(o.x, o.y, '#7ee2a8', 2, 20, 0.4, 70, 3);
            }
          }
          return;
        }
        if (gd.dps) this.damage(o, gd.dps * dt, gd.key || 'fire');
        // v1.16.42 毒沼：泥沼减速（与毒池区分——毒沼纯叠毒 + 减速，无直伤）
        if (gd.swamp && gd.slow) this.applySlow(o, gd.slow, 1);
        if (gd.key === 'poison' && gd.stackPerSec) {
          gd._t = (gd._t || 0) + dt;
          while (gd._t >= 1) {
            gd._t -= 1;
            this.applyPoison(o, this.shotDmg('poison', true), 'poison', gd.stackPerSec);
          }
          // v1.16.100 毒云3★：毒池上的敌人每秒丢失 1 点能量（对 Boss 无效；敌人无能量系统时挂点保留）
          if (this.game.run.relic3('poison_cloud') && !gd.swamp && !o.isBoss && o.energy > 0) {
            o.energy = Math.max(0, o.energy - 1);
          }
        }
      });
      if (gd.key === 'poison') {
        if (gd.swamp) {
          // v1.16.42 毒沼视觉粒子：暗褐绿泥沼气泡（与毒池的亮绿液区分）
          if (Math.random() < 0.5) {
            this.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#6e8b3d', 2, 16, 0.5, 50, 4);
          }
        } else if (Math.random() < 0.3) {
          this.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#52be80', 2, 18, 0.5, 60, 4);
        }
      } else if (Math.random() < 0.3) {
        this.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#ff7043', 2, 20, 0.4, 60, 4);
      }
    }
  }

  /** 毒·毒棒推进（v1.15）：独立攻击周边 200px 敌人（直伤 + 叠毒），持续结束消失 */
  updatePoisonSticks(dt) { return PoisonTower.updatePoisonSticks(this, dt); }

  /** 炮·地雷阵推进：飞行中不可引爆，落地布设 0.3s 后可引爆；C 碎雷星状散射弹片 */
  updateMines(dt) {
    if (!this.mines || !this.mines.length) return;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.fly) {
        const dx = m.fly.tx - m.fly.sx, dy = m.fly.ty - m.fly.sy;
        const dist = Math.hypot(dx, dy) || 1;
        m.fly.t += dt;
        const p = Math.min(1, (m.fly.t * 500) / dist);   // v1.16.23：抛投速度 200→500px/s
        m.x = m.fly.sx + dx * p;
        m.y = m.fly.sy + dy * p;
        if (p >= 1) { m.x = m.fly.tx; m.y = m.fly.ty; m.fly = null; m.armed = 0.3; m.ttl = 20; }
        continue;   // 飞行期间不可引爆
      }
      m.ttl -= dt;
      m.armed -= dt;
      // v1.16.103 地雷强化3★：地雷持续 20 秒未被触发时自动引爆，造成 150% 伤害
      if (m.ttl <= 0) {
        if (this.game.run.relic3('can_mine')) this.explode(m.x, m.y, m.r, m.dmg * 1.5, 'cannon');
        this.mines.splice(i, 1);
        continue;
      }
      if (m.armed > 0) continue;
      const hit = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) <= 60);
      if (!hit) continue;
      this.mines.splice(i, 1);
      // v1.16.103 雷场3★：地雷被引爆时，90 码内的其他地雷共鸣引爆（造成 50% 伤害，可继续连锁）
      if (this.game.run.relic3('can_minefield')) {
        this.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false);   // 主雷全额爆炸
        const q = [m];
        const visited = new Set([m]);
        while (q.length) {
          const cur = q.pop();
          for (let j = this.mines.length - 1; j >= 0; j--) {
            const o2 = this.mines[j];
            if (o2.fly || visited.has(o2)) continue;
            if (Math.hypot(o2.x - cur.x, o2.y - cur.y) <= 90) {
              visited.add(o2);
              this.mines.splice(j, 1);
              this.explode(o2.x, o2.y, o2.r, o2.dmg * 0.5, 'cannon', 0, false);
              q.push(o2);
            }
          }
        }
      } else {
        this.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false);
      }
      if (m.chain > 0) {
        // v1.16.42 C 连爆 → 碎雷重做：爆炸后星状向四周 130px 内散射 5/6/7 片弹片，每片 30% 攻击伤害
        const nShard = SKILL_NUM.cannon['地雷阵'].shards[m.chain];
        const shardDmg = this.shotDmg('cannon', true) * SKILL_NUM.cannon['地雷阵'].shardDmg;
        const R2 = SKILL_NUM.cannon['地雷阵'].shardR;
        const SPEED = SKILL_NUM.cannon['地雷阵'].shardSpeed;
        for (let k = 0; k < nShard; k++) {
          const ang = (Math.PI * 2 * k) / nShard + (Math.random() - 0.5) * 0.4;
          const tx2 = m.x + Math.cos(ang) * R2, ty2 = m.y + Math.sin(ang) * R2;
          const shard = {
            key: 'cannon', dmg: shardDmg, t: 0, dur: R2 / SPEED, sx: m.x, sy: m.y, tx: tx2, ty: ty2,
            scatter: true, hitR: 34,
            onHit: (o, dd) => { this.damage(o, dd, 'cannon'); this.fxParticle(o.x, o.y, '#d89e63', 3, 18, 0.3, 80, 4); },
          };
          this.shots.push(shard);
          this.game.fx.push({ type: 'shot', kind: 'line', color: '#e6b980', x: m.x, y: m.y, t: 0, dur: R2 / SPEED, key: 'cannon', aim: true, scale: 0.8, tx: tx2, ty: ty2 });
        }
      }
    }
  }

  /** 炮·炮台推进：独立炮击最靠墙敌人（直伤+爆炸），持续结束消失 */
  updateTurrets(dt) {
    if (!this.turrets || !this.turrets.length) return;
    const g = this.game;
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const tu = this.turrets[i];
      tu.ttl -= dt;
      if (tu.ttl <= 0) {
        // v1.16.103 增援3★：炮台消失时返还 2 点能量
        if (g.run.relic3('can_reinforce')) {
          const ct = this.tower('cannon');
          if (ct) ct.energy = Math.min(ct.energy + 2, g.run.armoryEnergyMax());
        }
        this.turrets.splice(i, 1);
        continue;
      }
      tu.atkT += dt;
      if (tu.atkT >= tu.atkI) {
        tu.atkT -= tu.atkI;
        const tgt = this.enemies().filter((o) => o.hp > 0).sort((a, b) => b.y - a.y)[0];
        if (tgt) {
          // v1.16.103 炮群3★：多门炮台同时存在时，每门伤害 +10%/门
          const turretDmg = g.run.relic3('can_turret') ? tu.dmg * (1 + 0.1 * (this.turrets.length - 1)) : tu.dmg;
          this.damage(tgt, turretDmg, 'cannon');
          this.explode(tgt.x, tgt.y, tu.r, turretDmg * 0.48, 'cannon', 0, false);
          this.fxBeam(tu.x, tu.y, tgt.x, tgt.y, '#d89e63', 0.25, 3);
          // v1.16.6 炮台开火炮口闪光 + 后坐火星
          this.fxFlash(tu.x, tu.y - 8, '#ffd24a', 0.15);
          this.fxParticle(tu.x, tu.y - 6, '#d89e63', 2, 18, 0.2, 60, 3);
          // v1.16.10 开火帧动画标记：命中对应炮台 fx，0.3s 内渲染第 4 帧开火
          const fi = this.game.fx.findIndex((x) => x.type === 'turret' && Math.abs(x.x - tu.x) < 2 && Math.abs(x.y - tu.y) < 2);
          if (fi >= 0) this.game.fx[fi].attackT = this.game.fx[fi].t;
        }
      }
    }
  }

  /** 回旋镖·风暴镖推进（v1.16.21）：三同心圈旋转十字飞镖，每镖独立命中 10% 伤害，命中不消失 */
  updateStorms(dt) {
    if (!this.storms || !this.storms.length) return;
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const st = this.storms[i];
      st.ttl -= dt;
      if (st.ttl <= 0) {
        if (st.fx) st.fx.t = st.fx.dur;   // v1.16.38 同步结束风暴镖 fx
        // v1.16.102 旋风3★：风暴镖结束时原地爆炸（150% 伤害，半径 140 码）
        if (this.game.run.relic3('boo_cyclone')) {
          this.explode(st.x, st.y, 140, this.shotDmg('boomerang', true) * 1.5, 'boomerang');
        }
        this.storms.splice(i, 1);
        continue;
      }
      // v1.16.102 风暴眼3★：风暴镖中心的敌人每秒受到 15% 额外伤害
      if (this.game.run.relic3('boo_eye')) {
        st._eyeT = (st._eyeT || 0) + dt;
        if (st._eyeT >= 1) {
          st._eyeT = 0;
          const center = this.enemies().filter((o) => o.hp > 0)
            .sort((a, b) => Math.hypot(a.x - st.x, a.y - st.y) - Math.hypot(b.x - st.x, b.y - st.y))[0];
          if (center) {
            this.damage(center, this.shotDmg('boomerang') * 0.15, 'boomerang');
            this.fxFlash(center.x, center.y, '#c39bd3', 0.25);
          }
        }
      }
      const ds = st.darts;
      for (let j = ds.length - 1; j >= 0; j--) {
        const d = ds[j];
        d.a += d.spd * dt;
        const dx = st.x + Math.cos(d.a) * d.r;
        const dy = st.y + Math.sin(d.a) * d.r;
        const hitE = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - dx, o.y - dy) < 14);
        if (hitE && !d.hitIds[hitE.id]) {
          d.hitIds[hitE.id] = true;
          this.damage(hitE, st.perDmg, 'boomerang');
          this.fxFlash(dx, dy, '#c39bd3');
          this.fxParticle(dx, dy, '#c39bd3', 3, 16, 0.25, 80, 4);
        }
      }
    }
  }

  /** 回旋镖·风痕推进：路径伤害区，C 卷痕减速 */
  updateWindTrails(dt) {
    if (!this.windTrails || !this.windTrails.length) return;
    for (let i = this.windTrails.length - 1; i >= 0; i--) {
      const w = this.windTrails[i];
      w.ttl -= dt;
      if (w.ttl <= 0) { this.windTrails.splice(i, 1); continue; }
      this.enemies().forEach((o) => {
        if (o.hp <= 0 || Math.hypot(o.x - w.x, o.y - w.y) > w.r) return;
        // v1.16.102 风刃3★：风痕叠加时伤害取最高值 +30%/层（上限 3 层）
        let mult = 1;
        if (this.game.run.relic3('boo_wind')) {
          const layers = Math.min(3, this.windTrails.filter((w2) => w2 !== w && Math.hypot(o.x - w2.x, o.y - w2.y) <= w2.r).length + 1);
          mult = 1 + 0.3 * layers;
        }
        this.damage(o, w.dps * dt * mult, 'boomerang');
        // v1.16.102 长痕3★：风痕命中的敌人附加 1 层标记（持续 5 秒，需学习猎手标记技能；每敌 1 秒内至多叠 1 层）
        if (this.game.run.relic3('boo_trail') && this.lv('boomerang', '猎手标记') > 0) {
          o._trailMarkCd = (o._trailMarkCd || 0) - dt;
          if (o._trailMarkCd <= 0) {
            o._trailMarkCd = 1;
            const cap = SKILL_NUM.boomerang['猎手标记'].stackCap + SKILL_NUM.boomerang['猎手标记'].stacksPerBranch * this.branchLv('boomerang', '猎手标记', 'B');
            o._mark = Math.min(cap, (o._mark || 0) + 1);
            o._markT = SKILL_NUM.boomerang['猎手标记'].markDur;
            this.fxParticle(o.x, o.y - 16, '#d2b4de', 2, 12, 0.35, 60, 4);
          }
        }
        if (w.slow) this.applySlow(o, w.slow, 0.2);
      });
    }
  }

  /* ---------- 敌人状态推进 ---------- */
  tickStatus(e, dt) {
    Statuses.tickBaseStatus(this, e, dt);
    PoisonTower.tickEnemyStatus(this, e, dt);
  }

  /* ---------- 伤害结算 ---------- */
  damage(e, dmg, srcKey, kind) { return Damage.damage(this, e, dmg, srcKey, kind); }

  /* ---------- 死亡触发：各塔死亡技能（爆燃/毒爆/霜星/扩散/回收/致死） ---------- */
  onKill(e) {
    const g = this.game;
    // 毒·致死：低血死亡（此处仅为触发记录，实际致死在命中时判断）
    // 按所有激活塔触发死亡技能
    g.run.slotOrder.slice().forEach((key) => {
      if (key === 'fire' && this.hasDot(e, 'burn')) {
        RelicKill.fireDeath(this, e);
        // 爆燃（v1.13：基础 40% 概率引爆；v1.16.21 A 爆裂 +30/60/90%、B 扩张 +20/40/60%）
        if (this.has('fire', '爆燃') && Math.random() < SKILL_NUM.fire['爆燃'].deathProbability) {
          const aLv = this.branchLv('fire', '爆燃', 'A');
          const bLv = this.branchLv('fire', '爆燃', 'B');
          const boomR = SKILL_NUM.fire['爆燃'].baseRadius * (1 + SKILL_NUM.fire['爆燃'].radius[bLv]);
          this.explode(e.x, e.y, boomR, this.shotDmg('fire', true) * SKILL_NUM.fire['爆燃'].baseDamage * (1 + SKILL_NUM.fire['爆燃'].dmg[aLv]), 'fire');
          RelicKill.fireExplosionSpread(this, e, boomR);
        }
      }
      if (key === 'poison' && this.has('poison', '毒爆') && this.hasDot(e, 'poison')) {
        // v1.16.42 毒爆重做：中毒目标死亡时传染 3+A 个目标，每个目标 30% 几率造成 1 层中毒；
        //   B 继承：30%/40%/50% 概率传播时附带死亡时所有层数；C 毒沼：留下 60px 毒沼 4/5/6 秒每秒叠 1 层并减速 25%
        const n = SKILL_NUM.poison['毒爆'].targets + this.branchLv('poison', '毒爆', 'A');
        const bLv = this.branchLv('poison', '毒爆', 'B');
        const r = SKILL_NUM.poison['毒爆'].radius;
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= r)
          .sort((a, b) => (Math.abs(a.x - e.x) + Math.abs(a.y - e.y)) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)));
        const picks = cands.slice(0, n);
        // v1.16.100 毒爆连锁3★：传染链每跳一环，毒伤 +10%（链式增伤，链数随传染传递）
        const chainN = (e._poisonChain || 0) + 1;
        picks.forEach((o) => {
          if (Math.random() < SKILL_NUM.poison['毒爆'].spreadP) {
            // v1.16.100 瘟疫之源3★：传染时保留目标 50% 现有层数（无论是否触发 B 继承）
            const base = RelicKill.poisonInheritanceBase(this, e);
            const layers = (bLv > 0 && Math.random() < SKILL_NUM.poison['毒爆'].inherit[bLv]) ? this.poisonStack(e) : base;
            this.applyPoison(o, this.shotDmg('poison', true), 'poison', layers);
            o._poisonChain = chainN;
            this.fxBeam(e.x, e.y, o.x, o.y, '#7ee2a8', 0.3, 3);
          }
        });
        this.fxRing(e.x, e.y, '#52be80', r, 0.5, 5);
        this.fxFlash(e.x, e.y, '#52be80');
        if (this.branchLv('poison', '毒爆', 'C') > 0) {
          const cLv = this.branchLv('poison', '毒爆', 'C');
          this.groundDots = this.groundDots || [];
          // v1.16.42 毒沼：60px 泥沼，4/5/6 秒，每秒叠 1 层 + 泥沼减速 25%（swamp 标记与毒池视觉区分）
          this.groundDots.push({ x: e.x, y: e.y, r: SKILL_NUM.poison['毒爆'].swampR, ttl: SKILL_NUM.poison['毒爆'].swampTtl[cLv], key: 'poison', dps: 0, stackPerSec: 1, swamp: true, slow: SKILL_NUM.poison['毒爆'].swampSlow });
        }
      }
      RelicKill.poisonEssence(this, e, key);
      // 毒·毒藤 C（v1.15）：被缠绕敌人死亡时，藤蔓延伸缠住 100px（每级 +50px）内下一个敌人
      if (key === 'poison' && this.lv('poison', '毒藤') > 0 && e._vineT > 0) {
        const vc = this.branchLv('poison', '毒藤', 'C');
        if (vc > 0) {
          const vr = 100 + 50 * vc;
          const next = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= vr)
            .sort((a, b) => b.y - a.y)[0];
          if (next) {
            next.frozen = Math.max(next.frozen || 0, 2);
            next._vineT = Math.max(next._vineT || 0, 2);
            RelicKill.poisonTrail(this, next);
            this.fxBeam(e.x, e.y, next.x, next.y, '#2ecc71', 1, 4);
            this.fxRing(next.x, next.y, '#7dcea0', 26, 1, 3);
          }
        }
      }
      // 冰·冰冻 C 碎冰（v1.16.21）：击杀冰冻敌人 → 120px 范围爆炸（30%/40%/50%×攻击力，档位式）并减速 30%
      if (key === 'ice' && this.branchLv('ice', '冰冻', 'C') > 0 && e.frozen > 0) {
        const frzC = this.branchLv('ice', '冰冻', 'C');
        this.explode(e.x, e.y, SKILL_NUM.ice['冰冻'].shatterRadius, this.shotDmg('ice', true) * SKILL_NUM.ice['冰冻'].shatter[frzC], 'ice', 0, true);
      }
      RelicKill.iceDeath(this, e, key);
      RelicKill.electricDeath(this, e, key);
      // （冰·霜星 已改为周期技「冰花」，死亡溅射移除 v1.13.23）
      // 回旋镖·猎手标记 C 猎杀（v1.16.42）：标记目标死亡时，向 100px 范围内 1/2/3 个敌人扩散标记（各 5s 持续）
      if (key === 'boomerang' && this.branchLv('boomerang', '猎手标记', 'C') > 0 && (e._mark || 0) > 0) {
        const cLv = this.branchLv('boomerang', '猎手标记', 'C');
        const markCap = SKILL_NUM.boomerang['猎手标记'].stackCap + SKILL_NUM.boomerang['猎手标记'].stacksPerBranch * this.branchLv('boomerang', '猎手标记', 'B');
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= SKILL_NUM.boomerang['猎手标记'].spreadRadius);
        for (let i = 0; i < Math.min(cLv, cands.length); i++) {
          const pick = cands[i];
          pick._mark = Math.min(markCap, (pick._mark || 0) + 1);
          pick._markT = SKILL_NUM.boomerang['猎手标记'].markDur;
          this.fxBeam(e.x, e.y, pick.x, pick.y, '#d2b4de', 0.4, 2.5);
        }
        RelicKill.hunterTransfer(this, e, cands, markCap);
      }
      RelicKill.boomerangDeath(this, e, key);
      RelicKill.cannonDeath(this, e, key);
    });
    // 爆炸表现 + 音效（按最近伤害来源着色）
    const KILL_COLOR = { fire: '#ff7043', poison: '#7ee2a8', cannon: '#d89e63', ice: '#7fd4ff', electric: '#f4d03f', boomerang: '#c39bd3' };
    g.fx.push({ type: 'boom', x: e.x, y: e.y, t: 0, dur: 0.5, color: KILL_COLOR[e.lastDmgKey] || '#ff9f43' });
    this.fxRing(e.x, e.y, KILL_COLOR[e.lastDmgKey] || '#ff9f43', 40, 0.35, 4);
    g.playSfx('boom', 0.35);
    // 击杀奖励钩子：经验（圣物加成）/ 精英圣物掉落 / Boss 宝箱掉落（game 层实现）
    if (g.onKillReward) g.onKillReward(e);
  }

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
  tickTower(key, dt) {    const g = this.game;
    const t = this.tower(key);
    if (!t || t.level === 0) return;
    const cfg = CONFIG.TOWERS[key];
    let iv = this.interval(key);
    // v1.16.42 回旋镖攻击节奏重做（无攻速属性）：投掷节奏 = 镖飞回 + 接镖硬间隔——
    //   未学「接镖」：接镖后 0.5 秒才投出下一镖；学「接镖」：接镖后立即投掷（C 续投加成）
    if (key === 'boomerang') {
      const flying = this.shots.some((s) => s.sweep && s.key === key);
      if (flying) return;                       // 镖在飞行中不投（也不累计攻速计时）
      const catchSkill = this.lv('boomerang', '接镖') > 0;
      if (this.bWait[key]) {
        this.bWait[key] = false;
        // v1.16.114 疾接1★/2★：接镖后下一镖造成的伤害提升 15%/20%（叠加在接镖 C 续投之上）
        this._nextDmg[key] = (this._nextDmg[key] || 0) + this.relicVal('boo_catch') / 100;
        // v1.16.102 疾接3★：接镖瞬间 0.3 秒无敌帧（对精英投射物有效，窗口由 run._wallInvT 承载）
        if (g.run.relic3('boo_catch')) g.run._wallInvT = 0.3;
        if (catchSkill) {
          const cnt = this.branchLv('boomerang', '接镖', 'C');
          if (cnt > 0) this._nextDmg[key] = (this._nextDmg[key] || 0) + 0.10 * cnt;
          this.attackOnce(key);
          return;
        }
        this.bCatch[key] = 0;                   // 未学接镖：开始 0.5s 接镖冷却
      }
      if (this.bCatch[key] !== undefined) {
        this.bCatch[key] += dt;
        if (this.bCatch[key] >= SKILL_NUM.boomerang['接镖'].catchCd) { this.bCatch[key] = undefined; this.attackOnce(key); }
      } else {
        this.attackOnce(key);                   // 空闲/无目标：直接尝试（attackOnce 内部无目标时复位等待）
      }
      return;
    }
    this.atkTimers[key] = (this.atkTimers[key] || 0) + dt;
    // 电·充能：命中层数也提供攻速（interval 已算）
    while (this.atkTimers[key] >= iv) {
      this.atkTimers[key] -= iv;
      this.attackOnce(key);
    }
  }

  /** 选择攻击目标（v1.16.130）：射程内直线距离最近的一个怪物（更智能：优先打靠近塔的威胁） */
  pickTarget(key) { return Targeting.pickTarget(this, key); }

  /** v1.16.130 额外目标：主目标 Y 轴往上 40px 截面范围（水平带 [main.y-40, main.y]）内的随机敌人；带内无其他敌人时回退主目标 */
  pickAltTarget(key, main) { return Targeting.pickAltTarget(this, key, main); }

  /** 单塔一次攻击：选目标 → 发弹道（表现层） + 登记命中回调 */
  attackOnce(key) {
    const g = this.game;
    // v1.16.77 能量：普攻每次耗 0.5 能量（每 2 发 1 点）；能量耗尽不停火，进入弱化态（shotDmg ×0.5）
    // v1.16.96 弹药箱3★：能量不足时从备用能量库借用
    const ammoT = this.tower(key);
    const target = this.pickTarget(key);
    if (!target) {
      // 回旋镖：无目标可投时复位等待标记，避免接镖流程空转
      if (key === 'boomerang') this.bWait[key] = false;
      return;
    }
    // v1.16.103 速射3★：速射期间每 10 次攻击免费 1 发（不耗能量）
    let freeShot = false;
    if (key === 'cannon' && g.run.relic3('can_rapid') && ammoT) {
      ammoT._rapidN = (ammoT._rapidN || 0) + 1;
      if (ammoT._rapidN >= 10) { ammoT._rapidN = 0; freeShot = true; }
    }
    if (ammoT && !freeShot) g.run.spendAttackEnergy(ammoT);
    // v1.16 接镖 B 回能：回旋镖 30% 概率不耗能量（已在上面消耗，回补；v1.17.10 按塔实际能耗回补）
    const regain = key === 'boomerang' && this.branchLv('boomerang', '接镖', 'B') > 0 && Math.random() < SKILL_NUM.boomerang['接镖'].catchRegain;
    if (ammoT && regain) ammoT.energy = Math.min(ammoT.energy + g.run.attackCost(ammoT), g.run.armoryEnergyMax());
    // v1.16.102 疾风回旋3★：攻速加成期间接镖 15% 概率不耗能量（攻速加成存在 = 实际攻击间隔 < 基础间隔）
    if (ammoT && key === 'boomerang' && g.run.relic3('boo_speed') && this.interval(key) < CONFIG.TOWERS[key].atkInterval && Math.random() < 0.15) {
      ammoT.energy = Math.min(ammoT.energy + g.run.attackCost(ammoT), g.run.armoryEnergyMax());
    }
    const cfg = CONFIG.TOWERS[key];
    const ly = this.ly();
    // v1.16.37 发射点统一走 towerMuzzle（测试战场单塔大槽 / 正式战斗槽位），修复弹道从塔区中间凭空发出
    const mz = this.towerMuzzle(key);
    const sx = mz.x, sy = mz.y;
    const tint = { fire: '#e74c3c', ice: '#7fd4ff', poison: '#52be80', electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d' }[key] || '#ffd24a';
    const dur = cfg.shot.dur;
    let dmg = this.shotDmg(key);
    const volley = g.run.gsState && g.run.gsState.volley;
    if (volley && volley[key]) {
      delete volley[key]; dmg *= GS_BALANCE.volley.damagePerShot;
      for (let i=1;i<GS_BALANCE.volley.count;i++) {
        const start = this.shots.length;
        if (key === 'fire' && this.lv('fire', '多重火球') > 0) this._fireMultiShot(target, dmg);
        else if (key === 'ice' && this.lv('ice', '多重冰锥') > 0) this._iceMultiShot(target, dmg);
        else this.addProjectile({key,target,dmg,t:0,dur,sx,sy}, {type:'shot',kind:cfg.shot.kind,color:tint,x:sx,y:sy,tx:target.x,ty:target.y,t:0,dur,key});
        for (let j = start; j < this.shots.length; j++) {
          this.shots[j].t = -i * GS_BALANCE.volley.shotDelay;
          if (this.shots[j].visual) this.shots[j].visual.t = this.shots[j].t;
        }
      }
    }
    // 炮·双管齐射（v1.16）：基础 25% 概率双发，A 齐射 +15pp/级；副炮第二发伤害 +20%/级（B）
    const duelProb = key === 'cannon' ? (0.25 + 0.15 * this.branchLv('cannon', '双管齐射', 'A') + this.relicVal('can_double') / 100) : 0;   // v1.16.114 双发1★/2★
    const duel = key === 'cannon' && this.lv('cannon', '双管齐射') > 0 && Math.random() < duelProb;
    // 电·充能：攻击次数累计
    const chargeLv = this.lv('electric', '充能');
    if (key === 'electric' && chargeLv > 0) {
      const t = this.tower('electric');
      t._chargeLayers = Math.min(5 * chargeLv, (t._chargeLayers || 0) + 1);
      // v1.16.101 快充3★：充能满层时释放过载脉冲（全塔攻速+20%×3s，触发后清空层数重新累计）
      if (this.game.run.relic3('elec_fast') && t._chargeLayers >= 5 * chargeLv) {
        t._chargeLayers = 0;
        this.game.run._elecPulseTtl = 3;
        this.fxFlash(this.towerMuzzle('electric').x, this.towerMuzzle('electric').y, '#f4d03f', 0.4);
        this.fxRing(this.towerMuzzle('electric').x, this.towerMuzzle('electric').y, '#f4d03f', 60, 0.5, 4);
      }
    }
    // v1.16.112 火塔攻击级挂点（熔炉之息免费火柱 / 火焰弹射：每攻击一次判定一次，与弹道数量无关）
    if (key === 'fire') this._fireAttackOnAttack();
    // 弹道（视觉）+ 命中（逻辑）
    // v1.5：fx 携带 target 引用，直线/闪电弹道末端实时跟随目标移动
    const baseShot = { type: 'shot', kind: cfg.shot.kind, color: tint, x: sx, y: sy, tx: target.x, ty: target.y, t: 0, dur, key, target, fold: key === 'boomerang' && this.lv('boomerang', '折返增伤') > 0 };
    const fireMulti = key === 'fire' && this.lv('fire', '多重火球') > 0;
    const iceMulti = key === 'ice' && this.lv('ice', '多重冰锥') > 0;
    if (fireMulti) {
      // v1.16.130 多重火球重做：一次普攻从塔口扇形飞出 n 枚火球——中心一枚锁定主目标，其余以目标方向为基准两侧扇形，
      //   全部为真实可见弹道、命中才结算（不再"普攻先命中再从目标处散射"）
      this._fireMultiShot(target, dmg);
      g.playSfx('shot', 0.25);
    } else if (iceMulti) {
      // v1.16.130 多重冰锥重做：同火塔——一次普攻扇形 n 枚冰锥，中心锁定主目标
      this._iceMultiShot(target, dmg);
      g.playSfx('shot', 0.25);
    } else {
      // v1.13.5：大火球激活 → 火球弹体 ×2（扩大一倍）
      if (key === 'fire' && this.lv('fire', '大火球') > 0) baseShot.scale = 2.0;
      // v1.13.28：冰塔普攻弹道统一采用多重冰锥样式（冰蓝菱形 + 放大 1.15）
      if (key === 'ice') baseShot.scale = 1.15;
      g.fx.push(baseShot);
      g.playSfx('shot', 0.25);
    }
    // v1.13.2 塔口发射特效：攻击瞬间塔口喷发微火星 + 小闪光（直线/闪电类塔）
    if (cfg.shot.kind === 'line' || cfg.shot.kind === 'bolt') {
      this.fxParticle(sx, sy - 4, tint, 3, 24, 0.25, 90, 4);
      this.fxFlash(sx, sy, tint, 0.15);
    }
    // v1.13.27 冰塔开火专属特效：塔口冰晶迸发 + 冰蓝闪光
    if (key === 'ice') {
      this.fxParticle(sx, sy - 6, '#eaf6ff', 5, 34, 0.28, 120, 5);
      this.fxParticle(sx, sy - 6, '#7fd4ff', 3, 44, 0.32, 70, 4);
      this.fxFlash(sx, sy, '#a9d6f5', 0.2);
    }
    if (key === 'boomerang') {
      // 回旋镖 v1.16 重做：弧线飞出再飞回，沿途扫过所有敌人；投出后标记等待接回（接镖机制保留）
      // v1.16.130 多镖重做：每枚镖独立索敌——主镖锁定最近敌人（pickTarget），其余镖从主目标 Y 轴往上 40px
      //   截面内随机选敌，各自飞向各自目标点（不再共享一个落点一排散开）
      this.bWait[key] = true;
      const multi = this.lv('boomerang', '多镖');
      const nextBoost = this._nextDmg[key] || 0;   // 接镖 C 续投：下镖伤害 +10%/级
      this._nextDmg[key] = 0;
      // 怪物只沿 +y 走向城墙（main.moveEnemy），预测位移 = speed × 减速系数 × 到达弧顶时间（dur×0.53）
      // v1.16.5 接镖 A 疾飞：镖飞行速度 +20%/级 → 飞行时长缩短、命中与接回更快
      const flyBoost = 1 + SKILL_NUM.boomerang['接镖'].speedPerBranch * this.branchLv('boomerang', '接镖', 'A') + this.relicVal('boo_spin') / 100;   // v1.16.114 回旋1★/2★：镖速 +20%/30%
      const bDur = dur / flyBoost;
      const slowMult = (target.slow && target.slow.ttl > 0) ? target.slow.mult : 1;
      const wallY = (g.ly && g.ly.wallY) ? g.ly.wallY - 10 : 957;
      const n = SKILL_NUM.boomerang['多镖'].baseCount + multi + this.relicVal('boo_multi');   // v1.16.114 镖群1★/2★：每次投掷镖数 +2/+3
      const decay = multi > 0 ? (SKILL_NUM.boomerang['多镖'].damageDecayPerLevel * multi) * (this.branchLv('boomerang', '多镖', 'B') > 0 ? SKILL_NUM.boomerang['多镖'].branchDecayMultiplier : 1) : 0;
      const perDmg = dmg * (1 - decay) * (1 + nextBoost);
      const maxD = CONFIG.TOWERS.boomerang.range;
      // v1.16.130 独立索敌：主镖 = 最近敌人，其余 = 主目标上方 40px 截面内随机敌人
      const bladeTargets = [target];
      for (let i = 1; i < n; i++) bladeTargets.push(this.pickAltTarget('boomerang', target));
      // 移除通用视觉弹道（baseShot），按 n 枚重建（各镖独立目标、各自轨迹）
      const bidx = g.fx.indexOf(baseShot);
      if (bidx >= 0) g.fx.splice(bidx, 1);
      for (let i = 0; i < n; i++) {
        const t_i = bladeTargets[i];
        const aimY_i = Math.min(t_i.y + t_i.speed * slowMult * bDur * 0.53, wallY);
        const dx = t_i.x - sx, dy = aimY_i - sy;
        const dist = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, maxD / dist);
        const ex = sx + dx * k, ey = sy + dy * k;
        this.addProjectile({ key, dmg: perDmg, t: 0, dur: bDur, sx, sy, tx: ex, ty: ey, sweep: true, hitIds: {}, windLv: this.lv('boomerang', '风痕') }, { type: 'shot', kind: 'arc', color: tint, x: sx, y: sy, tx: ex, ty: ey, t: 0, dur: bDur, key, fold: this.lv('boomerang', '折返增伤') > 0 });
      }
    } else if (!fireMulti && !iceMulti) {
      this.shots.push({ key, target, dmg, t: 0, dur, sx, sy });
    }
    if (duel) {
      // 双管齐射第二发（更短弹道；B 副炮第二发伤害 +25%/级）
      // v1.16.103 双发3★：双发的第二发必定命中血量最低的敌人
      const duelDmg = dmg * (1 + 0.25 * this.branchLv('cannon', '双管齐射', 'B'));
      let duelTarget = target;
      if (g.run.relic3('can_double')) {
        duelTarget = this.enemies().filter((o) => o.hp > 0).sort((a, b) => a.hp - b.hp)[0] || target;
      }
      g.fx.push({ ...baseShot, t: 0, dur: dur * 0.75 });
      this.shots.push({ key, target: duelTarget, dmg: duelDmg, t: 0, dur: dur * 0.75, sx, sy });
    }
  }

  /* ---------- 弹道命中结算 ---------- */
  resolveShot(s) { return Projectiles.resolveShot(this, s); }

  /** 散射弹道（无目标）沿途碰撞检测（v1.13.13）：按 t/dur 线性插值当前位置，命中半径内敌人返回该敌，未命中返回 null */
  scatterCheck(s) { return Projectiles.scatterCheck(this, s); }

  /** 回旋镖轨迹点（v1.9）：椭圆大弧——镖从塔出发，划弧越过投掷方向最远点后继续绕回塔（非原路径折返） */
  sweepPos(s, p) { return Projectiles.sweepPos(s, p); }

  /** 回旋镖沿途伤害（v1.16）：椭圆大弧扫过路径上的所有敌人，每敌单镖最多命中一次；折返 C 宽返吸附 +20%/级；风痕留痕 */
  sweepDamage(s) {
    const g = this.game;
    const p = Math.min(1, s.t / s.dur);
    const pos = this.sweepPos(s, p);
    const bx = pos.x, by = pos.y;
    const foldC = this.branchLv('boomerang', '折返增伤', 'C');
    const r = 42 * (1 + 0.20 * foldC);
    for (const e of g.enemies) {
      if (e.hp <= 0 || s.hitIds[e.id]) {
        // v1.16.102 强返3★：折返镖命中同一目标第二次时伤害 ×1.5（仅折返增伤激活）
        // v1.16.102 镖群3★：多镖呈环状回收时命中路径上的所有敌人（每敌额外一次回程命中）
        const wantReturn = g.run.relic3('boo_return') && this.lv('boomerang', '折返增伤') > 0 && !s.hitIds[e.id + '_r'];
        const wantMulti = g.run.relic3('boo_multi') && this.lv('boomerang', '多镖') > 0 && !s.hitIds[e.id + '_2'];
        if ((wantReturn || wantMulti) && Math.hypot(e.x - bx, e.y - by) <= r) {
          if (wantReturn) s.hitIds[e.id + '_r'] = true;
          if (wantMulti) s.hitIds[e.id + '_2'] = true;
          this.damage(e, s.dmg * (wantReturn ? 1.5 : 1), 'boomerang');
        }
        continue;
      }
      if (Math.hypot(e.x - bx, e.y - by) <= r) {
        s.hitIds[e.id] = true;
        // v1.16.102 回旋3★：飞镖速度提升使命中率提高，Miss 补偿为 +10% 伤害
        const spinV = g.run.relic3('boo_spin') ? 1.1 : 1;
        this.damage(e, s.dmg * spinV, 'boomerang');
        this.tryAttackDebuff('boomerang', e, s.dmg * spinV);   // v1.16.53 多镖扫过属普攻强化：统一流血判定（吃放血技能加成）
      }
    }
    // 风痕（v1.16）：镖路径每秒留下风痕伤害区（A 久痕 +0.5s/级；B 劲风 +30%/级；C 卷痕减速 15%）
    // v1.16.36 修正：空间间隔采样（相邻留痕 ≥32px，r=34 伤害区仍连续全覆盖）+ 上限 120→240，
    //            避免多镖/疾飞高频投掷下活跃点数迅速打满 120 导致风痕整体断供
    if (s.windLv > 0) {
      const wA = this.branchLv('boomerang', '风痕', 'A');
      const wB = this.branchLv('boomerang', '风痕', 'B');
      const wC = this.branchLv('boomerang', '风痕', 'C');
      this.windTrails = this.windTrails || [];
      const spaced = !s._wLast || Math.hypot(bx - s._wLast.x, by - s._wLast.y) >= SKILL_NUM.boomerang['风痕'].sampleDistance;
      if (spaced && this.windTrails.length < SKILL_NUM.boomerang['风痕'].maxTrails) {
        const ttl = SKILL_NUM.boomerang['风痕'].duration + SKILL_NUM.boomerang['风痕'].durationPerBranch * wA;
        const dps = this.shotDmg('boomerang', true) * SKILL_NUM.boomerang['风痕'].damage * (1 + SKILL_NUM.boomerang['风痕'].damagePerBranch * wB);
        this.windTrails.push({ x: bx, y: by, r: SKILL_NUM.boomerang['风痕'].radius, ttl, dps, slow: SKILL_NUM.boomerang['风痕'].slow[wC] });   // v1.16.42 C 卷痕档位式 10%/20%/30%
        s._wLast = { x: bx, y: by };
      }
      if (Math.random() < 0.5) this.fxParticle(bx, by, '#c39bd3', 1, 14, 0.5, 50, 3);
    }
  }

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
      // 流血（v1.16.21）：基础 20%；学放血 +25%（20→45）+ A 刺骨 +15%/级（45→90%）
      const bleedLv = this.lv('boomerang', '放血');
      const bleedChance = SKILL_NUM.boomerang['放血'].baseProbability + (bleedLv > 0 ? SKILL_NUM.boomerang['放血'].learnedProbability + SKILL_NUM.boomerang['放血'].probabilityPerBranch * this.branchLv('boomerang', '放血', 'A') : 0) + this.relicVal('boo_bleed') / 100;   // v1.16.114 放血刃1★/2★
      // v1.16.102 放血刃3★：流血概率触顶（≥80%）时，多余判定转为流血时长 +1 秒
      const bleedTip = this.game.run.relic3('boo_bleed') && bleedChance >= 0.8;
      if (bleedTip ? Math.random() < 0.8 : Math.random() < bleedChance) {
        this.applyBleed(o, dmg);
      } else if (bleedTip) {
        this.applyBleed(o, dmg);
        o.bleedT += 1;   // 触顶失败判定转流血时长 +1 秒
        this.fxParticle(o.x, o.y - 8, '#c0392b', 4, 20, 0.4, 80, 4);
      }
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
  tickCannon(dt) {
    const g = this.game;
    // 炮·炮火支援（v1.16 周期）：每 12 秒对敌人密集区降下 3 发炮击（60%×威力，半径130；A 增援 +1发/级；C 焦土留燃烧地面 2s 30%/s）
    // v1.16.31：逐发弹道——每发间隔 0.1s 从塔口升空（0.3s 至高点 300px）后**消失**；发射 1.0s 后在目标头顶
    //           高 300px 处**出现**并 0.3s 垂直落下（第 1 发落地 1.3s，之后每发 +0.1s，3~6 发总动画 1.5~1.8s）；
    //           每发落地前 0.5s 地面出现 130px 棕色描边受击圈（持续至落地爆炸）
    const support = this.lv('cannon', '炮火支援');
    if (support > 0) {
      this.timers.support = (this.timers.support || 0) + dt;
      if (this.timers.support >= SKILL_NUM.cannon['炮火支援'].period * this._weakPeriod('cannon')) {
        this.timers.support = 0;
        this.castEnergy('cannon', '炮火支援');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('cannon', e.x, e.y));
        if (alive.length) {
          const n = SKILL_NUM.cannon['炮火支援'].count + this.branchLv('cannon', '炮火支援', 'A');
          const dmg = this.shotDmg('cannon') * SKILL_NUM.cannon['炮火支援'].damage * (1 + SKILL_NUM.cannon['炮火支援'].damagePerBranch * this.branchLv('cannon', '炮火支援', 'B'));
          const mus = this.towerMuzzle('cannon');
          for (let i = 0; i < n; i++) {
            const t = alive[Math.floor(Math.random() * alive.length)];
            const px = t.x + (Math.random() - 0.5) * 40;
            const py = t.y + (Math.random() - 0.5) * 40;
            const off = 0.1 * i;                       // 逐发间隔 0.1s
            // 炮弹：升空 0.3s → 高点悬停至 1.0s → 0.3s 垂直落下（总 1.3s + 偏移）
            g.fx.push({ type: 'strikeShell', sx: mus.x, sy: mus.y, tx: px, ty: py, t: 0, dur: 1.3 + off, offset: off, seed: Math.random() * 100 });
            // 炮击圈：落地前 0.5s 出现（显示至落地爆炸，时长 0.8s）
            g.fx.push({ type: 'strike', x: px, y: py, r: SKILL_NUM.cannon['炮火支援'].radius, t: 0, dur: 0.8 + off, offset: off, seed: Math.random() * 100 });
            this.delayed.push({ x: px, y: py, r: SKILL_NUM.cannon['炮火支援'].radius, dmg, delay: 1.3 + off, t: 0, key: 'cannon', knock: 0, slowAfter: false, ember: this.branchLv('cannon', '炮火支援', 'C') });
          }
        }
      }
    }
    // 炮·地雷阵（v1.16.22 重做）：每 6 秒抛投 3 颗雷（A 布雷 +2/级），雷从塔口以 500px/s 飞向部署点（飞行不可引爆），
    //   落地布设 0.3s 后可引爆，持续 20 秒；有敌人时部署在最近敌人（最靠墙）附近一圈随机位置，无敌人时攻击范围内随机（B 雷威 +50%/级；C 连爆）
    const mineLv = this.lv('cannon', '地雷阵');
    if (mineLv > 0) {
      this.timers.mine = (this.timers.mine || 0) + dt;
      if (this.timers.mine >= SKILL_NUM.cannon['地雷阵'].period * this._weakPeriod('cannon')) {
        this.timers.mine = 0;
        this.castEnergy('cannon', '地雷阵');
        const n = SKILL_NUM.cannon['地雷阵'].count + SKILL_NUM.cannon['地雷阵'].countPerBranch * this.branchLv('cannon', '地雷阵', 'A');
        // 塔口坐标（v1.16.37 统一 towerMuzzle）
        const ly = this.ly();
        const mz = this.towerMuzzle('cannon');
        const fx0 = mz.x, fy0 = mz.y;
        const range = this.range('cannon');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('cannon', e.x, e.y));
        const topY = ly.areaY + ly.entryH + 10;
        const wallY = ly.wallY - 12;
        for (let i = 0; i < n; i++) {
          // 部署点：有敌人 → 最近敌人（y 最大）附近一圈随机；无敌人 → 攻击范围内随机
          let tx, ty;
          if (alive.length) {
            const near = alive.reduce((a, b) => (b.y > a.y ? b : a));
            const ang = Math.random() * Math.PI * 2;
            const rr = 30 + Math.random() * 150;   // v1.16.23：部署圈半径 ×3（10~60 → 30~180px）
            tx = near.x + Math.cos(ang) * rr;
            ty = near.y + Math.sin(ang) * rr;
          } else {
            tx = 40 + Math.random() * 620;
            ty = fy0 - 30 - Math.random() * Math.max(60, range - 90);
          }
          tx = Math.max(25, Math.min(725, tx));
          ty = Math.max(topY, Math.min(wallY, ty));
          const dist = Math.hypot(tx - fx0, ty - fy0);
          this.mines = this.mines || [];
          this.mines.push({
            x: fx0, y: fy0, r: SKILL_NUM.cannon['地雷阵'].radius,
            dmg: this.shotDmg('cannon') * SKILL_NUM.cannon['地雷阵'].damage * (1 + SKILL_NUM.cannon['地雷阵'].damagePerBranch * this.branchLv('cannon', '地雷阵', 'B')),
            armed: 0, ttl: SKILL_NUM.cannon['地雷阵'].duration, chain: this.branchLv('cannon', '地雷阵', 'C'),
            fly: { sx: fx0, sy: fy0, tx, ty, t: 0 },
          });
          const flyDur = dist / 200;   // 200px/s
          g.fx.push({ type: 'mine', x: tx, y: ty, t: 0, dur: flyDur + SKILL_NUM.cannon['地雷阵'].duration, seed: Math.random() * 100, fly: { sx: fx0, sy: fy0, tx, ty, dur: flyDur } });
          this.fxParticle(fx0, fy0 - 8, '#b5651d', 4, 22, 0.3, 90, 4);
        }
      }
    }
    // 炮·炮台（v1.16 周期召唤）：每 10 秒部署一门自动炮台（A 增台 +1/级；B 久驻 +2s 且 CD -1s/级），独立炮击最靠墙敌人（70% 伤害·1s/发；C 重炮台爆炸范围 +30%/级）
    const turret = this.lv('cannon', '炮台');
    if (turret > 0) {
      this.timers.turret = (this.timers.turret || 0) + dt;
      const cd = Math.max(SKILL_NUM.cannon['炮台'].minPeriod, SKILL_NUM.cannon['炮台'].period - SKILL_NUM.cannon['炮台'].periodReductionPerBranch * this.branchLv('cannon', '炮台', 'B')) * this._weakPeriod('cannon');
      if (this.timers.turret >= cd) {
        this.timers.turret = 0;
        this.castEnergy('cannon', '炮台');
        const n = SKILL_NUM.cannon['炮台'].count + this.branchLv('cannon', '炮台', 'A');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('cannon', e.x, e.y));
        if (!alive.length) return;   // v1.16.18 没有敌人时不部署炮台
        for (let i = 0; i < n; i++) {
          const near = alive[Math.floor(Math.random() * alive.length)];
          const px = near.x + (Math.random() - 0.5) * 90;
          const py = near.y + (Math.random() - 0.5) * 90;
          const ttl = SKILL_NUM.cannon['炮台'].duration + SKILL_NUM.cannon['炮台'].durationPerBranch * this.branchLv('cannon', '炮台', 'B');
          this.turrets = this.turrets || [];
          this.turrets.push({ x: px, y: py, ttl, atkT: 0, atkI: SKILL_NUM.cannon['炮台'].attackInterval, dmg: this.shotDmg('cannon') * SKILL_NUM.cannon['炮台'].damage, r: SKILL_NUM.cannon['炮台'].radius * (1 + SKILL_NUM.cannon['炮台'].radiusPerBranch * this.branchLv('cannon', '炮台', 'C')) });
          g.fx.push({ type: 'turret', x: px, y: py, t: 0, dur: ttl, seed: Math.random() * 100 });
          this.fxRing(px, py, '#b5651d', 40, 0.5, 3.5);
        }
      }
    }
  }

  // ===== tickBoomerang =====


  /* ============ 回旋镖塔 ============ */
  /* ============ 回旋镖塔（v1.16 重做：折返增伤/穿透/多镖/接镖/猎手标记/风暴镖/镖阵/风痕） ============ */
  hitBoomerang(e, dmg) {
    // 猎手标记（v1.16.42 重做）：命中同目标叠加标记，标记持续 5 秒（到期自动清零）；
    //   A 深镖：受标记敌人受伤 +8%/16%/24%（damage 内全来源结算）；B 多标：层数上限 +2/+4/+6；C 猎杀：死亡扩散 1/2/3 个
    const markLv = this.lv('boomerang', '猎手标记');
    let v = dmg;
    if (markLv > 0) {
      const cap = SKILL_NUM.boomerang['猎手标记'].stackCap + SKILL_NUM.boomerang['猎手标记'].stacksPerBranch * this.branchLv('boomerang', '猎手标记', 'B');
      e._mark = Math.min(cap, (e._mark || 0) + 1);
      e._markT = SKILL_NUM.boomerang['猎手标记'].markDur;   // v1.16.42 标记持续 5 秒（每次命中刷新）
      // 标记视觉：目标头顶紫色标记计数
      this.fxParticle(e.x, e.y - 16, '#d2b4de', 2, 12, 0.35, 60, 4);
    }
    this.damage(e, v, 'boomerang');
    // 普攻流血（v1.16.21→v1.16.53 统一判定）：20% 概率；「放血」+25%（20→45%）、A 刺骨 +15%/级（45→90%）
    this.tryAttackDebuff('boomerang', e, v);
    // 折返增伤（v1.16）：折返段 = 命中伤害 ×0.65×(1+0.25×A)；B 缓返命中减速 20%；C 宽返吸附已在 sweepDamage
    const fold = this.lv('boomerang', '折返增伤');
    if (fold > 0) {
      const foldDmg = v * SKILL_NUM.boomerang['折返增伤'].damage * (1 + SKILL_NUM.boomerang['折返增伤'].damagePerBranch * this.branchLv('boomerang', '折返增伤', 'A'));
      this.damage(e, foldDmg, 'boomerang');
      if (this.branchLv('boomerang', '折返增伤', 'B') > 0) this.applySlow(e, SKILL_NUM.boomerang['折返增伤'].slow, SKILL_NUM.boomerang['折返增伤'].slowDuration);
      // 折返视觉：紫色小回环
      this.fxRing(e.x, e.y, '#c39bd3', 34, 0.3, 2.5);
    }
    // （v1.16.14 回旋镖「穿透」已替换为「放血」dot 强化，穿透实现移除）
  }

  /* 普攻流血（v1.16.21 回旋镖塔重做）：每移动 10px 结算 4% 攻击伤害（每 100px 跳 40%）；「放血」：基础 +25% 概率（20→45%）/ A 刺骨 +15%/级（45→90%）/ B 时长 +1s/级 / C 溃烂 每 10px 伤害 4%→6/8/10% */
  applyBleed(e, dmg) { return Statuses.applyBleed(this, e, dmg); }

  tickBoomerang(dt) {
    const g = this.game;
    const stormBalance=SKILL_NUM.boomerang['风暴镖'], bounceBalance=SKILL_NUM.boomerang['弹力镖'];
    // 回旋镖·风暴镖（v1.16.21 重做）：每 12 秒在敌人密集区选一存活敌人，生成 120px 三同心圈（40/80/120）旋转小飞镖（内4/中6/外8枚，每镖 10% 伤害，命中即消失；A 转速 +25%/级；B 伤害 +20%/级；C 镖数每圈 +1/级）
    const cyclone = this.lv('boomerang', '风暴镖');
    if (cyclone > 0) {
      this.timers.storm = (this.timers.storm || 0) + dt;
      if (this.timers.storm >= stormBalance.period * this._weakPeriod('boomerang')) {
        this.timers.storm = 0;
        this.castEnergy('boomerang', '风暴镖');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('boomerang', e.x, e.y));
        if (alive.length) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          // 三圈角速度不同：内圈 2.6 顺时针 / 中圈 2.0 逆时针 / 外圈 2.4 顺时针（A 疾旋统一 +25%/级）
          const rings = stormBalance.rings;
          const baseN = stormBalance.ringCounts;
          const nAdd = this.branchLv('boomerang', '风暴镖', 'C');
          const perDmg = this.shotDmg('boomerang') * stormBalance.damage * (1 + stormBalance.damagePerBranch * this.branchLv('boomerang', '风暴镖', 'B'));
          const spdMul = 1 + stormBalance.speedPerBranch * this.branchLv('boomerang', '风暴镖', 'A');
          const darts = [];
          rings.forEach((rc, ri) => {
            const n = baseN[ri] + nAdd;
            const spd = rc.base * spdMul;   // 带方向符号（正=顺时针）
            for (let i = 0; i < n; i++) darts.push({ r: rc.r, spd, a: (Math.PI * 2 * i) / n, hitIds: {} });
          });
          this.storms = this.storms || [];
          // v1.16.102 旋风3★：风暴镖持续时间翻倍（3→6 秒）
          const cyclTtl = this.game.run.relic3('boo_cyclone') ? stormBalance.duration * 2 : stormBalance.duration;
          const sto = { x: t.x, y: t.y, r: 120, ttl: cyclTtl, darts, perDmg };
          const fxo = { type: 'cyclone', x: t.x, y: t.y, r: 120, t: 0, dur: cyclTtl, darts };
          sto.fx = fxo;                    // v1.16.38 风暴镖 fx 引用（同步清除）
          this.storms.push(sto);
          g.fx.push(fxo);
        }
      }
    }
    // 回旋镖·弹力镖（v1.16.21 原镖阵重做，新单体）：每 8 秒射 2 枚十字飞镖，碰敌人或战斗区边缘反弹（60% 伤害，反弹 10 次结束）；A 增镖 +1/级；B 利刃 +25%/级；C 弹力增强 +5 次/级
    const ringN = this.lv('boomerang', '弹力镖');
    if (ringN > 0) {
      this.timers.ringN = (this.timers.ringN || 0) + dt;
      if (this.timers.ringN >= bounceBalance.period * this._weakPeriod('boomerang')) {
        this.timers.ringN = 0;
        this.castEnergy('boomerang', '弹力镖');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('boomerang', e.x, e.y));
        const mus = this.towerMuzzle('boomerang');
        const n = bounceBalance.count + 1 * this.branchLv('boomerang', '弹力镖', 'A');
        const perDmg = this.shotDmg('boomerang') * bounceBalance.damage * (1 + bounceBalance.damagePerBranch * this.branchLv('boomerang', '弹力镖', 'B'));
        const maxB = bounceBalance.bounces + bounceBalance.bouncesPerBranch * this.branchLv('boomerang', '弹力镖', 'C');
        // 初始方向：射程内随机存活敌人方向 ± 散射（无敌人则全随机）
        let baseAng = Math.random() * Math.PI * 2;
        if (alive.length) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          baseAng = Math.atan2(t.y - mus.y, t.x - mus.x);
        }
        for (let i = 0; i < n; i++) {
          const ang = baseAng + (i - (n - 1) / 2) * bounceBalance.spreadStep;
          const d = { key: 'boomerang', dmg: perDmg, t: 0, dur: bounceBalance.duration, x: mus.x, y: mus.y, ang, speed: bounceBalance.speed, bounce: true, bounces: 0, maxB, hitR: bounceBalance.hitRadius, hitIds: {} };
          this.shots.push(d);
          const fxo = { type: 'shot', kind: 'bounce', ref: d, t: 0, dur: bounceBalance.duration, color: '#c39bd3' };
          d.fx = fxo;                    // v1.16.38 弹力镖 fx 引用（提前结束同步清除）
          g.fx.push(fxo);
        }
      }
    }
  }

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
