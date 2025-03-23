import path from 'node:path';
import type { MergeFilesOptions, SplitFileOptions } from './types';
import { mkdir, exists, rm } from 'node:fs/promises';
import type { CryptoHasher, SupportedCryptoAlgorithms } from 'bun';

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
      throw new Error('Part size and number of parts should be an integer');
    }

    const readStream: ReadableStream<Uint8Array> = file.stream();
    const fileInfo = path.parse(inputFilePath);
    const fileName = fileInfo.name;
    const fileExt = fileInfo.ext;
    const fileSize = file.size;
    const hashAlg = options.createChecksum ?? 'sha256';
    const hasher = new Bun.CryptoHasher(hashAlg);
    const floatingPartSizeHandling =
      options.floatingPartSizeHandling ?? 'distribute';

    let currentPart = 1;
    let partSize: number;
    let totalPart: number;
    let extraBytes: number;

    if (options.splitBy === 'number') {
      if (options.numberOfParts < 1) {
        throw new Error('Number of parts cannot be zero or negative');
      }

      partSize = Math.floor(fileSize / options.numberOfParts);
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
    }

    extraBytes = fileSize % partSize;

    const distributionSize = Math.floor(extraBytes / totalPart);

    let remainingDistributionSize = extraBytes % totalPart;

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
        const extra =
          floatingPartSizeHandling === 'distribute' && extraBytes > 0
            ? distributionSize + (remainingDistributionSize > 0 ? 1 : 0)
            : 0;
        const spaceLeft = partSize - currentSize + extra;

        const bytesToWrite = Math.min(spaceLeft, chunk.length - chunkOffset);

        writer.write(chunk.subarray(chunkOffset, chunkOffset + bytesToWrite));
        currentSize += bytesToWrite;
        totalSize += bytesToWrite;
        chunkOffset += bytesToWrite;

        if (currentSize >= partSize + extra) {
          await writer.end();

          if (floatingPartSizeHandling === 'distribute' && extraBytes > 0) {
            extraBytes -=
              distributionSize + (remainingDistributionSize > 0 ? 1 : 0);
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
      await writer.end();
    }

    if (options.deleteFileAfterSplit === true) {
      await rm(inputFilePath);
    }

    if (options.createChecksum !== undefined) {
      const checksum = hasher.digest('hex');
      const checksumPath = path.join(
        outputPath,
        `${fileName}${fileExt}.checksum.${hashAlg}`
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
 * @param {MergeFilesOptions} [options] - Optional configuration for merging files.
 * @param {string} [options.checksumPath] - Path to a checksum file to verify the merged result.
 * @param {boolean} [options.deletePartsAfterMerge] - Whether to delete the input files after successful merge.
 * @returns {Promise<void>} A promise that resolves when the files have been successfully merged.
 * @throws {Error} If input files don't exist, are empty, or if the checksum verification fails.
 */
export async function mergeFiles(
  inputFilesPath: string[],
  outputFilePath: string,
  options?: MergeFilesOptions
): Promise<void> {
  try {
    const parentDir = path.dirname(outputFilePath);
    if (!(await exists(parentDir))) {
      await mkdir(parentDir, { recursive: true });
    }

    if (inputFilesPath.length === 0) {
      throw new Error('Input files is empty');
    }

    let checksumAlg: SupportedCryptoAlgorithms | null = null;
    let hasher: CryptoHasher | null = null;

    if (options?.checksumPath) {
      const ext = options.checksumPath.split('.').at(-1);
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

    const files = inputFilesPath.sort((a, b) => {
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
        if (options?.checksumPath && hasher) {
          hasher.update(chunk);
        }

        writer.write(chunk);
      }

      writer.flush();

      if (options?.deletePartsAfterMerge) {
        await part.delete();
      }
    }

    writer.end();

    if (options?.checksumPath && hasher) {
      const originalChecksum = await Bun.file(options?.checksumPath).text();
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
