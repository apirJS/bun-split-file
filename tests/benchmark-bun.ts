import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import sf from 'split-file';
import { mergeFiles, splitFile } from '../dist/index.js';

// Define directories and test file path
const inputDir = path.join(__dirname, 'input');
const outputDir = path.join(__dirname, 'output');
const fileName = 'test.bin';
const filePath = path.resolve(inputDir, fileName);

/**
 * Creates a 100 MB test file filled with zeros.
 * This file will be used as the input for our benchmarks.
 */
async function createTestFile() {
  const fileSize = 100 * 1024 * 1024; // 100 MB
  const fileBuffer = Buffer.alloc(fileSize, 0);
  await Bun.write(filePath, fileBuffer);
}

/**
 * Removes input and output directories to ensure a clean slate.
 */
async function cleanDirs() {
  if (existsSync(inputDir)) {
    await rm(inputDir, { recursive: true, force: true });
  }
  if (existsSync(outputDir)) {
    await rm(outputDir, { recursive: true, force: true });
  }
}

/**
 * Creates the required input and output directories.
 */
async function setupDirs() {
  if (!existsSync(inputDir)) {
    await mkdir(inputDir, { recursive: true });
  }
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
}

/**
 * Resets the output directory between test iterations.
 */
async function resetOutputDir() {
  if (existsSync(outputDir)) {
    await rm(outputDir, { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });
}

/**
 * Benchmark 1: Splitting by Size Comparison
 *
 * For bun‑split‑file we use the 'size' mode with a fixed partSize of 10 MB.
 * For split‑file we now use the dedicated splitBySize function which splits the file
 * based on a maximum part size (10 MB in our case).
 */
async function benchmarkSplitBySizeComparison() {
  console.log('=== Benchmark: Split by Size Comparison ===');

  const iterations = 10;
  let bunTotalTime = 0;
  let sfTotalTime = 0;

  // Prepare environment
  await cleanDirs();
  await setupDirs();
  await createTestFile();

  for (let i = 0; i < iterations; i++) {
    console.log(`\nIteration ${i + 1} of ${iterations} for Split by Size:`);

    // --- bun‑split‑file (split by size) ---
    await resetOutputDir();
    const bunStart = performance.now();
    await splitFile(filePath, outputDir, {
      splitBy: 'size',
      partSize: 10 * 1024 * 1024, // 10 MB chunks
    });
    const bunEnd = performance.now();
    const bunDuration = bunEnd - bunStart;
    bunTotalTime += bunDuration;
    console.log(`bun‑split‑file (split by size): ${bunDuration.toFixed(2)} ms`);

    // --- split‑file using sf.splitFileBySize ---
    await resetOutputDir();
    const sfStart = performance.now();
    // sf.splitFileBySize splits the file into parts based on max size per part.
    // The call signature is: sf.splitFileBySize(file: string, maxSize: number, destination?: string)
    await sf.splitFileBySize(filePath, 10 * 1024 * 1024, outputDir);
    const sfEnd = performance.now();
    const sfDuration = sfEnd - sfStart;
    sfTotalTime += sfDuration;
    console.log(`split‑file (splitBySize): ${sfDuration.toFixed(2)} ms`);
  }

  console.log(
    `\nAverage bun‑split‑file (split by size): ${(
      bunTotalTime / iterations
    ).toFixed(2)} ms`
  );
  console.log(
    `Average split‑file (splitBySize): ${(sfTotalTime / iterations).toFixed(
      2
    )} ms\n`
  );
}

/**
 * Benchmark 2: Splitting by Number of Parts Comparison
 *
 * Here, both packages split the file into 10 parts.
 * bun‑split‑file uses the 'numberOfParts' option,
 * while split‑file uses its original splitFile function with 10 parts.
 */
async function benchmarkSplitByNumberComparison() {
  console.log('=== Benchmark: Split by Number of Parts Comparison ===');

  const iterations = 10;
  let bunTotalTime = 0;
  let sfTotalTime = 0;

  // Prepare environment
  await cleanDirs();
  await setupDirs();
  await createTestFile();

  for (let i = 0; i < iterations; i++) {
    console.log(`\nIteration ${i + 1} of ${iterations} for Split by Number:`);

    // --- bun‑split‑file (split by number of parts) ---
    await resetOutputDir();
    const bunStart = performance.now();
    await splitFile(filePath, outputDir, {
      splitBy: 'numberOfParts',
      numberOfParts: 10,
    });
    const bunEnd = performance.now();
    const bunDuration = bunEnd - bunStart;
    bunTotalTime += bunDuration;
    console.log(
      `bun‑split‑file (split by parts): ${bunDuration.toFixed(2)} ms`
    );

    // --- split‑file (split by number of parts) ---
    await resetOutputDir();
    const sfStart = performance.now();
    await sf.splitFile(filePath, 10, outputDir);
    const sfEnd = performance.now();
    const sfDuration = sfEnd - sfStart;
    sfTotalTime += sfDuration;
    console.log(`split‑file (10 parts): ${sfDuration.toFixed(2)} ms`);
  }

  console.log(
    `\nAverage bun‑split‑file (number of parts): ${(
      bunTotalTime / iterations
    ).toFixed(2)} ms`
  );
  console.log(
    `Average split‑file (number of parts): ${(sfTotalTime / iterations).toFixed(
      2
    )} ms\n`
  );
}

/**
 * Benchmark 3: Combined Split By Number and Merge Comparison
 *
 * Measures the total time taken to split and subsequently merge the file.
 * bun‑split‑file uses its splitFile and mergeFiles functions.
 * split‑file first splits the file and then uses sf.mergeFiles to merge them.
 */
async function benchmarkSplitByNumberOfPartsAndMergeComparison() {
  console.log(
    '=== Benchmark: Split By Number of Parts and Merge Comparison ==='
  );

  const iterations = 10;
  let bunTotalTime = 0;
  let sfTotalTime = 0;

  // Prepare environment
  await cleanDirs();
  await setupDirs();
  await createTestFile();

  for (let i = 0; i < iterations; i++) {
    console.log(`\nIteration ${i + 1} of ${iterations} for Split + Merge:`);

    // --- bun‑split‑file (split by number of parts + merge) ---
    await resetOutputDir();
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
    console.log(
      `bun‑split‑file (split by number of parts + merge): ${bunDuration.toFixed(
        2
      )} ms`
    );

    // --- split‑file (split by number of parts + merge) ---
    await resetOutputDir();
    const sfStart = performance.now();
    await sf.splitFile(filePath, 10, outputDir);
    const sfParts = (await readdir(outputDir)).map((f) =>
      path.join(outputDir, f)
    );
    const sfMergeResult = path.join(outputDir, 'sf-merged.bin');
    await sf.mergeFiles(sfParts, sfMergeResult);
    const sfEnd = performance.now();
    const sfDuration = sfEnd - sfStart;
    sfTotalTime += sfDuration;
    console.log(
      `split‑file (split by number of parts + merge): ${sfDuration.toFixed(
        2
      )} ms`
    );
  }

  console.log(
    `\nAverage bun‑split‑file (split by number of parts + merge): ${(
      bunTotalTime / iterations
    ).toFixed(2)} ms`
  );
  console.log(
    `Average split‑file (split by number of parts + merge): ${(
      sfTotalTime / iterations
    ).toFixed(2)} ms\n`
  );
}

/**
 * Benchmark 4: Combined Split by Size and Merge Comparison
 *
 * Similar to Benchmark 3 but uses size-based splitting instead of parts-based splitting.
 * Measures the total time taken to split by size and subsequently merge the file.
 */
async function benchmarkSplitBySizeAndMergeComparison() {
  console.log('=== Benchmark: Split by Size and Merge Comparison ===');

  const iterations = 10;
  let bunTotalTime = 0;
  let sfTotalTime = 0;
  const partSize = 10 * 1024 * 1024; // 10 MB chunks

  // Prepare environment
  await cleanDirs();
  await setupDirs();
  await createTestFile();

  for (let i = 0; i < iterations; i++) {
    console.log(
      `\nIteration ${i + 1} of ${iterations} for Split by Size + Merge:`
    );

    // --- bun‑split‑file (split by size + merge) ---
    await resetOutputDir();
    const bunStart = performance.now();
    await splitFile(filePath, outputDir, {
      splitBy: 'size',
      partSize: partSize,
    });
    const bunParts = (await readdir(outputDir)).map((f) =>
      path.join(outputDir, f)
    );
    const bunMergeResult = path.join(outputDir, 'bun-merged.bin');
    await mergeFiles(bunParts, bunMergeResult);
    const bunEnd = performance.now();
    const bunDuration = bunEnd - bunStart;
    bunTotalTime += bunDuration;
    console.log(
      `bun‑split‑file (split by size + merge): ${bunDuration.toFixed(2)} ms`
    );

    // --- split‑file (split by size + merge) ---
    await resetOutputDir();
    const sfStart = performance.now();
    await sf.splitFileBySize(filePath, partSize, outputDir);
    const sfParts = (await readdir(outputDir)).map((f) =>
      path.join(outputDir, f)
    );
    const sfMergeResult = path.join(outputDir, 'sf-merged.bin');
    await sf.mergeFiles(sfParts, sfMergeResult);
    const sfEnd = performance.now();
    const sfDuration = sfEnd - sfStart;
    sfTotalTime += sfDuration;
    console.log(
      `split‑file (split by size + merge): ${sfDuration.toFixed(2)} ms`
    );
  }

  console.log(
    `\nAverage bun‑split‑file (split by size + merge): ${(
      bunTotalTime / iterations
    ).toFixed(2)} ms`
  );
  console.log(
    `Average split‑file (split by size + merge): ${(
      sfTotalTime / iterations
    ).toFixed(2)} ms\n`
  );
}

/**
 * Main Runner: Executes all benchmark scenarios sequentially.
 */
async function runBenchmarks() {
  try {
    console.log('Starting Package Comparison Benchmarks...\n');

    // Benchmark: Split by Size (using sf.splitFileBySize for split‑file)
    await benchmarkSplitBySizeComparison();

    // Benchmark: Split by Number of Parts
    await benchmarkSplitByNumberComparison();

    // Benchmark: Split and then Merge
    await benchmarkSplitByNumberOfPartsAndMergeComparison();

    // Benchmark: Split by Size and then Merge
    await benchmarkSplitBySizeAndMergeComparison();

    // Final cleanup after all benchmarks
    await cleanDirs();
    console.log('All benchmarks complete!');
  } catch (error) {
    console.error('An error occurred during benchmarking:', error);
  }
}

// Start the benchmark tests
await runBenchmarks();
