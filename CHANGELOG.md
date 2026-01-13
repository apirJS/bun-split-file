# bun-split-file

## 1.2.2

### Patch Changes

- 531b0fb: Fix error handling and bugs in split/merge operations

  - Fix file existence check order (check before stat)
  - Fix createNewFile mode last part size calculation
  - Add cleanup for partially created files on failure
  - Fix array consistency in mergeFiles
  - Add retry logic for Windows EBUSY errors in tests
  - Fix grammar in error messages
  - Add type safety with as const for hash algorithms
  - Update GitHub Actions to use Bun 1.2.8 and checkout@v4

## 1.2.1

### Patch Changes

- fix: relative path issues now solved

## 1.2.0

### Patch Changes

- Accidentally renamed an argument (extraBytesHandling) for the splitFile function in version 1.1.1. Changed back in version 1.2.0

## 1.1.0

### Minor Changes

- Boost performance by precaculating things and reduce overhead

## 1.0.0

### Major Changes

- First release
