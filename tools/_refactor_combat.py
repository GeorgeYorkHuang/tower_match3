# -*- coding: utf-8 -*-
"""combat.js 重构步骤1：弹道推进收敛 stepShot + 主循环拆子方法（行为零变更）"""
import io, sys

P = r"F:\workspace\towerdefence\js\combat.js"
with io.open(P, "r", encoding="utf-8") as f:
    src = f.read()

# ---------- 替换 A：弹道循环 + 延迟爆炸段 → 短调用 ----------
oldA = """    // 1. 飞行弹道推进与命中结算（回旋镖 sweep：沿途扫过伤害；散射 scatter：无目标沿途碰撞；其余：终点单体命中）
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      if (s.orb) {
        // v1.16.21 游走电球（活电扩散）：每帧随机转向漂移（转向幅度加大 ±1.6 rad，配合等分初角更像四周扩散），命中 34px 内敌人即结算消失，dur 耗尽消散
        s.ang += (Math.random() - 0.5) * 3.2;
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
            this.damage(hitE, s.dmg, 'boomerang');
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
"""
newA = """    // 1. 飞行弹道推进与命中结算（回旋镖 sweep：沿途扫过伤害；散射 scatter：无目标沿途碰撞；其余：终点单体命中）
    for (let i = this.shots.length - 1; i >= 0; i--) {
      if (!this.stepShot(this.shots[i], dt)) this.shots.splice(i, 1);
    }
    // 2. 延迟爆炸（炮引信/炮火支援落点）
    this.updateDelayed(dt);
"""
assert src.count(oldA) == 1, "A anchor not found: %d" % src.count(oldA)
src = src.replace(oldA, newA)

# ---------- 替换 B：3.5~3.10 实体推进段 → 子方法调用 ----------
oldB = """    // 3.5 地面区域持续效果：火·火柱余烬（直伤）/ 毒·毒池·毒沼（直伤 + 每秒叠毒，v1.15）
    if (this.groundDots && this.groundDots.length) {
      for (let i = this.groundDots.length - 1; i >= 0; i--) {
        const gd = this.groundDots[i];
        gd.ttl -= dt;
        if (gd.ttl <= 0) { this.groundDots.splice(i, 1); continue; }
        this.enemies().forEach((o) => {
          if (o.hp <= 0 || Math.hypot(o.x - gd.x, o.y - gd.y) > gd.r) return;
          if (gd.dps) this.damage(o, gd.dps * dt, gd.key || 'fire');
          // v1.16.42 毒沼：泥沼减速（与毒池区分——毒沼纯叠毒 + 减速，无直伤）
          if (gd.swamp && gd.slow) this.applySlow(o, gd.slow, 1);
          if (gd.key === 'poison' && gd.stackPerSec) {
            gd._t = (gd._t || 0) + dt;
            while (gd._t >= 1) {
              gd._t -= 1;
              this.applyPoison(o, this.shotDmg('poison'), 'poison', gd.stackPerSec);
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
    // 3.7 炮·地雷（v1.16.22）：雷从塔口抛投（200px/s）飞向部署点，飞行期间不可引爆，落地布设 0.3s 后可引爆；
    //   敌人踩中（接触半径 60）引爆，C 连爆击退且 50% 连环引爆相邻地雷
    if (this.mines && this.mines.length) {
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
        if (m.ttl <= 0) { this.mines.splice(i, 1); continue; }
        if (m.armed > 0) continue;
        const hit = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) <= 60);
        if (!hit) continue;
        this.mines.splice(i, 1);
        this.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false);
        if (m.chain > 0) {
          // v1.16.42 C 连爆 → 碎雷重做：爆炸后星状向四周 130px 内散射 5/6/7 片弹片，每片 30% 攻击伤害
          const nShard = 5 + (m.chain - 1);
          const shardDmg = this.shotDmg('cannon') * 0.30;
          for (let k = 0; k < nShard; k++) {
            const ang = (Math.PI * 2 * k) / nShard + (Math.random() - 0.5) * 0.4;
            const tx2 = m.x + Math.cos(ang) * 130, ty2 = m.y + Math.sin(ang) * 130;
            const shard = {
              key: 'cannon', dmg: shardDmg, t: 0, dur: 130 / 500, sx: m.x, sy: m.y, tx: tx2, ty: ty2,
              scatter: true, hitR: 34,
              onHit: (o, dd) => { this.damage(o, dd, 'cannon'); this.fxParticle(o.x, o.y, '#d89e63', 3, 18, 0.3, 80, 4); },
            };
            this.shots.push(shard);
            this.game.fx.push({ type: 'shot', kind: 'line', color: '#e6b980', x: m.x, y: m.y, t: 0, dur: 130 / 500, key: 'cannon', aim: true, scale: 0.8, tx: tx2, ty: ty2 });
          }
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
    // 3.9 回旋镖·风暴镖（v1.16.21 重做）：三同心圈旋转小飞镖（圈不可见），内/中/外圈 4/6/8 枚，每镖独立命中造成 10% 伤害；
    //   内圈与外圈顺时针、中圈逆时针（各圈角速度不同），命中不消失（同敌仅结算一次，继续旋转命中其他敌人）
    if (this.storms && this.storms.length) {
      for (let i = this.storms.length - 1; i >= 0; i--) {
        const st = this.storms[i];
        st.ttl -= dt;
        if (st.ttl <= 0) {
          if (st.fx) st.fx.t = st.fx.dur;   // v1.16.38 同步结束风暴镖 fx
          this.storms.splice(i, 1);
          continue;
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
"""
newB = """    // 3.5 地面持续区域（火·余烬 / 毒·毒池·毒沼）
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
"""
assert src.count(oldB) == 1, "B anchor not found: %d" % src.count(oldB)
src = src.replace(oldB, newB)

# ---------- 插入子方法（update 之后） ----------
marker = """  /* ---------- 敌人状态推进 ---------- */"""
methods = """  /* ---------- 弹道与召唤物推进（v1.16.43 重构：主循环子方法） ---------- */

  /** 单枚飞行弹道推进一帧；返回 false 表示命中结算/耗尽，应移除 */
  stepShot(s, dt) {
    const g = this.game;
    s.t += dt;
    if (s.orb) {
      // v1.16.21 游走电球（活电扩散）：每帧随机转向漂移（转向幅度加大 ±1.6 rad，配合等分初角更像四周扩散），命中 34px 内敌人即结算消失，dur 耗尽消散
      s.ang += (Math.random() - 0.5) * 3.2;
      s.x += Math.cos(s.ang) * s.speed * dt;
      s.y += Math.sin(s.ang) * s.speed * dt;
      const hitE = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - s.x, o.y - s.y) < 34);
      if (hitE) {
        if (s.fx) s.fx.t = s.fx.dur;
        this.damage(hitE, s.dmg, 'electric');
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
          this.damage(hitE, s.dmg, 'boomerang');
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
        // 炮火支援 C 焦土：落点留燃烧地面 2s（每秒 30% 伤害）
        if (d.ember > 0) {
          this.groundDots = this.groundDots || [];
          this.groundDots.push({ x: d.x, y: d.y, r: d.r * 0.6, ttl: 2, dps: this.shotDmg('cannon') * 0.24 * d.ember, key: 'fire' });
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
        if (o.hp <= 0 || Math.hypot(o.x - gd.x, o.y - gd.y) > gd.r) return;
        if (gd.dps) this.damage(o, gd.dps * dt, gd.key || 'fire');
        // v1.16.42 毒沼：泥沼减速（与毒池区分——毒沼纯叠毒 + 减速，无直伤）
        if (gd.swamp && gd.slow) this.applySlow(o, gd.slow, 1);
        if (gd.key === 'poison' && gd.stackPerSec) {
          gd._t = (gd._t || 0) + dt;
          while (gd._t >= 1) {
            gd._t -= 1;
            this.applyPoison(o, this.shotDmg('poison'), 'poison', gd.stackPerSec);
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
  updatePoisonSticks(dt) {
    if (!this.poisonSticks || !this.poisonSticks.length) return;
    const g = this.game;
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
      if (m.ttl <= 0) { this.mines.splice(i, 1); continue; }
      if (m.armed > 0) continue;
      const hit = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) <= 60);
      if (!hit) continue;
      this.mines.splice(i, 1);
      this.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false);
      if (m.chain > 0) {
        // v1.16.42 C 连爆 → 碎雷重做：爆炸后星状向四周 130px 内散射 5/6/7 片弹片，每片 30% 攻击伤害
        const nShard = SKILL_NUM.cannon['地雷阵'].shards[m.chain];
        const shardDmg = this.shotDmg('cannon') * SKILL_NUM.cannon['地雷阵'].shardDmg;
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

  /** 回旋镖·风暴镖推进（v1.16.21）：三同心圈旋转十字飞镖，每镖独立命中 10% 伤害，命中不消失 */
  updateStorms(dt) {
    if (!this.storms || !this.storms.length) return;
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const st = this.storms[i];
      st.ttl -= dt;
      if (st.ttl <= 0) {
        if (st.fx) st.fx.t = st.fx.dur;   // v1.16.38 同步结束风暴镖 fx
        this.storms.splice(i, 1);
        continue;
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
        this.damage(o, w.dps * dt, 'boomerang');
        if (w.slow) this.applySlow(o, w.slow, 0.2);
      });
    }
  }

"""
assert src.count(marker) == 1, "marker not found: %d" % src.count(marker)
src = src.replace(marker, methods + marker)

with io.open(P, "w", encoding="utf-8", newline="") as f:
    f.write(src)
print("OK")
