// A tiny practice website used by the Day 1 demos.
// Tests load it with: await page.setContent(loginPage);
export const loginPage = `
<title>My Shop - Log in</title>
<h1>Welcome back</h1>
<label for="email">Email</label>
<input id="email" type="email" placeholder="you@example.com">
<label for="password">Password</label>
<input id="password" type="password">
<button>Log in</button>
<a href="/forgot">Forgot password?</a>
<script>
  document.querySelector('button').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    console.log('Login attempt for ' + email);
    if (email === 'asha@example.com' && password === 'Secret@123') {
      document.title = 'My Shop - Dashboard';
      document.body.innerHTML = '<h1>Dashboard</h1><p>Hello, Asha</p>';
      console.log('Login succeeded');
    } else {
      console.log('Login failed');
    }
  });
</script>
`;
