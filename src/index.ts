import path from 'node:path';
import type { MergeFilesOptions, SplitFileOptions } from './types';
import { mkdir, rm } from 'node:fs/promises';
import type { CryptoHasher, SupportedCryptoAlgorithms } from 'bun';
import { existsSync } from 'node:fs';

const SUPPORTED_HASH_ALG = [
  'blake2b256',
  'blake2b512',
  'md4',
  'md5',
  'ripemd160',
  'sha1',
  'sha224',
  'sha256',
  'sha384',
  'sha512',
  'sha512-224',
  'sha512-256',
  'sha3-224',
  'sha3-256',
  'sha3-384',
  'sha3-512',
  'shake128',
  'shake256',
];

function formatPartIndex(index: number): string {
  const indexStr = `${index}`;
  return `${'0'.repeat(
    (indexStr.length <= 3 ? 3 : indexStr.length) - indexStr.length
  )}${indexStr}`;
}

/**
 * Splits a file into multiple parts based on the provided options.
 *
 * @param {string} inputFilePath - Path to the input file to be split.
 * @param {string} outputPath - Directory where the output files will be saved.
 * @param {SplitFileOptions} options - Configuration options for splitting the file.
 * @param {('numberOfParts'|'size')} options.splitBy - Determines whether to split by number of parts or by part size.
 * @param {number} [options.numberOfParts] - Required when splitBy is 'numberOfParts'. Specifies how many parts the file will be split into.
 * @param {number} [options.partSize] - Required when splitBy is 'size'. Specifies the size of each part in bytes.
 * @param {SupportedCryptoAlgorithms} [options.createChecksum] - Optional. Create a checksum file using the specified algorithm. Defaults to 'sha256' when set.
 * @param {('distribute'|'createNewFile')} [options.extraBytesHandling='distribute'] - Optional. Determines how to handle remaining bytes:
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

    if (!existsSync(outputPath)) {
      await mkdir(outputPath, { recursive: true });
    }

    if (file.size === 0) {
      throw new Error('File is empty!');
    }

    if (
      (options.splitBy === 'numberOfParts' &&
        !Number.isInteger(options.numberOfParts)) ||
      (options.splitBy === 'size' && !Number.isInteger(options.partSize))
    ) {
      throw new Error('Part size and number of parts should be an integer');
    }

    const readStream: ReadableStream<Uint8Array> = file.stream();
    const fileName = path.basename(inputFilePath);
    const fileSize = file.size;
    const hashAlg = options.createChecksum ?? 'sha256';
    const hasher = options.createChecksum
      ? new Bun.CryptoHasher(hashAlg)
      : null;
    const extraBytesHandling = options.extraBytesHandling ?? 'distribute';

    let currentPart = 1;
    let partSize: number;
    let totalParts: number;

    if (options.splitBy === 'numberOfParts') {
      if (options.numberOfParts < 1) {
        throw new Error('Number of parts cannot be zero or negative');
      }

      totalParts = options.numberOfParts;
      partSize = Math.floor(fileSize / totalParts);
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
      totalParts = Math.floor(fileSize / partSize);
    }

    // Pre-calculate partSize
    const extraBytes = fileSize % partSize;
    if (extraBytesHandling === 'createNewFile' && extraBytes > 0) {
      totalParts++;
    }
    const partSizes: number[] = new Array<number>(totalParts).fill(partSize);
    const baseExtra = Math.floor(extraBytes / totalParts);
    let remainder = extraBytes % totalParts;
    if (extraBytes > 0 && extraBytesHandling === 'distribute') {
      for (let i = 0; i < totalParts; i++) {
        partSizes[i] += baseExtra + (remainder-- > 0 ? 1 : 0);
      }
    }

    const partName = `${fileName}.${formatPartIndex(currentPart)}`;
    let partPath = path.join(outputPath, partName);
    let writer = Bun.file(partPath).writer();
    let currentSize = 0;

    if (partSize < 1) {
      throw new Error(`Number of parts is too large`);
    }

    for await (const chunk of readStream) {
      let chunkOffset = 0;

      if (hasher) {
        hasher.update(chunk);
      }

      while (chunkOffset < chunk.length) {
        const expectedSize = partSizes[currentPart - 1];
        const bytesToWrite = Math.min(
          expectedSize - currentSize,
          chunk.length - chunkOffset
        );

        writer.write(chunk.subarray(chunkOffset, chunkOffset + bytesToWrite));
        await writer.flush();

        currentSize += bytesToWrite;
        chunkOffset += bytesToWrite;

        if (currentPart < totalParts && currentSize >= expectedSize) {
          await writer.end();
          currentPart++;
          partPath = path.join(
            outputPath,
            `${fileName}.${formatPartIndex(currentPart)}`
          );
          writer = Bun.file(partPath).writer();
          currentSize = 0;
        }
      }
    }

    await writer.end();

    if (options.deleteFileAfterSplit === true) {
      await rm(inputFilePath);
    }

    if (hasher) {
      const checksum = hasher.digest('hex');
      const checksumPath = path.join(
        outputPath,
        `${fileName}.checksum.${hashAlg}`
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
 * @param {string[]} inputFilePaths - Array of paths to the input files to be merged.
 * @param {string} outputFilePath - Path where the merged output file will be saved.
 * @param {MergeFilesOptions} [options] - Optional configuration for merging files.
 * @param {string} [options.checksumPath] - Path to a checksum file to verify the merged result.
 * @param {boolean} [options.deletePartsAfterMerge] - Whether to delete the input files after successful merge.
 * @returns {Promise<void>} A promise that resolves when the files have been successfully merged.
 * @throws {Error} If input files don't exist, are empty, or if the checksum verification fails.
 */
export async function mergeFiles(
  inputFilePaths: string[],
  outputFilePath: string,
  options?: MergeFilesOptions
): Promise<void> {
  try {
    const parentDir = path.dirname(outputFilePath);
    const compareChecksum = options?.checksumPath ?? null;

    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true });
    }

    if (inputFilePaths.length === 0) {
      throw new Error('Input files is empty');
    }

    let checksumAlg: SupportedCryptoAlgorithms | null = null;
    let hasher: CryptoHasher | null = null;

    if (compareChecksum) {
      const ext = compareChecksum.split('.').at(-1);
      if (!ext) {
        throw new Error('Checksum file is included, but not valid');
      }

      if (!SUPPORTED_HASH_ALG.includes(ext)) {
        throw new Error(
          'Provided checksum file has an invalid checksum algorithm'
        );
      }

      checksumAlg = ext as SupportedCryptoAlgorithms;
      hasher = new Bun.CryptoHasher(checksumAlg);
    }

    const files = inputFilePaths.sort((a, b) => {
      const ai = a.split('.').at(-1);
      const bi = b.split('.').at(-1);

      if (!ai) {
        throw new Error(`Invalid part's format: ${a}`);
      }

      if (!bi) {
        throw new Error(`Invalid part's format: ${b}`);
      }
      return parseInt(a, 10) - parseInt(b, 10);
    });

    const writer = Bun.file(outputFilePath).writer();

    for (const f of files) {
      const part = Bun.file(f);

      if (!(await part.exists())) {
        throw new Error(`[${f}] didn't exists`);
      }

      if (part.size === 0) {
        throw new Error(`[${f}] is empty`);
      }

      const readStream: ReadableStream<Uint8Array> = part.stream();

      for await (const chunk of readStream) {
        if (compareChecksum && hasher) {
          hasher.update(chunk);
        }

        writer.write(chunk);
      }

      await writer.flush();

      if (options?.deletePartsAfterMerge) {
        await part.delete();
      }
    }

    await writer.end();

    if (compareChecksum && hasher) {
      const originalChecksum = await Bun.file(compareChecksum).text();
      const checksum = hasher.digest('hex');

      if (originalChecksum !== checksum) {
        throw new Error('Checksum is not valid');
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
