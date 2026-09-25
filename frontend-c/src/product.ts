/**
 * The name the page shows: in the top strip on the course index, heading the lesson sidebar, and in
 * the page and pop-out titles. It is the course's own name, the same for every build.
 *
 * The app itself is named per build (desktop/variants.json: "Evoke Training Studio", "Evoke Training
 * Studio BU" and so on), and that name is the program, its installer, its window, its licence screen
 * and its licence agreement. Vite still passes that name in as __STUDIO_PRODUCT__ (vite.config.ts,
 * desktop/vite.web.config.mts); the page does not show it.
 */
export const PRODUCT_NAME = 'QA Practice Training Studio';
