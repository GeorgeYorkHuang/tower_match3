// _gen_cannon_html.js —— 从 config.js 生成《炮塔技能表.html》（表格形式）
// 用法：node _gen_cannon_html.js [输出路径]
const fs = require('fs');
const CONFIG = require('../js/config.js');
const OUT = process.argv[2] || '';

const tw = CONFIG.TOWERS.cannon;
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rows = CONFIG.EFFECT_POOLS.cannon.map((sk, i) => `
    <tr style="--ac:${sk.color}">
      <td class="no">${String(i + 1).padStart(2, '0')}</td>
      <td class="name"><span class="icon">${esc(sk.icon)}</span><b>${esc(sk.name)}</b></td>
      <td class="type">${esc(sk.type)}</td>
      <td class="desc">${esc(sk.desc)}</td>
      <td class="br">${esc(sk.a)}</td>
      <td class="br">${esc(sk.b)}</td>
      <td class="br">${esc(sk.c)}</td>
    </tr>`).join('');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>炮塔技能表 · 消消防线</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='5' fill='%232b1a0e'/><text x='12' y='17' font-size='13' text-anchor='middle' fill='%23d89e63'>炮</text></svg>">
<style>
  :root{ --bg:#17120c; --card:#241b10; --line:#4a3a24; --txt:#f0e8da; --sub:#c9b698; --dim:#8a7a5f; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ background:radial-gradient(1100px 700px at 50% -10%, #2e2212 0%, var(--bg) 60%); color:var(--txt);
        font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif; min-height:100vh; padding:30px 18px 60px; }
  header{ max-width:1240px; margin:0 auto 22px; }
  header h1{ font-size:26px; display:flex; align-items:center; gap:10px; }
  header h1 .logo{ width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#d89e63,#b5651d);
        display:flex;align-items:center;justify-content:center;font-size:19px;box-shadow:0 6px 16px rgba(181,101,29,.35); }
  header .sub{ color:var(--sub); margin-top:8px; font-size:13px; line-height:1.7; }
  header .sub b{ color:var(--txt); }
  .wrap{ max-width:1240px; margin:0 auto; overflow-x:auto; border:1px solid var(--line); border-radius:14px;
         background:rgba(0,0,0,.18); }
  table{ width:100%; border-collapse:collapse; table-layout:fixed; min-width:900px; }
  colgroup col:first-child{ width:44px; }
  colgroup col:nth-child(2){ width:130px; }
  colgroup col:nth-child(3){ width:86px; }
  colgroup col:nth-child(4){ width:26%; }
  colgroup col:nth-child(n+5){ width:15%; }
  thead th{ background:#2a1f10; color:var(--sub); font-size:12px; font-weight:600; text-align:left;
            padding:11px 12px; border-bottom:2px solid var(--line); white-space:nowrap; }
  tbody td{ padding:12px; border-bottom:1px solid rgba(74,58,36,.55); vertical-align:top; font-size:13px; line-height:1.55; }
  tbody tr:last-child td{ border-bottom:none; }
  tbody tr:hover{ background:rgba(255,255,255,.035); }
  td.no{ color:var(--dim); font-variant-numeric:tabular-nums; }
  td.name b{ font-size:15px; }
  .icon{ margin-right:6px; }
  td.type{ color:var(--ac); font-size:12px; font-weight:600; white-space:nowrap; }
  td.desc{ color:var(--sub); }
  td.br{ color:var(--sub); }
  td.br::before{ content:''; display:block; width:22px; height:3px; border-radius:2px; background:var(--ac); margin:4px 0 6px; }
  footer{ max-width:1240px; margin:16px auto 0; color:var(--dim); font-size:12px; }
</style>
</head>
<body>
<header>
  <h1><span class="logo">💣</span>炮塔技能表</h1>
  <div class="sub">数据源 <b>js/config.js</b>（EFFECT_POOLS.cannon × TOWERS.cannon）动态生成 · 分支直接显示技能名 · 改技能后重跑生成脚本刷新<br>
  塔属性：基础DPS <b>${tw.baseDps}</b> · 成长 ×${tw.grow} · 射程 <b>${tw.range}px</b> · 攻速 <b>${tw.atkInterval}s</b> · 弹道 抛物线炮弹</div>
</header>
<div class="wrap">
<table>
  <colgroup><col><col><col><col><col><col><col></colgroup>
  <thead>
    <tr>
      <th>#</th><th>技能</th><th>类型</th><th>基础效果</th><th>分支一</th><th>分支二</th><th>分支三</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>
<footer>生成时间 ${new Date().toLocaleString('zh-CN', { hour12: false })} · 共 ${CONFIG.EFFECT_POOLS.cannon.length} 技能 · 技能名变更会使存档字段作废（不迁移）</footer>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('written: ' + OUT);
