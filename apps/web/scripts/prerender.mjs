import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const CONTENT_FILE = join(ROOT, "scripts", "seo-content.json");
const SITE_URL = (process.env.SITE_URL ?? "").replace(/\/$/, "");

const TOOLS = [
  { slug: "/tools/compress", label: "Compress PDF" },
  { slug: "/tools/merge", label: "Merge PDF" },
  { slug: "/tools/split", label: "Split PDF" },
  { slug: "/tools/convert", label: "Office to PDF" },
  { slug: "/tools/pdf-to-word", label: "PDF to Word" },
  { slug: "/tools/rotate", label: "Rotate PDF" },
  { slug: "/tools/reorder", label: "Organize PDF pages" },
  { slug: "/tools/ocr", label: "OCR PDF" },
  { slug: "/tools/protect", label: "Protect PDF" },
  { slug: "/tools/unlock", label: "Unlock PDF" },
  { slug: "/tools/watermark", label: "Watermark PDF" },
  { slug: "/tools/page-numbers", label: "Add page numbers" },
  { slug: "/tools/crop", label: "Crop PDF" },
  { slug: "/tools/sign", label: "Sign PDF" },
  { slug: "/tools/redact", label: "Redact PDF" },
  { slug: "/tools/edit", label: "Edit PDF" },
  { slug: "/tools/pdf-to-images", label: "PDF to JPG" },
  { slug: "/tools/images-to-pdf", label: "Images to PDF" },
  { slug: "/tools/grayscale", label: "Grayscale PDF" },
  { slug: "/tools/repair", label: "Repair PDF" },
  { slug: "/tools/extract-text", label: "Extract text from PDF" },
  { slug: "/tools/pdfa", label: "PDF to PDF/A" },
  { slug: "/tools/flatten", label: "Flatten PDF" },
  { slug: "/tools/n-up", label: "N-up — pages per sheet" },
  { slug: "/tools/pdf-to-powerpoint", label: "PDF to PowerPoint" },
  { slug: "/tools/metadata", label: "Edit PDF metadata" },
];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadContent() {
  if (!existsSync(CONTENT_FILE)) return {};
  try {
    const pages = JSON.parse(readFileSync(CONTENT_FILE, "utf8"));
    const map = {};
    for (const p of Array.isArray(pages) ? pages : []) {
      if (p && typeof p.slug === "string") map[p.slug] = p;
    }
    return map;
  } catch {
    return {};
  }
}

function fallback(slug) {
  if (slug === "/") {
    return {
      slug,
      title: "Free PDF tools — no signup, private — Papyrus",
      metaDescription:
        "A free, private online PDF toolkit: compress, merge, split, convert, OCR, sign and more. No signup, no ads, files gone in 24h.",
      h1: "Every PDF tool you need, free",
      intro:
        "Drop a file, run a tool, and leave. No signup, no ads, and your files are deleted within 24 hours.",
      steps: ["Pick a tool", "Drop your file", "Download the result"],
      faqs: [],
    };
  }
  const tool = TOOLS.find((t) => t.slug === slug);
  const label = tool ? tool.label : "PDF tool";
  return {
    slug,
    title: `${label} — free & private — Papyrus`,
    metaDescription: `${label} online for free. No signup, no ads, private — your files are deleted within 24 hours.`,
    h1: label,
    intro: `${label} online, free and private. No signup required and your files are removed within 24 hours.`,
    steps: ["Drop your file", "Choose your options", "Download the result"],
    faqs: [],
  };
}

function relatedNav(currentSlug) {
  const links = TOOLS.filter((t) => t.slug !== currentSlug)
    .map((t) => `<li><a href="${t.slug}">${esc(t.label)}</a></li>`)
    .join("");
  return `<nav aria-label="More PDF tools"><h2>More free PDF tools</h2><ul>${links}</ul></nav>`;
}

function jsonLd(page, canonical) {
  const graph = [
    {
      "@type": "WebApplication",
      name: `Papyrus — ${page.h1}`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: canonical,
    },
  ];
  if (Array.isArray(page.faqs) && page.faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: page.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function contentBlock(page, currentSlug) {
  const steps =
    Array.isArray(page.steps) && page.steps.length > 0
      ? `<ol>${page.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
      : "";
  const faqs =
    Array.isArray(page.faqs) && page.faqs.length > 0
      ? `<section><h2>Frequently asked questions</h2><dl>${page.faqs
          .map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`)
          .join("")}</dl></section>`
      : "";
  return (
    `<main style="max-width:720px;margin:0 auto;padding:48px 20px;font-family:system-ui,sans-serif;line-height:1.6">` +
    `<h1>${esc(page.h1)}</h1>` +
    `<p>${esc(page.intro)}</p>` +
    (steps ? `<section><h2>How it works</h2>${steps}</section>` : "") +
    faqs +
    relatedNav(currentSlug) +
    `<p><a href="/">Papyrus — free, private PDF tools</a></p>` +
    `</main>`
  );
}

function headTags(page, canonical) {
  const ogUrl = SITE_URL ? canonical : page.slug;
  const tags = [
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Papyrus" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.metaDescription)}" />`,
    `<meta property="og:url" content="${esc(ogUrl)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.metaDescription)}" />`,
    `<script type="application/ld+json">${jsonLd(page, canonical)}</script>`,
  ];
  return tags.join("\n    ");
}

function render(template, page) {
  const canonical = `${SITE_URL}${page.slug === "/" ? "/" : page.slug}`;
  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`);
  html = html.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${esc(page.metaDescription)}" />`,
  );
  html = html.replace(/<\/head>/, `    ${headTags(page, canonical)}\n  </head>`);
  html = html.replace(
    /<div id="root">\s*<\/div>/,
    `<div id="root">${contentBlock(page, page.slug)}</div>`,
  );
  return html;
}

function main() {
  const indexPath = join(DIST, "index.html");
  if (!existsSync(indexPath)) {
    process.stderr.write("[prerender] dist/index.html not found — run vite build first.\n");
    process.exit(1);
  }
  const template = readFileSync(indexPath, "utf8");
  const content = loadContent();
  const pages = [{ slug: "/" }, ...TOOLS].map((t) => ({ ...fallback(t.slug), ...content[t.slug] }));

  let count = 0;
  for (const page of pages) {
    const html = render(template, page);
    if (page.slug === "/") {
      writeFileSync(indexPath, html);
    } else {
      const dir = join(DIST, page.slug.replace(/^\//, ""));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "index.html"), html);
    }
    count += 1;
  }

  const urls = [{ slug: "/", freq: "weekly", pri: "1.0" }].concat(
    TOOLS.map((t) => ({ slug: t.slug, freq: "monthly", pri: "0.9" })),
  );
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${SITE_URL}${u.slug}</loc><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;
  writeFileSync(join(DIST, "sitemap.xml"), sitemap);

  const sitemapUrl = SITE_URL ? `${SITE_URL}/sitemap.xml` : "/sitemap.xml";
  writeFileSync(
    join(DIST, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /settings\nDisallow: /jobs\n\nSitemap: ${sitemapUrl}\n`,
  );

  process.stdout.write(
    `[prerender] wrote ${count} pages (${Object.keys(content).length} rich) + sitemap.xml + robots.txt` +
      (SITE_URL ? ` for ${SITE_URL}\n` : " (relative URLs; set SITE_URL for absolute)\n"),
  );
}

main();
