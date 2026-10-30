/**
 * test_touch_wx.mjs —— 真机触摸通道测试（mock wx.onTouchStart 全局通道 + 逻辑像素坐标）
 * 验证：真机优先走 wx 全局触摸事件（非同层渲染下 canvas 事件可能不派发），
 * 坐标按 windowWidth/Height 逻辑像素归一化到 750×1334。
 * 运行：node tools/test_touch_wx.mjs
 */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);

const store = {};
const wxHandlers = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k] == null ? store[k] : JSON.parse(JSON.stringify(store[k])); },
  setStorageSync(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
  // 真机：全局触摸通道（逻辑像素坐标）
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; },
  onTouchMove(fn) { wxHandlers.move = fn; },
  onTouchEnd(fn) { wxHandlers.end = fn; },
  onTouchCancel(fn) { wxHandlers.cancel = fn; },
};
const ctx2d = new Proxy({}, { get() { return () => undefined; }, set() { return true; } });
const canvasHandlers = {};
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: (t, fn) => { canvasHandlers[t] = fn; } };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const DESIGN = require('../js/config.js').DESIGN;
const LOGIC_W = DESIGN.W, LOGIC_H = DESIGN.H;

/* 新状态机：初始在主界面，触摸用例先进战斗 */
game.newRun(true);

const { boardX, boardY, cell } = game.ly;
/* 逻辑坐标 → 真机逻辑像素坐标（windowWidth/Height 系） */
const toClient = (lx, ly) => ({ x: lx * game.scale / 3, y: ly * game.scale / 3 });
const center = (r, c) => toClient(boardX + c * cell + cell / 2, boardY + r * cell + cell / 2);

function tap(r, c) {
  const p = center(r, c);
  wxHandlers.start({ touches: [{ clientX: p.x, clientY: p.y }] });
  wxHandlers.end({ touches: [] });
}
function swipe(r1, c1, r2, c2) {
  const a = center(r1, c1), b = center(r2, c2);
  wxHandlers.start({ touches: [{ clientX: a.x, clientY: a.y }] });
  wxHandlers.move({ touches: [{ clientX: b.x, clientY: b.y }] });
  wxHandlers.end({ touches: [] });
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

let lastSwap = null;
const origTrySwap = game.match3.trySwap.bind(game.match3);
game.match3.trySwap = function (r1, c1, r2, c2) { lastSwap = [r1, c1, r2, c2]; return origTrySwap(r1, c1, r2, c2); };

function reset() {
  game.pickCell = null;
  game.selected = null;
  game.anim = null;
  game.swapped = false;
  lastSwap = null;
}

t('wx 全局通道已绑定（真机事件源）', () => {
  assert.ok(wxHandlers.start && wxHandlers.move && wxHandlers.end, '应绑定 wx.onTouchStart/Move/End');
  assert.strictEqual(Object.keys(canvasHandlers).length, 0, 'wx 通道可用时不应再用 canvas 事件通道');
});

t('wx 通道点击：逻辑像素坐标正确选中格子', () => {
  reset();
  tap(0, 0);
  assert.deepStrictEqual(game.pickCell, [0, 0], '点击 (0,0) 应选中（真机坐标归一化正确）');
});

t('wx 通道相邻点击：触发交换', () => {
  reset();
  tap(0, 0);
  tap(0, 1);
  assert.deepStrictEqual(lastSwap, [0, 0, 0, 1], '点相邻格应交换 (0,0)→(0,1)');
  assert.strictEqual(game.pickCell, null, '交换后应清除选中');
});

t('wx 通道滑动：正常触发滑动交换', () => {
  reset();
  swipe(0, 0, 0, 1);
  assert.deepStrictEqual(lastSwap, [0, 0, 0, 1], '滑动应交换 (0,0)→(0,1)');
});

t('toLogic 使用wx逻辑坐标与绘制缩放的逆变换', () => {
  const p = game.toLogic(300, 500);
  assert.strictEqual(Math.round(p.x), Math.round(300 * 3 / game.scale));
  assert.strictEqual(Math.round(p.y), Math.round(500 * 3 / game.scale));
});

for (const valid of [true, false]) {
  t(`持续滑动只尝试一次交换（有效=${valid}），抬手后可再交换`, () => {
    reset();
    let calls = 0;
    const saved = game.match3.trySwap;
    game.match3.trySwap = () => { calls++; return valid; };
    const event = (r, c) => { const p = center(r,c); return { touches: [{ clientX:p.x, clientY:p.y }] }; };
    try {
      wxHandlers.start(event(0,0));
      wxHandlers.move(event(0,1));
      game.anim = null; game.swapped = false;
      wxHandlers.move(event(0,2));
      const extra = event(1,1); extra.touches.push({clientX:0,clientY:0});
      wxHandlers.start(extra); // Additional finger must not reset the gesture.
      wxHandlers.move(event(1,2));
      assert.strictEqual(calls, 1);
      wxHandlers.end(event(1,2)); // Adapter includes the ending touch: must still release.
      wxHandlers.start(event(0,0));
      wxHandlers.move(event(0,1));
      assert.strictEqual(calls, 2);
      wxHandlers.cancel();
      wxHandlers.move(event(0,2));
      assert.strictEqual(calls, 2);
      wxHandlers.start(event(0,0));
      wxHandlers.move(event(0,1));
      assert.strictEqual(calls, 3);
      wxHandlers.end({ touches: [] });
    } finally { game.match3.trySwap = saved; }
  });
}

t('按钮点击在 end 携带触点或遗漏 end 后仍可继续响应', () => {
  reset();
  const saved = game.dispatchTouch;
  let calls = 0;
  game.dispatchTouch = () => { calls++; return true; };
  const p = center(0,0);
  const e = { touches: [{clientX:p.x,clientY:p.y}] };
  try {
    wxHandlers.start(e); wxHandlers.end(e);
    wxHandlers.start(e); wxHandlers.end(e);
    wxHandlers.start(e); // Simulate a lost end during a panel transition.
    wxHandlers.start(e); wxHandlers.end(e);
    assert.strictEqual(calls, 4);
  } finally { game.dispatchTouch = saved; }
});

t('主界面真实渲染命中区经 wx 触摸可打开技能面板并关闭', () => {
  reset(); game.state = 'menu'; game.menuTab = 'battle'; game.menuPanel = null;
  const ctx = new Proxy({}, { get(t,k) {
    if(k === 'measureText') return s => ({width:String(s).length*10});
    if(k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({addColorStop(){}});
    return () => {};
  }, set(){return true;} });
  const render = () => { game.menuHits = game.renderer.menuLayer(ctx,game.menuState(),[]); };
  const click = (key, shape) => {
    const hit = game.menuHits.find(h => h.key === key); assert.ok(hit, key);
    const r = hit.rect, p = toClient(r.x+r.w/2,r.y+r.h/2);
    const touch = shape === 'xy' ? {x:p.x,y:p.y} : {clientX:p.x,clientY:p.y};
    const e = shape === 'changed' ? {touches:[],changedTouches:[touch]} : {touches:[touch]};
    wxHandlers.start(e); wxHandlers.end(e);
  };
  for(const shape of ['client','xy','changed']) {
    render(); click('matchCfg',shape);
    assert.strictEqual(game.menuPanel.type,'matchCfg');
    render(); click('panelClose',shape);
    assert.strictEqual(game.menuPanel,null);
  }
});

t('各主页弹窗：内侧空白保持打开，四侧外部关闭且不触发底层', () => {
  const ctx = new Proxy({}, { get(t,k) {
    if(k==='measureText') return s=>({width:String(s).length*10});
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },set(){return true;} });
  game.state='menu'; game.menuTab='battle';
  const relicId = CONFIG_FOR_TEST().RELIC_RUN.tower.fire[0].id;
  const panels=[{type:'matchCfg',slot:'match4'},{type:'matchCfg',slot:'chain'},
    {type:'globalCfg',index:0,page:2},{type:'relicInfo',id:relicId},
    {type:'codexSkill',tower:'fire',idx:0},{type:'chestOpen',gain:{gold:1}}];
  for(const panel of panels) {
    for(const side of ['left','right','top','bottom']) {
      game.menuPanel={...panel};
      game.menuHits=game.renderer.menuLayer(ctx,game.menuState(),[]);
      const bounds=game.menuHits.find(h=>h.key==='panelBounds'); assert.ok(bounds,panel.type);
      const r=bounds.rect;
      game.onMenuTap({x:r.x+5,y:r.y+5}); assert.ok(game.menuPanel,'inside '+panel.type);
      const p={x:r.x+r.w/2,y:r.y+r.h/2};
      if(side==='left') p.x=r.x-2; if(side==='right') p.x=r.x+r.w+2;
      if(side==='top') p.y=r.y-2; if(side==='bottom') p.y=r.y+r.h+2;
      game.onMenuTap(p); assert.strictEqual(game.menuPanel,null,panel.type+' '+side);
      assert.strictEqual(game.state,'menu');
    }
  }
});
function CONFIG_FOR_TEST(){return require('../js/config.js');}

t('局内商店：空白不穿透，外部关闭不触发底层按钮', () => {
  game.state='fighting'; game.relicDetail=null; game.towerInfo=null; game.towerSkill=null; game.funcLayer=null;
  game.shopOpen=true;
  game.renderer.shopPanelRect={x:100,y:300,w:550,h:600};
  game.renderer.shopCloseRect=null; game.renderer.shopItemRects=[];
  const saved=game.cycleRunSpeed; let calls=0;
  game.cycleRunSpeed=()=>calls++; game.renderer.speedHit={hit:()=>true};
  try {
    assert.strictEqual(game.dispatchTouch({x:120,y:320}),true); assert.strictEqual(game.shopOpen,true);
    assert.strictEqual(calls,0);
    game.dispatchTouch({x:20,y:320}); assert.strictEqual(game.shopOpen,false); assert.strictEqual(calls,0);
  } finally {game.cycleRunSpeed=saved; game.renderer.speedHit=null;}
});

t('局内圣遗物详情：点击外部返回原状态',()=>{
  game.state='relicDetail'; game.relicDetail={from:'testfield'};
  game.relicDetailHits={bg:{hit:()=>true}};
  game.dispatchTouch({x:0,y:0});
  assert.strictEqual(game.relicDetail,null); assert.strictEqual(game.state,'testfield');
});

t('塔图鉴详情全技能：缩小后放大10%、居中、关闭命中区随画面缩放',()=>{
  const config=CONFIG_FOR_TEST();
  const ctx = new Proxy({}, {get(t,k){
    if(k==='measureText') return v=>({width:String(v).length*20});
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },set(){return true;}});
  for(const [tower,pool] of Object.entries(config.EFFECT_POOLS)) {
    pool.forEach((sk,idx)=>{
      const hits=[];
      const push=(key,data,x,y,w,h)=>hits.push({key,rect:{x,y,w,h},hit:(px,py)=>px>=x&&px<=x+w&&py>=y&&py<=y+h});
      game.renderer.codexSkillPanel(ctx,{panel:{tower,idx}},push);
      const bounds=hits.find(h=>h.key==='panelBounds').rect;
      const close=hits.find(h=>h.key==='panelClose').rect;
      assert.ok(Math.abs(bounds.w-700*2/3*1.1)<0.001);
      assert.ok(Math.abs(bounds.h-1360*2/3*1.1)<0.001);
      assert.ok(Math.abs(bounds.x+bounds.w/2-375)<0.001);
      assert.ok(Math.abs(bounds.y+bounds.h/2-config.DESIGN.H/2)<0.001);
      assert.ok(close.y>300,'close avoids top capsule');
      game.state='menu';game.menuPanel={type:'codexSkill',tower,idx};game.menuHits=hits;
      game.onMenuTap({x:close.x+close.w/2,y:close.y+close.h/2});
      assert.strictEqual(game.menuPanel,null);
    });
  }
});

t('左上功能菜单：口令、音乐、我的信息与独立测试档登出',()=>{
  const Account=require('../js/game/account.js');
  const access=require('../js/config/test-access.js');
  const ctx=new Proxy({}, {get(t,k){
    if(k==='measureText') return v=>({width:String(v).length*10});
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },set(){return true;}});
  game.state='menu';game.menuPanel=null;game.testProfile=false;
  const render=()=>{game.menuHits=game.renderer.menuLayer(ctx,game.menuState(),[]);};
  const click=key=>{
    render(); const h=game.menuHits.find(h=>h.key===key);assert.ok(h,key);
    const p=toClient(h.rect.x+h.rect.w/2,h.rect.y+h.rect.h/2);
    wxHandlers.start({touches:[{clientX:p.x,clientY:p.y}]});wxHandlers.end({touches:[]});
  };
  click('accountOpen'); assert.strictEqual(game.menuPanel.type,'accountMenu');
  const music=game.meta.musicOn;
  click('accountMusic');assert.strictEqual(game.meta.musicOn,!music);
  assert.strictEqual(game.sfx.musicEnabled,!music);
  click('accountInfo');assert.strictEqual(game.menuPanel.type,'accountInfo');
  click('panelClose');click('accountOpen');
  wx.showModal=opts=>opts.success({confirm:true,content:'wrong'});
  click('accountPass');assert.strictEqual(game.testProfile,false);
  assert.strictEqual(game.menuPanel.type,'accountMenu');
  wx.showModal=opts=>opts.success({confirm:true,content:access.passphrase});
  click('accountPass');assert.strictEqual(game.menuPanel.type,'testProfile');
  game.meta.gold=123;game.save.save();
  const normal=JSON.stringify(store.xxfx_save_v1);
  click('profileResume');assert.strictEqual(game.testProfile,true);
  assert.strictEqual(game.meta.gold,999999);
  game.meta.gold=456;game.save.save();
  assert.strictEqual(JSON.stringify(store.xxfx_save_v1),normal);
  click('accountOpen');click('accountLogout');
  assert.strictEqual(game.testProfile,false);assert.strictEqual(game.meta.gold,123);
  assert.strictEqual(game.save.storageKey,'xxfx_save_v1');
  Account.switchProfile(game,true);assert.strictEqual(game.meta.gold,456);
  Account.switchProfile(game,true,'fresh');assert.strictEqual(game.meta.gold,0);
  assert.strictEqual(JSON.stringify(store.xxfx_save_v1),normal);
  Account.switchProfile(game,false);assert.strictEqual(game.meta.gold,123);
  delete wx.showModal;
});

t('每日碎片购买经真实菜单路由：不足不扣款，足额扣款并入账',()=>{
  game.state='menu';game.menuPanel=null;
  const offer={relic:'fire_seed',shards:3,price:300,icon:'',name:'测试碎片'};
  game.menuHits=[{key:'shopShard',data:offer,hit:()=>true}];
  const shards=game.meta.shards.fire_seed||0;
  game.meta.gold=299;game.onMenuTap({x:0,y:0});
  assert.strictEqual(game.meta.gold,299);assert.strictEqual(game.meta.shards.fire_seed||0,shards);
  game.meta.gold=300;game.onMenuTap({x:0,y:0});
  assert.strictEqual(game.meta.gold,0);assert.strictEqual(game.meta.shards.fire_seed,shards+3);
});

t('口令旧回调不跨档案/页面生效，切档读写失败保留原档',()=>{
  const Account=require('../js/game/account.js'),access=require('../js/config/test-access.js');
  const previousShow=wx.showModal,get=wx.getStorageSync,set=wx.setStorageSync;
  const callbacks=[];
  game.state='menu';game.menuPanel={type:'accountMenu'};
  wx.showModal=options=>callbacks.push(options.success);
  try {
    Account.handle(game,'accountPass');
    game.menuPanel={type:'accountInfo'};
    callbacks.shift()({confirm:true,content:access.passphrase});
    assert.strictEqual(game.menuPanel.type,'accountInfo');
    game.menuPanel={type:'accountMenu'};Account.handle(game,'accountPass');
    Account.switchProfile(game,true);
    callbacks.shift()({confirm:true,content:access.passphrase});
    assert.strictEqual(game.menuPanel,null);
    Account.switchProfile(game,false);
    const meta=game.meta,run=game.run,key=game.save.storageKey;
    wx.getStorageSync=k=>{if(k===access.testSaveKey)throw Error('test read failure');return get(k);};
    assert.strictEqual(Account.switchProfile(game,true),false);
    assert.strictEqual(game.meta,meta);assert.strictEqual(game.run,run);assert.strictEqual(game.save.storageKey,key);
    wx.getStorageSync=get;
    wx.setStorageSync=(k,v)=>{if(k===access.testSaveKey)throw Error('test write failure');set(k,v);};
    assert.strictEqual(Account.switchProfile(game,true),false);
    assert.strictEqual(game.meta,meta);assert.strictEqual(game.run,run);assert.strictEqual(game.testProfile,false);
    assert.strictEqual(game.save.storageKey,key);
    wx.setStorageSync=()=>{throw Error('source write failure');};
    assert.strictEqual(Account.switchProfile(game,true),false);assert.strictEqual(game.meta,meta);assert.strictEqual(game.save.storageKey,key);
  } finally {wx.showModal=previousShow;wx.getStorageSync=get;wx.setStorageSync=set;}
});

t('R09圣遗物页真实触摸：滚动边界、手动解锁、升星扣费及外部关闭',()=>{
  const config=CONFIG_FOR_TEST();
  const ctx=new Proxy({}, {get(t,k){
    if(k==='measureText')return v=>({width:String(v).length*10});
    if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}});
    return ()=>{};
  },set(){return true;}});
  game.state='menu';game.menuTab='relic';game.menuPanel=null;game.relicScroll=0;
  const render=()=>{game.menuHits=game.renderer.menuLayer(ctx,game.menuState(),[]);};
  const event=(x,y)=>{const p=toClient(x,y);return {touches:[{clientX:p.x,clientY:p.y}]};};
  const tap=(x,y)=>{wxHandlers.start(event(x,y));wxHandlers.end({touches:[]});};
  const drag=(from,to)=>{wxHandlers.start(event(375,from));wxHandlers.move(event(375,to));wxHandlers.end({touches:[]});};
  render();assert(game.renderer._relicMaxScroll>0);
  drag(1000,600);assert(Math.abs(game.relicScroll-400)<1e-7);assert.strictEqual(game.menuPanel,null);
  drag(1000,-100000);assert.strictEqual(game.relicScroll,game.renderer._relicMaxScroll);
  drag(600,100000);assert.strictEqual(game.relicScroll,0);
  const id=game.renderer._relicRunList()[0].id;
  delete game.meta.relicStars[id];delete game.meta.runCodex[id];
  game.meta.shards[id]=game.meta.shardNeed(id);render();
  for(const hit of game.menuHits.filter(h=>h.key==='relicInfo'||h.key==='relicLock')) {
    assert(hit.rect.y>=484);assert(hit.rect.y+hit.rect.h<=1492);
  }
  const click=key=>{const h=game.menuHits.find(h=>h.key===key);assert(h,key);tap(h.rect.x+h.rect.w/2,h.rect.y+h.rect.h/2);};
  const card=game.menuHits.find(h=>h.key==='relicInfo'&&h.data===id);assert(card);
  tap(card.rect.x+card.rect.w/2,card.rect.y+card.rect.h/2);
  assert.strictEqual(game.menuPanel.type,'relicInfo');render();click('relicUnlock');
  assert.strictEqual(game.meta.starOf(id),1);assert.strictEqual(game.meta.shards[id],0);
  const cost=config.STAR_UP.cost[2];game.meta.shards[id]=cost.shards;game.meta.gold=cost.gold-1;
  render();click('relicStar');assert.strictEqual(game.meta.starOf(id),1);assert.strictEqual(game.meta.gold,cost.gold-1);
  game.meta.gold=cost.gold;render();click('relicStar');
  assert.strictEqual(game.meta.starOf(id),2);assert.strictEqual(game.meta.gold,0);assert.strictEqual(game.meta.shards[id],0);
  render();tap(0,600);assert.strictEqual(game.menuPanel,null);assert.strictEqual(game.menuTab,'relic');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
