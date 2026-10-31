'use strict';
const CONFIG = require('../../config.js');
const Presentation = require('../../config/combat-presentation.js');
const enemySize = require('../../enemy-size.js');
const ENEMY_VISUAL = require('../../config/enemy-visuals.js');
const { fillRoundRect, text } = require('../ui.js');
const L = CONFIG.LAYOUT;
// 怪物表现读取原Renderer的animNow；状态/血量/时钟仍由原战斗实例持有。
function createEnemyLayer({ loadImg, drawImg, IMG_SRC }) {
/* v1.17.50 专属 Boss 帧动画表：id → 资源与帧参数（默认横向，迦尔文4列×2行） */
const BOSS_ART = {
  altar_vera: { src: IMG_SRC.boss_altar_vera, ...ENEMY_VISUAL.bossAnimations.altar_vera },
  altar_rosea: { src: IMG_SRC.boss_altar_rosea, frames: 6, frameSize: 256 },
  altar_galvin_twin: { src: IMG_SRC.boss_altar_galvin_twin, ...ENEMY_VISUAL.bossAnimations.altar_galvin_twin },
  altar_galvin: { src: IMG_SRC.boss_altar_galvin, ...ENEMY_VISUAL.bossAnimations.altar_galvin },
};
/* v1.17.50 代际小怪图集上限：C 卡（Lv9-11）+ v1.17.51 D 卡（Lv12-14）后最高到 Lv14；
 * 超界代（Lv15 起，61+ 波递推怪）按类型回退到最近一代已有形象，避免画成老代 */
const ENEMY_ART_MAX_LV = 14;
const ENEMY_ART_FALLBACK = { normal: 13, runner: 14, tank: 12, elite: 14 };
/* v1.17.51 D 卡 8 帧图集的帧数与帧时长：等周期换算（与 5 帧旧代周期一致：重坦 1.5s / 普通 1.2s / 快速 0.8s） */
const ENEMY_ART_FRAMES = { 12: 8, 13: 8, 14: 8 };
const ENEMY_ART_DUR = { 12: 190, 13: 150, 14: 100 };
  function preloadBoss(id) {
    const a = BOSS_ART[id];
    if (a && a.src) loadImg(a.src);
    if (id === 'altar_galvin' && IMG_SRC.boss_altar_galvin_twin) loadImg(IMG_SRC.boss_altar_galvin_twin);
  }

  function enemies(ctx, enemies, splitVisual) {
    const split = splitVisual && splitVisual.t < splitVisual.duration ? splitVisual : null;
    enemies.forEach((e) => {
      const isElite = e.type === 'elite';
      const size = enemySize(e, L.enemy);
      let x = e.x - size / 2, y = e.y - size / 2;
      const entering = split && split.childIds.includes(e.id);
      if (entering) {
        const p = split.t / split.duration, ease = 1 - Math.pow(1 - p, 3);
        x = split.x + (e.x - split.x) * ease - size / 2;
        y = split.y + (e.y - split.y) * ease - size / 2;
        ctx.save(); ctx.globalAlpha *= Math.min(1, p * 1.8);
      }
      this.drawEnemyBody(ctx, e, x, y, size, isElite);
      this.drawEnemyDebuffs(ctx, e, x, y, size);
      this.drawEnemyBar(ctx, e, x, y, size);
      this.drawEnemyDebuffIcons(ctx, e, x, y, size);
      if (entering) ctx.restore();
    });
    if (split && enemies.some(e => e.hp > 0 && split.childIds.includes(e.id))) drawSplit(ctx, split);
  }

  function drawSplit(ctx, v) {
    const img = loadImg(IMG_SRC.boss_altar_galvin);
    if (!img || !img.width || !img.height) return;
    const p = v.t / v.duration, col = v.frame % 4, row = Math.floor(v.frame / 4);
    const sx = Math.round(col * img.width / 4), sy = Math.round(row * img.height / 2);
    const sw = Math.round((col + 1) * img.width / 4) - sx;
    const sh = Math.round((row + 1) * img.height / 2) - sy, cut = Math.floor(sw / 2);
    ctx.save();
    ctx.globalAlpha *= Math.max(0, 1 - p / 0.85);
    for (let side = 0; side < 2; side++) {
      const offset = side ? cut : 0, width = side ? sw - cut : cut;
      ctx.drawImage(img, sx + offset, sy, width, sh,
        v.x - v.size / 2 + offset / sw * v.size + (side ? 1 : -1) * p * v.size * 0.32,
        v.y - v.size / 2, width / sw * v.size, v.size);
    }
    ctx.restore(); ctx.save();
    ctx.globalAlpha *= Math.sin(p * Math.PI);
    ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = Math.max(1, v.size * 0.035 * (1 - p));
    ctx.beginPath(); ctx.moveTo(v.x, v.y - v.size * 0.32);
    ctx.lineTo(v.x - 4, v.y); ctx.lineTo(v.x + 3, v.y + v.size * 0.3); ctx.stroke();
    ctx.fillStyle = '#f9d67d';
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4, distance = p * v.size * 0.6;
      const x = v.x + Math.cos(angle) * distance, y = v.y + Math.sin(angle) * distance;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    ctx.restore();
  }

  function drawEnemyBody(ctx, e, x, y, size, isElite) {
    // v1.16.123 敌人本体：优先按代际等级播放帧循环动画（lv1-14 sprite sheet；Lv12-14 为 8 帧，其余 5 帧），
    // v1.17.51 超界等级（genLv>14，61+ 波递推怪）按类型映射到最近一代已有形象（normal→lv13 / runner→lv14 / tank→lv12）；
    // 动画表未加载时回退旧类型图（runner/tank/normal/boss），再回退几何+字符
    const genLv = e.genLv || 1;
    const imgLv = (genLv >= 1 && genLv <= ENEMY_ART_MAX_LV) ? genLv : (ENEMY_ART_FALLBACK[e.type] || 13);
    // v1.17.46 fix：Boss 有专属 sprite 表时优先用它，禁止借用同代小怪贴图（此前 Boss genLv=6 → 画成 Lv6 重坦）
    const bossArt = (e.isBoss && e.bossId && BOSS_ART[e.bossArtKey || e.bossId]) || null;
    // 萝赛召唤的幼芽（isSummon）用专属 5 帧小图，不再套用 Lv5 疾芽鼠
    const summonArt = (!e.isBoss && e.isSummon) ? { src: IMG_SRC.boss_altar_rosea_summon, frames: 5 } : null;
    const art = bossArt || summonArt;
    const animSrc = e.bossPlaceholder ? null : (art ? art.src : IMG_SRC['lv' + imgLv]);
    const animFrames = art ? art.frames : 0;
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
      drawn = animSrc ? this.drawEnemyAnim(ctx, animSrc, e, x, y, size, isElite, imgLv, animFrames) : false;
      if (!drawn && drawImg(ctx, src, x, y, size, size)) drawn = true;
      ctx.restore();
    } else {
      drawn = animSrc ? this.drawEnemyAnim(ctx, animSrc, e, x, y, size, isElite, imgLv, animFrames) : false;
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

  function drawEnemyAnim(ctx, src, e, x, y, size, isElite, imgLv, frames) {
    const img = loadImg(src);
    if (!(img && img.width > 0)) return false;
    // v1.17 敌人帧动画时钟：用 main.js 注入的 animNow（战斗推进才走，暂停/弹层/结算时冻结），替代绝对 Date.now()
    const now = (typeof this.animNow === 'number' && isFinite(this.animNow)) ? this.animNow : Date.now();
    try {
      // frames：专属 Boss 表传入的帧数（6或8）；未传时按等级表规则（lv1 六帧非等时长，lv12-14 八帧，其余五帧等时长）
      const frameCount = frames || ENEMY_ART_FRAMES[imgLv] || (imgLv === 1 ? 6 : 5);
      const atlas = e.isBoss && BOSS_ART[e.bossArtKey || e.bossId];
      let f;
      if (!frames && imgLv === 1) {
        // 史莱姆 6 帧非等时长：按累计时长表选帧（呼吸挤压节奏 140/160/200/310/200/220ms）
        const DURS = [140, 160, 200, 310, 200, 220];
        let t = (now + ((e.id || 0) * 53) % 1000) % DURS.reduce((a, b) => a + b, 0);
        f = 0;
        while (t >= DURS[f]) { t -= DURS[f]; f++; }
      } else {
        const FRAME_DUR = { runner: 160, normal: 240, tank: 300, elite: 200, boss: 260 }; // ms/帧（v1.16.126 原值×2）
        // v1.17.51 D 卡 8 帧按等周期换算（12:190 / 13:150 / 14:100），其余按类型表
        const dur = (atlas && atlas.frameMs) || ENEMY_ART_DUR[imgLv]
          || (e.isBoss ? FRAME_DUR.boss : (isElite ? FRAME_DUR.elite : (FRAME_DUR[e.type] || FRAME_DUR.normal)));
        const phase = ((e.id || 0) * 53) % 1000; // 每怪独立相位（毫秒偏移），错开切帧节奏
        f = Math.floor((now + phase) / dur) % frameCount;
      }
      if (atlas && atlas.columns) {
        // Round cell boundaries independently: generated atlases may have odd pixel dimensions.
        const col = f % atlas.columns, row = Math.floor(f / atlas.columns);
        const sx = Math.round(col * img.width / atlas.columns), sy = Math.round(row * img.height / atlas.rows);
        const sw = Math.round((col + 1) * img.width / atlas.columns) - sx;
        const sh = Math.round((row + 1) * img.height / atlas.rows) - sy;
        // Generated Vera atlas has generous gutters; crop only transparent inset, keeping full silhouette.
        const inset = atlas.inset || 0;
        const ix = Math.round(sw * inset), iy = Math.round(sh * inset);
        ctx.drawImage(img, sx + ix, sy + iy, sw - ix * 2, sh - iy * 2, x, y, size, size);
        return true;
      }
      const fw = img.width / frameCount, fh = img.height;
      ctx.drawImage(img, fw * f, 0, fw, fh, x, y, size, size);
      return true;
    } catch (err) {
      return false; // 动画帧绘制异常：回退旧图，不中断渲染
    }
  }

  function drawEnemyDebuffs(ctx, e, x, y, size) {
    // 受击状态特效（debuff）：冻结 / 寒霜 / 麻痹 / 猎手标记 / DoT / 毒藤
    this.drawDebuffFrozen(ctx, e, x, y, size);
    this.drawDebuffSlow(ctx, e, x, y, size);
    this.drawDebuffParalyze(ctx, e, x, y, size);
    this.drawDebuffMark(ctx, e, x, y, size);
    this.drawDebuffDots(ctx, e, x, y, size);
    this.drawDebuffVine(ctx, e, x, y, size);
  }

  function drawDebuffFrozen(ctx, e, x, y, size) {
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

  function drawDebuffSlow(ctx, e, x, y, size) {
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

  function drawDebuffParalyze(ctx, e, x, y, size) {
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

  function drawDebuffMark(ctx, e, x, y, size) {
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

  function drawDebuffDots(ctx, e, x, y, size) {
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
          if (!drawImg(ctx, `assets/images/towers/debuff/burn/burn${frameIdx + 1}.png`, cx - fw / 2, y + size - fh, fw, fh)) {
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

  function drawDebuffVine(ctx, e, x, y, size) {
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

  function drawEnemyBar(ctx, e, x, y, size) {
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

  function drawEnemyDebuffIcons(ctx, e, x, y, size) {
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
  return { preloadBoss, enemies, drawEnemyBody, drawEnemyAnim, drawEnemyDebuffs, drawDebuffFrozen, drawDebuffSlow, drawDebuffParalyze, drawDebuffMark, drawDebuffDots, drawDebuffVine, drawEnemyBar, drawEnemyDebuffIcons };
}
module.exports = { createEnemyLayer };
