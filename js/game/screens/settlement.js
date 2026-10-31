'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text, button } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
// 只读结算摘要并生成绘制/命中；奖励计算、入账与动画跳过留在Main及输入路由。
function createSettlementScreen({ drawImg, IMG_SRC, relicIconSrc, fmtNum }) {
  class SettlementScreen {
  /** 演出进度：t0 起始 ms / dur 时长，返回 0~1 */
  _goPh(T, t0, dur) { return Math.max(0, Math.min(1, (T - t0) / (dur || 260))); }

  /** easeOutBack：入场回弹（与旧 eob 一致） */
  _goEob(p) { p = Math.max(0, Math.min(1, p)); return 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2); }

  /** 矢量小旗（撤离点/里程碑标记）：旗杆 + 三角旗面，锚点 = 旗杆底 (x, yBase)；v1.17.22 还会有 _drawMedal/_drawShardGem */
  _drawFlag(ctx, x, yBase, h, color, alpha) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, yBase); ctx.lineTo(x, yBase - h); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, yBase - h);
    ctx.lineTo(x + h * 0.62, yBase - h * 0.78);
    ctx.lineTo(x, yBase - h * 0.54);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }

  /** 背景：全屏压暗 + 顶部主题色舞台渐变（win 金 / lose 红），200ms 淡入 */
  _goStage(ctx, T, win) {
    const a = Math.max(0, Math.min(1, T / 200));
    ctx.fillStyle = 'rgba(0,0,0,' + (0.74 * a).toFixed(3) + ')';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    if (a <= 0) return;
    const th = win ? CONFIG.GO.THEME.win : CONFIG.GO.THEME.lose;
    const g = ctx.createLinearGradient(0, 0, 0, 560);
    g.addColorStop(0, th.dim);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a;
    ctx.fillStyle = g; ctx.fillRect(0, 0, 750, 560);
    ctx.globalAlpha = 1;
  }

  /** 顶部（118–320）：英文绶带逐字排布（canvas 无 letter-spacing）+ 主标题回弹 + meta 淡入 */
  _goHead(ctx, su, T, win) {
    const th = win ? CONFIG.GO.THEME.win : CONFIG.GO.THEME.lose;
    const TL = CONFIG.GO.TL;
    // 绶带 118–162：h44/r14 胶囊，自上滑入；英文逐字距 8（中文标题不用字距）
    const rp = this._goPh(T, TL.ribbon, 320);
    if (rp > 0) {
      const str = win ? 'EVACUATION SUCCESS' : 'DEFENSE FAILED';
      ctx.font = 'bold 20px sans-serif';
      let total = 0; const ws = [];
      for (const ch of str) { const w = ctx.measureText(ch).width; ws.push(w); total += w + 8; }
      total -= 8;
      const rw = total + 56, ry = 118 - (1 - rp) * 26;
      ctx.globalAlpha = Math.min(1, rp * 1.5);
      fillRoundRect(ctx, 375 - rw / 2, ry, rw, 44, 14, 'rgba(0,0,0,0.35)');
      strokeRoundRect(ctx, 375 - rw / 2, ry, rw, 44, 14, th.accent, 1.5);
      let cx = 375 - total / 2;
      ctx.fillStyle = th.accent; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      str.split('').forEach((ch, i) => { ctx.fillText(ch, cx, ry + 23); cx += ws[i] + 8; });
      ctx.globalAlpha = 1;
    }
    // 主标题（基线 250，88px，scale 回弹）
    const tp = this._goPh(T, TL.title, 320);
    if (tp > 0) {
      const sc = Math.min(1.12, this._goEob(tp));
      ctx.save();
      ctx.globalAlpha = Math.min(1, tp * 1.6);
      ctx.translate(375, 250); ctx.scale(sc, sc);
      text(ctx, win ? '撤离成功' : '防线失守', 0, 0, 88, win ? '#ffd34d' : '#ff6b6b', 'center');
      ctx.restore();
    }
    // meta 行（基线 312，26px 淡入）；通关数口径 = 全歼波数（v1.17.22），旧摘要回退 wave
    const mp = this._goPh(T, TL.meta, 200);
    if (mp > 0) {
      ctx.globalAlpha = mp;
      const cleared = (su.cleared != null) ? su.cleared : su.wave;
      text(ctx, '全歼 ' + cleared + ' 波 · 深度倍率 ×' + (su.depthMult || 1).toFixed(2) + ' · 总击杀 ' + (su.kills || 0), 375, 312, 26, '#dfe6ee', 'center');
      ctx.globalAlpha = 1;
    }
  }

  /** 深度轨迹条（362–456）：底线 + 已走段生长 + 里程碑节点（兼撤离旗标）+ 终点金点
   *  x(wave) = 70 + clamp(wave,0,50)/50 × 610；波次 >50 钳制在 x1，标签显示真实波次 */
  _goTrail(ctx, su, T, win) {
    const TR = CONFIG.GO.TRAIL, TL = CONFIG.GO.TL;
    const base = this._goPh(T, TL.trail, 200);
    if (base <= 0) return;
    const wave = (su.cleared != null) ? su.cleared : su.wave;   // v1.17.22 轨迹/终点按全歼波数（通关数口径）
    const fx = (w) => TR.x0 + (TR.x1 - TR.x0) * Math.min(1, Math.max(0, w / TR.waveMax));
    ctx.globalAlpha = base;
    // 底线（未走段灰）
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(TR.x0, TR.lineY); ctx.lineTo(TR.x1, TR.lineY); ctx.stroke();
    // 已走段生长（win 紫 / lose 红）
    const grow = this._goPh(T, TL.trail, TL.trailGrow);
    if (grow > 0) {
      ctx.strokeStyle = win ? '#a86bff' : '#e74c3c';
      ctx.beginPath(); ctx.moveTo(TR.x0, TR.lineY);
      ctx.lineTo(Math.max(TR.x0 + 1, fx(wave) * grow + TR.x0 * (1 - grow)), TR.lineY); ctx.stroke();
    }
    // 里程碑节点（10/20/30/40/50，位置与撤离点重合）：m≤wave 实心紫+旗，否则空心灰
    CONFIG.MILESTONES.forEach((m, i) => {
      const np = this._goPh(T, TL.node0 + i * TL.nodeGap, 240);   // v1.17.48 淡入 180→240，配 nodeGap 120 让旗子逐个「走过去」
      if (np <= 0) return;
      const nx = fx(m), hitM = m <= wave;
      ctx.globalAlpha = base * np;
      ctx.beginPath(); ctx.arc(nx, TR.lineY, TR.nodeR, 0, Math.PI * 2);
      if (hitM) {
        ctx.fillStyle = '#a86bff'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
        this._drawFlag(ctx, nx, TR.lineY - TR.nodeR - 4, TR.flagH, '#a86bff', np);
      } else {
        ctx.fillStyle = '#1b2129'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.stroke();
      }
      text(ctx, m + '波', nx, TR.lineY + 34, 20, hitM ? '#c9b8ff' : '#5a6b80', 'center');
    });
    // 终点金点（win）/红点（lose）+ 标签：默认线下第二行；与最近已过节点太近时再错一行
    // （设计稿「上移」会撞 30 波节点的旗面，改为向下错行——见计划文档风险表）
    const ep = this._goPh(T, TL.endPin, 260);
    if (ep > 0) {
      const ex = fx(wave);
      const sc = Math.min(1.15, this._goEob(ep));
      ctx.globalAlpha = base * Math.min(1, ep * 1.5);
      ctx.beginPath(); ctx.arc(ex, TR.lineY, TR.endR * sc, 0, Math.PI * 2);
      ctx.fillStyle = win ? '#f7c948' : '#e74c3c'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      const near = CONFIG.MILESTONES.some((m) => m <= wave && Math.abs(fx(m) - ex) < TR.labelGap);
      text(ctx, wave + '波 · ' + (win ? '撤离' : '失守'), ex, TR.lineY + (near ? 88 : 60), 22, win ? '#ffd34d' : '#ff8a8a', 'center');
    }
    ctx.globalAlpha = 1;
  }

  /** v1.17.22 通用图标：贴图优先，缺图回退紫底圆 + 名首字（项目 v1.16.135 起无 emoji） */
  _goIcon(ctx, id, x, y, size) {
    const src = id ? relicIconSrc(id) : null;
    if (src && drawImg(ctx, src, x, y, size, size)) return;
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168,107,255,0.25)'; ctx.fill();
    const def = id && CONFIG.relicRunDef ? CONFIG.relicRunDef(id) : null;
    text(ctx, def ? def.name.charAt(0) : '✦', x + size / 2, y + size / 2 + 2, size * 0.44, '#d9c2ff', 'center');
  }

  /** 战利品区（528–934）：标题 + 圣遗物大卡（220×340，最多 3 张居中，超出折叠） */
  _goLoot(ctx, su, T) {
    const TL = CONFIG.GO.TL;
    const tp = this._goPh(T, TL.lootTitle, 200);
    if (tp > 0) {
      ctx.globalAlpha = tp;
      text(ctx, '— 圣遗物收获 —', 375, 528, 22, '#a86bff', 'center');
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(70, 528); ctx.lineTo(268, 528); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(482, 528); ctx.lineTo(680, 528); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const cards = Object.entries(su.shardDetail || {}).filter(([, n]) => Number(n) > 0)
      .map(([id, n]) => ({ id, shards: Number(n), rarity: CONFIG.relicRarity(id) }));
    if (!cards.length) {
      text(ctx, '本局未获得圣遗物碎片', 375, 730, 22, '#6b7a8c', 'center');
      return;
    }
    const rows = Math.ceil(cards.length / 5), CW = 124, GAP = 12;
    const stride = Math.min(185, 370 / rows), CH = stride - 30, CY = 560;
    cards.forEach((c, i) => {
      const row = Math.floor(i / 5), col = i % 5;
      const count = Math.min(5, cards.length - row * 5);
      const X = (750 - count * CW - (count - 1) * GAP) / 2 + col * (CW + GAP);
      const Y = CY + row * stride;
      const rc = CONFIG.GO.RARITY[c.rarity] || '#e8402f';
      fillRoundRect(ctx, X, Y, CW, CH, 10, '#20262f');
      strokeRoundRect(ctx, X, Y, CW, CH, 10, rc, 2);
      const icon = Math.min(92, CH * 0.77);   // v1.17.48 图标放大 40%（66 → 92），卡宽 124 仍留 16px 边距
      this._goIcon(ctx, c.id, X + (CW - icon) / 2, Y + 8, icon);
      const def = CONFIG.relicRunDef(c.id);
      const name = def ? def.name : '?';
      const font = Math.min(19, 110 / Math.max(1, name.length), CH * 0.24);
      text(ctx, name, X + CW / 2, Y + CH - 16, font, '#eef3f8', 'center');
      text(ctx, '×' + c.shards, X + CW / 2, Y + CH + 14, 22, '#c9a6ff', 'center');
    });
  }

  /** 账单区（960–1070）：左卡金币 / 右卡宝箱四态（340×110 gap30） */
  _goBills(ctx, su, T) {
    const TL = CONFIG.GO.TL;
    const card = (x, p, draw) => {
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 1.5);
      const dx = x + (p < 1 ? -30 * (1 - p) : 0);   // 自左滑入
      fillRoundRect(ctx, dx, 960, 340, 110, 16, '#20262f');
      strokeRoundRect(ctx, dx, 960, 340, 110, 16, 'rgba(255,255,255,0.12)', 1.5);
      draw(dx);
      ctx.restore();
    };
    // 左卡：金币（深度结算 + 银币折算合并）
    const totalSilver = (su.payout || 0) + (su.silver || 0);
    card(40, this._goPh(T, TL.billL, 240), (dx) => {
      const COIN = 56;
      if (!drawImg(ctx, IMG_SRC.coin, dx + 36, 960 + 27, COIN, COIN)) {
        text(ctx, '✦', dx + 36 + COIN / 2, 960 + 27 + COIN / 2, 42, '#f7c948', 'center');
      }
      text(ctx, '×' + fmtNum(totalSilver), dx + 116, 960 + 46, 34, '#f7c948', 'left');
      text(ctx, '本局金币', dx + 116, 960 + 84, 20, '#8ea3b8', 'left');
    });
    // 右卡：宝箱四态（v1.17.20 起 grantDeepChest 满槽返 false，「已存入」不能假话）
    card(390, this._goPh(T, TL.billR, 240), (dx) => {
      const CH2 = 56, iy = 960 + 27;
      if (su.chestSkipped) {
        text(ctx, '本局无宝箱', dx + 170, 960 + 48, 26, '#6b7a8c', 'center');
        text(ctx, '前三波阵亡 · 无深度宝箱', dx + 170, 960 + 84, 18, '#4a5a6e', 'center');
        return;
      }
      if (su.chestGranted) {
        const tierImg = { wood: IMG_SRC.chestWood, bronze: IMG_SRC.chestBronze, silver: IMG_SRC.chestSilver, gold: IMG_SRC.chestGold, star: IMG_SRC.chestStar }[su.chestKey] || IMG_SRC.chestClosed;
        if (!drawImg(ctx, tierImg, dx + 36, iy, CH2, CH2)) {
          text(ctx, '✦', dx + 36 + CH2 / 2, iy + CH2 / 2, 42, '#d89e63', 'center');
        }
        if (su.chestExtra) {
          text(ctx, '已入库 · 加发' + su.chestExtra, dx + 116, 960 + 48, 24, '#ffd34d', 'left');
        } else {
          text(ctx, '已存入仓库', dx + 116, 960 + 48, 26, '#dfe6ee', 'left');
        }
        text(ctx, su.chestName || '', dx + 116, 960 + 84, 18, '#8ea3b8', 'left');
      } else if (su.chestName) {
        // 有档位但未入库 → 仓库 4 槽已满
        text(ctx, '仓库已满 · 未领取', dx + 170, 960 + 48, 24, '#ff8a8a', 'center');
        text(ctx, '开启仓库宝箱后再战', dx + 170, 960 + 84, 18, '#8a6a6a', 'center');
      } else {
        text(ctx, '—', dx + 170, 960 + 60, 26, '#4a5a6e', 'center');
      }
    });
  }

  /** 里程碑条（1094–1146，h52 虚线胶囊）：首达列表 / 空态 */
  _goMile(ctx, su, T) {
    const p = this._goPh(T, CONFIG.GO.TL.mile, 220);
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = p;
    fillRoundRect(ctx, 40, 1094, 670, 52, 26, 'rgba(0,0,0,0.3)');
    ctx.setLineDash([8, 6]);
    strokeRoundRect(ctx, 40, 1094, 670, 52, 26, 'rgba(168,107,255,0.55)', 1.5);
    ctx.setLineDash([]);
    const miles = su.miles || [];
    text(ctx, miles.length ? '里程碑首达 ' + miles.join(' / ') : '本局无新里程碑', 375, 1120, 22, miles.length ? '#c9b8ff' : '#5a6b80', 'center');
    ctx.restore();
  }

  /** 底部按钮（1172–1268，320×96 gap30）：浮现前命中区已注册——首点跳过演出，再点命中按钮 */
  _goBtns(ctx, T, win, restart) {
    const TL = CONFIG.GO.TL;
    const bA = this._goPh(T, TL.btn, 240);
    ctx.globalAlpha = bA > 0 ? bA : 0;
    restart.hit = button(ctx, 40, 1172, 320, 96, '再来一局', { bg: win ? '#2b6d4f' : '#3a6ea5', fontSize: 34 }).hit;
    restart.toMenu = button(ctx, 390, 1172, 320, 96, '返回主界面', { bg: '#45505f', fontSize: 30 }).hit;
    ctx.globalAlpha = 1;
  }

  /** 结算页（v1.17.21 全屏三段式）：舞台 → 头部 → 深度轨迹 → 战利品 → 按钮 */
  gameOver(ctx, s, restart) {
    const su = s.summary;   // v1.16.76 局末结算摘要（撤离点系统）
    if (su) {
      const win = !!su.evacuated;
      const T = Math.max(0, s.goT || 0);   // main.js：gameoverSkip 时传 99999 直达演出终点
      this._goStage(ctx, T, win);
      this._goHead(ctx, su, T, win);
      this._goTrail(ctx, su, T, win);
      this._goLoot(ctx, su, T);
      this._goBills(ctx, su, T);
      this._goMile(ctx, su, T);
      this._goBtns(ctx, T, win, restart);
      return;
    }
    // 兜底分支（无 summary，理论不可达）：沿用旧 560×500 面板
    const w = 560, h = 500, x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    fillRoundRect(ctx, x, y, w, h, 16, '#232a34');
    strokeRoundRect(ctx, x, y, w, h, 16, '#e74c3c', 3);
    text(ctx, '防线失守', x + w / 2, y + 70, 44, '#ff6b6b', 'center');
    text(ctx, `坚守到第 ${s.wave} 波`, x + w / 2, y + 140, 26, '#dfe6ee', 'center');
    text(ctx, `银币 ${fmtNum(s.gold)} · 协同 ${s.synDoneCount}/2`, x + w / 2, y + 190, 22, '#9fb2c3', 'center');
    // v1.16.45 修复：button() 返回 {hit:fn} 对象，需取 .hit 赋给 restart.hit，
    // 否则 main.js onTouch 按 this.restartBtn.hit(p.x,p.y) 调用对象 → TypeError → 结算界面点击失灵无法退出
    // v1.16.135 与汇总分支统一：hit/toMenu 都注册为命中函数（main.js 兼容两种形态）
    restart.hit = button(ctx, x + 120, y + 240, 320, 80, '重新开局', { bg: '#3a6ea5', fontSize: 32 }).hit;
    restart.toMenu = button(ctx, x + 120, y + 350, 320, 72, '返回主界面', { bg: '#45505f', fontSize: 28 }).hit;
  }

  }
  return new SettlementScreen();
}
module.exports = { createSettlementScreen };
