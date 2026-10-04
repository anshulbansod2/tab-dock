/**
 * Content scripts are classic IIFEs that attach to globalThis.HoverHelper. Importing them as
 * modules executes them once per test file, in the order given (mirror manifest order).
 * @param {...string} names - file names under content/ without ".js"
 */
export async function loadContent(...names) {
  for (const name of names) await import(`../../content/${name}.js`);
  return globalThis.HoverHelper;
}
