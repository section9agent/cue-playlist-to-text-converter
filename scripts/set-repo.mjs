#!/usr/bin/env node
// Tells the app which GitHub repository its releases live in.
// The release workflow runs this with GITHUB_REPOSITORY; to build locally with
// updates working, run: npm run set-repo -- yourname/yourrepo
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = process.argv[2] || process.env.GITHUB_REPOSITORY || '';

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
  console.error('Usage: npm run set-repo -- <owner>/<repository>   (for example: npm run set-repo -- janedoe/cue-converter)');
  process.exit(1);
}

const confPath = join(root, 'src-tauri', 'tauri.conf.json');
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.plugins = conf.plugins || {};
conf.plugins.updater = conf.plugins.updater || {};
conf.plugins.updater.endpoints = [`https://github.com/${repo}/releases/latest/download/latest.json`];
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

writeFileSync(
  join(root, 'src', 'app-info.js'),
  `// Written by scripts/set-repo.mjs.\nwindow.APP_INFO = { repo: ${JSON.stringify(repo)} };\n`
);
console.log(`Repository set to ${repo}`);
console.log(`Updates will be read from https://github.com/${repo}/releases/latest/download/latest.json`);
