'use strict';
// Rounded cumulative three-segment curve: E(10)=4677, E(35)=143479, E(48)=401555.
const needs=Object.freeze([141,175,220,275,343,430,536,671,838,1048,1166,1297,1443,1606,1787,1988,2211,2461,2738,3046,3389,3771,4195,4668,5193,5778,6429,7153,7958,8854,9851,10961,12195,13568,15096,15676,16278,16904,17554,18228,18928,19656,20411,21196,22009,22856,23734,24646]);
module.exports={needs,killWaveGrowth:0.045,need(level){return needs[Math.max(0,Math.min(47,Math.floor(level)))];},waveMultiplier(wave){return 1+0.045*(Math.max(1,Number(wave)||1)-1);}};
