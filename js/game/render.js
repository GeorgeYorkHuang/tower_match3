const { createBattleScene } = require('./layers/battle.js');
const { createGroundLayer } = require('./layers/ground.js');
const { createChestLayer } = require('./layers/chests.js');
const { createBoardLayer } = require('./layers/board.js');
const { createEnemyLayer } = require('./layers/enemies.js');
const { createProjectileFx } = require('./fx/projectiles.js');
const { createCannonFx } = require('./fx/cannon.js');
const PoisonSkillFx = require('./fx/poison.js');
const BoomerangSkillFx = require('./fx/boomerang.js');
const { createFireFx } = require('./fx/fire.js');
const { createCommonFx } = require('./fx/common.js');
const { createMatchFx } = require('./fx/match.js');
const { createTestFieldScreen } = require('./screens/test-field.js');
const { createUpgradePick } = require('./screens/upgrade-pick.js');
const { createSettlementScreen } = require('./screens/settlement.js');
const { createBattleOverlays } = require('./screens/battle-overlays.js');
const { createBattleRelics } = require('./screens/battle-relics.js');
const { createTowerDetails } = require('./screens/tower-details.js');
const { createBattleHud } = require('./screens/battle-hud.js');
const Presentation = require('../config/combat-presentation.js');
const { createBattleShop } = require('./screens/battle-shop.js');
const { createMenuHeader } = require('./screens/menu-header.js');
const { createMenuShopScreen } = require('./screens/menu-shop.js');
const { createHomeScreen } = require('./screens/home.js');
const { createRelicScreen } = require('./screens/relics.js');
const { createStageDropsScreen } = require('./screens/stage-drops.js');
const { createCodexScreen } = require('./screens/codex.js');
const AccountMenuScreen = require('./screens/account-menu.js');
const FirewallFx = require('./fx/firewall.js');
const FirepillarFx = require('./fx/firepillar.js');
const { createSkillLoadout } = require('./screens/skill-loadout.js');
const { skillIcon } = require('./icons/skills.js');
const { specialBlockMark, subBlockGlyph, COLOR_FILL } = require('./icons/special-blocks.js');
const ChipSkin = require('./icons/chip-skin.js');          // v1.17.44 底板 × 图案两层查表（替换 v1.17.35 方案）
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
  fire: 'assets/images/towers/icons/fire.png', ice: 'assets/images/towers/icons/ice.png',
  poison: 'assets/images/towers/icons/poison.png', electric: 'assets/images/towers/icons/electric.png',
  boomerang: 'assets/images/towers/icons/boomerang.png', cannon: 'assets/images/towers/icons/cannon.png',
  enemy: 'assets/images/monsters/enemies/normal.png', boss: 'assets/images/monsters/enemies/boss.png',
  runner: 'assets/images/monsters/enemies/runner.png', tank: 'assets/images/monsters/enemies/tank.png',
  // v1.16.123 怪物按等级 5 帧循环动画 sprite sheet（透明底，每张 5 帧横向，帧宽 = 图宽/5；v1.16.124 改主包直连，量化 512×102）
  lv1: 'assets/images/monsters/enemies/lv1.png', lv2: 'assets/images/monsters/enemies/lv2.png',
  lv3: 'assets/images/monsters/enemies/lv3.png', lv4: 'assets/images/monsters/enemies/lv4.png',
  lv5: 'assets/images/monsters/enemies/lv5.png', lv6: 'assets/images/monsters/enemies/lv6.png',
  lv7: 'assets/images/monsters/enemies/lv7.png', lv8: 'assets/images/monsters/enemies/lv8.png',
  // v1.17.50 C 卡新增 Lv9-11 代（重碑禁卫/花冠近卫/裂蕊飞奔者），同为 640×128 五帧横向
  lv9: 'assets/images/monsters/enemies/lv9.png', lv10: 'assets/images/monsters/enemies/lv10.png',
  lv11: 'assets/images/monsters/enemies/lv11.png',
  // v1.17.51 D 卡新增 Lv12-14 终局代（盘根巨卫/圣庭执戟者/凋风掠影），1024×128 八帧横向
  lv12: 'assets/images/monsters/enemies/lv12.png', lv13: 'assets/images/monsters/enemies/lv13.png',
  lv14: 'assets/images/monsters/enemies/lv14.png',
  // v1.17.46 专属 Boss 逐帧动画（W 交付）：单帧 256×256 横向 6 帧，帧宽 = 图宽/6
  boss_altar_rosea: 'assets/images/monsters/bosses/altar_rosea/march.png',
  boss_altar_rosea_summon: 'assets/images/monsters/bosses/altar_rosea/sapling_runner.png',
  coin: 'assets/images/resources/coin.png', bullet: 'assets/images/towers/fx/bullet.png',
  silver: 'assets/images/resources/silver.png',   // v1.17 局内临时货币：银币（与局外金币区分）
  chestWood: 'assets/images/resources/chest_wood.png',     // v1.17 深度宝箱档位图标：木质
  chestBronze: 'assets/images/resources/chest_bronze.png', // 青铜
  chestSilver: 'assets/images/resources/chest_silver.png', // 白银
  chestGold: 'assets/images/resources/chest_gold.png',     // 黄金
  chestStar: 'assets/images/resources/chest_star.png',     // 星辉
  chestClosed: 'assets/images/resources/chest_closed.png', // v1.16.75 战场宝箱五帧动画：关闭帧（掉落显示）
  chestQuarter: 'assets/images/resources/chest_quarter.png', // 微开帧（帧2，25°箱盖微掀透金光）
  chestHalf: 'assets/images/resources/chest_half.png',      // 半开帧（帧3）
  chestFast: 'assets/images/resources/chest_fast.png',      // 快开帧（帧4，75% 大张金光迸发）
  chestOpen: 'assets/images/resources/chest_open.png',      // 全开帧（帧5，金光绽放）
  actionArea: 'assets/images/interface/battle/action_area_edges.jpg', // 行动区背景（底版+两侧边缘灌木，750×720，y128-848）
  wall: 'assets/images/interface/battle/wall.jpg',              // 城墙背景（750×60 主体，y967-1027；血条区 10px y1027-1037 含血量数字，底部空隙 5px）
  towerRow: 'assets/images/interface/battle/tower_row_dark.jpg', // 塔位区背景（深色石板，750×122，y1042-1164；浅色旧版 tower_row.jpg 保留备份）
  boardBg: 'assets/images/interface/battle/board_bg_dark_1.jpg', // 三消棋盘区背景（深蓝款，750×462，y1164-1626；浅色版 board_bg.jpg 保留备用）
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
  red: 'assets/images/interface/board/fire.png', blue: 'assets/images/interface/board/ice.png',
  green: 'assets/images/interface/board/poison.png', yellow: 'assets/images/interface/board/electric.png',
  purple: 'assets/images/interface/board/boomerang.png', orange: 'assets/images/interface/board/cannon.png',
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

/* v1.16.27 技能图标（美术资源 assets/images/towers/skills/<塔>/<文件名>.png，缺失时回退 emoji） */
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
  return f ? `assets/images/towers/skills/${towerKey}/${f}.png` : null;
}

/** v1.16.80 hex → rgba（图鉴卡片塔色渲染用） */
function hexA(hex, a) {
  const h = (hex || '#8ea3b8').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* v1.16.74 技能帧动画（精灵表横向条带，assets/images/towers/fx/anims/<set>_<variant>.png） */
const ANIM_SHEETS = {
  explosion: { orange: ['assets/images/towers/fx/anims/anim_explosion_orange.png', 10], blue: ['assets/images/towers/fx/anims/anim_explosion_blue.png', 10], green: ['assets/images/towers/fx/anims/anim_explosion_green.png', 10] },
  fallstrike: { orange: ['assets/images/towers/fx/anims/anim_fallstrike_orange.png', 8], blue: ['assets/images/towers/fx/anims/anim_fallstrike_blue.png', 8] },
  spark: { gold: ['assets/images/towers/fx/anims/anim_spark_gold.png', 6] },
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

/* v1.16.61 局内圣遗物图标（assets/images/relics/<塔系>/<id>.png，缺失时回退 emoji） */
function relicIconSrc(id) {
  const dir = { fire_: 'fire', ice_: 'ice', poison_: 'poison', elec_: 'electric', boo_: 'boomerang', can_: 'cannon', cm_: 'universal' };
  for (const [pre, cat] of Object.entries(dir)) {
    if (typeof id === 'string' && id.startsWith(pre)) return `assets/images/relics/${cat}/${id}.png`;
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
  _getBattleHud() {
    if (!this._battleHud) this._battleHud = createBattleHud({ drawImg, IMG_SRC, fmtNum, relicIconSrc, AREA_X, AREA_Y, AREA_W, ENTRY_H });
    return this._battleHud;
  }

  status(ctx, s) { return this._getBattleHud().status.call(this, ctx, s); }

  entryStatus(ctx, s) { return this._getBattleHud().entryStatus.call(this, ctx, s); }

  /** 行动区底：入口带 + 敌人 + 城墙 + 塔位区 + 棋盘（按状态分层调用） */
  _getBattleScene() {
    if (!this._battleScene) this._battleScene = createBattleScene({ drawImg, IMG_SRC, drawTowerGlyph, AREA_X, AREA_Y, AREA_W, ENTRY_H, WALL_Y, TOWER_ROW_Y, BOARD_Y });
    return this._battleScene;
  }

  actionArea(ctx, s) { return this._getBattleScene().actionArea.call(this, ctx, s); }

  wall(ctx, hp, maxHp, barY, shield) { return this._getBattleScene().wall.call(this, ctx, hp, maxHp, barY, shield); }

  /** 底部功能键区（三消棋盘下方）：设置 / 帮助（v1.16.30 移除加速键；v1.16.77 移除塔图鉴弹层与商店占位弹层，图鉴移入主界面 codex 页签） */
  funcBar(ctx, s) { return this._getBattleScene().funcBar.call(this, ctx, s); }

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
  _getTowerDetails() {
    if (!this._towerDetails) this._towerDetails = createTowerDetails({ drawImg, skillIconSrc, TOWER_TINT, lighten, txtW });
    return this._towerDetails;
  }

  towerInfoLayer(ctx, info, hits) { return this._getTowerDetails().towerInfoLayer.call(this, ctx, info, hits); }

  towerSkillLayer(ctx, info, hits) { return this._getTowerDetails().towerSkillLayer.call(this, ctx, info, hits); }

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

  towerRow(ctx, s, count, showGlobal) { return this._getBattleScene().towerRow.call(this, ctx, s, count, showGlobal); }

  /** 全局技能充能条绘制：未充能无背景色（仅淡描边）；充能 ≥1 格激活后，背景替换为技能主题色；
   *  图标/名称 + 横向 3 段充能（每段 = 1 次释放）+ N/3 次数；返回命中矩形 {key,x,y,w,h}（v1.17.10 与塔槽同尺寸同 y） */
  _globalBtn(ctx, key, icon, name, bx, by, bw, bh, filled, tint) { return this._getBattleScene()._globalBtn.call(this, ctx, key, icon, name, bx, by, bw, bh, filled, tint); }

  _speedBadge(ctx,x,y,w,h,speed) { return this._getBattleScene()._speedBadge.call(this, ctx,x,y,w,h,speed); }

  _getBoardLayer() {
    if (!this._boardLayer) this._boardLayer = createBoardLayer({ drawImg, IMG_SRC, BOARD_IMG, COLOR_FILL, ChipSkin, subBlockGlyph, easeOutCubic });
    return this._boardLayer;
  }

  board(ctx, grid, selected, anim, shake, theme) { return this._getBoardLayer().board.call(this, ctx, grid, selected, anim, shake, theme); }

  /** 单格绘制（v1.17.44 两层：无符号玻璃底板 → 图案；
   *  普通块用原色图案、特殊块用随来源色染好的图案；底板未就绪回退旧整图，再回退色块+矢量徽记） */
  drawCell(ctx, x, y, cell, color, r, c, selected) { return this._getBoardLayer().drawCell.call(this, ctx, x, y, cell, color, r, c, selected); }

  /** Special pieces share a dark medallion and bright border; shape encodes function independently of hue. */
  _specialBlockMark(ctx, x, y, size, piece) {
    return specialBlockMark(ctx, x, y, size, piece);
  }

  /** 计算最终格子 (r,c) 在下落动画中的来源行：继承格返回旧行，新落格返回 -1 */
  _sourceRow(anim, grid, r, c) { return this._getBoardLayer()._sourceRow.call(this, anim, grid, r, c); }

  /* ============ 区B · 敌人层（本体 / debuff 特效 / 血条） ============ */

  /** v1.17.46 专属 Boss 贴图预热（进波时调用，避免出场首帧回退旧图） */
  _getEnemyLayer() {
    if (!this._enemyLayer) this._enemyLayer = createEnemyLayer({ loadImg, drawImg, IMG_SRC });
    return this._enemyLayer;
  }

  preloadBoss(id) { return this._getEnemyLayer().preloadBoss.call(this, id); }

  /** 区B·敌人层：敌人本体绘制 + 受击状态特效（debuff）+ 血条（v1.16.43 重构拆分子方法） */
  enemies(ctx, enemies) { return this._getEnemyLayer().enemies.call(this, ctx, enemies); }

  drawEnemyBody(ctx, e, x, y, size, isElite) { return this._getEnemyLayer().drawEnemyBody.call(this, ctx, e, x, y, size, isElite); }

  /** 按等级动画表裁剪绘制当前帧（横向帧循环）；图未就绪/绘制异常返回 false
   *  v1.16.96 lv1 替换为史莱姆 6 帧（assets/images/monsters/enemies/lv1.png 576×96），按非等时长表 [140,160,200,310,200,220]ms 切帧；
   *  其余等级为等时长（v1.17.51 Lv12-14 八帧按等周期 190/150/100ms，其它 5 帧按类型表）；每怪用自身 id 派生相位偏移，避免全屏同步切帧 */
  drawEnemyAnim(ctx, src, e, x, y, size, isElite, imgLv, frames) { return this._getEnemyLayer().drawEnemyAnim.call(this, ctx, src, e, x, y, size, isElite, imgLv, frames); }

  drawEnemyDebuffs(ctx, e, x, y, size) { return this._getEnemyLayer().drawEnemyDebuffs.call(this, ctx, e, x, y, size); }

  drawDebuffFrozen(ctx, e, x, y, size) { return this._getEnemyLayer().drawDebuffFrozen.call(this, ctx, e, x, y, size); }

  drawDebuffSlow(ctx, e, x, y, size) { return this._getEnemyLayer().drawDebuffSlow.call(this, ctx, e, x, y, size); }

  drawDebuffParalyze(ctx, e, x, y, size) { return this._getEnemyLayer().drawDebuffParalyze.call(this, ctx, e, x, y, size); }

  drawDebuffMark(ctx, e, x, y, size) { return this._getEnemyLayer().drawDebuffMark.call(this, ctx, e, x, y, size); }

  drawDebuffDots(ctx, e, x, y, size) { return this._getEnemyLayer().drawDebuffDots.call(this, ctx, e, x, y, size); }

  drawDebuffVine(ctx, e, x, y, size) { return this._getEnemyLayer().drawDebuffVine.call(this, ctx, e, x, y, size); }

  damageNumbers(ctx, queue) {
    if (Presentation.damageNumbers.enabled && queue) queue.drawTo(ctx, { text });
  }

  drawEnemyBar(ctx, e, x, y, size) { return this._getEnemyLayer().drawEnemyBar.call(this, ctx, e, x, y, size); }

  /** v1.16.60 怪物 debuff 图标：血条上方横向排布（半透明圆底 + 专属 emoji + 边框色 + 剩余秒数小字），每个 debuff 一个小图标 */
  drawEnemyDebuffIcons(ctx, e, x, y, size) { return this._getEnemyLayer().drawEnemyDebuffIcons.call(this, ctx, e, x, y, size); }

  /* ============ 区C · 技能特效层（地面持续效果 / 弹道与技能 fx） ============ */

  /** v1.16.72 战场宝箱：怪物掉落实体，点击后播放三帧开箱动画（关→半开→全开）→ 开启后弹出圣物三选一；金色宝箱图片 + 呼吸光晕 + 点击提示 */
  _getChestLayer() {
    if (!this._chestLayer) this._chestLayer = createChestLayer({ drawImg, IMG_SRC });
    return this._chestLayer;
  }

  fieldChests(ctx, list) { return this._getChestLayer().fieldChests.call(this, ctx, list); }

  /** 地面持续效果（v1.16.1）：毒池毒液池（深绿帧动画冒泡）+ 毒棒召唤物（帧动画图标）——画在敌人下层 */
  _getGroundLayer() {
    if (!this._groundLayer) this._groundLayer = createGroundLayer({ drawImg });
    return this._groundLayer;
  }

  groundFx(ctx, combat) { return this._getGroundLayer().groundFx.call(this, ctx, combat); }

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
  _getCommonFx() {
    if (!this._commonFx) this._commonFx = createCommonFx({ drawImg, IMG_SRC, drawAnimSheet, animVariantOf });
    return this._commonFx;
  }

  fxFloatText(ctx, f) { return this._getCommonFx().fxFloatText(ctx, f); }

  _getProjectileFx() {
    if (!this._projectileFx) this._projectileFx = createProjectileFx({ drawImg });
    return this._projectileFx;
  }

  fxShot(ctx, f) { return this._getProjectileFx().fxShot(ctx, f, this.ly); }

  fxHitwall(ctx, f) { return this._getCommonFx().fxHitwall(ctx, f); }

  fxBullet(ctx, f) { return this._getCommonFx().fxBullet(ctx, f); }

  _getCannonFx() {
    if (!this._cannonFx) this._cannonFx = createCannonFx({ drawImg });
    return this._cannonFx;
  }

  fxStrikeShell(ctx, f) { return this._getCannonFx().fxStrikeShell(ctx, f); }

  fxStrike(ctx, f) { return this._getCannonFx().fxStrike(ctx, f); }

  fxBoom(ctx, f) { return this._getCommonFx().fxBoom(ctx, f); }

  fxFlashFx(ctx, f) { return this._getCommonFx().fxFlashFx(ctx, f); }

  fxVine(ctx, f) { return PoisonSkillFx.fxVine(ctx, f); }

  fxThorn(ctx, f) { return PoisonSkillFx.fxThorn(ctx, f); }

  fxMine(ctx, f) { return this._getCannonFx().fxMine(ctx, f); }

  fxTurret(ctx, f) { return this._getCannonFx().fxTurret(ctx, f); }

  fxCyclone(ctx, f) { return BoomerangSkillFx.fxCyclone(ctx, f); }

  _getFireFx() {
    if (!this._fireFx) this._fireFx = createFireFx({ loadImg, drawImg, IMG_SRC, drawFlameTongue, drawAnimSheet });
    return this._fireFx;
  }

  fxPillar(ctx, f) { return this._getFireFx().fxPillar(ctx, f); }

  _fxPillarProc(ctx, cx, cy, R, seed, p) { return this._getFireFx()._fxPillarProc(ctx, cx, cy, R, seed, p); }

  fxFireWall(ctx, f) { return this._getFireFx().fxFireWall(ctx, f); }

  _fxFireWallProc(ctx, cx, cy, w, h, seed, p, fade) { return this._getFireFx()._fxFireWallProc(ctx, cx, cy, w, h, seed, p, fade); }

  fxRain(ctx, f) { return this._getFireFx().fxRain(ctx, f); }

  fxRaindrop(ctx, f) { return this._getFireFx().fxRaindrop(ctx, f); }

  fxParticleFx(ctx, f) { return this._getCommonFx().fxParticleFx(ctx, f); }

  fxRingFx(ctx, f) { return this._getCommonFx().fxRingFx(ctx, f); }

  fxBeamFx(ctx, f) { return this._getCommonFx().fxBeamFx(ctx, f); }

  _getMatchFx() {
    if (!this._matchFx) this._matchFx = createMatchFx({ COLOR_FILL });
    return this._matchFx;
  }

  fxBeamp(ctx, f) { return this._getMatchFx().fxBeamp(ctx, f); }

  fxMatch(ctx, f) { return this._getMatchFx().fxMatch(ctx, f); }

  fxSpecialSpawn(ctx, f) { return this._getMatchFx().fxSpecialSpawn(ctx, f); }

  fxSpecialBlast(ctx, f) { return this._getMatchFx().fxSpecialBlast(ctx, f); }

  fxScreenFlash(ctx, f) { return this._getMatchFx().fxScreenFlash(ctx, f); }

  fxRainbowSpawn(ctx, f) { return this._getMatchFx().fxRainbowSpawn(ctx, f); }

  fxScanSweep(ctx, f) { return this._getMatchFx().fxScanSweep(ctx, f); }

  fxRecolorWave(ctx, f) { return this._getMatchFx().fxRecolorWave(ctx, f); }

  fxSeedStar(ctx, f) { return this._getMatchFx().fxSeedStar(ctx, f); }

  fxRainParticle(ctx, f) { return this._getMatchFx().fxRainParticle(ctx, f); }

  /** 三选一弹层（波末/升级强化）v5：横向三卡；入场错峰上浮 + 徽章图标 + 渐变描边 + 呼吸光晕（v1.16.7 美化） */
  _getUpgradePick() {
    if (!this._upgradePick) this._upgradePick = createUpgradePick({ drawImg, skillIconSrc, TOWER_TINT, lighten, txtW });
    return this._upgradePick;
  }

  pickLayer(ctx, group, pending, onPick) { return this._getUpgradePick().pickLayer.call(this, ctx, group, pending, onPick); }

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

  _getSettlementScreen() {
    if (!this._settlementScreen) this._settlementScreen = createSettlementScreen({ drawImg, IMG_SRC, relicIconSrc, fmtNum });
    return this._settlementScreen;
  }

  _goPh(T, t0, dur) { return this._getSettlementScreen()._goPh(T, t0, dur); }

  _goEob(p) { return this._getSettlementScreen()._goEob(p); }

  _drawFlag(ctx, x, yBase, h, color, alpha) { return this._getSettlementScreen()._drawFlag(ctx, x, yBase, h, color, alpha); }

  _goStage(ctx, T, win) { return this._getSettlementScreen()._goStage(ctx, T, win); }

  _goHead(ctx, su, T, win) { return this._getSettlementScreen()._goHead(ctx, su, T, win); }

  _goTrail(ctx, su, T, win) { return this._getSettlementScreen()._goTrail(ctx, su, T, win); }

  _goIcon(ctx, id, x, y, size) { return this._getSettlementScreen()._goIcon(ctx, id, x, y, size); }

  _goLoot(ctx, su, T) { return this._getSettlementScreen()._goLoot(ctx, su, T); }

  _goBills(ctx, su, T) { return this._getSettlementScreen()._goBills(ctx, su, T); }

  _goMile(ctx, su, T) { return this._getSettlementScreen()._goMile(ctx, su, T); }

  _goBtns(ctx, T, win, restart) { return this._getSettlementScreen()._goBtns(ctx, T, win, restart); }

  gameOver(ctx, s, restart) { return this._getSettlementScreen().gameOver(ctx, s, restart); }

  toast(ctx, list) {
    list.forEach((t, i) => {
      const y = STATUS_H + 66 + i * 40;
      text(ctx, t.text, 375, y, 24, t.color || '#ffffff', 'center');
    });
  }

  /** 底部功能弹层：设置 / 帮助（共用遮罩+面板+关闭；v1.16.77 塔图鉴与商店弹层已移除） */
  _getBattleOverlays() {
    if (!this._battleOverlays) this._battleOverlays = createBattleOverlays({ fmtNum });
    return this._battleOverlays;
  }

  funcLayer(ctx, layer, s, hits) { return this._getBattleOverlays().funcLayer.call(this, ctx, layer, s, hits); }

  /* ================= 主界面：三页签（战斗主页 / 商店 / 圣物）+ 子面板（v1.4：无配置页） ================= */
  /** v1.14 测试战场渲染层：状态条 + 战场（入口带/城墙/敌人/特效）+ 6 塔槽 + 刷怪控制 + 技能配置面板 */
  _getTestFieldScreen() {
    if (!this._testFieldScreen) this._testFieldScreen = createTestFieldScreen({ drawImg, IMG_SRC, relicIconSrc, drawTowerGlyph, STATUS_H, AREA_X, AREA_Y, AREA_W, ENTRY_H, WALL_Y });
    return this._testFieldScreen;
  }

  testFieldLayer(ctx, s, hits, enemies, fx, combat, damageNumbers) { return this._getTestFieldScreen().testFieldLayer.call(this, ctx, s, hits, enemies, fx, combat, damageNumbers); }

  testSkillPanel(ctx, key, s, push) { return this._getTestFieldScreen().testSkillPanel.call(this, ctx, key, s, push); }

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
    drawImg(ctx, `assets/images/interface/home/menu_${s.tab}.png`, 0, 0, 750, LOGIC_H);
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
      else if (s.panel.type === 'stageDrops') this.menuStageDrops(ctx, s, push);  // v1.17.48 战场说明 + 专属掉落
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

  /** v1.17.48 战场卡信息层：战场说明 + 专属掉落（战场图标点击入口） */
  _getStageDropsScreen() {
    if (!this._stageDropsScreen) this._stageDropsScreen = createStageDropsScreen({
      drawImg, relicIconSrc, wrapText: this.wrapText.bind(this),
    });
    return this._stageDropsScreen;
  }

  menuStageDrops(ctx, s, push) { return this._getStageDropsScreen().draw(ctx, s, push, this._menuPanelShell.bind(this)); }

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
  evacuationLayer(ctx, g, hits) { return this._getBattleOverlays().evacuationLayer(ctx, g, hits); }

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
  _getBattleRelics() {
    if (!this._battleRelics) this._battleRelics = createBattleRelics({ drawImg, IMG_SRC, TOWER_TINT, relicIconSrc });
    return this._battleRelics;
  }

  relicPickLayer(ctx, pick, onPick, elapsed, gold) { return this._getBattleRelics().relicPickLayer(ctx, pick, onPick, elapsed, gold); }

  relicDetailLayer(ctx, relics, page, onPick) { return this._getBattleRelics().relicDetailLayer(ctx, relics, page, onPick); }

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
