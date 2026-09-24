# frontend-c: the studio's page

The studio's only page (design Option C): **the learner dashboard** as the course index, and **the
lesson screen** everywhere else.

- The home page: course numbers, an "Up next" card, and "Your path" - one card per week of the
  plan, with each open week's days as tiles (`src/screens/Dashboard.tsx`, and the dashboard rules
  at the end of `src/styles.css`)
- The navy header with Course index / Lessons tabs, and the lesson screen - the breadcrumb and day
  title, the week list with day badges, the lesson and editor side by side
- Module names, colours and focus areas come from `Data/Content/course-plan.json`

## Run it (port 5185)

`launcher.bat` starts the backend and this page. Or, from the repo root, start the backend and:

```bash
npm run dev:frontend
```

and open http://localhost:5185. It is an npm workspace of the repo root, so `npm install` at the
root installs its packages. The desktop app (`desktop/`) builds this page into the app.
