// Workflow methods run on the current GameMain host; no game state is cached here.
const CONFIG = require('../../config.js');
const { Run } = require('../../run.js');
const DamageNumbers = require('../fx/damage-numbers.js');
const WAVE_DUR = CONFIG.WAVE.seconds;
const TOWER_ICON = { fire: '🔥', ice: '❄', poison: '☠', electric: '⚡', boomerang: '🌀', cannon: '💣' };

module.exports = {
  enterTestField() {
    this.dmgNumbers = DamageNumbers.create();
    this.anim = null;
    this.fieldChests = [];
    this._boardChestId = 0;
    this._chestBusy = false;
    // 全新对局构筑：塔等级/技能/棋盘重置（金币保留在 meta），默认出战火塔（可随时更换）
    this.run = new Run({ field: this.menuStage, difficulty: CONFIG.DIFFICULTY.default, matchSkills: this.meta.matchSkills, globalSkills: this.meta.globalSkills });  // 三消技能配置槽
    this.ly.slotCount = this.run.towerSlots;
    this.renderer.ly.slotCount = this.run.towerSlots;
    this.run.metaRef = this.meta;
    require('../../talents/testing.js').initializeBattle(this.run,this.meta);   // 测试战场圣遗物按图鉴星级显示（relicFx 星级来源）
    this.run.fxTarget = this.fx;    // 圣遗物生效触发飘字承接
    this.run.combatRef = this.combat;   // 连消技：连锁攻击子弹 / 连锁技能周期技
    this.run.boardX = this.renderer.ly.boardX; this.run.boardCell = this.renderer.ly.cell;
    this.run.boardY = this.renderer.ly.boardY;  // combo 弹字 / 连锁子弹落点
    this.save.apply(this.saveData);
    this.run.resetRunBuild();
    // 测试战场默认注入全部局内圣遗物，并以 3★ 状态运行；只写入本局 Run，不修改账号存档。
    const testRelics = [];
    Object.values(CONFIG.RELIC_RUN.tower).forEach((list) => testRelics.push(...list));
    testRelics.push(...CONFIG.RELIC_RUN.common, ...(CONFIG.RELIC_RUN.ur || []).filter(d=>!d.talent));
    this.run._testStar3Mode = true;
    this.run._testStar3 = {};
    this.runRelics = testRelics.map((d) => d.id);
    this.battleRelics = testRelics.map((d) => {
      this.run.runRelic[d.id] = 1;
      this.run._testStar3[d.id] = true;
      return { id: d.id, icon: d.icon, name: d.name, desc: d.desc, star3: true };
    });
    this.waveTime = 0;
    this.enemies = [];
    this.pickQueue = [];
    this.pickIndex = 0;
    this.pickCell = null;
    this.combat.reset();
    this.runShardDetail = {};    // 测试战场重置碎片明细
    this.runShardGained = 0;     // 同步重置掉落总数（测试战场不参与结算，避免残留计数）
    // 单塔出战：默认火塔（由 6 塔同场改为 1 塔，可经塔位切换钮更换）
    this.run.slotOrder = ['fire'];
    this.run.slotOrder.forEach((k) => { const t = this.run.effects.tower(k); if (t) t.unlock(); });
    // 单塔生效：测试战场只有出战塔参与战斗/协同，切塔即旧塔取消生效
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
  },

  switchTestTower(key) {
    const t = this.run.effects.tower(key);
    if (!t) return;
    t.unlock();
    this.run.slotOrder = [key];
    this.run.effects.setActiveKeys([key]);
    this.testPanel = { key }; // 切塔后直接打开该塔技能面板
    this.combat.reset();
    this.toast(`出战塔：${CONFIG.COLORS[CONFIG.TOWERS[key].color].name}`, '#7cd6a6');
  },

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
        level: t.level, energy: t.energy, energyMax: this.run.armoryEnergyMax(key), // 塔位徽章显示塔自身等级（选择次数+1）；能量口径
        skills,
      });
    });
    // 6 塔切换简表（）
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
      talentGold: (run.talentState&&run.talentState.gold||[]).length,
      talentReady: Object.values(run.talentState&&run.talentState.ready||{}).filter(Boolean).length,
      speed: this.testSpeed,
      panel: this.testPanel,
      synergies: run.effects.synergyStatus(),
      battleRelics: this.battleRelics || [],   // 测试战场圣遗物行
    };
  },

  testSkillAction(key, name, br) {
    const t = this.run.effects.tower(key);
    if (!t) return;
    const ef = t.pool.find((e) => e.name === name);
    if (!ef) return;
    if (br === 'clear') {
      ef.branches.A = 0; ef.branches.B = 0; ef.branches.C = 0;
      ef.act = false; // 清除同时取消激活标记
      const i = t.activeNames.indexOf(name);
      if (i >= 0) t.activeNames.splice(i, 1);
      t.picked.delete(name);
    } else if (['A', 'B', 'C'].includes(br)) {
      ef.branches[br] = (ef.branches[br] + 1) % 4; // 0→1→2→3→0
      ef.act = (ef.branches.A + ef.branches.B + ef.branches.C) > 0; // 分支全归零 → 取消激活
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
  },

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
  },

  spawnTestEnemies(type, count) {
    const ly = this.renderer.ly;
    const entryY = ly.areaY + ly.entryH;
    const wallY = ly.wallY;
    const baseSpeed = ((wallY - entryY) / WAVE_DUR) * 3; // 测试战场怪速 ×3：13s 到墙，避免入口盲区等待过久
    // 测试血量（基础塔 dps 20-40，普通怪 500 约 15 秒内可清，便于观察技能特效）
    const HP = { normal: 500, runner: 350, tank: 1500, elite: 4000, boss: 12000 };
    // 测试怪按类型对应代际等级（动画表：普→lv1 / 快→lv2 / 重→lv3 / 精英→lv4 / Boss→lv6）
    const TEST_LV = { normal: 1, runner: 2, tank: 3, elite: 4, boss: 6 };
    for (let i = 0; i < count; i++) {
      const isBoss = type === 'boss';
      this.wave.pushEnemy(
        HP[type] || 500, entryY, baseSpeed,
        0.5 + Math.random() * 0.5, isBoss, type, TEST_LV[type] || 1
      );
    }
    this.toast(`召唤 ${type === 'normal' ? '普通' : type === 'runner' ? '快速' : type === 'tank' ? '重甲' : type === 'elite' ? '精英' : 'Boss'} ×${count}`, '#f7c948');
  },

  clearTestEnemies() {
    this.enemies = [];
    this.combat.reset();
    this.toast('已清场', '#9fb2c3');
  },

  cycleTestSpeed() {
    this.testSpeed = this.testSpeed >= 4 ? 1 : this.testSpeed * 2;
    this.toast(`倍速 ×${this.testSpeed}`, '#7cd6a6');
  },

  testAddRelic(star) {
    this.pendingRelicPicks = []; // 测试战场逐次弹层，不积累队列
    this.spawnRelicPick(star === 'star3' ? 'star3' : 'star1');       // 复用局内圣遗物候选生成（在场塔塔池 + 通用池）
    if (!this.pendingRelicPicks.length) { this.toast('暂无可用圣遗物池', '#9fb2c3'); return; }
    this._relicReturnState = 'testfield'; // 选择完成后回到测试战场
    this.relicPick = this.pendingRelicPicks.shift();
    this._lastPickStar3 = !!this.relicPick.star3; // 记录本次三选一是否为 3★ 模式
    this.relicPickHits = [];
    this.relicPick.t = 0; // 弹出动画
    this.state = 'relicpick';
  },

  onTestFieldTap(p) {
    if (this.testPanel) {
      const bounds = (this.testHits || []).find(it => it.id === 'panel_bounds');
      if (bounds && !bounds.hit(p.x, p.y)) { this.testPanel = null; return true; }
    }
    // 测试战场：点击圣遗物行 → 查看本局圣遗物详情（叠加弹层，战斗不暂停）
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
      // 边界只用于外部关闭，不能抢先吞掉面板按钮；跳过被覆盖的底层控件。
      if (it.id === 'panel_bounds') continue;
      if (this.testPanel && !String(it.id).startsWith('panel_')) continue;
      switch (it.id) {
        case 'tf_back': this.goMenu(); return true;
        case 'tf_speed': this.cycleTestSpeed(); return true;
        case 'tf_spawn_n': this.spawnTestEnemies('normal', 5); return true;
        case 'tf_spawn_r': this.spawnTestEnemies('runner', 5); return true;
        case 'tf_spawn_t': this.spawnTestEnemies('tank', 5); return true;
        case 'tf_spawn_e': this.spawnTestEnemies('elite', 2); return true;
        case 'tf_spawn_b': this.spawnTestEnemies('boss', 1); return true;
        case 'tf_talentCharge': {const n=require('../../talents/testing.js').prime(this.run);this.toast(n?'已充能 '+n+' 项红卡金色效果':'当前无金色效果，请装配三星红卡',n?'#f0d57c':'#a9b6a5');return true;}
        case 'tf_clear': this.clearTestEnemies(); return true;
        case 'tf_addRelic': this.testAddRelic(); return true; // 测试战场添加圣遗物
        case 'tf_addRelic3': this.testAddRelic('star3'); return true; // 测试战场添加 3★ 圣遗物
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
    return !!this.testPanel; // 面板空白处也消费点击，避免穿透。
  },

  handleDebugTap(key) {
    const m = this.meta;
    switch (key) {
      case 'dbg_gold': m.gold += 1000; this.toast('💰 +1000', '#f7c948'); break;
      case 'dbg_diamond': m.diamond += 100; this.toast('💎 +100', '#7ca8ff'); break;
      case 'dbg_shard': {
        Object.values(CONFIG.RELIC_RUN.tower).forEach((list) => list.forEach((d) => m.addShard(d.id, 2)));
        CONFIG.RELIC_RUN.common.concat(CONFIG.RELIC_RUN.ur || []).forEach((d) => m.addShard(d.id, 2));
        this.toast('全部圣遗物碎片 +2', '#a86bff');
        break;
      }
      case 'dbg_unlock': {
        Object.values(CONFIG.RELIC_RUN.tower).forEach((list) => list.forEach((d) => { m.runCodex[d.id] = 1; if (!m.relicStars[d.id]) m.relicStars[d.id] = 1; }));
        CONFIG.RELIC_RUN.common.concat(CONFIG.RELIC_RUN.ur || []).forEach((d) => { m.runCodex[d.id] = 1; if (!m.relicStars[d.id]) m.relicStars[d.id] = 1; });
        this.toast('已解锁全部圣遗物（1★）', '#7ef0a3');
        break;
      }
      case 'dbg_star3': {
        // 调试：全部圣遗物直接升 3★（解锁 + 星级拉满），便于 IDE 端完整验证 3★ 养成/图鉴/战斗链路
        Object.values(CONFIG.RELIC_RUN.tower).forEach((list) => list.forEach((d) => { m.runCodex[d.id] = 1; m.relicStars[d.id] = 3; }));
        CONFIG.RELIC_RUN.common.concat(CONFIG.RELIC_RUN.ur || []).forEach((d) => { m.runCodex[d.id] = 1; m.relicStars[d.id] = 3; });
        this.toast('全部圣遗物已升至 3★', '#ffb347');
        break;
      }
      case 'dbg_diamond': m.diamond += 5; this.toast('钻石 +5', '#a86bff'); break;
      case 'dbg_chest': {
        if (m.grantDeepChest(CONFIG.DEPTH_CHEST.tiers[4])) this.toast('已发放星辉宝箱（12h）', '#a86bff');
        else this.toast('深度宝箱槽位已满', '#ff6b6b');
        break;
      }
      default: return;
    }
    this.save.save();
  }
};
