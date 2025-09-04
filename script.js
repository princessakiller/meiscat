// Jammin Phonk — Line PRO
// - Strict beat sync using Spectral Flux onset detection
// - Single centered vertical line that grows downward
// - Rich info incl. IP/Geo via multiple fallbacks
(() => {
  const els = {
    start: document.getElementById('start'),
    clip: document.getElementById('clip'),
    music: document.getElementById('music'),
    stack: document.getElementById('stack'),
  };

  // ------- Collect rich info (do NOT render yet) -------
  const info = [];
  const nav = navigator;
  const intl = Intl.DateTimeFormat().resolvedOptions();
  const add = (k,v)=>{ if(v!==undefined && v!==null && v!=='') info.push([k,String(v)]) };

  add('User-Agent', nav.userAgent);
  add('UA Platform', nav.userAgentData && nav.userAgentData.platform);
  add('Brands', nav.userAgentData && nav.userAgentData.brands ? nav.userAgentData.brands.map(b=>b.brand+' '+b.version).join('; ') : undefined);
  add('Platform', nav.platform);
  add('Languages', (nav.languages||[]).join(', ') || nav.language);
  add('Timezone', intl.timeZone);
  add('Online', nav.onLine ? 'yes' : 'no');
  add('Cookies', nav.cookieEnabled ? 'enabled' : 'disabled');
  add('DoNotTrack', nav.doNotTrack || '—');
  add('Cores', nav.hardwareConcurrency || '—');
  add('Memory', nav.deviceMemory ? nav.deviceMemory+' GB' : '—');
  add('Screen', screen.width+'x'+screen.height);
  add('AvailScreen', (screen.availWidth||screen.width)+'x'+(screen.availHeight||screen.height));
  add('DPR', devicePixelRatio);
  add('ColorDepth', screen.colorDepth);
  add('Orientation', (screen.orientation && screen.orientation.type) || '—');
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
      add('GLSL', gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
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
    const urls=[
      'https://ipapi.co/json/',
      'https://api.ipify.org?format=json',
      'https://ifconfig.co/json'
    ];
    for (const u of urls){
      try{
        const r=await fetch(u, {cache:'no-store'});
        const j=await r.json();
        const ip=j.ip||j.IP||j.IPv4||j.ip_addr;
        if (ip) add('IP', ip);
        const loc=[j.city, j.region||j.region_name, j.country_name||j.country].filter(Boolean).join(', ');
        if (loc) add('Location', loc);
        break;
      }catch(e){}
    }
  }
  addIP();

  // Queue (will reveal on beats only)
  const queue = [...info];
  const seen = new Set(queue.map(([k,v])=>k+'='+v));
  // Poll to add async fields (IP/Battery) after they arrive
  const asyncPoll = setInterval(() => {
    for (const [k,v] of info){
      const key=k+'='+v;
      if (!seen.has(key)){ seen.add(key); queue.push([k,v]); }
    }
  }, 800);

  function appendKV(k,v){
    const node=document.createElement('div');
    node.className='kv';
    node.innerHTML=`<span class="k">${k}:</span><span class="v">${v}</span>`;
    els.stack.appendChild(node);
    requestAnimationFrame(()=>node.classList.add('on'));
  }

  // ------- Robust beat detection: Spectral Flux with adaptive threshold -------
  let ac, analyser, prevSpec=null, fluxHistory=[], fluxThreshold=0;
  function setupAudio(){
    ac=new (window.AudioContext||window.webkitAudioContext)();
    const src=ac.createMediaElementSource(els.music);
    analyser=ac.createAnalyser();
    analyser.fftSize=2048;
    analyser.smoothingTimeConstant=0.0; // important for spectral flux
    src.connect(analyser); src.connect(ac.destination);
  }

  const spec = new Float32Array(1024);
  let lastBeatTime = 0;
  function detectOnset(){
    analyser.getFloatFrequencyData(spec);
    // half-wave rectified spectral flux
    let flux=0;
    if (prevSpec){
      for (let i=1;i<64;i++){ // focus on bass/low-mids bins for phonk (approx < ~350Hz)
        const v = spec[i];
        const p = prevSpec[i];
        const diff = v - p;
        if (diff > 0) flux += diff;
      }
    }
    prevSpec = spec.slice();

    // Adaptive threshold = median of last N flux + offset
    fluxHistory.push(flux);
    if (fluxHistory.length > 43) fluxHistory.shift(); // ~0.7s window at ~60fps
    const sorted = fluxHistory.slice().sort((a,b)=>a-b);
    const median = sorted.length ? sorted[Math.floor(sorted.length/2)] : 0;
    const threshold = median + 1.5; // sensitivity

    const now = ac.currentTime;
    const cooldown = 0.12; // ~120ms between onsets
    const isOnset = flux > threshold && (now - lastBeatTime) > cooldown;

    if (isOnset){
      lastBeatTime = now;
      if (queue.length){
        const [k,v] = queue.shift();
        appendKV(k,v);
      }
    }
    // schedule next check
    requestAnimationFrame(detectOnset);
  }

  // Fallback if audio couldn't start or there's no detectable flux
  const safetyTimer = setInterval(() => {
    if (!ac || !analyser){
      if (queue.length){
        const [k,v]=queue.shift();
        appendKV(k,v);
      }
    }
  }, 1800);

  // Keep video alive when returning to tab
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden){
      els.clip.play().catch(()=>{});
    }
  });

  // Start everything on user click (required for mobile + strict policy)
  els.start.addEventListener('click', async()=>{
    try{
      if (!ac) setupAudio();
      await ac.resume();
      els.music.currentTime = 0;
      els.clip.currentTime = 0;
      await els.music.play();
      els.clip.play().catch(()=>{});
      els.start.style.display='none';
      requestAnimationFrame(detectOnset);
    }catch(e){
      alert('Не удалось запустить медиа. Попробуйте снова.');
    }
  });
})();