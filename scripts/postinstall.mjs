import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const astroCli = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../node_modules/astro/astro.js'
);

if (fs.existsSync(astroCli)) {
  let content = fs.readFileSync(astroCli, 'utf8');
  if (content.includes("const engines = '>=18.20.8'")) {
    content = content.replace("const engines = '>=18.20.8'", "const engines = '>=18.19.0'");
    fs.writeFileSync(astroCli, content);
    console.log('Patched Astro Node.js engine check for local compatibility.');
  }
}
