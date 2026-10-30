const Presentation = require('../config/combat-presentation.js');
const { createBattleShop } = require('./screens/battle-shop.js');
const { createMenuHeader } = require('./screens/menu-header.js');
const { createMenuShopScreen } = require('./screens/menu-shop.js');
const { createHomeScreen } = require('./screens/home.js');
const { createRelicScreen } = require('./screens/relics.js');
const { createCodexScreen } = require('./screens/codex.js');
const AccountMenuScreen = require('./screens/account-menu.js');
const FirewallFx = require('./fx/firewall.js');
const FirepillarFx = require('./fx/firepillar.js');
const { createSkillLoadout } = require('./screens/skill-loadout.js');
const { skillIcon } = require('./icons/skills.js');
const { specialBlockMark, subBlockGlyph, COLOR_FILL } = require('./icons/special-blocks.js');
const ChipSkin = require('./icons/chip-skin.js');          // v1.17.44 底板 × 图案两层查表（替换 v1.17.35 方案）
const GS_BALANCE = require('../config/global-balance.js');
/**
 * render.js —— 主界面渲染（设计稿 750×1626 逻辑坐标，定版 v7：iPhone 15 比例）
 * 分区：状态条 72 / 行动区 700×970（入口带 68、城墙 24）/ 塔位区 122 / 棋盘区 462
 */
const CONFIG = require('../config.js');
const GlobalSkills = require('../global-skills.js');
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
  fire: 'assets/images/towers/fire.png', ice: 'assets/images/towers/ice.png',
  poison: 'assets/images/towers/poison.png', electric: 'assets/images/towers/electric.png',
  boomerang: 'assets/images/towers/boomerang.png', cannon: 'assets/images/towers/cannon.png',
  enemy: 'assets/images/enemies/normal.png', boss: 'assets/images/enemies/boss.png',
  runner: 'assets/images/enemies/runner.png', tank: 'assets/images/enemies/tank.png',
  // v1.16.123 怪物按等级 5 帧循环动画 sprite sheet（透明底，每张 5 帧横向，帧宽 = 图宽/5；v1.16.124 改主包直连，量化 512×102）
  lv1: 'assets/images/enemies/lv1.png', lv2: 'assets/images/enemies/lv2.png',
  lv3: 'assets/images/enemies/lv3.png', lv4: 'assets/images/enemies/lv4.png',
  lv5: 'assets/images/enemies/lv5.png', lv6: 'assets/images/enemies/lv6.png',
  lv7: 'assets/images/enemies/lv7.png', lv8: 'assets/images/enemies/lv8.png',
  coin: 'assets/images/ui/coin.png', bullet: 'assets/images/bullet.png',
  silver: 'assets/images/ui/silver.png',   // v1.17 局内临时货币：银币（与局外金币区分）
  chestWood: 'assets/images/ui/chest_wood.png',     // v1.17 深度宝箱档位图标：木质
  chestBronze: 'assets/images/ui/chest_bronze.png', // 青铜
  chestSilver: 'assets/images/ui/chest_silver.png', // 白银
  chestGold: 'assets/images/ui/chest_gold.png',     // 黄金
  chestStar: 'assets/images/ui/chest_star.png',     // 星辉
  chestClosed: 'assets/images/ui/chest_closed.png', // v1.16.75 战场宝箱五帧动画：关闭帧（掉落显示）
  chestQuarter: 'assets/images/ui/chest_quarter.png', // 微开帧（帧2，25°箱盖微掀透金光）
  chestHalf: 'assets/images/ui/chest_half.png',      // 半开帧（帧3）
  chestFast: 'assets/images/ui/chest_fast.png',      // 快开帧（帧4，75% 大张金光迸发）
  chestOpen: 'assets/images/ui/chest_open.png',      // 全开帧（帧5，金光绽放）
  actionArea: 'assets/images/ui/action_area_edges.jpg', // 行动区背景（底版+两侧边缘灌木，750×720，y128-848）
  wall: 'assets/images/ui/wall.jpg',              // 城墙背景（750×60 主体，y967-1027；血条区 10px y1027-1037 含血量数字，底部空隙 5px）
  towerRow: 'assets/images/ui/tower_row_dark.jpg', // 塔位区背景（深色石板，750×122，y1042-1164；浅色旧版 tower_row.jpg 保留备份）
  boardBg: 'assets/images/ui/board_bg_dark_1.jpg', // 三消棋盘区背景（深蓝款，750×462，y1164-1626；浅色版 board_bg.jpg 保留备用）
  // v1.17.17 火墙技能 4 帧动画（512×160 黑底，加法混合 lighter；12fps 循环）
  firewall1: FirewallFx.ASSETS[1],
  firewall2: FirewallFx.ASSETS[2],
  firewall3: FirewallFx.ASSETS[3],
  firewall4: FirewallFx.ASSETS[4],
  // v1.17.25 火柱技能 8 帧动画（512×640 透明底；75° 俯视：圈落印→汇聚→立柱→拔高→满高→抵边→崩解→余烬）
  firepillar1: FirepillarFx.ASSETS[1],
  firepillar2: FirepillarFx.ASSETS[2],
  firepillar3: FirepillarFx.ASSETS[3],
  firepillar4: FirepillarFx.ASSETS[4],
  firepillar5: FirepillarFx.ASSETS[5],
  firepillar6: FirepillarFx.ASSETS[6],
  firepillar7: FirepillarFx.ASSETS[7],
  firepillar8: FirepillarFx.ASSETS[8],
};
/* 三消方块图片（颜色 → 棋盘素材）；加载失败/未完成时回退色块+底部暗条 */
const BOARD_IMG = {
  red: 'assets/images/board/fire.png', blue: 'assets/images/board/ice.png',
  green: 'assets/images/board/poison.png', yellow: 'assets/images/board/electric.png',
  purple: 'assets/images/board/boomerang.png', orange: 'assets/images/board/cannon.png',
};
const imgCache = {};
// v1.16.75 主菜单分页定义与主题色（页签 ↔ 页面同色呼应）
const MENU_TABS = [
  ['battle', '🏠', '主页'], ['shop', '🏪', '商店'], ['relic', '💎', '圣物'], ['codex', '📖', '塔图鉴'],  // v5.3c 主页标签换房屋图标
];
const MENU_TAB_THEME = {
  battle: { main: '#e8603c', dark: '#8c2f18', top: 'rgba(58,26,32,0.9)' },
  shop:   { main: '#e0a92f', dark: '#8a6212', top: 'rgba(51,39,15,0.9)' },
  relic:  { main: '#a86bff', dark: '#5c33a8', top: 'rgba(41,26,61,0.9)' },
  codex:  { main: '#4d8fd6', dark: '#26517e', top: 'rgba(21,42,71,0.9)' },
};
const TOWER_HEX = { red: '#ff6b6b', blue: '#5dade2', green: '#58d68d', yellow: '#f4d03f', purple: '#af7ac5', orange: '#e67e22' };
const TOWERS_COLOR = (k) => (CONFIG.TOWERS[k] || {}).color;
// 深度宝箱档位色
const TIER_COLOR = { wood: '#a4713d', bronze: '#d89e63', silver: '#c9d6e4', gold: '#f7c948', star: '#a86bff' };
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
/* v1.17.35 离屏画布（特殊方块染色合成用）：主画布已被 canvas.js 缓存，此处拿到的是离屏画布 */
function createOffscreen() {
  if (typeof wx !== 'undefined' && wx.createCanvas) {
    try { return wx.createCanvas(); } catch (e) { return null; }
  }
  if (typeof document !== 'undefined' && document.createElement) {
    try { return document.createElement('canvas'); } catch (e) { return null; }
  }
  return null;
}
ChipSkin.configure({ loadImage: loadImg });   // v1.17.44 两层方块皮肤

/* v1.16.27 技能图标（美术资源 assets/images/skillicons/<塔>/<文件名>.png，缺失时回退 emoji） */
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
  return f ? `assets/images/skillicons/${towerKey}/${f}.png` : null;
}

/** v1.16.80 hex → rgba（图鉴卡片塔色渲染用） */
function hexA(hex, a) {
  const h = (hex || '#8ea3b8').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* v1.16.74 技能帧动画（精灵表横向条带，assets/images/anims/<set>_<variant>.png） */
const ANIM_SHEETS = {
  explosion: { orange: ['assets/images/anims/anim_explosion_orange.png', 10], blue: ['assets/images/anims/anim_explosion_blue.png', 10], green: ['assets/images/anims/anim_explosion_green.png', 10] },
  fallstrike: { orange: ['assets/images/anims/anim_fallstrike_orange.png', 8], blue: ['assets/images/anims/anim_fallstrike_blue.png', 8] },
  spark: { gold: ['assets/images/anims/anim_spark_gold.png', 6] },
};
/* fx 颜色 → 帧动画变体：绿系→green、蓝系→blue、其余→orange */
function animVariantOf(color) {
  const m = /^#([0-9a-f]{6})$/i.exec(color || '');
  if (!m) return 'orange';
  const v = parseInt(m[1], 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  if (g > r && g > b) return 'green';
  if (b > r && b >= g) return 'blue';
  return 'orange';
}
/* 按进度 p(0..1) 绘制精灵表第 idx 帧，加法混合；表未加载返回 false 由调用方兜底 */
function drawAnimSheet(ctx, set, variant, x, y, size, p) {
  const conf = ANIM_SHEETS[set] && ANIM_SHEETS[set][variant];
  if (!conf) return false;
  const img = loadImg(conf[0]);
  if (!img || !img.width) return false;
  const n = conf[1];
  const idx = Math.max(0, Math.min(n - 1, Math.floor(p * n)));
  const fw = img.width / n;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(img, idx * fw, 0, fw, img.height, x - size / 2, y - size / 2, size, size);
  ctx.globalCompositeOperation = prev;
  return true;
}

/* v1.16.61 局内圣遗物图标（assets/images/relic/<塔系>/<id>.png，缺失时回退 emoji） */
function relicIconSrc(id) {
  const dir = { fire_: 'fire', ice_: 'ice', poison_: 'poison', elec_: 'electric', boo_: 'boomerang', can_: 'cannon', cm_: 'universal' };
  for (const [pre, cat] of Object.entries(dir)) {
    if (typeof id === 'string' && id.startsWith(pre)) return `assets/images/relic/${cat}/${id}.png`;
  }
  return null;
}

const STATUS_H = 140;                       // 状态条区高（v1.16.72 扩展至 y140：顶部安全区更充裕，避开灵动岛与右上小程序胶囊）
const AREA_X = L.actionArea.x;              // 25
const AREA_Y = STATUS_H;                    // 140（行动区整体下移，顶部留给金币/波次/协同）
const AREA_W = L.actionArea.w;              // 700
const AREA_H = L.actionArea.h - 68 - L.wall.h;  // 827（v1.17.11 城墙并入塔位区：行动区高度减城墙 75，塔位区整体上移，下方空间让给棋盘）
const ENTRY_H = L.entryBand.h;              // 68
const WALL_H = L.wall.h;                    // 75（城墙视觉已并入塔位区，此值仅作行动区压缩口径保留）
const WALL_BAR_H = 10;                      // 城墙血条区高度（10px，含血量数字）
const WALL_BAR_OFF = 5;                     // 血条区离城墙底部偏移
const WALL_Y = AREA_Y + AREA_H;             // 967 防线 y = 塔位区顶（v1.17.11 城墙已并入塔位区，怪物到达此线即攻城）
const TOWER_ROW_Y = WALL_Y;                 // 塔位区顶 y（967，塔位区即城墙）
const BOARD_Y = TOWER_ROW_Y + L.towerRow.h; // 棋盘区顶 y（1089）

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
    slotY: TOWER_ROW_Y + 5,                        // v1.17.11 塔槽上移（972），塔位区底部 14px 留给防线血条
  };
}

/* 文本宽度估算：汉字≈1 字宽，其余≈0.55 字宽（不依赖 ctx.measureText，测试 mock 与真实环境通用） */
function txtW(str, size) {
  let w = 0;
  for (let i = 0; i < str.length; i++) w += str.charCodeAt(i) > 255 ? size : size * 0.55;
  return w;
}

// 区C · 技能特效 handler 分发表：f.type → Renderer 方法（v1.16.43 重构，拆自原 fx()）
const FX_HANDLERS = {
  shot: 'fxShot',
  hitwall: 'fxHitwall',
  bullet: 'fxBullet',
  strikeShell: 'fxStrikeShell',
  strike: 'fxStrike',
  boom: 'fxBoom',
  flash: 'fxFlashFx',
  vine: 'fxVine',
  thorn: 'fxThorn',
  mine: 'fxMine',
  turret: 'fxTurret',
  cyclone: 'fxCyclone',
  pillar: 'fxPillar',
  fireWall: 'fxFireWall',
  rain: 'fxRain',
  raindrop: 'fxRaindrop',
  particle: 'fxParticleFx',
  ring: 'fxRingFx',
  beam: 'fxBeamFx',
  beamp: 'fxBeamp',
  match: 'fxMatch',
  floatText: 'fxFloatText',   // v1.16.113 3★ 触发确认飘字
  specialSpawn: 'fxSpecialSpawn',   // v1.17.29 特殊块生成彩环
  specialBlast: 'fxSpecialBlast',   // v1.17.29 特殊块引爆分型特效
  screenFlash: 'fxScreenFlash',     // v5.6 特殊块引爆全屏爆闪（支持 color/alpha）
  rainbowSpawn: 'fxRainbowSpawn',   // v5.6.8 五消·彩虹生成七色光柱
  scanSweep: 'fxScanSweep',         // v5.6.8 五消·自动扫描金色光幕
  recolorWave: 'fxRecolorWave',     // v5.6.8 五消·染色涟漪
  seedStar: 'fxSeedStar',           // v5.6.8 五消·随机播种星光
  rainParticle: 'fxRainParticle'    // v5.6.8 五消·彩虹全消粒子雨
};

class Renderer {
  constructor() {
    this.ly = layout();
    this._getSkillLoadout();
  }

  /* ============ 区A · UI 界面渲染（状态条/按钮/弹层/菜单/棋盘） ============ */

  /** 状态条：银币（局内临时货币）+ 波次/倒计时 + 协同 + 本局圣遗物行（v1.16.73 状态栏增加圣遗物图标行，前10个，点击查看本局详情） */
  status(ctx, s) {
    const goldIcon = 40;
    // v1.17.2 局内银币（左下安全区 18,70：整体避开灵动岛与右上小程序胶囊；局内银币跨波保留、局末折算为金币）
    if (!drawImg(ctx, IMG_SRC.silver, 18, 70, goldIcon, goldIcon)) {
      fillRoundRect(ctx, 18, 70, goldIcon, goldIcon, 10, '#c9d6e4');
      text(ctx, '¥', 38, 90, 20, '#5b6b7c', 'center');
    }
    text(ctx, fmtNum(s.gold), 72, 94, 26, '#c9d6e4');

  }

  entryStatus(ctx,s) {
    // 等级圆与经验外环：12点起顺时针；进度条下沿高于圆心。
    const cx=AREA_X+30,cy=AREA_Y+32,radius=22,outer=28;
    const xp=Math.max(0,Math.min(1,Number(s.expRatio)||0));
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle='#f7cf45';ctx.fill();
    text(ctx,String(s.expLevel||0),cx,cy,25,'#111111','center');
    ctx.beginPath();ctx.arc(cx,cy,outer,0,Math.PI*2);ctx.strokeStyle='rgba(247,207,69,0.22)';ctx.lineWidth=4;ctx.stroke();
    if(xp>0){ctx.beginPath();ctx.arc(cx,cy,outer,-Math.PI/2,-Math.PI/2+Math.PI*2*xp,false);ctx.strokeStyle='#f7cf45';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();}
    const wx=AREA_X+74,wy=AREA_Y+20,ww=AREA_W-74,wh=10;
    const wave=Math.max(1,Math.min(60,Number(s.wave)||1));
    progressBar(ctx,wx,wy,ww,wh,(wave-1)/59,'#e8c76b','rgba(255,255,255,0.12)');
    for(let n=5;n<=60;n+=5){
      const mx=wx+(n-1)/59*ww;
      const major=n===20||n===40||n===60;
      ctx.beginPath();ctx.arc(mx,wy+wh/2,major?5:2.5,0,Math.PI*2);ctx.fillStyle=n<=wave?(n===60?'#ff826f':'#f8dd8a'):'#66717e';ctx.fill();
      if(major)text(ctx,n===60?'终极60':n+'波Boss',mx,AREA_Y+7,13,n===60?'#ffab95':'#e5d7aa',n===60?'right':'center');
    }
    text(ctx,'第 '+(s.wave||1)+' / 60 波',wx,AREA_Y+7,14,'#e9dfc4','left');
    // v1.17.2 本局圣遗物行：前 10 个图标 + 总数（图标 22px、间距 28，整行更紧凑；点击区域 relicBarHit 供 main.js 弹详情）
    const rels = s.battleRelics || [];
    if (rels.length) {
      const rx = wx, ry = AREA_Y + 42, rIcon = 22, rGap = 28, rMax = 10;
      const shown = rels.slice(0, rMax);
      shown.forEach((rc, i) => {
        const icx = rx + i * rGap + rIcon / 2;
        ctx.beginPath(); ctx.arc(icx, ry + rIcon / 2, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.fill();
        ctx.strokeStyle = 'rgba(247,201,72,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
        const rSrc = relicIconSrc(rc.id);
        if (!(rSrc && drawImg(ctx, rSrc, rx + i * rGap + 1, ry + 1, rIcon - 2, rIcon - 2))) {
          text(ctx, rc.icon, icx, ry + rIcon / 2 + 2, 13, '#ffffff', 'center');
        }
        if (rc.star3) {   // v1.16.113 3★ 质变角标
          fillRoundRect(ctx, icx + 8, ry - 3, 17, 12, 6, '#ffb347');
          text(ctx, '★3', icx + 16, ry + 9, 9, '#5c3800', 'center');
        }
      });
      text(ctx, `圣物 ×${rels.length}`, rx + shown.length * rGap + 4, ry + rIcon / 2 + 3, 15, 'rgba(255,255,255,0.55)', 'left');
      this.relicBarHit = { x: rx, y: ry - 8, w: shown.length * rGap + 96, h: Math.min(rIcon + 16, AREA_Y + ENTRY_H - (ry - 8)) }; // 圣遗物行点击区
    } else {
      this.relicBarHit = null;
    }
  }

  /** 行动区底：入口带 + 敌人 + 城墙 + 塔位区 + 棋盘（按状态分层调用） */
  actionArea(ctx, s) {
    // 行动区背景图（y128 起 720 高 = 怪物行走区）；v1.16.77 按战场切换主题背景；加载失败回退深色底
    const aaSrc = (s && (s.stage === 'lava' || s.stage === 'frost' || s.stage === 'abyss'))
      ? `assets/images/ui/field_bg_${s.stage}.jpg` : IMG_SRC.actionArea;
    if (!drawImg(ctx, aaSrc, 0, AREA_Y + ENTRY_H, 750, WALL_Y - (AREA_Y + ENTRY_H))) {
      fillRoundRect(ctx, AREA_X, AREA_Y + ENTRY_H, AREA_W, WALL_Y - AREA_Y - ENTRY_H, 8, '#151a21');
    }
    this.entryStatus(ctx,s);
    if(s.miniBoss) {
      const b=s.miniBoss;
      text(ctx,b.bossName+' · '+(b.phase===1?'藤甲':'花绽狂暴'),375,AREA_Y+ENTRY_H+16,16,'#ead3ff','center');
      progressBar(ctx,220,AREA_Y+ENTRY_H+28,338,9,Math.max(0,b.hp/b.maxHp),'#ba82e7','#30253d');
      text(ctx,'藤甲 '+(b.shieldLayers||0)+'/3',375,AREA_Y+ENTRY_H+45,13,'#d1c393','center');
    }
    // 塔位区（v1.17.11 即城墙，先画背景）
    this.towerRow(ctx, s);
    // 防线血条（v1.17.11 移至塔位区底部，覆盖在塔位区背景之上）
    this.wall(ctx, s.lineHp, s.lineMaxHp, undefined, s.globalShield);
    // 棋盘（v1.17.29 传入 _shake 支持消除抖动）
    this.board(ctx, s.grid, s.selected, s.anim, s._shake, s.stage);
    // 底部功能键区（棋盘下方）
    this.funcBar(ctx, s);
    // v1.17 局内商店面板已移至 main.js render 流程的敌人/特效层之后绘制（否则怪物贴图浮在面板上方），不再在此处调用
  }

  wall(ctx, hp, maxHp, barY, shield) {
    // v1.17.11 塔位区即城墙：防线血条画在塔位区底部（塔位区整体上移，独立城墙区移除）
    // barY 可选：默认塔位区底部；测试战场传入其塔位行上方 y（保持旧防线位置）
    const barH = 14;
    const by = barY !== undefined ? barY : (TOWER_ROW_Y + L.towerRow.h - barH);
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    // 槽（深棕阴影底 + 淡描边）
    fillRoundRect(ctx, AREA_X, by, AREA_W, barH, 7, '#241a12');
    strokeRoundRect(ctx, AREA_X, by, AREA_W, barH, 7, 'rgba(255,255,255,0.18)', 1);
    // 血量填充（分级变色）
    if (ratio > 0) {
      const barCol = ratio > 0.5 ? '#4cd964' : ratio > 0.25 ? '#ffcc00' : '#ff5252';
      fillRoundRect(ctx, AREA_X + 2, by + 2, Math.max(2, (AREA_W - 4) * ratio), barH - 4, 5, barCol);
    }
    if (shield > 0) {
      fillRoundRect(ctx,AREA_X,by-8,AREA_W*Math.min(1,shield/GS_BALANCE.barrier.shield),5,2,'#86caff');
      text(ctx,'护盾 '+Math.ceil(shield),AREA_X+AREA_W-5,by-18,16,'#a6e8ff','right');
    }
    // 血量数字（血条内居中）
    text(ctx, `${Math.max(0, Math.ceil(hp))}`, AREA_X + AREA_W / 2, by + barH / 2 + 1, 15, '#ffffff', 'center');
  }

  /** 底部功能键区（三消棋盘下方）：设置 / 帮助（v1.16.30 移除加速键；v1.16.77 移除塔图鉴弹层与商店占位弹层，图鉴移入主界面 codex 页签） */
  funcBar(ctx, s) {
    const fy = BOARD_Y + L.boardArea.h;           // 1524
    const h = L.funcBar.h;                        // 102
    fillRoundRect(ctx, 0, fy, 750, h, 0, '#131820');
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, fy, 750, 2);
    // v1.16.89 底部功能条三键：设置 / 帮助 / 商店（商店改入分页栏，点击弹出面板）
    const labels = ['⚙ 设置', 'ℹ 帮助', '🛒 商店'];
    const keys = ['setting', 'help', 'shop'];
    const kw = 150, kh = 80;
    const gap = (750 - labels.length * kw) / (labels.length + 1);
    this.funcHits = [];
    for (let i = 0; i < labels.length; i++) {
      const x = gap + i * (kw + gap);
      const y = fy + (h - kh) / 2;
      // v1.16.30 美化：渐变玻璃底 + 顶部高光 + 白描边 + 图标/文字两行
      const bgrad = ctx.createLinearGradient(0, y, 0, y + kh);
      bgrad.addColorStop(0, '#2a3342'); bgrad.addColorStop(1, '#1b222e');
      fillRoundRect(ctx, x + 2, y + 3, kw, kh, 14, 'rgba(0,0,0,0.28)');
      fillRoundRect(ctx, x, y, kw, kh, 14, bgrad);
      strokeRoundRect(ctx, x, y, kw, kh, 14, 'rgba(255,255,255,0.16)', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      fillRoundRect(ctx, x + 6, y + 4, kw - 12, 16, 8, ctx.fillStyle);
      text(ctx, labels[i].split(' ')[0], x + kw / 2, y + 42, 26, '#d7dee6', 'center');
      text(ctx, labels[i].split(' ')[1], x + kw / 2, y + 66, 17, '#8ea3b8', 'center');
      this.funcHits.push({ key: keys[i], hit: (px, py) => px >= x && px <= x + kw && py >= y && py <= y + kh });
    }
    // v1.16.30 加速按钮：城墙上方 · 怪物移动区右下角
    // v1.16.48 去底色/描边/阴影/辅助文字：仅保留 ⏩ 图标 + ×N 倍数（颜色随档位：×1 暗灰 / ×2 金 / ×3+ 橙）
    const spX = 750 - 16 - 124, spY = WALL_Y - 8 - 66, spW = 124, spH = 66;
    const spdCol = s.runSpeed >= 4 ? '#ff8c42' : s.runSpeed >= 2 ? '#f7c948' : '#3a4552';
    this._speedBadge(ctx,spX,spY,spW,spH,s.runSpeed||1);
    this.speedHit = { hit: (px, py) => px >= spX && px <= spX + spW && py >= spY && py <= spY + spH };
  }

  /** v1.16.89 局内商店：按钮移入底部功能条，此处仅渲染弹出面板（战斗不暂停） */
  battleShop(ctx, s) {
    if (!this._battleShopScreen) this._battleShopScreen = createBattleShop({ drawImg, IMG_SRC, fmtNum });
    const rects = this._battleShopScreen.battleShop(ctx, s);
    if (rects) Object.assign(this, rects);
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
    // v1.16.62 三技能卡横向一排（面板回到适中高度）：卡片 205×320 ×3，元素整体小于竖排版
    const w = 688, hgt = 880, x = (750 - w) / 2, y = (LOGIC_H - hgt) / 2;
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
    // 标题：塔名 + 塔自身等级（v1.16.70 下移至 y+64，上方留白更多）
    text(ctx, `${String(info.name || '').replace(/（[^）]*）|\([^)]*\)/g, '').replace(/塔+$/, '塔')} · 等级 Lv.${info.level}`, x + w / 2, y + 64, 34, '#ffffff', 'center');
    // 攻击 / 攻击间隔 / DPS / 弹药（v1.16.70：外框 648×200 边框 5px；标题标签 17 号下沿贴胶囊上沿；数值 29 号；图标 29 号同强调色）
    const statW = 300, statH = 56, colGap = 20, rowGap = 26;
    const sx0 = x + (w - (statW * 2 + colGap)) / 2;
    // 整体外框：包裹 4 胶囊 + 外部标签（框中心对齐标题下沿与分隔线区间中心）
    const boxX = sx0 - 14, boxY = y + 96, boxW = 648, boxH = 200;
    const bgrad = ctx.createLinearGradient(0, boxY, 0, boxY + boxH);
    bgrad.addColorStop(0, 'rgba(255,255,255,0.06)'); bgrad.addColorStop(1, 'rgba(255,255,255,0.015)');
    fillRoundRect(ctx, boxX, boxY, boxW, boxH, 14, bgrad);
    strokeRoundRect(ctx, boxX, boxY, boxW, boxH, 14, `${TOWER_TINT[info.key] || '#3d4553'}44`, 5);
    ctx.globalAlpha = 0.4;
    fillRoundRect(ctx, boxX + 6, boxY + 5, boxW - 12, 14, 7, 'rgba(255,255,255,0.08)');
    ctx.globalAlpha = 1;
    const stats = [
      { label: '攻击', icon: '⚔', val: `${info.atk || 0}`, color: '#f7c948' },
      { label: '间隔', icon: '⏱', val: `${(info.interval || 0).toFixed(1)}s`, color: '#9fb2c3' },
      { label: 'DPS', icon: '🏹', val: `${Math.round(info.dps)}`, color: '#7ea8d8' },
      { label: '能量', icon: '⚡', val: `${Math.floor(info.ammo || 0)}`, color: '#7ef0a3' },
    ];
    stats.forEach((s, si) => {
      const row = Math.floor(si / 2);
      const sx = sx0 + (si % 2) * (statW + colGap);
      const sy = row === 0 ? y + 130 : y + 212;       // 胶囊顶（行距 26：行 1 底 186 与行 2 标签 204 不重叠）
      // 标签：胶囊外部左上方，纯文字无底色（18 号，文字下沿贴齐胶囊上沿：中心 = capTop - 9）
      text(ctx, s.label, sx, row === 0 ? y + 121 : y + 203, 18, s.color, 'left');
      // 胶囊底：浅色玻璃渐变（v1.16.71 内部提亮）+ 塔色描边
      const sg = ctx.createLinearGradient(0, sy, 0, sy + statH);
      sg.addColorStop(0, 'rgba(255,255,255,0.22)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.12)'); sg.addColorStop(1, 'rgba(255,255,255,0.06)');
      fillRoundRect(ctx, sx, sy, statW, statH, statH / 2, sg);
      strokeRoundRect(ctx, sx, sy, statW, statH, statH / 2, `${TOWER_TINT[info.key] || '#3d4553'}99`, 2);
      // 顶部内高光（加亮）
      ctx.globalAlpha = 0.7;
      fillRoundRect(ctx, sx + 8, sy + 4, statW - 16, statH / 2 - 4, (statH / 2 - 4) / 2, 'rgba(255,255,255,0.14)');
      ctx.globalAlpha = 1;
      // 底部暗影（立体感）
      ctx.globalAlpha = 0.25;
      fillRoundRect(ctx, sx + 10, sy + statH - 10, statW - 20, 6, 3, 'rgba(0,0,0,0.25)');
      ctx.globalAlpha = 1;
      // 小图标：胶囊左内侧（垂直居中，与数值同字号、同标签色；弹药为自定义子弹图形）
      if (s.icon === 'bullet') {
        const ix = sx + 26, iy = sy + statH / 2;
        ctx.save(); ctx.translate(ix, iy);
        ctx.fillStyle = 'rgba(222,230,240,0.92)';                       // 弹壳
        fillRoundRect(ctx, -16, -7, 20, 14, 3);
        ctx.fillStyle = s.color;                                        // 弹头（塔色）
        ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(16, 0); ctx.lineTo(4, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd34d';                                      // 金色底火带
        ctx.fillRect(-16, -3, 20, 6);
        ctx.restore();
      } else {
        text(ctx, s.icon, sx + 26, sy + statH / 2, 29, s.color, 'center');
      }
      // 数值：居中大号 + 同色光晕
      ctx.shadowColor = s.color; ctx.shadowBlur = 10;
      text(ctx, s.val, sx + statW / 2 + 10, sy + statH / 2 - 1, 29, s.color, 'center');
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    });
    // 分隔线
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 40, y + 310, w - 80, 2);
    // 技能标题 + 提示
    text(ctx, '技能', x + 40, y + 340, 22, '#b8c2cc', 'left');
    text(ctx, '点击技能卡查看详情与升级分支', x + w - 40, y + 340, 14, 'rgba(255,255,255,0.4)', 'right');
    const skills = info.skills || [];
    if (!skills.length) {
      text(ctx, '暂无技能，通过升级三选一获取', x + w / 2, y + 290, 20, 'rgba(255,255,255,0.45)', 'center');
    } else {
      // v1.16.62：3 张技能卡横向一排（宽 205 × 高 320，间隔 16），卡内元素对应缩小：
      //   图标圆 ir 40→30 / 素材 70→52px，技能名 32→26 号，Lv 徽章 38→30 高 22→18 号，
      //   分支徽章 80×68→60×50、字号 18/15→13/12
      const cardW = 205, cardH = 320, gap = 16, cardTop = y + 368;
      const pool = CONFIG.EFFECT_POOLS[info.key] || [];
      const maxLv = 1 + ((CONFIG.EFFECT && CONFIG.EFFECT.maxLevel) || 3); // 分支满 3 级 → 技能 Lv4 = LvMAX
      skills.forEach((sk, i) => {
        const cx = x + 22 + i * (cardW + gap), cy = cardTop;
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
        // 图标（v1.16.63 美化：外圈光晕 + 径向渐变圆底 + 白描边 + 顶部高光；美术素材优先，缺失回退 emoji）
        const skDef = pool.find((q) => q.name === sk.name) || {};
        const icx = cx + cardW / 2, icy = cy + 64, ir = 32;
        const tint = TOWER_TINT[info.key] || '#3a6ea5';
        const halo = ctx.createRadialGradient(icx, icy, 2, icx, icy, ir * 1.9);
        halo.addColorStop(0, lighten(tint, 1.5)); halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo; ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(icx, icy, ir * 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        const grad = ctx.createRadialGradient(icx - ir * 0.3, icy - ir * 0.4, ir * 0.15, icx, icy, ir);
        grad.addColorStop(0, lighten(tint, 1.55)); grad.addColorStop(0.75, lighten(tint, 1.15)); grad.addColorStop(1, tint);
        ctx.beginPath(); ctx.arc(icx, icy, ir, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(icx, icy, ir, 0, Math.PI * 2); ctx.stroke();
        // 顶部高光（小半月）
        ctx.save();
        ctx.beginPath();
        ctx.arc(icx, icy, ir * 0.9, Math.PI * 1.06, Math.PI * 1.52);
        ctx.arc(icx, icy, ir * 0.62, Math.PI * 1.52, Math.PI * 1.06, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.fill();
        ctx.restore();
        const skIconOk = drawImg(ctx, skillIconSrc(info.key, sk.name), icx - 28, icy - 28, 56, 56);
        if (!skIconOk) {
          ctx.globalAlpha = 0.35; text(ctx, skDef.icon || (sk.name[0] || '?'), icx + 1, icy + 4, 27, '#000', 'center');
          ctx.globalAlpha = 1;
          text(ctx, skDef.icon || (sk.name[0] || '?'), icx, icy + 3, 27, '#ffffff', 'center');
        }
        // 技能名 + 总等级标（v1.16.64：角标移到图标右上方）
        text(ctx, sk.name, cx + cardW / 2, cy + 126, 26, '#ffffff', 'center');
        const maxBr = Math.max(sk.branches.A || 0, sk.branches.B || 0, sk.branches.C || 0);
        const lvTxt = (1 + maxBr) >= maxLv ? 'LvMAX' : `Lv${1 + maxBr}`;
        const lvS = lvTxt === 'LvMAX' ? 11 : 12;
        const lvW3 = txtW(lvTxt, lvS) + 14, lvX3 = icx + ir - 14, lvY3 = icy - ir - 10;
        const lvG3 = ctx.createLinearGradient(lvX3, lvY3, lvX3, lvY3 + 22);
        lvG3.addColorStop(0, '#ffe08a'); lvG3.addColorStop(1, '#e6b93f');
        fillRoundRect(ctx, lvX3, lvY3, lvW3, 22, 11, lvG3);
        strokeRoundRect(ctx, lvX3, lvY3, lvW3, 22, 11, 'rgba(255,255,255,0.7)', 1);
        text(ctx, lvTxt, lvX3 + lvW3 / 2, lvY3 + 11, lvS, '#5c4a00', 'center');
        // 技能分支 + 等级（v1.16.64：单分支——只显示等级最高的当前分支；金色渐变行 + 左侧色条 + 进度点 + Lv 胶囊）
        const bW = 176, bX = cx + (cardW - bW) / 2, bY = cy + 160, bH = 76;
        const activeBrs = ['A', 'B', 'C'].filter((br) => (sk.branches[br] || 0) > 0);
        if (activeBrs.length) {
          const br = activeBrs.reduce((p, c) => ((sk.branches[c] || 0) > (sk.branches[p] || 0) ? c : p));
          const l = sk.branches[br] || 0;
          const bg = ctx.createLinearGradient(bX, bY, bX, bY + bH);
          bg.addColorStop(0, 'rgba(247,201,72,0.24)'); bg.addColorStop(1, 'rgba(247,201,72,0.07)');
          fillRoundRect(ctx, bX, bY, bW, bH, 12, bg);
          strokeRoundRect(ctx, bX, bY, bW, bH, 12, 'rgba(247,201,72,0.8)', 1.5);
          fillRoundRect(ctx, bX + 8, bY + 12, 5, bH - 24, 2.5, '#f7c948');
          text(ctx, this.branchName(skDef, br), bX + 24, bY + 28, 16, '#f7c948', 'left');
          for (let pi = 0; pi < 3; pi++) {
            const px = bX + 26 + pi * 16, py = bY + 54;
            ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = pi < l ? '#f7c948' : 'rgba(247,201,72,0.22)'; ctx.fill();
          }
          const lvW2 = txtW(`Lv${l}`, 13) + 16, lvX = bX + bW - 10 - lvW2;
          fillRoundRect(ctx, lvX, bY + 14, lvW2, 30, 15, '#f7c948');
          text(ctx, `Lv${l}`, lvX + lvW2 / 2, bY + 29, 13, '#5c4a00', 'center');
        } else {
          text(ctx, '未选分支', cx + cardW / 2, bY + bH / 2 + 2, 14, 'rgba(255,255,255,0.35)', 'center');
        }
        // 右下角"详情 ›"提示（可点击）
        text(ctx, '详情 ›', cx + cardW - 14, cy + cardH - 16, 15, 'rgba(255,255,255,0.45)', 'right');
      });
    }
    // 关闭按钮
    hits.close = button(ctx, x + 150, y + hgt - 84, w - 300, 56, '关闭', { bg: '#3a6ea5', fontSize: 26 });
  }

  /** v1.16.11 技能二级详情面板：点击技能卡打开——技能效果 + 三个分支的详细效果与当前等级（v1.16.30 美化+描述放大两号） */
  towerSkillLayer(ctx, info, hits) {
    const w = 688, hgt = 720, x = (750 - w) / 2, y = (LOGIC_H - hgt) / 2;
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
    // 标题：技能图标（v1.16.30 美术图）+ 技能名 + Lv
    const tIcon = drawImg(ctx, skillIconSrc(info.towerKey, info.skillName), x + w / 2 - 92, y + 24, 44, 44);
    if (!tIcon) text(ctx, info.icon || '⚔', x + w / 2 - 70, y + 52, 34, '#ffffff', 'center');
    text(ctx, `${info.skillName}`, x + w / 2 + 6, y + 52, 34, '#ffffff', 'center');
    const lvTxt = info.lvMax ? 'LvMAX' : `Lv${info.lv}`;
    const lvW = txtW(lvTxt, 15) + 18;
    fillRoundRect(ctx, x + w / 2 + 92, y + 28, lvW, 24, 12, '#f7c948');
    text(ctx, lvTxt, x + w / 2 + 92 + lvW / 2, y + 41, 15, '#5c4a00', 'center');
    // 技能效果说明（v1.16.30：字号 20→24 并加塔色描边；v1.16.31 改为自动换行最多 2 行，避免超框）
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    fillRoundRect(ctx, x + 40, y + 84, w - 80, 92, 12, 'rgba(255,255,255,0.07)');
    strokeRoundRect(ctx, x + 40, y + 84, w - 80, 92, 12, info.color || '#a55eea', 1);
    const descLines = this.wrapText(ctx, info.desc || '暂无描述', w - 80 - 40, 24).slice(0, 2);
    descLines.forEach((ln, li) => {
      text(ctx, ln, x + w / 2, y + 118 + li * 32, 24, '#e8ecf2', 'center');
    });
    // 分隔 + 分支标题
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 40, y + 196, w - 80, 2);
    text(ctx, '升级分支', x + 40, y + 226, 22, '#b8c2cc', 'left');
    // 三个分支横排卡片：分支名 / 效果文案 / 当前等级（v1.16.47：面板加高、字号放大、卡片美化；v1.16.54：卡内图标/分支名/等级徽章再放大 50%）
    const cardW = 196, cardH = 360, gap = 16, cardTop = y + 268;
    const brs = ['A', 'B', 'C'];
    const names = { A: info.bA || '分支A', B: info.bB || '分支B', C: info.bC || '分支C' };
    brs.forEach((br, i) => {
      const cx = x + 28 + i * (cardW + gap), cy = cardTop;
      const lv = (info.branches && info.branches[br]) || 0;
      const isAct = lv > 0;
      // 卡片底色（激活：暗金渐变；未激活：深色冷灰）
      const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
      cardGrad.addColorStop(0, isAct ? 'rgba(247,201,72,0.16)' : 'rgba(255,255,255,0.06)');
      cardGrad.addColorStop(1, isAct ? 'rgba(247,201,72,0.04)' : 'rgba(24,28,38,0.96)');
      fillRoundRect(ctx, cx, cy, cardW, cardH, 14, cardGrad);
      strokeRoundRect(ctx, cx, cy, cardW, cardH, 14, isAct ? '#f7c948' : 'rgba(255,255,255,0.18)', isAct ? 2.5 : 1.5);
      // 顶部高光条（塔色细线，激活分支金色更亮）
      ctx.fillStyle = isAct ? '#f7c948' : (info.color || '#a55eea');
      ctx.globalAlpha = isAct ? 0.85 : 0.5;
      ctx.fillRect(cx + 16, cy + 6, cardW - 32, 3);
      ctx.globalAlpha = 1;
      // 分支字母圆徽（v1.16.54 放大 50%：r 17→26、字母 18→27）
      ctx.fillStyle = isAct ? '#f7c948' : 'rgba(255,255,255,0.24)';
      ctx.beginPath(); ctx.arc(cx + 40, cy + 48, 26, 0, Math.PI * 2); ctx.fill();
      text(ctx, br, cx + 40, cy + 49, 27, isAct ? '#5c4a00' : '#cfd6df', 'center');
      // 分支名（v1.16.54 放大 50%：20→30 号）
      text(ctx, names[br], cx + cardW / 2, cy + 100, 30, isAct ? '#ffd98a' : '#e8ecf2', 'center');
      // 等级徽章（未选显示"未解锁"）（v1.16.54 放大：46×22→66×32、文字 15→21）
      if (isAct) {
        const bw2 = 66, bh2 = 32;
        fillRoundRect(ctx, cx + cardW - 88, cy + 16, bw2, bh2, 16, '#f7c948');
        text(ctx, `Lv${lv}`, cx + cardW - 55, cy + 31, 21, '#5c4a00', 'center');
      } else {
        text(ctx, '未解锁', cx + cardW - 60, cy + 31, 21, 'rgba(255,255,255,0.40)', 'right');
      }
      // 分隔线
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(cx + 14, cy + 118, cardW - 28, 2);
      // 分支效果文案（v1.16.47：20→24 号、行距 28→34、最多 6 行，激活分支金色高亮）
      const txt = info.branchDesc[br] || names[br];
      const lines = this.wrapText(ctx, txt, cardW - 18, 24);
      lines.slice(0, 6).forEach((ln, li) => {
        text(ctx, ln, cx + cardW / 2, cy + 146 + li * 34, 24, isAct ? '#f1e6b8' : '#c6d0da', 'center');
      });
    });
    // 返回按钮（回到塔详情）
    hits.back = button(ctx, x + 150, y + hgt - 74, w - 300, 54, '返回', { bg: info.color || '#a55eea', fontSize: 24 });
  }

  /** 文本自动换行（中文按宽度断行，供分支详情卡片使用） */
  wrapText(ctx, str, maxW, size) {
    const lines = [];
    if (!str) return [''];
    const font = ctx.font || '';
    ctx.font = `bold ${size}px sans-serif`;
    let cur = '';
    const tokens = [];
    const closing = /[，。！？；：、,.!?;:）】》」』”’％%]/u;
    const opening = /[（【《「『“‘]/u;
    let prefix = '';
    for (const ch of String(str)) {
      if (opening.test(ch)) { prefix += ch; continue; }
      if (closing.test(ch) && tokens.length && !prefix) tokens[tokens.length - 1] += ch;
      else { tokens.push(prefix + ch); prefix = ''; }
    }
    if (prefix) tokens.push(prefix);
    for (const token of tokens) {
      if (token === '\n') { lines.push(cur); cur = ''; continue; }
      const next = cur + token;
      if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = token; }
      else cur = next;
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
    // v1.17.10e：2 个全局技能 + N 个塔槽按当前顺序（左洗牌 → 塔槽×N → 右补给）x 轴等间距（slotGap）居中排列
    const showG = showGlobal !== false;
    const itemN = showG ? slotCount + 2 : slotCount;
    const totalX = itemN * slotSize + (itemN - 1) * slotGap;
    const x0 = (750 - totalX) / 2;
    let x = x0 + (showG ? slotSize + slotGap : 0);
    for (let i = 0; i < slotCount; i++) {
      const tw = towers[i] || null;
      // v1.17.45 槽体完全透明（无底色）；空槽 = 半透明灰色蒙版（无文字提示）
      if (!tw) {
        fillRoundRect(ctx, x, slotY, slotSize, slotSize, 8, 'rgba(140,150,160,0.28)');
      } else {
        // 塔图标（32×32 居中，图片优先，回退自绘几何图形——emoji 在部分 canvas 环境不渲染）
        const ix = x + (slotSize - L.towerIcon.size) / 2;
        const iy = slotY + (slotSize - L.towerIcon.size) / 2 - 2;
        if (!drawImg(ctx, IMG_SRC[tw.key], ix, iy, L.towerIcon.size, L.towerIcon.size)) {
          drawTowerGlyph(ctx, tw.key, ix, iy, L.towerIcon.size);
        }
        // v1.17.45：去掉槽底 Lv 文字；等级由弹药柱条 + 塔本体表现
        // v1.13.1 弹药条：图标右侧纵向柱状（自下而上填充，ammo/ammoMax），无弹药红色警示
        const aRatio = tw.ammoMax > 0 ? Math.min(1, (tw.ammo || 0) / tw.ammoMax) : 0;
        const bx = x + slotSize - 9;              // 槽内右侧竖条
        const by0 = slotY + 8;
        const bh = slotSize - 16;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx, by0, 7, bh);
        ctx.fillStyle = aRatio <= 0 ? '#ff6b6b' : (aRatio < 0.34 ? '#ffb347' : '#7ef0a3');
        ctx.fillRect(bx, by0 + bh - Math.max(1, bh * aRatio), 7, Math.max(1, bh * aRatio));
        // v1.8：移除单塔经验条（经验整体化，经验条在出怪区上方）
      }
      x += slotSize + slotGap;
    }
    // v1.17.10e 全局技能充能条：与塔槽同尺寸（100×100）、与塔同 y，与 4 塔槽按 x 轴等间距（slotGap）居中
    //   左=全局洗牌，右=弹药补给；累计充能每 chargePerUse 点 = 1 格（横向 3 段，上限 3 格）
    // v1.14 测试战场（showGlobal=false）不渲染全局技能按钮
    if (showG) {
      const sz = this.ly.slotSize;
      const perUse = Math.max(1, s.chargePerUse || 30);
      const shuCells = Math.min(3, ((s.shuffleAmmo || 0) / perUse));
      const refCells = Math.min(3, ((s.refillAmmo || 0) / perUse));
      this._equippedGlobalSlots = s.globalSlots || ['shuffle','refill'];
      this.globalBtns = [
        this._globalBtn(ctx, 'shuffle', '', (GlobalSkills.get((s.globalSlots||['shuffle','refill'])[0])||{}).name||'洗牌', x0, this.ly.slotY, sz, sz, shuCells, '#ff8c42'),
        this._globalBtn(ctx, 'refill', '', (GlobalSkills.get((s.globalSlots||['shuffle','refill'])[1])||{}).name||'补给', x0 + (slotCount + 1) * (slotSize + slotGap), this.ly.slotY, sz, sz, refCells, '#7ef0a3'),
      ];
    } else {
      this.globalBtns = [];
    }
  }

  /** 全局技能充能条绘制：未充能无背景色（仅淡描边）；充能 ≥1 格激活后，背景替换为技能主题色；
   *  图标/名称 + 横向 3 段充能（每段 = 1 次释放）+ N/3 次数；返回命中矩形 {key,x,y,w,h}（v1.17.10 与塔槽同尺寸同 y） */
  _globalBtn(ctx, key, icon, name, bx, by, bw, bh, filled, tint) {
    const maxCells = 3;
    const ready = filled >= 1;
    // v1.17.45：不再用整体半透明压暗；未充能改为图标上覆盖半透明灰蒙版（图标本体不透明）
    // 背景：未充能 = 无背景色；已充能 = 主题色渐变背景（替换底色）
    if (ready) {
      const bg = ctx.createLinearGradient(0, by, 0, by + bh);
      bg.addColorStop(0, tint + '66');
      bg.addColorStop(1, tint + '30');
      roundRect(ctx, bx, by, bw, bh, 8);
      ctx.fillStyle = bg; ctx.fill();
    }
    ctx.strokeStyle = ready ? tint : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = ready ? 2.5 : 1.5;
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.stroke();
    const skillId=(this._equippedGlobalSlots||['shuffle','refill'])[key==='shuffle'?0:1];
    // 图标缩小20%，顶部对齐；胶囊居中于图标下沿与槽位下沿之间
    const iconSz = Math.min(bw, bh) * 0.8;
    this._skillIcon(ctx,skillId,bx+bw/2,by+iconSz/2,iconSz,(GlobalSkills.get(skillId)||{}).color||tint);
    // 横向 3 段充能条（从左到右；每段满 = 1 次释放）
    const segW = 24, segH = 12, segGap = 8;
    const sx0 = bx + (bw - (maxCells * segW + (maxCells - 1) * segGap)) / 2;
    const iconBottom = by + iconSz;
    const sy0 = (iconBottom + by + bh) / 2 - segH / 2;
    for (let i = 0; i < maxCells; i++) {
      const sx = sx0 + i * (segW + segGap);
      const progress=Math.max(0,Math.min(1,filled-i));
      fillRoundRect(ctx,sx,sy0,segW,segH,6,'#253039');
      if(progress>0)fillRoundRect(ctx,sx,sy0,segW*progress,segH,Math.min(6,segW*progress/2),progress>=1?'#62df97':'#f4cd52');
      strokeRoundRect(ctx,sx,sy0,segW,segH,6,progress>=1?'#b0f3cc':'#8f814a',1);
    }

    ctx.globalAlpha = 1;
    return { key, x: bx, y: by, w: bw, h: bh };
  }

  _speedBadge(ctx,x,y,w,h,speed) {
    const accent=speed>1?'#f5ce73':'#99c8d5';
    ctx.save();ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';
    for(let i=0;i<2;i++){const cx=x+w/2-24+i*10,cy=y+h/2;ctx.beginPath();ctx.moveTo(cx-4,cy-7);ctx.lineTo(cx+3,cy);ctx.lineTo(cx-4,cy+7);ctx.stroke();}
    ctx.restore();text(ctx,'×'+speed,x+w/2+18,y+h/2,22,accent,'center');
  }

  board(ctx, grid, selected, anim, shake, theme) {
    ChipSkin.preload();   // v1.17.44 底板+图案 61 张贴图一次性预载（包内文件）
    const { boardX, boardY, cell, boardRows, boardCols } = this.ly;
    // v1.17.29 棋盘抖动：消除震动时整体随机微移（随进度渐弱）
    let shP = -1;
    if (shake && shake.t) {
      shP = (Date.now() - shake.t) / shake.dur;
      if (shP < 1) ctx.save();
    }
    if (shP >= 0 && shP < 1) {
      const amp = shake.amp * (1 - shP);
      ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
    }
    // 三消棋盘区背景图（浅色魔法石台）；加载失败回退深色底板
    if (!drawImg(ctx, IMG_SRC.boardBg, 0, boardY, 750, L.boardArea.h)) {
      fillRoundRect(ctx, boardX - 6, boardY - 6, boardCols * cell + 12, boardRows * cell + 12, 10, '#1a2028');
    }

    /* 阶段 1：交换动画——两个方块从各自旧位置滑向新位置，其余方块原位不动 */
    if(anim&&anim.phase==='scan') {
      const plan=anim.scan,base=(plan.scanBase||anim.base).map(row=>row.slice()),moving=[];
      for(const sw of plan.scanSwaps||[]) {
        const t=Math.max(0,Math.min(1,(anim.progress-(sw.column/boardCols))/0.08));
        if(t>=1){const [r,c]=sw.from,[rr,cc]=sw.to,v=base[r][c];base[r][c]=base[rr][cc];base[rr][cc]=v;}
        else if(t>0)moving.push({...sw,t});
      }
      for(let r=0;r<boardRows;r++)for(let c=0;c<boardCols;c++){
        let rr=r,cc=c;
        for(const sw of moving){if(sw.from[0]===r&&sw.from[1]===c){rr=r+(sw.to[0]-r)*sw.t;cc=c+(sw.to[1]-c)*sw.t;}else if(sw.to[0]===r&&sw.to[1]===c){rr=r+(sw.from[0]-r)*sw.t;cc=c+(sw.from[1]-c)*sw.t;}}
        if(base[r][c])this.drawCell(ctx,boardX+cc*cell+2,boardY+rr*cell+2,cell,base[r][c],r,c,selected);
      }
      const front=boardX+Math.min(1,anim.progress)*boardCols*cell;
      const beam=ctx.createLinearGradient(front-22,0,front+10,0);beam.addColorStop(0,'rgba(255,255,255,0)');beam.addColorStop(0.7,'rgba(255,255,255,0.6)');beam.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=beam;ctx.fillRect(Math.max(boardX,front-22),boardY,Math.min(32,boardX+boardCols*cell-Math.max(boardX,front-22)),boardRows*cell);
      ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(front,boardY);ctx.lineTo(front,boardY+boardRows*cell);ctx.stroke();
      if(shP>=0&&shP<1)ctx.restore();return;
    }
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
      if (shP >= 0 && shP < 1) ctx.restore();
      return;
    }

    /* 阶段 2：消除（0.5s 串行段）→ 下落（0.4s 串行段）——v5.6.3 拆分为两段：消除格在 clear 段全程淡出缩小，下落补位在 fall 段匀速滑落 */
    const g0 = (anim && (anim.base || anim.swapGrid)) ? (anim.base || anim.swapGrid) : grid; // 本级下落前棋盘
    const g1 = (anim && anim.final) ? anim.final : grid;                                    // 本级下落后棋盘
    if (anim && anim.phase === 'clear') {
      const fade = Math.min(1, anim.progress);   // v5.6.3 消除段 0.5s 全程淡出（原 progress/0.35）
      if (fade < 1) {
        for (let r = 0; r < boardRows; r++) {
          for (let c = 0; c < boardCols; c++) {
            if (!anim.cleared.has(r + ',' + c)) continue;
            const color = g0[r][c];
            if (!color) continue;
            const cBase = (typeof color === 'object') ? (color.c || null) : color;   // v5.2 特殊块
            const x = boardX + c * cell + 2, y = boardY + r * cell + 2;
            const sz = (cell - 4) * (1 - fade * 0.35);
            const inset = (cell - 4 - sz) / 2;
            ctx.globalAlpha = 1 - fade;
            // v1.17.44 淡出层同样两层绘制，特殊块不会在消除瞬间「变回」普通块
            const isObjF = typeof color === 'object';
            const bcF = isObjF ? ChipSkin.baseColorOf(color) : cBase;
            if (drawImg(ctx, ChipSkin.BASES[bcF], x + inset, y + inset, sz, sz)) {
              const glyphF = isObjF ? ChipSkin.specialSrc(color) : ChipSkin.normalSrc(bcF);
              if (isObjF && color.s === 'split' && color.sub) subBlockGlyph(ctx, x + inset + sz / 4, y + inset + sz / 4, sz / 2);
              else if (glyphF) drawImg(ctx, glyphF, x + inset, y + inset, sz, sz);
            } else if (!cBase || !drawImg(ctx, BOARD_IMG[cBase], x + inset, y + inset, sz, sz)) {
              fillRoundRect(ctx, x + inset, y + inset, sz, sz, 8, COLOR_FILL[cBase] || '#333');
            }
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    if(theme==='lava'||theme==='frost') {
      const ice=theme==='frost';
      fillRoundRect(ctx,boardX-5,boardY-5,boardCols*cell+10,boardRows*cell+10,10,ice?'rgba(87,182,230,0.12)':'rgba(232,104,43,0.12)');
      strokeRoundRect(ctx,boardX-5,boardY-5,boardCols*cell+10,boardRows*cell+10,10,ice?'#80d8fa':'#e7894c',2);
    }
    // 下落层：clear 段显示消除前原位布局（未消除格保持原位、消除格由淡出层绘制）；fall 段显示最终布局 + 匀速下滑
    // （列整体同步下移——同列所有移动格下移相同格数、同速、同时到达，新补方块从各自对应高度出发）
    const v = CONFIG.FALL_SPEED * cell; // 固定下落速度（格/秒 × cell），与 durFall 0.4s 匹配：到位即结束
    // 预算：每列消除格数 colDrop、每列消除行 colClearedRows
    const colDrop = new Array(boardCols).fill(0);
    const colClearedRows = new Array(boardCols).fill(0).map(() => []);
    if (anim && anim.cleared) {   // v5.6.3 clear/fall 两段都需要下落预算
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
    const inClear = !!(anim && (anim.phase === 'clear' || anim.phase === 'wait'));   // v5.6.4 等待段保持消除后原位（空位停留），fall 段才下落
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        let color = inClear ? (g0[r][c] || null) : g1[r][c];   // v5.6.3 clear 段画原位，fall 段画最终布局
        if (!color) continue;
        if (inClear && anim.cleared.has(r + ',' + c)) continue; // 消除格由淡出层绘制，不重复
        let x = boardX + c * cell + 2;
        let y = boardY + r * cell + 2;
        if (anim && anim.phase === 'fall' && anim.progress < 1) {   // v5.6.3 下落段独立计时
          const elapsed = anim.progress * anim.durFall; // 已流逝时间（秒）
          const srcRow = this._sourceRow(anim, g1, r, c);
          const dist = dropCellsOf(srcRow, c) * cell; // 同列内所有移动格距离一致
          const dy = Math.min(dist, v * elapsed);
          y = y - dist + dy; // 从来源位置（上移 dist）匀速下滑至目标位置
        }
        if(anim && anim.phase==='fall' && anim.gravityOrigins && anim.gravityOrigins[r][c]) {
          const path=anim.gravityOrigins[r][c].path;
          if(path && path.length>1) {
            const t=Math.min(1,anim.progress)*(path.length-1),i=Math.min(path.length-2,Math.floor(t)),f=t-i;
            x=boardX+(path[i].c+(path[i+1].c-path[i].c)*f)*cell+2;
            y=boardY+(path[i].r+(path[i+1].r-path[i].r)*f)*cell+2;
          } else { x=boardX+c*cell+2;y=boardY+r*cell+2; }
        }
        this.drawCell(ctx, x, y, cell, color, r, c, selected);
      }
    }
    if (shP >= 0 && shP < 1) ctx.restore();
  }

  /** 单格绘制（v1.17.44 两层：无符号玻璃底板 → 图案；
   *  普通块用原色图案、特殊块用随来源色染好的图案；底板未就绪回退旧整图，再回退色块+矢量徽记） */
  drawCell(ctx, x, y, cell, color, r, c, selected) {
    if (color && color.s === 'obstacle') {
      const ice=color.theme==='frost';
      fillRoundRect(ctx,x,y,cell-4,cell-4,8,ice?'#29475d':'#49312c');
      strokeRoundRect(ctx,x+3,y+3,cell-10,cell-10,7,ice?'#a8e6ff':'#ff9a53',2);
      text(ctx,ice?'❄':'◆',x+(cell-4)/2,y+(cell-4)/2+7,24,ice?'#c9f3ff':'#ffb66b','center'); return;
    }
    const size = cell - 4;
    const isObj = color !== null && typeof color === 'object';   // v5.2 特殊块 {c,s,sub?}
    const base = isObj ? (color.s === 'rainbow' ? null : (color.c || color.tint || null)) : color;
    const bc = isObj ? ChipSkin.baseColorOf(color) : base;
    if (isObj && color.s === 'rainbow') {
      // Rainbow is a standalone icon, including the asset-loading fallback.
      if (!drawImg(ctx, ChipSkin.specialSrc(color), x, y, size, size)) {
        this._specialBlockMark(ctx, x, y, size, color);
      }
    } else if (drawImg(ctx, ChipSkin.BASES[bc], x, y, size, size)) {
      const glyph = isObj ? ChipSkin.specialSrc(color) : ChipSkin.normalSrc(bc);
      if (glyph) {
        const glyphSize = isObj && color.s === 'split' && color.sub ? size * 0.5 : size;
        const inset = (size - glyphSize) / 2;
        if (isObj && color.s === 'split' && color.sub) subBlockGlyph(ctx, x + inset, y + inset, glyphSize);
        else drawImg(ctx, glyph, x + inset, y + inset, glyphSize, glyphSize);
      }
    } else if (base && drawImg(ctx, BOARD_IMG[base], x, y, size, size)) {
      // Child mine keeps its white emblem even while only the old base asset is ready.
      if (isObj && color.s === 'split' && color.sub) subBlockGlyph(ctx, x + size / 4, y + size / 4, size / 2);
      // 其它回退：旧整图自带符号，不再叠图案
    } else {
      fillRoundRect(ctx, x, y, size, size, 8, COLOR_FILL[base] || (isObj ? '#2c3440' : '#333'));
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, y + size - 6, size, 6);
      if (isObj) this._specialBlockMark(ctx, x, y, size, color);
    }

    if (selected && selected[0] === r && selected[1] === c) {
      strokeRoundRect(ctx, x - 2, y - 2, size + 4, size + 4, 10, '#ffffff', 4);
    }
  }

  /** Special pieces share a dark medallion and bright border; shape encodes function independently of hue. */
  _specialBlockMark(ctx, x, y, size, piece) {
    return specialBlockMark(ctx, x, y, size, piece);
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

  /* ============ 区B · 敌人层（本体 / debuff 特效 / 血条） ============ */

  /** 区B·敌人层：敌人本体绘制 + 受击状态特效（debuff）+ 血条（v1.16.43 重构拆分子方法） */
  enemies(ctx, enemies) {
    enemies.forEach((e) => {
      const isElite = e.type === 'elite';
      let size = e.isBoss ? L.enemy.boss : (L.enemy[e.type] || L.enemy.normal);
      // v1.17.7 精英怪：放大 35% + 金色发光描边 + 紫金染色，同种怪物一眼可辨
      if (isElite) size = Math.round(size * 1.35);
      const x = e.x - size / 2, y = e.y - size / 2;
      this.drawEnemyBody(ctx, e, x, y, size, isElite);
      this.drawEnemyDebuffs(ctx, e, x, y, size);
      this.drawEnemyBar(ctx, e, x, y, size);
      this.drawEnemyDebuffIcons(ctx, e, x, y, size);
    });
  }

  drawEnemyBody(ctx, e, x, y, size, isElite) {
    // v1.16.123 敌人本体：优先按代际等级播放 5 帧循环动画（lv1-8 sprite sheet），
    // 超界等级（genLv>8）按类型映射到表内最新一代形象（normal→lv7 / runner→lv8 / tank→lv6）；
    // 动画表未加载时回退旧类型图（runner/tank/normal/boss），再回退几何+字符
    const genLv = e.genLv || 1;
    const imgLv = (genLv <= 8) ? genLv : ({ normal: 7, runner: 8, tank: 6 }[e.type] || 7);
    const animSrc = IMG_SRC['lv' + imgLv];
    const src = e.isBoss ? IMG_SRC.boss
      : (e.type === 'runner' ? IMG_SRC.runner : (e.type === 'tank' ? IMG_SRC.tank : IMG_SRC.enemy));
    const fallbackColor = e.isBoss ? '#c0392b' : (isElite ? '#9b59b6' : (e.type === 'runner' ? '#2e86c1' : (e.type === 'tank' ? '#8e6b3a' : '#7f8c8d')));
    const fallbackText = e.isBoss ? 'BOSS' : (isElite ? '精' : (e.type === 'runner' ? '快' : (e.type === 'tank' ? '盾' : '👾')));
    let drawn = false;
    if (isElite) {
      // v1.17.7 精英描边特效：绘制贴图时开启金色发光轮廓（shadow 描边），贴图/旧图均自动带外描边
      ctx.save();
      ctx.shadowColor = '#ffd54f';
      ctx.shadowBlur = 7;
      drawn = animSrc ? this.drawEnemyAnim(ctx, animSrc, e, x, y, size, isElite, imgLv) : false;
      if (!drawn && drawImg(ctx, src, x, y, size, size)) drawn = true;
      ctx.restore();
    } else {
      drawn = animSrc ? this.drawEnemyAnim(ctx, animSrc, e, x, y, size, isElite, imgLv) : false;
    }
    if (!drawn && !drawImg(ctx, src, x, y, size, size)) {
      fillRoundRect(ctx, x, y, size, size, e.isBoss ? 10 : 6, fallbackColor);
      text(ctx, fallbackText, x + size / 2, y + size / 2, e.isBoss ? 16 : 14, '#fff', 'center');
      if (isElite) { // 几何回退也带描边：金色发光方框
        ctx.save();
        ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 7;
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2.5;
        ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);
        ctx.restore();
      }
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
  }

  /** 按等级动画表裁剪绘制当前帧（横向帧循环）；图未就绪/绘制异常返回 false
   *  v1.16.96 lv1 替换为史莱姆 6 帧（assets/images/enemies/lv1.png 576×96），按非等时长表 [140,160,200,310,200,220]ms 切帧；
   *  其余等级仍为 5 帧等时长；每怪用自身 id 派生相位偏移，避免全屏同步切帧 */
  drawEnemyAnim(ctx, src, e, x, y, size, isElite, imgLv) {
    const img = loadImg(src);
    if (!(img && img.width > 0)) return false;
    // v1.17 敌人帧动画时钟：用 main.js 注入的 animNow（战斗推进才走，暂停/弹层/结算时冻结），替代绝对 Date.now()
    const now = (typeof this.animNow === 'number' && isFinite(this.animNow)) ? this.animNow : Date.now();
    try {
      const frameCount = imgLv === 1 ? 6 : 5;
      let f;
      if (imgLv === 1) {
        // 史莱姆 6 帧非等时长：按累计时长表选帧（呼吸挤压节奏 140/160/200/310/200/220ms）
        const DURS = [140, 160, 200, 310, 200, 220];
        let t = (now + ((e.id || 0) * 53) % 1000) % DURS.reduce((a, b) => a + b, 0);
        f = 0;
        while (t >= DURS[f]) { t -= DURS[f]; f++; }
      } else {
        const FRAME_DUR = { runner: 160, normal: 240, tank: 300, elite: 200, boss: 260 }; // ms/帧（v1.16.126 原值×2）
        const dur = e.isBoss ? FRAME_DUR.boss : (isElite ? FRAME_DUR.elite : (FRAME_DUR[e.type] || FRAME_DUR.normal));
        const phase = ((e.id || 0) * 53) % 1000; // 每怪独立相位（毫秒偏移），错开切帧节奏
        f = Math.floor((now + phase) / dur) % 5;
      }
      const fw = img.width / frameCount, fh = img.height;
      ctx.drawImage(img, fw * f, 0, fw, fh, x, y, size, size);
      return true;
    } catch (err) {
      return false; // 动画帧绘制异常：回退旧图，不中断渲染
    }
  }

  drawEnemyDebuffs(ctx, e, x, y, size) {
    // 受击状态特效（debuff）：冻结 / 寒霜 / 麻痹 / 猎手标记 / DoT / 毒藤
    this.drawDebuffFrozen(ctx, e, x, y, size);
    this.drawDebuffSlow(ctx, e, x, y, size);
    this.drawDebuffParalyze(ctx, e, x, y, size);
    this.drawDebuffMark(ctx, e, x, y, size);
    this.drawDebuffDots(ctx, e, x, y, size);
    this.drawDebuffVine(ctx, e, x, y, size);
  }

  drawDebuffFrozen(ctx, e, x, y, size) {
    // 冻结：冰晶外壳（v1.13.26）；v1.17.9c 不再绘制蓝色描边框（debuff 不高亮模型边框），仅保留冰壳特效
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
  }

  drawDebuffSlow(ctx, e, x, y, size) {
    // 寒霜：全身淡冰蓝霜罩 + 双环冰雾 + 寒气粒子 + 结晶（v1.13.30）
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
  }

  drawDebuffParalyze(ctx, e, x, y, size) {
    // 麻痹：头顶金色电花 + 跳动电光点（v1.13.21）
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
  }

  drawDebuffMark(ctx, e, x, y, size) {
    // 猎手标记：红色半透明瞄准环 + 十字准线（v1.16.42）
    // v1.16.42 猎手标记：被标记敌人头顶红色半透明瞄准标记（瞄准环 + 十字准线 + 中心点），随层数扩大脉冲
    if ((e._mark || 0) > 0) {
      const cx = x + size / 2, cy = y + size / 2 - size * 0.5 - 4;
      const tNow2 = Date.now();
      const pulse = 0.72 + 0.28 * Math.sin(tNow2 / 240);
      ctx.strokeStyle = 'rgba(255,80,80,0.85)'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85 * pulse;
      ctx.beginPath(); ctx.arc(cx, cy, 7 + e._mark * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 11 - e._mark * 2, cy); ctx.lineTo(cx + 11 + e._mark * 2, cy);
      ctx.moveTo(cx, cy - 11 - e._mark * 2); ctx.lineTo(cx, cy + 11 + e._mark * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,80,80,0.9)'; ctx.globalAlpha = 0.9 * pulse;
      ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawDebuffDots(ctx, e, x, y, size) {
    // DoT 图标：灼烧火焰帧动画 / 中毒毒泡+层数 / 兜底绿点
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
          if (!drawImg(ctx, `assets/images/burn/burn${frameIdx + 1}.png`, cx - fw / 2, y + size - fh, fw, fh)) {
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
          // v1.17.9c 不再绘制灼烧火焰描边框（debuff 不高亮模型边框），仅保留火焰贴图/回退火苗特效
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
  }

  drawDebuffVine(ctx, e, x, y, size) {
    // 毒藤：螺旋缠绕 + 叶片脉动（v1.16.1）
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
  }

  damageNumbers(ctx, queue) {
    if (Presentation.damageNumbers.enabled && queue) queue.drawTo(ctx, { text });
  }

  drawEnemyBar(ctx, e, x, y, size) {
    const bars = Presentation.enemyBars;
    if (!bars.show || (e.isBoss && !bars.showBoss) || (e.type === 'elite' && !bars.showElite)) return;
    // 个体血条：实色当前血量 + 延迟尾条
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
  }

  /** v1.16.60 怪物 debuff 图标：血条上方横向排布（半透明圆底 + 专属 emoji + 边框色 + 剩余秒数小字），每个 debuff 一个小图标 */
  drawEnemyDebuffIcons(ctx, e, x, y, size) {
    const items = [];
    // 多段 DoT：灼烧 / 中毒（dot 列表逐项）
    (e.dots || []).forEach((d) => {
      if (d.type === 'burn') items.push({ icon: '🔥', tint: '#ff6b35', left: d.ttl });
      else if (d.type === 'poison') items.push({ icon: '☠️', tint: '#27ae60', left: d.ttl });
    });
    // 流血 / 冻结 / 麻痹 / 冰缓 / 猎手标记 / 毒藤缠绕
    if (e.bleedT > 0) items.push({ icon: '🩸', tint: '#c0392b', left: e.bleedT });
    if (e.frozen > 0) items.push({ icon: '🧊', tint: '#5dade2', left: e.frozen });
    if (e.paralyzed > 0) items.push({ icon: '😵', tint: '#f4d03f', left: e.paralyzed });
    if (e.slow && e.slow.ttl > 0) items.push({ icon: '🥶', tint: '#85c1e9', left: e.slow.ttl });
    if ((e._mark || 0) > 0) items.push({ icon: '🎯', tint: '#c39bd3', left: e._markT || 0 });
    if ((e._vineT || 0) > 0) items.push({ icon: '🌿', tint: '#58d68d', left: e._vineT });
    if (!items.length) return;
    const r = 10, gap = 24;
    // 血条在 y-6（高 4）；图标整体位于血条上方：圆心 y-18（圆顶 y-28、圆底 y-8）
    const icY = y - 18;
    const total = items.length * gap;
    let cx0 = x + size / 2 - total / 2 + r;
    if (cx0 < x) cx0 = x + r;  // 图标过多时贴左排，避免超界
    items.slice(0, 5).forEach((it, i) => {
      const cx = cx0 + i * gap;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(cx, icY, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = it.tint; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, icY, r, 0, Math.PI * 2); ctx.stroke();
      text(ctx, it.icon, cx, icY + 1, 12, '#ffffff', 'center');
      if (it.left > 0) text(ctx, Math.ceil(it.left), cx + r + 3, icY - r + 2, 9, '#ffffff', 'left');
    });
    if (items.length > 5) text(ctx, '+' + (items.length - 5), cx0 + 5 * gap, icY, 10, '#ffd34d', 'left');
  }

  /* ============ 区C · 技能特效层（地面持续效果 / 弹道与技能 fx） ============ */

  /** v1.16.72 战场宝箱：怪物掉落实体，点击后播放三帧开箱动画（关→半开→全开）→ 开启后弹出圣物三选一；金色宝箱图片 + 呼吸光晕 + 点击提示 */
  fieldChests(ctx, list) {
    if (!list || !list.length) return;
    const now = Date.now();
    list.forEach((c) => {
      const s = 56;
      const opening = c.animT != null;   // v1.16.72：animT 非空 = 开箱/飞行动画播放中（main.js 推进）
      // v1.16.74 飞行阶段：全开帧从原位飞向屏幕中心并逐渐放大（ease-in-out 缓动）
      let fx = c.x, fy = c.y, scale = 1;
      if (opening && c.stage === 'fly') {
        const p = Math.min(1, c.flyT / 0.7);
        const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p); // ease-in-out
        fx = c.x + (375 - c.x) * e;
        fy = c.y + (560 - c.y) * e;
        scale = 1 + 1.6 * e; // 56 → 最大 ≈146
      }
      const b = 0.6 + 0.4 * Math.sin(now / 320 + c.x);
      // 呼吸光晕（开启中加强；飞行中随位置与放大）
      const gR = s * 1.5 * scale;
      const g = ctx.createRadialGradient(fx, fy, 4, fx, fy, gR);
      g.addColorStop(0, '#ffd34d'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.globalAlpha = opening ? 0.42 : 0.22 + 0.12 * b;
      ctx.beginPath(); ctx.arc(fx, fy, gR, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 地面投影（仅静止时）
      if (!opening) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(c.x, c.y + s / 2 + 4, s / 2 * 0.85, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 五帧动画（v1.16.75）：关闭 → 微开 → 半开 → 快开 → 全开，0.4s 播完；飞行阶段恒用全开帧
      const p = opening ? Math.min(1, c.animT / 0.4) : 0;
      const src = (opening && c.stage === 'fly') ? IMG_SRC.chestOpen
        : (p < 0.2 ? IMG_SRC.chestClosed : (p < 0.4 ? IMG_SRC.chestQuarter : (p < 0.6 ? IMG_SRC.chestHalf : (p < 0.8 ? IMG_SRC.chestFast : IMG_SRC.chestOpen))));
      const ss = s * scale;
      if (!drawImg(ctx, src, fx - ss / 2, fy - ss / 2, ss, ss)) {
        // 回退：金色渐变箱体（图片未加载时）
        fillRoundRect(ctx, fx - ss / 2, fy - ss / 2 + 10, ss, ss - 10, 8, 'rgba(0,0,0,0.35)');
        const bg = ctx.createLinearGradient(fx - ss / 2, fy - ss / 2 + 10, fx - ss / 2, fy + ss / 2);
        bg.addColorStop(0, '#ffe08a'); bg.addColorStop(1, '#c8860a');
        fillRoundRect(ctx, fx - ss / 2, fy - ss / 2 + 10, ss, ss - 10, 8, bg);
        fillRoundRect(ctx, fx - ss / 2 - 3, fy - ss / 2, ss + 6, 18, 6, '#f7c948');
        strokeRoundRect(ctx, fx - ss / 2 - 3, fy - ss / 2, ss + 6, 18, 6, 'rgba(255,255,255,0.6)', 1);
        fillRoundRect(ctx, fx - 8, fy - 6, 16, 16, 4, '#8a5c00');
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath(); ctx.arc(fx, fy + 2, 3, 0, Math.PI * 2); ctx.fill();
      }
      // v1.16.74 飞行金光：轨迹粒子 + 到达中心时的光爆
      if (opening && c.stage === 'fly') {
        const p = Math.min(1, c.flyT / 0.7);
        for (let k = 0; k < 8; k++) {
          const kk = ((k * 0.618 + 0.2) % 1);
          if (kk > p) continue;
          const tx = c.x + (375 - c.x) * kk, ty = c.y + (560 - c.y) * kk;
          const fade = Math.max(0, 1 - (p - kk) * 2.4);
          ctx.fillStyle = k % 2 ? '#ffd34d' : '#fff6d8';
          ctx.globalAlpha = 0.8 * fade;
          ctx.beginPath(); ctx.arc(tx, ty, 2.5 + 1.6 * scale, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 到达中心光爆（后 30% 时间）
        if (p > 0.7) {
          const bp = (p - 0.7) / 0.3;
          const br = 40 + 130 * bp;
          const bg2 = ctx.createRadialGradient(375, 560, 6, 375, 560, br);
          bg2.addColorStop(0, 'rgba(255,244,214,0.9)');
          bg2.addColorStop(0.4, 'rgba(255,211,77,0.45)');
          bg2.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = bg2;
          ctx.globalAlpha = 0.9 * (1 - bp * 0.4);
          ctx.beginPath(); ctx.arc(375, 560, br, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // 点击提示（未开启时显示）
      if (!opening) text(ctx, '点击开启', c.x, c.y - s / 2 - 12, 15, '#ffd34d', 'center');
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
    // 毒池（v1.16.1 深绿毒液池）/ 毒沼（v1.16.42 60px 暗褐绿泥沼，与毒池区分）——画在敌人下层
    if (combat.groundDots && combat.groundDots.length) {
      combat.groundDots.forEach((gd) => {
        if (gd.key !== 'poison' || gd.ttl <= 0) return;
        const seed = gd.seed || 0;
        const fade = Math.min(1, gd.ttl / 1.2); // 接近结束淡出
        const R = gd.r || 130;
        const breathe = 1 + 0.05 * Math.sin(tNow / 320 + seed);
        if (gd.swamp) {
          // v1.16.42 毒沼：小范围（60px）暗褐绿泥沼——泥浆底色 + 内圈 + 冒泡，与毒池（亮绿毒液池）区分
          ctx.fillStyle = '#4d3a1e'; ctx.globalAlpha = 0.5 * fade;
          ctx.beginPath(); ctx.ellipse(gd.x, gd.y, R * breathe, R * 0.7 * breathe, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#6b5325'; ctx.globalAlpha = 0.4 * fade;
          ctx.beginPath(); ctx.ellipse(gd.x, gd.y, R * 0.62 * breathe, R * 0.44 * breathe, 0, 0, Math.PI * 2); ctx.fill();
          // 泥浆高光斑
          ctx.fillStyle = '#7d6a2e'; ctx.globalAlpha = 0.25 * fade;
          ctx.beginPath(); ctx.ellipse(gd.x - R * 0.2, gd.y - R * 0.1, R * 0.3, R * 0.17, 0, 0, Math.PI * 2); ctx.fill();
          // 泥沼气泡（暗绿气泡上升）
          for (let k = 0; k < 5; k++) {
            const ph = ((tNow / 850 + k / 5 + seed * 0.013) % 1);
            const bx = gd.x + Math.sin((tNow / 620 + k * 2.1) * 2) * R * 0.35;
            const by = gd.y + R * 0.3 - ph * R * 0.7;
            ctx.fillStyle = '#8a9a5b'; ctx.globalAlpha = (0.5 - 0.3 * ph) * fade;
            ctx.beginPath(); ctx.arc(bx, by, 1.6 + ph * 2.2, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
          return;
        }
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
        if (!drawImg(ctx, `assets/images/poisonstick/poisonstick${frameIdx + 1}.png`, x - fw / 2, y - 8, fw, fh)) {
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

  /** 打击特效（区C）：弹道与技能 fx 统一渲染入口。
   *  分节目录：shot（塔攻击弹道，kind=line/bolt/arc/zigzag/storm/frostorb/icewall/icebloom/orb/bounce/mortar…）
   *  / hitwall / bullet / strikeShell / strike / boom / flash / vine / thorn / mine / turret / cyclone /
   *  pillar / fireWall / rain / raindrop / particle / ring / beam / beamp / match（三消飞光） */
  /** 打击特效（区C）：统一 dispatch——22 种 f.type 各由独立 handler 渲染（v1.16.43 重构） */
  fx(ctx, fxList) {
    fxList.forEach((f) => {
      if (f.t < 0) return; // v1.13.8：延迟帧动画（火雨连续波次 stagger）未到时跳过渲染
      const h = FX_HANDLERS[f.type];
      if (h) this[h](ctx, f);
    });
  }

  /** v1.16.113 文字飘字（3★ 触发确认）：上漂 + 渐隐 */
  fxFloatText(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 1));
    ctx.globalAlpha = Math.max(0, 1 - p);
    text(ctx, f.text, f.x, f.y - 34 * p, f.size || 22, f.color || '#ffd24a', 'center');
    ctx.globalAlpha = 1;
  }

  fxShot(ctx, f) {
    if (f.projectile && f.projectile.finished) return;
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
        const wy = (f.y || this.ly.wallY);
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
        const wy = (f.y !== undefined ? f.y : (this.ly.wallY - 50));
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
        // v1.13.28 冰花帧动画：4 帧绽放序列（assets/images/icebloom/icebloom1-4.png，按进度选帧）
        const fp = Math.min(1, f.t / f.dur);
        const frameIdx = Math.min(3, Math.floor(fp * 4));
        const fw = (f.r || 100) * 1.9, fh = (f.r || 100) * 1.9;
        if (!drawImg(ctx, `assets/images/icebloom/icebloom${frameIdx + 1}.png`, f.x - fw / 2, f.y - fh / 2, fw, fh)) {
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
  }

  fxHitwall(ctx, f) {
      // 城墙受击闪光（怪物攻城命中）
      const p = Math.min(1, f.t / f.dur);
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f.x - 160, f.y - 2, 320, 4);
      ctx.globalAlpha = 1;
  }

  fxBullet(ctx, f) {
      const p = Math.min(1, f.t / f.dur);
      const x = f.x + (f.tx - f.x) * p;
      const y = f.y + (f.ty - f.y) * p;
      if (!drawImg(ctx, IMG_SRC.bullet, x - 8, y - 8, 16, 16)) {
        ctx.fillStyle = f.color || '#ffd24a';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      }
  }

  fxStrikeShell(ctx, f) {
      // v1.16.31 炮火支援：逐发弹道——0.3s 从塔口升空至高点 300px 后**消失**；发射 1.0s 后
      //   在目标头顶高 300px 处**出现**并 0.3s 垂直落下打击（第 1 发落地 1.3s，之后每发 +0.1s）
      const t1 = f.t - (f.offset || 0);
      if (t1 < 0 || t1 >= 1.3) return;   // 未发射或已落地
      if (t1 >= 0.3 && t1 < 1.0) return; // 高点至重现之间：炮弹不可见（不再悬停）
      let mx, my, ang;
      if (t1 < 0.3) {
        const k = t1 / 0.3;
        mx = f.sx; my = f.sy - 300 * k; ang = -Math.PI / 2;
      } else {
        // t1 ≥ 1.0：从目标头顶高 300px 处垂直出现并落下
        const k = (t1 - 1.0) / 0.3;
        mx = f.tx; my = (f.ty - 300) + 300 * k; ang = Math.PI / 2;
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
  }

  fxStrike(ctx, f) {
      // v1.16.31 炮火支援：地面炮击圈——offset 偏移后于落地前 0.5s 出现，棕色描边标识 130px 受击范围，持续至落地爆炸
      const t1 = f.t - (f.offset || 0);
      if (t1 < 0.5 || t1 >= 1.3) return;   // 未到预警时刻或已爆炸
      const p = (t1 - 0.5) / 0.8;
      const a = 0.25 + 0.55 * p;   // 淡入
      ctx.globalAlpha = a * 0.30;
      ctx.fillStyle = '#8d5a2b';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      // 棕色描边主圈（受击范围标识）
      ctx.strokeStyle = '#b0602a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.62, 0, Math.PI * 2); ctx.stroke();
      // 内白圈 + 中心瞄准点
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.34, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
      const c = 7;
      ctx.beginPath();
      ctx.moveTo(f.x - c, f.y); ctx.lineTo(f.x + c, f.y);
      ctx.moveTo(f.x, f.y - c); ctx.lineTo(f.x, f.y + c);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x, f.y, 2.4, 0, Math.PI * 2); ctx.fill();
      // 旋转刻度（8 根短线绕外圈，棕色）
      ctx.strokeStyle = '#c07a35'; ctx.lineWidth = 2;
      for (let k = 0; k < 8; k++) {
        const ang = k * 0.785 + (f.seed || 0) + f.t * 3;
        const r1 = f.r * 0.66, r2 = f.r * 0.72;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1);
        ctx.lineTo(f.x + Math.cos(ang) * r2, f.y + Math.sin(ang) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
  }

  fxBoom(ctx, f) {
      const p = Math.min(1, f.t / f.dur);
      // v1.16.74 统一爆炸演出：anim_explosion 精灵表按颜色变体播放
      // （替换原 assets/images/explosionN 序列帧，并移除 v1.16.6 程序化"爆炸增强"叠加段，避免重叠渲染）
      const size = (f.r ? f.r * 2.4 : 108);
      if (!drawAnimSheet(ctx, 'explosion', animVariantOf(f.color), f.x, f.y, size, p)) {
        // 兜底：精灵表未加载时简版闪光圆
        const r = 14 + p * 26;
        ctx.globalAlpha = (1 - p) * 0.8;
        ctx.fillStyle = f.color || '#ff9f43';
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
  }

  fxFlashFx(ctx, f) {
      const p = Math.min(1, f.t / f.dur);
      // v1.16.74 命中火花：anim_spark 四芒星（6帧/15fps），替换原程序化闪光圆（避免重叠渲染）
      if (!drawAnimSheet(ctx, 'spark', 'gold', f.x, f.y, 60, p)) {
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.fillStyle = f.color || '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, 6 + p * 8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
  }

  fxVine(ctx, f) {
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
  }

  fxThorn(ctx, f) {
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
  }

  fxMine(ctx, f) {
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
  }

  fxTurret(ctx, f) {
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
      if (!drawImg(ctx, `assets/images/turret/turret${frameIdx + 1}.png`, f.x - fw / 2, f.y - 20, fw, fh)) {
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
  }

  fxCyclone(ctx, f) {
      // v1.16.21 风暴镖重做：三同心圈（不可见）沿圈旋转的十字飞镖，引用 combat 实时 darts（命中消失同步）
      // v1.16.42 小镖改为十字飞镖：两片菱形刀刃交叉成十字，绕中心旋转
      const darts = f.darts || [];
      for (const d of darts) {
        const px = f.x + Math.cos(d.a) * d.r;
        const py = f.y + Math.sin(d.a) * d.r;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(d.a);
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#8e44ad';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // 十字镖：两片菱形刀刃交叉（横/竖），紫底 + 白刃高光
        const blade = (ang) => {
          ctx.save(); ctx.rotate(ang);
          ctx.fillStyle = '#c39bd3';
          ctx.beginPath(); ctx.moveTo(0, -8.5); ctx.lineTo(3.2, 0); ctx.lineTo(0, 8.5); ctx.lineTo(-3.2, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.moveTo(0, -8.5); ctx.lineTo(1.2, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        };
        blade(0); blade(Math.PI / 2);
        ctx.restore();
      }
  }

  fxPillar(ctx, f) {
      // 火柱帧动画（v1.17.25）：8 帧透明贴图时间轴——圈落印→汇聚→立柱→拔高→满高→抵边→崩解→余烬
      // 帧边界压代码三阶段分界（0.60/1.68/1.97s），伤害结算 pillarWaves.t=0.6 与 F3 立柱同帧，时间常数零改动
      // 贴图未加载完成时回退 _fxPillarProc 程序化绘制，不出现空技能
      const t = Math.min(f.t, f.dur), dur = f.dur;
      const cx = f.x, cy = f.y, R = f.r || 120, seed = f.seed || 0;
      // 判定提示细环（0~0.6s 由 0 扩到 R，之后短暂渐隐；仅 1.5px 细线不填充，精确标伤害范围）
      const ring = FirepillarFx.warnRing(t, R);
      if (ring) {
        ctx.globalAlpha = 0.35 * ring.fade;
        ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const fi = FirepillarFx.frameIndex(t, dur);
      for (let i = 1; i <= FirepillarFx.N; i++) loadImg(IMG_SRC['firepillar' + i]);
      const { W, H, bx, by } = FirepillarFx.layout(cx, cy, R);
      const drawn = drawImg(ctx, IMG_SRC['firepillar' + fi], bx, by, W, H);
      if (drawn) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45;
        drawImg(ctx, IMG_SRC['firepillar' + fi], bx, by, W, H);
        ctx.restore();
        // 上升火星（代码层粒子，0.6s 起与柱体伴生）
        for (const spark of FirepillarFx.sparkSpec(cx, cy, dur, seed, W, H, t)) {
          ctx.fillStyle = spark.color; ctx.globalAlpha = spark.alpha;
          ctx.beginPath(); ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
      }
      this._fxPillarProc(ctx, cx, cy, R, seed, t / dur);
  }

  /* v1.17.25 程序化火柱回退（原 v1.13.9 四阶段绘制，贴图未就绪时使用） */
  _fxPillarProc(ctx, cx, cy, R, seed, p) {
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
  }

  fxFireWall(ctx, f) {
      // 火焰墙（v1.16.21 烈焰墙）：长条可穿越火墙（长 w·宽 h·持续 6s）
      // v1.17.17/18：墙体主体改为 4 帧透明贴图（12fps 循环），source-over 主体 + 45% lighter 辉光；
      //           代码层保留地面红晕与上升火花；贴图未加载完成时回退 v1.16.21 程序化绘制，不出现空墙。
      const p = Math.min(1, f.t / f.dur);
      const cx = f.x, cy = f.y, w = f.w || 100, h = f.h || 30, seed = f.seed || 0;
      const fade = FirewallFx.fade(p);
      // 地面红晕（墙体底缘）
      ctx.globalAlpha = 0.25 * fade;
      ctx.fillStyle = 'rgba(255,112,67,0.4)';
      ctx.beginPath(); ctx.ellipse(cx, cy + h / 2, w * 0.55, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 4 帧贴图：12fps 循环，按 seed 错相（同屏多面火墙不同步）；底边贴地面线，宽=墙宽，高按 512:160
      // v1.17.18：透明底帧，主体 source-over 保住卡通描边与暗红底色（加法会发白），
      //           再叠一遍 45% lighter 做辉光——暗色战场有熔光感，亮草地也不冲淡
      for (let i = 1; i <= FirewallFx.N; i++) loadImg(IMG_SRC['firewall' + i]);
      const fi = FirewallFx.frameIndex(f.t, seed);
      const { FW, FH, bx, by } = FirewallFx.layout(cx, cy, w, h);
      ctx.globalAlpha = fade;
      const drawn = drawImg(ctx, IMG_SRC['firewall' + fi], bx, by, FW, FH);
      if (drawn) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * 0.45;
        drawImg(ctx, IMG_SRC['firewall' + fi], bx, by, FW, FH);
        ctx.restore();
      }
      if (!drawn) this._fxFireWallProc(ctx, cx, cy, w, h, seed, p, fade);
      // 上升火花（代码层粒子，与贴图层叠加：贴图给形，粒子给活）
      for (const spark of FirewallFx.sparkSpec(cx, cy, seed, w, h, p, fade)) {
        ctx.fillStyle = spark.color; ctx.globalAlpha = spark.alpha;
        ctx.beginPath(); ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
  }

  /* v1.16.21 程序化火墙（贴图未就绪时的回退绘制：N 段竖火焰 + 亮芯） */
  _fxFireWallProc(ctx, cx, cy, w, h, seed, p, fade) {
      const segs = Math.max(4, Math.round(w / 14));
      for (let i = 0; i < segs; i++) {
        const s = ((i * 5171 + seed * 13) % 97) / 97;
        const fx2 = cx - w / 2 + (i + 0.5) * (w / segs);
        const sway = Math.sin(p * 18 + i * 1.7 + seed) * 4;
        const hh = h * (0.75 + 0.35 * s) + Math.sin(p * 24 + i * 2.1) * 4;
        const col = i % 3 === 0 ? '#e74c3c' : (i % 3 === 1 ? '#ff7043' : '#ff9f43');
        ctx.globalAlpha = (0.55 + 0.3 * s) * fade;
        ctx.fillRect(fx2 - (w / segs) * 0.34, cy + h / 2 - hh, (w / segs) * 0.68, hh);
        drawFlameTongue(ctx, fx2, cy + h / 2 - hh, (w / segs) * 0.9, 8 + 4 * s, sway, col, 0.9 * fade);
      }
      ctx.globalAlpha = (0.35 + 0.25 * Math.sin(p * 26 + seed)) * fade;
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(cx - w * 0.32, cy + h / 2 - h * 0.55, w * 0.64, h * 0.55);
      ctx.globalAlpha = 1;
  }

  fxRain(ctx, f) {
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
  }

  fxRaindrop(ctx, f) {
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
        // v1.16.74 落地爆焰：anim_fallstrike 冲击段（帧3-7 映射 0.25s），替换原程序化小爆焰（避免重叠渲染）
        const k = Math.min(1, (f.t - FALL) / 0.25);
        if (!drawAnimSheet(ctx, 'fallstrike', 'orange', f.tx, f.ty, 96, (3 + k * 4.99) / 8)) {
          // 兜底：原小爆焰
          ctx.globalAlpha = 0.9 * (1 - k);
          ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(f.tx, f.ty, br * (1 + k * 1.6), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.fillStyle = s < 0.5 ? '#ff7043' : '#ffd24a';
          ctx.beginPath(); ctx.arc(f.tx, f.ty, br * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
  }

  fxParticleFx(ctx, f) {
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
  }

  fxRingFx(ctx, f) {
      // 技能特效扩散环：描边圆随进度扩散淡出（冰冻/爆炸冲击/寒潮/毒雾）
      const p = Math.min(1, f.t / f.dur);
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.strokeStyle = f.color || '#ffffff';
      ctx.lineWidth = f.width || 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, (f.rMax || 60) * (0.25 + 0.75 * p), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
  }

  fxBeamFx(ctx, f) {
      // 技能特效连线：两点间亮线淡出（电连锁/电弧/雷暴/毒扩散）
      const p = Math.min(1, f.t / f.dur);
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = f.color || '#f4d03f';
      ctx.lineWidth = f.width || 3.5;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.globalAlpha = 1;
  }

  fxBeamp(ctx, f) {
      // v1.16.38b 三消飞光（美化）：光点从盘面汇聚点飞向塔位/全局技能按钮
      // v1.16.40 轨迹优化（反向抛物线）：分段运动——
      //   ① 下坠段 p∈[0,0.4]：光球竖直下落，速度 2·24/0.4=120px/s → 匀减速至 0（≈用户 100px/s 初速量级），
      //      位移 s=24·w(2-w)（w=p/0.4，先快后慢=减速），深度 24px；
      //   ② 加速段 p∈(0.4,1]：从最低点 (x0,y0+24) 以 q² 加速弧线冲向目标（速度 0 → 快），轨迹先下沉后上扬 = 反向抛物线
      //   · 动态拖尾（前 8 帧位置渐变光点）· 三层光晕（外柔光/中彩光/白芯）· 到达涟漪 + 星芒闪光
      const p = Math.min(1, f.t / f.dur);
      let x, y;
      if (p <= 0.4) {
        const w = p / 0.4;
        const s = 24 * w * (2 - w);
        x = f.x0; y = f.y0 + s;
      } else {
        const q = (p - 0.4) / 0.6;
        const qq = q * q;
        x = f.x0 + (f.x1 - f.x0) * qq;
        y = f.y0 + 24 + (f.y1 - f.y0 - 24) * qq;
      }
      const col = f.color || '#ffffff';
      if (!f.trail) f.trail = [];
      f.trail.push({ x, y });
      if (f.trail.length > 8) f.trail.shift();
      // 拖尾：越靠后越淡越小（v1.16.41 ×1.5）
      for (let ti = 0; ti < f.trail.length - 1; ti++) {
        const tp = f.trail[ti];
        const k = (ti + 1) / f.trail.length;
        ctx.globalAlpha = 0.10 + 0.35 * k * (1 - p);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, 2.25 + 3.3 * k, 0, Math.PI * 2); ctx.fill();
      }
      // 本体：三层光晕（外柔光 → 中彩光 → 白芯，v1.16.41 ×1.5）
      ctx.globalAlpha = 0.20 * (1 - p * 0.4);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 19.5 + 6 * p, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(x, y, 9 + 3.75 * p, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
      // 末端：到达终点 → 扩散涟漪 + 星芒闪光（停留 0.35s 视觉，v1.16.41 涟漪同步 ×1.5）
      if (p >= 0.8) {
        const q = (p - 0.8) / 0.2;
        const qq = 1 - Math.pow(1 - q, 2);
        ctx.globalAlpha = (1 - q) * 0.75;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x1, f.y1, 9 + qq * 45, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = (1 - q) * 0.9;
        ctx.lineWidth = 2.5;
        const rr = 6 + qq * 24;
        ctx.beginPath();
        ctx.moveTo(f.x1 - rr, f.y1); ctx.lineTo(f.x1 + rr, f.y1);
        ctx.moveTo(f.x1, f.y1 - rr); ctx.lineTo(f.x1, f.y1 + rr);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
  }

  fxMatch(ctx, f) {
      // 三消消除反馈：彩色星芒迸发（十字线 + 中心白点，随进度扩散淡出）+ v1.17.29 环形冲击波
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
      // v1.17.29 外扩冲击波环
      ctx.globalAlpha = (1 - p) * 0.4;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 3 + p * 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x, f.y, 3 + (1 - p) * 4, 0, Math.PI * 2); ctx.fill();
  }

  /** v5.6 特殊块生成"降临"：地面光圈 + 升空光柱 + 类型符号旋转放大定格 */
  fxSpecialSpawn(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.6));
    const e = 1 - Math.min(1, p * 1.5);   // 收缩系数
    const cell = f.cell || 46;
    const r0 = f.sub ? 12 : 20;
    const col = f.sub ? '#ff5566'
      : (f.color && COLOR_FILL[f.color] ? COLOR_FILL[f.color]
        : (f.s === 'rainbow' ? '#ffe8a5' : '#ffffff'));
    // 地面光圈（类型色渐扩）
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.strokeStyle = col; ctx.lineWidth = 2 + e * 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(f.x, f.y, r0 * (1.6 - e * 0.6), 0, Math.PI * 2); ctx.stroke();
    // 升空光柱
    ctx.globalAlpha = (1 - p) * 0.55;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    const rise = 1 - Math.min(1, p * 1.8);
    ctx.beginPath();
    ctx.moveTo(f.x, f.y + r0 * 1.4);
    ctx.lineTo(f.x, f.y - r0 * (0.5 + rise * 1.1));
    ctx.stroke();
    // 类型符号：旋转 + 缩放定格
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate((1 - e) * 0.8);
    const sc = 0.6 + e * 0.7;
    ctx.scale(sc, sc);
    ctx.globalAlpha = (1 - p) * 0.95;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath();
    if (f.s === 'row') { ctx.moveTo(-r0, 0); ctx.lineTo(r0, 0); }
    else if (f.s === 'col') { ctx.moveTo(0, -r0); ctx.lineTo(0, r0); }
    else if (f.s === 'cross') { ctx.moveTo(-r0, 0); ctx.lineTo(r0, 0); ctx.moveTo(0, -r0); ctx.lineTo(0, r0); }
    else if (f.s === 'split') { ctx.moveTo(-r0 * 0.6, 0); ctx.lineTo(r0 * 0.6, 0); ctx.moveTo(0, -r0 * 0.6); ctx.lineTo(0, r0 * 0.6); }
    else if (f.s === 'rand') { ctx.moveTo(0, -r0); ctx.lineTo(r0 * 0.5, r0 * 0.4); ctx.lineTo(-r0 * 0.4, 0); ctx.lineTo(r0 * 0.3, -r0 * 0.5); }
    else { ctx.arc(0, 0, r0 * 0.55, 0, Math.PI * 2); }   // rainbow 环形
    ctx.stroke();
    ctx.restore();
    // 中心白点
    ctx.globalAlpha = (1 - p) * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(f.x, f.y, 2 + (1 - p) * 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** v5.6 特殊块引爆：预告警示（前 25%）→ 多层爆环 + 放射线 + 粒子迸发（级联延迟由 f.t<0 控制） */
  fxSpecialBlast(ctx, f) {
    const dur = f.dur || 0.5;
    const p = Math.min(1, f.t / dur);
    const cell = f.cell || 46;
    const col = f.s === 'rand' ? '#c69aff'
      : (f.s === 'rainbow' ? '#ffffff'
        : (f.color && COLOR_FILL[f.color] ? COLOR_FILL[f.color] : '#ffffff'));
    // 预告帧（前 25%）：波及格红框警示闪烁 / 主块白闪蓄力
    if (p < 0.25) {
      const q = p / 0.25;
      ctx.globalAlpha = (0.3 + 0.5 * Math.abs(Math.sin(q * Math.PI * 3))) * (1 - q * 0.5);
      ctx.strokeStyle = f.main ? '#ffffff' : '#ff4d5e';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(f.x - cell / 2 + 3, f.y - cell / 2 + 3, cell - 6, cell - 6);
      if (f.main) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = (1 - q) * 0.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, 4 + q * 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    const bp = (p - 0.25) / 0.75;   // 爆炸段 0..1
    ctx.globalAlpha = (1 - bp) * 0.9;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 波及格小闪：十字星 + 外扩环
    const r = 5 + bp * 10;
    ctx.beginPath();
    ctx.moveTo(f.x - r, f.y); ctx.lineTo(f.x + r, f.y);
    ctx.moveTo(f.x, f.y - r); ctx.lineTo(f.x, f.y + r);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.5, 0, Math.PI * 2); ctx.stroke();
    if (f.main) {
      // 主爆：类型刃线 + 第二层爆环 + 放射线 + 中心白闪 + 粒子
      const R = 30 + bp * 46;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      if (f.s === 'row') { ctx.moveTo(f.x - R, f.y); ctx.lineTo(f.x + R, f.y); }
      else if (f.s === 'col') { ctx.moveTo(f.x, f.y - R); ctx.lineTo(f.x, f.y + R); }
      else if (f.s === 'cross') {
        ctx.moveTo(f.x - R, f.y); ctx.lineTo(f.x + R, f.y);
        ctx.moveTo(f.x, f.y - R); ctx.lineTo(f.x, f.y + R);
      } else if (f.s === 'split') {
        ctx.moveTo(f.x - R * 0.7, f.y); ctx.lineTo(f.x + R * 0.7, f.y);
        ctx.moveTo(f.x, f.y - R * 0.7); ctx.lineTo(f.x, f.y + R * 0.7);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(f.x - R * 0.7, f.y - R * 0.7); ctx.lineTo(f.x + R * 0.7, f.y + R * 0.7);
        ctx.moveTo(f.x + R * 0.7, f.y - R * 0.7); ctx.lineTo(f.x - R * 0.7, f.y + R * 0.7);
      } else if (f.s === 'rand') {
        for (let i = 0; i <= 4; i++) {
          const q = i / 4;
          const xx = f.x + (i % 2 ? -1 : 1) * R * 0.42;
          const yy = f.y + (q - 0.5) * R * 1.25 + Math.sin(i * 3 + f.t * 9) * 6;
          if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
      } else if (f.s === 'rainbow') {
        const colors = ['#ff6174', '#ffad54', '#ffe36a', '#7ee4a1', '#78c8ff', '#c09aff'];
        colors.forEach((cc, i) => {
          ctx.strokeStyle = cc; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 10 + bp * 30 + i * 4, (i * Math.PI) / 3, (i * Math.PI) / 3 + 1.6);
          ctx.stroke();
        });
        ctx.strokeStyle = '#ffffff';
      }
      ctx.stroke();
      // 第二层类型色爆环
      ctx.globalAlpha = (1 - bp) * 0.55;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.55 + bp * 14, 0, Math.PI * 2); ctx.stroke();
      // 放射线
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + bp * 0.5;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * R * 0.6, f.y + Math.sin(a) * R * 0.6);
        ctx.lineTo(f.x + Math.cos(a) * R * 0.9, f.y + Math.sin(a) * R * 0.9);
        ctx.stroke();
      }
      // 中心白闪
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x, f.y, 6 + (1 - bp) * 10, 0, Math.PI * 2); ctx.fill();
      // 粒子迸发
      if (f.parts) {
        f.parts.forEach((pt) => {
          const qq = bp * 0.75;
          const px = f.x + pt.dx * pt.sp * qq;
          const py = f.y + pt.dy * pt.sp * qq;
          ctx.globalAlpha = (1 - bp) * 0.95;
          ctx.fillStyle = pt.col;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(pt.rot + bp * 2);
          ctx.fillRect(-pt.sz / 2, -pt.sz / 2, pt.sz, pt.sz);
          ctx.restore();
        });
      }
    }
    ctx.globalAlpha = 1;
  }

  /** v5.6 全屏爆闪：特殊块引爆瞬间整屏闪（0.14s 渐隐；v5.6.8 支持自定义颜色/强度，用于五消金色爆闪） */
  fxScreenFlash(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.14));
    const col = f.color || '#ffffff';
    const a = f.alpha != null ? f.alpha : 0.14;
    ctx.globalAlpha = (1 - p) * a;
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, CONFIG.DESIGN.W, CONFIG.DESIGN.H);
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·彩虹生成：七色旋转光柱 + 光环升腾（0.55s） */
  fxRainbowSpawn(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.55));
    const e = 1 - p;
    const R = f.cell || 46;
    const COLORS = ['#ff6174', '#ffad54', '#ffe36a', '#7ee4a1', '#78c8ff', '#c09aff'];
    // 光环：七色分段圆弧旋转 + 收缩
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(p * 2.4);
    const rr = R * (0.55 + e * 0.55);
    COLORS.forEach((cc, i) => {
      ctx.strokeStyle = cc; ctx.lineWidth = 3 + e * 3;
      ctx.globalAlpha = (1 - p) * 0.95;
      ctx.beginPath();
      ctx.arc(0, 0, rr, (i / 6) * Math.PI * 2, (i / 6 + 0.42) * Math.PI * 2);
      ctx.stroke();
    });
    // 升腾光柱（上细下粗）
    ctx.globalAlpha = (1 - p) * 0.6;
    const rise = Math.min(1, p * 1.5);
    const grad = ctx.createLinearGradient(0, R * 0.5, 0, -R * (1.2 + rise * 0.8));
    grad.addColorStop(0, '#ffe36a');
    grad.addColorStop(1, 'rgba(255,227,106,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-R * 0.18, R * 0.5);
    ctx.lineTo(R * 0.18, R * 0.5);
    ctx.lineTo(R * 0.06, -R * (1.1 + rise * 0.8));
    ctx.lineTo(-R * 0.06, -R * (1.1 + rise * 0.8));
    ctx.closePath();
    ctx.fill();
    // 中心白点脉冲
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 3 + e * 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·自动扫描：金色光幕从棋盘顶扫到底，扫过格金色描边高亮（0.5s） */
  fxScanSweep(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.5));
    const { w, h, cell } = f;
    const sy = f.y + p * h;   // 光幕前沿 y
    // 光幕主体：横向渐亮带
    const band = 34;
    const grad = ctx.createLinearGradient(0, sy - band, 0, sy);
    grad.addColorStop(0, 'rgba(255,217,77,0)');
    grad.addColorStop(1, 'rgba(255,217,77,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(f.x, sy - band, w, band);
    // 前沿线
    ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(f.x, sy); ctx.lineTo(f.x + w, sy); ctx.stroke();
    // 已扫过格子金色描边（间隔闪烁，增强"扫过"感）
    ctx.globalAlpha = 0.5 * (1 - p * 0.5);
    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 1.2;
    const rows = Math.max(1, Math.floor((sy - f.y) / cell));
    for (let r = 0; r < rows && r < h / cell; r++) {
      for (let c = 0; c < w / cell; c++) {
        if ((r + c) % 2) continue;
        ctx.strokeRect(f.x + c * cell + 2, f.y + r * cell + 2, cell - 4, cell - 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·染色：该色涟漪两圈扩散 + 染色格水波闪光 */
  fxRecolorWave(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.4));
    const cell = f.cell || 46;
    const col = (f.color && COLOR_FILL[f.color]) || '#7ee4a1';
    ctx.globalAlpha = (1 - p) * 0.85;
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const ph = (p * 1.4 + k * 0.5) % 1;
      const r = cell * (0.4 + ph * 3.2);
      ctx.lineWidth = 3 * (1 - ph) + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    // 染色格水波闪光（命中格按距离扩散期渐现）
    (f.cells || []).forEach(([gx, gy], i) => {
      const s = 1 - Math.min(1, Math.max(0, (p * 2.2 - i * 0.07)));
      if (s <= 0) return;
      ctx.globalAlpha = s * 0.65;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(gx, gy, 3 + (1 - s) * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      ctx.globalAlpha = s * 0.3;
      ctx.beginPath(); ctx.arc(gx, gy, cell * 0.32 * s, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·随机播种：星光从五消中心射向播种格 + 落地闪光环 */
  fxSeedStar(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.5));
    const q = Math.max(0, p);
    const x = f.x + (f.tx - f.x) * q;
    const y = f.y + (f.ty - f.y) * q;
    // 星光本体（十字芒 + 光点）
    ctx.globalAlpha = q < 0.98 ? 1 : (1 - p) * 1;
    ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    // 轨迹拖尾
    ctx.strokeStyle = 'rgba(255,227,106,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(f.x + (f.tx - f.x) * Math.max(0, q - 0.14), f.y + (f.ty - f.y) * Math.max(0, q - 0.14)); ctx.lineTo(x, y); ctx.stroke();
    // 落地闪光环
    if (q >= 0.92) {
      const lp = (q - 0.92) / 0.08;
      ctx.globalAlpha = (1 - lp) * 0.9;
      ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(f.tx, f.ty, 4 + lp * 16, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = (1 - lp) * 0.7;
      ctx.beginPath(); ctx.arc(f.tx, f.ty, 8 * (1 - lp) + 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** v5.6.8 五消·彩虹全消粒子雨：目标色方块碎裂粒子从棋盘格升腾下落 */
  fxRainParticle(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 0.8));
    const cell = f.cell || 46;
    const col = (f.color && COLOR_FILL[f.color]) || '#ffffff';
    ctx.globalAlpha = (1 - p) * 0.9;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const s = (i / n + p * 0.3) % 1;
      const dx = Math.sin(i * 2.4 + p * 5) * cell * 0.4;
      const dy = -cell * 0.5 * s + Math.cos(i * 3.1) * cell * 0.12;
      const sz = 3 + (1 - s) * 3;
      ctx.fillStyle = col;
      ctx.save();
      ctx.translate(f.x + dx, f.y + dy);
      ctx.rotate(p * 4 + i);
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }


  /** 三选一弹层（波末/升级强化）v5：横向三卡；入场错峰上浮 + 徽章图标 + 渐变描边 + 呼吸光晕（v1.16.7 美化） */
  pickLayer(ctx, group, pending, onPick) {
    const w = L.pickLayer.w, h = L.pickLayer.h;
    // v1.16.56：面板整体上移 110px（y≈373，面板底 1033 在塔位区顶 1042 上方）——露出下方防御塔区，暂停时可点击查看塔详情
    const x = (750 - w) / 2, y = (LOGIC_H - h) / 2 - 160;
    // v1.16.7 入场动效：面板淡入 + 三卡错峰上浮（首次渲染锁定时间基准）
    if (!group._pickT0) group._pickT0 = Date.now();
    const now = Date.now();
    const inT = (now - group._pickT0) / 1000;
    const inK = Math.min(1, inT / 0.28);          // 面板整体淡入
    // 遮罩（v1.16.56 透明度 0.42→0.28：面板上移后需让下方防御塔区清晰可见可点）
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
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
    // v1.16.45 移除顶部「待选 ×N」胶囊与分隔线（用户要求），卡片区整体上移，三卡垂直布局重排：
    //   图标 → 技能名 → 分支标签 → 描述面板 → 确认按钮，互不重叠且描述不压按钮
    // 候选卡片：横向三卡并排；卡框/顶部条/按钮/图标底色 = 所属塔色（v1.7 用户要求）
    // v1.16.55：卡片上移 28px 且加高 48px（472→520）；v1.16.57：整体下移 30px（topY = y+94）兼顾下方塔区露出
    const gap = 16;
    const cardW = (w - 56 - gap * 2) / 3;     // (640-56-32)/3 = 184
    const cardH = 520;                        // v1.16.55 原 h-118-70=472 → 520（上下各扩 24/28）
    const topY = y + 94;                      // v1.16.57 原 y+64，整体下移 30px
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
      // v1.16.92 三态细分：新技能 / 新分支（branchLv 0→1）/ 分支升级（branchLv ≥1）
      const isSkill = !isBranch;
      const isNewBranch = isBranch && (ef.branchLv || 0) === 0;
      const isUpgrade = isBranch && !isNewBranch;
      const targetLv = isBranch ? (ef.branchLv + 1) : 1;   // 选择后达到的等级
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
      // v1.16.57 来源塔标签：卡片正上方、宽度=卡片宽、仅塔名（去掉「（P1）」类括号后缀）、无圆点、字号 21→31
      //（fromKey/fromName/fromTint 沿用上方已有定义；tName 等可能含「炮塔（P1）」后缀）
      const tagSize = 31;
      const srcTxt = String(fromName || '').replace(/（[^）]*）|\([^)]*\)/g, '');
      const srcX = cx, srcY = topY - 46, srcW = cardW, srcH = 44;   // v1.17.2 标签下移（topY-46），与顶部候选名行错开
      const srcGrad = ctx.createLinearGradient(0, srcY, 0, srcY + srcH);
      srcGrad.addColorStop(0, lighten(fromTint, 1.25));
      srcGrad.addColorStop(1, '#1c2634');
      fillRoundRect(ctx, srcX + 2, srcY + 3, srcW, srcH, 24, 'rgba(0,0,0,0.35)');
      fillRoundRect(ctx, srcX, srcY, srcW, srcH, 24, srcGrad);
      strokeRoundRect(ctx, srcX, srcY, srcW, srcH, 24, 'rgba(255,255,255,0.5)', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      fillRoundRect(ctx, srcX + 6, srcY + 4, srcW - 12, 12, 6, ctx.fillStyle);
      // v1.16.59 文字垂直居中（text 的 y 为中线：y = 胶囊中心 srcY+srcH/2）
      text(ctx, srcTxt, cx + cardW / 2, srcY + srcH / 2, tagSize, '#ffffff', 'center');
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
      // v1.16.55 来源塔标签已移至卡片正上方，卡内不再绘制塔名条
      // v1.16.55 技能图标区（iconCy=topY+86，六边形徽章 50px，图标 88px 素材区 topY+42~130；
      // 来源塔标签已移至卡外，卡内顶部仅保留「目标」胶囊，与图标区互不重叠）
      const iconCx = cx + cardW / 2, iconCy = topY + 86, ir = 50;
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
      // v1.16.27：技能图标 = 美术图片（88px；垂直居中，水平右移 4px 中和 Lv 角标/素材残余左偏），缺失回退 emoji
      const skImg = drawImg(ctx, skillIconSrc(ef.fromTower, ef.name), iconCx - 40, iconCy - 44, 88, 88);
      if (!skImg) text(ctx, defOf(ef.name, ef.fromTower).icon || (ef.name[0] || '?'), iconCx + 4, iconCy + 6, 52, '#ffffff', 'center');
      // v1.17.2 图标下方三菱形 = 「三选一」标识（金色小菱形横排，随卡呼吸微动）
      const d0 = iconCx - 12, dY = iconCy + ir + 9;
      ctx.save();
      ctx.globalAlpha = cAlpha * (0.8 + 0.2 * breathe);
      for (let k = 0; k < 3; k++) {
        const dx = d0 + k * 12;
        ctx.save();
        ctx.translate(dx, dY);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#f7c948';
        ctx.fillRect(-4.5, -4.5, 9, 9);
        ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha = cAlpha;
      // 等级角标（v1.16.93 三态：新技能=NEW 黄底 / 新分支=黄底 Lv0 / 升级=暗底当前等级）
      const badgeBg = isUpgrade ? '#2c3542' : '#f7c948';
      fillRoundRect(ctx, iconCx + ir - 16, iconCy - ir + 2, 40, 40, 20, badgeBg);
      strokeRoundRect(ctx, iconCx + ir - 16, iconCy - ir + 2, 40, 40, 20, 'rgba(255,255,255,0.6)', 1.5);
      text(ctx, isSkill ? 'NEW' : (isNewBranch ? 'Lv0' : `Lv${ef.branchLv}`), iconCx + ir + 4, iconCy - ir + 24, isSkill ? 16 : 19, isUpgrade ? '#ffffff' : '#1a1a1a', 'center');
      // v1.16.55 技能名（金色 40px 大字，nameY=topY+182，与图标底 130 留 12px、与下方标签留 20px）
      const nameY = topY + 182;
      // v1.16.57 分支标签胶囊：新技能/分支标签整体下移 10px（tY = nameY+30）；
      //   分支文字较长（分支名 · LvX → Y）时字号 21→最小 16 自适应，保证胶囊不超出卡片外框
      const tSize = 21;
      // v1.17.2 标签区三态：
      //   学习技能（isSkill） = 「新技能」单胶囊（保持原样）
      //   确认分支（isNewBranch，分支 Lv0→1） = 三个分支名胶囊并排，本次确认的分支金色高亮，其余两个暗色
      //   分支升级（isUpgrade） = 「LvX → LvY」金色单胶囊
      const tagGlow = 0.20 + 0.12 * breathe;
      const tY = nameY + 30;
      if (isNewBranch) {
        const skillCfg = defOf(ef.name, ef.fromTower);
        const brKeys = ['a', 'b', 'c'];
        const brNames = brKeys.map((k) => this.branchName(skillCfg, k));
        const brW = cardW - 16;
        const g1 = 8;
        const bCellW = (brW - g1 * 2) / 3;
        const bH = 34;
        const selIdx = { A: 0, B: 1, C: 2 }[ef.branch] ?? 0;
        brNames.forEach((bn, bi) => {
          const bx = cx + 8 + bi * (bCellW + g1);
          const bSize = bi === selIdx ? 18 : 16;
          if (bi === selIdx) {
            // 金色高亮胶囊 = 本次确认的分支方向
            const tGrad = ctx.createLinearGradient(0, tY, 0, tY + bH);
            tGrad.addColorStop(0, lighten('#f7c948', 1.2));
            tGrad.addColorStop(1, '#d99e16');
            ctx.globalAlpha = cAlpha * tagGlow;
            fillRoundRect(ctx, bx - 2, tY - 2, bCellW + 4, bH + 4, 19, '#f7c948');
            ctx.globalAlpha = cAlpha;
            fillRoundRect(ctx, bx, tY, bCellW, bH, 17, tGrad);
            strokeRoundRect(ctx, bx, tY, bCellW, bH, 17, '#ffedb0', 2);
            text(ctx, bn, bx + bCellW / 2, tY + bH / 2 + 1, bSize, '#5c4a00', 'center');
          } else {
            // 另两个分支：暗色普通胶囊
            fillRoundRect(ctx, bx + 2, tY + 2, bCellW - 4, bH - 4, 15, 'rgba(0,0,0,0.35)');
            strokeRoundRect(ctx, bx + 2, tY + 2, bCellW - 4, bH - 4, 15, 'rgba(255,255,255,0.25)', 1);
            text(ctx, bn, bx + bCellW / 2, tY + bH / 2 + 1, bSize, 'rgba(255,255,255,0.55)', 'center');
          }
        });
      } else if (isSkill) {
        // 学习技能：单胶囊「新技能」（保持原样）
        const tagTxt = '新技能';
        let tSizeA = tSize;
        let tW = txtW(tagTxt, tSizeA) + 34;
        while (tW > cardW - 20 && tSizeA > 16) { tSizeA -= 1; tW = txtW(tagTxt, tSizeA) + 34; }
        ctx.font = `bold ${tSizeA}px sans-serif`;
        const tX = cx + cardW / 2 - tW / 2;
        fillRoundRect(ctx, tX + 2, tY + 3, tW, 38, 19, 'rgba(0,0,0,0.32)');
        const sGrad = ctx.createLinearGradient(0, tY, 0, tY + 38);
        sGrad.addColorStop(0, lighten(fromTint, 1.25));
        sGrad.addColorStop(1, '#243e57');
        ctx.globalAlpha = cAlpha * tagGlow;
        fillRoundRect(ctx, tX - 3, tY - 3, tW + 6, 44, 22, fromTint);
        ctx.globalAlpha = cAlpha;
        fillRoundRect(ctx, tX, tY, tW, 38, 19, sGrad);
        strokeRoundRect(ctx, tX, tY, tW, 38, 19, 'rgba(255,255,255,0.55)', 1.5);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        fillRoundRect(ctx, tX + 5, tY + 3, tW - 10, 10, 5, ctx.fillStyle);
        text(ctx, tagTxt, cx + cardW / 2, tY + 21, tSizeA, '#ffffff', 'center');
      } else {
        // 分支升级（v5.4）：三胶囊并排，金色高亮本次升级的分支方向（与确认分支一致），
        //   让玩家明确看到升级的是哪个分支（原单胶囊「LvX → LvY」不显示分支方向）
        const skillCfg = defOf(ef.name, ef.fromTower);
        const brKeys = ['a', 'b', 'c'];
        const brNames = brKeys.map((k) => this.branchName(skillCfg, k));
        const brW = cardW - 16;
        const g1 = 8;
        const bCellW = (brW - g1 * 2) / 3;
        const bH = 34;
        const selIdx = { A: 0, B: 1, C: 2 }[ef.branch] ?? 0;
        brNames.forEach((bn, bi) => {
          const bx = cx + 8 + bi * (bCellW + g1);
          const bSize = bi === selIdx ? 18 : 16;
          if (bi === selIdx) {
            const tGrad = ctx.createLinearGradient(0, tY, 0, tY + bH);
            tGrad.addColorStop(0, lighten('#f7c948', 1.2));
            tGrad.addColorStop(1, '#d99e16');
            ctx.globalAlpha = cAlpha * tagGlow;
            fillRoundRect(ctx, bx - 2, tY - 2, bCellW + 4, bH + 4, 19, '#f7c948');
            ctx.globalAlpha = cAlpha;
            fillRoundRect(ctx, bx, tY, bCellW, bH, 17, tGrad);
            strokeRoundRect(ctx, bx, tY, bCellW, bH, 17, '#ffedb0', 2);
            text(ctx, bn, bx + bCellW / 2, tY + bH / 2 + 1, bSize, '#5c4a00', 'center');
          } else {
            fillRoundRect(ctx, bx + 2, tY + 2, bCellW - 4, bH - 4, 15, 'rgba(0,0,0,0.35)');
            strokeRoundRect(ctx, bx + 2, tY + 2, bCellW - 4, bH - 4, 15, 'rgba(255,255,255,0.25)', 1);
            text(ctx, bn, bx + bCellW / 2, tY + bH / 2 + 1, bSize, 'rgba(255,255,255,0.55)', 'center');
          }
        });
      }
      // 技能名（金色大字 + 轻微阴影）
      text(ctx, ef.name, cx + cardW / 2 + 1, nameY + 2, 40, 'rgba(0,0,0,0.35)', 'center');
      text(ctx, ef.name, cx + cardW / 2, nameY, 40, '#f7c948', 'center');
      // v1.16.57 描述区玻璃面板（panelY=topY+272，胶囊下方留 22px；字号 21、行距 30，最多 4 行），
      // 超出截断加省略号，与下方「确认激活/升级」按钮保持间距
      const desc = descOf(ef);
      const rawLines = wrapLines(desc, 8);
      const clipped = rawLines.length > 4;
      const lines = rawLines.slice(0, 4);
      if (clipped) lines[3] = lines[3] + '…';
      const panelY = topY + 272;
      const panelH = lines.length * 30 + 34;
      fillRoundRect(ctx, cx + 8, panelY, cardW - 16, panelH, 12, 'rgba(0,0,0,0.26)');
      strokeRoundRect(ctx, cx + 8, panelY, cardW - 16, panelH, 12, 'rgba(255,255,255,0.08)', 1);
      lines.forEach((ln, li) => {
        text(ctx, ln, cx + cardW / 2, panelY + 22 + li * 30, 21, '#c7d1dc', 'center');
      });
      // 按钮文案（v1.17.2 两态）：新技能=学习技能 / 分支（新分支+升级）=确认分支
      const btnW = cardW - 28, btnH = 56, btnX = cx + 14, btnY = topY + cardH - btnH - 16;
      const btnCol = upgrading ? '#f7c948' : fromTint;
      const btnDark = upgrading ? '#d99e16' : '#243e57';
      // v1.17.9c 三态按钮文案：学习技能（新技能）/ 选择分支（新分支 Lv0→1）/ 确认升级（分支升级）
      const btnTxt = isSkill ? '学习技能' : (isNewBranch ? '选择分支' : '确认升级');
      fillRoundRect(ctx, btnX + 2, btnY + 4, btnW, btnH, 14, 'rgba(0,0,0,0.30)');
      const btnGrad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      btnGrad.addColorStop(0, lighten(btnCol, 1.25));
      btnGrad.addColorStop(1, btnDark);
      fillRoundRect(ctx, btnX, btnY, btnW, btnH, 14, btnGrad);
      strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 14, 'rgba(255,255,255,0.35)', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      fillRoundRect(ctx, btnX + 6, btnY + 5, btnW - 12, 14, 7, ctx.fillStyle);
      text(ctx, btnTxt, btnX + btnW / 2, btnY + btnH / 2, 26, upgrading ? '#5c4a00' : '#ffffff', 'center');
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
    text(ctx, `银币 +${fmtNum(s.waveClear.waveGold)}`, x + w / 2, y + 188, 24, '#c9d6e4', 'center');
    if (s.waveClear.pending > 0) {
      text(ctx, `特效强化待选 ${s.waveClear.pending} 次`, x + w / 2, y + 232, 20, '#9fb2c3', 'center');
    } else {
      text(ctx, '防线稳固，继续守卫', x + w / 2, y + 232, 20, '#9fb2c3', 'center');
    }
    return button(ctx, x + 90, y + h - 86, w - 180, 56,
      s.waveClear.pending > 0 ? '开始强化 →' : '下一波 →', { bg: '#27ae60', fontSize: 26 });
  }

  /* ---------- v1.17.21 结算页（全屏三段式骨架）----------
   * 设计稿：docs/深窟远征-战斗结算重设计示意图.html；布局/时间轴常量：CONFIG.GO
   * 本批：舞台 + 绶带/标题/meta + 深度轨迹 + 按钮 + 点击跳过（goT=99999 直达终点）；
   *       战利品区暂留旧图标阵列（v1.17.22 换 3 大卡 + 账单 + 里程碑条） */

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
      const np = this._goPh(T, TL.node0 + i * TL.nodeGap, 180);
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
      const icon = Math.min(66, CH * 0.55);
      this._goIcon(ctx, c.id, X + (CW - icon) / 2, Y + 8, icon);
      const def = CONFIG.relicRunDef(c.id);
      const name = def ? def.name : '?';
      const font = Math.min(19, 110 / Math.max(1, name.length), CH * 0.24);
      text(ctx, name, X + CW / 2, Y + CH - 16, font, '#eef3f8', 'center');
      text(ctx, '收益 ' + c.shards + ' 张', X + CW / 2, Y + CH + 15, 18, '#c9a6ff', 'center');
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

  toast(ctx, list) {
    list.forEach((t, i) => {
      const y = STATUS_H + 66 + i * 40;
      text(ctx, t.text, 375, y, 24, t.color || '#ffffff', 'center');
    });
  }

  /** 底部功能弹层：设置 / 帮助（共用遮罩+面板+关闭；v1.16.77 塔图鉴与商店弹层已移除） */
  funcLayer(ctx, layer, s, hits) {
    const w = 640, x = (750 - w) / 2;
    const heights = { setting: 500, help: 900 };   // v1.16.89 帮助面板加高容纳大字号换行；v1.16.107 设置面板加声音开关行
    const hgt = heights[layer.type] || 560;
    const y = (LOGIC_H - hgt) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    fillRoundRect(ctx, x, y, w, hgt, 18, '#232a34');
    strokeRoundRect(ctx, x, y, w, hgt, 18, '#3a6ea5', 3);
    const title = { setting: '设置', help: '帮助' }[layer.type] || '';
    text(ctx, title, 375, y + 52, 36, '#ffffff', 'center');
    if (layer.type === 'setting') {
      text(ctx, `版本 ${layer.version || 'v1.0.0'}`, 375, y + 118, 22, '#9fb2c3', 'center');
      // v1.16.107 声音开关行
      const sndOn = layer.soundOn !== false;
      text(ctx, '🔊 音效与背景音乐', x + 96, y + 176, 24, '#dfe6ee', 'left');
      hits.sound = button(ctx, x + 400, y + 148, 144, 56, sndOn ? '开' : '关', { bg: sndOn ? '#2b6d4f' : '#45505f', fontSize: 26 });
      // v1.16.107 重新开始（不清档）
      text(ctx, '重新开始将返回主界面重开一局：', 375, y + 240, 20, 'rgba(255,255,255,0.7)', 'center');
      text(ctx, '塔等级 · 金币 · 解锁进度全部保留', 375, y + 272, 20, 'rgba(255,255,255,0.55)', 'center');
      hits.confirm = button(ctx, x + 120, y + 306, 400, 70, '重新开始', { bg: '#2b6d4f', fontSize: 28 });
    } else if (layer.type === 'help') {
      // v1.16.89 帮助文档：字号加大（23px）、行距压缩、长句自动换行不出框
      const lines = [
        '1. 滑动相邻方块消除 3 连，获得对应颜色的塔并补充能量',
        '2. 塔每次普攻消耗 0.5 能量；能量耗尽时伤害降为 50%，技能周期延长',
        '3. 消除方块为塔升级，三选一强化技能（周期技能施放需消耗能量）',
        '4. 怪物到达城墙后开始攻城，城墙持续掉血',
        '5. 消灭一波全部怪物自动进入下一波；每 5 波有 Boss 镇守',
        '6. Boss 与精英怪掉落宝箱，点击开启获得圣遗物三选一',
        '7. 战斗中点底部功能条「商店」用局内银币购买本局临时强化',
        '8. 局内银币在战斗结束统一结算为金币（招财符可加成）',
        '9. 城墙血量归零即失败，注意防守',
      ];
      let hy = y + 90;
      lines.forEach((ln) => {
        const ls = this.wrapText(ctx, ln, w - 90, 24).slice(0, 3);
        const bh = ls.length * 30 + 12;
        fillRoundRect(ctx, x + 30, hy, w - 60, bh, 10, '#1d242e');
        ls.forEach((t2, li) => text(ctx, t2, x + 46, hy + 20 + li * 30, 24, '#d7dee6', 'left'));
        hy += bh + 6;
      });
    }
    hits.close = button(ctx, x + 150, y + hgt - 84, w - 300, 56, layer.type === 'setting' ? '返回主菜单' : '关闭', { bg: '#3a6ea5', fontSize: 26 });
  }

  /* ================= 主界面：三页签（战斗主页 / 商店 / 圣物）+ 子面板（v1.4：无配置页） ================= */
  /** v1.14 测试战场渲染层：状态条 + 战场（入口带/城墙/敌人/特效）+ 6 塔槽 + 刷怪控制 + 技能配置面板 */
  testFieldLayer(ctx, s, hits, enemies, fx, combat, damageNumbers) {
    const items = [];
    const push = (id, data, x, y, w, h) => items.push({ id, data, rect: { x, y, w, h }, hit: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h });
    // 背景
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    // 状态条（v1.16.30 整体下移避开灵动岛）
    const tgrad = ctx.createLinearGradient(0, 0, 0, STATUS_H);
    tgrad.addColorStop(0, '#16233a'); tgrad.addColorStop(1, '#0d1117');
    ctx.fillStyle = tgrad; ctx.fillRect(0, 0, 750, STATUS_H);
    push('tf_back', null, 8, 52, 80, 60);
    fillRoundRect(ctx, 16, 60, 64, 44, 10, 'rgba(255,255,255,0.1)');
    text(ctx, '◀', 48, 91, 28, '#ffffff', 'center');
    text(ctx, '测试战场', 320, 80, 26, '#ffffff', 'center');
    text(ctx, '城墙无敌 · 弹药恒满 · 免三消', 375, 104, 15, '#8ea3b8', 'center');
    push('tf_speed', null, 630, 54, 112, 56);
    const spdCol = s.speed >= 4 ? '#ff8c42' : s.speed >= 2 ? '#f7c948' : '#5b6b7c';
    this._speedBadge(ctx,636,58,100,48,s.speed);
    // v1.16.113 测试战场：本局圣遗物行（注入即显示；★3 角标 = 3★ 质变生效；点击查看详情）
    const rels = s.battleRelics || [];
    if (rels.length) {
      const rx = 130, ry = 116, rIcon = 24, rGap = 30, rMax = 10;
      const shown = rels.slice(0, rMax);
      shown.forEach((rc, i) => {
        const icx = rx + i * rGap + rIcon / 2;
        ctx.beginPath(); ctx.arc(icx, ry + rIcon / 2, 13, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.fill();
        ctx.strokeStyle = 'rgba(247,201,72,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
        const rSrc = relicIconSrc(rc.id);
        if (!(rSrc && drawImg(ctx, rSrc, rx + i * rGap + 1, ry + 1, rIcon - 2, rIcon - 2))) {
          text(ctx, rc.icon, icx, ry + rIcon / 2 + 2, 14, '#ffffff', 'center');
        }
        if (rc.star3) {
          fillRoundRect(ctx, icx + 8, ry - 3, 18, 13, 6, '#ffb347');
          text(ctx, '★3', icx + 17, ry + 10, 10, '#5c3800', 'center');
        }
      });
      text(ctx, `圣物 ×${rels.length} 点图标看详情`, rx + shown.length * rGap + 4, ry + rIcon / 2 + 3, 15, 'rgba(255,255,255,0.6)', 'left');
      this.relicBarHit = { x: rx, y: ry - 8, w: shown.length * rGap + 96, h: Math.min(rIcon + 16, AREA_Y + ENTRY_H - (ry - 8)) };
    } else {
      this.relicBarHit = null;
    }
    // 行动区底
    if (!drawImg(ctx, IMG_SRC.actionArea, 0, AREA_Y + ENTRY_H, 750, WALL_Y - (AREA_Y + ENTRY_H))) {
      fillRoundRect(ctx, AREA_X, AREA_Y + ENTRY_H, AREA_W, WALL_Y - AREA_Y - ENTRY_H, 8, '#151a21');
    }
    // 入口带
    fillRoundRect(ctx, AREA_X, AREA_Y, AREA_W, ENTRY_H, 8, '#1f2732');
    text(ctx, `敌人 ${s.enemyCount} 只`, AREA_X + 16, AREA_Y + ENTRY_H / 2, 20, '#9fb2c3');
    // v1.16.73 测试战场：添加圣遗物（三选一，可反复添加测试效果）
    push('tf_addRelic', null, 250, AREA_Y + 14, 140, 40);
    fillRoundRect(ctx, 250, AREA_Y + 14, 140, 40, 10, 'rgba(0,0,0,0.35)');
    strokeRoundRect(ctx, 250, AREA_Y + 14, 140, 40, 10, '#7ca8ff', 1.5);
    text(ctx, '＋ 添加圣遗物', 320, AREA_Y + 40, 15, '#7ca8ff', 'center');
    // v1.16.104 测试战场：添加 3★ 圣遗物（已拥有圣遗物按 3★ 质变生效测试）
    push('tf_addRelic3', null, 405, AREA_Y + 14, 140, 40);
    fillRoundRect(ctx, 405, AREA_Y + 14, 140, 40, 10, 'rgba(0,0,0,0.35)');
    strokeRoundRect(ctx, 405, AREA_Y + 14, 140, 40, 10, '#ffb347', 1.5);
    text(ctx, '✦ 3★ 圣遗物', 475, AREA_Y + 40, 15, '#ffb347', 'center');
    text(ctx, '点塔位配置技能', AREA_X + AREA_W - 150, AREA_Y + ENTRY_H / 2, 17, '#7cd6a6', 'right');
    // 防线血条（测试战场恒满；v1.17.11 血条改画在塔位行上方 1039，塔槽 1053 起不受遮挡）
    this.wall(ctx, s.lineHp, s.lineMaxHp, 1039);
    // 敌人与特效（位于战场区，不被控制条覆盖）；地面持续效果（毒池/毒棒）画在敌人下层
    if (combat) this.groundFx(ctx, combat);
    if (enemies) this.enemies(ctx, enemies);
    if (fx) this.fx(ctx, fx);
    this.damageNumbers(ctx, damageNumbers);
    // 塔位行：单塔出战（当前塔大槽）+ 6 塔切换钮（v1.14.1）
    const cur = (s.towers || [])[0] || null;
    if (!drawImg(ctx, IMG_SRC.towerRow, 0, 1042, 750, L.towerRow.h)) {   // v1.17.11 测试战场塔位行保持原 y1042（正式战场已上移至 967 即城墙）
      fillRoundRect(ctx, AREA_X, 1042, AREA_W, L.towerRow.h, 8, 'rgba(255,255,255,0.05)');
    }
    text(ctx, '出战塔', 65, 1042 + 16, 14, 'rgba(255,255,255,0.4)', 'center');
    if (cur) {
      push('tf_slot', cur.key, 15, 1053, 100, 100);
      const ix = 15 + (100 - L.towerIcon.size) / 2;
      const iy = 1053 + (100 - L.towerIcon.size) / 2;
      if (!drawImg(ctx, IMG_SRC[cur.key], ix, iy, L.towerIcon.size, L.towerIcon.size)) {
        drawTowerGlyph(ctx, cur.key, ix, iy, L.towerIcon.size);
      }
      // v1.17.10 等级小字（不再显示右上角数字徽章，避免遮挡塔图标）
      text(ctx, `Lv${cur.level}`, 15 + 50, 1053 + 100 - 10, 13, 'rgba(255,255,255,0.75)', 'center');
      // 能量竖条（槽内右侧；v1.16.77 弹药→能量）
      const aRatio = cur.ammoMax > 0 ? Math.min(1, (cur.ammo || 0) / cur.ammoMax) : 0;
      const bx = 15 + 100 - 9, by0 = 1053 + 8, bh = 100 - 16;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(bx, by0, 7, bh);
      ctx.fillStyle = aRatio <= 0 ? '#ff6b6b' : (aRatio < 0.34 ? '#ffb347' : '#7ef0a3');
      ctx.fillRect(bx, by0 + bh - Math.max(1, bh * aRatio), 7, Math.max(1, bh * aRatio));
      text(ctx, `${Math.floor(cur.ammo || 0)}`, bx + 3, 1053 + 5, 10, aRatio <= 0 ? '#ff6b6b' : 'rgba(255,255,255,0.7)', 'center');
    }
    // 6 塔切换钮
    text(ctx, '更换', 158, 1042 + 16, 14, 'rgba(255,255,255,0.4)', 'left');
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
    const cY = 1042 + L.towerRow.h;   // v1.17.11 测试战场塔位行基准 1042
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
    push('panel_bounds', null, px, py, pw, ph);
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

  _menuHeader(ctx, s, push) {
    if (!this._headerScreen) this._headerScreen = createMenuHeader({ drawImg, IMG_SRC, fmtK });
    return this._headerScreen(ctx, s, push);
  }

  menuLayer(ctx, s, hits) {
    const items = [];
    const push = (key, data, x, y, w, h) => items.push({ key, data, rect: { x, y, w, h }, hit: (px, py) => px >= x - 0.5 && px <= x + w + 0.5 && py >= y - 0.5 && py <= y + h + 0.5 });
    // v1.16.75 分页主题背景：每页一张氛围底图（未加载时回退纯色底）
    const theme = MENU_TAB_THEME[s.tab] || MENU_TAB_THEME.battle;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    drawImg(ctx, `assets/images/menubg/menu_${s.tab}.png`, 0, 0, 750, LOGIC_H);
    const grad = ctx.createLinearGradient(0, 0, 0, 236);
    grad.addColorStop(0, theme.top); grad.addColorStop(1, 'rgba(13,17,23,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 750, 236);
    this._menuHeader(ctx, s, push);
    // v1.17.10d 游戏名：单层金色渐变弧线标题，仅战斗页（战场卡正上方）显示；
    // 商店/图鉴/圣物三个分页背景不显示（各自页面顶部有页面标题）
    if (s.tab === 'battle') drawArchedTitle(ctx, '圣坛裂痕', 375, 352, 98, 1200, false);
    // 内容区（battle / shop / relic / codex）
    if (s.tab === 'battle') this.menuBattle(ctx, s, push);
    else if (s.tab === 'shop') this.menuShop(ctx, s, push);
    else if (s.tab === 'codex') this.menuCodex(ctx, s, push);
    else this.menuRelic(ctx, s, push);
    // v1.17.10c 底部大分页标签（4 个全部显示，不隐藏）：激活页签与页面"融为一体"——
    // 同主题色、仅上圆角、向上光束与页面呼应；未激活灰底全圆角明显区分
    const tabY = 1504, tabH = 100, tabW = 163, tabGap = 12, x0 = 31;
    const tabs = MENU_TABS;
    // 激活页签向上光束（页面↔页签的视觉连接）
    const ag = ctx.createLinearGradient(0, tabY - 70, 0, tabY);
    ag.addColorStop(0, 'rgba(0,0,0,0)');
    ag.addColorStop(1, theme.main + '55');
    ctx.fillStyle = ag; ctx.fillRect(x0, tabY - 70, tabW * 4 + tabGap * 3, 70);
    tabs.forEach(([key, icon, label], i) => {
      const tx = x0 + i * (tabW + tabGap);
      push('tab', key, tx, tabY, tabW, tabH);
      const active = s.tab === key;
      const th = MENU_TAB_THEME[key];
      if (active) {
        // 同页主题色渐变（上亮下稍暗）+ 仅上圆角，与屏幕底边贴合
        const tg = ctx.createLinearGradient(0, tabY, 0, tabY + tabH);
        tg.addColorStop(0, th.main); tg.addColorStop(1, th.dark);
        ctx.beginPath();
        ctx.moveTo(tx, tabY + tabH);
        ctx.lineTo(tx, tabY + 16);
        ctx.arcTo(tx, tabY, tx + 16, tabY, 16);
        ctx.lineTo(tx + tabW - 16, tabY);
        ctx.arcTo(tx + tabW, tabY, tx + tabW, tabY + 16, 16);
        ctx.lineTo(tx + tabW, tabY + tabH);
        ctx.closePath();
        ctx.fillStyle = tg; ctx.fill();
        // 顶部亮条
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        fillRoundRect(ctx, tx + 34, tabY, tabW - 68, 4, 2, ctx.fillStyle);
        text(ctx, icon + ' ' + label, tx + tabW / 2, tabY + 56, 30, '#ffffff', 'center');
      } else {
        fillRoundRect(ctx, tx, tabY, tabW, tabH, 16, 'rgba(20,26,36,0.92)');
        strokeRoundRect(ctx, tx, tabY, tabW, tabH, 16, '#2b3648', 1);
        text(ctx, icon + ' ' + label, tx + tabW / 2, tabY + tabH / 2, 26, '#8ea3b8', 'center');
      }
    });
    // 子面板
    if (s.panel) {
      if (['accountMenu', 'accountInfo', 'testProfile'].includes(s.panel.type)) AccountMenuScreen.draw(ctx, s, push, this._menuPanelShell.bind(this));
      else if (s.panel.type === 'fieldLocked') { this._menuPanelShell(ctx,s,push,'战场尚未解锁',320,true); text(ctx,s.panel.message,375,810,22,'#f0b45c','center'); }
      else if (s.panel.type === 'relicDex') this.menuRelicDex(ctx, s, push);
      else if (s.panel.type === 'relicInfo') this.menuRelicInfo(ctx, s, push);  // v1.16.78 圣遗物详情（1/2/3★ + 升星）
      else if (s.panel.type === 'starUp') this.menuStarUp(ctx, s, push);       // v1.16.76 圣遗物升星
      else if (s.panel.type === 'debug') this.debugPanel(ctx, s, push);        // v1.16.76 调试工具（仅 DEBUG 构建）
      else if (s.panel.type === 'codexSkill') this.codexSkillPanel(ctx, s, push); // v1.16.78 技能分支面板
      else if (s.panel.type === 'chestOpen') this.menuChestOpen(ctx, s, push);   // v1.17.9d 开箱弹窗（收益一次弹出）
      else if (s.panel.type === 'matchCfg') this.menuMatchCfg(ctx, s, push);     // v5.3 三消技能配置面板
      else if (s.panel.type === 'globalCfg') this.menuGlobalCfg(ctx, s, push);   // v5.3 全局技能配置面板
    }
    // v1.16.76 调试工具入口（仅 DEBUG 构建显示）
    if (s.debug) {
      push('debug', null, 668, 12, 64, 44);
      fillRoundRect(ctx, 668, 12, 64, 44, 10, 'rgba(90,108,128,0.25)');
      strokeRoundRect(ctx, 668, 12, 64, 44, 10, '#5a6c80', 1);
      text(ctx, '🛠', 700, 40, 24, '#c9d6e4', 'center');
    }
    hits = items;
    return hits;
  }

  /** 战斗主页：战场卡（v1.16.76 战场合约参数化：远古/熔岩/霜风/深渊/测试 5 战场共用一套卡片） */
  _getHomeScreen() {
    if (!this._homeScreen) this._homeScreen = createHomeScreen({ drawImg, skillRow: this._menuSkillRow.bind(this) });
    return this._homeScreen;
  }

  menuBattle(ctx, s, push) { return this._getHomeScreen().menuBattle(ctx, s, push); }

  /** 配置页：6 塔页签 → 该塔 3 技能槽（点击配置）+ 技能卡列表（默认灰显 / 卡升级） */
  /** 商店页 v1.17.9d：商品以 图标 + 价格 为主，少文字描述（每日精选 / 钻石兑换 / 广告 / 充值） */
  /** 商店页 v5.3c：自上而下 每日碎片精选 → 圣遗物宝箱（限购）→ 技能解锁 */
  _getMenuShopScreen() {
    if (!this._menuShopScreen) this._menuShopScreen = createMenuShopScreen({ drawImg, relicIconSrc, IMG_SRC, skillOwned: this._skillOwned.bind(this) });
    return this._menuShopScreen;
  }

  menuShop(ctx, s, push) { return this._getMenuShopScreen().menuShop(ctx, s, push); }

  /**
   * v1.17.9d 开箱弹窗：宝箱开启后收益一次性弹出（参考结算页圣遗物碎片动画——图标逐个弹跳出场）。
   * s.panel = { type:'chestOpen', mode:'deep'|'relic', gain?, reward?, tier? }
   */
  menuChestOpen(ctx, s, push) {
    const p = s.panel;
    const gain = p.gain || null;
    const reward = p.reward || null;
    // 收益条目（图标 + ×数量）
    const entries = [];
    if (gain) {
      if (gain.gold > 0) entries.push({ kind: 'img', src: IMG_SRC.coin, txt: `×${fmtFull(gain.gold)}`, col: '#f7c948' });
      if (gain.shards > 0) entries.push({ kind: 'glyph', glyph: '✦', txt: `×${gain.shards}`, col: '#c9a6ff' });
      if (gain.diamond > 0) entries.push({ kind: 'glyph', glyph: '💎', txt: `×${gain.diamond}`, col: '#7ca8ff' });
      if (gain.stone > 0) entries.push({ kind: 'glyph', glyph: '✪', txt: '×1', col: '#a86bff' });
      if (gain.card) entries.push({ kind: 'img', src: relicIconSrc(gain.card), txt: '×5', col: '#d9c2ff' });
    }
    if (reward) entries.push({ kind: 'img', src: relicIconSrc(reward.id), txt: '×1', col: '#d9c2ff' });
    if (!entries.length) entries.push({ kind: 'glyph', glyph: '✦', txt: '×0', col: '#8ea3b8' });
    // 宝箱中心图：深度宝箱 → 档位图标；圣物卡 → 全开帧
    const tierImg = { wood: IMG_SRC.chestWood, bronze: IMG_SRC.chestBronze, silver: IMG_SRC.chestSilver, gold: IMG_SRC.chestGold, star: IMG_SRC.chestStar };
    const chestSrc = (p.tier && tierImg[p.tier]) || IMG_SRC.chestOpen;
    const T = Date.now();
    const ph = (t0, dur) => Math.max(0, Math.min(1, (T - t0) / (dur || 260)));
    const eob = (t) => { const q = Math.max(0, Math.min(1, t)); return 1 + 2.70158 * Math.pow(q - 1, 3) + 1.70158 * Math.pow(q - 1, 2); };
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    const W = 560, H = 470, X = (750 - W) / 2, Y = (LOGIC_H - H) / 2;
    push('panelBounds', null, X, Y, W, H);
    const pin = ph(0, 200);
    ctx.save();
    ctx.globalAlpha = Math.min(1, pin * 1.6);
    fillRoundRect(ctx, X, Y, W, H, 18, '#241f16');
    strokeRoundRect(ctx, X, Y, W, H, 18, '#f7c948', 3);
    const tg = ctx.createLinearGradient(0, Y, 0, Y + 140);
    tg.addColorStop(0, 'rgba(247,201,72,0.20)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tg; ctx.fillRect(X, Y, W, 140);
    // 宝箱图标（开箱演出中心，弹跳出场）
    const cp = ph(120, 300);
    if (cp > 0) {
      ctx.save();
      ctx.translate(375, Y + 92);
      ctx.scale(Math.min(1.15, eob(cp)), Math.min(1.15, eob(cp)));
      ctx.globalAlpha = Math.min(1, cp * 1.6);
      if (!drawImg(ctx, chestSrc, -46, -46, 92, 92)) text(ctx, '📦', 0, 8, 64, '#f7c948', 'center');
      ctx.restore();
    }
    text(ctx, p.mode === 'relic' ? '获得圣物' : '宝箱开启', 375, Y + 172, 30, '#ffd34d', 'center');
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X + 44, Y + 196); ctx.lineTo(X + W - 44, Y + 196); ctx.stroke();
    // 收益条目一次弹出（图标×数量，逐个弹跳）
    const rowY = Y + 252;
    const ICON = 64, GAP = 152;
    const show = entries.slice(0, 3);
    const x0 = 375 - ((show.length * GAP - GAP + ICON) / 2);
    show.forEach((en, i) => {
      const pe = ph(320 + i * 180, 300);
      if (pe <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.min(1, pe * 1.8);
      ctx.translate(x0 + i * GAP, rowY);
      ctx.scale(Math.min(1.1, eob(pe)), Math.min(1.1, eob(pe)));
      ctx.beginPath(); ctx.arc(ICON / 2, ICON / 2, ICON / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(247,201,72,0.14)'; ctx.fill();
      ctx.strokeStyle = 'rgba(247,201,72,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
      if (en.kind === 'img') {
        if (!drawImg(ctx, en.src, 4, 4, ICON - 8, ICON - 8)) text(ctx, '✦', ICON / 2, ICON / 2 + 2, 26, en.col, 'center');
      } else {
        text(ctx, en.glyph, ICON / 2, ICON / 2 + 2, 30, en.col, 'center');
      }
      text(ctx, en.txt, ICON + 10, ICON / 2 + 5, 26, en.col, 'left');
      ctx.restore();
    });
    if (entries.length > 3) text(ctx, `+${entries.length - 3}`, x0 + 3 * GAP, rowY + ICON / 2, 22, '#f7c948', 'left');
    ctx.globalAlpha = 1;
    // 收下按钮（panelClose 语义：面板打开时通用关闭分发命中）
    push('panelClose', null, X + 90, Y + H - 88, W - 180, 62);
    fillRoundRect(ctx, X + 92, Y + H - 86, W - 184, 58, 14, '#2c3542');
    strokeRoundRect(ctx, X + 92, Y + H - 86, W - 184, 58, 14, '#f7c948', 1.6);
    text(ctx, '收 下', 375, Y + H - 57, 28, '#f7c948', 'center');
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* v1.16.78 圣遗物图鉴网格（主页与图鉴面板共用） */
  _getRelicScreen() {
    if (!this._relicScreen) this._relicScreen = createRelicScreen({
      drawImg, relicIconSrc, IMG_SRC, TIER_COLOR, fmtNum,
      panelShell: this._menuPanelShell.bind(this),
      wrapText: this.wrapText.bind(this),
    });
    return this._relicScreen;
  }

  _relicRunList() { return this._getRelicScreen()._relicRunList(); }
  _relicUnlocked(s, id) { return this._getRelicScreen()._relicUnlocked(s, id); }
  /** v1.17.20 可解锁态：未解锁但碎片已够阈值（蓝2/紫4/金8），由玩家在详情面板手动解锁 */
  _relicUnlockable(s, id) { return this._getRelicScreen()._relicUnlockable(s, id); }
  _relicRarColor(rar) { return this._getRelicScreen()._relicRarColor(rar); }

  /** v1.16.110 胶囊进度条：深色内凹槽 + 渐变填充（顶部内高光）+ 文字居中在胶囊内（图鉴卡片通用） */
  _capsuleBar(ctx, x, y, w, h, ratio, label, colTop, colBot) { return this._getRelicScreen()._capsuleBar(ctx, x, y, w, h, ratio, label, colTop, colBot); }

  /** 圣遗物图鉴网格：未解锁=黑底+稀有度色边+问号占位；已解锁=图标+名+星级；点卡查看 1/2/3★ */
  _menuRelicGrid(ctx, s, push, pageKey, showChest) { return this._getRelicScreen()._menuRelicGrid(ctx, s, push, pageKey, showChest); }

  /** 圣遗物主页（v1.16.82）：全部圣遗物单页滚动浏览（无分页）；卡片高 210（+40%）上1/3 图标居中留白 + 名字居中行 + 描述 */
  menuRelic(ctx, s, push) {
    this._relicMaxScroll = this._getRelicScreen().menuRelic(ctx, s, push);
  }

  /** 圣物图鉴面板：同主页网格（未解锁占位卡 / 已解锁可点详情） */
  menuRelicDex(ctx, s, push) { return this._getRelicScreen().menuRelicDex(ctx, s, push); }

  /** v5.3 主页技能配置行：左标签胶囊 + 3 槽位展示（三消=四连/高连/连消技能名；全局=槽位技能/空槽），整行可点击打开配置面板 */
  /** v5.3c 主页技能卡片行：左标签胶囊 + 3 张技能卡（图标 + 技能名 + 状态），点击卡片打开配置面板 */
  // Shared canvas-native emblems: distinct silhouettes without additional asset loading.
  _skillIcon(ctx, id, x, y, size, color) {
    return skillIcon(ctx, id, x, y, size, color);
  }

  _getSkillLoadout() {
    if (!this._skillLoadout) this._skillLoadout = createSkillLoadout({
      panelShell: this._menuPanelShell.bind(this),
      skillIcon: this._skillIcon.bind(this),
      wrapText: this.wrapText.bind(this),
    });
    return this._skillLoadout;
  }

  _menuSkillCards(ctx, s, push, label, cfg, x, y, w, h, isMatch, cardDX = 0) {
    return this._getSkillLoadout().skillCards(ctx, s, push, label, cfg, x, y, w, h, isMatch, cardDX);
  }

  /** v1.17.46 主页技能配置行：单行双分区（左全局 / 右三消），每区 2 卡，卡上无槽位文字 */
  _menuSkillRow(ctx, s, push, x, y, w, ch) {
    return this._getSkillLoadout().skillRow(ctx, s, push, x, y, w, ch);
  }

  /** v5.3c 技能是否已解锁（未购买过时按默认解锁集判定） */
  _skillOwned(s, slot, id) {
    return this._getSkillLoadout().skillOwned(s, slot, id);
  }

  /** v5.3c 三消技能配置面板：三行（四连 5 / 高连 4 / 连消 2），已解锁点选配置，未解锁点卡购买 */
  _skillChoiceCards(ctx, s, push, title, slot, items, current, tint) {
    return this._getSkillLoadout().skillChoiceCards(ctx, s, push, title, slot, items, current, tint);
  }

  menuMatchCfg(ctx, s, push) {
    return this._getSkillLoadout().menuMatchCfg(ctx, s, push);
  }

  menuGlobalCfg(ctx, s, push) {
    // v1.17.45 全局面板滚动：视口/最大滚动量回存 renderer，供 input/panel-scroll.js 使用
    const ret = this._getSkillLoadout().menuGlobalCfg(ctx, s, push);
    if (ret && ret.viewport) { this._globalCfgViewport = ret.viewport; this._globalCfgMaxScroll = ret.maxScroll; }
    return ret;
  }

  /** 圣遗物详情面板（v1.16.91 大字号重排）：垂直居中 · 头部图标/名称居中 + 1★/2★/3★ 三栏效果（当前等级金框）+ 碎片进度 + 底部居中升星按钮 */
  /** v1.17.1 圣遗物详情卡重做：左上稀有度徽章 → 大图标(200px) → 胶囊进度条(与图标同宽,内显进度) → 名称
   *   → 3★/2★/1★ 三行（星标圆=★★★/★★/★，当前星级高亮）→ 小号升级按钮(🪙 金币) */
  menuRelicInfo(ctx, s, push) { return this._getRelicScreen().menuRelicInfo(ctx, s, push); }

  /** 塔图鉴页（v1.16.78 重设计）：贴合式塔标签（active 与详情面板粘连）+ 技能卡片（美术图标、大字号、点卡看分支） */
  _getCodexScreen() {
    if (!this._codexScreen) this._codexScreen = createCodexScreen({
      drawImg, skillIconSrc, drawTowerGlyph, IMG_SRC, TOWER_HEX, MENU_TAB_THEME, lighten, hexA,
      wrapText: this.wrapText.bind(this),
    });
    return this._codexScreen;
  }

  menuCodex(ctx, s, push) {
    return this._getCodexScreen().menuCodex(ctx, s, push);
  }

  /** 塔图鉴详情：原布局等比缩至 2/3 后放大 10%，绘制与触摸区域使用相同变换。 */
  codexSkillPanel(ctx, s, push) {
    return this._getCodexScreen().codexSkillPanel(ctx, s, push);
  }

  /** v1.16.76 撤离决策层：每 10 波暂停，撤离拿深度池 100% / 继续深入阵亡保底 30% */
  evacuationLayer(ctx, g, hits) {
    const w = 620, h = 470, x = (750 - w) / 2, y = (LOGIC_H - h) / 2 - 40;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    // 暗金主窗口（呼应圣遗物三选一的显现仪式感）
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#2a2112'); bg.addColorStop(1, '#1d1a10');
    fillRoundRect(ctx, x, y, w, h, 20, bg);
    strokeRoundRect(ctx, x - 3, y - 3, w + 6, h + 6, 23, '#c8860a', 3);
    strokeRoundRect(ctx, x, y, w, h, 20, '#ffd34d', 1.5);
    text(ctx, `撤离决策 · 第 ${g.run.wave} 波`, 375, y + 64, 38, '#ffd34d', 'center');
    text(ctx, '深度收益池（撤离可全取，阵亡只保底 30%）', 375, y + 116, 21, '#c9b98a', 'center');
    // 收益池
    fillRoundRect(ctx, x + 50, y + 142, w - 100, 88, 14, 'rgba(247,201,72,0.10)');
    strokeRoundRect(ctx, x + 50, y + 142, w - 100, 88, 14, 'rgba(247,201,72,0.4)', 1);
    text(ctx, `💰 ${fmtNum(Math.round(g.depthPool))}`, 375, y + 182, 34, '#f7c948', 'center');
    text(ctx, `当前深度倍率 ×${g.depthMult.toFixed(2)}${g.run.wave < CONFIG.EVAC.lateWave ? `（继续 ×${CONFIG.EVAC.depthMult}）` : `（继续 ×${CONFIG.EVAC.depthMultLate}，收益递减期）`}`, 375, y + 212, 17, '#9fb2c3', 'center');
    // 里程碑预览
    const nextM = CONFIG.MILESTONES.find((m) => m > g.run.wave);
    if (nextM) text(ctx, `🏆 下一里程碑：${nextM} 波（首达一次大奖）`, 375, y + 256, 18, '#a86bff', 'center');
    // 按钮
    // v1.16.86 修复：button() 返回 {hit} 对象，dispatchTouch 按 .hit 调用；此前误存裸函数导致按钮永不命中
    hits.evacGo = button(ctx, x + 50, y + 292, w - 100, 76, '🚪 正常撤离 · 拿走 100%', { bg: '#2b6d4f', fontSize: 27 });
    hits.evacStay = button(ctx, x + 50, y + 382, w - 100, 76, '⚔ 继续前进 · 正常进入下一波', { bg: '#3a6ea5', fontSize: 25 });
  }

  /** v1.16.76 圣遗物升星面板：1★ 解锁 → 2★ 效果升级 → 3★ 质变（碎片+金币[+星辉石]） */
  menuStarUp(ctx, s, push) { return this._getRelicScreen().menuStarUp(ctx, s, push); }

  /** v1.16.76 调试工具面板（仅 CONFIG.DEBUG_ACCOUNT=true 时入口可见） */
  debugPanel(ctx, s, push) {
    this._menuPanelShell(ctx, s, push, '🛠 测试工具', 680);
    const acts = [
      ['dbg_gold', '💰 金币 +1000'], ['dbg_diamond', '💎 钻石 +100'],
      ['dbg_shard', '🧩 全碎片 +2'], ['dbg_unlock', '🔓 解锁全部圣遗物'],
      ['dbg_star3', '🌟 全圣遗物升3★'], ['dbg_stone', '⭐ 星辉石 +5'],
      ['dbg_chest', '📦 发放星辉宝箱'],
    ];
    acts.forEach(([k, label], i) => {
      const bx = 70 + (i % 2) * 310, by = 280 + Math.floor(i / 2) * 86;
      push(k, null, bx, by, 280, 64);
      fillRoundRect(ctx, bx, by, 280, 64, 12, 'rgba(90,108,128,0.18)');
      strokeRoundRect(ctx, bx, by, 280, 64, 12, '#5a6c80', 1);
      text(ctx, label, bx + 140, by + 38, 21, '#c9d6e4', 'center');
    });
    text(ctx, `bestWave ${s.bestWave || 0} · 仅调试构建可见`, 375, 620 + 60, 17, '#5a6c80', 'center');
  }

  /** 子面板外壳：遮罩 + 面板 + 标题 + 关闭（hgt 可自定义高度） */
  _menuPanelShell(ctx, s, push, title, hgt, centered, pw) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    const w = pw || 700, h = hgt || 640, x = (750 - w) / 2, y = centered ? Math.round((LOGIC_H - h) / 2) : 180;
    push('panelBounds', null, x, y, w, h);
    fillRoundRect(ctx, x, y, w, h, 18, '#232a34');
    strokeRoundRect(ctx, x, y, w, h, 18, '#3a6ea5', 3);
    text(ctx, title, 375, y + 54, 34, '#ffffff', 'center');
    push('panelClose', null, x + w - 76, y + 20, 52, 52);
    ctx.beginPath(); ctx.arc(x + w - 50, y + 46, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#3a4553'; ctx.fill();
    text(ctx, '✕', x + w - 50, y + 54, 26, '#ffffff', 'center');
    return y;
  }

  /** 战斗内圣物宝箱三选一弹层（精英掉落 · 暂停战斗）：3 个候选卡片，点选获取 */
  /** v1.16.74 圣物三选一：华丽金色主题 + 弹出动画（scale 0.62→1 渐入，300ms） */
  relicPickLayer(ctx, pick, onPick, elapsed, gold) {
    if (!pick || !pick.candidates) return;
    // v1.16.74 弹出动画：从宝箱中心(375,560) 0.5s 从小到大（easeOutBack 轻微回弹）
    const pe = Math.min(1, (elapsed || 0) / 500);
    const es = 1 + 2.70158 * Math.pow(pe - 1, 3) + 1.70158 * Math.pow(pe - 1, 2);
    const sc = pe >= 1 ? 1 : Math.max(0.2, es);
    const al = pe >= 1 ? 1 : Math.min(1, pe * 1.6);
    ctx.save();
    ctx.globalAlpha = al;
    ctx.translate(375, 560);
    ctx.scale(sc, sc);
    ctx.translate(-375, -560);

    const w = 640, h = 540; // v1.16.73 纵向扩容 420→500；v1.17 +40 容纳重掷按钮，描述三行防出框
    const x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    // 全屏遮罩：中心暖光、四角压暗（比纯黑更有"显现"感）
    const mask = ctx.createRadialGradient(375, 560, 60, 375, 560, 900);
    mask.addColorStop(0, 'rgba(30,20,6,0.78)');
    mask.addColorStop(1, 'rgba(8,6,10,0.92)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, 750, LOGIC_H);
    // 背景星光粒子（确定性伪随机闪烁）
    const now = Date.now();
    for (let i = 0; i < 26; i++) {
      const sx = (i * 97.3) % 750, sy = ((i * 61.7) % LOGIC_H);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(now / 700 + i * 1.37));
      ctx.fillStyle = i % 3 ? '#ffd34d' : '#fff6d8';
      ctx.globalAlpha = 0.35 * tw;
      ctx.beginPath(); ctx.arc(sx, sy, i % 4 === 0 ? 2.2 : 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = al;
    // 主窗口：暗金渐变底 + 双层金描边
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#2a2112'); bg.addColorStop(0.5, '#241b0e'); bg.addColorStop(1, '#1d1a10');
    fillRoundRect(ctx, x, y, w, h, 20, bg);
    strokeRoundRect(ctx, x - 3, y - 3, w + 6, h + 6, 23, '#c8860a', 3);
    strokeRoundRect(ctx, x, y, w, h, 20, '#ffd34d', 1.5);
    // 顶部金色光柱
    const beam = ctx.createLinearGradient(375, y - 6, 375, y + 120);
    beam.addColorStop(0, 'rgba(255,211,77,0.0)');
    beam.addColorStop(0.4, 'rgba(255,211,77,0.34)');
    beam.addColorStop(1, 'rgba(255,211,77,0.0)');
    ctx.fillStyle = beam;
    ctx.fillRect(375 - 90, y - 6, 180, 126);
    // 圣物纹章（菱形宝石）
    const gx = 375, gy = y + 44;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(Math.PI / 4);
    const gem = ctx.createLinearGradient(-12, -12, 12, 12);
    gem.addColorStop(0, '#fff2b3'); gem.addColorStop(0.5, '#ffd34d'); gem.addColorStop(1, '#c8860a');
    ctx.fillStyle = gem;
    ctx.fillRect(-12, -12, 24, 24);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(-12, -12, 24, 24);
    ctx.restore();
    text(ctx, '圣物显现', 375, y + 76, 38, '#ffd34d', 'center');
    text(ctx, '获得圣遗物本局生效 · 塔圣遗物仅对应塔在场时出现', 375, y + 112, 18, '#c9b27a', 'center');
    // 3 个候选卡片（v1.16.73 纵向扩容：bh 240→300）
    const bw = 188, bh = 300, gap = 16;
    const startX = (750 - (bw * 3 + gap * 2)) / 2;
    const cy = y + 138;
    pick.candidates.forEach((c, i) => {
      const cx = startX + i * (bw + gap);
      const tint = c.tint ? (TOWER_TINT[c.tint] || '#f7c948') : '#f7c948';
      // 卡片：暗金底 + 金色描边 + 外侧柔光
      const cg = ctx.createLinearGradient(0, cy, 0, cy + bh);
      cg.addColorStop(0, '#2b2313'); cg.addColorStop(1, '#211b0e');
      fillRoundRect(ctx, cx, cy, bw, bh, 16, cg);
      strokeRoundRect(ctx, cx, cy, bw, bh, 16, 'rgba(255,211,77,0.85)', 1.8);
      const glow = ctx.createRadialGradient(cx + bw / 2, cy + 76, 20, cx + bw / 2, cy + 76, 130);
      glow.addColorStop(0, tint + '38'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx + bw / 2, cy + 76, 130, 0, Math.PI * 2); ctx.fill();
      // 图标：双环发光（外环 tint 呼吸 + 内环白描）
      const dia = 100;
      const icx = cx + bw / 2, icy = cy + 76;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2, 0, Math.PI * 2);
      ctx.fillStyle = tint + '2e'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = tint; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2 + 5, 0, Math.PI * 2); ctx.stroke();
      const cSrc = relicIconSrc(c.id);
      if (!(cSrc && drawImg(ctx, cSrc, icx - dia / 2, icy - dia / 2, dia, dia))) {
        text(ctx, c.icon, icx, icy + 4, 48, '#ffffff', 'center');
      }
      text(ctx, c.name, cx + bw / 2, cy + 158, 25, '#ffe9a8', 'center');
      // 效果描述（按宽度换行，最多 3 行，防出框）
      const d = c.desc || '';
      const maxW = bw - 20;
      const lines = [];
      let cur = '';
      for (const ch of d) {
        const test = cur + ch;
        const testW = test.length * 16 + (test.match(/[A-Za-z0-9.%+\-×]/g) || []).length * 4;
        if (testW > maxW && cur) { lines.push(cur); cur = ch; if (lines.length >= 3) break; }
        else cur = test;
      }
      if (lines.length < 3 && cur) lines.push(cur);
      lines.forEach((ln, li) => {
        text(ctx, ln, cx + bw / 2, cy + 190 + li * 22, 16, '#c9b27a', 'center');
      });
      // 选择按钮：金色渐变
      const btnX = cx + 24, btnY = cy + bh - 62, btnW = bw - 48, btnH = 46;
      const btnG = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      btnG.addColorStop(0, '#3d2f14'); btnG.addColorStop(1, '#2a1f0c');
      fillRoundRect(ctx, btnX, btnY, btnW, btnH, 12, btnG);
      strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 12, '#ffd34d', 1.5);
      text(ctx, '选 择', btnX + btnW / 2, btnY + btnH / 2, 24, '#ffd34d', 'center');
      onPick[i] = { hit: (px, py) => px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH };
    });
    // v1.17 重掷按钮（局内银币付费 200/400/800/1600 指数增长，每窗口 4 次封顶；gold 为当前局内银币）
    const rn = pick.rerolls || 0;
    const rrCosts = CONFIG.RELIC_REROLL.costs;
    const maxReached = rn >= rrCosts.length;
    const cost = maxReached ? 0 : rrCosts[rn];
    const canPay = !maxReached && (gold || 0) >= cost;
    const ry = y + h - 96, rw = 300, rh = 44, rx = (750 - rw) / 2;
    const rbG = ctx.createLinearGradient(0, ry, 0, ry + rh);
    rbG.addColorStop(0, canPay ? '#4a3a18' : '#332c22');
    rbG.addColorStop(1, canPay ? '#33250f' : '#241f18');
    fillRoundRect(ctx, rx, ry, rw, rh, 14, rbG);
    strokeRoundRect(ctx, rx, ry, rw, rh, 14, canPay ? '#ffd34d' : '#5a5448', 1.5);
    if (canPay) {
      if (!drawImg(ctx, IMG_SRC.silver, rx + 96, ry + 10, 24, 24)) text(ctx, '🪙', rx + 108, ry + 24, 18, '#c9d6e4', 'center');
      text(ctx, `🔄 重掷 · ${cost}`, rx + 126, ry + rh / 2 + 2, 24, '#ffd34d', 'left');
    } else if (maxReached) {
      text(ctx, '🔄 已达重掷上限', 375, ry + rh / 2 + 2, 20, '#7a7468', 'center');
    } else {
      text(ctx, `🔄 银币不足（需 ${cost}）`, 375, ry + rh / 2 + 2, 20, '#9a8a6a', 'center');
    }
    onPick.reroll = { hit: (px, py) => px >= rx && px <= rx + rw && py >= ry && py <= ry + rh };
    // 底部提示
    text(ctx, '✦ 选择后立即生效 · 本局结束失效 ✦', 375, y + h - 24, 17, '#8a7a4a', 'center');
    ctx.restore();
  }

  /** v1.16.73 本局圣遗物详情弹层（点击顶部状态栏圣遗物行打开）：分页列表，每页 8 行，▲▼ 翻页 */
  relicDetailLayer(ctx, relics, page, onPick) {
    const w = 640, h = 760;
    const x = (750 - w) / 2, y = (LOGIC_H - h) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    fillRoundRect(ctx, x, y, w, h, 20, '#1d242e');
    strokeRoundRect(ctx, x, y, w, h, 20, '#7ca8ff', 2);
    text(ctx, '本局圣遗物', 375, y + 54, 34, '#ffffff', 'center');
    text(ctx, `已获得 ×${relics.length} · 获得即本局生效${relics.some((r) => r.star3) ? ' · ★3 质变生效中' : ''}`, 375, y + 92, 18, '#8ea3b8', 'center');
    // 关闭（右上）
    ctx.beginPath(); ctx.arc(x + w - 50, y + 44, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#3a4553'; ctx.fill();
    text(ctx, '✕', x + w - 50, y + 52, 26, '#ffffff', 'center');
    onPick.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + h };
    onPick.close = { hit: (px, py) => Math.abs(px - (x + w - 50)) < 30 && Math.abs(py - (y + 44)) < 30 };
    if (!relics.length) return;
    // 分页列表（每页 8 行）
    const per = 8, pages = Math.ceil(relics.length / per);
    const pg = Math.min(Math.max(page || 0, 0), pages - 1);
    const list = relics.slice(pg * per, pg * per + per);
    let ry = y + 130;
    list.forEach((r) => {
      fillRoundRect(ctx, x + 40, ry, w - 80, 64, 12, '#20262f');
      ctx.beginPath(); ctx.arc(x + 76, ry + 32, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.fill();
      ctx.strokeStyle = 'rgba(247,201,72,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
      const rSrc = relicIconSrc(r.id);
      if (!(rSrc && drawImg(ctx, rSrc, x + 61, ry + 17, 30, 30))) text(ctx, r.icon, x + 76, ry + 34, 22, '#ffffff', 'center');
      text(ctx, r.name, x + 110, ry + 26, 20, '#ffffff', 'left');
      if (r.star3) {   // v1.16.113 ★3 质变徽章
        fillRoundRect(ctx, x + w - 90, ry + 8, 42, 24, 12, '#ffb347');
        text(ctx, '★3', x + w - 69, ry + 26, 14, '#5c3800', 'center');
      }
      const dd = String(r.desc || '');
      const brief = dd.length > 22 ? dd.slice(0, 22) + '…' : dd;
      text(ctx, brief, x + 110, ry + 52, 15, '#9fb2c3', 'left');
      ry += 74;
    });
    // 翻页：▲ ▼ + 页码
    const by = y + 130 + per * 74 + 8;
    fillRoundRect(ctx, x + 40, by, 120, 46, 12, '#2c3542');
    strokeRoundRect(ctx, x + 40, by, 120, 46, 12, '#7ca8ff', 1.2);
    text(ctx, '▲ 上一页', x + 100, by + 30, 18, pages > 1 ? '#9fb2c3' : '#5a6c80', 'center');
    text(ctx, `${pg + 1} / ${pages}`, 375, by + 30, 20, '#f7c948', 'center');
    fillRoundRect(ctx, x + w - 160, by, 120, 46, 12, '#2c3542');
    strokeRoundRect(ctx, x + w - 160, by, 120, 46, 12, '#7ca8ff', 1.2);
    text(ctx, '下一页 ▼', x + w - 100, by + 30, 18, pages > 1 ? '#9fb2c3' : '#5a6c80', 'center');
    onPick.prev = { hit: (px, py) => px >= x + 40 && px <= x + 160 && py >= by && py <= by + 46 };
    onPick.next = { hit: (px, py) => px >= x + w - 160 && px <= x + w - 40 && py >= by && py <= by + 46 };
  }

  /** v1.16.73 波间透明提示（不暂停进度）：进入下一波 2s / Boss 警告 4s 闪烁三角+BOSS */
  battleHints(ctx, waveHint, bossHint) {
    const now = Date.now();
    // 进入下一波：战斗区正中透明文字（无面板背景）
    if (waveHint && now < waveHint.until) {
      const yc = (AREA_Y + WALL_Y) / 2 - 40;
      ctx.globalAlpha = 0.95;
      text(ctx, '进入', 375, yc, 30, 'rgba(255,255,255,0.72)', 'center');
      text(ctx, waveHint.text, 375, yc + 54, 52, '#7ef0a3', 'center');
      ctx.globalAlpha = 1;
    }
    // Boss 警告：红色三角感叹号 + BOSS 字样，0.5s 闪烁，4s 自动消失
    if (bossHint && now < bossHint.until) {
      if (Math.floor(now / 500) % 2 !== 0) return; // 闪烁：半秒显示半秒隐藏
      const yc = (AREA_Y + WALL_Y) / 2 - 20;
      const R = 46;
      ctx.save();
      ctx.translate(375, yc);
      ctx.beginPath();
      ctx.moveTo(0, -R);
      ctx.lineTo(R * 0.92, R * 0.62);
      ctx.lineTo(-R * 0.92, R * 0.62);
      ctx.closePath();
      ctx.fillStyle = 'rgba(230,57,70,0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-5, -R * 0.45, 10, R * 0.55);
      ctx.beginPath(); ctx.arc(0, R * 0.32, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      text(ctx, 'BOSS', 375, yc + R + 36, 30, '#ff4757', 'center');
    }
  }
}

function fmtNum(n) {
  if (!isFinite(n)) return '0';                    // v1.16.128 防御：非数字（NaN/undefined/Infinity）一律显示 0
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'm';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + 'w';
  return String(Math.floor(n));
}

/** v1.17.9d 完整数字：3 位一逗号、不缩写（主界面货币展示用） */
function fmtFull(n) {
  if (!isFinite(n)) return '0';
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** v1.17.10 主界面货币（固定胶囊宽口径）：≤999,999 完整千分位；≥1,000,000 显示 1,000k（k 占预留尾位） */
function fmtK(n) {
  if (!isFinite(n)) return '0';
  const v = Math.floor(n);
  if (v >= 1e6) return String(Math.floor(v / 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + 'k';
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * v1.17.9d 主界面游戏名：金色渐变 + 轻微弧线（可选手动立体）。
 * 沿大半径圆弧排布（两端下沉、逐字沿切线旋转）；stereo=true 时三层偏移（深底→中底→金色渐变主层）+ 顶部高光；
 * stereo=false（v1.17.10）为单层金色渐变，无立体阴影，仅保留弧线排版。
 * @param {number} size 字号（字宽≈size）
 * @param {number} archR 弧半径（越大越平缓；如 1200 → 端部下沉 ~7px、端字旋转 ~6°）
 * @param {boolean} [stereo=true] 是否带立体效果
 */
function drawArchedTitle(ctx, text, cx, baseY, size, archR, stereo) {
  const chars = [...text];
  const n = chars.length;
  const step = size * 0.96;
  const totalW = step * (n - 1);
  const R = archR || 1200;
  const halfAng = totalW / 2 / R;
  const st = stereo !== false;
  chars.forEach((ch, i) => {
    const ang = (i / (n - 1) - 0.5) * halfAng * 2;   // -halfAng..halfAng
    const x = cx + Math.sin(ang) * R;
    const y = baseY - R * (1 - Math.cos(ang));       // 中间最高，两端轻微下沉
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 立体（仅 stereo=true）：深色底层（偏移 4px）→ 暗金中层（偏移 2px）
    if (st) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(ch, 4, 5);
      ctx.fillStyle = 'rgba(120,80,20,0.9)';
      ctx.fillText(ch, 2, 2.5);
    }
    const grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    grad.addColorStop(0, '#fff3c4'); grad.addColorStop(0.45, '#f7c948'); grad.addColorStop(1, '#d99e16');
    ctx.fillStyle = grad;
    ctx.fillText(ch, 0, 0);
    // 顶部受光（仅 stereo=true）
    if (st) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(ch, 0, -size * 0.12);
    }
    ctx.restore();
  });
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
