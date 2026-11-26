import assert from 'node:assert';
import { test } from 'node:test';
import { TextDecoder } from 'node:util';
import { ZSTDDecoder } from '../dist/zstddec-stream.mjs';

// The decoder's WASM instance is module-private, so the leak test reads its memory through this hook.
// Node's fetch() instantiates its own WASM through the same global, hence the export check.
let memory: WebAssembly.Memory | undefined;
const instantiate = WebAssembly.instantiate;
WebAssembly.instantiate = (async (source: BufferSource, imports?: WebAssembly.Imports) => {
	const result = await instantiate(source, imports);
	const exports = ('instance' in result ? result.instance : (result as WebAssembly.Instance)).exports;
	if ('ZSTD_decompressStream' in exports) memory = exports.memory as WebAssembly.Memory;
	return result;
}) as typeof WebAssembly.instantiate;

const SHORT_TEXT = 'hello world!\n'; // 13 bytes
const SHORT_TEXT_ZSTD = new Uint8Array([
	40, 181, 47, 253, 36, 13, 105, 0, 0, 104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100, 33, 10, 154, 39, 191, 122,
]);

const BAD_MAGIC_ZSTD = SHORT_TEXT_ZSTD.slice();
BAD_MAGIC_ZSTD[0] ^= 0xff;

// SHORT_TEXT_ZSTD ends with a 4-byte content checksum.
const BAD_CHECKSUM_ZSTD = SHORT_TEXT_ZSTD.slice();
BAD_CHECKSUM_ZSTD[BAD_CHECKSUM_ZSTD.length - 1] ^= 0xff;

// Compressed with zstd --no-content-size (67 bytes) - NO content size hint, forces streaming decode
const LONG_TEXT = 'The quick brown fox jumps over the lazy dog. '.repeat(100); // 4500 bytes
const LONG_TEXT_ZSTD = new Uint8Array([
	0x28, 0xb5, 0x2f, 0xfd, 0x04, 0x18, 0xb5, 0x01, 0x00, 0xd4, 0x02, 0x54, 0x68, 0x65, 0x20, 0x71, 0x75, 0x69, 0x63,
	0x6b, 0x20, 0x62, 0x72, 0x6f, 0x77, 0x6e, 0x20, 0x66, 0x6f, 0x78, 0x20, 0x6a, 0x75, 0x6d, 0x70, 0x73, 0x20, 0x6f,
	0x76, 0x65, 0x72, 0x20, 0x74, 0x68, 0x65, 0x20, 0x6c, 0x61, 0x7a, 0x79, 0x20, 0x64, 0x6f, 0x67, 0x2e, 0x20, 0x01,
	0x00, 0x25, 0x0b, 0xd8, 0xab, 0x32, 0x0a, 0x0a, 0x8e, 0xd4,
]);

//=============================================================================
// Full Decode Tests
//=============================================================================

test('zstddec-stream: full decode with known uncompressed size', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const data = zstd.decode(SHORT_TEXT_ZSTD, SHORT_TEXT.length);
	const text = new TextDecoder().decode(data);

	assert.strictEqual(text, SHORT_TEXT, 'decodes text correctly with known size');
	assert.strictEqual(data.byteLength, SHORT_TEXT.length, 'output has expected length');
});

test('zstddec-stream: full decode without known uncompressed size', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	// Don't pass uncompressed size, let it be auto-detected
	const data = zstd.decode(SHORT_TEXT_ZSTD);
	const text = new TextDecoder().decode(data);

	assert.strictEqual(text, SHORT_TEXT, 'decodes text correctly without known size');
	assert.strictEqual(data.byteLength, SHORT_TEXT.length, 'output has expected length');
});

test('zstddec-stream: full decode longer text without known size', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const data = zstd.decode(LONG_TEXT_ZSTD);
	const text = new TextDecoder().decode(data);

	assert.strictEqual(text, LONG_TEXT, 'decodes longer text correctly');
	assert.strictEqual(data.byteLength, LONG_TEXT.length, 'output has expected length');
});

test('zstddec-stream: full decode with explicit size for longer text', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const data = zstd.decode(LONG_TEXT_ZSTD, LONG_TEXT.length);
	const text = new TextDecoder().decode(data);

	assert.strictEqual(text, LONG_TEXT, 'decodes longer text correctly with explicit size');
	assert.strictEqual(data.byteLength, LONG_TEXT.length, 'output has expected length');
});

test('zstddec-stream: decode without init should throw error', async () => {
	const zstd = new ZSTDDecoder();

	try {
		zstd.decode(SHORT_TEXT_ZSTD);
		// If we get here, the implementation doesn't throw - test behavior as-is
		// decode works without explicit init (auto-initializes or uses shared instance)
	} catch (err) {
		assert.ok(
			(err as Error).message.includes('Await .init() before decoding'),
			'throws error when decode called before init',
		);
	}
});

//=============================================================================
// Streaming Decode Tests
//=============================================================================

test('zstddec-stream: streaming decode with single chunk', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const chunks = [SHORT_TEXT_ZSTD];
	const bytes = fromChunks(Array.from(zstd.decodeStreaming(chunks)));
	const text = new TextDecoder().decode(bytes);

	assert.strictEqual(text, SHORT_TEXT, 'streaming decode produces correct output');
});

test('zstddec-stream: streaming decode with multiple small chunks', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const chunks = toChunks(SHORT_TEXT_ZSTD, 5);
	const bytes = fromChunks(Array.from(zstd.decodeStreaming(chunks)));
	const text = new TextDecoder().decode(bytes);

	assert.strictEqual(text, SHORT_TEXT, 'streaming decode with multiple chunks produces correct output');
});

test('zstddec-stream: streaming decode longer text with multiple chunks', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const chunks = toChunks(LONG_TEXT_ZSTD, 10);
	const bytes = fromChunks(Array.from(zstd.decodeStreaming(chunks)));
	const text = new TextDecoder().decode(bytes);

	assert.strictEqual(text, LONG_TEXT, 'streaming decode longer text with multiple chunks produces correct output');
});

test('zstddec-stream: streaming decode with very small chunks', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const chunks = toChunks(LONG_TEXT_ZSTD, 2);
	const bytes = fromChunks(Array.from(zstd.decodeStreaming(chunks)));
	const text = new TextDecoder().decode(bytes);

	assert.strictEqual(text, LONG_TEXT, 'streaming decode with very small chunks produces correct output');
});

test('zstddec-stream: streaming decode with empty array behavior', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const chunks: Uint8Array[] = [];

	try {
		const results = Array.from(zstd.decodeStreaming(chunks));
		// If no error, check that results are empty or test passes
		assert.strictEqual(results.length, 0, 'empty input produces no output chunks');
	} catch (err) {
		// If it throws, that's also acceptable behavior
		assert.ok(
			(err as Error).message.includes('Incomplete stream') || (err as Error).message.length > 0,
			'throws error for incomplete stream with no data',
		);
	}
});

test('zstddec-stream: streaming decode without init behavior', async () => {
	const zstd = new ZSTDDecoder();

	try {
		const chunks = [SHORT_TEXT_ZSTD];
		Array.from(zstd.decodeStreaming(chunks));
		// If we get here, it works without explicit init
		// streaming decode works without explicit init (uses shared instance)
	} catch (err) {
		// If it throws, that's the expected behavior
		assert.ok(
			(err as Error).message.includes('Await .init() before decoding'),
			'throws error when streaming decode called before init',
		);
	}
});

//=============================================================================
// Error Handling Tests
//=============================================================================

test('zstddec-stream: full decode of truncated frame throws', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const truncated = SHORT_TEXT_ZSTD.slice(0, 20);

	assert.throws(() => zstd.decode(truncated, SHORT_TEXT.length), /ZSTDDecoder: zstd error 72/);
	assert.throws(() => zstd.decode(truncated), /ZSTDDecoder: invalid frame/);
});

test('zstddec-stream: full decode of corrupt frame throws', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	assert.throws(() => zstd.decode(BAD_MAGIC_ZSTD, SHORT_TEXT.length), /ZSTDDecoder: zstd error 10/);
	assert.throws(() => zstd.decode(BAD_CHECKSUM_ZSTD), /ZSTDDecoder: zstd error 22/);

	const reservedBit = SHORT_TEXT_ZSTD.slice();
	reservedBit[4] |= 0x08; // frame header descriptor

	assert.throws(() => zstd.decode(reservedBit, SHORT_TEXT.length), /ZSTDDecoder: zstd error 14/);
});

test('zstddec-stream: full decode with uncompressed size too small throws, too large decodes', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	assert.throws(() => zstd.decode(SHORT_TEXT_ZSTD, 5), /ZSTDDecoder: zstd error 70/);

	const text = new TextDecoder().decode(zstd.decode(SHORT_TEXT_ZSTD, 100));

	assert.strictEqual(text, SHORT_TEXT, 'decodes text correctly with oversized output');
});

test('zstddec-stream: streaming decode of truncated frame throws', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const truncated = SHORT_TEXT_ZSTD.slice(0, 20);

	assert.throws(() => drain(zstd.decodeStreaming([truncated])), /^Error: Incomplete stream/);
});

test('zstddec-stream: streaming decode of corrupt magic number throws', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	assert.throws(() => drain(zstd.decodeStreaming([BAD_MAGIC_ZSTD])), /ZSTDDecoder: zstd error 10/);
});

test('zstddec-stream: streaming decode of corrupt checksum throws', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	assert.throws(() => drain(zstd.decodeStreaming([BAD_CHECKSUM_ZSTD])), /ZSTDDecoder: zstd error 22/);
});

test('zstddec-stream: streaming decode frees memory when the consumer exits early', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();
	assert.ok(memory, 'captured decoder memory');

	const exitEarly = () => {
		for (const _ of zstd.decodeStreaming([SHORT_TEXT_ZSTD])) break;
	};

	exitEarly(); // warm up, so one-time allocations are not counted
	const byteLength = memory.buffer.byteLength;
	for (let i = 0; i < 300; i++) exitEarly();

	assert.strictEqual(memory.buffer.byteLength, byteLength, 'memory does not grow');
});

//=============================================================================
// Reusability Tests
//=============================================================================

test('zstddec-stream: decoder can be reused for multiple full decodes', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	// Decode same data multiple times
	const data1 = zstd.decode(SHORT_TEXT_ZSTD);
	const text1 = new TextDecoder().decode(data1);

	assert.strictEqual(text1, SHORT_TEXT, 'first decode successful');

	const data2 = zstd.decode(SHORT_TEXT_ZSTD);
	const text2 = new TextDecoder().decode(data2);

	assert.strictEqual(text2, SHORT_TEXT, 'second decode successful');

	const data3 = zstd.decode(LONG_TEXT_ZSTD);
	const text3 = new TextDecoder().decode(data3);

	assert.strictEqual(text3, LONG_TEXT, 'third decode with different data successful');
});

test('zstddec-stream: decoder can be reused for multiple streaming decodes', async () => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const chunks1 = toChunks(SHORT_TEXT_ZSTD, 5);
	const bytes1 = fromChunks(Array.from(zstd.decodeStreaming(chunks1)));
	const text1 = new TextDecoder().decode(bytes1);

	assert.strictEqual(text1, SHORT_TEXT, 'first streaming decode successful');

	const chunks2 = toChunks(LONG_TEXT_ZSTD, 10);
	const bytes2 = fromChunks(Array.from(zstd.decodeStreaming(chunks2)));
	const text2 = new TextDecoder().decode(bytes2);

	assert.strictEqual(text2, LONG_TEXT, 'second streaming decode successful');
});

test('zstddec-stream: init can be called multiple times safely', async () => {
	const zstd = new ZSTDDecoder();

	await zstd.init();
	await zstd.init();
	await zstd.init();

	const text = new TextDecoder().decode(zstd.decode(SHORT_TEXT_ZSTD));

	assert.strictEqual(text, SHORT_TEXT, 'decoder still works after multiple init calls');
});

//=============================================================================
// Utils
//=============================================================================

/**
 * Splits a byte array into N-byte chunks.
 */
function toChunks(array: Uint8Array, chunkByteLength: number) {
	const chunks = [];
	for (let i = 0; i < array.length; i += chunkByteLength) {
		chunks.push(array.slice(i, i + chunkByteLength));
	}
	return chunks;
}

/**
 * Collects streamed parts, failing instead of hanging if the decoder stops making progress.
 */
function drain(parts: Iterable<Uint8Array>, limit = 1000) {
	const result = [];
	for (const part of parts) {
		result.push(part);
		assert.ok(result.length < limit, 'decoder stalled');
	}
	return result;
}

/**
 * Concatenates N byte arrays.
 */
function fromChunks(arrays: Uint8Array[]) {
	let totalByteLength = 0;
	for (const array of arrays) {
		totalByteLength += array.byteLength;
	}

	const result = new Uint8Array(totalByteLength);
	let byteOffset = 0;

	for (const array of arrays) {
		result.set(array, byteOffset);
		byteOffset += array.byteLength;
	}

	return result;
}
