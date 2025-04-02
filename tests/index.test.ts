import path from 'node:path';
import { exists, mkdir, readdir, rm } from 'node:fs/promises';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { mergeFiles, splitFile } from '../src/index.js';

const outputDir = path.resolve(__dirname, './output');
const inputDir = path.resolve(__dirname, './input');
const testFile = path.join(inputDir, 'test.bin');
const FILE_SIZE = 100 * 1024 * 1024;

/**
 * Wraps a promise to return an object indicating success or failure.
 */
async function isResolved<T>(promise: Promise<T>) {
  try {
    const result = await promise;
    return { success: true, result };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Creates the test file if it doesn't exist.
 */
async function createFile() {
  if (!(await exists(testFile))) {
    const file = Buffer.alloc(FILE_SIZE, 0);
    await Bun.write(testFile, file);
  }
}

/**
 * Removes input and output directories.
 */
async function removeDir() {
  if (await exists(inputDir)) {
    await rm(inputDir, { recursive: true, force: true });
  }
  if (await exists(outputDir)) {
    await rm(outputDir, { recursive: true, force: true });
  }
}

/**
 * Creates input and output directories if they don't exist.
 */
async function createDir() {
  if (!(await exists(inputDir))) {
    await mkdir(inputDir, { recursive: true });
  }
  if (!(await exists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }
}

beforeEach(async () => {
  await createDir();
  await createFile();
});

afterEach(async () => {
  await removeDir();
});

beforeAll(async () => {
  await removeDir();
});

describe('splitFile - file splitting and checksums', () => {
  test('should split file into specified number of parts with correct checksums', async () => {
    const numberOfParts = 2;
    const expectedPartSize = Math.floor(FILE_SIZE / numberOfParts);

    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: numberOfParts,
        createChecksum: 'sha256',
      })
    );

    expect(result.success).toBe(true);

    const files = await readdir(outputDir);
    // Separate part files and checksum file(s)
    const partFiles = files.filter((f) => !f.endsWith('.sha256'));
    const checksumFiles = files.filter((f) => f.endsWith('.sha256'));

    expect(partFiles.length).toBe(numberOfParts);
    expect(checksumFiles.length).toBe(1);

    for (const fileName of partFiles) {
      const file = Bun.file(path.join(outputDir, fileName));
      expect((await file.stat()).size).toBe(expectedPartSize);
    }

    const checksumFile = Bun.file(path.join(outputDir, checksumFiles[0]));
    const checksumContent = await checksumFile.text();
    expect(checksumContent.length).toBeGreaterThan(0);

    // Verify error when zero parts is provided
    const zeroPartsResult = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 0,
        createChecksum: 'sha256',
      })
    );
    expect(zeroPartsResult.success).toBe(false);
    expect(zeroPartsResult.error).toBeDefined();
  });

  test('should split file into specified size for each part with correct checksums', async () => {
    const expectedPartSize = 10 * 1024 * 1024; // 10 MB
    const expectedNumberOfParts = Math.floor(FILE_SIZE / expectedPartSize);

    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: expectedPartSize,
        createChecksum: 'sha256',
      })
    );

    expect(result.success).toBe(true);

    const files = await readdir(outputDir);
    const partFiles = files.filter((f) => !f.endsWith('.sha256'));
    const checksumFiles = files.filter((f) => f.endsWith('.sha256'));

    expect(partFiles.length).toBe(expectedNumberOfParts);
    expect(checksumFiles.length).toBe(1);

    for (const part of partFiles) {
      const f = Bun.file(path.join(outputDir, part));
      expect((await f.stat()).size).toBe(expectedPartSize);
    }

    // Verify error when partSize is zero
    const zeroPartSizeResult = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: 0,
        createChecksum: 'sha256',
      })
    );
    expect(zeroPartSizeResult.success).toBe(false);
    expect(zeroPartSizeResult.error).toBeDefined();
  });

  test('should create an additional file for remaining bytes when using "createNewFile"', async () => {
    const expectedPartSize = 11 * 1024 * 1024; // 11 MB
    const extraBytes = FILE_SIZE % expectedPartSize;
    // In createNewFile mode, an extra file is created for the remaining bytes.
    const expectedNumberOfParts = Math.ceil(FILE_SIZE / expectedPartSize);

    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: expectedPartSize,
        extraBytesHandling: 'createNewFile',
      })
    );

    expect(result.success).toBe(true);

    const sortedFiles = (await readdir(outputDir)).sort();
    expect(sortedFiles.length).toBe(expectedNumberOfParts);

    // All parts except the last should be of fixed expectedPartSize.
    for (let i = 0; i < expectedNumberOfParts - 1; i++) {
      const file = Bun.file(path.join(outputDir, sortedFiles[i]));
      expect((await file.stat()).size).toBe(expectedPartSize);
    }

    // The last file should contain the remaining extra bytes.
    const lastFile = Bun.file(
      path.join(outputDir, sortedFiles[expectedNumberOfParts - 1])
    );
    expect((await lastFile.stat()).size).toBe(extraBytes);
  });
});

describe('splitFile - error handling', () => {
  test('should throw error when input file does not exist', async () => {
    const nonExistentFile = path.join(inputDir, 'doesNotExist.bin');
    const result = await isResolved(
      splitFile(nonExistentFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 2,
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect((result.error as Error).message).toContain("no such file or directory");
  });

  test('should throw error when input file is empty', async () => {
    const emptyFile = path.join(inputDir, 'empty.bin');
    await Bun.write(emptyFile, '');
    const result = await isResolved(
      splitFile(emptyFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 2,
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect((result.error as Error).message).toContain('File is empty');
  });

  test('should throw error when using non-integer number of parts', async () => {
    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 2.5,
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect((result.error as Error).message).toContain(
      'Part size and number of parts should be an integer'
    );
  });

  test('should throw error when using non-integer part size', async () => {
    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: 1024.5,
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect((result.error as Error).message).toContain(
      'Part size and number of parts should be an integer'
    );
  });

  test('should throw error when part size is greater than file size', async () => {
    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: FILE_SIZE + 1024,
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect((result.error as Error).message).toContain(
      'Part size cannot bigger than file size'
    );
  });

  test('should throw error when part size is negative', async () => {
    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: -1024,
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Expecting a message indicating the part size must be a positive integer.
    expect((result.error as Error).message).toContain(
      'Part size cannot be negative or zero'
    );
  });

  test('should throw error when number of parts is too large', async () => {
    // Create a very small file.
    const smallFile = path.join(inputDir, 'small.bin');
    await Bun.write(smallFile, Buffer.alloc(10, 1));
    const result = await isResolved(
      splitFile(smallFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 11,
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect((result.error as Error).message).toContain(
      'Number of parts is too large'
    );
  });
});

describe('splitFile - misc options', () => {
  test('should create output directory if it does not exist', async () => {
    const nonExistentOutputDir = path.join(outputDir, 'nested', 'output');
    const result = await isResolved(
      splitFile(testFile, nonExistentOutputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 2,
      })
    );
    expect(result.success).toBe(true);
    expect(await exists(nonExistentOutputDir)).toBe(true);
    // Cleanup nested directory.
    await rm(path.join(outputDir, 'nested'), { recursive: true, force: true });
  });

  test('should delete original file when deleteFileAfterSplit is true', async () => {
    const tempFile = path.join(inputDir, 'temp.bin');
    await Bun.write(tempFile, Buffer.alloc(1024, 1));
    const result = await isResolved(
      splitFile(tempFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 2,
        deleteFileAfterSplit: true,
      })
    );
    expect(result.success).toBe(true);
    expect(await exists(tempFile)).toBe(false);
  });
});

describe('integration - split and merge flow', () => {
  test('should correctly split by number of parts then merge back to original content', async () => {
    // The checksum file name is derived from the test file name.
    const checksumPath = path.join(outputDir, 'test.bin.checksum.sha256');

    const splitResult = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 4,
        createChecksum: 'sha256',
      })
    );
    expect(splitResult.success).toBe(true);

    const files = await readdir(outputDir);
    const partFiles = files
      .filter((f) => !f.endsWith('.sha256'))
      .map((f) => path.join(outputDir, f));

    const mergeOutput = path.join(outputDir, 'merged.bin');
    const mergeResult = await isResolved(
      mergeFiles(partFiles, mergeOutput, { checksumPath })
    );
    expect(mergeResult.success).toBe(true);
    expect(await exists(mergeOutput)).toBe(true);

    const original = await Bun.file(testFile).arrayBuffer();
    const merged = await Bun.file(mergeOutput).arrayBuffer();
    expect(Buffer.compare(Buffer.from(original), Buffer.from(merged))).toBe(0);
  });

  test('should correctly split by size then merge back to original content', async () => {
    const partSize = 5 * 1024 * 1024; // 5MB parts
    const checksumPath = path.join(outputDir, 'test.bin.checksum.sha256');

    const splitResult = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: partSize,
        createChecksum: 'sha256',
      })
    );
    expect(splitResult.success).toBe(true);

    const files = await readdir(outputDir);
    const partFiles = files
      .filter((f) => !f.endsWith('.sha256'))
      .map((f) => path.join(outputDir, f));

    const mergeOutput = path.join(outputDir, 'merged-size.bin');
    const mergeResult = await isResolved(
      mergeFiles(partFiles, mergeOutput, { checksumPath })
    );
    expect(mergeResult.success).toBe(true);
    expect(await exists(mergeOutput)).toBe(true);

    const original = await Bun.file(testFile).arrayBuffer();
    const merged = await Bun.file(mergeOutput).arrayBuffer();
    expect(Buffer.compare(Buffer.from(original), Buffer.from(merged))).toBe(0);
  });

  test('should fail to merge if checksum is tampered', async () => {
    // Use the correct checksum file name.
    const checksumPath = path.join(outputDir, 'test.bin.checksum.sha256');

    const splitResult = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'numberOfParts',
        numberOfParts: 3,
        createChecksum: 'sha256',
      })
    );
    expect(splitResult.success).toBe(true);

    const files = await readdir(outputDir);
    const partFiles = files
      .filter((f) => !f.endsWith('.sha256'))
      .map((f) => path.join(outputDir, f));

    // Tamper with the checksum file.
    await Bun.write(checksumPath, 'invalidchecksumvalue');

    const mergeOutput = path.join(outputDir, 'merged-fail.bin');
    const mergeResult = await isResolved(
      mergeFiles(partFiles, mergeOutput, { checksumPath })
    );
    expect(mergeResult.success).toBe(false);
    // Adjust expectation to match the error message from mergeFiles.
    expect((mergeResult.error as Error).message).toContain('Checksum mismatch');
  });

  test('should fail to merge if one of the parts is deleted', async () => {
    await splitFile(testFile, outputDir, {
      splitBy: 'numberOfParts',
      numberOfParts: 3,
      createChecksum: 'sha256',
    });
    const files = await readdir(outputDir);
    const partFiles = files
      .filter((f) => !f.endsWith('.sha256'))
      .map((f) => path.join(outputDir, f));
    // Use the correct checksum file name.
    const checksumPath = path.join(outputDir, 'test.bin.checksum.sha256');

    // Delete one of the part files.
    await rm(partFiles[0]);
    const mergeOutput = path.join(outputDir, 'merged-missing.bin');
    const mergeResult = await isResolved(
      mergeFiles(partFiles, mergeOutput, { checksumPath })
    );
    expect(mergeResult.success).toBe(false);
    expect((mergeResult.error as Error).message).toContain('does not exist');
  });
});
