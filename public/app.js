(async () => {
  const [{ initializeApp }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged },
    { getFirestore, doc, collection, getDoc, onSnapshot, query, orderBy, limit }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
  ]);
  const config = await fetch('/__/firebase/init.json');
  if (!config.ok) throw new Error('Firebase Hosting configuration is unavailable.');
  const app = initializeApp(await config.json());
  const auth = getAuth(app);
  // Live updates are required for the dashboard; standard realtime queries are intentional.
  const db = getFirestore(app, 'dca1');
  const provider = new GoogleAuthProvider();

  const $ = id => document.getElementById(id);
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const fmtMoney = value => numeric(value) ? '$' + Number(value).toFixed(2) : '—';
  const fmtPct = value => numeric(value) ? Number(value).toFixed(2) + '%' : '—';
  const text = value => value == null ? '—' : String(value);
  const dateText = value => { const d = value?.toDate ? value.toDate() : new Date(value); return value && !isNaN(d) ? d.toLocaleString() : 'Unknown time'; };
  let session = 0;
  let chartItems = [];
  let unsubCurrent = null;
  let unsubIterations = null;

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function el(tag, className, value) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (value != null) n.textContent = String(value);
    return n;
  }
  function metric(label, value, icon, accent) {
    const card = el('article', 'card metric-card ' + accent);
    card.append(el('span', 'metric-icon', icon), el('div', 'metric-label', label), el('div', 'metric-value', value));
    if (value.includes('—')) card.appendChild(el('div', 'metric-note', 'Not reported in this snapshot'));
    return card;
  }
  function setStatus(value) { $('status').textContent = value; $('status').dataset.state = value.startsWith('Live') ? 'live' : /failed|unavailable|removed/i.test(value) ? 'error' : 'waiting'; }

  async function signIn() {
    $('gateMessage').textContent = '';
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      $('gateMessage').textContent = err.message || 'Google sign-in failed.';
    }
  }

  function stopListeners() {
    if (unsubCurrent) unsubCurrent();
    if (unsubIterations) unsubIterations();
    unsubCurrent = unsubIterations = null;
  }

  async function authorize(user) {
    const access = await getDoc(doc(db, 'access', user.uid));
    return access.exists();
  }

  function signedOut() {
    session++;
    stopListeners();
    resetData();
    $('app').hidden = true;
    $('gate').hidden = false;
    $('signIn').hidden = false;
    $('signOut').hidden = true;
    $('userLabel').textContent = '';
    setStatus('Authentication required');
  }

  function resetData(message = 'Loading…') {
    ['kpis','campaigns','thinking','vault','learning','journal','response','direction','historyTable'].forEach(id => { clear($(id)); $(id).textContent = message; });
    $('waveBadge').textContent = '—'; $('waveMeta').textContent = '';
    $('iterationCount').textContent = '0';
    $('heroHeadline').textContent = 'Waiting for your next snapshot';
    $('heroScore').textContent = '—'; $('heroPhase').textContent = 'Awaiting signal';
    $('scoreGauge').style.setProperty('--score', '0%'); $('scoreGauge').setAttribute('aria-label', 'Wave score unavailable');
    $('campaignCount').textContent = 'Campaigns loading…';
    chartItems = []; drawWave([]);
  }

  function readError(err) {
    setStatus('Data unavailable · ' + (err.message || err));
    $('retry').hidden = false;
    if (err.code === 'permission-denied') {
      stopListeners(); resetData('Access was removed. Sign in with an authorized account.');
      $('app').hidden = true; $('gate').hidden = false;
      $('gateMessage').textContent = 'Dashboard access was removed or expired.';
    }
  }

  function listen() {
    stopListeners();
    resetData(); $('retry').hidden = true;
    const active = session;
    unsubCurrent = onSnapshot(doc(db, 'dashboard', 'current'),
      snap => {
        if (active !== session) return;
        if (!snap.exists()) {
          renderCurrent({});
          setStatus('Connected · waiting for first dashboard snapshot');
          return;
        }
        const data = snap.data();
        renderCurrent(data);
        const stamp = data.updated_at || data.timestamp;
        const stale = Date.now() - new Date(stamp).getTime() > 2 * 60 * 60 * 1000;
        setStatus((snap.metadata?.fromCache ? 'Cached' : stale ? 'Connected · snapshot is over 2 hours old' : 'Live') + ' · updated ' + dateText(stamp));
      },
      readError
    );

    unsubIterations = onSnapshot(query(collection(db, 'iterations'), orderBy('timestamp', 'desc'), limit(200)),
      snap => { if (active === session) renderIterations(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      err => {
        $('journal').textContent = 'Iteration history read failed: ' + err.message;
        readError(err);
      }
    );
  }

  function renderCurrent(data) {
    const portfolio = data.portfolio || data.reconciliation || {};
    const fee = data.fee_tier || portfolio.fee_tier || {};
    const wave = data.wave || data.wave_precursor || {};
    const vault = data.vault || data.synthetic_mining || {};
    const kpis = $('kpis');
    clear(kpis);
    [
      ['DCA1 value', fmtMoney(portfolio.total_usd ?? portfolio.dca1_total_usd ?? data.dca1_total_usd), '💰', 'mint'],
      ['Available USD', fmtMoney(portfolio.available_usd ?? portfolio.dca1_available_usd ?? data.available_usd), '💵', 'mint'],
      ['Wave phase', wave.phase != null ? 'Phase ' + wave.phase : '—', '🌊', 'blue'],
      ['Wave score', text(wave.score ?? wave.precursor_score), '📡', 'blue'],
      ['Maker / taker', `${fmtPct(numeric(fee.maker) ? fee.maker * 100 : null)} / ${fmtPct(numeric(fee.taker) ? fee.taker * 100 : null)}`, '⚖️', 'violet'],
      ['Vault value', fmtMoney(vault.market_value_usd ?? vault.vault_market_value_usd), '💎', 'violet']
    ].forEach(args => kpis.appendChild(metric(...args)));

    const score = wave.score ?? wave.precursor_score;
    $('heroHeadline').textContent = data.current_thinking?.headline || data.headline || (typeof data.current_thinking === 'string' ? data.current_thinking : 'Your market, in perspective.');
    $('heroScore').textContent = numeric(score) ? String(score) : '—';
    $('scoreGauge').style.setProperty('--score', `${numeric(score) ? Math.max(0, Math.min(100, Number(score))) : 0}%`);
    $('scoreGauge').setAttribute('aria-label', numeric(score) ? `Wave score ${score} out of 100` : 'Wave score unavailable');
    $('heroPhase').textContent = wave.phase != null ? `🌊 Phase ${wave.phase}` : 'Awaiting signal';

    renderCampaigns(data.active_campaigns || data.campaigns || []);
    renderThinking(data.current_thinking || {});
    renderVault(vault);
    renderLearning(data.learning || data.insights || []);
    renderNarrative($('response'), data.assistant_response, 'No assistant response was saved for this iteration.');
    const direction = data.direction?.length ? data.direction : data.direction_changes;
    renderNarrative($('direction'), direction || data.current_thinking?.direction || data.current_thinking?.headline, 'No direction update was saved.');
    $('waveBadge').textContent = wave.phase != null ? `Phase ${wave.phase}` : '—';
    $('waveMeta').textContent = `Breadth: ${text(wave.breadth)} · synchronization: ${text(wave.synchronization)}`;
  }

  function renderNarrative(root, value, empty) {
    clear(root);
    const list = Array.isArray(value) ? value : value ? [value] : [];
    if (!list.length) root.appendChild(el('p', 'muted', empty));
    list.forEach(item => root.appendChild(el('p', 'narrative', typeof item === 'string' ? item : JSON.stringify(item))));
  }

  function normalizeCampaigns(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.entries(value).map(([symbol, v]) => ({ symbol, ...(v || {}) }));
    return [];
  }

  function renderCampaigns(value) {
    const root = $('campaigns');
    clear(root);
    const campaigns = normalizeCampaigns(value);
    $('campaignCount').textContent = `🚀 ${campaigns.length} active ${campaigns.length === 1 ? 'campaign' : 'campaigns'}`;
    if (!campaigns.length) return root.appendChild(el('div', 'empty-state', '🔭 No active campaigns in this snapshot.'));
    campaigns.forEach((c, index) => {
      const box = el('div', 'campaign');
      const symbol = text(c.symbol || c.product || c.asset);
      const header = el('div', 'campaign-head');
      const token = el('div', 'token-icon token-' + index % 3, symbol.slice(0,2));
      const title = el('div');
      title.append(el('div', 'campaign-title', symbol), el('div', 'muted', numeric(c.units) ? new Intl.NumberFormat(undefined,{maximumFractionDigits:8}).format(c.units) + ' units' : 'Units not reported'));
      header.append(token,title); box.appendChild(header);
      const price = c.current ?? c.bid ?? c.current_bid;
      if (numeric(price)) box.appendChild(el('div', 'campaign-price', 'Latest price · ' + new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:8}).format(price)));
      if (c.status) box.appendChild(el('div', 'campaign-status', (c.status.includes('protected') ? '🛡️ ' : '◉ ') + c.status.replace(/_/g, ' ')));
      root.appendChild(box);
    });
  }

  function renderThinking(thinking) {
    const root = $('thinking');
    clear(root);
    const fields = [
      ['Latest assessment', typeof thinking === 'string' ? thinking : thinking.headline],
      ['Market interpretation', thinking.market_interpretation],
      ['Testing now', thinking.testing_now],
      ['Direction', thinking.direction],
      ['Advance criteria', thinking.advance_criteria],
      ['Invalidation criteria', thinking.invalidation_criteria]
    ];
    let count = 0;
    fields.forEach(([label, value]) => {
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
      count++;
      const box = el('div', 'thought');
      box.appendChild(el('div', 'metric-label', label));
      box.appendChild(el('div', '', Array.isArray(value) ? value.join(' · ') : value));
      root.appendChild(box);
    });
    if (!count) root.appendChild(el('div', 'muted', 'Current-thinking narrative will appear with the next mirrored cycle.'));
  }

  function renderVault(vault) {
    const root = $('vault');
    clear(root);
    const holdings = vault.holdings || vault.currently_vaulted || vault.assets || {};
    const entries = Array.isArray(holdings) ? holdings.map(v => [v.symbol || v.asset, v.units]) : Object.entries(holdings);
    if (!entries.length) { const empty = el('div','empty-state'); empty.append(el('span','empty-icon','🌱'),el('strong','','Room to grow'),el('p','muted','No vault holdings reported in this snapshot.')); root.appendChild(empty); }
    entries.forEach(([symbol, units]) => {
      if (typeof units === 'object') units = units.units ?? units.quantity ?? JSON.stringify(units);
      const box = el('div', 'vault-item');
      box.append(el('b', '', symbol), document.createTextNode(' · ' + text(units) + ' units'));
      root.appendChild(box);
    });
  }

  function renderLearning(value) {
    const root = $('learning');
    clear(root);
    const list = Array.isArray(value) ? value : value ? [value] : [];
    if (!list.length) return root.appendChild(el('div', 'empty-note', '💭 New insights will appear when saved with an iteration.'));
    list.slice(0,8).forEach(item => root.appendChild(el('div', 'thought', typeof item === 'string' ? item : JSON.stringify(item))));
  }

  function renderIterations(items) {
    $('iterationCount').textContent = items.length;
    const root = $('journal');
    clear(root);
    if (!items.length) {
      root.appendChild(el('div', 'muted', 'No mirrored iterations yet.'));
      drawWave([]);
      return;
    }
    items.forEach(item => {
      const box = el('article', 'journal-entry');
      box.appendChild(el('div','journal-time',dateText(item.timestamp)));
      const title = el('div', 'journal-title', '✦ ' + text(item.headline || item.summary || item.run_type || 'Snapshot recorded'));
      box.appendChild(title);
      const wave = item.wave || item.wave_precursor || {};
      const score = wave.score ?? wave.precursor_score;
      box.appendChild(el('div', 'journal-signal', wave.phase != null || numeric(score) ? `🌊 Phase ${text(wave.phase)} · score ${text(score)}` : 'Historical snapshot · score not recorded'));
      const insight = item.assistant_response || item.narrative?.assistant_response || item.direction || item.summary;
      if (insight) box.appendChild(el('div', '', insight));
      [['Insights', item.insights], ['Direction', item.direction || item.direction_changes], ['Current thinking', item.current_thinking]].forEach(([label, value]) => {
        if (!value || (Array.isArray(value) && !value.length)) return;
        box.appendChild(el('h3', '', label));
        const root = el('div'); renderNarrative(root, value, ''); box.appendChild(root);
      });
      const details = document.createElement('details');
      details.appendChild(el('summary', '', 'Dashboard data'));
      details.appendChild(el('pre', '', JSON.stringify(item, null, 2)));
      box.appendChild(details);
      root.appendChild(box);
    });
    chartItems = items.slice().reverse(); drawWave(chartItems);
  }

  function drawWave(items) {
    const canvas = $('waveChart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 900;
    const cssH = Math.max(220, Math.round(cssW * 0.34));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);
    const pts = items.map(x => ({
      t: x.timestamp,
      s: (x.wave || x.wave_precursor || {}).score ?? (x.wave || x.wave_precursor || {}).precursor_score ?? x.wave_score
    })).filter(x => numeric(x.s));
    $('chartCaption').textContent = pts.length ? `● ${pts.length} scored ${pts.length === 1 ? 'snapshot' : 'snapshots'} · ${items.length - pts.length} without a recorded score` : 'Waiting for scored snapshots. Missing scores are never treated as zero.';
    const table = $('historyTable'); clear(table);
    const caption = el('caption', '', 'Score history · latest 200 iterations'); table.appendChild(caption);
    const head = el('tr'); ['Time', 'Wave score'].forEach(t => head.appendChild(el('th', '', t))); table.appendChild(head);
    pts.slice().reverse().forEach(p => { const row = el('tr'); row.append(el('td', '', dateText(p.t)), el('td', '', p.s)); table.appendChild(row); });
    const pad = 38;
    ctx.strokeStyle = '#263b51';
    ctx.lineWidth = 1;
    [0,25,50,75,100].forEach(s => { const y = cssH-pad-s/100*(cssH-pad*2); ctx.beginPath(); ctx.moveTo(pad,y);ctx.lineTo(cssW-pad,y);ctx.stroke(); });
    if (!pts.length) {
      ctx.fillStyle = '#98a3ae'; ctx.font = '14px system-ui'; ctx.fillText('Wave history appears after mirrored scored iterations.', pad+10, pad+24); return;
    }
    const times = pts.map(p => new Date(p.t).getTime());
    const first = times[0], last = times.at(-1);
    const xAt = i => pts.length === 1 ? cssW/2 : pad + ((times[i]-first) / (last-first || 1))*(cssW-pad*2);
    const yAt = i => cssH-pad-Math.max(0,Math.min(100,Number(pts[i].s)))/100*(cssH-pad*2);
    ctx.fillStyle = '#8ea6bd'; ctx.font = '12px system-ui';
    [0,50,100].forEach(s => ctx.fillText(String(s), 5, cssH-pad-s/100*(cssH-pad*2)));
    const shortDate = t => new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
    ctx.fillText(shortDate(pts[0].t), pad, cssH-10);
    if (pts.length > 1) ctx.fillText(shortDate(pts.at(-1).t), cssW-pad-48, cssH-10);
    if (pts.length > 1) {
      ctx.fillStyle = 'rgba(74, 205, 218, .12)'; ctx.beginPath(); ctx.moveTo(xAt(0),cssH-pad);
      pts.forEach((p,i) => ctx.lineTo(xAt(i),yAt(i))); ctx.lineTo(xAt(pts.length-1),cssH-pad); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#61d8e3'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
    pts.forEach((p,i) => {
      const x = xAt(i);
      const y = yAt(i);
      if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    pts.forEach((p,i) => { ctx.fillStyle = '#61d8e3'; ctx.beginPath(); ctx.arc(xAt(i),yAt(i),4,0,Math.PI*2); ctx.fill(); });
    const latest = pts.length-1;
    ctx.fillStyle = '#d4fbff';ctx.font = 'bold 14px system-ui';
    ctx.fillText(String(pts[latest].s), Math.min(cssW-30,xAt(latest)+8),Math.max(20,yAt(latest)-12));
  }

  $('signIn').addEventListener('click', signIn);
  $('gateSignIn').addEventListener('click', signIn);
  $('signOut').addEventListener('click', () => { signedOut(); signOut(auth).catch(err => { $('gateMessage').textContent = 'Sign-out failed: ' + err.message; }); });
  $('retry').addEventListener('click', () => { if (auth.currentUser) listen(); });
  window.addEventListener('resize', () => {
    if (!$('app').hidden) drawWave(chartItems);
  });

  onAuthStateChanged(auth, async user => {
    if (!user) return signedOut();
    stopListeners(); resetData(); $('app').hidden = true; $('gate').hidden = false;
    const active = ++session;
    $('userLabel').textContent = user.email || user.displayName || 'Signed in';
    $('signIn').hidden = true;
    $('signOut').hidden = false;
    setStatus('Checking access…');
    try {
      const allowed = await authorize(user);
      if (active !== session) return;
      if (!allowed) {
        stopListeners();
        $('app').hidden = true;
        $('gate').hidden = false;
        $('gateMessage').textContent = 'This account needs dashboard access. Ask the administrator to authorize UID: ' + user.uid;
        setStatus('Signed in · access not granted');
        return;
      }
      $('gateMessage').textContent = '';
      $('gate').hidden = true;
      $('app').hidden = false;
      setStatus('Authorized · connecting to live data…');
      listen();
    } catch (err) {
      if (active !== session) return;
      $('gateMessage').textContent = 'Could not verify access: ' + (err.message || err);
      setStatus('Access verification failed');
    }
  });
})().catch(err => {
  document.getElementById('status').textContent = 'Firebase could not connect';
  document.getElementById('gateMessage').textContent = (err.message || err) + ' Check your connection and reload the Firebase Hosting URL.';
  document.getElementById('gateSignIn').disabled = true;
});
