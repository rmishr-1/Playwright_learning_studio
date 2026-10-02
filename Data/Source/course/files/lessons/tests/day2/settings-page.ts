// After clicking Save, the page shows "Saved!" — but only 1 second later,
// like a real page waiting for the server.
export const settingsPage = `
  <h1>Settings</h1>
  <button>Save</button>
  <p id="message"></p>
  <script>
    document.querySelector('button').onclick = () => {
      setTimeout(() => (document.getElementById('message').textContent = 'Saved!'), 1000);
    };
  </script>
`;
