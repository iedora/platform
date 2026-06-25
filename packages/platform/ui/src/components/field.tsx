"use client"

import * as React from "react";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

import { Input } from "@iedora/ui/components/ui/input";
import { Label } from "@iedora/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@iedora/ui/components/ui/select";
import { Textarea } from "@iedora/ui/components/ui/textarea";
import { cn } from "@iedora/ui/lib/utils";

/**
 * Thin, shadcn-idiomatic composed fields: a Label, a control, and a single
 * message slot (error wins over hint), with the id / aria-invalid /
 * aria-describedby wiring done once. Native shadcn primitives underneath —
 * these just spare every call site from re-spelling the label+message markup.
 */

function useFieldIds(
  id: string | undefined,
  name: string | undefined,
  error?: string,
  hint?: React.ReactNode,
) {
  const auto = React.useId();
  const fieldId = id ?? name ?? auto;
  const msgId = `${fieldId}-msg`;
  return {
    fieldId,
    msgId,
    describedBy: error || hint ? msgId : undefined,
    invalid: error ? true : undefined,
  };
}

export function FieldMessage({
  id,
  error,
  hint,
}: {
  id?: string;
  error?: string;
  hint?: React.ReactNode;
}) {
  if (error) {
    return (
      <p id={id} role="alert" data-slot="field-error" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} data-slot="field-hint" className="text-sm text-muted-foreground">
        {hint}
      </p>
    );
  }
  return null;
}

type FieldBase = {
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  id?: string;
  className?: string;
};

export function TextField({
  label,
  error,
  hint,
  id,
  className,
  ...props
}: FieldBase & React.ComponentProps<typeof Input>) {
  const { fieldId, msgId, describedBy, invalid } = useFieldIds(id, props.name, error, hint);
  return (
    <div className={cn("grid gap-2", className)} data-slot="field">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} aria-invalid={invalid} aria-describedby={describedBy} {...props} />
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  id,
  className,
  ...props
}: FieldBase & React.ComponentProps<typeof Textarea>) {
  const { fieldId, msgId, describedBy, invalid } = useFieldIds(id, props.name, error, hint);
  return (
    <div className={cn("grid gap-2", className)} data-slot="field">
      <Label htmlFor={fieldId}>{label}</Label>
      <Textarea id={fieldId} aria-invalid={invalid} aria-describedby={describedBy} {...props} />
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
}

export type SelectFieldOption = {
  value: string;
  label: React.ReactNode;
  /** Optional muted second line in the dropdown (e.g. an email under a name).
   *  The trigger still shows just `label`. */
  description?: React.ReactNode;
  disabled?: boolean;
};

export function SelectField({
  label,
  error,
  hint,
  id,
  className,
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  options,
  children,
  disabled,
}: FieldBase & {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Convenience: pass options instead of composing <SelectItem> children. */
  options?: SelectFieldOption[];
  children?: React.ReactNode;
}) {
  const { fieldId, msgId, describedBy, invalid } = useFieldIds(id, name, error, hint);
  return (
    <div className={cn("grid gap-2", className)} data-slot="field">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        name={name}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange ? (v) => onValueChange(v ?? "") : undefined}
        disabled={disabled}
        // Lets <SelectValue> render the selected option's label (not the raw
        // value) — needed when a value is pre-set, e.g. an edit form.
        items={options}
      >
        <SelectTrigger
          id={fieldId}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          className="w-full"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options
            ? options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.description ? (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{o.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{o.description}</span>
                    </span>
                  ) : (
                    o.label
                  )}
                </SelectItem>
              ))
            : children}
        </SelectContent>
      </Select>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
}

export function PasswordField({
  label,
  error,
  hint,
  id,
  className,
  showLabel = "Show password",
  hideLabel = "Hide password",
  ...props
}: FieldBase &
  React.ComponentProps<typeof Input> & {
    showLabel?: string;
    hideLabel?: string;
  }) {
  const [show, setShow] = React.useState(false);
  const { fieldId, msgId, describedBy, invalid } = useFieldIds(id, props.name, error, hint);
  return (
    <div className={cn("grid gap-2", className)} data-slot="field">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <Input
          id={fieldId}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          {...props}
          // After {...props} so the toggle always owns the type, even when a
          // spread (e.g. Conform's getInputProps) passes one.
          type={show ? "text" : "password"}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? hideLabel : showLabel}
          aria-pressed={show}
          tabIndex={-1}
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          data-slot="password-toggle"
        >
          {show ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
}

// ── Low-level field primitives ───────────────────────────────────────────────
// Drop-in replacements for the old design-system Field/FieldLabel/FieldError/
// FieldHint/FieldInput/FieldTextarea, implemented on the shadcn primitives.
// `error`/`compact` are accepted for source compatibility.

export function Field({
  error: _error,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { error?: boolean }) {
  return (
    <div className={cn("grid gap-2", className)} data-slot="field" {...rest}>
      {children}
    </div>
  );
}

export function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label className={className} {...props} />;
}

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  );
}

export function FieldInput({
  className,
  error,
  compact: _compact,
  ...props
}: React.ComponentProps<typeof Input> & { error?: boolean; compact?: boolean }) {
  return <Input aria-invalid={error || undefined} className={className} {...props} />;
}

export function FieldTextarea({
  className,
  error,
  compact: _compact,
  ...props
}: React.ComponentProps<typeof Textarea> & { error?: boolean; compact?: boolean }) {
  return <Textarea aria-invalid={error || undefined} className={className} {...props} />;
}
