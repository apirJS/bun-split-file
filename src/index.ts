import type { SplitFileOptions } from './types';

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
  // Function implementation
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
