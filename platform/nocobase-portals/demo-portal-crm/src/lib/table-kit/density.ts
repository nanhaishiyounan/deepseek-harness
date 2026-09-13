export type Density = "compact" | "comfortable";

/** Tailwind overrides that tighten the shared table without forking it. */
export const densityClass = (density: Density) =>
  density === "compact"
    ? "[&_td]:py-1 [&_th]:py-1.5 [&_td]:text-[13px]"
    : undefined;
