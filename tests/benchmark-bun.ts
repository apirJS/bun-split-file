import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sf from 'split-file';
import { mergeFiles, splitFile } from '../dist/index.js';

const inputDir = path.join(__dirname, 'input');
const outputDir = path.join(__dirname, 'output');
const fileName = 'test.bin';
const filePath = path.resolve(inputDir, fileName);

async function createFile() {
  const fileSize = 100 * 1024 * 1024; // 100 MB
  const file = Buffer.alloc(fileSize, 0);
  await Bun.write(filePath, file);
}

async function removeDir() {
  if (existsSync(inputDir)) {
    await rm(inputDir, { recursive: true, force: true });
  }
  if (existsSync(outputDir)) {
    await rm(outputDir, { recursive: true, force: true });
  }
}

async function createDir() {
  if (!existsSync(inputDir)) {
    await mkdir(inputDir, { recursive: true });
  }
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
}

async function benchmark1() {
  await createDir();
  await createFile();

  const iterations = 10;
  let bunTotalTime = 0;
  let splitFileTotalTime = 0;

  console.log(`Running benchmark for ${iterations} iterations...`);

  for (let i = 0; i < iterations; i++) {
    console.log(`Iteration ${i + 1}/${iterations}`);

    // Measure bun-split-file
    const bunStart = performance.now();
    await splitFile(filePath, outputDir, {
      splitBy: 'numberOfParts',
      numberOfParts: 10,
    });
    const bunParts = (await readdir(outputDir)).map((f) =>
      path.join(outputDir, f)
    );
    const bunMergeResult = path.join(outputDir, 'bun-merged.bin');
    await mergeFiles(bunParts, bunMergeResult);

    const bunEnd = performance.now();
    const bunDuration = bunEnd - bunStart;

    bunTotalTime += bunDuration;
    console.log(`bun-split-file:   ${bunDuration.toFixed(2)} ms`);

    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    // Measure split-file
    const sfStart = performance.now();
    await sf.splitFile(filePath, 10, outputDir);

    const sfParts = (await readdir(outputDir)).map((f) =>
      path.join(outputDir, f)
    );
    const sfMergeResult = path.join(outputDir, 'sf-merged.bin');
    await sf.mergeFiles(sfParts, sfMergeResult);

    const sfEnd = performance.now();
    const sfDuration = sfEnd - sfStart;

    splitFileTotalTime += sfDuration;
    console.log(`split-file:       ${sfDuration.toFixed(2)} ms`);

    if (i < iterations - 1) {
      await rm(outputDir, { recursive: true, force: true });
      await mkdir(outputDir, { recursive: true });
    }
  }

  const bunAvg = bunTotalTime / iterations;
  const splitAvg = splitFileTotalTime / iterations;

  console.log('\n--- Benchmark Results ---');
  console.log(`Average bun-split-file: ${bunAvg.toFixed(2)} ms`);
  console.log(`Average split-file:     ${splitAvg.toFixed(2)} ms`);

  await removeDir();
}

benchmark1().catch(console.error);
