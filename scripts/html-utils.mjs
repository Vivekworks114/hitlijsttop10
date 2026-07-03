export const SITE = 'https://hitlijsttop10.nl';

export function normalizeUploadUrl(url) {
  return url
    .replaceAll(SITE, '')
    .replaceAll('https://www.hitlijsttop10.nl', '')
    .replaceAll('/wp-content/uploads/', '/uploads/');
}

function fixImgTag(attrs) {
  const lazySrc = attrs.match(/\sdata-lazy-src="([^"]+)"/)?.[1];
  const currentSrc = attrs.match(/\ssrc="([^"]*)"/)?.[1];
  let newAttrs = attrs;

  if (lazySrc) {
    const url = normalizeUploadUrl(lazySrc);
    if (!currentSrc || currentSrc.startsWith('data:image/svg')) {
      if (/\ssrc="/.test(newAttrs)) {
        newAttrs = newAttrs.replace(/\ssrc="[^"]*"/, ` src="${url}"`);
      } else {
        newAttrs = ` src="${url}"${newAttrs}`;
      }
    }
  }

  return newAttrs
    .replace(/\sdata-lazy-src="[^"]+"/g, '')
    .replace(/\sdata-lazy-srcset="[^"]+"/g, '')
    .replace(/\sdata-lazy-sizes="[^"]+"/g, '');
}

export function fixLazyImages(html) {
  return html.replace(/<img\b([^>]*)>/gi, (match, attrs) => `<img${fixImgTag(attrs)}>`);
}

export function rewriteHtml(content) {
  let result = content
    .replaceAll(SITE, '')
    .replaceAll('https://www.hitlijsttop10.nl', '')
    .replaceAll('/wp-content/uploads/', '/uploads/')
    .replace(/href=""/g, 'href="/"')
    .replace(/action=""/g, 'action="/"')
    .replace(/\sfetchpriority="[^"]*"/g, '')
    .replace(/\sdecoding="[^"]*"/g, '')
    .replace(/\sloading="[^"]*"/g, '')
    .replace(/\ssrcset="[^"]*"/g, '')
    .replace(/\ssizes="[^"]*"/g, '')
    .replace(/\sdata-rocket-location-hash="[^"]*"/g, '');

  result = fixLazyImages(result);

  result = result.replace(
    /src="data:image\/svg\+xml[^"]*"/g,
    (match, offset, str) => {
      const noscript = str.slice(offset).match(/<noscript>[\s\S]*?src="([^"]+)"[\s\S]*?<\/noscript>/);
      return noscript ? `src="${normalizeUploadUrl(noscript[1])}"` : match;
    }
  );

  result = result.replace(/<noscript><img[^>]*><\/noscript>/g, '');

  result = result.replace(
    /(<div\s+)data-elementor-type="wp-page"/,
    '$1id="content" data-elementor-type="wp-page"'
  );

  if (result.includes('wsp-posts-list')) {
    result = result
      .replaceAll('href="/category/blog/"', 'href="/blog/"')
      .replaceAll('href="/2023/03/03/"', 'href="/blog/"');
  }

  return result;
}

export function collectUploadPaths(...contents) {
  const paths = new Set();
  for (const content of contents) {
    for (const match of content.matchAll(/\/uploads\/[^\s"'<>]+/g)) {
      paths.add(match[0].split('?')[0]);
    }
  }
  return [...paths];
}
