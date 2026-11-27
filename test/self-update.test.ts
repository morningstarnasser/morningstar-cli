import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkForUpdate, performUpdate, getInstallDir, getCurrentVersion } from '../src/self-update.js';
import { runUpdateProcess, npmInvocation } from '../src/update-process.js';

const root = fileURLToPath(new URL('..', import.meta.url));
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'user.name=Update Test', '-c', 'user.email=update@example.test', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function fixture(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'morningstar-update-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const seed = join(dir, 'seed'); const remote = join(dir, 'upstream.git');
  // Spaces, &, Unicode exercise Windows argv handling without shell expansion.
  const live = join(dir, 'install & café');
  mkdirSync(seed); git(seed, 'init', '-b', 'stable');
  const writeVersion = (version: string) => {
    writeFileSync(join(seed, 'package.json'), JSON.stringify({ name: 'morningstar-cli', version, type: 'module', scripts: { typecheck: 'node check.js', build: 'node build.js' } }, null, 2) + '\n');
    writeFileSync(join(seed, 'package-lock.json'), JSON.stringify({ name: 'morningstar-cli', version, lockfileVersion: 3, packages: { '': { name: 'morningstar-cli', version } } }, null, 2) + '\n');
  };
  writeVersion('1.0.0');
  writeFileSync(join(seed, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(seed, 'check.js'), '');
  writeFileSync(join(seed, 'build.js'), "import{mkdirSync,writeFileSync}from'node:fs';mkdirSync('node_modules',{recursive:true});writeFileSync('node_modules/prepared','new');\n");
  mkdirSync(join(seed, 'bin')); mkdirSync(join(seed, 'dist'));
  for (const name of ['self-update.js', 'update-process.js', 'update-cli.js']) cpSync(join(root, 'dist', name), join(seed, 'dist', name));
  writeFileSync(join(seed, 'bin', 'morningstar.js'), "import{readFileSync}from'node:fs';if(process.argv[2]==='update'){const{runUpdateCli}=await import('../dist/update-cli.js');process.exitCode=await runUpdateCli(process.argv.slice(3));}else{console.log(JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version)}\n");
  git(seed, 'add', '.'); git(seed, 'commit', '-m', 'baseline');
  git(dir, 'clone', '--bare', seed, remote); git(seed, 'remote', 'add', 'release', remote);
  git(dir, 'clone', '--origin', 'release', remote, live);
  mkdirSync(join(live, 'node_modules')); writeFileSync(join(live, 'node_modules', 'previous'), 'old');
  const initial = git(live, 'rev-parse', 'HEAD');
  const publish = (version = '1.1.0') => {
    writeVersion(version); git(seed, 'add', '.'); git(seed, 'commit', '--allow-empty', '-m', 'release'); git(seed, 'push', 'release', 'stable');
    return git(seed, 'rev-parse', 'HEAD');
  };
  const unchanged = () => { assert.equal(git(live, 'rev-parse', 'HEAD'), initial); assert.equal(readFileSync(join(live, 'node_modules', 'previous'), 'utf8'), 'old'); };
  return { dir, seed, live, remote, initial, publish, unchanged };
}

test('ESM installation detection ignores cwd and reads the real package version', () => {
  assert.equal(resolve(getInstallDir()!), resolve(root));
  assert.equal(getCurrentVersion(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
});

test('real Git/npm update follows configured remote and non-main branch; no-op remains clean', async t => {
  const f = fixture(t); const target = f.publish();
  const check = await checkForUpdate({ installDir: f.live });
  assert.equal(check.status, 'available', check.message); assert.equal(check.remote, 'release'); assert.equal(check.branch, 'stable'); f.unchanged();
  const result = await performUpdate({ installDir: f.live });
  assert.equal(result.success, true, result.output); assert.equal(result.changed, true); assert.equal(result.toVersion, '1.1.0'); assert.equal(result.commit, target);
  assert.equal(readFileSync(join(f.live, 'node_modules', 'prepared'), 'utf8'), 'new'); assert.equal(existsSync(join(f.live, 'node_modules', 'previous')), false);
  assert.equal(git(f.live, 'status', '--porcelain'), '');
  assert.equal((await checkForUpdate({ installDir: f.live })).status, 'current');
  assert.equal((await performUpdate({ installDir: f.live })).changed, false);
  assert.equal(readdirSync(f.dir).filter(x => x.startsWith('.morningstar-update-')).length, 0);
  assert.equal(git(f.live, 'worktree', 'list', '--porcelain').split('worktree ').length, 2);
});

test('same-version commit is still a real update', async t => {
  const f = fixture(t); const target = f.publish('1.0.0');
  const result = await performUpdate({ installDir: f.live });
  assert.equal(result.success, true, result.output); assert.equal(result.changed, true); assert.equal(result.commit, target);
});

for (const state of ['unstaged', 'staged', 'untracked', 'detached', 'ahead', 'diverged', 'no-upstream', 'lock'] as const) {
  test(`protects ${state} checkout without changing live source/dependencies`, async t => {
    const f = fixture(t); f.publish();
    if (state === 'unstaged' || state === 'staged') { writeFileSync(join(f.live, 'check.js'), '// local'); if (state === 'staged') git(f.live, 'add', 'check.js'); }
    if (state === 'untracked') writeFileSync(join(f.live, 'precious.txt'), 'keep');
    if (state === 'detached') git(f.live, 'checkout', '--detach');
    if (state === 'ahead' || state === 'diverged') { if (state === 'ahead') git(f.live, 'pull', '--ff-only'); git(f.live, 'commit', '--allow-empty', '-m', 'local'); }
    if (state === 'no-upstream') git(f.live, 'branch', '--unset-upstream');
    if (state === 'lock') writeFileSync(join(f.live, '.git', 'morningstar-update.lock'), 'existing');
    const before = git(f.live, 'rev-parse', 'HEAD'); const status = git(f.live, 'status', '--porcelain');
    const result = await performUpdate({ installDir: f.live });
    assert.equal(result.success, false); assert.equal(result.changed, false); assert.equal(git(f.live, 'rev-parse', 'HEAD'), before); assert.equal(git(f.live, 'status', '--porcelain'), status);
    assert.equal(readFileSync(join(f.live, 'node_modules', 'previous'), 'utf8'), 'old');
  });
}

test('failed candidate build preserves installation and removes owned worktree', async t => {
  const f = fixture(t); writeFileSync(join(f.seed, 'build.js'), 'process.exit(19)'); f.publish();
  const result = await performUpdate({ installDir: f.live });
  assert.equal(result.success, false); assert.match(result.output, /Build.*19/); f.unchanged();
  assert.equal(readdirSync(f.dir).filter(x => x.startsWith('.morningstar-update-')).length, 0);
});

test('edits arriving during preparation are preserved and block activation', async t => {
  const f = fixture(t); f.publish();
  const result = await performUpdate({ installDir: f.live, onProgress(message) { if (message === 'Build …') writeFileSync(join(f.live, 'check.js'), '// user edit'); } });
  assert.equal(result.success, false); f.unchanged(); assert.equal(readFileSync(join(f.live, 'check.js'), 'utf8'), '// user edit');
});

test('offline remote fails honestly; no public repository fallback', async t => {
  const f = fixture(t); git(f.live, 'remote', 'set-url', 'release', join(f.dir, 'missing'));
  const result = await checkForUpdate({ installDir: f.live });
  assert.equal(result.status, 'error'); assert.equal(result.latestVersion, null); f.unchanged();
});

test('unsupported archive and aborted check do not pretend to be current', async t => {
  const f = fixture(t); const dir = join(f.dir, 'archive'); mkdirSync(dir); cpSync(join(f.live, 'package.json'), join(dir, 'package.json'));
  assert.equal((await checkForUpdate({ installDir: dir })).status, 'unsupported');
  assert.equal((await checkForUpdate({ installDir: f.live, signal: AbortSignal.abort() })).status, 'error'); f.unchanged();
});

test('installed launcher works outside checkout, JSON check/update and unknown flag exit codes', async t => {
  const f = fixture(t); const target = f.publish(); const command = join(f.live, 'bin', 'morningstar.js');
  // Child runs in an unrelated directory and Git env points at the wrong repo.
  const env = { ...process.env, GIT_DIR: join(f.seed, '.git'), GIT_WORK_TREE: f.seed };
  const invoke = (...args: string[]) => spawnSync(process.execPath, [command, 'update', ...args], { cwd: f.dir, env, encoding: 'utf8' });
  const check = invoke('--check', '--json'); assert.equal(check.status, 0, check.stderr + check.stdout); assert.equal(JSON.parse(check.stdout).status, 'available'); f.unchanged();
  const update = invoke('--json'); assert.equal(update.status, 0, update.stderr + update.stdout); assert.equal(JSON.parse(update.stdout).commit, target);
  const bad = invoke('--force'); assert.equal(bad.status, 2); assert.match(bad.stderr, /Nutzung/);
  assert.equal(invoke('--help').status, 0);
});

test('npm uses its JS entry and child args remain data; timeout output is redacted', async () => {
  const npm = npmInvocation(); assert.equal(npm.command, process.execPath); assert.match(npm.args[0], /npm-cli\.js$/);
  const values = ['a & b', '$(echo wrong)', '"quote"', 'café'];
  const text = await runUpdateProcess(process.execPath, ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...values], root, 'argv', 5000);
  assert.deepEqual(JSON.parse(text), values);
  await assert.rejects(runUpdateProcess(process.execPath, ['-e', "console.error('sensitive-output');setInterval(()=>{},1000)"], root, 'timeout test', 100), error => {
    assert.match((error as Error).message, /Zeitlimit/); assert.doesNotMatch((error as Error).message, /sensitive-output/); return true;
  });
});

test('activation failure restores old dependencies without resetting source', async t => {
  const f = fixture(t); f.publish();
  const result = await performUpdate({ installDir: f.live, onProgress(message) {
    if (message.startsWith('Aktiviere')) writeFileSync(join(f.live, '.git', 'index.lock'), 'occupied');
  } });
  assert.equal(result.success, false); assert.equal(result.changed, false); assert.match(result.output, /wiederhergestellt/); f.unchanged();
  assert.equal(readFileSync(join(f.live, '.git', 'index.lock'), 'utf8'), 'occupied');
});

test('branch switch at unchanged HEAD blocks activation', async t => {
  const f = fixture(t); f.publish();
  const result = await performUpdate({ installDir: f.live, onProgress(message) {
    if (message === 'Build …') git(f.live, 'checkout', '-b', 'other');
  } });
  assert.equal(result.success, false); assert.match(result.output, /Update-Zweig/); f.unchanged();
});

test('Git hooks do not run during an update', async t => {
  const f = fixture(t); f.publish();
  const hook = join(f.live, '.git', 'hooks', 'post-merge');
  writeFileSync(hook, '#!/bin/sh\necho unexpected > hook-ran.txt\n', { mode: 0o755 });
  const result = await performUpdate({ installDir: f.live });
  assert.equal(result.success, true, result.output); assert.equal(existsSync(join(f.live, 'hook-ran.txt')), false);
});
