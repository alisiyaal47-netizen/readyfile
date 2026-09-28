import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://smart-image-size-reducer-ali.alisiyaal47.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Reduce Image to Exact KB Online | Free Image Size Reducer",
  description: "Reduce JPG, PNG and WebP images to 20KB, 50KB, 100KB, 200KB or any custom size online while maintaining the best possible quality.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
