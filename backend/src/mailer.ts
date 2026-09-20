/**
 * Sending mail — today that is only the password-reset code.
 *
 * SMTP credentials are an operator concern, and this repo ships without any. So delivery has
 * two modes and the code is explicit about which one ran:
 *
 *   configured   -> a real SMTP send through nodemailer.
 *   NOT configured -> the message is written to Data/Outbox/ and logged. NOTHING IS SENT.
 *
 * The fallback exists so the reset flow is usable and testable before a mail account is wired
 * up — an operator reads the code out of the outbox and passes it on. It is the same shape as
 * the assessment portal's "Copy email" button, which also shipped before its Outlook credential
 * existed. It must never be mistaken for working email, so it says so loudly in the log.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { config, DATA } from './config';

const OUTBOX = path.join(DATA, 'Outbox');

export type Mail = { to: string; subject: string; text: string };
export type Delivery = { delivered: 'smtp' | 'outbox'; detail: string };

let transport: Transporter | null = null;

function smtp(): Transporter | null {
  const { host, port, user, password, secure } = config.mail;
  if (!host || !user) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
    });
  }
  return transport;
}

export const mailConfigured = (): boolean => smtp() !== null;

export async function send(mail: Mail): Promise<Delivery> {
  const from = config.mail.from || config.mail.user || 'no-reply@localhost';
  const client = smtp();

  if (!client) {
    fs.mkdirSync(OUTBOX, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(OUTBOX, stamp + '-' + mail.to.replace(/[^\w.@-]/g, '_') + '.txt');
    fs.writeFileSync(file, 'To: ' + mail.to + '\nSubject: ' + mail.subject + '\n\n' + mail.text + '\n');
    console.warn(
      '[mail] SMTP is NOT configured — nothing was sent. The message was written to ' + file,
    );
    return { delivered: 'outbox', detail: file };
  }

  await client.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
  console.log('[mail] sent to ' + mail.to + ' via ' + config.mail.host);
  return { delivered: 'smtp', detail: config.mail.host };
}

/** The reset email. Plain text on purpose: it renders everywhere and cannot carry a tracker. */
export function resetCodeMail(displayName: string, email: string, code: string, minutes: number): Mail {
  return {
    to: email,
    subject: 'Your password reset code',
    text: [
      'Hello ' + displayName + ',',
      '',
      'Your password reset code for Beginner to Advanced: Playwright Fundamentals is:',
      '',
      '    ' + code,
      '',
      'It expires in ' + minutes + ' minutes and can be used once.',
      '',
      'If you did not ask to reset your password, ignore this email — nothing has changed.',
      '',
      'Evoke Technologies Private Limited',
    ].join('\n'),
  };
}
