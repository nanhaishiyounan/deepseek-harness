/** CSS Modules typed for the client bundle's relative imports. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
