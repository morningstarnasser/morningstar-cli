import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const VALID_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * Environment variables that can make a later child process load code, source
 * attacker-controlled configuration, select an executable, or write through a
 * helper command. Project files are not trusted to set these process controls.
 */
const BLOCKED_EXACT = new Map([
    // Shell startup, resolution, and prompt hooks.
    ["BASH_ENV", "shell startup file injection"],
    ["ENV", "shell startup file injection"],
    ["ZDOTDIR", "shell startup directory injection"],
    ["PROMPT_COMMAND", "shell prompt command injection"],
    ["BASHOPTS", "shell option injection"],
    ["SHELLOPTS", "shell option injection"],
    ["BASH_XTRACEFD", "shell file-descriptor injection"],
    ["PS4", "shell trace expansion injection"],
    ["IFS", "shell tokenization injection"],
    ["CDPATH", "shell path resolution injection"],
    ["GLOBIGNORE", "shell glob behavior injection"],
    ["PATH", "executable search-path injection"],
    ["FPATH", "shell function search-path injection"],
    ["SHELL", "shell executable injection"],
    ["COMSPEC", "command interpreter injection"],
    ["PATHEXT", "executable resolution injection"],
    ["HOME", "runtime configuration redirection"],
    ["USERPROFILE", "runtime configuration redirection"],
    ["APPDATA", "runtime configuration redirection"],
    ["LOCALAPPDATA", "runtime configuration redirection"],
    ["PROGRAMDATA", "runtime configuration redirection"],
    ["HOMEDRIVE", "runtime configuration redirection"],
    ["HOMEPATH", "runtime configuration redirection"],
    ["XDG_CONFIG_HOME", "runtime configuration redirection"],
    ["INPUTRC", "interactive shell configuration injection"],
    ["PSMODULEPATH", "PowerShell module search-path injection"],
    // Node and JavaScript runtimes.
    ["NODE_OPTIONS", "Node runtime option injection"],
    ["NODE_PATH", "Node module search-path injection"],
    ["NODE_REPL_EXTERNAL_MODULE", "Node module preload injection"],
    ["NODE_REDIRECT_WARNINGS", "Node output-file injection"],
    ["NODE_EXTRA_CA_CERTS", "Node trust-store injection"],
    ["NODE_TLS_REJECT_UNAUTHORIZED", "Node TLS policy override"],
    // Network routing and trust stores. Project-controlled values could redirect
    // credential-bearing provider traffic or make it trust an attacker CA.
    // Explicit values inherited from the parent process remain supported.
    ["HTTP_PROXY", "project environment cannot redirect HTTP traffic"],
    ["HTTPS_PROXY", "project environment cannot redirect HTTPS traffic"],
    ["ALL_PROXY", "project environment cannot redirect network traffic"],
    ["NO_PROXY", "project environment cannot change proxy bypass rules"],
    ["SSL_CERT_FILE", "project environment cannot replace the TLS trust store"],
    ["SSL_CERT_DIR", "project environment cannot replace the TLS trust store"],
    ["REQUESTS_CA_BUNDLE", "project environment cannot replace the Python TLS trust store"],
    ["CURL_CA_BUNDLE", "project environment cannot replace the curl TLS trust store"],
    ["AWS_CA_BUNDLE", "project environment cannot replace the AWS TLS trust store"],
    ["GIT_SSL_CAINFO", "project environment cannot replace the Git TLS trust store"],
    ["GIT_SSL_CAPATH", "project environment cannot replace the Git TLS trust store"],
    ["GIT_SSL_NO_VERIFY", "project environment cannot disable Git TLS verification"],
    ["NPM_CONFIG_CAFILE", "project environment cannot replace the npm TLS trust store"],
    ["NPM_CONFIG_STRICT_SSL", "project environment cannot disable npm TLS verification"],
    // Python, Ruby, Perl, Lua, and PHP loaders/startup hooks.
    ["PYTHONPATH", "Python module search-path injection"],
    ["PYTHONHOME", "Python runtime path injection"],
    ["PYTHONSTARTUP", "Python startup script injection"],
    ["PYTHONINSPECT", "Python interactive startup injection"],
    ["PYTHONBREAKPOINT", "Python callable injection"],
    ["PYTHONEXECUTABLE", "Python executable injection"],
    ["PYTHONWARNINGS", "Python warning-module import injection"],
    ["PYTHONPLATLIBDIR", "Python standard-library path injection"],
    ["VIRTUAL_ENV", "Python environment redirection"],
    ["RUBYOPT", "Ruby runtime option injection"],
    ["RUBYLIB", "Ruby module search-path injection"],
    ["GEM_HOME", "Ruby package path injection"],
    ["GEM_PATH", "Ruby package path injection"],
    ["PERL5OPT", "Perl runtime option injection"],
    ["PERL5LIB", "Perl module search-path injection"],
    ["PERLLIB", "Perl module search-path injection"],
    ["LUA_INIT", "Lua startup code injection"],
    ["LUA_PATH", "Lua module search-path injection"],
    ["LUA_CPATH", "Lua native module search-path injection"],
    ["PHPRC", "PHP configuration injection"],
    ["PHP_INI_SCAN_DIR", "PHP configuration path injection"],
    // JVM and .NET startup hooks/module loaders.
    ["JAVA_TOOL_OPTIONS", "JVM option/agent injection"],
    ["_JAVA_OPTIONS", "JVM option/agent injection"],
    ["JDK_JAVA_OPTIONS", "JVM option/agent injection"],
    ["CLASSPATH", "JVM class search-path injection"],
    ["JAVA_HOME", "JVM executable path injection"],
    ["DOTNET_STARTUP_HOOKS", ".NET startup hook injection"],
    ["DOTNET_ADDITIONAL_DEPS", ".NET dependency injection"],
    ["DOTNET_SHARED_STORE", ".NET assembly search-path injection"],
    ["DOTNET_ROOT", ".NET runtime path injection"],
    // OpenSSL and native runtime loaders.
    ["OPENSSL_CONF", "OpenSSL configuration injection"],
    ["OPENSSL_ENGINES", "OpenSSL engine path injection"],
    ["OPENSSL_MODULES", "OpenSSL module path injection"],
    ["SSLKEYLOGFILE", "TLS key-log file injection"],
    ["LIBPATH", "native library search-path injection"],
    ["SHLIB_PATH", "native library search-path injection"],
    ["LDR_PRELOAD", "native library preload injection"],
    ["GCONV_PATH", "glibc conversion-module injection"],
    ["LOCPATH", "locale module search-path injection"],
    ["NLSPATH", "message-catalog search-path injection"],
    ["GLIBC_TUNABLES", "glibc runtime option injection"],
    ["ASAN_SYMBOLIZER_PATH", "sanitizer executable injection"],
    ["LLVM_SYMBOLIZER_PATH", "sanitizer executable injection"],
    // Git/SSH helper execution and editor/pager command hooks.
    ["GIT_SSH", "Git SSH executable injection"],
    ["GIT_SSH_COMMAND", "Git SSH command injection"],
    ["GIT_ASKPASS", "Git credential helper command injection"],
    ["GIT_PROXY_COMMAND", "Git proxy command injection"],
    ["GIT_EXTERNAL_DIFF", "Git external diff command injection"],
    ["GIT_EDITOR", "Git editor command injection"],
    ["GIT_SEQUENCE_EDITOR", "Git editor command injection"],
    ["GIT_PAGER", "Git pager command injection"],
    ["GIT_EXEC_PATH", "Git executable path injection"],
    ["SSH_ASKPASS", "SSH credential helper command injection"],
    ["SSH_ASKPASS_REQUIRE", "SSH credential helper policy injection"],
    ["SSH_AUTH_SOCK", "SSH agent redirection"],
    ["PAGER", "pager command injection"],
    ["MANPAGER", "pager command injection"],
    ["SYSTEMD_PAGER", "pager command injection"],
    ["LESSOPEN", "pager preprocessor command injection"],
    ["LESSCLOSE", "pager postprocessor command injection"],
    ["EDITOR", "editor command injection"],
    ["VISUAL", "editor command injection"],
    ["BROWSER", "browser command injection"],
    // Package/build tool configuration that can select executable helpers.
    ["NPM_CONFIG_USERCONFIG", "npm configuration redirection"],
    ["NPM_CONFIG_GLOBALCONFIG", "npm configuration redirection"],
    ["NPM_CONFIG_SCRIPT_SHELL", "npm script shell injection"],
    ["NPM_CONFIG_NODE_OPTIONS", "npm Node option injection"],
    ["YARN_RC_FILENAME", "Yarn configuration redirection"],
    ["YARN_PATH", "Yarn executable injection"],
    ["YARN_ENABLE_SCRIPTS", "Yarn lifecycle-script policy injection"],
    ["YARN_IGNORE_SCRIPTS", "Yarn lifecycle-script policy injection"],
    ["RUSTC_WRAPPER", "Rust compiler wrapper injection"],
    ["RUSTC_WORKSPACE_WRAPPER", "Rust compiler wrapper injection"],
    ["RUSTFLAGS", "Rust compiler/linker option injection"],
    ["CARGO_HOME", "Cargo configuration redirection"],
    ["GOFLAGS", "Go tool-execution option injection"],
    ["GOENV", "Go configuration redirection"],
    ["GOROOT", "Go runtime/tool path injection"],
    ["GOTOOLDIR", "Go tool path injection"],
    ["MAKEFLAGS", "make option/makefile injection"],
    ["MFLAGS", "make option injection"],
    ["MAKEFILES", "makefile preload injection"],
    ["CC", "compiler executable injection"],
    ["CXX", "compiler executable injection"],
    ["CPP", "preprocessor executable injection"],
    ["AR", "build-tool executable injection"],
    ["AS", "build-tool executable injection"],
    ["LD", "linker executable injection"],
    ["NM", "build-tool executable injection"],
    ["RANLIB", "build-tool executable injection"],
    ["STRIP", "build-tool executable injection"],
    // Configuration roots that support executable credential/helper plugins.
    ["AWS_CONFIG_FILE", "AWS credential-process configuration injection"],
    ["BOTO_CONFIG", "cloud SDK configuration injection"],
    ["CLOUDSDK_CONFIG", "cloud SDK configuration injection"],
    ["KUBECONFIG", "Kubernetes exec-plugin configuration injection"],
    ["DOCKER_CONFIG", "Docker credential-helper configuration injection"],
    ["GH_CONFIG_DIR", "GitHub CLI configuration injection"],
    // Morningstar switches whose values directly select or enable execution.
    ["MORNINGSTAR_STT_CMD", "Morningstar command injection"],
    ["MORNINGSTAR_AUTO_EXECUTE_CODE_BLOCKS", "Morningstar auto-execution override"],
    ["MORNINGSTAR_TEAMS_FILE", "project environment cannot redirect global agent-team storage"],
    ["MORNINGSTAR_REMOTE_AGENT_HOST", "project environment cannot redirect the remote-agent SSH host"],
    // Telegram gateway identity, authorization, and its filesystem root must be
    // selected only by the parent environment or ~/.morningstar configuration.
    ["TELEGRAM_BOT_TOKEN", "project environment cannot replace the Telegram bot identity"],
    ["TELEGRAM_ALLOWED_USERS", "project environment cannot replace the Telegram allowlist"],
    ["MORNINGSTAR_TELEGRAM_CWD", "project environment cannot expand the Telegram workspace root"],
    // Provider routing and local model discovery are security boundaries. A
    // repository-controlled value could redirect full prompts to an arbitrary
    // HTTP endpoint or make the CLI traverse an attacker-selected model tree.
    // Parent-process/global values remain supported because this validator is
    // applied only to project settings and project .env files.
    ["OLLAMA_HOST", "project environment cannot redirect the Ollama provider"],
    ["OLLAMA_MODELS", "project environment cannot redirect Ollama model discovery"],
    ["__PROTO__", "JavaScript object meta-property injection"],
    ["PROTOTYPE", "JavaScript object meta-property injection"],
    ["CONSTRUCTOR", "JavaScript object meta-property injection"],
]);
const BLOCKED_PREFIXES = [
    ["LD_", "dynamic-loader environment injection"],
    ["DYLD_", "macOS dynamic-loader environment injection"],
    ["_RLD_", "native dynamic-loader environment injection"],
    ["GIT_CONFIG", "Git configuration injection"],
    ["BASH_FUNC_", "exported shell-function injection"],
];
const EXECUTABLE_SELECTOR_SUFFIX = /(?:^|_)(?:CMD|COMMAND|EXEC|EXECUTABLE|SHELL|WRAPPER|LINKER|RUNNER|PAGER|EDITOR|PRELOAD)$/;
/**
 * Pure classification helper. Matching is case-insensitive so the same policy
 * remains safe on case-insensitive environment implementations.
 */
export function validateProjectEnvEntry(key, value) {
    if (!VALID_ENV_KEY.test(key)) {
        return { allowed: false, reason: "invalid environment variable name" };
    }
    if (typeof value !== "string") {
        return { allowed: false, reason: "environment value must be a string" };
    }
    if (value.includes("\0")) {
        return { allowed: false, reason: "environment value contains a NUL byte" };
    }
    const normalized = key.toUpperCase();
    const exactReason = BLOCKED_EXACT.get(normalized);
    if (exactReason)
        return { allowed: false, reason: exactReason };
    for (const [prefix, reason] of BLOCKED_PREFIXES) {
        if (normalized.startsWith(prefix)) {
            return { allowed: false, reason };
        }
    }
    if (EXECUTABLE_SELECTOR_SUFFIX.test(normalized)) {
        return {
            allowed: false,
            reason: "project environment cannot select an executable or command",
        };
    }
    return { allowed: true };
}
/** Parse the intentionally small KEY=value subset historically supported. */
export function parseProjectEnv(content) {
    const parsed = Object.create(null);
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 1)
            continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (value.length >= 2
            && ((value.startsWith("\"") && value.endsWith("\""))
                || (value.startsWith("'") && value.endsWith("'")))) {
            value = value.slice(1, -1);
        }
        parsed[key] = value;
    }
    return parsed;
}
function emptyReport() {
    return {
        applied: [],
        skippedExisting: [],
        rejected: [],
        readErrors: [],
    };
}
function mergeReport(target, source) {
    target.applied.push(...source.applied);
    target.skippedExisting.push(...source.skippedExisting);
    target.rejected.push(...source.rejected);
    target.readErrors.push(...source.readErrors);
    return target;
}
/**
 * Apply trusted-by-policy project values without replacing inherited process
 * values. Invalid or dangerous entries fail closed and are reported by key only.
 */
export function applyProjectEnv(values, target = process.env, source = "settings.env") {
    const report = emptyReport();
    if (!values)
        return report;
    for (const [key, value] of Object.entries(values)) {
        const validation = validateProjectEnvEntry(key, value);
        if (!validation.allowed) {
            report.rejected.push({
                key,
                source,
                reason: validation.reason ?? "blocked project environment variable",
            });
            continue;
        }
        if (target[key] !== undefined) {
            report.skippedExisting.push(key);
            continue;
        }
        try {
            target[key] = value;
            report.applied.push(key);
        }
        catch (error) {
            report.rejected.push({
                key,
                source,
                reason: `environment assignment failed: ${error.message}`,
            });
        }
    }
    return report;
}
/**
 * Load project `.env.local` then `.env`, preserving the historical precedence
 * (`.env.local` wins) while applying the process-execution policy to both.
 */
export function loadProjectEnvFiles(dir, target = process.env) {
    const report = emptyReport();
    for (const source of [".env.local", ".env"]) {
        const envPath = join(dir, source);
        if (!existsSync(envPath))
            continue;
        try {
            const values = parseProjectEnv(readFileSync(envPath, "utf-8"));
            mergeReport(report, applyProjectEnv(values, target, source));
        }
        catch (error) {
            report.readErrors.push({
                source,
                reason: error.message,
            });
        }
    }
    return report;
}
//# sourceMappingURL=env.js.map