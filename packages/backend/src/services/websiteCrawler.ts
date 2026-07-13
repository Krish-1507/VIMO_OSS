export interface PageData {
  url: string;
  title: string;
  description: string;
  keywords: string[];
  headings: string[];
  paragraphs: string[];
  services: string[];
  products: string[];
  brandValues: string[];
  pricingInfo: string[];
  contactInfo: string[];
  teamInfo: string[];
  testimonials: string[];
}

export interface WebsiteAnalysis {
  rootUrl: string;
  pagesCrawled: number;
  title: string;
  description: string;
  keywords: string[];
  allHeadings: string[];
  allParagraphs: string[];
  services: string[];
  products: string[];
  brandValues: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  pricingSummary: string[];
  contactSummary: string[];
  teamSummary: string[];
  testimonialSummary: string[];
  pageBreakdown: PageData[];
  rawTextSnippet: string;
  rawHtmlSnippet: string;
  logoUrl: string | null;
  brandColor: string | null;
  colorsDiscovered: string[];
  fontsDiscovered: string[];
  socialLinks: string[];
  cssVariables: Record<string, string>;
  fetchedAt: string;
}

export async function crawlWebsite(url: string): Promise<WebsiteAnalysis | null> {
  try {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const baseUrl = new URL(normalizedUrl).origin;

    const homepageHtml = await fetchWithTimeout(normalizedUrl, 12000);
    if (!homepageHtml) return null;

    // Fetch CSS files discovered on the page
    const { cssContents, cssVariables, colorsFromCss } = await fetchAndParseCSS(homepageHtml, baseUrl);

    const homepage = extractPageData(homepageHtml, normalizedUrl);
    const internalLinks = discoverInternalLinks(homepageHtml, normalizedUrl, baseUrl);

    // Crawl discovered pages (max 15)
    const pagePromises = internalLinks.slice(0, 15).map(async (link) => {
      const html = await fetchWithTimeout(link, 8000);
      if (!html) return null;
      return extractPageData(html, link);
    });

    const pageResults = (await Promise.all(pagePromises)).filter(Boolean) as PageData[];
    const allPages = [homepage, ...pageResults];

    // Aggregate across all pages
    const allHeadings = [...new Set(allPages.flatMap(p => p.headings))];
    const allParagraphs = [...new Set(allPages.flatMap(p => p.paragraphs))];
    const allServices = [...new Set(allPages.flatMap(p => p.services))];
    const allProducts = [...new Set(allPages.flatMap(p => p.products))];
    const allValues = [...new Set(allPages.flatMap(p => p.brandValues))];
    const allPricing = [...new Set(allPages.flatMap(p => p.pricingInfo))];
    const allContact = [...new Set(allPages.flatMap(p => p.contactInfo))];
    const allTeam = [...new Set(allPages.flatMap(p => p.teamInfo))];
    const allTestimonials = [...new Set(allPages.flatMap(p => p.testimonials))];

    const rawText = allParagraphs.slice(0, 30).join(' ').slice(0, 4000);

    // Find logo URL
    const logoUrl = extractLogoUrl(homepageHtml, normalizedUrl);

    // Find brand color — use meta theme-color first, then CSS-based extraction
    const brandColor = extractBrandColor(homepageHtml, cssContents);

    // Find all discovered colors from CSS + inline styles
    const colorsDiscovered = discoverAllColors(homepageHtml, cssContents);

    // Find all discovered fonts from CSS + inline styles
    const fontsDiscovered = discoverAllFonts(homepageHtml, cssContents);

    // Find social links
    const socialLinks = extractSocialLinks(homepageHtml, baseUrl);

    // Build audience from all pages — search more broadly
    const audienceKeywords = ['audience', 'customer', 'client', 'target', 'for ', 'ideal', 'persona', 'demographic', 'who we serve', 'who is this for'];
    const audienceItems = allPages.flatMap(p => extractKeywordItems(p.paragraphs.join(' '), audienceKeywords));
    const targetAudience = [...new Set(audienceItems)].slice(0, 5).join(', ');

    // Build USPs from all pages
    const uspKeywords = ['unique', 'different', 'best', 'leading', '#1', 'award', 'patented', 'exclusive', 'first', 'innovative', 'only', 'trusted', 'premier'];
    const uspItems = allPages.flatMap(p =>
      uspKeywords
        .filter(kw => p.paragraphs.join(' ').toLowerCase().includes(kw))
        .map(kw => {
          const text = p.paragraphs.join(' ');
          const idx = text.toLowerCase().indexOf(kw);
          return text.slice(Math.max(0, idx - 40), idx + 100).trim();
        })
    );
    const uniqueSellingPoints = [...new Set(uspItems)].filter(s => s.length > 15).slice(0, 8);

    // Build raw HTML snippet — strip script/style but keep meaningful structural HTML for the LLM
    const rawHtmlSnippet = stripNoiseHtml(homepageHtml).slice(0, 5000);

    return {
      rootUrl: normalizedUrl,
      pagesCrawled: allPages.length,
      title: homepage.title,
      description: homepage.description,
      keywords: [...new Set(allPages.flatMap(p => p.keywords))],
      allHeadings: allHeadings.slice(0, 30),
      allParagraphs: allParagraphs.slice(0, 20),
      services: allServices.slice(0, 15),
      products: allProducts.slice(0, 15),
      brandValues: allValues.slice(0, 8),
      targetAudience,
      uniqueSellingPoints: uniqueSellingPoints.slice(0, 8),
      pricingSummary: allPricing.slice(0, 5),
      contactSummary: allContact.slice(0, 5),
      teamSummary: allTeam.slice(0, 8),
      testimonialSummary: allTestimonials.slice(0, 5),
      pageBreakdown: allPages,
      rawTextSnippet: rawText.slice(0, 3000),
      rawHtmlSnippet,
      logoUrl,
      brandColor,
      colorsDiscovered,
      fontsDiscovered,
      socialLinks: [...new Set(socialLinks)],
      cssVariables,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[Crawl] Failed:', (err as Error).message);
    return null;
  }
}

export function buildWebsitePrompt(analysis: WebsiteAnalysis | null, brandName: string, industry: string): string {
  if (!analysis) {
    return `Brand: ${brandName}\nIndustry: ${industry}\n(No website data available)`;
  }

  return [
    `=== BRAND OVERVIEW ===`,
    `Brand: ${brandName}`,
    `Industry: ${industry}`,
    `Website: ${analysis.rootUrl}`,
    `Site Title: ${analysis.title}`,
    `Description: ${analysis.description}`,
    `Pages Crawled: ${analysis.pagesCrawled}`,
    analysis.brandColor ? `Detected Primary Color: ${analysis.brandColor}` : '',
    analysis.logoUrl ? `Logo URL: ${analysis.logoUrl}` : '',
    analysis.colorsDiscovered.length ? `All Detected Colors: ${analysis.colorsDiscovered.join(', ')}` : '',
    analysis.fontsDiscovered.length ? `Detected Fonts: ${analysis.fontsDiscovered.join(', ')}` : '',
    analysis.socialLinks.length ? `Social Links: ${analysis.socialLinks.join(', ')}` : '',
    ``,
    `=== KEYWORDS ===`,
    analysis.keywords.join(', '),
    ``,
    `=== PRODUCTS & SERVICES ===`,
    `Products: ${analysis.products.join(' | ')}`,
    `Services: ${analysis.services.join(' | ')}`,
    ``,
    `=== BRAND VALUES & MISSION ===`,
    analysis.brandValues.join(' | '),
    ``,
    `=== TARGET AUDIENCE ===`,
    analysis.targetAudience,
    ``,
    `=== UNIQUE SELLING POINTS ===`,
    analysis.uniqueSellingPoints.join(' | '),
    ``,
    `=== HEADINGS (Site Structure) ===`,
    analysis.allHeadings.slice(0, 20).join(' | '),
    ``,
    `=== KEY CONTENT ===`,
    analysis.allParagraphs.slice(0, 8).join(' ').slice(0, 2000),
    ``,
    `=== RAW HTML (first 5000 chars, scripts/styles stripped) ===`,
    analysis.rawHtmlSnippet,
  ].filter(Boolean).join('\n');
}

// ───── CSS Fetching & Parsing ─────

async function fetchAndParseCSS(html: string, baseUrl: string): Promise<{
  cssContents: string[];
  cssVariables: Record<string, string>;
  colorsFromCss: string[];
}> {
  const cssContents: string[] = [];
  const cssVariables: Record<string, string> = {};
  const colorsFromCss: string[] = [];

  // Extract inline <style> blocks
  const styleBlocks = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  for (const block of styleBlocks) {
    const css = block.replace(/<\/?style[^>]*>/gi, '').trim();
    if (css) cssContents.push(css);
  }

  // Extract linked stylesheets
  const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  const cssUrls: string[] = [];
  while ((m = linkRegex.exec(html)) !== null) {
    try {
      cssUrls.push(new URL(m[1], baseUrl).href);
    } catch { /* skip */ }
  }

  // Fetch linked stylesheets (max 5, with shorter timeout)
  const cssFetchPromises = cssUrls.slice(0, 5).map(async (cssUrl) => {
    try {
      const res = await fetch(cssUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'VIMO-Marketing-Bot/1.0' },
      });
      if (res.ok) return await res.text();
    } catch { /* skip */ }
    return null;
  });

  const cssResults = await Promise.all(cssFetchPromises);
  for (const css of cssResults) {
    if (css) cssContents.push(css);
  }

  // Parse CSS variables from :root blocks
  const allCss = cssContents.join('\n');
  const rootRegex = /:root\s*\{([^}]+)\}/gi;
  let rootMatch: RegExpExecArray | null;
  while ((rootMatch = rootRegex.exec(allCss)) !== null) {
    const varRegex = /--([^:]+)\s*:\s*([^;]+)/gi;
    let varMatch: RegExpExecArray | null;
    while ((varMatch = varRegex.exec(rootMatch[1])) !== null) {
      cssVariables[varMatch[1].trim()] = varMatch[2].trim();
    }
  }

  // Extract all hex/rgb/hsl colors from CSS
  const colorValues = new Set<string>();
  const hexRegex = /#(?:[0-9a-fA-F]{3,8})\b/gi;
  while ((m = hexRegex.exec(allCss)) !== null) {
    if (!/^#(?:000000|ffffff|fff|000)$/i.test(m[0])) {
      colorValues.add(m[0].toLowerCase());
    }
  }
  colorsFromCss.push(...colorValues);

  return { cssContents, cssVariables, colorsFromCss };
}

function discoverAllColors(html: string, cssContents: string[]): string[] {
  const allCss = cssContents.join('\n');
  const colors = new Set<string>();

  // Extract from CSS
  const cssColorRegex = /(?:color|background(?:-color)?|border(?:-top|-right|-bottom|-left)?-color|outline-color|accent-color|text-decoration-color|caret-color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\s*\([^)]+\)|hsla?\s*\([^)]+\))/gi;
  let m: RegExpExecArray | null;
  while ((m = cssColorRegex.exec(allCss)) !== null) {
    const color = m[1].trim();
    if (!/^(?:#000(?:000)?|#fff(?:fff)?|transparent|inherit|initial|unset|currentColor)$/i.test(color)) {
      colors.add(color.toLowerCase());
    }
  }

  // Extract from inline style attributes
  const inlineStyleRegex = /style=["']([^"']*?)["']/gi;
  while ((m = inlineStyleRegex.exec(html)) !== null) {
    const style = m[1];
    const inlineColorRegex = /(?:color|background(?:-color)?)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\s*\([^)]+\))/gi;
    let im: RegExpExecArray | null;
    while ((im = inlineColorRegex.exec(style)) !== null) {
      const color = im[1].trim();
      if (!/^(?:#000(?:000)?|#fff(?:fff)?|transparent)$/i.test(color)) {
        colors.add(color.toLowerCase());
      }
    }
  }

  return [...colors].slice(0, 20);
}

function discoverAllFonts(html: string, cssContents: string[]): string[] {
  const allCss = cssContents.join('\n');
  const fonts = new Set<string>();

  // Extract font-family declarations from CSS
  const fontRegex = /font-family\s*:\s*["']?([^;"'}]+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = fontRegex.exec(allCss)) !== null) {
    const families = m[1].split(',').map(f => f.trim().replace(/["']/g, ''));
    for (const family of families) {
      const clean = family.replace(/["']/g, '').trim();
      if (clean && !/^(?:sans-serif|serif|monospace|cursive|fantasy|system-ui|-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Helvetica Neue|Arial|Noto Sans|Apple Color Emoji|Segoe UI Emoji|Segoe UI Symbol)$/i.test(clean)) {
        fonts.add(clean);
      }
    }
  }

  // Extract Google Fonts / @import / @font-face
  const googleFontRegex = /(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^"']*(?:family=([^&"']+))/gi;
  while ((m = googleFontRegex.exec(html + '\n' + allCss)) !== null) {
    const families = decodeURIComponent(m[1]).split('|');
    for (const f of families) {
      const name = f.split(':')[0].replace(/[+]/g, ' ').trim();
      if (name) fonts.add(name);
    }
  }

  // Extract from inline style attributes
  const inlineStyleRegex = /style=["']([^"']*?)["']/gi;
  while ((m = inlineStyleRegex.exec(html)) !== null) {
    const style = m[1];
    const inlineFontRegex = /font-family\s*:\s*["']?([^;"'}]+)["']?/gi;
    let im: RegExpExecArray | null;
    while ((im = inlineFontRegex.exec(style)) !== null) {
      const families = im[1].split(',').map(f => f.trim().replace(/["']/g, ''));
      for (const family of families) {
        const clean = family.trim();
        if (clean && !/^(?:sans-serif|serif|monospace)$/i.test(clean)) {
          fonts.add(clean);
        }
      }
    }
  }

  return [...fonts].slice(0, 10);
}

// ───── HTML Extraction Helpers ─────

function discoverInternalLinks(html: string, currentUrl: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const href = match[1].split('#')[0].split('?')[0];
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      if (href.endsWith('.pdf') || href.endsWith('.zip') || href.endsWith('.png') || href.endsWith('.jpg') || href.endsWith('.jpeg') || href.endsWith('.gif') || href.endsWith('.svg')) continue;

      const absolute = new URL(href, currentUrl).href;
      if (absolute.startsWith(baseUrl) && absolute !== currentUrl) {
        links.add(absolute);
      }
    } catch { /* skip invalid URLs */ }
  }
  return [...links];
}

function extractPageData(html: string, url: string): PageData {
  const title = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || extractTag(html, 'title') || '';
  const description = extractMeta(html, 'description') || extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description') || '';

  const keywordsRaw = extractMeta(html, 'keywords') || '';
  const keywords = keywordsRaw.split(/[,;]/).map(k => k.trim()).filter(k => k.length > 2);

  const headings: string[] = [];
  const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
  let m1: RegExpExecArray | null;
  while ((m1 = headingRegex.exec(html)) !== null) {
    const text = stripTags(m1[1]);
    if (text.length > 2) headings.push(text);
  }

  const paragraphs: string[] = [];
  const paraRegex = /<p[^>]*>(.*?)<\/p>/gi;
  let m2: RegExpExecArray | null;
  while ((m2 = paraRegex.exec(html)) !== null) {
    const text = stripTags(m2[1]);
    if (text.length > 20) paragraphs.push(text);
  }

  return {
    url,
    title,
    description,
    keywords,
    headings,
    paragraphs,
    services: extractKeywordItems(html, ['service', 'product', 'solution', 'offer', 'feature', 'capabilit', 'we do', 'we offer', 'we provide', 'we deliver', 'we build', 'we create', 'our services', 'what we do']),
    products: extractKeywordItems(html, ['product', 'tool', 'platform', 'software', 'app', 'system', 'marketplace', 'store', 'shop', 'catalog']),
    brandValues: extractKeywordItems(html, ['value', 'mission', 'vision', 'belief', 'principle', 'commit', 'purpose', 'culture', 'motto', 'core', 'philosophy', 'ethos']),
    pricingInfo: extractKeywordItems(html, ['price', 'pricing', 'plan', 'subscription', 'cost', 'month', 'annual', 'free', 'premium', 'enterprise', 'starter', 'pro', 'basic', 'package']),
    contactInfo: extractKeywordItems(html, ['email', 'phone', 'address', 'contact', 'location', 'office', 'reach us', 'get in touch', 'support', 'help']),
    teamInfo: extractKeywordItems(html, ['team', 'founder', 'CEO', 'director', 'lead', 'head of', 'engineer', 'designer', 'manager', 'president', 'partner', 'executive', 'our people']),
    testimonials: extractKeywordItems(html, ['testimonial', 'review', 'client say', 'customer say', 'trusted', 'recommend', 'success story', 'case study', 'feedback', 'rating', 'what our']),
  };
}

function extractKeywordItems(html: string, keywords: string[]): string[] {
  const items: string[] = [];

  // List items
  const liRegex = /<li[^>]*>(.*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRegex.exec(html)) !== null) {
    const text = stripTags(m[1]);
    if (text.length > 3 && text.length < 250 && keywords.some(kw => text.toLowerCase().includes(kw))) {
      items.push(text);
    }
  }

  // Div/section/article content if not enough list items
  if (items.length < 5) {
    const containerRegex = /<(?:div|section|article|header|aside)[^>]*>(.*?)<\/(?:div|section|article|header|aside)>/gi;
    while ((m = containerRegex.exec(html)) !== null) {
      const text = stripTags(m[1]);
      if (text.length > 10 && text.length < 200 && keywords.some(kw => text.toLowerCase().includes(kw))) {
        items.push(text);
        if (items.length >= 20) break;
      }
    }
  }

  // Strong/b/span tags
  if (items.length < 3) {
    const inlineRegex = /<(?:strong|b|span|em|mark)[^>]*>(.*?)<\/(?:strong|b|span|em|mark)>/gi;
    while ((m = inlineRegex.exec(html)) !== null) {
      const text = stripTags(m[1]);
      if (text.length > 5 && text.length < 120 && keywords.some(kw => text.toLowerCase().includes(kw))) {
        items.push(text);
        if (items.length >= 15) break;
      }
    }
  }

  return [...new Set(items)];
}

function extractLogoUrl(html: string, pageUrl: string): string | null {
  const patterns = [
    /<img[^>]*class=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /<img[^>]*id=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /<img[^>]*alt=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /<img[^>]*src=["']([^"']+)["'][^>]*alt=["'][^"']*logo[^"']*["']/i,
    /<img[^>]*src=["']([^"']+logo[^"']+)["']/i,
    /<img[^>]*title=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) {
      try {
        return new URL(m[1], pageUrl).href;
      } catch { return m[1]; }
    }
  }
  return null;
}

function extractBrandColor(html: string, cssContents: string[]): string | null {
  // 1. Check meta theme-color
  const themeColor = html.match(/<meta[^>]+theme-color[^>]+content=["']([^"']+)["']/i);
  if (themeColor) return themeColor[1];

  const allCss = cssContents.join('\n');

  // 2. Check CSS variables named --primary, --brand, --color-primary etc
  const brandVarRegex = /--(?:primary|brand-color|color-primary|brand|theme-primary|color-brand)\s*:\s*(#[0-9a-fA-F]{3,8})/i;
  const brandVar = allCss.match(brandVarRegex);
  if (brandVar) return brandVar[1];

  // 3. Check CSS variables that reference --primary or contain "primary" in name
  const varRegex = /--([^:]+)\s*:\s*(#[0-9a-fA-F]{3,8})/gi;
  let m: RegExpExecArray | null;
  const namedColors: Array<{ name: string; color: string }> = [];
  while ((m = varRegex.exec(allCss)) !== null) {
    if (/primary|brand|theme|accent|main/i.test(m[1])) {
      namedColors.push({ name: m[1], color: m[2] });
    }
  }
  if (namedColors.length > 0) return namedColors[0].color;

  // 4. Check common brand CSS classes
  const classPatterns = [
    /\.(?:btn-primary|button-primary|primary-btn|cta-button|hero-cta|brand-color|header-logo)\s*\{[^}]*?(?:background|background-color|color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/i,
    /\.(?:navbar|header|top-bar|site-header)\s*\{[^}]*?(?:background|background-color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/i,
  ];
  for (const pattern of classPatterns) {
    const match = allCss.match(pattern);
    if (match) return match[1];
  }

  // 5. Most frequently used color in CSS (excluding black, white, gray)
  const allHexColors: string[] = [];
  const hexRegex = /#([0-9a-fA-F]{3,8})\b/g;
  while ((m = hexRegex.exec(allCss)) !== null) {
    allHexColors.push(m[1].toLowerCase());
  }
  if (allHexColors.length > 0) {
    const freq = allHexColors.reduce((acc, c) => { acc[c] = (acc[c] || 0) + 1; return acc; }, {} as Record<string, number>);
    const sorted = Object.entries(freq)
      .filter(([c]) => !/^(000000|ffffff|fff|000|f0f0f0|f5f5f5|e5e5e5|cccccc|999999|666666|333333)$/i.test(c))
      .sort(([, a], [, b]) => b - a);
    if (sorted.length > 0) return '#' + sorted[0][0];
  }

  return null;
}

function extractSocialLinks(html: string, baseUrl: string): string[] {
  const platforms = [
    'facebook.com/', 'fb.com/',
    'twitter.com/', 'x.com/',
    'instagram.com/',
    'linkedin.com/',
    'youtube.com/', 'youtu.be/',
    'tiktok.com/',
    'pinterest.com/',
    'snapchat.com/',
    'reddit.com/',
    'medium.com/',
    'threads.net/',
    'discord.gg/', 'discord.com/',
    'twitch.tv/',
    'telegram.me/', 't.me/',
  ];
  const links: string[] = [];
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRegex.exec(html)) !== null) {
    const href = m[1];
    if (platforms.some(p => href.toLowerCase().includes(p))) {
      links.push(href);
    }
  }
  return links;
}

// Strip script, style, and other noise from HTML for LLM consumption
function stripNoiseHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'VIMO-Marketing-Bot/1.0' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)="(?:${name})"[^>]+content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:name|property)="(?:${name})"`, 'i'),
    new RegExp(`<meta[^>]+(?:name|property)='(?:${name})'[^>]+content='([^']*)'`, 'i'),
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) return m[1];
  }
  return null;
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, 'is'));
  return m ? m[1].trim() : null;
}
