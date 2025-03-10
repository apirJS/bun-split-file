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
  checksum?: 'none' | 'file' | 'merge';
};
