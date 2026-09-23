# frontend-b (design Option B)

A copy of `frontend-v2/` reworked to design Option B. The lesson, editor, Run and Terminal work
exactly as in v2; v1 (`frontend/`) and v2 are unchanged.

## What's different from v2
- Home is a learner dashboard: course numbers, an "Up next" card, and "Your path" - one card per
  week of the plan, with each open week's days as tiles
- A lesson has no week list: the header carries a Dashboard button, where you are, and one chip per
  day of the week
- The four tabs are a stepper, and the editor is docked below the lesson (drag the bar to resize)
- IBM Plex Sans / Mono with Source Serif 4, Evoke navy with a darkened Evoke orange for primary actions
- Module names, colours and focus areas come from `Data/Content/course-plan.json` (shared with frontend-a)

## Run it (port 5184)
Start the backend as usual, then from the repo root:

```bash
npm run dev:frontend-b
```

Open http://localhost:5184. `launcher-ab.bat` starts the backend, A and B together.

It has no `node_modules` of its own: it resolves everything from the repo root, like `frontend/`.
