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

/* 火焰舌（v1.13.6 火柱/火雨帧动画）：底部宽、顶部带摆动的锥形火焰 */
function drawFlameTongue(ctx, x, y, w, h, sway, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.2, y - h * 0.55, x + sway, y - h);
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.4, x + w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
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
  { tint: '#e74c3c', name: '火塔',     desc: '直线火球 · 灼烧爆破',         skills: '点燃 · 火柱 · 大火球' },
  { tint: '#5dade2', name: '冰塔',     desc: '冰锥减速 · 冻结控场',       skills: '寒霜 · 冰冻 · 冰穿刺' },
  { tint: '#52be80', name: '毒塔',     desc: '毒液持续伤害 · 扩散传染',   skills: '剧毒 · 扩散 · 毒爆' },
  { tint: '#f4d03f', name: '电塔',     desc: '闪电折线 · 活电群伤',       skills: '连锁 · 麻痹 · 过载' },
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

/* v1.16.27 技能图标（美术资源 images/skillicons/<塔>/<文件名>.png，缺失时回退 emoji） */
const SKILL_ICON = {
  fire:      { 点燃: 'ignite', 灼烧: 'burnstack', 火柱: 'pillar', 大火球: 'bigfireball', 爆燃: 'detonate', 多重火球: 'multifireball', 火雨: 'firerain' },
  ice:       { 寒霜: 'frost', 冰冻: 'freeze', 冰穿刺: 'pierce', 多重冰锥: 'multiicicle', 冰花: 'frostflower', 冬珠: 'winterorb', 碎冰: 'shatter', 冰墙: 'icewall' },
  poison:    { 剧毒: 'toxic', 毒爆: 'burst', 毒池: 'pool', 毒棒: 'totem', 毒性强化: 'enhance', 瘟疫: 'plague', 毒藤: 'vine', 瘴气: 'miasma' },
  electric:  { 连锁: 'chain', 麻痹: 'paralysis', 过载: 'overload', 极光电击: 'arc', 雷暴: 'thunderstorm', 活电: 'liveorbs', 充能: 'charge', 电磁场: 'magnetic' },
  boomerang: { 折返增伤: 'returnboost', 放血: 'pierce', 多镖: 'multiboom', 接镖: 'catch', 猎手标记: 'mark', 风暴镖: 'storm', 弹力镖: 'ring', 风痕: 'windtrail' },
  cannon:    { 重炮: 'heavy', 震击: 'shock', 贯穿弹: 'pierce', 双管齐射: 'double', 炮火支援: 'support', 地雷阵: 'minefield', 炮台: 'turret', 军火库: 'arsenal' },
};
function skillIconSrc(towerKey, skillName) {
  const f = (SKILL_ICON[towerKey] || {})[skillName];
  return f ? `images/skillicons/${towerKey}/${f}.png` : null;
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

/* 文本宽度估算：汉字≈1 字宽，其余≈0.55 字宽（不依赖 ctx.measureText，测试 mock 与真实环境通用） */
function txtW(str, size) {
  let w = 0;
  for (let i = 0; i < str.length; i++) w += str.charCodeAt(i) > 255 ? size : size * 0.55;
  return w;
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
    this.towerRow(ctx, s);
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
    // v1.16.13 底部功能栏 5 键：设置/图鉴/商店/帮助/加速（右下角）
    const labels = ['⚙ 设置', '📖 塔图鉴', '💰 商店', 'ℹ 帮助', `⏩×${s.runSpeed || 1}`];
    const keys = ['setting', 'tome', 'shop', 'help', 'speed'];
    const kw = 140, kh = 78;
    const gap = (750 - labels.length * kw) / (labels.length + 1);
    this.funcHits = [];
    for (let i = 0; i < labels.length; i++) {
      const x = gap + i * (kw + gap);
      const y = fy + (h - kh) / 2;
      fillRoundRect(ctx, x, y, kw, kh, 14, '#232a36');
      strokeRoundRect(ctx, x, y, kw, kh, 14, 'rgba(255,255,255,0.14)', 2);
      text(ctx, labels[i], x + kw / 2, y + kh / 2, 25, i === 4 ? '#7cd6a6' : '#d7dee6', 'center');
      this.funcHits.push({ key: keys[i], hit: (px, py) => px >= x && px <= x + kw && py >= y && py <= y + kh });
    }
  }

  /** 分支名称：优先取 config 分支文案「名称：效果」冒号前；无名称（非火塔）取效果短语首词；兜底字母代号（v1.14） */
  branchName(cfg, br) {
    if (!cfg) return br;
    const s = cfg[br.toLowerCase()] || '';
    if (!s) return br;
    let n = s.split(/[：:]/)[0];
    if (n === s) {
      n = s.split(' ')[0] || s;
      if (n === s) n = s.slice(0, 4);
    }
    return n;
  }

  /** 塔详情弹层：点击塔位图标 → 查看攻击 / 攻击间隔 / 技能等级（v1.8；v1.14 技能横向卡片 200×300 + 分支名称徽章 + LvMAX；v1.16.11 美化+卡可点击进二级详情） */
  towerInfoLayer(ctx, info, hits) {
    const w = 688, hgt = 720, x = (750 - w) / 2, y = (LOGIC_H - hgt) / 2;
    // 遮罩（点遮罩关闭）
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    // 面板：深蓝紫渐变底 + 塔色描边 + 顶部塔色光带（v1.16.11 美化）
    const bgGrad = ctx.createLinearGradient(0, y, 0, y + hgt);
    bgGrad.addColorStop(0, '#2b3340'); bgGrad.addColorStop(1, '#171d26');
    fillRoundRect(ctx, x, y, w, hgt, 18, bgGrad);
    strokeRoundRect(ctx, x, y, w, hgt, 18, TOWER_TINT[info.key] || '#3d4553', 3);
    const band = ctx.createLinearGradient(0, y, w, y);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.15, TOWER_TINT[info.key] || '#3a6ea5');
    band.addColorStop(0.5, '#ffffff');
    band.addColorStop(0.85, TOWER_TINT[info.key] || '#3a6ea5');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.globalAlpha = 0.35;
    ctx.fillRect(x + 20, y + 8, w - 40, 3);
    ctx.globalAlpha = 1;
    // 标题：塔名 + 塔自身等级（v1.16.17 塔等级 = 累计选择次数 + 1，不再显示整体总等级）
    text(ctx, `${info.name}塔 · 等级 Lv.${info.level}`, x + w / 2, y + 48, 34, '#ffffff', 'center');
    // 攻击 / 攻击间隔 / DPS（统计条：三项一行并排，背景胶囊）
    const statY = y + 118, statW = 180;
    const stats = [
      { label: '攻击', val: `${info.atk || 0}`, color: '#f7c948' },
      { label: '间隔', val: `${(info.interval || 0).toFixed(1)}s`, color: '#9fb2c3' },
      { label: 'DPS', val: `${Math.round(info.dps)}`, color: '#7ea8d8' },
    ];
    stats.forEach((s, si) => {
      const sx = x + 24 + si * (statW + 14);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      fillRoundRect(ctx, sx, statY - 26, statW, 46, 12, 'rgba(255,255,255,0.06)');
      text(ctx, s.label, sx + 14, statY - 6, 14, 'rgba(255,255,255,0.5)', 'left');
      text(ctx, s.val, sx + statW - 14, statY - 6, 22, s.color, 'right');
    });
    // 分隔线
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 40, y + 192, w - 80, 2);
    // 技能标题 + 提示
    text(ctx, '技能', x + 40, y + 222, 22, '#b8c2cc', 'left');
    text(ctx, '点击技能卡查看详情与升级分支', x + w - 40, y + 222, 14, 'rgba(255,255,255,0.4)', 'right');
    const skills = info.skills || [];
    if (!skills.length) {
      text(ctx, '暂无技能，通过升级三选一获取', x + w / 2, y + 290, 20, 'rgba(255,255,255,0.45)', 'center');
    } else {
      // v1.14：3 张技能卡横向排列（宽 200 × 高 300），卡内：图标 → 技能名+Lv 徽章 → 三分支名称徽章横排
      const cardW = 200, cardH = 300, gap = 20, cardTop = y + 252;
      const pool = CONFIG.EFFECT_POOLS[info.key] || [];
      const maxLv = 1 + ((CONFIG.EFFECT && CONFIG.EFFECT.maxLevel) || 3); // 分支满 3 级 → 技能 Lv4 = LvMAX
      skills.forEach((sk, i) => {
        const cx = x + 24 + i * (cardW + gap), cy = cardTop;
        hits.skill = hits.skill || [];
        hits.skill[i] = { hit: (px, py) => px >= cx && px <= cx + cardW && py >= cy && py <= cy + cardH };
        // v1.16.11 美化：玻璃渐变卡（左上亮右下暗）+ 底部塔色光晕 + 斜向高光条 + 呼吸描边
        const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
        cardGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
        cardGrad.addColorStop(0.5, 'rgba(30,36,46,0.95)');
        cardGrad.addColorStop(1, 'rgba(18,22,29,0.98)');
        fillRoundRect(ctx, cx, cy, cardW, cardH, 14, cardGrad);
        strokeRoundRect(ctx, cx, cy, cardW, cardH, 14, 'rgba(255,255,255,0.18)', 1.5);
        ctx.save();
        ctx.beginPath(); roundRect(ctx, cx, cy, cardW, cardH, 14); ctx.clip();
        // 底部塔色光晕
        const glow = ctx.createRadialGradient(cx + cardW / 2, cy + cardH - 40, 10, cx + cardW / 2, cy + cardH - 40, 130);
        glow.addColorStop(0, TOWER_TINT[info.key] || '#3a6ea5'); glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow; ctx.globalAlpha = 0.28;
        ctx.fillRect(cx, cy, cardW, cardH);
        // 斜向高光条（左上→右下淡白）
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#ffffff';
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.35); ctx.fillRect(-20, -10, cardW * 0.9, 3); ctx.restore();
        ctx.globalAlpha = 1;
        ctx.restore();
        // 呼吸描边高亮
        const brAlpha = 0.14 + 0.08 * Math.sin(Date.now() / 700 + i * 1.3);
        strokeRoundRect(ctx, cx, cy, cardW, cardH, 14, TOWER_TINT[info.key] || '#3a6ea5', brAlpha * 4);
        // 图标（发光圆底 = 塔色渐变 + 白色内圈）
        const skDef = pool.find((q) => q.name === sk.name) || {};
        const icx = cx + cardW / 2, icy = cy + 56, ir = 27;
        const halo = ctx.createRadialGradient(icx, icy, 2, icx, icy, ir * 1.7);
        halo.addColorStop(0, lighten(TOWER_TINT[info.key] || '#3a6ea5', 1.5));
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(icx, icy, ir * 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        const grad = ctx.createLinearGradient(icx - ir, icy - ir, icx + ir, icy + ir);
        grad.addColorStop(0, lighten(TOWER_TINT[info.key] || '#3a6ea5', 1.35));
        grad.addColorStop(1, TOWER_TINT[info.key] || '#3a6ea5');
        ctx.beginPath(); ctx.arc(icx, icy, ir, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(icx, icy, ir, 0, Math.PI * 2); ctx.stroke();
        // 图标（v1.16.27：优先美术图片，缺失回退 emoji）
        const skIconOk = drawImg(ctx, skillIconSrc(info.key, sk.name), icx - 22, icy - 22, 44, 44);
        if (!skIconOk) {
          ctx.globalAlpha = 0.35; text(ctx, skDef.icon || (sk.name[0] || '?'), icx + 1, icy + 3, 22, '#000', 'center');
          ctx.globalAlpha = 1;
          text(ctx, skDef.icon || (sk.name[0] || '?'), icx, icy + 2, 22, '#ffffff', 'center');
        }
        // 技能名
        text(ctx, sk.name, cx + cardW / 2, cy + 106, 22, '#ffffff', 'center');
        // Lv 徽章：Lv = 1 + 最高分支等级；满级显示 LvMAX（v1.14，v1.16.11 立体化）
        const maxBr = Math.max(sk.branches.A || 0, sk.branches.B || 0, sk.branches.C || 0);
        const lv = 1 + maxBr;
        const lvTxt = lv >= maxLv ? 'LvMAX' : `Lv${lv}`;
        const lvSize = 15;
        const lvW = txtW(lvTxt, lvSize) + 20;
        const lvY = cy + 132;
        const lvGrad = ctx.createLinearGradient(cx + cardW / 2 - lvW / 2, lvY, cx + cardW / 2 - lvW / 2, lvY + 24);
        lvGrad.addColorStop(0, '#ffe08a'); lvGrad.addColorStop(1, '#e6b93f');
        fillRoundRect(ctx, cx + cardW / 2 - lvW / 2, lvY, lvW, 24, 12, lvGrad);
        strokeRoundRect(ctx, cx + cardW / 2 - lvW / 2, lvY, lvW, 24, 12, 'rgba(255,255,255,0.6)', 1);
        text(ctx, lvTxt, cx + cardW / 2, lvY + 13, lvSize, '#5c4a00', 'center');
        // 分支徽章横排（v1.13.16：只显示已选择升级的分支——lv>0 金色徽章，未选分支不渲染；已选分支整体居中）
        const bw = 54, bh = 48, bY = cy + 178;
        const activeBrs = ['A', 'B', 'C'].filter((br) => (sk.branches[br] || 0) > 0);
        if (activeBrs.length) {
          const totalW = activeBrs.length * bw + (activeBrs.length - 1) * 4;
          const startX = cx + (cardW - totalW) / 2;
          activeBrs.forEach((br, bi) => {
            const l = sk.branches[br] || 0;
            const bx = startX + bi * (bw + 4);
            fillRoundRect(ctx, bx, bY, bw, bh, 8, 'rgba(247,201,72,0.22)');
            strokeRoundRect(ctx, bx, bY, bw, bh, 8, '#f7c948', 1.5);
            text(ctx, this.branchName(skDef, br), bx + bw / 2, bY + 17, 12, '#f7c948', 'center');
            text(ctx, `Lv${l}`, bx + bw / 2, bY + 35, 11, '#f7c948', 'center');
          });
        } else {
          text(ctx, '未选分支', cx + cardW / 2, bY + 26, 13, 'rgba(255,255,255,0.35)', 'center');
        }
        // 右下角"详情 ›"提示（可点击）
        text(ctx, '详情 ›', cx + cardW - 14, cy + cardH - 16, 12, 'rgba(255,255,255,0.45)', 'right');
      });
    }
    // 关闭按钮
    hits.close = button(ctx, x + 150, y + hgt - 84, w - 300, 56, '关闭', { bg: '#3a6ea5', fontSize: 26 });
  }

  /** v1.16.11 技能二级详情面板：点击技能卡打开——技能效果 + 三个分支的详细效果与当前等级 */
  towerSkillLayer(ctx, info, hits) {
    const w = 688, hgt = 640, x = (750 - w) / 2, y = (LOGIC_H - hgt) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    const bgGrad = ctx.createLinearGradient(0, y, 0, y + hgt);
    bgGrad.addColorStop(0, '#2e2a3e'); bgGrad.addColorStop(1, '#191722');
    fillRoundRect(ctx, x, y, w, hgt, 18, bgGrad);
    strokeRoundRect(ctx, x, y, w, hgt, 18, info.color || '#a55eea', 3);
    const band = ctx.createLinearGradient(0, y, w, y);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, info.color || '#a55eea');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.globalAlpha = 0.5;
    ctx.fillRect(x + 20, y + 8, w - 40, 3);
    ctx.globalAlpha = 1;
    // 标题：技能名 + 图标 + Lv
    text(ctx, `${info.icon} ${info.skillName}`, x + w / 2, y + 52, 34, '#ffffff', 'center');
    const lvTxt = info.lvMax ? 'LvMAX' : `Lv${info.lv}`;
    const lvW = txtW(lvTxt, 15) + 18;
    fillRoundRect(ctx, x + w / 2 + 30, y + 28, lvW, 24, 12, '#f7c948');
    text(ctx, lvTxt, x + w / 2 + 30 + lvW / 2, y + 41, 15, '#5c4a00', 'center');
    // 技能效果说明
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    fillRoundRect(ctx, x + 40, y + 82, w - 80, 76, 12, 'rgba(255,255,255,0.07)');
    text(ctx, info.desc || '暂无描述', x + w / 2, y + 120, 20, '#e8ecf2', 'center');
    // 分隔 + 分支标题
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 40, y + 182, w - 80, 2);
    text(ctx, '升级分支', x + 40, y + 212, 22, '#b8c2cc', 'left');
    // 三个分支横排卡片：分支名 / 效果文案 / 当前等级
    const cardW = 196, cardH = 300, gap = 16, cardTop = y + 240;
    const brs = ['A', 'B', 'C'];
    const names = { A: info.bA || '分支A', B: info.bB || '分支B', C: info.bC || '分支C' };
    brs.forEach((br, i) => {
      const cx = x + 28 + i * (cardW + gap), cy = cardTop;
      const lv = (info.branches && info.branches[br]) || 0;
      const isAct = lv > 0;
      const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
      cardGrad.addColorStop(0, 'rgba(255,255,255,0.09)');
      cardGrad.addColorStop(1, isAct ? 'rgba(247,201,72,0.10)' : 'rgba(20,24,31,0.96)');
      fillRoundRect(ctx, cx, cy, cardW, cardH, 14, cardGrad);
      strokeRoundRect(ctx, cx, cy, cardW, cardH, 14, isAct ? '#f7c948' : 'rgba(255,255,255,0.16)', isAct ? 2 : 1.5);
      // 分支标识字母圆徽 + 名称
      ctx.fillStyle = isAct ? '#f7c948' : 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(cx + 28, cy + 32, 15, 0, Math.PI * 2); ctx.fill();
      text(ctx, br, cx + 28, cy + 33, 15, isAct ? '#5c4a00' : '#cfd6df', 'center');
      text(ctx, names[br], cx + 50, cy + 33, 17, '#ffffff', 'left');
      // 等级徽章（未选显示"未解锁"）
      if (isAct) {
        const bw2 = 44, bh2 = 20;
        fillRoundRect(ctx, cx + cardW - 56, cy + 22, bw2, bh2, 10, '#f7c948');
        text(ctx, `Lv${lv}`, cx + cardW - 34, cy + 33, 13, '#5c4a00', 'center');
      } else {
        text(ctx, '未解锁', cx + cardW - 42, cy + 33, 12, 'rgba(255,255,255,0.35)', 'right');
      }
      // 分隔线
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(cx + 12, cy + 54, cardW - 24, 2);
      // 分支效果文案（自动换行：2-4 行）
      const txt = isAct ? (info.branchDesc[br] || names[br]) : (info.branchDesc[br] || names[br]);
      const lines = this.wrapText(ctx, txt, cardW - 24, 16);
      lines.slice(0, 5).forEach((ln, li) => {
        text(ctx, ln, cx + cardW / 2, cy + 86 + li * 22, 15, isAct ? '#f1e6b8' : '#b8c2cc', 'center');
      });
    });
    // 返回按钮（回到塔详情）
    hits.back = button(ctx, x + 150, y + hgt - 78, w - 300, 54, '返回', { bg: info.color || '#a55eea', fontSize: 24 });
  }

  /** 文本自动换行（中文按宽度断行，供分支详情卡片使用） */
  wrapText(ctx, str, maxW, size) {
    const lines = [];
    if (!str) return [''];
    const font = ctx.font || '';
    ctx.font = `bold ${size}px sans-serif`;
    let cur = '';
    for (const ch of String(str)) {
      const t = cur + ch;
      if (cur && ctx.measureText(t).width > maxW) {
        lines.push(cur); cur = ch;
      } else {
        cur = t;
      }
    }
    if (cur) lines.push(cur);
    if (font) ctx.font = font;
    return lines.length ? lines : [str];
  }

  towerRow(ctx, s, count, showGlobal) {
    const towers = s.towers;
    const slotCount = count || this.ly.slotCount; // v1.14 测试战场传 6；正式战斗默认 4
    const { slotSize, slotGap, slotY } = this.ly;
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
        // 等级徽章（v1.16.17：塔自身等级 = 选择次数+1）
        fillRoundRect(ctx, x + slotSize - 16, slotY - 6, L.towerIcon.badge, L.towerIcon.badge, 4, '#f7c948');
        text(ctx, `${tw.level}`, x + slotSize - 8, slotY + 2, 12, '#5c4a00', 'center');
        // 可点详情小圆标 ⓘ（点击塔图标查看攻击/攻击间隔/技能等级）
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(x + 17, slotY + 17, 11, 0, Math.PI * 2); ctx.fill();
        text(ctx, 'i', x + 17, slotY + 21, 14, '#1a1a1a', 'center');
        // v1.13.1 弹药条：图标右侧纵向柱状（自下而上填充，ammo/ammoMax），无弹药红色警示
        const aRatio = tw.ammoMax > 0 ? Math.min(1, (tw.ammo || 0) / tw.ammoMax) : 0;
        const bx = x + slotSize - 9;              // 槽内右侧竖条
        const by0 = slotY + 8;
        const bh = slotSize - 16;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx, by0, 7, bh);
        ctx.fillStyle = aRatio <= 0 ? '#ff6b6b' : (aRatio < 0.34 ? '#ffb347' : '#7ef0a3');
        ctx.fillRect(bx, by0 + bh - Math.max(1, bh * aRatio), 7, Math.max(1, bh * aRatio));
        text(ctx, `${tw.ammo || 0}`, bx + 3, slotY + 5, 10, aRatio <= 0 ? '#ff6b6b' : 'rgba(255,255,255,0.7)', 'center');
        // v1.8：移除单塔经验条（经验整体化，经验条在出怪区上方）
      }
      x += slotSize + slotGap;
    }
    // v1.12.4 全局技能按钮：塔位区两侧（左=全局洗牌，右=弹药补给）；累计弹药每 chargePerUse 发 = 1 格，上限 3 格；按钮缩小 20%（128×94 → 102×75）
    // v1.14 测试战场（showGlobal=false）不渲染全局技能按钮
    if (showGlobal !== false) {
      const btnW = 102, btnH = 75, btnY = TOWER_ROW_Y + 12, btnGapX = 8;
      const perUse = Math.max(1, s.chargePerUse || 30);
      const shuCells = Math.min(3, Math.floor((s.shuffleAmmo || 0) / perUse));
      const refCells = Math.min(3, Math.floor((s.refillAmmo || 0) / perUse));
      this.globalBtns = [
        this._globalBtn(ctx, 'shuffle', '🔀', '洗牌', btnGapX, btnY, btnW, btnH, shuCells, '#ff8c42'),
        this._globalBtn(ctx, 'refill', '🔋', '补给', 750 - btnGapX - btnW, btnY, btnW, btnH, refCells, '#7ef0a3'),
      ];
    } else {
      this.globalBtns = [];
    }
  }

  /** 全局技能按钮绘制：图标 + 名称 + 3 格能量；返回命中矩形 {key,x,y,w,h}（v1.12.4 缩小 20% 布局） */
  _globalBtn(ctx, key, icon, name, bx, by, bw, bh, filled, tint) {
    const maxCells = 3;
    const ready = filled >= 1;
    ctx.globalAlpha = ready ? 1 : 0.55;
    ctx.fillStyle = ready ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.28)';
    ctx.strokeStyle = ready ? tint : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = ready ? 2.5 : 1.5;
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill(); ctx.stroke();
    text(ctx, icon, bx + bw / 2, by + 25, 27, ready ? '#ffffff' : 'rgba(255,255,255,0.5)', 'center');
    text(ctx, name, bx + bw / 2, by + 46, 14, ready ? '#ffffff' : 'rgba(255,255,255,0.45)', 'center');
    // 3 格能量圆点
    const dotR = 6, dotY = by + bh - 12, gap = 21, x0 = bx + (bw - (gap * (maxCells - 1))) / 2;
    for (let i = 0; i < maxCells; i++) {
      const dx = x0 + i * gap;
      ctx.beginPath(); ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
      if (i < filled) { ctx.fillStyle = tint; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke(); }
      else { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    return { key, x: bx, y: by, w: bw, h: bh };
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
      const isElite = e.type === 'elite';
      let size = e.isBoss ? L.enemy.boss : (L.enemy[e.type] || L.enemy.normal);
      // v1.16.11 精英怪：同种怪物放大 25% + 紫色调染色（贴图 source-atop 罩色 / 回退几何换色），一眼可辨
      if (isElite) size = Math.round(size * 1.25);
      const x = e.x - size / 2, y = e.y - size / 2;
      const src = e.isBoss ? IMG_SRC.boss
        : (e.type === 'runner' ? IMG_SRC.runner : (e.type === 'tank' ? IMG_SRC.tank : IMG_SRC.enemy));
      const fallbackColor = e.isBoss ? '#c0392b' : (isElite ? '#9b59b6' : (e.type === 'runner' ? '#2e86c1' : (e.type === 'tank' ? '#8e6b3a' : '#7f8c8d')));
      const fallbackText = e.isBoss ? 'BOSS' : (isElite ? '精' : (e.type === 'runner' ? '快' : (e.type === 'tank' ? '盾' : '👾')));
      if (!drawImg(ctx, src, x, y, size, size)) {
        fillRoundRect(ctx, x, y, size, size, e.isBoss ? 10 : 6, fallbackColor);
        text(ctx, fallbackText, x + size / 2, y + size / 2, e.isBoss ? 16 : 14, '#fff', 'center');
      } else if (isElite) {
        // 精英染色：紫红色罩（source-atop 只染已绘区域，保持透明底）
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = '#a55eea';
        ctx.fillRect(x, y, size, size);
        ctx.restore();
        // 精英专属标识：紫金光环 + 顶部 ★ 角标
        const cx = x + size / 2, cy = y + size / 2;
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(Date.now() / 260);
        ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(cx, y - 8); ctx.lineTo(cx + 5, y + 1); ctx.lineTo(cx - 5, y + 1);
        ctx.closePath(); ctx.fill();
      }
      // A1 状态可视化：仅冰冻保留描边框（蓝框）；减速/麻痹改用专属特效，不再画框
      if (e.frozen > 0) {
        ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9;
        ctx.strokeRect(x - 3, y - 3, size + 6, size + 6);
        ctx.globalAlpha = 1;
      }
      // v1.13.26 冰冻持续特效：冰晶外壳（半透明冰壳 + 冰刺 + 白色呼吸高光），冻结期间常驻
      if (e.frozen > 0) {
        const cx = x + size / 2, cy = y + size / 2;
        const br = 1 + 0.08 * Math.sin(Date.now() / 220);
        ctx.fillStyle = '#b8e6ff'; ctx.globalAlpha = 0.22;
        ctx.beginPath(); ctx.arc(cx, cy, size * 0.55 * br, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d6f0ff'; ctx.globalAlpha = 0.55;
        for (let k = 0; k < 5; k++) {
          const a = Date.now() / 600 + k * 1.256;
          const ix = cx + Math.cos(a) * size * 0.52 * br, iy = cy + Math.sin(a) * size * 0.52 * br;
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(ix + Math.cos(a + 0.5) * 6, iy + Math.sin(a + 0.5) * 6);
          ctx.lineTo(ix + Math.cos(a + 1.4) * 6, iy + Math.sin(a + 1.4) * 6);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() / 160);
        ctx.beginPath(); ctx.arc(cx - size * 0.15, cy - size * 0.15, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // v1.13.30 寒霜加强：全身淡冰蓝霜罩（呼吸染色，无方框）+ 脚下双环冰雾 + 寒气粒子上升 + 冰霜结晶
      if (e.slow && e.slow.ttl > 0 && e.frozen <= 0) {
        const cx = x + size / 2, cy = y + size / 2;
        const tNow = Date.now();
        const pulse = (tNow / 420) % 1;
        // 全身淡冰蓝霜罩（纯填充染色，呼吸变化，不是边框）
        ctx.fillStyle = '#7fd4ff'; ctx.globalAlpha = 0.18 + 0.1 * Math.sin(tNow / 300);
        ctx.fillRect(x - 1, y - 1, size + 2, size + 2);
        // 双环冰雾扩散（内外两圈，更亮更明显）
        ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 2.2;
        ctx.globalAlpha = 0.85 * (1 - pulse);
        ctx.beginPath(); ctx.arc(cx, cy + size * 0.42, 3 + pulse * size * 0.45, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.5 * (1 - pulse);
        ctx.beginPath(); ctx.arc(cx, cy + size * 0.42, 9 + pulse * size * 0.58, 0, Math.PI * 2); ctx.stroke();
        // 寒气粒子从脚下上升（6 粒，更大更亮，确定性相位）
        for (let k = 0; k < 6; k++) {
          const ph = ((tNow / 460 + k * 0.1667) % 1);
          const px = cx + Math.sin((tNow / 280 + k * 1.5) * 2) * size * 0.26;
          const py = cy + size * 0.42 - ph * size * 0.62;
          ctx.fillStyle = '#e8f7ff'; ctx.globalAlpha = 0.7 * (1 - ph);
          ctx.beginPath(); ctx.arc(px, py, 2.2 + ph * 2.2, 0, Math.PI * 2); ctx.fill();
        }
        // 冰霜结晶光点绕身跳动（5 点，更亮）
        for (let k = 0; k < 5; k++) {
          const a = tNow / 650 + k * 1.256;
          const jx = cx + Math.cos(a) * size * 0.52, jy = cy + Math.sin(a) * size * 0.52;
          ctx.fillStyle = '#bde7ff'; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(tNow / 170 + k);
          ctx.beginPath(); ctx.arc(jx, jy, 2.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // v1.13.21 麻痹持续特效：头顶金色电花（⚡+跳动电光点），麻痹期间常驻
      if (e.paralyzed > 0) {
        const cx = x + size / 2, cy = y + size / 2;
        const tNow = Date.now();
        ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd24a';
        ctx.fillText('⚡', cx, cy - size * 0.72);
        // 周围跳动电光点（确定性：时间+索引相位）
        for (let k = 0; k < 3; k++) {
          const ph = tNow / 130 + k * 2.1;
          const rx = cx + Math.cos(ph) * (size * 0.62 + 3 * Math.sin(tNow / 90 + k));
          const ry = cy - size * 0.72 + Math.sin(ph * 1.7) * size * 0.34;
          ctx.fillStyle = '#f4d03f'; ctx.globalAlpha = 0.55 + 0.4 * Math.sin(tNow / 110 + k * 2);
          ctx.beginPath(); ctx.arc(rx, ry, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (e.dots && e.dots.length) {
        e.dots.forEach((d) => {
          if (d.type === 'burn') {
            // v1.13.7 灼烧效果：4 帧火焰贴图循环燃烧（120ms/帧，透明 PNG）+ 火焰描边 + 少量火苗
            // v1.13.21 图标缩小并下移到底部（怪物脚下）
            // v1.16.21 点燃图标下边界与怪物下边界对齐（图片底边贴齐 y+size）
            const fireI = d.stack || 1;
            const cx = x + size / 2, cy = y + size / 2;
            const fw = size * (0.68 + 0.05 * Math.min(2, fireI)), fh = size * (0.68 + 0.05 * Math.min(2, fireI));
            const frameIdx = Math.floor(Date.now() / 120) % 4;
            if (!drawImg(ctx, `images/burn/burn${frameIdx + 1}.png`, cx - fw / 2, y + size - fh, fw, fh)) {
              // 贴图未加载时回退：火光圆 + 跳动火苗（确定性），位置与贴图一致（下边界贴齐）
              const fireCy = y + size - fh / 2;
              ctx.fillStyle = '#ff9f43'; ctx.globalAlpha = 0.35;
              ctx.beginPath(); ctx.arc(cx, fireCy, size * 0.18, 0, Math.PI * 2); ctx.fill();
              ctx.globalAlpha = 1;
              for (let k = 0; k < 2 + Math.min(3, fireI); k++) {
                const rx = cx + (Math.random() - 0.5) * size * 0.5;
                const ry = fireCy + (Math.random() - 0.45) * size * 0.35;
                const rr = (1.4 + Math.random() * 2.6) * (1 + 0.25 * Math.min(2, fireI));
                ctx.fillStyle = Math.random() < 0.45 ? '#ffd24a' : '#ff7043';
                ctx.globalAlpha = 0.45 + Math.random() * 0.45;
                ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
              }
              ctx.globalAlpha = 1;
            }
            // 火焰描边（闪烁，叠层越多越旺）
            const flick = 0.6 + 0.4 * Math.sin(Date.now() / 110 + e.x * 0.05);
            ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 2 + 0.5 * Math.min(2, fireI); ctx.globalAlpha = 0.7 * flick + 0.15 * Math.min(2, fireI);
            ctx.strokeRect(x - 3, y - 3, size + 6, size + 6);
            ctx.globalAlpha = 1;
          } else if (d.type === 'poison') {
            // v1.16.2 中毒层数标识：敌人身上按叠层层数画毒泡（最多 5 个，层数越高泡越大越亮）+ 头顶层数数字
            const stack = d.stack || 1;
            const cx = x + size / 2, cy = y + size / 2;
            const tNow = Date.now();
            const n = Math.min(5, stack);
            for (let k = 0; k < n; k++) {
              const ph = tNow / 320 + k / n;
              const px = cx + Math.cos(ph * 2 + k * 1.9) * size * 0.17;
              const py = cy + size * 0.2 + Math.sin(ph * 1.6 + k) * size * 0.07 - k * 3;
              ctx.fillStyle = k === n - 1 ? '#58d68d' : (k % 2 ? '#2e7d32' : '#1e8449');
              ctx.globalAlpha = 0.7 + 0.25 * Math.sin(tNow / 180 + k * 2);
              ctx.beginPath(); ctx.arc(px, py, 2.4 + k * 0.45, 0, Math.PI * 2); ctx.fill();
            }
            // 层数数字（头顶，深底浅字清晰可见）
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath(); ctx.arc(cx, cy - size * 0.38, 8.5, 0, Math.PI * 2); ctx.fill();
            text(ctx, `${stack}`, cx, cy - size * 0.38 + 1, Math.max(11, 10 + Math.min(2, stack - 1)), '#a9dfbf', 'center');
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = '#52be80';
            ctx.globalAlpha = 0.65;
            ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size * 0.28, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
          }
        });
      }
      // v1.16.1 毒藤持续缠绕：被缠敌人（_vineT>0）身上绿色藤蔓螺旋缠绕 + 叶片脉动，缠绕越久越紧
      if (e._vineT > 0) {
        const cx = x + size / 2, cy = y + size / 2;
        const tNow = Date.now();
        const iv = Math.max(0, Math.min(1, e._vineT / 3)); // 剩余比例（基准 3s）
        const pulse = 1 + 0.06 * Math.sin(tNow / 260 + (e.id || 0) % 7);
        const spin = tNow / 500 + (e.id || 0);
        ctx.strokeStyle = '#27ae60'; ctx.globalAlpha = 0.55 + 0.3 * Math.sin(tNow / 150);
        ctx.lineWidth = 3 * pulse;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          const ph0 = spin + k * 2.094;
          for (let s = 0; s <= 12; s++) {
            const ph = ph0 + s * 0.52;
            const wob = 1 + 0.14 * Math.sin(ph * 2.2 + (e.id || 0));
            const px = cx + Math.cos(ph) * size * 0.5 * wob * (1 - s / 14);
            const py = cy + Math.sin(ph) * size * 0.34 * wob - size * 0.12 + (s / 12) * size * 0.55;
            if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        // 叶片：沿缠绕藤随机分布的绿色小叶（确定性相位）
        for (let k = 0; k < 6; k++) {
          const ph = tNow / 300 + k * 1.047 + (e.id || 0);
          const lx = cx + Math.cos(ph) * size * 0.52;
          const ly = cy + Math.sin(ph) * size * 0.36;
          ctx.fillStyle = k % 2 ? '#2ecc71' : '#27ae60';
          ctx.globalAlpha = 0.5 + 0.35 * Math.sin(tNow / 190 + k * 1.9);
          ctx.beginPath();
          ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
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

  /** 地面持续效果（v1.16.1）：毒池毒液池（深绿帧动画冒泡）+ 毒棒召唤物（帧动画图标）——画在敌人下层 */
  groundFx(ctx, combat) {
    if (!combat) return;
    const tNow = Date.now();
    // v1.16.6 回旋镖·风痕：镖路径残留的旋转镖影（紫色渐淡圈），C 卷痕减速时带减速蓝光
    if (combat.windTrails && combat.windTrails.length) {
      combat.windTrails.forEach((w) => {
        if (w.ttl <= 0) return;
        const fade = Math.min(1, w.ttl / 1.6);
        const R = w.r || 34;
        const rot = tNow / 90;
        // 半透明地面涡痕（双圈呼吸）
        ctx.fillStyle = 'rgba(142,68,173,0.20)'; ctx.globalAlpha = 0.55 * fade;
        ctx.beginPath(); ctx.arc(w.x, w.y, R * (1 + 0.06 * Math.sin(tNow / 260 + w.x)), 0, Math.PI * 2); ctx.fill();
        // 旋转镖影（4 枚小回旋镖沿圈旋转，沿时间淡出）
        ctx.globalAlpha = 0.8 * fade;
        ctx.strokeStyle = w.slow ? '#7fb3d5' : '#c39bd3';
        ctx.lineCap = 'round'; ctx.lineWidth = 4;
        for (let k = 0; k < 4; k++) {
          const a = rot + k * Math.PI / 2;
          const px = w.x + Math.cos(a) * R * 0.7;
          const py = w.y + Math.sin(a) * R * 0.7;
          ctx.save();
          ctx.translate(px, py); ctx.rotate(a + rot);
          ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(0, 0); ctx.lineTo(-3, 5.2); ctx.stroke();
          ctx.restore();
        }
        ctx.lineCap = 'butt';
        // 中心涡眼
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = w.slow ? '#aed6f1' : '#d2b4de';
        ctx.beginPath(); ctx.arc(w.x, w.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
    // 毒池：半透明深绿毒液池（多层椭圆呼吸）+ 边缘泡沫 + 气泡上升帧动画
    if (combat.groundDots && combat.groundDots.length) {
      combat.groundDots.forEach((gd) => {
        if (gd.key !== 'poison' || gd.ttl <= 0) return;
        const seed = gd.seed || 0;
        const fade = Math.min(1, gd.ttl / 1.2); // 接近结束淡出
        const R = gd.r || 130;
        const breathe = 1 + 0.05 * Math.sin(tNow / 320 + seed);
        // 外圈深绿液池
        ctx.fillStyle = '#145a32'; ctx.globalAlpha = 0.45 * fade;
        ctx.beginPath(); ctx.ellipse(gd.x, gd.y, R * breathe, R * 0.62 * breathe, 0, 0, Math.PI * 2); ctx.fill();
        // 内圈稍亮毒液
        ctx.fillStyle = '#1e8449'; ctx.globalAlpha = 0.38 * fade;
        ctx.beginPath(); ctx.ellipse(gd.x, gd.y, R * 0.66 * breathe, R * 0.42 * breathe, 0, 0, Math.PI * 2); ctx.fill();
        // 高光毒斑
        ctx.fillStyle = '#28b463'; ctx.globalAlpha = 0.22 * fade;
        ctx.beginPath(); ctx.ellipse(gd.x - R * 0.18, gd.y - R * 0.08, R * 0.28, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        // 边缘泡沫（绕池边抖动）
        ctx.fillStyle = '#58d68d'; ctx.globalAlpha = 0.5 * fade;
        for (let k = 0; k < 14; k++) {
          const ph = ((tNow / 700 + k / 14 + seed) % 1);
          const a = ph * Math.PI * 2;
          const rr = R * (0.94 + 0.04 * Math.sin(tNow / 220 + k * 1.7));
          const bx = gd.x + Math.cos(a) * rr;
          const by = gd.y + Math.sin(a) * rr * 0.62;
          const br = 2 + ph * 2;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        }
        // 气泡上升帧动画（池内随机点冒泡）
        for (let k = 0; k < 5; k++) {
          const ph = ((tNow / 900 + k / 5 + seed * 0.013) % 1);
          const bx = gd.x + Math.sin((tNow / 600 + k * 2.1) * 2) * R * 0.35;
          const by = gd.y + R * 0.3 - ph * R * 0.75;
          ctx.fillStyle = '#a9dfbf'; ctx.globalAlpha = (0.55 - 0.35 * ph) * fade;
          ctx.beginPath(); ctx.arc(bx, by, 1.6 + ph * 2.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    }
    // 毒棒：帧动画贴图（v1.16.10）——4 帧：1 破土 / 2 成型 / 3 蓄力膨胀 / 4 喷发攻击
    // 常态循环 1→2→3（0.9s 周期）；每次攻击（atkT 归零）后 0.32s 内显示第 4 帧喷发
    if (combat.poisonSticks && combat.poisonSticks.length) {
      combat.poisonSticks.forEach((st) => {
        if (st.ttl <= 0) return;
        const seed = st.seed || 0;
        const fade = Math.min(1, st.ttl / 1.5);
        const x = st.x, y = st.y;
        // 根部毒圈（微光 + 呼吸，保留增强落地感）
        const pulse = 1 + 0.08 * Math.sin(tNow / 280 + seed);
        ctx.fillStyle = '#1e8449'; ctx.globalAlpha = 0.2 * fade * pulse;
        ctx.beginPath(); ctx.arc(x, y, 12 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#58d68d'; ctx.lineWidth = 1.4; ctx.globalAlpha = (0.28 + 0.18 * Math.sin(tNow / 300 + seed)) * fade;
        ctx.beginPath(); ctx.arc(x, y, 15 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        // 帧选择：攻击后 0.32s 内第 4 帧（喷发），否则 1-3 帧循环
        const atk = st.atkT <= 0.32;
        let frameIdx;
        if (atk) {
          frameIdx = 3;
        } else {
          const ph = (tNow / 900 + seed * 0.037) % 1;
          frameIdx = Math.floor(ph * 3);
        }
        const fw = 30, fh = 36;
        if (!drawImg(ctx, `images/poisonstick/poisonstick${frameIdx + 1}.png`, x - fw / 2, y - 8, fw, fh)) {
          // 贴图未加载回退：简化几何（木柄 + 毒囊）
          const pulse2 = 1 + 0.08 * Math.sin(tNow / 280 + seed);
          ctx.save();
          ctx.translate(x, y - 4); ctx.rotate(-0.18);
          ctx.fillStyle = '#6d4c41'; ctx.globalAlpha = 0.95 * fade;
          ctx.fillRect(-3, -22, 6, 24);
          const sacR = 6.5 * pulse2;
          ctx.fillStyle = '#1e8449'; ctx.globalAlpha = 0.95 * fade;
          ctx.beginPath(); ctx.arc(0, -26, sacR, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        // 攻击瞬间绿色毒雾爆点（贴图第 4 帧叠加，增强命中感）
        if (atk) {
          ctx.globalAlpha = (0.7 - st.atkT * 2.2) * fade;
          ctx.fillStyle = '#2e7d32';
          ctx.beginPath(); ctx.arc(x, y - 16, 6 + st.atkT * 26, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      });
    }
  }

  /** 打击特效：子弹 / 爆炸帧动画 / 命中闪光（无图回退几何形状） */
  fx(ctx, fxList) {
    fxList.forEach((f) => {
      if (f.t < 0) return; // v1.13.8：延迟帧动画（火雨连续波次 stagger）未到时跳过渲染
      if (f.type === 'shot') {
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
          // v1.12.4 完全去掉弧线轨迹（不画任何路线/拖尾，只保留镖头旋转飞行）
          // 镖头朝向：瞬时速度方向（数值差分）
          const step = 0.015;
          const pa = arcPos(f, Math.min(1, p + step));
          const pb = arcPos(f, Math.max(0, p - step));
          const ang = Math.atan2(pa.y - pb.y, pa.x - pb.x);
          // 镖体自旋（v1.12.4：转速加倍，全程转 8 圈）
          const spin = p * Math.PI * 16;
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
          // v1.16.6 折返段强化：飞回阶段（p>=0.5）镖身金白外辉，表现折返增伤/更强回程；镖阵（ring）紫金光晕
          if (p >= 0.5 || f.ring) {
            const glowCol = f.ring ? '#c39bd3' : '#ffe08a';
            ctx.globalAlpha = (f.ring ? 0.55 : 0.35 + 0.3 * Math.sin(p * 18));
            ctx.fillStyle = glowCol;
            ctx.beginPath(); ctx.arc(bx, by, 40 * sc, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
          }
        } else if (f.kind === 'zigzag') {
          // v1.13.19 锯齿电弧（塔口→目标）：多段折线 + 每帧轻微抖动 + 白芯
          const p = f.path;
          if (p && p.length > 1) {
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
          // v1.13.25 冰墙（城墙冰霜护盾）：横贯城墙的半透明冰墙 + 顶部冰刺 + 冰晶呼吸
          const fp = Math.min(1, f.t / f.dur);
          const breathe = 1 + 0.06 * Math.sin(Date.now() / 260);
          const wy = (f.y || this.ly.wallY);
          // 主体墙体（冰蓝半透明，中央略厚）
          ctx.fillStyle = '#7fd4ff'; ctx.globalAlpha = 0.20 * (1 - fp * 0.35);
          ctx.fillRect(f.x - (f.r || 350) / 2, wy - 16 * breathe, (f.r || 350), 30 * breathe);
          ctx.fillStyle = '#d6f0ff'; ctx.globalAlpha = 0.35 * (1 - fp * 0.4);
          ctx.fillRect(f.x - (f.r || 350) / 2, wy - 6 * breathe, (f.r || 350), 10 * breathe);
          // 顶部冰刺
          ctx.fillStyle = '#a9d6f5'; ctx.globalAlpha = 0.7;
          for (let k = 0; k < 7; k++) {
            const bx = f.x - (f.r || 350) / 2 + ((k + 0.5) * (f.r || 350)) / 7;
            const h = (10 + (k % 3) * 6) * breathe;
            ctx.beginPath();
            ctx.moveTo(bx - 7, wy - 2);
            ctx.lineTo(bx, wy - 14 - h);
            ctx.lineTo(bx + 7, wy - 2);
            ctx.closePath(); ctx.fill();
          }
          // 冰晶粒子（呼吸闪烁）
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 180 + f.x);
          for (let k = 0; k < 5; k++) {
            const px = f.x - (f.r || 350) / 2 + ((f.x * 7 + k * 131) % (f.r || 350));
            ctx.beginPath(); ctx.arc(px, wy - (8 + ((f.x * 13 + k * 71) % 34)), 2.2, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else if (f.kind === 'icebloom') {
          // v1.13.28 冰花帧动画：4 帧绽放序列（images/icebloom/icebloom1-4.png，按进度选帧）
          const fp = Math.min(1, f.t / f.dur);
          const frameIdx = Math.min(3, Math.floor(fp * 4));
          const fw = (f.r || 100) * 1.9, fh = (f.r || 100) * 1.9;
          if (!drawImg(ctx, `images/icebloom/icebloom${frameIdx + 1}.png`, f.x - fw / 2, f.y - fh / 2, fw, fh)) {
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
          const mx = f.x + (f.tx - f.x) * p;
          const my = f.y + (f.ty - f.y) * p - arcH * Math.sin(Math.PI * p);
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
      } else if (f.type === 'strikeShell') {
        // v1.16.26 炮火支援：逐发弹道——每发 offset 偏移后 0.3s 升空至高点 300px、悬停至 1.0s、0.3s 垂直落下
        const t1 = f.t - (f.offset || 0);
        if (t1 < 0 || t1 >= 1.3) return;   // 未发射或已落地
        let mx, my, ang;
        if (t1 < 0.3) {
          const k = t1 / 0.3;
          mx = f.sx; my = f.sy - 300 * k; ang = -Math.PI / 2;
        } else if (t1 < 1.0) {
          mx = f.sx; my = f.sy - 300; ang = -Math.PI / 2;   // 高点悬停
        } else {
          const k = (t1 - 1.0) / 0.3;
          mx = f.sx + (f.tx - f.sx) * k;
          my = (f.sy - 300) + (f.ty - (f.sy - 300)) * k;
          ang = Math.atan2(f.ty - (f.sy - 300), f.tx - f.sx);
        }
        // 升空段出膛口焰
        if (t1 < 0.3) {
          ctx.globalAlpha = 0.9 * (1 - t1 / 0.3 * 1.25);
          ctx.fillStyle = '#ffd24a';
          ctx.beginPath(); ctx.arc(f.sx, f.sy, 6 + 10 * (t1 / 0.3), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        // 炮弹弹体（沿飞行方向胶囊炮弹 + 尾部曳光焰，与 mortar 同款）
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ff7043';
        ctx.beginPath(); ctx.ellipse(-13, 0, 13, 4.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.ellipse(-17, 0, 7, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#3a2f22';
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ff8c42'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.6, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(7, 0, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (f.type === 'strike') {
        // v1.16.26 炮火支援：地面炮击圈——offset 偏移后于落地前 0.5s 出现（炮弹高点悬停期），持续至落地爆炸
        const t1 = f.t - (f.offset || 0);
        if (t1 < 0.5 || t1 >= 1.3) return;   // 未到预警时刻或已爆炸
        const p = (t1 - 0.5) / 0.8;
        const a = 0.25 + 0.55 * p;   // 淡入
        ctx.globalAlpha = a * 0.32;
        ctx.fillStyle = '#f39c12';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.62, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.34, 0, Math.PI * 2); ctx.stroke();
        // 中心瞄准点（十字 + 圆点）
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
        const c = 7;
        ctx.beginPath();
        ctx.moveTo(f.x - c, f.y); ctx.lineTo(f.x + c, f.y);
        ctx.moveTo(f.x, f.y - c); ctx.lineTo(f.x, f.y + c);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, 2.4, 0, Math.PI * 2); ctx.fill();
        // 旋转刻度（8 根短线绕外圈）
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2;
        for (let k = 0; k < 8; k++) {
          const ang = k * 0.785 + (f.seed || 0) + f.t * 3;
          const r1 = f.r * 0.66, r2 = f.r * 0.72;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1);
          ctx.lineTo(f.x + Math.cos(ang) * r2, f.y + Math.sin(ang) * r2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
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
        // v1.16.6 爆炸增强：冲击波扩散环 + 亮心闪光 + 辐射火粒（重炮/地雷/炮火支援/炮台通用）
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.7 + (1 - p) * 46, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = (1 - p) * 0.3;
        ctx.strokeStyle = (f.color || '#ff9f43');
        ctx.beginPath(); ctx.arc(f.x, f.y, r + (1 - p) * 58, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = Math.max(0, (1 - p) * 9);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, 6 + (1 - p) * 16, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (1 - p) * 0.8;
        ctx.fillStyle = (f.color || '#ff9f43');
        for (let k = 0; k < 8; k++) {
          const a = k * 0.785 + f.t * 7 + (f.seed || 0);
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * (10 + (1 - p) * 52), f.y + Math.sin(a) * (10 + (1 - p) * 52) * 0.85, 2.4 - (1 - p) * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'flash') {
        const p = Math.min(1, f.t / f.dur);
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.fillStyle = f.color || '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, 6 + p * 8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.type === 'vine') {
        // 毒藤攻击帧动画（v1.16.1）：藤蔓从塔口伸展生长到目标（dur 0.55s）——主藤弯曲生长 + 叶片 + 末端毒花苞绽放
        const p = Math.min(1, f.t / f.dur);
        const seed = f.seed || 0;
        const wobDir = (seed % 2 ? 1 : -1);
        const dist = Math.hypot(f.tx - f.x, f.ty - f.y) || 1;
        const grow = Math.min(1, p * 1.35); // 生长进度（略快于总时长，先到位后绽放）
        // 主藤（贝塞尔弯曲，只画到生长进度）
        ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        const mx = (f.x + f.tx) / 2 + wobDir * 22 * Math.sin(p * 2 + seed);
        const my = (f.y + f.ty) / 2 - 8;
        ctx.quadraticCurveTo(mx, my, f.x + (f.tx - f.x) * grow, f.y + (f.ty - f.y) * grow);
        ctx.stroke();
        // 内亮线（藤蔓质感）
        ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.quadraticCurveTo(mx, my, f.x + (f.tx - f.x) * grow, f.y + (f.ty - f.y) * grow);
        ctx.stroke();
        // 叶片（沿藤分布，随生长出现）
        ctx.fillStyle = '#2ecc71'; ctx.globalAlpha = 0.75;
        for (let k = 0; k < 4; k++) {
          const tp = k / 4;
          if (tp > grow) break;
          const lx = f.x + (f.tx - f.x) * tp;
          const ly = f.y + (f.ty - f.y) * tp;
          const lwob = wobDir * (1 + tp);
          ctx.beginPath();
          ctx.ellipse(lx + lwob * 3, ly + Math.sin(tp * 5 + seed) * 4, 3.2, 1.8, tp * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        // 末端毒花苞（到达后绽放 + 毒液溅点）
        if (p > 0.75) {
          const bloom = (p - 0.75) / 0.25;
          const bx = f.tx, by = f.ty;
          ctx.fillStyle = '#28b463'; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.arc(bx, by, 3 + bloom * 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#58d68d'; ctx.globalAlpha = (1 - bloom) * 0.8;
          for (let k = 0; k < 6; k++) {
            const a = k * 1.047 + seed;
            ctx.beginPath(); ctx.arc(bx + Math.cos(a) * (7 + bloom * 8), by + Math.sin(a) * 4, 1.6, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'thorn') {
        // 毒棒攻击弹道（v1.16.1）：绿色毒刺飞射目标 + 尾随毒粒 + 命中溅射
        const p = Math.min(1, f.t / f.dur);
        const x = f.x + (f.tx - f.x) * p;
        const y = f.y + (f.ty - f.y) * p;
        const ang = Math.atan2(f.ty - f.y, f.tx - f.x);
        // 尾随毒粒
        for (let k = 0; k < 3; k++) {
          const tp = Math.max(0, p - 0.06 * (k + 1));
          const px = f.x + (f.tx - f.x) * tp;
          const py = f.y + (f.ty - f.y) * tp;
          ctx.fillStyle = '#58d68d'; ctx.globalAlpha = 0.5 * (1 - k / 3) * (1 - p * 0.4);
          ctx.beginPath(); ctx.arc(px + (Math.random() - 0.5) * 3, py + (Math.random() - 0.5) * 3, 2.2 - k * 0.5, 0, Math.PI * 2); ctx.fill();
        }
        // 毒针体（细长三角朝向目标）
        ctx.save();
        ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = '#2e7d32'; ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(-4, -2.4); ctx.lineTo(-4, 2.4);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6fcf97'; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // 命中溅射（末尾帧毒液四溅）
        if (p > 0.85) {
          const sp = (p - 0.85) / 0.15;
          ctx.fillStyle = '#2e7d32'; ctx.globalAlpha = (1 - sp) * 0.7;
          for (let k = 0; k < 5; k++) {
            const a = k * 1.257 + f.t;
            ctx.beginPath(); ctx.arc(f.tx + Math.cos(a) * sp * 9, f.ty + Math.sin(a) * sp * 7, 1.6, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'mine') {
        // 炮·地雷（v1.16.22）：雷从塔口抛投（200px/s，飞行段为移动弹体+尾焰），落地后驻留闪烁（警示脉冲环+引信）
        const flyDur = f.fly ? f.fly.dur : 0;
        const flying = f.fly && f.t < flyDur;
        const mx = flying ? f.fly.sx + (f.fly.tx - f.fly.sx) * (f.t / flyDur) : f.x;
        const my = flying ? f.fly.sy + (f.fly.ty - f.fly.sy) * (f.t / flyDur) : f.y;
        if (flying) {
          // 飞行弹体：暗色雷弹 + 尾焰拖尾
          ctx.fillStyle = '#5d4a2f';
          ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#b5651d'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#f39c12';
          ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
          const dir = Math.atan2(my - f.fly.sy, mx - f.fly.sx);
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = '#f39c12';
          ctx.beginPath(); ctx.arc(mx - Math.cos(dir) * 10, my - Math.sin(dir) * 10, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.45;
          ctx.beginPath(); ctx.arc(mx - Math.cos(dir) * 17, my - Math.sin(dir) * 17, 3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          // 驻留：警示脉冲环（外扩淡出，提示爆炸半径 100）+ 闪烁弹体 + 引信
          const p = Math.min(1, (f.t - flyDur) / 20);
          const blink = 0.6 + 0.4 * Math.sin(p * 22 + (f.seed || 0));
          const pulse = (p * 2.1 + (f.seed || 0) / 10) % 1;
          ctx.globalAlpha = (1 - pulse) * 0.35;
          ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(mx, my, 10 + pulse * 42, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = blink;
          ctx.fillStyle = '#5d4a2f';
          ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#b5651d'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#f39c12';
          ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#b5651d';
          ctx.fillRect(mx - 1, my - 14, 2, 6);
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(p * 30 + (f.seed || 0));
          ctx.fillStyle = '#ffd24a';
          ctx.beginPath(); ctx.arc(mx, my - 13, 2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (f.type === 'turret') {
        // 炮·炮台（v1.16.10）：帧动画贴图——1 落地 / 2 成型 / 3 瞄准 / 4 开火
        // 常态循环 1→2→3（1.2s 周期）；combat 开火时在 fx 上打 attackT（f.t 时刻），0.3s 内显示第 4 帧
        const p = Math.min(1, f.t / f.dur);
        const seed = f.seed || 0;
        // 底座光环（部署确认圈，保留淡显）
        ctx.globalAlpha = (0.22 + 0.14 * Math.sin(p * 6 + seed)) * Math.min(1, f.t / 0.4);
        ctx.strokeStyle = '#d89e63'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y - 2, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        const atk = f.attackT !== undefined && f.t - f.attackT < 0.3;
        let frameIdx;
        if (atk) {
          frameIdx = 3;
        } else {
          const ph = (f.t / 1.2 + seed * 0.031) % 1;
          frameIdx = Math.floor(ph * 3);
        }
        const fw = 34, fh = 36;
        if (!drawImg(ctx, `images/turret/turret${frameIdx + 1}.png`, f.x - fw / 2, f.y - 20, fw, fh)) {
          // 贴图未加载回退：简化几何炮台（底座 + 摆动炮管）
          const sway = Math.sin(p * 8 + seed) * 0.12;
          ctx.fillStyle = '#7a5a30';
          ctx.fillRect(f.x - 10, f.y - 8, 20, 16);
          ctx.fillStyle = '#a06020';
          ctx.beginPath(); ctx.arc(f.x, f.y - 8, 7, 0, Math.PI * 2); ctx.fill();
          ctx.save();
          ctx.translate(f.x, f.y - 8); ctx.rotate(sway);
          ctx.fillStyle = '#c0392b';
          ctx.fillRect(-2, -14, 5, 16);
          ctx.restore();
        }
        // 开火瞬间炮口高亮（贴图第 4 帧叠加）
        if (atk) {
          ctx.globalAlpha = (0.8 - (f.t - f.attackT) * 2.6);
          ctx.fillStyle = '#ffd24a';
          ctx.beginPath(); ctx.arc(f.x, f.y - 8, 5 + (f.t - f.attackT) * 30, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (f.type === 'cyclone') {
        // v1.16.21 风暴镖重做：三同心圈（不可见）沿圈旋转的小飞镖（10px），引用 combat 实时 darts（命中消失同步）
        const darts = f.darts || [];
        for (const d of darts) {
          const px = f.x + Math.cos(d.a) * d.r;
          const py = f.y + Math.sin(d.a) * d.r;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(d.a);
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#8e44ad';
          ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#c39bd3'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-4.5, 0); ctx.lineTo(4.5, 0); ctx.stroke();
          ctx.lineCap = 'butt';
          ctx.restore();
        }
      } else if (f.type === 'pillar') {
        // 火柱帧动画（v1.13.9）：地上火圈标记(0~25%) → 冲天圆柱火柱(25~70%) → 白热冲击(70~82%) → 余烬消散
        // dur 2.4s（v1.13.9 放慢一倍）；伤害在地面圈画完后由 combat 延迟结算，动画与伤害一致
        const p = Math.min(1, f.t / f.dur);
        const cx = f.x, cy = f.y, R = f.r || 120, seed = f.seed || 0;
        if (p < 0.25) {
          // 帧 1 地上画圈：双环火圈扩张 + 圈上火苗 + 地面红晕（圈=伤害范围，半径与 explode 一致）
          const k = p / 0.25;
          const r1 = 10 + k * R;
          ctx.globalAlpha = 0.5 + 0.5 * k;
          ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 3 + k * 2;
          ctx.beginPath(); ctx.arc(cx, cy, r1, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cx, cy, r1 * 0.75, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = 'rgba(255,112,67,0.35)';
          ctx.beginPath(); ctx.arc(cx, cy, r1 * 0.7, 0, Math.PI * 2); ctx.fill();
          for (let i = 0; i < 10; i++) {
            const s = ((i * 5171 + seed * 13) % 97) / 97;
            const a = s * Math.PI * 2;
            const px0 = cx + Math.cos(a) * r1 * 0.92, py0 = cy + Math.sin(a) * r1 * 0.92;
            ctx.fillStyle = i % 2 ? '#ffd24a' : '#ff7043';
            ctx.globalAlpha = 0.7 + 0.3 * k;
            ctx.beginPath(); ctx.arc(px0, py0, 2 + s * 3.5, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else if (p < 0.7) {
          // 帧 2 冲天圆柱火柱：实心柱体（深橙外柱→橙中柱→黄芯柱）+ 顶部喷涌火舌 + 上升火花
          const k = (p - 0.25) / 0.45;
          const h = 30 + k * 300;
          const w = 16 + k * R * 0.42;
          fillRoundRect(ctx, cx - w / 2, cy - h, w, h, w * 0.35, '#e74c3c');
          fillRoundRect(ctx, cx - w * 0.62 / 2, cy - h * 0.94, w * 0.62, h * 0.94, w * 0.28, '#ff7043');
          fillRoundRect(ctx, cx - w * 0.3 / 2, cy - h * 0.86, w * 0.3, h * 0.86, w * 0.16, '#ffd24a');
          const sway = Math.sin(p * 17 + seed) * 10;
          drawFlameTongue(ctx, cx, cy - h, w * 0.9, 50 + k * 30, sway, '#ff7043', 0.95);
          drawFlameTongue(ctx, cx - w * 0.25, cy - h, w * 0.55, 40 + k * 24, sway * 0.8, '#ffd24a', 0.9);
          drawFlameTongue(ctx, cx + w * 0.25, cy - h, w * 0.55, 44 + k * 26, sway * 0.8, '#ff9f43', 0.9);
          for (let i = 0; i < 6; i++) {
            const s = ((i * 6173 + seed * 9) % 89) / 89;
            const sx0 = cx + (s - 0.5) * w * 0.8;
            const sy0 = cy - h * (0.15 + s * 0.7) + Math.sin(p * 22 + i + seed) * 8;
            ctx.fillStyle = s < 0.5 ? '#ff7043' : '#ffd24a';
            ctx.globalAlpha = 0.5 + s * 0.4;
            ctx.beginPath(); ctx.arc(sx0, sy0, 2 + s * 3, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else if (p < 0.82) {
          // 帧 3 白热冲击环扩张
          const k = (p - 0.7) / 0.12;
          ctx.globalAlpha = 0.9 * (1 - k * 0.4);
          ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(cx, cy, R * 0.3 + k * R * 0.7, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1 - k * 0.6;
          ctx.fillStyle = '#fff3c4';
          ctx.beginPath(); ctx.arc(cx, cy, 20 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          // 帧 4 余烬消散
          const k = (p - 0.82) / 0.18;
          drawFlameTongue(ctx, cx, cy, 14 * (1 - k * 0.7), 40 * (1 - k * 0.8), Math.sin(p * 12 + seed) * 5, '#e74c3c', 0.7 * (1 - k));
          for (let i = 0; i < 5; i++) {
            const s = ((i * 8191 + seed * 7) % 89) / 89;
            const ex = cx + (s - 0.5) * 40;
            const ey = cy - s * k * 50 - 8;
            ctx.fillStyle = s < 0.6 ? '#ff7043' : '#ffd24a';
            ctx.globalAlpha = (1 - k) * (0.3 + s * 0.5);
            ctx.beginPath(); ctx.arc(ex, ey, 2 + s * 3, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      } else if (f.type === 'fireWall') {
        // 火焰墙（v1.16.21 烈焰墙）：长条可穿越火墙（长 w·宽 h·持续 6s），火焰上下跳动 + 地面余焰 + 上升火花
        const p = Math.min(1, f.t / f.dur);
        const cx = f.x, cy = f.y, w = f.w || 100, h = f.h || 30, seed = f.seed || 0;
        const fade = p < 0.1 ? p / 0.1 : (p > 0.85 ? (1 - p) / 0.15 : 1);
        // 地面红晕（墙体底缘）
        ctx.globalAlpha = 0.25 * fade;
        ctx.fillStyle = 'rgba(255,112,67,0.4)';
        ctx.beginPath(); ctx.ellipse(cx, cy + h / 2, w * 0.55, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        // 主火焰条：N 段竖火焰沿 x 排列，上下跳动
        const segs = Math.max(4, Math.round(w / 14));
        for (let i = 0; i < segs; i++) {
          const s = ((i * 5171 + seed * 13) % 97) / 97;
          const fx = cx - w / 2 + (i + 0.5) * (w / segs);
          const sway = Math.sin(p * 18 + i * 1.7 + seed) * 4;
          const hh = h * (0.75 + 0.35 * s) + Math.sin(p * 24 + i * 2.1) * 4;
          const col = i % 3 === 0 ? '#e74c3c' : (i % 3 === 1 ? '#ff7043' : '#ff9f43');
          ctx.globalAlpha = (0.55 + 0.3 * s) * fade;
          ctx.fillRect(fx - (w / segs) * 0.34, cy + h / 2 - hh, (w / segs) * 0.68, hh);
          drawFlameTongue(ctx, fx, cy + h / 2 - hh, (w / segs) * 0.9, 8 + 4 * s, sway, col, 0.9 * fade);
        }
        // 内部亮芯（发光跳动）
        ctx.globalAlpha = (0.35 + 0.25 * Math.sin(p * 26 + seed)) * fade;
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(cx - w * 0.32, cy + h / 2 - h * 0.55, w * 0.64, h * 0.55);
        // 上升火花
        for (let i = 0; i < 5; i++) {
          const s = ((i * 8191 + seed * 7) % 89) / 89;
          const ex = cx - w / 2 + (s - 0.2) * w * 0.9;
          const ey = cy + h / 2 - (0.2 + s * 0.8) * h * 1.4 - Math.sin(p * 22 + i * 1.3) * 6;
          ctx.fillStyle = s < 0.6 ? '#ff7043' : '#ffd24a';
          ctx.globalAlpha = (0.3 + s * 0.5) * fade;
          ctx.beginPath(); ctx.arc(ex, ey, 1.6 + s * 2.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'rain') {
        // 火雨区域标识（v1.13.14）：双环 + 半透明红晕，标注火雨覆盖圈（火雨点由独立 raindrop fx 绘制）
        const p = Math.min(1, f.t / f.dur);
        const cx = f.x, cy = f.y, R = f.r || 140, seed = f.seed || 0;
        ctx.globalAlpha = 0.22 + 0.08 * Math.sin(p * 20 + seed);
        ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.85, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,112,67,0.12)';
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.type === 'raindrop') {
        // 单颗火雨点（v1.13.14）：从上方 260px 平行圈起点垂直落向落点（0.5s），落地小爆焰（0.25s 淡出）
        // 每颗独立时间线：combat 以负 t 延迟生成时刻错峰，落地瞬间同步结算伤害
        const FALL = 0.5;
        const seed = f.seed || 0;
        const s = seed % 1;
        const br = 5 + s * 4;
        if (f.t < FALL) {
          // 下落火球：起点 (x,y) → 落点 (tx,ty)，带尾焰
          const k = Math.max(0, f.t / FALL);
          const cx = f.x + (f.tx - f.x) * k;
          const cy = f.y + (f.ty - f.y) * k;
          ctx.globalAlpha = (1 - k) * 0.5 + s * 0.3;
          ctx.fillStyle = '#ff7043';
          ctx.beginPath(); ctx.arc(cx, cy - 6 - s * 14 * (1 - k * 0.5), 2.5 + s * 3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ff7043';
          ctx.beginPath(); ctx.arc(cx, cy, br, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath(); ctx.arc(cx - br * 0.2, cy - br * 0.15, br * 0.5, 0, Math.PI * 2); ctx.fill();
        } else {
          // 落地小爆焰（淡出）
          const k = Math.min(1, (f.t - FALL) / 0.25);
          ctx.globalAlpha = 0.9 * (1 - k);
          ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(f.tx, f.ty, br * (1 + k * 1.6), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.fillStyle = s < 0.5 ? '#ff7043' : '#ffd24a';
          ctx.beginPath(); ctx.arc(f.tx, f.ty, br * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
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

  /** 三选一弹层（波末/升级强化）v5：横向三卡；入场错峰上浮 + 徽章图标 + 渐变描边 + 呼吸光晕（v1.16.7 美化） */
  pickLayer(ctx, group, pending, onPick) {
    const w = L.pickLayer.w, h = L.pickLayer.h;
    const x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    // v1.16.7 入场动效：面板淡入 + 三卡错峰上浮（首次渲染锁定时间基准）
    if (!group._pickT0) group._pickT0 = Date.now();
    const now = Date.now();
    const inT = (now - group._pickT0) / 1000;
    const inK = Math.min(1, inT / 0.28);          // 面板整体淡入
    // 遮罩（半透明，露出战场背景）
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    ctx.globalAlpha = inK;
    // 中央面板：投影厚度 + 半透明玻璃底 + 高光描边（立体感）
    fillRoundRect(ctx, x + 4, y + 6, w, h, 20, 'rgba(0,0,0,0.38)');       // 右下投影
    const panelGrad = ctx.createLinearGradient(0, y, 0, y + h);
    panelGrad.addColorStop(0, 'rgba(30,40,54,0.82)');
    panelGrad.addColorStop(0.5, 'rgba(22,30,42,0.78)');
    panelGrad.addColorStop(1, 'rgba(16,23,33,0.82)');
    fillRoundRect(ctx, x, y, w, h, 20, panelGrad);
    strokeRoundRect(ctx, x, y, w, h, 20, '#4a5462', 2);
    strokeRoundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 18, 'rgba(255,255,255,0.14)', 1);   // 内高光
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
      // v1.16.7 卡片入场：错峰上浮 + 淡入 + 轻微放大（0.05s + i*0.09s 依次浮现）
      const cd = 0.05 + i * 0.09;
      const ck = Math.min(1, Math.max(0, (inT - cd) / 0.22));
      const cOff = (1 - ck) * 34;
      const cScale = 0.92 + 0.08 * ck;
      const cAlpha = Math.max(0, Math.min(1, ck * 1.6 - 0.3));
      // v1.16.7 卡片呼吸：轻微光晕明暗脉动
      const breathe = 0.5 + 0.5 * Math.sin(now / 420 + i * 2.1);
      const cx = x + 28 + i * (cardW + gap);
      // 来源塔（升级三选一候选可能来自不同塔）：每张卡按各自来源塔独立取色（v1.10.2）
      const fromKey = ef.fromTower || tk;
      const fromName = ef.fromTower
        ? (CONFIG.COLORS[CONFIG.TOWERS[fromKey] && CONFIG.TOWERS[fromKey].color] || {}).name || fromKey
        : tName;
      const fromTint = TOWER_TINT[fromKey] || tint;
      // v1.16.7 卡片外发光（呼吸脉动；目标卡金色强呼吸）
      const glowCol = (isTarget && !upgrading) ? '#f7c948' : fromTint;
      const glowA = (isTarget && !upgrading) ? 0.16 + 0.14 * breathe : 0.08 + 0.05 * breathe;
      ctx.globalAlpha = cAlpha * glowA;
      ctx.fillStyle = glowCol;
      ctx.beginPath(); ctx.arc(cx + cardW / 2, topY + cardH / 2, cardW * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = cAlpha;
      // 卡片框：投影厚度 + 半透明玻璃底
      fillRoundRect(ctx, cx + 3, topY + 5, cardW, cardH, 16, 'rgba(0,0,0,0.32)');              // 卡片投影
      const cardGrad = ctx.createLinearGradient(0, topY, 0, topY + cardH);
      cardGrad.addColorStop(0, 'rgba(38,50,66,0.75)');
      cardGrad.addColorStop(1, 'rgba(24,33,44,0.72)');
      fillRoundRect(ctx, cx, topY, cardW, cardH, 16, cardGrad);
      // v1.16.7 渐变描边：上亮（塔色）→ 下隐（透明），替代单色描边
      const edgeGrad = ctx.createLinearGradient(0, topY, 0, topY + cardH);
      edgeGrad.addColorStop(0, fromTint);
      edgeGrad.addColorStop(0.55, fromTint + '99');
      edgeGrad.addColorStop(1, fromTint + '22');
      ctx.strokeStyle = edgeGrad; ctx.lineWidth = 2.5;
      roundRect(ctx, cx, topY, cardW, cardH, 16); ctx.stroke();
      strokeRoundRect(ctx, cx + 1.5, topY + 1.5, cardW - 3, cardH - 3, 14, 'rgba(255,255,255,0.10)', 1);  // 卡内高光
      // v1.16.7 卡片暗纹：斜向交叉细线（低透明度，打破大面积纯色）
      ctx.save();
      ctx.globalAlpha = cAlpha * 0.045;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let d = -cardH; d < cardW + cardH; d += 22) {
        ctx.moveTo(cx + d, topY + cardH); ctx.lineTo(cx + d + cardH, topY);
      }
      for (let d = -cardH; d < cardW + cardH; d += 22) {
        ctx.moveTo(cx + cardW + cardH - d, topY + cardH); ctx.lineTo(cx + cardW - d, topY);
      }
      ctx.stroke();
      ctx.restore();
      // 顶部玻璃高光条
      const hiGrad = ctx.createLinearGradient(0, topY, 0, topY + 34);
      hiGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
      hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
      fillRoundRect(ctx, cx + 4, topY + 4, cardW - 8, 34, 6, hiGrad);
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
      // 上 1/3：技能图标（v1.16.7 六边形徽章：渐变填充 + 白描边 + 旋转虚线光环 + 流光 + 等级角标）
      const iconCx = cx + cardW / 2, iconCy = topY + 118, ir = 52;
      // 旋转虚线光环（缓慢公转，提示"可选/可强化"）
      ctx.save();
      ctx.translate(iconCx, iconCy);
      ctx.rotate(now / 900 + i * 1.7);
      ctx.setLineDash([7, 9]);
      ctx.globalAlpha = cAlpha * (0.4 + 0.25 * breathe);
      ctx.strokeStyle = fromTint; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, ir + 15, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // 徽章外光晕（呼吸）
      ctx.globalAlpha = cAlpha * (0.16 + 0.12 * breathe);
      ctx.fillStyle = fromTint;
      ctx.beginPath(); ctx.arc(iconCx, iconCy, ir + 13, 0, Math.PI * 2); ctx.fill();
      // 六边形徽章体（v1.16.27：底色统一自上而下 蓝 → 完全透明白 渐变）
      ctx.globalAlpha = cAlpha;
      const hex = (cxx, cyy, rr, rot) => {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = rot + k * Math.PI / 3;
          const px = cxx + Math.cos(a) * rr, py = cyy + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };
      const grad = ctx.createLinearGradient(iconCx, iconCy - ir, iconCx, iconCy + ir);
      grad.addColorStop(0, '#4a8cff'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      hex(iconCx, iconCy, ir * cScale, Math.PI / 6);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
      ctx.stroke();
      // 徽章内玻璃高光（上半部）
      ctx.globalAlpha = cAlpha * 0.22;
      ctx.fillStyle = '#ffffff';
      hex(iconCx, iconCy - ir * 0.28 * cScale, ir * 0.72 * cScale, Math.PI / 6);
      ctx.fill();
      ctx.globalAlpha = cAlpha;
      // 徽章内流光（斜向亮带缓缓扫过）
      const streak = ((now / 1600 + i * 0.33) % 1);
      ctx.save();
      hex(iconCx, iconCy, (ir - 3) * cScale, Math.PI / 6);
      ctx.clip();
      ctx.globalAlpha = cAlpha * 0.28;
      ctx.fillStyle = '#ffffff';
      const sx0 = iconCx - ir * 2 + streak * ir * 4;
      ctx.beginPath();
      ctx.moveTo(sx0 - 14, iconCy - ir * 1.4); ctx.lineTo(sx0 + 14, iconCy - ir * 1.4);
      ctx.lineTo(sx0 - 4, iconCy + ir * 1.4); ctx.lineTo(sx0 - 32, iconCy + ir * 1.4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = cAlpha;
      // v1.16.27：技能图标 = 美术图片（88px，六边形徽章内完全居中），缺失回退 emoji
      const skImg = drawImg(ctx, skillIconSrc(ef.fromTower, ef.name), iconCx - 44, iconCy - 44, 88, 88);
      if (!skImg) text(ctx, defOf(ef.name, ef.fromTower).icon || (ef.name[0] || '?'), iconCx, iconCy + 6, 52, '#ffffff', 'center');
      // 等级角标（选择后达到的等级）
      fillRoundRect(ctx, iconCx + ir - 16, iconCy - ir + 2, 40, 40, 20, upgrading ? '#f7c948' : '#2c3542');
      strokeRoundRect(ctx, iconCx + ir - 16, iconCy - ir + 2, 40, 40, 20, 'rgba(255,255,255,0.6)', 1.5);
      text(ctx, `Lv${targetLv}`, iconCx + ir + 4, iconCy - ir + 24, 19, upgrading ? '#1a1a1a' : '#ffffff', 'center');
      // 中间：技能介绍（技能名 = 金色 40px 大字，v1.10 用户规范）
      const nameY = topY + 224;
      // v1.14 提示优化：分支卡 = 金色胶囊标签（分支名 · LvX → Y）；技能卡 = 灰胶囊「新技能」
      const tSize = 17;
      const tagTxt = upgrading
        ? `${this.branchName(defOf(ef.name, ef.fromTower), ef.branch)} · Lv${ef.branchLv} → ${ef.branchLv + 1}`
        : '新技能';
      ctx.font = `bold ${tSize}px sans-serif`;
      const tW = txtW(tagTxt, tSize) + 22;
      const tX = cx + cardW / 2 - tW / 2, tY = nameY - 42;
      if (upgrading) {
        fillRoundRect(ctx, tX, tY, tW, 30, 15, 'rgba(247,201,72,0.18)');
        strokeRoundRect(ctx, tX, tY, tW, 30, 15, '#f7c948', 1.5);
      } else {
        fillRoundRect(ctx, tX, tY, tW, 30, 15, 'rgba(142,163,184,0.16)');
        strokeRoundRect(ctx, tX, tY, tW, 30, 15, '#8ea3b8', 1.5);
      }
      text(ctx, tagTxt, cx + cardW / 2, tY + 16, tSize, upgrading ? '#f7c948' : '#8ea3b8', 'center');
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
      // 选择按钮（卡底部；v1.16.7 塔色渐变立体：投影 + 高光）
      const btnW = cardW - 28, btnH = 56, btnX = cx + 14, btnY = topY + cardH - btnH - 16;
      fillRoundRect(ctx, btnX + 2, btnY + 4, btnW, btnH, 14, 'rgba(0,0,0,0.30)');
      const btnGrad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      btnGrad.addColorStop(0, lighten(fromTint, 1.28));
      btnGrad.addColorStop(1, fromTint);
      fillRoundRect(ctx, btnX, btnY, btnW, btnH, 14, btnGrad);
      strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 14, 'rgba(255,255,255,0.30)', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      fillRoundRect(ctx, btnX + 6, btnY + 5, btnW - 12, 14, 7, ctx.fillStyle);
      text(ctx, '选择', btnX + btnW / 2, btnY + btnH / 2, 28, '#ffffff', 'center');
      onPick[i] = { hit: (px, py) => px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH };
    });
    ctx.globalAlpha = 1;
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
  /** v1.14 测试战场渲染层：状态条 + 战场（入口带/城墙/敌人/特效）+ 6 塔槽 + 刷怪控制 + 技能配置面板 */
  testFieldLayer(ctx, s, hits, enemies, fx, combat) {
    const items = [];
    const push = (id, data, x, y, w, h) => items.push({ id, data, rect: { x, y, w, h }, hit: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h });
    // 背景
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    // 状态条
    const tgrad = ctx.createLinearGradient(0, 0, 0, STATUS_H);
    tgrad.addColorStop(0, '#16233a'); tgrad.addColorStop(1, '#0d1117');
    ctx.fillStyle = tgrad; ctx.fillRect(0, 0, 750, STATUS_H);
    push('tf_back', null, 8, 6, 80, 60);
    fillRoundRect(ctx, 16, 14, 64, 44, 10, 'rgba(255,255,255,0.1)');
    text(ctx, '◀', 48, 45, 28, '#ffffff', 'center');
    text(ctx, '测试战场', 320, 34, 26, '#ffffff', 'center');
    text(ctx, '城墙无敌 · 弹药恒满 · 免三消', 375, 58, 15, '#8ea3b8', 'center');
    push('tf_speed', null, 630, 8, 112, 56);
    const spdCol = s.speed >= 4 ? '#ff8c42' : s.speed >= 2 ? '#f7c948' : '#5b6b7c';
    fillRoundRect(ctx, 636, 12, 100, 48, 10, 'rgba(0,0,0,0.35)');
    strokeRoundRect(ctx, 636, 12, 100, 48, 10, spdCol, 1.5);
    text(ctx, `⏩×${s.speed}`, 686, 43, 24, '#ffffff', 'center');
    // 行动区底
    if (!drawImg(ctx, IMG_SRC.actionArea, 0, AREA_Y + ENTRY_H, 750, WALL_Y - (AREA_Y + ENTRY_H))) {
      fillRoundRect(ctx, AREA_X, AREA_Y, AREA_W, AREA_H, 8, '#151a21');
    }
    // 入口带
    fillRoundRect(ctx, AREA_X, AREA_Y, AREA_W, ENTRY_H, 8, '#1f2732');
    text(ctx, `敌人 ${s.enemyCount} 只`, AREA_X + 16, AREA_Y + ENTRY_H / 2, 20, '#9fb2c3');
    text(ctx, '点塔位配置技能', AREA_X + AREA_W - 150, AREA_Y + ENTRY_H / 2, 17, '#7cd6a6', 'right');
    // 城墙（测试战场恒满）
    this.wall(ctx, s.lineHp, s.lineMaxHp);
    // 敌人与特效（位于战场区，不被控制条覆盖）；地面持续效果（毒池/毒棒）画在敌人下层
    if (combat) this.groundFx(ctx, combat);
    if (enemies) this.enemies(ctx, enemies);
    if (fx) this.fx(ctx, fx);
    // 塔位行：单塔出战（当前塔大槽）+ 6 塔切换钮（v1.14.1）
    const cur = (s.towers || [])[0] || null;
    if (!drawImg(ctx, IMG_SRC.towerRow, 0, TOWER_ROW_Y, 750, L.towerRow.h)) {
      fillRoundRect(ctx, AREA_X, TOWER_ROW_Y, AREA_W, L.towerRow.h, 8, 'rgba(255,255,255,0.05)');
    }
    text(ctx, '出战塔', 65, TOWER_ROW_Y + 16, 14, 'rgba(255,255,255,0.4)', 'center');
    if (cur) {
      push('tf_slot', cur.key, 15, 1053, 100, 100);
      const ix = 15 + (100 - L.towerIcon.size) / 2;
      const iy = 1053 + (100 - L.towerIcon.size) / 2;
      if (!drawImg(ctx, IMG_SRC[cur.key], ix, iy, L.towerIcon.size, L.towerIcon.size)) {
        drawTowerGlyph(ctx, cur.key, ix, iy, L.towerIcon.size);
      }
      // 等级徽章
      fillRoundRect(ctx, 15 + 100 - 16, 1053 - 6, L.towerIcon.badge, L.towerIcon.badge, 4, '#f7c948');
      text(ctx, `${cur.level}`, 15 + 100 - 8, 1053 + 2, 12, '#5c4a00', 'center');
      // 弹药竖条（槽内右侧）
      const aRatio = cur.ammoMax > 0 ? Math.min(1, (cur.ammo || 0) / cur.ammoMax) : 0;
      const bx = 15 + 100 - 9, by0 = 1053 + 8, bh = 100 - 16;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(bx, by0, 7, bh);
      ctx.fillStyle = aRatio <= 0 ? '#ff6b6b' : (aRatio < 0.34 ? '#ffb347' : '#7ef0a3');
      ctx.fillRect(bx, by0 + bh - Math.max(1, bh * aRatio), 7, Math.max(1, bh * aRatio));
      text(ctx, `${cur.ammo || 0}`, bx + 3, 1053 + 5, 10, aRatio <= 0 ? '#ff6b6b' : 'rgba(255,255,255,0.7)', 'center');
    }
    // 6 塔切换钮
    text(ctx, '更换', 158, TOWER_ROW_Y + 16, 14, 'rgba(255,255,255,0.4)', 'left');
    (s.allTowers || []).forEach((tw, i) => {
      const bx = 185 + i * 66;
      const active = cur && tw.key === cur.key;
      push('tf_switch', tw.key, bx, 1053, 56, 56);
      fillRoundRect(ctx, bx, 1053, 56, 56, 10, active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)');
      strokeRoundRect(ctx, bx, 1053, 56, 56, 10, active ? '#f7c948' : 'rgba(255,255,255,0.2)', active ? 2 : 1);
      text(ctx, tw.icon, bx + 28, 1053 + 26, 24, '#ffffff', 'center');
      text(ctx, tw.name, bx + 28, 1053 + 50, 12, active ? '#f7c948' : 'rgba(255,255,255,0.6)', 'center');
    });
    // 底部控制区
    const cY = TOWER_ROW_Y + L.towerRow.h;
    fillRoundRect(ctx, AREA_X, cY, AREA_W, LOGIC_H - cY - 16, 12, 'rgba(255,255,255,0.04)');
    text(ctx, `— 刷怪测试 · ${cur ? '出战塔：' + cur.name : ''} —`, 375, cY + 30, 20, '#9fb2c3', 'center');
    const btnW = 208, btnH = 64, btnGap = 16, bX = 44;
    const rows = [
      [['tf_spawn_n', '👾 普通×5', '#7cd6a6'], ['tf_spawn_r', '🏃 快速×5', '#f7c948'], ['tf_spawn_t', '🛡 重甲×5', '#a78bfa']],
      [['tf_spawn_e', '💀 精英×2', '#ff6b6b'], ['tf_spawn_b', '👹 Boss×1', '#ff8c42'], ['tf_clear', '🧹 清怪', '#9fb2c3']],
    ];
    rows.forEach((row, ri) => {
      row.forEach((b, bi) => {
        const bx = bX + bi * (btnW + btnGap);
        const by = cY + 46 + ri * 82;
        push(b[0], null, bx, by, btnW, btnH);
        fillRoundRect(ctx, bx, by, btnW, btnH, 12, 'rgba(255,255,255,0.06)');
        strokeRoundRect(ctx, bx, by, btnW, btnH, 12, b[2], 1.2);
        text(ctx, b[1], bx + btnW / 2, by + 38, 24, '#ffffff', 'center');
      });
    });
    text(ctx, '点上方“出战塔”配技能 · 点“更换”切塔 · 分支按钮循环 0→3', 375, cY + 216, 16, '#5b6b7c', 'center');
    // 返回主界面
    push('tf_back', null, 100, 1490, 550, 76);
    fillRoundRect(ctx, 100, 1490, 550, 76, 18, 'rgba(255,255,255,0.06)');
    strokeRoundRect(ctx, 100, 1490, 550, 76, 18, '#8ea3b8', 1.2);
    text(ctx, '← 返回主界面', 375, 1540, 28, '#8ea3b8', 'center');
    // 技能配置面板（覆盖层）
    if (s.panel && s.panel.key) this.testSkillPanel(ctx, s.panel.key, s, push);
    hits = items;
    return hits;
  }

  /** v1.14 测试战场技能配置面板：8 技能行 × (A/B/C 分支循环按钮 + 清除)，底部全激活/清空 */
  testSkillPanel(ctx, key, s, push) {
    const tower = s.towers.find((t) => t && t.key === key);
    if (!tower) return;
    const pw = 670, ph = 1160, px = (750 - pw) / 2, py = 150;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    fillRoundRect(ctx, px, py, pw, ph, 16, '#1b2230');
    strokeRoundRect(ctx, px, py, pw, ph, 16, '#3b4b5e', 1.5);
    text(ctx, `${tower.icon} ${tower.name} · 技能配置`, px + 40, py + 48, 28, '#ffffff', 'left');
    push('panel_done', null, px + pw - 152, py + 18, 72, 48);
    fillRoundRect(ctx, px + pw - 146, py + 22, 66, 40, 10, 'rgba(46,204,113,0.2)');
    strokeRoundRect(ctx, px + pw - 146, py + 22, 66, 40, 10, '#2ecc71', 1.2);
    text(ctx, '✓ 确定', px + pw - 113, py + 50, 20, '#7ef0a3', 'center');
    push('panel_close', null, px + pw - 76, py + 18, 58, 48);
    fillRoundRect(ctx, px + pw - 70, py + 22, 46, 40, 10, 'rgba(255,255,255,0.1)');
    text(ctx, '✕', px + pw - 47, py + 50, 26, '#ffffff', 'center');
    // 8 技能行
    const rowH = 108, rY0 = py + 84;
    const pool = CONFIG.EFFECT_POOLS[key] || [];
    tower.skills.forEach((sk, i) => {
      const ry = rY0 + i * rowH;
      if (i > 0) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + 24, ry - 6, pw - 48, 1); }
      fillRoundRect(ctx, px + 24, ry + 14, 52, 52, 10, sk.level > 0 ? sk.color : 'rgba(255,255,255,0.06)');
      text(ctx, sk.icon, px + 50, ry + 48, 26, sk.level > 0 ? '#ffffff' : '#8ea3b8', 'center');
      text(ctx, sk.name, px + 92, ry + 34, 22, sk.level > 0 ? '#ffffff' : '#8ea3b8', 'left');
      // v1.16.3：分支等级行用真实分支名（branchName 提取 config 文案冒号前名称），不再用 A/B/C 代号
      const cfg = pool.find((q) => q.name === sk.name) || null;
      const bn = (br) => this.branchName(cfg, br);
      const parts = [];
      ['A', 'B', 'C'].forEach((br) => {
        const lv = sk.branches[br];
        parts.push(`${bn(br)}${lv > 0 ? '·Lv' + lv : ''}`);
      });
      text(ctx, `${parts.join('  ')}${sk.level > 0 ? ' · 技能Lv' + sk.level : ' · 未激活'}`, px + 92, ry + 62, 15, sk.level > 0 ? '#7ef0a3' : '#5b6b7c', 'left');
      const bW = 96, bH = 52, bGap = 8;
      const b0 = px + pw - 24 - (bW * 4 + bGap * 3);
      [['A', '#ff6b6b'], ['B', '#f7c948'], ['C', '#7ca8ff']].forEach(([br, col], bi) => {
        const bx = b0 + bi * (bW + bGap);
        const lv = sk.branches[br];
        push('panel_branch', { name: sk.name, br }, bx, ry + 24, bW, bH);
        fillRoundRect(ctx, bx, ry + 24, bW, bH, 10, lv > 0 ? col : 'rgba(255,255,255,0.06)');
        strokeRoundRect(ctx, bx, ry + 24, bW, bH, 10, col, lv > 0 ? 1.5 : 0.8);
        // 按钮显示真实分支名（短名），激活时附 Lv
        const bTxt = `${bn(br)}${lv > 0 ? '·Lv' + lv : ''}`;
        text(ctx, bTxt, bx + bW / 2, ry + 58, bTxt.length > 4 ? 16 : 20, lv > 0 ? '#ffffff' : col, 'center');
      });
      // 清除按钮（第 4 位）
      const bx0 = b0 + 3 * (bW + bGap);
      push('panel_branch', { name: sk.name, br: 'clear' }, bx0, ry + 24, bW, bH);
      fillRoundRect(ctx, bx0, ry + 24, bW, bH, 10, 'rgba(255,255,255,0.05)');
      strokeRoundRect(ctx, bx0, ry + 24, bW, bH, 10, '#5b6b7c', 1);
      text(ctx, '清除', bx0 + bW / 2, ry + 58, 20, '#8ea3b8', 'center');
    });
    // 底部：全部激活 / 清空全部
    const by = py + ph - 66;
    push('panel_all', null, px + 40, by, 250, 48);
    fillRoundRect(ctx, px + 40, by, 250, 48, 12, 'rgba(46,204,113,0.2)');
    strokeRoundRect(ctx, px + 40, by, 250, 48, 12, '#2ecc71', 1.2);
    text(ctx, '⚡ 全部激活（各分支 Lv3）', px + 165, by + 32, 20, '#7ef0a3', 'center');
    push('panel_clear', null, px + pw - 290, by, 250, 48);
    fillRoundRect(ctx, px + pw - 290, by, 250, 48, 12, 'rgba(255,255,255,0.06)');
    strokeRoundRect(ctx, px + pw - 290, by, 250, 48, 12, '#5b6b7c', 1.2);
    text(ctx, '🧹 清空全部技能', px + pw - 165, by + 32, 20, '#8ea3b8', 'center');
  }

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
    const sx = 55, sy = 400, sw = 640, sh = 392;
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
      ['💛 金币', ''],
      ['📦 宝箱', ''],
      ['💎 圣物', ''],
    ];
    rewards.forEach((r, i) => {
      text(ctx, r[0], sx + 70 + i * 200, sy + 226, 24, '#f7c948', 'left');
      // text(ctx, r[1], sx + 70 + i * 200, sy + 264, 17, '#8ea3b8', 'left');
    });
    text(ctx, '点击选择战场（目前仅此一种）', 375, sy + sh - 40, 19, '#5a8a72', 'center');
    // 进入战斗：屏幕 2/3 处（1626×2/3 ≈ 1084）
    const ey = 850, eh = 80;
    push('enter', null, 75, ey, 600, eh);
    const bgrad = ctx.createLinearGradient(0, ey, 0, ey + eh);
    bgrad.addColorStop(0, '#2ecc71'); bgrad.addColorStop(1, '#1f8c5f');
    ctx.fillStyle = bgrad; roundRect(ctx, 100, ey, 550, eh, 22); ctx.fill();
    strokeRoundRect(ctx, 100, ey, 550, eh, 22, 'rgba(255,255,255,0.4)', 2);
    text(ctx, '⚔ 进入战斗', 375, ey + 46, 40, '#ffffff', 'center');
    // v1.14 测试战场入口（进入战斗下方）：免三消直测塔技能效果
    const ty = 940, th = 74;
    push('testfield', null, 75, ty, 600, th);
    const tgrad = ctx.createLinearGradient(0, ty, 0, ty + th);
    tgrad.addColorStop(0, '#6d5bd0'); tgrad.addColorStop(1, '#4a3aa8');
    ctx.fillStyle = tgrad; roundRect(ctx, 100, ty, 550, th, 20); ctx.fill();
    strokeRoundRect(ctx, 100, ty, 550, th, 20, 'rgba(255,255,255,0.35)', 1.5);
    text(ctx, '🧪 测试战场 · 免三消直测技能', 375, ty + 44, 32, '#ffffff', 'center');
    // 4 个宝箱槽
    for (let i = 0; i < 4; i++) {
      const bx = 40 + i * 170, by = 1050, bw = 160, bh = 140;
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
  } else if (key === 'cannon') {
    // 炮塔：圆底 + 朝上炮管
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx - r * 0.35, cy - r * 1.9, r * 0.7, r * 1.1);
    ctx.beginPath(); ctx.arc(cx, cy - r * 1.9, r * 0.38, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2); ctx.stroke();
}

module.exports = { COLOR_FILL, TOWER_TINT, IMG_SRC, BOARD_IMG, Renderer, layout, fmtNum };
