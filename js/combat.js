/**
 * combat.js —— 真实战斗系统（A1 技能行为差异化）
 * =====================================================================
 * 取代 main.js 中「totalDps()×dt 从最靠城墙敌人抽象削血」的旧机制：
 *   - 每座塔按自己的 atkInterval 独立攻击（真实节奏、真实目标、真实弹道）
 *   - 单次攻击伤害 dmg = towerDps(key) × atkInterval(key)，保持既有 DPS 口径
 *   - 每次命中按塔类型 + 已激活技能执行真实行为：
 *       火：点燃 DoT / 溅射 / 连击 / 燃爆 / 灼烧层数 / 攻速爆发 / 射程 / 火雨
 *       冰：减速 / 冰冻 / 冰锥穿透 / 寒潮 / 霜星 / 冻结率 / 低温全塔 / 永冻
 *       毒：剧毒 DoT / 扩散 / 毒爆 / 腐蚀 / 毒雾 / 瘟疫 / 致死 / 毒性强化
 *       电：连锁弹跳 / 麻痹 / 过载 / 电弧 / 雷暴 / 弹跳 / 充能 / 电磁场
 *       回旋镖：穿透 / 折返增伤 / 飞距 / 攻速 / 回收 / 双镖 / 暴击 / 范围回旋
 *       炮：溅射 / 重击 / 穿透弹 / 炮台座 / 震击 / 引信 / 弹幕 / 阵地加固
 *   - 敌人状态：灼烧/中毒 DoT、冰冻、麻痹、减速、腐蚀、连击/过载层数
 *   - 协同：燃爆×毒爆、冰冻×连锁、炮溅射×火溅射（爆炸/连锁增伤）
 *
 * 运行环境：微信小游戏（CommonJS），纯逻辑无渲染；视觉仍由 game.fx 表现。
 */
const CONFIG = require('./config.js');

/** 敌人状态初始化（wave.pushEnemy 时调用） */
function initEnemyState(e) {
  e.dots = [];            // [{type:'burn'|'poison', dps, ttl, stack, maxStack, tickT, src}]
  e.frozen = 0;           // 冻结剩余秒（不能移动/攻击）
  e.paralyzed = 0;        // 麻痹剩余秒（不能攻击）
  e.slow = null;          // {mult, ttl} 减速
  e.corrode = null;       // {mult, ttl} 受伤加深
  e.comboFire = null;     // {n, ttl} 火连击层数
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
  }

  reset() {
    this.shots = [];
    this.delayed = [];
    this.timers = {};
    this.atkTimers = {};
    this.kills = {};
    this.bWait = {};
  }

  /* ---------- 工具 ---------- */
  tower(key) { return this.game.run.effects.tower(key); }
  lv(key, name) {
    const b = this.tower(key);
    if (!b) return 0;
    const ef = b.pool.find((e) => e.name === name);
    return ef ? ef.level : 0;
  }
  has(key, name) { return this.lv(key, name) > 0; }
  enemies() { return this.game.enemies; }
  ly() { return this.game.ly; }

  /** 塔当前攻击间隔（攻速类技能叠加） */
  interval(key) {
    const cfg = CONFIG.TOWERS[key];
    let iv = cfg.atkInterval;
    // 火·攻速爆发 +25%/级
    if (key === 'fire') iv /= (1 + 0.25 * this.lv('fire', '攻速爆发'));
    // 冰·低温全塔：全塔 +10%/级，冰塔额外 +15%/级
    const chill = Math.max(this.lv('ice', '低温全塔'), 0);
    if (chill > 0) iv /= (1 + 0.10 * chill + (key === 'ice' ? 0.15 * chill : 0));
    // 回旋镖·攻速 +25%/级
    if (key === 'boomerang') iv /= (1 + 0.25 * this.lv('boomerang', '攻速'));
    // 回旋镖·飞距更快折返 +10%/级
    if (key === 'boomerang') iv /= (1 + 0.10 * Math.max(0, this.lv('boomerang', '飞距') - 1));
    // 炮·炮台座 +20%/级
    if (key === 'cannon') iv /= (1 + 0.20 * this.lv('cannon', '炮台座'));
    // 电·充能：命中累计攻速 +5%/层（上限 5×lv 层）
    const charge = this.lv('electric', '充能');
    if (charge > 0) {
      const e = this.tower('electric');
      const cap = 5 * charge;
      const layers = Math.min(cap, e ? e._chargeLayers || 0 : 0);
      if (layers > 0) iv /= (1 + 0.05 * layers);
    }
    // 圣物·疾风戒：全塔攻速 +8%/级
    const m = this.game.meta;
    const spdLv = (m && m.relicBonus && m.relicBonus().speed) || 0;
    if (spdLv > 0) iv /= (1 + 0.08 * spdLv);
    return Math.max(0.15, iv);
  }

  /** 塔当前射程（射程/飞距/范围回旋技能叠加） */
  range(key) {
    const cfg = CONFIG.TOWERS[key];
    let r = cfg.range;
    if (key === 'fire') r *= (1 + 0.30 * this.lv('fire', '射程'));
    if (key === 'boomerang') r *= (1 + 0.30 * this.lv('boomerang', '飞距') + 0.30 * this.lv('boomerang', '范围回旋'));
    return r;
  }

  /** 单次攻击伤害：towerDps × 攻击间隔（保持总 DPS 口径） */
  shotDmg(key) {
    const dps = this.game.run.effects.towerDps(key);
    const iv = CONFIG.TOWERS[key].atkInterval;
    return dps * iv;
  }

  /** 毒/灼烧 DoT 全局强化（毒·毒性强化：+25%×lv 伤害、tick 加快） */
  dotBoost() {
    const n = this.lv('poison', '毒性强化');
    return { dmg: 1 + 0.25 * n, tick: 1 + 0.25 * n };
  }

  /* ---------- 主更新：弹道命中 → 状态推进 → 塔攻击 → 周期技 → 死亡触发 ---------- */
  update(dt) {
    const g = this.game;
    if (!g.run.slotOrder.length) return; // 无塔不战斗

    // 兼容缺字段的敌人（测试/旧数据）：惰性补齐 A1 状态
    g.enemies.forEach((e) => { if (!e.dots) initEnemyState(e); });

    // 1. 飞行弹道推进与命中结算（回旋镖 sweep：沿途扫过伤害；其余：终点单体命中）
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      if (s.t >= s.dur) {
        this.shots.splice(i, 1);
        if (s.sweep) this.sweepDamage(s, dt);
        else this.resolveShot(s);
      } else if (s.sweep) {
        this.sweepDamage(s, dt);
      }
    }
    // 2. 延迟爆炸（炮引信）
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t += dt;
      if (d.t >= d.delay) {
        this.delayed.splice(i, 1);
        this.explode(d.x, d.y, d.r, d.dmg, d.key, d.knock, d.slowAfter);
      }
    }
    // 3. 敌人状态推进（DoT / 控制 / 层数衰减）
    g.enemies.forEach((e) => this.tickStatus(e, dt));
    // 4. 塔攻击调度（每塔独立节奏）
    g.run.slotOrder.slice().forEach((key) => this.tickTower(key, dt));
    // 5. 周期技
    this.tickPeriodic(dt);
    // 6. 死亡清场（死亡技能已在伤害结算处触发）
    g.enemies = g.enemies.filter((e) => e.hp > 0);
  }

  /* ---------- 敌人状态推进 ---------- */
  tickStatus(e, dt) {
    const boost = this.dotBoost();
    // DoT
    if (e.dots.length) {
      for (let i = e.dots.length - 1; i >= 0; i--) {
        const d = e.dots[i];
        d.ttl -= dt;
        if (d.ttl <= 0) { e.dots.splice(i, 1); continue; }
        d.tickT -= dt;
        if (d.tickT <= 0) {
          d.tickT += 0.5 / boost.tick;
          this.damage(e, d.dps * boost.dmg * (0.5 / boost.tick), d.src);
          // 持续伤特效：灼烧=火焰粒子（上飘）、中毒=毒泡（小概率避免过密）
          if (Math.random() < 0.5) {
            if (d.type === 'burn') {
              this.fxParticle(e.x + (Math.random() * 16 - 8), e.y - 12, '#ff7043', 3, 26, 0.5, 90, 5);
            } else {
              this.fxParticle(e.x + (Math.random() * 16 - 8), e.y - 8, '#7ee2a8', 3, 24, 0.5, 70, 4);
            }
          }
        }
      }
    }
    // 控制
    if (e.frozen > 0) e.frozen -= dt;
    if (e.paralyzed > 0) e.paralyzed -= dt;
    if (e.slow) { e.slow.ttl -= dt; if (e.slow.ttl <= 0) e.slow = null; }
    if (e.corrode) { e.corrode.ttl -= dt; if (e.corrode.ttl <= 0) e.corrode = null; }
    if (e.comboFire) { e.comboFire.ttl -= dt; if (e.comboFire.ttl <= 0) e.comboFire = null; }
    if (e.overload) { e.overload.ttl -= dt; if (e.overload.ttl <= 0) e.overload = null; }
    // 瘟疫传染（毒·瘟疫）
    const plague = this.lv('poison', '瘟疫');
    if (plague > 0 && this.hasDot(e, 'poison')) {
      e._plagueT = (e._plagueT || 0) + dt;
      const ivP = 2 * (1 - 0.30 * (plague - 1));
      if (e._plagueT >= ivP) {
        e._plagueT -= ivP;
        const prob = 0.20 + 0.20 * (plague - 1);
        if (Math.random() < prob) {
          const near = this.enemies().filter((o) => o !== e && Math.abs(o.x - e.x) < 90 && Math.abs(o.y - e.y) < 90);
          if (near.length) this.applyPoison(near[Math.floor(Math.random() * near.length)], this.shotDmg('poison'), 'poison');
        }
      }
    }
  }

  /* ---------- 伤害结算 ---------- */
  damage(e, dmg, srcKey) {
    if (e.hp <= 0) return;
    let v = dmg;
    // 腐蚀增伤
    if (e.corrode) v *= e.corrode.mult;
    // 冰·冻结率 b：冻结目标受伤 +20%×(lv-1)；永冻 b：冰塔对冰冻目标 +40%×(lv-1)
    const frz = Math.max(0, this.lv('ice', '冻结率') - 1);
    if (e.frozen > 0 && frz > 0) v *= (1 + 0.20 * frz);
    const perm = Math.max(0, this.lv('ice', '永冻') - 1);
    if (srcKey === 'ice' && e.frozen > 0 && perm > 0) v *= (1 + 0.40 * perm);
    // 火·连击层数增伤（命中前结算）
    if (srcKey === 'fire' && e.comboFire) v *= (1 + 0.10 * e.comboFire.n);
    // 电·过载层数增伤
    if (srcKey === 'electric' && e.overload) v *= (1 + 0.15 * e.overload.n);
    // 圣物·利刃符：全塔伤害 +8%/级
    const g = this.game;
    const m = g.meta;
    const dmgLv = (m && m.relicBonus && m.relicBonus().dmg) || 0;
    if (dmgLv > 0) v *= (1 + 0.08 * dmgLv);
    e.hp -= v;
    e.lastDmgKey = srcKey || e.lastDmgKey;
    if (e.hp <= 0 && !e._dying) {
      e._dying = true;
      this.onKill(e);
    }
  }

  /* ---------- 死亡触发：各塔死亡技能（燃爆/毒爆/霜星/扩散/回收/致死） ---------- */
  onKill(e) {
    const g = this.game;
    // 毒·致死：低血死亡（此处仅为触发记录，实际致死在命中时判断）
    // 按所有激活塔触发死亡技能
    g.run.slotOrder.slice().forEach((key) => {
      if (key === 'fire' && this.has('fire', '燃爆') && this.hasDot(e, 'burn')) {
        const l = this.lv('fire', '燃爆');
        this.explode(e.x, e.y, 80 * (1 + 0.4 * (l - 1)), this.shotDmg('fire') * 1.2 * (1 + 0.5 * (l - 1)), 'fire');
      }
      if (key === 'poison' && this.has('poison', '毒爆') && this.hasDot(e, 'poison')) {
        const l = this.lv('poison', '毒爆');
        this.explode(e.x, e.y, 80 * (1 + 0.4 * (l - 1)), this.shotDmg('poison') * 0.8 * (1 + 0.5 * (l - 1)), 'poison');
      }
      if (key === 'ice' && this.has('ice', '霜星') && e.frozen > 0) {
        const l = this.lv('ice', '霜星');
        const r = 60 * (1 + 0.3 * (l - 1));
        this.enemies().forEach((o) => {
          if (o === e || o.hp <= 0) return;
          if (Math.hypot(o.x - e.x, o.y - e.y) <= r && Math.random() < 0.5 + 0.2 * (l - 1)) {
            o.frozen = Math.max(o.frozen || 0, 1.0);
          }
        });
        // 霜星视觉：冰蓝大环 + 冰晶粒子
        this.fxRing(e.x, e.y, '#7fd4ff', r, 0.5, 5);
        this.fxParticle(e.x, e.y, '#b8e6ff', 14, 80, 0.55, 150, 5);
        this.fxFlash(e.x, e.y, '#7fd4ff');
      }
      if (key === 'poison' && this.has('poison', '扩散') && this.hasDot(e, 'poison')) {
        const l = this.lv('poison', '扩散');
        const n = 1 + 2 * (l - 1);
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0)
          .sort((a, b) => (Math.abs(a.x - e.x) + Math.abs(a.y - e.y)) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)));
        for (let i = 0; i < Math.min(n, cands.length); i++) {
          this.applyPoison(cands[i], this.shotDmg('poison') * 0.2, 'poison');
          this.fxBeam(e.x, e.y, cands[i].x, cands[i].y, '#7ee2a8', 0.3, 3); // 扩散连线
        }
        this.fxRing(e.x, e.y, '#7ee2a8', 70, 0.45, 4);
        this.fxFlash(e.x, e.y, '#52be80');
      }
      if (key === 'boomerang' && this.has('boomerang', '回收')) {
        const l = this.lv('boomerang', '回收');
        this.kills.boomerang = (this.kills.boomerang || 0) + 1;
        // b：击杀恢复防线 1%×lv
        if (l > 1) {
          const maxHp = CONFIG.LINE.hp;
          g.run.lineHp = Math.min(maxHp, g.run.lineHp + maxHp * 0.01 * (l - 1));
        }
      }
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
    if (t.ammo <= 0) return; // v1.12 弹药：三消额外攻击同样消耗弹药（无弹药不触发）
    t.ammo -= 1;
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
    // 回旋镖·回收：击杀后冷却缩短（本次攻击间隔 ×0.7×(lv-1)）
    if (key === 'boomerang' && this.has('boomerang', '回收')) {
      const rc = (this.kills.boomerang || 0);
      if (rc > 0) {
        const l = this.lv('boomerang', '回收');
        this.kills.boomerang -= 1;
        iv *= Math.max(0.4, 1 - 0.30 * (l - 1));
      }
    }
    // 回旋镖·接镖机制：镖未飞回前不投掷下一个（也不累计计时）；刚接回 → 立即投下一个
    if (key === 'boomerang') {
      const flying = this.shots.some((s) => s.sweep && s.key === key);
      if (flying) return;
      if (this.bWait[key]) {
        this.bWait[key] = false;
        this.attackOnce(key);
        return;
      }
    }
    this.atkTimers[key] = (this.atkTimers[key] || 0) + dt;
    // 电·充能：命中层数也提供攻速（interval 已算）
    while (this.atkTimers[key] >= iv) {
      this.atkTimers[key] -= iv;
      this.attackOnce(key);
    }
  }

  /** 选择攻击目标：默认射程内 y 最大（最靠城墙）；火·射程 b 分支优先最远敌人 */
  pickTarget(key) {
    const r = this.range(key);
    const sy = this.ly().slotY + this.ly().slotSize / 2;
    const preferFar = this.has('fire', '射程');
    let best = null;
    this.enemies().forEach((e) => {
      if (e.hp <= 0) return;
      const dist = Math.abs(sy - e.y);
      if (dist > r) return;
      if (!best) { best = e; return; }
      if (preferFar ? (e.y < best.y) : (e.y > best.y)) best = e;
    });
    return best;
  }

  /** 单塔一次攻击：选目标 → 发弹道（表现层） + 登记命中回调 */
  attackOnce(key) {
    const g = this.game;
    // v1.12 弹药：塔需弹药才能攻击（无弹药停火）
    const ammoT = this.tower(key);
    if (ammoT && ammoT.ammo <= 0) return;
    const target = this.pickTarget(key);
    if (!target) {
      // 回旋镖：无目标可投时复位等待标记，避免接镖流程空转
      if (key === 'boomerang') this.bWait[key] = false;
      return;
    }
    if (ammoT) ammoT.ammo -= 1;
    const cfg = CONFIG.TOWERS[key];
    const ly = this.ly();
    const rowW = 4 * ly.slotSize + 3 * ly.slotGap;
    const startX = (750 - rowW) / 2;
    const slotW = ly.slotSize + ly.slotGap;
    const idx = g.run.slotOrder.indexOf(key);
    if (idx < 0) return;
    const sx = startX + idx * slotW + ly.slotSize / 2;
    const sy = ly.slotY + ly.slotSize / 2;
    const tint = { fire: '#e74c3c', ice: '#5dade2', poison: '#52be80', electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d' }[key] || '#ffd24a';
    const dur = cfg.shot.dur;
    const dmg = this.shotDmg(key);
    // 炮·炮台座 b：概率双发
    const duel = key === 'cannon' && Math.random() < 0.10 * Math.max(0, this.lv('cannon', '炮台座') - 1);
    // 电·充能：攻击次数累计
    const chargeLv = this.lv('electric', '充能');
    if (key === 'electric' && chargeLv > 0) {
      const t = this.tower('electric');
      t._chargeLayers = Math.min(5 * chargeLv, (t._chargeLayers || 0) + 1);
    }
    // 弹道（视觉）+ 命中（逻辑）
    // v1.5：fx 携带 target 引用，直线/闪电弹道末端实时跟随目标移动
    const baseShot = { type: 'shot', kind: cfg.shot.kind, color: tint, x: sx, y: sy, tx: target.x, ty: target.y, t: 0, dur, key, target };
    g.fx.push(baseShot);
    g.playSfx('shot', 0.25);
    if (key === 'boomerang') {
      // 回旋镖 v1.7：弧线飞出再飞回（弧高加大），沿途扫过所有敌人（不锁定单体）；投出后标记等待接回
      // v1.10：落点计算怪物前行提前量——镖飞行期间怪物继续向城墙行走，瞄准其预测位置而非当前位置；
      //        多镖技能：每次多投 1 枚（单镖伤害下降）；巨镖技能：镖体/吸附半径放大
      this.bWait[key] = true;
      const fly = this.lv('boomerang', '飞距');
      const multi = this.lv('boomerang', '多镖');
      const large = this.lv('boomerang', '巨镖');
      // 怪物只沿 +y 走向城墙（main.moveEnemy），预测位移 = speed × 减速系数 × 到达弧顶时间（dur×0.53）
      const slowMult = (target.slow && target.slow.ttl > 0) ? target.slow.mult : 1;
      const wallY = (g.ly && g.ly.wallY) ? g.ly.wallY - 10 : 957;
      const aimY = Math.min(target.y + target.speed * slowMult * dur * 0.53, wallY);
      const n = 1 + multi;
      const perDmg = dmg * (1 - 0.15 * multi);   // 多镖：单镖伤害下降，总数上升
      const maxD = CONFIG.TOWERS.boomerang.range * (1 + 0.30 * Math.max(0, fly - 1));
      // 移除通用视觉弹道（baseShot），按 n 枚重建（各带微偏角与巨镖放大）
      const bidx = g.fx.indexOf(baseShot);
      if (bidx >= 0) g.fx.splice(bidx, 1);
      for (let i = 0; i < n; i++) {
        const off = (n > 1) ? (i - (n - 1) / 2) * 0.07 : 0;   // 多镖扇形微偏角
        const dx = target.x - sx, dy = aimY - sy;
        const dist = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, maxD / dist);
        const ex0 = sx + dx * k, ey0 = sy + dy * k;
        const cos = Math.cos(off), sin = Math.sin(off);
        const rx = ex0 - sx, ry = ey0 - sy;
        const ex = sx + rx * cos - ry * sin;
        const ey = sy + rx * sin + ry * cos;
        this.shots.push({ key, dmg: perDmg, t: 0, dur, sx, sy, tx: ex, ty: ey, sweep: true, hitIds: {}, large });
        g.fx.push({ type: 'shot', kind: 'arc', color: tint, x: sx, y: sy, tx: ex, ty: ey, t: 0, dur, key, large });
      }
    } else {
      this.shots.push({ key, target, dmg, t: 0, dur, sx, sy });
    }
    if (duel) {
      // 第二发（更短弹道）
      g.fx.push({ ...baseShot, t: 0, dur: dur * 0.75 });
      this.shots.push({ key, target, dmg, t: 0, dur: dur * 0.75, sx, sy });
    }
  }

  /* ---------- 弹道命中结算 ---------- */
  resolveShot(s) {
    const g = this.game;
    const e = s.target;
    if (!e || e.hp <= 0 || !g.enemies.includes(e)) return; // 目标已死/消失 → 落空
    this.hit(s.key, e, s.dmg);
  }

  /** 回旋镖轨迹点（v1.9）：椭圆大弧——镖从塔出发，划弧越过投掷方向最远点后继续绕回塔（非原路径折返） */
  sweepPos(s, p) {
    const dx = s.tx - s.sx, dy = s.ty - s.sy;
    const dist = Math.hypot(dx, dy) || 1;
    const cxn = dx / dist, cyn = dy / dist;          // 投掷方向单位向量
    const arcH = 160;                                 // 椭圆短半轴（弧高，垂直投掷方向）
    const a = dist / 2 + 20;                          // 长半轴（沿投掷方向，保证越过怪物）
    const cx = s.sx + cxn * (dist / 2);               // 椭圆中心（塔与怪物中点）
    const cy = s.sy + cyn * (dist / 2);
    const total = Math.PI * 1.9;                      // 342°：从塔端绕 0.95 圈回塔
    const ang = Math.PI + total * p;                  // p=0 在塔端（π），p≈0.53 越过怪物最远点，p=1 回到塔
    const cs = Math.cos(ang), sn = Math.sin(ang);
    return {
      x: cx + a * cs * cxn - arcH * sn * cyn,
      y: cy + a * cs * cyn + arcH * sn * cxn,
    };
  }

  /** 回旋镖沿途伤害（v1.9）：椭圆大弧扫过路径上的所有敌人，每敌单镖最多命中一次 */
  sweepDamage(s) {
    const g = this.game;
    const p = Math.min(1, s.t / s.dur);
    const pos = this.sweepPos(s, p);
    const bx = pos.x, by = pos.y;
    const orbit = this.lv('boomerang', '范围回旋');
    const large = s.large || 0;   // v1.10 巨镖：吸附半径放大
    const r = 42 * (orbit > 0 ? 1 + 0.30 * (orbit - 1) : 1) * (1 + 0.30 * large);
    for (const e of g.enemies) {
      if (e.hp <= 0 || s.hitIds[e.id]) continue;
      if (Math.hypot(e.x - bx, e.y - by) <= r) {
        s.hitIds[e.id] = true;
        this.damage(e, s.dmg, 'boomerang');
      }
    }
  }

  /* ---------- 六塔命中行为 ---------- */
  hit(key, e, dmg) {
    const g = this.game;
    // 电磁场：任意塔命中概率触发微型连锁（电·电磁场）
    const em = this.lv('electric', '电磁场');
    if (em > 0 && Math.random() < 0.10 + 0.10 * (em - 1)) {
      const near = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.x - e.x) < 110 && Math.abs(o.y - e.y) < 110);
      if (near.length) {
        this.damage(near[Math.floor(Math.random() * near.length)], this.shotDmg('electric') * 0.5 * (1 + 0.3 * (em - 1)), 'electric');
        this.fxFlash(e.x, e.y, '#f4d03f');
      }
    }

    if (key === 'fire') this.hitFire(e, dmg);
    else if (key === 'ice') this.hitIce(e, dmg);
    else if (key === 'poison') this.hitPoison(e, dmg);
    else if (key === 'electric') this.hitElectric(e, dmg);
    else if (key === 'boomerang') this.hitBoomerang(e, dmg);
    else if (key === 'cannon') this.hitCannon(e, dmg);

    // 命中计数（电·充能/回收）
    e.hitCount++;
    // 火·攻速爆发 b：命中回血 1%×lv
    const speedLv = this.lv('fire', '攻速爆发');
    if (key === 'fire' && speedLv > 0) {
      g.run.lineHp = Math.min(CONFIG.LINE.hp, g.run.lineHp + CONFIG.LINE.hp * 0.01 * speedLv);
    }
    // 回旋镖·攻速 b：命中回能（下次攻击提前）
    const bowSpeed = this.lv('boomerang', '攻速');
    if (key === 'boomerang' && bowSpeed > 0 && this.atkTimers.boomerang !== undefined) {
      this.atkTimers.boomerang = Math.max(0, this.atkTimers.boomerang - this.interval('boomerang') * 0.01 * bowSpeed);
    }
    // 命中特效：按塔类型爆发专属粒子（直接伤害的视觉反馈）
    const HIT_FX = { fire: '#ff7043', ice: '#7fd4ff', poison: '#7ee2a8', electric: '#f4d03f', boomerang: '#c39bd3', cannon: '#d89e63' };
    this.fxParticle(e.x, e.y, HIT_FX[key] || '#ffffff', 5, 40, 0.35, 120, 5);
    this.fxFlash(e.x, e.y, '#ffffff');
  }

  /* ============ 火塔 ============ */
  hitFire(e, dmg) {
    // 先挂点燃（保证击杀瞬间 DoT 已在，燃爆/灼烧层数可触发），再结算主伤害
    const ignite = this.lv('fire', '点燃');
    if (ignite > 0) this.applyBurn(e, dmg, 'fire');
    // 主目标伤害（连击层数在 damage 内应用）
    this.damage(e, dmg, 'fire');
    // 连击：叠层
    const combo = this.lv('fire', '连击');
    if (combo > 0) {
      const cap = 2 + 2 * (combo - 1);
      if (!e.comboFire) e.comboFire = { n: 0, ttl: 2 };
      e.comboFire.n = Math.min(cap, e.comboFire.n + 1);
      e.comboFire.ttl = 2;
    }
    // 溅射
    const spl = this.lv('fire', '溅射');
    if (spl > 0) {
      const r = 55 * (1 + 0.3 * (spl - 1));
      const sDmg = dmg * 0.5 * (1 + 0.4 * (spl - 1));
      this.enemies().forEach((o) => {
        if (o === e || o.hp <= 0) return;
        if (Math.hypot(o.x - e.x, o.y - e.y) <= r) this.damage(o, sDmg, 'fire');
      });
      // 溅射视觉：橙色扩散环 + 火花
      this.fxRing(e.x, e.y, '#ff7043', r, 0.35, 4);
      this.fxParticle(e.x, e.y, '#ffab40', 8, r, 0.45, 150, 6);
    }
  }

  applyBurn(e, dmg, src) {
    const l = this.lv('fire', '点燃');
    const stackLv = this.lv('fire', '灼烧层数');
    const maxStack = 1 + 2 * Math.max(0, stackLv - 1);
    let dot = e.dots.find((d) => d.type === 'burn');
    const dps = dmg * 0.20 * (1 + 0.5 * (l - 1));
    const ttl = 3 * (1 + 0.5 * (l - 1));
    if (!dot) {
      e.dots.push({ type: 'burn', dps, ttl, stack: 1, maxStack, tickT: 0, src });
      dot = e.dots[e.dots.length - 1];
    } else {
      dot.stack = Math.min(dot.maxStack || maxStack, dot.stack + 1);
      dot.dps = dps * dot.stack;
      dot.ttl = ttl;
    }
    // 灼烧层数满层 → 小爆炸
    if (stackLv > 1 && dot.stack >= maxStack) {
      dot.stack = 1;
      this.explode(e.x, e.y, 60, dmg * 0.6, 'fire');
    }
  }

  /* ============ 冰塔 ============ */
  hitIce(e, dmg) {
    // 永冻 b：冰塔对冰冻目标增伤在 damage 内处理
    this.damage(e, dmg, 'ice');
    // 减速场：命中减速 + 小范围
    const slow = this.lv('ice', '减速场');
    if (slow > 0) {
      const mult = 0.30 * (1 + 0.15 * (slow - 1));
      const r = 60 * (1 + 0.3 * (slow - 1));
      this.applySlow(e, mult, 1.5);
      this.enemies().forEach((o) => {
        if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= r) this.applySlow(o, mult, 1.5);
      });
      // 减速场视觉：浅蓝冰雾粒子
      this.fxParticle(e.x, e.y, '#a9d6f5', 6, 50, 0.5, 80, 5);
    }
    // 冰冻
    const frzLv = this.lv('ice', '冰冻');
    if (frzLv > 0) {
      const prob = 0.20 + 0.15 * (frzLv - 1);
      if (Math.random() < prob) {
        e.frozen = Math.max(e.frozen || 0, 1 + 0.5 * (frzLv - 1));
        // 冰冻视觉：冰蓝扩散环 + 冰晶粒子
        this.fxRing(e.x, e.y, '#7fd4ff', 46, 0.4, 4);
        this.fxParticle(e.x, e.y, '#b8e6ff', 10, 60, 0.5, 130, 5);
      }
    }
    // 全塔冻结率（冰·冻结率）：任意命中概率冻结
    const frzRate = this.lv('ice', '冻结率');
    if (frzRate > 0 && Math.random() < 0.15 * frzRate) e.frozen = Math.max(e.frozen || 0, 1);
    // 永冻 a：冰冻不随时间解除（命中刷新）
    if (this.has('ice', '永冻') && e.frozen > 0) e.frozen = Math.max(e.frozen, 1.5);
    // 冰锥穿透
    const pierce = this.lv('ice', '冰锥穿透');
    if (pierce > 0) {
      const n = 2 * pierce;
      const pDmg = dmg * (1 + 0.3 * (pierce - 1));
      const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.y - e.y) < 50 && Math.abs(o.x - e.x) < 70)
        .sort((a, b) => b.y - a.y);
      for (let i = 0; i < Math.min(n, cands.length); i++) {
        this.damage(cands[i], pDmg, 'ice');
        this.applySlow(cands[i], 0.2, 1);
      }
    }
  }

  applySlow(e, mult, ttl) {
    if (!e.slow || e.slow.ttl <= 0) e.slow = { mult: 1, ttl };
    else e.slow.ttl = Math.max(e.slow.ttl, ttl);
    e.slow.mult = 1 - mult;
  }

  /* ============ 毒塔 ============ */
  hitPoison(e, dmg) {
    // 先挂中毒/腐蚀（保证击杀瞬间 DoT 已在，毒爆/扩散可触发），再结算主伤害
    const toxic = this.lv('poison', '剧毒');
    if (toxic > 0) this.applyPoison(e, dmg, 'poison');
    const cor = this.lv('poison', '腐蚀');
    if (cor > 0) {
      if (!e.corrode || e.corrode.ttl <= 0) e.corrode = { mult: 1, ttl: 2 + 2 * (cor - 1) };
      else { e.corrode.mult = 1; e.corrode.ttl = Math.max(e.corrode.ttl, 2 + 2 * (cor - 1)); }
      e.corrode.mult = 1 + 0.2 * cor;
    }
    this.damage(e, dmg, 'poison');
    // 中毒视觉：绿色毒泡（上毒瞬间）
    if (toxic > 0) this.fxParticle(e.x, e.y, '#7ee2a8', 6, 44, 0.45, 100, 5);
    // 致死：中毒目标低血直接死亡
    const lethal = this.lv('poison', '致死');
    if (lethal > 0 && this.hasDot(e, 'poison')) {
      const th = 0.15 + 0.10 * (lethal - 1);
      if (e.hp < th * e.maxHp) {
        if (e.isBoss) this.damage(e, e.maxHp * 0.05, 'poison'); // Boss 限伤
        else this.damage(e, e.hp, 'poison');
      }
    }
  }

  applyPoison(e, dmg, src) {
    const l = this.lv('poison', '剧毒');
    let dot = e.dots.find((d) => d.type === 'poison');
    const dps = dmg * 0.20 * (1 + 0.5 * (l - 1));
    const ttl = 3 * (1 + 0.5 * (l - 1));
    if (!dot) {
      e.dots.push({ type: 'poison', dps, ttl, stack: 1, maxStack: 3, tickT: 0, src });
    } else {
      dot.dps = Math.max(dot.dps, dps);
      dot.ttl = Math.max(dot.ttl, ttl);
    }
  }

  hasDot(e, type) { return !!e.dots.find((d) => d.type === type); }

  /* ============ 电塔 ============ */
  hitElectric(e, dmg) {
    // 主目标伤害（过载层数为上一击累计，连续命中递增）
    this.damage(e, dmg, 'electric');
    // 过载：叠层（下次命中生效）
    const over = this.lv('electric', '过载');
    if (over > 0) {
      const cap = 3 + 3 * (over - 1);
      if (!e.overload) e.overload = { n: 0, ttl: 2 };
      e.overload.n = Math.min(cap, e.overload.n + 1);
      e.overload.ttl = 2;
    }
    // 麻痹
    const para = this.lv('electric', '麻痹');
    if (para > 0 && Math.random() < 0.20 + 0.15 * (para - 1)) {
      e.paralyzed = Math.max(e.paralyzed || 0, 1 + 0.3 * (para - 1));
      // 麻痹视觉：金黄电火花
      this.fxParticle(e.x, e.y, '#f4d03f', 8, 50, 0.4, 140, 5);
    }
    // 连锁弹跳
    const chainLv = Math.max(this.lv('electric', '连锁'), this.lv('electric', '弹跳'));
    if (chainLv > 0) {
      const extra = (this.lv('electric', '连锁') > 0 ? 1 + 2 * Math.max(0, this.lv('electric', '连锁') - 1) : 0)
                  + 2 * this.lv('electric', '弹跳');
      let decay = 0.30 * (1 - 0.2 * Math.max(0, this.lv('electric', '连锁') - 1));
      decay = Math.max(0.10, decay);
      const hitSet = [e];
      let cur = e;
      for (let i = 0; i < extra; i++) {
        const next = this.enemies().filter((o) => o.hp > 0 && !hitSet.includes(o))
          .sort((a, b) => (Math.hypot(a.x - cur.x, a.y - cur.y)) - (Math.hypot(b.x - cur.x, b.y - cur.y)))[0];
        if (!next) break;
        // 连锁视觉：电弧连线（每次弹跳）
        this.fxBeam(cur.x, cur.y, next.x, next.y, '#f4d03f', 0.25, 3.5);
        let cDmg = dmg * (1 - decay);
        // 弹跳 b：保留伤害 +20%×(lv-1)
        cDmg *= (1 + 0.20 * Math.max(0, this.lv('electric', '弹跳') - 1));
        // 协同：冰冻×连锁 → 弹跳到冰冻目标 ×1.5
        if (next.frozen > 0 && this.game.run.effects.synergyDone[1]) cDmg *= 1.5;
        this.damage(next, cDmg, 'electric');
        hitSet.push(next);
        cur = next;
      }
      this.fxRing(e.x, e.y, '#f4d03f', 40 + 12 * chainLv, 0.3, 3);
      this.fxFlash(e.x, e.y, '#f4d03f');
    }
  }

  /* ============ 回旋镖塔 ============ */
  hitBoomerang(e, dmg) {
    // 暴击：概率暴击
    let v = dmg;
    const critLv = this.lv('boomerang', '暴击');
    if (critLv > 0 && Math.random() < 0.15 * critLv) {
      v *= (1.5 + 0.5 * (critLv - 1));
      // 暴击视觉：金色大爆发
      this.fxRing(e.x, e.y, '#ffd24a', 52, 0.4, 4);
      this.fxParticle(e.x, e.y, '#ffd24a', 12, 70, 0.5, 160, 6);
    }
    this.damage(e, v, 'boomerang');
    // 折返增伤：折返段再次命中（减速 20%×(lv-1) 1s）
    const fold = this.lv('boomerang', '折返增伤');
    if (fold > 0) {
      const foldDmg = dmg * 0.5 * (1 + 0.5 * (fold - 1));
      this.damage(e, foldDmg, 'boomerang');
      if (fold > 1) this.applySlow(e, 0.20 * (fold - 1), 1);
    }
    // 双镖：第二目标（合击主目标 +30%×(lv-1)）
    const twin = this.lv('boomerang', '双镖');
    if (twin > 0) {
      const second = this.enemies().filter((o) => o !== e && o.hp > 0)
        .sort((a, b) => (Math.abs(a.x - e.x) + Math.abs(a.y - e.y)) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)))[0];
      if (second) this.damage(second, dmg, 'boomerang');
      else this.damage(e, dmg * 0.30 * (twin - 1), 'boomerang');
    }
    // 范围回旋 b：命中附带小溅射
    const orbit = this.lv('boomerang', '范围回旋');
    if (orbit > 1) {
      this.enemies().forEach((o) => {
        if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 50) this.damage(o, dmg * 0.35, 'boomerang');
      });
    }
    // 穿透
    const pierce = this.lv('boomerang', '穿透');
    if (pierce > 0) {
      const n = pierce;
      const pMult = 1 - 0.10 * Math.max(0, pierce - 1);
      const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.y - e.y) < 50 && Math.abs(o.x - e.x) < 80)
        .sort((a, b) => b.y - a.y);
      for (let i = 0; i < Math.min(n, cands.length); i++) this.damage(cands[i], dmg * pMult, 'boomerang');
    }
  }

  /* ============ 炮塔 ============ */
  hitCannon(e, dmg) {
    // 重击：概率单体高伤
    let v = dmg;
    const heavy = this.lv('cannon', '重击');
    if (heavy > 0 && Math.random() < 0.20 + 0.15 * (heavy - 1)) v *= 1.5 * (1 + 0.5 * (heavy - 1));
    this.damage(e, v, 'cannon');
    // 爆炸范围（基础 45 半径 0.5 伤害；溅射技能增强）
    const splLv = this.lv('cannon', '溅射');
    const r = 45 * (splLv > 0 ? 1 + 0.3 * (splLv - 1) : 1);
    const splDmg = dmg * (splLv > 0 ? 0.6 * (1 + 0.4 * (splLv - 1)) : 0.5);
    // 协同：炮溅射×火溅射 → 爆炸伤害 ×1.5
    let boomMult = 1;
    if (this.game.run.effects.synergyDone[2]) boomMult *= 1.5;
    // 震击：击退 + 减速
    const shock = this.lv('cannon', '震击');
    let knock = 0, slowAfter = false;
    if (shock > 0) {
      knock = 30 * (1 + 0.4 * (shock - 1));
      slowAfter = shock > 1;
    }
    // 引信：延迟爆炸（先 0.3×dmg，延迟后大爆炸）
    const fuse = this.lv('cannon', '引信');
    if (fuse > 0) {
      const delay = Math.max(0.15, 0.5 * (1 - 0.5 * (fuse - 1)));
      this.damage(e, dmg * 0.3, 'cannon');
      this.delayed.push({
        x: e.x, y: e.y, r: r * 1.3, dmg: dmg * (1 + 0.6 * (fuse - 1)) * boomMult,
        delay, t: 0, key: 'cannon', knock, slowAfter,
      });
    } else {
      this.explode(e.x, e.y, r, splDmg * boomMult, 'cannon', knock, slowAfter);
    }
    // 穿透弹
    const pierce = this.lv('cannon', '穿透弹');
    if (pierce > 0) {
      const n = 3 * (pierce - 1);
      const pDmg = dmg * (1 + 0.25 * (pierce - 1));
      const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.y - e.y) < 55 && Math.abs(o.x - e.x) < 75)
        .sort((a, b) => b.y - a.y);
      for (let i = 0; i < Math.min(n, cands.length); i++) this.damage(cands[i], pDmg, 'cannon');
    }
  }

  /** 范围爆炸（含击退/减速）；爆炸颜色按塔类型 */
  explode(x, y, r, dmg, key, knock, slowAfter) {
    const g = this.game;
    // 燃爆×毒爆 协同：双爆炸伤害 +50%
    let mult = 1;
    if (g.run.effects.synergyDone[0] && (key === 'fire' || key === 'poison')) mult *= 1.5;
    const entryY = this.ly().areaY + this.ly().entryH;
    this.enemies().forEach((o) => {
      if (o.hp <= 0) return;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d > r) return;
      this.damage(o, dmg * mult, key);
      if (knock > 0) o.y = Math.max(entryY + 10, o.y - knock * (1 - d / r));
      if (slowAfter) this.applySlow(o, 0.3, 1);
    });
    // 爆炸视觉：按塔类型着色的爆炸 + 冲击环
    const COLOR = { fire: '#ff7043', poison: '#7ee2a8', cannon: '#d89e63', ice: '#7fd4ff', electric: '#f4d03f', boomerang: '#c39bd3' };
    const col = COLOR[key] || '#ff9f43';
    g.fx.push({ type: 'boom', x, y, t: 0, dur: 0.5, color: col });
    this.fxRing(x, y, col, r, 0.4, 3.5);
    this.fxParticle(x, y, col, 6, r, 0.45, 130, 5);
  }

  /* ---------- 周期技 ---------- */
  tickPeriodic(dt) {
    const g = this.game;
    const fireRain = this.lv('fire', '火雨');
    if (fireRain > 0) {
      this.timers.fireRain = (this.timers.fireRain || 0) + dt;
      if (this.timers.fireRain >= 6 * (1 - 0.3 * (fireRain - 1))) {
        this.timers.fireRain = 0;
        const dmg = this.shotDmg('fire') * 0.5 * (1 + 0.4 * (fireRain - 1));
        this.enemies().forEach((e) => {
          if (e.hp <= 0 || Math.random() < 0.7) return;
          this.damage(e, dmg, 'fire');
          this.applyBurn(e, dmg, 'fire');
          // 火雨视觉：落点火焰柱粒子
          this.fxParticle(e.x, e.y, '#ff7043', 10, 40, 0.5, 160, 6);
          this.fxParticle(e.x, e.y, '#ffd24a', 6, 30, 0.4, 120, 4);
          this.fxFlash(e.x, e.y, '#ff9f43');
        });
      }
    }
    const coldWave = this.lv('ice', '寒潮');
    if (coldWave > 0) {
      this.timers.coldWave = (this.timers.coldWave || 0) + dt;
      if (this.timers.coldWave >= 8 * (1 - 0.3 * (coldWave - 1))) {
        this.timers.coldWave = 0;
        const mult = 0.40 * (1 + 0.15 * (coldWave - 1));
        const wallY = this.ly().wallY;
        // 寒潮视觉：全屏冰蓝冲击环
        this.fxRing(this.ly().areaX + this.ly().areaW / 2, wallY - 60, '#7fd4ff', 380, 0.7, 5);
        this.enemies().forEach((e) => {
          if (e.hp > 0) {
            this.applySlow(e, mult, 2);
            this.fxParticle(e.x, e.y - 10, '#b8e6ff', 4, 30, 0.5, 90, 4);
          }
        });
      }
    }
    const arc = this.lv('electric', '电弧');
    if (arc > 0) {
      this.timers.arc = (this.timers.arc || 0) + dt;
      if (this.timers.arc >= 5 * (1 - 0.3 * (arc - 1))) {
        this.timers.arc = 0;
        const dmg = this.shotDmg('electric') * 0.6 * (1 + 0.5 * (arc - 1));
        const targets = this.enemies().filter((e) => e.hp > 0).sort((a, b) => b.y - a.y).slice(0, 5);
        targets.forEach((e) => {
          this.damage(e, dmg, 'electric');
          // 电弧视觉：塔位到目标连线
          this.fxBeam(this.ly().slotY, 375, e.x, e.y, '#f4d03f', 0.3, 3);
          this.fxFlash(e.x, e.y, '#f4d03f');
        });
      }
    }
    const storm = this.lv('electric', '雷暴');
    if (storm > 0) {
      this.timers.storm = (this.timers.storm || 0) + dt;
      if (this.timers.storm >= 10 * (1 - 0.3 * (storm - 1))) {
        this.timers.storm = 0;
        const dmg = this.shotDmg('electric') * 0.8 * (1 + 0.4 * (storm - 1));
        this.enemies().forEach((e) => {
          if (e.hp <= 0 || Math.random() < 0.6) return;
          this.damage(e, dmg, 'electric');
          // 雷暴视觉：随机落雷连线 + 电花
          this.fxBeam(e.x + (Math.random() * 60 - 30), e.y - 220, e.x, e.y, '#f4d03f', 0.35, 4);
          this.fxBeam(e.x + (Math.random() * 60 - 30), e.y - 220, e.x, e.y, '#ffffff', 0.35, 1.5);
          this.fxParticle(e.x, e.y, '#f4d03f', 8, 50, 0.4, 150, 5);
          this.fxFlash(e.x, e.y, '#ffffff');
        });
      }
    }
    const fog = this.lv('poison', '毒雾');
    if (fog > 0) {
      this.timers.fog = (this.timers.fog || 0) + dt;
      if (this.timers.fog >= 8 * (1 - 0.3 * (fog - 1))) {
        this.timers.fog = 0;
        const wallY = this.ly().wallY;
        const dmg = this.shotDmg('poison') * 0.3 * (1 + 0.4 * (fog - 1));
        this.enemies().forEach((e) => {
          if (e.hp <= 0 || e.y < wallY - 150) return;
          this.applyPoison(e, dmg, 'poison');
          // 毒雾视觉：城墙前绿色毒雾粒子
          this.fxParticle(e.x, e.y - 8, '#52be80', 5, 36, 0.6, 70, 5);
        });
        this.fxRing(375, wallY - 60, '#52be80', 350, 0.8, 5);
      }
    }
    const barrage = this.lv('cannon', '弹幕');
    if (barrage > 0) {
      this.timers.barrage = (this.timers.barrage || 0) + dt;
      if (this.timers.barrage >= 10 * (1 - 0.3 * (barrage - 1))) {
        this.timers.barrage = 0;
        const dmg = this.shotDmg('cannon') * 0.7 * (1 + 0.4 * (barrage - 1));
        const targets = this.enemies().filter((e) => e.hp > 0);
        for (let i = 0; i < Math.min(4, targets.length); i++) {
          const t = targets[Math.floor(Math.random() * targets.length)];
          this.explode(t.x, t.y, 60, dmg, 'cannon');
        }
      }
    }
  }

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

  /* ---------- v1.12 全局技能：消耗累计弹药释放（1 次 = chargePerUse 发） ---------- */
  /** 释放全局技能：'shuffle' 打乱棋盘所有方块 / 'refill' 所有塔补充弹药；累计弹药不足返回 false */
  castGlobal(which) {
    const g = this.game;
    if (!g.run.spendAmmo(which)) return false;
    const GS = CONFIG.GLOBAL_SKILL;
    if (which === 'shuffle') {
      // 全局洗牌：打乱当前三消棋盘所有方块（重新生成，无初始三消）
      const b = g.run.board;
      if (b) b.grid = b.genBoard();
      g.anim = null;                       // 清掉进行中交换/消除动画，避免与新棋盘渲染冲突
      g.selected = null; g.pickCell = null;
      this.fxFlash(375, 800, '#ff8c42', 0.5);
      this.fxRing(375, 800, '#ff8c42', 300, 0.5, 8);
      g.toast && g.toast('🔀 全局洗牌', '#ff8c42');
    } else {
      // 弹药补给：所有已解锁塔各 +refillAmmo（封顶 ammoMax）
      let refilled = 0;
      Object.keys(g.run.slotOrder).forEach((_, i) => {
        const tk = g.run.slotOrder[i];
        const tw = g.run.effects.tower(tk);
        if (!tw || tw.level <= 0) return;
        const before = tw.ammo;
        tw.ammo = Math.min(before + GS.refillAmmo, GS.ammoMax);
        refilled += tw.ammo - before;
      });
      this.fxFlash(375, 800, '#7ef0a3', 0.5);
      this.fxRing(375, 800, '#7ef0a3', 300, 0.5, 8);
      g.toast && g.toast(`🔋 弹药补给 +${GS.refillAmmo}`, '#7ef0a3');
      if (refilled > 0) g.toast && g.toast(`全场补给 ${refilled} 发`, '#7ef0a3');
    }
    return true;
  }
}

module.exports = { CombatSystem, initEnemyState };
