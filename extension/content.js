// Browser Switch – Content Script
// Intercepts anchor clicks and delegates external-browser links to the
// background service worker before the browser navigates.

(function () {
  'use strict';

  // ─── Local rule cache ──────────────────────────────────────────────────────

  let rules = [];

  function loadRules() {
    chrome.runtime.sendMessage({ type: 'getRules' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.rules) rules = response.rules;
    });
  }

  // Load immediately and refresh when storage changes.
  loadRules();

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'rulesUpdated') {
      rules = message.rules || [];
    }
  });

  // ─── Pattern matching (mirrors background.js logic) ──────────────────────

  function patternToRegex(pattern) {
    // Must stay in sync with background.js – split on wildcards first.
    const re = pattern
      .split(/(\*\*|\*)/g)
      .map((segment) => {
        if (segment === '**') return '.*';
        if (segment === '*')  return '[^/]*';
        return segment
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\?/g, '[^/]');
      })
      .join('');
    return new RegExp('^' + re + '$', 'i');
  }

  function findMatchingRule(url) {
    for (const rule of rules) {
      if (!rule.enabled) continue;
      try {
        if (patternToRegex(rule.pattern).test(url)) return rule;
      } catch {
        // ignore bad patterns
      }
    }
    return null;
  }

  // ─── Click interception ───────────────────────────────────────────────────

  document.addEventListener('click', (evt) => {
    // Walk up the DOM to find the nearest <a> ancestor.
    const link = evt.target.closest('a[href]');
    if (!link) return;

    let url;
    try {
      url = new URL(link.href, document.baseURI).href;
    } catch {
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) return;

    const rule = findMatchingRule(url);
    if (!rule || rule.action !== 'external') return;

    evt.preventDefault();
    evt.stopImmediatePropagation();

    chrome.runtime.sendMessage({
      type: 'openInExternalBrowser',
      url,
      browser: rule.browser,
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[BrowserSwitch] Could not reach background:', chrome.runtime.lastError.message);
        // Fall back: open in current tab
        window.location.href = url;
        return;
      }
      if (response && !response.ok) {
        console.error('[BrowserSwitch]', response.error);
        // Fall back: open in new tab so the user isn't stuck
        window.open(url, '_blank');
      }
    });
  }, /* capture = */ true);
})();
