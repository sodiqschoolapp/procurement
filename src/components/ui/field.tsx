"use client";

import { createContext, type ReactNode, useContext } from "react";

import { cn } from "@/components/utils";

// docs/design-system.md, "Fields and switches": a label, the control, and on an error one line
// under the field in --destructive. The control reads its id, aria-invalid and
// aria-describedby from this context, so the error line is tied to the field it belongs to.

type FieldState = { id: string; invalid: boolean; describedBy: string | undefined };

const FieldContext = createContext<FieldState | null>(null);

/** The props a control inside a <Field> takes from it. */
export function useFieldControl(): {
  id?: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
} {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: field.id,
    ...(field.invalid ? { "aria-invalid": true as const } : {}),
    ...(field.describedBy ? { "aria-describedby": field.describedBy } : {}),
  };
}

export function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  /** The label, a text from the message files. */
  label: ReactNode;
  /** The one error line, a text from the message files; nothing when the field is right. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const errorId = `${id}-error`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <FieldContext.Provider
        value={{ id, invalid: hasError, describedBy: hasError ? errorId : undefined }}
      >
        {children}
      </FieldContext.Provider>
      {hasError && (
        <p id={errorId} className="text-small text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
