#!/usr/bin/env node
// One-time setup for automatic updates: creates the signing key pair.
//   npm run updater-key
// The PUBLIC key is written into src-tauri/tauri.conf.json.
// The PRIVATE key stays in a file on your computer; you paste it into a GitHub secret.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const confPath = join(root, 'src-tauri', 'tauri.conf.json');
const keyPath = process.argv[2] || join(homedir(), '.tauri', 'cue-converter-updater.key');
const pubPath = keyPath + '.pub';

const conf = JSON.parse(readFileSync(confPath, 'utf8'));
if (conf.plugins?.updater?.pubkey) {
  console.error('A public key is already set in src-tauri/tauri.conf.json, so nothing was changed.');
  console.error('Replacing it would stop already-installed copies from accepting updates.');
  process.exit(1);
}
if (existsSync(keyPath) || existsSync(pubPath)) {
  console.error(`A key file already exists at ${keyPath}. Move it away or pass a different path:`);
  console.error('  npm run updater-key -- C:\\path\\to\\new.key');
  process.exit(1);
}

const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
if (!existsSync(cli)) {
  console.error('Run "npm install" first, then try again.');
  process.exit(1);
}
console.log(`Creating a signing key at ${keyPath}`);
console.log('You will be asked for a password. Remember it (or leave it empty).\n');
const r = spawnSync(process.execPath, [cli, 'signer', 'generate', '-w', keyPath], { stdio: 'inherit', cwd: root });
if (r.status !== 0 || !existsSync(pubPath)) {
  console.error('Key creation failed.');
  process.exit(r.status || 1);
}

conf.plugins = conf.plugins || {};
conf.plugins.updater = conf.plugins.updater || {};
conf.plugins.updater.pubkey = readFileSync(pubPath, 'utf8').trim();
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

console.log('\nDone. The public key is now in src-tauri/tauri.conf.json. Commit that change.\n');
console.log('Next, in GitHub: Settings > Secrets and variables > Actions > New repository secret');
console.log('  1. TAURI_SIGNING_PRIVATE_KEY           = the full contents of');
console.log(`       ${keyPath}`);
console.log('  2. TAURI_SIGNING_PRIVATE_KEY_PASSWORD  = the password you chose (skip if you left it empty)');
console.log('\nKeep the private key file safe and never commit it. If you lose it, installed copies can no longer update.');
