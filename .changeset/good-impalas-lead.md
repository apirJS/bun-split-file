---
"bun-split-file": patch
---

Fix error handling and bugs in split/merge operations

- Fix file existence check order (check before stat)
- Fix createNewFile mode last part size calculation
- Add cleanup for partially created files on failure
- Fix array consistency in mergeFiles
- Add retry logic for Windows EBUSY errors in tests
- Fix grammar in error messages
- Add type safety with as const for hash algorithms
- Update GitHub Actions to use Bun 1.2.8 and checkout@v4
