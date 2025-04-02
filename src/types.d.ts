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
  extraBytesHandling?: 'distribute' | 'newFile';
  deleteFileAfterSplit?: boolean;
};

export type MergeFilesOptions = {
  checksumPath?: string;
  deletePartsAfterMerge?: boolean;
};