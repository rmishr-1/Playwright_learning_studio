# frontend-c (design Option C)

A mix of the two design options: **Option B's learner dashboard** as the course index, and
**Option A's lesson screen** everywhere else. It started as a copy of `frontend-a/` with B's
dashboard brought in. v1, v2, A and B are unchanged.

## What it takes from each
- From Option B: the home page. Course numbers, an "Up next" card, and "Your path" - one card per
  week of the plan, with each open week's days as tiles (`src/screens/Dashboard.tsx`, and the
  dashboard rules at the end of `src/styles.css`)
- From Option A: the navy header with Course index / Lessons tabs, and the lesson screen - the
  breadcrumb and day title, the week list with day badges, the lesson and editor side by side
- Module names, colours and focus areas come from `Data/Content/course-plan.json`, shared with A and B

## Run it (port 5185)
Start the backend as usual, then from the repo root:

```bash
npm run dev:frontend-c
```

Open http://localhost:5185. `launcher-ab.bat` starts the backend with A, B and C together.

It has no `node_modules` of its own: it resolves everything from the repo root, like `frontend/`.
