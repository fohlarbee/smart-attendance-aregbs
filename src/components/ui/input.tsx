import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-hairline bg-ink px-4 text-sm text-fg placeholder:text-faint",
      "transition-colors focus:border-primary focus:outline-none",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "h-11 w-full appearance-none rounded-xl border border-hairline bg-ink pl-4 pr-10 text-sm text-fg",
        "transition-colors focus:border-primary focus:outline-none",
        className,
      )}
      {...props}
    />
    <span
      aria-hidden
      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted"
    >
      ▾
    </span>
  </div>
));
Select.displayName = "Select";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted",
        className,
      )}
      {...props}
    />
  );
}
