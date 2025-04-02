# bun-split-file

**File splitter and merger for Bun**  
A faster way to split files into parts and safely merge them back with Bun — with optional checksum verification and flexible part-size logic.

---

## Installation

```bash
bun add bun-split-file
```

> Requires **Bun** (https://bun.sh)

---

### Performance compared to existing package: `split-file`
```
Tested On
runtime: Bun 1.2.8
Iterations: 10
test-file's size: 100 MB
disk: SSD 

Average bun‑split‑file (split + merge): 460.94 ms
Average split‑file (split + merge): 914.72 ms
```


---

### Split a File

Split files in multiple ways to match your needs

```ts
import { splitFile } from 'bun-split-file';

// Split by fixed part size (10MB each)
await splitFile('./input/video.mp4', './chunks', {
  splitBy: 'size',
  partSize: 10 * 1024 * 1024, // 10MB per part
  createChecksum: 'sha256',
  extraBytesHandling: 'distribute', // distribute extra bytes across parts
});

// Split into specific number of parts
await splitFile('./input/large-dataset.csv', './parts', {
  splitBy: 'numberOfParts',
  numberOfParts: 5,
  createChecksum: 'sha256',
  deleteFileAfterSplit: true, // remove original after splitting
});

// Distribute extra bytes to an additional file
await splitFile('./input/large-dataset.csv', './parts', {
  splitBy: 'numberOfParts',
  numberOfParts: 5,
  extraBytesHandling: 'newFile',
});
```

### Merge Files

```ts
import { mergeFiles } from 'bun-split-file';

await mergeFiles(
  [
    './chunks/video.mp4.001',
    './chunks/video.mp4.002',
    './chunks/video.mp4.003',
  ],
  './output/video-restored.mp4',
  {
    checksumPath: './chunks/video.mp4.checksum.sha256',
    deletePartsAfterMerge: true,
  }
);
```

---

## API Reference

### `splitFile(inputFilePath, outputPath, options)`

| Option                 | Type                                | Description                                                                                                                                        |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `splitBy`              | `'numberOfParts'` or `'size'`              | How to split the file                                                                                                                              |
| `numberOfParts`        | `number`                            | Required if `splitBy = 'numberOfParts'`                                                                                                                   |
| `partSize`             | `number`                            | Required if `splitBy = 'size'`                                                                                                                     |
| `createChecksum`       | `SupportedCryptoAlgorithms`         | Optional hash (e.g., `'sha256'`) - [Supported algorithms](https://bun.sh/docs/api/hashing#bun-cryptohasher)                                        |
| `extraBytesHandling`   | `'distribute'` or `'newFile'` | Optional. `distribute`: Distributes extra bytes across parts `newFile`: Creates an additional file for remaining bytes. Default `distribute` |
| `deleteFileAfterSplit` | `boolean`                           | Optional. Delete original file after split, default `false`                                                                                        |

### `mergeFiles(inputFilePaths, outputFilePath, options?)`

| Option                  | Type      | Description                                  |
| ----------------------- | --------- | -------------------------------------------- |
| `checksumPath`          | `string`  | Path to `file-name.HashAlg` file to validate |
| `deletePartsAfterMerge` | `boolean` | Remove parts after merge                     |

---

## Output Examples

### Splitting Files

#### With `extraBytesHandling: 'distribute'`

When splitting a 25MB file into 3 parts with the `distribute` option:

```ts
await splitFile('./input/data.bin', './chunks', {
  splitBy: 'numberOfParts',
  numberOfParts: 3,
  createChecksum: 'sha256',
  extraBytesHandling: 'distribute', // distribute extra bytes across parts
});
```

```
Input: data.bin (25MB)
Output directory: ./chunks/

Generated files:
- data.bin.001 (8.34MB)  // Gets extra bytes
- data.bin.002 (8.33MB)  // Gets extra bytes
- data.bin.003 (8.33MB)  // Gets extra bytes
- data.bin.checksum.sha256
```

#### With `extraBytesHandling: 'newFile'`

When splitting a 25MB file into 3 parts with the `newFile` option:

```ts
await splitFile('./input/data.bin', './chunks', {
  splitBy: 'numberOfParts',
  numberOfParts: 3,
  createChecksum: 'sha256',
  extraBytesHandling: 'newFile', // put extra bytes in a new file
});
```

```
Input: data.bin (25MB)
Output directory: ./chunks/

Generated files:
- data.bin.001 (8MB)     // Equal division
- data.bin.002 (8MB)     // Equal division
- data.bin.003 (8MB)     // Equal division
- data.bin.004 (1MB)     // Contains remainder bytes
- data.bin.checksum.sha256
```

### Merging Files

When merging files, the library combines all parts and optionally verifies the checksum

```
Input parts:
- ./chunks/video.mp4.001
- ./chunks/video.mp4.002
- ./chunks/video.mp4.003
- ./chunks/video.mp4.004
Cheksum:
- ./chunks/video.mp4.checksum.sha256

Output: ./output/video-restored.mp4 (25MB)
```

---

## Author
github.com/apirJS

---
## License
MIT © 2025 apirJS
