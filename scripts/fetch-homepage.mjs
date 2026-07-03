#!/usr/bin/env node
/**
 * Re-fetch homepage HTML from live hitlijsttop10.nl and process for Astro.
 * Run: node scripts/fetch-homepage.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, rewriteHtml, collectUploadPaths } from './html-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src/data/homepage');
const CACHE = path.join(ROOT, '.migration-cache/hlt-home.html');

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
  console.log(`  Downloaded: ${localPath}`);
}

async function downloadImages(localPaths) {
  for (const localPath of localPaths.sort()) {
    await downloadImage(localPath);
  }
}

async function main() {
  console.log('Fetching live homepage...');
  const res = await fetch(`${SITE}/`);
  const html = await res.text();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, html);

  const headerStart = html.indexOf('<header');
  const headerEnd = html.indexOf('</header>') + '</header>'.length;
  const footerStart = html.indexOf('<footer');
  const footerEnd = html.indexOf('</footer>') + '</footer>'.length;

  if (headerStart < 0 || footerStart < 0) {
    throw new Error('Could not locate header/footer in homepage HTML');
  }

  let main = html.slice(headerEnd, footerStart);
  main = rewriteHtml(main);

  const headerHtml = rewriteHtml(html.slice(headerStart, headerEnd));
  const mainHtml = rewriteHtml(main);
  const footerHtml = rewriteHtml(html.slice(footerStart, footerEnd));

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
  const modifiedMatch = html.match(
    /<meta property="article:modified_time" content="([^"]+)"/
  );
  const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

  const meta = {
    title: titleMatch?.[1] || 'Gegarandeerde hit aankopen met Hitlijsttop10.nl',
    description:
      descMatch?.[1] ||
      'Schiet altijd in de roos met je aankopen via Hitlijsttop10.nl. Alleen de 10 beste producten vind je bij ons. Bekijk het aanbod.',
    canonical: '/',
    modifiedTime: modifiedMatch?.[1] || '',
    ogImage:
      ogImageMatch?.[1]?.replace(SITE, '').replace('/wp-content/uploads/', '/uploads/') ||
      '/uploads/elementor/thumbs/skynews-rowan-atkinson-qmhzcz8cq3dd17iwmb1uqfywm53lyt9o7wle9mjfus.jpg',
    bodyClass:
      'home wp-singular page-template page-template-elementor_header_footer page page-id-27 wp-embed-responsive wp-theme-hello-elementor hello-elementor-default elementor-default elementor-template-full-width elementor-kit-7 elementor-page elementor-page-27',
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'header.html'), headerHtml);
  fs.writeFileSync(path.join(OUT_DIR, 'main.html'), mainHtml);
  fs.writeFileSync(path.join(OUT_DIR, 'footer.html'), footerHtml);
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

  console.log('Downloading homepage images...');
  const imagePaths = collectUploadPaths(headerHtml, mainHtml, footerHtml);
  await downloadImages(imagePaths);

  console.log(
    `Homepage HTML updated in ${path.relative(ROOT, OUT_DIR)}/ (${imagePaths.length} images checked)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
