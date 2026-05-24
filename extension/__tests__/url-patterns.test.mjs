/**
 * URL pattern matching tests — runs with Node's built-in test runner.
 * Usage: node --test extension/__tests__/url-patterns.test.mjs
 *
 * These functions are copied verbatim from background.js so they can run in
 * plain Node without any browser/extension APIs.  Keep them in sync!
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Functions under test (mirror of background.js) ────────────────────────────

function patternToRegex(pattern) {
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

// ── patternToRegex ────────────────────────────────────────────────────────────

describe('patternToRegex — literal patterns', () => {
  it('matches an exact URL', () => {
    assert.ok(matchesPattern('https://example.com', 'https://example.com'));
  });

  it('does not match a different URL', () => {
    assert.ok(!matchesPattern('https://other.com', 'https://example.com'));
  });

  it('escapes dots so they are not treated as regex wildcards', () => {
    // Pattern "example.com" must NOT match "exampleXcom"
    assert.ok(!matchesPattern('https://exampleXcom', 'https://example.com'));
  });

  it('is case-insensitive', () => {
    assert.ok(matchesPattern('HTTPS://EXAMPLE.COM/PATH', 'https://example.com/path'));
  });
});

describe('patternToRegex — * wildcard', () => {
  it('matches any segment without slashes', () => {
    assert.ok(matchesPattern('https://sub.example.com', 'https://*.example.com'));
  });

  it('does not match across slashes', () => {
    assert.ok(!matchesPattern('https://a/b.example.com', 'https://*.example.com'));
  });

  it('matches zero characters', () => {
    // * can match empty string at segment boundaries
    assert.ok(matchesPattern('https://.example.com', 'https://*.example.com'));
  });

  it('matches any path segment', () => {
    assert.ok(matchesPattern('https://example.com/page', 'https://example.com/*'));
  });

  it('does not match a path with multiple segments', () => {
    assert.ok(!matchesPattern('https://example.com/a/b', 'https://example.com/*'));
  });
});

describe('patternToRegex — ** wildcard', () => {
  it('matches across slashes', () => {
    assert.ok(matchesPattern('https://example.com/a/b/c', 'https://example.com/**'));
  });

  it('matches an empty tail', () => {
    assert.ok(matchesPattern('https://example.com/', 'https://example.com/**'));
  });

  it('matches a single segment (no slash)', () => {
    assert.ok(matchesPattern('https://example.com/page', 'https://example.com/**'));
  });

  it('can be used as a scheme wildcard', () => {
    assert.ok(matchesPattern('https://example.com/x', '**://example.com/x'));
    assert.ok(matchesPattern('http://example.com/x',  '**://example.com/x'));
  });
});

describe('patternToRegex — ? wildcard', () => {
  it('matches any single character except slash', () => {
    assert.ok(matchesPattern('https://example.com', 'https://example.co?'));
    assert.ok(matchesPattern('https://example.cop', 'https://example.co?'));
  });

  it('does not match a slash', () => {
    assert.ok(!matchesPattern('https://example.co/', 'https://example.co?'));
  });

  it('does not match an empty character', () => {
    assert.ok(!matchesPattern('https://example.co', 'https://example.co?'));
  });
});

describe('patternToRegex — mixed wildcards', () => {
  it('handles * and ** together', () => {
    // *.example.com/** should match any subdomain + any path
    assert.ok(matchesPattern('https://api.example.com/v1/users', 'https://*.example.com/**'));
  });

  it('does not match when subdomain has a slash', () => {
    assert.ok(!matchesPattern('https://a/b.example.com/path', 'https://*.example.com/**'));
  });
});

describe('patternToRegex — special regex characters in patterns', () => {
  it('treats literal dots correctly (not as . regex wildcard)', () => {
    assert.ok(!matchesPattern('https://exampleXcom/path', 'https://example.com/*'));
  });

  it('treats + as a literal character', () => {
    assert.ok(matchesPattern('https://c+d.com', 'https://c+d.com'));
    assert.ok(!matchesPattern('https://ccd.com', 'https://c+d.com'));
  });

  it('treats ( ) as literal characters', () => {
    assert.ok(matchesPattern('https://example.com/path(1)', 'https://example.com/path(1)'));
  });

  it('treats | as literal character', () => {
    assert.ok(matchesPattern('https://a|b.com', 'https://a|b.com'));
    assert.ok(!matchesPattern('https://a.com',  'https://a|b.com'));
  });

  it('treats ^ as literal character', () => {
    assert.ok(matchesPattern('https://ex^ample.com', 'https://ex^ample.com'));
  });
});

describe('matchesPattern — error handling', () => {
  it('returns false for an empty pattern', () => {
    assert.ok(!matchesPattern('https://example.com', ''));
  });

  it('does not throw for any input', () => {
    assert.doesNotThrow(() => matchesPattern('https://example.com', null));
    assert.doesNotThrow(() => matchesPattern(null, 'https://example.com'));
  });
});

// ── findMatchingRule ───────────────────────────────────────────────────────────

describe('findMatchingRule — rule selection', () => {
  const rules = [
    { id: '1', name: 'Work',     pattern: 'https://*.work.com/**', action: 'external', browser: 'firefox', enabled: true  },
    { id: '2', name: 'Fallback', pattern: 'https://**',            action: 'current',  browser: '',        enabled: true  },
    { id: '3', name: 'Disabled', pattern: 'https://disabled.com',  action: 'external', browser: 'chrome',  enabled: false },
  ];

  it('returns the first matching rule', () => {
    const rule = findMatchingRule('https://api.work.com/v1', rules);
    assert.equal(rule.id, '1');
  });

  it('falls through to the next rule when first does not match', () => {
    const rule = findMatchingRule('https://personal.com/page', rules);
    assert.equal(rule.id, '2');
  });

  it('skips disabled rules', () => {
    const rule = findMatchingRule('https://disabled.com', rules);
    // disabled.com matches rule 3 (disabled) then rule 2 (fallback)
    assert.equal(rule.id, '2');
  });

  it('returns null when no rule matches', () => {
    const rulesNoFallback = rules.filter((r) => r.id !== '2');
    const rule = findMatchingRule('https://personal.com', rulesNoFallback);
    assert.equal(rule, null);
  });

  it('returns null for an empty rule list', () => {
    assert.equal(findMatchingRule('https://example.com', []), null);
  });

  it('respects first-match-wins ordering', () => {
    const ordered = [
      { id: 'a', pattern: 'https://x.com/**', action: 'external', browser: 'firefox', enabled: true },
      { id: 'b', pattern: 'https://x.com/**', action: 'current',  browser: '',        enabled: true },
    ];
    assert.equal(findMatchingRule('https://x.com/page', ordered).id, 'a');
  });
});
