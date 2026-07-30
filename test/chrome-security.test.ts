import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChromeUrl } from "../src/chrome.js";

test("Chrome launch accepts web URLs and rejects option or script injection", () => {
  assert.equal(normalizeChromeUrl(), "about:blank");
  assert.equal(normalizeChromeUrl("about:blank"), "about:blank");
  assert.equal(normalizeChromeUrl("https://example.com/a?q=1"), "https://example.com/a?q=1");
  assert.equal(normalizeChromeUrl("--user-data-dir=/tmp/evil"), null);
  assert.match(
    normalizeChromeUrl('https://example.com/"; touch /tmp/pwn; "') || "",
    /^https:\/\/example\.com\//,
  );
  assert.equal(normalizeChromeUrl("javascript:alert(1)"), null);
});
