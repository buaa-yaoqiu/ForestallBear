(function (root) {
  'use strict';
  const keys = ['hp','pa','ma','pd','md','sp'];
  const labels = ['生命','物攻','魔攻','物防','魔防','速度'];
  const pets = root.BEAR_PETS || (typeof require==='function' ? require('./data/pets.json').pets : []);
  if(!pets.length)throw Error('Pet data missing');
  // Row = increased stat; columns = decreased stats in keys order, excluding self.
  const natureRows = [
    ['沉默','平和','忧郁','粗心','踏实'],['逞强','固执','大胆','调皮','勇敢'],
    ['理性','聪明','专注','偏执','冷静'],['坦率','稳重','天真','懒散','悠闲'],
    ['焦虑','警惕','害羞','温顺','慎重'],['热情','胆小','开朗','急躁','莽撞']
  ];
  const natures = {'无修正':{up:-1,down:-1}};
  natureRows.forEach((row,up)=>{let c=0;keys.forEach((_,down)=>{if(down!==up)natures[row[c++]]={up,down};});});
  const types = ['普通','草','火','水','光','地','冰','龙','电','毒','虫','武','翼','萌','幽','恶','机械','幻'];
  // Only the two damage types used by this calculator. Source: lovepvp type chart.
  const effectiveness = {'普通':{地:.5,幽:.5,机械:.5},'幻':{毒:2,武:2,光:.5,机械:.5,幻:.5}};
  const bounded = (v,min,max,fallback=min) => Number.isFinite(Number(v)) && v!=='' && v!==null ? Math.min(max,Math.max(min,Number(v))) : fallback;
  const ivSteps = [0,42,48,54,60];
  const normalizeIV = value => ivSteps.reduce((best,n)=>Math.abs(n-bounded(value,0,60))<Math.abs(best-bounded(value,0,60))?n:best,0);
  function realStat(sv,iv,nature,index) {
    const n=typeof nature==='object'&&nature!==null?nature:natures[nature]||natures['无修正'];
    const multiplier=n.up===index?1.2:n.down===index?.9:1;
    iv=normalizeIV(iv);
    if(index===0)return Math.round((sv*1.7+iv*.85+70)*multiplier+100);
    const base=sv===105&&iv===0&&multiplier===1?Math.floor(sv*1.1+iv*.55+10):Math.round(sv*1.1+iv*.55+10);
    return Math.round(base*multiplier+50);
  }
  function typeEffect(type,defTypes) {
    const product=[...new Set(defTypes)].reduce((m,t)=>m*(effectiveness[type]?.[t]??1),1);
    return product>=4?3:product;
  }
  function damage(c,freeze=c.freeze) {
    const a=bounded(c.attack,1,99999),d=bounded(c.defense,1,99999);
    const ratio=(a/d)*(37/41);
    const layers=Math.min(99,Math.trunc(bounded(freeze,0,20))+Math.trunc(bounded(c.marks,0,99)));
    const power=layers>0?layers*layers+24*layers-24:0;
    const reduction=(100-bounded(c.reduction,0,100))/100;
    const atkLevel=Math.trunc(bounded(c.atkLevel,-99,99,0)),defLevel=Math.trunc(bounded(c.defLevel,-99,99,0));
    const powerLevel=Math.trunc(bounded(c.powerLevel,-99,99,0));
    const abilityNumerator=10+Math.max(atkLevel,0)+Math.max(-defLevel,0);
    const abilityDenominator=10+Math.max(-atkLevel,0)+Math.max(defLevel,0);
    const ability=abilityNumerator/abilityDenominator;
    // First Strike has no response power bonus and is not STAB on Crescent Bear.
    const responseMult=1,stab=1,powerBonus=powerLevel*10;
    const skillPower=Math.max(0,55*responseMult+powerBonus);
    const mainEffect=typeEffect('普通',c.types||[]),starEffect=typeEffect('幻',c.types||[]);
    const main=Math.floor(ratio*skillPower*ability*stab*mainEffect*bounded(c.mainMult,0,10,1)*reduction);
    const starPower=layers>0?Math.max(0,power+powerBonus):0;
    const star=Math.floor(ratio*starPower*ability*starEffect*bounded(c.starMult,0,10,1)*reduction);
    return {main,star,total:main+star,layers,power,starPower,mainEffect,starEffect,ratio,ability,abilityNumerator,abilityDenominator,skillPower,powerBonus,responseMult,stab};
  }
  function minimumFreeze(c) {
    if(c.currentHP<=0)return null;
    for(let n=0;n<=20;n++)if(outcome(c,n).killed)return n;
    return null;
  }
  function outcome(c,freeze=c.freeze) {
    freeze=Math.trunc(bounded(freeze,0,20));
    const r=damage(c,freeze),maxHP=bounded(c.maxHP,1,99999),currentHP=bounded(c.currentHP,0,maxHP);
    // Provisional rule requested by user; rounding is not confirmed by an in-game test.
    const frozenHP=Math.floor(maxHP*freeze/20);
    const alreadyFrozen=currentHP>0&&currentHP<=frozenHP;
    const postDamage=currentHP===0?0:Math.max(c.survive?1:0,currentHP-r.total);
    const killed=currentHP>0&&(alreadyFrozen||postDamage<=frozenHP);
    // Segments fill exactly maxHP. Overflow damage is clipped, main hit before star.
    const frozen=Math.min(currentHP,frozenHP),available=Math.max(0,currentHP-frozen);
    const damageBudget=Math.max(0,currentHP-(c.survive?1:0));
    const main=Math.min(available,r.main,damageBudget),star=Math.min(available-main,r.star,damageBudget-main);
    const red=Math.max(0,available-main-star);
    return {...r,frozenHP,executionLine:r.total+frozenHP,alreadyFrozen,killed,postDamage,remaining:killed?0:postDamage,
      segments:{frozen,red,star,main,empty:maxHP-currentHP}};
  }
  const api={keys,labels,pets,natures,types,bounded,ivSteps,normalizeIV,realStat,typeEffect,damage,outcome,minimumFreeze};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.BearEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
