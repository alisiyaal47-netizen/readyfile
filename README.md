# Smart Image Size Reducer

A mobile-first Next.js 16, TypeScript, and Tailwind CSS app for reducing one JPG, PNG, or WebP image to a chosen maximum size. All image processing happens in the browser; no image is uploaded.

## Run locally

```bash
npm install
npm run dev
```

For a production build, run `npm run build`. The static site is exported to `out/`.

## Compression behavior

- The target is measured in binary KB (`1 KB = 1024 bytes`). The displayed size is the actual output Blob size.
- JPG and WebP try the original dimensions first and binary-search encoder quality. They shrink dimensions only if the target cannot be met at a low quality setting.
- PNG tries lossless color and then 256, 128, and 64-color palettes before reducing dimensions. Transparent pixels remain transparent.
- The original aspect ratio is kept. If the original file is already within the target, it is left untouched.
- For an unreachable target, the smallest result found at or above a 64-pixel short edge is offered with an explicit “Above target” status. No exact-size claim is made.
- Files over 25 MB or images over 40 megapixels are rejected to limit browser memory pressure.

## Browser verification

`node scripts/test-browser.mjs` tests real exports and downloads for JPG, PNG, and WebP at several targets, custom KB, transparency, impossible targets, and mobile width. It uses the static `out/` build. The test environment needs a compatible Chromium binary; this project uses `@sparticuz/chromium` for that purpose.
