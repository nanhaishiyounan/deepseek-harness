import { assetUrl, cn } from "@/lib/utils";

const APP_NAME = "All in one";

type BrandLogoProps = {
  className?: string;
};

// DSH logo mark (light + dark slots share one asset: the rounded-square
// brand mark reads on both themes). assetUrl resolves the runtime portal
// base, so the mark loads under any mount prefix (direct or proxied).
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <>
      <img
        src={assetUrl("logo-mark.png")}
        alt="DSH"
        className={cn("h-7 w-auto shrink-0 dark:hidden", className)}
      />
      <img
        src={assetUrl("logo-mark-dark.png")}
        alt="DSH"
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
