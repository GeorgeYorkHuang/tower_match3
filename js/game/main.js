const RelicKill = require('../relics/kill-hooks.js');
const BattleActions = require('./input/battle-actions.js');
const RelicScroll = require('./input/relic-scroll.js');
const PanelScroll = require('./input/panel-scroll.js');
const MenuActions = require('./input/menu-actions.js');
const TouchInput = require('./input/touch.js');
const Coordinates = require('./input/coordinates.js');
const AccountMenu = require('./account.js');
const ICE_WALL_BALANCE = require('../config/tower-skills.js').ice['冰墙'];
const GS_BALANCE = require('../config/global-balance.js');
/**
 * main.js —— 游戏主循环与状态机（渲染层入口）
 * 状态机：fighting（波内消除+战斗）→ 波末结算 → picking（三选一）→ 下一波 / gameover
 */
const CONFIG = require('../config.js');
const GlobalSkills = require('../global-skills.js');
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
  console.info('[圣坛裂痕] 启动：canvas', _c.canvas.width + 'x' + _c.canvas.height,
    'scale', (Math.min(_c.canvas.width / CONFIG.DESIGN.W, _c.canvas.height / CONFIG.DESIGN.H)).toFixed(3));
}
const LOGIC_W = CONFIG.DESIGN.W;      // 750
const LOGIC_H = CONFIG.DESIGN.H;      // 1334
const WAVE_DUR = CONFIG.WAVE.seconds; // 40s
const GAME_VERSION = 'v1.17.23';       // fix 全歼波数恒 0（combat 清场处归集回调 _tallyWaveDeaths）+ 总击杀恒 0（kills 从不自增，damage 按 srcKey 计数）+ 撤离判定改全歼口径（clearedWaves 跨 10/20/30…检查点才在波末判定并涨深度倍率，超时叠加波不再误弹）
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
    this.sfx.setMusicEnabled(this.meta.musicOn !== false);
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
    this.run = new Run({ difficulty: CONFIG.DIFFICULTY.default, matchSkills: this.meta.matchSkills, globalSkills: this.meta.globalSkills });  // v5.2 三消技能局外三槽配置
    this.run.metaRef = this.meta;   // v1.16.78 星级查询（圣遗物 2★ 数值乘区）
    this.run.fxTarget = this.fx;    // v1.17 圣遗物生效触发飘字承接（run 内部事件 → game.fx）
    this.run.combatRef = this.combat;   // v5.2 连消技：连锁攻击子弹 / 连锁技能周期技
    this.run.boardY = this.renderer.ly.boardY;  // v5.2 combo 弹字 / 连锁子弹落点棋盘 y
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
    this.runShardGained = 0;     // 本局击杀获得碎片数（局内掉落总数，结算时由 settleRunShards 折算入账）
    this.runShardDetail = {};    // v1.17 本局碎片明细（圣遗物id→数量，只记账不入账；v1.17.20 局末统一结算）
    this.runUnlocked = [];       // v1.17.20 本局因「三选一选中」直接解锁的圣遗物 id（结算页可提示）
    this._waveAlive = {};        // v1.17.22 各波存活怪计数（全歼统计，见 _tallyWaveDeaths）
    this._waveCleared = {};      // v1.17.22 已记全歼的波次集合（防重复计数）
    this.animClock = 0;          // v1.17 怪物帧动画时钟（毫秒，仅战斗推进时累加 → 暂停时帧动画冻结）
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
    this.run = new Run({ difficulty: CONFIG.DIFFICULTY.default, matchSkills: this.meta.matchSkills, globalSkills: this.meta.globalSkills });  // v5.2 三消技能配置槽
    this.run.metaRef = this.meta;   // v1.17 测试战场圣遗物按图鉴星级显示（relicFx 星级来源）
    this.run.fxTarget = this.fx;    // v1.17 圣遗物生效触发飘字承接
    this.run.combatRef = this.combat;   // v5.2 连消技：连锁攻击子弹 / 连锁技能周期技
    this.run.boardY = this.renderer.ly.boardY;  // v5.2 combo 弹字 / 连锁子弹落点
    this.save.apply(this.saveData);
    this.run.resetRunBuild();
    this.waveTime = 0;
    this.enemies = [];
    this.pickQueue = [];
    this.pickIndex = 0;
    this.pickCell = null;
    this.combat.reset();
    this.battleRelics = [];
    this.runShardDetail = {};    // v1.17 测试战场重置碎片明细
    this.runShardGained = 0;     // v1.17.20 同步重置掉落总数（测试战场不参与结算，避免残留计数）
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
      wave: run.wave, waveTime: this.waveTime, waveDuration: (this.wave && this.wave.waveDur) || WAVE_DUR,
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
    const wallY = this.state === 'testfield' ? 1042 : ly.wallY;   // v1.17.11 测试战场塔位行保持 1042，正式战场塔位区即城墙（967）
    const baseSpeed = ((wallY - entryY) / WAVE_DUR) * 3; // v1.14.2 测试战场怪速 ×3：13s 到墙，避免入口盲区等待过久
    // 测试血量（基础塔 dps 20-40，普通怪 500 约 15 秒内可清，便于观察技能特效）
    const HP = { normal: 500, runner: 350, tank: 1500, elite: 4000, boss: 12000 };
    // v1.16.123 测试怪按类型对应代际等级（动画表：普→lv1 / 快→lv2 / 重→lv3 / 精英→lv4 / Boss→lv6）
    const TEST_LV = { normal: 1, runner: 2, tank: 3, elite: 4, boss: 6 };
    for (let i = 0; i < count; i++) {
      const isBoss = type === 'boss';
      this.wave.pushEnemy(
        HP[type] || 500, entryY, baseSpeed,
        0.5 + Math.random() * 0.5, isBoss, type, TEST_LV[type] || 1
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
      console.error('[圣坛裂痕] 帧循环错误：', e && e.stack ? e.stack : e);
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
      console.info('[圣坛裂痕] 画布中心像素采样：', Array.prototype.slice.call(img.data));
    } catch (e) {
      console.info('[圣坛裂痕] 画布像素采样不可用：', e && e.message);
    }
  }

  update(dt) {
    RelicScroll.update(this, dt);
    PanelScroll.update(this, dt);   // v1.17.45 全局技能面板惯性滚动
    // toast 过期
    this.toasts = this.toasts.filter((t) => (t.ttl -= dt) > 0);
    // v1.17 怪物帧动画时钟：仅战斗推进时累加；三选一/撤离/结算/弹层等暂停状态冻结 → 怪物帧动画停住
    if (this.state === 'fighting' || this.state === 'testfield') this.animClock += dt * 1000;
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
      // v1.17.8 波次结束：本波全部击杀 → 立即出下一波；或全部投放完成后 3s（场上残怪保留，叠加波继续打）
      //   （波时长不再固定；出怪节奏=0.5s/批，每批随机 1~⌈w/5⌉ 只）
      const allDead = !this.enemies.length && !this.wave.plan.length;
      const spawnedAll = !this.wave.plan.length && this.wave.planDoneAt !== null;
      if (allDead) {
        this._overlapWave = false;
        this.waveEnd();
      } else if (spawnedAll && this.waveTime - this.wave.planDoneAt >= 3) {
        this._overlapWave = this.enemies.length > 0;   // v1.17.3 叠加波：保留场上残怪，下一波继续出
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

  /** 主界面宝箱倒计时推进：到点自动发卡 → 弹出开箱收益弹窗 */
  tickChest(now) {
    const m = this.meta;
    if (!m.chestTimer) return;
    const remain = m.chestRemainSec(now);
    if (remain === 0) {
      const got = m.finishChest(now);
      if (got) {
        this.save.save();
        this.menuPanel = { type: 'chestOpen', mode: 'relic', reward: got };   // v1.17.9d 开箱弹窗：圣物卡收益一次弹出
      }
    }
  }

  /** 敌人移动 + 塔真实攻击（A1：每塔独立攻击/技能行为，见 combat.js）+ 攻城攻击 + 打击特效 */
  stepEnemies(dt) {
    GlobalSkills.tick(this.run,dt);
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
    // v1.17.22 全歼波数统计：先归集本帧死亡，再移除尸体
    const dying = this.enemies.filter((e) => e.hp <= 0);
    if (dying.length) this._tallyWaveDeaths(dying);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** v1.17.22 全歼波数：一波的怪「全部死亡且投放完毕」才算完全击败（通关数口径）。
   *  叠加波下场上同时存在多波怪，按 e.waveNo 逐波归零；waveNo < 当前波 → 该波已停止投放，
   *  等于当前波时需 plan 已空（否则后续还有投放，等最后一只死亡时再计）。 */
  _tallyWaveDeaths(dead) {
    this._waveAlive = this._waveAlive || {};
    this._waveCleared = this._waveCleared || {};
    dead.forEach((e) => {
      const wn = e.waveNo || 0;
      if (!wn || this._waveCleared[wn]) return;
      if (this._waveAlive[wn]) this._waveAlive[wn] -= 1;
      if (this._waveAlive[wn] <= 0 && (wn < this.run.wave || !this.wave.plan.length)) {
        this._waveCleared[wn] = true;
        this.run.clearedWaves += 1;
      }
    });
  }

  /** 攻城：到达城墙攻击范围的怪物按攻击力×攻击频率持续扣城墙血（冰冻/麻痹停止攻击；冰墙吸收/反伤/迟缓）
   *  v1.16.43 修复：无塔（槽位未解锁）时怪物到城墙也应攻城掉血——此前被「无塔不战斗」提前 return 跳过，城墙完全不扣血 */
  siegeEnemies(dt) {
    const wallLine = (this.state === 'testfield' ? 1042 : this.ly.wallY) - 10; // 攻城线（v1.17.11 正式=塔位区顶 967-10；测试战场保持 1042-10）
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
        if (this.run.gsState && this.run.gsState.reflect > 0) this.combat.damage(e, atkDmg * GS_BALANCE.reflect.damageRatio, 'global');
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
          this.combat.applySlow(e, ICE_WALL_BALANCE.attackerSlow, ICE_WALL_BALANCE.attackerSlowDuration);
          e.atkSlowAdd = ICE_WALL_BALANCE.attackDelay; e.atkSlowT = ICE_WALL_BALANCE.attackerSlowDuration;
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
    const lineY = (this.state === 'testfield' ? 1042 : this.ly.wallY) - 10;   // v1.17.11 攻城线（塔位区即城墙）
    if (e.y >= lineY) return;
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

  /** v1.17.29 消除震动：真机 vibrateShort（级别≥2 重震）+ 棋盘画布抖动（IDE 无震动能力时仅抖动） */
  vibrate(level) {
    if (typeof wx !== 'undefined' && wx.vibrateShort) {
      try { wx.vibrateShort({ type: level >= 2 ? 'heavy' : 'medium' }); } catch (e) {}
    }
    this._shake = { t: Date.now(), dur: 0.18, amp: level >= 2 ? 6 : 3.5 };   // v5.6 重震振幅加大
  }

  waveEnd() {
    // 真实战斗路径：城墙血已由「怪物攻城」实时扣减，跳过抽象漏怪模型扣血（skipLeak=true）
    const res = this.run.endWave(true);
    // 波末全塔少量经验（打怪为主渠道，波末是补充；v1.8 统一入整体池）
    const owned = this.run.slotOrder.length;
    if (owned > 0) this.run.gainExp(CONFIG.EXP.waveBonus * owned);
    // v1.17 波末银币只入「局内银币」（run.endWave 已累加 _waveGold），不再发放局外金币；
    //   招财符加成移至战斗结束统一结算（finishRun）
    this.save.save();
    if (res.broken) {
      this.finishRun(false);   // v1.16.76 破防 → 局末结算（深度收益保底 30%）
      return;
    }
    // v1.16.76 深度收益池：每波银币的一半入池 × 深度倍率；撤离拿池 100%，阵亡保底 30%
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
    // v1.17.23 撤离检查点改「全歼口径」：此前按到达波次（run.wave % 10 === 0）判定，超时叠加波
    //   （投放完 3s 残怪保留）同样触发 → 实际才全歼 7 波也会弹撤离决策（用户实测：进入第 10 波即判定）。
    //   改为：每 10 波的怪全部击杀完（clearedWaves 跨过 10/20/30…检查点）才在波末判定，
    //   深度倍率 ×1.30 同步挂到检查点——未全歼通过不涨倍率（「通过撤离点」= 全歼通过）。
    const cp = Math.floor((this.run.clearedWaves || 0) / EV.interval);
    if (cp > (this.run._evacSeen || 0)) {
      for (let i = (this.run._evacSeen || 0) + 1; i <= cp; i++) {
        this.depthMult *= (i * EV.interval < EV.lateWave ? EV.depthMult : EV.depthMultLate);
      }
      this.run._evacSeen = cp;
      if (this.menuStage !== 'test') {
        // v1.16.116 撤离决策层只允许两个选项（正常撤离/继续前进）：清掉所有可能叠加的弹层，
        // 否则波中途打开的设置弹层（含「重新开始」按钮）会盖在决策层上造成歧义
        this.funcLayer = null;
        this.funcLayerHits = {};
        this.shopOpen = false;
        this.relicDetail = null;
        this.towerInfo = null;
        this.towerSkill = null;
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
    // v1.17 战斗结束统一结算金币：局内银币（波末累加 + 击杀）按深度池口径折算（poolShare=50%）
    //   折算系数对齐 EV.poolShare，使「局内银币→局外金币」与深度结算 payout 数量级相当（招财符按星级 +20%）
    const b = this.meta.relicBonus();
    const silver = Math.round(this.run.gold * EV.poolShare * (1 + 0.20 * b.gold));
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
    // v1.17.20 碎片统一入账：撤离全额，失守按 SHARD_SETTLE.deadRatio 折算（floor 张数 + 随机保留）
    const ss = this.settleRunShards(evacuated ? 1 : CONFIG.SHARD_SETTLE.deadRatio);
    this.runSummary = {
      evacuated, wave: this.run.wave, payout, miles,
      cleared: this.run.clearedWaves || 0,   // v1.17.22 全歼波数（通关数口径：一波怪全部死亡才算，非「到达第几波」）
      chestName: tier ? tier.name : null, chestKey: tier ? tier.key : null, chestGranted: ok1, chestExtra,   // v1.17 chestKey：结算页宝箱档位图标
      chestSkipped: noChest,   // v1.16.92 前三波阵亡无宝箱（结算页区分提示）
      // v1.17.20 碎片三件套：raw=掉落总张数 / kept=折算后保留 / lost=损失（失败态展示"损失 N"）
      shards: ss.kept, depthMult: this.depthMult,
      shardDetail: ss.finalDetail,      // 折算后明细（结算页按此绘制图标×数量）
      shardsRaw: ss.raw, shardsLost: ss.lost,
      unlockedThisRun: this.runUnlocked.slice(),   // 本局三选一选中即解锁的圣遗物（失败不回退）
      relicCards: this._buildRelicCards(ss.finalDetail),   // v1.17.22 结算大卡数据（稀有度→碎片数降序）
      silver: this.silverGained || 0,   // v1.17 局内银币按深度池口径折算的金币
      goldBonus: 0.2 * b.gold,          // v1.16.106 招财符加成系数（结算页展示）
      kills: ks,                        // v1.16.106 本局总击杀
      relics: this.battleRelics.slice(), // v1.16.106 本局获取圣遗物快照（结算页图标展示）
    };
    this.gameoverAt = Date.now();   // v1.16.117 结算动画时间基准（圣遗物逐个弹出 → 收益最后弹出）
    this.gameoverSkip = false;      // v1.17.21 每局结算重置跳过标记（点击任意处置 true 直达演出终点）
    this.state = 'gameover';
    this.sfx.stopBgm();
  }

  /**
   * v1.17.20 局内碎片统一入账（撤离/失守/中途退出共用）
   * 局内只记账（runShardDetail），此处按比例折算后批量写入 meta.shards，并清空本局账本。
   * 折算规则：保留张数 K = floor(总张数 × ratio)；K 张从明细池按「张」等概率随机抽取后重新计数
   *   （a×4 + b×3 + c×2 = 9 张、ratio=0.3 → K=2，可能保留 a+a / a+b / b+c 等任意组合）
   * @param {number} ratio 1 = 全额（撤离）；0.3 = 失守 / 中途退出
   * @returns {{finalDetail: Object, raw: number, kept: number, lost: number}}
   */
  /** v1.17.22 结算大卡数据：本局圣遗物 → [{id, rarity, star, shards}]，按 稀有度(ssr>sr>r) → 碎片数 降序；名字由渲染层按 id 取 */
  _buildRelicCards(detail) {
    const W = { ssr: 0, sr: 1, r: 2 };
    return (this.battleRelics || []).map((r) => ({
      id: r.id,
      rarity: CONFIG.relicRarity(r.id),
      star: this.meta.starOf(r.id) || 0,
      shards: (detail && detail[r.id]) || 0,
    })).sort((a, c) => (W[a.rarity] - W[c.rarity]) || (c.shards - a.shards));
  }

  settleRunShards(ratio) {
    const detail = this.runShardDetail || {};
    const pool = [];
    Object.keys(detail).forEach((id) => {
      const n = detail[id] | 0;
      for (let i = 0; i < n; i++) pool.push(id);
    });
    const raw = pool.length;
    const r = (typeof ratio === 'number' && ratio >= 0) ? Math.min(1, ratio) : 1;
    const kept = Math.max(0, Math.floor(raw * r));
    // 只保留前 kept 张 → 先打乱（kept < raw 时才需要随机；全额时不洗牌，保证明细稳定）
    if (kept < raw && kept > 0) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
    }
    const finalDetail = {};
    for (let i = 0; i < kept; i++) {
      const id = pool[i];
      finalDetail[id] = (finalDetail[id] || 0) + 1;
    }
    Object.keys(finalDetail).forEach((id) => this.meta.addShard(id, finalDetail[id]));
    const res = { finalDetail, raw, kept, lost: raw - kept };
    // 清空本局账本，避免重复入账（goMenu/restart 与 finishRun 都会调本方法）
    this.runShardDetail = {};
    this.runShardGained = 0;
    if (raw > 0) this.save.save();
    return res;
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
    // v1.17.3 叠加波（40s 超时残留怪）：保留场上剩余敌人，新一波继续投放
    const keep = !!this._overlapWave;
    this._overlapWave = false;
    this.wave.start(keep); // run.wave += 1
    const w = this.run.wave || 1; // v1.16.124 兜底：极端情况下 wave 未递增时避免显示 undefined
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
    // v1.17.20 碎片局末入账：重开前先按失守比例结算，避免局内碎片凭空丢失
    this.settleRunShardsOnExit('重新开局');
    // v1.16.115 修复：旧实现只清棋盘/塔位/技能，未重置 run.wave 与深度收益池——
    // 第 10 波（或任意波）重开后 wave.start() 使波数 +1，出现"塔清空却从 11 波继续"且深度池带旧账。
    // 改为复用 newRun(true)：全新 Run（波数/深度池/倍率/经验/敌人/战斗实体全部归零），波 1 重来。
    const fb = this.firstBonus;   // 重开不计入每日首战加成次数
    this.newRun(true);
    this.firstBonus = fb;
    this.toast('重新开局 · 第 1 波', '#7ef0a3');
  }

  /** v1.17.20 中途退出/重开时的碎片兜底：有账才结算，按失守比例折算并提示 */
  settleRunShardsOnExit(reason) {
    if (!this.runShardGained || this.runShardGained <= 0) return;
    const ss = this.settleRunShards(CONFIG.SHARD_SETTLE.deadRatio);
    if (ss.raw > 0) {
      this.toast(`${reason} · 碎片按 ${Math.round(CONFIG.SHARD_SETTLE.deadRatio * 100)}% 结算 ${ss.kept}/${ss.raw}`, '#a86bff');
    }
  }

  /** v1.16.77 局内商店购买：扣局内银币并施加临时强化（energy 补给 / 城墙修复为即时效果） */
  buyStoreItem(idx) {
    const item = (CONFIG.STORE.items || [])[idx];
    if (!item) return;
    const bought = this.run.store[item.id] || 0;
    if (bought >= item.max) { this.toast('已达上限', '#9fb2c3'); return; }
    const cost = item.cost[bought];
    if (this.run.gold < cost) { this.toast('银币不足', '#ff6b6b'); return; }
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

  /** 返回主界面（战斗结束/设置入口）：金币已由 finishRun 结算，局内银币不镜像（v1.17 币种分离） */
  goMenu() {
    // v1.17.20 碎片局末入账：战斗中直接返回主界面时先按失守比例兜底结算（结算后 runShardDetail 已清空 → 再调无副作用）
    this.settleRunShardsOnExit('中途退出');
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
    RelicKill.experience(this.run, e, b);
    // v1.12.1：战斗中击杀只积累升级待选（pending），不弹三选一打断战斗；
    // 升级三选一统一在波末「波次完成 → 继续」时结算（v1.8 设计：波末逐次结算）
    // 精英怪：概率掉落战场宝箱（寻宝罗盘加成；v1.16.78 赏金猎人 +N%）；v1.16.96 赏金猎人3★ 连续3波无宝箱必掉
    if (e.type === 'elite') {
      const chance = RelicKill.eliteChestChance(this.run, b);
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
    /* v1.16.76 击杀掉落线：碎片（即时入账，不受宝箱槽位限制）+ 小额击杀银币 */
    const field = this.field || CONFIG.FIELDS.ancient;
    if (field.dropAttr && field.dropAttr !== 'none') {
      const KD = CONFIG.KILL_DROP;
      let n = 0;
      if (e.type === 'elite' && Math.random() < KD.eliteShardChance) n = Math.random() < 1 / 3 ? 2 : 1;
      if (e.isBoss) n = KD.bossShardBase + (Math.random() < KD.bossShardBonusChance ? 2 : 0);
      if (n > 0) {
        const id = CONFIG.randomShardId(field.dropAttr);
        if (id) {
          // v1.17.20 碎片改「局内记账 → 局末入账」：此处不再直接 meta.addShard，
          //   否则失守时无法按 30% 折算收回（详见 settleRunShards）
          this.runShardGained += n;
          this.runShardDetail[id] = (this.runShardDetail[id] || 0) + n;   // v1.17 碎片明细（击杀掉落）
          this.toast(`🧩 圣遗物碎片 +${n}（局末结算）`, '#a86bff');
        }
      }
      // v1.17 击杀银币：单怪 (5~10 浮动) × 代际等级系数（Lv1=1，50波平均≈2倍）× 类型倍率（精英×3/Boss×8）× 战场银币倍率
      // 替代旧 1.06^w 波次通胀：收益成长改由怪物代际等级驱动（与血量曲线同源）
      const kg = Math.round((KD.killGold[0] + Math.random() * (KD.killGold[1] - KD.killGold[0]))
        * KD.goldLevelMult(e.genLv)
        * (e.isBoss ? KD.bossGoldMult : (e.type === 'elite' ? KD.eliteGoldMult : 1))
        * (field.goldMult || 1));
      const earned = kg * (this.run.gsState && this.run.gsState.gold > 0 ? GS_BALANCE.gold.multiplier : 1);
      this.run.gold += earned;
      if (earned > kg) this.fx.push({type:'floatText',text:'+'+earned,x:e.x,y:e.y,t:0,dur:0.8,size:20,color:'#ffe17c'});
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
    const star3Mode = mode === 'star3';
    const cands = this._rollRelicCandidates(star3Mode);
    if (star3Mode && (!cands || !cands.length)) {
      this.toast('尚未拥有任何圣遗物，先解锁 1 个再来测试 3★', '#9fb2c3'); this._chestBusy = false; return;
    }
    if (!star3Mode && (!cands || !cands.length)) {
      this.toast('圣遗物已全部解锁，宝箱折算为碎片', '#a86bff');
      // v1.16.78 全解锁兜底：宝箱仍折算少量碎片，避免点击无反馈
      const shardId = CONFIG.randomShardCardId(Math.random() < 0.5 ? 'sr' : 'r');
      // v1.17.20 同样只记账，局末随其他碎片一起按比例入账
      if (shardId) {
        this.runShardGained += 1;
        this.runShardDetail[shardId] = (this.runShardDetail[shardId] || 0) + 1;   // v1.17 碎片明细（全解锁折算）
      }
      this.save.save();
      this._chestBusy = false;
      return;
    }
    this.pendingRelicPicks.push({ candidates: cands, ...(star3Mode ? { star3: true } : {}) });
    this._chestBusy = false; // v1.16.74 动画完成解锁战斗输入
  }

  /** v1.17 抽 3 个候选（三选一 / 重掷共用）：star3 模式取已拥有池 star3 文案，普通模式取未解锁池按稀有度权重 */
  _rollRelicCandidates(star3Mode) {
    const RR = CONFIG.RELIC_RUN;
    const star3 = !!star3Mode;
    // 在场塔（本局已激活的塔色）+ 通用池；候选带 tint（塔色/金色）供弹层圆底配色
    const ownedKeys = this.run.slotOrder || [];
    const meta = this.meta;
    const isUnlocked = (id) => meta.starOf(id) >= 1;   // v1.16.78 已解锁（图鉴/碎片达阈值）不再出现在三选一
    let pool = [];
    if (star3) {
      ownedKeys.forEach((k) => { if (RR.tower[k]) RR.tower[k].forEach((d) => { if (meta.starOf(d.id) >= 1) pool.push({ def: d, tint: k }); }); });
      RR.common.forEach((d) => { if (meta.starOf(d.id) >= 1) pool.push({ def: d, tint: 'common' }); });
      if (!pool.length) return null;
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
      return cands3;
    }
    ownedKeys.forEach((k) => { if (RR.tower[k]) RR.tower[k].forEach((d) => { if (!isUnlocked(d.id)) pool.push({ def: d, tint: k }); }); });
    RR.common.forEach((d) => { if (!isUnlocked(d.id)) pool.push({ def: d, tint: 'common' }); });
    if (!pool.length) return null;
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
    return cands;
  }

  /** v1.17 三选一重掷：局内银币付费（200/400/800/1600 指数增长，每窗口上限 4 次），重新抽 3 个候选 */
  rerollRelicPick() {
    if (!this.relicPick) return false;
    const n = this.relicPick.rerolls || 0;
    const costs = CONFIG.RELIC_REROLL.costs;
    if (n >= costs.length) { this.toast('已达重掷上限', '#9fb2c3'); return false; }
    const cost = costs[n];
    if (this.run.gold < cost) { this.toast(`银币不足（需 ${cost}）`, '#ff6b6b'); return false; }
    const cands = this._rollRelicCandidates(!!this.relicPick.star3);
    if (!cands || !cands.length) { this.toast('暂无可用候选', '#9fb2c3'); return false; }
    this.run.gold -= cost;
    this.relicPick.rerolls = n + 1;
    this.relicPick.candidates = cands;
    this.relicPickHits = []; // 命中区随候选刷新
    this.toast(`已重掷 · 消耗 ${cost} 🪙`, '#f7c948');
    return true;
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
      if (this.testProfile) this.renderer.toast(ctx, this.toasts);
      return;
    }
    // v1.14 测试战场：独立渲染层（状态条 + 战场 + 塔槽 + 控制条 + 技能面板）；v1.16.73 测试战场弹圣遗物三选一时底层保持测试战场
    if (this.state === 'testfield' || (this.state === 'relicpick' && this._relicReturnState === 'testfield')) {
      this.renderer.animNow = this.animClock;   // v1.17 敌人帧动画时钟注入（relicpick 冻结）
      this.testHits = this.renderer.testFieldLayer(ctx, this.testState(), this.testHits, this.enemies, this.fx, this.combat);
      if (this.testProfile) this.renderer.toast(ctx, this.toasts);
      if (this.relicDetail) {   // v1.16.113 测试战场圣遗物详情弹层
        this.renderer.relicDetailLayer(ctx, this.battleRelics, this.relicDetail.page || 0, this.relicDetailHits);
      }
      if (this.state === 'relicpick') {
        // v1.16.109 修复：漏传动画时间导致测试战场三选一窗口 alpha=0 不可见、状态卡死——与普通战斗一致传 elapsed
        if (!this.relicPick.t) this.relicPick.t = Date.now();
        this.renderer.relicPickLayer(ctx, this.relicPick, this.relicPickHits, Date.now() - this.relicPick.t, this.run.gold);
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
    this.renderer.animNow = this.animClock;   // v1.17 敌人帧动画时钟注入（暂停状态冻结）
    this.renderer.enemies(ctx, this.enemies);
    this.renderer.fx(ctx, this.fx);
    // v1.16.59 战场宝箱（怪物掉落，点击开启圣物三选一）
    this.renderer.fieldChests(ctx, this.fieldChests);
    // v1.17 局内商店面板：从 actionArea 内移到敌人/特效层之后绘制（否则怪物贴图浮在商店面板上方）；
    // 在 toast 之前画（商店遮罩不盖 toast），仍先于三选一/塔详情/功能弹层，保持"弹层盖商店"的既有层级
    this.renderer.battleShop(ctx, st);
    if (this.testProfile) this.renderer.toast(ctx, this.toasts);
    if (this.state === 'picking') {
      const group = this.pickQueue[this.pickIndex];
      const pending = this.remainingPending(group.tower);
      this.renderer.pickLayer(ctx, group, pending, this.pickHits);
    }
    if (this.state === 'relicpick') {
      if (!this.relicPick.t) this.relicPick.t = Date.now(); // 弹出动画首帧
      this.renderer.relicPickLayer(ctx, this.relicPick, this.relicPickHits, Date.now() - this.relicPick.t, this.run.gold); // v1.17 修复：漏传银币导致重掷按钮恒显"银币不足"
    }
    // v1.16.73 本局圣遗物详情弹层（战斗暂停）
    if (this.relicDetail) {
      this.renderer.relicDetailLayer(ctx, this.battleRelics, this.relicDetail.page || 0, this.relicDetailHits);
    }
    if (this.state === 'gameover') this.renderer.gameOver(ctx, Object.assign({ summary: this.runSummary, goT: this.gameoverSkip ? 99999 : (this.gameoverAt ? Date.now() - this.gameoverAt : 0) }, st), this.restartBtn);
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
        expRatio: Math.min(1, run.exp / run.expNeed()),   // v1.17 修复：0 级也显示进度（原 expLevel>0 条件导致首波三消经验条恒 0）
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
      waveDuration: (this.wave && this.wave.waveDur) || WAVE_DUR,
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
      expRatio: Math.min(1, run.exp / run.expNeed()),   // v1.17 修复：0 级也显示进度（出怪区整体经验条）
      battleRelics: this.battleRelics || [],   // v1.9：本局获得的圣物（经验条下方图标展示）
      globalSlots: run.globalSlots, globalShield: (run.gsState && run.gsState.shield) || 0,
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
      matchSkills: this.meta.matchSkills,   // v5.3 三消技能配置（主页配置行展示 / 面板修改）
      globalSkills: this.meta.globalSkills, // v5.3 全局技能槽（预留）
      skillUnlocks: this.meta.skillUnlocks,   // v5.3c 技能解锁状态（商店购买）
      shopLeft: Object.keys(CONFIG.SHOP_CHEST).reduce((acc, k) => { acc[k] = this.meta.shopChestLeft(k); return acc; }, {}), // v5.3c 圣物宝箱每日限购剩余（蓝/紫/金 3 档）
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
      deviceInfo: this.menuPanel && this.menuPanel.type === 'accountInfo' ? AccountMenu.deviceInfo() : null,
      testProfile: !!this.testProfile,
      musicOn: this.meta.musicOn !== false,
      debug: !!CONFIG.DEBUG_ACCOUNT,
    };
  }

  /** 测试战场触摸分发（v1.14）：面板打开时仅响应面板项，否则控制条/塔槽/返回/倍速 */
  onTestFieldTap(p) {
    if (this.testPanel) {
      const bounds = (this.testHits || []).find(it => it.id === 'panel_bounds');
      if (bounds && !bounds.hit(p.x, p.y)) { this.testPanel = null; return true; }
    }
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
    return MenuActions.onMenuTap(this, p);
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
        // v1.17.20 重复折算同样走「局末入账」，失守时一起按比例折算
        this.runShardGained += n;
        this.runShardDetail[c.id] = (this.runShardDetail[c.id] || 0) + n;   // v1.17 碎片明细（重复圣遗物折算）
        this.toast(`重复圣遗物 → ${c.icon}${c.name} 碎片 +${n}（局末结算）`, '#a86bff');
        this.save.save();
        return;
      }
      // 局内圣遗物（rougelike）：本局生效 + 图鉴解锁（跨局记录）
      this.runRelics.push(c.id);
      this.run.runRelic[c.id] = (this.run.runRelic[c.id] || 0) + 1;
      const wasLocked = this.meta.starOf(c.id) < 1;   // v1.17.20 记录「本局选中即解锁」，失败折算不回退
      this.meta.codexUnlock(c.id);
      if (wasLocked) this.runUnlocked.push(c.id);
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
      this.run.relicFx(c.id, '已生效'); // v1.17 圣遗物生效提示（★星级 + 名称 + 圣遗物色）
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
  dispatchTouch(p) { return BattleActions.dispatchTouch(this, p, GAME_VERSION); }

  bindTouch() {
    return TouchInput.bindTouch(this, _c ? _c.canvas : null);
  }

  toast(text, color) {
    this.toasts.push({ text, color, ttl: 1.8 });
  }

  toLogic(cx, cy) {
    return Coordinates.toLogic(this, _c.canvas, cx, cy);
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
