"use client";

import * as React from "react";
import { useId } from "react";
import { CheckIcon, CaretDownIcon, XIcon } from "@phosphor-icons/react";

import { cn } from "@iedora/ui/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@iedora/ui/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@iedora/ui/components/ui/popover";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary text rendered to the right of the label (e.g. slug, id). */
  hint?: string;
};

export type ComboboxProps = {
  options: ReadonlyArray<ComboboxOption>;
  value: string | null;
  onChange: (next: string | null) => void;
  /** Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** Empty-result message. */
  emptyMessage?: string;
  /** Show an inline × in the trigger when something is selected. */
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  /** Validation message. Marks the trigger `aria-invalid` and renders the
   * message with `role="alert"` tied to the trigger via `aria-describedby`. */
  error?: string;
  /** Renders a hidden input so the combobox can be part of a plain `<form>`. */
  name?: string;
  className?: string;
  /** Additional className for the popover content (rarely needed). */
  popoverClassName?: string;
  /** Forwarded to the trigger — used by Playwright `getByTestId`. */
  "data-test-id"?: string;
  /** Forwarded to the trigger — pairs with a `<FieldLabel htmlFor>`. */
  "aria-label"?: string;
};

/**
 * Single-select combobox built on the shadcn `command` + `popover`
 * primitives. The trigger shows the selected option's label (or the
 * placeholder); opening reveals a searchable list.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "— select —",
  emptyMessage = "No matches.",
  clearable = true,
  disabled = false,
  id,
  error,
  name,
  className,
  popoverClassName,
  "data-test-id": testId,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const errId = useId();
  const [open, setOpen] = React.useState(false);

  const current = options.find((o) => o.value === value) ?? null;

  function commit(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          data-test-id={testId}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          )}
        >
          <span
            className={cn(
              "truncate text-left",
              !current && "text-[var(--muted-foreground)]",
            )}
            title={current?.label}
          >
            {current ? current.label : placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && value !== null && !disabled && (
              <span
                role="button"
                aria-label="Clear selection"
                tabIndex={-1}
                className="opacity-60 hover:opacity-100"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  commit(null);
                }}
              >
                <XIcon className="size-3.5" />
              </span>
            )}
            <CaretDownIcon className="size-4 opacity-60" aria-hidden />
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className={cn("w-(--anchor-width) p-0", popoverClassName)}
        >
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <CommandItem
                      key={opt.value}
                      value={`${opt.label} ${opt.hint ?? ""}`}
                      onSelect={() => commit(opt.value)}
                    >
                      <CheckIcon
                        className={cn(
                          "size-4",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate" title={opt.label}>
                        {opt.label}
                      </span>
                      {opt.hint && (
                        <span
                          className="ml-auto text-xs text-[var(--muted-foreground)]"
                          title={opt.hint}
                        >
                          {opt.hint}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p
          id={errId}
          role="alert"
          data-test-id="field-error"
          className="mt-1 text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
