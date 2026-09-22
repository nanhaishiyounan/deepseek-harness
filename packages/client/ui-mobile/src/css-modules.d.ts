/** CSS-module declarations for the mobile shell (the repo-wide vite/tsc convention). */
declare module '*.module.css' {
  const styles: Record<string, string>
  export default styles
}

/** Plain stylesheet side-effect import (the token sheet). */
declare module '*.css'
