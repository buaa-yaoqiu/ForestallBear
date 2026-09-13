const assert=require('node:assert/strict');
const E=require('./engine.js');
const c={attack:200,defense:200,types:['火'],freeze:0,marks:0,reduction:0,mainMult:1,starMult:1,currentHP:100,maxHP:200};
assert.equal(E.damage({...c,atkLevel:5,defLevel:-3}).ability,1.8);
assert.equal(E.damage({...c,atkLevel:-5,defLevel:3}).ability,1/1.8);
assert.equal(E.damage({...c,atkLevel:5,defLevel:3}).ability,15/13);
assert.equal(E.damage({...c,atkLevel:-5,defLevel:-3}).ability,13/15);
assert.equal(E.damage({...c,atkLevel:99,defLevel:-99}).ability,20.8);
assert.ok(Math.abs(E.damage({...c,atkLevel:-99,defLevel:99}).ability-1/20.8)<1e-14);
assert.equal(E.damage({...c,freeze:5,attack:400}).star,218);
assert.equal(E.damage({...c,freeze:5,defense:400}).star,54);
assert.equal(E.damage({...c,freeze:5,powerLevel:2}).star,127);
assert.equal(E.damage({...c,freeze:0,powerLevel:99}).star,0);
assert.equal(E.damage({...c,freeze:5,powerLevel:-99}).star,0);
assert.equal(E.damage({...c,powerLevel:2}).main,67);
assert.equal(E.damage({...c,powerLevel:-99}).main,0);
assert.equal(E.damage({...c,powerLevel:-5}).main,4);
assert.equal(E.damage({...c,atkLevel:5,defLevel:-3,freeze:5}).star,196);
assert.equal(E.damage({...c,freeze:2,starMult:2,reduction:50}).star,25);
assert.equal(E.realStat(97,60,'固执',1),230);
assert.equal(E.realStat(97,60,{up:1,down:-1},1),230);
assert.equal(E.realStat(97,60,{up:-1,down:-1},1),200);
assert.equal(E.realStat(97,60,{up:-1,down:1},1),185);
assert.equal(E.realStat(117,60,'无修正',0),420);
assert.deepEqual([0,42,48,54,60,100,-1,45].map(E.normalizeIV),[0,42,48,54,60,60,0,42]);
assert.equal(E.realStat(97,100,'固执',1),E.realStat(97,60,'固执',1));
assert.equal(E.realStat(105,0,'无修正',3),175);
assert.equal(E.realStat(97,0,'固执',1),190);
assert.equal(E.typeEffect('幻',['光']),.5);
assert.equal(E.typeEffect('幻',['毒','武']),3);
assert.equal(E.typeEffect('幻',['机械','幻']),.25);
assert.equal(E.typeEffect('幻',['幻','幻']),.5);
assert.deepEqual([E.damage(c).main,E.damage(c).star],[49,0]);
assert.equal(E.damage({...c,freeze:1}).star,0); // floor(1 * 37/41)
assert.equal(E.damage({...c,freeze:2}).star,25);
assert.equal(E.damage({...c,freeze:2,marks:3}).power,121);
assert.equal(E.damage({...c,freeze:2,marks:3}).total,158);
assert.equal(E.damage({...c,freeze:20,marks:99}).layers,99);
assert.equal(E.damage({...c,freeze:0,marks:100}).layers,99);
assert.equal(E.damage({...c,freeze:5,marks:95}).layers,99);
assert.equal(E.outcome({...c,maxHP:510,freeze:1}).frozenHP,25);
assert.equal(E.outcome({...c,maxHP:510,freeze:3}).frozenHP,76);
assert.equal(E.outcome({...c,maxHP:510,freeze:1,reduction:100,currentHP:26}).killed,false);
assert.equal(E.outcome({...c,maxHP:510,freeze:1,reduction:100,currentHP:25}).killed,true);
assert.equal(E.outcome({...c,freeze:2}).executionLine,94);
assert.equal(E.damage({...c,freeze:5,reduction:100}).total,0);
assert.equal(E.damage({...c,freeze:5,mainMult:0,starMult:0}).total,0);
assert.equal(E.damage({...c,freeze:5,reduction:80}).total,30);
assert.equal(E.minimumFreeze({...c,currentHP:49}),0);
assert.equal(E.minimumFreeze({...c,currentHP:50}),1);
assert.equal(E.minimumFreeze({...c,currentHP:168}),4);
assert.equal(E.minimumFreeze({...c,currentHP:169}),5);
assert.equal(E.minimumFreeze({...c,survive:true}),3);
assert.equal(E.minimumFreeze({...c,reduction:100}),10);
assert.equal(E.minimumFreeze({...c,currentHP:0}),null);
// Freeze alone kills on equality, but not one HP above. 20 layers freezes all HP.
assert.equal(E.outcome({...c,freeze:5,reduction:100,currentHP:50}).killed,true);
assert.equal(E.outcome({...c,freeze:5,reduction:100,currentHP:51}).killed,false);
assert.equal(E.outcome({...c,freeze:20,reduction:100,currentHP:200}).alreadyFrozen,true);
assert.equal(E.outcome({...c,freeze:100}).frozenHP,200);
assert.equal(E.damage({...c,freeze:21}).total,E.damage({...c,freeze:20}).total);
// Fractional 10.05 HP threshold must not round up to 11 HP.
assert.equal(E.outcome({...c,maxHP:201,freeze:1,reduction:100,currentHP:10}).killed,true);
assert.equal(E.outcome({...c,maxHP:201,freeze:1,reduction:100,currentHP:11}).killed,false);
// At 2 layers: main 49 + star 25 + frozen 20 = 94 HP lethal line.
assert.equal(E.outcome({...c,freeze:2,currentHP:94}).killed,true);
assert.equal(E.outcome({...c,freeze:2,currentHP:95}).killed,false);
assert.equal(E.outcome({...c,freeze:2,currentHP:94}).postDamage,20);
assert.deepEqual(E.outcome({...c,freeze:2,currentHP:120}).segments,{frozen:20,red:26,star:25,main:49,empty:80});
assert.deepEqual(E.outcome({...c,freeze:2,currentHP:50}).segments,{frozen:20,red:0,star:0,main:30,empty:150});
assert.deepEqual(E.outcome({...c,freeze:5,currentHP:10}).segments,{frozen:10,red:0,star:0,main:0,empty:190});
assert.deepEqual(E.outcome({...c,currentHP:20,survive:true}).segments,{frozen:0,red:1,star:0,main:19,empty:180});
assert.equal(E.outcome({...c,currentHP:20,survive:true}).killed,false);
assert.equal(E.outcome({...c,currentHP:20,survive:true,freeze:1}).killed,true);
for(const pet of E.pets){
  let last=-1;
  for(let freeze=0;freeze<=20;freeze++){
    const x=E.outcome({...c,freeze,types:pet.types});assert.ok(Number.isInteger(x.total)&&x.total>=last);last=x.total;
    assert.ok(Object.values(x.segments).every(v=>v>=0));
    assert.equal(Object.values(x.segments).reduce((a,b)=>a+b),c.maxHP);
  }
}
console.log('PASS: five IV levels, read-only stat model, freeze equality/fractional boundaries, 20-layer cap, survival, clipped blood-bar segments and 126 forecast cases.');
