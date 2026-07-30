import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyProjectEnv,
  loadProjectEnvFiles,
  parseProjectEnv,
  validateProjectEnvEntry,
} from "../src/env.js";

test("blocks process-execution environment controls case-insensitively", () => {
  const dangerous = [
    "BASH_ENV",
    "ENV",
    "NODE_OPTIONS",
    "NODE_PATH",
    "HTTP_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
    "AWS_CA_BUNDLE",
    "GIT_SSL_CAINFO",
    "GIT_SSL_CAPATH",
    "GIT_SSL_NO_VERIFY",
    "NPM_CONFIG_CAFILE",
    "NPM_CONFIG_STRICT_SSL",
    "PYTHONPATH",
    "PYTHONHOME",
    "RUBYOPT",
    "PERL5OPT",
    "JAVA_TOOL_OPTIONS",
    "DOTNET_STARTUP_HOOKS",
    "LD_PRELOAD",
    "DYLD_INSERT_LIBRARIES",
    "GCONV_PATH",
    "GIT_CONFIG_COUNT",
    "git_config_key_0",
    "GIT_SSH_COMMAND",
    "GIT_ASKPASS",
    "GIT_EXTERNAL_DIFF",
    "SSH_ASKPASS",
    "PROMPT_COMMAND",
    "LESSOPEN",
    "NPM_CONFIG_SCRIPT_SHELL",
    "RUSTC_WRAPPER",
    "CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER",
    "GOFLAGS",
    "KUBECONFIG",
    "MORNINGSTAR_STT_CMD",
    "MORNINGSTAR_AUTO_EXECUTE_CODE_BLOCKS",
    "MORNINGSTAR_TEAMS_FILE",
    "MORNINGSTAR_REMOTE_AGENT_HOST",
    "TELEGRAM_BOT_TOKEN",
    "telegram_allowed_users",
    "MORNINGSTAR_TELEGRAM_CWD",
    "OLLAMA_HOST",
    "OLLAMA_MODELS",
    "CUSTOM_COMMAND",
    "__proto__",
  ];

  for (const key of dangerous) {
    const validation = validateProjectEnvEntry(key, "attacker-value");
    assert.equal(validation.allowed, false, `${key} should be blocked`);
    assert.ok(validation.reason, `${key} should have a rejection reason`);
  }
});

test("preserves API, provider, Morningstar, Ollama runtime, and ordinary configuration", () => {
  const safe = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_BASE_URL",
    "GOOGLE_API_KEY",
    "HF_TOKEN",
    "MORNINGSTAR_TELEGRAM_MODEL",
    "MORNINGSTAR_HOOK_PROFILE",
    "OLLAMA_KEEP_ALIVE",
    "NODE_ENV",
    "PYTHONUNBUFFERED",
    "GIT_AUTHOR_NAME",
    "CUSTOM_FEATURE_FLAG",
  ];

  for (const key of safe) {
    assert.equal(
      validateProjectEnvEntry(key, "normal-value").allowed,
      true,
      `${key} should remain supported`,
    );
  }
});

test("rejects malformed keys, non-string settings values, and NUL bytes", () => {
  assert.equal(validateProjectEnvEntry("BAD-KEY", "value").allowed, false);
  assert.equal(validateProjectEnvEntry("1BAD", "value").allowed, false);
  assert.equal(validateProjectEnvEntry("SAFE_KEY", 123).allowed, false);
  assert.equal(validateProjectEnvEntry("SAFE_KEY", "before\0after").allowed, false);
});

test("applies safe entries, never overwrites inherited values, and reports blocked keys", () => {
  const target: NodeJS.ProcessEnv = {
    OPENAI_API_KEY: "inherited",
    TELEGRAM_BOT_TOKEN: "trusted-global-token",
    TELEGRAM_ALLOWED_USERS: "123456",
    MORNINGSTAR_TELEGRAM_CWD: "/trusted/global/workspace",
    MORNINGSTAR_TEAMS_FILE: "/trusted/global/teams.json",
    MORNINGSTAR_REMOTE_AGENT_HOST: "trusted-operator",
    OLLAMA_HOST: "http://127.0.0.1:11434",
    OLLAMA_MODELS: "/trusted/global/models",
    HTTPS_PROXY: "http://trusted-proxy.internal:8080",
    SSL_CERT_FILE: "/trusted/ca.pem",
  };
  const report = applyProjectEnv(
    {
      OPENAI_API_KEY: "project",
      TELEGRAM_BOT_TOKEN: "attacker-token",
      TELEGRAM_ALLOWED_USERS: "999999",
      MORNINGSTAR_TELEGRAM_CWD: "/",
      MORNINGSTAR_TEAMS_FILE: "/attacker/teams.json",
      MORNINGSTAR_REMOTE_AGENT_HOST: "-oProxyCommand=./payload",
      OLLAMA_HOST: "https://attacker.example",
      OLLAMA_MODELS: "/attacker/controlled/models",
      HTTPS_PROXY: "http://attacker.example:8080",
      SSL_CERT_FILE: "./attacker-ca.pem",
      GIT_SSL_NO_VERIFY: "1",
      NPM_CONFIG_STRICT_SSL: "false",
      NODE_OPTIONS: "--require ./payload.js",
      GIT_CONFIG_COUNT: "1",
      INVALID_VALUE: 42,
    },
    target,
    "settings.env",
  );

  assert.equal(target.OPENAI_API_KEY, "inherited");
  assert.equal(target.TELEGRAM_BOT_TOKEN, "trusted-global-token");
  assert.equal(target.TELEGRAM_ALLOWED_USERS, "123456");
  assert.equal(target.MORNINGSTAR_TELEGRAM_CWD, "/trusted/global/workspace");
  assert.equal(target.MORNINGSTAR_TEAMS_FILE, "/trusted/global/teams.json");
  assert.equal(target.MORNINGSTAR_REMOTE_AGENT_HOST, "trusted-operator");
  assert.equal(target.OLLAMA_HOST, "http://127.0.0.1:11434");
  assert.equal(target.OLLAMA_MODELS, "/trusted/global/models");
  assert.equal(target.HTTPS_PROXY, "http://trusted-proxy.internal:8080");
  assert.equal(target.SSL_CERT_FILE, "/trusted/ca.pem");
  assert.equal(target.NODE_OPTIONS, undefined);
  assert.equal(target.GIT_CONFIG_COUNT, undefined);
  assert.deepEqual(report.applied, []);
  assert.deepEqual(report.skippedExisting, ["OPENAI_API_KEY"]);
  assert.deepEqual(
    report.rejected.map((entry) => entry.key),
    [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_ALLOWED_USERS",
      "MORNINGSTAR_TELEGRAM_CWD",
      "MORNINGSTAR_TEAMS_FILE",
      "MORNINGSTAR_REMOTE_AGENT_HOST",
      "OLLAMA_HOST",
      "OLLAMA_MODELS",
      "HTTPS_PROXY",
      "SSL_CERT_FILE",
      "GIT_SSL_NO_VERIFY",
      "NPM_CONFIG_STRICT_SSL",
      "NODE_OPTIONS",
      "GIT_CONFIG_COUNT",
      "INVALID_VALUE",
    ],
  );
  assert.ok(report.rejected.every((entry) => entry.source === "settings.env"));
});

test("parses the supported KEY=value subset without evaluating shell syntax", () => {
  const parsed = parseProjectEnv(`
    # comment
    PLAIN=value
    DOUBLE="two words"
    SINGLE='three words'
    URL=https://example.test/path?a=b
    export NOT_SUPPORTED=value
    EMPTY=
  `);

  assert.deepEqual({ ...parsed }, {
    PLAIN: "value",
    DOUBLE: "two words",
    SINGLE: "three words",
    URL: "https://example.test/path?a=b",
    "export NOT_SUPPORTED": "value",
    EMPTY: "",
  });
  assert.equal(
    validateProjectEnvEntry(
      "export NOT_SUPPORTED",
      parsed["export NOT_SUPPORTED"],
    ).allowed,
    false,
  );
});

test(".env.local keeps precedence while dangerous values from both files fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "morningstar-env-test-"));
  try {
    writeFileSync(
      join(dir, ".env.local"),
      [
        "MODEL_SOURCE=local",
        "TELEGRAM_BOT_TOKEN=attacker-token",
        "TELEGRAM_ALLOWED_USERS=999999",
        "MORNINGSTAR_TELEGRAM_CWD=/",
        "MORNINGSTAR_TEAMS_FILE=/tmp/attacker-teams.json",
        "MORNINGSTAR_REMOTE_AGENT_HOST=-oProxyCommand=./payload",
        "OLLAMA_HOST=http://localhost:11434",
        "OLLAMA_MODELS=./attacker-models",
        "HTTPS_PROXY=http://attacker.example:8080",
        "REQUESTS_CA_BUNDLE=./attacker-ca.pem",
        "GIT_SSL_NO_VERIFY=1",
        "NPM_CONFIG_STRICT_SSL=false",
        "NODE_OPTIONS=--require ./local-payload.js",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(dir, ".env"),
      [
        "MODEL_SOURCE=base",
        "DEEPSEEK_API_KEY=project-key",
        "GIT_SSH_COMMAND=./malicious-ssh",
      ].join("\n"),
      "utf-8",
    );

    const target: NodeJS.ProcessEnv = {};
    const report = loadProjectEnvFiles(dir, target);

    assert.equal(target.MODEL_SOURCE, "local");
    assert.equal(target.TELEGRAM_BOT_TOKEN, undefined);
    assert.equal(target.TELEGRAM_ALLOWED_USERS, undefined);
    assert.equal(target.MORNINGSTAR_TELEGRAM_CWD, undefined);
    assert.equal(target.MORNINGSTAR_TEAMS_FILE, undefined);
    assert.equal(target.MORNINGSTAR_REMOTE_AGENT_HOST, undefined);
    assert.equal(target.OLLAMA_HOST, undefined);
    assert.equal(target.OLLAMA_MODELS, undefined);
    assert.equal(target.HTTPS_PROXY, undefined);
    assert.equal(target.REQUESTS_CA_BUNDLE, undefined);
    assert.equal(target.GIT_SSL_NO_VERIFY, undefined);
    assert.equal(target.NPM_CONFIG_STRICT_SSL, undefined);
    assert.equal(target.DEEPSEEK_API_KEY, "project-key");
    assert.equal(target.NODE_OPTIONS, undefined);
    assert.equal(target.GIT_SSH_COMMAND, undefined);
    assert.deepEqual(report.skippedExisting, ["MODEL_SOURCE"]);
    assert.deepEqual(
      report.rejected.map((entry) => [entry.source, entry.key]),
      [
        [".env.local", "TELEGRAM_BOT_TOKEN"],
        [".env.local", "TELEGRAM_ALLOWED_USERS"],
        [".env.local", "MORNINGSTAR_TELEGRAM_CWD"],
        [".env.local", "MORNINGSTAR_TEAMS_FILE"],
        [".env.local", "MORNINGSTAR_REMOTE_AGENT_HOST"],
        [".env.local", "OLLAMA_HOST"],
        [".env.local", "OLLAMA_MODELS"],
        [".env.local", "HTTPS_PROXY"],
        [".env.local", "REQUESTS_CA_BUNDLE"],
        [".env.local", "GIT_SSL_NO_VERIFY"],
        [".env.local", "NPM_CONFIG_STRICT_SSL"],
        [".env.local", "NODE_OPTIONS"],
        [".env", "GIT_SSH_COMMAND"],
      ],
    );
    assert.deepEqual(report.readErrors, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
