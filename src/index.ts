import path from 'node:path';
import type { SplitFileOptions } from './types';
import { readdir } from 'node:fs/promises';

function formatPartIndex(index: number): string {
  const indexStr = `${index}`;
  return `${'0'.repeat(
    (indexStr.length <= 3 ? 3 : indexStr.length) - indexStr.length
  )}${indexStr}`;
}

/**
 * Splits a file into multiple parts based on the provided options.
 *
 * @param {string} inputFilePath - Path to the input file.
 * @param {string} outputPath - Directory where the output files will be saved.
 * @param {SplitFileOptions} options - Configuration options for splitting the file.
 * @returns {Promise<void>} A promise that resolves when the file has been successfully split.
 */
export async function splitFile(
  inputFilePath: string,
  outputPath: string,
  options: SplitFileOptions
): Promise<void> {
  try {
    const file = Bun.file(inputFilePath);

    if (!(await file.exists())) {
      throw new Error("File doesn't exists!");
    }

    if (file.size === 0) {
      throw new Error('File is empty!');
    }

    const readStream: ReadableStream<Uint8Array> = file.stream();
    const fileInfo = path.parse(inputFilePath);
    const fileName = fileInfo.name;
    const fileExt = fileInfo.ext;
    const fileSize = file.size;
    const hasher = new Bun.CryptoHasher('sha256');

    let currentPart = 1;
    let partSize: number;

    if (options.splitBy === 'number') {
      if (options.parts < 1) {
        throw new Error('Number of parts was to small');
      }

      partSize = Math.round(fileSize / options.parts);
    } else {
      if (options.partSize > fileSize) {
        throw new Error(
          `Part size bigger than file size: part size ${options.partSize} > file size ${fileSize}`
        );
      }

      if (options.partSize <= 0) {
        throw new Error('Part size cannot be negative or zero');
      }

      partSize = options.partSize;
    }

    const partName = `${fileName}.${fileExt}.${formatPartIndex(currentPart)}`;
    let partPath = path.join(outputPath, partName);
    let writer = Bun.file(partPath).writer();
    let currentSize = 0;
    let totalSize = 0;

    if (partSize < 1) {
      throw new Error(`Number of parts is too large`);
    }

    for await (const chunk of readStream) {
      let chunkOffset = 0;
      hasher.update(chunk);

      while (chunkOffset < chunk.length) {
        const spaceLeft = partSize - currentSize;
        const bytesToWrite = Math.min(spaceLeft, chunk.length - chunkOffset);

        writer.write(chunk.subarray(chunkOffset, chunkOffset + bytesToWrite));
        currentSize += bytesToWrite;
        totalSize += bytesToWrite;
        chunkOffset += bytesToWrite;

        if (currentSize >= partSize) {
          await writer.flush();
          await writer.end();
          if (totalSize < fileSize) {
            // partIndex++;
            // partPath = path.join(
            //   outputPath,
            //   `${fileName}.part_${partIndex}`
            // );
            // writer = Bun.file(currentFile).writer();
            // currentSize = 0;
            currentPart += 1;
          }
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to split the file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      { cause: error }
    );
  }
}

/**
 * Merges multiple files into a single output file.
 *
 * @param {string[]} inputFilesPath - Array of paths to the input files to be merged.
 * @param {string} outputFilePath - Path where the merged output file will be saved.
 * @returns {Promise<void>} A promise that resolves when the files have been successfully merged.
 */
export async function mergeFiles(
  inputFilesPath: string[],
  outputFilePath: string
): Promise<void> {
  // Function implementation
}
