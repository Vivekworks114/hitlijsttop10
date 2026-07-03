#!/usr/bin/env node
/**
 * Fetch blog archive pages (/blog/, /blog/2/, /blog/3/) from live hitlijsttop10.nl.
 * Run: node scripts/fetch-blog-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, rewriteHtml, collectUploadPaths } from './html-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src/data/content-pages');
const META_PATH = path.join(OUT_DIR, 'blog-meta.json');

const BLOG_PAGES = [
  { slug: 'blog', url: '/blog/', file: 'blog.html', canonical: '/blog/' },
  { slug: 'blog/2', url: '/blog/2/', file: 'blog/2.html', canonical: '/blog/2/' },
  { slug: 'blog/3', url: '/blog/3/', file: 'blog/3.html', canonical: '/blog/3/' },
];

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

function extractMeta(html, canonical) {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? 'Blog | hitlijsttop10.nl';
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  const ogImage =
    html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]?.replace(SITE, '').replace('/wp-content/uploads/', '/uploads/') ??
    '';
  const bodyClass = html.match(/<body[^>]*class="([^"]*)"/)?.[1] ?? '';
  const postCss = new Set();
  for (const match of html.matchAll(/\/(?:wp-content\/)?uploads\/elementor\/css\/(post-\d+\.css)/g)) {
    postCss.add(match[1]);
  }

  return {
    title,
    description,
    canonical,
    ogImage,
    bodyClass,
    modifiedTime: '',
    publishedTime: '',
    postCss: [...postCss],
  };
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

async function downloadCss(file) {
  const destPath = path.join(ROOT, 'public/css/elementor', file);
  if (fs.existsSync(destPath)) return;

  const res = await fetch(`${SITE}/wp-content/uploads/elementor/css/${file}?ver=1780672671`);
  if (!res.ok) {
    console.warn(`  Failed CSS ${file}: ${res.status}`);
    return;
  }
  let content = await res.text();
  content = content.replaceAll(SITE, '').replaceAll('/wp-content/uploads/', '/uploads/');
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content);
  console.log(`  CSS: ${file}`);
}

async function main() {
  const meta = {};
  const allCss = new Set();

  for (const page of BLOG_PAGES) {
    console.log(`Fetching ${page.url}`);
    const res = await fetch(`${SITE}${page.url}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HLT-Migration/1.0)' },
    });
    if (!res.ok) throw new Error(`${page.url} HTTP ${res.status}`);

    const html = await res.text();
    const main = rewriteHtml(extractMain(html));
    const dest = path.join(OUT_DIR, page.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, main);

    const pageMeta = extractMeta(html, page.canonical);
    pageMeta.postCss.forEach((f) => allCss.add(f));
    meta[page.slug] = pageMeta;

    for (const localPath of collectUploadPaths(main)) {
      await downloadImage(localPath);
    }
  }

  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

  for (const file of allCss) {
    await downloadCss(file);
  }

  console.log(`Saved ${BLOG_PAGES.length} blog archive pages.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
