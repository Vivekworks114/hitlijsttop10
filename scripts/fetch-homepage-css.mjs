#!/usr/bin/env node
/**
 * Download homepage CSS assets from live hitlijsttop10.nl.
 * Run: node scripts/fetch-homepage-css.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://hitlijsttop10.nl';

const CSS_FILES = [
  {
    url: `${SITE}/wp-content/themes/hello-elementor/assets/css/reset.css?ver=3.4.4`,
    dest: 'public/css/theme/reset.css',
  },
  {
    url: `${SITE}/wp-content/themes/hello-elementor/assets/css/theme.css?ver=3.4.4`,
    dest: 'public/css/theme/theme.css',
  },
  {
    url: `${SITE}/wp-content/themes/hello-elementor/assets/css/header-footer.css?ver=3.4.4`,
    dest: 'public/css/theme/header-footer.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/css/frontend.min.css?ver=4.0.9`,
    dest: 'public/css/elementor/frontend.min.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/css/post-7.css?ver=1780672670`,
    dest: 'public/css/elementor/post-7.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/css/widget-image.min.css?ver=4.0.9`,
    dest: 'public/css/elementor/widget-image.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor-pro/assets/css/widget-nav-menu.min.css?ver=4.0.2`,
    dest: 'public/css/elementor/widget-nav-menu.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/css/widget-social-icons.min.css?ver=4.0.9`,
    dest: 'public/css/elementor/widget-social-icons.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/css/conditionals/apple-webkit.min.css?ver=4.0.9`,
    dest: 'public/css/elementor/apple-webkit.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/css/widget-divider.min.css?ver=4.0.9`,
    dest: 'public/css/elementor/widget-divider.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/css/widget-heading.min.css?ver=4.0.9`,
    dest: 'public/css/elementor/widget-heading.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/css/widget-button.min.css?ver=4.0.9`,
    dest: 'public/css/elementor/widget-button.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor-pro/assets/css/widget-posts.min.css?ver=4.0.2`,
    dest: 'public/css/elementor/widget-posts.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/lib/eicons/css/elementor-icons.min.css?ver=5.44.0`,
    dest: 'public/css/elementor/elementor-icons.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/css/widget-icon-list.min.css?ver=4.0.9`,
    dest: 'public/css/elementor/widget-icon-list.min.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/css/post-27.css?ver=1780672671`,
    dest: 'public/css/elementor/post-27.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/css/post-17.css?ver=1780672671`,
    dest: 'public/css/elementor/post-17.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/css/post-19.css?ver=1780672671`,
    dest: 'public/css/elementor/post-19.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/google-fonts/css/dmsans.css?ver=1742228722`,
    dest: 'public/css/fonts/dmsans.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/google-fonts/css/lora.css?ver=1742228722`,
    dest: 'public/css/fonts/lora.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/google-fonts/css/inter.css?ver=1742228722`,
    dest: 'public/css/fonts/inter.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/google-fonts/css/sourcesanspro.css?ver=1742228722`,
    dest: 'public/css/fonts/sourcesanspro.css',
  },
  {
    url: `${SITE}/wp-content/uploads/elementor/google-fonts/css/montserrat.css?ver=1742228722`,
    dest: 'public/css/fonts/montserrat.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/lib/font-awesome/css/fontawesome.min.css?ver=5.15.3`,
    dest: 'public/css/elementor/fontawesome.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/lib/font-awesome/css/solid.min.css?ver=5.15.3`,
    dest: 'public/css/elementor/solid.min.css',
  },
  {
    url: `${SITE}/wp-content/plugins/elementor/assets/lib/font-awesome/css/brands.min.css?ver=5.15.3`,
    dest: 'public/css/elementor/brands.min.css',
  },
];

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.text();
}

function rewriteCssUrls(content) {
  return content
    .replaceAll(SITE, '')
    .replaceAll('/wp-content/uploads/', '/uploads/')
    .replace(/url\((['"]?)(https?:\/\/[^)'"]+)(['"]?)\)/g, (match, q1, url, q2) => {
      const local = url
        .replace(SITE, '')
        .replace('/wp-content/uploads/', '/uploads/')
        .replace('/wp-content/plugins/elementor/assets/lib/eicons/fonts/', '/fonts/eicons/')
        .replace('/wp-content/plugins/elementor/assets/lib/font-awesome/webfonts/', '/fonts/fontawesome/');
      return `url(${q1}${local}${q2})`;
    })
    .replace(/url\(\.\.\/fonts\/(eicons\.[^)]+)\)/g, 'url(/fonts/eicons/$1)')
    .replace(/url\(\.\.\/webfonts\/([^)]+)\)/g, 'url(/fonts/fontawesome/$1)');
}

async function downloadFontsFromCss(cssContent) {
  const fontUrls = new Set();
  for (const match of cssContent.matchAll(/url\(['"]?([^)'"]+\.(?:woff2?|ttf|eot|svg))['"]?\)/gi)) {
    if (match[1].startsWith('/')) fontUrls.add(match[1]);
  }

  for (const fontPath of [...fontUrls].sort()) {
    const destPath = path.join(ROOT, 'public', fontPath);
    if (fs.existsSync(destPath)) continue;

    let remotePath = fontPath;
    if (fontPath.startsWith('/uploads/')) {
      remotePath = `/wp-content/uploads/${fontPath.replace('/uploads/', '')}`;
    } else if (fontPath.startsWith('/fonts/eicons/')) {
      remotePath = `/wp-content/plugins/elementor/assets/lib/eicons/fonts/${fontPath.replace('/fonts/eicons/', '')}`;
    } else if (fontPath.startsWith('/fonts/fontawesome/')) {
      remotePath = `/wp-content/plugins/elementor/assets/lib/font-awesome/webfonts/${fontPath.replace('/fonts/fontawesome/', '')}`;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const res = await fetch(`${SITE}${remotePath}`);
    if (!res.ok) {
      console.warn(`  Font download failed: ${remotePath} (${res.status})`);
      continue;
    }
    fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
    console.log(`  Font: ${fontPath}`);
  }
}

async function main() {
  console.log('Downloading homepage CSS...');
  for (const { url, dest } of CSS_FILES) {
    const destPath = path.join(ROOT, dest);
    let content = await downloadFile(url);
    content = rewriteCssUrls(content);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content);
    console.log(`  CSS: ${dest}`);

    if (
      dest.includes('fonts/') ||
      dest.includes('elementor-icons') ||
      dest.includes('fontawesome') ||
      dest.includes('brands') ||
      dest.includes('solid')
    ) {
      await downloadFontsFromCss(content);
    }
  }

  for (const cssFile of [
    'public/css/elementor/elementor-icons.min.css',
    'public/css/elementor/fontawesome.min.css',
    'public/css/elementor/solid.min.css',
    'public/css/elementor/brands.min.css',
  ]) {
    const fullPath = path.join(ROOT, cssFile);
    if (fs.existsSync(fullPath)) {
      await downloadFontsFromCss(fs.readFileSync(fullPath, 'utf8'));
    }
  }

  const eiconsCssPath = path.join(ROOT, 'public/css/elementor/elementor-icons.min.css');
  if (fs.existsSync(eiconsCssPath)) {
    await downloadFontsFromCss(fs.readFileSync(eiconsCssPath, 'utf8'));
  }

  console.log('Homepage CSS download complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
