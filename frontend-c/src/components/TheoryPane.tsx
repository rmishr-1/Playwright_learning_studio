import { useEffect, useRef, useState } from 'react';
import { Markdown, isSpecFile } from './Markdown';
import { fence } from '../lib/fence';
import { Callout, CodeBlock, Diagram, TerminalBlock, type EditorFile } from './LessonBlocks';
import type { ContentBlock, CoursePart, PracticeProblem } from '../../../shared/contracts/course_day';
import type { CheckResult } from '../../../shared/contracts/check';
// Its own file, so the Check my answer styles travel with the component that uses them.
import './check.css';

/** What checking an answer can come back with: a verdict, or a reason there is none yet. */
export type CheckOutcome = CheckResult | { status: 'not-in-editor' } | { status: 'error'; message: string };

/**
 * Option labels are one line of phrasing content inside a `<button>`, where the Markdown
 * component's wrapper `<div>` would be invalid HTML - so the one bit of markdown they actually
 * use, a backtick code span, is rendered directly. `<code>` is phrasing content, and `.lesson
 * code` already styles it the same as inline code anywhere else in the lesson.
 */
function withCodeSpans(text: string) {
  return text
    .split(/(`[^`]+`)/g)
    .filter(Boolean)
    .map((piece, i) =>
      piece.length > 2 && piece.startsWith('`') && piece.endsWith('`')
        ? <code key={i}>{piece.slice(1, -1)}</code>
        : piece,
    );
}

/**
 * A quiz question, mid-lesson. Formative by design (registry invariant 10): the pick lives in
 * local state and nothing is written to progress, so revisiting the day offers the question again
 * and a wrong answer costs nothing. A single-answer question is answered by picking; a
 * select-all-that-apply question by ticking options and then checking. Answering locks the
 * options and marks the right ones - there is no score to chase, and the explanation is the point.
 */
function Checkpoint({ block }: { block: ContentBlock }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [answered, setAnswered] = useState(false);
  const check = block.checkpoint;
  if (!check) return null;

  const multiple = check.kind === 'multiple';
  const correct =
    answered && picked.length === check.answers.length && check.answers.every((a) => picked.includes(a));

  const choose = (i: number): void => {
    if (answered) return;
    if (!multiple) {
      setPicked([i]);
      setAnswered(true);
      return;
    }
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };

  return (
    <div className="checkpoint">
      <span className="label">{multiple ? 'Check yourself - select all that apply' : 'Check yourself'}</span>
      <Markdown text={block.text} />
      <div className="options">
        {check.options.map((option, i) => {
          const isAnswer = check.answers.includes(i);
          const isPicked = picked.includes(i);
          // After answering, the right ones are always marked - including when the learner found
          // them, so the correct answer is never something they have to infer from an absence.
          const state = !answered
            ? isPicked
              ? ' picked'
              : ''
            : isAnswer
              ? ' right'
              : isPicked
                ? ' wrong'
                : ' dim';
          const marker = answered ? (isAnswer ? '✓' : isPicked ? '✗' : '') : multiple ? (isPicked ? '■' : '□') : '';
          return (
            <button
              key={i}
              type="button"
              className={'option' + state}
              disabled={answered}
              aria-pressed={multiple ? isPicked : undefined}
              onClick={() => choose(i)}
            >
              <span className="marker">{marker}</span>
              {/* NOT className="body" - that is the app's main layout region, a flex container,
                  and reusing the name here laid the option's words out in columns. */}
              <span className="opt-text">{withCodeSpans(option)}</span>
            </button>
          );
        })}
      </div>
      {multiple && !answered && (
        <div className="check-row">
          <button className="btn small" disabled={picked.length === 0} onClick={() => setAnswered(true)}>
            Check my answer
          </button>
        </div>
      )}
      {answered && (
        // The verdict is spelled out as well as coloured - colour alone would carry it for
        // nobody who cannot see the difference between the green and the red.
        <div className={'verdict' + (correct ? ' right' : ' wrong')}>
          <strong>{correct ? 'Correct.' : 'Not quite.'}</strong>{' '}
          <Markdown text={check.explanation} />
        </div>
      )}
    </div>
  );
}

const KIND_LABELS: Record<PracticeProblem['kind'], string> = {
  code: 'Code',
  terminal: 'Terminal',
  written: 'Written answer',
  predict: 'Predict',
};

/**
 * The verdict of "Check my answer". Spelled out in words as well as color, and for a wrong answer
 * it shows what to fix: the expected and actual output side by side, or the end of the test run.
 */
function CheckVerdict({ outcome }: { outcome: CheckOutcome }) {
  if (outcome.status === 'not-in-editor') {
    return (
      <div className="check-result note">
        Select <b>Start this in the editor</b> first, and write your answer there. The check runs the
        code in the editor.
      </div>
    );
  }
  if (outcome.status === 'error' || outcome.status === 'busy') {
    return <div className="check-result note">{outcome.message}</div>;
  }
  const passed = outcome.status === 'passed';
  return (
    <div className={'check-result ' + (passed ? 'right' : 'wrong')}>
      <strong>{passed ? 'Correct.' : 'Not yet.'}</strong> {outcome.message}
      {!passed && outcome.expected !== null && outcome.actual !== null && outcome.output === null && (
        <div className="compare">
          <div>
            <span className="label">Expected output</span>
            <pre>{outcome.expected}</pre>
          </div>
          <div>
            <span className="label">Your output</span>
            <pre>{outcome.actual || '(nothing was printed)'}</pre>
          </div>
        </div>
      )}
      {!passed && outcome.output && <pre className="check-output">{outcome.output}</pre>}
    </div>
  );
}

function Problem({
  problem,
  onStart,
  onCheck,
}: {
  problem: PracticeProblem;
  onStart: (code: string, problemNumber: number, meta: EditorFile) => void;
  onCheck: (problem: PracticeProblem) => Promise<CheckOutcome>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [hints, setHints] = useState(0);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const check = async (): Promise<void> => {
    setChecking(true);
    setOutcome(null);
    try {
      setOutcome(await onCheck(problem));
    } catch (e) {
      setOutcome({ status: 'error', message: 'The check could not run: ' + (e as Error).message });
    } finally {
      setChecking(false);
    }
  };
  // A code exercise belongs to a file, so the editor saves it there and Run runs its command.
  const meta: EditorFile = problem.kind === 'code' ? { file: problem.file, run: problem.run } : { file: null, run: null };
  // A model answer loads as the exercise's file only when it is the whole file. Some answers to a
  // test exercise are notes plus the one line that changes, and saving those over the test file
  // would break it.
  const solutionMeta = (code: string): EditorFile =>
    meta.file?.endsWith('.spec.ts') && !isSpecFile(code) ? { file: null, run: null } : meta;

  return (
    <div className="problem">
      <div className="head">
        <span className="num">Exercise {problem.number}</span>
        {problem.difficulty && <span className={'diff ' + problem.difficulty}>{problem.difficulty}</span>}
        <span className="kind">{KIND_LABELS[problem.kind]}</span>
      </div>
      {problem.title && <h3 className="problem-title">{problem.title}</h3>}
      <Markdown text={problem.statement} />
      {(problem.file || problem.run) && (
        <p className="problem-meta">
          {problem.file && (
            <>
              File: <code>{problem.file}</code>
            </>
          )}
          {problem.file && problem.run && ' · '}
          {problem.run && (
            <>
              Run: <code>{problem.run}</code>
            </>
          )}
        </p>
      )}
      {hints > 0 && (
        <ol className="hints">
          {problem.hints.slice(0, hints).map((h, i) => (
            <li key={i}>
              <Markdown text={h} />
            </li>
          ))}
        </ol>
      )}
      <div className="actions">
        {/* Only where the editor helps: an answer in words, a prediction, or commands for the
            Terminal has no stub, and then no button. */}
        {problem.stub !== null && (
          <button className="btn small" onClick={() => onStart(problem.stub!, problem.number, meta)}>
            Start this in the editor
          </button>
        )}
        {problem.check && (
          <button className="btn small check" onClick={() => void check()} disabled={checking}>
            {checking ? 'Checking…' : 'Check my answer'}
          </button>
        )}
        {hints < problem.hints.length && (
          <button className="btn small ghost" onClick={() => setHints(hints + 1)}>
            {hints === 0 ? 'Show a hint' : 'Show another hint'}
          </button>
        )}
        {problem.solution && !revealed && (
          <button className="btn small ghost" onClick={() => setRevealed(true)}>
            Reveal solution
          </button>
        )}
      </div>
      {checking && (
        <p className="check-running">
          {problem.check?.kind === 'testsPass' ? 'Running the tests…' : 'Running your program…'}
        </p>
      )}
      {outcome && !checking && <CheckVerdict outcome={outcome} />}
      {/* No solution written means NO button, rather than a button that disappoints. */}
      {!problem.solution && (
        <p className="no-solution">
          No worked solution for this one yet. The exercise tells you how to know it worked.
        </p>
      )}
      {revealed && problem.solution && (
        <div className="solution">
          {/* Solutions are markdown, not bare code: a worked answer to a written or terminal
              exercise is prose. A code answer can be loaded into the editor as the exercise's
              file. */}
          <Markdown text={problem.solution} offerAll onLoadIntoEditor={(c) => onStart(c, problem.number, solutionMeta(c))} />
        </div>
      )}
    </div>
  );
}

export function TheoryPane({
  parts,
  active,
  onSelect,
  viewed,
  onLoadIntoEditor,
  onRunCommand,
  onStartProblem,
  onCheckAnswer,
  weeksShown,
  onToggleWeeks,
  courseTitle,
  prevDay,
  nextDay,
  onReachedEnd,
}: {
  parts: CoursePart[];
  active: number;
  onSelect: (part: number) => void;
  viewed: number[];
  /** Puts code in the editor, as the file it belongs to when it has one. */
  onLoadIntoEditor: (code: string, meta?: EditorFile) => void;
  /** Runs a command in the Terminal, after putting `load` in the editor when it is given. */
  onRunCommand: (command: string, load?: { code: string; meta: EditorFile }) => void;
  onStartProblem: (code: string, problemNumber: number, meta: EditorFile) => void;
  /** Grades an exercise of this part with its automatic check. */
  onCheckAnswer: (part: number, problem: PracticeProblem) => Promise<CheckOutcome>;
  /** Whether the week list is open, so the one button can say which way it goes. */
  weeksShown?: boolean;
  onToggleWeeks?: () => void;
  /** The course's title, from its course index. */
  courseTitle?: string;
  /** The day before this one, for Previous on the first tab. Absent on the course's first day. */
  prevDay?: DayLink;
  /** The day after this one, for Next on the last tab. Absent on the last published day. */
  nextDay?: DayLink;
  /** Called once the end of this part's content comes into view: the part has been read. */
  onReachedEnd?: () => void;
}) {
  const part = parts.find((p) => p.part === active) ?? parts[0];
  const endRef = useRef<HTMLDivElement>(null);

  // Report when the marker at the end of the content scrolls into view in the lesson pane - or is
  // in view already, for a part short enough to fit. It starts watching after a moment, so
  // diagrams and code that render late have taken their height first: a part is not read just
  // because its end flashed into view while it was still loading.
  useEffect(() => {
    const el = endRef.current;
    if (!el || !onReachedEnd) return;
    let seen: IntersectionObserver | undefined;
    const start = window.setTimeout(() => {
      seen = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          seen?.disconnect();
          onReachedEnd();
        },
        { root: el.closest('.pane-theory') },
      );
      seen.observe(el);
    }, 1000);
    return () => {
      window.clearTimeout(start);
      seen?.disconnect();
    };
  }, [part.part, onReachedEnd]);

  return (
    <div className="pane-theory">
      <div className="tabbar">
        {/* A toggle, and always present. It used to render only while the week list was hidden,
            which removed the control at exactly the moment it was needed to close it again -
            leaving no way back except picking a day you did not want. It now swaps the course
            title for the week list, so it is the only control that brings either one back. */}
        {onToggleWeeks && (
          <button
            className="show-weeks"
            onClick={onToggleWeeks}
            aria-expanded={weeksShown ?? false}
            aria-label={weeksShown ? 'Close the week list' : 'Open the week list'}
            title={weeksShown ? 'Close the week list' : 'Open the week list'}
          >
            ☰
          </button>
        )}
        {parts.map((p) => (
          <button
            key={p.part}
            className={(p.part === part.part ? 'on' : '') + (viewed.includes(p.part) ? ' seen' : '')}
            onClick={() => onSelect(p.part)}
          >
            {/* Step number, which becomes a tick once the part has been viewed. */}
            <span className="step" aria-hidden="true">{viewed.includes(p.part) ? '✓' : p.part}</span>
            {p.tab_label}
          </button>
        ))}
      </div>

      <div className="lesson">
        {part.blocks.map((block, i) => {
          switch (block.type) {
            case 'problem-ref': {
              // Render the exercise exactly where it sat in the source document.
              const problem = part.problems.find((p) => String(p.number) === block.text);
              return problem ? (
                <Problem
                  key={'p' + block.text}
                  problem={problem}
                  onStart={onStartProblem}
                  onCheck={(q) => onCheckAnswer(part.part, q)}
                />
              ) : null;
            }
            case 'markdown':
              return <Markdown key={i} text={block.text} onLoadIntoEditor={(c) => onLoadIntoEditor(c)} />;
            case 'code':
              return (
                <CodeBlock
                  key={i}
                  block={block}
                  onOpen={(code, meta) => onLoadIntoEditor(code, meta)}
                  onRun={(command, code, meta) => onRunCommand(command, { code, meta })}
                />
              );
            case 'terminal':
              return <TerminalBlock key={i} text={block.text} onRun={(command) => onRunCommand(command)} />;
            case 'callout':
              return <Callout key={i} block={block} />;
            case 'diagram':
              return <Diagram key={i} source={block.text} />;
            case 'checkpoint':
              return <Checkpoint key={i} block={block} />;
            case 'at-a-glance':
            case 'recap':
              // Cards rather than more prose: a learner scanning for "what is this for" or "what do
              // I keep" should find them without reading the paragraphs in between.
              return (
                <div className={'lesson-card ' + block.type} key={i}>
                  <span className="label">{block.type === 'recap' ? 'Recap' : 'Today'}</span>
                  <Markdown text={block.text} />
                </div>
              );
            case 'your-turn': {
              const prompt = block.variation?.prompt ?? block.text.replace(/^\s*\/\/\s?/gm, '').trim();
              const starting = block.starter ? block.text + '\n\n' + block.starter : block.text;
              return (
                <div className="yourturn" key={i}>
                  <div className="txt">
                    <span className="label">Your turn</span>
                    {prompt}
                  </div>
                  <button className="btn small" onClick={() => onLoadIntoEditor(starting)}>
                    Try it
                  </button>
                </div>
              );
            }
            default:
              return (
                <Markdown key={i} text={fence('ts', block.text)} onLoadIntoEditor={(c) => onLoadIntoEditor(c)} />
              );
          }
        })}

        {/* Any exercise the blocks did not place - a safety net, not the normal path. */}
        {part.problems
          .filter((p) => !part.blocks.some((b) => b.type === 'problem-ref' && b.text === String(p.number)))
          .map((p) => (
            <Problem key={p.number} problem={p} onStart={onStartProblem} onCheck={(q) => onCheckAnswer(part.part, q)} />
          ))}

        {/* Previous / next tab, so a learner can move through the day without scrolling back up. */}
        {/* The end of the content: reaching it is what marks the part as read. */}
        <div ref={endRef} className="lesson-end" aria-hidden="true" />
        <PartNav parts={parts} current={part.part} onSelect={onSelect} prevDay={prevDay} nextDay={nextDay} />
      </div>
    </div>
  );
}

/** A neighbouring day that Previous / Next can step to when this day has no more tabs that way. */
export type DayLink = { label: string; onGo: () => void };

/**
 * The Previous / Next buttons at the foot of every tab. They move through the day's tabs, and past
 * its ends into the neighbouring days: Next on the last tab opens the next day, Previous on the
 * first tab goes back to the previous day's last tab. A button is missing only where there is no
 * lesson that way at all.
 */
function PartNav({
  parts,
  current,
  onSelect,
  prevDay,
  nextDay,
}: {
  parts: CoursePart[];
  current: number;
  onSelect: (part: number) => void;
  prevDay?: DayLink;
  nextDay?: DayLink;
}) {
  const i = parts.findIndex((p) => p.part === current);
  const prev = parts[i - 1];
  const next = parts[i + 1];
  if (!prev && !next && !prevDay && !nextDay) return null;

  // Scroll the lesson pane back to the top after moving on.
  const go = (move: () => void): void => {
    move();
    document.querySelector('.pane-theory')?.scrollTo({ top: 0 });
  };

  return (
    <div className="part-nav">
      {prev ? (
        <button className="part-nav-btn" onClick={() => go(() => onSelect(prev.part))}>
          <span className="dir">← Previous</span>
          <span className="name">{prev.tab_label}</span>
        </button>
      ) : prevDay ? (
        <button className="part-nav-btn" onClick={() => go(prevDay.onGo)}>
          <span className="dir">← Previous day</span>
          <span className="name">{prevDay.label}</span>
        </button>
      ) : <span />}
      {next ? (
        <button className="part-nav-btn next" onClick={() => go(() => onSelect(next.part))}>
          <span className="dir">Next →</span>
          <span className="name">{next.tab_label}</span>
        </button>
      ) : nextDay ? (
        <button className="part-nav-btn next" onClick={() => go(nextDay.onGo)}>
          <span className="dir">Next day →</span>
          <span className="name">{nextDay.label}</span>
        </button>
      ) : null}
    </div>
  );
}
