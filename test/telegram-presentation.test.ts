import { test } from "node:test";
import assert from "node:assert/strict";
import { telegramPages, telegramToolLabel } from "../src/telegram/presentation.js";

test("Telegram renders headings, emphasis and compact table rows without repeated column headers", () => {
  const [page] = telegramPages("## VPS\n\n| Kategorie | Wert |\n|---|---|\n| RAM | 4 GB |\n| Disk | 25 % |\n\n**Verified** and `code`.");
  assert.match(page.html, /<b>VPS<\/b>/);
  assert.match(page.html, /<b>RAM<\/b>: 4 GB/);
  assert.match(page.html, /<code>code<\/code>/);
  assert.doesNotMatch(page.text, /Kategorie|Wert/);
});

test("untrusted HTML and links remain inert, safe links preserve their label", () => {
  const [page] = telegramPages('<script>bad</script>\n\n[x](javascript:alert) [safe](https://example.test/?a=1&b=2)');
  assert.match(page.html, /&lt;script&gt;/);
  assert.doesNotMatch(page.html, /<script|href="javascript:/);
  assert.match(page.html, /href="https:\/\/example.test\/\?a=1&amp;b=2"/);
});

test("long code and emoji pages have bounded, independently balanced HTML without broken characters", () => {
  const input = "<&🙂>".repeat(1800);
  const pages = telegramPages("```\n" + input + "\n```");
  assert.ok(pages.length > 1);
  assert.equal(pages.map(p => p.text).join(""), input);
  for (const page of pages) {
    assert.ok(page.html.length <= 3600);
    assert.match(page.html, /^<pre>[\s\S]*<\/pre>$/);
    assert.doesNotMatch(page.html, /[\uD800-\uDFFF]/u);
  }
  assert.equal(telegramToolLabel("mcp__host_status__get_system__0123456789abcdef"), "get system");
});
