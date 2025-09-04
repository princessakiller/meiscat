(() => {
  const els = {
    start: document.getElementById('start'),
    clip: document.getElementById('clip'),
    music: document.getElementById('music'),
    cols: [...document.querySelectorAll('.col')],
  };

  const info = [];
  const nav = navigator;
  const intl = Intl.DateTimeFormat().resolvedOptions();
  const add = (k,v)=>{ if(v) info.push([k,String(v)]) };

  add('User-Agent', nav.userAgent);
  add('Platform', nav.platform);
  add('Languages', (nav.languages||[]).join(', ') || nav.language);
  add('Timezone', intl.timeZone);
  add('Online', nav.onLine ? 'yes' : 'no');
  add('Cookies', nav.cookieEnabled ? 'enabled' : 'disabled');
  add('DoNotTrack', nav.doNotTrack || '—');
  add('Cores', nav.hardwareConcurrency);
  add('Memory', nav.deviceMemory ? nav.deviceMemory+' GB' : '—');
  add('Screen', screen.width+'x'+screen.height);
  add('DPR', devicePixelRatio);
  add('ColorDepth', screen.colorDepth);
  add('Referrer', document.referrer || '—');
  add('Connection', (nav.connection && (nav.connection.effectiveType || nav.connection.type)) || '—');

  try{
    const c=document.createElement('canvas');
    const gl=c.getContext('webgl');
    const dbg=gl&&gl.getExtension('WEBGL_debug_renderer_info');
    if(gl){
      add('GPU Vendor', dbg? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL): gl.getParameter(gl.VENDOR));
      add('GPU Renderer', dbg? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL): gl.getParameter(gl.RENDERER));
      add('WebGL Version', gl.getParameter(gl.VERSION));
    }
  }catch(e){}

  try{
    const c2=document.createElement('canvas'); c2.width=200; c2.height=40;
    const g=c2.getContext('2d');
    g.fillStyle='#000'; g.fillRect(0,0,200,40);
    g.fillStyle='#fff'; g.font='16px monospace'; g.fillText(nav.userAgent,10,24);
    add('CanvasSig', btoa(c2.toDataURL()).length);
  }catch(e){}

  if(nav.getBattery){
    nav.getBattery().then(b=>{
      add('Battery', Math.round(b.level*100)+'%'+(b.charging?' (charging)':''));
    }).catch(()=>{});
  }

  async function addIP(){
    try{
      const r=await fetch('https://ipapi.co/json/');
      const j=await r.json();
      add('IP', j.ip); add('Location', j.city+', '+j.country_name);
    }catch(e){}
  }
  addIP();

  const queue=[...info];
  let colIdx=0;
  function appendKV(k,v){
    const node=document.createElement('div');
    node.className='kv';
    node.innerHTML=`<span class="k">${k}:</span><span class="v">${v}</span>`;
    const col=els.cols[colIdx%els.cols.length]; colIdx++;
    col.appendChild(node);
    requestAnimationFrame(()=>node.classList.add('on'));
  }

  let ac, analyser, freq, lastBeat=0, mean=0;
  const COOLDOWN=140, ALPHA=0.93;
  function setupAudio(){
    ac=new (window.AudioContext||window.webkitAudioContext)();
    const src=ac.createMediaElementSource(els.music);
    analyser=ac.createAnalyser();
    analyser.fftSize=1024;
    analyser.smoothingTimeConstant=0.6;
    src.connect(analyser); src.connect(ac.destination);
    freq=new Uint8Array(analyser.frequencyBinCount);
  }

  function loop(){
    requestAnimationFrame(loop);
    if(!analyser) return;
    analyser.getByteFrequencyData(freq);
    let bass=0,n=0; for(let i=1;i<8;i++){bass+=freq[i];n++;}
    bass=n?bass/n:0;
    mean=ALPHA*mean+(1-ALPHA)*bass;
    const threshold=mean+12;
    const now=performance.now();
    const isBeat=bass>threshold&&(now-lastBeat)>COOLDOWN;
    if(isBeat){
      lastBeat=now;
      if(queue.length){ const [k,v]=queue.shift(); appendKV(k,v); }
    }
  }

  // Fallback: if no beats detected, reveal one item every 2s
  setInterval(()=>{
    if(queue.length && (!ac || !analyser)){
      const [k,v]=queue.shift(); appendKV(k,v);
    }
  },2000);

  els.start.addEventListener('click',async()=>{
    try{
      if(!ac) setupAudio();
      await ac.resume();
      els.music.currentTime=0; els.clip.currentTime=0;
      await els.music.play();
      els.clip.play().catch(()=>{});
      els.start.style.display='none';
      loop();
    }catch(e){ alert('Не удалось запустить'); }
  });
})();