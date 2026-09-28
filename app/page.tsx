"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes, formatName, inspectImage, reduceImage, type ImageInfo, type CompressionResult } from "@/lib/compress";

const PRESETS = [20, 50, 100, 200, 500];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function UploadIcon() {
  return <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M18 23V8m0 0-5 5m5-5 5 5M8.5 22.5v4A3.5 3.5 0 0 0 12 30h12a3.5 3.5 0 0 0 3.5-3.5v-4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function ArrowIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [target, setTarget] = useState<number | "custom">(100);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const operation = useRef(0);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  async function chooseFile(selected?: File) {
    if (!selected) return;
    const id = ++operation.current;
    setBusy(false);
    setError("");
    setResult(null);
    setResultUrl(null);
    setFile(null);
    setInfo(null);
    setPreview(null);
    if (selected.size > MAX_FILE_BYTES) {
      setError("Choose an image under 25 MB for reliable browser processing.");
      return;
    }
    try {
      const details = await inspectImage(selected);
      if (id !== operation.current) return;
      setFile(selected);
      setInfo(details);
      setPreview(URL.createObjectURL(selected));
    } catch (cause) {
      if (id === operation.current) setError(cause instanceof Error ? cause.message : "This image could not be opened.");
    }
  }

  function updateTarget(value: number | "custom") {
    setTarget(value);
    setResult(null);
    setResultUrl(null);
    setError("");
  }

  async function run() {
    if (!file || !info || busy) return;
    const kb = target === "custom" ? Number(custom) : target;
    if (!Number.isFinite(kb) || !Number.isInteger(kb) || kb < 1 || kb > 50000) {
      setError("Enter a whole number from 1 to 50,000 KB.");
      return;
    }
    const bytes = kb * 1024;
    setError("");
    setResult(null);
    setResultUrl(null);
    if (file.size <= bytes) return;
    setBusy(true);
    const id = ++operation.current;
    try {
      const output = await reduceImage(file, bytes);
      if (id !== operation.current) return;
      setResult(output);
      setResultUrl(URL.createObjectURL(output.blob));
    } catch (cause) {
      if (id === operation.current) setError(cause instanceof Error ? cause.message : "We could not process this image. Please try another file.");
    } finally {
      if (id === operation.current) setBusy(false);
    }
  }

  const currentTarget = target === "custom" ? Number(custom) : target;
  const alreadySmall = !!file && Number.isFinite(currentTarget) && currentTarget > 0 && file.size <= currentTarget * 1024;
  const extension = info?.format === "image/jpeg" ? "jpg" : info?.format === "image/png" ? "png" : "webp";
  const downloadName = file ? `${file.name.replace(/\.[^.]+$/, "")}-${currentTarget}kb.${extension}` : "image.jpg";

  return <>
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="#top" aria-label="Smart Image Size Reducer home"><span className="brand-mark"><span /></span><span>Sizewise<span className="brand-dot">.</span></span></a>
        <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a></nav>
      </div>
    </header>

    <main id="top">
      <section className="hero container" aria-labelledby="page-title">
        <div className="eyebrow"><span className="eyebrow-line" /> SIMPLE IMAGE COMPRESSION</div>
        <h1 id="page-title">Reduce Image to <span>Exact KB</span></h1>
        <p>Choose your target size. We automatically optimize the image while preserving quality.</p>
      </section>

      <section className="tool-shell container" aria-label="Image size reducer">
        <div className="tool-topline"><div><span className="tool-number">01 / 02</span><h2>Optimize your image</h2></div><span className="privacy-pill"><span className="privacy-dot" /> Your image stays on your device</span></div>
        <div className="tool-grid">
          <div className="upload-column">
            <div className="section-heading"><span className="step-badge">1</span><h3>Upload an image</h3></div>
            <input ref={inputRef} className="sr-only" id="image-upload" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
            <div className={`dropzone ${dragging ? "dragging" : ""} ${preview ? "has-image" : ""}`} role="button" tabIndex={0} aria-label="Choose or drop a JPG, PNG, or WebP image" onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { event.preventDefault(); setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void chooseFile(event.dataTransfer.files[0]); }}>
              {preview ? <><div className="image-stage"><img src={preview} alt="Preview of selected image" /></div><span className="change-image">Change image</span></> : <><span className="upload-icon"><UploadIcon /></span><strong>Drop your image here</strong><span className="upload-or">or <span className="browse-link">browse files</span></span><small>JPG, PNG, WebP · Up to 25 MB</small></>}
            </div>
            {file && info && <div className="file-details"><span className="file-name" title={file.name}>{file.name}</span><div><span>{formatBytes(file.size)}</span><span>{info.width} × {info.height} px</span><span>{formatName(info.format)}</span></div></div>}
          </div>

          <div className="settings-column">
            <div className="section-heading"><span className="step-badge">2</span><h3>Choose target size</h3></div>
            <p className="field-help">Select the maximum file size you need.</p>
            <div className="preset-grid" role="group" aria-label="Target size presets">
              {PRESETS.map((size) => <button type="button" key={size} className={`preset ${target === size ? "selected" : ""}`} aria-pressed={target === size} onClick={() => updateTarget(size)}>{size} <span>KB</span></button>)}
              <button type="button" className={`preset ${target === "custom" ? "selected" : ""}`} aria-pressed={target === "custom"} onClick={() => updateTarget("custom")}>Custom</button>
            </div>
            {target === "custom" && <label className="custom-field">Custom target in KB<input type="number" min="1" max="50000" step="1" inputMode="numeric" placeholder="e.g. 75" value={custom} onChange={(event) => { setCustom(event.target.value); setResult(null); setResultUrl(null); setError(""); }} /></label>}
            <button type="button" className="primary-button" onClick={() => void run()} disabled={!file || busy || alreadySmall}>{busy ? <><span className="spinner" /> Reducing image…</> : <>Reduce Image <ArrowIcon /></>}</button>
            {alreadySmall && <p className="inline-note" role="status">Already under your target at {formatBytes(file!.size)}. No compression needed.</p>}
            <p className="settings-footnote">Best quality first. Dimensions change only when needed.</p>
          </div>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}

        {result && file && info && resultUrl && <div className="result-panel" aria-live="polite">
          <div className="result-header"><div><span className="tool-number">RESULT</span><h3>{result.reached ? "Your image is ready" : "Closest safe result"}</h3></div><span className={`status-pill ${result.reached ? "success" : "warning"}`}>{result.reached ? "Target reached" : "Above target"}</span></div>
          <div className="result-metrics"><div><span>Original size</span><strong>{formatBytes(file.size)}</strong></div><div><span>New size</span><strong>{formatBytes(result.blob.size)}</strong></div><div><span>Size reduced</span><strong>{Math.max(0, (1 - result.blob.size / file.size) * 100).toFixed(1)}%</strong></div><div><span>Final dimensions</span><strong>{result.width} × {result.height}</strong></div></div>
          {!result.reached && <p className="result-explainer">This target could not be reached without making the image too small. This is the smallest result we could make while keeping usable dimensions.</p>}
          <div className="result-actions"><a className="download-button" href={resultUrl} download={downloadName}>Download Image <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2v11m0 0 4-4m-4 4L6 9M3 14v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></a><button type="button" className="text-button" onClick={() => { setResult(null); setResultUrl(null); document.querySelector(".settings-column")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Try Different Size</button></div>
        </div>}
      </section>

      <section id="how-it-works" className="below-section container" aria-labelledby="how-heading"><span className="section-kicker">THE PROCESS</span><h2 id="how-heading">Three steps. That’s it.</h2><div className="steps"><div><span>01</span><h3>Upload</h3><p>Choose a JPG, PNG, or WebP image.</p></div><div><span>02</span><h3>Choose size</h3><p>Pick a preset or enter your own KB target.</p></div><div><span>03</span><h3>Download</h3><p>Save your optimized image in its original format.</p></div></div></section>

      <section className="benefits-section container" aria-labelledby="benefits-heading"><span className="section-kicker">MADE TO BE USEFUL</span><h2 id="benefits-heading">The details that matter.</h2><div className="benefits-grid"><div><span className="benefit-icon">◎</span><h3>Quality aware</h3><p>Checks quality settings before reducing dimensions.</p></div><div><span className="benefit-icon">◇</span><h3>Private by design</h3><p>Your image is processed in your browser.</p></div><div><span className="benefit-icon">↗</span><h3>Real file sizes</h3><p>Shows the actual size of the file you download.</p></div><div><span className="benefit-icon">▣</span><h3>Original format</h3><p>Download as JPG, PNG, or WebP, matching your upload.</p></div></div></section>

      <section id="faq" className="faq-section container" aria-labelledby="faq-heading"><span className="section-kicker">COMMON QUESTIONS</span><h2 id="faq-heading">A few quick answers.</h2><div className="faq-list"><details><summary>Can every image reach an exact KB size?</summary><p>No. Image content and format limit how small a file can be. We aim slightly below your target and show the closest safe result when it cannot be reached.</p></details><details><summary>Will my image be uploaded?</summary><p>No. Processing happens in your browser, and your image is not sent to our server.</p></details><details><summary>Will my image dimensions change?</summary><p>Only if reducing quality alone is not enough. The original aspect ratio is preserved.</p></details><details><summary>Why can PNG compression take longer?</summary><p>PNG needs a different approach: the tool tries full color and smaller color palettes before resizing.</p></details></div></section>
    </main>

    <footer className="site-footer"><div className="container footer-inner"><span className="brand footer-brand"><span className="brand-mark"><span /></span><span>Sizewise<span className="brand-dot">.</span></span></span><span>Simple, private image resizing.</span></div></footer>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "WebApplication", name: "Smart Image Size Reducer", description: "Reduce JPG, PNG and WebP images to a target file size online.", applicationCategory: "MultimediaApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }).replace(/</g, "\\u003c") }} />
  </>;
}
