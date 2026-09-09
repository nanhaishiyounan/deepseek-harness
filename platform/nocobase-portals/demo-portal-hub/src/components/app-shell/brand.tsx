import { cn } from "@/lib/utils";

const APP_NAME = "All in one";
// Base-path aware (Vite injects BASE_URL = the portal base, e.g. /x/hub/).
const LOGO = `${import.meta.env.BASE_URL}logo-mark.png`;
const LOGO_DARK = `${import.meta.env.BASE_URL}logo-mark-dark.png`;

type BrandLogoProps = {
  className?: string;
};

// Default NocoBase logo mark (light + dark variants).
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <>
      <img
        src={LOGO}
        alt="NocoBase"
        className={cn("h-7 w-auto shrink-0 dark:hidden", className)}
      />
      <img
        src={LOGO_DARK}
        alt="NocoBase"
        className={cn("hidden h-7 w-auto shrink-0 dark:block", className)}
      />
    </>
  );
}

export function BrandWordmark({ className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center overflow-hidden text-base font-semibold tracking-tight",
        className
      )}
    >
      {APP_NAME}
    </span>
  );
}

type BrandProps = {
  className?: string;
  logoClassName?: string;
  showText?: boolean;
};

// NocoBase logo | App name
export function Brand({ className, logoClassName, showText = true }: BrandProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandLogo className={logoClassName} />
      {showText && (
        <>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          <BrandWordmark />
        </>
      )}
    </div>
  );
}
