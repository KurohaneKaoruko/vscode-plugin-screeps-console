const { execSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const yes = args.includes('--yes');
const versionArgIndex = args.findIndex((a) => a === '--version');
const explicitVersion = versionArgIndex >= 0 ? args[versionArgIndex + 1] : undefined;
const bumpArg = args.find((a) => ['patch', 'minor', 'major'].includes(a));
let npmVersionForce = false;

function run(cmd) {
  if (dryRun) {
    process.stdout.write(`[dry-run] ${cmd}\n`);
    return '';
  }
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }).trim();
}

function runInherit(cmd) {
  if (dryRun) {
    process.stdout.write(`[dry-run] ${cmd}\n`);
    return;
  }
  execSync(cmd, { stdio: 'inherit' });
}

function ensureCleanGit() {
  const status = run('git status --porcelain');
  if (status.length !== 0) {
    const canPrompt = Boolean(process.stdin.isTTY) && !dryRun && !yes;
    if (!canPrompt) {
      process.stderr.write('Working tree is not clean. Commit or stash changes first.\n');
      process.exit(1);
    }

    process.stdout.write('Working tree is not clean:\n');
    process.stdout.write(`${status}\n`);
    process.stdout.write('Choose how to proceed:\n');
    process.stdout.write('  1) abort\n');
    process.stdout.write('  2) commit all changes, then continue\n');
    process.stdout.write('  3) stash all changes, then continue\n');
    process.stdout.write('  4) continue anyway\n');
  }
}

function getCurrentVersion() {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.version || typeof pkg.version !== 'string') {
    throw new Error('package.json version is missing');
  }
  return pkg.version;
}

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function bumpVersion(v, kind) {
  const p = parseVersion(v);
  if (!p) return null;
  if (kind === 'major') return `${p.major + 1}.0.0`;
  if (kind === 'minor') return `${p.major}.${p.minor + 1}.0`;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function resolveDirtyWorkingTreeIfNeeded() {
  const status = run('git status --porcelain');
  if (status.length === 0) return;

  const canPrompt = Boolean(process.stdin.isTTY) && !dryRun && !yes;
  if (!canPrompt) {
    process.stderr.write('Working tree is not clean. Commit or stash changes first.\n');
    process.exit(1);
  }

  const choice = String(await ask('Choice (1-4): ')).trim();
  if (choice === '2') {
    runInherit('git add -A');
    runInherit('git commit -m "chore: prepare release"');
    return;
  }
  if (choice === '3') {
    runInherit('git stash push -u -m "pre-release"');
    return;
  }
  if (choice === '4') {
    npmVersionForce = true;
    return;
  }
  process.stderr.write('Release canceled.\n');
  process.exit(1);
}

async function chooseNextVersion(currentVersion) {
  if (explicitVersion) return explicitVersion;
  if (bumpArg) return bumpVersion(currentVersion, bumpArg);

  const canPrompt = Boolean(process.stdin.isTTY) && !dryRun && !yes;
  if (!canPrompt) return bumpVersion(currentVersion, 'patch');

  process.stdout.write(`Current version: ${currentVersion}\n`);
  process.stdout.write('Select release type:\n');
  process.stdout.write('  1) patch\n');
  process.stdout.write('  2) minor\n');
  process.stdout.write('  3) major\n');
  process.stdout.write('  4) custom (enter X.Y.Z)\n');

  const choice = String(await ask('Choice (1-4): ')).trim();
  if (choice === '2') return bumpVersion(currentVersion, 'minor');
  if (choice === '3') return bumpVersion(currentVersion, 'major');
  if (choice === '4') {
    const v = String(await ask('Version (X.Y.Z): ')).trim();
    return v;
  }
  return bumpVersion(currentVersion, 'patch');
}

async function confirmOrExit(currentVersion, nextVersion) {
  if (dryRun || yes) return;
  process.stdout.write(`Current version: ${currentVersion}\n`);
  process.stdout.write(`Next version:    ${nextVersion}\n`);
  const answer = await ask('Proceed? (y/N) ');
  const normalized = String(answer).trim().toLowerCase();
  if (!(normalized === 'y' || normalized === 'yes')) {
    process.stderr.write('Release canceled.\n');
    process.exit(1);
  }
}

(async () => {
  ensureCleanGit();
  await resolveDirtyWorkingTreeIfNeeded();

  runInherit('npm run compile');

  const currentVersion = getCurrentVersion();
  const canPrompt = Boolean(process.stdin.isTTY) && !dryRun && !yes;

  let nextVersion = await chooseNextVersion(currentVersion);
  while (true) {
    if (!nextVersion || !parseVersion(nextVersion)) {
      if (!explicitVersion && !bumpArg && canPrompt) {
        process.stderr.write('Invalid version. Use X.Y.Z\n');
        nextVersion = await chooseNextVersion(currentVersion);
        continue;
      }
      process.stderr.write('Invalid next version. Use X.Y.Z\n');
      process.exit(1);
    }

    if (nextVersion === currentVersion) {
      if (!explicitVersion && !bumpArg && canPrompt) {
        process.stderr.write('Version not changed. Please choose a different version.\n');
        nextVersion = await chooseNextVersion(currentVersion);
        continue;
      }
      process.stderr.write('Version not changed.\n');
      process.exit(1);
    }

    const existingTag = run(`git tag -l v${nextVersion}`);
    if (existingTag.length !== 0) {
      if (!explicitVersion && !bumpArg && canPrompt) {
        process.stderr.write(`Tag already exists: v${nextVersion}\n`);
        nextVersion = await chooseNextVersion(currentVersion);
        continue;
      }
      process.stderr.write(`Tag already exists: v${nextVersion}\n`);
      process.exit(1);
    }

    break;
  }

  await confirmOrExit(currentVersion, nextVersion);

  runInherit(`npm version ${nextVersion} -m "chore(release): %s"${npmVersionForce ? ' --force' : ''}`);
  runInherit('git push');
  runInherit('git push --tags');
})().catch((err) => {
  process.stderr.write(`${err?.message ?? String(err)}\n`);
  process.exit(1);
});

