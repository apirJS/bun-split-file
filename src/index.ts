import path from 'node:path';
import type { SplitFileOptions } from './types';
import { readdir } from 'node:fs/promises';

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
    const fileName = path.basename(inputFilePath);
    const hasher = new Bun.CryptoHasher('sha256');

    if (options.splitBy === 'number') {
      const partSize = file.size / options.parts;
      const lastPartSize = partSize + (file.size % options.parts);

      if (partSize < 1) {
        throw new Error(`Number of parts is too large`);
      }

      for await (const chunk of readStream) {
        const partName = `${fileName}`
      }
    } else {
      //
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
