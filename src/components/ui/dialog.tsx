"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Matches DialogContent below, so the overlay and the panel start and
      // finish together. The duration has to ride the same `data-[state=…]:`
      // variant the animation does: tailwindcss-animate bakes
      // `animation-duration: 150ms` into `.animate-in` / `.animate-out`, and
      // through the variant that rule is a class *plus an attribute selector*,
      // which outranks a bare `duration-200`. (That is why the plain
      // `duration-200` DialogContent used to carry never actually applied.)
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:duration-200 data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // See DialogOverlay: the duration is pinned through the `data-[state=…]:`
        // variant because a bare `duration-200` loses to `.animate-in`'s own
        // 150ms on specificity.
        //
        // The max-height bound: the panel is vertically centred with no height
        // limit, so on a short viewport — a phone in landscape, or a small
        // window — the footer went off-screen with nothing to scroll, and
        // "Apply Filters" was simply unreachable. Dynamic viewport units and not
        // percentage-of-viewport units, because mobile Safari's version of the
        // latter counts retracted browser chrome, which is the case this is for.
        // The subtracted 2rem leaves a 1rem gutter top and bottom.
        //
        // The panel is a flex column and does NOT scroll: the wrapper below
        // does. When the panel itself scrolled, the close button — positioned
        // against it — scrolled away with the content and left the screen.
        // Sticky is not an alternative: an auto-placed grid item sticks inside
        // its own grid area, which for the last child is the bottom of the
        // scrolled content.
        //
        // Known limit (deferred, see the plan): this handles a short *layout*
        // viewport. It does not reposition when the on-screen keyboard shrinks
        // the *visual* viewport — that needs a `visualViewport` listener.
        "fixed left-[50%] top-[50%] z-50 flex w-full max-w-lg max-h-[calc(100dvh-2rem)] flex-col translate-x-[-50%] translate-y-[-50%] border bg-background p-6 shadow-lg data-[state=open]:duration-200 data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {/* The header/body/footer grid and its gap moved off the panel and onto
          this wrapper, unchanged, so nothing shifts. The minimum-height reset is
          required: a flex item will not shrink below its content height without
          it, and the panel's height bound would do nothing. */}
      <div className="grid min-h-0 gap-4 overflow-y-auto">{children}</div>
      {/* The opacity rides the glyph, not the button. The button needs an opaque
          background of its own — it sits over the wrapper above, which scrolls
          underneath it — and a partial opacity on the element composites the
          background along with the icon, so joke text slid visibly through the
          button's fill. Applied to the svg child instead, the fill stays solid
          while the icon keeps the same resting weight and the same lift to full
          strength on hover; the transition moves with it, since there is nothing
          left on the element for it to animate.

          Variant order is load-bearing on the hover rule and reads backwards:
          the leftmost variant is applied last, so putting the child selector
          first and hover second is what lands the hover state on the button and
          the opacity on the glyph. The other way round compiles the hover onto
          the svg itself, which only fires over the sixteen pixels of the icon
          rather than anywhere on the control. */}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&>svg]:opacity-70 [&>svg]:transition-opacity [&>svg]:hover:opacity-100">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
