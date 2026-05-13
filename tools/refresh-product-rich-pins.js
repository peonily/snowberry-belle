const fs = require("fs/promises");
const path = require("path");
const { analyzeAffiliateInput, getSections, renderProductPage, SITE_URL } = require("./affiliate-admin/server");

const ROOT_DIR = path.resolve(__dirname, "..");
const PRODUCT_EXCLUDES = new Set(["index.html", "about.html", "blog.html", "shop.html"]);

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractMatch(html, pattern) {
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : "";
}

function extractAllMatches(html, pattern, mapFn) {
  return Array.from(html.matchAll(pattern)).map((match) => mapFn(match)).filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractJsonLd(html) {
  const blocks = extractAllMatches(
    html,
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
    (match) => match[1],
  );

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      if (parsed?.["@type"] === "Product") {
        return parsed;
      }
    } catch {}
  }

  return null;
}

function parseProductPage(html, file) {
  const productJson = extractJsonLd(html);
  const affiliateUrl =
    extractMatch(html, /<a[^>]+class="[^"]*\bhero-link\b[^"]*"[^>]+href="([^"]+)"/i) ||
    cleanText(productJson?.offers?.url || "") ||
    extractMatch(html, /<a[^>]+href="(https:\/\/(?:www\.)?(?:amzn\.to|amazon\.[^"]+))"[^>]*>/i);
  const primaryImage =
    extractMatch(html, /<img[^>]+class="[^"]*\bproduct-hero-image\b[^"]*"[^>]+src="([^"]+)"/i) ||
    cleanText(Array.isArray(productJson?.image) ? productJson.image[0] : productJson?.image || "") ||
    extractMatch(html, /<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const imageUrls = unique([
    primaryImage,
    ...extractAllMatches(html, /data-image="([^"]+)"/gi, (match) => cleanText(match[1])),
    ...extractAllMatches(html, /<meta\s+property="og:image"\s+content="([^"]+)"/gi, (match) => cleanText(match[1])),
  ]);
  const shortTitle = extractMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const pageSummary = extractMatch(html, /<p[^>]+class="[^"]*\bproduct-summary\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const altText = extractMatch(html, /<img[^>]+class="[^"]*\bproduct-hero-image\b[^"]*"[^>]+alt="([^"]+)"/i);
  const sectionId =
    extractMatch(html, /<a[^>]+class="[^"]*\bproduct-back\b[^"]*"[^>]+href="shop\.html#([^"]+)"/i) ||
    file.split("-")[0];

  if (!affiliateUrl || !imageUrls.length || !shortTitle) {
    throw new Error(`Missing required product data in ${file}`);
  }

  return {
    affiliateUrl,
    imageUrls,
    shortTitle,
    pageSummary,
    altText,
    sectionId,
  };
}

function buildFallbackData(html, file, sections) {
  const parsed = parseProductPage(html, file);
  const productJson = extractJsonLd(html) || {};
  const sectionId = parsed.sectionId;
  const sectionLabel = sections.find((section) => section.id === sectionId)?.label || sectionId;
  const price =
    extractMatch(html, /<meta\s+property="product:price:amount"\s+content="([^"]+)"/i) ||
    extractMatch(html, /<meta\s+property="og:price:amount"\s+content="([^"]+)"/i) ||
    cleanText(productJson?.offers?.price || "") ||
    extractMatch(html, /<li>\s*<strong>Price:<\/strong>\s*\$([0-9.,]+)/i);
  const availabilityRaw =
    extractMatch(html, /<meta\s+property="product:availability"\s+content="([^"]+)"/i) ||
    cleanText(productJson?.offers?.availability || "") ||
    extractMatch(html, /<li>\s*<strong>Availability:<\/strong>\s*([^<]+)/i);
  const availability = /outofstock|out of stock|unavailable/i.test(availabilityRaw) ? "OutOfStock" : "InStock";
  const brand =
    extractMatch(html, /<meta\s+property="product:brand"\s+content="([^"]+)"/i) ||
    cleanText(productJson?.brand?.name || productJson?.brand || "") ||
    extractMatch(html, /<li>\s*<strong>Brand:<\/strong>\s*([^<]+)/i) ||
    parsed.shortTitle.split(/\s+/).slice(0, 2).join(" ");
  const asin =
    extractMatch(html, /<meta\s+property="product:retailer_item_id"\s+content="([^"]+)"/i) ||
    cleanText(productJson?.sku || "") ||
    extractMatch(html, /<li>\s*<strong>ASIN:<\/strong>\s*([^<]+)/i);
  const metaDescription =
    extractMatch(html, /<meta\s+name="description"\s+content="([^"]+)"/i) ||
    extractMatch(html, /<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
    parsed.pageSummary;
  const publishedAt =
    extractMatch(html, /last verified on\s+([^.<]+)/i) ||
    new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return {
    affiliateUrl: parsed.affiliateUrl,
    imageUrl: parsed.imageUrls[0],
    imageUrls: parsed.imageUrls,
    sectionId,
    sectionLabel,
    asin,
    brand,
    fullTitle: cleanText(productJson?.name || parsed.shortTitle),
    shortTitle: parsed.shortTitle,
    pageSummary: parsed.pageSummary || extractMatch(html, /<meta\s+property="og:description"\s+content="([^"]+)"/i),
    bullets: [parsed.pageSummary || metaDescription].filter(Boolean),
    price,
    priceCurrency:
      extractMatch(html, /<meta\s+property="product:price:currency"\s+content="([^"]+)"/i) ||
      extractMatch(html, /<meta\s+property="og:price:currency"\s+content="([^"]+)"/i) ||
      cleanText(productJson?.offers?.priceCurrency || "") ||
      "USD",
    priceText: "VIEW ON AMAZON",
    ctaLabel: "View on Amazon",
    availability,
    pageFile: file,
    productUrl: `${SITE_URL}/${file}`,
    metaDescription,
    ogTitle:
      extractMatch(html, /<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
      `${parsed.shortTitle} | Snowberry Belle`,
    ogDescription:
      extractMatch(html, /<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
      parsed.pageSummary,
    twitterDescription:
      extractMatch(html, /<meta\s+name="twitter:description"\s+content="([^"]+)"/i) ||
      parsed.pageSummary,
    altText: parsed.altText || `${parsed.shortTitle} fashion product photo`,
    imageWidth: extractMatch(html, /<meta\s+property="og:image:width"\s+content="([^"]+)"/i),
    imageHeight: extractMatch(html, /<meta\s+property="og:image:height"\s+content="([^"]+)"/i),
    publishedAt,
  };
}

async function refreshFile(file, sections) {
  const filePath = path.join(ROOT_DIR, file);
  const html = await fs.readFile(filePath, "utf8");
  if (!/meta\s+name="page:type"\s+content="product"/i.test(html) && !/meta\s+property="og:type"\s+content="product"/i.test(html)) {
    return null;
  }

  let normalized;

  try {
    const input = parseProductPage(html, file);
    const analysis = await analyzeAffiliateInput(input);
    normalized = {
      ...analysis,
      pageFile: file,
      productUrl: `${SITE_URL}/${file}`,
    };
  } catch {
    normalized = buildFallbackData(html, file, sections);
  }

  await fs.writeFile(filePath, renderProductPage(normalized), "utf8");
  return {
    file,
    price: normalized.price || "",
    availability: normalized.availability,
  };
}

async function main() {
  const sections = await getSections();
  const entries = await fs.readdir(ROOT_DIR, { withFileTypes: true });
  const htmlFiles = entries
    .filter((entry) => entry.isFile() && /\.html$/i.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => !PRODUCT_EXCLUDES.has(name.toLowerCase()))
    .sort();

  const results = [];
  const failures = [];

  for (const file of htmlFiles) {
    try {
      const refreshed = await refreshFile(file, sections);
      if (refreshed) {
        results.push(refreshed);
        console.log(`updated ${file}${refreshed.price ? ` ($${refreshed.price})` : ""}`);
      }
    } catch (error) {
      failures.push({ file, error: error.message || String(error) });
      console.error(`failed ${file}: ${error.message || error}`);
    }
  }

  console.log(`\nRefreshed ${results.length} product pages.`);
  if (failures.length) {
    console.log(`Failed ${failures.length} pages.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
