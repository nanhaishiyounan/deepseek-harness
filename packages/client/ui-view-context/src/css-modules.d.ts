/** CSS-module side-effect declarations (repo-wide client convention). */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
