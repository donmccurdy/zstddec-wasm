const test = require('tape');
const util = require('util');
const { ZSTDDecoder } = require('./');

const { TextDecoder } = typeof window === 'undefined' ? util : window;

const HELLO_WORLD_ZSTD = new Uint8Array([
  40, 181,  47, 253,  36,  13, 105,
   0,   0, 104, 101, 108, 108, 111,
  32, 119, 111, 114, 108, 100,  33,
  10, 154,  39, 191, 122
]);

test('zstddec', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();
	const data = zstd.decode(HELLO_WORLD_ZSTD, 13);
	const text = new TextDecoder().decode(data);
	t.equals(text, 'hello world!\n', 'decodes text');
	t.end();
});
