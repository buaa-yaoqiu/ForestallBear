/* Local-only UI. No runtime network requests or remote dependencies. */
globalThis.startBearApp=() => {
  'use strict';
  const E=BearEngine,$=id=>document.getElementById(id),assets=globalThis.BEAR_ASSETS||{};
  const initial=()=>({version:2,atk:{pet:0,nature:'固执',ivs:[0,0,0,0,0,0]},def:{pet:1,nature:'无修正',ivs:[0,0,0,0,0,0]},morphPath:[],freeze:5,marks:0,reduction:0,mainMult:1,starMult:1,atkLevel:0,defLevel:0,powerLevel:0,survive:false,currentHP:null});
  let state=initial(),timer;
  const num=(n,max=100,min=0)=>E.bounded(n,min,max);
  const natureOf=v=>typeof v.nature==='object'?v.nature:E.natures[v.nature]||E.natures['无修正'];
  function validate(s){
    if(!s||![1,2].includes(s.version))throw Error('不支持的配置版本');
    const out=initial();
    for(const side of ['atk','def']){
      const v=s[side];if(!v||!Array.isArray(v.ivs)||v.ivs.length!==6)throw Error('精灵配置不完整');
      const n=typeof v.nature==='string'?E.natures[v.nature]:v.nature;
      if(!n||![n.up,n.down].every(x=>Number.isInteger(x)&&x>=-1&&x<=5)||(n.up>=0&&n.up===n.down))throw Error('性格配置无效');
      if(!Number.isInteger(v.pet)||!E.pets[v.pet]||(side==='atk'&&v.pet!==0))throw Error('精灵不在图鉴中');
      out[side]={pet:v.pet,nature:{up:n.up,down:n.down},ivs:v.ivs.map(E.normalizeIV)};
    }
    out.freeze=Math.trunc(num(s.freeze,20));out.marks=Math.trunc(num(s.marks,99));
    let previous=E.pets[out.def.pet].name;
    for(const name of s.morphPath||[]){if(!globalThis.BEAR_EVOLUTIONS[previous]?.previous.includes(name)||!E.pets.some(p=>p.name===name))throw Error('萌化路径与进化链不符');out.morphPath.push(name);previous=name;}
    out.reduction=num(s.reduction);for(const k of ['mainMult','starMult'])out[k]=E.bounded(s[k],0,10,1);
    for(const k of ['atkLevel','defLevel','powerLevel'])out[k]=Math.trunc(E.bounded(s[k],-99,99,0));
    out.survive=s.survive===true;out.currentHP=s.currentHP===null?null:Math.round(num(s.currentHP,99999));return out;
  }
  function statPet(side){return side==='def'&&state.morphPath.length?E.pets.find(p=>p.name===state.morphPath.at(-1)):E.pets[state[side].pet];}
  function stats(side){const v=state[side],p=statPet(side);return p.stats.map((sv,i)=>E.realStat(sv,v.ivs[i],v.nature,i));}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
  function card(side){
    const v=state[side],p=E.pets[v.pet],shown=statPet(side),atk=side==='atk',title=atk?'攻击方':'防御方';
    $(atk?'attacker':'defender').innerHTML=`<div class="card-heading"><span class="side-label">${atk?'ATTACKER / 攻击方':'DEFENDER / 防御方'}</span><small>${atk?'固定精灵':E.pets.length+' 个精灵／形态'}</small></div><select id="${side}-pet" class="pet-select" aria-label="${title}精灵">${E.pets.map((p,i)=>!atk||i===0?`<option value="${i}" ${i===v.pet?'selected':''}>${p.name}</option>`:'').join('')}</select><div class="pet-banner"><div class="portrait-wrap"><img data-pet-portrait="${shown.name}" alt="${p.name}">${!atk&&state.morphPath.length?'<span class="morph-heart" aria-label="已萌化">♥</span>':''}</div><div class="pet-meta"><div class="type-badges">${p.types.map(t=>`<span>${t}系</span>`).join('')}</div><div class="trait">种族总和 <b>${shown.stats.reduce((a,b)=>a+b,0)}</b></div></div></div><table class="stats-table"><thead><tr><th>能力</th><th>种族</th><th>个体</th><th class="nature-col">增益</th><th class="nature-col">减益</th><th>面板</th></tr></thead><tbody>${E.keys.map((k,i)=>`<tr><td><span class="stat-label">${E.labels[i]}</span></td><td>${shown.stats[i]}</td><td><div class="iv-stepper"><output id="${side}-iv-${i}" aria-label="${title}${E.labels[i]}个体值">${v.ivs[i]}</output><div><button id="${side}-iv-up-${i}" aria-label="增加${title}${E.labels[i]}个体值">▴</button><button id="${side}-iv-down-${i}" aria-label="减少${title}${E.labels[i]}个体值">▾</button></div></div></td><td class="nature-col"><button class="nature-choice up" id="${side}-nature-up-${i}" aria-label="${title}${E.labels[i]}性格增益" aria-pressed="false">↑</button></td><td class="nature-col"><button class="nature-choice down" id="${side}-nature-down-${i}" aria-label="${title}${E.labels[i]}性格减益" aria-pressed="false">↓</button></td><td><output id="${side}-actual-${i}" class="actual" aria-label="${title}${E.labels[i]}实际面板"></output></td></tr>`).join('')}</tbody></table><div class="stat-foot"><span>个体 0 / 42 / 48 / 54 / 60 · 面板自动计算</span></div>${atk?'<section class="bear-trait"><div class="trait-top"><span class="trait-symbol">✦</span><div><small>精灵特性</small><h3>月牙雪糕</h3></div><span class="trait-auto">自动生效</span></div><p>使用攻击技能时，目标每有 1 层冻结，在攻击前使其获得 1 层星陨印记。</p><div class="trait-chain"><span>❄ 冻结</span><b>→</b><span>✧ 星陨印记</span></div></section>':`<section class="defender-trait"><div class="trait-top"><span class="trait-symbol">◇</span><div><small>精灵特性</small><h3>${p.trait}</h3></div><span class="trait-default">默认无效果</span></div></section><div class="hp-control"><label for="current-hp">当前生命</label><input id="current-hp" type="number" min="0" step="1"><button id="full-hp">满血</button></div>`}`;
    document.querySelectorAll('[data-pet-portrait]').forEach(img=>globalThis.loadPetPortrait(img,img.dataset.petPortrait));
    if(!atk){
      $('def-pet').insertAdjacentHTML('beforebegin','<input id="pet-search" type="search" placeholder="搜索名称、拼音、首字母、属性或特性" aria-label="搜索目标精灵"><p id="pet-search-count" class="field-note"></p>');
      $('pet-search').oninput=e=>{const q=e.target.value.trim().toLowerCase();let count=0;for(const option of $('def-pet').options){const p=E.pets[Number(option.value)];const show=[p.name,p.pinyin||'',p.initials||'',p.trait,...p.types].join(' ').toLowerCase().includes(q);option.hidden=!show;if(show)count++;} $('pet-search-count').textContent=q?'匹配 '+count+' 个精灵／形态':'';};
    }
    $(`${side}-pet`).addEventListener('change',e=>{state[side]={...initial()[side],pet:Number(e.target.value)};if(!atk){state.currentHP=null;state.morphPath=[];}card(side);render();});
    for(const column of ['up','down'])for(let i=0;i<6;i++)$(`${side}-nature-${column}-${i}`).onclick=()=>{
      const n={...natureOf(v)},other=column==='up'?'down':'up';
      n[column]=n[column]===i?-1:i;if(n[column]>=0&&n[other]===i)n[other]=-1;
      v.nature=n;render();
    };
    E.keys.forEach((_,i)=>{
      for(const [direction,step] of [['up',1],['down',-1]])$(`${side}-iv-${direction}-${i}`).onclick=()=>{
        const index=E.ivSteps.indexOf(v.ivs[i])+step;
        v.ivs[i]=E.ivSteps[(index+E.ivSteps.length)%E.ivSteps.length];render();
      };
    });
    if(!atk){
      const entry=globalThis.BEAR_EVOLUTIONS[shown.name],previous=(entry?.previous||[]).filter(name=>E.pets.some(p=>p.name===name));
      $('defender').querySelector('.pet-banner').insertAdjacentHTML('beforeend',`<div class="morph-controls"><button id="morph" class="morph-button" ${previous.length?'':'disabled'}>♥ 萌化</button><button id="cure" class="cure-button" ${state.morphPath.length?'':'disabled'}>♨ 除厄</button></div>${previous.length>1?`<select id="morph-target" aria-label="萌化分支">${previous.map(name=>`<option>${name}</option>`).join('')}</select>`:''}`);
      $('morph').title=previous.length?'退回上一阶种族值':entry?.verified?'当前无可退化阶':'进化链尚未核实';
      const changeMorph=path=>{const before=config();state.morphPath=path;const max=stats('def')[0];if(state.currentHP!==null)state.currentHP=Math.min(max,Math.ceil(before.currentHP*max/before.maxHP));card('def');render();};
      $('morph').onclick=()=>{if(previous.length)changeMorph([...state.morphPath,$('morph-target')?.value||previous[0]]);};
      $('cure').onclick=()=>changeMorph([]);
      $('full-hp').insertAdjacentHTML('beforebegin','<output id="current-hp-percent" aria-label="当前生命百分比"></output>');
      $('full-hp').parentElement.insertAdjacentHTML('afterend','<div class="hp-slider-row"><button id="hp-minus" aria-label="当前生命减少1">−</button><input id="current-hp-range" aria-label="当前生命拖条" type="range" min="0" step="1"><button id="hp-plus" aria-label="当前生命增加1">＋</button></div>');
      bindNumber('current-hp',x=>{state.currentHP=Math.min(stats('def')[0],Math.round(x));},0,99999);
      $('current-hp-range').oninput=e=>{state.currentHP=Number(e.target.value);render();};
      for(const [id,step] of [['hp-minus',-1],['hp-plus',1]])$(id).onclick=()=>{const c=config();state.currentHP=Math.max(0,Math.min(c.maxHP,c.currentHP+step));render(true);};
      $('full-hp').onclick=()=>{state.currentHP=null;render();};
    }
  }
  function bindNumber(id,set,min,max){
    const el=$(id);
    el.addEventListener('input',()=>{if(el.value===''||!Number.isFinite(el.valueAsNumber)){el.setAttribute('aria-invalid','true');return;}el.removeAttribute('aria-invalid');const value=E.bounded(el.value,min,max);if(value!==el.valueAsNumber)el.value=value;set(value);render();});
    el.addEventListener('change',()=>{if(el.value===''||!Number.isFinite(el.valueAsNumber)){el.removeAttribute('aria-invalid');render(true);return;}set(E.bounded(el.value,min,max));render(true);});
    el.addEventListener('blur',()=>{el.removeAttribute('aria-invalid');render(true);});
  }
  function setValue(id,value,force=false){const el=$(id);if(force||document.activeElement!==el)el.value=value;}
  function config(){const a=stats('atk'),d=stats('def');return {...state,attack:a[1],defense:d[3],types:E.pets[state.def.pet].types,maxHP:d[0],currentHP:state.currentHP===null?d[0]:Math.min(d[0],state.currentHP)};}
  function render(force=false){
    for(const side of ['atk','def'])stats(side).forEach((x,i)=>{
      $(`${side}-actual-${i}`).textContent=x;$(`${side}-iv-${i}`).textContent=state[side].ivs[i];
      $(`${side}-iv-up-${i}`).disabled=false;$(`${side}-iv-down-${i}`).disabled=false;
      const nature=natureOf(state[side]),label=$(`${side}-actual-${i}`).closest('tr').querySelector('.stat-label');
      label.className='stat-label'+(nature.up===i?' nature-up':nature.down===i?' nature-down':'');
      label.textContent=E.labels[i];
      for(const column of ['up','down'])$(`${side}-nature-${column}-${i}`).setAttribute('aria-pressed',nature[column]===i);
      label.title=nature.up===i?'性格增益 +20%':nature.down===i?'性格减益 −10%':'性格无修正';
    });
    const c=config(),r=E.outcome(c),minimum=E.minimumFreeze(c),alive=c.currentHP>0,kill=r.killed;
    for(const key of ['atkLevel','defLevel','powerLevel']){
      setValue(key,state[key],force);$(key+'-range').value=state[key];
      const position=50+state[key]/99*50,slider=$(key+'-range');
      slider.style.setProperty('--fill-start',Math.min(50,position)+'%');slider.style.setProperty('--fill-end',Math.max(50,position)+'%');
      slider.classList.toggle('has-level',state[key]!==0);
      const effect=state[key]*10;$(key+'-effect').textContent=(effect>=0?'+':'')+effect+(key==='powerLevel'?' 威力':'%');
      $(key+'-range').setAttribute('aria-valuetext',`${state[key]} 层，${effect}${key==='powerLevel'?'点威力':'%'}`);
    }
    $('ability-summary').textContent=`能力倍率 ×${Number(r.ability.toFixed(4))} · 先发制人结算威力 ${r.skillPower}`;
    setValue('current-hp',c.currentHP,force);$('current-hp').max=c.maxHP;
    const hpPercent=Math.ceil(c.currentHP*100/c.maxHP);
    $('current-hp-percent').textContent=hpPercent+'%';
    $('current-hp-range').max=c.maxHP;$('current-hp-range').value=c.currentHP;
    $('current-hp-range').setAttribute('aria-valuetext',`${c.currentHP} / ${c.maxHP}，${hpPercent}%`);
    $('hp-minus').disabled=c.currentHP===0;$('hp-plus').disabled=c.currentHP===c.maxHP;
    document.querySelectorAll('[data-reduce]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.reduce)===state.reduction));
    for(const [id,key] of [['freeze','freeze'],['marks','marks'],['reduction','reduction'],['main-mult','mainMult'],['star-mult','starMult']])setValue(id,state[key],force);
    $('freeze-range').value=state.freeze;$('survive').checked=state.survive;
    document.querySelector('[data-step="-1"]').disabled=state.freeze===0;document.querySelector('[data-step="1"]').disabled=state.freeze===20;
    $('total').textContent=r.executionLine.toLocaleString('en-US');
    const reaction=['冰布丁','椰浆布丁'].includes(E.pets[state.def.pet].name)?'可恶的冰布丁':kill||!alive?'先发拿下':r.segments.red*20<c.maxHP?'大发雷霆':'冰点你咯';
    $('reaction-image').src=assets[reaction];$('reaction-image').alt=reaction;$('reaction-image').title=reaction;
    $('frozen-damage').textContent=r.frozenHP;
    $('status').textContent=!alive?'目标已倒下':r.alreadyFrozen?'已达冻结死亡线':kill?'可击败':c.survive&&r.postDamage===1?'保命生效':'尚未斩杀';$('status').className=kill?'kill':'';
    $('main-damage').textContent=r.main;$('star-damage').textContent=r.star;
    $('hp-label').textContent=`${c.currentHP} / ${c.maxHP} · ${hpPercent}%`;
    const hpText=n=>Number(n.toFixed(2)).toLocaleString('en-US');
    for(const [key,label] of [['frozen','冻结生命'],['red','剩余可用生命'],['star','星陨伤害'],['main','先发伤害'],['empty','已损失生命']]){
      const el=$(`hp-${key}`);el.style.width=r.segments[key]/c.maxHP*100+'%';el.title=`${label} ${hpText(r.segments[key])} HP`;
    }
    $('hp-bar').setAttribute('aria-label',`冻结 ${hpText(r.segments.frozen)}，剩余可用生命 ${hpText(r.segments.red)}，星陨 ${hpText(r.segments.star)}，先发 ${hpText(r.segments.main)}，已掉 ${hpText(r.segments.empty)} HP`);
    $('remaining').textContent=kill?'预计击败 · 剩余 0%':`预计剩余 ${r.remaining} HP（${Math.ceil(r.remaining*100/c.maxHP)}%）`;
    $('freeze-hp-note').textContent=`冻结生命线 ${hpText(r.frozenHP)} HP（${state.freeze*5}%） · ${r.alreadyFrozen?'当前生命已在线内':`攻击后生命 ${r.postDamage} HP`}`;
    $('needed').textContent=!alive?'—':minimum===null?'—':minimum;
    $('needed-unit').textContent=minimum===null?'本条件下无法击败':'层';
    $('needed-note').textContent=!alive?'目标当前生命为 0，请调整血量。':minimum===null?'在 0–20 层冻结范围内，未达到斩杀条件。':r.alreadyFrozen?'当前生命不高于冻结生命线，无需本次攻击即满足死亡条件。':minimum===0?'无需冻结，本体与已有星陨伤害已足够。':`还需 ${Math.max(0,minimum-state.freeze)} 层冻结`;
    const start=Math.max(0,Math.min(13,state.freeze-3));
    $('forecast').innerHTML=Array.from({length:8},(_,i)=>{const n=start+i,x=E.outcome(c,n);return `<button class="forecast-cell ${n===state.freeze?'active':''} ${x.killed?'lethal':''}" data-freeze="${n}" aria-label="应用 ${n} 层冻结，伤害 ${x.total}" aria-pressed="${n===state.freeze}"><span class="layer">${n} 层冻结</span><strong>${x.total}</strong><small>${x.alreadyFrozen?'冻结即击败':x.killed?'可击败':`${(x.total/c.maxHP*100).toFixed(1)}% 伤害`}</small><div class="mini-track"><i style="width:${Math.min(100,(x.total+x.frozenHP)/c.maxHP*100)}%"></i></div></button>`;}).join('');
    $('formula').innerHTML=`<div class="formula-grid"><div><b>① 能力等级倍率</b>(1 + ${Math.max(state.atkLevel,0)/10} 我方物攻提升 + ${Math.max(-state.defLevel,0)/10} 敌方物防降低)<br>÷ (1 + ${Math.max(-state.atkLevel,0)/10} 我方物攻降低 + ${Math.max(state.defLevel,0)/10} 敌方物防提升)<br>= ${r.abilityNumerator} / ${r.abilityDenominator} ≈ ${Number(r.ability.toFixed(6))}</div><div><b>② 先发制人 · 普通系物理伤害</b>威力 = max(0, 55 × 1 应对倍率 + ${r.powerBonus}) = ${r.skillPower}<br>⌊ (${c.attack} ÷ ${c.defense}) × 37/41 × ${r.skillPower} × (${r.abilityNumerator}/${r.abilityDenominator})<br>× 1 本系 × ${r.mainEffect} 克制 × ${c.mainMult} 其他影响 × ${(100-c.reduction)/100} 减伤剩余 × 1 其他免伤 ⌋ = ${r.main} HP</div><div><b>③ 星陨印记 · 引爆伤害</b>n = min(99, ${state.freeze} 冻结 + ${state.marks} 已有) = ${r.layers}；印记威力 = ${r.power}<br>结算威力 = max(0, ${r.power} + ${r.powerBonus})${r.layers===0?"（零层不触发）":""} = ${r.starPower}<br>⌊ (${c.attack} ÷ ${c.defense}) × 37/41 × ${r.starPower} × (${r.abilityNumerator}/${r.abilityDenominator}) 能力等级 × ${r.starEffect} 克制 × ${c.starMult} 其他影响 × ${(100-c.reduction)/100} 减伤剩余 × 1 其他免伤 ⌋ = ${r.star} HP<br>不乘本系加成；零层印记不触发。</div><div><b>④ 冻结生命线与斩杀合计</b>⌊ ${c.maxHP} × ${state.freeze} / 20 ⌋ = ${r.frozenHP} HP<br>攻击后生命 ≤ 冻结生命线 → 击败<br>斩杀线 = ${r.main} 先发 + ${r.star} 星陨 + ${r.frozenHP} 冻结 = ${r.executionLine} HP。</div></div>`;
  }
  function mount(){card('atk');card('def');render(true);}
  try{localStorage.removeItem('crescent-bear-v2');localStorage.removeItem('crescent-bear-v1');}catch{}
  globalThis.loadPetPortrait($('hero-bear'),'月牙雪熊');
  $('brand-logo').src=assets.logo;$('site-icon').href=assets.logo;
  mount();
  for(const key of ['atkLevel','defLevel','powerLevel']){
    bindNumber(key,x=>{state[key]=Math.trunc(x);},-99,99);
    $(key+'-range').oninput=e=>{state[key]=Number(e.target.value);render();};
    $(key+'-reset').onclick=()=>{state[key]=0;render(true);};
  }
  for(const [id,key,max] of [['freeze','freeze',20],['marks','marks',99],['reduction','reduction',100],['main-mult','mainMult',10],['star-mult','starMult',10]])bindNumber(id,x=>{state[key]=['freeze','marks'].includes(key)?Math.trunc(x):x;},0,max);
  $('freeze-range').addEventListener('input',e=>{state.freeze=Number(e.target.value);render();});
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{state.freeze=num(state.freeze+Number(b.dataset.step),20);render(true);});
  document.querySelectorAll('[data-reduce]').forEach(b=>b.onclick=()=>{state.reduction=Number(b.dataset.reduce);render(true);});
  $('forecast').onclick=e=>{const b=e.target.closest('[data-freeze]');if(b){state.freeze=Number(b.dataset.freeze);render(true);}};
  $('survive').onchange=e=>{state.survive=e.target.checked;render();};
  $('reset').onclick=()=>{state=initial();mount();toast('已恢复默认测试配置；保存的配置未覆盖');};
  $('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='月牙雪熊-对战配置.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('配置已导出');};
  $('import').onclick=()=>$('import-file').click();
  $('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>50000)throw Error('配置文件过大');const next=validate(JSON.parse(await file.text()));state=next;mount();toast('配置已导入');}catch(err){toast('导入失败：'+err.message);}finally{e.target.value='';}};
};
