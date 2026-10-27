import './js/game/main';
// v1.16.123 怪物动画分包预加载：不阻塞主流程，加载完成前怪物回退主包旧图，完成后自动切动画
if (typeof wx !== 'undefined' && wx.loadSubpackage) {
  wx.loadSubpackage({
    root: 'assets',
    success: () => {},
    fail: () => {},
  });
}
