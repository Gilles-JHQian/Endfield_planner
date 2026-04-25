export * from './types.ts';
export * from './load.ts';
export * from './diff.ts';
// Node-only fs wrapper. Browser code must avoid the barrel and import
// loadDataBundleFromReader from './load.ts' directly to keep node:fs out of
// the browser bundle. Tests and CLI scripts use the barrel.
export * from './load-from-fs.ts';
