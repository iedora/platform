"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "../lib/cn";

/**
 * Bottom-of-sidebar account card (Pencil "App/Admin Sidebar" user card):
 * a cinnabar-soft avatar with initials, the account name + a sub line
 * (plan for owners, email for staff), and a chevron that toggles a
 * popover of account actions (children).
 *
 *   <SidebarUserCard initials="LT" name="La Trattoria" sub="Kasa plan" menuLabel="Account">
 *     <SidebarMenuItem asChild><Link href="/billing">Billing</Link></SidebarMenuItem>
 *     <LocaleSwitcher />
 *     <LogoutButton />
 *   </SidebarUserCard>
 *
 * The popover anchors above the card (the card sits at the bottom of the
 * rail) and dismisses on outside-click, Escape, or any click inside it
 * (a menu item was chosen). Icon-agnostic: the chevron is an inline SVG
 * so the design-system keeps no icon dependency.
 */

type SidebarUserCardProps = {
  initials: string;
  name: React.ReactNode;
  sub?: React.ReactNode;
  /** Accessible name for the popover ("Account menu"). */
  menuLabel: string;
  children: React.ReactNode;
};

export function SidebarUserCard({
  initials,
  name,
  sub,
  menuLabel,
  children,
}: SidebarUserCardProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelId = React.useId();

  // Disclosure popover (not an ARIA menu): the children are a mix of
  // links, a control row (locale switcher), and a logout button, which a
  // strict `role="menu"` can't model. `aria-expanded` + `aria-controls`
  // convey state; Escape closes and returns focus to the trigger.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ds-sidebar__user" ref={ref}>
      {open ? (
        <div
          id={panelId}
          className="ds-sidebar__user-menu"
          role="group"
          aria-label={menuLabel}
          // A chosen item (link nav / logout / locale) should dismiss the
          // popover. Click bubbles from the item, so its own handler runs
          // first; then we close.
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        className="ds-sidebar__user-card"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        data-test-id="sidebar-user-card"
      >
        <span className="ds-sidebar__avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="ds-sidebar__user-meta">
          <span className="ds-sidebar__user-name">{name}</span>
          {sub ? <span className="ds-sidebar__user-sub">{sub}</span> : null}
        </span>
        <svg
          className="ds-sidebar__user-chevron"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m8 9 4-4 4 4M8 15l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

type SidebarMenuItemProps = React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
};

/**
 * One row inside a `<SidebarUserCard>` popover — a link or button styled
 * as an account-menu item. `asChild` renders through a `next/link` (or
 * any single child) so client-side routing stays intact. No ARIA role:
 * the popover is a disclosure, so each child is just an ordinary link or
 * button (see `SidebarUserCard`).
 */
export function SidebarMenuItem({
  asChild,
  className,
  ...rest
}: SidebarMenuItemProps) {
  const Comp = asChild ? Slot.Slot : "button";
  return (
    <Comp
      {...(asChild ? {} : { type: "button" })}
      className={cn("ds-sidebar__menu-item", className)}
      {...rest}
    />
  );
}
