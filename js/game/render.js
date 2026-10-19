/**
 * render.js —— 主界面渲染（设计稿 750×1626 逻辑坐标，定版 v7：iPhone 15 比例）
 * 分区：状态条 72 / 行动区 700×970（入口带 68、城墙 24）/ 塔位区 122 / 棋盘区 462
 */
const CONFIG = require('../config.js');
const { roundRect, fillRoundRect, strokeRoundRect, text, progressBar, button } = require('./ui.js');

const L = CONFIG.LAYOUT;
const LOGIC_H = CONFIG.DESIGN.H; // 1626

/* hex 颜色提亮：返回 rgb() 字符串 */
function lighten(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

/* 棋盘 6 色 */
const COLOR_FILL = {
  red: '#e74c3c', blue: '#3498db', green: '#2ecc71',
  yellow: '#f1c40f', purple: '#9b59b6', orange: '#b5651d', // 橙=焦糖棕橙（与红黄区分）
};
/* 塔位配色（含未解锁空位） */
const TOWER_TINT = {
  fire: '#e74c3c', ice: '#5dade2', poison: '#52be80',
  electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d',
};
/* 塔位图标字符（emoji 兜底；部分 canvas 环境用 drawTowerGlyph 几何图形） */
const TOWER_ICON = { fire: '🔥', ice: '❄', poison: '☠', electric: '⚡', boomerang: '🌀', cannon: '💣' };

/* 塔图鉴精简数据：定位一句话 + 招牌技能（与 config EFFECT_POOLS P0 技能对应） */
const TOME_ROWS = [
  { tint: '#e74c3c', name: '火塔',     desc: '直线火球 · 高伤单体灼烧',   skills: '点燃 · 溅射 · 连击' },
  { tint: '#5dade2', name: '冰塔',     desc: '冰锥减速 · 冻结控场',       skills: '减速场 · 冰冻 · 冰锥穿透' },
  { tint: '#52be80', name: '毒塔',     desc: '毒液持续伤害 · 扩散传染',   skills: '剧毒 · 扩散 · 毒爆' },
  { tint: '#f4d03f', name: '电塔',     desc: '闪电折线 · 弹跳群伤',       skills: '连锁 · 麻痹 · 过载' },
  { tint: '#a569bd', name: '回旋镖塔', desc: '弧线飞行 · 穿透折返',       skills: '穿透 · 折返增伤 · 飞距' },
  { tint: '#b5651d', name: '炮塔',     desc: '抛物线炮弹 · 范围爆炸',     skills: '溅射 · 重击 · 穿透弹' },
];

/* 图片资源映射（微信小游戏相对路径）；加载失败/未完成时回退色块+字符 */
const IMG_SRC = {
  fire: 'images/towers/fire.png', ice: 'images/towers/ice.png',
  poison: 'images/towers/poison.png', electric: 'images/towers/electric.png',
  boomerang: 'images/towers/boomerang.png', cannon: 'images/towers/cannon.png',
  enemy: 'images/enemies/normal.png', boss: 'images/enemies/boss.png',
  runner: 'images/enemies/runner.png', tank: 'images/enemies/tank.png',
  coin: 'images/ui/coin.png', bullet: 'images/bullet.png',
  actionArea: 'images/ui/action_area_edges.jpg', // 行动区背景（底版+两侧边缘灌木，750×720，y128-848）
  wall: 'images/ui/wall.jpg',              // 城墙背景（750×60 主体，y967-1027；血条区 10px y1027-1037 含血量数字，底部空隙 5px）
  towerRow: 'images/ui/tower_row_dark.jpg', // 塔位区背景（深色石板，750×122，y1042-1164；浅色旧版 tower_row.jpg 保留备份）
  boardBg: 'images/ui/board_bg_dark_1.jpg', // 三消棋盘区背景（深蓝款，750×462，y1164-1626；浅色版 board_bg.jpg 保留备用）
};
/* 三消方块图片（颜色 → 棋盘素材）；加载失败/未完成时回退色块+底部暗条 */
const BOARD_IMG = {
  red: 'images/board/fire.png', blue: 'images/board/ice.png',
  green: 'images/board/poison.png', yellow: 'images/board/electric.png',
  purple: 'images/board/boomerang.png', orange: 'images/board/cannon.png',
};
const imgCache = {};
function loadImg(src) {
  if (src in imgCache) return imgCache[src];
  if (typeof wx !== 'undefined' && wx.createImage) {
    const img = wx.createImage();
    img.onload = () => { imgCache[src] = img; };
    img.onerror = () => { imgCache[src] = null; };
    img.src = src;
    imgCache[src] = img;
  } else if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => { imgCache[src] = img; };
    img.onerror = () => { imgCache[src] = null; };
    img.src = src;
    imgCache[src] = img;
  } else {
    imgCache[src] = null;
  }
  return imgCache[src];
}
/** 已加载则绘制并返回 true；否则返回 false（调用方回退） */
function drawImg(ctx, src, x, y, w, h) {
  const img = loadImg(src);
  if (img && img.width > 0) {
    ctx.drawImage(img, x, y, w, h);
    return true;
  }
  return false;
}

const STATUS_H = L.statusBar.h;             // 72
const AREA_X = L.actionArea.x;              // 25
const AREA_Y = STATUS_H;                    // 72
const AREA_W = L.actionArea.w;              // 700
const AREA_H = L.actionArea.h;              // 970（入口68+移动822+城墙80）
const ENTRY_H = L.entryBand.h;              // 68
const WALL_H = L.wall.h;                    // 75（主体60 + 血条区10 + 底空隙5）
const WALL_BAR_H = 10;                      // 城墙血条区高度（10px，含血量数字）
const WALL_BAR_OFF = 5;                     // 血条区离城墙底部偏移
const WALL_Y = AREA_Y + AREA_H - WALL_H;    // 城墙顶 y（967）
const TOWER_ROW_Y = WALL_Y + WALL_H;        // 塔位区顶 y（1042 不变）
const BOARD_Y = TOWER_ROW_Y + L.towerRow.h; // 棋盘区顶 y

function layout() {
  return {
    statusH: STATUS_H, areaX: AREA_X, areaY: AREA_Y, areaW: AREA_W, areaH: AREA_H,
    entryH: ENTRY_H, wallH: WALL_H, wallY: WALL_Y, towerRowY: TOWER_ROW_Y, boardY: BOARD_Y,
    // 棋盘格：12 列 6 行 60×60，两侧留白 15，底留 6
    cell: L.boardCell.size,
    boardX: (750 - L.boardCell.cols * L.boardCell.size) / 2,
    boardRows: L.boardCell.rows,
    boardCols: L.boardCell.cols,
    // 塔位槽：4 槽 48 间距 12 整体 228 居中
    slotSize: L.towerSlot.size,
    slotGap: L.towerSlot.gap,
    slotCount: L.towerSlot.count,
    slotY: TOWER_ROW_Y + (L.towerRow.h - L.towerSlot.size) / 2,
  };
}

class Renderer {
  constructor() {
    this.ly = layout();
  }

  /** 状态条：金币 + 波次 + 波倒计时 */
  status(ctx, s) {
    const goldIcon = 40;
    // 金币（图片优先，回退色块 ¥）
    if (!drawImg(ctx, IMG_SRC.coin, 12, 16, goldIcon, goldIcon)) {
      fillRoundRect(ctx, 12, 16, goldIcon, goldIcon, 10, '#f7c948');
      text(ctx, '¥', 32, 36, 22, '#7c5c00', 'center');
    }
    text(ctx, fmtNum(s.gold), 64, 36, 26, '#f7c948');
    // 波次与倒计时（居中）
    text(ctx, `第 ${s.wave} 波`, 375, 26, 24, '#ffffff', 'center');
    if (s.state === 'fighting' && s.waveTime < s.waveDuration) {
      text(ctx, `${Math.ceil(s.waveDuration - s.waveTime)}s`, 375, 52, 18, '#b8c2cc', 'center');
    }
    // 协同状态（右）
    const syn = s.synergies;
    const label = syn[0] && syn[0].done ? '协同✓' : '协同';
    text(ctx, label, 700, 36, 20, syn[0] && syn[0].done ? '#7ef0a3' : '#b8c2cc', 'right');
    // 底线
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, STATUS_H - 2, 750, 2);
  }

  /** 行动区底：入口带 + 敌人 + 城墙 + 塔位区 + 棋盘（按状态分层调用） */
  actionArea(ctx, s) {
    // 行动区背景图（y128 起 720 高 = 怪物行走区）；加载失败回退深色底
    if (!drawImg(ctx, IMG_SRC.actionArea, 0, AREA_Y + ENTRY_H, 750, WALL_Y - (AREA_Y + ENTRY_H))) {
      fillRoundRect(ctx, AREA_X, AREA_Y, AREA_W, AREA_H, 8, '#151a21');
    }
    // 入口带
    fillRoundRect(ctx, AREA_X, AREA_Y, AREA_W, ENTRY_H, 8, '#1f2732');
    text(ctx, `敌人 ${s.enemyCount} 只`, AREA_X + 16, AREA_Y + ENTRY_H / 2, 20, '#9fb2c3');
    if (s.hasBoss) text(ctx, 'BOSS', AREA_X + AREA_W - 100, AREA_Y + ENTRY_H / 2, 20, '#ff6b6b', 'right');
    // v1.8 整体经验条：出怪区最上方横条 + 右侧等级圆
    if (s.expLevel !== undefined) {
      const exX = AREA_X + 190, exY = AREA_Y + 14, exW = AREA_W - 300, exH = 16;
      text(ctx, '整体经验', exX, exY - 6, 18, 'rgba(255,255,255,0.45)', 'left');
      progressBar(ctx, exX, exY, exW, exH, s.expRatio || 0, '#f7c948', 'rgba(0,0,0,0.4)');
      text(ctx, `${Math.floor(s.exp)}/${Math.ceil(s.expNeed)}`, exX + exW / 2, exY + exH + 6, 16, 'rgba(255,255,255,0.5)', 'center');
      // 右侧等级圆
      const rcx = exX + exW + 46, rcy = exY + exH / 2, rr = 25;
      ctx.beginPath(); ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
      ctx.fillStyle = '#f7c948'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      text(ctx, `${s.expLevel}`, rcx, rcy + 2, 30, '#5c4a00', 'center');
    }
    // v1.9 本局获得圣物：经验条下方图标行（精英掉落三选一选择后入列）
    if (s.battleRelics && s.battleRelics.length) {
      const rx = AREA_X + 190, ry = AREA_Y + 38;
      s.battleRelics.forEach((rc, i) => {
        const icx = rx + i * 40;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(icx + 13, ry + 15, 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(247,201,72,0.20)'; ctx.fill();
        ctx.strokeStyle = 'rgba(247,201,72,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.globalAlpha = 1;
        text(ctx, rc.icon, icx + 13, ry + 18, 24, '#ffffff', 'center');
      });
      text(ctx, `圣物 ×${s.battleRelics.length}`, rx + s.battleRelics.length * 40 + 8, ry + 18, 18, 'rgba(255,255,255,0.5)', 'left');
    }
    // 敌群血条（入口带下方细条）
    progressBar(ctx, AREA_X + 12, AREA_Y + ENTRY_H - 8, AREA_W - 24, 6, s.enemyHpRatio, '#ff6b6b', 'rgba(255,255,255,0.15)');
    // 城墙（防线）
    this.wall(ctx, s.lineHp, s.lineMaxHp);
    // 塔位区
    this.towerRow(ctx, s.towers);
    // 棋盘
    this.board(ctx, s.grid, s.selected, s.anim);
    // 底部功能键区（棋盘下方）
    this.funcBar(ctx, s);
  }

  wall(ctx, hp, maxHp) {
    // 城墙主体 60px + 血条区 10px（城墙底部）+ 底部空隙 5px；血量数字居中于墙体（砖面）；素材满宽绘制
    const bodyH = WALL_H - WALL_BAR_H - WALL_BAR_OFF;
    if (!drawImg(ctx, IMG_SRC.wall, 0, WALL_Y, 750, bodyH)) {
      fillRoundRect(ctx, AREA_X, WALL_Y, AREA_W, bodyH, 6, '#3d4553');
      // 城齿
      ctx.fillStyle = '#525d6e';
      for (let x = AREA_X; x < AREA_X + AREA_W; x += L.wall.crenel * 3) {
        ctx.fillRect(x, WALL_Y, L.wall.crenel, 6);
      }
    }
    // 血条区背景（与墙体阴影同色）：城墙主体下方到城墙底
    const shadowCol = '#241a12'; // 墙体阴影/血条区背景统一深棕色
    ctx.fillStyle = shadowCol;
    ctx.fillRect(AREA_X, WALL_Y + bodyH, AREA_W, WALL_H - bodyH);
    // 血量数字：居中于城墙墙体（砖面），大号
    text(ctx, `${Math.max(0, Math.ceil(hp))}`, AREA_X + AREA_W / 2, WALL_Y + bodyH / 2 + 8, 24, '#ffffff', 'center');
    // 城墙血条（10px 高，血条区=城墙底部）：阴影色槽 + 边框 + 血量分级变色
    const barY = WALL_Y + WALL_H - WALL_BAR_H - WALL_BAR_OFF + 0.5;
    const barH = WALL_BAR_H - 1;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const barCol = ratio > 0.5 ? '#4cd964' : ratio > 0.25 ? '#ffcc00' : '#ff5252';
    fillRoundRect(ctx, AREA_X + 6, barY, AREA_W - 12, barH, 3, shadowCol);
    strokeRoundRect(ctx, AREA_X + 6, barY, AREA_W - 12, barH, 3, 'rgba(255,255,255,0.3)', 1);
    if (ratio > 0) fillRoundRect(ctx, AREA_X + 7.5, barY + 0.5, (AREA_W - 15) * ratio, barH - 1, 2.5, barCol);
  }

  /** 底部功能键区（三消棋盘下方）：设置 / 塔图鉴 / 商店 / 帮助 */
  funcBar(ctx, s) {
    const fy = BOARD_Y + L.boardArea.h;           // 1524
    const h = L.funcBar.h;                        // 102
    fillRoundRect(ctx, 0, fy, 750, h, 0, '#131820');
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, fy, 750, 2);
    const labels = ['⚙ 设置', '📖 塔图鉴', '💰 商店', 'ℹ 帮助'];
    const keys = ['setting', 'tome', 'shop', 'help'];
    const kw = 150, kh = 78;
    const gap = (750 - labels.length * kw) / (labels.length + 1);
    this.funcHits = [];
    for (let i = 0; i < labels.length; i++) {
      const x = gap + i * (kw + gap);
      const y = fy + (h - kh) / 2;
      fillRoundRect(ctx, x, y, kw, kh, 14, '#232a36');
      strokeRoundRect(ctx, x, y, kw, kh, 14, 'rgba(255,255,255,0.14)', 2);
      text(ctx, labels[i], x + kw / 2, y + kh / 2, 26, '#d7dee6', 'center');
      this.funcHits.push({ key: keys[i], hit: (px, py) => px >= x && px <= x + kw && py >= y && py <= y + kh });
    }
  }

  /** 塔详情弹层：点击塔位图标 → 查看攻击 / 攻击间隔 / 技能等级（v1.8） */
  towerInfoLayer(ctx, info, hits) {
    const w = 560, hgt = 640, x = (750 - w) / 2, y = (LOGIC_H - hgt) / 2;
    // 遮罩（点遮罩关闭）
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    fillRoundRect(ctx, x, y, w, hgt, 18, '#232a34');
    strokeRoundRect(ctx, x, y, w, hgt, 18, TOWER_TINT[info.key] || '#3d4553', 3);
    // 标题：塔名 + 整体等级
    text(ctx, `${info.name}塔 · 等级 Lv.${info.level}`, x + w / 2, y + 48, 34, '#ffffff', 'center');
    // 攻击 / 攻击间隔 / DPS
    text(ctx, `攻击伤害：${info.atk || 0} / 次`, x + w / 2, y + 106, 26, '#f7c948', 'center');
    text(ctx, `攻击间隔：${(info.interval || 0).toFixed(1)} 秒`, x + w / 2, y + 146, 26, '#9fb2c3', 'center');
    text(ctx, `当前 DPS：${Math.round(info.dps)}`, x + w / 2, y + 184, 22, '#7ea8d8', 'center');
    // 分隔线
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 40, y + 214, w - 80, 2);
    // 技能等级列表
    text(ctx, '技能等级', x + 40, y + 246, 22, '#b8c2cc', 'left');
    let sy = y + 278;
    const skills = info.skills || [];
    if (!skills.length) {
      text(ctx, '暂无技能，消除对应颜色方块获得', x + w / 2, sy + 30, 20, 'rgba(255,255,255,0.45)', 'center');
      sy += 120;
    } else {
      skills.forEach((sk) => {
        fillRoundRect(ctx, x + 30, sy, w - 60, 78, 12, '#1d242e');
        const skDef = (CONFIG.EFFECT_POOLS[info.key] || []).find((q) => q.name === sk.name);
        if (skDef && skDef.icon) text(ctx, skDef.icon, x + 46, sy + 30, 30, '#ffffff');
        text(ctx, sk.name, x + 72, sy + 26, 24, '#ffffff');
        fillRoundRect(ctx, x + 52, sy + 42, 60, 20, 6, sk.level >= 3 ? '#e74c3c' : '#3a6ea5');
        text(ctx, `Lv.${sk.level}`, x + 82, sy + 52, 14, '#ffffff', 'center');
        text(ctx, sk.desc || '', x + 186, sy + 30, 17, '#9fb2c3');
        text(ctx, sk.b || '', x + 186, sy + 56, 17, '#7ea8d8');
        sy += 88;
      });
    }
    // 关闭按钮
    hits.close = button(ctx, x + 150, y + hgt - 84, w - 300, 56, '关闭', { bg: '#3a6ea5', fontSize: 26 });
  }

  towerRow(ctx, towers) {
    const { slotSize, slotGap, slotCount, slotY } = this.ly;
    // 塔位区背景图（石板放置地面）；加载失败回退浅色条
    if (!drawImg(ctx, IMG_SRC.towerRow, 0, TOWER_ROW_Y, 750, L.towerRow.h)) {
      fillRoundRect(ctx, AREA_X, TOWER_ROW_Y, AREA_W, L.towerRow.h, 8, 'rgba(255,255,255,0.05)');
    }
    text(ctx, '塔位', AREA_X + 14, TOWER_ROW_Y + 24, 18, 'rgba(255,255,255,0.4)');
    const total = slotCount * slotSize + (slotCount - 1) * slotGap;
    let x = (750 - total) / 2;
    for (let i = 0; i < slotCount; i++) {
      const tw = towers[i] || null;
      // 槽：无压暗层、无描边；空槽仅淡白提示
      fillRoundRect(ctx, x, slotY, slotSize, slotSize, 8, tw ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0.05)');
      if (!tw) {
        text(ctx, '待消除', x + slotSize / 2, slotY + slotSize / 2 + 2, 13, 'rgba(255,255,255,0.4)', 'center');
      } else {
        // 塔图标（32×32 居中，图片优先，回退自绘几何图形——emoji 在部分 canvas 环境不渲染）
        const ix = x + (slotSize - L.towerIcon.size) / 2;
        const iy = slotY + (slotSize - L.towerIcon.size) / 2 - 2;
        if (!drawImg(ctx, IMG_SRC[tw.key], ix, iy, L.towerIcon.size, L.towerIcon.size)) {
          drawTowerGlyph(ctx, tw.key, ix, iy, L.towerIcon.size);
        }
        // 等级徽章（v1.8：整体等级）
        fillRoundRect(ctx, x + slotSize - 16, slotY - 6, L.towerIcon.badge, L.towerIcon.badge, 4, '#f7c948');
        text(ctx, `${tw.level}`, x + slotSize - 8, slotY + 2, 12, '#5c4a00', 'center');
        // 可点详情小圆标 ⓘ（点击塔图标查看攻击/攻击间隔/技能等级）
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(x + 17, slotY + 17, 11, 0, Math.PI * 2); ctx.fill();
        text(ctx, 'i', x + 17, slotY + 21, 14, '#1a1a1a', 'center');
        // v1.8：移除单塔经验条（经验整体化，经验条在出怪区上方）
      }
      x += slotSize + slotGap;
    }
  }

  board(ctx, grid, selected, anim) {
    const { boardX, boardY, cell, boardRows, boardCols } = this.ly;
    // 三消棋盘区背景图（浅色魔法石台）；加载失败回退深色底板
    if (!drawImg(ctx, IMG_SRC.boardBg, 0, boardY, 750, L.boardArea.h)) {
      fillRoundRect(ctx, boardX - 6, boardY - 6, boardCols * cell + 12, boardRows * cell + 12, 10, '#1a2028');
    }

    /* 阶段 1：交换动画——两个方块从各自旧位置滑向新位置，其余方块原位不动 */
    if (anim && anim.phase === 'swap') {
      const t = easeOutCubic(Math.min(1, anim.progress));
      const [r1, c1, r2, c2] = anim.swap;
      const g0 = anim.base || anim.swapGrid; // 交换后、尚未消除的棋盘
      const px = (r, c) => boardX + c * cell + 2;
      const py = (r, c) => boardY + r * cell + 2;
      for (let r = 0; r < boardRows; r++) {
        for (let c = 0; c < boardCols; c++) {
          const color = g0[r][c];
          if (!color) continue;
          let x = px(r, c), y = py(r, c);
          if (r === r1 && c === c1) { // 从 (r2,c2) 滑向 (r1,c1)
            x = px(r2, c2) + (x - px(r2, c2)) * t;
            y = py(r2, c2) + (y - py(r2, c2)) * t;
          } else if (r === r2 && c === c2) {
            x = px(r1, c1) + (x - px(r1, c1)) * t;
            y = py(r1, c1) + (y - py(r1, c1)) * t;
          }
          this.drawCell(ctx, x, y, cell, color, r, c, selected);
        }
      }
      return;
    }

    /* 阶段 2：消除+下落——被消除格淡出缩小，其余格从本级连锁的原地下落补位 */
    const g0 = (anim && (anim.base || anim.swapGrid)) ? (anim.base || anim.swapGrid) : grid; // 本级下落前棋盘
    const g1 = (anim && anim.final) ? anim.final : grid;                                    // 本级下落后棋盘
    if (anim && anim.phase === 'clear') {
      const fade = Math.min(1, anim.progress / 0.35);
      if (fade < 1) {
        for (let r = 0; r < boardRows; r++) {
          for (let c = 0; c < boardCols; c++) {
            if (!anim.cleared.has(r + ',' + c)) continue;
            const color = g0[r][c];
            if (!color) continue;
            const x = boardX + c * cell + 2, y = boardY + r * cell + 2;
            const sz = (cell - 4) * (1 - fade * 0.35);
            const inset = (cell - 4 - sz) / 2;
            ctx.globalAlpha = 1 - fade;
            if (!drawImg(ctx, BOARD_IMG[color], x + inset, y + inset, sz, sz)) {
              fillRoundRect(ctx, x + inset, y + inset, sz, sz, 8, COLOR_FILL[color] || '#333');
            }
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    // 下落层：最终布局 + 下落偏移（列整体同步下移——同列所有移动格下移相同格数、同速、同时到达，
    // 新补方块从各自对应高度出发，不出现"底部最后才到/一列展开"）
    const clearDur = (anim && anim.phase === 'clear') ? anim.durClear : 1;
    const v = CONFIG.FALL_SPEED * cell; // 固定下落速度（格/秒 × cell），与 _stepDur 匹配：到位即结束
    // 预算：每列消除格数 colDrop、每列消除行 colClearedRows
    const colDrop = new Array(boardCols).fill(0);
    const colClearedRows = new Array(boardCols).fill(0).map(() => []);
    if (anim && anim.phase === 'clear' && anim.cleared) {
      for (const key of anim.cleared) {
        const [cr, cc] = key.split(',').map(Number);
        if (cc >= 0 && cc < boardCols && cr >= 0 && cr < boardRows) {
          colDrop[cc]++; colClearedRows[cc].push(cr);
        }
      }
    }
    const dropCellsOf = (srcRow, c) => {
      if (srcRow === -1) return colDrop[c]; // 新补方块：随整列下移 colDrop 格
      return colClearedRows[c].filter((cr) => cr > srcRow).length; // 未消除格：其下方消除格数
    };
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        const color = g1[r][c]; // 本级下落后棋盘
        if (!color) continue;
        let y = boardY + r * cell + 2;
        if (anim && anim.phase === 'clear' && anim.progress < 1) {
          const elapsed = anim.progress * anim.durClear; // 已流逝时间（秒）
          const srcRow = this._sourceRow(anim, g1, r, c);
          const dist = dropCellsOf(srcRow, c) * cell; // 同列内所有移动格距离一致
          const dy = Math.min(dist, v * elapsed);
          y = y - dist + dy; // 从来源位置（上移 dist）匀速下滑至目标位置
        }
        this.drawCell(ctx, boardX + c * cell + 2, y, cell, color, r, c, selected);
      }
    }
  }

  /** 单格绘制（方块图片优先，回退色块+底部暗条；含选中框） */
  drawCell(ctx, x, y, cell, color, r, c, selected) {
    const size = cell - 4;
    if (!drawImg(ctx, BOARD_IMG[color], x, y, size, size)) {
      fillRoundRect(ctx, x, y, size, size, 8, COLOR_FILL[color] || '#333');
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, y + size - 6, size, 6);
    }
    if (selected && selected[0] === r && selected[1] === c) {
      strokeRoundRect(ctx, x - 2, y - 2, size + 4, size + 4, 10, '#ffffff', 4);
    }
  }

  /** 计算最终格子 (r,c) 在下落动画中的来源行：继承格返回旧行，新落格返回 -1 */
  _sourceRow(anim, grid, r, c) {
    const rows = grid.length;
    const base = anim.base || anim.swapGrid || anim.oldGrid || grid; // 本级连锁下落前的棋盘
    const oldCol = [];
    for (let row = rows - 1; row >= 0; row--) {
      if (base[row][c] && !anim.cleared.has(row + ',' + c)) oldCol.push(row);
    }
    const i = rows - 1 - r; // 最终列从底到顶编号
    if (i < oldCol.length) {
      const srcRow = oldCol[i];
      if (base[srcRow][c] === grid[r][c]) return srcRow;
    }
    return -1;
  }

  enemies(ctx, enemies) {
    enemies.forEach((e) => {
      const size = e.isBoss ? L.enemy.boss : (L.enemy[e.type] || L.enemy.normal);
      const x = e.x - size / 2, y = e.y - size / 2;
      const src = e.isBoss ? IMG_SRC.boss
        : (e.type === 'runner' ? IMG_SRC.runner : (e.type === 'tank' ? IMG_SRC.tank : IMG_SRC.enemy));
      const fallbackColor = e.isBoss ? '#c0392b' : (e.type === 'runner' ? '#2e86c1' : (e.type === 'tank' ? '#8e6b3a' : '#7f8c8d'));
      const fallbackText = e.isBoss ? 'BOSS' : (e.type === 'runner' ? '快' : (e.type === 'tank' ? '盾' : '👾'));
      if (!drawImg(ctx, src, x, y, size, size)) {
        fillRoundRect(ctx, x, y, size, size, e.isBoss ? 10 : 6, fallbackColor);
        text(ctx, fallbackText, x + size / 2, y + size / 2, e.isBoss ? 16 : 14, '#fff', 'center');
      }
      // A1 状态可视化：冰冻/麻痹/减速描边 + DoT 光点
      const stCol = e.frozen > 0 ? '#7fd4ff' : (e.paralyzed > 0 ? '#ffd24a' : (e.slow && e.slow.ttl > 0 ? '#5dade2' : null));
      if (stCol) {
        ctx.strokeStyle = stCol; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9;
        ctx.strokeRect(x - 3, y - 3, size + 6, size + 6);
        ctx.globalAlpha = 1;
      }
      if (e.dots && e.dots.length) {
        e.dots.forEach((d) => {
          ctx.fillStyle = d.type === 'burn' ? '#ff9f43' : '#52be80';
          ctx.globalAlpha = 0.65;
          ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size * 0.28, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        });
      }
      // 个体血条：实色当前血量 + 浅色延迟尾条（直接伤害后尾条缓慢收缩，一眼区分
      // 「直接伤一跳」（hp 瞬掉 + 尾条明显）与「持续伤平滑掉」（尾条几乎贴合））
      const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
      const tail = e.delayHp === undefined ? ratio : Math.max(ratio, Math.min(1, e.delayHp / e.maxHp));
      const bw = size, bh = 4, bx = x, by = y - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
      if (tail > ratio + 0.01) {
        // 尾条：浅红（= 刚受的直接伤害，正在缓慢消退）
        ctx.fillStyle = 'rgba(255,150,150,0.75)';
        ctx.fillRect(bx + bw * ratio, by, bw * (tail - ratio), bh);
      }
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(bx, by, bw * ratio, bh);
    });
  }

  /** 打击特效：子弹 / 爆炸帧动画 / 命中闪光（无图回退几何形状） */
  fx(ctx, fxList) {
    fxList.forEach((f) => {
      if (f.type === 'shot') {
        // 塔攻击弹道：line=直线弹（火球/冰锥/毒液，按塔 key 区分形状）、bolt=闪电折线（电）、
        // arc=往返弧线回旋镖（回旋镖）、mortar=抛物线炮弹+落地爆炸（炮塔）；dur 控制弹速（越大越慢）
        // v1.5：直线/闪电弹道末端实时跟随目标移动（目标存活时），不再停留在创建时位置
        let endX = f.tx, endY = f.ty;
        if ((f.kind === 'line' || f.kind === 'bolt') && f.target && f.target.hp > 0) {
          endX = f.target.x; endY = f.target.y;
        }
        const p = Math.min(1, f.t / f.dur);
        const x = f.x + (endX - f.x) * p;
        const y = f.y + (endY - f.y) * p;
        if (f.kind === 'bolt') {
          // 闪电折线（每帧抖动形成闪烁）+ 双层描边（白内亮 + 彩外辉）+ 命中电花（末端随目标）
          ctx.lineWidth = 10.1; ctx.globalAlpha = 0.22;
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(f.x, f.y);
          const seg = 6;
          for (let i = 1; i < seg; i++) {
            ctx.lineTo(f.x + (endX - f.x) * (i / seg) + (Math.random() * 36 - 18), f.y + (endY - f.y) * (i / seg) + (Math.random() * 36 - 18));
          }
          ctx.lineTo(endX, endY); ctx.stroke();
          ctx.strokeStyle = f.color; ctx.lineWidth = 6.75; ctx.globalAlpha = 0.95;
          ctx.beginPath(); ctx.moveTo(f.x, f.y);
          for (let i = 1; i < seg; i++) {
            ctx.lineTo(f.x + (endX - f.x) * (i / seg) + (Math.random() * 36 - 18), f.y + (endY - f.y) * (i / seg) + (Math.random() * 36 - 18));
          }
          ctx.lineTo(endX, endY); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.25; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(f.x, f.y);
          for (let i = 1; i < seg; i++) {
            ctx.lineTo(f.x + (endX - f.x) * (i / seg) + (Math.random() * 36 - 18), f.y + (endY - f.y) * (i / seg) + (Math.random() * 36 - 18));
          }
          ctx.lineTo(endX, endY); ctx.stroke();
          ctx.globalAlpha = (1 - p) * 0.9;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(endX, endY, 9 + p * 15.75, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
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
          const pos = arcPos(f, p);
          const bx = pos.x, by = pos.y;
          // 完整轨迹（淡辉底）
          ctx.strokeStyle = f.color; ctx.lineWidth = 7.5; ctx.globalAlpha = 0.16;
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const tp = arcPos(f, i / 20);
            ctx.lineTo(tp.x, tp.y);
          }
          ctx.stroke();
          // 已飞过轨迹（亮段：从起点画到当前镖头）
          ctx.strokeStyle = f.color; ctx.lineWidth = 4.5; ctx.globalAlpha = 0.6;
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const tp = arcPos(f, (p * i) / 12);
            ctx.lineTo(tp.x, tp.y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          // 镖头朝向：瞬时速度方向（数值差分）
          const step = 0.015;
          const pa = arcPos(f, Math.min(1, p + step));
          const pb = arcPos(f, Math.max(0, p - step));
          const ang = Math.atan2(pa.y - pb.y, pa.x - pb.x);
          // 镖体自旋（v1.9：高速旋转，全程转 4 圈）
          const spin = p * Math.PI * 8;
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
        } else if (f.kind === 'mortar') {
          // 抛物线炮弹（炮塔）：高弧下坠 + 黑壳弹体（放大 1.5）+ 橙色辉光 + 落地爆炸双层圈
          const arcH = 46;
          const mx = f.x + (f.tx - f.x) * p;
          const my = f.y + (f.ty - f.y) * p - arcH * Math.sin(Math.PI * p);
          // 拖尾（渐变段）
          ctx.strokeStyle = f.color; ctx.lineWidth = 6.75; ctx.globalAlpha = (1 - p) * 0.5;
          ctx.beginPath();
          for (let i = 0; i <= 6; i++) {
            const q = Math.max(0, p - i * 0.04);
            ctx.lineTo(f.x + (f.tx - f.x) * q, f.y + (f.ty - f.y) * q - arcH * Math.sin(Math.PI * q));
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          // 弹体辉光（外圈低透明度）
          ctx.fillStyle = f.color; ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.arc(mx, my, 22.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          // 弹体（黑壳 + 橙色亮点）
          ctx.fillStyle = '#2b2118';
          ctx.beginPath(); ctx.arc(mx, my, 15.75, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(mx, my, 10.1, 0, Math.PI * 2); ctx.fill();
          // 落地爆炸（双层：大辉光 + 亮心）
          if (p >= 0.88) {
            ctx.globalAlpha = Math.max(0, (1 - p) * 6);
            ctx.fillStyle = f.color;
            ctx.beginPath(); ctx.arc(f.tx, f.ty, 13.5 + (1 - p) * 49.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = Math.max(0, (1 - p) * 10);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(f.tx, f.ty, 9 + (1 - p) * 27, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
          }
        } else {
          // 直线弹（火球/冰锥/毒液）：弹体形状按塔 key 区分（放大 1.5）+ 辉光 + 渐变拖尾 + 命中火花
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.atan2(endY - f.y, endX - f.x));
          // 弹体辉光
          ctx.fillStyle = f.color; ctx.globalAlpha = 0.35;
          ctx.beginPath(); ctx.arc(0, 0, 20.25, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          if (f.key === 'ice') {
            // 冰锥：菱形弹体
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.moveTo(20.25, 0); ctx.lineTo(0, -10.1); ctx.lineTo(-15.75, 0); ctx.lineTo(0, 10.1);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(2.25, 0, 5.6, 0, Math.PI * 2); ctx.fill();
          } else {
            // 火球/毒液：圆形弹体（火=橙红焰心，毒=绿球）
            ctx.fillStyle = f.color;
            ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, Math.PI * 2); ctx.fill();
            if (f.key === 'fire') {
              ctx.fillStyle = '#ffe08a';
              ctx.beginPath(); ctx.arc(4.5, 0, 6.75, 0, Math.PI * 2); ctx.fill();
            } else {
              ctx.fillStyle = 'rgba(255,255,255,0.5)';
              ctx.beginPath(); ctx.arc(-3.4, -3.4, 4.05, 0, Math.PI * 2); ctx.fill();
            }
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
      } else if (f.type === 'hitwall') {
        // 城墙受击闪光（怪物攻城命中）
        const p = Math.min(1, f.t / f.dur);
        ctx.globalAlpha = (1 - p) * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(f.x - 160, f.y - 2, 320, 4);
        ctx.globalAlpha = 1;
      } else if (f.type === 'bullet') {
        const p = Math.min(1, f.t / f.dur);
        const x = f.x + (f.tx - f.x) * p;
        const y = f.y + (f.ty - f.y) * p;
        if (!drawImg(ctx, IMG_SRC.bullet, x - 8, y - 8, 16, 16)) {
          ctx.fillStyle = f.color || '#ffd24a';
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        }
      } else if (f.type === 'boom') {
        const p = Math.min(1, f.t / f.dur);
        const n = 1 + Math.floor(p * 18); // explosion1..19
        const r = 14 + p * 26;
        if (!drawImg(ctx, `images/explosion${n}.png`, f.x - r, f.y - r, r * 2, r * 2)) {
          ctx.globalAlpha = (1 - p) * 0.8;
          ctx.fillStyle = f.color || '#ff9f43';
          ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (f.type === 'flash') {
        const p = Math.min(1, f.t / f.dur);
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.fillStyle = f.color || '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, 6 + p * 8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.type === 'particle') {
        // 技能特效粒子：随机方向小圆点 + 速度衰减 + 淡出（灼烧/毒泡/冰晶/电花/爆炸碎片）
        const p = Math.min(1, f.t / f.dur);
        const col = f.color || '#ffffff';
        const n = f.n || 6, spread = f.spread || 40, speed = f.speed || 120, size = f.size || 5;
        ctx.globalAlpha = (1 - p) * 0.9;
        for (let i = 0; i < n; i++) {
          const seed = ((i * 9301 + f.x * 7 + f.y * 13) % 97) / 97; // 稳定伪随机方向
          const ang = seed * Math.PI * 2;
          const dist = p * (speed * (0.4 + 0.6 * ((i * 5171) % 100) / 100) * 0.16 + speed * p * 0.05);
          const px = f.x + Math.cos(ang) * dist;
          const py = f.y + Math.sin(ang) * dist - p * p * 14; // 轻微上浮
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(px, py, size * (1 - p * 0.5), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'ring') {
        // 技能特效扩散环：描边圆随进度扩散淡出（冰冻/爆炸冲击/寒潮/毒雾）
        const p = Math.min(1, f.t / f.dur);
        ctx.globalAlpha = (1 - p) * 0.85;
        ctx.strokeStyle = f.color || '#ffffff';
        ctx.lineWidth = f.width || 4;
        ctx.beginPath(); ctx.arc(f.x, f.y, (f.rMax || 60) * (0.25 + 0.75 * p), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'beam') {
        // 技能特效连线：两点间亮线淡出（电连锁/电弧/雷暴/毒扩散）
        const p = Math.min(1, f.t / f.dur);
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.strokeStyle = f.color || '#f4d03f';
        ctx.lineWidth = f.width || 3.5;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'match') {
        // 三消消除反馈：彩色星芒迸发（十字线 + 中心白点，随进度扩散淡出）
        const p = Math.min(1, f.t / f.dur);
        const r = 6 + p * 16;
        const col = (f.color && COLOR_FILL[f.color]) ? COLOR_FILL[f.color] : '#ffffff';
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(f.x - r, f.y); ctx.lineTo(f.x + r, f.y);
        ctx.moveTo(f.x, f.y - r); ctx.lineTo(f.x, f.y + r);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, 3 + (1 - p) * 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  /** 三选一弹层（波末/升级强化）v3：横向三卡；卡框=所属塔色；上 1/3 图标 / 中介绍 / 下详细描述 */
  pickLayer(ctx, group, pending, onPick) {
    const w = L.pickLayer.w, h = L.pickLayer.h;
    const x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    // 中央面板
    fillRoundRect(ctx, x, y, w, h, 20, '#1d242e');
    strokeRoundRect(ctx, x, y, w, h, 20, '#3d4553', 2);
    // group.tower 可能是 key 字符串（settlePending 传入），统一解析为 {key, name}
    const tk = typeof group.tower === 'string' ? group.tower : group.tower.key;
    const tName = typeof group.tower === 'string'
      ? (CONFIG.COLORS[CONFIG.TOWERS[tk] && CONFIG.TOWERS[tk].color] || {}).name || tk
      : group.tower.name;
    const tint = TOWER_TINT[tk] || '#3a6ea5';
    const pool = CONFIG.EFFECT_POOLS[tk] || [];
    // 跨塔候选（升级三选一）：按候选 fromTower 查其来源塔的技能池（icon 兜底）
    const defOf = (name, fromTower) => {
      const p = CONFIG.EFFECT_POOLS[fromTower || tk] || [];
      return p.find((q) => q.name === name) || {};
    };
    // v1.11：候选自带两级描述（技能卡=基础 desc；分支卡=分支 a/b/c 文案）
    const descOf = (ef) => ef.desc || defOf(ef.name, ef.fromTower).desc || '';
    // 顶部：仅保留待选胶囊居中（v1.9：去掉"塔升级"标题，升级候选为跨塔随机）
    const gt = group.target; // settlePending 提供标志特效名；升级三选一（buildUpgradeQueue）为 null
    const capW = 148, capH = 46;
    const capX = x + (w - capW) / 2, capY = y + 34;
    fillRoundRect(ctx, capX, capY, capW, capH, capH / 2, 'rgba(247,201,72,0.15)');
    strokeRoundRect(ctx, capX, capY, capW, capH, capH / 2, '#f7c948', 1.5);
    text(ctx, `待选 ×${pending}`, capX + capW / 2, capY + capH / 2, 24, '#f7c948', 'center');
    // 分隔线
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 28, y + 96, w - 56, 2);
    // 候选卡片：横向三卡并排；卡框/顶部条/按钮/图标底色 = 所属塔色（v1.7 用户要求）
    const gap = 16;
    const cardW = (w - 56 - gap * 2) / 3;     // (640-56-32)/3 = 184
    const cardH = h - 118 - 70;               // 660-188 = 472
    const topY = y + 118;
    // 中文按字数换行（技能描述，卡内居中）
    const wrapLines = (s, max) => {
      const arr = [];
      for (let i = 0; i < s.length; i += max) arr.push(s.slice(i, i + max));
      return arr.length ? arr : [''];
    };
    group.candidates.forEach((ef, i) => {
      // v1.11 两级候选：技能卡（未激活，选中=激活）与分支卡（已激活技能分支，选中=分支 Lv+1）
      const isBranch = ef.type === 'branch';
      const isTarget = i === 0 && !isBranch && ef.name === group.target;
      const upgrading = isBranch;
      const targetLv = isBranch ? (ef.branchLv + 1) : 1;   // 选择后达到的等级
      const cx = x + 28 + i * (cardW + gap);
      // 来源塔（升级三选一候选可能来自不同塔）：每张卡按各自来源塔独立取色（v1.10.2）
      const fromKey = ef.fromTower || tk;
      const fromName = ef.fromTower
        ? (CONFIG.COLORS[CONFIG.TOWERS[fromKey] && CONFIG.TOWERS[fromKey].color] || {}).name || fromKey
        : tName;
      const fromTint = TOWER_TINT[fromKey] || tint;
      // 卡片框：描边 = 该卡来源塔色（波末强化三卡同塔；升级三选一各自独立）
      fillRoundRect(ctx, cx, topY, cardW, cardH, 16, '#232c38');
      strokeRoundRect(ctx, cx, topY, cardW, cardH, 16, fromTint, 2.5);
      // 顶部状态细条：升级=金 / 目标=绿 / 普通=来源塔色
      fillRoundRect(ctx, cx + 4, topY + 4, cardW - 8, 6, 3, upgrading ? '#f7c948' : (isTarget ? '#27ae60' : fromTint));
      if (isTarget && !upgrading) {
        fillRoundRect(ctx, cx + cardW - 64, topY + 10, 52, 24, 12, 'rgba(39,174,96,0.92)');
        text(ctx, '目标', cx + cardW - 38, topY + 23, 16, '#ffffff', 'center');
      }
      // v1.9 框顶部标识来源塔：塔色圆点 + 塔名条
      fillRoundRect(ctx, cx + 4, topY + 14, cardW - 8, 28, 6, 'rgba(255,255,255,0.07)');
      ctx.beginPath(); ctx.arc(cx + cardW / 2 - 34, topY + 28, 6, 0, Math.PI * 2);
      ctx.fillStyle = fromTint; ctx.fill();
      text(ctx, fromName, cx + cardW / 2 + 2, topY + 33, 20, '#dbe4ee', 'center');
      // 上 1/3：技能图标（大圆底 = 来源塔色渐变 + 光晕 + 等级角标）
      const iconCx = cx + cardW / 2, iconCy = topY + 118, ir = 52;
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(iconCx, iconCy, ir + 13, 0, Math.PI * 2);
      ctx.fillStyle = fromTint; ctx.fill();
      ctx.globalAlpha = 1;
      const grad = ctx.createLinearGradient(iconCx - ir, iconCy - ir, iconCx + ir, iconCy + ir);
      grad.addColorStop(0, lighten(fromTint, 1.35)); grad.addColorStop(1, fromTint);
      ctx.beginPath(); ctx.arc(iconCx, iconCy, ir, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(iconCx, iconCy, ir, 0, Math.PI * 2); ctx.stroke();
      text(ctx, defOf(ef.name, ef.fromTower).icon || (ef.name[0] || '?'), iconCx, iconCy + 8, 56, '#ffffff', 'center');
      // 等级角标（选择后达到的等级）
      fillRoundRect(ctx, iconCx + ir - 18, iconCy - ir + 2, 38, 38, 19, upgrading ? '#f7c948' : '#2c3542');
      strokeRoundRect(ctx, iconCx + ir - 18, iconCy - ir + 2, 38, 38, 19, 'rgba(255,255,255,0.6)', 1.5);
      text(ctx, `Lv${targetLv}`, iconCx + ir + 1, iconCy - ir + 22, 18, upgrading ? '#1a1a1a' : '#ffffff', 'center');
      // 中间：技能介绍（技能名 = 金色 40px 大字，v1.10 用户规范）
      const nameY = topY + 224;
      if (upgrading) {
        text(ctx, `分支${ef.branch} · Lv${ef.branchLv} → ${ef.branchLv + 1}`, cx + cardW / 2, nameY - 32, 18, '#f7c948', 'center');
      } else {
        text(ctx, '新技能', cx + cardW / 2, nameY - 32, 18, '#8ea3b8', 'center');
      }
      text(ctx, ef.name, cx + cardW / 2, nameY, 40, '#f7c948', 'center');
      // 下方：更详细的技能描述（换行居中）
      const desc = descOf(ef);
      const lines = wrapLines(desc, 8);
      lines.forEach((ln, li) => {
        text(ctx, ln, cx + cardW / 2, topY + 268 + li * 26, 19, '#c7d1dc', 'center');
      });
      // 跨塔候选来源
      if (ef.fromTower && ef.fromTower !== tk) {
        const fn = (CONFIG.COLORS[CONFIG.TOWERS[ef.fromTower] && CONFIG.TOWERS[ef.fromTower].color] || {}).name || ef.fromTower;
        text(ctx, `来自${fn}`, cx + cardW / 2, topY + 268 + lines.length * 26 + 24, 17, '#8ea3b8', 'center');
      }
      // 选择按钮（卡底部；v1.9 统一蓝色，不随塔色变化）
      const btnW = cardW - 28, btnH = 56, btnX = cx + 14, btnY = topY + cardH - btnH - 16;
      ctx.fillStyle = '#3a6ea5';
      roundRect(ctx, btnX, btnY, btnW, btnH, 14); ctx.fill();
      strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 14, 'rgba(255,255,255,0.35)', 1.5);
      text(ctx, '选择', btnX + btnW / 2, btnY + btnH / 2, 28, '#ffffff', 'center');
      onPick[i] = { hit: (px, py) => px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH };
    });
  }

  /** 波次结束弹窗：展示奖励，点击「继续」进入三选一或下一波；返回按钮命中检测 */
  waveClearLayer(ctx, s, prevBtn) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    const w = 520, h = 360, x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    fillRoundRect(ctx, x, y, w, h, 16, '#232a34');
    strokeRoundRect(ctx, x, y, w, h, 16, '#4cd964', 2);
    text(ctx, '波次完成', x + w / 2, y + 64, 40, '#7ef0a3', 'center');
    text(ctx, `第 ${s.waveClear.wave} 波 · 防守成功`, x + w / 2, y + 130, 26, '#ffffff', 'center');
    text(ctx, `金币 +${fmtNum(s.waveClear.waveGold)}`, x + w / 2, y + 188, 24, '#f7c948', 'center');
    if (s.waveClear.pending > 0) {
      text(ctx, `特效强化待选 ${s.waveClear.pending} 次`, x + w / 2, y + 232, 20, '#9fb2c3', 'center');
    } else {
      text(ctx, '防线稳固，继续守卫', x + w / 2, y + 232, 20, '#9fb2c3', 'center');
    }
    return button(ctx, x + 90, y + h - 86, w - 180, 56,
      s.waveClear.pending > 0 ? '开始强化 →' : '下一波 →', { bg: '#27ae60', fontSize: 26 });
  }

  /** 结算面板（破防） */
  gameOver(ctx, s, restart) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    const w = 560, h = 500, x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    fillRoundRect(ctx, x, y, w, h, 16, '#232a34');
    strokeRoundRect(ctx, x, y, w, h, 16, '#e74c3c', 3);
    text(ctx, '防线失守', x + w / 2, y + 70, 44, '#ff6b6b', 'center');
    text(ctx, `坚守到第 ${s.wave} 波`, x + w / 2, y + 140, 26, '#dfe6ee', 'center');
    text(ctx, `金币 ${fmtNum(s.gold)} · 协同 ${s.synDoneCount}/2`, x + w / 2, y + 190, 22, '#9fb2c3', 'center');
    restart.hit = button(ctx, x + 120, y + 240, 320, 80, '重新开局', { bg: '#3a6ea5', fontSize: 32 });
    restart.toMenu = button(ctx, x + 120, y + 350, 320, 72, '返回主界面', { bg: '#45505f', fontSize: 28 });
  }

  toast(ctx, list) {
    list.forEach((t, i) => {
      const y = STATUS_H + 66 + i * 40;
      text(ctx, t.text, 375, y, 24, t.color || '#ffffff', 'center');
    });
  }

  /** 底部功能弹层：商店 / 设置 / 塔图鉴 / 帮助（共用遮罩+面板+关闭；点遮罩/关闭退出） */
  funcLayer(ctx, layer, s, hits) {
    const w = 640, x = (750 - w) / 2;
    const heights = { shop: 560, setting: 430, tome: 1000, help: 640 };
    const hgt = heights[layer.type] || 560;
    const y = (LOGIC_H - hgt) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    fillRoundRect(ctx, x, y, w, hgt, 18, '#232a34');
    strokeRoundRect(ctx, x, y, w, hgt, 18, '#3a6ea5', 3);
    const title = { shop: '商店', setting: '设置', tome: '塔图鉴', help: '帮助' }[layer.type] || '';
    text(ctx, title, 375, y + 52, 36, '#ffffff', 'center');
    if (layer.type === 'shop') {
      text(ctx, `💰 金币 ${fmtNum(s.gold)}`, 375, y + 108, 24, '#f7c948', 'center');
      const gw = 260, gh = 130, gx0 = x + 40, gy0 = y + 150, gGap = 40;
      for (let i = 0; i < 4; i++) {
        const cx2 = gx0 + (i % 2) * (gw + gGap);
        const cy2 = gy0 + Math.floor(i / 2) * (gh + 40);
        fillRoundRect(ctx, cx2, cy2, gw, gh, 12, '#1d242e');
        strokeRoundRect(ctx, cx2, cy2, gw, gh, 12, 'rgba(255,255,255,0.1)', 1);
        text(ctx, '商品筹备中', cx2 + gw / 2, cy2 + gh / 2, 22, 'rgba(255,255,255,0.35)', 'center');
      }
      text(ctx, '具体商品后续版本开放', 375, y + hgt - 92, 18, 'rgba(255,255,255,0.4)', 'center');
    } else if (layer.type === 'setting') {
      text(ctx, `版本 ${layer.version || 'v1.0.0'}`, 375, y + 118, 22, '#9fb2c3', 'center');
      text(ctx, '清档后将重新开始：', 375, y + 168, 20, 'rgba(255,255,255,0.7)', 'center');
      text(ctx, '塔等级 · 金币 · 解锁进度全部清零', 375, y + 200, 20, 'rgba(255,255,255,0.55)', 'center');
      const label = layer.confirming ? '确认清档？再点一次执行' : '清档重开';
      hits.confirm = button(ctx, x + 120, y + 246, 400, 70, label, { bg: layer.confirming ? '#c0392b' : '#7a3b3b', fontSize: 26 });
    } else if (layer.type === 'tome') {
      let ry = y + 96;
      TOME_ROWS.forEach((r) => {
        fillRoundRect(ctx, x + 30, ry, w - 60, 128, 12, '#1d242e');
        ctx.fillStyle = r.tint;
        ctx.beginPath(); ctx.arc(x + 64, ry + 34, 12, 0, Math.PI * 2); ctx.fill();
        text(ctx, r.name, x + 88, ry + 42, 28, '#ffffff');
        text(ctx, r.desc, x + 88, ry + 76, 19, '#9fb2c3');
        text(ctx, r.skills, x + 88, ry + 106, 18, '#7ea8d8');
        ry += 148;
      });
    } else if (layer.type === 'help') {
      const lines = [
        '1. 滑动相邻方块消除 3 连，获得对应颜色的塔',
        '2. 消除方块为塔升级，消除越多升级越快',
        '3. 塔自动攻击敌人，弹道随塔类型不同',
        '4. 怪物到达城墙后开始攻城，城墙持续掉血',
        '5. 消灭一波全部怪物才算过关，三选一强化',
        '6. 城墙血量归零即失败，注意防守',
      ];
      let hy = y + 110;
      lines.forEach((ln) => {
        fillRoundRect(ctx, x + 36, hy - 30, w - 72, 66, 10, '#1d242e');
        text(ctx, ln, x + 56, hy, 22, '#d7dee6', 'left');
        hy += 84;
      });
    }
    hits.close = button(ctx, x + 150, y + hgt - 84, w - 300, 56, layer.type === 'setting' ? '返回主菜单' : '关闭', { bg: '#3a6ea5', fontSize: 26 });
  }

  /* ================= 主界面：三页签（战斗主页 / 商店 / 圣物）+ 子面板（v1.4：无配置页） ================= */
  menuLayer(ctx, s, hits) {
    const items = [];
    const push = (key, data, x, y, w, h) => items.push({ key, data, rect: { x, y, w, h }, hit: (px, py) => px >= x - 0.5 && px <= x + w + 0.5 && py >= y - 0.5 && py <= y + h + 0.5 });
    // 背景 + 顶部渐变
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    const grad = ctx.createLinearGradient(0, 0, 0, 170);
    grad.addColorStop(0, '#16233a'); grad.addColorStop(1, '#0d1117');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 750, 170);
    text(ctx, '消消防线', 40, 92, 52, '#ffffff', 'left');
    // 金币
    fillRoundRect(ctx, 320, 56, 180, 58, 29, 'rgba(247,201,72,0.12)');
    strokeRoundRect(ctx, 320, 56, 180, 58, 29, '#f7c948', 1.5);
    text(ctx, `💰 ${fmtNum(s.gold)}`, 410, 94, 30, '#f7c948', 'center');
    // 钻石（充值货币，占位）
    fillRoundRect(ctx, 520, 56, 150, 58, 29, 'rgba(124,168,255,0.12)');
    strokeRoundRect(ctx, 520, 56, 150, 58, 29, '#7ca8ff', 1.5);
    text(ctx, `💎 ${s.diamond}`, 595, 94, 30, '#7ca8ff', 'center');
    // 内容区（battle / shop / relic）
    if (s.tab === 'battle') this.menuBattle(ctx, s, push);
    else if (s.tab === 'shop') this.menuShop(ctx, s, push);
    else this.menuRelic(ctx, s, push);
    // 底部大分页标签（屏幕最下方，3 个）
    const tabY = 1504, tabH = 100, tabW = 216, tabGap = 14;
    const tabs = [['battle', '⚔ 战斗'], ['shop', '🏪 商店'], ['relic', '💎 圣物']];
    tabs.forEach(([key, label], i) => {
      const tx = 40 + i * (tabW + tabGap);
      push('tab', key, tx, tabY, tabW, tabH);
      const active = s.tab === key;
      fillRoundRect(ctx, tx, tabY, tabW, tabH, 16, active ? '#1f8c5f' : '#1b2230');
      strokeRoundRect(ctx, tx, tabY, tabW, tabH, 16, active ? '#2ecc71' : '#2b3648', active ? 2 : 1);
      text(ctx, label, tx + tabW / 2, tabY + tabH / 2, 30, active ? '#ffffff' : '#8ea3b8', 'center');
    });
    // 子面板
    if (s.panel) {
      if (s.panel.type === 'relicDex') this.menuRelicDex(ctx, s, push);
    }
    hits = items;
    return hits;
  }

  /** 战斗主页：战场卡（约 1/4 屏高）+ 进入战斗（2/3 屏处）+ 4 个宝箱槽 */
  menuBattle(ctx, s, push) {
    // 战场卡：占屏幕约 1/4 高度（1626/4 ≈ 406）
    const sx = 55, sy = 268, sw = 640, sh = 392;
    push('stage', { id: 'ruins' }, sx, sy, sw, sh);
    const sgrad = ctx.createLinearGradient(0, sy, 0, sy + sh);
    sgrad.addColorStop(0, '#1c3a2e'); sgrad.addColorStop(1, '#0e2018');
    ctx.fillStyle = sgrad; roundRect(ctx, sx, sy, sw, sh, 22); ctx.fill();
    strokeRoundRect(ctx, sx, sy, sw, sh, 22, '#2ecc71', 2.5);
    // 战场标题
    text(ctx, '🏰 远古战场', 375, sy + 92, 46, '#ffffff', 'center');
    text(ctx, '城墙防守 · 怪物攻城 · 消消防线', 375, sy + 146, 24, '#8ea3b8', 'center');
    // 奖励说明
    fillRoundRect(ctx, sx + 40, sy + 180, sw - 80, 130, 14, 'rgba(46,204,113,0.10)');
    strokeRoundRect(ctx, sx + 40, sy + 180, sw - 80, 130, 14, 'rgba(46,204,113,0.35)', 1);
    const rewards = [
      ['💛 金币', '波次结算 + 击杀掉落'],
      ['📦 宝箱', '每 5 波 Boss 掉落'],
      ['💎 圣物', '每波精英怪概率掉落'],
    ];
    rewards.forEach((r, i) => {
      text(ctx, r[0], sx + 70 + i * 200, sy + 226, 24, '#f7c948', 'left');
      text(ctx, r[1], sx + 70 + i * 200, sy + 264, 17, '#8ea3b8', 'left');
    });
    text(ctx, '点击选择战场（目前仅此一种）', 375, sy + sh - 40, 19, '#5a8a72', 'center');
    // 进入战斗：屏幕 2/3 处（1626×2/3 ≈ 1084）
    const ey = 1084, eh = 120;
    push('enter', null, 75, ey, 600, eh);
    const bgrad = ctx.createLinearGradient(0, ey, 0, ey + eh);
    bgrad.addColorStop(0, '#2ecc71'); bgrad.addColorStop(1, '#1f8c5f');
    ctx.fillStyle = bgrad; roundRect(ctx, 75, ey, 600, eh, 22); ctx.fill();
    strokeRoundRect(ctx, 75, ey, 600, eh, 22, 'rgba(255,255,255,0.4)', 2);
    text(ctx, '⚔ 进入战斗', 375, ey + 66, 44, '#ffffff', 'center');
    text(ctx, '每塔默认 3 技能 · 战斗中升级三选一', 375, ey + 104, 18, 'rgba(255,255,255,0.75)', 'center');
    // 4 个宝箱槽
    text(ctx, '宝箱', 55, 1262, 28, '#ffffff', 'left');
    for (let i = 0; i < 4; i++) {
      const bx = 40 + i * 170, by = 1290, bw = 160, bh = 140;
      push('chest', i, bx, by, bw, bh);
      const has = s.chests > i;
      const opening = s.chestOpening && i === 0;
      fillRoundRect(ctx, bx, by, bw, bh, 16, has ? '#3a2b1a' : '#141a22');
      strokeRoundRect(ctx, bx, by, bw, bh, 16, opening ? '#f7c948' : (has ? '#d89e63' : '#232b36'), opening ? 2 : 1.2);
      if (opening) {
        text(ctx, '⏳', bx + bw / 2, by + 52, 40, '#f7c948', 'center');
        text(ctx, `${s.chestRemain}s`, bx + bw / 2, by + 92, 24, '#f7c948', 'center');
        text(ctx, '开启中', bx + bw / 2, by + 122, 18, '#d89e63', 'center');
      } else if (has) {
        text(ctx, '📦', bx + bw / 2, by + 52, 40, '#ffffff', 'center');
        text(ctx, '点击开启', bx + bw / 2, by + 92, 20, '#d89e63', 'center');
        text(ctx, `${s.chestOpenSec}s 后得圣物卡`, bx + bw / 2, by + 122, 16, '#9fb2c3', 'center');
      } else {
        text(ctx, '🔒', bx + bw / 2, by + 52, 36, '#3a4654', 'center');
        text(ctx, '空槽位', bx + bw / 2, by + 92, 20, '#3a4654', 'center');
        text(ctx, 'Boss 掉落 / 钻石兑换', bx + bw / 2, by + 122, 15, '#2c3644', 'center');
      }
    }
  }

  /** 配置页：6 塔页签 → 该塔 3 技能槽（点击配置）+ 技能卡列表（默认灰显 / 卡升级） */
  /** 商店页：每日精选圣物卡（金币购买）+ 广告随机圣物 + 钻石兑换（v1.4 无技能卡） */
  menuShop(ctx, s, push) {
    // 每日精选（圣物卡）
    text(ctx, '每日精选圣物（0 点刷新）', 55, 288, 30, '#ffffff', 'left');
    let ry = 326;
    s.daily.picks.forEach((p) => {
      const def = CONFIG.RELIC.list.find((r) => r.id === p.relic) || {};
      const owned = s.relics.find((r) => r.id === p.relic) || {};
      const lv = owned.level || 0;
      fillRoundRect(ctx, 55, ry, 640, 88, 12, '#161d28');
      strokeRoundRect(ctx, 55, ry, 640, 88, 12, '#7ca8ff', 1);
      ctx.beginPath(); ctx.arc(100, ry + 44, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#7ca8ff'; ctx.fill();
      text(ctx, def.icon || '📿', 100, ry + 45, 24, '#ffffff', 'center');
      text(ctx, `${def.name || p.relic}${lv > 0 ? ` · 已拥有 Lv${lv}` : ' · 新圣物'}`, 140, ry + 44, 22, '#ffffff', 'left');
      text(ctx, (def.desc ? def.desc(lv + 1) : ''), 140, ry + 74, 17, '#8ea3b8', 'left');
      // 金币购买
      push('dailyPick', { relic: p.relic, price: p.price, icon: def.icon, name: def.name }, 420, ry + 16, 110, 56);
      fillRoundRect(ctx, 420, ry + 16, 110, 56, 10, '#2c3542');
      strokeRoundRect(ctx, 420, ry + 16, 110, 56, 10, '#f7c948', 1);
      text(ctx, `${p.price}💰`, 475, ry + 50, 22, '#f7c948', 'center');
      // 广告免费领（同一精选圣物）
      push('dailyAd', { relic: p.relic, price: 0, icon: def.icon, name: def.name }, 545, ry + 16, 140, 56);
      fillRoundRect(ctx, 545, ry + 16, 140, 56, 10, '#2c3542');
      strokeRoundRect(ctx, 545, ry + 16, 140, 56, 10, '#7cd6a6', 1);
      text(ctx, '📺 看广告领', 615, ry + 50, 20, '#7cd6a6', 'center');
      ry += 100;
    });
    // 广告奖励（随机圣物）
    push('adCard', null, 55, ry, 640, 100);
    fillRoundRect(ctx, 55, ry, 640, 100, 14, '#1b2230');
    strokeRoundRect(ctx, 55, ry, 640, 100, 14, '#7cd6a6', 1.5);
    text(ctx, '📺 看广告得随机圣物卡', 105, ry + 48, 28, '#ffffff', 'left');
    text(ctx, '完整观看发奖 · 圣物拥有即生效', 105, ry + 80, 20, '#8ea3b8', 'left');
    text(ctx, '›', 670, ry + 58, 40, '#5a6c80', 'center');
    ry += 130;
    // 钻石区
    text(ctx, `💎 钻石 ×${s.diamond}（充值后续开放）`, 55, ry + 6, 26, '#7ca8ff', 'left');
    ry += 44;
    push('diamondChest', null, 55, ry, 300, 92);
    fillRoundRect(ctx, 55, ry, 300, 92, 12, '#1b2230');
    strokeRoundRect(ctx, 55, ry, 300, 92, 12, '#7ca8ff', 1);
    text(ctx, `1💎 兑换 1 宝箱`, 205, ry + 46, 22, '#7ca8ff', 'center');
    push('diamondGold', null, 395, ry, 300, 92);
    fillRoundRect(ctx, 395, ry, 300, 92, 12, '#1b2230');
    strokeRoundRect(ctx, 395, ry, 300, 92, 12, '#7ca8ff', 1);
    text(ctx, `1💎 兑换 ${CONFIG.DIAMOND.goldPrice}💰`, 545, ry + 46, 22, '#7ca8ff', 'center');
    ry += 110;
    push('recharge', null, 55, ry, 640, 92);
    fillRoundRect(ctx, 55, ry, 640, 92, 12, '#12171f');
    strokeRoundRect(ctx, 55, ry, 640, 92, 12, '#3a4553', 1);
    text(ctx, '🔒 充值（获取钻石）', 375, ry + 46, 24, '#5a6c80', 'center');
  }

  /** 圣物页：宝箱 + 已获取圣物卡片网格（升级）+ 图鉴按钮（v1.4：无装备槽） */
  menuRelic(ctx, s, push) {
    // 宝箱
    push('chest', null, 55, 268, 640, 96);
    fillRoundRect(ctx, 55, 268, 640, 96, 14, '#3a2b1a');
    strokeRoundRect(ctx, 55, 268, 640, 96, 14, '#d89e63', 1.5);
    text(ctx, `📦 宝箱 ×${s.chests}`, 105, 306, 28, '#ffffff', 'left');
    if (s.chestOpening) text(ctx, `开启中 ${s.chestRemain}s（到时自动发圣物卡）`, 330, 306, 20, '#f7c948', 'left');
    else text(ctx, s.chests > 0 ? `点击开启（${s.chestOpenSec}s）` : 'Boss 掉落 / 商店钻石兑换', 330, 306, 20, '#d89e63', 'left');
    // 已获取圣物卡片网格（2 列；未获取的仅在图鉴查看）
    const owned = s.relics.filter((r) => r.owned);
    text(ctx, `已获取圣物 ×${owned.length}（拥有即生效）`, 55, 398, 26, '#ffffff', 'left');
    // 图鉴按钮
    push('relicDex', null, 470, 398, 225, 44);
    fillRoundRect(ctx, 470, 398, 225, 44, 12, '#1b2230');
    strokeRoundRect(ctx, 470, 398, 225, 44, 12, '#7ca8ff', 1);
    text(ctx, '📖 圣物图鉴 ›', 582, 398 + 28, 20, '#7ca8ff', 'center');
    const cw2 = 310, ch2 = 168, gx = 15;
    owned.forEach((r, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const rx = 55 + col * (cw2 + gx), ry2 = 430 + row * (ch2 + 24);
      fillRoundRect(ctx, rx, ry2, cw2, ch2, 14, '#161d28');
      strokeRoundRect(ctx, rx, ry2, cw2, ch2, 14, r.count > 0 ? '#2b6d4f' : '#3a4553', r.count > 0 ? 1.5 : 1);
      text(ctx, `${r.icon} ${r.name}`, rx + 20, ry2 + 34, 24, '#ffffff', 'left');
      text(ctx, `持有 ${r.count} · Lv${r.level}`, rx + 20, ry2 + 64, 18, r.count > 0 ? '#7cd6a6' : '#8ea3b8', 'left');
      text(ctx, r.desc, rx + 20, ry2 + 90, 17, '#9fb2c3', 'left');
      text(ctx, `升级效果：${r.descLv}`, rx + 20, ry2 + 116, 16, '#5a6c80', 'left');
      // 升级按钮
      push('relicUp', r.id, rx + cw2 - 130, ry2 + ch2 - 48, 116, 40);
      fillRoundRect(ctx, rx + cw2 - 130, ry2 + ch2 - 48, 116, 40, 10, '#2c3542');
      strokeRoundRect(ctx, rx + cw2 - 130, ry2 + ch2 - 48, 116, 40, 10, '#f7c948', 1);
      text(ctx, r.count > 0 ? `升级 ${r.cost.gold}💰` : '缺圣物', rx + cw2 - 72, ry2 + ch2 - 26, 16, r.count > 0 ? '#f7c948' : '#5a6c80', 'center');
    });
  }

  /** 圣物图鉴面板：全部圣物图标（未获取锁定，获取后显示性能） */
  menuRelicDex(ctx, s, push) {
    this._menuPanelShell(ctx, s, push, '圣物图鉴', 900);
    text(ctx, '战斗中获得 · 拥有即常驻生效', 375, 268, 22, '#8ea3b8', 'center');
    let ry = 320;
    s.relics.forEach((r) => {
      fillRoundRect(ctx, 70, ry, 610, 76, 12, r.owned ? '#12231c' : '#14181f');
      strokeRoundRect(ctx, 70, ry, 610, 76, 12, r.owned ? '#2b6d4f' : '#232b36', r.owned ? 1.5 : 1);
      ctx.beginPath(); ctx.arc(112, ry + 38, 22, 0, Math.PI * 2);
      ctx.fillStyle = r.owned ? '#2b6d4f' : '#232b36'; ctx.fill();
      text(ctx, r.owned ? r.icon : '🔒', 112, ry + 39, 22, r.owned ? '#ffffff' : '#4a5a6e', 'center');
      text(ctx, r.name, 152, ry + 34, 22, r.owned ? '#ffffff' : '#4a5a6e', 'left');
      if (r.owned) {
        text(ctx, `持有 ${r.count} · Lv${r.level}`, 152, ry + 62, 16, '#7cd6a6', 'left');
        text(ctx, r.desc, 400, ry + 40, 16, '#9fb2c3', 'left');
      } else {
        text(ctx, '未获取（精英圣物宝箱 / 宝箱 / 商店）', 152, ry + 62, 16, '#5a6c80', 'left');
      }
      ry += 88;
    });
  }

  /** 子面板外壳：遮罩 + 面板 + 标题 + 关闭（hgt 可自定义高度） */
  _menuPanelShell(ctx, s, push, title, hgt) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    const w = 700, h = hgt || 640, x = 25, y = 180;
    fillRoundRect(ctx, x, y, w, h, 18, '#232a34');
    strokeRoundRect(ctx, x, y, w, h, 18, '#3a6ea5', 3);
    text(ctx, title, 375, y + 54, 34, '#ffffff', 'center');
    push('panelClose', null, x + w - 76, y + 20, 52, 52);
    ctx.beginPath(); ctx.arc(x + w - 50, y + 46, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#3a4553'; ctx.fill();
    text(ctx, '✕', x + w - 50, y + 54, 26, '#ffffff', 'center');
  }

  /** 战斗内圣物宝箱三选一弹层（精英掉落 · 暂停战斗）：3 个候选卡片，点选获取 */
  relicPickLayer(ctx, pick, onPick) {
    if (!pick || !pick.candidates) return;
    const w = 640, h = 420;
    const x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    fillRoundRect(ctx, x, y, w, h, 20, '#1d242e');
    strokeRoundRect(ctx, x, y, w, h, 20, '#7ca8ff', 2);
    text(ctx, '圣物宝箱 · 三选一', 375, y + 58, 36, '#7ca8ff', 'center');
    text(ctx, '获得圣物即常驻生效（重复获取可升级）', 375, y + 98, 19, '#8ea3b8', 'center');
    // 3 个候选卡片
    const bw = 188, bh = 240, gap = 16;
    const startX = (750 - (bw * 3 + gap * 2)) / 2;
    const cy = y + 132;
    pick.candidates.forEach((c, i) => {
      const cx = startX + i * (bw + gap);
      fillRoundRect(ctx, cx, cy, bw, bh, 16, '#232c38');
      strokeRoundRect(ctx, cx, cy, bw, bh, 16, '#7ca8ff', 1.5);
      // 图标圆底
      ctx.beginPath(); ctx.arc(cx + bw / 2, cy + 62, 40, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(124,168,255,0.18)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx + bw / 2, cy + 62, 40, 0, Math.PI * 2); ctx.stroke();
      text(ctx, c.icon, cx + bw / 2, cy + 64, 44, '#ffffff', 'center');
      text(ctx, c.name, cx + bw / 2, cy + 118, 24, '#ffffff', 'center');
      // 效果描述（两行）
      const descLines = c.desc ? c.desc.split('；') : [''];
      text(ctx, descLines[0] || '', cx + bw / 2, cy + 152, 16, '#9fb2c3', 'center');
      text(ctx, descLines[1] || '', cx + bw / 2, cy + 174, 16, '#9fb2c3', 'center');
      // 选择按钮
      const btnX = cx + 24, btnY = cy + bh - 58, btnW = bw - 48, btnH = 46;
      fillRoundRect(ctx, btnX, btnY, btnW, btnH, 12, '#2c3542');
      strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 12, '#f7c948', 1.5);
      text(ctx, '选择', btnX + btnW / 2, btnY + btnH / 2, 24, '#f7c948', 'center');
      onPick[i] = { hit: (px, py) => px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH };
    });
  }
}

function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'm';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + 'w';
  return String(Math.floor(n));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** 塔图标回退绘制：彩色圆底 + 各塔几何图形（emoji 在部分 canvas 环境不渲染，改用图形保证可见） */
function drawTowerGlyph(ctx, key, x, y, size) {
  const cx = x + size / 2, cy = y + size / 2;
  const tint = TOWER_TINT[key] || '#888';
  const r = size * 0.22;
  ctx.fillStyle = tint;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  if (key === 'fire') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.7, cy + r);
    ctx.lineTo(cx - r * 0.7, cy + r);
    ctx.closePath(); ctx.fill();
  } else if (key === 'ice') {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
  } else if (key === 'poison') {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - r * 0.4, cy - r * 0.4, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  } else if (key === 'electric') {
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.3, cy - r);
    ctx.lineTo(cx - r * 0.35, cy + r * 0.15);
    ctx.lineTo(cx, cy + r * 0.15);
    ctx.lineTo(cx - r * 0.3, cy + r);
    ctx.lineTo(cx + r * 0.35, cy - r * 0.15);
    ctx.lineTo(cx, cy - r * 0.15);
    ctx.closePath(); ctx.fill();
  } else if (key === 'boomerang') {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.9, cy + r * 0.4);
    ctx.lineTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.9, cy + r * 0.4);
    ctx.lineTo(cx + r * 0.4, cy + r * 0.15);
    ctx.lineTo(cx, cy - r * 0.35);
    ctx.lineTo(cx - r * 0.4, cy + r * 0.15);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2); ctx.stroke();
}

module.exports = { COLOR_FILL, TOWER_TINT, IMG_SRC, BOARD_IMG, Renderer, layout, fmtNum };
