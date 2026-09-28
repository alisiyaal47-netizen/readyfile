import * as UPNG from "upng-js";

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp";
export type ImageInfo = { width: number; height: number; format: ImageFormat };
export type CompressionResult = {
  blob: Blob;
  width: number;
  height: number;
  reached: boolean;
};

const MIN_EDGE = 64;
const MAX_PIXELS = 40_000_000;
const MAX_STEPS = 18;

export function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 2 : 1)} KB`;
}

export function formatName(format: ImageFormat) {
  return format === "image/jpeg" ? "JPG" : format === "image/png" ? "PNG" : "WebP";
}

export async function inspectImage(file: File): Promise<ImageInfo> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error("This image is too large to process safely. Please choose one under 40 megapixels.");
    }
    return { width: bitmap.width, height: bitmap.height, format: file.type as ImageFormat };
  } finally {
    bitmap.close();
  }
}

function nextFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function canvasBlob(canvas: HTMLCanvasElement, format: ImageFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("The browser could not encode this image."));
      else if (blob.type !== format) reject(new Error(`${formatName(format)} export is not supported by this browser.`));
      else resolve(blob);
    }, format, quality);
  });
}

function draw(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not create an image canvas.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, ctx };
}

/** Search the largest usable quality at each dimension, then shrink only if needed. */
export async function reduceImage(file: File, targetBytes: number): Promise<CompressionResult> {
  if (!Number.isFinite(targetBytes) || targetBytes < 1024) throw new Error("Enter a target of at least 1 KB.");
  const bitmap = await createImageBitmap(file);
  const format = file.type as ImageFormat;
  if (!["image/jpeg", "image/png", "image/webp"].includes(format)) {
    bitmap.close();
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  let width = bitmap.width;
  let height = bitmap.height;
  let closest: CompressionResult | null = { blob: file, width, height, reached: false };
  const consider = (blob: Blob, w: number, h: number) => {
    // If the target is unreachable, return the smallest valid image we found.
    if (!closest || blob.size < closest.blob.size) {
      closest = { blob, width: w, height: h, reached: false };
    }
  };

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      await nextFrame();
      const { canvas, ctx } = draw(bitmap, width, height);

      if (format === "image/png") {
        const pixels = ctx.getImageData(0, 0, width, height).data;
        // 0 preserves every color; palette modes preserve alpha and help PNGs reach tighter targets.
        for (const colors of [0, 256, 128, 64]) {
          await nextFrame();
          const data = new Uint8Array(pixels).buffer;
          const blob = new Blob([UPNG.encode([data], width, height, colors) as ArrayBuffer], { type: format });
          consider(blob, width, height);
          if (blob.size <= targetBytes) return { blob, width, height, reached: true };
        }
      } else {
        const highBlob = await canvasBlob(canvas, format, 0.98);
        consider(highBlob, width, height);
        if (highBlob.size <= targetBytes) return { blob: highBlob, width, height, reached: true };

        const lowBlob = await canvasBlob(canvas, format, 0.08);
        consider(lowBlob, width, height);
        if (lowBlob.size <= targetBytes) {
          let low = 0.08;
          let high = 0.98;
          let best = lowBlob;
          for (let attempt = 0; attempt < 10; attempt++) {
            const quality = (low + high) / 2;
            const candidate = await canvasBlob(canvas, format, quality);
            if (candidate.size <= targetBytes) {
              low = quality;
              if (candidate.size >= best.size) best = candidate;
            } else {
              high = quality;
              consider(candidate, width, height);
            }
          }
          return { blob: best, width, height, reached: true };
        }
      }

      if (Math.min(width, height) <= MIN_EDGE) break;
      const ratio = Math.max(0.72, Math.min(0.88, Math.sqrt(targetBytes / Math.max(closest!.blob.size, 1)) * 0.94));
      const safeRatio = Math.max(ratio, MIN_EDGE / Math.min(width, height));
      const nextWidth = Math.max(1, Math.round(width * safeRatio));
      const nextHeight = Math.max(1, Math.round(height * safeRatio));
      if (nextWidth === width && nextHeight === height) break;
      width = nextWidth;
      height = nextHeight;
    }

    if (!closest) throw new Error("This image could not be compressed.");
    return closest;
  } finally {
    bitmap.close();
  }
}
