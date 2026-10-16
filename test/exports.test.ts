import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('every published export condition points to a built file', async () => {
	const manifest: unknown = JSON.parse(
		await readFile(new URL('../package.json', import.meta.url), 'utf8'),
	);
	assert.ok(typeof manifest === 'object' && manifest !== null && 'exports' in manifest);
	const exports = manifest.exports;
	assert.ok(typeof exports === 'object' && exports !== null);
	for (const [subpath, conditions] of Object.entries(exports)) {
		assert.ok(typeof conditions === 'object' && conditions !== null);
		for (const [condition, path] of Object.entries(conditions)) {
			assert.ok(typeof path === 'string' && path.startsWith('./'), `${subpath}: ${condition}`);
			await access(new URL(`../${path}`, import.meta.url));
		}
	}
});
