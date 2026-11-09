const Boot = require('./boot.js');
const BoardChests = require('./flows/board-chests.js');
const EliteFx = require('./fx/elite.js');
const BattleShop = require('../economy/battle-shop.js');
const PickReroll = require('../economy/pick-reroll.js');
const TestOperations = require('./flows/test-operations.js');
const RelicAcquisition = require('./flows/relic-acquisition.js');
const RunSettlement = require('./flows/run-settlement.js');
const MATCH_GLOW = require('../config/match-glow.js');
const TowerActivation = require('../tower-activation.js');
const Bosses = require('../bosses/index.js');
const RoseaFx = require('./fx/boss-rosea.js');
const VeraFx = require('./fx/boss-vera.js');
const GalvinFx = require('./fx/boss-galvin.js');
const DamageNumbers = require('./fx/damage-numbers.js');
const BattleActions = require('./input/battle-actions.js');
const ShopScroll = require('./input/shop-scroll.js');
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
const EnergyState = require('../config/energy-state.js');
const GlobalSkills = require('../global-skills.js');
const { Run } = require('../run.js');
const { Renderer, layout } = require('./render.js');
const { CombatSystem } = require('../combat.js');
const { initCanvas } = require('./canvas.js');
const { SfxManager } = require('./audio.js');

/* 环境初始化（模块化 ）：主画布获取 + 尺寸适配 + ctx；失败返回 null 并输出诊断 */
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
// 发布版本统一由配置提供；修复历史见 Git 提交记录。
const GAME_VERSION = require('../config/version.js').display;
const { SaveManager } = require('../save.js');
const { WaveDirector } = require('../wave.js');
const { Match3Controller } = require('../match3.js');

/* 塔位图标字符（加载失败时的兜底） */
const TOWER_ICON = { fire: '🔥', ice: '❄', poison: '☠', electric: '⚡', boomerang: '🌀', cannon: '💣' };

class GameMain {
  constructor() {
    this.scale = Math.min(_c.canvas.width / LOGIC_W, _c.canvas.height / LOGIC_H); // 等比 contain：完整显示且铺满（背景延伸填充剩余区）
    this.renderer = new Renderer();
    // 萝赛技能表现层（藤甲环/破壳花瓣/召唤旋涡/二阶段轮廓）：只读 Boss 状态，不参与伤害结算
    this.bossFx = RoseaFx.create();
    this._bossFxOn = false;
    this._bossPhaseSeen = 0;
    this._summonSeen = 0;
    this.ly = layout();
    this.restartBtn = {};
    this.pickHits = {};
    this.funcHits = [];
    this.towerInfo = null;       // 塔详情弹层：{slotIdx, key, name, level, exp, expNeed, expRatio, range, ammo, skills}
    this.towerInfoHits = {};     // 详情弹层命中：{bg, close, skill[]}
    this.towerSkill = null;      // 技能二级详情弹层：{key, skillName, icon, desc, color, lv, lvMax, branches, bA, bB, bC, branchDesc}
    this.towerSkillHits = {};    // 二级弹层命中：{bg, back}
    // 测试战场：塔技能配置面板 + 倍速 + 刷怪控制
    this.testPanel = null;       // {key} 当前配置的塔
    this.testHits = {};          // 测试战场命中区（渲染时重建）
    this.testSpeed = 1;          // 倍速 ×1/×2/×4
    this.runSpeed = 1;           // 主战斗加速 ×1/×2/×3/×4（移到城墙上方按钮）
    this.menuStage = 'ancient';  // 主界面所选战场：ancient 远古 | test 测试（◀ ▶ 切换）
    this.funcLayer = null;       // 底部功能弹层：{type:'shop'|'setting'|'tome'|'help', confirming?, version?}
    this.funcLayerHits = {};     // 功能弹层命中：{bg, close, confirm?}
    this.dmgStat = null;         // 伤害统计弹层开关
    this.dmgStatHits = {};       // 伤害统计弹层命中：{bg, close}
    this.toasts = [];
    this.selected = null;
    this.swapped = false;
    this.waveClear = null;
    this.waveClearBtn = {};
    this.waveHint = null;  // 波间透明提示（2s 自动消失，不暂停）
    this.bossHint = null;  // 每 5 波 Boss 警告（4s 闪烁，不暂停）
    // 开局引导：先消先得（消除 3 连 → 获得对应塔上槽）
    this.toasts.push({ msg: '滑动相邻方块消除 3 连 · 获得对应塔', color: '#9fb2c3', ttl: 3.2 });
    // 打击特效与音效（模块化 ：SfxManager 独立管理）
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
    this.sfx.setEnabled(this.meta.soundOn !== false);   // 应用声音开关存档
    // 主界面状态
    this.menuTab = 'battle';     // battle / shop / relic / codex（新增塔图鉴页签）
    this.codexSel = 'fire';      // 塔图鉴当前选中塔
    this.menuPanel = null;       // 子面板：{ type:'relicDex' | 'relicInfo' | 'starUp' }
    this.relicDexPage = 0;       // 圣物图鉴分页（每页 16 卡）
    this.menuHits = [];          // 主界面命中区（渲染时重建）
    this._rewardedAd = null;     // 激励视频广告实例（惰性创建）
    this._postPick = null;       // 升级三选一完成后回到的状态（'waveclear' / null=战斗）
    // 战斗内圣物宝箱三选一：精英掉落入队，逐次弹层（暂停战斗）
    this.pendingRelicPicks = []; // [{ candidates: [{id,name,icon,desc}×3] }]
    this.runRelics = [];         // 本局已获得的局内圣遗物 id 列表（rougelike，本局生效）
    this.relicPick = null;       // 当前圣物三选一弹层
    this.relicPickHits = [];     // 圣物三选一候选命中区
    this.newRun(false);
    this.bindTouch();
    this.lastTs = 0;
    requestAnimationFrame(this.loop.bind(this));
  }

  /** 新建对局；enterBattle=true 时应用技能搭配/圣物并进入战斗，否则停留在主界面 */
  newRun(enterBattle) {
    this._talentGesture=null;
    this._tutorial = null;
    // New runs and profile switches must not inherit the previous run's reward UI or payout cache.
    this.pendingRelicPicks = [];
    this.runRelics = [];
    this.relicPick = null;
    this.relicPickHits = [];
    this._relicReturnState = null;
    this._lastPickStar3 = false;
    this.silverGained = 0;
    this.dmgNumbers = DamageNumbers.create();
    this.anim = null;
    this.run = new Run({ field: this.menuStage, difficulty: CONFIG.DIFFICULTY.default, matchSkills: this.meta.matchSkills, globalSkills: this.meta.globalSkills });  // 三消技能局外三槽配置
    this.run.metaRef = this.meta;   // 星级查询（圣遗物 2★ 数值乘区）
    this.run.fxTarget = this.fx;    // 圣遗物生效触发飘字承接（run 内部事件 → game.fx）
    this.run.combatRef = this.combat;   // 连消技：连锁攻击子弹 / 连锁技能周期技
    this.run.boardX = this.renderer.ly.boardX; this.run.boardCell = this.renderer.ly.cell;
    this.run.boardY = this.renderer.ly.boardY;  // combo 弹字 / 连锁子弹落点棋盘 y
    this.save.apply(this.saveData);
    this.waveTime = 0;
    this.enemies = [];
    this.pickQueue = [];
    this.pickIndex = 0;
    this.pickCell = null; // 点击交换选中格
    this.combat.reset();
    this._postPick = null;
    this.battleRelics = []; // ：本局获得的圣物（状态栏圣遗物行展示前10个 + 点击查看详情）
    this._boardChestId = 0;
    this.fieldChests = [];  // ：战场宝箱实体（飞入棋盘，相邻消除后沿用开箱三选一）{x,y,t,kind}
    this._chestBusy = false; // 宝箱开箱→飞行动画期间锁定战斗输入
    this.relicDetail = null;      // ：本局圣遗物详情弹层 {page}（点击顶部状态栏圣遗物行打开，战斗暂停）
    this.relicDetailHits = {};    // 详情弹层命中区（close/prev/next）
    /* 激励系统：战场合约 + 撤离点 + 击杀掉落 */
    this.field = CONFIG.FIELDS[this.menuStage] || CONFIG.FIELDS.ancient;
    this.run.fieldAmmoMult = this.field.ammoCapMult;   // 弹药上限倍率（战场扭曲规则）
    this.run.fieldCfg = this.field;                    // 战场被动触发器（风场/诅咒）
    this.depthPool = 0;          // 深度收益池（撤离拿 100%，阵亡保底 30%）
    this.depthMult = 1;          // 深度倍率（每通过一个撤离点 ×1.30，40 波后 ×1.10）
    this.runShardGained = 0;     // 本局击杀获得碎片数（局内掉落总数，结算时由 settleRunShards 折算入账）
    this.runShardDetail = {};    // 本局碎片明细（圣遗物id→数量，只记账不入账；局末统一结算）
    this.runUnlocked = [];       // 本局因「三选一选中」直接解锁的圣遗物 id（结算页可提示）
    this._waveAlive = {};        // 各波存活怪计数（全歼统计，见 _tallyWaveDeaths）
    this._waveTotal = {};        // 各波出场总数（波末银币按「已击杀/已出场」折算完成度）
    this._waveCleared = {};      // 已记全歼的波次集合（防重复计数）
    this.animClock = 0;          // 怪物帧动画时钟（毫秒，仅战斗推进时累加 → 暂停时帧动画冻结）
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

  /** 应用主界面配置进入战斗：塔参战 + 圣物城墙血量（：无默认技能，技能全部靠三选一获取） */
  enterBattle() {
    // 拥有塔参战（level≥1，塔位区可出战）
    this.run.slotOrder.forEach((k) => {
      const t = this.run.effects.tower(k);
      if (t && t.level === 0) t.level = 1;
    });
    // ：不再默认激活任何技能——塔无获取技能时技能列表为空，
    // 所有技能通过「打怪经验 → 整体升级 → 三选一」获取（技能卡激活 / 分支卡续升）
    // 圣物·磐石印：城墙血量上限；城墙加固（局内圣遗物）：城墙血量 +N%
    const talentCenter=require('./input/talent-actions.js').center(this.meta);
    if(talentCenter){this.run._talentCenterId=talentCenter.id;this.run.runRelic[talentCenter.id]=1;this.runRelics.push(talentCenter.id);this.battleRelics.push({id:talentCenter.id,name:talentCenter.name,icon:talentCenter.icon,desc:(talentCenter.star>=2?talentCenter.star2||talentCenter.desc:talentCenter.desc)+(talentCenter.star>=3&&talentCenter.star3?' '+talentCenter.star3:''),star3:talentCenter.star>=3});}
    const b = this.meta.relicBonus();
    const wallRelic = this.run.relicNum('s_sr_cm_wall');
    this.run.lineHp = Math.round(CONFIG.LINE.hp * (1 + 0.10 * b.wall) * (1 + wallRelic / 100));
    this.run.lineMaxHp = this.run.lineHp;   // 冰墙回血上限基准
    this.state = 'fighting';
    require('../talents/runtime.js').initialize(this.run,this.meta);
    this.wave.start();
    // 三星历练奖励优先于战斗推进与新手引导，仅在正式进入新对局时发放。
    if (!require('../relics/opening-pick.js').queue(this)) require('./tutorial.js').begin(this);
    this.toast('进入战斗 · 消灭全部怪物', '#7ef0a3');
    // 战斗 BGM（真机需在用户手势后播放）
    this.sfx.startBgm();
  }

  /** 测试战场：单塔出战、弹药恒满、城墙无敌，专注技能效果验证（） */
  enterTestField() { return TestOperations.enterTestField.call(this); }

  /** 测试战场：更换出战塔（单塔模式，；切塔后旧塔立即取消生效） */
  switchTestTower(key) { return TestOperations.switchTestTower.call(this, key); }

  /** 测试战场状态（出战塔槽 + 全部塔简表 + 当前技能配置） */
  testState() { return TestOperations.testState.call(this); }

  /** 测试战场：点塔技能行分支按钮 → 该分支 0↔1↔2↔3 循环；clear 清空该技能 */
  testSkillAction(key, name, br) { return TestOperations.testSkillAction.call(this, key, name, br); }

  /** 测试战场：一键激活该塔全部技能（A 分支 Lv3，便于快速看全特效） */
  testSkillAll(key, on) { return TestOperations.testSkillAll.call(this, key, on); }

  /** 测试战场：召唤敌人（type: normal/runner/tank/elite/boss；hp 按类型给测试值） */
  spawnTestEnemies(type, count) { return TestOperations.spawnTestEnemies.call(this, type, count); }

  /** 测试战场：清空全部敌人与飞行弹道 */
  clearTestEnemies() { return TestOperations.clearTestEnemies.call(this); }

  /** 测试战场：切换倍速 ×1/×2/×4 */
  cycleTestSpeed() { return TestOperations.cycleTestSpeed.call(this); }

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
      Boot.ready(this); // 首帧成功后才关闭加载流程。
      requestAnimationFrame(this.loop.bind(this));
    } catch (e) {
      console.error('[圣坛裂痕] 帧循环错误：', e && e.stack ? e.stack : e);
      if (Boot.fail(e)) { this._bootFailed = true; return; } // 首帧失败暂停循环，等待重试。
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
    if (this._adBusy) return;
    if (this.state === 'fighting' && this.run.adReviveProtection > 0) this.run.adReviveProtection = Math.max(0, this.run.adReviveProtection - dt * this.runSpeed);
    ShopScroll.update(this, dt);
    RelicScroll.update(this, dt);
    PanelScroll.update(this, dt);   // 全局技能面板惯性滚动
    // toast 过期
    this.toasts = this.toasts.filter((t) => (t.ttl -= dt) > 0);
    // 怪物帧动画时钟：仅战斗推进时累加；三选一/撤离/结算/弹层等暂停状态冻结 → 怪物帧动画停住
    if (this.state === 'fighting' || this.state === 'testfield') this.animClock += dt * 1000;
    // 特效推进（：战斗状态内随倍速加速——弹道/爆炸/粒子/技能演出与怪物移速、塔攻速同频，
    //  避免"逻辑快、动画慢"的不和谐；菜单/弹层等状态倍速为 1 不受影响）
    const fxMul = (this.state === 'fighting' || this.state === 'testfield')
      ? (this.state === 'testfield' ? this.testSpeed : this.runSpeed) : 1;
    this.fx = this.fx.filter((f) => {
      // 召唤炮台只随真实实体和战斗时钟存活，弹层暂停不会提前耗尽特效寿命。
      if (f.type === 'turret' && f.turret) {
        return f.turret.ttl > 0 && this.combat && this.combat.turrets.includes(f.turret);
      }
      if (f.kind === 'spawnportal') {
        const active = this.state === 'fighting' || this.state === 'testfield';
        TowerActivation.advance(this.run.effects.tower(f.towerKey), f, active ? dt * fxMul : 0);
      } else f.t += dt * fxMul;
      return f.t < f.dur;
    });
    // 三消动画推进（交换 → 消除 → 逐级连锁，由 match3 控制器管理）
    if (this.state === 'fighting' || this.state === 'testfield') this.match3.update(dt);
    // 主界面：宝箱开箱倒计时完成 → 发卡；每日精选跨天自动刷新
    if (this.state === 'menu') {
      this.tickChest(Date.now());
      this.meta.ensureDailyPicks(Date.now());
      return;
    }
    if (this.state === 'fighting') {
      // 战斗宝箱与开局奖励：有队列先弹层，暂停战斗推进。
      if (require('./tutorial.js').tick(this)) return;
      if (this.pendingRelicPicks.length) {
        this.shopOpen = false;
        this.relicPick = this.pendingRelicPicks.shift();
        // Queued picks may predate the previous selection; validate at presentation time.
        if (!this.relicPick.star3 && this.relicPick.candidates.some(c =>
          (this.relicPick.rarity === 'ssr' && CONFIG.relicRarity(c.id) !== 'ssr') ||
          (CONFIG.relicRarity(c.id) !== 'r' && ((this.run.runRelic[c.id] || 0) > 0 || (this.runRelics || []).includes(c.id))))) {
          this.relicPick.candidates = this._rollRelicCandidates(false, this.relicPick) || [];
        }
        if (!this.relicPick.candidates.length) { require('../relics/battle-drops.js').emptyGold(this, this.relicPick.rarity); this.relicPick = null; this._chestBusy = false; return; }
        this.relicPickHits = [];
        this.relicPick.t = 0; // 三选一窗口弹出动画（缩放渐入）
        this.state = 'relicpick';
        this.toast(this.relicPick.opening ? '击杀·历练 · 开局三选一' : this.relicPick.rarity === 'ssr' ? '金色宝箱 · SSR三选一' : '圣物宝箱 · 三选一', '#f7c948');
        return;
      }
      // 即时三选一：每获得 1 次选择机会（塔升级/得塔）立即弹出，不再攒到波末统一结算
      if (this.run.effects.pendingTotal() > 0) {
        this.flushUpgrades();
        return;
      }
      // 主战斗加速：战斗逻辑时间按倍速推进（UI/特效动画保持真实帧速）
      const bdt = dt * this.runSpeed;
      this.dmgNumbers.step(dt); // 数字动画按实际时间推进，不随战斗倍速缩短。
      if(!this.run.bossLock)this.waveTime += bdt;
      BoardChests.tick(this, bdt);
      // 陆续投放本波敌人（非一次性同屏）
      this.wave.tick(bdt);
      this.stepEnemies(bdt);
      this.syncTargetedCannonFx();
      // 失败立即结算：城墙血量归零 → 直接进入失败界面（不再等当前波打完）
      if (this.run.broken) { this.waveEnd(); return; }
      // 波次结束：本波全部击杀 → 立即出下一波；或全部投放完成后 3s（场上残怪保留，叠加波继续打）
      //   （波时长不再固定；出怪节奏=0.5s/批，每批随机 1~⌈w/5⌉ 只）
      if(this.run.bossLock) {
        if(Bosses.defeated(this)) {
          if (this.run.bossEncounter && this.run.bossEncounter.final) this.run.finalVictory = true;
          Bosses.clearVictory(this);
          this._overlapWave=this.enemies.length>0;this.waveEnd();
        }
        return;
      }
      const allDead = !this.enemies.length && !this.wave.plan.length;
      const spawnedAll = !this.wave.plan.length && this.wave.planDoneAt !== null;
      if (allDead) {
        this._overlapWave = false;
        this.waveEnd();
      } else if (spawnedAll && this.waveTime - this.wave.planDoneAt >= 3) {
        this._overlapWave = this.enemies.length > 0;   // 叠加波：保留场上残怪，下一波继续出
        this.waveEnd();
      }
      return;
    }
    // 测试战场：能量恒满 + 倍速推进战斗（不结算波次/不弹三选一）
    if (this.state === 'testfield') {
      this.run.slotOrder.forEach((k) => {
        const t = this.run.effects.tower(k);
        if (t) t.energy = this.run.armoryEnergyMax(k);
      });
      this.dmgNumbers.step(dt);
      this.waveTime += dt;
      this.stepEnemies(dt * this.testSpeed);
      this.syncTargetedCannonFx();
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
        this.menuPanel = { type: 'chestOpen', mode: 'relic', reward: got };   // .9d 开箱弹窗：圣物卡收益一次弹出
      }
    }
  }

  /** 萝赛表现层驱动：只读运行态（phase/盾层/坐标），驱动破壳与召唤表现；不改血量/伤害/掉落 */
  tickBossFx(dt) {
    const fx = this.bossFx;
    if (!fx) return;
    const b = this.run.bossEnemy;
    if (!b || b.bossId !== 'altar_rosea' || b.hp <= 0 || !this.run.bossLock) {
      if (this._bossFxOn) { fx.reset(); this._bossFxOn = false; this._bossPhaseSeen = 0; this._summonSeen = 0; }
      return;
    }
    fx.sync({
      phase: b.phase, shieldLayers: b.shieldLayers || 0, x: b.x, y: b.y,
      size: require('../enemy-size.js')(b, CONFIG.LAYOUT.enemy), elapsed: (this.animClock || 0) / 1000,
    });
    fx.step(dt);
    this._bossFxOn = true;
    if (this._bossPhaseSeen === 1 && b.phase === 2) fx.triggerBurst();   // 藤壳炸裂 → 花瓣爆开
    this._bossPhaseSeen = b.phase;
    for(const child of this.enemies){
      if(child.isSummon && child.waveNo===20 && !child._roseaFxSeen){
        child._roseaFxSeen=true;
        fx.triggerSummon('left',{x:child.x,y:child.y,size:require('../enemy-size.js')(child,CONFIG.LAYOUT.enemy)});
      }
    }
  }

  /** 敌人移动 + 塔真实攻击（A1：每塔独立攻击/技能行为，见 combat.js）+ 攻城攻击 + 打击特效 */
  stepEnemies(dt) {
    EliteFx.step(this.run, this.enemies, dt);
    BattleShop.tick(this.run, dt, this.state === 'fighting' ? this.runSpeed : this.testSpeed);
    if(this.menuStage==='ancient' && this.state==='fighting' && this.run.wave>=40 && (this.meta.ancientBestWave||0)<40){this.meta.ancientBestWave=40;this.save.save();}
    Bosses.tick(this,dt);
    if (this.run.broken) return;
    this.tickBossFx(dt);
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
    // 攻城：到达城墙攻击范围的怪物按攻击力×攻击频率持续扣城墙血（抽出独立方法，无塔时同样执行）
    this.siegeEnemies(dt);
    // 死亡清场（combat.update 已结算死亡技能，此处统一移除尸体）
    // 全歼波数统计：先归集本帧死亡，再移除尸体
    const dying = this.enemies.filter((e) => e.hp <= 0);
    if (dying.length) this._tallyWaveDeaths(dying);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** 全歼波数：一波的怪「全部死亡且投放完毕」才算完全击败（通关数口径）。
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
        if (wn === 60 && ['ancient','lava','frost'].includes(this.menuStage) && this.state !== 'testfield' && !(this.run.bossEncounter && this.run.bossEncounter.final)) { this.meta.normalFieldCleared = true; this.save.save(); }
      }
    });
  }

  /** 攻城：到达城墙攻击范围的怪物按攻击力×攻击频率持续扣城墙血（冰冻/麻痹停止攻击；冰墙吸收/反伤/迟缓）
   *  修复：无塔（槽位未解锁）时怪物到城墙也应攻城掉血——此前被「无塔不战斗」提前 return 跳过，城墙完全不扣血 */
  siegeEnemies(dt) {
    const wallEdge = this.ly.wallY;
    let wallHits = 0, wallHitY = wallEdge - 10;
    for (const e of this.enemies) {
      // 以怪物脚底/精灵下沿到达行走区边界作为攻城线，避免大体型怪进入塔位区。
      const wallLine = wallEdge - Math.max(10, (e.size || 40) * 0.5);
      if (e.y < wallLine) continue;
      wallHitY = wallLine;
      if (e.frozen > 0 || e.paralyzed > 0 || e._bossStun > 0) continue;
      // 毒·瘴气：环内敌人命中率下降（20% 概率攻击落空，）
      if (e._miasma && Math.random() < 0.20) continue;
      // 冰墙攻击间隔迟缓计时（：被冰墙迟缓的敌人攻击间隔 +0.5s）
      if (e.atkSlowT > 0) { e.atkSlowT -= dt; if (e.atkSlowT <= 0) e.atkSlowAdd = 0; }
      // 冰雾3★：冰雾地面内敌人攻速 -20%（攻击间隔 ×1.25）
      const fogSlow = (e._fogTtl > 0) ? 0.25 : 0;
      const eAtkInt = ((e.attackInterval || 1) + (e.atkSlowAdd || 0)) * (1 + fogSlow);
      e.attackT = (e.attackT || 0) + dt;
      if (e.attackT >= eAtkInt) {
        e.attackT -= eAtkInt;
        // 毒·瘴气 C：瘴内中毒敌人攻击力降低（-20%/-35%/-50%，）；减伤护符：城墙受伤 -N%（按星级）
        const guard = this.run.relicNum('cm_guard');
        const atkDmg = e.attack * (e._miasmaAtkMult || 1) * (guard > 0 ? (1 - guard / 100) : 1);
        if (this.run.gsState && this.run.gsState.reflect > 0) this.combat.damage(e, atkDmg * GS_BALANCE.reflect.damageRatio, 'global');
        const iw = this.combat.iceWall;
        if (iw && iw.ttl > 0) {
          // 冰墙：先吸收伤害；溢出部分扣城墙；反伤攻击者；迟缓（减速40% + 攻击间隔 +0.5s·持续2s）
          const absorbed = Math.min(iw.absorb, atkDmg);
          iw.absorb -= absorbed;
          const leak = atkDmg - absorbed;
          // 测试战场：城墙无敌（不扣血，专注技能验证）
          // 城墙受击统一入口：减伤护符3★ 大额截断 + 生命回复3★ 护盾优先抵扣
          if (leak > 0 && this.state !== 'testfield') this.run.lineHp -= this.run.applyWallDamage(leak);
          if (iw.reflect > 0) this.combat.damage(e, absorbed * iw.reflect, 'ice', undefined, '冰墙');
          this.combat.applySlow(e, ICE_WALL_BALANCE.attackerSlow, ICE_WALL_BALANCE.attackerSlowDuration);
          e.atkSlowAdd = ICE_WALL_BALANCE.attackDelay; e.atkSlowT = ICE_WALL_BALANCE.attackerSlowDuration;
          // 冰墙受击视觉：冰晶飞溅
          this.combat.fxParticle(e.x, e.y, '#b8e6ff', 5, 40, 0.35, 90, 4);
        } else {
          // 城墙受击统一入口：减伤护符3★ 大额截断 + 生命回复3★ 护盾优先抵扣
          if (this.state !== 'testfield') this.run.lineHp -= this.run.applyWallDamage(atkDmg);
        }
        wallHits++;
        // 测试战场：城墙无敌，不触发破防
        if (this.state !== 'testfield' && this.run.lineHp <= 0) {
          this.run.lineHp = 0;
          this.run.broken = true;
        }
      }
    }
    if (wallHits) this.fx.push({ type: 'hitwall', x: 375, y: wallHitY, t: 0, dur: 0.3 });
  }

  enemyMoveSpeed(e) {
    if (e.frozen > 0 || e._vineT > 0 || e._bossStun > 0) return 0;
    let slowEff = e.slow && e.slow.ttl > 0 ? e.slow.mult : 1;
    if (this.run.relic3('cm_stasis') && e.isBoss) slowEff = 1 - (1 - slowEff) * 0.5;
    // 缓毒3★：中毒减速与冰缓/麻痹叠加时，总减速上限 +15%（移动再减 15%）
    if (this.run.relic3('poison_slow') && this.combat.hasDot(e, 'poison') && (e.slow || e.paralyzed > 0)) {
      slowEff = Math.min(slowEff, slowEff * 0.85);
    }
    // 时间停滞（局内圣遗物）：怪物移速降低 N%（按星级）
    const stasis = this.run.relicNum('cm_stasis');
    const stasisMul = stasis > 0 ? (1 - stasis / 100) : 1;
    // 霜风峡谷风场被动：移速 ×1.10^风场层数
    const windMul = this.run.windStacks ? Math.pow(1.10, this.run.windStacks) : 1;
    const statusMult = slowEff * stasisMul;
    return (e.speed || 0) * (e.isBoss ? Math.max(0.5,statusMult) : statusMult) * windMul * Bosses.moveScale(this);
  }

  predictEnemyPosition(e, seconds) {
    if (!e) return { x: 0, y: 0 };
    const wallEdge = this.ly.wallY;
    const lineY = wallEdge - Math.max(10, (e.size || 40) * 0.5);
    let y = e.y;
    if (!(e.frozen > 0 || e._vineT > 0 || e._bossStun > 0 || e.y >= lineY || (e.bossStandoffY != null && e.y >= e.bossStandoffY))) {
      y += this.enemyMoveSpeed(e) * Math.max(0, seconds || 0);
      y = Math.min(y, lineY);
      if (e.bossStandoffY != null) y = Math.min(y, e.bossStandoffY);
    }
    return { x: e.x, y };
  }

  syncTargetedCannonFx() {
    this.fx.forEach((f) => {
      if (!f.target) return;
      const canPredict = f.target.hp > 0 && this.enemies.includes(f.target);
      if (f.type === 'strikeAim') {
        f.x = f.target.x; f.y = f.target.y;
      } else if (f.type === 'strike') {
        const localT = f.t - (f.offset || 0);
        const remaining = Math.max(0, 1.9 - localT);
        const pos = canPredict ? this.predictEnemyPosition(f.target, remaining) : f.target;
        f.x = pos.x; f.y = pos.y;
      } else if (f.type === 'strikeShell' && f.t - (f.offset || 0) >= 1.4) {
        const localT = f.t - (f.offset || 0);
        const remaining = Math.max(0, 1.9 - localT);
        const pos = canPredict ? this.predictEnemyPosition(f.target, remaining) : f.target;
        f.tx = pos.x; f.ty = pos.y;
      } else if (f.kind === 'mortar') {
        const remaining = Math.max(0, f.dur - f.t);
        const pos = canPredict ? this.predictEnemyPosition(f.target, remaining) : f.target;
        f.tx = pos.x; f.ty = pos.y;
      }
    });
  }

  /** 敌人移动：冰冻停止移动；减速乘系数；到达城墙攻击范围后停止前进（转入攻城）
   *  时间停滞3★：Boss 对减速效果只生效 50%（减速幅度折半，普通怪全吃） */
  moveEnemy(e, dt) {
    if (e.frozen > 0 || e._vineT > 0 || e._bossStun > 0) return;
    const wallEdge = this.ly.wallY;
    const lineY = wallEdge - Math.max(10, (e.size || 40) * 0.5); // 精灵下沿到达行走区边界时开始攻城
    if (e.y >= lineY || (e.bossStandoffY != null && e.y >= e.bossStandoffY)) return;
    e.y += this.enemyMoveSpeed(e) * dt;
    if (e.bossStandoffY != null) e.y = Math.min(e.y, e.bossStandoffY);
  }

  playSfx(kind, minGap) {
    // 模块化 ：转发到 SfxManager（防抖 + stop/play）
    this.sfx.play(kind, minGap);
  }

  /** 消除震动：真机 vibrateShort（级别≥2 重震）+ 棋盘画布抖动（IDE 无震动能力时仅抖动） */
  vibrate(level) {
    if (typeof wx !== 'undefined' && wx.vibrateShort) {
      try { wx.vibrateShort({ type: level >= 2 ? 'heavy' : 'medium' }); } catch (e) {}
    }
    this._shake = { t: Date.now(), dur: 0.18, amp: level >= 2 ? 6 : 3.5 };   // 重震振幅加大
  }

  waveEnd() {
    if (this.run.finalVictory && this.runSummary && this.runSummary.victory) return;
    this.shopOpen = false;
    // 波末银币完成度回填：本波已出场怪中已死亡的比例（叠加波按 waveNo 只算本波）
    //   此前银币纯按波数发放，完全不消块/不出弹也拿满额，导致「挂机第一波 107 金币」。
    const _wn = this.run.wave || 1;
    const _aliveN = (this._waveAlive && this._waveAlive[_wn]) || 0;
    const _totalN = (this._waveTotal && this._waveTotal[_wn]) || 0;
    this.run._waveGoldRatio = (_totalN > 0) ? Math.max(0, Math.min(1, 1 - _aliveN / _totalN)) : 1;
    // 真实战斗路径：城墙血已由「怪物攻城」实时扣减，跳过抽象漏怪模型扣血（skipLeak=true）
    const res = this.run.endWave(true);
    // 波末全塔少量经验（打怪为主渠道，波末是补充；统一入整体池）
    const owned = this.run.slotOrder.length;
    if (owned > 0) this.run.gainExp(CONFIG.EXP.waveBonus * owned);
    // 波末银币只入「局内银币」（run.endWave 已累加 _waveGold），不再发放局外金币；
    //   招财符加成移至战斗结束统一结算（finishRun）
    this.save.save();
    if (this.run.finalVictory && this.run.lineHp > 0) {
      const EV = CONFIG.EVAC;
      this.depthPool += res.waveGold * EV.poolShare * this.depthMult * (this.firstBonus || 1) * (this.field.goldMult || 1);
      this.meta.normalFieldCleared = true;
      this.run.broken = false;
      this.enemies = []; this.wave.plan = [];
      this.finishRun(true);
      this.runSummary.victory = true;
      return;
    }
    if (res.broken) {
      this.finishRun(false);   // 破防 → 局末结算（深度收益保底 30%）
      return;
    }
    // 深度收益池：每波银币的一半入池 × 深度倍率；撤离拿池 100%，阵亡保底 30%
    const EV = CONFIG.EVAC;
    this.depthPool += res.waveGold * EV.poolShare * this.depthMult * (this.firstBonus || 1) * (this.field.goldMult || 1);
    // 战场被动触发提示（下一波生效）
    const Fp = this.field || {};
    if (Fp.windEvery && this.run.wave % Fp.windEvery === 0) {
      this.toast(`🌪 霜风峡谷：风场增速！怪物移速 +10%（第 ${this.run.wave} 波起）`, '#7cd6ff');
    }
    if (Fp.curseEvery && this.run.wave % Fp.curseEvery === 0) {
      this.toast(`☠ 深渊诅咒！怪物血量 +15%（第 ${this.run.wave} 波起）`, '#c9a0ff');
    }
    // 撤离检查点改「全歼口径」：此前按到达波次（run.wave % 10 === 0）判定，超时叠加波
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
        // 撤离决策层只允许两个选项（正常撤离/继续前进）：清掉所有可能叠加的弹层，
        // 否则波中途打开的设置弹层（含「重新开始」按钮）会盖在决策层上造成歧义
        this.funcLayer = null;
        this.funcLayerHits = {};
        this.dmgStat = null;
        this.dmgStatHits = {};
        this.shopOpen = false;
        this.relicDetail = null;
        this.towerInfo = null;
        this.towerSkill = null;
        this.state = 'evacuation';
        this.evacHits = {};
        return;
      }
    }
    // 波间不弹确认窗：直接结算进入下一波（有升级待选先弹三选一），并弹 2s 透明提示
    this.waveClearNext();
  }

  /** 局末结算：撤离/破防统一入口。深度收益按比例发放 + 里程碑首达 + 深度宝箱 */
  finishRun(evacuated) { return RunSettlement.finishRun.call(this, evacuated); }

  /**
   * 局内碎片统一入账（撤离/失守/中途退出共用）
   * 局内只记账（runShardDetail），此处按比例折算后批量写入 meta.shards，并清空本局账本。
   * 折算规则：保留张数 K = floor(总张数 × ratio)；K 张从明细池按「张」等概率随机抽取后重新计数
   *   （a×4 + b×3 + c×2 = 9 张、ratio=0.3 → K=2，可能保留 a+a / a+b / b+c 等任意组合）
   * @param {number} ratio 1 = 全额（撤离）；0.3 = 失守 / 中途退出
   * @returns {{finalDetail: Object, raw: number, kept: number, lost: number}}
   */
  /** 结算大卡数据：本局圣遗物 → [{id, rarity, star, shards}]，按 稀有度(ssr>sr>r) → 碎片数 降序；名字由渲染层按 id 取 */
  _buildRelicCards(detail) { return RunSettlement._buildRelicCards.call(this, detail); }

  settleRunShards(ratio) { return RunSettlement.settleRunShards.call(this, ratio); }

  /** 波清结算：先三选一（升级待选），无待选直接自动进入下一波；不弹确认窗 */
  waveClearNext() {
    this._postPick = 'waveclear';
    if (this.flushUpgrades()) return;
    this._postPick = null;
    this.startNextWave();
  }

  /** 自动进入下一波 + 2s 透明提示；每 5 波弹 4s Boss 闪烁警告（均不暂停进度） */
  startNextWave() {
    if (this.run.finalVictory) return;
    this.state = 'fighting';
    // 叠加波（40s 超时残留怪）：保留场上剩余敌人，新一波继续投放
    const keep = !!this._overlapWave;
    this._overlapWave = false;
    this.wave.start(keep); // run.wave += 1
    // 20 波专属 Boss 贴图预热：进波即开始加载，避免 Boss 出场首秒回退旧 boss.png
    if (this.renderer && this.renderer.preloadBoss) {
      if (this.run.wave === 20) this.renderer.preloadBoss('altar_rosea');
      if (this.run.wave === 40) this.renderer.preloadBoss('altar_galvin');
      if (this.run.wave === 60) this.renderer.preloadBoss('altar_vera');
    }
    const w = this.run.wave || 1; // 兜底：极端情况下 wave 未递增时避免显示 undefined
    this.waveHint = { text: `第 ${w} 波`, until: Date.now() + 2000 };
    this.bossHint = (w % 5 === 0) ? { until: Date.now() + 4000 } : null;
  }

  /** 塔升级三选一：把全部待升级（pending）生成跨塔候选队列并进入 picking；无待升级返回 false */
  flushUpgrades() {
    this.shopOpen = false;
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
      this.startNextWave(); // 三选一完成 → 自动进入下一波（不再回确认窗）
      return;
    }
    this.state = 'fighting';
    this.toast('升级完成', '#7ef0a3');
  }

  restart() {
    // 碎片局末入账：重开前先按失守比例结算，避免局内碎片凭空丢失
    this.settleRunShardsOnExit('重新开局');
    // 修复：旧实现只清棋盘/塔位/技能，未重置 run.wave 与深度收益池——
    // 第 10 波（或任意波）重开后 wave.start() 使波数 +1，出现"塔清空却从 11 波继续"且深度池带旧账。
    // 改为复用 newRun(true)：全新 Run（波数/深度池/倍率/经验/敌人/战斗实体全部归零），波 1 重来。
    const fb = this.firstBonus;   // 重开不计入每日首战加成次数
    this.newRun(true);
    this.firstBonus = fb;
    this.toast('重新开局 · 第 1 波', '#7ef0a3');
  }

  /** 中途退出/重开时的碎片兜底：有账才结算，按失守比例折算并提示 */
  settleRunShardsOnExit(reason) { return RunSettlement.settleRunShardsOnExit.call(this, reason); }

  /** 局内商店购买：扣局内银币并施加临时强化或即时药剂效果。 */
  buyStoreItem(idx) {
    const item = CONFIG.STORE.items[idx];
    if (!item) return false;
    const res = BattleShop.buy(this.run, item.id);
    if (!res.ok) {
      this.toast(({ limit: '本局已售罄', cooldown: '购买冷却中', gold: '银币不足', full: '城墙生命已满', energy: '塔能量已满' })[res.reason] || '暂不可购买', '#ffb480');
      return false;
    }
    this.toast(item.name + ' · ' + item.desc, item.color);
    return true;
  }

  rerollUpgradePick() {
    const group = this.pickQueue[this.pickIndex];
    if (this.state !== 'picking' || !group) return false;
    const res = PickReroll.reroll(this.run, () => this.run.effects.rerollUpgradeCandidates(this.run.slotOrder));
    if (!res.ok) { this.toast(res.reason === 'gold' ? '银币不足（需' + res.cost + '）' : '暂无可用候选', '#ffb480'); return false; }
    group.candidates = res.result.candidates; group.target = res.result.target;
    delete group._pickT0; this.pickHits = {};
    return true;
  }

  /** 返回主界面（战斗结束/设置入口）：金币已由 finishRun 结算，局内银币不镜像（币种分离） */
  goMenu() {
    Bosses.clearTemporary(this);
    this.anim = null;
    this.combat.reset();
    // 碎片局末入账：战斗中直接返回主界面时先按失守比例兜底结算（结算后 runShardDetail 已清空 → 再调无副作用）
    this.settleRunShardsOnExit('中途退出');
    this.state = 'menu';
    this.menuTab = 'battle';
    this.menuPanel = null;
    this.enemies = [];
    this.towerInfo = null;
    this.funcLayer = null;
    this.dmgStat = null;
    this.pickQueue = [];
    this.pickIndex = 0;
    this._postPick = null;
    this.pendingRelicPicks = [];
    this.relicPick = null;
    this.relicDetail = null; // 圣遗物详情弹层清理
    this.testPanel = null;   // 测试战场配置面板清理
    this.testSpeed = 1;
    this.run.effects.setActiveKeys(null); // 离开测试战场恢复全部塔生效
    this.run._testStar3Mode = false;      // 退出测试战场清空 3★ 测试注入
    this.run._testStar3 = null;
    this.sfx.stopBgm();
    this.save.save();
  }

  /** 测试战场：添加圣遗物 → 弹圣物三选一（可反复添加，测试任意圣遗物效果）；支持 star3 模式 */
  testAddRelic(star) { return TestOperations.testAddRelic.call(this, star); }

  /* ---------- 击杀奖励：经验（圣物加成，入整体池）/ 精英圣物掉落 / Boss 宝箱 ---------- */
  onKillReward(e) { return RelicAcquisition.onKillReward.call(this, e); }

  /** 局内圣遗物总数（图鉴分页用）；计入红色战场专属 */
  _relicRunTotal() { return RelicAcquisition._relicRunTotal.call(this); }

  /** 战场宝箱点击 → 生成圣物三选一；候选池改为局内圣遗物（在场塔的塔池 + 通用池）；
   *   过滤已解锁 + 稀有度权重三选一（蓝50/紫38/金12，按设计文档 2.2） */
  spawnRelicPick(mode, options) { return RelicAcquisition.spawnRelicPick.call(this, mode, options); }

  /** 抽 3 个候选；开局奖励覆盖全部塔系，普通宝箱只取在场塔系，品质均按配置抽取。 */
  _rollRelicCandidates(star3Mode, options) { return RelicAcquisition._rollRelicCandidates.call(this, star3Mode, options); }

  /** 三选一重掷：局内银币付费（200/400/800/1600 指数增长，每窗口上限 4 次），重新抽 3 个候选 */
  rerollRelicPick() { return RelicAcquisition.rerollRelicPick.call(this); }

  /* ---------- 三消联动：圣物经验加成补差 + 塔额外攻击（多消不同特效） ---------- */
  onMatchBonus(ret) {
    if (!ret || !ret.settled) return;
    const b = this.meta.relicBonus();
    let ammoSum = 0, shuSum = 0, refSum = 0, towerHit = '';
    // 三消飞光：消除色块汇聚成光点飞向对应塔位/全局技能按钮（3消白 / 4消蓝 / 5消+金）
    this._matchBeams(ret);
    ret.settled.forEach((s) => {
      // 圣物·经验珠：三消经验补差（基础经验已由 applyMatch 进整体池；补差也入整体池 ）
      if (b.exp > 0 && s.tower) {
        const t = this.run.effects.tower(s.tower);
        if (t && t.level > 0) this.run.gainExp(Math.max(1, Math.round(s.exp * 0.20 * b.exp)));
      }
      // 弹药/全局技能充能入账提示（汇总一次性 toast）
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
    // ：三消经验升级同样只积累待选，不战斗内弹三选一（波末统一结算）
  }

  /** 三消飞光：每步消除按颜色汇聚格子中心，光点飞向对应塔位/全局技能按钮（3消白/4消蓝/5消+金） */
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
          // .38b 终点 = 塔图标中心：正式战斗图标 iy 较槽中心上移 2px（slotY + (100-98)/2 - 2 + 49），测试战场大槽图标即槽中心
          ex = mz.x; ey = mz.y - (this.state === 'testfield' ? 0 : 2);
        } else {
          // 全局技能色：洗牌左按钮 / 补给右按钮（渲染 globalBtns 同口径：btnW 102、btnH 75、btnY = towerRowY+12）
          const skill = this.run._globalSkillOf ? this.run._globalSkillOf(m.color) : null;
          const isShuffle = skill === 'shuffle';
          ex = isShuffle ? (8 + 51) : (750 - 8 - 102 + 51);
          ey = towerRowY + 12 + 75 / 2;
        }
        this.fx.push({ type: 'beamp', x0: cx, y0: cy, x1: ex, y1: ey, color: glow, blockColor: m.color, t: 0, dur: MATCH_GLOW.duration });   // 星芒：下落0.3s、停留0.05s、上升0.65s
      });
    });
  }

  /* ---------- 渲染 ---------- */
  render() {
    this.renderer.beginImages(this.state === 'menu' ? 'menu:' + this.menuTab : 'battle:' + this.menuStage);
    const s = (this.scale > 0 && isFinite(this.scale)) ? this.scale : 1;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = '#0d1117';
    // 背景铺满整个屏幕（逻辑坐标换算），模拟器/真机比例 ≠ 750:1334 时剩余区也填充，不留黑边
    ctx.fillRect(0, 0, Math.ceil(_c.canvas.width / s), Math.ceil(_c.canvas.height / s));
    if (this.state === 'menu') {
      this.menuHits = this.renderer.menuLayer(ctx, this.menuState(), this.menuHits);
      require('./tutorial.js').draw(ctx,this);
      if (this.testProfile) this.renderer.toast(ctx, this.toasts);
      return;
    }
    // 测试战场：独立渲染层（状态条 + 战场 + 塔槽 + 控制条 + 技能面板）；测试战场弹圣遗物三选一时底层保持测试战场
    if (this.state === 'testfield' || (this.state === 'relicpick' && this._relicReturnState === 'testfield')) {
      this.renderer.animNow = this.animClock;   // 敌人帧动画时钟注入（relicpick 冻结）
      const testFeedback = require('./fx/global-feedback.js');
      const testShake = testFeedback.shake(this);
      ctx.save(); ctx.translate(testShake.x, testShake.y);
      this.testHits = this.renderer.testFieldLayer(ctx, this.testState(), this.testHits, this.enemies, this.fx, this.combat, this.dmgNumbers);
      EliteFx.drawDeaths(ctx, this.run);
      testFeedback.draw(ctx, this);
      ctx.restore();
      if (this.testProfile) this.renderer.toast(ctx, this.toasts);
      if (this.relicDetail) {   // 测试战场圣遗物详情弹层
        this.renderer.relicDetailLayer(ctx, this.battleRelics, this.relicDetail.page || 0, this.relicDetailHits);
      }
      if (this.state === 'relicpick') {
        // 修复：漏传动画时间导致测试战场三选一窗口 alpha=0 不可见、状态卡死——与普通战斗一致传 elapsed
        if (!this.relicPick.t) this.relicPick.t = Date.now();
        this.renderer.relicPickLayer(ctx, { ...this.relicPick, rerollCost: PickReroll.cost(this.run, 'relic'), towerTop: this.ly.wallY + 11, towerBottom: this.ly.wallY + 111 }, this.relicPickHits, Date.now() - this.relicPick.t, this.run.gold);
      }
      if (this.towerSkill) this.renderer.towerSkillLayer(ctx, this.towerSkill, this.towerSkillHits);
      else if (this.towerInfo) this.renderer.towerInfoLayer(ctx, this.towerInfo, this.towerInfoHits);
      return;
    }
    const st = this.sceneState();
    const GlobalFeedback = require('./fx/global-feedback.js');
    const castShake = GlobalFeedback.shake(this);
    ctx.save();
    ctx.translate(castShake.x, castShake.y);
    this.renderer.status(ctx, st);
    this.renderer.actionArea(ctx, st);
    // 底部功能键命中区由渲染器生成（renderer.funcHits），同步到 game 供触摸判定
    this.funcHits = this.renderer.funcHits || [];
    // 地面持续效果（毒池毒液池/毒棒召唤物）画在敌人下层
    this.renderer.groundFx(ctx, this.combat);
    // 火柱地面火环（pillarBase）：与地面持续效果同级，压在怪物脚下
    this.renderer.fxGround(ctx, this.fx);
    const veraView = { encounter: this.run.bossEncounter, boss: this.run.bossEnemy,
      enemies: this.enemies, layout: this.ly, lock: this.run.bossLock };
    VeraFx.drawGround(ctx, veraView);
    this.renderer.animNow = this.animClock;   // 敌人帧动画时钟注入（暂停状态冻结）
    this.renderer.enemies(ctx, this.enemies, this.run.bossEncounter && this.run.bossEncounter.splitVisual);
    // 萝赛技能表现层（画在 Boss 本体帧之后、通用特效之前）
    if (this.bossFx) this.bossFx.drawTo(ctx);
    VeraFx.drawBody(ctx, veraView);
    EliteFx.drawDeaths(ctx, this.run);
    if (this.run.bossEncounter && this.run.bossEncounter.id === 'altar_galvin') {
      GalvinFx.draw(ctx, { ...veraView, towers: [...new Set(this.run.slotOrder)].map(key =>
        ({ key, ...this.combat.towerMuzzle(key) })) });
    }
    this.renderer.fx(ctx, this.fx);
    this.renderer.damageNumbers(ctx, this.dmgNumbers);
    // 战场宝箱（怪物掉落，点击开启圣物三选一）
    this.renderer.fieldChests(ctx, this.fieldChests);
    // 局内商店面板：从 actionArea 内移到敌人/特效层之后绘制（否则怪物贴图浮在商店面板上方）；
    // 在 toast 之前画（商店遮罩不盖 toast），仍先于三选一/塔详情/功能弹层，保持"弹层盖商店"的既有层级
    GlobalFeedback.draw(ctx, this);
    ctx.restore();
    this.renderer.battleShop(ctx, st);
    if (this.testProfile) this.renderer.toast(ctx, this.toasts);
    if (this.state === 'picking') {
      const group = this.pickQueue[this.pickIndex];
      const pending = this.remainingPending(group.tower);
      this.renderer.pickLayer(ctx, group, pending, this.pickHits, { gold: this.run.gold, cost: PickReroll.cost(this.run), towerTop: this.ly.slotY, towerBottom: this.ly.slotY + this.ly.slotSize });
    }
    if (this.state === 'relicpick') {
      if (!this.relicPick.t) this.relicPick.t = Date.now(); // 弹出动画首帧
      this.renderer.relicPickLayer(ctx, { ...this.relicPick, rerollCost: PickReroll.cost(this.run, 'relic'), towerTop: this.ly.slotY, towerBottom: this.ly.slotY + this.ly.slotSize }, this.relicPickHits, Date.now() - this.relicPick.t, this.run.gold);
    }
    // 本局圣遗物详情弹层（战斗暂停）
    if (this.relicDetail) {
      this.renderer.relicDetailLayer(ctx, this.battleRelics, this.relicDetail.page || 0, this.relicDetailHits);
    }
    if (this.state === 'gameover') this.renderer.gameOver(ctx, Object.assign({ summary: this.runSummary, lootScroll: this._lootScroll || 0, goT: this.gameoverSkip ? 99999 : (this.gameoverAt ? Date.now() - this.gameoverAt : 0) }, st), this.restartBtn);
    // 撤离决策层（战斗暂停）
    if (this.state === 'evacuation') {
      this.evacHits = {};
      this.renderer.evacuationLayer(ctx, this, this.evacHits);
    }
    // 波间透明提示（不暂停进度）：进入下一波 2s / Boss 警告 4s 闪烁
    this.renderer.battleHints(ctx, this.waveHint, this.bossHint);
    // 塔详情弹层（任意状态下可查看）；技能二级详情优先于塔详情绘制在其上
    if (this.towerSkill) this.renderer.towerSkillLayer(ctx, this.towerSkill, this.towerSkillHits);
    else if (this.towerInfo) this.renderer.towerInfoLayer(ctx, this.towerInfo, this.towerInfoHits);
    // 底部功能弹层（商店/设置/图鉴/帮助）
    if (this.funcLayer) this.renderer.funcLayer(ctx, this.funcLayer, st, this.funcLayerHits);
    // 伤害统计弹层
    if (this.dmgStat) this.renderer.dmgStatLayer(ctx, this, this.dmgStatHits);
    require('./screens/ad-prompts.js').draw(ctx, this);
    require('./tutorial.js').draw(ctx,this);
  }

  /** 组装技能二级详情：技能效果 + 三分支完整文案 + 当前等级 */
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
      branchDesc: Object.fromEntries(['A', 'B', 'C'].map(br => [br, require('../branch-description.js').current(skDef, br, 0)])),
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
      // ：详情仅展示经三选一获取/升级的技能（picked）；默认 3 技能不算"获取"，无 picked 时为空
      const skills = t.pool.filter((ef) => t.picked.has(ef.name)).map((ef) => {
        const p = (CONFIG.EFFECT_POOLS[key] || []).find((q) => q.name === ef.name) || {};
        return {
          name: ef.name, level: ef.level, desc: p.desc || '',
          branches: { A: ef.branches.A || 0, B: ef.branches.B || 0, C: ef.branches.C || 0 }, // 分支等级（实装状态）
        };
      });
      slots.push({
        key,
        name: CONFIG.COLORS[t.color].name,
        icon: TOWER_ICON[key] || '?',
        unlocked: true,
        activationHidden: TowerActivation.hidden(t),
        level: t.level,          // 塔详情等级 = 塔自身等级（选择次数+1），不再显示整体总等级
        exp: run.exp,
        expNeed: run.expNeed(),
        expRatio: Math.min(1, run.exp / run.expNeed()),   // 修复：0 级也显示进度（原 expLevel>0 条件导致首波三消经验条恒 0）
        range: this.combat.range(key),
        baseRange: Math.max(60, CONFIG.TOWERS[key].range - 50),
        energyAttack: EnergyState.evaluate(t.energy, this.run.armoryEnergyMax(key)).attack,
        energyInterval: EnergyState.evaluate(t.energy, this.run.armoryEnergyMax(key)).interval,
        energyColor: EnergyState.evaluate(t.energy, this.run.armoryEnergyMax(key)).color,
        atk: t.level > 0 ? Math.round(this.combat.shotDmg(key)) : 0,   // 单次攻击伤害（塔详情）
        interval: t.level > 0 ? this.combat.interval(key) : 0,         // 实际攻击间隔（含技能修正）
        ammo: t.energy, ammoMax: this.run.armoryEnergyMax(key),          // 能量（塔位条显示；军火库 +50）
        skills,
      });
    }
    const enemyHp = this.enemies.reduce((sum, e) => sum + Math.max(0, e.hp), 0);
    return {
      miniBoss: run.bossEnemy && run.bossEnemy.hp>0 ? run.bossEnemy : null,
      bossEncounter: run.bossEncounter || null,
      gold: run.gold,
      wave: run.wave,
      waveTime: this.waveTime,
      waveDuration: (this.wave && this.wave.waveDur) || WAVE_DUR,
      state: this.state,
      stage: this.menuStage,   // 战斗态也需要战场标识（行动区主题背景切换）
      anim: this.anim,
      waveClear: this.waveClear,
      lineHp: run.lineHp, lineMaxHp: run.lineMaxHp || CONFIG.LINE.hp,
      grid: run.board.grid,
      selected: this.selected || this.pickCell, // 滑动高亮 / 点击选中高亮
      boardHint: this.boardHint || null,
      boardChestHoles: this.fieldChests.filter(c => !c.hidden && ['ready', 'open', 'fly'].includes(c.stage)).map(c => c.r + ',' + c.c),
      towers: slots,
      synergies: eff.synergyStatus(),
      synDoneCount: eff.synergyDone.filter(Boolean).length,
      enemyCount: this.enemies.length + this.wave.plan.length,
      hasBoss: this.wave.hasBoss,
      enemyHpRatio: this.wave.enemyTotalHp > 0 ? enemyHp / this.wave.enemyTotalHp : 0,
      exp: run.exp, expNeed: run.expNeed(), expLevel: run.expLevel,   // ：出怪区整体经验条
      expRatio: Math.min(1, run.exp / run.expNeed()),   // 修复：0 级也显示进度（出怪区整体经验条）
      battleRelics: this.battleRelics || [],   // ：本局获得的圣物（经验条下方图标展示）
      globalSlots: run.globalSlots, globalShield: (run.gsState && run.gsState.shield) || 0,
      shuffleAmmo: run.shuffleAmmo, refillAmmo: run.refillAmmo,  // 全局技能累计弹药（发）
      chargePerUse: CONFIG.GLOBAL_SKILL.chargePerUse,
      runSpeed: this.runSpeed,   // 主战斗倍速（底部功能栏右下角按钮显示）
      shopOpen: this.shopOpen,   // 局内商店开关（此前缺失导致商店面板永不渲染 → 点击无效果）
      storeTimers: run.storeTimers,
      storeCooldowns: run.storeCooldowns,
      store: run.store,          // 局内商店已购层数
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
    if(this.menuStage==='test'&&!this.testProfile)this.menuStage='ancient';
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
      stage: this.menuStage==='test'&&!this.testProfile?'ancient':this.menuStage,           // 主界面所选战场：ancient | test
      codexSel: this.codexSel,         // 塔图鉴选中塔
      towerCodex: this.meta.towerCodex, // 已学习塔 { key: 1 }
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
      matchSkills: this.meta.matchSkills,   // 三消技能配置（主页配置行展示 / 面板修改）
      globalSkills: this.meta.globalSkills, // 全局技能槽（预留）
      skillUnlocks: this.meta.skillUnlocks,   // 技能解锁状态（商店购买）
      shopLeft: Object.keys(CONFIG.SHOP_CHEST).reduce((acc, k) => { acc[k] = this.meta.shopChestLeft(k); return acc; }, {}), // 圣物宝箱每日限购剩余（蓝/紫/金 3 档）
      mailRailDragging: require('./input/mail-rail.js').held(this),
      mailPressed: require('./input/mail-buttons.js').pressed(this),
      mails: require('../economy/mail.js').list(this.meta),
      adDaily: require('../economy/ad-rewards.js').daily(this.meta),
      shopScroll: this.shopScroll || 0,
      relicScroll: this.relicScroll || 0,   // 圣遗物页滚动位置
      relicDexPage: this.relicDexPage,   // 圣物图鉴分页（主页与图鉴面板共用）
      /* 激励系统状态 */
      field: CONFIG.FIELDS[this.menuStage] || CONFIG.FIELDS.ancient,
      deepChests: this.meta.deepChests.map((ch) => {
        const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
        return { tier: ch.tier, name: tier.name, ready: this.meta.chestReady(ch), remainMin: Math.max(0, Math.ceil((ch.openAt - Date.now()) / 60000)) };
      }),
      talentView: require('../talents/view.js').ensure(this),
      talent: require('../talents/model.js').analyze(this.meta),
      talentMeta: {relicStars:this.meta.relicStars,runCodex:this.meta.runCodex,talents:this.meta.talents},
      talentCandidates: require('../talents/model.js').candidates(this.meta),
      talentCenterCandidates: require('./input/talent-actions.js').centerCandidates(this.meta),
      talentCenterId: (require('./input/talent-actions.js').center(this.meta)||{}).id,
      talentCenterName: (require('./input/talent-actions.js').center(this.meta)||{}).name,
      relicStars: this.meta.relicStars,
      runCodex: this.meta.runCodex,   // 局内圣遗物图鉴解锁（图鉴页占位判定）
      relicDust: this.meta.relicDust,
      shards: this.meta.shards,
      bestWave: this.meta.bestWave, ancientBestWave: this.meta.ancientBestWave || 0, normalFieldCleared: !!this.meta.normalFieldCleared,
      gameVersion: GAME_VERSION,
      deviceInfo: this.menuPanel && this.menuPanel.type === 'accountInfo' ? AccountMenu.deviceInfo() : null,
      testProfile: !!this.testProfile,
      musicOn: this.meta.musicOn !== false,
      debug: !!CONFIG.DEBUG_ACCOUNT,
    };
  }

  /** 测试战场触摸分发（）：面板打开时仅响应面板项，否则控制条/塔槽/返回/倍速 */
  onTestFieldTap(p) { return TestOperations.onTestFieldTap.call(this, p); }

  /** 主界面触摸分发：命中 menuHits（渲染时重建）中第一个按键；面板打开时仅响应面板项 */
  onMenuTap(p) {
    return MenuActions.onMenuTap(this, p);
  }

  /** 调试工具动作（仅 DEBUG 构建可见入口） */
  handleDebugTap(key) { return TestOperations.handleDebugTap.call(this, key); }

  /** 圣物宝箱三选一：选择一项 → 获取圣物，回战斗；队列清空后检查升级待选
   *  战场宝箱候选为局内圣遗物（run:true）：本局生效 + 图鉴解锁；非 run 走养成圣物 */
  relicPickChoice(i) { return RelicAcquisition.relicPickChoice.call(this, i); }

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
  /** 触摸状态分发（模块化 ：从 bindTouch 抽出，返回 true=已消费该触摸） */
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
