"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast
            key={id}
            // Radix defaults to `foreground`, i.e. aria-live="assertive", for
            // every toast. Assertive is correct for a failure the user has to
            // act on and wrong for a confirmation: "Joke added" was
            // interrupting whatever was being read. Successes wait their turn.
            // It comes after the spread on purpose: a `type` from the call site
            // must not quietly override the rule.
            {...props}
            type={props.variant === 'destructive' ? 'foreground' : 'background'}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
