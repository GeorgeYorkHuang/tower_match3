# -*- coding: utf-8 -*-
"""v1.16.114 普攻圣遗物缺口实装 + 焰雨三连特效重构补丁"""
import io

def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert old in s, f'anchor missing in {p}: {old[:60]!r}'
        assert s.count(old) == 1, f'anchor not unique in {p}: {old[:60]!r} (n={s.count(old)})'
        s = s.replace(old, new, 1)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('patched', p, f'({len(pairs)} anchors)')

C = r'F:\workspace\towerdefence\js\combat.js'

patch(C, [
    # ============ 1. interval() 塔专属攻速五件（1★/2★） ============
    ("""    const spdR = this.relicVal('cm_speed');
    if (spdR > 0) iv /= (1 + spdR / 100);""",
     """    const spdR = this.relicVal('cm_speed');
    if (spdR > 0) iv /= (1 + spdR / 100);
    // v1.16.114 塔专属攻速圣遗物（1★/2★）：熔炉之息/寒髓/电光/速射/疾风回旋 按塔生效
    const TOWER_ASPD = { fire: 'fire_forge', ice: 'ice_marrow', electric: 'elec_light', cannon: 'can_rapid', boomerang: 'boo_speed' };
    const aspR = this.relicVal(TOWER_ASPD[key]);
    if (aspR > 0) iv /= (1 + aspR / 100);"""),

    # ============ 2. tryAttackDebuff 概率五件（1★/2★） ============
    ("""      const ignite = this.lv('fire', '点燃');
      let burnProb = 0.20;
      if (ignite > 0) burnProb += 0.25 + 0.15 * this.branchLv('fire', '点燃', 'A');""",
     """      const ignite = this.lv('fire', '点燃');
      let burnProb = 0.20;
      if (ignite > 0) burnProb += 0.25 + 0.15 * this.branchLv('fire', '点燃', 'A');
      burnProb += this.relicVal('fire_fuel') / 100;   // v1.16.114 薪柴1★/2★：普攻灼烧概率 +20%/30%"""),
    ("""      const probSlow = 0.20 + (frost > 0 ? 0.25 + 0.15 * this.branchLv('ice', '寒霜', 'A') : 0);""",
     """      const probSlow = 0.20 + (frost > 0 ? 0.25 + 0.15 * this.branchLv('ice', '寒霜', 'A') : 0) + this.relicVal('ice_extreme') / 100;   // v1.16.114 极寒1★/2★"""),
    ("""      const pProb = Math.min(1, 0.20 + (paraLv > 0 ? 0.20 : 0) + 0.15 * pA);""",
     """      const pProb = Math.min(1, 0.20 + (paraLv > 0 ? 0.20 : 0) + 0.15 * pA + this.relicVal('elec_strong') / 100);   // v1.16.114 强麻1★/2★"""),
    ("""      const toxic = this.lv('poison', '剧毒');
      if (toxic > 0) prob += 0.25 + 0.15 * this.branchLv('poison', '剧毒', 'A');""",
     """      const toxic = this.lv('poison', '剧毒');
      if (toxic > 0) prob += 0.25 + 0.15 * this.branchLv('poison', '剧毒', 'A');
      prob += this.relicVal('poison_fang') / 100;   // v1.16.114 毒牙1★/2★"""),
    ("""      const bleedChance = 0.20 + (bleedLv > 0 ? 0.25 + 0.15 * this.branchLv('boomerang', '放血', 'A') : 0);""",
     """      const bleedChance = 0.20 + (bleedLv > 0 ? 0.25 + 0.15 * this.branchLv('boomerang', '放血', 'A') : 0) + this.relicVal('boo_bleed') / 100;   // v1.16.114 放血刃1★/2★"""),

    # ============ 3. 霜刺1★/2★ 冰缓幅度（hitIce 冰缓段） ============
    ("""        const mult = 0.30 + SKILL_NUM.ice['寒霜'].slowMult[this.branchLv('ice', '寒霜', 'C')];
        const ttl = 3 + SKILL_NUM.ice['寒霜'].ttl[this.branchLv('ice', '寒霜', 'B')];""",
     """        const mult = 0.30 + SKILL_NUM.ice['寒霜'].slowMult[this.branchLv('ice', '寒霜', 'C')] + this.relicVal('ice_spike') / 100;   // v1.16.114 霜刺1★/2★
        const ttl = 3 + SKILL_NUM.ice['寒霜'].ttl[this.branchLv('ice', '寒霜', 'B')];"""),

    # ============ 4. boo_catch 1★/2★ 接镖增伤 ============
    ("""      if (this.bWait[key]) {
        this.bWait[key] = false;
        // v1.16.102 疾接3★：接镖瞬间 0.3 秒无敌帧（对精英投射物有效，窗口由 run._wallInvT 承载）
        if (g.run.relic3('boo_catch')) g.run._wallInvT = 0.3;""",
     """      if (this.bWait[key]) {
        this.bWait[key] = false;
        // v1.16.114 疾接1★/2★：接镖后下一镖造成的伤害提升 15%/20%（叠加在接镖 C 续投之上）
        this._nextDmg[key] = (this._nextDmg[key] || 0) + this.relicVal('boo_catch') / 100;
        // v1.16.102 疾接3★：接镖瞬间 0.3 秒无敌帧（对精英投射物有效，窗口由 run._wallInvT 承载）
        if (g.run.relic3('boo_catch')) g.run._wallInvT = 0.3;"""),

    # ============ 5. boo_multi 1★/2★ 投掷镖数 ============
    ("""      const n = 1 + multi;
      const decay = multi > 0 ? (0.12 * multi) * (this.branchLv('boomerang', '多镖', 'B') > 0 ? 0.5 : 1) : 0;""",
     """      const n = 1 + multi + this.relicVal('boo_multi');   // v1.16.114 镖群1★/2★：每次投掷镖数 +2/+3
      const decay = multi > 0 ? (0.12 * multi) * (this.branchLv('boomerang', '多镖', 'B') > 0 ? 0.5 : 1) : 0;"""),

    # ============ 6. boo_spin 1★/2★ 镖速 ============
    ("""      const flyBoost = 1 + 0.20 * this.branchLv('boomerang', '接镖', 'A');
      const bDur = dur / flyBoost;""",
     """      const flyBoost = 1 + 0.20 * this.branchLv('boomerang', '接镖', 'A') + this.relicVal('boo_spin') / 100;   // v1.16.114 回旋1★/2★：镖速 +20%/30%
      const bDur = dur / flyBoost;"""),

    # ============ 7. can_double 1★/2★ 双发概率 ============
    ("""    const duelProb = key === 'cannon' ? (0.25 + 0.15 * this.branchLv('cannon', '双管齐射', 'A')) : 0;""",
     """    const duelProb = key === 'cannon' ? (0.25 + 0.15 * this.branchLv('cannon', '双管齐射', 'A') + this.relicVal('can_double') / 100) : 0;   // v1.16.114 双发1★/2★"""),

    # ============ 8. fire_rain 多重火球 n ============
    ("""      const n = 5 + this.branchLv('fire', '多重火球', 'A');          // v1.16.21 基础 5 枚（主 + 4 散射，+2 普通火球）；A 每级 +1""",
     """      const n = 5 + this.branchLv('fire', '多重火球', 'A') + this.relicVal('fire_rain');   // v1.16.114 焰雨1★/2★：每次攻击火球数量 +2/+3"""),

    # ============ 9. fire_nuke 1★/2★ 多重火球爆炸半径 ============
    ("""          const bgr = 130 * (1 + 0.30 * this.branchLv('fire', '大火球', 'A'));""",
     """          const bgr = 130 * (1 + 0.30 * this.branchLv('fire', '大火球', 'A')) * (1 + this.relicVal('fire_nuke') / 100);   // v1.16.114 爆核1★/2★"""),

    # ============ 10. 焰雨三连重构：3 条真实火球弹道（任务#88） ============
    ("""    if (run.relic3('fire_rain')) {
      if (run._fireTripleNext) {
        run._fireTripleNext = false;
        for (let k = 0; k < 3; k++) {
          this.damage(e, dmg, 'fire');
          this.fxFlash(e.x, e.y, '#ff9f43', 0.22);
          this.fxParticle(e.x, e.y - 8, '#ffd24a', 4, 40, 0.35, 130, 4);
        }
        this.fxRing(e.x, e.y, '#ff9f43', 60, 0.5, 4);
        if (g.fx) g.fx.push({ type: 'floatText', text: '焰雨·三连！', x: e.x, y: e.y - 46, t: 0, dur: 0.9, size: 22, color: '#ffd24a' });   // v1.16.113 触发确认飘字
      } else {
        e._fireHits = (e._fireHits || 0) + 1;
        if (e._fireHits >= 3) { e._fireHits = 0; run._fireTripleNext = true; }
      }
    }""",
     """    if (run.relic3('fire_rain')) {
      if (run._fireTripleNext) {
        run._fireTripleNext = false;
        // v1.16.114 三连重构：命中 3 次后追加 3 次完整普攻——发射 3 条真实火球弹道（扇形直瞄），
        //   命中走完整结算（灼烧判定/大火球爆炸/多重火球 C 分裂），即三连在大火球、多重火球下也会多次触发其攻击效果
        const mz = this.towerMuzzle('fire');
        const R = this.range('fire');
        const durF = CONFIG.TOWERS.fire.shot.dur;
        const dx = e.x - mz.x, dy = e.y - mz.y;
        for (let k = 0; k < 3; k++) {
          const off = (k - 1) * 0.10;
          const cos = Math.cos(off), sin = Math.sin(off);
          const tx = mz.x + dx * cos - dy * sin;
          const ty = mz.y + dx * sin + dy * cos;
          const st = (o) => this._fireImpact(o, dmg, off);
          this.shots.push({ key: 'fire', scatter: true, dmg, t: 0, dur: durF, sx: mz.x, sy: mz.y, tx, ty, hitR: 45, onHit: st });
          g.fx.push({ type: 'shot', kind: 'line', color: '#ff7043', x: mz.x, y: mz.y, t: 0, dur: durF, key: 'fire', aim: true, scale: 1.15, tx, ty });
        }
        this.fxRing(e.x, e.y, '#ff9f43', 60, 0.5, 4);
        if (g.fx) g.fx.push({ type: 'floatText', text: '焰雨·三连！', x: e.x, y: e.y - 46, t: 0, dur: 0.9, size: 22, color: '#ffd24a' });   // v1.16.113 触发确认飘字
      } else {
        e._fireHits = (e._fireHits || 0) + 1;
        if (e._fireHits >= 3) { e._fireHits = 0; run._fireTripleNext = true; }
      }
    }"""),

    # ============ 11. fire_rain 单发（无多重火球）追加 N 枚散射火球 ============
    ("""    } else {
      this.damage(e, dmg * mainMult, 'fire');                        // 单发（无多重火球时）
    }""",
     """    } else {
      this.damage(e, dmg * mainMult, 'fire');                        // 单发（无多重火球时）
      // v1.16.114 焰雨1★/2★（无多重火球时）：单发也追加 N 枚散射火球（完整命中结算：灼烧/大火球/C 分裂）
      const rainN = this.relicVal('fire_rain');
      if (rainN > 0) {
        const mz0 = this.towerMuzzle('fire');
        const R0 = this.range('fire');
        const rr = this.shotDmg('fire');
        const hitR0 = 45;
        for (let i = 0; i < rainN; i++) {
          const off0 = (Math.random() * 2 - 1) * 0.20;
          const tx0 = mz0.x + Math.sin(off0) * R0, ty0 = mz0.y - Math.cos(off0) * R0;
          const st0 = (o) => this._fireImpact(o, rr, off0);
          this.shots.push({ key: 'fire', scatter: true, dmg: rr, t: 0, dur: CONFIG.TOWERS.fire.shot.dur, sx: mz0.x, sy: mz0.y, tx: tx0, ty: ty0, hitR: hitR0, onHit: st0 });
          g.fx.push({ type: 'shot', kind: 'line', color: '#ff7043', x: mz0.x, y: mz0.y, t: 0, dur: CONFIG.TOWERS.fire.shot.dur, key: 'fire', aim: true, scale: 1.0, tx: tx0, ty: ty0 });
        }
      }
    }"""),

    # ============ 12. 单发大火球爆炸抽为 helper（含爆核1★/2★）+ _fireImpact helper ============
    ("""    // 大火球：爆炸范围溅射（扩大 +30%/级、强化 +20%/级、引燃 50%/75%/100% 概率点燃）
    // v1.16.21：多重火球叠加时每枚火球命中处已各自爆炸（见 strike）；此块仅处理未学多重火球的单发大火球
    if (big > 0 && multi <= 0) {
      const r = 130 * (1 + 0.30 * this.branchLv('fire', '大火球', 'A'));
      const splDmg = dmg * 0.48 * (1 + 0.20 * this.branchLv('fire', '大火球', 'B'));
      const igniteProb = 0.50 * this.branchLv('fire', '大火球', 'C');
      this.enemies().forEach((o) => {
        if (o === e || o.hp <= 0) return;
        const d2 = Math.hypot(o.x - e.x, o.y - e.y);
        if (d2 <= r) {
          this.damage(o, splDmg, 'fire');
          if (igniteProb > 0 && Math.random() < igniteProb) this.applyBurn(o, dmg, 'fire');
          // v1.16.96 爆核3★：爆炸边缘敌人被击退 40码 并点燃
          if (g.run.relic3('fire_nuke') && d2 > r * 0.5) {
            o.y = Math.max(50, o.y - 40);
            this.applyBurn(o, dmg, 'fire');
            this.fxParticle(o.x, o.y, '#ff9f43', 3, 24, 0.3, 100, 4);
          }
        }
      });
      // 大火球视觉：大爆炸环 + 火焰粒子
      this.fxRing(e.x, e.y, '#ff7043', r, 0.4, 4);
      this.fxParticle(e.x, e.y, '#ffab40', 10, r, 0.5, 160, 6);
      this.fxFlash(e.x, e.y, '#ff9f43');
    }
  }""",
     """    // 大火球：爆炸范围溅射（扩大 +30%/级、强化 +20%/级、引燃 50%/75%/100% 概率点燃）
    // v1.16.21：多重火球叠加时每枚火球命中处已各自爆炸（见 strike）；此块仅处理未学多重火球的单发大火球
    if (big > 0 && multi <= 0) this._fireSingleBlast(e, dmg);
  }

  /** v1.16.114 单发大火球爆炸（普攻单发 / 焰雨追加火球共用；含爆核1★/2★ 半径扩大与 3★ 边缘击退点燃） */
  _fireSingleBlast(e, dmg) {
    const r0 = 130 * (1 + 0.30 * this.branchLv('fire', '大火球', 'A')) * (1 + this.relicVal('fire_nuke') / 100);
    const splDmg = dmg * 0.48 * (1 + 0.20 * this.branchLv('fire', '大火球', 'B'));
    const igniteProb = 0.50 * this.branchLv('fire', '大火球', 'C');
    this.enemies().forEach((o) => {
      if (o === e || o.hp <= 0) return;
      const d2 = Math.hypot(o.x - e.x, o.y - e.y);
      if (d2 <= r0) {
        this.damage(o, splDmg, 'fire');
        if (igniteProb > 0 && Math.random() < igniteProb) this.applyBurn(o, dmg, 'fire');
        // v1.16.96 爆核3★：爆炸边缘敌人被击退 40码 并点燃
        if (this.game.run.relic3('fire_nuke') && d2 > r0 * 0.5) {
          o.y = Math.max(50, o.y - 40);
          this.applyBurn(o, dmg, 'fire');
          this.fxParticle(o.x, o.y, '#ff9f43', 3, 24, 0.3, 100, 4);
        }
      }
    });
    // 大火球视觉：大爆炸环 + 火焰粒子
    this.fxRing(e.x, e.y, '#ff7043', r0, 0.4, 4);
    this.fxParticle(e.x, e.y, '#ffab40', 10, r0, 0.5, 160, 6);
    this.fxFlash(e.x, e.y, '#ff9f43');
  }

  /** v1.16.114 火球命中统一结算（焰雨三连 / 焰雨1★2★ 追加火球共用）：
   *  伤害 + 统一灼烧判定 + 多重火球 C 散射分裂 + 大火球爆炸——即三连在多重火球/大火球下多次触发其攻击效果 */
  _fireImpact(o, d, ang) {
    const g = this.game;
    this.damage(o, d, 'fire');
    this.tryAttackDebuff('fire', o, d);
    this.fxParticle(o.x, o.y, '#ff9f43', 6, 46, 0.35, 140, 5);
    this.fxRing(o.x, o.y, '#ff7043', 26, 0.25, 3);
    this.fxFlash(o.x, o.y, '#ffd24a', 0.2);
    // 多重火球 C 散射分裂（档位式 3/4/5，每个 25% 伤害 + 统一灼烧判定）
    const cLv = this.branchLv('fire', '多重火球', 'C');
    if (this.lv('fire', '多重火球') > 0 && cLv > 0) {
      const nSplit = SKILL_NUM.fire['多重火球'].scatterSplit[cLv];
      const R = this.range('fire');
      for (let k = 0; k < nSplit; k++) {
        const off = -Math.PI / 3 + (k / Math.max(1, nSplit - 1)) * (2 * Math.PI / 3);
        const da = off + (ang || 0);
        const tx2 = o.x + Math.cos(da) * R, ty2 = o.y + Math.sin(da) * R;
        const mStrike = (m2) => {
          this.damage(m2, d * 0.25, 'fire');
          this.tryAttackDebuff('fire', m2, d);
          this.fxParticle(m2.x, m2.y, '#ffd24a', 4, 30, 0.3, 110, 4);
        };
        this.shots.push({ key: 'fire', scatter: true, dmg: d * 0.25, t: 0, dur: CONFIG.TOWERS.fire.shot.dur * 0.8, sx: o.x, sy: o.y, tx: tx2, ty: ty2, hitR: 30, onHit: mStrike });
        g.fx.push({ type: 'shot', kind: 'line', color: '#ffd24a', x: o.x, y: o.y, t: 0, dur: CONFIG.TOWERS.fire.shot.dur * 0.8, key: 'fire', aim: true, scale: 0.9, tx: tx2, ty: ty2 });
      }
    }
    // 大火球爆炸（含爆核1★/2★ 半径扩大）
    if (this.lv('fire', '大火球') > 0) this._fireSingleBlast(o, d);
  }"""),

    # ============ 13. ice_blizzard C 增殖 n ============
    ("""        const n = SKILL_NUM.ice['多重冰锥'].swarm[cLv] + aLv;""",
     """        const n = SKILL_NUM.ice['多重冰锥'].swarm[cLv] + aLv + this.relicVal('ice_blizzard');   // v1.16.114 暴雪1★/2★"""),

    # ============ 14. ice_blizzard 多重冰锥 n ============
    ("""        const n = 3 + aLv;                                  // 基础 3 枚 = 主 + 2 散射（v1.16.20 修正为 3+分支级）""",
     """        const n = 3 + aLv + this.relicVal('ice_blizzard');   // v1.16.114 暴雪1★/2★：每次攻击冰锥数量 +2/+3"""),

    # ============ 15. ice_pierce 穿透数 ============
    ("""      const pierceN = 1 + aLv;   // 基础 1 名 + A 每级 1 → 1/2/3/4""",
     """      const pierceN = 1 + aLv + this.relicVal('ice_pierce');   // v1.16.114 穿透凝冰1★/2★：+1/+2"""),

    # ============ 16. hitIce 单发追加冰锥（暴雪1★/2★ 无多重冰锥时） ============
    ("""  hitIce(e, dmg) {
    this.damage(e, dmg, 'ice');
    // v1.13.27 普攻命中打击特效：冰锥撞击爆冰晶（白屑 + 蓝屑 + 小环 + 微闪）
    this.fxParticle(e.x, e.y, '#eaf6ff', 6, 44, 0.30, 130, 5);""",
     """  hitIce(e, dmg) {
    this.damage(e, dmg, 'ice');
    // v1.16.114 暴雪1★/2★（未学多重冰锥时）：单发追加 N 枚散射冰锥（命中结算：冰缓/冰冻/暴雪3★ 冰爆）
    const blzN = this.relicVal('ice_blizzard');
    if (blzN > 0) {
      const mzI = this.towerMuzzle('ice');
      const RI = this.range('ice');
      const durI = CONFIG.TOWERS.ice.shot.dur;
      for (let i = 0; i < blzN; i++) {
        const offI = blzN > 1 ? (i / (blzN - 1) - 0.5) * 0.24 : 0;
        const txI = mzI.x + Math.sin(offI) * RI;
        const tyI = mzI.y - Math.cos(offI) * RI;
        const stI = (o) => {
          this.damage(o, dmg, 'ice');
          this.tryAttackDebuff('ice', o, dmg);
          this.iceHitFx(o, dmg);
          this.fxParticle(o.x, o.y, '#b8e6ff', 4, 34, 0.3, 110, 4);
        };
        this.shots.push({ key: 'ice', scatter: true, dmg, t: 0, dur: durI, sx: mzI.x, sy: mzI.y, tx: txI, ty: tyI, hitR: 45, onHit: stI });
        this.game.fx.push({ type: 'shot', kind: 'line', color: '#7fd4ff', x: mzI.x, y: mzI.y, t: 0, dur: durI, key: 'ice', aim: true, scale: 1.15, tx: txI, ty: tyI });
      }
    }
    // v1.13.27 普攻命中打击特效：冰锥撞击爆冰晶（白屑 + 蓝屑 + 小环 + 微闪）
    this.fxParticle(e.x, e.y, '#eaf6ff', 6, 44, 0.30, 130, 5);"""),

    # ============ 17. elec_arc 连锁数 ============
    ("""      const extra = (2 + 1 * chainA + (super3 ? 1 : 0)) + (this.game.run.relic3('elec_light') && (this.tower('electric')._chargeLayers || 0) > 0 ? 1 : 0);   // 电光3★：攻速加成期间连锁数量 +1""",
     """      const extra = (2 + 1 * chainA + (super3 ? 1 : 0)) + this.relicVal('elec_arc')   // v1.16.114 电弧1★/2★：攻击连锁 +2/+3
        + (this.game.run.relic3('elec_light') && (this.tower('electric')._chargeLayers || 0) > 0 ? 1 : 0);   // 电光3★：攻速加成期间连锁数量 +1"""),

    # ============ 18. elec_overload 充能上限 ============
    ("""        e.overload.n = Math.min(3, e.overload.n + 1);
        e.overload.ttl = 2;
        // v1.16.101 过载3★：满层过载时标记下一发普攻必为双倍伤害
        if (this.game.run.relic3('elec_overload') && e.overload.n >= 3) e._ovDbl = true;""",
     """        const ovCap = 3 + this.relicVal('elec_overload');   // v1.16.114 过载1★/2★：充能层数上限 +2/+3
        e.overload.n = Math.min(ovCap, e.overload.n + 1);
        e.overload.ttl = 2;
        // v1.16.101 过载3★：满层过载时标记下一发普攻必为双倍伤害（满层=当前上限）
        if (this.game.run.relic3('elec_overload') && e.overload.n >= ovCap) e._ovDbl = true;"""),

    # ============ 19. can_heavy 爆炸范围 ============
    ("""    let r = 100 * (1 + 0.25 * heavy + 0.15 * this.branchLv('cannon', '重炮', 'A'));
    if (overheat) r *= 1.3;   // 过热弹爆炸半径 +30%""",
     """    let r = 100 * (1 + 0.25 * heavy + 0.15 * this.branchLv('cannon', '重炮', 'A'));
    if (heavy > 0) r *= (1 + this.relicVal('can_heavy') / 100);   // v1.16.114 重爆1★/2★：爆炸范围 +30%/45%
    if (overheat) r *= 1.3;   // 过热弹爆炸半径 +30%"""),

    # ============ 20. can_knock 击退距离 ============
    ("""      knock = 60 * (1 + 0.4 * this.branchLv('cannon', '震击', 'A'));""",
     """      knock = 60 * (1 + 0.4 * this.branchLv('cannon', '震击', 'A')) * (1 + this.relicVal('can_knock') / 100);   // v1.16.114 震烈1★/2★"""),

    # ============ 21. can_pierce 弹片贯穿 ============
    ("""      const n = pierceAll ? Infinity : 2 + this.branchLv('cannon', '贯穿弹', 'A');""",
     """      const n = pierceAll ? Infinity : 2 + this.branchLv('cannon', '贯穿弹', 'A') + this.relicVal('can_pierce');   // v1.16.114 穿透1★/2★"""),

    # ============ 22. can_incend 落地点燃概率（explode 内） ============
    ("""      // v1.16.103 燃烧弹3★：炮弹爆炸 100% 引燃敌人
      if (key === 'cannon' && g.run.relic3('can_incend')) this.applyBurn(o, dmg);""",
     """      // v1.16.114 燃烧弹1★/2★：炮弹爆炸 N% 概率点燃敌人；3★ 100% 引燃
      if (key === 'cannon') {
        const incN = this.relicVal('can_incend');
        if ((incN > 0 && Math.random() < incN / 100) || g.run.relic3('can_incend')) this.applyBurn(o, dmg);
      }"""),

    # ============ 23. boo_hunt 标记易伤（damage 内） ============
    ("""    const mkA = this.branchLv('boomerang', '猎手标记', 'A');
    if (mkA > 0 && (e._mark || 0) > 0) v *= (1 + SKILL_NUM.boomerang['猎手标记'].deep[mkA]);""",
     """    const mkA = this.branchLv('boomerang', '猎手标记', 'A');
    if (mkA > 0 && (e._mark || 0) > 0) v *= (1 + SKILL_NUM.boomerang['猎手标记'].deep[mkA]);
    // v1.16.114 猎心1★/2★：被标记敌人受到的伤害提升 12%/15%（全来源，含普攻）
    if (this.relicVal('boo_hunt') > 0 && (e._mark || 0) > 0) v *= (1 + this.relicVal('boo_hunt') / 100);"""),

    # ============ 24. ice_glacier 减速幅度 + ice_condense 减速时长（applySlow 内） ============
    ("""  applySlow(e, mult, ttl) {
    // v1.16.98 冰川3★：敌人身上每存在 1 个减速类 debuff，其受到的减速效果 +8%（多 debuff 协同）
    if (this.game.run.relic3('ice_glacier')) {
      const n = ((e.slow && e.slow.ttl > 0) ? 1 : 0) + (e.frozen > 0 ? 1 : 0) + ((e._vineT || 0) > 0 ? 1 : 0);
      if (n > 0) mult = Math.min(0.9, mult * (1 + 0.08 * n));
    }""",
     """  applySlow(e, mult, ttl) {
    // v1.16.114 冰川1★/2★：所有减速效果的幅度提升 15%/20%
    mult *= (1 + this.relicVal('ice_glacier') / 100);
    // v1.16.114 凝霜1★/2★：减速持续时间延长 1/1.5 秒（与凝霜3★ 同口径）
    ttl += this.relicVal('ice_condense');
    // v1.16.98 冰川3★：敌人身上每存在 1 个减速类 debuff，其受到的减速效果 +8%（多 debuff 协同）
    if (this.game.run.relic3('ice_glacier')) {
      const n = ((e.slow && e.slow.ttl > 0) ? 1 : 0) + (e.frozen > 0 ? 1 : 0) + ((e._vineT || 0) > 0 ? 1 : 0);
      if (n > 0) mult = Math.min(0.9, mult * (1 + 0.08 * n));
    }"""),

    # ============ 25. ice_forever 冰冻时长（freezeE 内） ============
    ("""    const d = (e.isBoss ? dur * 0.6 : dur);
    const prev = e.frozen || 0;""",
     """    const d = (e.isBoss ? dur * 0.6 : dur) + this.relicVal('ice_forever');   // v1.16.114 永冻1★/2★：冰冻时长 +1/1.5s
    const prev = e.frozen || 0;"""),
])
print('ALL PATCHED')
