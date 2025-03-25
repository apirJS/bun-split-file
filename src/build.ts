import dts from 'bun-plugin-dts';

await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  plugins: [dts()],
  target: 'bun',
  minify: true,
});

await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist/node',
  plugins: [dts()],
  target: 'node',
  minify: true,
});