import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { chromium } from "playwright-core";
import chromiumBinary from "@sparticuz/chromium";

const root = join(process.cwd(), "out");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".xml": "application/xml" };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (path.includes("..")) throw new Error("Bad path");
    const bytes = await readFile(join(root, path.endsWith("/") ? `${path}index.html` : path));
    response.writeHead(200, { "Content-Type": path.endsWith("/") ? "text/html" : (mime[extname(path)] || "application/octet-stream") });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: await chromiumBinary.executablePath(), headless: true, args: [...chromiumBinary.args.filter(arg => arg !== "--single-process"), "--disable-gpu", "--use-gl=swiftshader", "--disable-software-rasterizer"] });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(url);
  await page.getByRole("heading", { name: "Reduce Image to Exact KB" }).waitFor();
  await page.screenshot({ path: "/tmp/sizewise-desktop.png", fullPage: true });

  async function sample(format, width = 900, height = 600) {
    const dataUrl = await page.evaluate(({ format, width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      const data = ctx.createImageData(width, height);
      let seed = 12345;
      for (let i = 0; i < data.data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data.data[i] = (seed & 255); data.data[i + 1] = (seed >>> 8) & 255;
        data.data[i + 2] = (seed >>> 16) & 255; data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      return canvas.toDataURL(format, .91);
    }, { format, width, height });
    assert(dataUrl.startsWith(`data:${format};base64,`), `Browser must encode ${format}`);
    return Buffer.from(dataUrl.split(",")[1], "base64");
  }

  const cases = [
    ["image/jpeg", "jpg", 100], ["image/jpeg", "jpg", 20],
    ["image/png", "png", 500], ["image/png", "png", 20],
    ["image/webp", "webp", 100], ["image/webp", "webp", 20],
  ];
  for (const [format, extension, target] of cases) {
    const source = await sample(format);
    await page.locator("#image-upload").setInputFiles({ name: `sample.${extension}`, mimeType: format, buffer: source });
    await page.getByText("900 × 600 px").waitFor();
    await page.getByRole("button", { name: `${target} KB` }).click();
    await page.getByRole("button", { name: "Reduce Image" }).click();
    const downloadLink = page.getByRole("link", { name: "Download Image" });
    await downloadLink.waitFor({ timeout: 90000 });
    const result = await downloadLink.evaluate(async element => {
      const blob = await (await fetch(element.href)).blob();
      const bitmap = await createImageBitmap(blob);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const dimensions = [bitmap.width, bitmap.height];
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const colors = new Set(); let opaque = 0;
      for (let i = 0; i < pixels.length; i += 4) { colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]},${pixels[i+3]}`); if (pixels[i+3] > 0) opaque++; }
      bitmap.close();
      return { size: blob.size, type: blob.type, dimensions, colors: colors.size, opaque };
    });
    assert.equal(result.type, format);
    assert(Math.abs(result.dimensions[0] / result.dimensions[1] - 1.5) < .02);
    assert(result.size <= target * 1024 || await page.getByText("Above target").count());
    assert(result.size < source.length, "Should reduce a large source file");
    assert(result.opaque > 0 && result.colors > 1, "Output must preserve visible image content");
    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    const path = await download.path();
    assert.equal((await stat(path)).size, result.size, "Downloaded bytes must equal displayed result");
    const downloaded = await readFile(path);
    const signatures = { "image/jpeg": [0xff, 0xd8], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/webp": [0x52, 0x49, 0x46, 0x46] };
    assert.deepEqual(Array.from(downloaded.subarray(0, signatures[format].length)), signatures[format]);
    console.log(`${format} ${target} KB: ${source.length} -> ${result.size} bytes; ${result.dimensions.join("x")}; ${result.colors} colors; download opens`);
  }

  const small = await sample("image/jpeg", 30, 20);
  await page.locator("#image-upload").setInputFiles({ name: "small.jpg", mimeType: "image/jpeg", buffer: small });
  await page.getByText("Already under your target").waitFor();
  assert(await page.getByRole("button", { name: "Reduce Image" }).isDisabled());
  console.log("Already-under-target flow: no degradation");

  const customSource = await sample("image/jpeg");
  await page.locator("#image-upload").setInputFiles({ name: "custom.jpg", mimeType: "image/jpeg", buffer: customSource });
  await page.getByRole("button", { name: "Custom" }).click();
  await page.getByPlaceholder("e.g. 75").fill("75");
  await page.getByRole("button", { name: "Reduce Image" }).click();
  await page.getByRole("link", { name: "Download Image" }).waitFor();
  const customSize = await page.getByRole("link", { name: "Download Image" }).evaluate(async element => (await (await fetch(element.href)).blob()).size);
  assert(customSize <= 75 * 1024);
  console.log(`Custom 75 KB: ${customSize} bytes`);

  const transparent = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 240;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(400, 240); let seed = 58;
    for (let y = 0; y < 240; y++) for (let x = 0; x < 400; x++) {
      const i = (y * 400 + x) * 4; seed = (seed * 1664525 + 1013904223) >>> 0;
      image.data[i] = seed & 255; image.data[i + 1] = (seed >>> 8) & 255;
      image.data[i + 2] = (seed >>> 16) & 255; image.data[i + 3] = (x < 80 || y < 40) ? 0 : 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#image-upload").setInputFiles({ name: "transparent.png", mimeType: "image/png", buffer: Buffer.from(transparent, "base64") });
  await page.getByRole("button", { name: "20 KB" }).click();
  await page.getByRole("button", { name: "Reduce Image" }).click();
  await page.getByRole("link", { name: "Download Image" }).waitFor();
  const alpha = await page.getByRole("link", { name: "Download Image" }).evaluate(async element => {
    const bitmap = await createImageBitmap(await (await fetch(element.href)).blob());
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { clear: pixels[3] === 0, visible: [...pixels].some((value, index) => index % 4 === 3 && value === 255) };
  });
  assert(alpha.clear && alpha.visible, "PNG must preserve visible content and transparency");
  console.log("Transparent PNG: alpha preserved");

  await page.getByRole("button", { name: "Custom" }).click();
  await page.getByPlaceholder("e.g. 75").fill("1");
  await page.getByRole("button", { name: "Reduce Image" }).click();
  const minimumLink = page.getByRole("link", { name: "Download Image" });
  await minimumLink.waitFor();
  const minimumSize = await minimumLink.evaluate(async element => (await (await fetch(element.href)).blob()).size);
  if (minimumSize > 1024) assert(await page.getByText("Above target").isVisible(), "Unreachable target must be reported honestly");
  console.log(`1 KB target: ${minimumSize} bytes, status truthful`);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Mobile viewport should not overflow horizontally");
  await page.screenshot({ path: "/tmp/sizewise-mobile.png", fullPage: true });
  console.log("Mobile viewport: no horizontal overflow");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
