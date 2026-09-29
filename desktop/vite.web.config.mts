/**
 * Builds Option C (frontend-c/) for the desktop app, without changing frontend-c itself:
 *
 *   - the fonts come from the app (src/web/fonts.ts), not from Google Fonts, so it works offline
 *   - the page is titled, and names itself, with the variant's name (STUDIO_PRODUCT)
 *   - in a release build, the studio's own modules (frontend-c/src, shared/) are obfuscated before
 *     they are bundled; the third-party packages are left as they are
 *
 * Run by scripts/build.ts, which sets STUDIO_WEB_OUT, STUDIO_RELEASE and STUDIO_BANNER.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import JavaScriptObfuscator from 'javascript-obfuscator';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'frontend-c');
const ours = [path.resolve(here, '..', 'frontend-c', 'src'), path.resolve(here, '..', 'shared')].map((p) =>
  p.split(path.sep).join('/'),
);
const release = process.env.STUDIO_RELEASE === '1';
/** The variant's name (desktop/variants.json), which scripts/build.ts passes in. */
const product = process.env.STUDIO_PRODUCT || 'Evoke Training Studio';

function offline(): Plugin {
  const fonts = path.join(here, 'src', 'web', 'fonts.ts').split(path.sep).join('/');
  return {
    name: 'studio-offline',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, '')
        .replace(/\s*<link\s+href="https:\/\/fonts\.googleapis\.com[\s\S]*?\/>/g, '')
        .replace(/<title>[^<]*<\/title>/, '<title>' + product + '</title>');
    },
    transform(code, id) {
      if (id.split('?')[0].replace(/\\/g, '/').endsWith('/frontend-c/src/main.tsx')) {
        return { code: 'import ' + JSON.stringify(fonts) + ';\n' + code, map: null };
      }
      return null;
    },
  };
}

function protect(): Plugin {
  return {
    name: 'studio-protect',
    enforce: 'post',
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/');
      if (!release || !/\.(t|j)sx?$/.test(file) || !ours.some((p) => file.startsWith(p + '/'))) return null;
      const out = JavaScriptObfuscator.obfuscate(code, {
        target: 'browser',
        sourceType: 'module',
        compact: true,
        identifierNamesGenerator: 'hexadecimal',
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        stringArrayWrappersCount: 1,
        splitStrings: false,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        selfDefending: false,
        renameGlobals: false,
        transformObjectKeys: false,
        ignoreImports: true,
        sourceMap: false,
      });
      return { code: out.getObfuscatedCode(), map: null };
    },
  };
}

/** Lists the third-party files the page bundles, for the notices (scripts/notices.ts). */
function packages(): Plugin {
  const files = new Set<string>();
  return {
    name: 'studio-packages',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of Object.keys(chunk.modules)) if (id.includes('node_modules')) files.add(id.split('?')[0].replace(/^\0/, ''));
      }
      // Fonts and other assets are not modules of a chunk.
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset') for (const name of asset.originalFileNames ?? []) if (name.includes('node_modules')) files.add(name);
      }
      if (process.env.STUDIO_WEB_PACKAGES) fs.writeFileSync(process.env.STUDIO_WEB_PACKAGES, JSON.stringify([...files]));
    },
  };
}

export default defineConfig({
  root,
  base: '/',
  logLevel: 'warn',
  plugins: [react(), offline(), protect(), packages()],
  // The page shows the variant's name (frontend-c/src/product.ts).
  define: { __STUDIO_PRODUCT__: JSON.stringify(product) },
  resolve: {
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language', 'codemirror'],
  },
  build: {
    outDir: process.env.STUDIO_WEB_OUT,
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: { banner: process.env.STUDIO_BANNER ?? '' },
    },
  },
});
