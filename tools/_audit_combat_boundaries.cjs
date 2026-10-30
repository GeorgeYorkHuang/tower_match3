'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.js'))files.push(p);}}walk(path.join(root,'js/combat'));
const graph=new Map(),seen=new Set(),active=new Set();
function visit(file){if(active.has(file))throw Error('Circular require: '+path.relative(root,file));if(seen.has(file))return;active.add(file);const src=fs.readFileSync(file,'utf8'),deps=[];for(const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)){if(!m[1].startsWith('.'))continue;let dest=path.resolve(path.dirname(file),m[1]);if(!path.extname(dest))dest+='.js';assert(fs.existsSync(dest),'Missing '+dest);deps.push(dest);visit(dest);}graph.set(file,deps);active.delete(file);seen.add(file);}
for(const file of files)visit(file);
for(const file of files){const src=fs.readFileSync(file,'utf8');assert(!/require\(['"].*\/combat\.js['"]\)/.test(src),'Facade dependency '+file);assert(!/\b(?:wx\.(?:get|set|remove)StorageSync|GameGlobal)\b/.test(src),'Storage/global boundary '+file);}
console.log('PASS '+files.length+' combat modules; '+graph.size+' reachable files checked: relative dependencies exist, no require cycles, no combat-facade import, no direct synchronous storage/GameGlobal access. Static scan does not prove absence of all runtime shared state.');
