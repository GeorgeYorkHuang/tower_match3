'use strict';
const CHAIN_STYLE = require('../../config/chain-flight.js');
// 只读弹道事件与实时projectile/ref；移动、碰撞、追踪和命中结算仍归Combat。
// ly由每次调用传入，避免缓存过期布局或游戏实例。
function createProjectileFx({ drawImg }) {
  function fxShot(ctx, f, ly) {
    if (f.projectile && f.projectile.finished) return;
    if (f.chainFlight) {
      const shot=f.projectile;
      const pos=shot ? {x:shot.x,y:shot.y} : {x:f.x,y:f.y};
      const angle=shot && shot.angle!==undefined ? shot.angle : Math.PI/2;
      // 复用各塔原有弹体绘制，只替换实时位置与朝向。
      const dx=Math.cos(angle)*30,dy=Math.sin(angle)*30;
      return fxShot(ctx,{...f,chainFlight:null,projectile:null,target:null,_flightPos:pos,_flightTime:shot ? shot.t : f.t,
        x:pos.x-dx,y:pos.y-dy,tx:pos.x+dx,ty:pos.y+dy,t:0.5,dur:1}, ly);
    }

      // 塔攻击弹道：line=直线弹（火球/冰锥/毒液，按塔 key 区分形状）、bolt=闪电折线（电）、
      // arc=往返弧线回旋镖（回旋镖）、mortar=抛物线炮弹+落地爆炸（炮塔）；dur 控制弹速（越大越慢）
      // v1.5：直线/闪电弹道末端实时跟随目标移动（目标存活时），不再停留在创建时位置
      let endX = f.tx, endY = f.ty;
      if ((f.kind === 'line' || f.kind === 'bolt') && !f.aim && f.target && f.target.hp > 0) {
        endX = f.target.x; endY = f.target.y;
      }
      // v1.13.3：多重火球等放大弹体（scale）
      const sc = f.scale || 1;
      const p = Math.min(1, f.t / f.dur);
      const x = f._flightPos ? f._flightPos.x : f.x + (endX - f.x) * p;
      const y = f._flightPos ? f._flightPos.y : f.y + (endY - f.y) * p;
      if (f.kind === 'bolt') {
        // v1.16.49 电塔普攻重做：发射细长条闪电——前端电球领跑，塔口→前端之间一条细长蜿蜒闪电条
        // （分段密、抖动小、线细，三层共用同一份路径贴合绘制 → 细长利落）；命中瞬间前端抵达目标爆发电花
        // v1.16.52 末端吸附：p ≥ 0.9 时弹头/闪电条终点直接贴合目标中心——fx 在 t ≥ dur 时即被移除、
        //   末帧不渲染，无吸附时弹头只能推进到 p≈0.93（30fps），细长条末端明显停在怪物中心旁边
        // v1.16.72 普攻开始时末端即吸附怪物：闪电条终点始终 = 目标当前中心（发射第一帧细长条就连到怪物），
        //   前端电球沿 塔口→目标 连线领跑推进（p=1 时恰好落在目标中心），命中电花始终在目标身上
        const seg = 10, jit = 8;
        const pts = [];
        for (let i = 1; i < seg; i++) {
          const q = i / seg;
          pts.push({ x: f.x + (endX - f.x) * q + (Math.random() * jit * 2 - jit), y: f.y + (endY - f.y) * q + (Math.random() * jit * 2 - jit) });
        }
        const hx = endX, hy = endY;   // 闪电条末端：全程吸附目标中心
        const trace = (color, w, alpha) => {
          ctx.strokeStyle = color; ctx.lineWidth = w; ctx.globalAlpha = alpha;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(f.x, f.y);
          for (const pt of pts) ctx.lineTo(pt.x, pt.y);
          ctx.lineTo(hx, hy); ctx.stroke();
        };
        trace(f.color, 6, 0.16);        // 外辉光（淡，贴近主条）
        trace(f.color, 3.4, 0.9);       // 主条（细）
        trace('#ffffff', 1.3, 0.95);    // 白芯（最细）
        // 前端电球（沿 塔口→目标 连线领跑推进，命中时恰好落在目标中心）
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
        // 命中电花（末端，p→1 时爆发）
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(endX, endY, 7 + p * 13, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
      } else if (f.kind === 'arc') {
        // 回旋镖 v1.9：椭圆大弧（塔出发 → 越过怪物最远点 → 继续绕回塔，非折返）
        //         镖体重绘为双翼回旋镖造型 + 高速自旋
        const arcPos = (ff, pp) => {
          const dx = ff.tx - ff.x, dy = ff.ty - ff.y;
          const dist = Math.hypot(dx, dy) || 1;
          const cxn = dx / dist, cyn = dy / dist;
          const arcH = 160, a = dist / 2 + 20;
          const cx = ff.x + cxn * (dist / 2), cy = ff.y + cyn * (dist / 2);
          const ang = Math.PI + Math.PI * 1.9 * pp;
          const cs = Math.cos(ang), sn = Math.sin(ang);
          return { x: cx + a * cs * cxn - arcH * sn * cyn, y: cy + a * cs * cyn + arcH * sn * cxn };
        };
        const pos = f._flightPos || arcPos(f, p);
        const bx = pos.x, by = pos.y;
        // v1.12.4 完全去掉弧线轨迹（不画任何路线/拖尾，只保留镖头旋转飞行）
        // 镖头朝向：瞬时速度方向（数值差分）
        const step = 0.015;
        const pa = arcPos(f, Math.min(1, p + step));
        const pb = arcPos(f, Math.max(0, p - step));
        const ang = Math.atan2(pa.y - pb.y, pa.x - pb.x);
        // 镖体自旋（v1.12.4：转速加倍，全程转 8 圈）
        const spin = f._flightTime !== undefined
          ? f._flightTime * Math.PI * 2 * CHAIN_STYLE.boomerangRotationsPerSecond
          : p * Math.PI * 16;
        // 巨镖（v1.10）：体积放大 1 + 0.30/级
        const lg = f.large || 0;
        const sc = 1 + 0.30 * lg;
        // 镖体圆盘（半透明底）
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang + spin);
        ctx.scale(sc, sc);
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // L 形回旋镖（v1.10 重绘：两臂夹角 120°）
        ctx.lineCap = 'round';
        ctx.strokeStyle = f.color; ctx.lineWidth = 20;
        ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(0, 0); ctx.lineTo(-20, 34.6); ctx.stroke();
        // 高光线（内芯）
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(0, 0); ctx.lineTo(-15, 26); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.restore();
        // 中心旋转闪光
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // v1.16.35 折返段强化外辉：飞回阶段（p>=0.5）镖身金白外辉，仅学「折返增伤」技能时显示（不再无条件亮）；镖阵（ring）紫金光晕
        if ((f.fold && p >= 0.5) || f.ring) {
          const glowCol = f.ring ? '#c39bd3' : '#ffe08a';
          ctx.globalAlpha = (f.ring ? 0.55 : 0.35 + 0.3 * Math.sin(p * 18));
          ctx.fillStyle = glowCol;
          ctx.beginPath(); ctx.arc(bx, by, 40 * sc, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (f.kind === 'zigzag') {
        // v1.13.19 锯齿电弧（塔口→目标）：多段折线 + 每帧轻微抖动 + 白芯
        // v1.16.47：glow 模式先画宽幅光晕（极光电击主弧更醒目）
        const p = f.path;
        if (p && p.length > 1) {
          if (f.glow) {
            ctx.strokeStyle = f.color || '#f4d03f'; ctx.lineWidth = (f.w || 3) + 8; ctx.globalAlpha = 0.22;
            ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
            for (let i = 1; i < p.length; i++) { const j = Math.random() * 7 - 3.5; ctx.lineTo(p[i].x + j, p[i].y + j); }
            ctx.stroke();
          }
          ctx.strokeStyle = f.color || '#f4d03f'; ctx.lineWidth = (f.w || 3) + 1.5; ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
          for (let i = 1; i < p.length; i++) { const j = Math.random() * 5 - 2.5; ctx.lineTo(p[i].x + j, p[i].y + j); }
          ctx.stroke();
          ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
          for (let i = 1; i < p.length; i++) { const j = Math.random() * 5 - 2.5; ctx.lineTo(p[i].x + j, p[i].y + j); }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else if (f.kind === 'storm') {
        // v1.13.20 雷暴演出：0.22s 预兆收缩金圈 → 主闪（锯齿主枝+2 分叉+白芯）→ 落点闪光；delay 用于分批错开
        const tt = f.t - (f.delay || 0);
        if (tt < 0) return;
        const sx = f.x, sy = f.y;
        if (tt < 0.22) {
          // 预兆：目标点收缩金圈
          const k = tt / 0.22;
          ctx.strokeStyle = '#f4d03f'; ctx.lineWidth = 2.2; ctx.globalAlpha = (1 - k) * 0.85;
          ctx.beginPath(); ctx.arc(sx, sy, 10 + 24 * k, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (tt < 0.55) {
          const pk = (tt - 0.22) / 0.33;
          const seed = f.seed || 0;
          const topY = sy - 220;
          const off1 = (seed % 19) - 9, off2 = ((seed >> 3) % 21) - 10;
          const mid1 = { x: sx + off1, y: sy + (topY - sy) * 0.35 };
          const mid2 = { x: sx + off2, y: sy + (topY - sy) * 0.7 };
          // 主枝（金芯 + 白芯）
          ctx.strokeStyle = '#f4d03f'; ctx.lineWidth = 4; ctx.globalAlpha = 0.9 * Math.min(1, pk * 3 + 0.15);
          ctx.beginPath(); ctx.moveTo(sx, topY); ctx.lineTo(mid1.x, mid1.y); ctx.lineTo(mid2.x, mid2.y); ctx.lineTo(sx, sy); ctx.stroke();
          ctx.globalAlpha = 0.95; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(sx, topY); ctx.lineTo(mid1.x, mid1.y); ctx.lineTo(mid2.x, mid2.y); ctx.lineTo(sx, sy); ctx.stroke();
          // 2 条分叉
          ctx.globalAlpha = 0.7; ctx.strokeStyle = '#f4d03f'; ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.moveTo(mid1.x, mid1.y); ctx.lineTo(mid1.x - 26 + (seed % 13), mid1.y + 36); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(mid2.x, mid2.y); ctx.lineTo(mid2.x + 24 - ((seed >> 2) % 11), mid2.y + 28); ctx.stroke();
          ctx.globalAlpha = 1;
          // 落点闪光
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85 * (1 - pk);
          ctx.beginPath(); ctx.arc(sx, sy, 10 * (1 - pk * 0.5), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (f.kind === 'frostorb') {
        // v1.13.23 冬珠（冰霜之球）：半透明冰球 + 呼吸光环 + 旋转冰晶点（持续 5s 驻场）
        const fp = Math.min(1, f.t / f.dur);
        const breathe = 1 + 0.08 * Math.sin(Date.now() / 300);
        ctx.fillStyle = '#7fd4ff'; ctx.globalAlpha = 0.16;
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.r || 110) * 0.55 * breathe, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#b8e6ff'; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, 13 * breathe, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(f.x - 2.5, f.y - 2.5, 5, 0, Math.PI * 2); ctx.fill();
        // 外圈呼吸光环
        ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.45 * (1 - fp * 0.4);
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.r || 110) * 0.72 * breathe, 0, Math.PI * 2); ctx.stroke();
        // 旋转冰晶点（3 颗）
        for (let k = 0; k < 3; k++) {
          const a = Date.now() / 700 + k * 2.09;
          ctx.fillStyle = '#d6f0ff'; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 22 * breathe, f.y + Math.sin(a) * 22 * breathe, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.kind === 'icewall') {
        // v1.13.25 冰墙（城墙冰霜护盾）；v1.16.47 重做：渐变冰层 + 锐利冰刺 + 寒光呼吸 + 冰晶纹理 + 底部冰雾
        const fp = Math.min(1, f.t / f.dur);
        const breathe = 1 + 0.06 * Math.sin(Date.now() / 260);
        const wy = (f.y || ly.wallY);
        const r = f.r || 700;   // v1.16.53 默认铺满整座城墙（25~725）
        const x0 = f.x - r / 2, x1 = f.x + r / 2;
        // 外发光呼吸描边（寒光）
        ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(Date.now() / 260);
        ctx.beginPath(); ctx.moveTo(x0 + 14, wy); ctx.lineTo(x1 - 14, wy);
        ctx.stroke();
        // 垂直渐变冰层（上浅下深，梯形墙体）
        const iceG = ctx.createLinearGradient(0, wy - 30 * breathe, 0, wy);
        iceG.addColorStop(0, 'rgba(214,240,255,0.55)');
        iceG.addColorStop(0.6, 'rgba(127,212,255,0.30)');
        iceG.addColorStop(1, 'rgba(80,170,240,0.18)');
        ctx.fillStyle = iceG;
        ctx.globalAlpha = 1 - fp * 0.3;
        ctx.beginPath();
        ctx.moveTo(x0 + 6, wy);
        ctx.lineTo(x0 + 10, wy - 26 * breathe);
        ctx.lineTo(x1 - 10, wy - 26 * breathe);
        ctx.lineTo(x1 - 6, wy);
        ctx.closePath(); ctx.fill();
        // 顶部冰刺（锐利、9 根交错）
        ctx.fillStyle = '#a9d6f5'; ctx.globalAlpha = 0.85;
        for (let k = 0; k < 9; k++) {
          const bx = x0 + ((k + 0.5) * r) / 9;
          const h = (12 + (k % 4) * 8) * breathe;
          const w2 = 5 + (k % 3) * 2;
          ctx.beginPath();
          ctx.moveTo(bx - w2, wy - 22 * breathe);
          ctx.lineTo(bx, wy - 30 * breathe - h);
          ctx.lineTo(bx + w2, wy - 22 * breathe);
          ctx.closePath(); ctx.fill();
        }
        // 墙面冰晶纹理（菱形网格 2 行）
        ctx.fillStyle = '#d6f0ff'; ctx.globalAlpha = 0.4;
        for (let ky = 0; ky < 2; ky++) {
          for (let kx = 0; kx < 12; kx++) {
            const cx2 = x0 + ((kx + 0.5) * r) / 12 + ((ky % 2) ? 12 : 0);
            const cy2 = wy - 4 - ky * 9;
            ctx.beginPath();
            ctx.moveTo(cx2, cy2 - 3);
            ctx.lineTo(cx2 + 3, cy2);
            ctx.lineTo(cx2, cy2 + 3);
            ctx.lineTo(cx2 - 3, cy2);
            ctx.closePath(); ctx.fill();
          }
        }
        // 冰晶粒子（呼吸闪烁）
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 180 + f.x);
        for (let k = 0; k < 6; k++) {
          const px = x0 + ((f.x * 7 + k * 131) % r);
          ctx.beginPath(); ctx.arc(px, wy - (8 + ((f.x * 13 + k * 71) % 34)), 2.2, 0, Math.PI * 2); ctx.fill();
        }
        // 底部冰雾上浮粒子
        ctx.globalAlpha = 0.3;
        for (let k = 0; k < 6; k++) {
          const a = (Date.now() / 1400 + k / 6) % 1;
          const px = x0 + ((f.x * 11 + k * 97) % r);
          ctx.fillStyle = '#d6f0ff';
          ctx.beginPath(); ctx.arc(px, wy - 2 - a * 22, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.kind === 'miasma') {
        // v1.16.47 瘴气毒雾：城墙上方条带，多层粒子翻滚（绿雾）+ 呼吸浓淡 + 边界提示线（驻场 fx）
        const breathe = 1 + 0.10 * Math.sin(Date.now() / 400);
        const wy = (f.y !== undefined ? f.y : (ly.wallY - 50));
        const w = f.w || 750, half = f.half || 20;
        const t0 = Date.now() / 1000;
        // 底层浓雾（整条渐变带）
        const fogG = ctx.createLinearGradient(0, wy - half * breathe, 0, wy + half * breathe);
        fogG.addColorStop(0, 'rgba(46,204,113,0)');
        fogG.addColorStop(0.5, 'rgba(46,204,113,0.30)');
        fogG.addColorStop(1, 'rgba(46,204,113,0.06)');
        ctx.fillStyle = fogG;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(0, wy - half);
        ctx.quadraticCurveTo(w * 0.5, wy - half * (1.6 * breathe), w, wy - half);
        ctx.lineTo(w, wy + half);
        ctx.quadraticCurveTo(w * 0.5, wy + half * (1.4 * breathe), 0, wy + half);
        ctx.closePath(); ctx.fill();
        // 翻滚粒子团（两层，横向漂移）
        ctx.globalAlpha = 0.5;
        for (let k = 0; k < 10; k++) {
          const drift = (t0 * 18 + k * 73) % w;
          const px = drift;
          const py = wy - half * 0.6 + Math.sin(t0 * 2 + k) * half * 0.7;
          const rad = (5 + ((k * 13) % 8)) * breathe;
          ctx.fillStyle = k % 2 ? 'rgba(126,226,168,0.35)' : 'rgba(46,204,113,0.30)';
          ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 毒雾顶部边界线（提示条带范围）
        ctx.strokeStyle = 'rgba(126,226,168,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, wy - half);
        ctx.quadraticCurveTo(w * 0.5, wy - half * (1.6 * breathe), w, wy - half);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'icebloom') {
        // v1.13.28 冰花帧动画：4 帧绽放序列（assets/images/towers/fx/icebloom/icebloom1-4.png，按进度选帧）
        const fp = Math.min(1, f.t / f.dur);
        const frameIdx = Math.min(3, Math.floor(fp * 4));
        const fw = (f.r || 100) * 1.9, fh = (f.r || 100) * 1.9;
        if (!drawImg(ctx, `assets/images/towers/fx/icebloom/icebloom${frameIdx + 1}.png`, f.x - fw / 2, f.y - fh / 2, fw, fh)) {
          // 回退：六瓣雪花展开 + 冰晶高光 + 扩散（贴图未加载时）
          const bloomR = (f.r || 100) * (0.25 + 0.75 * fp);
          const rot = Date.now() / 200;
          ctx.strokeStyle = '#a9d6f5'; ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.85 * (1 - fp * 0.55);
          for (let k = 0; k < 6; k++) {
            const a = rot + k * Math.PI / 3;
            ctx.beginPath();
            ctx.moveTo(f.x, f.y);
            ctx.lineTo(f.x + Math.cos(a) * bloomR, f.y + Math.sin(a) * bloomR * 0.9);
            ctx.stroke();
            // 瓣尖小冰晶
            ctx.fillStyle = '#d6f0ff';
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(a) * bloomR * 1.05, f.y + Math.sin(a) * bloomR * 0.95, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = '#7fd4ff'; ctx.globalAlpha = 0.5 * (1 - fp);
          ctx.beginPath(); ctx.arc(f.x, f.y, bloomR * 1.25, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else if (f.kind === 'orb') {
        // v1.13.18 游走电球（活电扩散）：引用 combat.shots 实时位置，金色电球 + 辉光 + 运动方向电光拖尾
        const o = f.ref || f;
        ctx.fillStyle = '#f4d03f'; ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(o.x, o.y, 13, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(o.x, o.y, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(o.x - 1.5, o.y - 1.5, 3.5, 0, Math.PI * 2); ctx.fill();
        const dirX = Math.cos(o.ang || 0), dirY = Math.sin(o.ang || 0);
        ctx.strokeStyle = '#f4d03f'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x - dirX * 12, o.y - dirY * 12); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'bounce') {
        // v1.16.21 弹力镖（原镖阵重做）：十字飞镖自旋紫光，引用 combat.shots 实时位置与朝向
        const o = f.ref || f;
        const spin = f.t * 8;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(spin);
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = f.color || '#c39bd3';
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        ctx.strokeStyle = f.color || '#c39bd3'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, 13); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.restore();
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(o.x, o.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'mortar') {
        // 抛物线炮弹（炮塔）：高弧下坠 + 黑壳弹体 + 出膛口焰 + 火焰尾迹 + 落地爆炸冲击波
        const arcH = 46;
        const mx = f._flightPos ? f._flightPos.x : f.x + (f.tx - f.x) * p;
        const my = f._flightPos ? f._flightPos.y : f.y + (f.ty - f.y) * p - arcH * Math.sin(Math.PI * p);
        // 出膛口焰（0~12% 阶段塔口闪光）
        if (p < 0.12) {
          const kf = p / 0.12;
          ctx.globalAlpha = (1 - kf) * 0.9;
          ctx.fillStyle = '#ffd24a';
          ctx.beginPath(); ctx.arc(f.x, f.y, 6 + kf * 14, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff8c42'; ctx.globalAlpha = (1 - kf) * 0.55;
          ctx.beginPath(); ctx.arc(f.x, f.y, 10 + kf * 22, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        // 炮弹弹体（v1.16.21 美化：沿飞行方向的长胶囊炮弹 + 膛线自旋纹 + 弹头引信亮点 + 尾部曳光）
        const rot = Math.atan2(my - f.y, mx - f.x);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(rot);
        // 尾部曳光焰（沿 -x 向后，双色收敛 + 随机摆动）
        const trL = (16 + (1 - p) * 20);
        const wob = (Math.random() - 0.5) * 3;
        ctx.globalAlpha = (1 - p) * 0.7;
        ctx.fillStyle = '#ff7043';
        ctx.beginPath(); ctx.ellipse(-14, wob, trL * 0.75, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.ellipse(-18, wob * 0.6, trL * 0.42, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // 弹体辉光
        ctx.fillStyle = f.color; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // 炮弹本体（长胶囊：头部圆 + 柱身）
        ctx.fillStyle = '#4a3b2e';
        ctx.beginPath(); ctx.ellipse(0, 0, 16.5, 7.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b2118';
        ctx.beginPath(); ctx.ellipse(0, 0, 13, 5.8, 0, 0, Math.PI * 2); ctx.fill();
        // 弹头（前方亮部，拉长 + 引信橙光）
        ctx.fillStyle = '#5c4a38';
        ctx.beginPath(); ctx.ellipse(8, 0, 8.5, 5.2, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
        ctx.fillStyle = '#ff8c42';
        ctx.beginPath(); ctx.arc(13.5, 0, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe08a'; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(13.5, 0, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // 高光弧（左上）
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(4, -3, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
        // 膛线自旋纹（两条斜纹）
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-2, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3, -4); ctx.lineTo(8, 4); ctx.stroke();
        ctx.restore();
        // 尾迹火星（下降段更多）
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (1 - p) * (0.2 + Math.random() * 0.3);
          ctx.fillStyle = Math.random() > 0.5 ? '#ffe08a' : '#ff8c42';
          ctx.beginPath();
          ctx.arc(mx - (10 + Math.random() * 22), my + (Math.random() - 0.5) * 7 * (0.4 + p), 1.5 + Math.random() * 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 落地爆炸（双层：大辉光 + 亮心 + 冲击波扩散环 + 辐射火粒）
        if (p >= 0.88) {
          const ek = (1 - p) * 6;
          ctx.globalAlpha = Math.max(0, ek);
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(f.tx, f.ty, 13.5 + (1 - p) * 49.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = Math.max(0, (1 - p) * 10);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(f.tx, f.ty, 9 + (1 - p) * 27, 0, Math.PI * 2); ctx.fill();
          // 冲击波扩散环（双环）
          ctx.globalAlpha = (1 - p) * 0.55;
          ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3.5;
          ctx.beginPath(); ctx.arc(f.tx, f.ty, 12 + (1 - p) * 62, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = (1 - p) * 0.35;
          ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.arc(f.tx, f.ty, 18 + (1 - p) * 74, 0, Math.PI * 2); ctx.stroke();
          // 辐射火粒（6 枚向外飞散）
          ctx.globalAlpha = (1 - p) * 0.85;
          ctx.fillStyle = '#ff8c42';
          for (let k = 0; k < 6; k++) {
            const a = k * 1.047 + f.t * 9;
            ctx.beginPath();
            ctx.arc(f.tx + Math.cos(a) * (8 + (1 - p) * 46), f.ty + Math.sin(a) * (8 + (1 - p) * 46), 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      } else {
        // 直线弹（火球/冰锥/毒液）：弹体形状按塔 key 区分（放大 1.5）+ 辉光 + 渐变拖尾 + 命中火花
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(endY - f.y, endX - f.x));
        // 弹体辉光
        ctx.fillStyle = f.color; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(0, 0, 20.25 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        if (f.key === 'ice') {
          // 冰锥：菱形弹体
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.moveTo(20.25 * sc, 0); ctx.lineTo(0, -10.1 * sc); ctx.lineTo(-15.75 * sc, 0); ctx.lineTo(0, 10.1 * sc);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(2.25 * sc, 0, 5.6 * sc, 0, Math.PI * 2); ctx.fill();
          // v1.13.27 冰晶尾迹：沿飞行反向散布细小冰晶点，渐淡收敛（区别于火球长火焰尾）
          for (let i = 0; i < 4; i++) {
            const tp = (i + 1) / 5;
            ctx.globalAlpha = (1 - p) * 0.35 * (1 - i / 5);
            ctx.fillStyle = i % 2 ? '#b8e6ff' : '#eaf6ff';
            ctx.beginPath();
            ctx.arc(-22 * sc * tp + (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 11 * sc * (1 - p), 2.6 * sc * (1 - i / 5), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else if (f.key === 'fire') {
          // v1.13.16 火球弹道美化：多层焰体（辉光/橙焰/亮心）+ 沿飞行反向火焰尾（三段椭圆渐变+摆动）+ 尾迹火星 + 前部焰舌
          // 尾部长度随飞行推进收敛（出发时尾长，接近目标时收短）
          const trailLen = (34 + (1 - p) * 30) * sc;
          // 火焰尾：三段椭圆渐变沿 -x 叠放（外→内：深橙/橙/亮黄），摆动 + 淡出
          const trailCols = ['#e25822', '#ff8c42', '#ffd24a'];
          const trailSegs = [[0.50, 7.2, 0.30], [0.32, 5.6, 0.45], [0.16, 4.2, 0.65]];
          for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = (1 - p) * trailSegs[i][2];
            ctx.fillStyle = trailCols[i];
            ctx.beginPath();
            ctx.ellipse(-trailLen * trailSegs[i][0], (Math.random() - 0.5) * 5 * sc, trailLen * trailSegs[i][0], trailSegs[i][1] * sc, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          // 尾迹火星（随机散布在尾部，渐淡）
          for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = (1 - p) * (0.25 + Math.random() * 0.35);
            ctx.fillStyle = Math.random() > 0.5 ? '#ffe08a' : '#ff8c42';
            ctx.beginPath();
            ctx.arc(-trailLen * (0.2 + Math.random() * 0.65), (Math.random() - 0.5) * 9 * sc, (1.8 + Math.random() * 2.2) * sc, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          // 弹体：三层焰球（外辉 → 橙焰 → 亮心）
          ctx.fillStyle = f.color; ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.arc(0, 0, 16.5 * sc, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ff8c42';
          ctx.beginPath(); ctx.arc(0, 0, 11.5 * sc, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath(); ctx.arc(1.8 * sc, 0, 6.8 * sc, 0, Math.PI * 2); ctx.fill();
          // 前部焰舌（燃烧突出，随飞行抖动）
          ctx.fillStyle = '#ffd24a'; ctx.globalAlpha = 0.85;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(10 * sc, i * 3.2 * sc);
            ctx.quadraticCurveTo(16.5 * sc, i * 2 * sc, 14.5 * sc, i * 6 * sc);
            ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else {
          // 毒液：绿球（原样）
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(0, 0, 13.5 * sc, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.arc(-3.4 * sc, -3.4 * sc, 4.05 * sc, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        // 拖尾（外辉 + 亮线）
        ctx.strokeStyle = f.color; ctx.lineWidth = 9; ctx.globalAlpha = (1 - p) * 0.22;
        ctx.beginPath(); ctx.moveTo(x - 45, y); ctx.lineTo(x - 9, y); ctx.stroke();
        ctx.strokeStyle = f.color; ctx.lineWidth = 4.5; ctx.globalAlpha = (1 - p) * 0.6;
        ctx.beginPath(); ctx.moveTo(x - 36, y); ctx.lineTo(x - 9, y); ctx.stroke();
        ctx.globalAlpha = 1;
        // 命中火花（末端随目标实时位置）
        if (p >= 0.92) {
          ctx.globalAlpha = Math.max(0, (1 - p) * 10);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(endX, endY, 6.75 + (1 - p) * 22.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
  }

  return { fxShot };
}
module.exports = { createProjectileFx };
