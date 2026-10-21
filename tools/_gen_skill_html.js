// _gen_skill_html.js —— 从 config.js 动态生成《消消防线技能总表.html》
// 用法：node _gen_skill_html.js [输出路径]
// 数据源 = js/config.js 的 EFFECT_POOLS + TOWERS + COLORS；改技能 → 重跑本脚本刷新总表
const fs = require('fs');
const path = require('path');
const CONFIG = require('../js/config.js');

const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', 'Users', 'kindf', 'DoubaoWork', 'chats', '2026-10-16', 'new-chat', '消消防线技能总表.html');

const TOWER_META = {
  fire:       { name: '火塔',       icon: '🔥', color: '#ff6b35' },
  ice:        { name: '冰塔',       icon: '❄️', color: '#7fd4ff' },
  poison:     { name: '毒塔',       icon: '☠️', color: '#28b463' },
  electric:   { name: '电塔',       icon: '⚡', color: '#f4d03f' },
  boomerang:  { name: '回旋镖塔',   icon: '🌀', color: '#c39bd3' },
  cannon:     { name: '炮塔',       icon: '💣', color: '#d89e63' },
};
const ORDER = ['fire', 'ice', 'poison', 'electric', 'boomerang', 'cannon'];

// 分支文案 '名字：效果' → { name, eff }；无冒号 → 整句作 eff
function splitBranch(s) {
  const m = /^(.{1,10}?)[：:](.*)$/.exec(s || '');
  if (m && m[2].trim()) return { name: m[1], eff: m[2].trim() };
  return { name: '', eff: s || '' };
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const towersHtml = ORDER.map((key) => {
  const meta = TOWER_META[key];
  const tw = CONFIG.TOWERS[key];
  const skills = (CONFIG.EFFECT_POOLS[key] || []).map((sk, i) => {
    const [ba, bb, bc] = [splitBranch(sk.a), splitBranch(sk.b), splitBranch(sk.c)];
    const br = (b, extraCls) => `
        <li class="branch ${extraCls || ''}">
          ${b.name ? `<span class="bname">${esc(b.name)}</span>` : ''}
          <span class="beff">${esc(b.eff)}</span>
        </li>`;
    return `
        <article class="skill" style="--ac:${sk.color || meta.color}">
          <div class="skill-head">
            <span class="icon">${esc(sk.icon || '')}</span>
            <h3 class="sname">${esc(sk.name)}</h3>
            <span class="stype">${esc(sk.type || '')}</span>
            <span class="sno">${String(i + 1).padStart(2, '0')}</span>
          </div>
          <p class="sdesc">${esc(sk.desc || '')}</p>
          <ul class="branches">
            ${br(ba, 'br-a')}
            ${br(bb, 'br-b')}
            ${br(bc, 'br-c')}
          </ul>
        </article>`;
  }).join('\n');
  return `
  <section class="tower" id="${key}" style="--tc:${meta.color}">
    <h2 class="tower-title">
      <span class="t-icon">${meta.icon}</span>${meta.name}
      <span class="t-meta">基础DPS ${tw.baseDps} · 成长 ×${tw.grow} · 射程 ${tw.range}px · 攻速 ${tw.atkInterval}s</span>
    </h2>
    <div class="grid">
${skills}
    </div>
  </section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>消消防线 · 技能总表</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='5' fill='%23202b3a'/><text x='12' y='17' font-size='13' text-anchor='middle' fill='%23ff6b35'>塔</text></svg>">
<style>
  :root{ --bg:#141b26; --card:#1e2836; --card2:#253040; --line:#33415a; --txt:#e8eef7; --sub:#9db0c8; --dim:#6b7d96; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ background:radial-gradient(1200px 800px at 50% -10%, #1d2939 0%, var(--bg) 55%); color:var(--txt);
        font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif; min-height:100vh; padding:28px 16px 60px; }
  header{ max-width:1080px; margin:0 auto 26px; }
  header h1{ font-size:28px; letter-spacing:1px; display:flex; align-items:center; gap:10px; }
  header h1 .logo{ width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#ff6b35,#e63946);
        display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 18px rgba(230,57,70,.35); }
  header p{ color:var(--sub); margin-top:8px; font-size:13px; }
  header p b{ color:var(--txt); }
  nav{ position:sticky; top:0; z-index:5; display:flex; gap:8px; flex-wrap:wrap; max-width:1080px; margin:0 auto 24px;
       padding:10px 0; background:linear-gradient(var(--bg) 70%, transparent); }
  nav a{ color:var(--sub); text-decoration:none; font-size:13px; padding:7px 14px; border-radius:20px; background:var(--card); border:1px solid var(--line); transition:.18s; }
  nav a:hover{ color:#fff; border-color:currentColor; }
  .tower{ max-width:1080px; margin:0 auto 40px; }
  .tower-title{ display:flex; align-items:baseline; gap:10px; font-size:21px; margin-bottom:16px; padding-left:12px; border-left:4px solid var(--tc); }
  .t-icon{ font-size:20px; }
  .t-meta{ font-size:12px; color:var(--sub); font-weight:400; }
  .grid{ display:grid; grid-template-columns:repeat(1, 1fr); gap:14px; }
  @media (min-width:640px){ .grid{ grid-template-columns:repeat(2, 1fr); } }
  @media (min-width:960px){ .grid{ grid-template-columns:repeat(3, 1fr); } }
  .skill{ background:linear-gradient(180deg,var(--card2),var(--card)); border:1px solid var(--line); border-radius:14px;
          padding:14px 15px 12px; display:flex; flex-direction:column; gap:10px; transition:.18s; }
  .skill:hover{ transform:translateY(-2px); border-color:var(--ac); box-shadow:0 8px 22px rgba(0,0,0,.35); }
  .skill-head{ display:flex; align-items:center; gap:8px; }
  .icon{ font-size:20px; width:24px; text-align:center; }
  .sname{ font-size:16px; font-weight:700; }
  .stype{ font-size:11px; padding:2px 8px; border-radius:8px; background:color-mix(in srgb, var(--ac) 22%, transparent);
          color:var(--ac); font-weight:600; margin-left:auto; }
  .sno{ font-size:11px; color:var(--dim); font-variant-numeric:tabular-nums; }
  .sdesc{ font-size:13px; color:var(--sub); line-height:1.55; }
  .branches{ list-style:none; display:flex; flex-direction:column; gap:6px; margin-top:auto; }
  .branch{ display:flex; align-items:baseline; gap:8px; font-size:12.5px; background:rgba(255,255,255,.035);
           border:1px solid rgba(255,255,255,.06); border-radius:9px; padding:6px 9px; line-height:1.45; }
  .branch.br-a{ border-left:3px solid #4fd1c5; }
  .branch.br-b{ border-left:3px solid #f6ad55; }
  .branch.br-c{ border-left:3px solid #c39bd3; }
  .bname{ color:var(--txt); font-weight:600; white-space:nowrap; }
  .beff{ color:var(--sub); }
  footer{ max-width:1080px; margin:10px auto 0; color:var(--dim); font-size:12px; text-align:center; line-height:1.7; }
</style>
</head>
<body>
<header>
  <h1><span class="logo">🏰</span>消消防线 · 技能总表</h1>
  <p>数据源：<b>js/config.js</b>（EFFECT_POOLS × TOWERS）动态生成 · 分支以技能名直接显示 · 改技能后重跑生成脚本刷新本页</p>
</header>
<nav>
  ${ORDER.map((k) => `<a href="#${k}">${TOWER_META[k].icon} ${TOWER_META[k].name}</a>`).join('')}
</nav>
${towersHtml}
<footer>生成时间 ${new Date().toLocaleString('zh-CN', { hour12: false })} · 共 ${ORDER.length} 塔 · 每塔 ${ORDER.reduce((s, k) => s + (CONFIG.EFFECT_POOLS[k] || []).length, 0)} 技能</footer>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('written: ' + OUT);
