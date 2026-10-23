import { MagnetParser } from "@/utils/MagnetParser";

interface ParsedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
}

interface ParsedChannel {
  title: string;
  description: string;
  items: ParsedItem[];
}

interface ParsedFeed {
  channel: ParsedChannel;
}

interface ProcessedItem {
  title: string;
  url: string;
  description: string;
  groupid: string;
  guid: string;
  date: string;
  poster: string | null;
}

interface GroupedItem {
  name: string | null;
  year: string | null;
  items: {
    name: string | null;
    year: string | null;
    language: string;
    groupid: string;
    guid: string;
    poster: string | null;
    title: string;
    magnetUrl: string;
    infoHash: string;
    publishDate: string;
  }[];
}

interface FeedData {
  title: string;
  description: string;
}

interface RSSItem {
  title: string;
  description: string;
  url: string;
  guid: string;
  date: string;
}

interface FeedStats {
  originalItems: number;
  totalMagnetLinks: number;
  qualityMagnetLinks: number;
  filterRatio: string;
}

// Simple regex-based XML parser for Cloudflare Workers
function parseXML(xmlString: string): ParsedFeed {
  const getTagContent = (xml: string, tagName: string): string => {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
  };

  const extractCDATA = (content: string): string => {
    const cdataMatch = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    return cdataMatch ? cdataMatch[1] : content;
  };

  const channelMatch = xmlString.match(/<channel>([\s\S]*?)<\/channel>/i);
  if (!channelMatch) {
    throw new Error('No channel found in RSS feed');
  }

  const channelContent = channelMatch[1];
  const title = getTagContent(channelContent, 'title');
  const description = getTagContent(channelContent, 'description');

  const itemMatches = [...xmlString.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

  const items: ParsedItem[] = itemMatches.map(match => {
    const itemContent = match[1];
    return {
      title: extractCDATA(getTagContent(itemContent, 'title')),
      link: getTagContent(itemContent, 'link'),
      description: extractCDATA(getTagContent(itemContent, 'description')),
      pubDate: getTagContent(itemContent, 'pubDate'),
      guid: getTagContent(itemContent, 'guid'),
    };
  });

  return { channel: { title, description, items } };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateRSS(feedData: FeedData, items: RSSItem[]): string {
  const rssItems = items.map(item => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <description><![CDATA[${item.description}]]></description>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${item.date}</pubDate>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(feedData.title)}</title>
    <description>${escapeXml(feedData.description)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${rssItems}
  </channel>
</rss>`;
}

function decodeHtml(html: string): string {
  if (!html) return html;

  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#x2F;': '/',
    '&#x3D;': '=',
    '&#39;': "'",
  };

  let decoded = html;

  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  decoded = decoded.replace(/&#(\d+);/g, (_match, dec: string) =>
    String.fromCharCode(parseInt(dec, 10))
  );
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return decoded;
}

export class RSSService {
  static INVALID_RELEASE_REGEX = /\s(cam|unknown|telesync|dvdsrc|dvdscr|predvdrip|prehd|pre-hdrip|hdts|hdtv|camrip)\s/i;
  static LOW_QUALITY_REGEX = /(480p|720p|360p|240p|\d+MB)/i;
  static TITLE_YEAR_REGEX = /^([^(]+)\s*\((\d{4})\)/;
  static IMG_REGEX = /<img[^>]*class="[^"]*ipsImage[^"]*"[^>]*>/i;

  private originalFeedUrl: string;
  private title: string;
  private userAgent: string;

  constructor(originalFeedUrl: string, title: string) {
    if (!originalFeedUrl) {
      throw new Error('Original feed URL is required');
    }
    this.originalFeedUrl = originalFeedUrl;
    this.title = title;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }

  async fetchOriginalFeed(): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Fetch attempt ${attempt}/${maxRetries}: ${this.originalFeedUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(this.originalFeedUrl, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
          signal: controller.signal,
          // @ts-ignore: Cloudflare Workers-specific option
          cf: {
            cacheTtl: 300,
            cacheEverything: false,
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const text = await response.text();
        console.log(`Successfully fetched feed. Size: ${text.length} bytes`);
        return text;

      } catch (error: any) {
        lastError = error;
        console.log(`Attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  async parseOriginalFeed(xmlData: string): Promise<ParsedChannel> {
    try {
      const result = parseXML(xmlData);
      if (!result.channel?.items) {
        throw new Error('Invalid RSS structure');
      }
      return result.channel;
    } catch (error: any) {
      throw new Error(`Failed to parse XML: ${error.message}`);
    }
  }

  isValidQuality(displayName: string): boolean {
    return !RSSService.INVALID_RELEASE_REGEX.test(displayName) &&
      !RSSService.LOW_QUALITY_REGEX.test(displayName);
  }

  processItems(originalItems: ParsedItem[]): ProcessedItem[] {
    const processedItems: ProcessedItem[] = [];

    for (const item of originalItems) {
      const description = item.description || '';
      const magnetLinks: string[] = MagnetParser.extractMagnetLinks(description);
      const poster = this.extractPosterFromDescription(description);

      if (magnetLinks.length === 0) continue;

      const baseItem = {
        title: item.title || 'No Title',
        link: item.link || '',
        description,
        pubDate: item.pubDate || new Date().toUTCString(),
        guid: item.guid || '',
      };

      magnetLinks.forEach((magnetLink: string, i: number) => {
        const displayName: any = MagnetParser.extractDisplayName(magnetLink);
        if (displayName && this.isValidQuality(displayName)) {
          processedItems.push({
            title: displayName,
            url: magnetLink,
            description: baseItem.description,
            groupid: baseItem.guid,
            guid: `${baseItem.guid}-magnet-${i}`,
            date: baseItem.pubDate,
            poster,
          });
        }
      });
    }

    return processedItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  extractTitleYear(title: string): { name: string | null; year: string | null } {
    const cleaned = title.replace(/^[^-]+-\s*/, '');
    const match = cleaned.match(RSSService.TITLE_YEAR_REGEX);
    return match ? { name: match[1].trim(), year: match[2] } : { name: null, year: null };
  }

  extractPosterFromDescription(description: string): string | null {
    if (!description) return null;
    const imgTagMatch = description.match(/<img [^>]*src="([^"]+)"/i);
    if (!imgTagMatch) return null;
    const rawSrc = imgTagMatch[1];
    return decodeHtml(rawSrc);
  }

  getName(title: string): string | null {
    return this.extractTitleYear(title).name;
  }

  getYear(title: string): string | null {
    return this.extractTitleYear(title).year;
  }

  extractImagesOnly(htmlDescription: string): string {
    if (!htmlDescription) return '';
    const match = htmlDescription.match(RSSService.IMG_REGEX);
    if (!match) return '';

    const processedImg = match[0]
      .replace(/(?:width|height|style)="[^"]*"/gi, '')
      .replace(/<img/, '<img style="width: 100%; height: auto; aspect-ratio: 3/4; object-fit: cover;"');

    return `<div>${processedImg}</div>`;
  }

  async generateCustomRSS(baseUrl: string = 'http://localhost:3000'): Promise<string> {
    const xmlData = await this.fetchOriginalFeed();
    const parsedFeed = await this.parseOriginalFeed(xmlData);
    const processedItems = this.processItems(parsedFeed.items || []);

    const feedData: FeedData = {
      title: this.title || parsedFeed.title,
      description: parsedFeed.description || 'Tamil RSS Feed',
    };

    const rssItems: RSSItem[] = processedItems.map(item => ({
      title: item.title,
      description: this.extractImagesOnly(item.description),
      url: item.url,
      guid: item.guid,
      date: item.date,
    }));

    return generateRSS(feedData, rssItems);
  }

  async getItemsAsJSON(baseUrl: string = 'http://localhost:3000', language: string = ''): Promise<GroupedItem[]> {
    const xmlData = await this.fetchOriginalFeed();
    const parsedFeed = await this.parseOriginalFeed(xmlData);
    const processedItems = this.processItems(parsedFeed.items || []);

    const grouped: Record<string, GroupedItem> = {};

    processedItems.forEach(item => {
      const { name, year } = this.extractTitleYear(item.title);
      const key = `${name}|||${year}`;

      if (!grouped[key]) {
        grouped[key] = { name, year, items: [] };
      }

      const magnetUrl = new URL(item.url);
      const infoHash = magnetUrl.searchParams.get('xt')?.replace('urn:btih:', '') || '';

      grouped[key].items.push({
        name,
        year,
        language,
        groupid: item.groupid,
        guid: item.guid,
        poster: item.poster,
        title: item.title,
        magnetUrl: item.url,
        infoHash,
        publishDate: item.date,
      });
    });

    return Object.values(grouped);
  }

  async getFeedStats(): Promise<FeedStats> {
    const xmlData = await this.fetchOriginalFeed();
    const parsedFeed = await this.parseOriginalFeed(xmlData);
    const originalItems = parsedFeed.items || [];

    let totalMagnets = 0;
    let qualityMagnets = 0;

    for (const item of originalItems) {
      const magnetLinks: string[] = MagnetParser.extractMagnetLinks(item.description || '');
      totalMagnets += magnetLinks.length;

      qualityMagnets += magnetLinks.filter((magnet: string) => {
        const displayName: any = MagnetParser.extractDisplayName(magnet);
        return displayName && this.isValidQuality(displayName);
      }).length;
    }

    return {
      originalItems: originalItems.length,
      totalMagnetLinks: totalMagnets,
      qualityMagnetLinks: qualityMagnets,
      filterRatio: totalMagnets > 0 ? `${((qualityMagnets / totalMagnets) * 100).toFixed(1)}%` : '0%',
    };
  }
}