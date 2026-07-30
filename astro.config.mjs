import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default defineConfig({
  site: 'https://hitlijsttop10.nl',
  integrations: [mdx()],
});
