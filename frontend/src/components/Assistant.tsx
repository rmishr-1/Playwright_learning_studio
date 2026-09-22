import { useEffect, useRef, useState } from 'react';
import { askAssistant } from '../api/client';
import { Markdown } from './Markdown';

type Turn = { role: 'user' | 'assistant'; text: string };

/**
 * Floating bubble that expands into a chat panel. Explain-only: it cannot touch the editor,
 * run code, or see run output, and the backend refuses to hand out practice solutions.
 */
export function Assistant({
  week,
  day,
  part,
}: {
  week: number;
  day: number;
  part: number;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // A new day is a new conversation - carrying Week 1 questions into Week 2 just confuses it.
  useEffect(() => {
    setTurns([]);
  }, [week, day]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [turns]);

  function send(): void {
    const question = draft.trim();
    if (!question || busy) return;
    const history = turns;
    setTurns([...history, { role: 'user', text: question }, { role: 'assistant', text: '' }]);
    setDraft('');
    setBusy(true);

    askAssistant(
      { week, day, part, history, question },
      (delta) =>
        setTurns((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: 'assistant',
            text: next[next.length - 1].text + delta,
          };
          return next;
        }),
      (error) => {
        setBusy(false);
        if (error) {
          setTurns((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', text: '_' + error + '_' };
            return next;
          });
        }
      },
    );
  }

  if (!open) {
    return (
      <button className="bubble" onClick={() => setOpen(true)} aria-label="Ask about this lesson">
        <span className="ico" aria-hidden="true">❓</span>
        Ask
      </button>
    );
  }

  return (
    <div className="chat">
      <div className="head">
        <span>Ask about this day</span>
        <span className="spacer" />
        <button onClick={() => setOpen(false)} aria-label="Close assistant">
          ×
        </button>
      </div>

      <div className="log" ref={logRef}>
        {turns.length === 0 && (
          <p className="hint">
            I can see this day’s lessons and your progress through them. Ask me to explain
            something, or to help with an error you have pasted.
            <br />
            <br />
            On the practice problems I give hints rather than answers. Use the Reveal solution
            button when you want the worked version.
          </p>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div className="msg user" key={i}>
              {t.text}
            </div>
          ) : (
            <div className="msg assistant" key={i}>
              {t.text ? <Markdown text={t.text} /> : <span className="hint">…</span>}
            </div>
          ),
        )}
      </div>

      <div className="ask">
        <textarea
          value={draft}
          placeholder="Ask a question…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn" onClick={send} disabled={busy || !draft.trim()}>
          Ask
        </button>
      </div>
    </div>
  );
}
