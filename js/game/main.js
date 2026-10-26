/**
 * main.js —— 游戏主循环与状态机（渲染层入口）
 * 状态机：fighting（波内消除+战斗）→ 波末结算 → picking（三选一）→ 下一波 / gameover
 */
const CONFIG = require('../config.js');
const { Run } = require('../run.js');
const { Renderer, layout } = require('./render.js');
const { CombatSystem } = require('../combat.js');
const { initCanvas } = require('./canvas.js');
const { SfxManager } = require('./audio.js');

/* 环境初始化（模块化 v1.13.11）：主画布获取 + 尺寸适配 + ctx；失败返回 null 并输出诊断 */
const _c = initCanvas();
const ctx = _c ? _c.ctx : null;
if (!ctx) {
  module.exports = null;
} else if (typeof console !== 'undefined' && console.info) {
  console.info('[消消防线] 启动：canvas', _c.canvas.width + 'x' + _c.canvas.height,
    'scale', (Math.min(_c.canvas.width / CONFIG.DESIGN.W, _c.canvas.height / CONFIG.DESIGN.H)).toFixed(3));
}
const LOGIC_W = CONFIG.DESIGN.W;      // 750
const LOGIC_H = CONFIG.DESIGN.H;      // 1334
const WAVE_DUR = CONFIG.WAVE.seconds; // 40s
const GAME_VERSION = 'v1.16.95';       // v1.16.76 激励系统第一批：撤离点(每10波,池100%/阵亡30%)+深度里程碑(10-50波)+深度宝箱(5档/时间开启/钻石速开)+击杀掉落线(精英25%/Boss必掉碎片+小额金币)+圣遗物星级(1★解锁/2★升级/3★质变)+战场合约(熔岩/霜风/深渊+每日首战加成)+DEBUG测试工具       // v1.16.75 圣遗物三选一华丽金色UI + 宝箱点击动画链(5帧开箱→1s飞到屏幕中放大→0.5s从宝箱中心弹出) + 微开/快开帧素材 + 波间自动过渡提示/Boss闪烁警告 + 测试战场添加圣遗物 + 本局圣遗物详情弹层 + 主菜单4页签背景图/塔图鉴页 + debuff动画帧重做
const { SaveManager } = require('../save.js');
const { WaveDirector } = require('../wave.js');
const { Match3Controller } = require('../match3.js');

/* 塔位图标字符（加载失败时的兜底） */
const TOWER_ICON = { fire: '🔥', ice: '❄', poison: '☠', electric: '⚡', boomerang: '🌀', cannon: '💣' };

class GameMain {
  constructor() {
    this.scale = Math.min(_c.canvas.width / LOGIC_W, _c.canvas.height / LOGIC_H); // 等比 contain：完整显示且铺满（背景延伸填充剩余区）
    this.renderer = new Renderer();
    this.ly = layout();
    this.restartBtn = {};
    this.pickHits = {};
    this.funcHits = [];
    this.towerInfo = null;       // 塔详情弹层：{slotIdx, key, name, level, exp, expNeed, expRatio, dps, skills}
    this.towerInfoHits = {};     // 详情弹层命中：{bg, close, skill[]}
    this.towerSkill = null;      // v1.16.11 技能二级详情弹层：{key, skillName, icon, desc, color, lv, lvMax, branches, bA, bB, bC, branchDesc}
    this.towerSkillHits = {};    // 二级弹层命中：{bg, back}
    // v1.14 测试战场：塔技能配置面板 + 倍速 + 刷怪控制
    this.testPanel = null;       // {key} 当前配置的塔
    this.testHits = {};          // 测试战场命中区（渲染时重建）
    this.testSpeed = 1;          // 倍速 ×1/×2/×4
    this.runSpeed = 1;           // v1.16.13 主战斗加速 ×1/×2/×3/×4（v1.16.30 移到城墙上方按钮）
    this.menuStage = 'ancient';  // v1.16.30 主界面所选战场：ancient 远古 | test 测试（◀ ▶ 切换）
    this.funcLayer = null;       // 底部功能弹层：{type:'shop'|'setting'|'tome'|'help', confirming?, version?}
    this.funcLayerHits = {};     // 功能弹层命中：{bg, close, confirm?}
    this.toasts = [];
    this.selected = null;
    this.swapped = false;
    this.waveClear = null;
    this.waveClearBtn = {};
    this.waveHint = null;  // v1.16.73 波间透明提示（2s 自动消失，不暂停）
    this.bossHint = null;  // v1.16.73 每 5 波 Boss 警告（4s 闪烁，不暂停）
    // 开局引导：先消先得（消除 3 连 → 获得对应塔上槽）
    this.toasts.push({ msg: '滑动相邻方块消除 3 连 · 获得对应塔', color: '#9fb2c3', ttl: 3.2 });
    // 打击特效与音效（模块化 v1.13.11：SfxManager 独立管理）
    this.fx = [];
    this.anim = null; // 三消动画（消除+下落）
    this.sfx = new SfxManager();
    // 波次导演 / 三消控制器 / 存档 / 战斗系统（save 绑定 game，run 重建时仍读写当前局）
    this.wave = new WaveDirector(this, this.ly);
    this.match3 = new Match3Controller(this);
    this.combat = new CombatSystem(this);
    this.save = new SaveManager(this);
    this.saveData = this.save.load();
    // 局外数据（主界面）：金币 / 圣物 / 宝箱 / 每日精选
    this.meta = this.save.applyMeta(this.saveData);
    this.sfx.setEnabled(this.meta.soundOn !== false);   // v1.16.107 应用声音开关存档
    // 主界面状态
    this.menuTab = 'battle';     // battle / shop / relic / codex（v1.16.75 新增塔图鉴页签）
    this.codexSel = 'fire';      // v1.16.75 塔图鉴当前选中塔
    this.menuPanel = null;       // 子面板：{ type:'relicDex' | 'relicInfo' | 'starUp' }
    this.relicDexPage = 0;       // v1.16.78 圣物图鉴分页（每页 16 卡）
    this.menuHits = [];          // 主界面命中区（渲染时重建）
    this._rewardedAd = null;     // 激励视频广告实例（惰性创建）
    this._postPick = null;       // 升级三选一完成后回到的状态（'waveclear' / null=战斗）
    // 战斗内圣物宝箱三选一：精英掉落入队，逐次弹层（暂停战斗）
    this.pendingRelicPicks = []; // [{ candidates: [{id,name,icon,desc}×3] }]
    this.runRelics = [];         // v1.16.60 本局已获得的局内圣遗物 id 列表（rougelike，本局生效）
    this.relicPick = null;       // 当前圣物三选一弹层
    this.relicPickHits = [];     // 圣物三选一候选命中区
    this.newRun(false);
    this.bindTouch();
    this.lastTs = 0;
    requestAnimationFrame(this.loop.bind(this));
  }

  /** 新建对局；enterBattle=true 时应用技能搭配/圣物并进入战斗，否则停留在主界面 */
  newRun(enterBattle) {
    this.run = new Run({ difficulty: CONFIG.DIFFICULTY.default });
    this.run.metaRef = this.meta;   // v1.16.78 星级查询（圣遗物 2★ 数值乘区）
    this.save.apply(this.saveData);
    this.waveTime = 0;
    this.enemies = [];
    this.pickQueue = [];
    this.pickIndex = 0;
    this.pickCell = null; // 点击交换选中格
    this.combat.reset();
    this._postPick = null;
    this.battleRelics = []; // v1.16.73：本局获得的圣物（状态栏圣遗物行展示前10个 + 点击查看详情）
    this.fieldChests = [];  // v1.16.59：战场宝箱实体（怪物掉落，点击后开启圣物三选一）{x,y,t,kind}
    this._chestBusy = false; // v1.16.74 宝箱开箱→飞行动画期间锁定战斗输入
    this.relicDetail = null;      // v1.16.73：本局圣遗物详情弹层 {page}（点击顶部状态栏圣遗物行打开，战斗暂停）
    this.relicDetailHits = {};    // 详情弹层命中区（close/prev/next）
    /* v1.16.76 激励系统：战场合约 + 撤离点 + 击杀掉落 */
    this.field = CONFIG.FIELDS[this.menuStage] || CONFIG.FIELDS.ancient;
    this.run.fieldAmmoMult = this.field.ammoCapMult;   // 弹药上限倍率（战场扭曲规则）
    this.run.fieldCfg = this.field;                    // v1.16.78 战场被动触发器（风场/诅咒）
    this.depthPool = 0;          // 深度收益池（撤离拿 100%，阵亡保底 30%）
    this.depthMult = 1;          // 深度倍率（每通过一个撤离点 ×1.30，40 波后 ×1.10）
    this.runShardGained = 0;     // 本局击杀获得碎片数（结算展示）
    this.runSummary = null;      // 局末结算摘要（gameover 层展示）
    // 每日首战加成（每战场前 2 局 ×1.5，之后 ×0.5；测试战场不计）
    this.firstBonus = (this.menuStage !== 'test') ? this.meta.dailyFirstBonus(this.menuStage, Date.now()) : 1;
    if (enterBattle) {
      this.enterBattle();
    } else {
      this.state = 'menu';
      this.sfx.stopBgm();
    }
  }

  /** 应用主界面配置进入战斗：塔参战 + 圣物城墙血量（v1.12：无默认技能，技能全部靠三选一获取） */
  enterBattle() {
    // 拥有塔参战（level≥1，塔位区可出战）
    this.run.slotOrder.forEach((k) => {
      const t = this.run.effects.tower(k);
      if (t && t.level === 0) t.level = 1;
    });
    // v1.12：不再默认激活任何技能——塔无获取技能时技能列表为空，
    // 所有技能通过「打怪经验 → 整体升级 → 三选一」获取（技能卡激活 / 分支卡续升）
    // 圣物·磐石印：城墙血量上限；v1.16.78 城墙加固（局内圣遗物）：城墙血量 +N%
    const b = this.meta.relicBonus();
    const wallRelic = this.run.relicNum('cm_wall');
    this.run.lineHp = Math.round(CONFIG.LINE.hp * (1 + 0.10 * b.wall) * (1 + wallRelic / 100));
    this.run.lineMaxHp = this.run.lineHp;   // v1.13.25 冰墙回血上限基准
    this.state = 'fighting';
    this.wave.start();
    this.toast('进入战斗 · 消灭全部怪物', '#7ef0a3');
    // 战斗 BGM（真机需在用户手势后播放）
    this.sfx.startBgm();
  }

  /** 测试战场：单塔出战、弹药恒满、城墙无敌，专注技能效果验证（v1.14.1） */
  enterTestField() {
    // 全新对局构筑：塔等级/技能/棋盘重置（金币保留在 meta），默认出战火塔（可随时更换）
    this.run = new Run({ difficulty: CONFIG.DIFFICULTY.default });
    this.save.apply(this.saveData);
    this.run.resetRunBuild();
    this.waveTime = 0;
    this.enemies = [];
    this.pickQueue = [];
    this.pickIndex = 0;
    this.pickCell = null;
    this.combat.reset();
    this.battleRelics = [];
    // 单塔出战：默认火塔（v1.14.1 由 6 塔同场改为 1 塔，可经塔位切换钮更换）
    this.run.slotOrder = ['fire'];
    this.run.slotOrder.forEach((k) => { const t = this.run.effects.tower(k); if (t) t.unlock(); });
    // v1.16.4 单塔生效：测试战场只有出战塔参与战斗/协同，切塔即旧塔取消生效
    this.run.effects.setActiveKeys(['fire']);
    // 城墙：测试战场不扣血（恒满）
    this.run.lineHp = CONFIG.LINE.hp;
    this.run.lineMaxHp = this.run.lineHp;
    this.run.broken = false;
    this.run.wave = 0;
    this.testPanel = null;
    this.testSpeed = 1;
    this.state = 'testfield';
    this.sfx.stopBgm();
    this.toast('测试战场 · 点塔位配置技能 · 点“更换”切塔', '#7cd6a6');
  }

  /** 测试战场：更换出战塔（单塔模式，v1.14.1；v1.16.4 切塔后旧塔立即取消生效） */
  switchTestTower(key) {
    const t = this.run.effects.tower(key);
    if (!t) return;
    t.unlock();
    this.run.slotOrder = [key];
    this.run.effects.setActiveKeys([key]);
    this.testPanel = { key }; // 切塔后直接打开该塔技能面板
    this.combat.reset();
    this.toast(`出战塔：${CONFIG.COLORS[CONFIG.TOWERS[key].color].name}`, '#7cd6a6');
  }

  /** 测试战场状态（出战塔槽 + 全部塔简表 + 当前技能配置） */
  testState() {
    const run = this.run;
    const slots = [];
    this.run.slotOrder.forEach((key) => {
      const t = run.effects.tower(key);
      if (!t) { slots.push(null); return; }
      const skills = t.pool.map((ef) => {
        const p = (CONFIG.EFFECT_POOLS[key] || []).find((q) => q.name === ef.name) || {};
        return {
          name: ef.name, icon: p.icon || '?', color: p.color || '#888',
          level: ef.level,
          branches: { A: ef.branches.A || 0, B: ef.branches.B || 0, C: ef.branches.C || 0 },
        };
      });
      slots.push({
        key, name: CONFIG.COLORS[t.color].name,
        icon: TOWER_ICON[key] || '?', unlocked: true,
        level: t.level, energy: t.energy, energyMax: this.run.armoryEnergyMax(),   // v1.16.17 塔位徽章显示塔自身等级（选择次数+1）；v1.16.77 能量口径
        skills,
      });
    });
    // 6 塔切换简表（v1.14.1）
    const allTowers = Object.keys(this.run.effects.towers).map((key) => {
      const t = run.effects.tower(key);
      return { key, name: CONFIG.COLORS[t.color].name, icon: TOWER_ICON[key] || '?' };
    });
    return {
      state: this.state,
      lineHp: run.lineHp, lineMaxHp: run.lineMaxHp,
      wave: run.wave, waveTime: this.waveTime, waveDuration: WAVE_DUR,
      towers: slots,
      allTowers,
      enemyCount: this.enemies.length,
      speed: this.testSpeed,
      panel: this.testPanel,
      synergies: run.effects.synergyStatus(),
      battleRelics: this.battleRelics || [],   // v1.16.113 测试战场圣遗物行
    };
  }

  /** 测试战场：点塔技能行分支按钮 → 该分支 0↔1↔2↔3 循环；clear 清空该技能 */
  testSkillAction(key, name, br) {
    const t = this.run.effects.tower(key);
    if (!t) return;
    const ef = t.pool.find((e) => e.name === name);
    if (!ef) return;
    if (br === 'clear') {
      ef.branches.A = 0; ef.branches.B = 0; ef.branches.C = 0;
      ef.act = false; // v1.16.5 清除同时取消激活标记
      const i = t.activeNames.indexOf(name);
      if (i >= 0) t.activeNames.splice(i, 1);
      t.picked.delete(name);
    } else if (['A', 'B', 'C'].includes(br)) {
      ef.branches[br] = (ef.branches[br] + 1) % 4; // 0→1→2→3→0
      ef.act = (ef.branches.A + ef.branches.B + ef.branches.C) > 0; // v1.16.5 分支全归零 → 取消激活
      if (ef.level > 0) {
        if (!t.activeNames.includes(name)) t.activeNames.push(name);
        t.picked.add(name);
      } else {
        // 分支全部归零 → 移出激活与获取记录
        const i = t.activeNames.indexOf(name);
        if (i >= 0) t.activeNames.splice(i, 1);
        t.picked.delete(name);
      }
    }
    this.run.effects.updateSynergies();
    this.combat.reset(); // 技能变更后重置周期技计时，立即按新配置生效
    this.toast(`${CONFIG.COLORS[CONFIG.TOWERS[key].color].name}·${name} A${ef.branches.A}B${ef.branches.B}C${ef.branches.C}`, '#7ef0a3');
  }

  /** 测试战场：一键激活该塔全部技能（A 分支 Lv3，便于快速看全特效） */
  testSkillAll(key, on) {
    const t = this.run.effects.tower(key);
    if (!t) return;
    t.pool.forEach((ef) => {
      if (on) { ef.branches.A = 3; ef.branches.B = 0; ef.branches.C = 0; ef.act = true; if (!t.activeNames.includes(ef.name)) t.activeNames.push(ef.name); t.picked.add(ef.name); }
      else { ef.branches.A = 0; ef.branches.B = 0; ef.branches.C = 0; ef.act = false; }
    });
    if (!on) { t.activeNames = []; t.picked = new Set(); }
    this.run.effects.updateSynergies();
    this.combat.reset();
    this.toast(on ? `${CONFIG.COLORS[CONFIG.TOWERS[key].color].name} 全部技能激活` : `${CONFIG.COLORS[CONFIG.TOWERS[key].color].name} 技能已清空`, '#7ef0a3');
  }

  /** 测试战场：召唤敌人（type: normal/runner/tank/elite/boss；hp 按类型给测试值） */
  spawnTestEnemies(type, count) {
    const ly = this.renderer.ly;
    const entryY = ly.areaY + ly.entryH;
    const wallY = ly.wallY;
    const baseSpeed = ((wallY - entryY) / WAVE_DUR) * 3; // v1.14.2 测试战场怪速 ×3：13s 到墙，避免入口盲区等待过久
    // 测试血量（基础塔 dps 20-40，普通怪 500 约 15 秒内可清，便于观察技能特效）
    const HP = { normal: 500, runner: 350, tank: 1500, elite: 4000, boss: 12000 };
    for (let i = 0; i < count; i++) {
      const isBoss = type === 'boss';
      this.wave.pushEnemy(
        HP[type] || 500, entryY, baseSpeed,
        0.5 + Math.random() * 0.5, isBoss, type
      );
    }
    this.toast(`召唤 ${type === 'normal' ? '普通' : type === 'runner' ? '快速' : type === 'tank' ? '重甲' : type === 'elite' ? '精英' : 'Boss'} ×${count}`, '#f7c948');
  }

  /** 测试战场：清空全部敌人与飞行弹道 */
  clearTestEnemies() {
    this.enemies = [];
    this.combat.reset();
    this.toast('已清场', '#9fb2c3');
  }

  /** 测试战场：切换倍速 ×1/×2/×4 */
  cycleTestSpeed() {
    this.testSpeed = this.testSpeed >= 4 ? 1 : this.testSpeed * 2;
    this.toast(`倍速 ×${this.testSpeed}`, '#7cd6a6');
  }

  /** 主战斗：切换倍速 ×1/×2/×3/×4（战斗区右下角按钮） */
  cycleRunSpeed() {
    this.runSpeed = this.runSpeed >= 4 ? 1 : this.runSpeed + 1;
    this.toast(`加速 ×${this.runSpeed}`, '#7cd6a6');
  }

  /* ---------- 帧循环 ---------- */

  loop(ts) {
    try {
      const dt = this.lastTs ? Math.min(0.1, (ts - this.lastTs) / 1000) : 0.016;
      this.lastTs = ts;
      this.update(dt);
      this.render();
      this.pixelCheck();
      requestAnimationFrame(this.loop.bind(this));
    } catch (e) {
      console.error('[消消防线] 帧循环错误：', e && e.stack ? e.stack : e);
      // 一次渲染/逻辑异常不应卡死整局：继续调度帧循环（保留最后画面，触摸仍可响应）
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  /** 首帧渲染自检：读画布中心像素，判定内容是否真的画上去了 */
  pixelCheck() {
    if (this._pixelChecked) return;
    this._pixelChecked = true;
    try {
      const w = _c.canvas.width, h = _c.canvas.height;
      const img = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1);
      console.info('[消消防线] 画布中心像素采样：', Array.prototype.slice.call(img.data));
    } catch (e) {
      console.info('[消消防线] 画布像素采样不可用：', e && e.message);
    }
  }

  update(dt) {
    // toast 过期
    this.toasts = this.toasts.filter((t) => (t.ttl -= dt) > 0);
    // 特效推进（v1.16.48：战斗状态内随倍速加速——弹道/爆炸/粒子/技能演出与怪物移速、塔攻速同频，
    //  避免"逻辑快、动画慢"的不和谐；菜单/弹层等状态倍速为 1 不受影响）
    const fxMul = (this.state === 'fighting' || this.state === 'testfield')
      ? (this.state === 'testfield' ? this.testSpeed : this.runSpeed) : 1;
    this.fx = this.fx.filter((f) => { f.t += dt * fxMul; return f.t < f.dur; });
    // 三消动画推进（交换 → 消除 → 逐级连锁，由 match3 控制器管理）
    this.match3.update(dt);
    // 主界面：宝箱开箱倒计时完成 → 发卡；每日精选跨天自动刷新
    if (this.state === 'menu') {
      this.tickChest(Date.now());
      this.meta.ensureDailyPicks(Date.now());
      return;
    }
    if (this.state === 'fighting') {
      // 战斗内圣物宝箱（精英掉落）三选一：有队列先弹层，暂停战斗推进
      if (this.pendingRelicPicks.length) {
        this.relicPick = this.pendingRelicPicks.shift();
        this.relicPickHits = [];
        this.relicPick.t = 0; // v1.16.74 三选一窗口弹出动画（缩放渐入）
        this.state = 'relicpick';
        this.toast('圣物宝箱 · 三选一', '#f7c948');
        return;
      }
      // v1.16.15 即时三选一：每获得 1 次选择机会（塔升级/得塔）立即弹出，不再攒到波末统一结算
      if (this.run.effects.pendingTotal() > 0) {
        this.flushUpgrades();
        return;
      }
      // v1.16.13 主战斗加速：战斗逻辑时间按倍速推进（UI/特效动画保持真实帧速）
      const bdt = dt * this.runSpeed;
      this.waveTime += bdt;
      // v1.16.74 战场宝箱生命周期：20s 未点击自动消失；点击后开箱(0.4s 四帧)→飞向屏幕中心放大(0.6s)→弹圣物三选一（全程 1s）
      this.fieldChests = this.fieldChests.filter((c) => {
        c.t += bdt;
        if (c.animT != null) {
          if (c.stage === 'fly') {
            c.flyT += bdt;
            if (c.flyT >= 0.6) { this.spawnRelicPick(); return false; } // 飞行到位 → 弹三选一
          } else {
            c.animT += bdt;
            if (c.animT >= 0.4) { c.stage = 'fly'; c.flyT = 0; } // 开箱完成 → 飞向屏幕中心
          }
          return true; // 动画播放中不受 20s 消失计时影响
        }
        return c.t < 20;
      });
      // 陆续投放本波敌人（非一次性同屏）
      this.wave.tick(bdt);
      this.stepEnemies(bdt);
      // v1.12.1 失败立即结算：城墙血量归零 → 直接进入失败界面（不再等当前波打完）
      if (this.run.broken) { this.waveEnd(); return; }
      // 波次完成标准 = 打完本波全部敌人（含未出场）；不再按波次时长提前结束
      if (!this.enemies.length && !this.wave.plan.length && this.waveTime > 3) {
        this.waveEnd();
      }
      return;
    }
    // v1.14 测试战场：能量恒满 + 倍速推进战斗（不结算波次/不弹三选一）
    if (this.state === 'testfield') {
      this.run.slotOrder.forEach((k) => {
        const t = this.run.effects.tower(k);
        if (t) t.energy = this.run.armoryEnergyMax();
      });
      this.waveTime += dt;
      this.stepEnemies(dt * this.testSpeed);
      return;
    }
  }

  /** 主界面宝箱倒计时推进：到点自动发卡 */
  tickChest(now) {
    const m = this.meta;
    if (!m.chestTimer) return;
    const remain = m.chestRemainSec(now);
    if (remain === 0) {
      const got = m.finishChest(now);
      if (got) this.toast(`宝箱开启：获得 ${got.icon}${got.name}`, '#f7c948');
      this.save.save();
    }
  }

  /** 敌人移动 + 塔真实攻击（A1：每塔独立攻击/技能行为，见 combat.js）+ 攻城攻击 + 打击特效 */
  stepEnemies(dt) {
    // 塔是唯一伤害源：无塔（槽位未解锁）→ 不结算伤害、不产生射击与击杀表现；但攻城是怪物行为，无塔时仍推进
    if (this.run.slotOrder.length === 0) {
      this.enemies.forEach((e) => this.moveEnemy(e, dt));
      this.siegeEnemies(dt);
      return;
    }
    // A1 真实战斗：弹道命中 / DoT / 塔攻击调度 / 周期技 / 死亡触发
    this.combat.update(dt);
    // 血条延迟尾条推进：直接伤害后 hp 瞬掉、尾条缓慢收缩（视觉区分直接伤/持续伤）
    this.enemies.forEach((e) => {
      if (e.delayHp === undefined) e.delayHp = e.hp;
      e.delayHp = e.hp + (e.delayHp - e.hp) * Math.exp(-dt * 2.2);
    });
    // 移动：冰冻/减速影响移动速度；已到城墙攻击范围的停止前进
    this.enemies.forEach((e) => this.moveEnemy(e, dt));
    // 攻城：到达城墙攻击范围的怪物按攻击力×攻击频率持续扣城墙血（v1.16.43 抽出独立方法，无塔时同样执行）
    this.siegeEnemies(dt);
    // 死亡清场（combat.update 已结算死亡技能，此处统一移除尸体）
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** 攻城：到达城墙攻击范围的怪物按攻击力×攻击频率持续扣城墙血（冰冻/麻痹停止攻击；冰墙吸收/反伤/迟缓）
   *  v1.16.43 修复：无塔（槽位未解锁）时怪物到城墙也应攻城掉血——此前被「无塔不战斗」提前 return 跳过，城墙完全不扣血 */
  siegeEnemies(dt) {
    const wallLine = this.ly.wallY - 10; // 城墙攻击范围（城墙顶）
    let wallHits = 0;
    for (const e of this.enemies) {
      if (e.y < wallLine) continue;
      if (e.frozen > 0 || e.paralyzed > 0) continue;
      // 毒·瘴气：环内敌人命中率下降（20% 概率攻击落空，v1.16.21）
      if (e._miasma && Math.random() < 0.20) continue;
      // 冰墙攻击间隔迟缓计时（v1.16.21：被冰墙迟缓的敌人攻击间隔 +0.5s）
      if (e.atkSlowT > 0) { e.atkSlowT -= dt; if (e.atkSlowT <= 0) e.atkSlowAdd = 0; }
      // v1.16.98 冰雾3★：冰雾地面内敌人攻速 -20%（攻击间隔 ×1.25）
      const fogSlow = (e._fogTtl > 0) ? 0.25 : 0;
      const eAtkInt = ((e.attackInterval || 1) + (e.atkSlowAdd || 0)) * (1 + fogSlow);
      e.attackT = (e.attackT || 0) + dt;
      if (e.attackT >= eAtkInt) {
        e.attackT -= eAtkInt;
        // 毒·瘴气 C：瘴内中毒敌人攻击力降低（-20%/-35%/-50%，v1.15）；v1.16.78 减伤护符：城墙受伤 -N%（按星级）
        const guard = this.run.relicNum('cm_guard');
        const atkDmg = e.attack * (e._miasmaAtkMult || 1) * (guard > 0 ? (1 - guard / 100) : 1);
        const iw = this.combat.iceWall;
        if (iw && iw.ttl > 0) {
          // 冰墙：先吸收伤害；溢出部分扣城墙；反伤攻击者；迟缓（减速40% + 攻击间隔 +0.5s·持续2s）
          const absorbed = Math.min(iw.absorb, atkDmg);
          iw.absorb -= absorbed;
          const leak = atkDmg - absorbed;
          // v1.14 测试战场：城墙无敌（不扣血，专注技能验证）
          // v1.16.96 城墙受击统一入口：减伤护符3★ 大额截断 + 生命回复3★ 护盾优先抵扣
          if (leak > 0 && this.state !== 'testfield') this.run.lineHp -= this.run.applyWallDamage(leak);
          if (iw.reflect > 0) this.combat.damage(e, absorbed * iw.reflect, 'ice');
          this.combat.applySlow(e, 0.4, 2);
          e.atkSlowAdd = 0.5; e.atkSlowT = 2;
          // 冰墙受击视觉：冰晶飞溅
          this.combat.fxParticle(e.x, e.y, '#b8e6ff', 5, 40, 0.35, 90, 4);
        } else {
          // v1.16.96 城墙受击统一入口：减伤护符3★ 大额截断 + 生命回复3★ 护盾优先抵扣
          if (this.state !== 'testfield') this.run.lineHp -= this.run.applyWallDamage(atkDmg);
        }
        wallHits++;
        // v1.14 测试战场：城墙无敌，不触发破防
        if (this.state !== 'testfield' && this.run.lineHp <= 0) {
          this.run.lineHp = 0;
          this.run.broken = true;
        }
      }
    }
    if (wallHits) this.fx.push({ type: 'hitwall', x: 375, y: wallLine, t: 0, dur: 0.3 });
  }

  /** 敌人移动：冰冻停止移动；减速乘系数；到达城墙攻击范围后停止前进（转入攻城）
   *  v1.16.96 时间停滞3★：Boss 对减速效果只生效 50%（减速幅度折半，普通怪全吃） */
  moveEnemy(e, dt) {
    if (e.frozen > 0) return;
    if (e.y >= this.ly.wallY - 10) return;
    let slowEff = e.slow && e.slow.ttl > 0 ? e.slow.mult : 1;
    if (this.run.relic3('cm_stasis') && e.isBoss) slowEff = 1 - (1 - slowEff) * 0.5;
    // v1.16.100 缓毒3★：中毒减速与冰缓/麻痹叠加时，总减速上限 +15%（移动再减 15%）
    if (this.run.relic3('poison_slow') && this.combat.hasDot(e, 'poison') && (e.slow || e.paralyzed > 0)) {
      slowEff = Math.min(slowEff, slowEff * 0.85);
    }
    // v1.16.78 时间停滞（局内圣遗物）：怪物移速降低 N%（按星级）
    const stasis = this.run.relicNum('cm_stasis');
    const stasisMul = stasis > 0 ? (1 - stasis / 100) : 1;
    // v1.16.78 霜风峡谷风场被动：移速 ×1.10^风场层数
    const windMul = this.run.windStacks ? Math.pow(1.10, this.run.windStacks) : 1;
    e.y += e.speed * slowEff * stasisMul * windMul * dt;
  }

  playSfx(kind, minGap) {
    // 模块化 v1.13.11：转发到 SfxManager（防抖 + stop/play）
    this.sfx.play(kind, minGap);
  }

  waveEnd() {
    // 真实战斗路径：城墙血已由「怪物攻城」实时扣减，跳过抽象漏怪模型扣血（skipLeak=true）
    const res = this.run.endWave(true);
    // 波末全塔少量经验（打怪为主渠道，波末是补充；v1.8 统一入整体池）
    const owned = this.run.slotOrder.length;
    if (owned > 0) this.run.gainExp(CONFIG.EXP.waveBonus * owned);
    // v1.16.77 波末金币只入「局内金币」（run.endWave 已累加 _waveGold），不再发放局外银币；
    //   招财符加成移至战斗结束统一结算（finishRun）
    this.save.save();
    if (res.broken) {
      this.finishRun(false);   // v1.16.76 破防 → 局末结算（深度收益保底 30%）
      return;
    }
    // v1.16.76 深度收益池：每波金币的一半入池 × 深度倍率；撤离拿池 100%，阵亡保底 30%
    const EV = CONFIG.EVAC;
    this.depthPool += res.waveGold * EV.poolShare * this.depthMult * (this.firstBonus || 1) * (this.field.goldMult || 1);
    // v1.16.78 战场被动触发提示（下一波生效）
    const Fp = this.field || {};
    if (Fp.windEvery && this.run.wave % Fp.windEvery === 0) {
      this.toast(`🌪 霜风峡谷：风场增速！怪物移速 +10%（第 ${this.run.wave} 波起）`, '#7cd6ff');
    }
    if (Fp.curseEvery && this.run.wave % Fp.curseEvery === 0) {
      this.toast(`☠ 深渊诅咒！怪物血量 +15%（第 ${this.run.wave} 波起）`, '#c9a0ff');
    }
    // 撤离点：每 10 波一次决策（测试战场不弹）
    if (this.run.wave % EV.interval === 0) {
      this.depthMult *= (this.run.wave < EV.lateWave ? EV.depthMult : EV.depthMultLate);
      if (this.menuStage !== 'test') {
        this.state = 'evacuation';
        this.evacHits = {};
        return;
      }
    }
    // v1.16.73 波间不弹确认窗：直接结算进入下一波（有升级待选先弹三选一），并弹 2s 透明提示
    this.waveClearNext();
  }

  /** v1.16.76 局末结算：撤离/破防统一入口。深度收益按比例发放 + 里程碑首达 + 深度宝箱 */
  finishRun(evacuated) {
    const EV = CONFIG.EVAC;
    // v1.16.78 深渊裂隙合约：深度结算 ×2（deepMult）
    const deepMult = (this.field && this.field.deepMult) || 1;
    const payout = Math.round(this.depthPool * (evacuated ? 1 : EV.deadRatio) * deepMult);
    this.meta.gold += payout;
    // v1.16.77 战斗结束统一结算银币：局内金币（波末累加 + 击杀）按招财符加成一次性转为局外银币，之后清零
    const b = this.meta.relicBonus();
    const silver = Math.round(this.run.gold * (1 + 0.20 * b.gold));
    if (silver > 0) {
      this.meta.gold += silver;
      this.silverGained = silver;
    }
    this.run.gold = 0;
    const miles = this.meta.checkMilestone(this.run.wave);   // 首达里程碑 + 更新最深波次
    // v1.16.92 前三波阵亡取消深度宝箱低保（木箱不再发放；撤离最早 10 波不受影响）
    const noChest = !evacuated && this.run.wave <= 3;
    const tier = noChest ? null : this.meta.tierByWave(this.run.wave);
    let chestExtra = null;
    const ok1 = tier ? this.meta.grantDeepChest(tier) : false;
    if (evacuated && this.run.wave >= CONFIG.EVAC.lateWave) {
      // 撤离成功顶配加发：星辉→黄金 / 黄金→白银（低一档宝箱）
      const idx = CONFIG.DEPTH_CHEST.tiers.indexOf(tier);
      const lower = CONFIG.DEPTH_CHEST.tiers[Math.max(0, idx - 1)];
      if (this.meta.grantDeepChest(lower)) chestExtra = lower.name;
    }
    this.save.save();
    // v1.16.106 结算数据补全：总击杀 + 本局圣遗物快照 + 招财符加成系数（结算界面展示）
    const ks = this.combat && this.combat.kills ? Object.values(this.combat.kills).reduce((a, b) => a + b, 0) : 0;
    this.runSummary = {
      evacuated, wave: this.run.wave, payout, miles,
      chestName: tier ? tier.name : null, chestGranted: ok1, chestExtra,
      chestSkipped: noChest,   // v1.16.92 前三波阵亡无宝箱（结算页区分提示）
      shards: this.runShardGained, depthMult: this.depthMult,
      silver: this.silverGained || 0,   // v1.16.77 局内金币结算的银币
      goldBonus: 0.2 * b.gold,          // v1.16.106 招财符加成系数（结算页展示）
      kills: ks,                        // v1.16.106 本局总击杀
      relics: this.battleRelics.slice(), // v1.16.106 本局获取圣遗物快照（结算页图标展示）
    };
    this.state = 'gameover';
    this.sfx.stopBgm();
  }

  /** v1.16.73 波清结算：先三选一（升级待选），无待选直接自动进入下一波；不弹确认窗 */
  waveClearNext() {
    this._postPick = 'waveclear';
    if (this.flushUpgrades()) return;
    this._postPick = null;
    this.startNextWave();
  }

  /** v1.16.73 自动进入下一波 + 2s 透明提示；每 5 波弹 4s Boss 闪烁警告（均不暂停进度） */
  startNextWave() {
    this.state = 'fighting';
    this.wave.start(); // run.wave += 1
    const w = this.run.wave;
    this.waveHint = { text: `第 ${w} 波`, until: Date.now() + 2000 };
    this.bossHint = (w % 5 === 0) ? { until: Date.now() + 4000 } : null;
  }

  /** 塔升级三选一：把全部待升级（pending）生成跨塔候选队列并进入 picking；无待升级返回 false */
  flushUpgrades() {
    if (this.state === 'picking') return true;
    const q = this.run.effects.buildUpgradeQueue(this.run.slotOrder.slice());
    if (!q.length) return false;
    this.pickQueue = q;
    this.pickIndex = 0;
    this.pickHits = {};
    this.state = 'picking';
    this.toast('塔升级 · 从已有塔技能中三选一', '#f7c948');
    return true;
  }

  nextPick() {
    this.pickIndex++;
    if (this.pickIndex < this.pickQueue.length) return;
    // 队列耗尽：仍有待升级 → 继续弹窗；否则回到战斗/波次流程
    const q = this.run.effects.buildUpgradeQueue(this.run.slotOrder.slice());
    if (q.length) {
      this.pickQueue = q;
      this.pickIndex = 0;
      this.pickHits = {};
      this.toast('塔升级 · 选择技能', '#f7c948');
      return;
    }
    this.pickQueue = [];
    this.pickIndex = 0;
    if (this._postPick === 'waveclear') {
      this._postPick = null;
      this.startNextWave(); // v1.16.73 三选一完成 → 自动进入下一波（不再回确认窗）
      return;
    }
    this.state = 'fighting';
    this.toast('升级完成', '#7ef0a3');
  }

  restart() {
    // 重开一局：塔等级/技能/棋盘重置（金币保留在 meta），塔位清空——由最先消除的 4 种颜色重新决定
    Object.keys(this.run.effects.towers).forEach((k) => this.run.effects.tower(k).resetRunBuild());
    this.run.slotOrder = [];
    this.run.board.regen();
    // v1.9：磐石印圣物加成在重开时同样生效（与 enterBattle 一致）
    this.run.lineHp = Math.round(CONFIG.LINE.hp * (1 + 0.10 * this.meta.relicBonus().wall));
    this.run.lineMaxHp = this.run.lineHp;   // v1.13.25 冰墙回血上限基准
    this.run.broken = false;
    this.run.pendingPeak = 0;
    this.run.picks = 0;
    this.run.firstSynergyWave = null;
    this.state = 'fighting';
    this.waveTime = 0;
    this.battleRelics = [];
    this.relicDetail = null; // v1.16.73 圣遗物详情弹层清理（restart）
    this.shopOpen = false;   // v1.16.77 局内商店开关（restart 清理）
    this.enterBattle();
  }

  /** v1.16.77 局内商店购买：扣局内金币并施加临时强化（energy 补给 / 城墙修复为即时效果） */
  buyStoreItem(idx) {
    const item = (CONFIG.STORE.items || [])[idx];
    if (!item) return;
    const bought = this.run.store[item.id] || 0;
    if (bought >= item.max) { this.toast('已达上限', '#9fb2c3'); return; }
    const cost = item.cost[bought];
    if (this.run.gold < cost) { this.toast('金币不足', '#ff6b6b'); return; }
    this.run.gold -= cost;
    this.run.store[item.id] = bought + 1;
    if (item.id === 'energy') {
      // 所有已解锁塔能量 +15（封顶能量上限）
      this.run.slotOrder.forEach((k) => {
        const t = this.run.effects.tower(k);
        if (t && t.level > 0) t.energy = Math.min(this.run.armoryEnergyMax(), t.energy + 15);
      });
      this.toast(`⚡ 能量补给 +15`, '#7ef0a3');
    } else if (item.id === 'wall') {
      const maxHp = this.run.lineMaxHp || CONFIG.LINE.hp;
      const heal = Math.round(maxHp * 0.3);
      this.run.lineHp = Math.min(maxHp, this.run.lineHp + heal);
      this.toast(`🛡️ 城墙修复 +${heal}`, '#7fd4ff');
    } else if (item.id === 'atk') {
      this.toast(`⚔️ 全塔攻击 +20%`, '#ff8c42');
    } else if (item.id === 'spd') {
      this.toast(`⏩ 全塔攻速 +15%`, '#7ca8ff');
    }
    this.save.save();
  }

  /** 返回主界面（战斗结束/设置入口）：银币已由 finishRun 结算，局内金币不镜像（v1.16.77） */
  goMenu() {
    this.state = 'menu';
    this.menuTab = 'battle';
    this.menuPanel = null;
    this.enemies = [];
    this.towerInfo = null;
    this.funcLayer = null;
    this.pickQueue = [];
    this.pickIndex = 0;
    this._postPick = null;
    this.pendingRelicPicks = [];
    this.relicPick = null;
    this.relicDetail = null; // v1.16.73 圣遗物详情弹层清理
    this.testPanel = null;   // v1.14 测试战场配置面板清理
    this.testSpeed = 1;
    this.run.effects.setActiveKeys(null); // v1.16.4 离开测试战场恢复全部塔生效
    this.run._testStar3Mode = false;      // v1.16.104 退出测试战场清空 3★ 测试注入
    this.run._testStar3 = null;
    this.sfx.stopBgm();
    this.save.save();
  }

  /** v1.16.73 测试战场：添加圣遗物 → 弹圣物三选一（可反复添加，测试任意圣遗物效果）；v1.16.104 支持 star3 模式 */
  testAddRelic(star) {
    this.pendingRelicPicks = []; // 测试战场逐次弹层，不积累队列
    this.spawnRelicPick(star === 'star3' ? 'star3' : 'star1');       // 复用局内圣遗物候选生成（在场塔塔池 + 通用池）
    if (!this.pendingRelicPicks.length) { this.toast('暂无可用圣遗物池', '#9fb2c3'); return; }
    this._relicReturnState = 'testfield'; // 选择完成后回到测试战场
    this.relicPick = this.pendingRelicPicks.shift();
    this._lastPickStar3 = !!this.relicPick.star3; // v1.16.104 记录本次三选一是否为 3★ 模式
    this.relicPickHits = [];
    this.relicPick.t = 0; // v1.16.74 弹出动画
    this.state = 'relicpick';
  }

  /* ---------- 击杀奖励：经验（圣物加成，v1.8 入整体池）/ 精英圣物掉落 / Boss 宝箱 ---------- */
  onKillReward(e) {
    // v1.14 测试战场：无击杀奖励（不涨经验/不掉宝箱，专注技能验证）
    if (this.state === 'testfield') return;
    const b = this.meta.relicBonus();
    // 经验：整体经验池（v1.8：塔不再单独获取经验，统一按整体等级成长）；v1.16.78 经验之心：击杀经验 +N%（按星级）
    const base = CONFIG.EXP.kill[e.type] || CONFIG.EXP.kill.normal;
    const gained = Math.round(base * (1 + 0.20 * b.exp) * (1 + this.run.relicNum('cm_exp') / 100));
    this.run.gainExp(gained);
    // v1.12.1：战斗中击杀只积累升级待选（pending），不弹三选一打断战斗；
    // 升级三选一统一在波末「波次完成 → 继续」时结算（v1.8 设计：波末逐次结算）
    // 精英怪：概率掉落战场宝箱（寻宝罗盘加成；v1.16.78 赏金猎人 +N%）；v1.16.96 赏金猎人3★ 连续3波无宝箱必掉
    if (e.type === 'elite') {
      const chance = CONFIG.RELIC.dropChance * (1 + 0.10 * b.chest) * (1 + this.run.relicNum('cm_bounty') / 100);
      if (Math.random() < chance || this.run.bountyGuarantee()) {
        this.fieldChests.push({ x: e.x, y: e.y, t: 0, kind: 'elite' });
        this.run._waveChestDropped = true;
        this.toast('精英掉落宝箱 📦 点击开启', '#f7c948');
      }
    }
    // Boss：掉落战场宝箱（点击三选一）+ 主界面宝箱计数（每 5 波）
    if (e.isBoss) {
      this.fieldChests.push({ x: e.x, y: e.y, t: 0, kind: 'boss' });
      this.run._waveChestDropped = true;
      this.meta.chests += 1;
      this.toast('Boss 掉落宝箱 📦 点击开启', '#f7c948');
      this.save.save();
    }
    /* v1.16.76 击杀掉落线：碎片（即时入账，不受宝箱槽位限制）+ 小额击杀金币 */
    const field = this.field || CONFIG.FIELDS.ancient;
    if (field.dropAttr && field.dropAttr !== 'none') {
      const KD = CONFIG.KILL_DROP;
      let n = 0;
      if (e.type === 'elite' && Math.random() < KD.eliteShardChance) n = Math.random() < 1 / 3 ? 2 : 1;
      if (e.isBoss) n = KD.bossShardBase + (Math.random() < KD.bossShardBonusChance ? 2 : 0);
      if (n > 0) {
        const id = CONFIG.randomShardId(field.dropAttr);
        if (id) {
          this.meta.addShard(id, n);
          this.runShardGained += n;
          this.toast(`🧩 圣遗物碎片 +${n}`, '#a86bff');
        }
      }
      // 小额击杀金币（即时入局内金币，随波次温和通胀 ×1.06；v1.16.77 统一战斗结束结算银币）
      const kg = Math.round((KD.killGold[0] + Math.random() * (KD.killGold[1] - KD.killGold[0])) * Math.pow(1.06, this.run.wave - 1) * (field.goldMult || 1));
      this.run.gold += kg;
    }
  }

  /** v1.16.78 局内圣遗物总数（图鉴分页用） */
  _relicRunTotal() {
    let n = 0;
    Object.values(CONFIG.RELIC_RUN.tower).forEach((l) => { n += l.length; });
    return n + CONFIG.RELIC_RUN.common.length;
  }

  /** v1.16.59 战场宝箱点击 → 生成圣物三选一；v1.16.60 候选池改为局内圣遗物（在场塔的塔池 + 通用池）；
   *   v1.16.78 过滤已解锁 + 稀有度权重三选一（蓝50/紫38/金12，按设计文档 2.2） */
  spawnRelicPick(mode) {
    const RR = CONFIG.RELIC_RUN;
    // 在场塔（本局已激活的塔色）+ 通用池；候选带 tint（塔色/金色）供弹层圆底配色
    // v1.16.104 测试战场 3★ 模式：池 = 已拥有（starOf≥1）圣遗物，候选 desc 用 star3 文案
    const star3Mode = mode === 'star3';
    const ownedKeys = this.run.slotOrder || [];
    const meta = this.meta;
    const isUnlocked = (id) => meta.starOf(id) >= 1;   // v1.16.78 已解锁（图鉴/碎片达阈值）不再出现在三选一
    let pool = [];
    if (star3Mode) {
      ownedKeys.forEach((k) => { if (RR.tower[k]) RR.tower[k].forEach((d) => { if (meta.starOf(d.id) >= 1) pool.push({ def: d, tint: k }); }); });
      RR.common.forEach((d) => { if (meta.starOf(d.id) >= 1) pool.push({ def: d, tint: 'common' }); });
      if (!pool.length) { this.toast('尚未拥有任何圣遗物，先解锁 1 个再来测试 3★', '#9fb2c3'); this._chestBusy = false; return; }
      // 3★ 模式：候选 = 已拥有池中随机 3 张（不重复），desc 取 star3
      const cands3 = [];
      const used3 = new Set();
      for (let i = 0; i < 3; i++) {
        const tier = pool.filter((p) => !used3.has(p.def.id));
        if (!tier.length) break;
        const pick = tier[Math.floor(Math.random() * tier.length)];
        used3.add(pick.def.id);
        cands3.push({ id: pick.def.id, name: pick.def.name, icon: pick.def.icon, desc: pick.def.star3 || pick.def.desc, run: true, tint: pick.tint });
      }
      this.pendingRelicPicks.push({ candidates: cands3, star3: true });
      this._chestBusy = false;
      return;
    }
    ownedKeys.forEach((k) => { if (RR.tower[k]) RR.tower[k].forEach((d) => { if (!isUnlocked(d.id)) pool.push({ def: d, tint: k }); }); });
    RR.common.forEach((d) => { if (!isUnlocked(d.id)) pool.push({ def: d, tint: 'common' }); });
    if (!pool.length) {
      this.toast('圣遗物已全部解锁，宝箱折算为碎片', '#a86bff');
      // v1.16.78 全解锁兜底：宝箱仍折算少量碎片，避免点击无反馈
      this.meta.addShard(CONFIG.randomShardCardId(Math.random() < 0.5 ? 'sr' : 'r'), 1);
      this.save.save();
      this._chestBusy = false;
      return;
    }
    // 稀有度权重：依次抽 3 个稀有度，每个稀有度随机抽 1 张（已用不重复；稀有度无剩余时从全池补）
    const W = CONFIG.RELIC_PICK_WEIGHT;
    const pickRar = () => { const r = Math.random(); return r < W.r ? 'r' : r < W.r + W.sr ? 'sr' : 'ssr'; };
    const cands = [];
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const rar = pickRar();
      let tier = pool.filter((p) => CONFIG.relicRarity(p.def.id) === rar && !used.has(p.def.id));
      if (!tier.length) tier = pool.filter((p) => !used.has(p.def.id));
      if (!tier.length) break;
      const pick = tier[Math.floor(Math.random() * tier.length)];
      used.add(pick.def.id);
      cands.push({ id: pick.def.id, name: pick.def.name, icon: pick.def.icon, desc: pick.def.desc, run: true, tint: pick.tint });
    }
    this.pendingRelicPicks.push({ candidates: cands });
    this._chestBusy = false; // v1.16.74 动画完成解锁战斗输入
  }

  /* ---------- 三消联动：圣物经验加成补差 + 塔额外攻击（多消不同特效） ---------- */
  onMatchBonus(ret) {
    if (!ret || !ret.settled) return;
    const b = this.meta.relicBonus();
    let ammoSum = 0, shuSum = 0, refSum = 0, towerHit = '';
    // v1.16.37 三消飞光：消除色块汇聚成光点飞向对应塔位/全局技能按钮（3消白 / 4消蓝 / 5消+金）
    this._matchBeams(ret);
    ret.settled.forEach((s) => {
      // 圣物·经验珠：三消经验补差（基础经验已由 applyMatch 进整体池；补差也入整体池 v1.8）
      if (b.exp > 0 && s.tower) {
        const t = this.run.effects.tower(s.tower);
        if (t && t.level > 0) this.run.gainExp(Math.max(1, Math.round(s.exp * 0.20 * b.exp)));
      }
      // v1.12 弹药/全局技能充能入账提示（汇总一次性 toast）
      if (s.ammoGain > 0) { ammoSum += s.ammoGain; towerHit = s.tower || towerHit; }
      if (s.shuffleGain > 0) shuSum += s.shuffleGain;
      if (s.refillGain > 0) refSum += s.refillGain;
      // 三消触发塔额外攻击一次；多消形状触发不同攻击特效（combat.bonusStrike）
      if (s.tower && s.shape && !s.gotTower && !s.penalized && this.state === 'fighting') {
        this.combat.bonusStrike(s.tower, s.shape);
      }
    });
    if (ammoSum > 0) {
      const tn = CONFIG.COLORS[CONFIG.TOWERS[towerHit] ? CONFIG.TOWERS[towerHit].color : ''] || {};
      this.toast(`🔫 弹药 +${ammoSum}（${tn.name || towerHit}）`, '#7ef0a3');
    }
    if (shuSum > 0 || refSum > 0) {
      const parts = [];
      if (shuSum > 0) parts.push(`🔀 +${shuSum}`);
      if (refSum > 0) parts.push(`🔋 +${refSum}`);
      this.toast(`全局技能充能 ${parts.join(' ')}`, '#f7c948');
    }
    // v1.12.1：三消经验升级同样只积累待选，不战斗内弹三选一（波末统一结算）
  }

  /** v1.16.37 三消飞光：每步消除按颜色汇聚格子中心，光点飞向对应塔位/全局技能按钮（3消白/4消蓝/5消+金） */
  _matchBeams(ret) {
    const { boardX, boardY, cell, towerRowY } = this.ly;
    const stepList = ret.stepList || [];
    const settledByStep = ret.settledByStep || [];
    const done = {};
    settledByStep.forEach((ss, idx) => {
      const step = stepList[idx];
      if (!step || !step.matches) return;
      step.matches.forEach((m) => {
        if (!m || !m.cells || !m.cells.length) return;
        const key = idx + ':' + m.color;
        if (done[key]) return;
        done[key] = true;
        let ax = 0, ay = 0;
        m.cells.forEach(([r, c]) => { ax += boardX + c * cell + cell / 2; ay += boardY + r * cell + cell / 2; });
        const cx = ax / m.cells.length, cy = ay / m.cells.length;
        const shape = m.shape || '3';
        const glow = shape === '3' ? '#ffffff' : (shape === '4' ? '#5dade2' : '#f7c948');
        const tk = CONFIG.COLORS[m.color] ? CONFIG.COLORS[m.color].tower : null;
        let ex, ey;
        if (tk && this.run.effects.tower(tk).level > 0) {
          const mz = this.combat.towerMuzzle(tk);
          // v1.16.38b 终点 = 塔图标中心：正式战斗图标 iy 较槽中心上移 2px（slotY + (100-98)/2 - 2 + 49），测试战场大槽图标即槽中心
          ex = mz.x; ey = mz.y - (this.state === 'testfield' ? 0 : 2);
        } else {
          // 全局技能色：洗牌左按钮 / 补给右按钮（渲染 globalBtns 同口径：btnW 102、btnH 75、btnY = towerRowY+12）
          const skill = this.run._globalSkillOf ? this.run._globalSkillOf(m.color) : null;
          const isShuffle = skill === 'shuffle';
          ex = isShuffle ? (8 + 51) : (750 - 8 - 102 + 51);
          ey = towerRowY + 12 + 75 / 2;
        }
        this.fx.push({ type: 'beamp', x0: cx, y0: cy, x1: ex, y1: ey, color: glow, t: 0, dur: 0.65 });   // v1.16.40 dur 0.65：0.4s 下坠段(约100px/s减速) + 0.25s 加速段
      });
    });
  }

  /* ---------- 渲染 ---------- */
  render() {
    const s = (this.scale > 0 && isFinite(this.scale)) ? this.scale : 1;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = '#0d1117';
    // 背景铺满整个屏幕（逻辑坐标换算），模拟器/真机比例 ≠ 750:1334 时剩余区也填充，不留黑边
    ctx.fillRect(0, 0, Math.ceil(_c.canvas.width / s), Math.ceil(_c.canvas.height / s));
    if (this.state === 'menu') {
      this.menuHits = this.renderer.menuLayer(ctx, this.menuState(), this.menuHits);
      this.renderer.toast(ctx, this.toasts);
      return;
    }
    // v1.14 测试战场：独立渲染层（状态条 + 战场 + 塔槽 + 控制条 + 技能面板）；v1.16.73 测试战场弹圣遗物三选一时底层保持测试战场
    if (this.state === 'testfield' || (this.state === 'relicpick' && this._relicReturnState === 'testfield')) {
      this.testHits = this.renderer.testFieldLayer(ctx, this.testState(), this.testHits, this.enemies, this.fx, this.combat);
      this.renderer.toast(ctx, this.toasts);
      if (this.relicDetail) {   // v1.16.113 测试战场圣遗物详情弹层
        this.renderer.relicDetailLayer(ctx, this.battleRelics, this.relicDetail.page || 0, this.relicDetailHits);
      }
      if (this.state === 'relicpick') {
        // v1.16.109 修复：漏传动画时间导致测试战场三选一窗口 alpha=0 不可见、状态卡死——与普通战斗一致传 elapsed
        if (!this.relicPick.t) this.relicPick.t = Date.now();
        this.renderer.relicPickLayer(ctx, this.relicPick, this.relicPickHits, Date.now() - this.relicPick.t);
      }
      return;
    }
    const st = this.sceneState();
    this.renderer.status(ctx, st);
    this.renderer.actionArea(ctx, st);
    // 底部功能键命中区由渲染器生成（renderer.funcHits），同步到 game 供触摸判定
    this.funcHits = this.renderer.funcHits || [];
    // v1.16.1 地面持续效果（毒池毒液池/毒棒召唤物）画在敌人下层
    this.renderer.groundFx(ctx, this.combat);
    this.renderer.enemies(ctx, this.enemies);
    this.renderer.fx(ctx, this.fx);
    // v1.16.59 战场宝箱（怪物掉落，点击开启圣物三选一）
    this.renderer.fieldChests(ctx, this.fieldChests);
    this.renderer.toast(ctx, this.toasts);
    if (this.state === 'picking') {
      const group = this.pickQueue[this.pickIndex];
      const pending = this.remainingPending(group.tower);
      this.renderer.pickLayer(ctx, group, pending, this.pickHits);
    }
    if (this.state === 'relicpick') {
      if (!this.relicPick.t) this.relicPick.t = Date.now(); // 弹出动画首帧
      this.renderer.relicPickLayer(ctx, this.relicPick, this.relicPickHits, Date.now() - this.relicPick.t);
    }
    // v1.16.73 本局圣遗物详情弹层（战斗暂停）
    if (this.relicDetail) {
      this.renderer.relicDetailLayer(ctx, this.battleRelics, this.relicDetail.page || 0, this.relicDetailHits);
    }
    if (this.state === 'gameover') this.renderer.gameOver(ctx, Object.assign({ summary: this.runSummary }, st), this.restartBtn);
    // v1.16.76 撤离决策层（战斗暂停）
    if (this.state === 'evacuation') {
      this.evacHits = {};
      this.renderer.evacuationLayer(ctx, this, this.evacHits);
    }
    // v1.16.73 波间透明提示（不暂停进度）：进入下一波 2s / Boss 警告 4s 闪烁
    this.renderer.battleHints(ctx, this.waveHint, this.bossHint);
    // 塔详情弹层（任意状态下可查看）；技能二级详情优先于塔详情绘制在其上
    if (this.towerSkill) this.renderer.towerSkillLayer(ctx, this.towerSkill, this.towerSkillHits);
    else if (this.towerInfo) this.renderer.towerInfoLayer(ctx, this.towerInfo, this.towerInfoHits);
    // 底部功能弹层（商店/设置/图鉴/帮助）
    if (this.funcLayer) this.renderer.funcLayer(ctx, this.funcLayer, st, this.funcLayerHits);
  }

  /** v1.16.11 组装技能二级详情：技能效果 + 三分支完整文案 + 当前等级 */
  buildTowerSkillInfo(key, sk) {
    const pool = CONFIG.EFFECT_POOLS[key] || [];
    const skDef = pool.find((q) => q.name === sk.name) || {};
    const maxLv = 1 + ((CONFIG.EFFECT && CONFIG.EFFECT.maxLevel) || 3);
    const maxBr = Math.max(sk.branches.A || 0, sk.branches.B || 0, sk.branches.C || 0);
    const lv = 1 + maxBr;
    const branchName = (br) => (this.renderer.branchName ? this.renderer.branchName(skDef, br) : br);
    return {
      key, towerKey: key, skillName: sk.name, icon: skDef.icon || '?', desc: sk.desc || skDef.desc || '',
      color: skDef.color || '#a55eea',
      lv, lvMax: lv >= maxLv,
      branches: sk.branches,
      bA: branchName('A'), bB: branchName('B'), bC: branchName('C'),
      branchDesc: { A: skDef.a || '分支A：未定义效果', B: skDef.b || '分支B：未定义效果', C: skDef.c || '分支C：未定义效果' },
    };
  }

  sceneState() {
    const run = this.run;
    const eff = run.effects;
    // 4 槽：按先消先得顺序填已获塔，其余空位（null）
    const slots = [];
    for (let i = 0; i < CONFIG.TOWER_SLOTS; i++) {
      const key = run.slotOrder[i];
      if (!key) { slots.push(null); continue; }
      const t = eff.tower(key);
      // v1.11：详情仅展示经三选一获取/升级的技能（picked）；默认 3 技能不算"获取"，无 picked 时为空
      const skills = t.pool.filter((ef) => t.picked.has(ef.name)).map((ef) => {
        const p = (CONFIG.EFFECT_POOLS[key] || []).find((q) => q.name === ef.name) || {};
        return {
          name: ef.name, level: ef.level, desc: p.desc || '',
          branches: { A: ef.branches.A || 0, B: ef.branches.B || 0, C: ef.branches.C || 0 }, // v1.11 分支等级（实装状态）
        };
      });
      slots.push({
        key,
        name: CONFIG.COLORS[t.color].name,
        icon: TOWER_ICON[key] || '?',
        unlocked: true,
        level: t.level,          // v1.16.17 塔详情等级 = 塔自身等级（选择次数+1），不再显示整体总等级
        exp: run.exp,
        expNeed: run.expNeed(),
        expRatio: run.expLevel > 0 ? Math.min(1, run.exp / run.expNeed()) : 0,
        dps: t.level > 0 ? eff.towerDps(key) : 0,
        atk: t.level > 0 ? Math.round(this.combat.shotDmg(key)) : 0,   // 单次攻击伤害（塔详情）
        interval: t.level > 0 ? this.combat.interval(key) : 0,         // 实际攻击间隔（含技能修正）
        ammo: t.energy, ammoMax: this.run.armoryEnergyMax(),            // v1.16.77 能量（塔位条显示；军火库 +50）
        skills,
      });
    }
    const enemyHp = this.enemies.reduce((sum, e) => sum + Math.max(0, e.hp), 0);
    return {
      gold: run.gold,
      wave: run.wave,
      waveTime: this.waveTime,
      waveDuration: WAVE_DUR,
      state: this.state,
      stage: this.menuStage,   // v1.16.82 战斗态也需要战场标识（行动区主题背景切换）
      anim: this.anim,
      waveClear: this.waveClear,
      lineHp: run.lineHp, lineMaxHp: CONFIG.LINE.hp,
      grid: run.board.grid,
      selected: this.selected || this.pickCell, // 滑动高亮 / 点击选中高亮
      towers: slots,
      synergies: eff.synergyStatus(),
      synDoneCount: eff.synergyDone.filter(Boolean).length,
      enemyCount: this.enemies.length + this.wave.plan.length,
      hasBoss: this.wave.hasBoss,
      enemyHpRatio: this.wave.enemyTotalHp > 0 ? enemyHp / this.wave.enemyTotalHp : 0,
      exp: run.exp, expNeed: run.expNeed(), expLevel: run.expLevel,   // v1.8：出怪区整体经验条
      expRatio: run.expLevel > 0 ? Math.min(1, run.exp / run.expNeed()) : 0,
      battleRelics: this.battleRelics || [],   // v1.9：本局获得的圣物（经验条下方图标展示）
      shuffleAmmo: run.shuffleAmmo, refillAmmo: run.refillAmmo,  // v1.12.4 全局技能累计弹药（发）
      chargePerUse: CONFIG.GLOBAL_SKILL.chargePerUse,
      runSpeed: this.runSpeed,   // v1.16.13 主战斗倍速（底部功能栏右下角按钮显示）
      shopOpen: this.shopOpen,   // v1.16.90 局内商店开关（此前缺失导致商店面板永不渲染 → 点击无效果）
      store: run.store,          // v1.16.90 局内商店已购层数
    };
  }

  remainingPending(towerKey) {
    let n = 0;
    for (let i = this.pickIndex; i < this.pickQueue.length; i++) {
      if (this.pickQueue[i].tower === towerKey) n++;
    }
    return n;
  }

  /* ---------- 主界面状态 ---------- */
  menuState() {
    const m = this.meta;
    const keys = Object.keys(CONFIG.TOWERS).filter((k) => !CONFIG.TOWERS[k].p1);
    const towerName = (k) => (CONFIG.COLORS[CONFIG.TOWERS[k] && CONFIG.TOWERS[k].color] || {}).name || k;
    // 圣物卡片：仅展示已获取的（获取后才显示性能）；图鉴面板看全表
    const relics = CONFIG.RELIC.list.map((def) => {
      const owned = m.relicOwned(def.id);
      const lv = m.relicLevel(def.id);
      const cost = m.relicUpCost(def.id);
      return {
        id: def.id, name: def.name, icon: def.icon,
        owned,
        count: m.relicCount(def.id), level: lv,
        desc: def.desc(lv), descLv: def.desc(lv + 1),
        cost,
      };
    });
    const chestRemain = m.chestRemainSec(Date.now());
    const daily = m.ensureDailyPicks(Date.now());
    return {
      gold: m.gold,
      diamond: m.diamond,
      tab: this.menuTab,
      stage: this.menuStage,           // v1.16.30 主界面所选战场：ancient | test
      codexSel: this.codexSel,         // v1.16.75 塔图鉴选中塔
      towerCodex: this.meta.towerCodex, // v1.16.75 已学习塔 { key: 1 }
      keys,
      towerName,
      towerUnlocks: m.towerUnlocks,
      relics,
      chests: m.chests,
      chestOpenSec: CONFIG.RELIC.chestOpenSec,
      chestRemain,
      chestOpening: !!m.chestTimer,
      daily,
      dailyPrice: CONFIG.DAILY.price,
      panel: this.menuPanel,
      relicScroll: this.relicScroll || 0,   // v1.16.82 圣遗物页滚动位置
      relicDexPage: this.relicDexPage,   // v1.16.78 圣物图鉴分页（主页与图鉴面板共用）
      /* v1.16.76 激励系统状态 */
      field: CONFIG.FIELDS[this.menuStage] || CONFIG.FIELDS.ancient,
      deepChests: this.meta.deepChests.map((ch) => {
        const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
        return { tier: ch.tier, name: tier.name, ready: this.meta.chestReady(ch), remainMin: Math.max(0, Math.ceil((ch.openAt - Date.now()) / 60000)) };
      }),
      relicStars: this.meta.relicStars,
      runCodex: this.meta.runCodex,   // v1.16.78 局内圣遗物图鉴解锁（图鉴页占位判定）
      shards: this.meta.shards,
      starStones: this.meta.starStones,
      bestWave: this.meta.bestWave,
      debug: !!CONFIG.DEBUG_ACCOUNT,
    };
  }

  /** 测试战场触摸分发（v1.14）：面板打开时仅响应面板项，否则控制条/塔槽/返回/倍速 */
  onTestFieldTap(p) {
    // v1.16.113 测试战场：点击圣遗物行 → 查看本局圣遗物详情（叠加弹层，战斗不暂停）
    if (!this.testPanel) {
      const rb = this.renderer.relicBarHit;
      if (rb && p.x >= rb.x && p.x <= rb.x + rb.w && p.y >= rb.y && p.y <= rb.y + rb.h) {
        this.relicDetail = { page: 0, from: 'testfield' };
        return true;
      }
    }
    const items = this.testHits || [];
    for (const it of items) {
      if (!it.hit(p.x, p.y)) continue;
      // 面板打开时只响应面板项（panel_*）
      if (this.testPanel && !String(it.id).startsWith('panel_')) return true;
      switch (it.id) {
        case 'tf_back': this.goMenu(); return true;
        case 'tf_speed': this.cycleTestSpeed(); return true;
        case 'tf_spawn_n': this.spawnTestEnemies('normal', 5); return true;
        case 'tf_spawn_r': this.spawnTestEnemies('runner', 5); return true;
        case 'tf_spawn_t': this.spawnTestEnemies('tank', 5); return true;
        case 'tf_spawn_e': this.spawnTestEnemies('elite', 2); return true;
        case 'tf_spawn_b': this.spawnTestEnemies('boss', 1); return true;
        case 'tf_clear': this.clearTestEnemies(); return true;
        case 'tf_addRelic': this.testAddRelic(); return true; // v1.16.73 测试战场添加圣遗物
        case 'tf_addRelic3': this.testAddRelic('star3'); return true; // v1.16.104 测试战场添加 3★ 圣遗物
        case 'tf_slot': this.testPanel = { key: it.data }; return true;
        case 'tf_switch': this.switchTestTower(it.data); return true;
        case 'panel_close': this.testPanel = null; return true;
        case 'panel_done': this.testPanel = null; this.toast('技能配置已应用', '#7ef0a3'); return true;
        case 'panel_all': this.testSkillAll(this.testPanel.key, true); return true;
        case 'panel_clear': this.testSkillAll(this.testPanel.key, false); return true;
        case 'panel_branch': this.testSkillAction(this.testPanel.key, it.data.name, it.data.br); return true;
        default: return true;
      }
    }
    return false;
  }

  /** 主界面触摸分发：命中 menuHits（渲染时重建）中第一个按键；面板打开时仅响应面板项 */
  onMenuTap(p) {
    if (this.menuPanel) {
      const ptype = this.menuPanel.type;
      // v1.16.78 圣物图鉴翻页（relicDex 面板内）
      if (ptype === 'relicDex') {
        const total = this._relicRunTotal();
        for (const it of this.menuHits) {
          if (it.key === 'relicPage' && it.hit(p.x, p.y)) {
            this.relicDexPage = Math.max(0, Math.min(total - 1, this.relicDexPage + it.data));
            return;
          }
          // 点圣物卡 → 详情面板（1/2/3★ 效果 + 升星）
          if (it.key === 'relicInfo' && it.hit(p.x, p.y)) {
            this.menuPanel = { type: 'relicInfo', id: it.data };
            return;
          }
        }
      }
      for (const it of this.menuHits) {
        // 面板打开时只响应 关闭 / 面板内专属项
        if (it.key === 'panelClose') {
          if (!it.hit(p.x, p.y)) continue;
          this.menuPanel = null;
          return;
        }
        // v1.16.76 调试面板（仅 DEBUG 构建）
        if (ptype === 'debug' && it.key.indexOf('dbg_') === 0 && it.hit(p.x, p.y)) {
          this.handleDebugTap(it.key);
          return;
        }
        // v1.16.76 圣遗物升星（图鉴/升星/详情面板内点击行）
        if ((ptype === 'relicDex' || ptype === 'starUp' || ptype === 'relicInfo') && it.key === 'relicStar' && it.hit(p.x, p.y)) {
          const err = this.meta.upStar(it.data);
          if (err) this.toast(err, '#ff6b6b');
          else {
            this.save.save();
            this.toast(`${it.data} 升星成功！→ ${this.meta.starOf(it.data)}★`, '#f7c948');
          }
          return;
        }
      }
      return; // 面板打开时忽略底层按钮
    }
    for (const it of this.menuHits) {
      if (!it.hit(p.x, p.y)) continue;
      switch (it.key) {
        case 'tab':
          this.menuTab = it.data;
          this.menuPanel = null;
          return;
        case 'relicInfo':
          // v1.16.78 圣物图鉴：点圣遗物卡 → 详情面板（1/2/3★ 效果 + 升星）
          this.menuPanel = { type: 'relicInfo', id: it.data };
          return;
        case 'relicPage': {
          // v1.16.78 圣物图鉴：翻页
          const total = this._relicRunTotal();
          this.relicDexPage = Math.max(0, Math.min(total - 1, this.relicDexPage + it.data));
          return;
        }
        case 'codexSel':
          // v1.16.75 塔图鉴：切换选中塔
          this.codexSel = it.data;
          return;
        case 'codexSkill':
          // v1.16.78 塔图鉴：点技能卡 → 打开 A/B/C 分支效果面板
          this.menuPanel = { type: 'codexSkill', tower: it.data.tower, idx: it.data.idx };
          return;
        case 'codexLearn': {
          // v1.16.75 塔图鉴：金币学习解锁塔（回旋镖 3000 / 炮塔 5000）
          const key = it.data;
          if (this.meta.towerCodex[key]) return;
          const cost = key === 'cannon' ? 5000 : 3000;
          if (this.meta.gold < cost) { this.toast('金币不足', '#ff6b6b'); return; }
          this.meta.gold -= cost;
          this.meta.learnTower(key);
          this.save.save();
          const nm = (CONFIG.COLORS[CONFIG.TOWERS[key] && CONFIG.TOWERS[key].color] || {}).name || key;
          this.toast(`已学习 ${nm}，塔图鉴解锁！`, '#f7c948');
          return;
        }
        case 'stage': {
          // v1.16.76 战场卡本体：提示当前所选战场合约
          const F = CONFIG.FIELDS[this.menuStage] || CONFIG.FIELDS.ancient;
          this.toast(`当前：${F.name} · ${F.subtitle}`, '#7cd6a6');
          return;
        }
        case 'stagePrev':
        case 'stageNext': {
          // v1.16.78 ◀ ▶ 按合约切换战场：未解锁战场不再静默跳过（可见、进场时校验）
          const order = CONFIG.FIELD_ORDER;
          const dir = it.key === 'stageNext' ? 1 : -1;
          let idx = order.indexOf(this.menuStage);
          idx = (idx + dir + order.length) % order.length;
          this.menuStage = order[idx];
          const F2 = CONFIG.FIELDS[this.menuStage];
          if (F2.unlockWave && this.meta.bestWave < F2.unlockWave) {
            this.toast(`已切换：${F2.name}（🔒 需最深 ${F2.unlockWave} 波解锁，当前最佳 ${this.meta.bestWave}）`, '#f0b45c');
          } else {
            this.toast(`已切换：${F2.name}（${F2.subtitle}）`, '#7cd6a6');
          }
          return;
        }
        case 'enter': {
          // v1.16.30 按所选战场进入：测试战场 → 免三消直测；正式战斗需校验解锁（v1.16.78）
          this.menuPanel = null;
          if (this.menuStage === 'test') { this.enterTestField(); return; }
          const Fe = CONFIG.FIELDS[this.menuStage] || CONFIG.FIELDS.ancient;
          if (Fe.unlockWave && this.meta.bestWave < Fe.unlockWave) {
            this.toast(`${Fe.name} 尚未解锁：需最深 ${Fe.unlockWave} 波（当前最佳 ${this.meta.bestWave}）`, '#f0b45c');
            return;
          }
          this.newRun(true);
          return;
        }
        case 'relicDex':
          // 圣物图鉴：查看全部圣物图标（未获取锁定，获取后显示性能）
          this.menuPanel = { type: 'relicDex' };
          return;
        case 'starUp':
          // v1.16.76 圣遗物升星面板（碎片/金币/星辉石 → 2★ 效果升级 / 3★ 质变）
          this.menuPanel = { type: 'starUp' };
          return;
        case 'dailyPick': {
          // 每日精选圣物卡（金币购买）
          const d = it.data;
          if (this.meta.gold < d.price) { this.toast('金币不足', '#ff6b6b'); return; }
          this.meta.gold -= d.price;
          this.meta.addRelic(d.relic);
          this.run.gold = this.meta.gold;
          this.save.save();
          this.toast(`精选圣物 ${d.icon}${d.name} +1`, '#7ef0a3');
          return;
        }
        case 'dailyAd': {
          // 每日精选圣物卡（看广告免费领）
          const d = it.data;
          this.playRewardedAd(() => {
            this.meta.addRelic(d.relic);
            this.save.save();
            this.toast(`广告奖励圣物：${d.icon}${d.name} +1`, '#7ef0a3');
          }, '广告未配置，先用金币购买吧');
          return;
        }
        case 'adCard': {
          this.playRewardedAd(() => {
            const got = this.meta._randomRelicReward();
            this.save.save();
            this.toast(`广告奖励圣物：${got.icon}${got.name} +1`, '#7ef0a3');
          }, '广告未配置');
          return;
        }
        case 'diamondChest': {
          if (this.meta.diamond < CONFIG.DIAMOND.chestPrice) { this.toast('钻石不足（充值后续开放）', '#ff6b6b'); return; }
          this.meta.diamond -= CONFIG.DIAMOND.chestPrice;
          this.meta.chests += 1;
          this.save.save();
          this.toast('钻石兑换宝箱 📦', '#7ef0a3');
          return;
        }
        case 'diamondGold': {
          if (this.meta.diamond < 1) { this.toast('钻石不足（充值后续开放）', '#ff6b6b'); return; }
          this.meta.diamond -= 1;
          this.meta.gold += CONFIG.DIAMOND.goldPrice;
          this.run.gold = this.meta.gold;
          this.save.save();
          this.toast(`钻石兑换 ${CONFIG.DIAMOND.goldPrice} 金币`, '#7ef0a3');
          return;
        }
        case 'recharge':
          this.toast('充值功能开发中，敬请期待', '#9fb2c3');
          return;
        case 'relicUp': {
          const res = this.meta.upgradeRelic(it.data);
          if (res.ok) {
            this.run.gold = this.meta.gold;
            this.save.save();
            this.toast(`圣物升级 Lv${res.level}`, '#7ef0a3');
          } else if (res.reason === 'relic') {
            this.toast('升级需 1 个同名圣物', '#ff6b6b');
          } else {
            this.toast('金币不足', '#ff6b6b');
          }
          return;
        }
        case 'chest': {
          const m = this.meta;
          if (m.chestTimer) { this.toast(`宝箱开启中 ${m.chestRemainSec(Date.now())}s`, '#9fb2c3'); return; }
          const res = m.startChest(Date.now());
          if (res.ok) {
            this.save.save();
            this.toast(`宝箱开启中 ${CONFIG.RELIC.chestOpenSec}s`, '#f7c948');
          } else if (res.reason === 'none') {
            this.toast('暂无宝箱（Boss 掉落）', '#9fb2c3');
          }
          return;
        }
        case 'deepChest': {
          // v1.16.76 深度宝箱：就绪点击开启；未就绪提示剩余时间（钻石足够则提示可速开）
          const m = this.meta;
          const ch = m.deepChests[it.data];
          if (!ch) { this.toast('空槽位 · 局末按最深波次获得', '#5a6c80'); return; }
          if (m.chestReady(ch)) {
            const gain = m.openDeepChest(it.data);
            this.save.save();
            if (gain) this.toast(`开启成功！💰${gain.gold} · 碎片+${gain.shards}${gain.diamond ? ` · 💎+${gain.diamond}` : ''}${gain.stone ? ' · 星辉石+1' : ''}${gain.card ? ' · 圣遗物卡×1' : ''}`, '#f7c948');
            return;
          }
          const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
          const remainMin = Math.max(0, Math.ceil((ch.openAt - Date.now()) / 60000));
          const cost = Math.max(1, Math.ceil(remainMin / 60 * 4));
          if (m.diamond >= cost && m.speedOpen(it.data)) {
            const gain = m.openDeepChest(it.data);
            this.save.save();
            if (gain) this.toast(`已用 ${cost}💎 立即开启！💰${gain.gold} · 碎片+${gain.shards}`, '#f7c948');
            return;
          }
          this.toast(`${tier.name} 开启中 · 还需 ${remainMin} 分钟（${cost}💎 立即开启）`, '#9fb2c3');
          return;
        }
        case 'debug':
          // v1.16.76 调试工具入口（仅 DEBUG 构建）
          this.menuPanel = { type: 'debug' };
          return;
        default:
          return;
      }
    }
  }

  /** v1.16.76 调试工具动作（仅 DEBUG 构建可见入口） */
  handleDebugTap(key) {
    const m = this.meta;
    switch (key) {
      case 'dbg_gold': m.gold += 1000; this.toast('💰 +1000', '#f7c948'); break;
      case 'dbg_diamond': m.diamond += 100; this.toast('💎 +100', '#7ca8ff'); break;
      case 'dbg_shard': {
        Object.values(CONFIG.RELIC_RUN.tower).forEach((list) => list.forEach((d) => m.addShard(d.id, 2)));
        CONFIG.RELIC_RUN.common.forEach((d) => m.addShard(d.id, 2));
        this.toast('全部圣遗物碎片 +2', '#a86bff');
        break;
      }
      case 'dbg_unlock': {
        Object.values(CONFIG.RELIC_RUN.tower).forEach((list) => list.forEach((d) => { m.runCodex[d.id] = 1; if (!m.relicStars[d.id]) m.relicStars[d.id] = 1; }));
        CONFIG.RELIC_RUN.common.forEach((d) => { m.runCodex[d.id] = 1; if (!m.relicStars[d.id]) m.relicStars[d.id] = 1; });
        this.toast('已解锁全部圣遗物（1★）', '#7ef0a3');
        break;
      }
      case 'dbg_star3': {
        // v1.16.105 调试：全部圣遗物直接升 3★（解锁 + 星级拉满），便于 IDE 端完整验证 3★ 养成/图鉴/战斗链路
        Object.values(CONFIG.RELIC_RUN.tower).forEach((list) => list.forEach((d) => { m.runCodex[d.id] = 1; m.relicStars[d.id] = 3; }));
        CONFIG.RELIC_RUN.common.forEach((d) => { m.runCodex[d.id] = 1; m.relicStars[d.id] = 3; });
        this.toast('全部圣遗物已升至 3★', '#ffb347');
        break;
      }
      case 'dbg_stone': m.starStones += 5; this.toast('星辉石 +5', '#a86bff'); break;
      case 'dbg_chest': {
        if (m.grantDeepChest(CONFIG.DEPTH_CHEST.tiers[4])) this.toast('已发放星辉宝箱（12h）', '#a86bff');
        else this.toast('深度宝箱槽位已满', '#ff6b6b');
        break;
      }
      default: return;
    }
    this.save.save();
  }

  /** 圣物宝箱三选一：选择一项 → 获取圣物，回战斗；队列清空后检查升级待选
   *  v1.16.60 战场宝箱候选为局内圣遗物（run:true）：本局生效 + 图鉴解锁；非 run 走养成圣物 */
  relicPickChoice(i) {
    const c = this.relicPick && this.relicPick.candidates[i];
    if (!c) return;
    if (c.run) {
      // v1.16.78 防御兜底：已解锁重复（三选一已过滤，正常不触发）→ 折算碎片不叠层
      // v1.16.108 测试战场豁免：3★ 模式候选均为已拥有圣遗物，若走折算分支会 return 卡死弹层 → 测试战场直接注入本局生效
      if (this.meta.starOf(c.id) >= 1 && this._relicReturnState !== 'testfield') {
        const n = CONFIG.DUPLICATE_SHARDS[CONFIG.relicRarity(c.id)] || 2;
        this.meta.addShard(c.id, n);
        this.toast(`重复圣遗物 → ${c.icon}${c.name} 碎片 +${n}`, '#a86bff');
        this.save.save();
        return;
      }
      // 局内圣遗物（rougelike）：本局生效 + 图鉴解锁（跨局记录）
      this.runRelics.push(c.id);
      this.run.runRelic[c.id] = (this.run.runRelic[c.id] || 0) + 1;
      this.meta.codexUnlock(c.id);
      // v1.16.113 记录 3★ 生效标记：测试战场 3★ 注入 或 真实已升 3★
      const isStar3 = (this._relicReturnState === 'testfield' && this._lastPickStar3 && c) || this.meta.starOf(c.id) >= 3;
      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc, star3: isStar3 }); // v1.16.73 详情弹层需要 desc
      this.save.save();
      this.toast(isStar3 && this._relicReturnState === 'testfield' ? `★3 质变注入：${c.icon}${c.name}` : '获得圣遗物 ' + c.icon + c.name, '#ffb347');
    } else {
      this.meta.addRelic(c.id);
      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc, star3: this.meta.starOf(c.id) >= 3 }); // v1.9：本局圣物展示；v1.16.73 带 desc
      this.save.save();
      this.toast('获得圣物 ' + c.icon + c.name, '#f7c948');
    }
    this.relicPick = null;
    // v1.16.104 测试战场 3★ 模式：选中圣遗物按 3★ 质变注入（无需真实 3★ 解锁）
    if (this._relicReturnState === 'testfield' && this._lastPickStar3 && c) {
      this.run._testStar3Mode = true;
      this.run._testStar3 = this.run._testStar3 || {};
      this.run._testStar3[c.id] = true;
    }
    this._lastPickStar3 = false;
    // v1.16.73 返回来源状态（测试战场添加圣遗物 → 回到 testfield；战场宝箱 → fighting）
    this.state = this._relicReturnState || 'fighting';
    this._relicReturnState = null;
    if (this.pendingRelicPicks.length) return; // 还有宝箱：下帧继续弹
    if (this.state === 'fighting' && this.run.effects.pendingTotal() > 0) this.flushUpgrades(); // 顺带处理升级待选
  }

  /** 激励视频广告：配置广告位后播放，完整观看回调发奖；未配置/失败时提示 */
  playRewardedAd(onReward, noAdMsg) {
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd || !CONFIG.AD_REWARD.rewardedId) {
      this.toast(noAdMsg || '广告未配置', '#9fb2c3');
      return;
    }
    try {
      if (!this._rewardedAd) {
        this._rewardedAd = wx.createRewardedVideoAd({ adUnitId: CONFIG.AD_REWARD.rewardedId });
        this._rewardedAd.onClose((res) => {
          if (res && res.isEnded) onReward();
          else this.toast('需完整观看广告', '#9fb2c3');
        });
        this._rewardedAd.onError(() => { this.toast('广告加载失败', '#ff6b6b'); });
      }
      this._rewardedAd.show().catch(() => {
        if (this._rewardedAd.load) this._rewardedAd.load().then(() => this._rewardedAd.show()).catch(() => {});
      });
    } catch (e) {
      this.toast('广告未配置', '#9fb2c3');
    }
  }

  /* ---------- 触摸 ---------- */
  /** 触摸状态分发（模块化 v1.13.11：从 bindTouch 抽出，返回 true=已消费该触摸） */
  dispatchTouch(p) {
    // v1.16.73 本局圣遗物详情弹层（最高优先级）：✕ 关闭 / ▲▼ 翻页
    if (this.relicDetail) {
      const h = this.relicDetailHits;
      if (h.close && h.close.hit(p.x, p.y)) {
        const from = this.relicDetail.from || 'fighting';   // v1.16.113 关闭后回到来源状态（testfield/fighting）
        this.relicDetail = null; this.state = from; return true;
      }
      if (h.next && h.next.hit(p.x, p.y)) {
        const pages = Math.ceil(this.battleRelics.length / 8);
        this.relicDetail.page = Math.min((this.relicDetail.page || 0) + 1, Math.max(pages - 1, 0));
        return true;
      }
      if (h.prev && h.prev.hit(p.x, p.y)) {
        this.relicDetail.page = Math.max((this.relicDetail.page || 0) - 1, 0);
        return true;
      }
      return true; // 面板内点击不处理其它
    }
    // 主界面：分页 / 进入战斗 / 技能搭配 / 圣物配置 / 商店 / 圣物升级 / 宝箱
    if (this.state === 'menu') { this.onMenuTap(p); return true; }
    // 技能二级详情弹层打开中：点返回/遮罩 → 回到塔详情；再次点关闭逻辑在塔详情分支
    if (this.towerSkill) {
      const h = this.towerSkillHits;
      if (h.back && h.back.hit(p.x, p.y)) { this.towerSkill = null; return true; }
      if (h.bg && h.bg.hit(p.x, p.y)) { this.towerSkill = null; return true; }
      return true; // 面板内点击不处理其它
    }
    // 塔详情弹层打开中：点技能卡开二级详情 / 点关闭或遮罩关闭
    if (this.towerInfo) {
      const h = this.towerInfoHits;
      if (h.skill) {
        for (let i = 0; i < h.skill.length; i++) {
          if (h.skill[i] && h.skill[i].hit(p.x, p.y)) {
            const sk = this.towerInfo.skills[i];
            if (sk) this.towerSkill = this.buildTowerSkillInfo(this.towerInfo.key, sk);
            return true;
          }
        }
      }
      if (h.close && h.close.hit(p.x, p.y)) { this.towerInfo = null; return true; }
      if (h.bg && h.bg.hit(p.x, p.y)) { this.towerInfo = null; return true; }
      return true; // 面板内点击不处理其它
    }
    // 底部功能弹层打开中：声音开关 / 重新开始 / 返回主界面 / 关闭 / 遮罩关闭
    if (this.funcLayer) {
      const h = this.funcLayerHits;
      if (this.funcLayer.type === 'setting' && h.sound && h.sound.hit(p.x, p.y)) {
        // v1.16.107 声音开关：持久化 + 即时应用
        this.meta.soundOn = !this.meta.soundOn;
        this.save.save();
        this.sfx.setEnabled(this.meta.soundOn);
        this.toast(this.meta.soundOn ? '🔊 音效已开启' : '🔇 音效已关闭', '#9fb2c3');
        return true;
      }
      if (this.funcLayer.type === 'setting' && h.confirm && h.confirm.hit(p.x, p.y)) {
        // v1.16.107 重新开始（不清档）：返回主界面重开本局，塔/银币/解锁进度全部保留
        this.funcLayer = null;
        this.goMenu();
        this.toast('已重新开始 · 存档保留', '#7ef0a3');
        return true;
      }
      // 设置弹层底部按钮 =「返回主菜单」；其它弹层 =「关闭」
      if (h.close && h.close.hit(p.x, p.y)) {
        if (this.funcLayer.type === 'setting') this.goMenu();
        else this.funcLayer = null;
        return true;
      }
      if (h.bg && h.bg.hit(p.x, p.y)) { this.funcLayer = null; return true; }
      return true; // 面板内点击不处理其它
    }
    // 加速按钮（v1.16.30 移到城墙上方 · 移动区右下角，独立命中区）
    if (this.renderer.speedHit && this.renderer.speedHit.hit(p.x, p.y)) {
      this.cycleRunSpeed();
      return true;
    }
    // 底部功能键区：打开对应弹层（v1.16.89 商店并入功能条：点击弹出商店面板）
    if (this.funcHits.length) {
      for (const f of this.funcHits) {
        if (f.hit(p.x, p.y)) {
          if (f.key === 'shop') { this.shopOpen = true; return true; }
          this.funcLayer = { type: f.key, version: GAME_VERSION, soundOn: this.meta.soundOn !== false };
          return true;
        }
      }
    }
    if (this.state === 'fighting') {
      // v1.16.74 宝箱开箱/飞行动画期间锁定战斗输入（防误触）
      if (this._chestBusy) return true;
      // v1.16.89 局内商店：入口移至底部功能条，此处仅处理面板内点击（关闭钮 / 商品格）
      if (this.shopOpen === undefined) this.shopOpen = false;
      if (this.shopOpen) {
        const scl = this.renderer.shopCloseRect;
        if (scl && p.x >= scl.x && p.x <= scl.x + scl.w && p.y >= scl.y && p.y <= scl.y + scl.h) { this.shopOpen = false; return true; }
        const rects = this.renderer.shopItemRects || [];
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
            this.buyStoreItem(i);
            return true;
          }
        }
      }
      // v1.16.73 顶部状态栏圣遗物行：点击查看本局圣遗物详情（战斗暂停）
      const rb = this.renderer.relicBarHit;
      if (rb && p.x >= rb.x && p.x <= rb.x + rb.w && p.y >= rb.y && p.y <= rb.y + rb.h) {
        this.relicDetail = { page: 0 };
        this.state = 'relicDetail'; // 详情查看中战斗暂停
        return true;
      }
      // v1.16.74 战场宝箱：点击 → 开箱→飞向屏幕中心放大→弹圣物三选一；动画期间锁定其他战斗输入
      for (let i = this.fieldChests.length - 1; i >= 0; i--) {
        const c = this.fieldChests[i];
        if (c.animT != null) continue; // 开箱/飞行动画播放中
        if (Math.abs(p.x - c.x) < 44 && Math.abs(p.y - c.y) < 44) {
          c.animT = 0; c.stage = 'open'; // 启动动画序列
          this._chestBusy = true;
          return true;
        }
      }
      // 战斗中点全局技能按钮 → 释放技能（v1.12：左=全局洗牌，右=全局冰冻）
      const btns = this.renderer.globalBtns || [];
      for (const b of btns) {
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
          this.combat.castGlobal(b.key);
          return true;
        }
      }
      // 战斗中点塔位图标 → 查看技能/等级
      const si = this.towerSlotAt(p);
      const slot = this.sceneState().towers[si] || null;
      if (si >= 0 && slot) {
        this.towerInfo = { ...slot, slotIdx: si };
        return true;
      }
    }
    // v1.14 测试战场触摸分发：技能面板弹层优先，其次控制条/塔槽/返回/倍速
    if (this.state === 'testfield') {
      if (this.onTestFieldTap(p)) return true;
    }
    // 弹层按钮判定
    if (this.state === 'picking') {
      const group = this.pickQueue[this.pickIndex];
      if (!group || !group.candidates || !group.candidates.length) return true;
      // v1.16.56：三选一暂停中，点击下方露出的防御塔位 → 打开塔详情（可查看技能详情，关闭后回到三选一）
      const si = this.towerSlotAt(p);
      const slot = this.sceneState().towers[si] || null;
      if (si >= 0 && slot) {
        this.towerInfo = { ...slot, slotIdx: si };
        return true;
      }
      for (let i = 0; i < group.candidates.length; i++) {
        if (this.pickHits[i] && this.pickHits[i].hit(p.x, p.y)) {
          const res = this.run.applyChoice(group.tower, group.candidates[i]);
          if (res.ok) {
            const cd = group.candidates[i];
            const nm = cd.name;
            // v1.14 提示优化：分支卡 toast 显示分支名 + 等级变化（如「爆燃·灼烧爆裂 Lv0→1」）
            const cdCfg = (CONFIG.EFFECT_POOLS[cd.fromTower || group.tower] || []).find((q) => q.name === nm) || {};
            const actTxt = cd.type === 'branch'
              ? `${nm}·${this.renderer.branchName(cdCfg, cd.branch)} Lv${cd.branchLv}→${cd.branchLv + 1}`
              : (res.activated ? `激活技能：${nm}` : `替换特效：${nm}`);
            this.toast(actTxt, '#7ef0a3');
            this.nextPick();
          }
          return true;
        }
      }
      return true;
    }
    // 圣物宝箱三选一弹层：点候选 → 获取该圣物
    if (this.state === 'relicpick') {
      if (this.relicPick && this.relicPick.candidates) {
        for (let i = 0; i < this.relicPick.candidates.length; i++) {
          if (this.relicPickHits[i] && this.relicPickHits[i].hit(p.x, p.y)) {
            this.relicPickChoice(i);
            return true;
          }
        }
      }
      return true;
    }
    if (this.state === 'gameover') {
      if (this.restartBtn.hit && this.restartBtn.hit(p.x, p.y)) { this.restart(); return true; }
      if (this.restartBtn.toMenu && this.restartBtn.toMenu.hit(p.x, p.y)) { this.goMenu(); return true; }
      return true;
    }
    // v1.16.76 撤离决策层（战斗暂停）
    if (this.state === 'evacuation') {
      const H = this.evacHits || {};
      if (H.evacGo && H.evacGo.hit(p.x, p.y)) { this.finishRun(true); return true; }
      if (H.evacStay && H.evacStay.hit(p.x, p.y)) {
        this.state = 'fighting';
        this.waveClearNext();
        return true;
      }
      return true;
    }
    return false;
  }

  bindTouch() {
    const c = _c ? _c.canvas : null; // 获取到的主画布（可能是 wx.createCanvas() 返回）
    let startCell = null, lastCell = null;
    this.pickCell = null; // 点击交换：当前选中格（渲染高亮，直到下次点击/滑动）
    let moved = false;    // 是否已发生滑动（点击 vs 滑动判定）
    // 触摸处理（wx 全局通道与 canvas 事件通道共用；坐标在 toLogic 内做自适应归一化）
    const onStart = (e) => {
      const t = e && e.touches && e.touches[0];
      if (!t) return;
      const p = this.toLogic(t.clientX, t.clientY);
      // v1.16.82 圣遗物页滑动浏览：延迟点击判定到 touchend（拖动不触发卡点）
      if (this.state === 'menu' && this.menuTab === 'relic' && !this.menuPanel) {
        this._relicDrag = { y0: p.y, scroll0: this.relicScroll || 0, moved: false, p };
        return;
      }
      // 状态/弹层/按钮命中分发（模块化 v1.13.11：dispatchTouch 独立方法）
      if (this.dispatchTouch(p)) return;
      // 棋盘点击/滑动准备
      startCell = this.cellAt(p);
      lastCell = startCell;
      this.selected = startCell;
      this.swapped = false;
      moved = false;
      this._touchStart = { x: p.x, y: p.y };
    };
    const onMove = (e) => {
      const t0 = e && e.touches && e.touches[0];
      // v1.16.82 圣遗物页拖动滚动
      if (this._relicDrag && t0) {
        const d = this._relicDrag;
        const p = this.toLogic(t0.clientX, t0.clientY);
        if (Math.abs(p.y - d.y0) > 12) d.moved = true;
        if (d.moved) this.relicScroll = Math.max(0, Math.min(d.scroll0 - (p.y - d.y0), this.renderer._relicMaxScroll || 0));
        return;
      }
      if (this.towerInfo) return; // 详情弹层打开时锁定交换
      if (this.funcLayer) return; // 功能弹层打开时锁定交换
      if (this.state !== 'fighting' || !startCell || this.swapped) return;
      if (this.anim) return; // 三消动画进行中锁定交换
      const t = e && e.touches && e.touches[0];
      if (!t) return;
      const p = this.toLogic(t.clientX, t.clientY);
      // 移动超过阈值视为滑动手势：取消点击选中，进入滑动交换
      if (this._touchStart && Math.hypot(p.x - this._touchStart.x, p.y - this._touchStart.y) > 8) {
        moved = true;
        this.pickCell = null;
      }
      const cell = this.cellAt(p);
      if (!cell) return;
      const [r1, c1] = startCell, [r2, c2] = cell;
      const adjacent = Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
      if (adjacent && (!lastCell || lastCell[0] !== r2 || lastCell[1] !== c2)) {
        if (this.match3.trySwap(r1, c1, r2, c2)) {
          startCell = cell; // 有效交换：锁定起点，动画结束后可再操作
        } else {
          startCell = cell; // 无效交换：从新格继续滑动
        }
      }
      lastCell = cell;
    };
    const onEnd = () => {
      // v1.16.82 圣遗物页：未拖动 → 补发点击；已拖动 → 吞掉
      if (this._relicDrag) {
        const d = this._relicDrag;
        this._relicDrag = null;
        this._touchStart = null; moved = false; startCell = null; lastCell = null; this.selected = null;
        if (!d.moved && this.state === 'menu') this.dispatchTouch(d.p);
        return;
      }
      // 点击交换：无滑动 + 战斗态 + 无动画 → 选中/交换/取消
      if (!moved && startCell && this.state === 'fighting' && !this.anim && !this.swapped) {
        const [r, c] = startCell;
        if (this.pickCell) {
          const [pr, pc] = this.pickCell;
          if (pr === r && pc === c) {
            this.pickCell = null; // 点同一格：取消选中
          } else if (Math.abs(pr - r) + Math.abs(pc - c) === 1) {
            this.match3.trySwap(pr, pc, r, c); // 相邻：点击交换
            this.pickCell = null;
          } else {
            this.pickCell = startCell; // 不相邻：重选
          }
        } else {
          this.pickCell = startCell; // 首次点击：选中
        }
      }
      if (this.state !== 'fighting') this.pickCell = null; // 非战斗态点击结束清选中
      startCell = null; lastCell = null;
      this.selected = null;
      moved = false;
      this._touchStart = null;
    };
    // 真机/官方推荐通道：wx 全局触摸事件（坐标=逻辑像素，与 windowWidth 同尺度）。
    // 小游戏主画布 canvas.addEventListener 在真机非同层渲染下可能不派发触摸事件，
    // 且其坐标可能为 canvas 物理像素系；故优先使用 wx 通道，canvas 仅作回退。
    if (typeof wx !== 'undefined' && wx.onTouchStart) {
      try {
        wx.onTouchStart(onStart);
        wx.onTouchMove(onMove);
        wx.onTouchEnd(onEnd);
        return;
      } catch (e) { /* 回退 canvas 通道 */ }
    }
    if (!c || !c.addEventListener) return;
    c.addEventListener('touchstart', onStart);
    c.addEventListener('touchmove', onMove);
    c.addEventListener('touchend', onEnd);
  }

  toast(text, color) {
    this.toasts.push({ text, color, ttl: 1.8 });
  }

  toLogic(cx, cy) {
    // 真机坐标单位自适应：wx 全局触摸事件为逻辑像素（与 windowWidth 同尺度）；
    // canvas 事件的坐标则可能是 canvas 物理像素（宽 = windowWidth×pixelRatio）。
    // 用坐标范围判定坐标源，统一归一化到 [0,1] 再映射 750×1334 逻辑画布。
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try {
        const info = wx.getSystemInfoSync();
        const w = info.windowWidth || info.screenWidth;
        const h = info.windowHeight || info.screenHeight;
        if (w > 0 && h > 0) {
          const cw = (_c && _c.canvas && _c.canvas.width) || 0;
          const ch = (_c && _c.canvas && _c.canvas.height) || 0;
          if (cw > 0 && cx > w) { // 坐标超出逻辑宽 → 按 canvas 物理像素归一化
            return { x: cx * LOGIC_W / cw, y: cy * LOGIC_H / (ch || cw) };
          }
          return { x: cx * LOGIC_W / w, y: cy * LOGIC_H / h };
        }
      } catch (e) {}
    }
    return { x: cx / this.scale, y: cy / this.scale };
  }

  /** 塔位命中检测：返回槽位索引（-1=不在塔位区） */
  towerSlotAt(p) {
    const { slotSize, slotGap, slotCount, slotY } = this.ly;
    const total = slotCount * slotSize + (slotCount - 1) * slotGap;
    const x0 = (750 - total) / 2;
    for (let i = 0; i < slotCount; i++) {
      const sx = x0 + i * (slotSize + slotGap);
      if (p.x >= sx && p.x <= sx + slotSize && p.y >= slotY && p.y <= slotY + slotSize) return i;
    }
    return -1;
  }

  cellAt(p) {
    const { boardX, boardY, cell, boardRows, boardCols } = this.ly;
    const c = Math.floor((p.x - boardX) / cell);
    const r = Math.floor((p.y - boardY) / cell);
    if (r >= 0 && r < boardRows && c >= 0 && c < boardCols) return [r, c];
    return null;
  }
}

module.exports = GameMain;
if (ctx) GameGlobal.game = new GameMain();
