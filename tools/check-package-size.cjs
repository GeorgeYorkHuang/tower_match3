'use strict';
// 静态文件上限检查；压缩、源码映射等平台处理仍以开发者工具为准。
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
const limit=29000000;
function ignored(p){return p==='.git'||p==='project.private.config.json'||(config.packOptions.ignore||[]).some(rule=>rule.type==='file'?p===rule.value:rule.type==='folder'?p===rule.value||p.startsWith(rule.value+'/'):rule.type==='regexp'?new RegExp(rule.value).test(p):false);}
function walk(dir,prefix=''){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const relative=prefix+entry.name;if(ignored(relative))return [];
  const absolute=path.join(dir,entry.name);
  return entry.isDirectory()?walk(absolute,relative+'/'):[{path:relative,bytes:fs.statSync(absolute).size}];
 });
}
const files=walk(root),assets=files.filter(f=>f.path.startsWith('assets/')).reduce((n,f)=>n+f.bytes,0),total=files.reduce((n,f)=>n+f.bytes,0);
const result={limitBytes:limit,mainBytes:total-assets,assetsBytes:assets,totalBytes:total,remainingBytes:limit-total,totalMB:Number((total/1e6).toFixed(3)),totalMiB:Number((total/1048576).toFixed(3)),ok:total<=limit};
console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
