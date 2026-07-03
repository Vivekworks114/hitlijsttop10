#!/usr/bin/env node
/**
 * Download CSS assets required by vermogen/content pages.
 * Run: node scripts/fetch-content-pages-css.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://hitlijsttop10.nl';

const WIDGET_CSS = [
  '/wp-content/plugins/elementor-pro/assets/css/widget-table-of-contents.min.css?ver=4.0.2',
  '/wp-content/plugins/elementor/assets/css/widget-accordion.min.css?ver=4.0.9',
  '/wp-content/plugins/elementor/assets/css/widget-spacer.min.css?ver=4.0.9',
  '/wp-content/plugins/elementor/assets/css/widget-text-editor.min.css?ver=4.0.9',
  '/wp-content/plugins/elementor-pro/assets/css/widget-breadcrumbs.min.css?ver=4.0.2',
  '/wp-content/plugins/elementor-pro/assets/css/widget-post-info.min.css?ver=4.0.2',
  '/wp-content/plugins/elementor/assets/lib/font-awesome/css/regular.min.css?ver=5.15.3',
  '/wp-content/uploads/elementor/css/post-237.css?ver=1780672671',
  '/wp-content/uploads/elementor/css/post-553.css?ver=1780672671',
  '/wp-content/uploads/elementor/css/post-262.css?ver=1780672671',
  '/wp-content/uploads/elementor/css/post-1114.css?ver=1780672671',
];

function mapDest(remotePath) {
  const clean = remotePath.split('?')[0];
  if (clean.includes('/uploads/elementor/css/post-')) {
    return `public/css/elementor/${path.basename(clean)}`;
  }
  if (clean.includes('/plugins/')) {
    return `public/css/elementor/${path.basename(clean)}`;
  }
  return null;
}

function rewriteCssUrls(content) {
  return content
    .replaceAll(SITE, '')
    .replaceAll('/wp-content/uploads/', '/uploads/');
}

async function downloadCss(remotePath) {
  const destRel = mapDest(remotePath);
  if (!destRel) return;

  const destPath = path.join(ROOT, destRel);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const res = await fetch(`${SITE}${remotePath}`);
  if (!res.ok) {
    console.warn(`  Failed ${remotePath}: ${res.status}`);
    return;
  }

  let content = await res.text();
  content = rewriteCssUrls(content);
  fs.writeFileSync(destPath, content);
  console.log(`  CSS: ${destRel}`);
}

async function main() {
  const postCssPath = path.join(ROOT, 'src/data/content-pages/post-css.json');
  const extra = fs.existsSync(postCssPath)
    ? JSON.parse(fs.readFileSync(postCssPath, 'utf8'))
    : [];

  console.log('Downloading content page CSS...');
  for (const remotePath of WIDGET_CSS) {
    await downloadCss(remotePath);
  }

  for (const file of extra) {
    if (file === 'post-237.css' || file === 'post-553.css') continue;
    await downloadCss(`/wp-content/uploads/elementor/css/${file}?ver=1780672671`);
  }

  console.log('Content page CSS download complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
