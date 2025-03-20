/**
 * This test will use the file at dist/
 *
 */

import path from 'node:path';
import { exists, mkdir, readdir, rm } from 'node:fs/promises';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { splitFile } from '../src';

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

test('should split file into specified number of parts with correct checksums', async () => {
  // Arrange
  const numberOfParts = 2;
  const expectedPartsCount = numberOfParts;
  const expectedPartSize = Math.floor(FILE_SIZE / numberOfParts);

  // Act
  const result = await isResolved(
    splitFile(testFile, outputDir, {
      splitBy: 'number',
      numberOfParts,
      createChecksum: 'sha256',
    })
  );

  // Assert
  expect(result.success).toBe(true);

  const files = await readdir(outputDir);
  const partFiles = files.filter((f) => !f.endsWith('.sha256'));
  const checksumFiles = files.filter((f) => f.endsWith('.sha256'));

  // Verify correct number of files were created
  expect(partFiles.length).toBe(expectedPartsCount);
  expect(checksumFiles.length).toBe(1);

  // Verify file sizes
  for (const fileName of partFiles) {
    const file = Bun.file(path.join(outputDir, fileName));
    expect(file.size).toBe(expectedPartSize);
  }

  // Verify checksum file exists and is not empty
  const checksumFile = Bun.file(path.join(outputDir, checksumFiles[0]));
  const checksumContent = await checksumFile.text();
  expect(checksumContent.length).toBeGreaterThan(0);

  // Test with 0 parts
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
  const numberOfParts = partFiles.length;

  expect(numberOfParts).toBe(expectedNumberOfParts);

  const checksumFile = Bun.file(path.join(outputDir, checksumFiles[0]));
  const checksumContent = await checksumFile.text();

  expect(checksumContent.length).toBeGreaterThan(0);
  expect(checksumFiles.length).toBe(1);

  for (const part of partFiles) {
    const f = Bun.file(path.join(outputDir, part));
    const partSize = f.size;

    expect(partSize).toBe(expectedPartSize);
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
  const expectedPartSize = 11 * 1024 * 1024; // 11MB per part
  const extraBytes = FILE_SIZE % expectedPartSize; // Remaining bytes after full parts
  const expectedNumberOfParts = Math.floor(FILE_SIZE / expectedPartSize); // Number of full-sized parts
  const distributionSize = Math.floor(extraBytes / expectedNumberOfParts); // Extra bytes per part
  let remainingDistributionSize = extraBytes % expectedNumberOfParts; // Remainder extra bytes

  const result = await isResolved(
    splitFile(testFile, outputDir, {
      splitBy: 'size',
      partSize: expectedPartSize,
      floatingPartSizeHandling: 'distribute',
    })
  );

  expect(result.success).toBe(true);

  const files = await readdir(outputDir);
  const numberOfParts = files.length;
  expect(numberOfParts).toBe(expectedNumberOfParts);

  let currentExtraBytes = extraBytes; // Track remaining extra bytes

  for (const f of files) {
    const file = Bun.file(path.join(outputDir, f));
    const fileSize = file.size;

    // Determine expected size for this part
    const expectedSize =
      expectedPartSize +
      (currentExtraBytes > 0
        ? distributionSize + (remainingDistributionSize > 0 ? 1 : 0)
        : 0);

    console.log(`File: ${f} | Size: ${fileSize} | Expected: ${expectedSize}`);

    expect(fileSize).toBe(expectedSize);

    // Reduce extra bytes as they are distributed
    if (currentExtraBytes > 0) {
      currentExtraBytes -=
        distributionSize + (remainingDistributionSize > 0 ? 1 : 0);
      remainingDistributionSize -= remainingDistributionSize > 0 ? 1 : 0;
    }
  }
});
test('should create an additional file for remaining bytes when floatingPartSizeHandling is newFile', async () => {
  const expectedPartSize = 11 * 1024 * 1024; // 11MB per part
  const extraBytes = FILE_SIZE % expectedPartSize; // Remaining bytes after full parts
  const expectedNumberOfParts = Math.ceil(FILE_SIZE / expectedPartSize); // Including the extra file

  const result = await isResolved(
    splitFile(testFile, outputDir, {
      splitBy: 'size',
      partSize: expectedPartSize,
      floatingPartSizeHandling: 'createNewFile',
    })
  );

  expect(result.success).toBe(true);

  const files = await readdir(outputDir);
  const sortedFiles = files.sort(); // Sort files to ensure we check them in order
  const numberOfParts = files.length;
  
  expect(numberOfParts).toBe(expectedNumberOfParts);

  // Check that all parts except the last one have the expected size
  for (let i = 0; i < numberOfParts - 1; i++) {
    const file = Bun.file(path.join(outputDir, sortedFiles[i]));
    const fileSize = file.size;
    expect(fileSize).toBe(expectedPartSize);
  }

  // The last part should contain just the remaining bytes
  const lastFile = Bun.file(path.join(outputDir, sortedFiles[numberOfParts - 1]));
  expect(lastFile.size).toBe(extraBytes);
});

test('should throw error when input file does not exist', async () => {
  // Arrange
  const nonExistentFile = path.join(inputDir, 'doesNotExist.bin');

  // Act
  const result = await isResolved(
    splitFile(nonExistentFile, outputDir, {
      splitBy: 'number',
      numberOfParts: 2,
    })
  );

  // Assert
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
 expect((result.error as Error).message).toContain("File doesn't exists");
});

test('should throw error when input file is empty', async () => {
  // Arrange
  const emptyFile = path.join(inputDir, 'empty.bin');
  await Bun.write(emptyFile, '');

  // Act
  const result = await isResolved(
    splitFile(emptyFile, outputDir, {
      splitBy: 'number',
      numberOfParts: 2,
    })
  );

  // Assert
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  expect((result.error as Error).message).toContain('File is empty');
});

test('should throw error when using non-integer number of parts', async () => {
  // Act
  const result = await isResolved(
    splitFile(testFile, outputDir, {
      splitBy: 'number',
      numberOfParts: 2.5,
    })
  );

  // Assert
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
 expect((result.error as Error).message).toContain('should be integers');
});

test('should throw error when using non-integer part size', async () => {
  // Act
  const result = await isResolved(
    splitFile(testFile, outputDir, {
      splitBy: 'size',
      partSize: 1024.5,
    })
  );

  // Assert
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
 expect((result.error as Error).message).toContain('should be integers');
});

test('should throw error when part size is greater than file size', async () => {
  // Act
  const result = await isResolved(
    splitFile(testFile, outputDir, {
      splitBy: 'size',
      partSize: FILE_SIZE + 1024,
    })
  );

  // Assert
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
 expect((result.error as Error).message).toContain('cannot bigger than file size');
});

test('should throw error when part size is negative', async () => {
  // Act
  const result = await isResolved(
    splitFile(testFile, outputDir, {
      splitBy: 'size',
      partSize: -1024,
    })
  );

  // Assert
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
 expect((result.error as Error).message).toContain('cannot be negative or zero');
});

test('should throw error when number of parts is too large', async () => {
  // Create a smaller file for this test
  const smallFile = path.join(inputDir, 'small.bin');
  await Bun.write(smallFile, Buffer.alloc(10, 1));
  
  // Act - Try to split into 11 parts (more than bytes in the file)
  const result = await isResolved(
    splitFile(smallFile, outputDir, {
      splitBy: 'number',
      numberOfParts: 11,
    })
  );

  // Assert
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
 expect((result.error as Error).message).toContain('Number of parts is too large');
});

test('should create output directory if it does not exist', async () => {
  // Arrange
  const nonExistentOutputDir = path.join(outputDir, 'nested', 'output');
  
  // Act
  const result = await isResolved(
    splitFile(testFile, nonExistentOutputDir, {
      splitBy: 'number',
      numberOfParts: 2,
    })
  );

  // Assert
  expect(result.success).toBe(true);
  expect(await exists(nonExistentOutputDir)).toBe(true);
  
  // Cleanup
  await rm(path.join(outputDir, 'nested'), { recursive: true, force: true });
});

test('should delete original file when deleteFileAfterSplit is true', async () => {
  // Arrange
  const tempFile = path.join(inputDir, 'temp.bin');
  await Bun.write(tempFile, Buffer.alloc(1024, 1));
  
  // Act
  const result = await isResolved(
    splitFile(tempFile, outputDir, {
      splitBy: 'number',
      numberOfParts: 2,
      deleteFileAfterSplit: true,
    })
  );

  // Assert
  expect(result.success).toBe(true);
  expect(await exists(tempFile)).toBe(false);
});