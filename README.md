# zstddec

[ZSTD (Zstandard)](https://github.com/facebook/zstd) decoder for Web and Node.js, using WebAssembly.

## Installation

```shell
npm install --save zstddec
```

## API

```javascript
import { ZSTDecoder } from 'zstddec';

const decoder = new ZSTDDecoder();

await decoder.init();

const decompressedArray = decoder.decode( compressedArray, uncompressedSize );
```

**Limitations:** The decoder may fail with the error `wasm function signature contains illegal type` when the `uncompressedSize` is not known in advance and given to the `decode()` method. This is presumably a bug in the WASM bindings, which I am not yet sure how to fix.

## License

JavaScript wrapper is provided under the MIT License, and the WASM ZSTD decoder is provided under the BSD 3-Clause License.