#!/usr/bin/env node
/**
 * Fetch vermogen/content pages from live hitlijsttop10.nl.
 * Run: node scripts/fetch-content-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, rewriteHtml, collectUploadPaths } from './html-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src/data/content-pages');
const CACHE_DIR = path.join(ROOT, '.migration-cache/content-pages');

const STATIC_PAGES = ['bekendheden', 'sitemap', 'contact', 'over-ons', 'zb_mp_naam-vermogen', 'magic_page_slug'];

/** Slugs handled by dedicated Astro routes or non-content URLs. */
const SKIP_SLUGS = new Set(['blog', 'home', 'wp-json', 'feed', 'comments', 'category', 'author']);

const SITEMAP_FEEDS = [
  '/post-sitemap.xml',
  '/page-sitemap.xml',
  '/zb_mp-sitemap.xml',
  '/wp-sitemap-posts-post-1.xml',
];

function discoverLocalSlugs() {
  const slugs = new Set(STATIC_PAGES);
  const htmlFiles = [
    path.join(ROOT, 'src/data/homepage/header.html'),
    path.join(ROOT, 'src/data/homepage/main.html'),
    path.join(ROOT, 'src/data/homepage/footer.html'),
  ];

  for (const file of htmlFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\/vermogen-van-([a-z0-9-]+)\/?/g)) {
      slugs.add(`vermogen-van-${match[1]}`);
    }
  }

  const blogDir = path.join(ROOT, 'src/content/blog');
  if (fs.existsSync(blogDir)) {
    for (const file of fs.readdirSync(blogDir)) {
      if (file.endsWith('.mdx') || file.endsWith('.md')) {
        slugs.add(file.replace(/\.mdx?$/, ''));
      }
    }
  }

  return slugs;
}

async function fetchSitemapXml(path) {
  const slugs = new Set();
  try {
    const res = await fetch(`${SITE}${path}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HLT-Migration/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(`  Sitemap ${path}: HTTP ${res.status}`);
      return slugs;
    }

    const xml = await res.text();
    for (const match of xml.matchAll(/<loc>https:\/\/hitlijsttop10\.nl\/([^/<]+)\/<\/loc>/g)) {
      const slug = match[1];
      if (!SKIP_SLUGS.has(slug) && !slug.includes('.')) {
        slugs.add(slug);
      }
    }
  } catch (err) {
    console.warn(`  Sitemap ${path}: ${err.message}`);
  }
  return slugs;
}

async function discoverSitemapSlugs() {
  const slugs = new Set();
  for (const path of SITEMAP_FEEDS) {
    for (const slug of await fetchSitemapXml(path)) {
      slugs.add(slug);
    }
  }
  return slugs;
}

async function discoverPageSlugs() {
  const slugs = new Set([...discoverLocalSlugs(), ...(await discoverSitemapSlugs())]);
  return [...slugs].sort();
}

function extractMeta(html, slug) {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? '';
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  const canonical =
    html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]?.replace(SITE, '') ?? `/${slug}/`;
  const ogImage =
    html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]?.replace(SITE, '').replace('/wp-content/uploads/', '/uploads/') ??
    '';
  const bodyClass = html.match(/<body[^>]*class="([^"]*)"/)?.[1] ?? '';
  const modifiedTime =
    html.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1] ?? '';
  const publishedTime =
    html.match(/<meta property="article:published_time" content="([^"]+)"/)?.[1] ?? '';

  return { title, description, canonical, ogImage, bodyClass, modifiedTime, publishedTime };
}

function extractMain(html) {
  const headerEnd = html.indexOf('</header>');
  const footerStart = html.indexOf('<footer');
  if (headerEnd >= 0 && footerStart > headerEnd) {
    return html.slice(headerEnd + '</header>'.length, footerStart);
  }

  const wpPageStart = html.search(/<div[^>]*data-elementor-type="wp-page"[^>]*>/);
  const footerDivStart = html.search(
    /<div[^>]*data-elementor-type="footer"[^>]*class="[^"]*elementor-location-footer/
  );
  if (wpPageStart >= 0 && footerDivStart > wpPageStart) {
    return html.slice(wpPageStart, footerDivStart);
  }

  throw new Error('Could not locate main content boundaries');
}

function extractPostCss(html) {
  const files = new Set();
  for (const match of html.matchAll(/\/uploads\/elementor\/css\/(post-\d+\.css)/g)) {
    files.add(match[1]);
  }
  for (const match of html.matchAll(/\/wp-content\/uploads\/elementor\/css\/(post-\d+\.css)/g)) {
    files.add(match[1]);
  }
  return [...files];
}

async function downloadImage(localPath) {
  const destPath = path.join(ROOT, 'public', localPath);
  if (fs.existsSync(destPath)) return;

  const remoteUrl = `${SITE}/wp-content/uploads/${localPath.replace('/uploads/', '')}`;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    console.warn(`  Failed to download ${remoteUrl}: ${res.status}`);
    return;
  }
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

async function fetchPage(slug, { refresh = false } = {}) {
  const cachePath = path.join(CACHE_DIR, `${slug}.html`);
  if (!refresh && fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8');
  }

  const res = await fetch(`${SITE}/${slug}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HLT-Migration/1.0)' },
  });
  if (!res.ok) {
    throw new Error(`Could not fetch ${slug}: HTTP ${res.status}`);
  }

  const html = await res.text();
  if (html.includes('error404') || html.includes('Pagina niet gevonden')) {
    throw new Error(`${slug} resolved to 404 page`);
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, html);
  return html;
}

async function main() {
  const slugs = await discoverPageSlugs();
  const refresh = process.argv.includes('--refresh');
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const existingManifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {};
  const manifest = {};
  const allPostCss = new Set();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Fetching ${slugs.length} content pages from ${SITE}...`);

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    console.log(`[${i + 1}/${slugs.length}] ${slug}`);
    try {
      const html = await fetchPage(slug, { refresh });
      const meta = extractMeta(html, slug);
      if (meta.bodyClass.includes('error404')) {
        throw new Error('404 body class');
      }

      let main = rewriteHtml(extractMain(html));
      fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), main);

      const postCss = extractPostCss(html);
      postCss.forEach((f) => allPostCss.add(f));

      manifest[slug] = {
        ...meta,
        canonical: meta.canonical.startsWith('http')
          ? meta.canonical.replace(SITE, '')
          : meta.canonical,
        postCss,
      };

      for (const localPath of collectUploadPaths(main)) {
        await downloadImage(localPath);
      }
    } catch (err) {
      console.warn(`  Skipped ${slug}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  for (const [slug, entry] of Object.entries(existingManifest)) {
    if (!manifest[slug] && fs.existsSync(path.join(OUT_DIR, `${slug}.html`))) {
      manifest[slug] = entry;
      entry.postCss?.forEach((f) => allPostCss.add(f));
    }
  }

  for (const file of fs.readdirSync(OUT_DIR)) {
    if (!file.endsWith('.html')) continue;
    const slug = file.replace(/\.html$/, '');
    if (manifest[slug]) continue;
    manifest[slug] = {
      title: slug.replace(/-/g, ' '),
      description: '',
      canonical: `/${slug}/`,
      ogImage: '',
      bodyClass: '',
      modifiedTime: '',
      publishedTime: '',
      postCss: ['post-7.css', 'post-17.css', 'post-19.css', 'post-237.css', 'post-1114.css'],
    };
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(OUT_DIR, 'post-css.json'),
    JSON.stringify([...allPostCss].sort(), null, 2)
  );

  console.log(`\nSaved ${Object.keys(manifest).length} pages to ${path.relative(ROOT, OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
