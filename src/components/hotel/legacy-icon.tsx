import { ICONS } from "@/legacy/icons.mjs";

/** One of the old theme's icons, as the same inline SVG the home page uses. */
export function LegacyIcon({ name }: { name: keyof typeof ICONS | string }) {
  const def = (ICONS as Record<string, [string, string]>)[name];
  if (!def) return <i className={name} />;
  return (
    <i className={name}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={def[0]} aria-hidden="true" focusable="false">
        <path d={def[1]} />
      </svg>
    </i>
  );
}
