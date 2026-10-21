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
 *       电：连锁弹跳 / 麻痹 / 过载 / 电弧 / 雷暴 / 活电 / 充能 / 电磁场
 *       回旋镖：穿透 / 折返增伤 / 飞距 / 攻速 / 回收 / 双镖 / 暴击 / 范围回旋
 *       炮：溅射 / 重击 / 穿透弹 / 炮台座 / 震击 / 引信 / 弹幕 / 阵地加固
 *   - 敌人状态：灼烧/中毒 DoT、冰冻、麻痹、减速、腐蚀、连击/过载层数
 *   - 协同：爆燃×毒爆、冰冻×连锁、炮溅射×火溅射（爆炸/连锁增伤）
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
    this._nextDmg = {};     // 回旋镖·接镖 C 续投：下镖伤害加成（v1.16）
  }

  reset() {
    this.shots = [];
    this.delayed = [];
    this.timers = {};
    this.atkTimers = {};
    this.kills = {};
    this.bWait = {};
    this._nextDmg = {};        // 回旋镖·接镖 C 续投：下镖伤害加成（v1.16）
    this.groundDots = [];      // 火·火柱余烬 / 毒·毒池·毒沼：地面持续区域
    this.frostOrbs = [];       // 冰·冬珠：持续冰霜之球
    this.poisonSticks = [];    // 毒·毒棒：独立攻击的召唤物（v1.15）
    this.mines = [];           // 炮·地雷阵（v1.16）
    this.turrets = [];         // 炮·炮台（v1.16）
    this.storms = [];          // 回旋镖·风暴镖（v1.16）
    this.windTrails = [];      // 回旋镖·风痕（v1.16）
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
    return Math.max(0.15, iv);
  }

  /** 塔当前射程（射程/技能叠加） */
  range(key) {
    const cfg = CONFIG.TOWERS[key];
    return Math.max(60, cfg.range - 50);   // v1.16.21：全塔射程统一缩小 50px（普攻/技能同口径）
  }

  /** 单次攻击伤害：towerDps × 攻击间隔（保持总 DPS 口径） */
  shotDmg(key) {
    const dps = this.game.run.effects.towerDps(key);
    const iv = CONFIG.TOWERS[key].atkInterval;
    return dps * iv;
  }

  /** 毒·毒性强化（v1.16.14）：选择后中毒 DoT 伤害 +10%，A 分支每级再 +10% */
  dotBoost() {
    const n = this.lv('poison', '毒性强化');
    return {
      dmg: n > 0 ? 1.10 + 0.10 * this.branchLv('poison', '毒性强化', 'A') : 1,
      ttl: 1 + 0.25 * this.branchLv('poison', '毒性强化', 'B'),
    };
  }

  /* ---------- 主更新：弹道命中 → 状态推进 → 塔攻击 → 周期技 → 死亡触发 ---------- */
  update(dt) {
    const g = this.game;
    if (!g.run.slotOrder.length) return; // 无塔不战斗

    // 兼容缺字段的敌人（测试/旧数据）：惰性补齐 A1 状态
    g.enemies.forEach((e) => { if (!e.dots) initEnemyState(e); });

    // 1. 飞行弹道推进与命中结算（回旋镖 sweep：沿途扫过伤害；散射 scatter：无目标沿途碰撞；其余：终点单体命中）
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      if (s.orb) {
        // v1.13.18 游走电球（活电扩散）：每帧随机转向漂移，命中 34px 内敌人即结算消失，dur 耗尽消散
        s.ang += (Math.random() - 0.5) * 2.6;
        s.x += Math.cos(s.ang) * s.speed * dt;
        s.y += Math.sin(s.ang) * s.speed * dt;
        const hitE = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - s.x, o.y - s.y) < 34);
        if (hitE) {
          if (s.fx) s.fx.t = s.fx.dur;
          this.shots.splice(i, 1);
          this.damage(hitE, s.dmg, 'electric');
          this.fxFlash(hitE.x, hitE.y, '#f4d03f');
          this.fxParticle(hitE.x, hitE.y, '#f4d03f', 5, 30, 0.3, 120, 4);
        } else if (s.t >= s.dur) {
          this.shots.splice(i, 1);
        }
        continue;
      }
      if (s.scatter) {
        // v1.13.13：无目标散射弹道——沿途真实碰撞，命中即结算并消失；射界尽头（dur 耗尽）未命中也消失
        const hitE = this.scatterCheck(s);
        if (hitE) {
          this.shots.splice(i, 1);
          if (s.onHit) s.onHit(hitE, s.dmg);
        } else if (s.t >= s.dur) {
          this.shots.splice(i, 1);
        }
        continue;
      }
      if (s.t >= s.dur) {
        this.shots.splice(i, 1);
        if (s.sweep) this.sweepDamage(s, dt);
        else this.resolveShot(s);
      } else if (s.sweep) {
        this.sweepDamage(s, dt);
      }
    }
    // 2. 延迟爆炸（炮引信/炮火支援落点）
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t += dt;
      if (d.t >= d.delay) {
        this.delayed.splice(i, 1);
        if (d.fn) { d.fn(this); continue; }   // v1.16.9 自定义延迟回调（冰花第 3 帧末结算）
        this.explode(d.x, d.y, d.r, d.dmg, d.key, d.knock, d.slowAfter);
        // 炮火支援 C 焦土：落点留燃烧地面 2s（每秒 30% 伤害）
        if (d.ember > 0) {
          this.groundDots = this.groundDots || [];
          this.groundDots.push({ x: d.x, y: d.y, r: d.r * 0.6, ttl: 2, dps: this.shotDmg('cannon') * 0.24 * d.ember, key: 'fire' });
        }
      }
    }
    // 3. 敌人状态推进（DoT / 控制 / 层数衰减）
    g.enemies.forEach((e) => this.tickStatus(e, dt));
    // 3.5 地面区域持续效果：火·火柱余烬（直伤）/ 毒·毒池·毒沼（直伤 + 每秒叠毒，v1.15）
    if (this.groundDots && this.groundDots.length) {
      for (let i = this.groundDots.length - 1; i >= 0; i--) {
        const gd = this.groundDots[i];
        gd.ttl -= dt;
        if (gd.ttl <= 0) { this.groundDots.splice(i, 1); continue; }
        this.enemies().forEach((o) => {
          if (o.hp <= 0 || Math.hypot(o.x - gd.x, o.y - gd.y) > gd.r) return;
          if (gd.dps) this.damage(o, gd.dps * dt, gd.key || 'fire');
          if (gd.key === 'poison' && gd.stackPerSec) {
            gd._t = (gd._t || 0) + dt;
            while (gd._t >= 1) {
              gd._t -= 1;
              this.applyPoison(o, this.shotDmg('poison'), 'poison', gd.stackPerSec);
            }
          }
        });
        if (gd.key === 'poison') {
          if (Math.random() < 0.3) {
            this.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#52be80', 2, 18, 0.5, 60, 4);
          }
        } else if (Math.random() < 0.3) {
          this.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#ff7043', 2, 20, 0.4, 60, 4);
        }
      }
    }
    // 3.6 毒·毒棒推进（v1.15）：独立攻击周边 200px 敌人（直伤 + 叠毒），持续结束消失
    if (this.poisonSticks && this.poisonSticks.length) {
      for (let i = this.poisonSticks.length - 1; i >= 0; i--) {
        const st = this.poisonSticks[i];
        st.ttl -= dt;
        if (st.ttl <= 0) { this.poisonSticks.splice(i, 1); continue; }
        st.atkT += dt;
        if (st.atkT >= st.atkI) {
          st.atkT -= st.atkI;
          const cands = this.enemies().filter((o) => o.hp > 0 && Math.hypot(o.x - st.x, o.y - st.y) <= st.r)
            .sort((a, b) => b.y - a.y);   // 最靠城墙优先
          const picks = cands.slice(0, st.targets);
          picks.forEach((o) => {
            this.damage(o, st.dmg, 'poison');
            this.applyPoison(o, this.shotDmg('poison'), 'poison', 1);
            // 毒棒攻击弹道（v1.16.1）：绿色毒刺从毒棒飞射目标（0.25s），命中溅射毒液
            g.fx.push({ type: 'thorn', x: st.x, y: st.y, tx: o.x, ty: o.y, t: 0, dur: 0.25, color: '#2e7d32' });
            this.fxParticle(o.x, o.y, '#2e7d32', 4, 30, 0.3, 90, 4);
            this.fxParticle(o.x, o.y, '#6fcf97', 2, 20, 0.25, 70, 3);
          });
        }
      }
    }
    // 3.7 炮·地雷（v1.16）：敌人踩中（接触半径 60）引爆，C 连爆击退且 50% 连环引爆相邻地雷
    if (this.mines && this.mines.length) {
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const m = this.mines[i];
        m.ttl -= dt;
        m.armed -= dt;
        if (m.ttl <= 0) { this.mines.splice(i, 1); continue; }
        if (m.armed > 0) continue;
        const hit = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) <= 60);
        if (!hit) continue;
        this.mines.splice(i, 1);
        const knock = m.chain > 0 ? 70 : 0;
        this.explode(m.x, m.y, m.r, m.dmg, 'cannon', knock, false);
        if (m.chain > 0) {
          // C 连爆：爆炸击退 + 50% 概率连环引爆相邻地雷（直接爆炸）
          this.enemies().forEach((o) => {
            if (o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) <= m.r + 40 && Math.random() < 0.5) this.applySlow(o, 0.3, 1);
          });
          const chainTargets = this.mines.filter((m2) => Math.hypot(m2.x - m.x, m2.y - m.y) <= 150 && Math.random() < 0.5);
          chainTargets.forEach((m2) => { const idx = this.mines.indexOf(m2); if (idx >= 0) this.mines.splice(idx, 1); });
          chainTargets.forEach((m2) => this.explode(m2.x, m2.y, m2.r, m2.dmg, 'cannon', 0, false));
        }
      }
    }
    // 3.8 炮·炮台（v1.16）：独立炮击最靠墙敌人（直伤+爆炸），持续结束消失
    if (this.turrets && this.turrets.length) {
      for (let i = this.turrets.length - 1; i >= 0; i--) {
        const tu = this.turrets[i];
        tu.ttl -= dt;
        if (tu.ttl <= 0) { this.turrets.splice(i, 1); continue; }
        tu.atkT += dt;
        if (tu.atkT >= tu.atkI) {
          tu.atkT -= tu.atkI;
          const tgt = this.enemies().filter((o) => o.hp > 0).sort((a, b) => b.y - a.y)[0];
          if (tgt) {
            this.damage(tgt, tu.dmg, 'cannon');
            this.explode(tgt.x, tgt.y, tu.r, tu.dmg * 0.48, 'cannon', 0, false);
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
    // 3.9 回旋镖·风暴镖（v1.16）：持续伤害圈（每秒 dps），C 卷风减速 20%
    if (this.storms && this.storms.length) {
      for (let i = this.storms.length - 1; i >= 0; i--) {
        const st = this.storms[i];
        st.ttl -= dt;
        if (st.ttl <= 0) { this.storms.splice(i, 1); continue; }
        this.enemies().forEach((o) => {
          if (o.hp <= 0 || Math.hypot(o.x - st.x, o.y - st.y) > st.r) return;
          this.damage(o, st.dps * dt, 'boomerang');
          if (st.slow) this.applySlow(o, 0.20, 0.2);
        });
        if (Math.random() < 0.6) {
          const ang = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * st.r;
          this.fxParticle(st.x + Math.cos(ang) * rr, st.y + Math.sin(ang) * rr, '#c39bd3', 2, 20, 0.4, 90, 4);
        }
      }
    }
    // 3.10 回旋镖·风痕（v1.16）：路径伤害区，C 卷痕减速 15%
    if (this.windTrails && this.windTrails.length) {
      for (let i = this.windTrails.length - 1; i >= 0; i--) {
        const w = this.windTrails[i];
        w.ttl -= dt;
        if (w.ttl <= 0) { this.windTrails.splice(i, 1); continue; }
        this.enemies().forEach((o) => {
          if (o.hp <= 0 || Math.hypot(o.x - w.x, o.y - w.y) > w.r) return;
          this.damage(o, w.dps * dt, 'boomerang');
          if (w.slow) this.applySlow(o, w.slow, 0.2);
        });
      }
    }
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
        if (d.ttl <= 0) {
          // 火·点燃 C 余烬：灼烧结束瞬间「余烬爆发」= 期间总灼烧伤害的 30% 立即结算
          if (d.type === 'burn' && this.branchLv('fire', '点燃', 'C') > 0 && d.totalDealt > 0) {
            this.damage(e, d.totalDealt * 0.30, 'fire');
            this.fxFlash(e.x, e.y, '#ff7043', 0.3);
            this.fxRing(e.x, e.y, '#ff7043', 36, 0.3, 3);
          }
          e.dots.splice(i, 1); continue;
        }
        d.tickT -= dt;
        if (d.tickT <= 0) {
          // v1.15 毒塔：中毒跳频 = 剧毒 C（每级 +1Hz，基础 1Hz）；burn 等旧 DoT 保持 2Hz
          const tickI = d.freq ? 1 / d.freq : 0.5;
          d.tickT += tickI;
          // 毒（层数×每层 dps）走 stackDps；灼烧等旧 DoT 走 dps×全局强化
          const dealt = d.stackDps ? (d.stack || 1) * d.stackDps * tickI : d.dps * boost.dmg * tickI;
          this.damage(e, dealt, d.src);
          d.totalDealt = (d.totalDealt || 0) + dealt;
          // 火·爆燃 C 灼裂：灼烧每跳 15%/30%/50% 概率爆炸一次（30% 范围伤害）
          const burstLv = this.branchLv('fire', '爆燃', 'C');
          if (d.type === 'burn' && burstLv > 0 && Math.random() < [0, 0.15, 0.30, 0.50][burstLv]) {
            this.explode(e.x, e.y, 50, this.shotDmg('fire') * 0.30, 'fire');
          }
          // 持续伤特效：灼烧=火焰粒子（上飘，数量随叠层）、中毒=毒泡（小概率避免过密）
          if (Math.random() < 0.7) {
            if (d.type === 'burn') {
              const fireN = 3 + Math.min(4, d.stack || 1);
              for (let k = 0; k < fireN; k++) {
                this.fxParticle(e.x + (Math.random() * 20 - 10), e.y - 12 - Math.random() * 8, Math.random() < 0.4 ? '#ffd24a' : '#ff7043', 1, 28, 0.45, 100, 5);
              }
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
    if (e.overload) { e.overload.ttl -= dt; if (e.overload.ttl <= 0) e.overload = null; }
    // 流血（v1.16.12，回旋镖普攻）：随移动距离结算——每累计移动 100px 跳一次伤害
    if (e.bleedT > 0) {
      e.bleedT -= dt;
      e._bleedDist = (e._bleedDist || 0) + Math.max(0, e.y - (e._bleedLastY != null ? e._bleedLastY : e.y));
      e._bleedLastY = e.y;
      if (e._bleedDist >= 100) {
        e._bleedDist -= 100;
        this.damage(e, e._bleedDmg || 0, 'boomerang');
        this.fxParticle(e.x, e.y - 10, '#c0392b', 4, 20, 0.35, 80, 5);
      }
      if (e.bleedT <= 0) { e.bleedT = 0; e._bleedDist = 0; }
    }
    // 瘟疫传染（毒·瘟疫 v1.15）：中毒敌人减速 20% + 周期判定传染（A 判定 1.7/1.5/1.3s；B 范围 +25px/级；C 概率 +30pp/级 cap 100%）
    const plague = this.lv('poison', '瘟疫');
    if (plague > 0 && this.hasDot(e, 'poison')) {
      // 减速：中毒敌人移速 ×0.8（与冰减速并存取更慢）
      const s = e.slow;
      const mult = s && s.ttl > 0 ? Math.min(s.mult, 0.8) : 0.8;
      e.slow = { mult, ttl: 1 };
      e._plagueT = (e._plagueT || 0) + dt;
      const ivP = [0, 2, 1.7, 1.5, 1.3][this.branchLv('poison', '瘟疫', 'A')] || 2;
      if (e._plagueT >= ivP) {
        e._plagueT -= ivP;
        const prob = Math.min(1, 0.30 + 0.30 * this.branchLv('poison', '瘟疫', 'C'));
        if (Math.random() < prob) {
          const rP = 50 + 25 * this.branchLv('poison', '瘟疫', 'B');
          const near = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= rP);
          if (near.length) {
            const pick = near[Math.floor(Math.random() * near.length)];
            this.applyPoison(pick, this.shotDmg('poison'), 'poison', 1);
            this.fxBeam(e.x, e.y, pick.x, pick.y, '#45b39d', 0.35, 2.5);
          }
        }
      }
    }
    // 毒·毒藤缠绕（v1.15）：定身期间每秒叠毒
    if (e._vineT > 0) {
      e._vineT -= dt;
      e._vineAcc = (e._vineAcc || 0) + dt;
      if (e._vineAcc >= 1) {
        e._vineAcc -= 1;
        this.applyPoison(e, this.shotDmg('poison'), 'poison', 1);
        this.fxParticle(e.x, e.y - 10, '#7dcea0', 3, 24, 0.4, 80, 4);
      }
    }
    // 毒·瘴气环境（v1.15）：塔口常驻光环——范围内敌人每秒叠毒 + 命中率下降标记；C 环内中毒敌攻击降低
    const miasma = this.lv('poison', '瘴气环境');
    if (miasma > 0) {
      const mr = 220 * (1 + 0.4 * this.branchLv('poison', '瘴气环境', 'A'));
      const mus = this.towerMuzzle('poison');
      const inM = Math.hypot(e.x - mus.x, e.y - mus.y) <= mr;
      e._miasma = inM;
      if (inM) {
        e._miaT = (e._miaT || 0) + dt;
        if (e._miaT >= 1) {
          e._miaT -= 1;
          this.applyPoison(e, this.shotDmg('poison') * (1 + 0.3 * this.branchLv('poison', '瘴气环境', 'B')), 'poison', 1);
        }
        if (Math.random() < 0.4) this.fxParticle(e.x, e.y - 6, '#7ee2a8', 1, 16, 0.6, 50, 4);
      }
      const cLv = this.branchLv('poison', '瘴气环境', 'C');
      e._miasmaAtkMult = (cLv > 0 && inM && this.hasDot(e, 'poison')) ? (1 - [0, 0.2, 0.35, 0.5][cLv]) : 1;
    } else {
      e._miasma = false;
      e._miasmaAtkMult = 1;
    }
  }

  /* ---------- 伤害结算 ---------- */
  damage(e, dmg, srcKey) {
    if (e.hp <= 0) return;
    let v = dmg;
    // v1.16.11 怪物减伤（armor）：Tier 越高减伤越多，精英/Boss 额外叠加（上限 85%）
    if (e.armor > 0) v *= (1 - Math.min(0.85, e.armor));
    // 腐蚀增伤
    if (e.corrode) v *= e.corrode.mult;
    // （寒霜 C 原「易伤」已改「深寒：减速幅度」，v1.16.21 移除易伤乘区）
    // 火·灼烧 C 真火：每层灼烧使目标受到的伤害 +10%（全来源，按层数）
    const trueLv = this.branchLv('fire', '灼烧', 'C');
    if (trueLv > 0) {
      const bd = e.dots.find((d) => d.type === 'burn');
      if (bd) v *= (1 + 0.10 * bd.stack);
    }
    // 电·过载 B 强载：每层增伤 +15%/级（未点 B 分支不增伤；v1.16.20 接入分支）
    const ovB = this.branchLv('electric', '过载', 'B');
    if (srcKey === 'electric' && e.overload && ovB > 0) v *= (1 + 0.15 * ovB * e.overload.n);
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

  /* ---------- 死亡触发：各塔死亡技能（爆燃/毒爆/霜星/扩散/回收/致死） ---------- */
  onKill(e) {
    const g = this.game;
    // 毒·致死：低血死亡（此处仅为触发记录，实际致死在命中时判断）
    // 按所有激活塔触发死亡技能
    g.run.slotOrder.slice().forEach((key) => {
      if (key === 'fire' && this.has('fire', '爆燃') && this.hasDot(e, 'burn')) {
        // v1.13：基础 40% 概率引爆；v1.16.21 A 爆裂 +30/60/90%、B 扩张 +20/40/60%
        if (Math.random() < 0.40) {
          const aLv = this.branchLv('fire', '爆燃', 'A');
          const bLv = this.branchLv('fire', '爆燃', 'B');
          this.explode(e.x, e.y, 80 * (1 + [0, 0.2, 0.4, 0.6][bLv]), this.shotDmg('fire') * 0.96 * (1 + [0, 0.3, 0.6, 0.9][aLv]), 'fire');
        }
      }
      if (key === 'poison' && this.has('poison', '毒爆') && this.hasDot(e, 'poison')) {
        // v1.15 毒爆重做：中毒目标死亡向周边 200px 传播 1 层（A 目标 +1/级；B 附带死亡时层数；C 留毒沼 4s 每秒 +1 层）
        const n = 5 + this.branchLv('poison', '毒爆', 'A');
        const r = 200;
        const layers = this.branchLv('poison', '毒爆', 'B') > 0 ? this.poisonStack(e) : 1;
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= r)
          .sort((a, b) => (Math.abs(a.x - e.x) + Math.abs(a.y - e.y)) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)));
        const picks = cands.slice(0, n);
        picks.forEach((o) => {
          this.applyPoison(o, this.shotDmg('poison'), 'poison', layers);
          this.fxBeam(e.x, e.y, o.x, o.y, '#7ee2a8', 0.3, 3);
        });
        this.fxRing(e.x, e.y, '#52be80', r, 0.5, 5);
        this.fxFlash(e.x, e.y, '#52be80');
        if (this.branchLv('poison', '毒爆', 'C') > 0) {
          this.groundDots = this.groundDots || [];
          this.groundDots.push({ x: e.x, y: e.y, r, ttl: 4, key: 'poison', dps: 0, stackPerSec: 1 });
        }
      }
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
            this.fxBeam(e.x, e.y, next.x, next.y, '#2ecc71', 1, 4);
            this.fxRing(next.x, next.y, '#7dcea0', 26, 1, 3);
          }
        }
      }
      // 冰·冰冻 C 碎冰（v1.16.21）：击杀冰冻敌人 → 120px 范围爆炸（30%/40%/50%×攻击力，档位式）并减速 30%
      if (key === 'ice' && this.branchLv('ice', '冰冻', 'C') > 0 && e.frozen > 0) {
        const frzC = this.branchLv('ice', '冰冻', 'C');
        this.explode(e.x, e.y, 120, this.shotDmg('ice') * [0, 0.30, 0.40, 0.50][frzC], 'ice', 0, true);
      }
      // （冰·霜星 已改为周期技「冰花」，死亡溅射移除 v1.13.23）
      // 回旋镖·猎手标记 C 猎杀（v1.16）：标记目标死亡向 100px 内 2 个敌人扩散 1 层标记
      if (key === 'boomerang' && this.branchLv('boomerang', '猎手标记', 'C') > 0 && (e._mark || 0) > 0) {
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 100);
        for (let i = 0; i < Math.min(2, cands.length); i++) {
          const pick = cands[i];
          pick._mark = Math.min(3 + 2 * this.branchLv('boomerang', '猎手标记', 'B'), (pick._mark || 0) + 1);
          this.fxBeam(e.x, e.y, pick.x, pick.y, '#d2b4de', 0.4, 2.5);
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
    // 回旋镖·接镖机制：镖未飞回前不投掷下一个（也不累计计时）；刚接回 → 立即投下一个
    // v1.16 接镖 C 续投：接镖立即投掷且下镖伤害 +10%/级
    if (key === 'boomerang') {
      const flying = this.shots.some((s) => s.sweep && s.key === key);
      if (flying) return;
      if (this.bWait[key]) {
        this.bWait[key] = false;
        const cnt = this.branchLv('boomerang', '接镖', 'C');
        if (cnt > 0) this._nextDmg[key] = (this._nextDmg[key] || 0) + 0.10 * cnt;
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

  /** 选择攻击目标：默认射程内 y 最大（最靠城墙） */
  pickTarget(key) {
    const r = this.range(key);
    const sy = this.ly().slotY + this.ly().slotSize / 2;
    let best = null;
    this.enemies().forEach((e) => {
      if (e.hp <= 0) return;
      const dist = Math.abs(sy - e.y);
      if (dist > r) return;
      if (!best) { best = e; return; }
      if (e.y > best.y) best = e;
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
    // v1.16 接镖 B 回能：回旋镖 30% 概率不耗弹药
    const regain = key === 'boomerang' && this.branchLv('boomerang', '接镖', 'B') > 0 && Math.random() < 0.30;
    if (ammoT && !regain) ammoT.ammo -= 1;
    const cfg = CONFIG.TOWERS[key];
    const ly = this.ly();
    const n = g.run.slotOrder.length || 4; // 测试战场支持 6 塔出战；正式战斗 4 塔（口径不变）
    const rowW = n * ly.slotSize + (n - 1) * ly.slotGap;
    const startX = (750 - rowW) / 2;
    const slotW = ly.slotSize + ly.slotGap;
    const idx = g.run.slotOrder.indexOf(key);
    if (idx < 0) return;
    const sx = startX + idx * slotW + ly.slotSize / 2;
    const sy = ly.slotY + ly.slotSize / 2;
    const tint = { fire: '#e74c3c', ice: '#7fd4ff', poison: '#52be80', electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d' }[key] || '#ffd24a';
    const dur = cfg.shot.dur;
    const dmg = this.shotDmg(key);
    // 炮·双管齐射（v1.16）：基础 25% 概率双发，A 齐射 +15pp/级；副炮第二发伤害 +20%/级（B）
    const duelProb = key === 'cannon' ? (0.25 + 0.15 * this.branchLv('cannon', '双管齐射', 'A')) : 0;
    const duel = key === 'cannon' && this.lv('cannon', '双管齐射') > 0 && Math.random() < duelProb;
    // 电·充能：攻击次数累计
    const chargeLv = this.lv('electric', '充能');
    if (key === 'electric' && chargeLv > 0) {
      const t = this.tower('electric');
      t._chargeLayers = Math.min(5 * chargeLv, (t._chargeLayers || 0) + 1);
    }
    // 弹道（视觉）+ 命中（逻辑）
    // v1.5：fx 携带 target 引用，直线/闪电弹道末端实时跟随目标移动
    const baseShot = { type: 'shot', kind: cfg.shot.kind, color: tint, x: sx, y: sy, tx: target.x, ty: target.y, t: 0, dur, key, target };
    if (key === 'fire' && this.lv('fire', '多重火球') > 0) {
      // 多重火球：弹道由 hitFire 自行推送多枚（扇形分离），此处不再推普通弹道避免重叠
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
      // 多镖：每次多投 1 枚（单镖伤害 -15%/级；B 稳镖衰减减半）；风痕：镖路径留痕（C 卷痕减速）
      this.bWait[key] = true;
      const multi = this.lv('boomerang', '多镖');
      const nextBoost = this._nextDmg[key] || 0;   // 接镖 C 续投：下镖伤害 +10%/级
      this._nextDmg[key] = 0;
      // 怪物只沿 +y 走向城墙（main.moveEnemy），预测位移 = speed × 减速系数 × 到达弧顶时间（dur×0.53）
      // v1.16.5 接镖 A 疾飞：镖飞行速度 +20%/级 → 飞行时长缩短、命中与接回更快
      const flyBoost = 1 + 0.20 * this.branchLv('boomerang', '接镖', 'A');
      const bDur = dur / flyBoost;
      const slowMult = (target.slow && target.slow.ttl > 0) ? target.slow.mult : 1;
      const wallY = (g.ly && g.ly.wallY) ? g.ly.wallY - 10 : 957;
      const aimY = Math.min(target.y + target.speed * slowMult * bDur * 0.53, wallY);
      const n = 1 + multi;
      const decay = multi > 0 ? (0.12 * multi) * (this.branchLv('boomerang', '多镖', 'B') > 0 ? 0.5 : 1) : 0;
      const perDmg = dmg * (1 - decay) * (1 + nextBoost);
      const maxD = CONFIG.TOWERS.boomerang.range;
      const spread = 0.07 * (1 + 0.30 * this.branchLv('boomerang', '多镖', 'C'));
      // 移除通用视觉弹道（baseShot），按 n 枚重建（各带微偏角）
      const bidx = g.fx.indexOf(baseShot);
      if (bidx >= 0) g.fx.splice(bidx, 1);
      for (let i = 0; i < n; i++) {
        const off = (n > 1) ? (i - (n - 1) / 2) * spread : 0;
        const dx = target.x - sx, dy = aimY - sy;
        const dist = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, maxD / dist);
        const ex0 = sx + dx * k, ey0 = sy + dy * k;
        const cos = Math.cos(off), sin = Math.sin(off);
        const rx = ex0 - sx, ry = ey0 - sy;
        const ex = sx + rx * cos - ry * sin;
        const ey = sy + rx * sin + ry * cos;
        this.shots.push({ key, dmg: perDmg, t: 0, dur: bDur, sx, sy, tx: ex, ty: ey, sweep: true, hitIds: {}, windLv: this.lv('boomerang', '风痕') });
        g.fx.push({ type: 'shot', kind: 'arc', color: tint, x: sx, y: sy, tx: ex, ty: ey, t: 0, dur: bDur, key });
      }
    } else {
      this.shots.push({ key, target, dmg, t: 0, dur, sx, sy });
    }
    if (duel) {
      // 双管齐射第二发（更短弹道；B 副炮第二发伤害 +25%/级）
      const duelDmg = dmg * (1 + 0.25 * this.branchLv('cannon', '双管齐射', 'B'));
      g.fx.push({ ...baseShot, t: 0, dur: dur * 0.75 });
      this.shots.push({ key, target, dmg: duelDmg, t: 0, dur: dur * 0.75, sx, sy });
    }
  }

  /* ---------- 弹道命中结算 ---------- */
  resolveShot(s) {
    const g = this.game;
    const e = s.target;
    if (!e || e.hp <= 0 || !g.enemies.includes(e)) return; // 目标已死/消失 → 落空
    if (s.onHit) { s.onHit(e, s.dmg); return; }             // v1.13.2：自定义命中回调（多重火球分击等，不触发技能链）
    this.hit(s.key, e, s.dmg);
  }

  /** 散射弹道（无目标）沿途碰撞检测（v1.13.13）：按 t/dur 线性插值当前位置，命中半径内敌人返回该敌，未命中返回 null */
  scatterCheck(s) {
    const p = Math.min(1, s.t / s.dur);
    const bx = s.sx + (s.tx - s.sx) * p;
    const by = s.sy + (s.ty - s.sy) * p;
    const r = s.hitR || 42;
    for (const e of this.enemies()) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - bx, e.y - by) <= r) return e;
    }
    return null;
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

  /** 回旋镖沿途伤害（v1.16）：椭圆大弧扫过路径上的所有敌人，每敌单镖最多命中一次；折返 C 宽返吸附 +20%/级；风痕留痕 */
  sweepDamage(s) {
    const g = this.game;
    const p = Math.min(1, s.t / s.dur);
    const pos = this.sweepPos(s, p);
    const bx = pos.x, by = pos.y;
    const foldC = this.branchLv('boomerang', '折返增伤', 'C');
    const r = 42 * (1 + 0.20 * foldC);
    for (const e of g.enemies) {
      if (e.hp <= 0 || s.hitIds[e.id]) continue;
      if (Math.hypot(e.x - bx, e.y - by) <= r) {
        s.hitIds[e.id] = true;
        this.damage(e, s.dmg, 'boomerang');
      }
    }
    // 风痕（v1.16）：镖路径每秒留下风痕伤害区（A 久痕 +0.5s/级；B 劲风 +30%/级；C 卷痕减速 15%）
    if (s.windLv > 0) {
      const wA = this.branchLv('boomerang', '风痕', 'A');
      const wB = this.branchLv('boomerang', '风痕', 'B');
      const wC = this.branchLv('boomerang', '风痕', 'C');
      this.windTrails = this.windTrails || [];
      if (this.windTrails.length < 120) {
        const ttl = 1.5 + 0.5 * wA;
        const dps = this.shotDmg('boomerang') * 0.30 * (1 + 0.3 * wB);
        this.windTrails.push({ x: bx, y: by, r: 34, ttl, dps, slow: wC > 0 ? 0.15 : 0 });
      }
      if (Math.random() < 0.5) this.fxParticle(bx, by, '#c39bd3', 1, 14, 0.5, 50, 3);
    }
  }

  /* ---------- 六塔命中行为 ---------- */
  hit(key, e, dmg) {
    const g = this.game;
    // 电磁场（v1.13.22 分支补全）：任意塔命中概率触发微型连锁——A 激磁 +10%/级、B 强磁伤害 +30%/级、C 扩磁目标 +1/级
    const em = this.lv('electric', '电磁场');
    if (em > 0) {
      const emA = this.branchLv('electric', '电磁场', 'A');
      const emB = this.branchLv('electric', '电磁场', 'B');
      const emC = this.branchLv('electric', '电磁场', 'C');
      if (Math.random() < 0.10 + 0.10 * (em - 1) + 0.10 * emA) {
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.x - e.x) < 110 && Math.abs(o.y - e.y) < 110);
        const emDmg = this.shotDmg('electric') * 0.4 * (1 + 0.3 * (em - 1)) * (1 + 0.3 * emB);
        const n = 1 + emC;   // C 扩磁：目标 +1/级
        for (let i = 0; i < n && cands.length; i++) {
          const pick = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
          this.damage(pick, emDmg, 'electric');
          this.fxFlash(pick.x, pick.y, '#f4d03f');
        }
        this.fxRing(e.x, e.y, '#f4d03f', 110, 0.3, 3);
      }
    }

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
  hitFire(e, dmg) {
    const g = this.game;
    // v1.16.21：火焰鹰眼已重做为「烈焰墙」（周期技），此处不再有普攻乘区

    // 普攻灼烧（v1.16.21）：基础 20% 概率灼烧；学「点燃」后命中附加灼烧几率 +25%（A 炽焰每级再 +15%）
    const ignite = this.lv('fire', '点燃');
    let burnProb = 0.20;
    if (ignite > 0) burnProb += 0.25 + 0.15 * this.branchLv('fire', '点燃', 'A');
    if (Math.random() < burnProb) this.applyBurn(e, dmg, 'fire');
    // 大火球：主目标 120%
    const big = this.lv('fire', '大火球');
    const mainMult = big > 0 ? 1.1 : 1;
    // 多重火球：主目标 + 额外目标，每枚都是真实火球弹道（塔口扇形射出，命中才结算）
    //         A 增发 3→4→5 枚 / B 凝火 +15%/枚 / C 分击不同目标+25%点燃
    const multi = this.lv('fire', '多重火球');
    if (multi > 0) {
      // 塔发射点（与 attackOnce 同口径）
      const ly0 = this.ly();
      const rowW = 4 * ly0.slotSize + 3 * ly0.slotGap;
      const startX = (750 - rowW) / 2;
      const slotW = ly0.slotSize + ly0.slotGap;
      const idx = g.run.slotOrder.indexOf('fire');
      const fsx = startX + (idx < 0 ? 0 : idx * slotW) + ly0.slotSize / 2;
      const fsy = ly0.slotY + ly0.slotSize / 2;
      const n = 5 + this.branchLv('fire', '多重火球', 'A');          // v1.16.21 基础 5 枚（主 + 4 散射，+2 普通火球）；A 每级 +1
      const perDmg = dmg * 0.44 * (1 + [0, 0.15, 0.30, 0.50][this.branchLv('fire', '多重火球', 'B')]);   // 凝火 +15/30/50%
      const igniteProb = this.branchLv('fire', '多重火球', 'C') > 0 ? 0.25 : 0;
      const dur = CONFIG.TOWERS.fire.shot.dur;
      const tint = '#ff7043';
      // v1.13.3：多枚火球扇形分离——aim 固定终点 + 弹体放大，确保视觉上清晰可见「多个火球」
      const aimOf = (tgt, off) => {
        const dx = tgt.x - fsx, dy = tgt.y - fsy;
        const cos = Math.cos(off), sin = Math.sin(off);
        return { tx: fsx + dx * cos - dy * sin, ty: fsy + dx * sin + dy * cos };
      };
      // 火塔射界半径与散射碰撞半径（v1.13.13：额外火球无目标散射弹道）
      const R = this.range('fire');                 // 射界半径（= 塔射程）
      const hitR = 45;                              // 散射火球碰撞半径（弹体较大）
      // 命中结算（主目标直瞄与散射弹道共用）：本体伤害 + 大火球叠加爆炸 + 多重火球 C 散射分裂
      const cLv = this.branchLv('fire', '多重火球', 'C');
      const strike = (o, d, ang) => {
        this.damage(o, d, 'fire');
        this.fxParticle(o.x, o.y, '#ff9f43', 6, 46, 0.35, 140, 5);
        this.fxRing(o.x, o.y, '#ff7043', 26, 0.25, 3);
        this.fxFlash(o.x, o.y, '#ffd24a', 0.2);
        // 多重火球 C 散射：命中后分裂 4 个小火球，沿弹道方向 120° 均匀散射（每个 25% 攻击伤害 + 20% 点燃）
        if (cLv > 0) {
          for (let k = 0; k < 4; k++) {
            const off = -Math.PI / 3 + (k / 3) * (2 * Math.PI / 3);   // -60°~+60° 均匀 4 等分
            const da = off + (ang || 0);
            const tx2 = o.x + Math.cos(da) * R, ty2 = o.y + Math.sin(da) * R;
            const mStrike = (m2) => {
              this.damage(m2, dmg * 0.25, 'fire');
              this.fxParticle(m2.x, m2.y, '#ffd24a', 4, 30, 0.3, 110, 4);
              if (Math.random() < 0.20) this.applyBurn(m2, dmg, 'fire');
            };
            this.shots.push({ key: 'fire', scatter: true, dmg: dmg * 0.25, t: 0, dur: dur * 0.8, sx: o.x, sy: o.y, tx: tx2, ty: ty2, hitR: 30, onHit: mStrike });
            g.fx.push({ type: 'shot', kind: 'line', color: '#ffd24a', x: o.x, y: o.y, t: 0, dur: dur * 0.8, key: 'fire', aim: true, scale: 0.9, tx: tx2, ty: ty2 });
          }
        }
        // 大火球叠加：每枚火球命中处按大火球口径爆炸溅射（选了大火球 → 火球变大火球）
        if (big > 0) {
          const bgr = 130 * (1 + 0.30 * this.branchLv('fire', '大火球', 'A'));
          const bgs = dmg * 0.48 * (1 + 0.20 * this.branchLv('fire', '大火球', 'B'));
          const bgIgnite = 0.50 * this.branchLv('fire', '大火球', 'C');
          this.enemies().forEach((o2) => {
            if (o2 === o || o2.hp <= 0) return;
            if (Math.hypot(o2.x - o.x, o2.y - o.y) <= bgr) {
              this.damage(o2, bgs, 'fire');
              if (bgIgnite > 0 && Math.random() < bgIgnite) this.applyBurn(o2, dmg, 'fire');
            }
          });
          this.fxRing(o.x, o.y, '#ff7043', bgr, 0.4, 4);
          this.fxParticle(o.x, o.y, '#ffab40', 8, bgr * 0.8, 0.5, 140, 5);
          this.fxFlash(o.x, o.y, '#ff9f43');
        }
      };
      // 主目标：立即伤害（保持技能链/点燃时序）+ 一枚可见火球弹道（仍直瞄）+ 命中结算（散射/爆炸）
      const aim0 = aimOf(e, 0);
      this.damage(e, perDmg, 'fire');
      strike(e, perDmg, Math.atan2(aim0.ty - fsy, aim0.tx - fsx));
      g.fx.push(Object.assign({ type: 'shot', kind: 'line', color: tint, x: fsx, y: fsy, t: 0, dur, key: 'fire', target: e, aim: true, scale: 1.35 }, aim0));
      // 额外火球：无目标散射——扇形范围内随机角度（基准垂直向上），垂直射界，沿途碰撞命中即止
      const maxOff = (n - 2) * 0.08;   // 扇形半角（弧度）：5 枚 ±0.24 / 6 枚 ±0.32 / 7 枚 ±0.40
      for (let i = 0; i < n - 1; i++) {
        const off = (Math.random() * 2 - 1) * maxOff;   // 扇形范围内随机角度发射
        const tx = fsx + Math.sin(off) * R;
        const ty = fsy - Math.cos(off) * R;
        const fball = { type: 'shot', kind: 'line', color: tint, x: fsx, y: fsy, t: 0, dur, key: 'fire', aim: true, scale: 1.35, tx, ty };
        this.shots.push({ key: 'fire', scatter: true, dmg: perDmg, t: 0, dur, sx: fsx, sy: fsy, tx, ty, hitR, onHit: strike });
        g.fx.push(fball);
      }
    } else {
      this.damage(e, dmg * mainMult, 'fire');                        // 单发（无多重火球时）
    }
    // 大火球：爆炸范围溅射（扩大 +30%/级、强化 +20%/级、引燃 50%/75%/100% 概率点燃）
    // v1.16.21：多重火球叠加时每枚火球命中处已各自爆炸（见 strike）；此块仅处理未学多重火球的单发大火球
    if (big > 0 && multi <= 0) {
      const r = 130 * (1 + 0.30 * this.branchLv('fire', '大火球', 'A'));
      const splDmg = dmg * 0.48 * (1 + 0.20 * this.branchLv('fire', '大火球', 'B'));
      const igniteProb = 0.50 * this.branchLv('fire', '大火球', 'C');
      this.enemies().forEach((o) => {
        if (o === e || o.hp <= 0) return;
        if (Math.hypot(o.x - e.x, o.y - e.y) <= r) {
          this.damage(o, splDmg, 'fire');
          if (igniteProb > 0 && Math.random() < igniteProb) this.applyBurn(o, dmg, 'fire');
        }
      });
      // 大火球视觉：大爆炸环 + 火焰粒子
      this.fxRing(e.x, e.y, '#ff7043', r, 0.4, 4);
      this.fxParticle(e.x, e.y, '#ffab40', 10, r, 0.5, 160, 6);
      this.fxFlash(e.x, e.y, '#ff9f43');
    }
  }

  applyBurn(e, dmg, src) {
    const bLv = this.branchLv('fire', '点燃', 'B');       // 炽热：灼烧时间 +2/+3/+4s
    const cLv = this.branchLv('fire', '点燃', 'C');       // 余烬：伤害 +20/40/60%、时长 -0.5/1/1.5s、结束爆炸
    const stackCap = this.branchLv('fire', '灼烧', 'A');  // 业火：叠层上限 +1/级
    const hasBurn = this.lv('fire', '灼烧');
    const maxStack = hasBurn > 0 ? 2 + stackCap : 1;      // 学「灼烧」后基础上限 +2 层
    let dot = e.dots.find((d) => d.type === 'burn');
    const tickI = 0.5;
    const cBoost = cLv > 0 ? [0, 0.20, 0.40, 0.60][cLv] : 0;
    const dps = dmg * 0.20 * (1 + cBoost);
    let ttl = 3 + (bLv > 0 ? [0, 2, 3, 4][bLv] : 0);
    if (cLv > 0) ttl -= [0, 0.5, 1, 1.5][cLv];
    if (ttl < 0.5) ttl = 0.5;
    if (!dot) {
      e.dots.push({ type: 'burn', dps, ttl, stack: 1, maxStack, tickT: 0, src, tickI });
      dot = e.dots[e.dots.length - 1];
    } else {
      dot.stack = Math.min(dot.maxStack || maxStack, dot.stack + 1);
      dot.dps = dps * dot.stack;
      dot.ttl = ttl;
      dot.tickI = tickI;
    }
    // 灼烧 B 燃尽：满层 → 小爆炸（60% 攻击伤害，范围 30/60/90px）
    const burnLv = this.branchLv('fire', '灼烧', 'B');
    if (burnLv > 0 && dot.stack >= maxStack) {
      dot.stack = 1;
      const rB = [0, 30, 60, 90][burnLv];
      this.explode(e.x, e.y, rB, dmg * 0.6, 'fire');
      this.fxRing(e.x, e.y, '#ff7043', rB, 0.4, 4);
      this.fxFlash(e.x, e.y, '#ff9f43');
    }
  }

  /* 普攻流血（v1.16.12 回旋镖塔）：随移动距离结算伤害；「放血」强化（v1.16.14：基础每跳翻倍 / A +50%/级 / B 时长+1s/级 / C 流血减速 20%） */
  applyBleed(e, dmg) {
    const bLv = this.lv('boomerang', '放血');
    e.bleedT = 4 + 1 * this.branchLv('boomerang', '放血', 'B');          // 流血持续 4s（B +1s/级）
    e._bleedDmg = dmg * 0.10 * (bLv > 0 ? 2 * (1 + 0.5 * this.branchLv('boomerang', '放血', 'A')) : 1); // 每移动100px结算
    e._bleedDist = 0;
    e._bleedLastY = e.y;
    // 放血 C 血迟：流血敌人减速 20%
    if (this.branchLv('boomerang', '放血', 'C') > 0) this.applySlow(e, 0.20, 1.5);
    // 流血视觉：暗红血珠粒子
    this.fxParticle(e.x, e.y - 8, '#c0392b', 3, 18, 0.4, 70, 4);
  }

  /* ============ 冰塔 ============ */
  hitIce(e, dmg) {
    this.damage(e, dmg, 'ice');
    // v1.13.27 普攻命中打击特效：冰锥撞击爆冰晶（白屑 + 蓝屑 + 小环 + 微闪）
    this.fxParticle(e.x, e.y, '#eaf6ff', 6, 44, 0.30, 130, 5);
    this.fxParticle(e.x, e.y, '#a9d6f5', 4, 62, 0.35, 90, 4);
    this.fxRing(e.x, e.y, '#d6f0ff', 16, 0.2, 2);
    // 普攻冰缓（v1.16.21）：基础 20% 概率造成冰缓（减速30%·持续3s）；学寒霜后 +25% 并 A 极寒每级 +15%（45→60→75→90%）
    //   B 凝结 冰缓时长 +1/+2/+3s；C 深寒 减速幅度 +10%/20%/30%
    const frost = this.lv('ice', '寒霜');
    const probSlow = 0.20 + (frost > 0 ? 0.25 + 0.15 * this.branchLv('ice', '寒霜', 'A') : 0);
    if (Math.random() < probSlow) {
      const mult = 0.30 + [0, 0.1, 0.2, 0.3][this.branchLv('ice', '寒霜', 'C')];
      const ttl = 3 + [0, 1, 2, 3][this.branchLv('ice', '寒霜', 'B')];
      this.applySlow(e, mult, ttl);
      // 冰缓视觉：浅蓝冰雾粒子
      this.fxParticle(e.x, e.y, '#a9d6f5', 6, 50, 0.5, 80, 5);
    }
    // 冰冻（v1.16.21）：基础 20% 概率冻结（冻结不能移动·2s）；A 冻结 +15%/30%/45%；B 深结 时长 +1/1.5/2s；C 碎冰在死亡时结算
    const frzLv = this.lv('ice', '冰冻');
    if (frzLv > 0) {
      const prob = 0.20 + [0, 0.15, 0.30, 0.45][this.branchLv('ice', '冰冻', 'A')];
      if (Math.random() < prob) {
        const dur = 2 + [0, 1, 1.5, 2][this.branchLv('ice', '冰冻', 'B')];
        e.frozen = Math.max(e.frozen || 0, dur);
        // 冰冻视觉：冻结凝固闪光 + 冰蓝扩散环 + 冰晶粒子
        this.fxFlash(e.x, e.y, '#d6f0ff', 0.28);
        this.fxRing(e.x, e.y, '#7fd4ff', 46, 0.4, 4);
        this.fxParticle(e.x, e.y, '#b8e6ff', 10, 60, 0.5, 130, 5);
      }
    }
    // 多重冰锥（v1.13.23 仿多重火球）：主目标直瞄 + 额外冰锥等角度扇形散射（无目标，射界消失或命中即止）
    //         A 增锥 3→4→5 枚 / B 凝霜 +15%/枚 / C 增殖（v1.16.21）：10/14/18 枚超小型冰锥（1/3大小·每枚10%·各自索敌·20%冰缓）
    const multi = this.lv('ice', '多重冰锥');
    if (multi > 0) {
      const g = this.game;
      const ly0 = this.ly();
      const rowW = 4 * ly0.slotSize + 3 * ly0.slotGap;
      const startX = (750 - rowW) / 2;
      const slotW = ly0.slotSize + ly0.slotGap;
      const idx = g.run.slotOrder.indexOf('ice');
      const msx = startX + (idx < 0 ? 0 : idx * slotW) + ly0.slotSize / 2;
      const msy = ly0.slotY + ly0.slotSize / 2;
      const aLv = this.branchLv('ice', '多重冰锥', 'A');
      const bLv = this.branchLv('ice', '多重冰锥', 'B');
      const cLv = this.branchLv('ice', '多重冰锥', 'C');
      const dur = CONFIG.TOWERS.ice.shot.dur;
      const R = this.range('ice');                 // 射界半径（= 塔射程）
      if (cLv > 0) {
        // C 增殖：10/14/18 枚超小型冰锥各自索敌（循环锁定射程内敌人直飞），每枚 10% 伤害（A 数量叠加、B 伤害叠加），命中 20% 冰缓
        const n = [0, 10, 14, 18][cLv] + aLv;
        const perDmg = dmg * 0.10 * (1 + 0.15 * bLv);
        const hitR = 30;                             // 超小冰锥碰撞半径更小
        const strike = (o, d) => {
          this.damage(o, d, 'ice');
          this.fxParticle(o.x, o.y, '#b8e6ff', 4, 34, 0.3, 110, 4);
          this.fxRing(o.x, o.y, '#7fd4ff', 16, 0.2, 2);
          if (Math.random() < 0.20) this.applySlow(o, 0.3, 3);   // 20% 冰缓（减速30%·3s）
        };
        const targets = this.enemies().filter((o) => o.hp > 0 && this.inTowerRange('ice', o.x, o.y));
        for (let i = 0; i < n; i++) {
          const tgt = targets.length ? targets[i % targets.length] : e;   // 各自索敌：循环分配射程内目标
          this.shots.push({ key: 'ice', scatter: true, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, tx: tgt.x, ty: tgt.y, hitR, onHit: strike });
          g.fx.push({ type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', aim: true, scale: 0.38, tx: tgt.x, ty: tgt.y });
        }
        // 主目标也受一枚小冰锥伤害（增殖时无直瞄主目标概念，主目标被环形索敌覆盖）
        this.damage(e, perDmg, 'ice');
        this.fxFlash(e.x, e.y, '#7fd4ff', 0.2);
      } else {
        const n = 3 + aLv;                                  // 基础 3 枚 = 主 + 2 散射（v1.16.20 修正为 3+分支级）
        const perDmg = dmg * 0.55 * (1 + 0.15 * bLv);
        const hitR = 45;                                     // 散射冰锥碰撞半径
        const strike = (o, d) => {                           // 命中结算（主目标直瞄与散射弹道共用）
          this.damage(o, d, 'ice');
          this.fxParticle(o.x, o.y, '#b8e6ff', 6, 46, 0.35, 140, 5);
          this.fxRing(o.x, o.y, '#7fd4ff', 26, 0.25, 3);
          this.fxFlash(o.x, o.y, '#7fd4ff', 0.2);
        };
        // 主目标：立即伤害 + 一枚可见直瞄冰锥弹道
        this.damage(e, perDmg, 'ice');
        g.fx.push({ type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, tx: e.x, ty: e.y, t: 0, dur, key: 'ice', target: e, aim: true, scale: 1.15 });
        // 额外冰锥：等角度扇形（均匀分布在 ±maxOff，主目标角度 0 两侧）
        const maxOff = (n - 2) * 0.08;
        for (let i = 0; i < n - 1; i++) {
          const off = n > 2 ? (-maxOff + i * (2 * maxOff / (n - 2))) : 0;
          const tx = msx + Math.sin(off) * R;
          const ty = msy - Math.cos(off) * R;
          const icicle = { type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', aim: true, scale: 1.15, tx, ty };
          this.shots.push({ key: 'ice', scatter: true, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, tx, ty, hitR, onHit: strike });
          g.fx.push(icicle);
        }
      }
    }
    // 碎冰（v1.13.24 原低温全塔改）：冰锥命中目标后碎裂成 3 枚碎冰，沿弹道方向越过目标，继续向敌人身后飞行命中后续敌人
    //   A 裂片 +1/级（3→4→5）、B 碎劲 伤害+15%/级、C 冻裂 25% 概率减速 30%
    const shard = this.lv('ice', '碎冰');
    if (shard > 0) {
      const g = this.game;
      const ly0 = this.ly();
      const rowW = 4 * ly0.slotSize + 3 * ly0.slotGap;
      const startX = (750 - rowW) / 2;
      const slotW = ly0.slotSize + ly0.slotGap;
      const idx = g.run.slotOrder.indexOf('ice');
      const msx = startX + (idx < 0 ? 0 : idx * slotW) + ly0.slotSize / 2;
      const msy = ly0.slotY + ly0.slotSize / 2;
      const len = Math.hypot(e.x - msx, e.y - msy) || 1;
      const dx = (e.x - msx) / len, dy = (e.y - msy) / len;   // 弹道方向（继续向前 = 敌人身后）
      const n = 3 + this.branchLv('ice', '碎冰', 'A');
      const dmg = this.shotDmg('ice') * 0.45 * (1 + 0.15 * this.branchLv('ice', '碎冰', 'B'));
      const slowP = this.branchLv('ice', '碎冰', 'C') > 0 ? 0.25 : 0;
      const sx = e.x + dx * 55, sy = e.y + dy * 55;   // 越过主目标，避免立即重复命中
      const R = this.range('ice');
      const dur = CONFIG.TOWERS.ice.shot.dur;
      const hitR = 45;
      const strike = (o, d) => {
        this.damage(o, d, 'ice');
        // v1.13.27 碎冰命中：冰晶迸发 + 闪光 + 小环
        this.fxFlash(o.x, o.y, '#d6f0ff', 0.22);
        this.fxParticle(o.x, o.y, '#b8e6ff', 6, 46, 0.35, 140, 5);
        this.fxRing(o.x, o.y, '#7fd4ff', 26, 0.25, 3);
        if (slowP > 0 && Math.random() < slowP) this.applySlow(o, 0.3, 1.5);
      };
      const baseA = Math.atan2(dy, dx);
      const spread = 0.06;
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0;
        const a = baseA + off;
        const tx = sx + Math.cos(a) * R;
        const ty = sy + Math.sin(a) * R;
        this.shots.push({ key: 'ice', scatter: true, dmg, t: 0, dur, sx, sy, tx, ty, hitR, onHit: strike });
        g.fx.push({ type: 'shot', kind: 'line', color: '#7fd4ff', x: sx, y: sy, t: 0, dur, key: 'ice', aim: true, scale: 0.85, tx, ty });
      }
    }
    // 冰穿刺（v1.16.21 重做，原「冰锥穿透」未实装补全）：弹道可穿透敌人（基础 1 名）
    //   A 冰穿 穿透目标 +1/+2/+3（1→2/3/4 名）；B 透射 穿透后伤害 +30%/60%/90%；C 冰霜透射 命中后对敌人身后 60px·90° 扇形造成 30%/40%/50% 伤害
    const pierce = this.lv('ice', '冰穿刺');
    if (pierce > 0) {
      const g = this.game;
      const ly0 = this.ly();
      const rowW = 4 * ly0.slotSize + 3 * ly0.slotGap;
      const startX = (750 - rowW) / 2;
      const slotW = ly0.slotSize + ly0.slotGap;
      const idx = g.run.slotOrder.indexOf('ice');
      const psx = startX + (idx < 0 ? 0 : idx * slotW) + ly0.slotSize / 2;
      const psy = ly0.slotY + ly0.slotSize / 2;
      const dirLen = Math.hypot(e.x - psx, e.y - psy) || 1;
      const ddx = (e.x - psx) / dirLen, ddy = (e.y - psy) / dirLen;   // 弹道方向（塔→目标）
      const aLv = this.branchLv('ice', '冰穿刺', 'A');
      const bLv = this.branchLv('ice', '冰穿刺', 'B');
      const cLv = this.branchLv('ice', '冰穿刺', 'C');
      const pierceN = 1 + aLv;   // 基础 1 名 + A 每级 1 → 1/2/3/4
      // 穿透目标：沿弹道方向位于目标身后（远离塔侧）的敌人，按投影距离排序
      const cands = this.enemies().filter((o) => o.hp > 0 && o !== e
          && ((o.x - e.x) * ddx + (o.y - e.y) * ddy) > 20)
        .sort((a, b) => ((a.x - e.x) * ddx + (a.y - e.y) * ddy) - ((b.x - e.x) * ddx + (b.y - e.y) * ddy));
      for (let i = 0; i < Math.min(pierceN, cands.length); i++) {
        const pT = cands[i];
        const pDmg = dmg * (1 + [0, 0.3, 0.6, 0.9][bLv]);   // B 透射 +30/60/90%
        this.damage(pT, pDmg, 'ice');
        this.fxParticle(pT.x, pT.y, '#b8e6ff', 5, 40, 0.3, 110, 4);
        this.fxRing(pT.x, pT.y, '#a9d6f5', 20, 0.2, 2);
      }
      // C 冰霜透射：对敌人身后 60px·90° 扇形区域（以弹道方向为中轴 ±45°）造成伤害
      if (cLv > 0) {
        const fDmg = this.shotDmg('ice') * [0, 0.3, 0.4, 0.5][cLv];
        this.enemies().forEach((o) => {
          if (o.hp <= 0 || o === e) return;
          const proj = (o.x - e.x) * ddx + (o.y - e.y) * ddy;          // 沿弹道方向投影（正=身后）
          const side = Math.abs((o.x - e.x) * ddy - (o.y - e.y) * ddx); // 侧向距离
          if (proj > 0 && proj <= 60 && side <= proj) this.damage(o, fDmg, 'ice');   // ±45°（90° 扇形）
        });
        this.fxParticle(e.x, e.y, '#d6f0ff', 8, 70, 0.35, 130, 5);
        this.fxRing(e.x, e.y, '#b8e6ff', 42, 0.3, 3);
      }
    }
  }

  applySlow(e, mult, ttl) {
    if (!e.slow || e.slow.ttl <= 0) e.slow = { mult: 1, ttl };
    else e.slow.ttl = Math.max(e.slow.ttl, ttl);
    e.slow.mult = 1 - mult;
  }

  /* ============ 毒塔（v1.15 重做：基础中毒 20% 概率叠层 / 剧毒 / 毒爆 / 毒池 / 毒棒 / 毒性强化 / 瘟疫 / 毒藤 / 瘴气环境） ============ */
  hitPoison(e, dmg) {
    // v1.15 基础中毒：20% 概率附加 1 层（剧毒 ×1.5，A 每级再 +15%）
    let prob = 0.20;
    const toxic = this.lv('poison', '剧毒');
    if (toxic > 0) prob *= 1.5 * (1 + 0.15 * this.branchLv('poison', '剧毒', 'A'));
    if (Math.random() < prob) {
      this.applyPoison(e, dmg, 'poison', 1);
      this.fxParticle(e.x, e.y, '#7ee2a8', 6, 44, 0.45, 100, 5);
    }
    this.damage(e, dmg, 'poison');
  }

  /** 毒·中毒叠层（v1.15）：每层每秒 = 单发伤害×10%，基础持续 4 秒，上限 5 层（毒性强化 C +2/级）；
   *  剧毒 B 时长 +2s/级、毒性强化 B +25%；剧毒 C 跳频 +1Hz/级 */
  applyPoison(e, dmg, src, layers) {
    const boost = this.dotBoost();
    const perStackDps = dmg * 0.10 * boost.dmg;
    const ttl = 4 * (1 + 0.5 * this.branchLv('poison', '剧毒', 'B')) * boost.ttl;
    const cap = 5 + 2 * this.branchLv('poison', '毒性强化', 'C');
    const add = Math.max(1, layers || 1);
    let dot = e.dots.find((d) => d.type === 'poison');
    if (!dot) {
      e.dots.push({ type: 'poison', stackDps: perStackDps, stack: Math.min(add, cap), maxStack: cap, ttl, tickT: 0, freq: 1 + this.branchLv('poison', '剧毒', 'C'), src });
    } else {
      dot.stack = Math.min(cap, dot.stack + add);
      dot.stackDps = Math.max(dot.stackDps, perStackDps);
      dot.maxStack = cap;
      dot.freq = 1 + this.branchLv('poison', '剧毒', 'C');
      dot.ttl = Math.max(dot.ttl, ttl);
    }
  }

  /** 当前中毒层数（毒爆 B 继承用） */
  poisonStack(e) {
    const d = (e.dots || []).find((x) => x.type === 'poison');
    return d ? d.stack : 1;
  }

  /** 毒塔塔口坐标（毒藤/瘴气/毒棒召唤用，与 attackOnce 同口径） */
  towerMuzzle(key) {
    const g = this.game;
    const ly = this.ly();
    const n = g.run.slotOrder.length || 4;
    const rowW = n * ly.slotSize + (n - 1) * ly.slotGap;
    const startX = (750 - rowW) / 2;
    const slotW = ly.slotSize + ly.slotGap;
    const idx = g.run.slotOrder.indexOf(key);
    return { x: startX + Math.max(0, idx) * slotW + ly.slotSize / 2, y: ly.slotY + ly.slotSize / 2 };
  }

  /** 某点是否在当前塔攻击范围内（与普攻 pickTarget 同口径：行距离 ≤ 射程；v1.16.21 技能释放限定用） */
  inTowerRange(key, x, y) {
    return Math.abs(this.towerMuzzle(key).y - y) <= this.range(key);
  }

  hasDot(e, type) { return !!e.dots.find((d) => d.type === type); }

  /* ============ 电塔 ============ */
  hitElectric(e, dmg) {
    // 主目标伤害（过载层数为上一击累计，连续命中递增）
    this.damage(e, dmg, 'electric');
    // 过载（v1.13.18）：叠层上限固定 3 层；A 分支=每 3 层填充 1 发弹药；C 分支=满层闪电爆发（麻痹 150px 内敌人并造成伤害）
    const over = this.lv('electric', '过载');
    if (over > 0) {
      if (!e.overload) e.overload = { n: 0, ttl: 2 };
      e.overload.n = Math.min(3, e.overload.n + 1);
      e.overload.ttl = 2;
      // A 分支：每 3 层填充 1 发弹药（封顶 ammoMax）
      if (this.branchLv('electric', '过载', 'A') > 0 && e.overload.n >= 3) {
        const maxA = CONFIG.GLOBAL_SKILL && CONFIG.GLOBAL_SKILL.ammoMax ? CONFIG.GLOBAL_SKILL.ammoMax : 50;
        const et = this.tower('electric');
        if (et) et.ammo = Math.min(maxA, et.ammo + 1);
        this.fxFlash(e.x, e.y, '#f4d03f');
      }
      // C 分支：满层闪电爆发（每层周期只触发一次，层数清零后重新可触发）
      if (this.branchLv('electric', '过载', 'C') > 0 && e.overload.n >= 3 && !e.overload._burst) {
        e.overload._burst = true;
        const bDmg = this.shotDmg('electric') * 0.8;
        const r = 150;
        this.enemies().forEach((o) => {
          if (o.hp <= 0 || Math.hypot(o.x - e.x, o.y - e.y) > r) return;
          this.damage(o, bDmg, 'electric');
          o.paralyzed = Math.max(o.paralyzed || 0, 1.5);
          this.applySlow(o, 0.5, 1.5);
          this.fxFlash(o.x, o.y, '#f4d03f');
        });
        this.fxRing(e.x, e.y, '#f4d03f', r, 0.4, 4);
      }
    }
    // 麻痹（v1.16.19 调平）：电塔基础 20%；学麻痹技能 +15%；A 分支每级 +25%（满级封顶 100%）；时长 2s + B 分支 0.5s/级；目标减速 50% 并停止攻击
    // C 传导：邻近敌人 20% 概率被麻痹（1s）
    const paraLv = this.lv('electric', '麻痹');
    const pA = this.branchLv('electric', '麻痹', 'A');
    const pB = this.branchLv('electric', '麻痹', 'B');
    const pC = this.branchLv('electric', '麻痹', 'C');
    if (Math.random() < Math.min(1, 0.20 + (paraLv > 0 ? 0.15 : 0) + 0.25 * pA)) {
      const dur = 2 + 0.5 * pB;
      e.paralyzed = Math.max(e.paralyzed || 0, dur);
      this.applySlow(e, 0.5, dur);
      // 麻痹视觉：金黄电火花
      this.fxParticle(e.x, e.y, '#f4d03f', 8, 50, 0.4, 140, 5);
      // C 传导：60px 内其它敌人 20% 概率被传导麻痹
      if (pC > 0) {
        this.enemies().forEach((o) => {
          if (o === e || o.hp <= 0 || Math.hypot(o.x - e.x, o.y - e.y) > 60) return;
          if (Math.random() < 0.20) {
            o.paralyzed = Math.max(o.paralyzed || 0, 1);
            this.applySlow(o, 0.5, 1);
            this.fxParticle(o.x, o.y, '#f4d03f', 4, 30, 0.35, 110, 4);
          }
        });
      }
    }
    // 活电（v1.13.18 改电球，v1.13.19 更名）：命中麻痹中的敌人 → 向四周扩散 N 个随机游走电球（A 分支 +2/级；B 分支伤害 +20%/级；C 分支游走更久）
    const bounce = this.lv('electric', '活电');
    if (bounce > 0 && e.paralyzed > 0) {
      const n = 5 + 2 * this.branchLv('electric', '活电', 'A');
      const orbDmg = dmg * 0.5 * (1 + 0.2 * this.branchLv('electric', '活电', 'B'));
      const oDur = 1.4 + 0.4 * this.branchLv('electric', '活电', 'C');   // v1.13.21 游走时长 0.8→1.4s
      for (let i = 0; i < n; i++) {
        const orb = {
          key: 'electric', dmg: orbDmg, t: 0, dur: oDur,
          x: e.x, y: e.y, ang: Math.random() * Math.PI * 2, speed: 150 + Math.random() * 80,   // v1.13.21 速度 95-155→150-230
          orb: true, fx: null,
        };
        orb.fx = { type: 'shot', kind: 'orb', ref: orb, t: 0, dur: oDur };
        this.shots.push(orb);
        this.game.fx.push(orb.fx);
      }
      this.fxRing(e.x, e.y, '#f4d03f', 44, 0.3, 3);
    }
    // 连锁弹跳（v1.16.20 接入 A/B：A 扩展每级 +2 弹跳、B 稳流每级衰减 -20%；C 回能：每次连锁命中缩短攻击间隔）
    const chainLv = this.lv('electric', '连锁');
    const chainA = this.branchLv('electric', '连锁', 'A');
    const chainB = this.branchLv('electric', '连锁', 'B');
    const chainC = this.branchLv('electric', '连锁', 'C');
    if (chainLv > 0) {
      const extra = 1 + 2 * chainA;      // 基础 1 个额外（主+1=共 2 目标）+ A 扩展每级 +2
      let decay = 0.30 * (1 - 0.2 * chainB);   // 基础衰减 30% - B 稳流每级 20%
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
        this.damage(next, cDmg, 'electric');
        // C 回能：每次连锁命中缩短电塔攻击间隔（3%/级）
        if (chainC > 0 && this.atkTimers.electric !== undefined) {
          this.atkTimers.electric = Math.max(0, this.atkTimers.electric - this.interval('electric') * 0.03 * chainC);
        }
        hitSet.push(next);
        cur = next;
      }
      this.fxRing(e.x, e.y, '#f4d03f', 40 + 12 * chainLv, 0.3, 3);
      this.fxFlash(e.x, e.y, '#f4d03f');
    }
  }

  /* ============ 回旋镖塔 ============ */
  /* ============ 回旋镖塔（v1.16 重做：折返增伤/穿透/多镖/接镖/猎手标记/风暴镖/镖阵/风痕） ============ */
  hitBoomerang(e, dmg) {
    // 猎手标记（v1.16）：命中同目标叠加标记，每层受镖伤 +8%（A 深标 +3%/级；上限 3+2×B）
    const markLv = this.lv('boomerang', '猎手标记');
    let v = dmg;
    if (markLv > 0) {
      const cap = 3 + 2 * this.branchLv('boomerang', '猎手标记', 'B');
      e._mark = Math.min(cap, (e._mark || 0) + 1);
      v = dmg * (1 + (0.08 + 0.03 * this.branchLv('boomerang', '猎手标记', 'A')) * e._mark);
      // 标记视觉：目标头顶紫色标记计数
      this.fxParticle(e.x, e.y - 16, '#d2b4de', 2, 12, 0.35, 60, 4);
    }
    this.damage(e, v, 'boomerang');
    // 普攻流血（v1.16.12）：20% 概率施加流血，随移动距离结算伤害（持续 4s，每移动 100px 跳一次）
    if (Math.random() < 0.20) this.applyBleed(e, v);
    // 折返增伤（v1.16）：折返段 = 命中伤害 ×0.65×(1+0.25×A)；B 缓返命中减速 20%；C 宽返吸附已在 sweepDamage
    const fold = this.lv('boomerang', '折返增伤');
    if (fold > 0) {
      const foldDmg = v * 0.65 * (1 + 0.25 * this.branchLv('boomerang', '折返增伤', 'A'));
      this.damage(e, foldDmg, 'boomerang');
      if (this.branchLv('boomerang', '折返增伤', 'B') > 0) this.applySlow(e, 0.20, 1);
      // 折返视觉：紫色小回环
      this.fxRing(e.x, e.y, '#c39bd3', 34, 0.3, 2.5);
    }
    // （v1.16.14 回旋镖「穿透」已替换为「放血」dot 强化，穿透实现移除）
  }

  /* ============ 炮塔（v1.16 重做：重炮/震击/贯穿弹/双管齐射/炮火支援/地雷阵/炮台/军火库） ============ */
  hitCannon(e, dmg) {
    // v1.16.14 军火库 C 双倍火力：普攻 10%/20%/30% 概率造成双倍伤害（仅主目标）
    const armC = this.branchLv('cannon', '军火库', 'C');
    if (armC > 0 && Math.random() < 0.10 * armC) {
      dmg *= 2;
      this.fxFlash(e.x, e.y, '#ffb347', 0.25);
    }
    // 普攻溅射（v1.16.12）：基础 100px 范围、10% 溅射伤害；学「重炮」后范围 +25%/级（A 扩爆 +15%/级、B 炸力 +15%/级）
    const heavy = this.lv('cannon', '重炮');
    const r = 100 * (1 + 0.25 * heavy + 0.15 * this.branchLv('cannon', '重炮', 'A'));
    const splDmg = dmg * 0.10 * (1 + 0.15 * this.branchLv('cannon', '重炮', 'B'));
    // 协同（爆炸类 +50%）在 explode() 内按 SYNERGIES[1] 统一结算（v1.16.20 修正越界索引）
    // 震击（v1.16）：40%+20pp×B 概率击退 60×(1+0.4×A)px；C 迟滞被击退减速 1s
    const shock = this.lv('cannon', '震击');
    let knock = 0, slowAfter = false;
    if (shock > 0 && Math.random() < 0.40 + 0.20 * this.branchLv('cannon', '震击', 'B')) {
      knock = 60 * (1 + 0.4 * this.branchLv('cannon', '震击', 'A'));
      slowAfter = this.branchLv('cannon', '震击', 'C') > 0;
    }
    this.damage(e, dmg, 'cannon');
    // 爆炸（AOE 溅射 + 震尘减速）——排除主目标（普攻主目标已吃满 100%）
    this.explode(e.x, e.y, r, splDmg, 'cannon', knock, slowAfter, e);
    if (this.branchLv('cannon', '重炮', 'C') > 0) {
      this.enemies().forEach((o) => {
        if (o.hp > 0 && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= r && Math.random() < 0.20) this.applySlow(o, 0.30, 1);
      });
    }
    // 贯穿弹（v1.16）：爆炸后弹片向前贯穿 2+裂片 个敌人（70%×碎劲），C 贯透减速 15%
    const pierce = this.lv('cannon', '贯穿弹');
    if (pierce > 0) {
      const n = 2 + this.branchLv('cannon', '贯穿弹', 'A');
      const pDmg = dmg * 0.7 * (1 + 0.20 * this.branchLv('cannon', '贯穿弹', 'B'));
      const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.y - e.y) < 60 && Math.abs(o.x - e.x) < 85)
        .sort((a, b) => b.y - a.y);
      for (let i = 0; i < Math.min(n, cands.length); i++) {
        this.damage(cands[i], pDmg, 'cannon');
        if (this.branchLv('cannon', '贯穿弹', 'C') > 0) this.applySlow(cands[i], 0.15, 1);
        this.fxParticle(cands[i].x, cands[i].y, '#d89e63', 3, 22, 0.3, 90, 4);
      }
    }
  }

  /** 范围爆炸（含击退/减速）；爆炸颜色按塔类型 */
  explode(x, y, r, dmg, key, knock, slowAfter, exclude) {
    const g = this.game;
    // 协同（v1.16.20 修正）：重炮×大火球（SYNERGIES[1]）达成 → 爆炸类伤害 +50%（原引用 [0]/[2] 错位已修正）
    let mult = 1;
    if (g.run.effects.synergyDone && g.run.effects.synergyDone[1]) mult *= 1.5;
    const entryY = this.ly().areaY + this.ly().entryH;
    this.enemies().forEach((o) => {
      if (o.hp <= 0) return;
      if (exclude && o === exclude) return;   // 溅射不重复结算施爆点主目标（v1.16.12）
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
    // 火·火柱：每 10 秒（触发间隔保持原值，v1.13.10）随机 1 个敌人召唤火柱（150% 伤害·半径120；A 爆发+50%/级、B 扩展+40%/级、C 余烬地面 3 秒 30%/s）
    // v1.13.9：伤害延迟到地面圈画完（约 0.6s）后结算，动画与伤害节奏一致
    const pillar = this.lv('fire', '火柱');
    if (pillar > 0) {
      this.timers.firePillar = (this.timers.firePillar || 0) + dt;
      if (this.timers.firePillar >= 10) {
        this.timers.firePillar = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('fire', e.x, e.y));
        if (alive.length) {
          const tgt = alive[Math.floor(Math.random() * alive.length)];
          const pDmg = this.shotDmg('fire') * 1.2 * (1 + 0.30 * this.branchLv('fire', '火柱', 'A'));   // 深火 30%/级
          const pR = 120 * (1 + 0.20 * this.branchLv('fire', '火柱', 'B'));                            // 燎原 20%/级
          const emberLv = this.branchLv('fire', '火柱', 'C');
          this.pillarWaves = this.pillarWaves || [];
          this.pillarWaves.push({ t: 0.6, x: tgt.x, y: tgt.y, r: pR, dmg: pDmg, ember: emberLv });
          // 火柱视觉：地上火圈标记 → 冲天圆柱火柱（帧动画，dur 2.4s 放慢一倍）
          g.fx.push({ type: 'pillar', x: tgt.x, y: tgt.y, r: pR, t: 0, dur: 2.4, seed: Math.random() * 100 });
          this.fxParticle(tgt.x, tgt.y - 10, '#ffd24a', 4, 60, 0.5, 150, 5);
        }
      }
      // 延迟伤害结算：圈标记完成后火柱爆发
      if (this.pillarWaves && this.pillarWaves.length) {
        const remaining = [];
        for (const wv of this.pillarWaves) {
          wv.t -= dt;
          if (wv.t <= 0) {
            this.explode(wv.x, wv.y, wv.r, wv.dmg, 'fire');
            if (wv.ember > 0) {
              this.groundDots = this.groundDots || [];
              this.groundDots.push({ x: wv.x, y: wv.y, r: wv.r, ttl: 3, dps: this.shotDmg('fire') * 0.15 * wv.ember, key: 'fire' });   // 余烬 15%/级（C1 15%→C3 45%）
            }
          } else {
            remaining.push(wv);
          }
        }
        this.pillarWaves = remaining;
      }
    }
    // 火·烈焰墙（v1.16.21 重做，替换原「火焰鹰眼」）：每 15 秒在最近怪物处释放可穿越火墙（长100px·宽30px·持续6s）
    //   释放瞬间对墙区域敌人造成 50% 攻击伤害（A 神火 +20/40/60%）；墙持续期间每 0.5s 灼烧 + C 迟滞减速 10/20/30%
    const wall = this.lv('fire', '烈焰墙');
    if (wall > 0) {
      this.timers.fireWall = (this.timers.fireWall || 0) + dt;
      if (this.timers.fireWall >= 15) {
        this.timers.fireWall = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('fire', e.x, e.y));
        if (alive.length) {
          const tgt = alive.reduce((a, b) => (b.y > a.y ? b : a));   // 最近怪物 = 离塔/城墙最近（y 最大）
          const aLv = this.branchLv('fire', '烈焰墙', 'A');   // 神火 +20/40/60%
          const bLv = this.branchLv('fire', '烈焰墙', 'B');   // 引燃 范围 +20/40/60%
          const cLv = this.branchLv('fire', '烈焰墙', 'C');   // 迟滞 减速 10/20/30%
          const w = 100 * (1 + [0, 0.2, 0.4, 0.6][bLv]);
          const h = 30 * (1 + [0, 0.2, 0.4, 0.6][bLv]);
          const wDmg = this.shotDmg('fire') * 0.50 * (1 + [0, 0.2, 0.4, 0.6][aLv]);
          this.enemies().forEach((o) => {
            if (o.hp > 0 && Math.abs(o.x - tgt.x) <= w / 2 && o.y >= tgt.y - h / 2 && o.y <= tgt.y + h / 2) this.damage(o, wDmg, 'fire');
          });
          this.fireWalls = this.fireWalls || [];
          this.fireWalls.push({ x: tgt.x, y: tgt.y, w, h, ttl: 6, cLv, tick: 0 });
          g.fx.push({ type: 'fireWall', x: tgt.x, y: tgt.y, w, h, t: 0, dur: 6, seed: Math.random() * 100 });
        }
      } else {
        // 墙持续（触发帧不扣 ttl，从下一帧开始计时）：每 0.5s 对墙内敌人灼烧；C 迟滞减速（10/20/30%）
        if (this.fireWalls && this.fireWalls.length) {
          const rem = [];
          for (const wl of this.fireWalls) {
            wl.ttl -= dt;
            wl.tick -= dt;
            if (wl.ttl <= 0) continue;
            if (wl.tick <= 0) {
              wl.tick = 0.5;
              this.enemies().forEach((o) => {
                if (o.hp <= 0) return;
                if (Math.abs(o.x - wl.x) <= wl.w / 2 && o.y >= wl.y - wl.h / 2 && o.y <= wl.y + wl.h / 2) {
                  this.applyBurn(o, this.shotDmg('fire'), 'fire');
                  if (wl.cLv > 0) {
                    const sm = 1 - [0, 0.1, 0.2, 0.3][wl.cLv];
                    if (!o.slow || o.slow.mult > sm) o.slow = { mult: sm, ttl: 0.6 };
                  }
                }
              });
            }
            rem.push(wl);
          }
          this.fireWalls = rem;
        }
      }
    }
    // 火·火雨：每 12 秒（触发间隔保持原值，v1.13.10）在索敌区域降下火雨
    // v1.16.21 机制重做：分 3 波结算伤害，每 0.5s 一波，每波对火雨圈内敌人造成 24% 伤害（B 猛烈 +40/80/120%·档位）；
    //   C 由「引燃」改为「扩张」范围 +20/40/60%；波内动画保留（3 批×2-5 颗独立落下），伤害在整波落地后结算一次并灼烧
    const fireRain = this.lv('fire', '火雨');
    if (fireRain > 0) {
      this.timers.fireRain = (this.timers.fireRain || 0) + dt;
      if (this.timers.fireRain >= 12) {
        this.timers.fireRain = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('fire', e.x, e.y));
        if (alive.length) {
          const bLv = this.branchLv('fire', '火雨', 'B');
          const cLv = this.branchLv('fire', '火雨', 'C');
          const segR = 140 * (1 + [0, 0.2, 0.4, 0.6][cLv]);       // 火雨圈半径（C 扩张 +20/40/60%）
          const perR = 80;                                        // 火雨点视觉落点半径
          const segDmg = this.shotDmg('fire') * 0.24 * (1 + [0, 0.4, 0.8, 1.2][bLv]);   // 每波 24% 伤害（B +40/80/120%）
          const waves = 3 + this.branchLv('fire', '火雨', 'A');   // 基础 3 波，A 波次 +1
          const gap = 0.5;                                        // 每 0.5s 一波
          const FALL = 0.5;                                        // 单颗下落时长（与 render raindrop 同步）
          const tgt = alive[Math.floor(Math.random() * alive.length)];
          const px = tgt.x + (Math.random() - 0.5) * 20;
          const py = tgt.y + (Math.random() - 0.5) * 20;
          this.rainWaves = this.rainWaves || [];
          for (let w = 0; w < waves; w++) {
            const w0 = w * gap;
            // 区域圈 fx：整波持续（生成 0.1s + 下落 0.5s + 落地余焰）
            g.fx.push({ type: 'rain', x: px, y: py, r: segR, t: -w0, dur: 0.1 + FALL + 0.25, seed: Math.random() * 100 });
            // 波内视觉：3 批，0.1s 内随机时刻生成，每批 2-5 颗，独立落下（伤害按整波在最后落地时刻结算一次）
            for (let b = 0; b < 3; b++) {
              const cnt = 2 + Math.floor(Math.random() * 4);   // 2-5 颗
              for (let k = 0; k < cnt; k++) {
                const ang = Math.random() * Math.PI * 2;
                const rr = Math.sqrt(Math.random()) * segR * 0.95;  // 圈内均匀采样
                const dx = px + Math.cos(ang) * rr;
                const dy = py + Math.sin(ang) * rr;
                const s = Math.random() * 0.1;            // 0.1s 内随机生成时刻
                g.fx.push({ type: 'raindrop', x: dx, y: dy - 260, tx: dx, ty: dy, t: -(w0 + s), dur: FALL + 0.25, r: perR, seed: Math.random() * 100 });
              }
            }
            // 每波一次结算：全部颗落地后（t = w0 + 0.1 + FALL）对火雨圈内敌人造成 24% 伤害并灼烧
            this.rainWaves.push({ t: w0 + 0.1 + FALL, px, py, r: segR, dmg: segDmg });
          }
          this.fxParticle(px, py, '#ffd24a', 3, 30, 0.4, 100, 4);
        }
      }
      // 延迟结算：每波在全部颗落地后对火雨圈内敌人结算 24% 伤害 + 灼烧（v1.16.21 由每颗结算改为每波结算）
      if (this.rainWaves && this.rainWaves.length) {
        const remaining = [];
        for (const wv of this.rainWaves) {
          wv.t -= dt;
          if (wv.t <= 0) {
            this.enemies().forEach((o) => {
              if (o.hp > 0 && Math.hypot(o.x - wv.px, o.y - wv.py) <= wv.r) {
                this.damage(o, wv.dmg, 'fire');
                this.applyBurn(o, wv.dmg, 'fire');   // 灼烧（叠层 DoT）
              }
            });
            // 落地余焰（轻量，替代 explode 重特效）
            this.fxParticle(wv.px, wv.py, '#ff7043', 5, wv.r * 0.5, 0.3, 120, 4);
            this.fxRing(wv.px, wv.py, '#ff9f43', wv.r, 0.35, 3);
          } else {
            remaining.push(wv);
          }
        }
        this.rainWaves = remaining;
      }
    }
    // 冰·冰花（v1.13.23 原霜星改周期技）：每 8 秒对最近 N 个敌人召唤冰花（范围 100 伤害；A 碎散传染、B 霜力伤害+40%/级、C 繁花数量+1/级）
    const flower = this.lv('ice', '冰花');
    if (flower > 0) {
      this.timers.iceFlower = (this.timers.iceFlower || 0) + dt;
      if (this.timers.iceFlower >= 8) {
        this.timers.iceFlower = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('ice', e.x, e.y));
        if (alive.length) {
          const n = 1 + this.branchLv('ice', '冰花', 'C');
          const dmg = this.shotDmg('ice') * 0.8 * (1 + 0.4 * this.branchLv('ice', '冰花', 'B'));
          const r = 100;
          const aLv = this.branchLv('ice', '冰花', 'A');
          const targets = alive.sort((a, b) => b.y - a.y).slice(0, n);   // 最近敌人（靠城墙侧优先）
          targets.forEach((tgt) => {
            // v1.16.9 伤害改为延迟到冰花第 3 帧动画末尾（dur 1.1s ÷ 4 帧 ≈ 0.275s/帧 → 0.825s≈0.8s）结算，
            // 此时冰花绽放完成"爆炸"，一并触发碎散传染与扩散演出
            const fxDmg = dmg;
            const fxALv = aLv;
            this.delayed.push({
              x: tgt.x, y: tgt.y, r: 100, dmg: fxDmg, delay: 0.8, t: 0, key: 'ice',
              fn: (cb) => {
                const hitOnes = cb.enemies().filter((o) => o.hp > 0 && Math.hypot(o.x - tgt.x, o.y - tgt.y) <= 100);
                hitOnes.forEach((o) => cb.damage(o, fxDmg, 'ice'));
                // A 碎散：冰花碎裂传染周边敌人（50% 伤害）
                if (fxALv > 0) {
                  hitOnes.forEach((h) => {
                    cb.enemies().forEach((o) => {
                      if (o !== h && o.hp > 0 && Math.hypot(o.x - h.x, o.y - h.y) <= 60) cb.damage(o, fxDmg * 0.4, 'ice');
                    });
                  });
                }
                // 爆炸演出：扩散冰环 + 冰晶碎瓣 + 闪光（与伤害同时）
                cb.fxRing(tgt.x, tgt.y, '#7fd4ff', 100, 0.5, 5);
                cb.fxParticle(tgt.x, tgt.y, '#b8e6ff', 16, 90, 0.6, 160, 6);
                cb.fxFlash(tgt.x, tgt.y, '#7fd4ff');
              }
            });
            // 冰花视觉：绽放六瓣冰花本体 + 扩散冰环 + 冰晶碎瓣 + 闪光（v1.13.26）
            this.game.fx.push({ type: 'shot', kind: 'icebloom', x: tgt.x, y: tgt.y, r, t: 0, dur: 1.1 });
          });
        }
      }
    }
    // 冰·冬珠（v1.13.23 原冻结率改持续球）：每 10 秒释放冰霜之球，球持续 5s，期内周期对周围造成伤害
    //     A 寒域：范围减速 30%；B 扩容：范围 +30%/级；C 凝华：数量 +1/级、伤害频率 +20%/级
    const orbSkill = this.lv('ice', '冬珠');
    if (orbSkill > 0) {
      this.timers.frostOrb = (this.timers.frostOrb || 0) + dt;
      if (this.timers.frostOrb >= 10) {
        this.timers.frostOrb = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('ice', e.x, e.y));
        if (alive.length) {
          const orbN = 1 + this.branchLv('ice', '冬珠', 'C');
          const r = 110 * (1 + 0.3 * this.branchLv('ice', '冬珠', 'B'));
          const tickI = 0.8 * (1 - 0.2 * this.branchLv('ice', '冬珠', 'C'));
          const slowA = this.branchLv('ice', '冬珠', 'A');
          const dmg = this.shotDmg('ice') * 0.44;   // v1.16.11 平衡：冬珠每跳 0.55→0.44×普攻
          const spots = alive.sort((a, b) => b.y - a.y).slice(0, orbN);  // 最近 N 个敌人位置落球
          this.frostOrbs = this.frostOrbs || [];
          spots.forEach((sp) => {
            this.frostOrbs.push({ x: sp.x, y: sp.y, r, ttl: 5, tickT: 0, tickI, dmg, slowA });
            this.game.fx.push({ type: 'shot', kind: 'frostorb', x: sp.x, y: sp.y, r, t: 0, dur: 5 });
            // v1.13.27 冬珠浮现光效：冰球凝现闪光 + 冰雾
            this.fxFlash(sp.x, sp.y, '#d6f0ff', 0.3);
            this.fxParticle(sp.x, sp.y, '#b8e6ff', 8, 70, 0.5, 140, 5);
          });
        }
      }
      // 冬珠持续推进（每跳范围伤害 + 减速）
      if (this.frostOrbs && this.frostOrbs.length) {
        const remain = [];
        for (const ob of this.frostOrbs) {
          ob.ttl -= dt;
          if (ob.ttl <= 0) { this.fxRing(ob.x, ob.y, '#7fd4ff', ob.r * 0.6, 0.3, 3); continue; }
          ob.tickT -= dt;
          if (ob.tickT <= 0) {
            ob.tickT += ob.tickI;
            this.enemies().forEach((o) => {
              if (o.hp <= 0 || Math.hypot(o.x - ob.x, o.y - ob.y) > ob.r) return;
              this.damage(o, ob.dmg, 'ice');
              if (ob.slowA > 0) this.applySlow(o, 0.3, 1);
            });
            this.fxRing(ob.x, ob.y, '#b8e6ff', ob.r * 0.5, 0.35, 3);
          }
          remain.push(ob);
        }
        this.frostOrbs = remain;
      }
    }
    // 冰墙（v1.13.25 原永冻改，驻场城墙护盾）：每 20 秒为城墙附魔冰霜之墙，持续 8+2A 秒，
    //     吸收 400 伤害；攻击冰墙的敌人减速 40% + 攻速减缓 ×1.5（由 main.js 攻城段结算吸收/反伤/迟缓）
    //     A 凝壁 持续+2s/级；B 霜反 反伤 30%/级；C 融暖 结束回血 40/级
    const wallSkill = this.lv('ice', '冰墙');
    if (wallSkill > 0) {
      this.timers.iceWall = (this.timers.iceWall || 0) + dt;
      // 冰墙驻场推进（ttl 递减，结束回血 + 消散特效）
      const iw = this.iceWall;
      if (iw && iw.ttl > 0) {
        iw.ttl -= dt;
        if (iw.ttl <= 0) {
          if (iw.heal > 0 && this.game.run) {
            const maxHp = this.game.run.lineMaxHp || CONFIG.LINE.hp;
            this.game.run.lineHp = Math.min(maxHp, this.game.run.lineHp + iw.heal);
          }
          this.fxRing(375, this.ly().wallY, '#7fd4ff', 300, 0.5, 5);
          this.fxParticle(375, this.ly().wallY, '#b8e6ff', 16, 90, 0.6, 160, 6);
          this.iceWall = null;
        }
      }
      if (this.timers.iceWall >= 20) {
        this.timers.iceWall = 0;
        this.iceWall = {
          ttl: 8 + 2 * this.branchLv('ice', '冰墙', 'A'),
          absorb: 500,   // v1.13.26 平衡：冰墙吸收 400→500
          reflect: 0.30 * this.branchLv('ice', '冰墙', 'B'),
          heal: 40 * this.branchLv('ice', '冰墙', 'C'),
        };
        this.game.fx.push({ type: 'shot', kind: 'icewall', x: 375, y: this.ly().wallY, t: 0, dur: this.iceWall.ttl });
        this.fxRing(375, this.ly().wallY, '#7fd4ff', 320, 0.6, 5);
        this.fxParticle(375, this.ly().wallY, '#b8e6ff', 18, 100, 0.7, 180, 6);
      }
    }
    const arc = this.lv('electric', '电弧');
    if (arc > 0) {
      // v1.13.20 削弱：周期 5×(1-0.2×Lv)（Lv4 2s）；伤害 0.5×(1+0.3×Lv)（Lv4 95%）；目标 5→3 且限塔射程
      // v1.13.22 分支补全：A 强弧 +50%/级、B 宽弧宽度 +30%/级、C 麻痹弧 20% 概率麻痹
      const arcA = this.branchLv('electric', '电弧', 'A');
      const arcB = this.branchLv('electric', '电弧', 'B');
      const arcC = this.branchLv('electric', '电弧', 'C');
      this.timers.arc = (this.timers.arc || 0) + dt;
      if (this.timers.arc >= 5 * (1 - 0.2 * (arc - 1))) {
        this.timers.arc = 0;
        const dmg = this.shotDmg('electric') * 0.4 * (1 + 0.3 * (arc - 1)) * (1 + 0.5 * arcA);
        // 电弧起点：电塔塔口（槽位坐标，与攻击弹道一致）
        const ly = this.ly();
        const n = g.run.slotOrder.length || 4; // 测试战场支持 6 塔出战；正式战斗 4 塔（口径不变）
    const rowW = n * ly.slotSize + (n - 1) * ly.slotGap;
        const startX = (750 - rowW) / 2;
        const slotW = ly.slotSize + ly.slotGap;
        const idx = (this.game.run.slotOrder || []).indexOf('electric');
        const tx = startX + (idx < 0 ? 0 : idx) * slotW + ly.slotSize / 2;
        const ty = ly.slotY + ly.slotSize / 2;
        const range = this.range('electric');
        const targets = this.enemies().filter((e) => e.hp > 0 && Math.abs(ty - e.y) <= range).sort((a, b) => b.y - a.y).slice(0, 3);
        targets.forEach((e) => {
          this.damage(e, dmg, 'electric');
          // C 麻痹弧：20% 概率麻痹 1.5s
          if (arcC > 0 && Math.random() < 0.20) {
            e.paralyzed = Math.max(e.paralyzed || 0, 1.5);
            this.applySlow(e, 0.5, 1.5);
            this.fxParticle(e.x, e.y, '#f4d03f', 6, 40, 0.4, 130, 5);
          }
          // 电弧视觉：塔口 → 目标 锯齿折线电弧（3 段随机拐点 + 抖动白芯；B 宽弧加粗）
          const path = [{ x: tx, y: ty }];
          for (let s = 1; s < 3; s++) {
            const t = s / 3;
            path.push({ x: tx + (e.x - tx) * t + (Math.random() * 26 - 13), y: ty + (e.y - ty) * t + (Math.random() * 26 - 13) });
          }
          path.push({ x: e.x, y: e.y });
          this.game.fx.push({ type: 'shot', kind: 'zigzag', path, t: 0, dur: 0.3, color: '#f4d03f', w: 3 * (1 + 0.3 * arcB) });
          this.fxFlash(e.x, e.y, '#f4d03f');
        });
      }
    }
    const storm = this.lv('electric', '雷暴');
    if (storm > 0) {
      // v1.13.20 雷暴重做：随机电击 N 个敌人；A=雷击目标+2/级；B=雷击连锁周边敌人；C=雷击间隔-25%/级
      const cLv = this.branchLv('electric', '雷暴', 'C');
      const period = 10 * (1 - 0.25 * cLv);   // C1 7.5 / C2 5 / C3 2.5s
      this.timers.storm = (this.timers.storm || 0) + dt;
      if (this.timers.storm >= period) {
        this.timers.storm = 0;
        const aLv = this.branchLv('electric', '雷暴', 'A');
        const bLv = this.branchLv('electric', '雷暴', 'B');
        const n = 3 + 2 * aLv;   // A0 3 / A1 5 / A2 7 / A3 9（v1.16.20 修正偏移）
        const dmg = this.shotDmg('electric') * 0.64 * (1 + 0.25 * (storm - 1));
        // 全图随机 N 个存活目标（Fisher-Yates）
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('electric', e.x, e.y));
        const pool = alive.slice();
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        const targets = pool.slice(0, n);
        // 按 y 从上到下分 2-3 批，每批间隔 0.12s（落雷演出分批）
        const sorted = targets.slice().sort((a, b) => a.y - b.y);
        const batches = Math.min(3, Math.max(2, Math.ceil(n / 3)));
        sorted.forEach((e, idx) => {
          const delay = Math.floor(idx * batches / n) * 0.12;
          // 雷击伤害（即时结算）
          this.damage(e, dmg, 'electric');
          // B 分支：雷击命中后连锁周边最近 bLv 个敌人（90px，50% 伤害）
          if (bLv > 0) {
            const chain = this.enemies().filter((o) => o.hp > 0 && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= 90)
              .sort((a2, b2) => Math.hypot(a2.x - e.x, a2.y - e.y) - Math.hypot(b2.x - e.x, b2.y - e.y)).slice(0, bLv);
            chain.forEach((o) => {
              this.damage(o, dmg * 0.5, 'electric');
              const cpath = [{ x: e.x, y: e.y }];
              const mx = (e.x + o.x) / 2 + (Math.random() * 14 - 7), my = (e.y + o.y) / 2 + (Math.random() * 14 - 7);
              cpath.push({ x: mx, y: my }, { x: o.x, y: o.y });
              this.game.fx.push({ type: 'shot', kind: 'zigzag', path: cpath, t: 0, dur: 0.3, color: '#7fc7ff', w: 2.5 });
              this.fxFlash(o.x, o.y, '#7fc7ff');
            });
          }
          // 雷暴演出：预兆圈 0.22s → 主闪分叉 → 地面电花（按批 delay 错开）
          this.game.fx.push({ type: 'shot', kind: 'storm', x: e.x, y: e.y, t: 0, dur: delay + 0.55, delay, seed: Math.floor(Math.random() * 9999) });
          this.fxParticle(e.x, e.y, '#f4d03f', 6, 40, 0.35, 140, 5);
          this.fxRing(e.x, e.y, '#f4d03f', 26, 0.35, 3);
        });
      }
    }
    // 毒·毒池（v1.15）：周期 5s 释放毒池（半径 130；A 伤 +40%/级；B 持续 +2s/级；C 范围 +30%/级），池内每秒毒伤并叠毒
    const pool = this.lv('poison', '毒池');
    if (pool > 0) {
      this.timers.pool = (this.timers.pool || 0) + dt;
      if (this.timers.pool >= 5) {
        this.timers.pool = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('poison', e.x, e.y));
        if (!alive.length) return;
        const tgt = alive[Math.floor(Math.random() * alive.length)];
        const pr = 130 * (1 + 0.3 * this.branchLv('poison', '毒池', 'C'));
        const dps = this.shotDmg('poison') * 0.28 * (1 + 0.4 * this.branchLv('poison', '毒池', 'A'));
        const ttl = 4 + 2 * this.branchLv('poison', '毒池', 'B');
        this.groundDots = this.groundDots || [];
        this.groundDots.push({ x: tgt.x, y: tgt.y, r: pr, ttl, key: 'poison', dps, stackPerSec: 1, seed: Math.random() * 100, color: '#1e8449' });
        this.fxRing(tgt.x, tgt.y, '#1e8449', pr, 0.8, 5);
        this.fxParticle(tgt.x, tgt.y, '#28b463', 8, 60, 0.6, 60, 5);
      }
    }
    // 毒·毒棒（v1.15）：周期 4s 召唤毒棒（A 数量 +1/级；B 持续 +2s 且 CD -0.5s/级），毒棒继承 30% 攻击独立攻击 200px 内敌人（C 目标 +1/级）
    const stick = this.lv('poison', '毒棒');
    if (stick > 0) {
      this.timers.stick = (this.timers.stick || 0) + dt;
      const cd = Math.max(1.5, 4 - 0.5 * this.branchLv('poison', '毒棒', 'B'));
      if (this.timers.stick >= cd) {
        this.timers.stick = 0;
        const n = 1 + this.branchLv('poison', '毒棒', 'A');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('poison', e.x, e.y));
        if (!alive.length) return;   // v1.16.18 没有敌人时不召唤毒棒
        for (let i = 0; i < n; i++) {
          const near = alive[Math.floor(Math.random() * alive.length)];
          const px = near.x + (Math.random() - 0.5) * 60;
          const py = near.y + (Math.random() - 0.5) * 60;
          const ttl = 10 + 2 * this.branchLv('poison', '毒棒', 'B');
          this.poisonSticks = this.poisonSticks || [];
          this.poisonSticks.push({ x: px, y: py, ttl, atkT: 0, atkI: 1, r: 200, dmg: this.shotDmg('poison') * 0.24, targets: 1 + this.branchLv('poison', '毒棒', 'C'), seed: Math.random() * 100 });
          this.fxRing(px, py, '#1e8449', 40, 0.5, 4);
          this.fxParticle(px, py - 6, '#28b463', 6, 30, 0.5, 80, 4);
        }
      }
    }
    // 毒·毒藤（v1.15）：周期 6s 从塔口射出藤蔓，缠住最靠城墙的敌人（A 目标 +1/级；B 时长 +1s/级），定身 + 持续叠毒；C 被缠死亡延伸
    const vine = this.lv('poison', '毒藤');
    if (vine > 0) {
      this.timers.vine = (this.timers.vine || 0) + dt;
      if (this.timers.vine >= 6) {
        this.timers.vine = 0;
        const n = 1 + this.branchLv('poison', '毒藤', 'A');
        const dur = 3 + this.branchLv('poison', '毒藤', 'B');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('poison', e.x, e.y)).sort((a, b) => b.y - a.y);
        const picks = alive.slice(0, n);
        const mus = this.towerMuzzle('poison');
        picks.forEach((e) => {
          e.frozen = Math.max(e.frozen || 0, dur);
          e._vineT = Math.max(e._vineT || 0, dur);
          // 毒藤攻击帧动画（v1.16.1）：藤蔓从塔口伸展生长到目标（0.55s），命中后持续缠绕由敌人 _vineT 驱动
          g.fx.push({ type: 'vine', x: mus.x, y: mus.y, tx: e.x, ty: e.y, t: 0, dur: 0.55, seed: Math.random() * 100 });
          this.fxRing(e.x, e.y, '#1e8449', 26, dur, 3);
        });
      }
    }
    // 炮·炮火支援（v1.16 周期）：每 12 秒对敌人密集区降下 3 发炮击（90%×威力，半径130；A 增援 +1发/级；C 焦土留燃烧地面 2s 30%/s）
    const support = this.lv('cannon', '炮火支援');
    if (support > 0) {
      this.timers.support = (this.timers.support || 0) + dt;
      if (this.timers.support >= 12) {
        this.timers.support = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('cannon', e.x, e.y));
        if (alive.length) {
          const n = 3 + this.branchLv('cannon', '炮火支援', 'A');
          const dmg = this.shotDmg('cannon') * 0.72 * (1 + 0.4 * this.branchLv('cannon', '炮火支援', 'B'));
          for (let i = 0; i < n; i++) {
            const t = alive[Math.floor(Math.random() * alive.length)];
            const px = t.x + (Math.random() - 0.5) * 40;
            const py = t.y + (Math.random() - 0.5) * 40;
            // 落点预兆圈 → 延迟爆炸（0.45s），C 焦土留地面
            this.fxRing(px, py, '#f39c12', 130, 0.45, 3);
            this.delayed.push({ x: px, y: py, r: 130, dmg, delay: 0.45, t: 0, key: 'cannon', knock: 0, slowAfter: false, ember: this.branchLv('cannon', '炮火支援', 'C') });
            this.fxParticle(px, py - 10, '#f39c12', 3, 30, 0.4, 90, 4);
          }
        }
      }
    }
    // 炮·地雷阵（v1.16 周期）：每 15 秒在城墙前 260px 沿线埋 3 颗地雷（A 布雷 +2/级；B 雷威 +50%/级；C 连爆击退+50% 连环），敌人踩中爆炸（130% 伤害·半径100）
    const mineLv = this.lv('cannon', '地雷阵');
    if (mineLv > 0) {
      this.timers.mine = (this.timers.mine || 0) + dt;
      if (this.timers.mine >= 15) {
        this.timers.mine = 0;
        const n = 3 + 2 * this.branchLv('cannon', '地雷阵', 'A');
        const wallY = this.ly().wallY - 10;
        const lineY = wallY - 260;
        const my = lineY + (Math.random() - 0.5) * 40;
        for (let i = 0; i < n; i++) {
          const mx = 40 + Math.random() * (700 - 80);
          this.mines = this.mines || [];
          this.mines.push({ x: mx, y: my, r: 100, dmg: this.shotDmg('cannon') * 1.2 * (1 + 0.5 * this.branchLv('cannon', '地雷阵', 'B')), armed: 0.3, ttl: 12, chain: this.branchLv('cannon', '地雷阵', 'C') });
          g.fx.push({ type: 'mine', x: mx, y: my, t: 0, dur: 12, seed: Math.random() * 100 });
          this.fxParticle(mx, my, '#b5651d', 4, 22, 0.35, 70, 4);
        }
      }
    }
    // 炮·炮台（v1.16 周期召唤）：每 10 秒部署一门自动炮台（A 增台 +1/级；B 久驻 +2s 且 CD -1s/级），独立炮击最靠墙敌人（70% 伤害·1s/发；C 重炮台爆炸范围 +30%/级）
    const turret = this.lv('cannon', '炮台');
    if (turret > 0) {
      this.timers.turret = (this.timers.turret || 0) + dt;
      const cd = Math.max(4, 10 - this.branchLv('cannon', '炮台', 'B'));
      if (this.timers.turret >= cd) {
        this.timers.turret = 0;
        const n = 1 + this.branchLv('cannon', '炮台', 'A');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('cannon', e.x, e.y));
        if (!alive.length) return;   // v1.16.18 没有敌人时不部署炮台
        for (let i = 0; i < n; i++) {
          const near = alive[Math.floor(Math.random() * alive.length)];
          const px = near.x + (Math.random() - 0.5) * 90;
          const py = near.y + (Math.random() - 0.5) * 90;
          const ttl = 8 + 2 * this.branchLv('cannon', '炮台', 'B');
          this.turrets = this.turrets || [];
          this.turrets.push({ x: px, y: py, ttl, atkT: 0, atkI: 0.9, dmg: this.shotDmg('cannon') * 0.68, r: 100 * (1 + 0.3 * this.branchLv('cannon', '炮台', 'C')) });
          g.fx.push({ type: 'turret', x: px, y: py, t: 0, dur: ttl, seed: Math.random() * 100 });
          this.fxRing(px, py, '#b5651d', 40, 0.5, 3.5);
        }
      }
    }
    // 回旋镖·风暴镖（v1.16 周期）：每 12 秒在敌人密集区召唤回旋镖风暴（持续3s，圈内每秒 45%×烈风 伤害；A 扩域 +30%/级；C 卷风减速 20%）
    const cyclone = this.lv('boomerang', '风暴镖');
    if (cyclone > 0) {
      this.timers.storm = (this.timers.storm || 0) + dt;
      if (this.timers.storm >= 12) {
        this.timers.storm = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('boomerang', e.x, e.y));
        if (alive.length) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          const sr = 145 * (1 + 0.3 * this.branchLv('boomerang', '风暴镖', 'A'));
          const dps = this.shotDmg('boomerang') * 0.44 * (1 + 0.3 * this.branchLv('boomerang', '风暴镖', 'B'));
          this.storms = this.storms || [];
          this.storms.push({ x: t.x, y: t.y, r: sr, ttl: 3, dps, slow: this.branchLv('boomerang', '风暴镖', 'C') > 0 });          g.fx.push({ type: 'cyclone', x: t.x, y: t.y, r: sr, t: 0, dur: 3, seed: Math.random() * 100 });
        }
      }
    }
    // 回旋镖·镖阵（v1.16 周期）：每 10 秒投出环形镖阵（8 枚镖向四周穿透；A 增镖 +4/级；B 利刃 +25%/级；C 切割 25% 减速 30%）
    const ringN = this.lv('boomerang', '镖阵');
    if (ringN > 0) {
      this.timers.ringN = (this.timers.ringN || 0) + dt;
      if (this.timers.ringN >= 10) {
        this.timers.ringN = 0;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('boomerang', e.x, e.y));
        if (alive.length) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          const n = 8 + 4 * this.branchLv('boomerang', '镖阵', 'A');
          const perDmg = this.shotDmg('boomerang') * 0.44 * (1 + 0.25 * this.branchLv('boomerang', '镖阵', 'B'));
          const mus = this.towerMuzzle('boomerang');
          const dur = 1.2;
          const R = 260;
          this.fxRing(t.x, t.y, '#c39bd3', 90, 0.5, 4);
          for (let i = 0; i < n; i++) {
            const ang = (Math.PI * 2 * i) / n;
            const ex = mus.x + Math.cos(ang) * R;
            const ey = mus.y + Math.sin(ang) * R;
            this.shots.push({ key: 'boomerang', dmg: perDmg, t: 0, dur, sx: mus.x, sy: mus.y, tx: ex, ty: ey, sweep: true, hitIds: {}, ring: true, cut: this.branchLv('boomerang', '镖阵', 'C') });
            g.fx.push({ type: 'shot', kind: 'arc', color: '#c39bd3', x: mus.x, y: mus.y, tx: ex, ty: ey, t: 0, dur, key: 'boomerang' });
          }
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
