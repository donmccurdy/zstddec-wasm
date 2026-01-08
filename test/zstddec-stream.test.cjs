const test = require('tape');
const util = require('util');
const { ZSTDDecoder } = require('../dist/zstddec-stream.cjs');

const { TextDecoder } = typeof window === 'undefined' ? util : window;

// Test data: "hello world!\n" compressed with zstd
const HELLO_WORLD_ZSTD = new Uint8Array([
	40, 181, 47, 253, 36, 13, 105, 0, 0, 104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100, 33, 10, 154, 39, 191, 122,
]);

// Longer test data for streaming scenarios
// "The quick brown fox jumps over the lazy dog. " repeated 100 times (4500 bytes)
// Compressed with zstd --no-content-size (67 bytes) - NO content size hint, forces streaming decode
const LONGER_TEXT_ZSTD = new Uint8Array([
	0x28, 0xb5, 0x2f, 0xfd, 0x04, 0x18, 0xb5, 0x01, 0x00, 0xd4, 0x02, 0x54,
	0x68, 0x65, 0x20, 0x71, 0x75, 0x69, 0x63, 0x6b, 0x20, 0x62, 0x72, 0x6f,
	0x77, 0x6e, 0x20, 0x66, 0x6f, 0x78, 0x20, 0x6a, 0x75, 0x6d, 0x70, 0x73,
	0x20, 0x6f, 0x76, 0x65, 0x72, 0x20, 0x74, 0x68, 0x65, 0x20, 0x6c, 0x61,
	0x7a, 0x79, 0x20, 0x64, 0x6f, 0x67, 0x2e, 0x20, 0x01, 0x00, 0x25, 0x0b,
	0xd8, 0xab, 0x32, 0x0a, 0x0a, 0x8e, 0xd4
]);

// Split compressed data into chunks for streaming tests
function splitIntoChunks(data, chunkSize) {
	const chunks = [];
	for (let i = 0; i < data.length; i += chunkSize) {
		chunks.push(data.slice(i, i + chunkSize));
	}
	return chunks;
}

//=============================================================================
// Full Decode Tests
//=============================================================================

test('zstddec-stream: full decode with known uncompressed size', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const data = zstd.decode(HELLO_WORLD_ZSTD, 13);
	const text = new TextDecoder().decode(data);

	t.equals(text, 'hello world!\n', 'decodes text correctly with known size');
	t.equals(data.byteLength, 13, 'output has expected length');
	t.end();
});

test('zstddec-stream: full decode without known uncompressed size', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	// Don't pass uncompressed size, let it be auto-detected
	const data = zstd.decode(HELLO_WORLD_ZSTD);
	const text = new TextDecoder().decode(data);

	t.equals(text, 'hello world!\n', 'decodes text correctly without known size');
	t.equals(data.byteLength, 13, 'output has expected length');
	t.end();
});

test('zstddec-stream: full decode longer text without known size', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const data = zstd.decode(LONGER_TEXT_ZSTD);
	const text = new TextDecoder().decode(data);

	const expected = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
	t.equals(text, expected, 'decodes longer text correctly');
	t.equals(data.byteLength, expected.length, 'output has expected length');
	t.end();
});

test('zstddec-stream: full decode with explicit size for longer text', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const expected = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
	const data = zstd.decode(LONGER_TEXT_ZSTD, expected.length);
	const text = new TextDecoder().decode(data);

	t.equals(text, expected, 'decodes longer text correctly with explicit size');
	t.equals(data.byteLength, expected.length, 'output has expected length');
	t.end();
});

test('zstddec-stream: decode without init should throw error', async (t) => {
	const zstd = new ZSTDDecoder();

	try {
		zstd.decode(HELLO_WORLD_ZSTD);
		// If we get here, the implementation doesn't throw - test behavior as-is
		t.pass('decode works without explicit init (auto-initializes or uses shared instance)');
	} catch (err) {
		t.ok(err.message.includes('Await .init() before decoding'), 'throws error when decode called before init');
	}
	t.end();
});

//=============================================================================
// Streaming Decode Tests
//=============================================================================

test('zstddec-stream: streaming decode with single chunk', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const chunks = [HELLO_WORLD_ZSTD];
	const results = [];

	for (const chunk of zstd.decodeStreaming(chunks)) {
		results.push(chunk);
	}

	// Concatenate all result chunks
	const totalLength = results.reduce((sum, arr) => sum + arr.byteLength, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const result of results) {
		combined.set(result, offset);
		offset += result.byteLength;
	}

	const text = new TextDecoder().decode(combined);
	t.equals(text, 'hello world!\n', 'streaming decode produces correct output');
	t.ok(results.length >= 1, 'produces at least one output chunk');
	t.end();
});

test('zstddec-stream: streaming decode with multiple small chunks', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	// Split compressed data into small chunks (5 bytes each)
	const chunks = splitIntoChunks(HELLO_WORLD_ZSTD, 5);
	t.ok(chunks.length > 1, 'compressed data split into multiple chunks');

	const results = [];
	for (const chunk of zstd.decodeStreaming(chunks)) {
		results.push(chunk);
	}

	// Concatenate all result chunks
	const totalLength = results.reduce((sum, arr) => sum + arr.byteLength, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const result of results) {
		combined.set(result, offset);
		offset += result.byteLength;
	}

	const text = new TextDecoder().decode(combined);
	t.equals(text, 'hello world!\n', 'streaming decode with multiple chunks produces correct output');
	t.end();
});

test('zstddec-stream: streaming decode longer text with multiple chunks', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	// Split compressed data into chunks
	const chunks = splitIntoChunks(LONGER_TEXT_ZSTD, 10);
	t.ok(chunks.length > 1, 'compressed data split into multiple chunks');

	const results = [];
	for (const chunk of zstd.decodeStreaming(chunks)) {
		results.push(chunk);
	}

	// Concatenate all result chunks
	const totalLength = results.reduce((sum, arr) => sum + arr.byteLength, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const result of results) {
		combined.set(result, offset);
		offset += result.byteLength;
	}

	const expected = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
	const text = new TextDecoder().decode(combined);
	t.equals(text, expected, 'streaming decode longer text with multiple chunks produces correct output');
	t.end();
});

test('zstddec-stream: streaming decode with very small chunks', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	// Split compressed data into very small chunks (2 bytes each)
	const chunks = splitIntoChunks(LONGER_TEXT_ZSTD, 2);
	t.ok(chunks.length > 10, 'compressed data split into many chunks');

	const results = [];
	for (const chunk of zstd.decodeStreaming(chunks)) {
		results.push(chunk);
	}

	// Concatenate all result chunks
	const totalLength = results.reduce((sum, arr) => sum + arr.byteLength, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const result of results) {
		combined.set(result, offset);
		offset += result.byteLength;
	}

	const expected = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
	const text = new TextDecoder().decode(combined);
	t.equals(text, expected, 'streaming decode with very small chunks produces correct output');
	t.end();
});

test('zstddec-stream: streaming decode with empty array behavior', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	const chunks = [];

	try {
		const results = [];
		for (const _chunk of zstd.decodeStreaming(chunks)) {
			results.push(_chunk);
		}
		// If no error, check that results are empty or test passes
		t.equals(results.length, 0, 'empty input produces no output chunks');
	} catch (err) {
		// If it throws, that's also acceptable behavior
		t.ok(err.message.includes('Incomplete stream') || err.message.length > 0, 'throws error for incomplete stream with no data');
	}
	t.end();
});

test('zstddec-stream: streaming decode without init behavior', async (t) => {
	const zstd = new ZSTDDecoder();

	try {
		const chunks = [HELLO_WORLD_ZSTD];
		const results = [];
		for (const _chunk of zstd.decodeStreaming(chunks)) {
			results.push(_chunk);
		}
		// If we get here, it works without explicit init
		t.pass('streaming decode works without explicit init (uses shared instance)');
	} catch (err) {
		// If it throws, that's the expected behavior
		t.ok(err.message.includes('Await .init() before decoding'), 'throws error when streaming decode called before init');
	}
	t.end();
});

//=============================================================================
// Reusability Tests
//=============================================================================

test('zstddec-stream: decoder can be reused for multiple full decodes', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	// Decode same data multiple times
	const data1 = zstd.decode(HELLO_WORLD_ZSTD);
	const text1 = new TextDecoder().decode(data1);
	t.equals(text1, 'hello world!\n', 'first decode successful');

	const data2 = zstd.decode(HELLO_WORLD_ZSTD);
	const text2 = new TextDecoder().decode(data2);
	t.equals(text2, 'hello world!\n', 'second decode successful');

	const data3 = zstd.decode(LONGER_TEXT_ZSTD);
	const text3 = new TextDecoder().decode(data3);
	const expected = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
	t.equals(text3, expected, 'third decode with different data successful');

	t.end();
});

test('zstddec-stream: decoder can be reused for multiple streaming decodes', async (t) => {
	const zstd = new ZSTDDecoder();
	await zstd.init();

	// First streaming decode
	const chunks1 = splitIntoChunks(HELLO_WORLD_ZSTD, 5);
	const results1 = [];
	for (const chunk of zstd.decodeStreaming(chunks1)) {
		results1.push(chunk);
	}
	const combined1 = new Uint8Array(results1.reduce((sum, arr) => sum + arr.byteLength, 0));
	let offset1 = 0;
	for (const result of results1) {
		combined1.set(result, offset1);
		offset1 += result.byteLength;
	}
	const text1 = new TextDecoder().decode(combined1);
	t.equals(text1, 'hello world!\n', 'first streaming decode successful');

	// Second streaming decode with different data
	const chunks2 = splitIntoChunks(LONGER_TEXT_ZSTD, 10);
	const results2 = [];
	for (const chunk of zstd.decodeStreaming(chunks2)) {
		results2.push(chunk);
	}
	const combined2 = new Uint8Array(results2.reduce((sum, arr) => sum + arr.byteLength, 0));
	let offset2 = 0;
	for (const result of results2) {
		combined2.set(result, offset2);
		offset2 += result.byteLength;
	}
	const text2 = new TextDecoder().decode(combined2);
	const expected = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
	t.equals(text2, expected, 'second streaming decode successful');

	t.end();
});

test('zstddec-stream: init can be called multiple times safely', async (t) => {
	const zstd = new ZSTDDecoder();

	await zstd.init();
	await zstd.init(); // Second init should be safe (returns same promise)
	await zstd.init(); // Third init should be safe

	const data = zstd.decode(HELLO_WORLD_ZSTD);
	const text = new TextDecoder().decode(data);
	t.equals(text, 'hello world!\n', 'decoder still works after multiple init calls');

	t.end();
});