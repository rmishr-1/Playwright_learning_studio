/**
 * The completion certificate.
 *
 * Earned when EVERY day of the course is complete - all 38, not just the weeks open today.
 * Weeks 3-8 are not authored yet, so nobody can earn it right now; that is deliberate, and the
 * certificate page doubles as a progress view rather than 404ing for everyone.
 *
 * One HTML, two renderings: this module owns the markup, the SPA shows it in an iframe, and the
 * PDF route renders the same markup with Playwright. There is no second template to drift.
 */
import { chromium } from 'playwright';
import { courseIndex, readLearner } from './store';
import { withBrowserSlot } from './runner';
import { dayKey } from '../../shared/contracts/common';
import type { Learner } from '../../shared/contracts/learner';

export const ISSUER = 'Evoke Technologies Private Limited';

export type Eligibility = {
  earned: boolean;
  completed: number;
  total: number;
};

/** Counts completion across the WHOLE course, including weeks that are not authored yet. */
export function eligibility(learner: Learner): Eligibility {
  const index = courseIndex();
  let completed = 0;
  let total = 0;
  for (const week of index.weeks) {
    for (const d of week.days) {
      total++;
      if (learner.progress[dayKey(week.week, d.day)]?.completed) completed++;
    }
  }
  return { earned: total > 0 && completed === total, completed, total };
}

const escape = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const LONG_DATE = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Self-contained: no external stylesheet, no webfont, no image. The PDF renderer loads this
 * with no network, and a learner who saves the page keeps something that still renders.
 */
export function certificateHtml(learner: Learner, issuedAt: string, days: number): string {
  const index = courseIndex();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Certificate — ${escape(learner.display_name)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; display: flex; align-items: center; justify-content: center;
    background: #eef1f6; font-family: Georgia, 'Times New Roman', serif; color: #1f2b4d;
  }
  .sheet {
    width: 1122px; height: 793px; background: #fff; position: relative;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 64px 88px; text-align: center;
  }
  .rule { position: absolute; inset: 26px; border: 2px solid #1f2b4d; }
  .rule::after { content: ''; position: absolute; inset: 9px; border: 1px solid #c3ccdd; }
  .issuer {
    font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; letter-spacing: .28em;
    text-transform: uppercase; color: #5b6880; margin-bottom: 34px;
  }
  .kicker {
    font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; letter-spacing: .34em;
    text-transform: uppercase; color: #15a34a; margin-bottom: 14px;
  }
  h1 { font-size: 40px; margin: 0 0 26px; letter-spacing: .01em; }
  .lead { font-size: 17px; color: #46526e; margin: 0 0 10px; }
  .name {
    font-size: 52px; margin: 4px 0 8px; border-bottom: 2px solid #1f2b4d;
    padding: 0 40px 12px; display: inline-block;
  }
  .body { font-size: 16.5px; line-height: 1.75; color: #46526e; max-width: 74ch; margin: 24px 0 0; }
  .body b { color: #1f2b4d; }
  .feet {
    position: absolute; left: 88px; right: 88px; bottom: 74px; display: flex;
    justify-content: space-between; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px;
    color: #5b6880; text-transform: uppercase; letter-spacing: .12em;
  }
  .feet b { display: block; font-size: 14px; color: #1f2b4d; letter-spacing: .03em;
            text-transform: none; margin-top: 6px; font-family: Georgia, serif; }
  @media print { body { background: #fff; } .sheet { box-shadow: none; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="rule"></div>
    <div class="issuer">${escape(ISSUER)}</div>
    <div class="kicker">Certificate of completion</div>
    <h1>Congratulations</h1>
    <p class="lead">This is to certify that</p>
    <div class="name">${escape(learner.display_name)}</div>
    <p class="body">
      has successfully completed <b>${escape(index.title)}</b> — all <b>${days} days</b>
      across ${index.totals.weeks} weeks, covering locators, assertions, fixtures, the page
      object model, data-driven testing and API testing, with every lesson worked through and
      every practice problem attempted.
    </p>
    <div class="feet">
      <div>Issued<b>${LONG_DATE(issuedAt)}</b></div>
      <div style="text-align:right">Issued by<b>${escape(ISSUER)}</b></div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Renders the same HTML to PDF with the Chromium the code runner already depends on - no PDF
 * library. It takes a browser slot so a burst of downloads cannot exhaust the box.
 */
export async function certificatePdf(html: string): Promise<Buffer | { queue_full: true }> {
  return withBrowserSlot(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      // setContent rather than a URL: no server round-trip, and nothing to authenticate.
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({ printBackground: true, width: '1122px', height: '793px' });
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}

/** Loads the account and its eligibility together - the shape both routes need. */
export function certificateFor(learnerId: string): { learner: Learner; eligible: Eligibility } | null {
  const learner = readLearner(learnerId);
  if (!learner) return null;
  return { learner, eligible: eligibility(learner) };
}
