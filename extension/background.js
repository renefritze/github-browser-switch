// Browser Switch - Background Service Worker
// Handles native messaging, rule management, and navigation interception.

const NATIVE_HOST = 'com.browserswitch.host';

// ─── Storage helpers ────────────────────────────────────────────────────────

async function getRules() {
  const result = await chrome.storage.sync.get({ rules: [] });
  return result.rules;
}

async function getBrowsers() {
  const result = await chrome.storage.sync.get({ browsers: defaultBrowsers() });
  return result.browsers;
}

function defaultBrowsers() {
  return [
    { id: 'firefox',  name: 'Firefox',         path: '' },
    { id: 'chrome',   name: 'Google Chrome',   path: '' },
    { id: 'chromium', name: 'Chromium',         path: '' },
    { id: 'edge',     name: 'Microsoft Edge',   path: '' },
    { id: 'safari',   name: 'Safari (macOS)',   path: '' },
    { id: 'custom',   name: 'Custom…',          path: '' },
  ];
}

// ─── URL pattern matching ────────────────────────────────────────────────────

/**
 * Convert a glob-style pattern to a RegExp.
 * Supported wildcards:
 *   **  – matches any sequence of characters including /
 *   *   – matches any sequence of characters except /
 *   ?   – matches any single character except /
 */
function patternToRegex(pattern) {
  // Split on wildcard tokens first so they are never passed through
  // the regex-escape step, then map each segment to its regex equivalent.
  const re = pattern
    .split(/(\*\*|\*)/g)
    .map((segment) => {
      if (segment === '**') return '.*';       // ** → any chars (including /)
      if (segment === '*')  return '[^/]*';    // *  → any chars except /
      // Literal segment: escape regex specials, then handle ?
      return segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\?/g, '[^/]');              // ?  → any single char except /
    })
    .join('');
  return new RegExp('^' + re + '$', 'i');
}

function matchesPattern(url, pattern) {
  try {
    return patternToRegex(pattern).test(url);
  } catch {
    return false;
  }
}

function findMatchingRule(url, rules) {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (matchesPattern(url, rule.pattern)) return rule;
  }
  return null;
}

// ─── Native messaging ────────────────────────────────────────────────────────

function openInExternalBrowser(url, browser) {
  return new Promise((resolve, reject) => {
    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch (err) {
      reject(new Error(`Cannot connect to native host "${NATIVE_HOST}". ` +
        'Make sure you have installed the native messaging host. ' +
        `Details: ${err.message}`));
      return;
    }

    const timeout = setTimeout(() => {
      port.disconnect();
      reject(new Error('Native host timed out after 5 s'));
    }, 5000);

    port.onMessage.addListener((msg) => {
      clearTimeout(timeout);
      port.disconnect();
      if (msg.success) resolve(msg);
      else reject(new Error(msg.error || 'Unknown native host error'));
    });

    port.onDisconnect.addListener(() => {
      clearTimeout(timeout);
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
    });

    port.postMessage({ url, browser });
  });
}

// ─── Tab / navigation handling ───────────────────────────────────────────────

// Track tabs we are about to close so webNavigation doesn't re-trigger.
const suppressedTabs = new Set();

async function handleExternalNavigation(tabId, url, rule) {
  suppressedTabs.add(tabId);
  try {
    // Blank the tab immediately so the user doesn't see a flash
    await chrome.tabs.update(tabId, { url: 'about:blank' });
    await openInExternalBrowser(url, rule.browser);
    // Close the now-blank tab after a short delay
    setTimeout(() => {
      chrome.tabs.remove(tabId).catch(() => {});
      suppressedTabs.delete(tabId);
    }, 300);
  } catch (err) {
    suppressedTabs.delete(tabId);
    console.error('[BrowserSwitch] Failed to open in external browser:', err.message);
    // Notify the user via the extension badge
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#e53e3e' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
    // Store the last error for display in the popup
    chrome.storage.session.set({ lastError: err.message });
  }
}

// webNavigation fallback – catches programmatic navigation not intercepted by
// the content script (redirects, JS-driven navigation, address-bar entries…).
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;           // top-level only
  if (suppressedTabs.has(details.tabId)) return;
  if (!details.url.startsWith('http')) return;

  const rules = await getRules();
  const rule  = findMatchingRule(details.url, rules);
  if (!rule || rule.action !== 'external') return;

  handleExternalNavigation(details.tabId, details.url, rule);
});

// ─── Message handling (from content script & popup) ──────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'openInExternalBrowser': {
      const { url, browser } = message;
      // If the sender is a content script, we may need to close/blank the tab
      openInExternalBrowser(url, browser)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true; // keep channel open for async response
    }

    case 'checkUrl': {
      getRules().then((rules) => {
        const rule = findMatchingRule(message.url, rules);
        sendResponse({ rule: rule || null });
      });
      return true;
    }

    case 'getRules': {
      getRules().then((rules) => sendResponse({ rules }));
      return true;
    }

    case 'getBrowsers': {
      getBrowsers().then((browsers) => sendResponse({ browsers }));
      return true;
    }

    case 'saveRules': {
      chrome.storage.sync.set({ rules: message.rules }, () => {
        sendResponse({ ok: true });
        // Broadcast updated rules to all content scripts
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'rulesUpdated',
              rules: message.rules,
            }).catch(() => {});
          }
        });
      });
      return true;
    }

    case 'saveBrowsers': {
      chrome.storage.sync.set({ browsers: message.browsers }, () =>
        sendResponse({ ok: true })
      );
      return true;
    }

    case 'getLastError': {
      chrome.storage.session.get({ lastError: null }, (r) => {
        sendResponse({ error: r.lastError });
        chrome.storage.session.remove('lastError');
      });
      return true;
    }

    case 'testNativeHost': {
      openInExternalBrowser('about:blank', 'ping')
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  }
});
