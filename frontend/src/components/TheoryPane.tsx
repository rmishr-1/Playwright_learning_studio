import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Markdown } from './Markdown';
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
 * A retrieval check, mid-lesson. Formative by design (registry invariant 10): the pick lives in
 * local state and nothing is written to progress, so revisiting the day offers the question again
 * and a wrong answer costs nothing. Answering locks the options and reveals which one was right -
 * there is no score to chase, and the explanation is the whole point.
 */
function Checkpoint({ block }: { block: ContentBlock }) {
  const [picked, setPicked] = useState<number | null>(null);
  const check = block.checkpoint;
  if (!check) return null;

  const answered = picked !== null;
  const correct = picked === check.answer;

  return (
    <div className="checkpoint">
      <span className="label">Check yourself</span>
      <Markdown text={block.text} />
      <div className="options">
        {check.options.map((option, i) => {
          // After answering, the right one is always marked - including when the learner found it,
          // so the correct answer is never something they have to infer from an absence.
          const state = !answered
            ? ''
            : i === check.answer
              ? ' right'
              : i === picked
                ? ' wrong'
                : ' dim';
          return (
            <button
              key={i}
              type="button"
              className={'option' + state}
              disabled={answered}
              onClick={() => setPicked(i)}
            >
              <span className="marker">{answered && i === check.answer ? '✓' : answered && i === picked ? '✗' : ''}</span>
              {/* NOT className="body" - that is the app's main layout region, a flex container,
                  and reusing the name here laid the option's words out in columns. */}
              <span className="opt-text">{withCodeSpans(option)}</span>
            </button>
          );
        })}
      </div>
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

function Problem({
  problem,
  onLoad,
}: {
  problem: PracticeProblem;
  onLoad: (code: string, problemNumber: number) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="problem">
      <div className="head">
        <span className="num">Problem {problem.number}</span>
        {problem.difficulty && <span className={'diff ' + problem.difficulty}>{problem.difficulty}</span>}
      </div>
      <Markdown text={problem.statement} />
      <div className="actions">
        <button className="btn small" onClick={() => onLoad(problem.stub, problem.number)}>
          Start this in the editor
        </button>
        {problem.solution && !revealed && (
          <button className="btn small ghost" onClick={() => setRevealed(true)}>
            Reveal solution
          </button>
        )}
      </div>
      {/* No solution authored yet means NO button, rather than a button that disappoints. */}
      {!problem.solution && (
        <p className="no-solution">
          No worked solution for this one yet. The problem statement tells you how to know it
          worked.
        </p>
      )}
      {revealed && problem.solution && (
        <div className="solution">
          {/* Solutions are markdown, not bare code: a worked answer to a written or terminal
              problem is prose. Code answers carry their own fence, which still gets a Load
              button. */}
          <Markdown text={problem.solution} onLoadIntoEditor={(c) => onLoad(c, problem.number)} />
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
  onStartProblem,
  weeksShown,
  onToggleWeeks,
  courseTitle,
}: {
  parts: CoursePart[];
  active: number;
  onSelect: (part: number) => void;
  viewed: number[];
  onLoadIntoEditor: (code: string) => void;
  onStartProblem: (code: string, problemNumber: number) => void;
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
          <Link
            to="/learn/w1/d1/p1"
            className="studio-title"
            title={courseTitle}
          >
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
          if (block.type === 'problem-ref') {
            // Render the problem exactly where it sat in the source document.
            const problem = part.problems.find((p) => String(p.number) === block.text);
            return problem ? (
              <Problem key={'p' + block.text} problem={problem} onLoad={onStartProblem} />
            ) : null;
          }
          if (block.type === 'markdown') {
            return <Markdown key={i} text={block.text} onLoadIntoEditor={onLoadIntoEditor} />;
          }
          // The three authored-overlay types. Cards rather than more prose: they are the fixed
          // furniture of every lesson, and a learner scanning for "what is this for" or "what do
          // I keep" should find them without reading the paragraphs in between.
          if (block.type === 'at-a-glance' || block.type === 'recap') {
            return (
              <div className={'lesson-card ' + block.type} key={i}>
                <span className="label">{block.type === 'recap' ? 'Recap' : 'At a glance'}</span>
                <Markdown text={block.text} onLoadIntoEditor={onLoadIntoEditor} />
              </div>
            );
          }
          if (block.type === 'checkpoint') {
            return <Checkpoint key={i} block={block} />;
          }
          if (block.type === 'your-turn') {
            // An authored variation replaces the generic "retype from memory" prompt once
            // written; unauthored (most days, for now) falls back to that generic text - the
            // same graceful-absence pattern a missing practice solution already uses. Either
            // way, what loads into the editor also carries the preceding example's own setup,
            // when there is one, so "Try it" opens on working navigation, not a bare comment.
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
          return (
            <Markdown key={i} text={'```ts\n' + block.text + '\n```'} onLoadIntoEditor={onLoadIntoEditor} />
          );
        })}

        {/* Any problem the blocks did not place - a safety net, not the normal path. */}
        {part.problems
          .filter((p) => !part.blocks.some((b) => b.type === 'problem-ref' && b.text === String(p.number)))
          .map((p) => (
            <Problem key={p.number} problem={p} onLoad={onStartProblem} />
          ))}
      </div>
    </div>
  );
}
