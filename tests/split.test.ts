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
    const fileSize = await file.size;

    // Determine expected size for this part
    const expectedSize =
      expectedPartSize + (currentExtraBytes > 0 ? distributionSize + (remainingDistributionSize > 0 ? 1 : 0) : 0);

    console.log(`File: ${f} | Size: ${fileSize} | Expected: ${expectedSize}`);

    expect(fileSize).toBe(expectedSize);

    // Reduce extra bytes as they are distributed
    if (currentExtraBytes > 0) {
      currentExtraBytes -= distributionSize + (remainingDistributionSize > 0 ? 1 : 0);
      remainingDistributionSize -= remainingDistributionSize > 0 ? 1 : 0;
    }
  }
});

// 100 MB 104857600
// 11 MB 11534336 ~ Part Size

// 104857600 / 11534336 = 9.0909090909 ~ Number of Part

// 100 MB % 11 MB = 1048576 ~ Extra Bytes
// 1048576 / 9 = 116508.444444444 ~ Distribution Size
// 1048576 % 9 = 4 ~ Remaining Distribution Size

// 11534336 + 116508 + 1
