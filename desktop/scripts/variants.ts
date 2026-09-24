/**
 * The builds of the app, one per audience, from desktop/variants.json (committed):
 *
 *   internal   "Evoke Training Studio"       for Evoke, opens with any valid Evoke licence
 *   BU         "Evoke Training Studio BU"    for one customer, opens only with their licence
 *
 * Each has its own name and appId, and so its own program, install folder, shortcuts, entry in
 * Windows' Apps list and data folder (%APPDATA%\<name>): every variant installs and runs beside the
 * others on one computer.
 *
 * A variant's name and appId are stored, never worked out again at build time: once a copy has
 * been installed anywhere, changing either would make the next one a different app, with none of
 * the learner's progress. new-customer.ts derives them once, when it adds a customer.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const DESKTOP = path.resolve(__dirname, '..');
export const VARIANTS_FILE = path.join(DESKTOP, 'variants.json');

export type Variant = {
  /** "internal", or the customer's short code: 2 to 8 capital letters or digits (BU, BWP). */
  code: string;
  /** The app's name everywhere: program, install folder, shortcuts, Apps list, windows, page. */
  name: string;
  /** Windows' identity for the installer and the taskbar. Never changes once shipped. */
  appId: string;
  /** Who a customer variant is for; null for internal. */
  licensee: string | null;
  /** The licence a customer variant is sealed to; null for internal. */
  licenceId: string | null;
  /** That licence's file, relative to desktop/ (always under licences/); null for internal. */
  licence: string | null;
};

export const INTERNAL_CODE = 'internal';
const BASE_NAME = 'Evoke Training Studio';
const BASE_APP_ID = 'com.evoketechnologies.trainingstudio';

const CODE = /^[A-Z0-9]{2,8}$/;
// Letters and digits in words separated by single spaces: a name electron-builder uses as the
// install folder as it is, and one Uninstall.bat can quote safely.
const NAME = /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/;
const APP_ID = /^com\.evoketechnologies\.trainingstudio(\.[a-z0-9]+)?$/;
const LICENCE_ID = /^EVK-[0-9A-F]{8}$/;
// Windows will not make a folder with one of these names (deliveries/<code>/).
const DEVICE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/;
/** Long enough for a clear name; short enough that the browsers' deepest files stay under 260 characters. */
const NAME_MAX = 40;

/** What a new customer's variant is called, from their short code. */
export function derivedName(code: string): string {
  return BASE_NAME + ' ' + code;
}
export function derivedAppId(code: string): string {
  return BASE_APP_ID + '.' + code.toLowerCase();
}

/** Why a short code cannot be used for a new customer, or null when it can. */
export function codeProblem(code: string, variants: readonly Variant[] = readVariants()): string | null {
  if (!CODE.test(code)) return 'A short code is 2 to 8 capital letters or digits, like BU or BWP.';
  if (DEVICE.test(code)) return code + ' is a name Windows keeps for itself. Choose another.';
  const taken = variants.find((v) => v.code.toLowerCase() === code.toLowerCase());
  if (taken) return code + ' is already used, for ' + (taken.licensee ?? 'Evoke') + ' ("' + taken.name + '").';
  return null;
}

function validate(variants: Variant[]): Variant[] {
  const seen = { code: new Set<string>(), name: new Set<string>(), appId: new Set<string>() };
  let internal = 0;
  for (const v of variants) {
    const where = 'variants.json, "' + String(v?.code) + '": ';
    if (!v || typeof v.code !== 'string' || typeof v.name !== 'string' || typeof v.appId !== 'string') {
      throw new Error(where + 'every variant needs a code, a name and an appId.');
    }
    if (v.code === INTERNAL_CODE) {
      internal++;
      if (v.licence !== null || v.licenceId !== null || v.licensee !== null) throw new Error(where + 'the internal variant has no licence.');
    } else {
      if (!CODE.test(v.code) || DEVICE.test(v.code)) throw new Error(where + 'a code is 2 to 8 capital letters or digits, and not a Windows device name.');
      if (typeof v.licensee !== 'string' || !v.licensee.trim()) throw new Error(where + 'a customer variant names its licensee.');
      if (typeof v.licenceId !== 'string' || !LICENCE_ID.test(v.licenceId)) throw new Error(where + 'licenceId must look like EVK-1A2B3C4D.');
      if (
        typeof v.licence !== 'string' ||
        v.licence.includes('\\') ||
        path.posix.normalize(v.licence) !== v.licence ||
        !v.licence.startsWith('licences/' + v.licenceId + '-') ||
        !v.licence.endsWith('.lic') ||
        v.licence.split('/').length !== 2
      ) {
        throw new Error(where + 'licence must be licences/' + v.licenceId + '-<name>.lic.');
      }
    }
    if (!NAME.test(v.name) || v.name.length > NAME_MAX) {
      throw new Error(where + 'a name is words of letters and digits separated by single spaces, at most ' + NAME_MAX + ' characters.');
    }
    if (!APP_ID.test(v.appId)) throw new Error(where + 'an appId is ' + BASE_APP_ID + ' or ' + BASE_APP_ID + '.<code>, in lower case.');
    for (const key of ['code', 'name', 'appId'] as const) {
      const k = v[key].toLowerCase();
      if (seen[key].has(k)) throw new Error(where + 'two variants have the same ' + key + '.');
      seen[key].add(k);
    }
  }
  if (internal !== 1) throw new Error('variants.json must have exactly one "internal" variant.');
  return variants;
}

export function readVariants(): Variant[] {
  const parsed = JSON.parse(fs.readFileSync(VARIANTS_FILE, 'utf-8')) as { variants?: Variant[] };
  if (!Array.isArray(parsed.variants)) throw new Error('variants.json has no "variants" list.');
  return validate(parsed.variants);
}

function writeVariants(variants: Variant[]): void {
  validate(variants);
  const tmp = VARIANTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ variants }, null, 4) + '\n');
  fs.renameSync(tmp, VARIANTS_FILE);
}

export function variantByCode(code: string): Variant {
  const variants = readVariants();
  const v = variants.find((x) => x.code.toLowerCase() === code.toLowerCase());
  if (!v) throw new Error('There is no variant "' + code + '". The variants are: ' + variants.map((x) => x.code).join(', ') + '.');
  return v;
}

export function variantByLicenceId(id: string): Variant | null {
  return readVariants().find((v) => v.licenceId === id) ?? null;
}

/** The internal variant: what `npm start` and the tests build. */
export function internalVariant(): Variant {
  return variantByCode(INTERNAL_CODE);
}

export function addVariant(v: Variant): void {
  writeVariants([...readVariants(), v]);
}

/** A reissued licence: the variant keeps its name and appId, so it upgrades the copy already installed. */
export function setVariantLicence(code: string, licence: string, licenceId: string): void {
  writeVariants(readVariants().map((v) => (v.code === variantByCode(code).code ? { ...v, licence, licenceId } : v)));
}

/** The licence file of a customer variant; null for internal. */
export function licencePath(v: Variant): string | null {
  if (!v.licence) return null;
  const file = path.join(DESKTOP, ...v.licence.split('/'));
  if (!fs.existsSync(file)) {
    throw new Error(
      v.licence + ' is not on this computer. Licences are kept only on the computer that issues them (desktop/licences/ is not committed).',
    );
  }
  return file;
}

/** The package name electron-builder is given: evoke-training-studio-bu. */
export function packageName(v: Variant): string {
  return v.name.toLowerCase().replace(/ /g, '-');
}

/** The start of the installer's and zip's file names: Evoke-Training-Studio-BU. */
export function artifactBase(v: Variant): string {
  return v.name.replace(/ /g, '-');
}
