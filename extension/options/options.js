// Browser Switch – Options page script

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let rules    = [];
  let browsers = [];
  let editingRuleId = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const rulesList       = document.getElementById('rules-list');
  const noRulesMsg      = document.getElementById('no-rules-msg');
  const addRuleBtn      = document.getElementById('add-rule-btn');
  const saveRulesBtn    = document.getElementById('save-rules-btn');
  const saveStatus      = document.getElementById('save-status');
  const saveBrowsersBtn = document.getElementById('save-browsers-btn');
  const saveBrowsersSt  = document.getElementById('save-browsers-status');
  const browsersList    = document.getElementById('browsers-list');
  const testNativeBtn   = document.getElementById('test-native-btn');
  const testNativeRes   = document.getElementById('test-native-result');
  const extVersionEl    = document.getElementById('ext-version');

  const modalOverlay    = document.getElementById('modal-overlay');
  const modalTitle      = document.getElementById('modal-title');
  const ruleForm        = document.getElementById('rule-form');
  const ruleNameInput   = document.getElementById('rule-name');
  const rulePatternInput= document.getElementById('rule-pattern');
  const ruleActionSel   = document.getElementById('rule-action');
  const ruleBrowserSel  = document.getElementById('rule-browser');
  const ruleEnabledCb   = document.getElementById('rule-enabled');
  const browserLabel    = document.getElementById('browser-label');
  const modalCancelBtn  = document.getElementById('modal-cancel');

  // ── Navigation ─────────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
    });
  });

  // ── Initialise ─────────────────────────────────────────────────────────────
  async function init() {
    const [rulesResp, browsersResp] = await Promise.all([
      sendMsg({ type: 'getRules' }),
      sendMsg({ type: 'getBrowsers' }),
    ]);
    rules    = rulesResp.rules    || [];
    browsers = browsersResp.browsers || [];

    renderRules();
    renderBrowsers();

    const manifest = chrome.runtime.getManifest();
    extVersionEl.textContent = manifest.version;
  }

  // ── Rules rendering ────────────────────────────────────────────────────────
  function renderRules() {
    rulesList.innerHTML = '';
    noRulesMsg.classList.toggle('hidden', rules.length > 0);

    rules.forEach((rule, idx) => {
      const card = document.createElement('div');
      card.className = `rule-card${rule.enabled ? '' : ' disabled'}`;
      card.dataset.idx = idx;

      const actionLabel = rule.action === 'external'
        ? `→ ${rule.browser}`
        : '✓ current browser';
      const badgeClass = rule.action === 'external' ? 'external' : 'current';

      card.innerHTML = `
        <span class="rule-handle" title="Drag to reorder">⠿</span>
        <div class="rule-info">
          <div class="rule-name">${escHtml(rule.name)}</div>
          <div class="rule-pattern">${escHtml(rule.pattern)}</div>
        </div>
        <span class="rule-action-badge ${badgeClass}">${escHtml(actionLabel)}</span>
        <button class="icon-btn edit-btn" title="Edit" data-idx="${idx}">✎</button>
        <button class="icon-btn danger delete-btn" title="Delete" data-idx="${idx}">✕</button>
      `;

      rulesList.appendChild(card);
    });

    // Edit buttons
    rulesList.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.idx)));
    });

    // Delete buttons
    rulesList.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        rules.splice(idx, 1);
        renderRules();
      });
    });

    setupDragReorder();
  }

  // ── Drag-to-reorder ────────────────────────────────────────────────────────
  function setupDragReorder() {
    let dragIdx = null;

    rulesList.querySelectorAll('.rule-handle').forEach((handle) => {
      const card = handle.closest('.rule-card');
      card.setAttribute('draggable', 'true');

      card.addEventListener('dragstart', () => {
        dragIdx = parseInt(card.dataset.idx);
        card.style.opacity = '0.5';
      });

      card.addEventListener('dragend', () => {
        card.style.opacity = '';
        dragIdx = null;
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.style.outline = '2px solid var(--accent)';
      });

      card.addEventListener('dragleave', () => {
        card.style.outline = '';
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.style.outline = '';
        const dropIdx = parseInt(card.dataset.idx);
        if (dragIdx === null || dragIdx === dropIdx) return;
        const [moved] = rules.splice(dragIdx, 1);
        rules.splice(dropIdx, 0, moved);
        renderRules();
      });
    });
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  function openAddModal() {
    editingRuleId = null;
    modalTitle.textContent = 'Add rule';
    ruleNameInput.value    = '';
    rulePatternInput.value = '';
    ruleActionSel.value    = 'external';
    ruleEnabledCb.checked  = true;
    populateBrowserSelect();
    toggleBrowserField();
    modalOverlay.classList.remove('hidden');
    ruleNameInput.focus();
  }

  function openEditModal(idx) {
    editingRuleId = idx;
    const rule = rules[idx];
    modalTitle.textContent  = 'Edit rule';
    ruleNameInput.value     = rule.name;
    rulePatternInput.value  = rule.pattern;
    ruleActionSel.value     = rule.action;
    ruleEnabledCb.checked   = rule.enabled;
    populateBrowserSelect(rule.browser);
    toggleBrowserField();
    modalOverlay.classList.remove('hidden');
    ruleNameInput.focus();
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
  }

  function populateBrowserSelect(selectedId) {
    ruleBrowserSel.innerHTML = '';
    browsers.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      if (b.id === selectedId) opt.selected = true;
      ruleBrowserSel.appendChild(opt);
    });
  }

  function toggleBrowserField() {
    browserLabel.classList.toggle('hidden', ruleActionSel.value !== 'external');
  }

  addRuleBtn.addEventListener('click', openAddModal);
  modalCancelBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  ruleActionSel.addEventListener('change', toggleBrowserField);

  ruleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const rule = {
      id:      editingRuleId !== null ? rules[editingRuleId].id : crypto.randomUUID(),
      name:    ruleNameInput.value.trim(),
      pattern: rulePatternInput.value.trim(),
      action:  ruleActionSel.value,
      browser: ruleBrowserSel.value,
      enabled: ruleEnabledCb.checked,
    };

    if (editingRuleId !== null) {
      rules[editingRuleId] = rule;
    } else {
      rules.push(rule);
    }
    renderRules();
    closeModal();
  });

  // ── Save rules ─────────────────────────────────────────────────────────────
  saveRulesBtn.addEventListener('click', async () => {
    saveStatus.textContent = '';
    saveStatus.className   = 'save-status';
    const resp = await sendMsg({ type: 'saveRules', rules });
    if (resp.ok) {
      saveStatus.textContent = '✓ Saved';
    } else {
      saveStatus.textContent = '✕ Error saving';
      saveStatus.classList.add('error');
    }
    setTimeout(() => { saveStatus.textContent = ''; }, 2500);
  });

  // ── Browsers panel ─────────────────────────────────────────────────────────
  function renderBrowsers() {
    browsersList.innerHTML = '';
    browsers.forEach((browser, idx) => {
      const row = document.createElement('div');
      row.className = 'browser-row';
      row.innerHTML = `
        <div class="browser-name">${escHtml(browser.name)}</div>
        <input
          class="browser-path-input"
          type="text"
          placeholder="(auto-detect)"
          value="${escHtml(browser.path || '')}"
          data-idx="${idx}"
        />
      `;
      browsersList.appendChild(row);
    });

    browsersList.querySelectorAll('.browser-path-input').forEach((input) => {
      input.addEventListener('input', () => {
        browsers[parseInt(input.dataset.idx)].path = input.value;
      });
    });
  }

  saveBrowsersBtn.addEventListener('click', async () => {
    saveBrowsersSt.textContent = '';
    const resp = await sendMsg({ type: 'saveBrowsers', browsers });
    saveBrowsersSt.textContent = resp.ok ? '✓ Saved' : '✕ Error';
    saveBrowsersSt.className   = `save-status${resp.ok ? '' : ' error'}`;
    setTimeout(() => { saveBrowsersSt.textContent = ''; }, 2500);
  });

  // ── Native host test ───────────────────────────────────────────────────────
  testNativeBtn.addEventListener('click', async () => {
    testNativeRes.textContent = 'Testing…';
    testNativeRes.className   = 'save-status';
    const resp = await sendMsg({ type: 'testNativeHost' });
    if (resp.ok) {
      testNativeRes.textContent = '✓ Connected!';
    } else {
      testNativeRes.textContent = `✕ ${resp.error}`;
      testNativeRes.classList.add('error');
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function sendMsg(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => resolve(resp || {}));
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  init();
})();
