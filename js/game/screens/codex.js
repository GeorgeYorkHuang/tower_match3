/** Tower codex rendering only. Host injects shared image/theme/text helpers; no game or save references. */
'use strict';
const CONFIG = require('../../config.js');
const { skillEnergy } = require('../codex-energy.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
const TOWERS_COLOR = key => (CONFIG.TOWERS[key] || {}).color;
// 属性最多显示两位小数，去掉多余尾零并消除DPS换算产生的浮点误差。
const formatStat = value => String(Number(value.toFixed(2)));
function createCodexScreen(deps) {
  const { drawImg, skillIconSrc, drawTowerGlyph, IMG_SRC, TOWER_HEX, MENU_TAB_THEME, lighten, hexA, wrapText } = deps;
  function menuCodex(ctx, s, push) {
    const th = MENU_TAB_THEME.codex;
    const keys = Object.keys(CONFIG.TOWERS);
    const colorName = (k) => (CONFIG.COLORS[CONFIG.TOWERS[k].color] || {}).name || k;
    // ---- 贴合式塔标签（attached tabs）：仅上圆角，激活页签与下方面板同底色无缝粘连 ----
    // 只显示图标（56px = 原"图标+塔名"合计高度），激活页签=塔色不透明
    // 六页签等宽：726/6=121，无缝拼接 + 未激活页签间竖线分隔
    // ty0 206→230：顶部标题/货币下移到安全区下方后，页签行随之下移让位
    const tw2 = 121, th2 = 72, tg2 = 0, tx0 = 12, ty0 = 230;
    keys.forEach((k, i) => {
      const cx = tx0 + i * (tw2 + tg2);
      const cCol = TOWER_HEX[TOWERS_COLOR(k)] || '#8ea3b8';
      push('codexSel', k, cx, ty0, tw2, th2 + (s.codexSel === k ? 4 : 0));   // 激活命中区下延盖住接缝
      const sel = s.codexSel === k;
      // 上圆角矩形（底部方角 → 与面板粘连）
      ctx.beginPath();
      ctx.moveTo(cx, ty0 + th2);
      ctx.lineTo(cx, ty0 + 14);
      ctx.arcTo(cx, ty0, cx + 14, ty0, 14);
      ctx.lineTo(cx + tw2 - 14, ty0);
      ctx.arcTo(cx + tw2, ty0, cx + tw2, ty0 + 14, 14);
      ctx.lineTo(cx + tw2, ty0 + th2);
      ctx.closePath();
      ctx.fillStyle = sel ? cCol : 'rgba(15,20,28,0.88)';   // 激活=塔色不透明
      ctx.fill();
      drawImg(ctx, 'garden:towerTab', cx, ty0, tw2, th2);
      if (sel) {
        // 激活：顶边白色高亮条 + 描边（底边开口，视觉上"长"在面板上）
        ctx.strokeStyle = cCol; ctx.lineWidth = 2; ctx.stroke();
        fillRoundRect(ctx, cx + 14, ty0, tw2 - 28, 5, 2.5, 'rgba(255,255,255,0.55)');
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
      }
      // 仅塔美术图标（居中）
      const unseen=!s.testProfile&&!(s.towerCodex||{})[k];ctx.save();if(unseen)ctx.globalAlpha=.28;
      const isz = 56;
      if (!drawImg(ctx, IMG_SRC[k], cx + (tw2 - isz) / 2, ty0 + (th2 - isz) / 2, isz, isz)) {
        drawTowerGlyph(ctx, k, cx + (tw2 - isz) / 2, ty0 + (th2 - isz) / 2, isz);
      }
      ctx.restore();if(unseen)text(ctx,'🔒',cx+tw2/2,ty0+th2/2,26,'#bac4ac','center');
      // 竖线分隔（相邻两页签均未激活时）
      if (i < keys.length - 1 && !sel && s.codexSel !== keys[i + 1]) {
        fillRoundRect(ctx, cx + tw2, ty0 + 12, 1, th2 - 24, 0, 'rgba(0,0,0,0.35)');
      }
    });
    // ---- 详情面板（紧贴标签行底部，无间隙）：塔色 60% 透明 + 高度 +50% + 4 列属性 ----
    const k = s.codexSel && keys.includes(s.codexSel) ? s.codexSel : keys[0];
    if(!s.testProfile&&!(s.towerCodex||{})[k]){text(ctx,'战斗中首次建造该塔后解锁图鉴',375,460,28,'#c7d3b8','center');return;}
    const T = CONFIG.TOWERS[k];
    const cCol = TOWER_HEX[T.color] || '#8ea3b8';
    const GS = CONFIG.GLOBAL_SKILL || {};
    const dx = 12, dw = 726, dy = ty0 + th2;   // 与标签行严丝合缝
    const PH = 222;                            // 148 × 1.5
    const panelCol = hexA(cCol, 0.40);         // 塔色 40% 不透明（60% 透明）
    fillRoundRect(ctx, dx, dy, dw, PH, 0, panelCol);
    drawImg(ctx, 'garden:towerDetail', dx, dy, dw, PH);
    fillRoundRect(ctx, dx, dy + PH - 14, dw, 14, 7, panelCol);   // 底部补圆角
    drawImg(ctx, 'assets/images/interface/cards/tower-stats-v1.png', dx, dy, dw, PH);
    text(ctx, colorName(k), dx + 26, dy + 33, 38, '#ffffff', 'left');
    // 3 行属性：单发攻击力/攻速/射程 —— 每行 = 属性名 + 胶囊进度条 + 数值
    const statCols = [
      { name: '攻击力', val: T.baseDps * T.atkInterval, cap: 100, txt: `${formatStat(T.baseDps * T.atkInterval)}/发` },
      { name: '攻速', val: 1 / T.atkInterval, cap: 2, txt: `${formatStat(1 / T.atkInterval)}发/s` },
      { name: '射程', val: T.range, cap: 1000, txt: `${T.range}` },
    ];
    const barW = 430, barX = dx + 110, valX = barX + barW + 14;
    statCols.forEach((c, ri) => {
      const rowY = dy + [86, 136, 190][ri];         // 3 行均布（面板高 222）
      text(ctx, c.name, dx + 26, rowY, 21, '#ffffff', 'left');
      const by = rowY - 8;
      fillRoundRect(ctx, barX, by, barW, 16, 8, 'rgba(255,255,255,0.18)');
      const r = Math.max(0, Math.min(1, c.val / c.cap));
      if (r > 0) fillRoundRect(ctx, barX, by, Math.max(16, barW * r), 16, 8, lighten(cCol, 1.2));
      strokeRoundRect(ctx, barX, by, barW, 16, 8, 'rgba(255,255,255,0.35)', 1);
      text(ctx, c.txt, valX, rowY, 18, '#e8f0f8', 'left');
    });
    // 基础普攻费用独立配置；强化后的参考费用显示在各技能卡中。
    const enV = (CONFIG.TOWERS[k] && CONFIG.TOWERS[k].attackCost) || GS.perAttack || 0.5;
    const ecW = 155, ecH = 34, ecX = dx + dw - 20 - ecW, ecY = dy + 15;
    fillRoundRect(ctx, ecX, ecY, ecW, ecH, ecH / 2, '#0b0f16');
    strokeRoundRect(ctx, ecX, ecY, ecW, ecH, ecH / 2, 'rgba(244,208,63,0.55)', 1.2);
    text(ctx, `⚡ 基础 ${formatStat(Number(enV))}/次`, ecX + ecW / 2, ecY + ecH / 2 + 1, 16, '#f4d03f', 'center');
    // ---- 技能池卡片（大字号：塔色立体卡 + 内部上下分区；底部留 5% 白不满铺）----
    const pool = CONFIG.EFFECT_POOLS[k] || [];
    // 标题只留「技能池」（去掉「· 点击卡片查看详情」提示）
    text(ctx, '技能池 · 单技能耗能', dx + 30, dy + 264, 30, '#ffffff', 'left');
    const TAB_Y = 1504;                       // 底部分页栏 y（menuLayer 常量一致）
    const cw3 = 300, ch3 = 205;               // 卡高 210→205
    const gx0 = Math.round(750 * 0.05) + 10;  // 5% 左边距再向内 10px
    const colX = [gx0, 750 - gx0 - cw3];      // 两列对称（左右各内收 10）
    const gy0 = dy + 292;                     // 首行 y（面板加高后下移）
    const rows = Math.ceil(pool.length / 2);
    const bottomY = TAB_Y - 54;               // 底部留白 5%屏高→54px（约 3.3%），补回页签行下移占用的 24px
    const rgap = rows > 1 ? Math.floor((bottomY - gy0 - rows * ch3) / (rows - 1)) : 0;   // 纵向均匀间隔
    pool.forEach((sk, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const gx = colX[col], gy = gy0 + row * (ch3 + rgap);
      push('codexSkill', { tower: k, idx: i }, gx, gy, cw3, ch3);
      // 卡底投影（立体第一步）
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#000';
      fillRoundRect(ctx, gx + 3, gy + 4, cw3, ch3, 14, ctx.fillStyle);
      ctx.globalAlpha = 1;
      // 卡身：塔色纵向渐变（上亮下暗，颜色与塔统一）
      const cMain = TOWER_HEX[T.color] || cCol;
      const body = ctx.createLinearGradient(0, gy, 0, gy + ch3);
      body.addColorStop(0, hexA(cMain, 0.30));
      body.addColorStop(0.45, hexA(cMain, 0.10));
      body.addColorStop(1, 'rgba(13,17,23,0.94)');
      fillRoundRect(ctx, gx, gy, cw3, ch3, 14, body);
      drawImg(ctx, 'assets/images/interface/cards/codex-skill-card-v1.png', gx, gy, cw3, ch3);
      // ---- 上区：图标 + 技能名左右排布 ----
      if (!drawImg(ctx, skillIconSrc(k, sk.name), gx + 16, gy + 10, 64, 64)) {
        fillRoundRect(ctx, gx + 16, gy + 10, 64, 64, 12, hexA(cMain, 0.25));
        text(ctx, sk.icon || '?', gx + 48, gy + 44, 32, '#ffffff', 'center');
      }
      text(ctx, sk.name, gx + 92, gy + 30, 33, '#ffffff', 'left');
      // 普攻强化展示整轮攻击费用，周期技能展示单次释放费用，避免把强化费用误标成0。
      const energy = skillEnergy(k, sk.name);
      text(ctx, sk.type || '', gx + 92, gy + 62, 19, hexA(cMain, 0.9), 'left');
      const ecW2 = 190, ecH2 = 26, ecX2 = gx + cw3 - 16 - ecW2, ecY2 = gy + 71;
      fillRoundRect(ctx, ecX2, ecY2, ecW2, ecH2, ecH2 / 2, '#0b0f16');
      strokeRoundRect(ctx, ecX2, ecY2, ecW2, ecH2, ecH2 / 2, 'rgba(244,208,63,0.55)', 1.2);
      text(ctx, `⚡${energy.label}`, ecX2 + ecW2 / 2, ecY2 + ecH2 / 2 + 1, 18, '#f4d03f', 'center');
      // 分隔线（塔色渐隐），上下分区
      fillRoundRect(ctx, gx + 18, gy + 103, cw3 - 36, 1.5, 0.75, hexA(cMain, 0.35));
      // ---- 下区：技能描述（左右各留 20px 白）----
      const descLines = wrapText(ctx, sk.pick || sk.desc || '暂无描述', cw3 - 40, 24).slice(0, 3);
      descLines.forEach((ln, li) => {
        text(ctx, ln, gx + 20, gy + 123 + li * 32, 24, '#d7e2ee', 'left');
      });
      // 移除右下角"点击查看详情 >>>"（卡片整体可点，入口语义由能耗胶囊+说明区承担）
    });
  }
  function codexSkillPanel(ctx, s, push) {
    const p = s.panel || {};
    const towerKey = p.tower || s.codexSel || 'fire';
    const sk = (CONFIG.EFFECT_POOLS[towerKey] || [])[p.idx];
    if (!sk) return;
    const cCol = TOWER_HEX[TOWERS_COLOR(towerKey)] || '#8ea3b8';
    const branchCopy = require('../../branch-description.js');
    const energy = skillEnergy(towerKey, sk.name);
    const attackEnergy = energy.kind === 'attack';
    const conditionalEnergy = attackEnergy && ['电磁过载', '军火库'].includes(sk.name);
    const baseY = attackEnergy ? (conditionalEnergy ? 474 : 446) : 420;
    const baseCopy = wrapText(ctx, sk.pick || sk.desc || '暂无描述', 600, 34);
    const branchRows = ['A','B','C'].map(bk => ({bk,
      lines: wrapText(ctx, branchCopy.current(sk,bk,0), 612, 32),
      levels: branchCopy.upgrades(sk,bk)}));
    const baseEnd = baseY + (baseCopy.length - 1) * 42 + 26;
    const heights = branchRows.map(row => 100 + Math.max(1,row.lines.length)*38 + 18 + row.levels.length*36 + 18);
    const W2 = 700, H2 = baseEnd + 30 + heights.reduce((a,b)=>a+b,0) + 32 + 30, px = 25, py = Math.round((LOGIC_H - H2) / 2);
    const panelScale = (2 / 3) * 1.1;
    const offsetX = 375 * (1 - panelScale);
    const offsetY = LOGIC_H / 2 * (1 - panelScale);
    const pushScaled = (key, data, x, y, w, h) =>
      push(key, data, offsetX + x * panelScale, offsetY + y * panelScale, w * panelScale, h * panelScale);
    pushScaled('panelBounds', null, px, py, W2, H2);
    // 遮罩 + 面板（底 #151b24，描边=塔色）
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(panelScale, panelScale);
    // Single-line labels stay inside their allotted columns, including unusually long names.
    const fit = (value, width, size) => {
      ctx.font = `${size}px sans-serif`;
      let valueText = String(value || '');
      if (ctx.measureText(valueText).width <= width) return valueText;
      while (valueText && ctx.measureText(valueText + '…').width > width) valueText = valueText.slice(0, -1);
      return valueText + '…';
    };
    // No opaque backing or outer frame behind the illustrated panel.   // 外圈柔光

    drawImg(ctx, 'assets/images/interface/cards/codex-skill-detail-v1.png', px, py, W2, H2);
    // 顶部塔色丝带（上圆角下直角 + 顶边内高光），标题点明"三选一"语义
    fillRoundRect(ctx, px + 12, py + 12, W2 - 24, 36, 12, hexA(cCol, 0.25));

    fillRoundRect(ctx, px + 16, py + 3, W2 - 32, 3, 1.5, 'rgba(255,255,255,0.35)');
    pushScaled('panelClose', null, px + W2 - 76, py + 8, 52, 52);
    ctx.beginPath(); ctx.arc(px + W2 - 50, py + 34, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
    text(ctx, '✕', px + W2 - 50, py + 35, 24, '#ffffff', 'center');
    // 技能图标放大50%，下方标题与说明按同一顶部节奏排列。
    const icy = py + 58, icx = 375, ISZ = 225, IHD = ISZ / 2;
    const glow = ctx.createRadialGradient(icx, icy + IHD, 10, icx, icy + IHD, ISZ);
    glow.addColorStop(0, hexA(cCol, 0.30)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(icx, icy + IHD, ISZ, 0, Math.PI * 2);
    ctx.fillStyle = glow; ctx.fill();
    if (!drawImg(ctx, skillIconSrc(towerKey, sk.name), icx - IHD, icy, ISZ, ISZ)) {
      fillRoundRect(ctx, icx - IHD, icy, ISZ, ISZ, 36, hexA(cCol, 0.18));
      strokeRoundRect(ctx, icx - IHD, icy, ISZ, ISZ, 36, cCol, 2);
      text(ctx, sk.icon || '?', icx, icy + IHD, 100, '#ffffff', 'center');
    }
    text(ctx, fit(sk.name, W2 - 80, 48), 375, py + 312, 48, '#ffffff', 'center');
    // 类型 + 能耗胶囊（居中）
    const mw = 600, mh = 48, mx = 375 - mw / 2, my = py + 342;
    fillRoundRect(ctx, mx, my, mw, mh, mh / 2, '#0b0f16');
    strokeRoundRect(ctx, mx, my, mw, mh, mh / 2, hexA(cCol, 0.65), 1.2);
    text(ctx, `${sk.type || '被动'} · ⚡${energy.label}`, 375, my + mh / 2 + 1, 28, lighten(cCol, 1.25), 'center');
    if (attackEnergy) {
      text(ctx, '仅激活本技能；不含其他技能、圣物与天赋', 375, py + 411, 23, '#9fb2c3', 'center');
      if (conditionalEnergy) text(ctx, '分支费用区间随当前能量变化', 375, py + 439, 23, '#9fb2c3', 'center');
    }
    // 基础效果（居中排版，最多 2 行）
    const baseLines = baseCopy;
    baseLines.forEach((ln, li) => {
      text(ctx, ln, 375, py + baseY + li * 42, 34, '#c9d6e4', 'center');
    });
    fillRoundRect(ctx, px + 30, py + baseEnd, W2 - 60, 1.5, 0.75, hexA(cCol, 0.35));
    // 三张分支卡：字母徽章列 + 分支名 + 概述 + 金色 Lv 前缀逐级行
    const cx0 = px + 22, cw = W2 - 44;
    let branchY = py + baseEnd + 24;
    [['A', 'a', 'ap'], ['B', 'b', 'bp'], ['C', 'c', 'cp']].forEach(([bk, ak, pk], bi) => {
      const overview = sk[ak] || '';
      const cy0 = branchY, chh = heights[bi];
      branchY += chh + 16;
      if (!overview) {
        fillRoundRect(ctx, cx0, cy0, cw, chh, 16, 'rgba(255,255,255,0.03)');
        strokeRoundRect(ctx, cx0, cy0, cw, chh, 16, 'rgba(255,255,255,0.10)', 1);
        text(ctx, `${bk} 分支未开放`, cx0 + cw / 2, cy0 + chh / 2, 22, '#5a6c80', 'center');
        return;
      }
      const bi2 = overview.indexOf('：');
      const bName = bi2 > 0 ? overview.slice(0, bi2) : overview;
      const bDesc = require('../../branch-description.js').current(sk, bk, 0);
      const lvls = require('../../branch-description.js').upgrades(sk, bk);


      fillRoundRect(ctx, cx0 + 22, cy0 + 18, 60, 60, 16, cCol);
      text(ctx, bk, cx0 + 54, cy0 + 48, 32, '#0d1117', 'center');
      text(ctx, fit(bName, cw - 130, 32), cx0 + 104, cy0 + 36, 34, '#ffffff', 'left');
      if (attackEnergy) {
        const costs = [1, 2, 3].map(rank => `${bk}${rank} ${skillEnergy(towerKey, sk.name, bk, rank).amount}`);
        const costText = `耗能：${costs.join('  ')}/次`;
        let costSize = 22;
        ctx.font = `bold ${costSize}px sans-serif`;
        while (costSize > 16 && ctx.measureText(costText).width > cw - 126) {
          ctx.font = `bold ${--costSize}px sans-serif`;
        }
        text(ctx, costText, cx0 + 104, cy0 + 69, costSize, '#f7c948', 'left');
      }
      // 概述最多 2 行（28px）
      branchRows[bi].lines.forEach((ln, li) => {
        text(ctx, ln, cx0 + 22, cy0 + 100 + li * 38, 32, '#c9d6e4', 'left');
      });
      const upgradesY = cy0 + 100 + Math.max(1,branchRows[bi].lines.length)*38 + 18;
      fillRoundRect(ctx, cx0 + 22, upgradesY - 20, cw - 44, 1, 0.5, 'rgba(255,255,255,0.10)');
      lvls.forEach((t, li) => {
        const ry2 = upgradesY + li * 36;
        text(ctx, `Lv${li + 1}→Lv${li + 2}`, cx0 + 22, ry2, 30, '#f7c948', 'left');
        const ln = fit(t, cw - 180, 30);
        text(ctx, ln, cx0 + 170, ry2, 28, '#9fb2c3', 'left');
      });
    });
    ctx.restore();
  }
  return { menuCodex, codexSkillPanel };
}
module.exports = { createCodexScreen };
