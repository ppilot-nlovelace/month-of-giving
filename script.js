/* Build the calendar and handle Venmo */
(function() {
  const cfg = window.FUNDRAISER;
  const grid = document.querySelector('.grid');
  const venmoUsername = cfg.venmoUsername;
  const layout = cfg.layout;

  function createCellContent(cell, labelText, isAny, dayNumber) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = labelText;
    cell.appendChild(label);

    const amount = document.createElement('div');
    amount.className = 'amount';
    amount.textContent = isAny ? '$ — any amount' : `$${dayNumber}`;
    cell.appendChild(amount);

    if (isAny) {
      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = 'Any';
      cell.appendChild(badge);
    }
  }

  const allCells = [];
  let anyCounter = 0;
  function makeCell(value) {
    const isAny = value === 'any';
    const dayNumber = isAny ? null : value;
    const labelText = isAny ? '' : String(dayNumber);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell' + (isAny ? ' any' : '');
    btn.setAttribute('role','gridcell');
    if (!isAny) btn.setAttribute('aria-label', `Select day ${dayNumber} to donate $${dayNumber}`);
    else btn.setAttribute('aria-label', 'Select an any-amount box');

    const id = isAny ? `any-${++anyCounter}` : `day-${dayNumber}`;
    btn.dataset.docid = id;
    btn.dataset.isAny = String(isAny);
    btn.dataset.day = dayNumber || '';
    createCellContent(btn, labelText, isAny, dayNumber);
    btn.addEventListener('click', () => onSelectCell(btn, value));
    allCells.push(btn);
    return btn;
  }

  // Append day name headers are already present; we add the date cells
  layout.forEach(row => row.forEach(value => grid.appendChild(makeCell(value))));

  const dlg = document.getElementById('donateDialog');
  const donateSub = document.getElementById('donateSub');
  const amountInput = document.getElementById('amountInput');
  const nameInput = document.getElementById('nameInput');
  const venmoBtn = document.getElementById('venmoBtn');
  const markBtn = document.getElementById('markBtn');

  let activeCell = null;
  let activeDay = null;

  function formatUSD(n) {
    return n.toLocaleString(undefined, { style:'currency', currency:'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function updateVenmoLink() {
    const amount = parseFloat(amountInput.value || '0');
    const name = (nameInput.value || '').trim();
    const noteBits = [cfg.notePrefix];
    if (activeDay) noteBits.push(`Day ${activeDay}`);
    if (name) noteBits.push(`from ${name}`);
    const note = encodeURIComponent(noteBits.join(' — '));

    const deep = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(venmoUsername)}&amount=${amount}&note=${note}`;
    const web = `https://account.venmo.com/pay?recipients=${encodeURIComponent(venmoUsername)}&amount=${amount}&note=${note}`;
    const profile = `https://venmo.com/u/${encodeURIComponent(venmoUsername)}`;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    venmoBtn.href = isMobile ? deep : web;
    venmoBtn.dataset.fallback = profile;
  }

  function onSelectCell(cell, value) {
    if (cell.classList.contains('pledged') && !window.savePledge) return;
    activeCell = cell;
    activeDay = (value === 'any') ? null : value;
    if (value === 'any') {
      donateSub.textContent = 'You picked an “Any amount” box. Enter whatever you’d like to give 👇';
      amountInput.value = '';
    } else {
      donateSub.textContent = `You picked day ${value}. That’s ${formatUSD(value)}.`;
      amountInput.value = value;
    }
    nameInput.value = '';
    updateVenmoLink();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open','');
  }

  amountInput.addEventListener('input', updateVenmoLink);
  nameInput.addEventListener('input', updateVenmoLink);

  venmoBtn.addEventListener('click', () => {
    const fallback = venmoBtn.dataset.fallback;
    setTimeout(() => { try { window.open(fallback, '_blank'); } catch {} }, 1500);
  });

  markBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const amt = parseFloat(amountInput.value || '0');
    if (!amt || amt <= 0) { alert('Please enter a valid amount first.'); return; }
    if (typeof window.savePledge === 'function') {
      await window.savePledge(activeCell, amt, (nameInput.value || '').trim());
    } else {
      // Local-only mode
      markCellAsPledged(activeCell, amt);
    }
    dlg.close();
  });

  function markCellAsPledged(cell, amount) {
    if (!cell) return;
    cell.classList.add('pledged');
    const amountEl = cell.querySelector('.amount');
    amountEl.textContent = `$${amount}`;
  }

  // Expose for Firebase version to hook into
  window.__markCell = markCellAsPledged;
  window.__cells = allCells;

  // Share helpers
  document.getElementById('shareBtn').addEventListener('click', async () => {
    const shareData = {
      title: 'JWMHS Orchestra — Month of Giving',
      text: 'Pick a date and donate that amount to support the JWMHS Orchestra!',
      url: window.location.href
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else throw new Error('No share support');
    } catch (e) {
      copyToClipboard(window.location.href);
      alert('Link copied! Share it with a friend 💛');
    }
  });
  document.getElementById('copyLinkBtn').addEventListener('click', () => {
    copyToClipboard(window.location.href);
    alert('Link copied to your clipboard.');
  });
  function copyToClipboard(text) {
    const ta = document.createElement('textarea'); ta.value = text;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
})();

// ===== Firebase persistence =====
(function() {
  const cfg = window.FUNDRAISER;
  if (!cfg.firebaseConfig || cfg.firebaseConfig.apiKey === 'YOUR_API_KEY') {
    console.warn('Firebase config missing. Running in local-only mode.');
    return;
  }
  firebase.initializeApp(cfg.firebaseConfig);
  const db = firebase.firestore();
  firebase.auth().signInAnonymously().catch(console.error);

  // live updates
  db.collection('pledges').onSnapshot((snap) => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added') {
        const id = ch.doc.id;
        const data = ch.doc.data();
        const cell = (window.__cells || []).find(c => c.dataset.docid === id);
        if (cell) window.__markCell(cell, data.amount);
      }
    });
  });

  // savePledge used by the dialog "Mark day as done" button
  window.savePledge = async function(cell, amount, name) {
    const id = cell.dataset.docid;
    const isAny = cell.dataset.isAny === 'true';
    const payload = {
      amount: Number(amount),
      day: isAny ? null : Number(cell.dataset.day),
      isAny,
      name: name || null,
      venmo: cfg.venmoUsername,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('pledges').doc(id).set(payload);
    window.__markCell(cell, amount);
  };
})();