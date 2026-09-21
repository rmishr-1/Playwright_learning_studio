import { useState } from 'react';
import { Markdown } from './Markdown';
import type { CoursePart, PracticeProblem } from '../../../shared/contracts/course_day';

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
          No worked solution for this one yet — the problem statement says how you will know it
          worked.
        </p>
      )}
      {revealed && problem.solution && (
        <div className="solution">
          {/* Solutions are markdown, not bare code: 11 of the 30 problems in weeks 1-2 are
              reflection, research or terminal work, and a worked answer to those is prose.
              Code answers carry their own fence, which still gets a Load button. */}
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
  onShowWeeks,
}: {
  parts: CoursePart[];
  active: number;
  onSelect: (part: number) => void;
  viewed: number[];
  onLoadIntoEditor: (code: string) => void;
  onStartProblem: (code: string, problemNumber: number) => void;
  /** Present only while the week list is hidden - the way back to it. */
  onShowWeeks?: () => void;
}) {
  const part = parts.find((p) => p.part === active) ?? parts[0];

  return (
    <div className="pane-theory">
      <div className="tabbar">
        {onShowWeeks && (
          <button className="show-weeks" onClick={onShowWeeks} title="Show the week list">
            ☰
          </button>
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
          if (block.type === 'your-turn') {
            return (
              <div className="yourturn" key={i}>
                <div className="txt">
                  <span className="label">Your turn</span>
                  {block.text.replace(/^\s*\/\/\s?/gm, '').trim()}
                </div>
                <button className="btn small" onClick={() => onLoadIntoEditor(block.text)}>
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
