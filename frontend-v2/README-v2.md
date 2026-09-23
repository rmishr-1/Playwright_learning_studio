# frontend-v2 (redesigned UI)

A copy of `frontend/` with the new design. The original `frontend/` is unchanged.

## What's new
- Navy header with the Evoke logo, breadcrumb, Course index button and theme switch
- Course index page at `/`: every day in "Key Topics Covered" is a link to that day
- Numbered step tabs (1 Prerequisites ... 4 Practice), ticked once viewed
- Previous / Next buttons at the bottom of each tab
- Sidebar: "All weeks" renamed to "Learners Dashboard", orange marker on the current day
- Module names for the index table live in `src/lib/courseModules.ts`

## Run it (runs on port 5181, so the original on 5180 can run at the same time)
Start the backend as usual, then:

```bash
cd frontend-v2
npm install
npm run dev
```

Open http://localhost:5181
