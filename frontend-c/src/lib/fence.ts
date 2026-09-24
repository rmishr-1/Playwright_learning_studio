/**
 * A Markdown code block around any text. The fence is longer than the longest run of backticks in
 * the text, so nothing inside can close it early and turn the rest into Markdown (or HTML).
 */
export function fence(lang: string, text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const marks = '`'.repeat(Math.max(3, longest + 1));
  return marks + lang + '\n' + text + '\n' + marks;
}
