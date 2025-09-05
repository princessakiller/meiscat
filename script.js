// Jammin Phonk — Line PRO 5
(() => {
  const INTRO_SKIP_SEC = 6.0;
  const HOLD_AFTER_FULL_SEC = 5.0;

  const els = {
    start: document.getElementById('start'),
    clip: document.getElementById('clip'),
    music: document.getElementById('music'),
    stack: document.getElementById('stack'),
  };

  let started=false, startAudioTime=0;

  // ===== Collect MANY fields (no render yet) =====
  const info = [];
  const nav = navigator;
  const intl = Intl.DateTimeFormat().resolvedOptions();
  const loc = window.location;
  const add=(k,v)=>{ if(v!==undefined && v!==null && v!=='') info.push([k,String(v)]) };

  // UA & platform
  add('User-Agent', nav.userAgent);
  add('UA Platform', nav.userAgentData && nav.userAgentData.platform);
  add('UA Brands', nav.userAgentData && nav.userAgentData.brands ? nav.userAgentData.brands.map(b=>b.brand+' '+b.version).join('; ') : undefined);
  add('Platform', nav.platform);
  add('Vendor', nav.vendor);
  add('AppVersion', nav.appVersion);
  add('Product', nav.product);
  add('MaxTouchPoints', nav.maxTouchPoints);
  add('Languages', (nav.languages||[]).join(', ') || nav.language);

  // Time/zone
  add('Timezone', intl.timeZone);
  add('TZ Offset', new Date().getTimezoneOffset());
  add('Locale', intl.locale);
  add('Date', new Date().toLocaleString());

  // URL parts
  add('URL', loc.href);
  add('Origin', loc.origin);
  add('Host', loc.host);
  add('Path', loc.pathname);
  add('Search', loc.search);

  // Screen/viewport
  add('Screen', screen.width+'x'+screen.height);
  add('AvailScreen', (screen.availWidth||screen.width)+'x'+(screen.availHeight||screen.height));
  add('Viewport', innerWidth+'x'+innerHeight);
  add('DPR', devicePixelRatio);
  add('ColorDepth', screen.colorDepth);
  add('Orientation', (screen.orientation && screen.orientation.type) || '—');

  // Privacy/network
  add('Online', nav.onLine ? 'yes' : 'no');
  add('Cookies', nav.cookieEnabled ? 'enabled' : 'disabled');
  add('DoNotTrack', nav.doNotTrack || '—');
  add('Referrer', document.referrer || '—');
  add('Connection', (nav.connection && (nav.connection.effectiveType || nav.connection.type || nav.connection.downlink+'Mbps')) || '—');

  // Hardware
  add('Cores', nav.hardwareConcurrency || '—');
  add('Memory', nav.deviceMemory ? nav.deviceMemory+' GB' : '—');

  // Storage estimate
  if (navigator.storage && navigator.storage.estimate){
    navigator.storage.estimate().then(e=>{
      add('Storage Quota', e.quota ? Math.round(e.quota/1024/1024)+' MB' : '—');
      add('Storage Usage', e.usage ? Math.round(e.usage/1024/1024)+' MB' : '—');
    });
  }

  // WebGL / GPU
  try{
    const c=document.createElement('canvas');
    const gl=c.getContext('webgl') || c.getContext('experimental-webgl');
    const dbg=gl&&gl.getExtension('WEBGL_debug_renderer_info');
    if(gl){
      add('GPU Vendor', dbg? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL): gl.getParameter(gl.VENDOR));
      add('GPU Renderer', dbg? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL): gl.getParameter(gl.RENDERER));
      add('WebGL Version', gl.getParameter(gl.VERSION));
      add('GLSL', gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
    }
  }catch(e){}

  // Canvas signature
  try{
    const c2=document.createElement('canvas'); c2.width=220; c2.height=50;
    const g=c2.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,c2.width,c2.height);
    g.fillStyle='#fff'; g.font='16px monospace'; g.fillText(nav.userAgent,8,28);
    add('CanvasSig', btoa(c2.toDataURL()).length);
  }catch(e){}

  // Battery
  if (nav.getBattery){
    nav.getBattery().then(b=>{
      add('Battery', Math.round(b.level*100)+'%'+(b.charging?' (charging)':''));
    }).catch(()=>{});
  }

  // Permissions
  if (navigator.permissions && navigator.permissions.query){
    ['geolocation','notifications','camera','microphone','clipboard-read','clipboard-write'].forEach(name=>{
      navigator.permissions.query({name}).then(r=>add('Perm '+name, r.state)).catch(()=>{});
    });
  }

  // Media devices (counts)
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices){
    navigator.mediaDevices.enumerateDevices().then(list=>{
      const a=list.reduce((acc,d)=>{acc[d.kind]=(acc[d.kind]||0)+1;return acc;},{});
      add('Devices audioinput', a.audioinput||0);
      add('Devices audiooutput', a.audiooutput||0);
      add('Devices videoinput', a.videoinput||0);
    }).catch(()=>{});
  }

  // Performance
  if (performance && performance.now){
    add('Perf now(ms)', Math.round(performance.now()));
    if (performance.memory){
      add('JS Heap Used', Math.round(performance.memory.usedJSHeapSize/1024/1024)+' MB');
      add('JS Heap Limit', Math.round(performance.memory.jsHeapSizeLimit/1024/1024)+' MB');
    }
  }

  // Storage availability
  try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); add('localStorage','ok'); }catch(e){ add('localStorage','blocked'); }
  try{ sessionStorage.setItem('__t','1'); sessionStorage.removeItem('__t'); add('sessionStorage','ok'); }catch(e){ add('sessionStorage','blocked'); }

  // IP + Geo with fallbacks
  (async function addIP(){
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
  })();

  // ===== Queue & cycles =====
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
    // clamp long values to avoid wrap; ellipsis via CSS
    node.innerHTML=`<span class="k">${k}:</span><span class="v">${v}</span>`;
    els.stack.appendChild(node);
    requestAnimationFrame(()=>{ node.classList.add('on'); node.classList.add('shake'); setTimeout(()=>node.classList.remove('shake'), 320); });
  }

  // ===== Beat detection: Spectral Flux on low bins =====
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
    const threshold = median + 1.6; // чуть строже, чтобы реагировать на жирные биты
    const cooldown = 0.14; // минимальный интервал
    const now = ac.currentTime;
    const elapsed = now - startAudioTime;
    const canReveal = elapsed >= INTRO_SKIP_SEC && (!holdUntil || now >= holdUntil);
    const isOnset = canReveal && flux > threshold && (now - lastBeatTime) > cooldown;

    if (isOnset){
      lastBeatTime = now;
      if (queue.length){
        const [k,v] = queue.shift();
        appendKV(k,v);
        if (!queue.length){
          holdUntil = now + HOLD_AFTER_FULL_SEC;
        }
      } else if (holdUntil && now >= holdUntil){
        resetCycle();
      }
    }
    requestAnimationFrame(detectOnset);
  }

  // Keep video alive
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){
      els.clip.play().catch(()=>{});
      if(started) els.music.play().catch(()=>{});
    }
  });

  // Start
  els.start.addEventListener('click', async()=>{
    try{
      if(!ac) setupAudio();
      await ac.resume();
      els.music.currentTime=0; els.clip.currentTime=0;
      await els.music.play();
      els.clip.play().catch(()=>{});
      els.start.style.display='none';
      started = true;
      startAudioTime = ac.currentTime;
      resetCycle();
      requestAnimationFrame(detectOnset);
    }catch(e){
      alert('Не удалось запустить медиа. Попробуйте снова.');
    }
  });

  // Stop when track ends
  els.music.addEventListener('ended', ()=>{ started=false; });
})();