// Stands in for ws's optional native add-ons (bufferutil, utf-8-validate), which the desktop app
// never loads: ws then uses its own JavaScript.
throw new Error('Not available in the desktop app.');
