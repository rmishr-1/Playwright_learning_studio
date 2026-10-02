// A pretend website at https://shop.test. Playwright answers the browser's
// request with this HTML, so the demo works without internet.
export const shopHome = `
<title>My Shop</title>
<h1 id="greeting"></h1>
<button>Log in as Asha</button>
<script>
  const user = localStorage.getItem('user');            // remembered login (like a session)
  document.getElementById('greeting').textContent = user ? 'Hello, ' + user : 'Hello, guest';
  document.querySelector('button').onclick = () => {
    localStorage.setItem('user', 'Asha');
    document.getElementById('greeting').textContent = 'Hello, Asha';
  };
</script>
`;
