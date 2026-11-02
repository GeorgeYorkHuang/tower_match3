'use strict';
function evaluate(energy,max){
 const n=Math.max(0,energy||0);
 if(n===0)return{energy:n,attack:.3,interval:2,cooldown:2,color:'#ff4b4b'};
 if(n<20)return{energy:n,attack:.6,interval:1.5,cooldown:1.5,color:'#ff4b4b'};
 if(n<40){const t=(n-20)/20;return{energy:n,attack:.6+.4*t,interval:1.5-.5*t,cooldown:1.5-.5*t,color:`rgb(255,${Math.round(75+180*t)},${Math.round(75+100*t)})`};}
 if(n<=90)return{energy:n,attack:1,interval:1,cooldown:1,color:'#42d66b'};
 const t=Math.min(1,(n-90)/10);return{energy:n,attack:1+.3*t,interval:1-.3*t,cooldown:1,color:`rgb(${Math.round(66-30*t)},${Math.round(214-30*t)},${Math.round(107+148*t)})`};
}
module.exports={evaluate};
