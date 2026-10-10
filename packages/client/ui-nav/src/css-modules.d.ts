/** CSS Modules default-export declarations (typed loosely by the build). */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
