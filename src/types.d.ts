import type { SupportedCryptoAlgorithms } from 'bun';

export type SplitFileOptions = (
  | {
      splitBy: 'number';
      parts: number;
    }
  | {
      splitBy: 'size';
      partSize: number;
    }
) & {
  createChecksum?: boolean | SupportedCryptoAlgorithms;
  floatingPartSizeHandling?: 'distribute' | 'createNewFile';
  deleteFileAfterSplit?: boolean;
};
