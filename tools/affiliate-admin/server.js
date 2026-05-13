const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(__dirname, "public");
const SHOP_PATH = path.join(ROOT_DIR, "shop.html");
const SITE_NAME = "Dubrella";
const SITE_URL = String(process.env.SITE_URL || "https://dubrella.pages.dev").replace(/\/+$/, "");
const PORT = Number(process.env.PORT || 4311);
const DOMAIN_VERIFY = "3f9329f4428870c58c8b29e81cf2c699";
const AMAZON_PRICE_LABEL = "Check the latest price on Amazon";
const AMAZON_VIEW_LABEL = "VIEW ON AMAZON";

const AMAZON_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

const SECTION_FALLBACKS = [
  { id: "dresses", keywords: ["dress", "mini dress", "midi dress", "maxi dress", "gown"] },
  { id: "knits", keywords: ["cardigan", "sweater", "knit", "pullover", "jumper", "vest"] },
  { id: "tops", keywords: ["blouse", "shirt", "cami", "camisole", "tank", "bodysuit", "corset", "top"] },
  { id: "outer", keywords: ["jacket", "coat", "blazer", "trench", "puffer", "parka", "outerwear"] },
  { id: "bottoms", keywords: ["skirt", "trouser", "trousers", "pants", "jeans", "shorts", "leggings"] },
  { id: "shoes", keywords: ["heels", "heel", "boots", "boot", "flats", "sandals", "sneakers", "loafers", "mules", "shoe"] },
  { id: "bags", keywords: ["bag", "purse", "tote", "crossbody", "shoulder bag", "clutch", "satchel"] },
];

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(/<\/script/gi, "<\\/script");
}

function toAsciiText(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function decodeHtml(value) {
  if (!value) {
    return "";
  }

  const named = {
    amp: "&",
    quot: '"',
    apos: "'",
    nbsp: " ",
    lt: "<",
    gt: ">",
    mdash: "-",
    ndash: "-",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    trade: "TM",
    reg: "(R)",
    copy: "(C)",
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, token) => {
    if (token[0] === "#") {
      const isHex = token[1]?.toLowerCase() === "x";
      const codePoint = parseInt(token.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    }

    return Object.prototype.hasOwnProperty.call(named, token) ? named[token] : _;
  });
}

function stripTags(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
}

function cleanText(value) {
  return toAsciiText(decodeHtml(stripTags(value || "")))
    .replace(/[\u3010\u3011]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentenceCase(value) {
  if (!value) {
    return "";
  }

  const trimmed = String(value).trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  const shortened = value.slice(0, maxLength - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, Math.max(lastSpace, 0))}...`;
}

function normalizeMoneyValue(value) {
  const match = String(value ?? "").match(/([0-9][0-9,]*)(?:\.([0-9]{1,2}))?/);
  if (!match) {
    return "";
  }

  const dollars = match[1].replace(/,/g, "");
  const cents = (match[2] || "00").padEnd(2, "0").slice(0, 2);
  return `${dollars}.${cents}`;
}

function extractMoney(html) {
  const scopedAnchors = [
    'id="corePriceDisplay_desktop_feature_div"',
    'id="corePrice_feature_div"',
    'id="apex_desktop"',
    'id="desktop_buybox"',
    'id="corePrice_mobile_feature_div"',
  ];

  const scopedPatterns = [
    /class="[^"]*\b(?:priceToPay|apex-price-to-pay-value|apex-pricetopay-value)\b[^"]*"[\s\S]*?<span class="a-offscreen">\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /class="[^"]*\b(?:priceToPay|apex-price-to-pay-value|apex-pricetopay-value)\b[^"]*"[\s\S]*?<span class="a-price-whole">([0-9][0-9,]*)<span class="a-price-decimal">\.<\/span><\/span>\s*<span class="a-price-fraction">([0-9]{2})/i,
    /<span id="apex-pricetopay-accessibility-label"[^>]*>\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /<span class="a-offscreen">\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const anchor of scopedAnchors) {
    const index = html.indexOf(anchor);
    if (index < 0) {
      continue;
    }

    const slice = html.slice(index, index + 20000);
    for (const pattern of scopedPatterns) {
      const match = slice.match(pattern);
      if (!match) {
        continue;
      }

      const value = match[2] ? `${match[1]}.${match[2]}` : match[1];
      const normalized = normalizeMoneyValue(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  const fallbackPatterns = [
    /id="priceblock_(?:our|deal|sale|pospromoprice)"[^>]*>\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /"priceAmount"\s*:\s*"?([0-9][0-9,]*(?:\.[0-9]{1,2})?)"?/i,
    /"displayPrice"\s*:\s*"\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)"/i,
    /"buyingPrice"\s*:\s*"\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)"/i,
  ];

  for (const pattern of fallbackPatterns) {
    const match = html.match(pattern);
    if (!match) {
      continue;
    }

    const normalized = normalizeMoneyValue(match[1]);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function extractAvailability(html) {
  const match =
    html.match(/<div id="availability"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
    html.match(/<div id="availabilityInsideBuyBox_feature_div"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);

  const text = cleanText(match?.[1] || "").toLowerCase();
  return text.includes("currently unavailable") || text.includes("out of stock") ? "OutOfStock" : "InStock";
}

function extractImageSize(url) {
  const square = String(url).match(/_SL(\d+)_/i);
  if (square) {
    return { width: square[1], height: square[1] };
  }

  const width = String(url).match(/_AC_SX(\d+)_/i);
  const height = String(url).match(/_AC_SY(\d+)_/i);
  return { width: width?.[1] || "", height: height?.[1] || "" };
}

function formatAvailabilityLabel(availability) {
  return availability === "InStock" ? "In stock" : "Out of stock";
}

function productAvailabilityMetaValue(availability) {
  return availability === "InStock" ? "instock" : "outofstock";
}

function normalizeImageUrls(input) {
  const values = Array.isArray(input) ? input : [input];
  const cleaned = [];

  for (const value of values) {
    for (const part of String(value ?? "").split(/\r?\n/)) {
      const url = part.trim();
      if (!url || cleaned.includes(url)) {
        continue;
      }

      cleaned.push(url);
    }
  }

  return cleaned;
}

function normalizeBrand(rawBrand, fullTitle) {
  const cleaned = cleanText(rawBrand)
    .replace(/^Visit the\s+/i, "")
    .replace(/\s+Store$/i, "")
    .replace(/^Brand:\s*/i, "")
    .trim();

  if (cleaned) {
    return cleaned;
  }

  return cleanText(fullTitle).split(/\s+/).slice(0, 2).join(" ");
}

function titleFromAmazonTitle(fullTitle, brand) {
  const normalized = cleanText(fullTitle).replace(/\s+/g, " ").trim();
  if (!brand) {
    return normalized;
  }

  const brandPattern = new RegExp(`^${escapeRegExp(brand)}\\s+`, "i");
  const withoutBrand = normalized.replace(brandPattern, "").trim();
  return withoutBrand ? `${brand} ${withoutBrand}` : normalized;
}

function normalizeBulletCopy(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  return toSentenceCase(text)
    .replace(/\s*[:|-]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chooseBestBullets(bullets) {
  return bullets
    .map((bullet) => normalizeBulletCopy(bullet))
    .filter(Boolean)
    .filter((bullet) => bullet.length > 30)
    .filter((bullet) => !/^\d/.test(bullet))
    .slice(0, 4);
}

function deriveSummary(bullets, shortTitle) {
  const firstBullet = bullets[0];
  if (firstBullet) {
    return truncate(toSentenceCase(firstBullet), 175);
  }

  return truncate(
    `A feminine fashion pick built around ${shortTitle} with a soft silhouette and easy outfit potential.`,
    175,
  );
}

function deriveCardCopy(bullets, shortTitle) {
  const candidate = bullets.find((bullet) => !/^\d/.test(bullet)) || bullets[0];
  if (candidate) {
    return truncate(toSentenceCase(candidate), 155);
  }

  return truncate(`A polished ${shortTitle} pick for soft, modern wardrobes and repeatable everyday styling.`, 155);
}

function deriveMetaDescription(shortTitle, cardCopy) {
  return truncate(`Shop ${shortTitle} on Dubrella. ${cardCopy}`, 158);
}

function inferSectionId(productText, sectionIds) {
  const haystack = String(productText || "").toLowerCase();
  const available = new Set(sectionIds);

  for (const fallback of SECTION_FALLBACKS) {
    if (!available.has(fallback.id)) {
      continue;
    }

    if (fallback.keywords.some((keyword) => haystack.includes(keyword))) {
      return fallback.id;
    }
  }

  return sectionIds[0] || "knits";
}

function extractAmazonPathInfo(urlString) {
  const url = new URL(urlString);
  const parts = url.pathname.split("/").filter(Boolean);
  const dpIndex = parts.findIndex((part) => part.toLowerCase() === "dp");
  const gpIndex = parts.findIndex((part) => part.toLowerCase() === "product");
  const asin = dpIndex >= 0 ? parts[dpIndex + 1] : gpIndex >= 1 ? parts[gpIndex + 1] : "";
  const slugHint = dpIndex > 0 ? parts.slice(0, dpIndex).join(" ") : parts.join(" ");

  return {
    asin: cleanText(asin).toUpperCase(),
    slugHint,
    canonicalUrl: `https://${url.hostname}/dp/${cleanText(asin).toUpperCase()}`,
  };
}

async function getSections() {
  const html = await fs.readFile(SHOP_PATH, "utf8");
  return Array.from(
    html.matchAll(/<section class="[^"]*\bpickSection\b[^"]*" id="([^"]+)"[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi),
  ).map((match) => ({
    id: match[1],
    label: cleanText(match[2]),
  }));
}

async function resolveAffiliateUrl(affiliateUrl) {
  const response = await fetch(affiliateUrl, {
    method: "GET",
    redirect: "follow",
    headers: AMAZON_HEADERS,
  });

  return response.url || affiliateUrl;
}

async function fetchAmazonHtml(canonicalUrl) {
  const response = await fetch(canonicalUrl, {
    headers: AMAZON_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Amazon returned ${response.status} for ${canonicalUrl}`);
  }

  return response.text();
}

function extractMatch(html, regex) {
  const match = html.match(regex);
  return match ? cleanText(match[1]) : "";
}

function extractBullets(html) {
  const sectionMatch = html.match(/<div id="feature-bullets"[\s\S]*?<ul[\s\S]*?<\/ul>/i);
  if (!sectionMatch) {
    return [];
  }

  return chooseBestBullets(
    Array.from(sectionMatch[0].matchAll(/<li[^>]*>\s*<span class="a-list-item">([\s\S]*?)<\/span>\s*<\/li>/gi)).map(
      (match) => match[1],
    ),
  );
}

function buildPageFile(sectionId, pageSlug) {
  const slug = pageSlug.startsWith(`${sectionId}-`) ? pageSlug : `${sectionId}-${pageSlug}`;
  return `${slug}.html`;
}

function createAnalysis(input, amazonData, sections) {
  const imageUrls = normalizeImageUrls(input.imageUrls?.length ? input.imageUrls : input.imageUrl);
  if (!imageUrls.length) {
    throw new Error("At least one image URL is required.");
  }

  const sectionIds = sections.map((section) => section.id);
  const shortTitle = input.shortTitle?.trim() || titleFromAmazonTitle(amazonData.fullTitle, amazonData.brand);
  const cardCopy = input.cardCopy?.trim() || deriveCardCopy(amazonData.bullets, shortTitle);
  const pageSummary = input.pageSummary?.trim() || deriveSummary(amazonData.bullets, shortTitle);
  const sectionId = input.sectionId || inferSectionId(`${shortTitle} ${amazonData.slugHint}`, sectionIds);
  const pageSlug = slugify(shortTitle) || slugify(amazonData.slugHint) || amazonData.asin.toLowerCase();
  const pageFile = buildPageFile(sectionId, pageSlug);
  const primaryImageUrl = imageUrls[0];
  const imageSize = extractImageSize(primaryImageUrl);
  const sectionLabel = sections.find((section) => section.id === sectionId)?.label || "Shop";
  const productUrl = `${SITE_URL}/${pageFile}`;
  const publishedAt = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return {
    affiliateUrl: input.affiliateUrl,
    imageUrl: primaryImageUrl,
    imageUrls,
    sectionId,
    sectionLabel,
    asin: amazonData.asin,
    brand: amazonData.brand,
    fullTitle: amazonData.fullTitle,
    shortTitle,
    cardCopy,
    pageSummary,
    bullets: amazonData.bullets.length ? amazonData.bullets : [cardCopy],
    price: amazonData.price,
    priceCurrency: "USD",
    priceText: AMAZON_VIEW_LABEL,
    ctaLabel: "View on Amazon",
    availability: amazonData.availability,
    pageFile,
    productUrl,
    metaDescription: deriveMetaDescription(shortTitle, cardCopy),
    ogTitle: `${shortTitle} | ${SITE_NAME}`,
    ogDescription: pageSummary,
    twitterDescription: pageSummary,
    altText: input.altText?.trim() || `${shortTitle} fashion product photo`,
    imageWidth: imageSize.width,
    imageHeight: imageSize.height,
    publishedAt,
  };
}

async function findExistingProductFile({ asin, affiliateUrl, pageFile }) {
  const entries = await fs.readdir(ROOT_DIR, { withFileTypes: true });
  const htmlFiles = entries
    .filter((entry) => entry.isFile() && /\.html$/i.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => !["index.html", "about.html", "blog.html", "shop.html"].includes(name.toLowerCase()));

  for (const file of htmlFiles) {
    const content = await fs.readFile(path.join(ROOT_DIR, file), "utf8");
    if (
      !/og:type"\s+content="product"/i.test(content) &&
      !/name="page:type"\s+content="product"/i.test(content)
    ) {
      continue;
    }

    if (content.includes(asin) || content.includes(affiliateUrl) || file === pageFile) {
      return file;
    }
  }

  return pageFile;
}

function renderOgImageTags(data) {
  const tags = [];

  data.imageUrls.forEach((imageUrl, index) => {
    tags.push(`  <meta property="og:image" content="${escapeHtml(imageUrl)}">`);
    if (index === 0) {
      tags.push(`  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">`);
      tags.push(`  <meta property="og:image:alt" content="${escapeHtml(data.altText)}">`);
      if (data.imageWidth) {
        tags.push(`  <meta property="og:image:width" content="${escapeHtml(data.imageWidth)}">`);
      }
      if (data.imageHeight) {
        tags.push(`  <meta property="og:image:height" content="${escapeHtml(data.imageHeight)}">`);
      }
    }
  });

  return tags.join("\n");
}

function renderProductMetaTags(data) {
  const tags = [
    `  <meta property="product:retailer_item_id" content="${escapeHtml(data.asin)}">`,
    `  <meta property="product:brand" content="${escapeHtml(data.brand)}">`,
    `  <meta property="product:condition" content="new">`,
    `  <meta property="product:availability" content="${escapeHtml(productAvailabilityMetaValue(data.availability))}">`,
  ];

  if (data.price) {
    tags.push(`  <meta property="product:price:amount" content="${escapeHtml(data.price)}">`);
    tags.push(`  <meta property="product:price:currency" content="${escapeHtml(data.priceCurrency)}">`);
    tags.push(`  <meta property="og:price:amount" content="${escapeHtml(data.price)}">`);
    tags.push(`  <meta property="og:price:currency" content="${escapeHtml(data.priceCurrency)}">`);
  }

  return tags.join("\n");
}

function renderGalleryMarkup(data) {
  const thumbButtons = data.imageUrls
    .map(
      (imageUrl, index) => `            <button
              class="product-thumb${index === 0 ? " is-active" : ""}"
              type="button"
              data-gallery-thumb
              data-image="${escapeHtml(imageUrl)}"
              aria-label="Show product image ${index + 1}"
              aria-pressed="${index === 0 ? "true" : "false"}"
            >
              <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${data.shortTitle} image ${index + 1}`)}" loading="lazy" decoding="async">
            </button>`,
    )
    .join("\n");

  const media = `        <div class="product-media product-media--gallery">
          <img
            class="product-hero-image"
            src="${escapeHtml(data.imageUrl)}"
            alt="${escapeHtml(data.altText)}"
            loading="eager"
            decoding="async"
            referrerpolicy="no-referrer"
            data-gallery-main
          >${data.imageUrls.length > 1 ? `
          <div class="product-thumbs" aria-label="More product images">
${thumbButtons}
          </div>` : ""}
        </div>`;

  const script =
    data.imageUrls.length > 1
      ? `
  <script>
    document.addEventListener("DOMContentLoaded", function () {
      var mainImage = document.querySelector("[data-gallery-main]");
      var thumbs = Array.prototype.slice.call(document.querySelectorAll("[data-gallery-thumb]"));
      if (!mainImage || !thumbs.length) {
        return;
      }

      thumbs.forEach(function (thumb) {
        thumb.addEventListener("click", function () {
          var imageUrl = thumb.getAttribute("data-image");
          if (!imageUrl) {
            return;
          }

          mainImage.src = imageUrl;
          thumbs.forEach(function (item) {
            item.classList.remove("is-active");
            item.setAttribute("aria-pressed", "false");
          });
          thumb.classList.add("is-active");
          thumb.setAttribute("aria-pressed", "true");
        });
      });
    });
  </script>`
      : "";

  return { media, script };
}

function renderProductPage(data) {
  const gallery = renderGalleryMarkup(data);
  const organizationId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;
  const webpageId = `${data.productUrl}#webpage`;
  const productId = `${data.productUrl}#product`;
  const offerJson = {
    "@type": "Offer",
    url: data.affiliateUrl,
    availability: data.availability === "InStock" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    priceCurrency: data.priceCurrency,
    seller: {
      "@type": "Organization",
      name: "Amazon",
    },
  };

  if (data.price) {
    offerJson.price = data.price;
  }

  const richPinsGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        url: SITE_URL,
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: {
          "@id": organizationId,
        },
      },
      {
        "@type": "WebPage",
        "@id": webpageId,
        url: data.productUrl,
        name: data.ogTitle,
        description: data.metaDescription,
        isPartOf: {
          "@id": websiteId,
        },
        about: {
          "@id": productId,
        },
        mainEntity: {
          "@id": productId,
        },
        publisher: {
          "@id": organizationId,
        },
      },
      {
        "@type": "Product",
        "@id": productId,
        name: data.fullTitle,
        image: data.imageUrls,
        description: data.metaDescription,
        sku: data.asin,
        category: data.sectionLabel,
        url: data.productUrl,
        mainEntityOfPage: {
          "@id": webpageId,
        },
        brand: {
          "@type": "Brand",
          name: data.brand,
        },
        offers: offerJson,
      },
    ],
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="p:domain_verify" content="${DOMAIN_VERIFY}">
  <title>${escapeHtml(data.shortTitle)} | ${SITE_NAME}</title>
  <meta name="description" content="${escapeHtml(data.metaDescription)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(data.productUrl)}">
  <meta name="page:type" content="product">
  <meta name="pinterest-rich-pin" content="true">

  <meta property="og:type" content="product">
  <meta property="og:locale" content="en_US">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeHtml(data.ogTitle)}">
  <meta property="og:description" content="${escapeHtml(data.ogDescription)}">
  <meta property="og:url" content="${escapeHtml(data.productUrl)}">
${renderOgImageTags(data)}
${renderProductMetaTags(data)}

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(data.ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(data.twitterDescription)}">
  <meta name="twitter:image" content="${escapeHtml(data.imageUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(data.altText)}">

  <script type="application/ld+json">${safeJson(richPinsGraph)}</script>

  <link rel="icon" type="image/png" href="assets/DUBRELLA.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --critical-bg: #fff6fa; --critical-text: #2d1f28; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--critical-bg); color: var(--critical-text); font-family: "Manrope", sans-serif; font-size: 16px; line-height: 1.5; }
    .site-header { position: sticky; top: 0; z-index: 110; background: rgba(255, 246, 250, 0.96); border-bottom: 1px solid rgba(122, 74, 97, 0.14); }
    .nav { min-height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; }
  </style>
  <link rel="preload" href="styles.css" as="style">
  <link rel="stylesheet" href="styles.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="styles.css"></noscript>
</head>
<body>
  <div class="ambient-shape ambient-shape--one" aria-hidden="true"></div>
  <div class="ambient-shape ambient-shape--two" aria-hidden="true"></div>

  <header class="site-header">
    <nav class="nav container">
      <a class="brand" href="index.html#home">DUBRELLA</a>
      <ul class="menu">
        <li><a href="index.html#home">Home</a></li>
        <li><a href="shop.html">Shop</a></li>
        <li><a href="blog.html">Blog</a></li>
        <li><a href="about.html">About Us</a></li>
        <li><a href="index.html#categories">Categories</a></li>
      </ul>
    </nav>
  </header>

  <main class="product-main">
    <section class="product-shell section-shell reveal">
      <div class="product-layout">
${gallery.media}
        <div class="product-content">
          <p class="eyebrow">${escapeHtml(data.sectionLabel)} Edit</p>
          <h1>${escapeHtml(data.shortTitle)}</h1>
          <p class="product-summary">${escapeHtml(data.pageSummary)}</p>
          <ul class="product-specs">
            <li><strong>Brand:</strong> ${escapeHtml(data.brand)}</li>
            <li><strong>ASIN:</strong> ${escapeHtml(data.asin)}</li>
            <li>${escapeHtml(data.priceText)}</li>
            <li><strong>Availability:</strong> ${escapeHtml(formatAvailabilityLabel(data.availability))}</li>
          </ul>
          <div class="product-actions">
            <a class="hero-link" href="${escapeHtml(data.affiliateUrl)}" target="_blank" rel="nofollow sponsored noopener">${escapeHtml(data.ctaLabel)}</a>
            <a class="product-back" href="shop.html#${escapeHtml(data.sectionId)}">Back to ${escapeHtml(data.sectionLabel)}</a>
          </div>
          <p class="product-disclosure">
            Affiliate disclosure: As an Amazon Associate, Dubrella may earn from qualifying purchases.
          </p>
          <p class="product-data-note">
            Product title${data.price ? ", price," : ""} and stock status were last verified on ${escapeHtml(data.publishedAt)}.
          </p>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div>
      <strong>Dubrella</strong><br>
      <span>Curated feminine fashion for dreamy, modern wardrobes.</span><br>
      <span class="footer-disclosure">Some links may earn us a commission.</span>
    </div>
    <div class="footer-links">
      <a href="index.html#home">Home</a>
      <a href="shop.html">Shop</a>
      <a href="blog.html">Blog</a>
      <a href="about.html">About Us</a>
      <a href="index.html#categories">Categories</a>
    </div>
    <div>&copy; <span data-year></span> Dubrella</div>
  </footer>

  <script src="script.js"></script>${gallery.script}
</body>
</html>
`;
}

function renderProductCard(data, pageFile) {
  return `        <article class="productCard">
          <a class="productCard__imgLink" href="${escapeHtml(pageFile)}" aria-label="View ${escapeHtml(data.shortTitle)} details">
            <img
              class="productCard__img"
              src="${escapeHtml(data.imageUrl)}"
              alt="${escapeHtml(data.altText)}"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            >
          </a>
          <div class="productCard__body">
            <p class="productCard__eyebrow">${escapeHtml(data.sectionLabel)} Edit</p>
            <div class="productCard__top">
              <h3 class="productCard__title">${escapeHtml(data.shortTitle)}</h3>
              <div class="productCard__price">${escapeHtml(data.priceText)}</div>
            </div>
            <p class="productCard__copy">${escapeHtml(data.cardCopy)}</p>
            <div class="productCard__actions">
              <a class="productCard__link productCard__link--soft" href="${escapeHtml(pageFile)}">Details</a>
              <a class="productCard__link productCard__link--primary" href="${escapeHtml(data.affiliateUrl)}" target="_blank" rel="noopener noreferrer nofollow sponsored">${escapeHtml(data.ctaLabel)}</a>
            </div>
          </div>
        </article>`;
}

function replaceOrInsertCard(shopHtml, sectionId, cardHtml, pageFile, affiliateUrl) {
  const withoutExistingCard = shopHtml.replace(/<article class="productCard">[\s\S]*?<\/article>\s*/gi, (block) => {
    return block.includes(`href="${pageFile}"`) || block.includes(`href="${affiliateUrl}"`) ? "" : block;
  });

  const sectionPattern = new RegExp(
    `(<section class="[^"]*\\bpickSection\\b[^"]*" id="${escapeRegExp(sectionId)}"[\\s\\S]*?<div class="cardGrid">)`,
    "i",
  );

  if (!sectionPattern.test(withoutExistingCard)) {
    throw new Error(`Could not find section "${sectionId}" inside shop.html`);
  }

  return withoutExistingCard.replace(sectionPattern, `$1\n${cardHtml}`);
}

async function writeProductFiles(data) {
  const pageHtml = renderProductPage(data);
  await fs.writeFile(path.join(ROOT_DIR, data.pageFile), pageHtml, "utf8");

  const shopHtml = await fs.readFile(SHOP_PATH, "utf8");
  const cardHtml = renderProductCard(data, data.pageFile);
  const updatedShopHtml = replaceOrInsertCard(shopHtml, data.sectionId, cardHtml, data.pageFile, data.affiliateUrl);
  await fs.writeFile(SHOP_PATH, updatedShopHtml, "utf8");

  return data.pageFile;
}

function createAmazonData(pathInfo, html) {
  const fullTitle = extractMatch(html, /<span id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
  const rawBrand = extractMatch(html, /<a id="bylineInfo"[^>]*>([\s\S]*?)<\/a>/i);

  if (!fullTitle) {
    throw new Error("Could not read the Amazon product title.");
  }

  return {
    asin: pathInfo.asin,
    slugHint: pathInfo.slugHint,
    fullTitle,
    brand: normalizeBrand(rawBrand, fullTitle),
    bullets: extractBullets(html),
    price: extractMoney(html),
    availability: extractAvailability(html),
  };
}

async function analyzeAffiliateInput(input) {
  if (!input?.affiliateUrl || !normalizeImageUrls(input.imageUrls?.length ? input.imageUrls : input.imageUrl).length) {
    throw new Error("Affiliate URL and at least one image URL are required.");
  }

  const sections = await getSections();
  const resolvedUrl = await resolveAffiliateUrl(input.affiliateUrl);
  const pathInfo = extractAmazonPathInfo(resolvedUrl);

  if (!pathInfo.asin) {
    throw new Error("Could not extract an ASIN from the affiliate link.");
  }

  const html = await fetchAmazonHtml(pathInfo.canonicalUrl);
  const analysis = createAnalysis(input, createAmazonData(pathInfo, html), sections);
  const pageFile = await findExistingProductFile(analysis);

  return {
    ...analysis,
    pageFile,
    productUrl: `${SITE_URL}/${pageFile}`,
  };
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.join(PUBLIC_DIR, pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".js"
          ? "text/javascript; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : "application/octet-stream";

    res.writeHead(200, { "content-type": contentType });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === "GET" && requestUrl.pathname === "/api/sections") {
        json(res, 200, { sections: await getSections() });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/analyze") {
        const analysis = await analyzeAffiliateInput(await readRequestBody(req));
        json(res, 200, { analysis });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/publish") {
        const analysis = await analyzeAffiliateInput(await readRequestBody(req));
        const pageFile = await writeProductFiles(analysis);
        json(res, 200, {
          ok: true,
          pageFile,
          pagePath: path.join(ROOT_DIR, pageFile),
          shopPath: SHOP_PATH,
          analysis: { ...analysis, pageFile, productUrl: `${SITE_URL}/${pageFile}` },
        });
        return;
      }

      await serveStatic(req, res);
    } catch (error) {
      json(res, 500, { error: error.message || "Unexpected error" });
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Affiliate admin app running at http://localhost:${PORT}`);
  });
}

module.exports = {
  PORT,
  SITE_NAME,
  SITE_URL,
  SHOP_PATH,
  analyzeAffiliateInput,
  createServer,
  getSections,
  renderProductPage,
  writeProductFiles,
};

