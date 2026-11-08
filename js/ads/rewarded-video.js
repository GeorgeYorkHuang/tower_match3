'use strict';
const CONFIG = require('../config/rewarded-ads.js');
function createService(options = {}) {
  const platform = options.platform || (() => typeof wx !== 'undefined' ? wx : null);
  const config = options.config || CONFIG;
  let busy = false;
  function show(placement) {
    if (busy) return Promise.resolve({ok:false,reason:'busy'});
    const id = config.placements[placement] || config.adUnitId;
    if (!id) return Promise.resolve({ok:false,reason:'unconfigured'});
    const api = platform();
    if (!api || !api.createRewardedVideoAd) return Promise.resolve({ok:false,reason:'unsupported'});
    busy = true;
    return new Promise(resolve => {
      let ad, done = false, loadTimer;
      function finish(result) {
        if (done) return; done = true; busy = false;
        clearTimeout(loadTimer);
        if (ad) {
          try { ad.offClose(close); ad.offError(error); } catch (_) {}
          try { if (ad.destroy) ad.destroy(); } catch (_) {}
        }
        resolve(result);
      }
      const close = res => finish(res && res.isEnded === true ? {ok:true} : {ok:false,reason:'incomplete'});
      const error = () => finish({ok:false,reason:'unavailable'});
      async function start() {
        try {
          ad = api.createRewardedVideoAd({adUnitId:id});
          ad.onClose(close); ad.onError(error);
          loadTimer = setTimeout(error,30000);
          try { await ad.show(); }
          catch (_) { if(done)return; await ad.load(); if(done)return; await ad.show(); }
          clearTimeout(loadTimer);
        } catch (_) { error(); }
      }
      start();
    });
  }
  return {show};
}
module.exports = { createService, ...createService() };
