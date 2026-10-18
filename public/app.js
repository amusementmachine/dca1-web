(() => {
  const auth = firebase.auth();
  const db = firebase.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();

  const $ = id => document.getElementById(id);
  const fmtMoney = value => Number.isFinite(Number(value)) ? '$' + Number(value).toFixed(2) : '—';
  const fmtPct = value => Number.isFinite(Number(value)) ? Number(value).toFixed(2) + '%' : '—';
  const text = value => value == null ? '—' : String(value);
  let unsubCurrent = null;
  let unsubIterations = null;

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function el(tag, className, value) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (value != null) n.textContent = String(value);
    return n;
  }
  function metric(label, value) {
    const card = el('article', 'card');
    card.append(el('div', 'metric-label', label), el('div', 'metric-value', value));
    return card;
  }
  function setStatus(value) { $('status').textContent = value; }

  async function signIn() {
    $('gateMessage').textContent = '';
    try {
      await auth.signInWithPopup(provider);
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
    const access = await db.collection('access').doc(user.uid).get();
    return access.exists;
  }

  function signedOut() {
    stopListeners();
    $('app').hidden = true;
    $('gate').hidden = false;
    $('signIn').hidden = false;
    $('signOut').hidden = true;
    $('userLabel').textContent = '';
    setStatus('Authentication required');
  }

  function listen() {
    stopListeners();
    unsubCurrent = db.collection('dashboard').doc('current').onSnapshot(
      snap => {
        if (!snap.exists) {
          setStatus('Connected · waiting for first dashboard snapshot');
          return;
        }
        const data = snap.data();
        renderCurrent(data);
        setStatus('Live · updated ' + text(data.updated_at || data.timestamp));
      },
      err => setStatus('Dashboard read failed: ' + err.message)
    );

    unsubIterations = db.collection('iterations').orderBy('timestamp', 'desc').limit(50).onSnapshot(
      snap => renderIterations(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => {
        $('journal').textContent = 'Iteration history read failed: ' + err.message;
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
      ['DCA1 value', fmtMoney(portfolio.total_usd ?? portfolio.dca1_total_usd ?? data.dca1_total_usd)],
      ['Available USD', fmtMoney(portfolio.available_usd ?? portfolio.dca1_available_usd ?? data.available_usd)],
      ['Wave phase', wave.phase != null ? 'Phase ' + wave.phase : '—'],
      ['Wave score', text(wave.score ?? wave.precursor_score)],
      ['Maker / taker', `${fmtPct((fee.maker ?? 0) * 100)} / ${fmtPct((fee.taker ?? 0) * 100)}`],
      ['Vault value', fmtMoney(vault.market_value_usd ?? vault.vault_market_value_usd)]
    ].forEach(([a,b]) => kpis.appendChild(metric(a,b)));

    renderCampaigns(data.active_campaigns || data.campaigns || []);
    renderThinking(data.current_thinking || {});
    renderVault(vault);
    renderLearning(data.learning || data.insights || []);
    $('waveBadge').textContent = wave.phase != null ? `Phase ${wave.phase}` : '—';
    $('waveMeta').textContent = `Breadth: ${text(wave.breadth)} · synchronization: ${text(wave.synchronization)}`;
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
    if (!campaigns.length) return root.appendChild(el('div', 'muted', 'No active campaign data.'));
    campaigns.forEach(c => {
      const box = el('div', 'campaign');
      box.appendChild(el('div', 'campaign-title', `${text(c.symbol || c.product || c.asset)} · ${text(c.units)} units`));
      box.appendChild(el('div', 'muted', `entry ${text(c.entry)} · current ${text(c.current ?? c.bid ?? c.current_bid)} · TP ${text(c.tp ?? c.recovery_tp)} · stop ${text(c.stop)} · residual ${text(c.residual ?? c.residual_units)}`));
      if (c.status) box.appendChild(el('div', 'muted', c.status));
      root.appendChild(box);
    });
  }

  function renderThinking(thinking) {
    const root = $('thinking');
    clear(root);
    const fields = [
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
    if (!entries.length) root.appendChild(el('div', 'muted', 'No vault holdings in current snapshot.'));
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
    if (!list.length) return root.appendChild(el('div', 'muted', 'No learning narrative in current snapshot.'));
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
      const title = el('div', 'journal-title', `${text(item.timestamp)} · ${text(item.headline || item.summary || item.run_type || 'Iteration')}`);
      box.appendChild(title);
      const wave = item.wave || item.wave_precursor || {};
      box.appendChild(el('div', 'muted', `Phase ${text(wave.phase)} · score ${text(wave.score ?? wave.precursor_score)} · ${text(item.strategy_version || '')}`));
      const insight = item.assistant_response || item.narrative?.assistant_response || item.direction || item.summary;
      if (insight) box.appendChild(el('div', '', insight));
      const details = document.createElement('details');
      details.appendChild(el('summary', '', 'Raw snapshot'));
      details.appendChild(el('pre', '', JSON.stringify(item, null, 2)));
      box.appendChild(details);
      root.appendChild(box);
    });
    drawWave(items.slice().reverse());
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
      s: Number((x.wave || x.wave_precursor || {}).score ?? (x.wave || x.wave_precursor || {}).precursor_score)
    })).filter(x => Number.isFinite(x.s)).slice(-30);
    const pad = 34;
    ctx.strokeStyle = '#29323c';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad,pad); ctx.lineTo(pad,cssH-pad); ctx.lineTo(cssW-pad,cssH-pad); ctx.stroke();
    if (pts.length < 2) {
      ctx.fillStyle = '#98a3ae'; ctx.font = '14px system-ui'; ctx.fillText('Wave history appears after mirrored scored iterations.', pad+10, pad+24); return;
    }
    const dx = (cssW - pad*2) / (pts.length-1);
    ctx.strokeStyle = '#7aa2ff'; ctx.lineWidth = 3; ctx.beginPath();
    pts.forEach((p,i) => {
      const x = pad + i*dx;
      const y = cssH-pad-(Math.max(0,Math.min(100,p.s))/100)*(cssH-pad*2);
      if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }

  $('signIn').addEventListener('click', signIn);
  $('gateSignIn').addEventListener('click', signIn);
  $('signOut').addEventListener('click', () => auth.signOut());
  window.addEventListener('resize', () => {
    // chart redraws on the next Firestore update; current responsive canvas remains readable.
  });

  auth.onAuthStateChanged(async user => {
    if (!user) return signedOut();
    $('userLabel').textContent = user.email || user.displayName || 'Signed in';
    $('signIn').hidden = true;
    $('signOut').hidden = false;
    setStatus('Checking access…');
    try {
      if (!(await authorize(user))) {
        stopListeners();
        $('app').hidden = true;
        $('gate').hidden = false;
        $('gateMessage').textContent = 'This Google account is signed in but is not authorized for the DCA1 dashboard.';
        setStatus('Signed in · access not granted');
        return;
      }
      $('gateMessage').textContent = '';
      $('gate').hidden = true;
      $('app').hidden = false;
      setStatus('Authorized · connecting to live data…');
      listen();
    } catch (err) {
      $('gateMessage').textContent = 'Could not verify access: ' + (err.message || err);
      setStatus('Access verification failed');
    }
  });
})();
