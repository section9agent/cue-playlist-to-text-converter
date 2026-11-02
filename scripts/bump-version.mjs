#!/usr/bin/env node
// Keeps every version number in step. Usage: npm run bump -- 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];

// Plain X.Y.Z only: the Windows MSI installer rejects pre-release names like 0.2.0-beta.1
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run bump -- <version>   (for example: npm run bump -- 0.2.0)');
  process.exit(1);
}

const read = (p) => readFileSync(join(root, p), 'utf8');
const write = (p, s) => writeFileSync(join(root, p), s);
const changed = [];

function setJson(path, edit) {
  const data = JSON.parse(read(path));
  edit(data);
  write(path, JSON.stringify(data, null, 2) + '\n');
  changed.push(path);
}

setJson('package.json', (d) => { d.version = version; });
setJson('package-lock.json', (d) => {
  d.version = version;
  if (d.packages && d.packages['']) d.packages[''].version = version;
});
setJson('src-tauri/tauri.conf.json', (d) => { d.version = version; });

// Cargo.toml: only the [package] version line
let toml = read('src-tauri/Cargo.toml');
const pkgBlock = /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/;
if (!pkgBlock.test(toml)) throw new Error('Could not find the version in src-tauri/Cargo.toml');
write('src-tauri/Cargo.toml', toml.replace(pkgBlock, `$1${version}$2`));
changed.push('src-tauri/Cargo.toml');

// Cargo.lock: the entry for this crate
let lock = read('src-tauri/Cargo.lock');
const entry = /(name = "discogs-tracklist-tool"\nversion = ")[^"]+(")/;
if (entry.test(lock)) {
  write('src-tauri/Cargo.lock', lock.replace(entry, `$1${version}$2`));
  changed.push('src-tauri/Cargo.lock');
}

console.log(`Version set to ${version} in:\n  ${changed.join('\n  ')}`);
console.log(`\nNext:\n  git commit -am "Release v${version}"\n  git tag v${version}\n  git push && git push --tags`);
