/**
 * This test will use the file at dist/
 *
 */

import path from 'node:path';
import { exists, mkdir, rm } from 'node:fs/promises';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { splitFile } from '../src';

const outputDir = path.resolve(__dirname, './output');
const inputDir = path.resolve(__dirname, './input');
const testFile = path.join(inputDir, 'test.bin');
const FILE_SIZE = 10 * 1024 * 1024; // 10 MB

let numberOfParts = 2;
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

test(`Should split ${FILE_SIZE} Bytes file into ${numberOfParts} parts with ${Math.floor(
  FILE_SIZE / numberOfParts
)} for each part`, async () => {
  const { success } = await isResolved(
    splitFile(testFile, outputDir, {
      splitBy: 'number',
      numberOfParts: numberOfParts,
      createChecksum: 'sha256',
    })
  );

  expect(success).toBe(true);
});
