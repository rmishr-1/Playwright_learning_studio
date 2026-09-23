import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Markdown, isSpecFile } from './Markdown';
import { Callout, CodeBlock, Diagram, TerminalBlock, type EditorFile } from './LessonBlocks';
import type { ContentBlock, CoursePart, PracticeProblem } from '../../../shared/contracts/course_day';

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
 * A quiz question, mid-lesson. Formative by design (registry invariant 9): the pick lives in
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

function Problem({
  problem,
  onStart,
}: {
  problem: PracticeProblem;
  onStart: (code: string, problemNumber: number, meta: EditorFile) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [hints, setHints] = useState(0);
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
  weeksShown,
  onToggleWeeks,
  courseTitle,
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
  /** Whether the week list is open, so the one button can say which way it goes. */
  weeksShown?: boolean;
  onToggleWeeks?: () => void;
  /** The course's title, from its course index. */
  courseTitle?: string;
}) {
  const part = parts.find((p) => p.part === active) ?? parts[0];

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
        {/* The course title, where the masthead used to be a bar of its own. It shows only while
            the week list is closed: open, the list says where you are, and two answers to the
            same question would just crowd the tabs. */}
        {onToggleWeeks && !weeksShown && (
          <Link to="/learn/w1/d1/p1" className="studio-title" title={courseTitle}>
            {courseTitle}
          </Link>
        )}
        {parts.map((p) => (
          <button key={p.part} className={p.part === part.part ? 'on' : ''} onClick={() => onSelect(p.part)}>
            {p.tab_label}
            {viewed.includes(p.part) && <span className="viewed">✓</span>}
          </button>
        ))}
      </div>

      <div className="lesson">
        {part.blocks.map((block, i) => {
          switch (block.type) {
            case 'problem-ref': {
              // Render the exercise exactly where it sat in the source document.
              const problem = part.problems.find((p) => String(p.number) === block.text);
              return problem ? <Problem key={'p' + block.text} problem={problem} onStart={onStartProblem} /> : null;
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
                <Markdown key={i} text={'```ts\n' + block.text + '\n```'} onLoadIntoEditor={(c) => onLoadIntoEditor(c)} />
              );
          }
        })}

        {/* Any exercise the blocks did not place - a safety net, not the normal path. */}
        {part.problems
          .filter((p) => !part.blocks.some((b) => b.type === 'problem-ref' && b.text === String(p.number)))
          .map((p) => (
            <Problem key={p.number} problem={p} onStart={onStartProblem} />
          ))}
      </div>
    </div>
  );
}
