/* Calendar + Venmo */
(function() {
  const cfg = window.FUNDRAISER;
  const grid = document.querySelector('.grid');
  const venmoUsername = cfg.venmoUsername;
  const layout = cfg.layout;

  function createCellContent(cell, labelText, isAny, dayNumber) {
    const label = document.createElement('div'); label.className = 'label'; label.textContent = labelText; cell.appendChild(label);
    const amount = document.createElement('div'); amount.className = 'amount'; amount.textContent = isAny ? '$ — any amount' : `$${dayNumber}`; cell.appendChild(amount);
    if (isAny) { const badge = document.createElement('div'); badge.className = 'badge'; badge.textContent = 'Any'; cell.appendChild(badge); }
  }

  const allCells = []; let anyCounter = 0;
  function makeCell(value) {
    const isAny = value === 'any'; const dayNumber = isAny ? null : value; const labelText = isAny ? '' : String(dayNumber);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cell' + (isAny ? ' any' : '');
    const id = isAny ? `any-${++anyCounter}` : `day-${dayNumber}`; btn.dataset.docid = id; btn.dataset.isAny = String(isAny); btn.dataset.day = dayNumber || '';
    createCellContent(btn, labelText, isAny, dayNumber); btn.addEventListener('click', () => onSelectCell(btn, value)); allCells.push(btn); return btn;
  }
  layout.forEach(row => row.forEach(value => grid.appendChild(makeCell(value))));

  const dlg = document.getElementById('donateDialog'); const donateSub = document.getElementById('donateSub');
  const amountInput = document.getElementById('amountInput'); const nameInput = document.getElementById('nameInput'); const venmoBtn = document.getElementById('venmoBtn'); const markBtn = document.getElementById('markBtn');
  let activeCell = null; let activeDay = null;

  function formatUSD(n){return n.toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2});}
  function updateVenmoLink(){
    const amount = parseFloat(amountInput.value || '0'); const name = (nameInput.value || '').trim();
    const noteBits = [cfg.notePrefix]; if (activeDay) noteBits.push(`Day ${activeDay}`); if (name) noteBits.push(`from ${name}`);
    const note = encodeURIComponent(noteBits.join(' — '));
    const deep = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(venmoUsername)}&amount=${amount}&note=${note}`;
    const web = `https://account.venmo.com/pay?recipients=${encodeURIComponent(venmoUsername)}&amount=${amount}&note=${note}`;
    const profile = `https://venmo.com/u/${encodeURIComponent(venmoUsername)}`; const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    venmoBtn.href = isMobile ? deep : web; venmoBtn.dataset.fallback = profile;
  }
  function onSelectCell(cell, value){
    if (cell.classList.contains('pledged') && !window.savePledge) return;
    activeCell = cell; activeDay = (value === 'any') ? null : value;
    if (value === 'any'){ donateSub.textContent = 'You picked an “Any amount” box. Enter whatever you’d like to give 👇'; amountInput.value = ''; }
    else { donateSub.textContent = `You picked day ${value}. That’s ${formatUSD(value)}.`; amountInput.value = value; }
    nameInput.value = ''; updateVenmoLink(); if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open','');
  }
  amountInput.addEventListener('input', updateVenmoLink); nameInput.addEventListener('input', updateVenmoLink);
  venmoBtn.addEventListener('click', async () => {
  const amt = parseFloat(amountInput.value || '0');
  if (!amt || amt <= 0) {
    alert('Please enter a valid amount first.');
    return;
  }

  try {
    if (typeof window.savePledge === 'function') {
      // Firebase version: persist for everyone
      await window.savePledge(activeCell, amt, (nameInput.value || '').trim());
    } else {
      // Local-only version (no Firebase)
      window.__markCell(activeCell, amt);
    }
  } catch (err) {
    // If saving fails (e.g., already taken), we still let them try to pay
    console.warn('Could not save pledge before opening Venmo:', err);
  }

  // Close dialog and go to Venmo
  if (dlg.open) dlg.close();

  // Kick to the Venmo deep link; then open the web fallback shortly after
  const fallback = venmoBtn.dataset.fallback;
  const url = venmoBtn.href;
  window.location.href = url; // deep link for mobile
  setTimeout(() => { try { window.open(fallback, '_blank'); } catch {} }, 1500);
});

  markBtn.addEventListener('click', async (e) => { e.preventDefault(); const amt = parseFloat(amountInput.value || '0'); if (!amt || amt <= 0) { alert('Please enter a valid amount first.'); return; }
    if (typeof window.savePledge === 'function') await window.savePledge(activeCell, amt, (nameInput.value || '').trim()); else window.__markCell(activeCell, amt); dlg.close(); });
  function markCellAsPledged(cell, amount){ if (!cell) return; cell.classList.add('pledged'); const amountEl = cell.querySelector('.amount'); amountEl.textContent = `$${amount}`; }
  window.__markCell = markCellAsPledged; window.__cells = allCells;

  document.getElementById('shareBtn').addEventListener('click', async () => {
    const shareData = { title: 'JWMHS Orchestra — Month of Giving', text: 'Pick a date and donate that amount to support the JWMHS Orchestra!', url: window.location.href };
    try { if (navigator.share) await navigator.share(shareData); else throw new Error('No share support'); }
    catch { copyToClipboard(window.location.href); alert('Link copied! Share it with a friend 💛'); }
  });
  document.getElementById('copyLinkBtn').addEventListener('click', () => { copyToClipboard(window.location.href); alert('Link copied to your clipboard.'); });
  function copyToClipboard(text){ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
})();
// Firebase glue (optional)
(function(){
  const cfg = window.FUNDRAISER;
  if (!cfg.firebaseConfig || cfg.firebaseConfig.apiKey === 'YOUR_API_KEY'){ return; }
  firebase.initializeApp(cfg.firebaseConfig);
  const db = firebase.firestore(); firebase.auth().signInAnonymously().catch(console.error);
  db.collection('pledges').onSnapshot((snap)=>{
    snap.docChanges().forEach(ch=>{ if(ch.type==='added'){ const id = ch.doc.id; const data=ch.doc.data();
      const cell = (window.__cells||[]).find(c => c.dataset.docid === id); if(cell) window.__markCell(cell, data.amount);
    }});
  });
  window.savePledge = async function(cell, amount, name){
    const id = cell.dataset.docid; const isAny = cell.dataset.isAny === 'true';
    const payload = { amount:Number(amount), day: isAny ? null : Number(cell.dataset.day), isAny, name: name || null, venmo: window.FUNDRAISER.venmoUsername, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    await db.collection('pledges').doc(id).set(payload); window.__markCell(cell, amount);
  };
})();
