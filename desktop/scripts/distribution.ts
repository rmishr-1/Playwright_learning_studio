/**
 * Where the studio is published: two public GitHub repositories, named in desktop/distribution.json
 * (committed), which every launcher has built into it.
 *
 *   content   the course:  latest.json, blobs/<sha256>.bin
 *   app       the studio's code (backend and page):  channels/api-<LAUNCHER_API>/latest.json, blobs/...
 *
 * Everything in them is encrypted and signed (src/release-format.ts), so they can be public: the
 * launcher needs no GitHub account or token, and a learner's computer only ever reads
 * https://raw.githubusercontent.com/<owner>/<repo>/main/<path>. Only the publisher (publish.ts)
 * clones them.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const DESKTOP = path.resolve(__dirname, '..');
export const DISTRIBUTION_FILE = path.join(DESKTOP, 'distribution.json');

export type Repo = { owner: string; repo: string };
export type Distribution = { content: Repo; app: Repo };

// GitHub's own rules for user/organisation and repository names.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

function repo(value: unknown, which: string): Repo | null {
  if (value === null || value === undefined) return null;
  const r = value as Partial<Repo>;
  if (typeof r !== 'object' || typeof r.owner !== 'string' || typeof r.repo !== 'string' || !OWNER.test(r.owner) || !REPO.test(r.repo) || /^\.+$/.test(r.repo)) {
    throw new Error('distribution.json: "' + which + '" must be { "owner": "<GitHub user or organisation>", "repo": "<repository>" }, or null.');
  }
  return { owner: r.owner, repo: r.repo };
}

/** The repositories as they are named now; either may still be null. */
export function readDistribution(): { content: Repo | null; app: Repo | null } {
  const raw = JSON.parse(fs.readFileSync(DISTRIBUTION_FILE, 'utf-8')) as Record<string, unknown>;
  const d = { content: repo(raw.content, 'content'), app: repo(raw.app, 'app') };
  if (d.content && d.app && d.content.owner.toLowerCase() === d.app.owner.toLowerCase() && d.content.repo.toLowerCase() === d.app.repo.toLowerCase()) {
    throw new Error('distribution.json: the course and the app need a repository each.');
  }
  return d;
}

/** Both repositories, for a release or a publish; a clear error while one is not named yet. */
export function distribution(): Distribution {
  const d = readDistribution();
  if (!d.content || !d.app) {
    throw new Error(
      'desktop/distribution.json does not name the ' + (!d.content ? 'course' : 'app') + "'s repository yet. Create two public GitHub " +
        'repositories (one for the course, one for the app), then set "content" and "app" to { "owner": ..., "repo": ... }.',
    );
  }
  return { content: d.content, app: d.app };
}

/** Where a learner's computer reads a repository's files. */
export const rawBase = (r: Repo): string => 'https://raw.githubusercontent.com/' + r.owner + '/' + r.repo + '/main/';

/** Where the publisher clones it. */
export const cloneUrl = (r: Repo): string => 'https://github.com/' + r.owner + '/' + r.repo + '.git';
