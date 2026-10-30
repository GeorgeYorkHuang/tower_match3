/** Tower codex rendering only. Host injects shared image/theme/text helpers; no game or save references. */
'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
const TOWERS_COLOR = key => (CONFIG.TOWERS[key] || {}).color;
function createCodexScreen(deps) {
  const { drawImg, skillIconSrc, drawTowerGlyph, IMG_SRC, TOWER_HEX, MENU_TAB_THEME, lighten, hexA, wrapText } = deps;
  function menuCodex(ctx, s, push) {
    const th = MENU_TAB_THEME.codex;
    const keys = Object.keys(CONFIG.TOWERS);
    const colorName = (k) => (CONFIG.COLORS[CONFIG.TOWERS[k].color] || {}).name || k;
    // ---- 贴合式塔标签（attached tabs）：仅上圆角，激活页签与下方面板同底色无缝粘连 ----
    // v1.16.94 只显示图标（56px = 原"图标+塔名"合计高度），激活页签=塔色不透明
    // v1.16.110 六页签等宽：726/6=121，无缝拼接 + 未激活页签间竖线分隔
    // v1.16.129 ty0 206→230：顶部标题/货币下移到安全区下方后，页签行随之下移让位
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
      if (sel) {
        // 激活：顶边白色高亮条 + 描边（底边开口，视觉上"长"在面板上）
        ctx.strokeStyle = cCol; ctx.lineWidth = 2; ctx.stroke();
        fillRoundRect(ctx, cx + 14, ty0, tw2 - 28, 5, 2.5, 'rgba(255,255,255,0.55)');
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
      }
      // 仅塔美术图标（居中）
      const isz = 56;
      if (!drawImg(ctx, IMG_SRC[k], cx + (tw2 - isz) / 2, ty0 + (th2 - isz) / 2, isz, isz)) {
        drawTowerGlyph(ctx, k, cx + (tw2 - isz) / 2, ty0 + (th2 - isz) / 2, isz);
      }
      // v1.16.110 竖线分隔（相邻两页签均未激活时）
      if (i < keys.length - 1 && !sel && s.codexSel !== keys[i + 1]) {
        fillRoundRect(ctx, cx + tw2, ty0 + 12, 1, th2 - 24, 0, 'rgba(0,0,0,0.35)');
      }
    });
    // ---- 详情面板（紧贴标签行底部，无间隙）：v1.16.94 塔色 60% 透明 + 高度 +50% + 4 列属性 ----
    const k = s.codexSel && keys.includes(s.codexSel) ? s.codexSel : keys[0];
    const T = CONFIG.TOWERS[k];
    const cCol = TOWER_HEX[T.color] || '#8ea3b8';
    const GS = CONFIG.GLOBAL_SKILL || {};
    const dx = 12, dw = 726, dy = ty0 + th2;   // 与标签行严丝合缝
    const PH = 222;                            // 148 × 1.5
    const panelCol = hexA(cCol, 0.40);         // 塔色 40% 不透明（60% 透明）
    fillRoundRect(ctx, dx, dy, dw, PH, 0, panelCol);
    fillRoundRect(ctx, dx, dy + PH - 14, dw, 14, 7, panelCol);   // 底部补圆角
    text(ctx, colorName(k), dx + 30, dy + 44, 38, '#ffffff', 'left');
    // 3 行属性：伤害/攻速/射程 —— 每行 = 属性名 + 胶囊进度条（固定满值）+ 数值（v1.16.110 耗能移出改胶囊）
    const statCols = [
      { name: '伤害', val: T.baseDps, cap: 100, txt: `${T.baseDps}/s` },
      { name: '攻速', val: 1 / T.atkInterval, cap: 2, txt: `${(1 / T.atkInterval).toFixed(1)}发/s` },
      { name: '射程', val: T.range, cap: 1000, txt: `${T.range}` },
    ];
    const barW = 430, barX = dx + 110, valX = barX + barW + 14;
    statCols.forEach((c, ri) => {
      const rowY = dy + 100 + ri * 40;         // 3 行均布（面板高 222）
      text(ctx, c.name, dx + 30, rowY, 21, '#ffffff', 'left');
      const by = rowY - 8;
      fillRoundRect(ctx, barX, by, barW, 16, 8, 'rgba(255,255,255,0.18)');
      const r = Math.max(0, Math.min(1, c.val / c.cap));
      if (r > 0) fillRoundRect(ctx, barX, by, Math.max(16, barW * r), 16, 8, lighten(cCol, 1.2));
      strokeRoundRect(ctx, barX, by, barW, 16, 8, 'rgba(255,255,255,0.35)', 1);
      text(ctx, c.txt, valX, rowY, 18, '#e8f0f8', 'left');
    });
    // v1.16.110 耗能胶囊（面板右上角）：深色内凹 + 金描边 + ⚡；v1.17.10 按塔攻速×DPS 定价（attackCost）
    const enV = (CONFIG.TOWERS[k] && CONFIG.TOWERS[k].attackCost) || GS.perAttack || 0.5;
    const ecW = 190, ecH = 40, ecX = dx + dw - 30 - ecW, ecY = dy + 20;
    fillRoundRect(ctx, ecX, ecY, ecW, ecH, ecH / 2, '#0b0f16');
    strokeRoundRect(ctx, ecX, ecY, ecW, ecH, ecH / 2, 'rgba(244,208,63,0.55)', 1.2);
    text(ctx, `⚡ 耗能 ${enV}/发`, ecX + ecW / 2, ecY + ecH / 2 + 1, 19, '#f4d03f', 'center');
    // ---- 技能池卡片（v1.16.91 大字号：塔色立体卡 + 内部上下分区；底部留 5% 白不满铺）----
    const pool = CONFIG.EFFECT_POOLS[k] || [];
    // v1.16.128 标题只留「技能池」（去掉「· 点击卡片查看详情」提示）
    text(ctx, '技能池', dx + 30, dy + 264, 30, '#ffffff', 'left');
    const TAB_Y = 1504;                       // 底部分页栏 y（menuLayer 常量一致）
    const cw3 = 300, ch3 = 205;               // v1.16.128 卡高 210→205
    const gx0 = Math.round(750 * 0.05) + 10;  // v1.16.128 5% 左边距再向内 10px
    const colX = [gx0, 750 - gx0 - cw3];      // 两列对称（左右各内收 10）
    const gy0 = dy + 292;                     // 首行 y（面板加高后下移）
    const rows = Math.ceil(pool.length / 2);
    const bottomY = TAB_Y - 54;               // v1.16.129 底部留白 5%屏高→54px（约 3.3%），补回页签行下移占用的 24px
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
      // 立体边缘：外描边（塔色）+ 顶部内高光 + 底部内阴影
      strokeRoundRect(ctx, gx, gy, cw3, ch3, 14, cMain, 1.8);
      strokeRoundRect(ctx, gx + 1.5, gy + 1.5, cw3 - 3, ch3 - 3, 12, 'rgba(255,255,255,0.22)', 1.2);
      fillRoundRect(ctx, gx + 10, gy + 2.5, cw3 - 20, 2.5, 1.2, hexA(cMain, 0.75));   // 顶棱高光
      fillRoundRect(ctx, gx + 10, gy + ch3 - 5, cw3 - 20, 2.5, 1.2, 'rgba(0,0,0,0.45)'); // 底棱阴影
      // ---- 上区：图标 + 技能名左右排布 ----
      if (!drawImg(ctx, skillIconSrc(k, sk.name), gx + 16, gy + 10, 64, 64)) {
        fillRoundRect(ctx, gx + 16, gy + 10, 64, 64, 12, hexA(cMain, 0.25));
        text(ctx, sk.icon || '?', gx + 48, gy + 44, 32, '#ffffff', 'center');
      }
      text(ctx, sk.name, gx + 92, gy + 30, 33, '#ffffff', 'left');
      // v1.16.110 类型行 + 能耗胶囊（卡片右上）：SKILL_ENERGY 表内为周期技能耗能；表外（普攻强化/DoT/命中触发型）= 0
      const en = CONFIG.SKILL_ENERGY[sk.name];
      const enTxt = en === undefined ? 0 : en;
      text(ctx, sk.type || '', gx + 92, gy + 62, 19, hexA(cMain, 0.9), 'left');
      const ecW2 = 72, ecH2 = 32, ecX2 = gx + cw3 - 16 - ecW2, ecY2 = gy + 77 - ecH2;
      fillRoundRect(ctx, ecX2, ecY2, ecW2, ecH2, ecH2 / 2, '#0b0f16');
      strokeRoundRect(ctx, ecX2, ecY2, ecW2, ecH2, ecH2 / 2, 'rgba(244,208,63,0.55)', 1.2);
      text(ctx, `⚡${enTxt}`, ecX2 + ecW2 / 2, ecY2 + ecH2 / 2 + 1, 17, '#f4d03f', 'center');
      // 分隔线（塔色渐隐），上下分区
      fillRoundRect(ctx, gx + 18, gy + 83, cw3 - 36, 1.5, 0.75, hexA(cMain, 0.35));
      // ---- 下区：技能描述（左右各留 20px 白）----
      const descLines = wrapText(ctx, sk.pick || sk.desc || '暂无描述', cw3 - 40, 24).slice(0, 3);
      descLines.forEach((ln, li) => {
        text(ctx, ln, gx + 20, gy + 102 + li * 32, 24, '#d7e2ee', 'left');
      });
      // v1.16.110 移除右下角"点击查看详情 >>>"（卡片整体可点，入口语义由能耗胶囊+说明区承担）
    });
  }
  function codexSkillPanel(ctx, s, push) {
    const p = s.panel || {};
    const towerKey = p.tower || s.codexSel || 'fire';
    const sk = (CONFIG.EFFECT_POOLS[towerKey] || [])[p.idx];
    if (!sk) return;
    const cCol = TOWER_HEX[TOWERS_COLOR(towerKey)] || '#8ea3b8';
    const W2 = 700, H2 = 1360, px = 25, py = Math.round((LOGIC_H - H2) / 2);
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
    strokeRoundRect(ctx, px - 4, py - 4, W2 + 8, H2 + 8, 28, hexA(cCol, 0.30), 6);   // 外圈柔光
    fillRoundRect(ctx, px, py, W2, H2, 24, '#151b24');
    strokeRoundRect(ctx, px, py, W2, H2, 24, cCol, 2);
    // 顶部塔色丝带（上圆角下直角 + 顶边内高光），标题点明"三选一"语义
    fillRoundRect(ctx, px, py, W2, 64, 24, cCol);
    fillRoundRect(ctx, px, py + 42, W2, 22, 0, cCol);
    fillRoundRect(ctx, px + 16, py + 3, W2 - 32, 3, 1.5, 'rgba(255,255,255,0.35)');
    text(ctx, '技 能 分 支 · 升 级 三 选 一', 375, py + 34, 28, '#ffffff', 'center');
    pushScaled('panelClose', null, px + W2 - 76, py + 8, 52, 52);
    ctx.beginPath(); ctx.arc(px + W2 - 50, py + 34, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
    text(ctx, '✕', px + W2 - 50, py + 35, 24, '#ffffff', 'center');
    // 大图标（195px 居中 + 塔色氛围光）
    const icy = py + 80, icx = 375, ISZ = 195, IHD = ISZ / 2;
    const glow = ctx.createRadialGradient(icx, icy + IHD, 10, icx, icy + IHD, ISZ);
    glow.addColorStop(0, hexA(cCol, 0.30)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(icx, icy + IHD, ISZ, 0, Math.PI * 2);
    ctx.fillStyle = glow; ctx.fill();
    if (!drawImg(ctx, skillIconSrc(towerKey, sk.name), icx - IHD, icy, ISZ, ISZ)) {
      fillRoundRect(ctx, icx - IHD, icy, ISZ, ISZ, 36, hexA(cCol, 0.18));
      strokeRoundRect(ctx, icx - IHD, icy, ISZ, ISZ, 36, cCol, 2);
      text(ctx, sk.icon || '?', icx, icy + 104, 82, '#ffffff', 'center');
    }
    text(ctx, fit(sk.name, W2 - 80, 48), 375, py + 312, 48, '#ffffff', 'center');
    // 类型 + 能耗胶囊（居中）
    const en = CONFIG.SKILL_ENERGY[sk.name];
    const enTxt = en === undefined ? 0 : en;
    const mw = 320, mh = 48, mx = 375 - mw / 2, my = py + 348;
    fillRoundRect(ctx, mx, my, mw, mh, mh / 2, '#0b0f16');
    strokeRoundRect(ctx, mx, my, mw, mh, mh / 2, hexA(cCol, 0.65), 1.2);
    text(ctx, `${sk.type || '被动'} · ⚡${enTxt}`, 375, my + mh / 2 + 1, 22, lighten(cCol, 1.25), 'center');
    // 基础效果（居中排版，最多 2 行）
    const baseLines = wrapText(ctx, sk.pick || sk.desc || '暂无描述', 600, 28).slice(0, 2);
    baseLines.forEach((ln, li) => {
      text(ctx, ln, 375, py + 428 + li * 38, 28, '#c9d6e4', 'center');
    });
    fillRoundRect(ctx, px + 30, py + 514, W2 - 60, 1.5, 0.75, hexA(cCol, 0.35));
    text(ctx, '升级分支 · 三选一', px + 30, py + 552, 28, '#ffffff', 'left');
    text(ctx, '对局内技能升级时选其一条强化', px + W2 - 30, py + 552, 18, '#8ea3b8', 'right');
    // 三张分支卡：字母徽章列 + 分支名 + 概述 + 金色 Lv 前缀逐级行
    const cx0 = px + 40, cw = W2 - 80, chh = 250;
    [['A', 'a', 'ap'], ['B', 'b', 'bp'], ['C', 'c', 'cp']].forEach(([bk, ak, pk], bi) => {
      const overview = sk[ak] || '';
      const cy0 = py + 584 + bi * (chh + 8);
      if (!overview) {
        fillRoundRect(ctx, cx0, cy0, cw, chh, 16, 'rgba(255,255,255,0.03)');
        strokeRoundRect(ctx, cx0, cy0, cw, chh, 16, 'rgba(255,255,255,0.10)', 1);
        text(ctx, `${bk} 分支未开放`, cx0 + cw / 2, cy0 + chh / 2, 22, '#5a6c80', 'center');
        return;
      }
      const bi2 = overview.indexOf('：');
      const bName = bi2 > 0 ? overview.slice(0, bi2) : overview;
      const bDesc = bi2 > 0 ? overview.slice(bi2 + 1) : '';
      const lvls = sk[pk] || [];
      fillRoundRect(ctx, cx0, cy0, cw, chh, 16, 'rgba(255,255,255,0.05)');
      strokeRoundRect(ctx, cx0, cy0, cw, chh, 16, cCol, 1.5);
      fillRoundRect(ctx, cx0 + 22, cy0 + 20, 64, 64, 16, cCol);
      text(ctx, bk, cx0 + 54, cy0 + 54, 34, '#0d1117', 'center');
      text(ctx, fit(bName, cw - 130, 32), cx0 + 104, cy0 + 42, 32, '#ffffff', 'left');
      // 概述最多 2 行（28px）
      wrapText(ctx, bDesc || '', cw - 130, 28).slice(0, 2).forEach((ln, li) => {
        text(ctx, ln, cx0 + 104, cy0 + 84 + li * 34, 28, '#c9d6e4', 'left');
      });
      fillRoundRect(ctx, cx0 + 22, cy0 + 148, cw - 44, 1, 0.5, 'rgba(255,255,255,0.10)');
      lvls.slice(0, 3).forEach((t, li) => {
        const ry2 = cy0 + 174 + li * 28;
        text(ctx, `Lv${li + 1}→${li + 2}`, cx0 + 104, ry2, 22, '#f7c948', 'left');
        const ln = fit(t, cw - 220, 22);
        text(ctx, ln, cx0 + 200, ry2, 22, '#9fb2c3', 'left');
      });
    });
    ctx.restore();
  }
  return { menuCodex, codexSkillPanel };
}
module.exports = { createCodexScreen };
