/** 章节查询与存档进度：纯数据接口，不发奖、不写存储、不改全局配置。 */
'use strict';
const CONFIG = require('./config.js');
const PROLOGUE = require('./config/prologue.js');

function chapter(id) { return PROLOGUE.chapters[id] || null; }
function initialProgress() {
  return { version: 1, cleared: [], redGiftGranted: false, redGiftId: null, legacyGiftPending: false, tutorials: {} };
}

function normalizeProgress(value, save = {}) {
  const progress = initialProgress();
  if (value && value.version === 1) {
    progress.cleared = PROLOGUE.order.filter(id => Array.isArray(value.cleared) && value.cleared.includes(id));
    progress.redGiftGranted = value.redGiftGranted === true;
    progress.redGiftId = progress.redGiftGranted && typeof value.redGiftId === 'string' ? value.redGiftId : null;
    progress.legacyGiftPending = !progress.redGiftGranted && value.legacyGiftPending === true;
    PROLOGUE.order.forEach(id => {
      const tutorial = value.tutorials && value.tutorials[id];
      if (!tutorial) return;
      progress.tutorials[id] = {
        done: Array.isArray(tutorial.done) ? [...new Set(tutorial.done.filter(item => typeof item === 'string'))].slice(0, 32) : [],
        skipped: tutorial.skipped === true,
      };
    });
  }
  // 预接入期间也可能产生正式战场记录，开放前继续兼容这些账号。
  // 开放后已有章节数据只相信独立通关标记，不能拿前置波数推导正式通关。
  const hasFormalRecord = Number(save.ancientBestWave) > 0 || Number(save.bestWave) > 0 || save.normalFieldCleared === true;
  if (hasFormalRecord && (!value || !PROLOGUE.releaseReady)) {
    progress.cleared = PROLOGUE.order.slice();
    progress.legacyGiftPending = !progress.redGiftGranted;
  }
  return progress;
}

/** 当局只读快照；正式战场沿用原难度颜色，不改变四塔与既有功能。 */
function context(id = 'ancient', difficulty = CONFIG.DIFFICULTY.default) {
  const prologue = chapter(id);
  if (prologue) return prologue;
  return Object.freeze({
    id, isPrologue: false, maxWave: id === 'abyss' || id === 'test' ? null : 60,
    colors: Object.freeze((CONFIG.DIFFICULTY.activeColors[difficulty] || Object.keys(CONFIG.COLOR_WEIGHT)).slice()),
    towerSlots: CONFIG.TOWER_SLOTS,
    features: Object.freeze({ skills: true, branches: true, globalSkills: true, battleShop: true, relics: true, match4: true, match5: true, chain: true, talents: true }),
    expNeedMultiplier: 1,
  });
}

function cleared(meta, id) { return !!(meta && meta.prologue && meta.prologue.cleared.includes(id)); }
function reason(id, meta) {
  const index = PROLOGUE.order.indexOf(id);
  if (index >= 0) {
    return index === 0 || cleared(meta, PROLOGUE.order[index - 1]) ? '' : `通关${chapter(PROLOGUE.order[index - 1]).name}后解锁`;
  }
  return cleared(meta, PROLOGUE.order[2]) ? '' : `通关${chapter(PROLOGUE.order[2]).name}后解锁`;
}

function featureEnabled(run, name) { return !run || !run.chapter || run.chapter.features[name] !== false; }
module.exports = { chapter, context, initialProgress, normalizeProgress, cleared, reason, featureEnabled };
