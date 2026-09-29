/**
 * Who the studio is licensed to, for the page's header: GET /api/branding. The desktop app sets it
 * from the licence, whose logo is signed with the rest of it. In development there is no licence,
 * and the header shows no customer logo.
 */
export type Branding = {
  licensee: string | null;
  /** A PNG or JPEG data URL. */
  logo: string | null;
};

let branding: Branding = { licensee: null, logo: null };

export function setBranding(next: Branding): void {
  const logo = next.logo && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(next.logo) ? next.logo : null;
  branding = { licensee: next.licensee, logo };
}

export const getBranding = (): Branding => branding;
