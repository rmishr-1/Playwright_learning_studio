/**
 * The product's name, shown in the top strip on the course index, heading the week list, and in the
 * page and pop-out titles. Vite fills it in at build time: "Evoke Training Studio" for the studio run
 * with launcher.bat (vite.config.ts), and each desktop app's own name, "Evoke Training Studio BU" and
 * the like, when desktop/scripts/build.ts builds the page (desktop/vite.web.config.mts).
 */
declare const __STUDIO_PRODUCT__: string;

export const PRODUCT_NAME: string = typeof __STUDIO_PRODUCT__ === 'string' ? __STUDIO_PRODUCT__ : 'Evoke Training Studio';
