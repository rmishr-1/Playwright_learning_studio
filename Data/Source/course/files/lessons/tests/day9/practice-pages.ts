// Practice web pages for Days 9–10.
// Each constant holds the HTML of one page. Tests load it with: await page.setContent(loginPage);

// ---------------------------------------------------------------------------
// Page 1: QA Academy sign-in
//   Valid user:   student@qa.academy / Learn@123  → "Signing in…" then (0.8 s later) the Dashboard
//   Empty fields: "Please enter your email and password"
//   Wrong login:  "Invalid email or password"
// ---------------------------------------------------------------------------
export const loginPage = `
<!DOCTYPE html>
<html lang="en">
<head><title>QA Academy - Sign in</title></head>
<body>
  <h1>Sign in to QA Academy</h1>
  <form id="login-form">
    <label for="email">Email</label>
    <input id="email" type="email" placeholder="you@example.com">

    <label for="password">Password</label>
    <input id="password" type="password" placeholder="Your password">

    <label><input id="remember" type="checkbox"> Remember me</label>

    <button type="submit">Sign in</button>
  </form>
  <p id="message" role="alert" data-testid="login-message"></p>

  <script>
    const form = document.getElementById('login-form');
    const message = document.getElementById('message');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      if (email === '' || password === '') {
        message.textContent = 'Please enter your email and password';
      } else if (email === 'student@qa.academy' && password === 'Learn@123') {
        message.textContent = 'Signing in…';
        setTimeout(showDashboard, 800);          // pretend the server is slow
      } else {
        message.textContent = 'Invalid email or password';
      }
    });

    function showDashboard() {
      document.title = 'QA Academy - Dashboard';
      document.body.innerHTML =
        '<h1>Dashboard</h1>' +
        '<p>Welcome back, Student!</p>' +
        '<ul><li>Weeks 1-2 - Fundamentals</li><li>Week 3 - Locators</li><li>Week 4 - Page Objects</li></ul>' +
        '<button id="logout">Log out</button>';
      document.getElementById('logout').addEventListener('click', () => {
        document.title = 'QA Academy - Signed out';
        document.body.innerHTML = '<h1>Signed out</h1><p>See you soon!</p>';
      });
    }
  </script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Page 2: QA Academy course enrolment (used in the Day 10 mini-project)
// ---------------------------------------------------------------------------
export const enrolPage = `
<!DOCTYPE html>
<html lang="en">
<head><title>QA Academy - Enrol</title></head>
<body>
  <h1>Enrol in a course</h1>
  <form id="enrol-form">
    <label for="name">Full name</label>
    <input id="name" placeholder="e.g. Asha Verma">

    <label for="enrol-email">Email</label>
    <input id="enrol-email" type="text" placeholder="you@example.com">

    <label for="course">Course</label>
    <select id="course">
      <option value="">-- choose a course --</option>
      <option value="pw">Playwright Basics</option>
      <option value="api">API Testing</option>
      <option value="perf">Performance Testing</option>
    </select>

    <label><input id="terms" type="checkbox"> I accept the terms</label>

    <button type="submit" disabled>Enrol now</button>
  </form>
  <p data-testid="seats">Seats left: 12</p>
  <p id="result" role="status"></p>

  <script>
    let seats = 12;
    const terms = document.getElementById('terms');
    const submit = document.querySelector('button[type=submit]');
    const result = document.getElementById('result');

    // The Enrol button is enabled only while the terms box is ticked
    terms.addEventListener('change', () => {
      submit.disabled = !terms.checked;
    });

    document.getElementById('enrol-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('enrol-email').value.trim();
      const course = document.getElementById('course');

      if (name === '') { result.textContent = 'Name is required'; return; }
      if (!email.includes('@')) { result.textContent = 'Enter a valid email'; return; }
      if (course.value === '') { result.textContent = 'Please choose a course'; return; }

      seats = seats - 1;
      document.querySelector('[data-testid=seats]').textContent = 'Seats left: ' + seats;
      const courseName = course.options[course.selectedIndex].text;
      const firstName = name.split(' ')[0];
      result.textContent = 'Thanks, ' + firstName + '! You are enrolled in ' + courseName + '.';
    });
  </script>
</body>
</html>
`;
