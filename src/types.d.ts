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
  suffix?: string;
  checksum?: 'none' | 'file' | 'merge';
};
