import assert from 'node:assert';
import { test } from 'node:test';
import { TextDecoder } from 'node:util';
import { ZSTDDecoder } from '../dist/zstddec.mjs';
import { ZSTDDecoder as ZSTDDecoderStreaming } from '../dist/zstddec-stream.mjs';

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

test('zstddec: truncated frame throws', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();
	const truncated = HELLO_WORLD_ZSTD.slice(0, 20);
	assert.throws(() => zstd.decode(truncated, 13), /ZSTDDecoder: zstd error 72/);
	assert.throws(() => zstd.decode(truncated), /ZSTDDecoder: invalid frame/);
});

test('zstddec: corrupt frame throws', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();
	const corrupt = HELLO_WORLD_ZSTD.slice();
	corrupt[0] ^= 0xff; // magic number
	assert.throws(() => zstd.decode(corrupt, 13), /ZSTDDecoder: zstd error 10/);
	const reservedBit = HELLO_WORLD_ZSTD.slice();
	reservedBit[4] |= 0x08; // frame header descriptor
	assert.throws(() => zstd.decode(reservedBit, 13), /ZSTDDecoder: zstd error 14/);
});

test('zstddec: unknown content size throws', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();
	// Compressed with zstd --no-content-size.
	const noContentSize = new Uint8Array([
		0x28, 0xb5, 0x2f, 0xfd, 0x04, 0x18, 0xb5, 0x01, 0x00, 0xd4, 0x02, 0x54, 0x68, 0x65, 0x20, 0x71, 0x75, 0x69, 0x63,
		0x6b, 0x20, 0x62, 0x72, 0x6f, 0x77, 0x6e, 0x20, 0x66, 0x6f, 0x78, 0x20, 0x6a, 0x75, 0x6d, 0x70, 0x73, 0x20, 0x6f,
		0x76, 0x65, 0x72, 0x20, 0x74, 0x68, 0x65, 0x20, 0x6c, 0x61, 0x7a, 0x79, 0x20, 0x64, 0x6f, 0x67, 0x2e, 0x20, 0x01,
		0x00, 0x25, 0x0b, 0xd8, 0xab, 0x32, 0x0a, 0x0a, 0x8e, 0xd4,
	]);
	assert.throws(() => zstd.decode(noContentSize), /ZSTDDecoder: Unknown content size/);
});

test('zstddec: uncompressedSize too small throws, too large decodes', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();
	assert.throws(() => zstd.decode(HELLO_WORLD_ZSTD, 5), /ZSTDDecoder: zstd error 70/);
	const text = new TextDecoder().decode(zstd.decode(HELLO_WORLD_ZSTD, 100));
	assert.strictEqual(text, 'hello world!\n', 'decodes text');
});

test('zstddec-stream', async () => {
	const zstd = new ZSTDDecoderStreaming();
	await zstd.init();
	const data = zstd.decode(HELLO_WORLD_ZSTD); // uncompressed length optional
	const text = new TextDecoder().decode(data);
	assert.strictEqual(text, 'hello world!\n', 'decodes text');
});
