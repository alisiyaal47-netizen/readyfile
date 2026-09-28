import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://smart-image-size-reducer-ali.alisiyaal47.chatgpt.site", changeFrequency: "monthly", priority: 1 }];
}
