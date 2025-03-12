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
  createChecksum?: boolean;
  floatingPartSizeHandling?: 'distribute' | 'padding';
};
