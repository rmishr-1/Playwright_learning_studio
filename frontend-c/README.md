# frontend-c — QA Practice Training Studio (Option C)

The redesigned studio. v1 (`frontend/`) and v2 (`frontend-v2/`) are unchanged, and all three share
the one backend.

## What it has
- **Course index** (`src/screens/Dashboard.tsx`): the course name and description on a grey band,
  an "Up next" card, and "Your path" with five layouts to switch between (`src/components/YourPath.tsx`)
- **Lesson screen** (`src/screens/Day.tsx`): a minimal week list whose width you can drag, the
  lesson and editor side by side, Previous / Next that carry on into the neighbouring days, and a
  part marked read only once you reach the end of it
- **Top strip** (`src/components/AppHeader.tsx`): the white Evoke logo, the product name on the
  index or the course name and current lesson on a lesson, and icon buttons for Course index,
  Lessons and the theme
- **Three themes**: light, warm paper (with a dark editor) and dark (`src/lib/theme.ts`). Lesson
  diagrams are coloured to match each one (`src/components/LessonBlocks.tsx`)
- Module names, colours, focus areas and the course description come from
  `Data/Content/course-plan.json`; a week's days come from the course index

## Run it (port 5185)

```bash
launcher-ab.bat
```

or start the backend as usual, then from the repo root:

```bash
npm run dev:frontend-c
```

and open http://localhost:5185.

It has no `node_modules` of its own: it resolves everything from the repo root, like `frontend/`.
