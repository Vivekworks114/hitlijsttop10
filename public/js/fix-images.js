(function fixBrokenImages() {
  const normalize = (url) =>
    url
      .replace('https://hitlijsttop10.nl', '')
      .replace('https://www.hitlijsttop10.nl', '')
      .replace('/wp-content/uploads/', '/uploads/');

  document.querySelectorAll('img').forEach((img) => {
    const lazySrc = img.getAttribute('data-lazy-src');
    const src = img.getAttribute('src') || '';

    if (lazySrc && (!src || src.startsWith('data:image/svg'))) {
      img.setAttribute('src', normalize(lazySrc));
    }

    if (src.startsWith('data:image/svg')) {
      const noscript = img.nextElementSibling;
      if (noscript && noscript.tagName === 'NOSCRIPT') {
        const fallback = noscript.querySelector('img');
        if (fallback?.getAttribute('src')) {
          img.setAttribute('src', normalize(fallback.getAttribute('src')));
        }
      }
    }

    img.removeAttribute('data-lazy-src');
    img.removeAttribute('data-lazy-srcset');
    img.removeAttribute('data-lazy-sizes');
  });
})();
