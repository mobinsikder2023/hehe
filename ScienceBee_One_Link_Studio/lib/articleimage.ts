/*
 * Pull the article's own hero image straight from the source page
 * (Open Graph / Twitter card meta tags). This is the image the news
 * outlet itself uses, needs no API key, and usually has no watermark.
 */

function absolutize(src: string, pageUrl: string): string {
  try {
    return new URL(src, pageUrl).toString();
  } catch {
    return src;
  }
}

export async function getArticleImage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ScienceBeeBot/2.0; +https://sciencebee.com.bd)",
      },
    });
    if (!r.ok) return null;

    const html = (await r.text()).slice(0, 500000); // enough for the <head>

    const patterns: RegExp[] = [
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    ];

    for (const p of patterns) {
      const m = html.match(p);
      if (m && m[1] && /^https?:|^\//i.test(m[1])) {
        return absolutize(m[1].replace(/&amp;/g, "&"), url);
      }
    }
    return null;
  } catch {
    return null;
  }
}
