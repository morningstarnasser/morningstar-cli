import { test } from "node:test";
import assert from "node:assert/strict";

import { paginateApprovalTarget } from "../src/components/ApprovalPrompt.js";
import { escapeApprovalDisplay } from "../src/approval-display.js";

test("approval arguments remain fully inspectable across bounded pages", () => {
  const target = `{"recipient":"admin@example.test","payload":"${"x".repeat(4_000)}","delete":true}`;
  const pages = paginateApprovalTarget(target, 500);

  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length <= 500));
  assert.equal(pages.join(""), target);
  assert.match(pages[0], /admin@example\.test/);
  assert.match(pages.at(-1) ?? "", /delete/);
});

test("approval display escapes terminal and bidi control characters", () => {
  const original = "safe\u001b[2Jhidden\rreplace\b\n\t\u202etxt";
  const escaped = escapeApprovalDisplay(original);

  assert.equal(
    escaped,
    "safe\\x1b[2Jhidden\\x0dreplace\\x08\\x0a\\x09\\u{202e}txt",
  );
  assert.doesNotMatch(escaped, /[\u0000-\u001f\u007f-\u009f\u202e]/);
});
