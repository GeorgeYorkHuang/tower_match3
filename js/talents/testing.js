/**
 * testing.js —— 天赋测试接口：为独立测试档设置红卡星级、测试装配和金天赋待触发状态。
 * 会写入档案的入口同时校验测试身份与存档键，战斗预览可使用不落盘的虚拟配置。
 */
'use strict';
const T = require('./model.js');
const ACCESS = require('../config/test-access.js');

function snapshot(meta, star) {
  if (!Number.isInteger(star) || star < 1 || star > 3) throw Error('Invalid talent test star');
  const state = T.normalize(meta),
    data = {
      relicStars: { ...meta.relicStars },
      runCodex: { ...meta.runCodex },
      talents: {
        version: 1,
        slots: T.C.slots.map((_, i) => {
          const c = T.C.cards.find((c) => c.series === 'sanctum' && c.nativeSlot === i);
          if (!c) return null;
          return c.id;
        }),
        center: state.center,
      },
    };
  data.talents.slots.filter(Boolean).forEach((id) => {
    data.relicStars[id] = star;
    data.runCodex[id] = 1;
  });
  return data;
}

// 写入测试档前同时校验身份和存档键，保存失败则恢复原对象。
function applyPreset(game, star) {
  if (!game.testProfile || !game.save || game.save.storageKey !== ACCESS.testSaveKey) {
    game.toast('此功能仅用于独立测试档', '#f3bd83');
    return false;
  }
  if (!Number.isInteger(star) || star < 1 || star > 3) return false;
  const m = game.meta,
    old = { relicStars: m.relicStars, runCodex: m.runCodex, talents: m.talents };
  Object.assign(m, snapshot(m, star));
  if (game.save.save() === false) {
    Object.assign(m, old);
    game.toast('保存失败，未修改测试配置', '#f3bd83');
    return false;
  }
  game.menuPanel = null;
  game.toast('已装配六张' + star + '星圣庭红卡（测试档）', '#8ed6a4');
  return true;
}

function setStar(game, id, star) {
  if (!game.testProfile || !game.save || game.save.storageKey !== ACCESS.testSaveKey) {
    game.toast('此功能仅用于独立测试档', '#f3bd83');
    return false;
  }
  if (!T.get(id) || ![2, 3].includes(star)) return false;
  const meta = game.meta,
    old = { relicStars: meta.relicStars, runCodex: meta.runCodex };
  meta.relicStars = { ...meta.relicStars, [id]: star };
  meta.runCodex = { ...meta.runCodex, [id]: 1 };
  if (game.save.save() === false) {
    Object.assign(meta, old);
    game.toast('保存失败，未修改测试配置', '#f3bd83');
    return false;
  }
  game.toast(T.get(id).name + ' 已设为' + star + '星（测试档）', '#8ed6a4');
  return true;
}

// 未装配时仅在本次测试战斗使用虚拟三星配置，不替玩家保存装配。
function initializeBattle(run, meta) {
  const R = require('./runtime.js'),
    hasLoadout = T.analyze(meta).count > 0,
    source = hasLoadout ? meta : snapshot(meta, 3);
  R.initialize(run, source);
  run._talentTestVirtual = !hasLoadout;
}

function prime(run) {
  const state = run.talentState;
  if (!state) return 0;
  state.gold.forEach((key) => {
    state.ready[key] = true;
    state.charge[key] = 0;
  });
  return state.gold.length;
}

module.exports = { snapshot, applyPreset, setStar, initializeBattle, prime };
