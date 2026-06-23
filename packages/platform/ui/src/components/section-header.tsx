import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@iedora/ui/lib/utils";

type SectionHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  hint?: ReactNode;
  /** Tag to render the title element. Defaults to "h2". */
  as?: "h2" | "h3" | "h4" | "span" | "div";
};

/**
 * Editorial Section Header — a title with an optional mono-spaced hint.
 */
export function SectionHeader({
  title,
  hint,
  as: Tag = "h2",
  className,
  ...rest
}: SectionHeaderProps) {
  return (
    <header
      {...rest}
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-2",
        className,
      )}
    >
      <Tag className="text-sm font-semibold tracking-wide text-[var(--foreground)] uppercase">
        {title}
      </Tag>
      {hint && (
        <span className="font-[family-name:var(--mono,monospace)] text-xs text-[var(--muted-foreground)]">
          {hint}
        </span>
      )}
    </header>
  );
}
