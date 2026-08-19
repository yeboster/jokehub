import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

type CardTitleTag = 'div' | 'h1' | 'h2' | 'h3';

interface CardTitleProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Element to render. `div` — shadcn's original — is right for a card whose
   * title is not a section of the page. Pass `h1`/`h2`/`h3` when the card *is*
   * a section: with everything a div, `/joke/[jokeId]` and `/add-joke` had one
   * heading each and no outline for a screen reader to navigate.
   */
  as?: CardTitleTag;
}

const CardTitle = React.forwardRef<HTMLElement, CardTitleProps>(
  ({ className, as = 'div', ...props }, ref) => {
    // `ElementType` rather than the union directly: a union of intrinsic tags in
    // JSX position makes TypeScript resolve the ref against every member at once
    // (HTMLDivElement *and* HTMLHeadingElement), which no single ref satisfies.
    // The ref is typed `HTMLElement` — the one type that is honest for all four
    // tags — instead of `HTMLHeadingElement`, which was a lie for the default.
    const Comp = as as React.ElementType;

    return (
      <Comp
        ref={ref}
        // The documented card-title step (globals.css). It used to be `text-2xl`
        // and every one of the eleven call sites passed `text-lg` to undo it, so
        // the scale lived in the call sites and the component fought them.
        className={cn(
          "text-lg font-semibold leading-none tracking-tight",
          className
        )}
        {...props}
      />
    )
  }
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
