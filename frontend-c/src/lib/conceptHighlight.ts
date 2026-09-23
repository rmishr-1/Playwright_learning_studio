/**
 * The live-editor half of concept color grading (see conceptColors.ts for the shared
 * vocabulary and why it's shaped the way it is; Markdown.tsx carries the read-only half).
 *
 * A plain regex-decoration ViewPlugin, not a Lezer grammar change - the classification is a
 * closed vocabulary lookup on call-shaped identifiers, not real parsing, so there is nothing a
 * grammar would buy here. `Decoration`/`ViewPlugin`/`RangeSetBuilder` are imported directly from
 * `@codemirror/view`/`@codemirror/state` rather than through `@uiw/react-codemirror` (which does
 * not re-export them) - safe because `vite.config.ts`'s `resolve.dedupe` already forces a single
 * copy of both packages, the same guard CodePane.tsx's own EditorView import relies on.
 */
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { classify, CONCEPT_CALL_PATTERN } from './conceptColors';

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  // A fresh RegExp per pass: CONCEPT_CALL_PATTERN is a global pattern with mutable `lastIndex`,
  // and this runs on every doc change - reusing one instance across calls would silently skip
  // or repeat matches depending on where the previous scan left off.
  const re = new RegExp(CONCEPT_CALL_PATTERN.source, CONCEPT_CALL_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const concept = classify(match[1]);
    if (!concept) continue;
    builder.add(match.index, match.index + match[1].length, Decoration.mark({ class: 'cm-concept-' + concept }));
  }
  return builder.finish();
}

export const conceptHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
