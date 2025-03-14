import path from 'node:path';
import type { SplitFileOptions } from './types';
import { mkdir, exists } from 'node:fs/promises';

function formatPartIndex(index: number): string {
  const indexStr = `${index}`;
  return `${'0'.repeat(
    (indexStr.length <= 3 ? 3 : indexStr.length) - indexStr.length
  )}${indexStr}`;
}

function isFloat(x: number): boolean {
  return x % 1 !== 0;
}

/**
 * Splits a file into multiple parts based on the provided options.
 *
 * @param {string} inputFilePath - Path to the input file to be split.
 * @param {string} outputPath - Directory where the output files will be saved.
 * @param {SplitFileOptions} options - Configuration options for splitting the file.
 * @param {('number'|'size')} options.splitBy - Determines whether to split by number of parts or by part size.
 * @param {number} [options.numberOfParts] - Required when splitBy is 'number'. Specifies how many parts the file will be split into.
 * @param {number} [options.partSize] - Required when splitBy is 'size'. Specifies the size of each part in bytes.
 * @param {SupportedCryptoAlgorithms} [options.createChecksum] - Optional. Create a checksum file using the specified algorithm. Defaults to 'sha256' when set.
 * @param {('distribute'|'createNewFile')} [options.floatingPartSizeHandling='distribute'] - Optional. Determines how to handle remaining bytes:
 *   - 'distribute': Distributes extra bytes across parts
 *   - 'createNewFile': Creates an additional file for remaining bytes
 * @param {boolean} [options.deleteFileAfterSplit] - Optional. Whether to delete the original file after splitting.
 * @returns {Promise<void>} A promise that resolves when the file has been successfully split.
 * @throws {Error} If the file doesn't exist, is empty, or if options are invalid.
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

    if (!(await exists(outputPath))) {
      await mkdir(outputPath, { recursive: true });
    }

    if (file.size === 0) {
      throw new Error('File is empty!');
    }

    if (
      (options.splitBy === 'number' && isFloat(options.numberOfParts)) ||
      (options.splitBy === 'size' && isFloat(options.partSize))
    ) {
      throw new Error('Part size and number of parts should be integers');
    }

    const readStream: ReadableStream<Uint8Array> = file.stream();
    const fileInfo = path.parse(inputFilePath);
    const fileName = fileInfo.name;
    const fileExt = fileInfo.ext;
    const fileSize = file.size;
    const hasher = new Bun.CryptoHasher(
      options.createChecksum === undefined ? 'sha256' : options.createChecksum
    );
    const floatingPartSizeHandling =
      options.floatingPartSizeHandling === undefined
        ? 'distribute'
        : options.floatingPartSizeHandling;

    let currentPart = 1;
    let partSize: number;
    let totalPart: number;
    let remainingFromFloatingSize: number;

    if (options.splitBy === 'number') {
      if (options.numberOfParts < 1) {
        throw new Error('Number of parts was to small');
      }

      partSize = Math.floor(fileSize / options.numberOfParts);
      remainingFromFloatingSize = fileSize % options.numberOfParts;
      totalPart = options.numberOfParts;
    } else {
      if (options.partSize > fileSize) {
        throw new Error(
          `Part size cannot bigger than file size: part size ${options.partSize} > file size ${fileSize}`
        );
      }

      if (options.partSize <= 0) {
        throw new Error('Part size cannot be negative or zero');
      }

      partSize = options.partSize;
      totalPart = Math.floor(fileSize / partSize);
      remainingFromFloatingSize = fileSize % partSize;
    }

    const distributionSize = remainingFromFloatingSize
      ? remainingFromFloatingSize <= totalPart
        ? 1
        : Math.floor(remainingFromFloatingSize / totalPart)
      : 0;

    let remainingDistributionSize =
      remainingFromFloatingSize > totalPart
        ? remainingFromFloatingSize % totalPart
        : 0;

    const partName = `${fileName}${fileExt}.${formatPartIndex(currentPart)}`;
    let partPath = path.join(outputPath, partName);
    let writer = Bun.file(partPath).writer();
    let currentSize = 0;
    let totalSize = 0;

    if (partSize < 1) {
      throw new Error(`Number of parts is too large`);
    }

    for await (const chunk of readStream) {
      let chunkOffset = 0;

      if (options.createChecksum !== undefined) {
        hasher.update(chunk);
      }

      while (chunkOffset < chunk.length) {
        const spaceLeft =
          partSize -
          currentSize +
          (floatingPartSizeHandling === 'distribute' &&
          remainingFromFloatingSize > 0
            ? distributionSize + (remainingDistributionSize > 0 ? 1 : 0)
            : 0);
        const bytesToWrite = Math.min(spaceLeft, chunk.length - chunkOffset);

        writer.write(chunk.subarray(chunkOffset, chunkOffset + bytesToWrite));
        currentSize += bytesToWrite;
        totalSize += bytesToWrite;
        chunkOffset += bytesToWrite;

        if (currentSize >= partSize) {
          await writer.flush();
          await writer.end();

          if (
            floatingPartSizeHandling === 'distribute' &&
            remainingFromFloatingSize > 0 &&
            remainingDistributionSize > 0
          ) {
            remainingFromFloatingSize -= 1;
            remainingDistributionSize -= 1;
          }

          if (totalSize < fileSize) {
            currentPart++;
            partPath = path.join(
              outputPath,
              `${fileName}${fileExt}.${formatPartIndex(currentPart)}`
            );
            writer = Bun.file(partPath).writer();
            currentSize = 0;
          }
        }
      }
    }

    if (currentSize > 0) {
      await writer.flush();
      await writer.end();
    }

    if (options.createChecksum !== undefined) {
      const checksum = hasher.digest('hex');
      const checksumPath = path.join(
        outputPath,
        `${fileName}${fileExt}.sha256`
      );
      await Bun.write(checksumPath, checksum);
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
// export async function mergeFiles(
//   inputFilesPath: string[],
//   outputFilePath: string
// ): Promise<void> {
//   // Function implementation
// }
