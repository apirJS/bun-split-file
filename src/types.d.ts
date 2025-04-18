import type { SupportedCryptoAlgorithms } from 'bun';

export type SplitFileOptions = (
  | {
      splitBy: 'numberOfParts';
      numberOfParts: number;
    }
  | {
      splitBy: 'size';
      partSize: number;
    }
) & {
  createChecksum?: SupportedCryptoAlgorithms;
  extraBytesHandling?: 'distribute' | 'createNewFile';
  deleteFileAfterSplit?: boolean;
};

export type MergeFilesOptions = {
  checksumPath?: string;
  deletePartsAfterMerge?: boolean;
};