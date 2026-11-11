/** 离线采集固定源码快照：只在本Node进程从内存编译js/，不改磁盘或其他进程。 */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),Module=require('module');
function freeze(root) {
  const files=new Map(),sourceHashes={},loaded=new Set();
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,e.name);
    if(e.isDirectory())walk(file);
    else if(file.endsWith('.js')){
      const source=fs.readFileSync(file,'utf8');files.set(file.toLowerCase(),source);
      sourceHashes[path.relative(root,file).replaceAll('\\','/')]=crypto.createHash('sha256').update(source).digest('hex');
    }
  }}walk(path.join(root,'js'));
  const original=Module._extensions['.js'];
  Module._extensions['.js']=(mod,file)=>{
    const source=files.get(path.resolve(file).toLowerCase());
    if(source===undefined)return original(mod,file);
    loaded.add(path.relative(root,file).replaceAll('\\','/'));mod._compile(source,file);
  };
  return {sourceHashes,loaded:()=>Array.from(loaded),
    liveChanges:()=>Object.entries(sourceHashes).filter(([file,hash])=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')!==hash).map(([file])=>file),
    restore(){Module._extensions['.js']=original;}};
}
module.exports={freeze};
