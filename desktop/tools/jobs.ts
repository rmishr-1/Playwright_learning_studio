/**
 * The jobs the Studio Tools window offers: every double-click .bat in the studio folder and in
 * desktop/, plus the npm commands that have no .bat. Pure data, shared by the main process (which
 * runs them) and the page (which lists them). Nothing here touches the disk.
 *
 * A job's `args` turns the form into the command line the .bat (or npm script) gets. A .bat asks
 * in the terminal for anything the form left blank, exactly as it does when double-clicked.
 */
import type { Form } from './bridge-types';
import type { Status } from './status-types';

export type Group = 'computer' | 'licences' | 'build' | 'publish' | 'source';

export const GROUPS: { id: Group; title: string; blurb: string }[] = [
  { id: 'computer', title: 'This computer', blurb: 'Once, on a computer that builds the apps or issues licences.' },
  { id: 'licences', title: 'Customers and licences', blurb: 'Who may open the studio. Needs the signing key.' },
  { id: 'build', title: 'Build an installer', blurb: 'What a customer installs. Needed only for launcher changes, or a new customer.' },
  { id: 'publish', title: 'Publish an update', blurb: 'Reaches every installed copy at its next start. No new installer.' },
  { id: 'source', title: 'Source code', blurb: 'Run the studio from source, and sync with GitHub.' },
];

export type Need = 'packages' | 'key' | 'passphrase' | 'internet' | 'git' | 'licence';

export const NEEDS: Record<Need, string> = {
  packages: 'the packages installed (Set up)',
  key: "Evoke's signing key on this computer",
  passphrase: "the key's passphrase (typed in the terminal)",
  internet: 'the internet',
  git: 'git, signed in to GitHub',
  licence: "the customer's licence in desktop/licences/",
};

export type Option = { value: string; label: string };

export type Field = { key: string; label: string; hint?: string } & (
  | { kind: 'select'; from: 'apps' }
  | { kind: 'radio'; options: Option[]; byDefault: string }
  | { kind: 'check' }
  | { kind: 'text'; pattern?: string; placeholder?: string; required?: boolean }
  | { kind: 'file'; mode: 'open' | 'save'; filters: { name: string; extensions: string[] }[]; defaultName?: string; required?: boolean }
);

/** A .bat, by its path from the studio folder; or an npm script in desktop/. */
export type Command = { kind: 'bat'; file: string } | { kind: 'npm'; script: string };

export type Then = { job?: string; note: string; form?: Form };

export type Job = {
  id: string;
  group: Group;
  title: string;
  summary: string;
  needs: Need[];
  produces: string;
  then: Then[];
  command: Command;
  fields: Field[];
  args: (form: Form) => string[];
  /** Why the job cannot run now, from the status; null when it can. */
  disabledWhen?: (s: Status) => string | null;
};

const str = (form: Form, key: string): string => (typeof form[key] === 'string' ? (form[key] as string).trim() : '');
const on = (form: Form, key: string): boolean => form[key] === true;
const flag = (form: Form, key: string, arg: string): string[] => (on(form, key) ? [arg] : []);
const opt = (form: Form, key: string, arg: string): string[] => (str(form, key) ? [arg, str(form, key)] : []);

const BUILD_FIELDS: Field[] = [
  { key: 'kind', label: 'Kind', kind: 'radio', byDefault: 'standard', options: [
    { value: 'standard', label: 'Standard: about 100 MB; its first start downloads Node and the browsers' },
    { value: 'full', label: 'Full: about 490 MB; carries them, for a network that blocks those downloads' },
  ] },
  { key: 'shape', label: 'As', kind: 'radio', byDefault: 'installer', options: [
    { value: 'installer', label: 'An installer (Setup.exe)' },
    { value: 'zip', label: 'A zip, with an Uninstall.bat inside' },
  ] },
  { key: 'unsigned', label: 'Build it unsigned', kind: 'check', hint: 'Without this, and with no code-signing certificate set up, the terminal asks "Build it unsigned? [y/N]".' },
];

const buildArgs = (form: Form): string[] => [
  ...(str(form, 'kind') === 'full' ? ['--full'] : []),
  ...(str(form, 'shape') === 'zip' ? ['--zip'] : []),
  ...flag(form, 'unsigned', '--unsigned'),
];

export const JOBS: Job[] = [
  // ------------------------------------------------------------------ this computer
  {
    id: 'setup',
    group: 'computer',
    title: 'Set up',
    summary: 'Installs the packages and the browsers, and builds the course from Data/Source. Run it first on a new computer, and after a pull that changed the packages.',
    needs: ['internet'],
    produces: 'node_modules, the browsers, Data/Config/studio.config.json and Data/Content.',
    then: [{ job: 'launcher', note: 'Run the studio from source to check it.' }],
    command: { kind: 'bat', file: 'setup.bat' },
    fields: [],
    args: () => ['/nopause'],
  },
  {
    id: 'keygen',
    group: 'computer',
    title: 'Create the signing key',
    summary: "Makes Evoke's licence signing key, once. Every licence and every published release is signed with it. It is kept encrypted for your Windows account in %USERPROFILE%\\.evoke-studio, never in git.",
    needs: ['packages'],
    produces: 'The private key beside your profile, and desktop/src/licence-public.pem (commit it).',
    then: [
      { job: 'passphrase', note: 'Set a passphrase on it: publishing the studio code requires one.' },
      { job: 'backup-key', note: 'Back it up somewhere safe. Without the key, no licence can ever be issued again.' },
    ],
    command: { kind: 'npm', script: 'licence:keygen' },
    fields: [],
    args: () => [],
    disabledWhen: (s) => (s.key.present ? 'A signing key already exists on this computer. To use another one, restore it from a backup instead.' : null),
  },
  {
    id: 'passphrase',
    group: 'computer',
    title: "Set the key's passphrase",
    summary: 'Adds a passphrase to the signing key (or changes it). Jobs that use the key then ask for it in the terminal. Publishing the studio code requires one.',
    needs: ['key'],
    produces: 'The key, re-encrypted with the passphrase.',
    then: [{ job: 'backup-key', note: 'Make a fresh backup: the old one does not have the new passphrase.' }],
    command: { kind: 'npm', script: 'licence:set-passphrase' },
    fields: [],
    args: () => [],
    disabledWhen: (s) => (s.key.present ? null : 'There is no signing key on this computer yet.'),
  },
  {
    id: 'backup-key',
    group: 'computer',
    title: 'Back up the key',
    summary: 'Writes the signing key to a .backup file, encrypted with a passphrase you choose in the terminal. Keep it outside the repository, somewhere safe.',
    needs: ['key'],
    produces: 'The .backup file you name.',
    then: [],
    command: { kind: 'npm', script: 'licence:backup-key' },
    fields: [{ key: 'file', label: 'Backup file', kind: 'file', mode: 'save', filters: [{ name: 'Key backup', extensions: ['backup'] }], defaultName: 'evoke-studio-key.backup', required: true, hint: 'It must end in .backup and must not be inside a git repository.' }],
    args: (form) => [str(form, 'file')],
    disabledWhen: (s) => (s.key.present ? null : 'There is no signing key on this computer yet.'),
  },
  {
    id: 'restore-key',
    group: 'computer',
    title: 'Restore the key',
    summary: 'Puts the signing key on this computer from a .backup file. The terminal asks for the passphrase of the backup.',
    needs: ['packages'],
    produces: 'The private key beside your profile.',
    then: [{ job: 'backup-key', note: 'Make a backup of your own on this computer too.' }],
    command: { kind: 'npm', script: 'licence:restore-key' },
    fields: [{ key: 'file', label: 'Backup file', kind: 'file', mode: 'open', filters: [{ name: 'Key backup', extensions: ['backup'] }], required: true }],
    args: (form) => [str(form, 'file')],
    disabledWhen: (s) => (s.key.present ? 'A signing key already exists on this computer.' : null),
  },
  {
    id: 'setup-kit',
    group: 'computer',
    title: 'Make a setup kit',
    summary: 'Bundles the signing key, the record of issued licences and every licence file into Evoke-Studio-Setup-Kit.exe on your desktop, encrypted with a passphrase you choose. Run the .exe on another computer (with the studio set up) to let it build apps and issue licences too.',
    needs: ['key'],
    produces: '%USERPROFILE%\\Desktop\\Evoke-Studio-Setup-Kit.exe. Send the passphrase another way; delete the kit once used.',
    then: [],
    command: { kind: 'bat', file: 'desktop/make-setup-kit.bat' },
    fields: [],
    args: () => [],
    disabledWhen: (s) => (s.key.present ? null : 'There is no signing key on this computer yet.'),
  },

  // ------------------------------------------------------------------ customers and licences
  {
    id: 'new-customer',
    group: 'licences',
    title: 'New customer',
    summary: 'Issues the customer\'s licence, adds their app ("Evoke Training Studio <code>") to variants.json, and builds its installer: about 10 minutes. Anything left blank below is asked in the terminal.',
    needs: ['key', 'internet'],
    produces: 'desktop/licences/<id>-<customer>.lic, a new entry in variants.json, and desktop/deliveries/<code>/ with the installer, licence, READ ME FIRST and SHA256SUMS, ready to send.',
    then: [
      { job: 'git-sync', note: 'Commit variants.json, so other computers know the app.' },
      { job: 'publish-access', note: 'Publish access, so the new licence opens the course.', form: { mode: '1' } },
    ],
    command: { kind: 'bat', file: 'desktop/new-customer.bat' },
    fields: [
      { key: 'code', label: 'Short code', kind: 'text', pattern: '^[A-Z0-9]{2,8}$', placeholder: 'BU', hint: '2 to 8 capital letters or digits; it names their app.' },
      { key: 'licensee', label: 'Customer', kind: 'text', placeholder: 'Boston University', pattern: "^[^\"%!^&|<>]{0,120}$" },
      { key: 'email', label: 'Email (optional)', kind: 'text', pattern: '^[^\\s"%!^&|<>]{0,120}$' },
      { key: 'expires', label: 'Expiry (optional)', kind: 'text', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$', placeholder: 'YYYY-MM-DD' },
      { key: 'machine', label: 'Machine code (optional)', kind: 'text', pattern: '^([0-9A-F]{4}(-[0-9A-F]{4}){3})?$', placeholder: 'F69F-0B82-DEB0-AA87', hint: 'Locks the licence to one computer: the code the launch window shows there.' },
      { key: 'logo', label: 'Logo (optional)', kind: 'file', mode: 'open', filters: [{ name: 'PNG or JPEG', extensions: ['png', 'jpg', 'jpeg'] }] },
      ...BUILD_FIELDS,
    ],
    args: (form) => [
      ...opt(form, 'code', '--code'),
      ...opt(form, 'licensee', '--licensee'),
      ...opt(form, 'email', '--email'),
      ...opt(form, 'expires', '--expires'),
      ...opt(form, 'machine', '--machine'),
      ...opt(form, 'logo', '--logo'),
      ...buildArgs(form),
    ],
    disabledWhen: (s) => (s.key.present ? null : 'There is no signing key on this computer: licences can only be issued where it is.'),
  },
  {
    id: 'issue-licence',
    group: 'licences',
    title: 'Issue or reissue a licence',
    summary: 'A new licence for a person or team at Evoke (it opens the internal app), or a reissue of a licence already issued: a new end date, computer or logo, keeping its ID. The terminal asks for each detail.',
    needs: ['key'],
    produces: 'A .lic file in desktop/licences/, and the record beside the key brought up to date. A reissue also updates revoked.json.',
    then: [
      { job: 'publish-access', note: 'Publish access, so the licence opens the course.', form: { mode: '1' } },
      { job: 'git-sync', note: 'After a reissue, commit revoked.json.' },
    ],
    command: { kind: 'bat', file: 'desktop/issue-licence.bat' },
    fields: [],
    args: () => [],
    disabledWhen: (s) => (s.key.present ? null : 'There is no signing key on this computer: licences can only be issued where it is.'),
  },
  {
    id: 'revoke-licence',
    group: 'licences',
    title: 'Revoke a licence',
    summary: 'Lists the licences and adds the one you choose to revoked.json, with a reason (a few plain words, never a name).',
    needs: ['packages'],
    produces: 'desktop/revoked.json, updated.',
    then: [
      { job: 'git-sync', note: 'Commit revoked.json.' },
      { job: 'publish-access', note: 'Publish access with new keys, so the licence opens nothing from now on.', form: { mode: '2' } },
    ],
    command: { kind: 'bat', file: 'desktop/revoke-licence.bat' },
    fields: [],
    args: () => [],
  },
  {
    id: 'publish-access',
    group: 'licences',
    title: 'Publish access',
    summary: 'Republishes who may open the course and the studio code, without changing either. After a licence is issued or reissued; or, with new keys, after one is withdrawn.',
    needs: ['key', 'git', 'internet'],
    produces: 'New access lists in both distribution repositories on GitHub.',
    then: [],
    command: { kind: 'bat', file: 'desktop/publish-access.bat' },
    fields: [{ key: 'mode', label: 'Because', kind: 'radio', byDefault: '1', options: [
      { value: '1', label: 'A licence was issued or reissued: give it access' },
      { value: '2', label: 'A licence was withdrawn: new keys, so it opens nothing from now on' },
    ] }],
    args: (form) => [str(form, 'mode') || '1'],
    disabledWhen: (s) => (s.key.present ? null : 'There is no signing key on this computer.'),
  },

  // ------------------------------------------------------------------ build
  {
    id: 'build-app',
    group: 'build',
    title: 'Build an installer',
    summary: 'Builds one of the apps in variants.json. Needed when the launcher changed (its wording, Electron, Node, the browsers, Playwright), or for a customer\'s first installer. A change to the course or to the studio code is published instead, with no new installer.',
    needs: ['key', 'internet'],
    produces: 'desktop/deliveries/<code>/ (a full build: <code>-full/) with the installer or zip, the licence, READ ME FIRST and SHA256SUMS, ready to send.',
    then: [{ note: 'Send what is in deliveries/<code>/ to the customer. Their progress and licence survive the reinstall.' }],
    command: { kind: 'bat', file: 'desktop/build-app.bat' },
    fields: [{ key: 'app', label: 'App', kind: 'select', from: 'apps' }, ...BUILD_FIELDS],
    args: (form) => [str(form, 'app'), ...buildArgs(form)],
    disabledWhen: (s) => (s.key.present ? null : 'There is no signing key on this computer: a release build is made only where it is.'),
  },

  // ------------------------------------------------------------------ publish
  {
    id: 'publish-course',
    group: 'publish',
    title: 'Publish the course',
    summary: 'Builds the course from Data/Source, encrypts it for every valid licence, and pushes it to the course repository. Every installed copy gets it at its next start; a day that changed is tagged on its card.',
    needs: ['key', 'git', 'internet'],
    produces: 'A new course release on GitHub.',
    then: [],
    command: { kind: 'bat', file: 'desktop/publish-course.bat' },
    fields: [],
    args: () => [],
    disabledWhen: (s) => (s.key.present ? null : 'There is no signing key on this computer.'),
  },
  {
    id: 'publish-app',
    group: 'publish',
    title: 'Publish the studio code',
    summary: "Builds the studio's backend and page, encrypts them, and pushes them to the app repository. Every installed copy runs the new code from its next start: a feature or a fix needs no new installer.",
    needs: ['key', 'passphrase', 'git', 'internet'],
    produces: 'A new studio release on GitHub.',
    then: [],
    command: { kind: 'bat', file: 'desktop/publish-app.bat' },
    fields: [],
    args: () => [],
    disabledWhen: (s) => (!s.key.present ? 'There is no signing key on this computer.' : !s.key.passphrase ? "The key has no passphrase, and publishing the studio code requires one: set one first." : null),
  },

  // ------------------------------------------------------------------ source
  {
    id: 'launcher',
    group: 'source',
    title: 'Run the studio from source',
    summary: 'Starts the backend and the page in their own windows and opens the browser. For working on the studio; a customer uses the installed app instead.',
    needs: ['packages'],
    produces: 'The studio at http://127.0.0.1:5185.',
    then: [],
    command: { kind: 'bat', file: 'launcher.bat' },
    fields: [],
    args: () => [],
  },
  {
    id: 'git-sync',
    group: 'source',
    title: 'Sync with GitHub',
    summary: 'For the repository owner: commits every local change, merges what is on GitHub, and pushes main. Licence files, keys and deliveries are blocked from the commit. It asks before committing.',
    needs: ['git', 'internet'],
    produces: 'main on GitHub brought up to date.',
    then: [],
    command: { kind: 'bat', file: 'git-sync.bat' },
    fields: [],
    args: () => [],
  },
  {
    id: 'collab-pull',
    group: 'source',
    title: 'Collaborator: pull',
    summary: "For a collaborator: brings your branch up to date with GitHub and with main. It refuses to run over uncommitted changes unless they are stashed.",
    needs: ['git', 'internet'],
    produces: 'Your local branch, updated.',
    then: [],
    command: { kind: 'bat', file: 'collab-pull.bat' },
    fields: [{ key: 'stash', label: 'Stash uncommitted changes first, and restore them after', kind: 'check' }],
    args: (form) => flag(form, 'stash', '/stash'),
  },
  {
    id: 'collab-push',
    group: 'source',
    title: 'Collaborator: push',
    summary: 'For a collaborator: commits your work to your own branch, pushes it, and prints the link to open a pull request. It never pushes to main.',
    needs: ['git', 'internet'],
    produces: 'Your branch on GitHub, and a pull-request link.',
    then: [],
    command: { kind: 'bat', file: 'collab-push.bat' },
    fields: [
      { key: 'message', label: 'Commit message (optional)', kind: 'text', pattern: "^[A-Za-z0-9 ,.;:()'_-]{0,120}$", placeholder: 'Work in progress' },
      { key: 'branch', label: 'Branch (optional)', kind: 'text', pattern: '^[A-Za-z0-9._/-]{0,60}$', hint: 'Blank: your current branch, or <your-name>/work from main.' },
    ],
    args: (form) => [...(str(form, 'message') ? [str(form, 'message')] : []), ...opt(form, 'branch', '/branch')],
  },
];

export const jobById = (id: string): Job | undefined => JOBS.find((j) => j.id === id);
