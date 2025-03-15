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
const FILE_SIZE = 10 * 1024 * 1024; // 10 MB

let numberOfParts = 1024;
let partSize = 2 * 1024 * 1024;

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

  // Pass 0 as number of parts should return error
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
