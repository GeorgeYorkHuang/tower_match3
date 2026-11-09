'use strict';
const ApprovedDebuffs = require('../fx/approved-debuffs.js');
const HitFeedback = require('../fx/hit-feedback.js');
const CONFIG = require('../../config.js');
const Presentation = require('../../config/combat-presentation.js');
const enemySize = require('../../enemy-size.js');
const ENEMY_VISUAL = require('../../config/enemy-visuals.js');
const EliteFx = require('../fx/elite.js');
const { fillRoundRect, text } = require('../ui.js');
const L = CONFIG.LAYOUT;
// 怪物表现读取原Renderer的animNow；状态/血量/时钟仍由原战斗实例持有。
function createEnemyLayer({ loadImg, drawImg, IMG_SRC }) {
/* 专属 Boss 帧动画表：id → 资源与帧参数（默认横向，迦尔文4列×2行） */
const BOSS_ART = {
  altar_vera: { src: IMG_SRC.boss_altar_vera, ...ENEMY_VISUAL.bossAnimations.altar_vera },
  altar_rosea: { src: IMG_SRC.boss_altar_rosea, frames: 6, frameSize: 256 },
  altar_galvin_twin: { src: IMG_SRC.boss_altar_galvin_twin, ...ENEMY_VISUAL.bossAnimations.altar_galvin_twin },
  altar_galvin: { src: IMG_SRC.boss_altar_galvin, ...ENEMY_VISUAL.bossAnimations.altar_galvin },
  // 每 5 波小 Boss「圣坛蔓钟」：1024×128 横向 8 帧钟摆（bossArtKey 标记，无 bossId）
  miniboss_bell: { src: IMG_SRC.miniboss_bell, frames: 8, frameMs: 260 },
};
/* 代际小怪图集上限：C 卡（Lv9-11）+ D 卡（Lv12-14）后最高到 Lv14；
 * 超界代（Lv15 起，61+ 波递推怪）按类型回退到最近一代已有形象，避免画成老代 */
const ENEMY_ART_MAX_LV = 14;
const ENEMY_ART_FALLBACK = { normal: 13, runner: 14, tank: 12, elite: 14 };
/* D 卡 8 帧图集的帧数与帧时长：等周期换算（与 5 帧旧代周期一致：重坦 1.5s / 普通 1.2s / 快速 0.8s） */
const ENEMY_ART_FRAMES = { 4: 6, 5: 6, 6: 6, 7: 6, 8: 6, 10: 6, 11: 6, 12: 12, 13: 6, 14: 6 };   // Lv4-8/10/11/13/14 无腿悬浮·飞行怪 6 帧；Lv12 v3 滚石形态：单帧程序化旋转 12 帧（30°/帧）
const ENEMY_ART_DUR = { 4: 220, 5: 160, 6: 300, 7: 200, 8: 160, 10: 200, 11: 120, 12: 130, 13: 150, 14: 100 };
  function preloadBoss(id) {
    if(id==='altar_rosea')loadImg('assets/images/monsters/bosses/altar_rosea/models-v2.png');
    const a = BOSS_ART[id];
    if (a && a.src) loadImg(a.src);
    if (id === 'altar_galvin' && IMG_SRC.boss_altar_galvin_twin) loadImg(IMG_SRC.boss_altar_galvin_twin);
  }

  function enemies(ctx, enemies, splitVisual) {
    ApprovedDebuffs.beginFrame();
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
      // 麻痹只抖动渲染位置，不写回敌人坐标，不影响路径、碰撞或索敌。
      if (e.paralyzed > 0) {
        const t = Date.now(), seed = (e.id || 0) * 0.73;
        x += Math.sin(t / 22 + seed) * size * 0.01875 + Math.sin(t / 11 + seed * 1.7) * size * 0.00625;
      }
      const hit = HitFeedback.strength(e);
      const kick = Math.sin((1 - hit) * Math.PI * 3) * hit * (e.isBoss ? 3 : 6);
      this.drawEnemyBody(ctx, e, x, y - kick, size, isElite);
      if (hit > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= HitFeedback.brightness(e);
        this.drawEnemyBody(ctx, e, x, y - kick, size, isElite, false);
        ctx.restore();
      }
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

  function drawEnemyBody(ctx, e, x, y, size, isElite, overlays = true) {
    // 敌人本体：优先按代际等级播放帧循环动画（lv1-14 sprite sheet；Lv12-14 为 8 帧，其余 5 帧），
    // 超界等级（genLv>14，61+ 波递推怪）按类型映射到最近一代已有形象（normal→lv13 / runner→lv14 / tank→lv12）；
    // 动画表未加载时回退旧类型图（runner/tank/normal/boss），再回退几何+字符
    const genLv = e.genLv || 1;
    const imgLv = (genLv >= 1 && genLv <= ENEMY_ART_MAX_LV) ? genLv : (ENEMY_ART_FALLBACK[e.type] || 13);
    // fix：Boss 有专属 sprite 表时优先用它，禁止借用同代小怪贴图（此前 Boss genLv=6 → 画成 Lv6 重坦）
    // 每 5 波小 Boss 无 bossId，用 bossArtKey（miniboss_bell）命中专属表
    const bossArt = (e.isBoss && (e.bossArtKey || e.bossId) && BOSS_ART[e.bossArtKey || e.bossId]) || null;
    // 萝赛召唤的幼芽（isSummon）用专属 5 帧小图，不再套用 Lv5 疾芽鼠
    const summonArt = (!e.isBoss && e.isSummon) ? { src: IMG_SRC.boss_altar_rosea_summon, frames: 5 } : null;
    const art = bossArt || summonArt;
    const animSrc = e.bossPlaceholder ? null : (art ? art.src : IMG_SRC['lv' + imgLv]);
    const animFrames = art ? art.frames : 0;
    const visualType = isElite ? CONFIG.ENEMY.levelOf(imgLv).type : e.type;
    const src = e.isBoss ? IMG_SRC.boss
      : (visualType === 'runner' ? IMG_SRC.runner : (visualType === 'tank' ? IMG_SRC.tank : IMG_SRC.enemy));
    const fallbackColor = e.isBoss ? '#c0392b' : (isElite ? '#6e8566' : (e.type === 'runner' ? '#2e86c1' : (e.type === 'tank' ? '#8e6b3a' : '#7f8c8d')));
    const fallbackText = e.isBoss ? 'BOSS' : (isElite ? '精' : (e.type === 'runner' ? '快' : (e.type === 'tank' ? '盾' : '👾')));
    const elite = isElite && EliteFx.eligible(e);
    if (elite && overlays) EliteFx.drawBase(ctx, e, x, y, size);
    const rosea = e.bossId === 'altar_rosea' || (!e.isBoss && e.isSummon && e.waveNo === 20);
    const model = rosea && loadImg('assets/images/monsters/bosses/altar_rosea/models-v2.png');
    let roseaDrawn=false;
    if(model && model.width){const n=e.isBoss?(e.phase>=2?1:0):2,sw=model.width/3,now=(this.animNow||0)/1000;
      const h=size*(1+Math.sin(now*2.5)*.012),yy=y+size-h;
      ctx.drawImage(model,n*sw,0,sw,model.height,x,yy,size,h);
      if(overlays)ApprovedDebuffs.draw(ctx,model,{x:n*sw,y:0,w:sw,h:model.height},e,x,yy,size,(this.animNow||0));roseaDrawn=true;}
    const drawn = roseaDrawn || (animSrc ? this.drawEnemyAnim(ctx, animSrc, e, x, y, size, isElite, imgLv, animFrames, overlays) : false);
    if (!drawn && !drawImg(ctx, src, x, y, size, size)) {
      fillRoundRect(ctx, x, y, size, size, e.isBoss ? 10 : 6, fallbackColor);
      text(ctx, fallbackText, x + size / 2, y + size / 2, e.isBoss ? 16 : 14, '#fff', 'center');
    }
    if (elite && overlays) {
      const band = drawn && EliteFx.sweep(e, x, y, size);
      if (band && band.alpha > 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(band.x, band.y, band.w, band.h); ctx.clip();
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha *= band.alpha;
        this.drawEnemyAnim(ctx, animSrc, e, x, y, size, isElite, imgLv, animFrames, false);
        ctx.restore();
      }
      EliteFx.drawBadge(ctx, e, x, y, size);
    }
  }

  function drawEnemyAnim(ctx, src, e, x, y, size, isElite, imgLv, frames, overlays = true) {
    const img = loadImg(src);
    if (!(img && img.width > 0)) return false;
    // 敌人帧动画时钟：用 main.js 注入的 animNow（战斗推进才走，暂停/弹层/结算时冻结），替代绝对 Date.now()
    const now = (typeof this.animNow === 'number' && isFinite(this.animNow)) ? this.animNow : Date.now();
    try {
      // frames：专属 Boss 表传入的帧数（6或8）；未传时按等级表规则（lv1 六帧非等时长，lv12-14 八帧，其余五帧等时长）
      // Lv9 uses one floating body; same battle clock/transform for normal, elite, hit and debuff passes.
      if (!frames && !e.isBoss && !e.isSummon && imgLv === 9) {
        const t=now/1000 + ((e.id||0)*0.173), h=size*img.height/img.width;
        const cx=x+size/2, cy=y+size*.75+Math.sin(t*2)*size*.025;
        ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.sin(t*1.4)*.018);
        ctx.translate(-size/2,-size*.75);ctx.scale(1,h/size);
        ctx.drawImage(img,0,0,img.width,img.height,0,0,size,size);
        if(overlays)ApprovedDebuffs.draw(ctx,img,{x:0,y:0,w:img.width,h:img.height},e,0,0,size,now);
        ctx.restore();return true;
      }
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
        const FRAME_DUR = { runner: 160, normal: 240, tank: 300, elite: 200, boss: 260 }; // ms/帧（原值×2）
        // D 卡 8 帧按等周期换算（12:190 / 13:150 / 14:100），其余按类型表
        const dur = (atlas && atlas.frameMs) || ENEMY_ART_DUR[imgLv]
          || (e.isBoss ? FRAME_DUR.boss : (FRAME_DUR[isElite ? CONFIG.ENEMY.levelOf(imgLv).type : e.type] || FRAME_DUR.normal));
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
        if (overlays) ApprovedDebuffs.draw(ctx,img,{x:sx+ix,y:sy+iy,w:sw-ix*2,h:sh-iy*2},e,x,y,size,now);
        return true;
      }
      const fw = img.width / frameCount, fh = img.height;
      ctx.drawImage(img, fw * f, 0, fw, fh, x, y, size, size);
      // 受击提亮和精英扫光只重绘本体，避免同一状态特效重复叠加。
      if (overlays) ApprovedDebuffs.draw(ctx,img,{x:fw*f,y:0,w:fw,h:fh},e,x,y,size,now);
      return true;
    } catch (err) {
      return false; // 动画帧绘制异常：回退旧图，不中断渲染
    }
  }

  function drawEnemyDebuffs(ctx, e, x, y, size) {
    if (ApprovedDebuffs.ready(e)) {
      // Approved overlays are already drawn against this exact sprite frame.
      this.drawDebuffSlow(ctx,e,x,y,size);
      this.drawDebuffMark(ctx,e,x,y,size);
      return;
    }
    // 受击状态特效：冻结 / 减速 / 麻痹 / DoT / 流血 / 毒藤
    this.drawDebuffFrozen(ctx, e, x, y, size);
    drawDebuffIceSlow(ctx, e, x, y, size);
    this.drawDebuffSlow(ctx, e, x, y, size);
    this.drawDebuffParalyze(ctx, e, x, y, size);
    this.drawDebuffMark(ctx, e, x, y, size);
    this.drawDebuffDots(ctx, e, x, y, size);
    drawDebuffBleed(ctx, e, x, y, size);
    this.drawDebuffVine(ctx, e, x, y, size);
  }

  function drawDebuffFrozen(ctx, e, x, y, size) {
    // 冻结：AI 绘制的透明冰壳覆盖层，中心留空以保留怪物可见度。
    if (e.frozen > 0) {
      const t = Date.now(), pulse = 0.88 + 0.12 * Math.sin(t / 150);
      ctx.save();
      const baseAlpha = ctx.globalAlpha;
      ctx.globalAlpha = baseAlpha * pulse;
      const img = loadImg('assets/images/towers/debuff/freeze/ice-shell.png');
      if (img && img.width && img.height) {
        const drawSize = size * 1.48;
        ctx.drawImage(img, x - (drawSize - size) / 2, y - (drawSize - size) / 2, drawSize, drawSize);
      } else {
        const cx = x + size / 2, cy = y + size / 2;
        ctx.strokeStyle = '#bceeff'; ctx.lineWidth = Math.max(3, size * 0.08);
        ctx.fillStyle = 'rgba(116,205,255,0.28)';
        ctx.beginPath(); ctx.arc(cx, cy, size * 0.52, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (let k = 0; k < 6; k++) {
          const a = t / 700 + k * Math.PI / 3, r = size * 0.56;
          const sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r;
          ctx.fillStyle = '#ecfbff'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, size * 0.055), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function drawDebuffIceSlow(ctx, e, x, y, size) {
    // 冰缓：蓝色霜层覆盖怪物主体；用椭圆裁切，不画蓝色方框。
    if (!(e._iceSlowT > 0) || e.frozen > 0) return;
    const cx = x + size / 2, cy = y + size / 2, t = Date.now();
    const baseAlpha = ctx.globalAlpha;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, size * 0.46, size * 0.52, 0, 0, Math.PI * 2); ctx.clip();
    const wash = ctx.createLinearGradient(x, y, x + size, y + size);
    wash.addColorStop(0, 'rgba(98,190,255,0.10)');
    wash.addColorStop(0.48, 'rgba(66,173,255,0.43)');
    wash.addColorStop(1, 'rgba(174,235,255,0.26)');
    ctx.fillStyle = wash; ctx.globalAlpha = baseAlpha;
    ctx.fillRect(x, y, size, size);
    // 冰霜流光与少量晶点强调“冰塔造成的冰缓”。
    ctx.strokeStyle = 'rgba(217,248,255,0.9)'; ctx.lineWidth = Math.max(1.5, size * 0.035);
    ctx.globalAlpha = baseAlpha * (0.45 + 0.25 * Math.sin(t / 160));
    for (let k = 0; k < 3; k++) {
      const yy = y + size * (0.28 + k * 0.22) + Math.sin(t / 190 + k) * size * 0.035;
      ctx.beginPath(); ctx.moveTo(x + size * 0.18, yy); ctx.lineTo(x + size * 0.82, yy - size * 0.08); ctx.stroke();
    }
    for (let k = 0; k < 4; k++) {
      const a = t / 750 + k * Math.PI / 2;
      const px = cx + Math.cos(a) * size * 0.34, py = cy + Math.sin(a) * size * 0.38;
      ctx.fillStyle = '#e8fbff'; ctx.globalAlpha = baseAlpha * 0.85;
      ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, size * 0.035), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawDebuffSlow(ctx, e, x, y, size) {
    // 普通减速：只在脚下画扩散波纹，不染色怪物。
    const genericSlowT = e._genericSlowT || ((e.slow && e.slow.ttl > 0 && !(e._iceSlowT > 0)) ? e.slow.ttl : 0);
    if (genericSlowT > 0) {
      const cx = x + size / 2, cy = y + size / 2;
      const tNow = typeof this.animNow === 'number' ? this.animNow : Date.now();
      const baseAlpha = ctx.globalAlpha;
      const groundY = y + size * 0.91;
      ctx.save();
      for (let k = 0; k < 3; k++) {
        const phase = ((tNow / 680 + k / 3) % 1 + 1) % 1;
        ctx.strokeStyle = k % 2 ? '#d4f4ff' : '#a9e8f4';
        ctx.lineWidth = Math.max(1.8, size * 0.05);
        ctx.globalAlpha = baseAlpha * 0.95 * (1 - phase);
        ctx.beginPath(); ctx.ellipse(cx, groundY, size * (0.12 + phase * 0.48), size * (0.045 + phase * 0.10), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawDebuffParalyze(ctx, e, x, y, size) {
    // 麻痹：怪物左右快速抖动；头顶独立图标由状态图标行绘制。
    if (e.paralyzed > 0) {
      const cx = x + size / 2, cy = y + size / 2;
      const tNow = Date.now();
      // 周围跳动电光点（确定性：时间+索引相位），不再重复画头顶 Emoji 电击图标。
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
    // 敌人标记（原 猎手标记；技能已删除，保留渲染分支以便未来复用标记机制）
    // 红色半透明瞄准环 + 十字准线 + 中心点，随层数扩大脉冲
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
          // 灼烧效果：4 帧火焰贴图循环燃烧（120ms/帧，透明 PNG）+ 火焰描边 + 少量火苗
          // 图标缩小并下移到底部（怪物脚下）
          // 点燃图标下边界与怪物下边界对齐（图片底边贴齐 y+size）
          const fireI = d.stack || 1;
          const cx = x + size / 2, cy = y + size / 2;
          const fw = size * (0.48 + 0.035 * Math.min(2, fireI)), fh = size * (0.48 + 0.035 * Math.min(2, fireI));
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
          // .9c 不再绘制灼烧火焰描边框（debuff 不高亮模型边框），仅保留火焰贴图/回退火苗特效
        } else if (d.type === 'poison') {
          // 中毒层数标识：敌人身上按叠层层数画毒泡（最多 5 个，层数越高泡越大越亮）+ 头顶层数数字
          const stack = d.stack || 1;
          const cx = x + size / 2, cy = y + size / 2;
          const tNow = Date.now();
          const n = Math.min(5, stack);
          for (let k = 0; k < n; k++) {
            const ph = tNow / 360 + k * 1.21;
            const px = cx + Math.cos(ph * 1.7) * size * 0.22;
            const py = cy + size * 0.12 + Math.sin(ph * 1.3 + k) * size * 0.12 - k * size * 0.025;
            const br = 3.2 + Math.min(2.4, stack * 0.28);
            ctx.fillStyle = 'rgba(18,74,37,0.8)'; ctx.globalAlpha = 0.84;
            ctx.beginPath(); ctx.arc(px, py, br + 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = k === n - 1 ? '#8dff9d' : (k % 2 ? '#47d66e' : '#2eae58');
            ctx.globalAlpha = 0.82 + 0.18 * Math.sin(tNow / 150 + k * 2);
            ctx.beginPath(); ctx.arc(px, py, br, 0, Math.PI * 2); ctx.fill();
            // 小高光让毒泡有体积并保持明显的上下浮动。
            ctx.fillStyle = '#effff2'; ctx.globalAlpha = 0.82;
            ctx.beginPath(); ctx.arc(px - br * 0.32, py - br * 0.35, Math.max(1, br * 0.28), 0, Math.PI * 2); ctx.fill();
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
    // 毒藤：加粗的双层藤蔓绕身缠绕，辅以亮色藤脊、刺点与摆动叶片。
    if (e._vineT > 0) {
      const cx = x + size / 2, cy = y + size / 2;
      const tNow = Date.now();
      const sheet = loadImg('assets/images/towers/debuff/vine/vine-wrap-8f.png');
      if (sheet && sheet.width && sheet.height) {
        const cols = 4, rows = 2, frameCount = 8;
        const frame = Math.floor(tNow / 135) % frameCount;
        const sx = Math.floor((frame % cols) * sheet.width / cols);
        const sy = Math.floor(Math.floor(frame / cols) * sheet.height / rows);
        const sw = Math.ceil(sheet.width / cols), sh = Math.ceil(sheet.height / rows);
        const drawW = size * 1.36, drawH = size * 1.28;
        ctx.save();
        ctx.globalAlpha *= 0.96 + 0.04 * Math.sin(tNow / 130);
        ctx.drawImage(sheet, sx, sy, sw, sh, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
        ctx.restore();
        return;
      }
      const pulse = 1 + 0.08 * Math.sin(tNow / 190 + (e.id || 0) % 7);
      const spin = tNow / 390 + (e.id || 0);
      const baseAlpha = ctx.globalAlpha;
      ctx.save();
      // 暗色藤影先铺底，让藤蔓在不同颜色、不同体型的怪物上都清楚可见。
      ctx.strokeStyle = '#183d25'; ctx.globalAlpha = baseAlpha * 0.92;
      ctx.lineWidth = Math.max(4, size * 0.11) * pulse;
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
      // 亮绿色藤脊与粗藤重合，形成明显的双层绳索轮廓。
      ctx.strokeStyle = '#55d86a'; ctx.globalAlpha = baseAlpha * (0.76 + 0.16 * Math.sin(tNow / 170));
      ctx.lineWidth = Math.max(2, size * 0.052) * pulse;
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
      // 叶片改为细长叶形，随藤蔓摆动，不再像圆点。
      for (let k = 0; k < 5; k++) {
        const ph = spin * 0.8 + k * 1.257;
        const lx = cx + Math.cos(ph) * size * 0.46;
        const ly = cy + Math.sin(ph) * size * 0.31;
        const leafLen = Math.max(5, size * 0.16);
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(ph + Math.PI / 2);
        ctx.fillStyle = k % 2 ? '#72ed74' : '#35c95e';
        ctx.globalAlpha = baseAlpha * (0.72 + 0.22 * Math.sin(tNow / 150 + k));
        ctx.beginPath();
        ctx.moveTo(0, -leafLen * 0.65);
        ctx.quadraticCurveTo(leafLen * 0.72, -leafLen * 0.25, 0, leafLen * 0.65);
        ctx.quadraticCurveTo(-leafLen * 0.72, -leafLen * 0.25, 0, -leafLen * 0.65);
        ctx.fill();
        ctx.strokeStyle = '#d7ffd4'; ctx.lineWidth = Math.max(1, size * 0.018); ctx.globalAlpha = baseAlpha * 0.8;
        ctx.beginPath(); ctx.moveTo(0, leafLen * 0.45); ctx.lineTo(0, -leafLen * 0.45); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function drawDebuffBleed(ctx, e, x, y, size) {
    // 流血：6 帧循环的滴血动画，持续到流血计时结束。
    if (!(e.bleedT > 0)) return;
    ctx.save();
    const cx = x + size / 2;
    const tNow = Date.now();
    const baseAlpha = ctx.globalAlpha;
    const frame = Math.floor(tNow / 100) % 6;
    for (let k = 0; k < 3; k++) {
      const phase = ((frame / 6 + k / 3) % 1 + 1) % 1;
      const swingFrame = (frame + k * 2) % 6;
      const px = cx + Math.sin(swingFrame * Math.PI / 3) * size * 0.25;
      const py = y + size * (0.30 + phase * 0.62);
      const r = Math.max(1.5, size * (0.035 + 0.018 * phase));
      ctx.fillStyle = '#b42335';
      ctx.globalAlpha = baseAlpha * 0.82 * (1 - phase * 0.28);
      ctx.beginPath();
      ctx.moveTo(px, py - r * 1.7);
      ctx.quadraticCurveTo(px + r * 1.5, py - r * 0.2, px, py + r);
      ctx.quadraticCurveTo(px - r * 1.5, py - r * 0.2, px, py - r * 1.7);
      ctx.fill();
    }
    ctx.restore();
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
    const dots = e.dots || [];
    const burn = dots.find((d) => d.type === 'burn');
    const poison = dots.find((d) => d.type === 'poison');
    if (e.frozen > 0) items.push({ kind: 'iceBlock', tint: '#72cfff', left: e.frozen });
    if (e._iceSlowT > 0) items.push({ kind: 'snowflake', tint: '#63caff', left: e._iceSlowT });
    const genericSlowT = e._genericSlowT || ((e.slow && e.slow.ttl > 0 && !(e._iceSlowT > 0)) ? e.slow.ttl : 0);
    if (genericSlowT > 0) items.push({ kind: 'foot', tint: '#d9f4ff', left: genericSlowT });
    if (poison) items.push({ kind: 'poisonDrop', tint: '#55dc77', left: poison.ttl, stack: poison.stack || 1 });
    if ((e._vineT || 0) > 0) items.push({ kind: 'vine', tint: '#55dc77', left: e._vineT });
    if (e.paralyzed > 0) items.push({ kind: 'lightning', tint: '#ffd438', left: e.paralyzed });
    if (burn) items.push({ kind: 'flame', tint: '#ff7545', left: burn.ttl });
    if (e.bleedT > 0) items.push({ kind: 'bleedDrop', tint: '#e34c56', left: e.bleedT });
    if (!items.length) return;
    const r = 8.5, gap = 19, shown = items.slice(0, 6), overflow = items.length - shown.length;
    // 图标均位于血条上方，尺寸压缩后可同时识别更多状态；超出 6 个时以 +N 提示。
    const icY = y - 18, slotCount = shown.length + (overflow ? 1 : 0), totalW = slotCount * gap;
    const cx0 = Math.max(10 + r, Math.min(740 - totalW + gap - r, x + size / 2 - totalW / 2 + r));
    shown.forEach((it, i) => {
      const cx = cx0 + i * gap;
      const iconScale = it.kind === 'iceBlock' ? 0.7 : (it.kind === 'vine' ? 0.8 : 1);
      const iconR = r * iconScale;
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.beginPath(); ctx.arc(cx, icY, iconR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = it.tint; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(cx, icY, iconR, 0, Math.PI * 2); ctx.stroke();
      drawDebuffIconMark(ctx, it.kind, cx, icY, 6.1 * iconScale, it.tint);
      if (it.stack > 1) {
        ctx.fillStyle = '#12351e'; ctx.beginPath(); ctx.arc(cx + 6.2, icY + 6.2, 4.2, 0, Math.PI * 2); ctx.fill();
        text(ctx, String(it.stack), cx + 6.2, icY + 6.2, 7, '#effff1', 'center');
      }
      if (it.left > 0) text(ctx, Math.ceil(it.left), cx + iconR - 1, icY - iconR + 1, 8, '#ffffff', 'left');
    });
    if (overflow) text(ctx, '+' + overflow, cx0 + shown.length * gap, icY, 9, '#ffd34d', 'center');
  }

  function drawDebuffIconMark(ctx, kind, cx, cy, s, color) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = color;
    ctx.lineWidth = 1.35; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'iceBlock') {
      // 蓝色立方冰块
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.78, -s * 0.55); ctx.lineTo(s * 0.78, s * 0.45);
      ctx.lineTo(0, s); ctx.lineTo(-s * 0.78, s * 0.45); ctx.lineTo(-s * 0.78, -s * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, 0); ctx.lineTo(s * 0.78, -s * 0.55); ctx.moveTo(0, 0); ctx.lineTo(-s * 0.78, -s * 0.55); ctx.stroke();
    } else if (kind === 'snowflake') {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); ctx.stroke();
        const ex = Math.cos(a) * s * 0.62, ey = Math.sin(a) * s * 0.62;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(a + side * 0.72) * s * 0.35, ey + Math.sin(a + side * 0.72) * s * 0.35); ctx.stroke();
        }
      }
    } else if (kind === 'foot') {
      ctx.rotate(-0.28);
      ctx.beginPath(); ctx.ellipse(-0.5, 1, s * 0.42, s * 0.66, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-s * 0.45 + i * s * 0.45, -s * 0.65 - (i === 1 ? 1 : 0), 1.25, 0, Math.PI * 2); ctx.fill(); }
    } else if (kind === 'poisonDrop' || kind === 'bleedDrop') {
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.bezierCurveTo(s * 0.34, -s * 0.35, s * 0.88, s * 0.3, 0, s);
      ctx.bezierCurveTo(-s * 0.88, s * 0.3, -s * 0.34, -s * 0.35, 0, -s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-s * 0.22, s * 0.1, s * 0.16, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'vine') {
      ctx.beginPath(); ctx.moveTo(-s, s * 0.65); ctx.bezierCurveTo(-s * 0.45, -s, s * 0.45, s, s, -s * 0.65); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-s * 0.5, -s * 0.35, s * 0.28, s * 0.48, -0.75, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.35, s * 0.28, s * 0.48, 0.75, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'lightning') {
      ctx.beginPath(); ctx.moveTo(s * 0.15, -s); ctx.lineTo(-s * 0.62, 0); ctx.lineTo(-s * 0.08, 0);
      ctx.lineTo(-s * 0.28, s); ctx.lineTo(s * 0.68, -s * 0.2); ctx.lineTo(s * 0.12, -s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'flame') {
      ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(-s, s * 0.45, -s * 0.45, -s * 0.2, 0, -s);
      ctx.bezierCurveTo(s * 0.2, -s * 0.15, s, s * 0.2, 0, s); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  return { preloadBoss, enemies, drawEnemyBody, drawEnemyAnim, drawEnemyDebuffs, drawDebuffFrozen, drawDebuffSlow, drawDebuffParalyze, drawDebuffMark, drawDebuffDots, drawDebuffVine, drawEnemyBar, drawEnemyDebuffIcons };
}
module.exports = { createEnemyLayer };
