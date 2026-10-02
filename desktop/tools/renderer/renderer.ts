/**
 * The Studio Tools page: the status strip, the jobs by stage, the chosen job's card and form, and
 * the terminal the job runs in. Talks to the main process only through window.tools (preload.ts).
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { GROUPS, JOBS, NEEDS, jobById, type Field, type Job, type Then } from '../jobs';
import type { AppRow, LicenceRow, Published, Status } from '../status-types';
import type { Exited, Form, Started, ToolsApi } from '../bridge-types';

declare global {
  interface Window {
    tools: ToolsApi;
  }
}

const tools = window.tools;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

let status: Status | null = null;
let selected: Job | null = null;
let running: Job | null = null;
let nextUp: Then[] = [];
const forms = new Map<string, Form>();

// ---------------------------------------------------------------- the terminal

const term = new Terminal({
  cursorBlink: true,
  fontFamily: 'Consolas, "Cascadia Mono", ui-monospace, monospace',
  fontSize: 12.5,
  lineHeight: 1.25,
  scrollback: 5000,
  theme: { background: '#12161e', foreground: '#dbe2ee', cursor: '#93b8fb', selectionBackground: '#33415c' },
});
const fit = new FitAddon();
term.loadAddon(fit);

function openTerminal(): void {
  // Not xterm's windowsPty option: in conpty mode it clears the viewport on every resize and waits
  // for ConPTY to repaint, which never comes once the job has exited, and the output would be lost.
  term.open($('terminal'));
  term.attachCustomKeyEventHandler((e) => {
    if (e.type === 'keydown' && e.ctrlKey && e.key === 'c' && term.hasSelection()) {
      void navigator.clipboard?.writeText(term.getSelection()).catch(() => undefined);
      return false;
    }
    return true;
  });
  term.onData((data) => {
    if (running) void tools.input(data);
  });
  let timer: number | undefined;
  new ResizeObserver(() => {
    try {
      fit.fit();
    } catch {
      // Not laid out yet.
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (running) void tools.resize({ cols: term.cols, rows: term.rows });
    }, 120);
  }).observe($('terminal'));
  fit.fit();
  term.writeln('\x1b[2mThe job you run appears here. Questions it asks are answered here too, the key\'s passphrase included.\x1b[0m');
}

tools.onData((data) => term.write(data));
tools.onStarted((s: Started) => {
  running = jobById(s.jobId) ?? null;
  // ConPTY clears the screen as the job starts, so the command goes in the bar, not the terminal.
  term.reset();
  const title = $('termtitle');
  title.textContent = running ? running.title : 'Terminal';
  title.title = s.commandLine;
  const state = $('termstate');
  state.textContent = 'running…';
  state.className = 'muted';
  $('stop').hidden = false;
  // The status is read by a child Node process, which a job's npm ci could be replacing.
  $<HTMLButtonElement>('refresh').disabled = $<HTMLButtonElement>('github').disabled = true;
  // Room for the terminal.
  showDetails(false);
  renderJobs();
  updateRunState();
  term.focus();
});

function showDetails(show: boolean): void {
  $('details').hidden = !show;
  $('details-toggle').textContent = show ? 'Hide details' : 'Details';
}
tools.onExit((e: Exited) => {
  const ok = e.code === 0;
  const secs = Math.round(e.durationMs / 1000);
  const took = secs >= 60 ? Math.floor(secs / 60) + ' min ' + (secs % 60) + ' s' : secs + ' s';
  term.writeln('');
  term.writeln((ok ? '\x1b[1;32m' : '\x1b[1;31m') + 'Finished with exit code ' + e.code + ' in ' + took + '.\x1b[0m');
  const state = $('termstate');
  state.textContent = (ok ? 'finished' : 'failed (exit code ' + e.code + ')') + ', ' + took;
  state.className = ok ? 'ok' : 'bad';
  $('stop').hidden = true;
  const job = jobById(e.jobId);
  nextUp = ok && job ? job.then : [];
  running = null;
  renderJobs();
  updateRunState();
  void refresh(false);
});

// ---------------------------------------------------------------- status

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
const mb = (bytes: number): string => Math.round(bytes / 1024 / 1024) + ' MB';

function badge(text: string, kind: 'ok' | 'bad' | 'warn' | 'dim'): HTMLElement {
  return el('span', 'state ' + kind, text);
}

function line(parent: HTMLElement, label: string, value: string | HTMLElement): void {
  const d = el('div', 'line');
  d.append(el('span', 'muted', label + ': '));
  d.append(typeof value === 'string' ? value : value);
  parent.append(d);
}

function describePublished(p: Published | { error: string } | null): string | HTMLElement {
  if (p === null) return badge('not published from here', 'dim');
  if ('error' in p) return badge(p.error, 'bad');
  return 'version ' + p.version + ' (payload ' + p.payload + '), ' + fmtDate(p.published) + ', ' + p.grants + ' grant' + (p.grants === 1 ? '' : 's') + (p.revoked ? ', ' + p.revoked + ' revoked' : '');
}

function summaryOf(s: Status): string {
  const parts: string[] = [];
  parts.push(!s.key.present ? 'No signing key' : 'Key: present' + (s.key.passphrase ? ', passphrase set' : ', no passphrase') + (s.key.fingerprintOk ? '' : ', public key mismatch'));
  parts.push('Licences: ' + s.licences.eligible + ' open the course' + (s.licences.needsReissue ? ', ' + s.licences.needsReissue + ' need reissuing' : '') + (s.licences.revoked ? ', ' + s.licences.revoked + ' withdrawn' : ''));
  const built = s.apps.filter((a) => a.deliveries.standard || a.deliveries.full).length;
  parts.push('Apps: ' + built + ' of ' + s.apps.length + ' built');
  const pv = (p: Published | { error: string } | null): string => (p === null ? 'none' : 'error' in p ? 'error' : 'v' + p.version);
  parts.push('Published: course ' + pv(s.published.content) + ', studio ' + pv(s.published.app));
  parts.push('Git: ' + (s.git.branch ?? '?') + (s.git.uncommitted ? ', ' + s.git.uncommitted + ' uncommitted' : ', clean') + (s.git.ahead ? ', ' + s.git.ahead + ' to push' : '') + (s.git.behind ? ', ' + s.git.behind + ' to pull' : ''));
  return parts.join('  ·  ');
}

function renderStatus(): void {
  const s = status;
  if (!s) return;
  $('summary').textContent = summaryOf(s);
  $('sub').textContent = 'Evoke Training Studio ' + s.version + ' · read ' + fmtDate(s.readAt);

  const chips = $('suggestions');
  chips.replaceChildren();
  for (const g of s.suggestions) {
    const c = el('span', 'chip' + (g.job ? ' go' : ''), g.text);
    if (g.job) {
      c.title = 'Open this job';
      c.onclick = () => selectJob(g.job!, g.form);
    }
    chips.append(c);
  }

  const computer = $('computer');
  computer.replaceChildren();
  line(computer, 'Node', s.tools.node ?? 'not on PATH');
  line(computer, 'npm', (s.tools.npm ?? 'not on PATH') + (s.tools.strictAllowScripts ? '' : ' (install-script rules not enforced)'));
  line(computer, 'git', s.tools.git ?? 'not on PATH');
  line(computer, 'Packages', s.packages.root && s.packages.desktop ? badge('installed', 'ok') : badge('not installed: run Set up', 'bad'));
  line(computer, 'Signing key', !s.key.present ? badge('none', 'bad') : s.key.passphrase ? badge('present, passphrase set', 'ok') : badge('present, no passphrase', 'warn'));
  if (s.key.present) line(computer, 'Public key', s.key.fingerprintOk ? badge('matches', 'ok') : badge('does not match the key here', 'bad'));
  const keyDir = el('button', 'linkish', s.key.keyDir);
  keyDir.onclick = () => void tools.openFolder({ what: 'key-dir' });
  line(computer, 'Key folder', keyDir);

  const pub = $('published');
  pub.replaceChildren();
  line(pub, 'Course', describePublished(s.published.content));
  line(pub, 'Studio code', describePublished(s.published.app));
  if (s.published.unpushed.content || s.published.unpushed.app) line(pub, 'Not pushed', badge('a publish did not finish: run it again', 'warn'));
  if (s.github) {
    line(pub, 'GitHub, course', describePublished(s.github.content));
    line(pub, 'GitHub, studio code', describePublished(s.github.app));
  }

  const git = $('git');
  git.replaceChildren();
  line(git, 'Branch', s.git.branch ?? 'not a git repository');
  line(git, 'Uncommitted', s.git.uncommitted ? String(s.git.uncommitted) + (s.git.jobFiles.length ? ' (including ' + s.git.jobFiles.join(', ') + ')' : '') : 'none');
  if (s.git.ahead !== null || s.git.behind !== null) line(git, 'Against GitHub', (s.git.ahead ?? 0) + ' to push, ' + (s.git.behind ?? 0) + ' to pull');
  line(git, 'Remote', s.git.remote ?? 'none');

  renderLicences(s.licences.rows);
  renderApps(s.apps);

  const errors = $('errors');
  errors.hidden = s.errors.length === 0;
  errors.textContent = s.errors.map((e) => 'Could not read ' + e).join('\n');
}

function renderLicences(rows: LicenceRow[]): void {
  const box = $('licences');
  box.replaceChildren();
  if (rows.length === 0) {
    box.append(el('div', 'muted', 'No licence files in desktop/licences/.'));
    return;
  }
  const table = el('table');
  const head = el('tr');
  for (const h of ['ID', 'Licensee', 'Expires', 'Computer', 'Opens', 'State']) head.append(el('th', undefined, h));
  table.append(head);
  for (const r of rows) {
    const tr = el('tr');
    tr.append(el('td', undefined, r.id));
    tr.append(el('td', undefined, r.licensee));
    tr.append(el('td', undefined, r.expires ?? 'no end date'));
    tr.append(el('td', undefined, r.machine ? 'one computer' : 'any'));
    tr.append(el('td', undefined, r.app));
    const st = el('td');
    st.append(r.state === 'eligible' ? badge('opens the course', 'ok') : r.state === 'revoked' ? badge('revoked', 'dim') : r.state === 'needs-reissue' ? badge('needs reissuing', 'warn') : badge('no access', 'bad'));
    if (r.reason) st.append(el('div', 'muted', r.reason));
    tr.append(st);
    table.append(tr);
  }
  box.append(table);
  const open = el('button', 'linkish', 'Open desktop/licences');
  open.onclick = () => void tools.openFolder({ what: 'licences' });
  box.append(open);
}

function renderApps(apps: AppRow[]): void {
  const box = $('apps');
  box.replaceChildren();
  const table = el('table');
  const head = el('tr');
  for (const h of ['App', 'Code', 'Licensee', 'Standard build', 'Full build']) head.append(el('th', undefined, h));
  table.append(head);
  const cell = (code: string, d: AppRow['deliveries']['standard'], suffix: string): HTMLElement => {
    const td = el('td');
    if (!d) {
      td.append(badge('not built', 'dim'));
      return td;
    }
    td.append(d.artifact + ' (' + mb(d.bytes) + '), ' + fmtDate(d.builtAt) + ' ');
    const open = el('button', 'linkish', 'open');
    open.onclick = () => void tools.openFolder({ what: 'deliveries', code: code + suffix });
    td.append(open);
    return td;
  };
  for (const a of apps) {
    const tr = el('tr');
    tr.append(el('td', undefined, a.name));
    tr.append(el('td', undefined, a.code));
    const lic = el('td', undefined, a.licensee ?? 'Evoke (any internal licence)');
    if (!a.licenceFilePresent) lic.append(' ', badge('licence file missing here', 'bad'));
    tr.append(lic);
    tr.append(cell(a.code, a.deliveries.standard, ''));
    tr.append(cell(a.code, a.deliveries.full, '-full'));
    table.append(tr);
  }
  box.append(table);
}

async function refresh(github: boolean): Promise<void> {
  if (running) return;
  const refreshButton = $<HTMLButtonElement>('refresh');
  const githubButton = $<HTMLButtonElement>('github');
  refreshButton.disabled = githubButton.disabled = true;
  $('summary').textContent = github ? 'Asking GitHub…' : 'Reading this computer…';
  try {
    if (github) {
      const g = await tools.checkGithub();
      if (!g) return;
      if ('error' in g) {
        $('summary').textContent = 'GitHub could not be asked: ' + g.error;
        return;
      }
      if (status) status = { ...status, github: g };
    } else {
      const s = await tools.status();
      if ('error' in s) {
        $('summary').textContent = s.error === 'busy' ? 'A job is running; the status refreshes when it ends.' : s.error;
        return;
      }
      status = { ...s, github: status?.github };
    }
    renderStatus();
    renderJobs();
    // The card is left as it is (rebuilding it would move the terminal); only whether it can run.
    updateRunState();
  } finally {
    refreshButton.disabled = githubButton.disabled = !!running;
  }
}

// ---------------------------------------------------------------- jobs

function blockedReason(job: Job): string | null {
  if (running) return running.id === job.id ? 'Running.' : '"' + running.title + '" is running. One job at a time.';
  if (status && job.disabledWhen) return job.disabledWhen(status);
  return null;
}

/** The Run button and its reason on the card shown, without rebuilding the card. */
function updateRunState(): void {
  if (!selected) return;
  const card = $('card');
  const button = card.querySelector<HTMLButtonElement>('button.primary');
  const blocked = card.querySelector<HTMLElement>('.blocked.why');
  if (!button || !blocked) return;
  const why = blockedReason(selected);
  button.disabled = !!why;
  blocked.textContent = why ?? '';
}

function renderJobs(): void {
  const box = $('jobs');
  box.replaceChildren();
  for (const g of GROUPS) {
    const head = el('div', 'group');
    head.append(el('div', 'title', g.title));
    head.append(el('div', 'blurb', g.blurb));
    box.append(head);
    for (const job of JOBS.filter((j) => j.group === g.id)) {
      const b = el('button', 'job', job.title);
      b.dataset.id = job.id;
      if (selected?.id === job.id) b.classList.add('selected');
      if (nextUp.some((t) => t.job === job.id)) b.classList.add('next');
      const why = blockedReason(job);
      if (why && running && running.id !== job.id) b.title = why;
      b.onclick = () => selectJob(job.id);
      box.append(b);
    }
  }
}

function selectJob(id: string, prefill?: Form): void {
  const job = jobById(id);
  if (!job) return;
  selected = job;
  if (prefill) forms.set(id, { ...(forms.get(id) ?? {}), ...prefill });
  const next = nextUp.find((t) => t.job === id);
  if (next?.form) forms.set(id, { ...(forms.get(id) ?? {}), ...next.form });
  renderJobs();
  renderCard();
}

function fieldRow(job: Job, f: Field, values: Form): HTMLElement[] {
  const label = el('label', 'k', f.label);
  const box = el('div');
  const hint = f.hint ? el('div', 'hint', f.hint) : null;
  const name = job.id + ':' + f.key;
  switch (f.kind) {
    case 'select': {
      const s = el('select');
      s.name = name;
      const apps = status?.apps ?? [];
      if (apps.length === 0) s.append(new Option('(read the status first)', ''));
      for (const a of apps) s.append(new Option(a.name + (a.licensee ? ' (' + a.licensee + ')' : ' (internal)'), a.code));
      s.value = typeof values[f.key] === 'string' && apps.some((a) => a.code === values[f.key]) ? (values[f.key] as string) : apps[0]?.code ?? '';
      box.append(s);
      break;
    }
    case 'radio': {
      const wrap = el('div', 'radios');
      const chosen = typeof values[f.key] === 'string' ? (values[f.key] as string) : f.byDefault;
      for (const o of f.options) {
        const l = el('label');
        const r = el('input');
        r.type = 'radio';
        r.name = name;
        r.value = o.value;
        r.checked = o.value === chosen;
        l.append(r, ' ' + o.label);
        wrap.append(l);
      }
      box.append(wrap);
      break;
    }
    case 'check': {
      const wrap = el('div', 'checks');
      const l = el('label');
      const c = el('input');
      c.type = 'checkbox';
      c.name = name;
      c.checked = values[f.key] === true;
      l.append(c, ' ' + f.label);
      wrap.append(l);
      box.append(wrap);
      label.textContent = '';
      break;
    }
    case 'text': {
      const i = el('input');
      i.type = 'text';
      i.name = name;
      if (f.pattern) i.pattern = f.pattern;
      if (f.placeholder) i.placeholder = f.placeholder;
      i.required = !!f.required;
      i.value = typeof values[f.key] === 'string' ? (values[f.key] as string) : '';
      box.append(i);
      break;
    }
    case 'file': {
      const row = el('div', 'filerow');
      const i = el('input');
      i.type = 'text';
      i.name = name;
      i.readOnly = true;
      i.required = !!f.required;
      i.value = typeof values[f.key] === 'string' ? (values[f.key] as string) : '';
      const pick = el('button', 'small', 'Choose…');
      pick.type = 'button';
      pick.onclick = async () => {
        const chosen = await tools.pickFile({ mode: f.mode, title: f.label, filters: f.filters, defaultPath: f.defaultName });
        if (chosen) i.value = chosen;
      };
      const clear = el('button', 'small', 'Clear');
      clear.type = 'button';
      clear.onclick = () => {
        i.value = '';
      };
      row.append(i, pick, clear);
      box.append(row);
      break;
    }
  }
  if (hint) box.append(hint);
  return [label, box];
}

function collectForm(job: Job, root: HTMLElement): Form | string {
  const form: Form = {};
  for (const f of job.fields) {
    const name = job.id + ':' + f.key;
    if (f.kind === 'radio') {
      const checked = root.querySelector<HTMLInputElement>('input[name="' + CSS.escape(name) + '"]:checked');
      form[f.key] = checked ? checked.value : f.byDefault;
    } else if (f.kind === 'check') {
      form[f.key] = root.querySelector<HTMLInputElement>('input[name="' + CSS.escape(name) + '"]')?.checked === true;
    } else {
      const input = root.querySelector<HTMLInputElement | HTMLSelectElement>('[name="' + CSS.escape(name) + '"]');
      if (!input) continue;
      if (input instanceof HTMLInputElement && !input.checkValidity()) {
        input.reportValidity();
        return f.label + ': ' + (input.validity.valueMissing ? 'choose one' : 'not in the expected form');
      }
      form[f.key] = input.value;
    }
  }
  forms.set(job.id, form);
  return form;
}

function renderCard(): void {
  const card = $('card');
  card.replaceChildren();
  const job = selected;
  if (!job) {
    card.append(el('div', 'muted', 'Choose a job on the left.'));
    return;
  }
  card.append(el('h2', undefined, job.title));
  card.append(el('p', undefined, job.summary));

  const facts = el('div', 'facts');
  facts.append(el('div', 'k', 'Needs'));
  facts.append(el('div', undefined, job.needs.length ? job.needs.map((n) => NEEDS[n]).join('; ') : 'nothing in particular'));
  facts.append(el('div', 'k', 'Produces'));
  facts.append(el('div', undefined, job.produces));
  facts.append(el('div', 'k', 'Runs'));
  const runs = el('div');
  runs.append(el('code', undefined, job.command.kind === 'bat' ? job.command.file : 'npm run ' + job.command.script));
  facts.append(runs);
  card.append(facts);

  const values = forms.get(job.id) ?? {};
  if (job.fields.length) {
    const form = el('div', 'form');
    for (const f of job.fields) form.append(...fieldRow(job, f, values));
    card.append(form);
  }

  const row = el('div', 'run');
  const runButton = el('button', 'primary', 'Run');
  const why = blockedReason(job);
  runButton.disabled = !!why;
  runButton.onclick = () => void startJob(job, card);
  row.append(runButton);
  row.append(el('span', 'blocked why', why ?? ''));
  const problem = el('span', 'blocked');
  problem.id = 'problem';
  row.append(problem);
  card.append(row);

  if (job.then.length) {
    const then = el('div', 'then');
    then.append(el('div', 'k', 'Then'));
    const ul = el('ul');
    for (const t of job.then) {
      const li = el('li');
      if (t.job) {
        const b = el('button', 'linkish', jobById(t.job)?.title ?? t.job);
        b.onclick = () => selectJob(t.job!, t.form);
        li.append(b, ': ');
      }
      li.append(t.note);
      ul.append(li);
    }
    then.append(ul);
    card.append(then);
  }
}

async function startJob(job: Job, card: HTMLElement): Promise<void> {
  const problem = card.querySelector('#problem');
  if (problem) problem.textContent = '';
  const form = collectForm(job, card);
  if (typeof form === 'string') {
    if (problem) problem.textContent = form;
    return;
  }
  nextUp = [];
  const r = await tools.run({ jobId: job.id, form, cols: term.cols, rows: term.rows });
  if ('error' in r) {
    if (problem) problem.textContent = r.error;
    term.writeln('\x1b[31m' + r.error + '\x1b[0m');
  }
}

// ---------------------------------------------------------------- wiring

$('refresh').onclick = () => void refresh(false);
$('github').onclick = () => void refresh(true);
$('details-toggle').onclick = () => showDetails($('details').hidden);
$('stop').onclick = () => void tools.stop();
$('clear').onclick = () => term.clear();

void (async () => {
  await tools.info();
  openTerminal();
  renderJobs();
  renderCard();
  await refresh(false);
})();
