import path from 'node:path';
import { exists, mkdir, readdir, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mergeFiles, splitFile } from '../dist';

const outputDir = path.resolve(__dirname, './output');
const inputDir = path.resolve(__dirname, './input');
const testFile = path.join(inputDir, 'test.bin');
const FILE_SIZE = 100 * 1024 * 1024;

async function isResolved<T>(promise: Promise<T>) {
  try {
    const result = await promise;
    return { success: true, result };
  } catch (error) {
    return { success: false, error };
  }
}

async function createFile() {
  if (!(await exists(testFile))) {
    const file = Buffer.alloc(FILE_SIZE, 0);
    await Bun.write(testFile, file);
  }
}

async function removeDir() {
  if (await exists(inputDir)) {
    await rm(inputDir, { recursive: true, force: true });
  }

  if (await exists(outputDir)) {
    await rm(outputDir, { recursive: true, force: true });
  }
}

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

describe('splitFile - file splitting and checksums', () => {
  test('should split file into specified number of parts with correct checksums', async () => {
    const numberOfParts = 2;
    const expectedPartSize = Math.floor(FILE_SIZE / numberOfParts);

    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'number',
        numberOfParts,
        createChecksum: 'sha256',
      })
    );

    expect(result.success).toBe(true);

    const files = await readdir(outputDir);
    const partFiles = files.filter((f) => !f.endsWith('.sha256'));
    const checksumFiles = files.filter((f) => f.endsWith('.sha256'));

    expect(partFiles.length).toBe(numberOfParts);
    expect(checksumFiles.length).toBe(1);

    for (const fileName of partFiles) {
      const file = Bun.file(path.join(outputDir, fileName));
      expect(file.size).toBe(expectedPartSize);
    }

    const checksumFile = Bun.file(path.join(outputDir, checksumFiles[0]));
    const checksumContent = await checksumFile.text();
    expect(checksumContent.length).toBeGreaterThan(0);

    const zeroPartsResult = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'number',
        numberOfParts: 0,
        createChecksum: 'sha256',
      })
    );

    expect(zeroPartsResult.success).toBe(false);
    expect(zeroPartsResult.error).toBeDefined();
  });

  test('should split file into specified size for each part with correct checksums', async () => {
    const expectedPartSize = 10 * 1024 * 1024;
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
      expect(f.size).toBe(expectedPartSize);
    }

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

  test('should distribute remaining bytes (caused by floating size) evenly to first parts', async () => {
    const expectedPartSize = 11 * 1024 * 1024;
    const extraBytes = FILE_SIZE % expectedPartSize;
    const expectedNumberOfParts = Math.floor(FILE_SIZE / expectedPartSize);
    const distributionSize = Math.floor(extraBytes / expectedNumberOfParts);
    let remainingDistributionSize = extraBytes % expectedNumberOfParts;

    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: expectedPartSize,
        floatingPartSizeHandling: 'distribute',
      })
    );

    expect(result.success).toBe(true);

    const files = await readdir(outputDir);
    expect(files.length).toBe(expectedNumberOfParts);

    let currentExtraBytes = extraBytes;
    for (const f of files) {
      const file = Bun.file(path.join(outputDir, f));
      const expectedSize =
        expectedPartSize +
        (currentExtraBytes > 0
          ? distributionSize + (remainingDistributionSize > 0 ? 1 : 0)
          : 0);

      expect(file.size).toBe(expectedSize);

      if (currentExtraBytes > 0) {
        currentExtraBytes -=
          distributionSize + (remainingDistributionSize > 0 ? 1 : 0);
        remainingDistributionSize -= remainingDistributionSize > 0 ? 1 : 0;
      }
    }
  });

  test('should create an additional file for remaining bytes when floatingPartSizeHandling is newFile', async () => {
    const expectedPartSize = 11 * 1024 * 1024;
    const extraBytes = FILE_SIZE % expectedPartSize;
    const expectedNumberOfParts = Math.ceil(FILE_SIZE / expectedPartSize);

    const result = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'size',
        partSize: expectedPartSize,
        floatingPartSizeHandling: 'createNewFile',
      })
    );

    expect(result.success).toBe(true);

    const files = await readdir(outputDir);
    const sortedFiles = files.sort();
    expect(files.length).toBe(expectedNumberOfParts);

    for (let i = 0; i < expectedNumberOfParts - 1; i++) {
      const file = Bun.file(path.join(outputDir, sortedFiles[i]));
      expect(file.size).toBe(expectedPartSize);
    }

    const lastFile = Bun.file(
      path.join(outputDir, sortedFiles[expectedNumberOfParts - 1])
    );
    expect(lastFile.size).toBe(extraBytes);
  });
});

describe('splitFile - error handling', () => {
  test('should throw error when input file does not exist', async () => {
    const nonExistentFile = path.join(inputDir, 'doesNotExist.bin');
    const result = await isResolved(
      splitFile(nonExistentFile, outputDir, {
        splitBy: 'number',
        numberOfParts: 2,
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect((result.error as Error).message).toContain("File doesn't exists");
  });

  test('should throw error when input file is empty', async () => {
    const emptyFile = path.join(inputDir, 'empty.bin');
    await Bun.write(emptyFile, '');

    const result = await isResolved(
      splitFile(emptyFile, outputDir, {
        splitBy: 'number',
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
        splitBy: 'number',
        numberOfParts: 2.5,
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect((result.error as Error).message).toContain('should be an integer');
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
    expect((result.error as Error).message).toContain('should be an integer');
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
      'cannot bigger than file size'
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
    expect((result.error as Error).message).toContain(
      'cannot be negative or zero'
    );
  });

  test('should throw error when number of parts is too large', async () => {
    const smallFile = path.join(inputDir, 'small.bin');
    await Bun.write(smallFile, Buffer.alloc(10, 1));

    const result = await isResolved(
      splitFile(smallFile, outputDir, {
        splitBy: 'number',
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
        splitBy: 'number',
        numberOfParts: 2,
      })
    );

    expect(result.success).toBe(true);
    expect(await exists(nonExistentOutputDir)).toBe(true);

    await rm(path.join(outputDir, 'nested'), { recursive: true, force: true });
  });

  test('should delete original file when deleteFileAfterSplit is true', async () => {
    const tempFile = path.join(inputDir, 'temp.bin');
    await Bun.write(tempFile, Buffer.alloc(1024, 1));

    const result = await isResolved(
      splitFile(tempFile, outputDir, {
        splitBy: 'number',
        numberOfParts: 2,
        deleteFileAfterSplit: true,
      })
    );

    expect(result.success).toBe(true);
    expect(await exists(tempFile)).toBe(false);
  });
});

describe('integration - split and merge flow', () => {
  test('should correctly split then merge back to original content', async () => {
    const checksumPath = path.join(outputDir, 'test.bin.checksum.sha256');

    const splitResult = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'number',
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

  test('should fail to merge if checksum is tampered', async () => {
    const checksumPath = path.join(outputDir, 'checksum.sha256');

    const splitResult = await isResolved(
      splitFile(testFile, outputDir, {
        splitBy: 'number',
        numberOfParts: 3,
        createChecksum: 'sha256',
      })
    );

    expect(splitResult.success).toBe(true);

    const files = await readdir(outputDir);
    const partFiles = files
      .filter((f) => !f.endsWith('.sha256'))
      .map((f) => path.join(outputDir, f));

    // Tamper the checksum file
    await Bun.write(checksumPath, 'invalidchecksumvalue');

    const mergeOutput = path.join(outputDir, 'merged-fail.bin');
    const mergeResult = await isResolved(
      mergeFiles(partFiles, mergeOutput, { checksumPath })
    );

    expect(mergeResult.success).toBe(false);
    expect((mergeResult.error as Error).message).toContain(
      'Checksum is not valid'
    );
  });

  test('should fail to merge if one of the parts is deleted', async () => {
    await splitFile(testFile, outputDir, {
      splitBy: 'number',
      numberOfParts: 3,
      createChecksum: 'sha256',
    });

    const files = await readdir(outputDir);
    const partFiles = files
      .filter((f) => !f.endsWith('.sha256'))
      .map((f) => path.join(outputDir, f));
    const checksumPath = path.join(outputDir, 'checksum.sha256');

    // Delete one of the part files
    await rm(partFiles[0]);

    const mergeOutput = path.join(outputDir, 'merged-missing.bin');
    const mergeResult = await isResolved(
      mergeFiles(partFiles, mergeOutput, { checksumPath })
    );

    expect(mergeResult.success).toBe(false);
    expect((mergeResult.error as Error).message).toContain("didn't exists");
  });
});
