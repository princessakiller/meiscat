// Jammin Phonk — Line PRO 3
(() => {
  const INTRO_SKIP_SEC = 6.0;       // через сколько секунд начинать показ
  const HOLD_AFTER_FULL_SEC = 5.0;  // держать весь список на экране перед перезапуском

  const els = {
    start: document.getElementById('start'),
    clip: document.getElementById('clip'),
    music: document.getElementById('music'),
    stack: document.getElementById('stack'),
  };

  let started=false, startAudioTime=0;

  // ==== Сбор инфы (не показываем до старта) ====
  const info = [];
  const nav = navigator;
  const intl = Intl.DateTimeFormat().resolvedOptions();
  const add=(k,v)=>{ if(v!==undefined && v!==null && v!=='') info.push([k,String(v)]) };

  add('User-Agent', nav.userAgent);
  add('Platform', nav.platform);
  add('Languages', (nav.languages||[]).join(', ') || nav.language);
  add('Timezone', intl.timeZone);
  add('Online', nav.onLine ? 'yes' : 'no');
  add('Cookies', nav.cookieEnabled ? 'enabled' : 'disabled');
  add('DoNotTrack', nav.doNotTrack || '—');
  add('Cores', nav.hardwareConcurrency || '—');
  add('Memory', nav.deviceMemory ? nav.deviceMemory+' GB' : '—');
  add('Screen', screen.width+'x'+screen.height);
  add('DPR', devicePixelRatio);
  add('ColorDepth', screen.colorDepth);
  add('Referrer', document.referrer || '—');
  add('Connection', (nav.connection && (nav.connection.effectiveType || nav.connection.type)) || '—');

  try{
    const c=document.createElement('canvas');
    const gl=c.getContext('webgl') || c.getContext('experimental-webgl');
    const dbg=gl&&gl.getExtension('WEBGL_debug_renderer_info');
    if(gl){
      add('GPU Vendor', dbg? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL): gl.getParameter(gl.VENDOR));
      add('GPU Renderer', dbg? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL): gl.getParameter(gl.RENDERER));
      add('WebGL Version', gl.getParameter(gl.VERSION));
    }
  }catch(e){}

  try{
    const c2=document.createElement('canvas'); c2.width=200; c2.height=40;
    const g=c2.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,200,40);
    g.fillStyle='#fff'; g.font='16px monospace'; g.fillText(nav.userAgent,10,24);
    add('CanvasSig', btoa(c2.toDataURL()).length);
  }catch(e){}

  if(nav.getBattery){
    nav.getBattery().then(b=>{
      add('Battery', Math.round(b.level*100)+'%'+(b.charging?' (charging)':''));
    }).catch(()=>{});
  }

  async function addIP(){
    const urls=['https://ipapi.co/json/','https://api.ipify.org?format=json','https://ifconfig.co/json'];
    for(const u of urls){
      try{
        const r=await fetch(u,{cache:'no-store'});
        const j=await r.json();
        const ip=j.ip||j.IP||j.IPv4||j.ip_addr;
        if(ip) add('IP', ip);
        const loc=[j.city, j.region||j.region_name, j.country_name||j.country].filter(Boolean).join(', ');
        if(loc) add('Location', loc);
        break;
      }catch(e){}
    }
  }
  addIP();

  // ==== Очередь и циклы ====
  let baseSnapshot=[], queue=[], holdUntil=null;
  function resetCycle(){
    baseSnapshot = info.slice();
    queue = baseSnapshot.slice();
    holdUntil = null;
    els.stack.innerHTML = '';
  }

  function appendKV(k,v){
    const node=document.createElement('div');
    node.className='kv';
    node.innerHTML=`<span class="k">${k}:</span><span class="v">${v}</span>`;
    els.stack.appendChild(node);
    requestAnimationFrame(()=>node.classList.add('on'));
  }

  // ==== Детектор бита (spectral flux) ====
  let ac, analyser, prevSpec=null;
  function setupAudio(){
    ac = new (window.AudioContext||window.webkitAudioContext)();
    const src = ac.createMediaElementSource(els.music);
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.0;
    src.connect(analyser); src.connect(ac.destination);
  }

  const spec=new Float32Array(1024);
  let fluxHistory=[], lastBeatTime=0;

  function detectOnset(){
    if(!started) return;
    analyser.getFloatFrequencyData(spec);
    let flux=0;
    if(prevSpec){
      for(let i=1;i<64;i++){ const d=spec[i]-prevSpec[i]; if(d>0) flux+=d; }
    }
    prevSpec = spec.slice();
    fluxHistory.push(flux);
    if(fluxHistory.length>43) fluxHistory.shift();
    const sorted = fluxHistory.slice().sort((a,b)=>a-b);
    const median = sorted.length ? sorted[Math.floor(sorted.length/2)] : 0;
    const threshold = median + 1.5;

    const now = ac.currentTime;
    const elapsed = now - startAudioTime;
    const cooldown = 0.12;
    const canReveal = elapsed >= INTRO_SKIP_SEC && (!holdUntil || now >= holdUntil);
    const isOnset = canReveal && (flux > threshold) && (now - lastBeatTime > cooldown);

    if(isOnset){
      lastBeatTime = now;
      if(queue.length){
        const [k,v]=queue.shift();
        appendKV(k,v);
        if(!queue.length){
          holdUntil = now + HOLD_AFTER_FULL_SEC; // держим 5с
        }
      }else if(holdUntil && now >= holdUntil){
        resetCycle(); // старт нового круга
      }
    }
    requestAnimationFrame(detectOnset);
  }

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){
      els.clip.play().catch(()=>{});
      if(started) els.music.play().catch(()=>{});
    }
  });

  els.start.addEventListener('click', async()=>{
    try{
      if(!ac) setupAudio();
      await ac.resume();
      els.music.currentTime=0; els.clip.currentTime=0;
      await els.music.play();
      els.clip.play().catch(()=>{});
      els.start.style.display='none';
      started=true;
      startAudioTime = ac.currentTime;
      resetCycle();
      requestAnimationFrame(detectOnset);
    }catch(e){
      alert('Не удалось запустить медиа. Попробуйте снова.');
    }
  });

  // Когда трек закончился — останавливаемся
  els.music.addEventListener('ended', ()=>{ started=false; });
})();