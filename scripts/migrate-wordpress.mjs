#!/usr/bin/env node
/**
 * WordPress WXR → Astro migration script for hitlijsttop10.nl
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { parseHTML } from 'linkedom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const XML_PATH = path.join(ROOT, 'hitlijsttop10nl.WordPress.2026-07-03.xml');
const BLOG_DIR = path.join(ROOT, 'src/content/blog');
const PAGES_DIR = path.join(ROOT, 'src/pages');
const PUBLIC_UPLOADS = path.join(ROOT, 'public/uploads');
const NAV_PATH = path.join(ROOT, 'src/data/navigation.json');
const SITE_URL = 'https://hitlijsttop10.nl';

const SKIP_PAGE_SLUGS = new Set([
  'blog',
  'sitemap',
  'privacy-policy',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  isArray: (name) =>
    ['item', 'wp:author', 'wp:category', 'wp:tag', 'wp:term', 'category', 'wp:postmeta'].includes(
      name
    ),
});

function text(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (val.__cdata != null) return String(val.__cdata);
  return String(val);
}

function ensureArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function escapeYaml(str) {
  if (!str) return '""';
  const cleaned = str.replace(/\r/g, '').trim();
  if (/[:#\[\]{}|>&*!%@`"'\\]/.test(cleaned) || cleaned.includes('\n')) {
    return `"${cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return `"${cleaned.replace(/"/g, '\\"')}"`;
}

function stripWpBlocks(html) {
  return html
    .replace(/<!--\s*\/?wp:[^>]+-->/g, '')
    .replace(/\[wp_sitemap_page\]/g, '')
    .replace(/\[lmt-post-modified-info\]/g, '')
    .replace(/\[zb_mpx_category_links[^\]]*\]/g, '')
    .replace(/\[zb_mp[^\]]*\]/g, '');
}

function rewriteUrls(html) {
  return html
    .replace(/https:\/\/hitlijsttop10\.nl\/wp-content\/uploads\//g, '/uploads/')
    .replace(/https:\/\/hitlijsttop10\.nl\//g, '/')
    .replace(/srcset="[^"]*"/g, '')
    .replace(/sizes="[^"]*"/g, '')
    .replace(/loading="[^"]*"/g, '')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function sanitizeHtml(html) {
  let body = rewriteUrls(stripWpBlocks(html));
  try {
    const { document } = parseHTML(`<div id="wp-root">${body}</div>`);
    document.querySelectorAll('style, script').forEach((el) => el.remove());
    body = document.querySelector('#wp-root')?.innerHTML || body;
  } catch {
    body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  }
  return body.trim();
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function escapeMdxText(text) {
  return text
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function serializeHtmlForMdx(node) {
  if (node.nodeType === 3) return escapeMdxText(node.textContent ?? '');
  if (node.nodeType === 8) return '';
  if (node.nodeType !== 1) return '';

  const tag = node.tagName.toLowerCase();
  let attrs = '';
  for (const attr of node.attributes || []) {
    const value = attr.value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;');
    attrs += ` ${attr.name}="${value}"`;
  }

  if (VOID_TAGS.has(tag)) return `<${tag}${attrs} />`;

  let inner = '';
  for (const child of node.childNodes) {
    inner += serializeHtmlForMdx(child);
  }
  // Keep elements single-line so MDX JSX parsing stays happy.
  inner = inner.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function htmlToMdxBody(html) {
  const body = sanitizeHtml(html);
  const { document } = parseHTML(`<div id="mdx-root">${body}</div>`);
  const root = document.getElementById('mdx-root');
  const parts = [];
  for (const child of root.childNodes) {
    if (child.nodeType === 3) {
      const text = escapeMdxText(child.textContent ?? '').trim();
      if (text) parts.push(`<p>${text}</p>`);
      continue;
    }
    const serialized = serializeHtmlForMdx(child);
    if (serialized) parts.push(serialized);
  }
  return `<div class="wp-content">\n${parts.join('\n')}\n</div>`;
}

function cleanShortcodes(str) {
  return str
    .replace(/\[zb_[^\]]*\]/g, '')
    .replace(/\[magic[^\]]*\]/g, '')
    .replace(/\[wp_[^\]]*\]/g, '')
    .trim();
}

function extractDescription(excerpt, html, title) {
  const ex = cleanShortcodes(text(excerpt).trim());
  if (ex) return ex.replace(/<[^>]+>/g, '').slice(0, 300);
  const match = html.match(/<p[^>]*>(.*?)<\/p>/is);
  if (match) {
    const fromP = cleanShortcodes(match[1].replace(/<[^>]+>/g, '').trim());
    if (fromP) return fromP.slice(0, 300);
  }
  return cleanShortcodes(title) || title;
}

function getMeta(item, key) {
  const metas = ensureArray(item['wp:postmeta']);
  for (const meta of metas) {
    if (text(meta['wp:meta_key']) === key) return text(meta['wp:meta_value']);
  }
  return '';
}

function getCategories(item) {
  return ensureArray(item.category)
    .filter((c) => text(c['@_domain']) === 'category')
    .map((c) => text(c.__cdata || c).trim())
    .filter(Boolean);
}

function getTags(item) {
  return ensureArray(item.category)
    .filter((c) => text(c['@_domain']) === 'post_tag')
    .map((c) => text(c.__cdata || c).trim())
    .filter(Boolean);
}

function parseItems() {
  const xml = fs.readFileSync(XML_PATH, 'utf-8');
  const data = parser.parse(xml);
  const channel = data.rss.channel;
  const items = ensureArray(channel.item);

  const authors = {};
  for (const a of ensureArray(channel['wp:author'])) {
    authors[text(a['wp:author_login'])] =
      text(a['wp:author_display_name']) || text(a['wp:author_login']);
  }

  const byId = {};
  const attachments = {};
  const posts = [];
  const pages = [];
  const navItems = [];

  for (const item of items) {
    const id = text(item['wp:post_id']);
    const type = text(item['wp:post_type']);
    const status = text(item['wp:status']);
    const slug = text(item['wp:post_name']);
    const title = text(item.title);
    const content = text(item['content:encoded']);
    const excerpt = text(item['excerpt:encoded']);
    const link = text(item.link);
    const creator = text(item['dc:creator']);
    const postDate = text(item['wp:post_date']);
    const modified = text(item['wp:post_modified']);

    const record = {
      id,
      type,
      status,
      slug,
      title,
      content,
      excerpt,
      link,
      creator,
      postDate,
      modified,
      parent: text(item['wp:post_parent']),
      menuOrder: Number(text(item['wp:menu_order']) || 0),
      categories: getCategories(item),
      tags: getTags(item),
      thumbnailId: getMeta(item, '_thumbnail_id'),
      attachmentUrl: text(item['wp:attachment_url']),
      attachedFile: getMeta(item, '_wp_attached_file'),
      menuMeta: {},
    };

    if (type === 'nav_menu_item') {
      record.menuMeta = {
        type: getMeta(item, '_menu_item_type'),
        objectId: getMeta(item, '_menu_item_object_id'),
        object: getMeta(item, '_menu_item_object'),
        parent: getMeta(item, '_menu_item_menu_item_parent'),
        url: getMeta(item, '_menu_item_url'),
      };
      navItems.push(record);
    }

    if (type === 'attachment') {
      attachments[id] = record;
    }

    byId[id] = record;

    if (status === 'publish') {
      if (type === 'post') posts.push(record);
      if (type === 'page') pages.push(record);
    }
  }

  return { authors, byId, attachments, posts, pages, navItems };
}

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Failed to download ${url}: ${res.status}`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
  } catch (err) {
    console.warn(`Error downloading ${url}:`, err.message);
  }
}

async function downloadMedia(allRecords, attachments) {
  const urls = new Set();
  const regex = /https:\/\/hitlijsttop10\.nl\/wp-content\/uploads\/([^\s"'<>]+)/g;

  for (const record of allRecords) {
    let m;
    while ((m = regex.exec(record.content)) !== null) {
      urls.add(m[0]);
    }
  }

  for (const att of Object.values(attachments)) {
    if (att.attachmentUrl) urls.add(att.attachmentUrl);
    if (att.attachedFile) urls.add(`${SITE_URL}/wp-content/uploads/${att.attachedFile}`);
  }

  console.log(`Downloading ${urls.size} media files...`);
  let done = 0;
  const batchSize = 10;
  const urlList = [...urls];

  for (let i = 0; i < urlList.length; i += batchSize) {
    const batch = urlList.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (url) => {
        const rel = url.replace(`${SITE_URL}/wp-content/uploads/`, '');
        const dest = path.join(PUBLIC_UPLOADS, rel);
        await downloadFile(url, dest);
        done++;
      })
    );
    if (done % 50 === 0 || done === urlList.length) {
      console.log(`  ${done}/${urlList.length}`);
    }
  }
}

function resolveNavUrl(navItem, byId) {
  const { type, objectId, url } = navItem.menuMeta;
  if (type === 'custom' && url) {
    return url.replace(SITE_URL, '').replace(/\/$/, '') || '/';
  }
  if (objectId && byId[objectId]) {
    const target = byId[objectId];
    if (target.slug === 'home') return '/';
    return `/${target.slug}`;
  }
  return url ? url.replace(SITE_URL, '').replace(/\/$/, '') || '/' : '#';
}

function buildNavigation(navItems, byId) {
  const mainMenu = navItems
    .filter((n) => n.status === 'publish')
    .sort((a, b) => a.menuOrder - b.menuOrder);

  const items = mainMenu.map((n) => {
    const linked = n.menuMeta.objectId ? byId[n.menuMeta.objectId] : null;
    const label =
      n.title ||
      linked?.title ||
      resolveNavUrl(n, byId).split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ||
      'Link';
    return {
      id: n.id,
      label,
      href: resolveNavUrl(n, byId),
      parentId: n.menuMeta.parent !== '0' ? n.menuMeta.parent : null,
      order: n.menuOrder,
    };
  });

  function dedupeSiblings(nodes) {
    const seen = new Set();
    return nodes.filter((node) => {
      if (seen.has(node.href)) return false;
      seen.add(node.href);
      return true;
    });
  }

  function buildTree(parentId = null) {
    return dedupeSiblings(
      items
        .filter((i) => i.parentId === parentId)
        .sort((a, b) => a.order - b.order)
        .map((i) => ({
          label: i.label,
          href: i.href,
          children: buildTree(i.id),
        }))
    );
  }

  return buildTree(null);
}

function buildFooterNav(pages) {
  const useful = pages.filter((p) =>
    ['over-ons', 'blog', 'contact', 'sitemap', 'bekendheden'].includes(p.slug)
  );
  return useful.map((p) => ({
    label: p.title || p.slug,
    href: p.slug === 'home' ? '/' : p.slug === 'blog' ? '/blog' : `/${p.slug}`,
  }));
}

function writeBlogPost(post, authors, attachments) {
  const slug = post.slug;
  if (!slug) return;

  const body = htmlToMdxBody(post.content);
  const description = extractDescription(post.excerpt, post.content, post.title);
  const author = authors[post.creator] || post.creator || 'admin';
  const categories = post.categories.length ? post.categories : ['Blog'];
  const tags = post.tags;

  let featuredImage = '';
  if (post.thumbnailId && attachments[post.thumbnailId]) {
    const att = attachments[post.thumbnailId];
    const file =
      att.attachedFile || att.attachmentUrl?.replace(`${SITE_URL}/wp-content/uploads/`, '');
    if (file) featuredImage = `/uploads/${file.replace(/^\/+/, '')}`;
  }

  const frontmatter = [
    '---',
    `title: ${escapeYaml(post.title)}`,
    `description: ${escapeYaml(description)}`,
    `pubDate: ${post.postDate.split(' ')[0]}`,
    post.modified !== post.postDate ? `updatedDate: ${post.modified.split(' ')[0]}` : null,
    `author: ${escapeYaml(author)}`,
    `categories:`,
    ...categories.map((c) => `  - ${escapeYaml(c)}`),
    tags.length ? `tags:` : `tags: []`,
    ...tags.map((t) => `  - ${escapeYaml(t)}`),
    featuredImage ? `featuredImage: ${escapeYaml(featuredImage)}` : null,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  fs.writeFileSync(path.join(BLOG_DIR, `${slug}.mdx`), `${frontmatter}\n\n${body}\n`);
}

function writePage(page) {
  const slug = page.slug;
  if (!slug || SKIP_PAGE_SLUGS.has(slug)) return;

  const body = sanitizeHtml(page.content);
  const title = page.title || slug;
  const description = extractDescription(page.excerpt, page.content, title);

  const file = `---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title={${JSON.stringify(title)}} description={${JSON.stringify(description)}}>
  <article class="page-content" set:html={${JSON.stringify(body)}} />
</BaseLayout>
`;

  if (slug === 'home') {
    fs.writeFileSync(path.join(PAGES_DIR, 'index.astro'), file);
    return;
  }

  fs.writeFileSync(path.join(PAGES_DIR, `${slug}.astro`), file);
}

function writeSitemapPage(pages, posts) {
  const pageLinks = pages
    .filter((p) => p.slug && !SKIP_PAGE_SLUGS.has(p.slug))
    .map((p) => ({
      label: p.title || p.slug,
      href: p.slug === 'home' ? '/' : p.slug === 'blog' ? '/blog' : `/${p.slug}`,
    }));

  const postLinks = posts.map((p) => ({
    label: p.title,
    href: `/${p.slug}`,
  }));

  const file = `---
import BaseLayout from '../layouts/BaseLayout.astro';

const pages = ${JSON.stringify(pageLinks, null, 2)};
const posts = ${JSON.stringify(postLinks, null, 2)};
---

<BaseLayout title="Sitemap" description="Overzicht van alle pagina's en blogartikelen op hitlijsttop10.nl">
  <article class="page-content">
    <h1>Sitemap</h1>
    <h2>Pagina's</h2>
    <ul>
      {pages.map((page) => (
        <li><a href={page.href}>{page.label}</a></li>
      ))}
    </ul>
    <h2>Blogartikelen</h2>
    <ul>
      {posts.map((post) => (
        <li><a href={post.href}>{post.label}</a></li>
      ))}
    </ul>
  </article>
</BaseLayout>
`;
  fs.writeFileSync(path.join(PAGES_DIR, 'sitemap.astro'), file);
}

async function main() {
  console.log('Parsing WordPress export...');
  const { authors, byId, attachments, posts, pages, navItems } = parseItems();

  console.log(
    `Found ${posts.length} posts, ${pages.length} pages, ${Object.keys(attachments).length} attachments`
  );

  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(NAV_PATH), { recursive: true });

  const allRecords = [...posts, ...pages];
  await downloadMedia(allRecords, attachments);

  console.log('Writing blog posts...');
  for (const post of posts) {
    writeBlogPost(post, authors, attachments);
  }

  console.log('Writing pages...');
  for (const page of pages) {
    writePage(page);
  }
  writeSitemapPage(pages, posts);

  const headerNav = buildNavigation(navItems, byId);
  const footerNav = buildFooterNav(pages);

  fs.writeFileSync(
    NAV_PATH,
    JSON.stringify({ header: headerNav, footer: footerNav }, null, 2)
  );

  console.log('Migration complete!');
  console.log(`  Blog posts: ${posts.length}`);
  console.log(`  Pages: ${pages.length}`);
  console.log(`  Nav items: ${headerNav.length} top-level`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
