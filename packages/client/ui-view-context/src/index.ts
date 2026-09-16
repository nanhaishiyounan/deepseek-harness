/**
 * Browser-side entry: re-export the client surface so a node-side bundler can
 * pull the invariant companion without the web modules.
 */
export * from './client/index.ts'
export { apply } from './client/index.ts'
export { name, inject } from './client/index.ts'
