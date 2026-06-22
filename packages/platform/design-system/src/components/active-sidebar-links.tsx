"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarLink,
  SidebarLinks,
  SidebarSectionLabel,
  useSidebar,
} from "./sidebar";

/**
 * Tiny client island that resolves the active sidebar item against
 * `usePathname()` and renders the cinnabar rail on it. Keeps the server
 * layout free of the `usePathname` boundary while `<Link>` children
 * stay prefetchable.
 *
 *   const items: ActiveSidebarItem[] = [
 *     { href: "/menu/dashboard", label: t("home"), matchPrefix: false },
 *     { href: "/menu/dashboard/billing", label: t("billing") },
 *     { kind: "section", label: t("admin") },
 *     { href: "/menu/dashboard/admin/qr-codes", label: t("qrCodes") },
 *   ];
 *
 * Active matching for links:
 *   - `pathname === href` always wins.
 *   - For nested routes, `pathname.startsWith(href + '/')` also marks
 *     the parent active.
 *   - `matchPrefix: false` opts the link out of prefix matching.
 *
 * On mobile the sidebar is a drawer that needs explicit dismissal
 * after a navigation — we call `useSidebar().setOpen(false)` on click
 * so the user lands on the new view instead of the still-open menu.
 *
 * Next-bound by design: every iedora surface is a Next app, and the
 * `usePathname` + `<Link>` pair is the right shape for the routing /
 * prefetch story we want. If a non-Next consumer ever appears, expose
 * a framework-agnostic variant alongside this one rather than swapping
 * the import shape.
 */

type LinkItem = {
  kind?: "link";
  href: string;
  label: React.ReactNode;
  /** Leading glyph (lucide icon) rendered inside the pill before the label. */
  icon?: React.ReactNode;
  testId?: string;
  /**
   * When false, only an exact `pathname === href` counts as active.
   * Defaults to true so nested routes light up their parent link.
   */
  matchPrefix?: boolean;
};

type SectionItem = {
  kind: "section";
  label: React.ReactNode;
  testId?: string;
};

export type ActiveSidebarItem = LinkItem | SectionItem;

export type ActiveSidebarLinksProps = {
  items: ReadonlyArray<ActiveSidebarItem>;
  /** Defaults to `"Primary"` — override per-surface for clearer a11y. */
  ariaLabel?: string;
};

export function ActiveSidebarLinks({
  items,
  ariaLabel = "Primary",
}: ActiveSidebarLinksProps) {
  const pathname = usePathname() ?? "/";
  const { setOpen } = useSidebar();
  // Resolve the single best (most-specific) active link up front so
  // nested routes don't light up two items: e.g. `/r/x/qr` matches both
  // the "Menu" link (`/r/x`) and the "QR" link (`/r/x/qr`) by prefix —
  // the longer href wins. Exact matches always win outright.
  const activeHref = pickActiveHref(pathname, items);

  return (
    <SidebarLinks aria-label={ariaLabel}>
      {items.map((item, i) => {
        if (item.kind === "section") {
          return (
            <SidebarSectionLabel
              key={`section-${i}`}
              data-test-id={item.testId}
            >
              {item.label}
            </SidebarSectionLabel>
          );
        }
        const active = item.href === activeHref;
        return (
          <SidebarLink
            key={item.href}
            asChild
            active={active}
            data-test-id={item.testId}
            onClick={() => setOpen(false)}
          >
            <Link href={item.href}>
              {item.icon ? (
                <span className="ds-sidebar__link-icon" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span className="ds-sidebar__link-label">{item.label}</span>
            </Link>
          </SidebarLink>
        );
      })}
    </SidebarLinks>
  );
}

/**
 * Picks the single most-specific link to mark active for the current
 * pathname. Exact `pathname === href` wins outright; otherwise the
 * longest href that is a path-prefix of the pathname wins (so a child
 * route highlights the child link, not also its parent). Links with
 * `matchPrefix: false` only ever match exactly.
 */
function pickActiveHref(
  pathname: string,
  items: ReadonlyArray<ActiveSidebarItem>,
): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const item of items) {
    if (item.kind === "section") continue;
    if (pathname === item.href) return item.href;
    if (item.matchPrefix === false) continue;
    if (pathname.startsWith(item.href + "/") && item.href.length > bestLen) {
      best = item.href;
      bestLen = item.href.length;
    }
  }
  return best;
}
