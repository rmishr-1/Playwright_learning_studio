/**
 * Writes THIRD-PARTY-NOTICES.txt: the licence of every third-party package the app ships, from the
 * packages themselves, and notes for the parts that are not npm packages (Electron, Node.js, the
 * browsers). Generated on every build, so it follows the dependencies.
 *
 * The notes marked [REVIEW] are for Evoke's legal review before an external release.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

type Pkg = { name: string; version: string; license: string; dir: string };

const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

/** The package folder a module path is in. */
export function packageDirOf(file: string): string | null {
  const norm = file.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/node_modules/');
  if (i === -1) return null;
  const rest = norm.slice(i + '/node_modules/'.length).split('/');
  const name = rest[0].startsWith('@') ? rest[0] + '/' + rest[1] : rest[0];
  return norm.slice(0, i) + '/node_modules/' + name;
}

function readPkg(dir: string): Pkg | null {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return null;
  const p = JSON.parse(fs.readFileSync(file, 'utf-8')) as { name: string; version: string; license?: unknown };
  const license = typeof p.license === 'string' ? p.license : JSON.stringify(p.license ?? 'UNKNOWN');
  return { name: p.name, version: p.version, license, dir };
}

/** A package and the packages it depends on, found the way Node would find them. */
export function withDependencies(dirs: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...dirs];
  while (queue.length) {
    const dir = path.resolve(queue.shift()!);
    if (seen.has(dir)) continue;
    seen.add(dir);
    const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const name of Object.keys({ ...p.dependencies, ...p.optionalDependencies })) {
      let from = dir;
      for (;;) {
        const candidate = path.join(from, 'node_modules', name);
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
          queue.push(candidate);
          break;
        }
        const up = path.dirname(from);
        if (up === from) break;
        from = up;
      }
    }
  }
  return [...seen];
}

function licenceText(dir: string): string {
  const files = fs.readdirSync(dir).filter((f) => LICENCE_FILE.test(f));
  return files.map((f) => fs.readFileSync(path.join(dir, f), 'utf-8').trim()).join('\n\n');
}

const RULE = '='.repeat(78);

export function writeNotices(out: string, groups: { title: string; dirs: string[] }[], product: string): number {
  const sections: string[] = [];
  const done = new Set<string>();
  let count = 0;
  for (const group of groups) {
    const pkgs = group.dirs
      .map(readPkg)
      .filter((p): p is Pkg => p !== null)
      .filter((p) => !done.has(p.name + '@' + p.version))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!pkgs.length) continue;
    sections.push(RULE + '\n' + group.title.toUpperCase() + '\n' + RULE);
    for (const p of pkgs) {
      done.add(p.name + '@' + p.version);
      count++;
      const text = licenceText(p.dir);
      sections.push(
        '-'.repeat(78) + '\n' + p.name + ' ' + p.version + '  (' + p.license + ')\n' + '-'.repeat(78) + '\n' +
          (text || '[REVIEW] The package has no licence file; its package.json says ' + p.license + '.'),
      );
    }
  }

  const head = `${product}
THIRD-PARTY SOFTWARE NOTICES

${product} is proprietary software of Evoke Technologies. It includes the third-party software
below, each part under its own licence. Nothing in Evoke's licence agreement limits your rights
under these licences.

${RULE}
PARTS THAT ARE NOT NPM PACKAGES
${RULE}
Electron (MIT). The application runtime. Its licence is LICENSE.electron.txt, and the licences of
Chromium and the libraries it contains are LICENSES.chromium.html, both in the installation folder.

Node.js (MIT, with bundled components under their own licences), in resources/node/, runs the
learner's code. Licence: https://github.com/nodejs/node/blob/${process.version}/LICENSE
npm (Artistic-2.0), with Node.js: resources/node/node_modules/npm/LICENSE.
[REVIEW] Ship Node's LICENSE file itself in resources/node/ for an external release.

The browsers in resources/ms-playwright/, which Playwright downloads and drives, are separate
programs, unmodified from the builds Playwright publishes:
  - Chromium / Chrome for Testing (BSD-3-Clause and the licences of its components; see
    chromium_headless_shell-*/chrome-headless-shell-win64/LICENSE.headless_shell)
  - Firefox (MPL-2.0), a build with Playwright's patches. Source: https://github.com/microsoft/playwright/tree/main/browser_patches/firefox
  - WebKit (LGPL-2.1 and BSD-style licences), a build with Playwright's patches. Source:
    https://github.com/microsoft/playwright/tree/main/browser_patches/webkit
  - FFmpeg (LGPL-2.1; ffmpeg-*/COPYING.LGPLv2.1)
Evoke will provide the corresponding source of the LGPL and MPL parts on request, as those
licences require. [REVIEW] Confirm this offer and a contact address with legal.

The fonts IBM Plex Sans, IBM Plex Mono and Source Serif 4 are under the SIL Open Font License 1.1
(their packages are listed below).
`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, head + '\n' + sections.join('\n\n') + '\n');
  return count;
}
