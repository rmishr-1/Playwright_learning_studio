// Four independent tests. Each one opens a page that takes 3 seconds to show its result.
export const slowPage = `
  <p id="done"></p>
  <script>setTimeout(() => (document.getElementById('done').textContent = 'Done'), 3000);</script>
`;
