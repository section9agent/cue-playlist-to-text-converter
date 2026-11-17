const test = require('node:test');
const assert = require('node:assert/strict');

test('next version', async () => {
  const { nextVersion } = await import('../scripts/next-version.mjs');
  assert.equal(nextVersion('0.1.0', []), '0.1.0');                          // first ever release
  assert.equal(nextVersion('0.1.0', ['v0.1.0']), '0.1.1');                  // the clash that used to fail
  assert.equal(nextVersion('0.1.0', ['v0.1.0', 'v0.1.1', 'v0.1.2']), '0.1.3');
  assert.equal(nextVersion('0.1.0', ['v0.2.0', 'v0.1.9']), '0.2.1');        // highest wins, not newest
  assert.equal(nextVersion('0.1.10', ['v0.1.9']), '0.1.10');                // numeric, not text, comparison
  assert.equal(nextVersion('1.0.0', ['v0.9.9']), '1.0.0');                  // files already ahead: keep
  assert.equal(nextVersion('0.1.0', ['latest', '', 'v0.1.0-beta']), '0.1.0'); // junk ignored
  assert.throws(() => nextVersion('abc', []));
});
