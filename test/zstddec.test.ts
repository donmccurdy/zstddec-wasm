import assert from 'node:assert';
import { test } from 'node:test';
import { TextDecoder } from 'node:util';
import { ZSTDDecoder } from '../dist/zstddec.modern.js';
import { ZSTDDecoder as ZSTDDecoderStreaming } from '../dist/zstddec-stream.modern.js';

const HELLO_WORLD_ZSTD = new Uint8Array([
	40, 181, 47, 253, 36, 13, 105, 0, 0, 104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100, 33, 10, 154, 39, 191, 122,
]);

test('zstddec', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();
	const data = zstd.decode(HELLO_WORLD_ZSTD, 13);
	const text = new TextDecoder().decode(data);
	assert.strictEqual(text, 'hello world!\n', 'decodes text');
});

test('zstddec-stream', async () => {
	const zstd = new ZSTDDecoderStreaming();
	await zstd.init();
	const data = zstd.decode(HELLO_WORLD_ZSTD); // uncompressed length optional
	const text = new TextDecoder().decode(data);
	assert.strictEqual(text, 'hello world!\n', 'decodes text');
});
