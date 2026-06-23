import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@iedora/ui/lib/utils";

import {
  Card as CardBase,
  CardFooter,
} from "@iedora/ui/components/ui/card";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

type CardIndexProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

type CardVisualProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  children: ReactNode;
  as?: "h2" | "h3" | "h4" | "h5" | "h6";
};

type CardDescProps = HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
};

/**
 * Editorial card built on the shadcn `Card` primitive, plus the slot
 * helpers (index · visual · title · desc · foot) the editorial surfaces
 * compose with.
 */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <CardBase className={cn("p-4", className)} {...rest}>
      {children}
    </CardBase>
  );
}

export function CardIndex({ className, children, ...rest }: CardIndexProps) {
  return (
    <div
      {...rest}
      className={cn(
        "font-[family-name:var(--mono,monospace)] text-xs text-[var(--muted-foreground)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardVisual({ className, children, ...rest }: CardVisualProps) {
  return (
    <div
      {...rest}
      className={cn(
        "flex min-h-24 items-center justify-center rounded-md bg-[var(--muted)]",
        className,
      )}
      aria-hidden={children ? undefined : "true"}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  as: Tag = "h5",
  className,
  children,
  ...rest
}: CardTitleProps) {
  return (
    <Tag
      {...rest}
      data-slot="card-title"
      className={cn("text-base font-semibold", className)}
    >
      {children}
    </Tag>
  );
}

export function CardDesc({ className, children, ...rest }: CardDescProps) {
  return (
    <p
      {...rest}
      className={cn("text-sm text-[var(--muted-foreground)]", className)}
    >
      {children}
    </p>
  );
}

/** Card footer — aliases the shadcn `CardFooter`. */
export const CardFoot = CardFooter;
