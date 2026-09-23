# frontend-a (design Option A)

A copy of `frontend-v2/` restyled to design Option A. The lesson, editor, Run and Terminal work
exactly as in v2; v1 (`frontend/`) and v2 are unchanged.

## What's different from v2
- Taller navy header: Evoke logo block, product name, Course index / Lessons tabs, theme switch
- IBM Plex Sans / Mono with Source Serif 4, Evoke navy with a darkened Evoke orange for primary actions
- Course index lists every week of the plan, including weeks not built yet ("soon")
- Lesson screen: breadcrumb and day title above the lesson, and a week list with day badges
- Module names, colours and focus areas come from `Data/Content/course-plan.json` (shared with frontend-b)

## Run it (port 5183)
Start the backend as usual, then from the repo root:

```bash
npm run dev:frontend-a
```

Open http://localhost:5183. `launcher-ab.bat` starts the backend, A and B together.

It has no `node_modules` of its own: it resolves everything from the repo root, like `frontend/`.
