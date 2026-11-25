const $ = id => document.getElementById(id);
const stops = [
  ['河滩捡声石','声音橡皮泥','选一块声石揉捏，把喜欢的几块放进篮子，听听它们一起发声。'],
  ['给声音画条河','画一段音乐','沿着七条钢琴音阶线画河。可以画好几笔，重叠的线条会同时发声。'],
  ['编一只自己的篮子','声音混音','给河里的旋律加一点回声、和声、鼓点或风声，听听它们和篮里的声石怎么搭。'],
  ['去回声亭坐坐','音乐小伙伴','亭子里有位等着听歌的小伙伴。让它听听你的旋律，再决定要不要带走它的回应。'],
  ['把这一刻带回家','声音明信片','给这一篮声音起个名字，把河岸与音乐一起留下。']
];
const scale = [0,2,4,5,7,9,11];
const syllables = ['Do','Re','Mi','Fa','Sol','La','Si'];
const note = index => 261.626 * 2 ** (scale[index] / 12);
const step = .28;
const keysTail = .95;
const riverBeats = 15;
const effects = [
  {key:'delay',name:'回声',description:'让音符隔一会儿轻轻响两次。'},
  {key:'harmony',name:'低八度',description:'在旋律下面叠一层同音。'},
  {key:'drums',name:'鼓点',description:'加上轻鼓和沙沙的节拍。'},
  {key:'wind',name:'风声',description:'让一阵风从旋律底下经过。'}
];
const stones = [
  {shape:50,height:50,tone:45,base:196},
  {shape:50,height:50,tone:63,base:247},
  {shape:50,height:50,tone:26,base:294},
  {shape:50,height:50,tone:55,base:349}
];
const initial = {stones,selected:0,picked:[],lines:[],mix:{delay:0,harmony:0,drums:0,wind:0},echo:false,heard:false,name:'',stage:0};
let state = structuredClone(initial);
try {
  const draft = JSON.parse(localStorage.getItem('river-basket-draft') || '{}');
  state = {...state,...draft};
  state.stones = stones.map((stone,i)=>({...stone,...draft.stones?.[i]}));
  state.mix={...initial.mix,...draft.mix};
  if (!draft.mix && Array.isArray(draft.weave) && draft.weave.join(',')!=='1,0,1,2'){
    if(draft.weave.includes(2))state.mix.wind=35;
    if(draft.weave.some(kind=>kind>=3))state.mix.harmony=30;
  }
  if (!draft.lines && draft.line?.length) state.lines = [draft.line];
  if (!draft.stones && draft.shape !== undefined) {
    Object.assign(state.stones[0], {shape:draft.shape,tone:draft.tone});
    state.picked = [0];
  }
} catch {}
let muted = false, live, active = [], playback = 0, cursorFrame;
const save = () => { try {localStorage.setItem('river-basket-draft',JSON.stringify(state));} catch {} };
const pitchAt = y => Math.max(0,Math.min(6,Math.round((.9-y)*7.5)));
const laneY = index => .9-index/7.5;
const selectedStones = () => state.picked.map(index=>state.stones[index]);
function stoneVoice(stone,t=0,d=1.05){
  const width=stone.shape, height=stone.height;
  return {f:stone.base*2**((width+height-50)/125),tone:stone.tone,t,d,voice:'stone'};
}
function stoneEnsemble(start=0){
  return selectedStones().map((stone,i)=>stoneVoice(stone,start+i*.36,1.3));
}
function riverNotes(){
  if(!state.lines.length) return [0,2,1,4,3,2].map((pitch,i)=>({pitch,t:i*step}));
  return state.lines.flatMap(line=>{
    const sorted=[...line].sort((a,b)=>a[0]-b[0]);
    const first=Math.round(sorted[0][0]*riverBeats), last=Math.round(sorted.at(-1)[0]*riverBeats);
    let point=0;
    return Array.from({length:last-first+1},(_,i)=>{
      const beat=first+i;
      while(point+1<sorted.length && Math.abs(sorted[point+1][0]-beat/riverBeats)<=Math.abs(sorted[point][0]-beat/riverBeats))point++;
      return {pitch:pitchAt(sorted[point][1]),t:beat*step};
    });
  });
}
function arrange(mode,index=state.selected){
  if(mode==='stone'){
    const sound=stoneVoice(state.stones[index]);
    return {sounds:[sound],length:sound.d+.05};
  }
  if(mode==='stones'){
    const sounds=stoneEnsemble();
    return {sounds,length:(sounds.at(-1)?.t??0)+1.35};
  }
  if(mode==='piano')return {sounds:[keysVoice(index,0)],length:keysTail};
  const notes=riverNotes();
  const sounds=notes.map(n=>keysVoice(n.pitch,n.t));
  const lastNote=Math.max(...notes.map(n=>n.t));
  if(mode!=='river'){
    const beats=[...new Set(notes.map(note=>note.t))].sort((a,b)=>a-b);
    const entrance=beats[Math.min(2,beats.length-1)]+step*.55;
    sounds.push(...stoneEnsemble(entrance));
    addEffects(sounds,notes,lastNote);
  }
  const length=Math.max(...sounds.map(sound=>sound.t+sound.d));
  return {sounds,length,lastNote};
}
function addEffects(sounds,notes,lastNote){
  const {delay,harmony,drums,wind}=state.mix;
  if(harmony) notes.forEach(({pitch,t})=>{
    sounds.push({...keysVoice(pitch,t),f:note(pitch)/2,level:.48*harmony/100});
  });
  if(delay) notes.forEach(({pitch,t})=>{
    for(const [lag,level] of [[step*.75,.48],[step*1.5,.23]]){
      sounds.push({...keysVoice(pitch,t+lag),level:level*delay/100,soft:true});
    }
  });
  if(drums){
    const bars=Math.floor(lastNote/step+1e-6);
    for(let i=0;i<=bars;i++){
      sounds.push({voice:i%4===0?'kick':'hat',t:i*step,d:i%4===0?.20:.085,level:drums/100});
    }
  }
  if(wind)sounds.push({voice:'wind',t:0,d:lastNote+keysTail,level:wind/100});
}
function keysVoice(pitch,t){
  return {f:note(pitch),t,d:keysTail,voice:'piano'};
}
function playKeys(ctx,f,when,d,level,soft){
  const end=when+d, fade=end-Math.min(.085,d*.25);
  const filter=ctx.createBiquadFilter(), release=ctx.createGain();
  filter.type='lowpass';
  filter.frequency.value=soft?1450:4200;
  filter.Q.value=.5;
  filter.connect(release).connect(ctx.destination);
  release.gain.setValueAtTime(1,when);
  release.gain.setValueAtTime(1,fade);
  release.gain.linearRampToValueAtTime(0,end);

  if(!soft&&d>.32){
    const delay=ctx.createDelay(.4), color=ctx.createBiquadFilter(), wet=ctx.createGain();
    delay.delayTime.value=.29;
    color.type='bandpass';
    color.frequency.value=1200;
    color.Q.value=.55;
    wet.gain.value=.16;
    filter.connect(delay).connect(color).connect(wet).connect(release);
  }

  return [1,.33,.115].map((amplitude,index)=>{
    const oscillator=ctx.createOscillator(), envelope=ctx.createGain();
    oscillator.frequency.value=f*(index+1);
    const peak=amplitude*level;
    envelope.gain.setValueAtTime(0,when);
    envelope.gain.linearRampToValueAtTime(peak,when+.015);
    envelope.gain.setTargetAtTime(peak*(index===0?.19:.055),when+.015,index===0?.19:.115);
    oscillator.connect(envelope).connect(filter);
    oscillator.start(when);
    oscillator.stop(end);
    return oscillator;
  });
}
function synth(ctx,plan,start){
  const sources=[];
  for(const {f,t,d,voice,tone=45,level=1,soft=false} of plan.sounds){
    const when=start+t;
    if(voice==='piano'){
      sources.push(...playKeys(ctx,f,when,d,level*.145/Math.max(1,state.lines.length)**.7,soft));
      continue;
    }
    const envelope=ctx.createGain();
    envelope.connect(ctx.destination);
    const peak=level*{wind:.15,stone:.148,kick:.20,hat:.16}[voice];
    envelope.gain.setValueAtTime(.0001,when);
    envelope.gain.exponentialRampToValueAtTime(peak,when+(voice==='wind'?.12:.012));
    if(voice==='stone')envelope.gain.exponentialRampToValueAtTime(peak*.43,when+d*.66);
    envelope.gain.exponentialRampToValueAtTime(.0001,when+d);
    if(voice==='wind'||voice==='hat'){
      const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*d),ctx.sampleRate);
      const data=buffer.getChannelData(0);
      let seed=987654321;
      for(let i=0;i<data.length;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        data[i]=seed/2147483648-1;
      }
      const source=ctx.createBufferSource(), filter=ctx.createBiquadFilter();
      source.buffer=buffer;filter.type=voice==='hat'?'highpass':'lowpass';filter.frequency.value=voice==='hat'?5500:430;
      source.connect(filter).connect(envelope);source.start(when);sources.push(source);
      continue;
    }
    if(voice==='kick'){
      const source=ctx.createOscillator();
      source.frequency.setValueAtTime(125,when);
      source.frequency.exponentialRampToValueAtTime(48,when+.11);
      source.connect(envelope);source.start(when);source.stop(when+d);
      sources.push(source);
      continue;
    }
    const harmonics=[1,tone/150,tone/360];
    harmonics.forEach((level,i)=>{
      const oscillator=ctx.createOscillator(), partial=ctx.createGain();
      oscillator.frequency.value=f*(i+1);
      partial.gain.setValueAtTime(Math.max(.0001,level),when);
      partial.gain.exponentialRampToValueAtTime(.0001,when+d*(i===0?1:.75-i*.15));
      oscillator.connect(partial).connect(envelope);
      oscillator.start(when);oscillator.stop(when+d);sources.push(oscillator);
    });
  }
  return sources;
}
async function reversed(plan){
  const ctx=new OfflineAudioContext(1,Math.ceil(plan.length*44100),44100);
  synth(ctx,plan,0);
  const buffer=await ctx.startRendering();
  buffer.getChannelData(0).reverse();
  return buffer;
}
function playBuffer(ctx,buffer,when){
  const source=ctx.createBufferSource();
  source.buffer=buffer;source.connect(ctx.destination);source.start(when);
  return source;
}
function stopAudio(){
  playback++;
  cancelAnimationFrame(cursorFrame);
  if($('playhead'))$('playhead').hidden=true;
  if(state.stage===1&&$('listen'))$('listen').textContent='▷ 播放旋律';
  active.forEach(source=>{try{source.stop();}catch{}});
  active=[];
}
function followRiver(start,plan,ticket){
  const cursor=$('playhead');
  if(!cursor)return;
  cursor.hidden=false;
  $('listen').textContent='■ 停止播放';
  function draw(){
    if(ticket!==playback)return;
    const elapsed=Math.max(0,live.currentTime-start);
    if(elapsed>=plan.length){
      cursor.hidden=true;
      $('listen').textContent='▷ 播放旋律';
      return;
    }
    cursor.style.left=`min(${100*Math.min(elapsed,plan.lastNote)/(riverBeats*step)}%, calc(100% - 2px))`;
    cursorFrame=requestAnimationFrame(draw);
  }
  draw();
}
async function play(mode,index){
  if(muted)return;
  stopAudio();
  const ticket=playback;
  try{
    live ||= new AudioContext();
    await live.resume();
    const plan=arrange(mode,index);
    const echo=mode==='reply'||(mode==='basket'&&state.echo)?await reversed(plan):null;
    if(ticket!==playback)return;
    const start=live.currentTime+.035;
    if(mode!=='reply')active=synth(live,plan,start);
    if(mode==='river')followRiver(start,plan,ticket);
    if(echo)active.push(playBuffer(live,echo,start+(mode==='reply'?0:plan.length)));
  }catch{if(ticket===playback)report('浏览器暂时无法播放声音。');}
}
function report(message){if($('status'))$('status').textContent=message;}
function render(){
  const s=state.stage, [title,label,desc]=stops[s];
  $('steps').innerHTML=stops.map(([name,sub],i)=>`<button data-step="${i}" ${i===s?'aria-current="step"':''}><span class="number">0${i+1}</span><span><strong>${name}</strong><small>${sub}</small></span></button>`).join('');
  const panels=[
    `<div class="pond stone-bank"><div class="stone-row" id="stones"></div><small>点按试听，横拉或竖捏改变形状和音高</small></div><div class="controls"><label for="shape">宽度</label><input id="shape" type="range"><label for="stone-height">高度</label><input id="stone-height" type="range"><label for="tone">音色明暗</label><input id="tone" type="range"><div class="stone-actions"><button class="secondary" id="pick"></button> <button class="secondary" id="listen">▷ 合奏试听</button></div><p class="picked" id="picked"></p></div>`,
    `<div class="river-sheet"><div id="lanes" class="lanes" aria-label="钢琴音阶"></div><div class="river-drawing"><canvas id="river" class="canvas" width="720" height="280" tabindex="0" aria-label="画旋律，可按上下方向键选音，空格添音，回车换行"></canvas><span id="playhead" class="playhead" aria-hidden="true" hidden></span></div></div><div class="controls"><p><strong>从下往上是 1 Do 到 7 Si。</strong> 点击左边的音名可以试听；从左往右决定播放时间。每抬一次笔，就留下一条新线。</p><p>键盘可用 ↑ ↓ 选音、空格添音、Enter 换行。</p><button class="secondary" id="listen">▷ 播放旋律</button> <button class="secondary" id="undo">撤销上一条</button> <button class="secondary" id="clear">清空</button><p id="river-count" class="picked"></p></div>`,
    `<div class="controls"><div id="mixer" class="mixer"></div></div><div class="controls mix-preview"><canvas id="mix-score" class="mix-score" width="600" height="140" aria-hidden="true"></canvas>${basketPreview()}</div>`,
    `<div class="pond reply">${state.heard?'「我把你篮子里的整段声音倒过来放。」':'「可以让我听听你的篮子吗？」'}</div><div class="controls"><button class="secondary" id="listen">▷ 听原来的整段</button> <button class="secondary" id="reply">▷ 听小伙伴的回响</button><p></p><label for="echo">把整段倒放也放进篮子 <input id="echo" type="checkbox" ${state.echo?'checked':''}></label></div>`,
    `<div class="postcard"><span id="cardName"></span></div><div class="controls"><label for="name">明信片名字</label><input id="name" type="text" maxlength="40" placeholder="一篮河岸的声音"><p></p><button class="secondary" id="listen">▷ 听明信片</button> <button class="secondary" id="download">下载声音与图片</button></div>`
  ];
  $('workbench').innerHTML=`<span class="chapter">第 0${s+1} 站 · ${label}</span><h2 tabindex="-1" id="stage-title">${title}</h2><p>${desc}</p><div class="stage-grid">${panels[s]}</div><div class="actions"><span class="status" id="status" role="status">${s===4?'水留在河里，声音带回家。':'随时可以回到上一站修改。'}</span><button class="primary" id="next">${s===4?'保存明信片':'下一站 · '+stops[s+1][0]+' →'}</button></div>`;
  $('listen').onclick=()=>{
    if(s===1&&!$('playhead').hidden)stopAudio();
    else play(['stones','river','arrangement','arrangement','basket'][s]);
  };
  $('next').onclick=()=>s<4?go(s+1,true):saveCard();
  if(s===0) bindStone();
  if(s===1) bindRiver();
  if(s===2) bindMixer();
  if(s===3){
    $('reply').onclick=()=>{state.heard=true;save();document.querySelector('.reply').textContent='「我把你篮子里的整段声音倒过来放。」';play('reply');};
    $('echo').onchange=e=>{state.echo=e.target.checked;save();};
  }
  if(s===4){
    $('name').value=state.name;
    const update=()=>{$('cardName').textContent=state.name.trim()||'一篮河岸的声音';};
    $('name').oninput=e=>{state.name=e.target.value;save();update();};update();
    $('download').onclick=downloadCard;
  }
}
function go(stage,focus=false){
  stopAudio();state.stage=stage;save();render();
  if(focus) $('stage-title').focus();
}
function stoneShape(stone){
  return `--stone-x:${.68+stone.shape*.0064};--stone-y:${.68+stone.height*.0064}`;
}
function basketPreview(){
  const stones=selectedStones();
  const contents=stones.map(stone=>`<span class="basket-pebble" style="${stoneShape(stone)}"></span>`).join('');
  const count=stones.length?`篮里有 ${stones.length} 块声石`:'篮里还没有声石';
  return `<div class="basket-preview"><div class="mini-basket" aria-hidden="true"><div class="basket-pebbles">${contents}</div></div><div><strong>篮中合奏</strong><p>${count}。试听会把第一站的声石合奏、河流旋律和选好的效果一起播放。</p><button class="secondary" id="listen">▷ 听合奏</button></div></div>`;
}
function bindStone(){
  const shape=$('shape'), height=$('stone-height'), tone=$('tone'), row=$('stones');
  row.innerHTML=state.stones.map((stone,i)=>`<button class="stone" data-stone="${i}" aria-label="第 ${i+1} 块声石" aria-pressed="false"><span aria-hidden="true"></span></button>`).join('');
  const controls={shape,height,tone};
  function update(){
    const current=state.stones[state.selected], inBasket=state.picked.includes(state.selected);
    for(const [key,input] of Object.entries(controls))input.value=current[key];
    $('pick').textContent=inBasket?'拿出篮子':'＋ 放进篮子';
    $('picked').textContent=state.picked.length?`篮中有 ${state.picked.length} 块声石`:'篮子还空着';
    $('listen').disabled=!state.picked.length;
    [...row.children].forEach((button,i)=>{
      button.firstElementChild.style.cssText=stoneShape(state.stones[i]);
      button.setAttribute('aria-pressed',String(state.selected===i));
      button.classList.toggle('packed',state.picked.includes(i));
    });
    save();
  }
  for(const [key,input] of Object.entries(controls))input.oninput=()=>{
    state.stones[state.selected][key]=+input.value;update();
  };
  $('pick').onclick=()=>{
    const index=state.selected;
    state.picked=state.picked.includes(index)?state.picked.filter(i=>i!==index):[...state.picked,index];
    update();
  };
  for(const button of row.children){
    const index=+button.dataset.stone;
    let drag;
    button.onpointerdown=e=>{
      if(drag)return;
      state.selected=index;update();
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,shape:+shape.value,height:+height.value};
      button.setPointerCapture(e.pointerId);
    };
    button.onpointermove=e=>{
      if(drag?.id!==e.pointerId)return;
      const clamp=value=>Math.max(0,Math.min(100,value));
      const stone=state.stones[index];
      stone.shape=clamp(drag.shape+e.clientX-drag.x);
      stone.height=clamp(drag.height+e.clientY-drag.y);
      update();
    };
    button.onpointerup=button.onpointercancel=button.onlostpointercapture=e=>{if(drag?.id===e.pointerId)drag=null;};
    button.onclick=()=>{state.selected=index;update();play('stone',index);};
  }
  update();
}
function bindRiver(){
  const canvas=$('river'), ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height;
  const colors=['#f7fff5','#d6fcf6','#ffffc8','#d4e7ff','#ffe7dd'];
  let line=null, keyboardLine=null, selected=0;
  $('lanes').innerHTML=syllables.map((name,i)=>`<button data-pitch="${i}" style="top:${laneY(i)*100}%">${i+1} ${name}</button>`).join('');
  $('lanes').onclick=e=>{const button=e.target.closest('button');if(button){selected=+button.dataset.pitch;draw();play('piano',selected);}};
  function draw(){
    ctx.clearRect(0,0,w,h);
    for(let i=0;i<7;i++){
      ctx.beginPath();ctx.strokeStyle=i===selected?'#e8ffffba':'#e8ffff50';ctx.lineWidth=i===selected?2:1;
      ctx.moveTo(0,laneY(i)*h);ctx.lineTo(w,laneY(i)*h);ctx.stroke();
    }
    ctx.strokeStyle='#d5f7f348';ctx.lineWidth=1;
    for(let i=0;i<=riverBeats;i++){
      const x=i*w/riverBeats;
      ctx.beginPath();ctx.moveTo(x,h-12);ctx.lineTo(x,h-4);ctx.stroke();
    }
    ctx.lineWidth=3.5;ctx.lineCap='round';ctx.lineJoin='round';
    state.lines.forEach((points,index)=>{
      ctx.strokeStyle=colors[index%colors.length];ctx.beginPath();
      points.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));
      if(points.length===1)ctx.lineTo(points[0][0]*w+.1,points[0][1]*h);
      ctx.stroke();
    });
    $('river-count').textContent=state.lines.length?`已经画了 ${state.lines.length} 条河线`:'还没画线时，可以试听示例。';
    $('undo').disabled=$('clear').disabled=!state.lines.length;
  }
  function addPoint(e){
    const r=canvas.getBoundingClientRect(), clamp=v=>Math.max(0,Math.min(1,v));
    const y=clamp((e.clientY-r.top)/r.height);
    line.push([clamp((e.clientX-r.left)/r.width),y]);draw();
  }
  canvas.onpointerdown=e=>{
    if(line)return;
    if(state.lines.length>=16){report('已经画了 16 条，把一条擦掉就能继续画。');return;}
    stopAudio();keyboardLine=null;
    canvas.setPointerCapture(e.pointerId);line=[];state.lines.push(line);addPoint(e);
  };
  canvas.onpointermove=e=>{if(line&&canvas.hasPointerCapture(e.pointerId)&&line.length<700)addPoint(e);};
  canvas.onpointerup=canvas.onpointercancel=e=>{if(canvas.hasPointerCapture(e.pointerId)){line=null;save();}};
  canvas.onlostpointercapture=()=>{if(line){line=null;save();}};
  canvas.onkeydown=e=>{
    if(!['ArrowUp','ArrowDown',' ','Enter'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='Enter'){keyboardLine=null;return;}
    if(e.key!==' '){
      selected=Math.max(0,Math.min(6,selected+(e.key==='ArrowUp'?1:-1)));
    }else{
      if(!keyboardLine||keyboardLine.length>=16){
        if(state.lines.length>=16){report('已经画了 16 条，把一条擦掉就能继续画。');return;}
        keyboardLine=[];state.lines.push(keyboardLine);
      }
      keyboardLine.push([keyboardLine.length/riverBeats,laneY(selected)]);save();
    }
    play('piano',selected);draw();
  };
  $('undo').onclick=()=>{stopAudio();state.lines.pop();line=keyboardLine=null;save();draw();};
  $('clear').onclick=()=>{stopAudio();state.lines=[];line=keyboardLine=null;save();draw();};
  draw();
}
function bindMixer(){
  const mixer=$('mixer');
  mixer.innerHTML=effects.map(({key,name,description})=>`<div class="effect">
    <label for="mix-${key}"><strong>${name}</strong><output id="amount-${key}"></output></label>
    <small id="about-${key}">${description}</small>
    <input type="range" id="mix-${key}" min="0" max="100" value="${state.mix[key]}" aria-describedby="about-${key}">
  </div>`).join('');
  for(const {key} of effects){
    const input=$('mix-'+key), output=$('amount-'+key);
    const update=()=>{output.textContent=input.value==='0'?'关闭':input.value+'%';};
    input.oninput=()=>{state.mix[key]=+input.value;update();drawMixScore();save();};
    update();
  }
  drawMixScore();
}
function drawMixScore(){
  const canvas=$('mix-score'), ctx=canvas.getContext('2d');
  const {width,height}=canvas;
  ctx.clearRect(0,0,width,height);
  const curve=(x,layer)=>height*(.27+layer*.145)+Math.sin(x/width*Math.PI*(2+layer*.43)+layer*1.34)*(5+state.mix[effects[layer].key]*.24);
  ctx.lineWidth=1;
  effects.forEach(({key},layer)=>{
    ctx.strokeStyle=state.mix[key]?'#d2fff4a0':'#d2fff44d';
    ctx.beginPath();
    for(let x=8;x<width-8;x+=3){
      const y=curve(x,layer);
      if(x===8)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });
  ctx.strokeStyle='#c7f8ec57';
  ctx.beginPath();
  for(let x=9;x<width-8;x+=5){
    ctx.moveTo(x,curve(x,0));ctx.lineTo(x,curve(x,3));
  }
  ctx.stroke();
}
function saveCard(){
  const name=state.name.trim()||'一篮河岸的声音';
  try{
    localStorage.setItem('river-basket-postcard',JSON.stringify({...state,name}));
    report('已保存「'+name+'」。今天这一篮，刚刚好。');
  }catch{report('本机存储不可用，可以下载声音与图片。');}
}
function download(blob,name){
  const link=document.createElement('a'), url=URL.createObjectURL(blob);
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
function wav(audio) {
  const samples=audio.getChannelData(0), bytes=new ArrayBuffer(44+2*samples.length), v=new DataView(bytes);
  const tag=(offset,value)=>[...value].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
  tag(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,audio.sampleRate,true);v.setUint32(28,audio.sampleRate*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,samples.length*2,true);
  samples.forEach((sample,i)=>v.setInt16(44+i*2,Math.max(-1,Math.min(1,sample))*32767,true));
  return new Blob([bytes],{type:'audio/wav'});
}
async function downloadCard(){
  const title=state.name.trim()||'一篮河岸的声音', name=title.replace(/[\\/:*?"<>|]/g,'_');
  try{
    const plan=arrange('basket');
    const echo=state.echo?await reversed(plan):null;
    const ctx=new OfflineAudioContext(1,Math.ceil(plan.length*44100)+(echo?.length??0),44100);
    synth(ctx,plan,0);
    if(echo)playBuffer(ctx,echo,plan.length);
    const image=new Image();image.src='river.webp';
    const [audio]=await Promise.all([ctx.startRendering(),image.decode()]);
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=550;
    const g=canvas.getContext('2d'), scale=Math.max(1280/image.width,550/image.height), w=image.width*scale,h=image.height*scale;
    g.drawImage(image,(1280-w)/2,(550-h)/2,w,h);
    const fade=g.createLinearGradient(0,330,0,550);fade.addColorStop(0,'transparent');fade.addColorStop(1,'#1d392b');
    g.fillStyle=fade;g.fillRect(0,330,1280,220);g.fillStyle='#fbf5e8';g.font='bold 44px serif';g.fillText(title,48,463,1170);
    g.font='22px serif';g.fillText('水留在河里，声音带回家。',48,510);
    const picture=await new Promise(resolve=>canvas.toBlob(resolve));
    if(!picture)throw Error('image');
    // Give each format its own user-activated link so browsers can allow either download.
    const status=$('status');if(!status)return;
    status.replaceChildren();
    for(const [blob,filename,label] of [[picture,name+'.png','下载 PNG'],[wav(audio),name+'.wav','下载 WAV']]){
      const button=document.createElement('button');button.className='secondary';button.textContent=label;button.onclick=()=>download(blob,filename);
      if(status.childNodes.length)status.append(' ');
      status.append(button);
    }
  }catch{report('暂时无法生成下载，请再试一次。');}
}
$('steps').onclick=e=>{const button=e.target.closest('[data-step]');if(button)go(+button.dataset.step,true);};
$('story').onclick=()=>$('intro').showModal();
$('sound').onclick=()=>{
  muted=!muted;if(muted)stopAudio();
  $('sound').textContent=muted?'♪　声音关闭':'♪　声音开启';
  $('sound').setAttribute('aria-pressed',String(muted));
};
render();
