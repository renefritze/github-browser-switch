// Browser Switch – Popup script

(async () => {
  const currentUrlEl  = document.getElementById('current-url');
  const matchBadgeEl  = document.getElementById('match-result');
  const errorSection  = document.getElementById('error-section');
  const errorMsgEl    = document.getElementById('error-msg');
  const rulCountEl    = document.getElementById('rule-count');
  const openOptsBtn   = document.getElementById('open-options');

  openOptsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // ── Show any pending error from the background ────────────────────────────
  const { error } = await sendMsg({ type: 'getLastError' });
  if (error) {
    errorSection.classList.remove('hidden');
    errorMsgEl.textContent = error;
  }

  // ── Get the active tab's URL and check for a matching rule ────────────────
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  if (url.startsWith('http://') || url.startsWith('https://')) {
    currentUrlEl.textContent = url;

    const [rulesResp, checkResp] = await Promise.all([
      sendMsg({ type: 'getRules' }),
      sendMsg({ type: 'checkUrl', url }),
    ]);

    const rules = rulesResp.rules || [];
    rulCountEl.textContent = `${rules.length} rule${rules.length !== 1 ? 's' : ''}`;

    matchBadgeEl.classList.remove('hidden');
    const rule = checkResp.rule;

    if (!rule) {
      matchBadgeEl.className = 'match-badge no-match';
      matchBadgeEl.textContent = '○ No rule matches';
    } else if (rule.action === 'external') {
      matchBadgeEl.className = 'match-badge external';
      matchBadgeEl.textContent = `⇒ Open in ${rule.browser} (${rule.name})`;
    } else {
      matchBadgeEl.className = 'match-badge current';
      matchBadgeEl.textContent = `✓ Stay in current browser (${rule.name})`;
    }
  } else {
    currentUrlEl.textContent = url || '(non-HTTP page)';
    currentUrlEl.style.color = 'var(--text-muted)';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function sendMsg(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        resolve(resp || {});
      });
    });
  }
})();
