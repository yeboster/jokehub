# UI Primitives (`src/components/ui`)

## Overview

These are shared shadcn-style presentational primitives. Most wrap a Radix UI package. `command.tsx` wraps `cmdk` and `form.tsx` wraps `react-hook-form`. Every file merges classes through `cn` from `@/lib/utils`. Feature components in `src/components/` and its subdirectories import these primitives. They do no data fetching. Where they differ from stock shadcn, the differences are listed under Invariants and must be kept.

## Interface

`"use client"` is present in every file except `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx` and `textarea.tsx`.

| File | Exports | Wraps |
| --- | --- | --- |
| `alert-dialog.tsx` | `AlertDialog`, `AlertDialogPortal`, `AlertDialogOverlay`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` | `@radix-ui/react-alert-dialog`; styles buttons with `buttonVariants` from `@/components/ui/button` |
| `alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription` (`alertVariants` is not exported; variants `default`, `destructive`) | `class-variance-authority` |
| `badge.tsx` | `Badge`, `badgeVariants`, `BadgeProps` (variants `default`, `secondary`, `destructive`, `outline`) | `class-variance-authority` |
| `button.tsx` | `Button`, `buttonVariants`, `ButtonProps` (`asChild?: boolean`; variant `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; size `default`, `sm`, `lg`, `icon`) | `@radix-ui/react-slot`, `class-variance-authority` |
| `card.tsx` | `Card`, `CardHeader`, `CardFooter`, `CardTitle` (`as?: 'div' \| 'h1' \| 'h2' \| 'h3'`), `CardDescription`, `CardContent` | plain React |
| `command.tsx` | `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator` | `cmdk`; `Dialog`/`DialogContent` from `./dialog.tsx` |
| `dialog.tsx` | `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogClose`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` | `@radix-ui/react-dialog` |
| `dropdown-menu.tsx` | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuGroup`, `DropdownMenuPortal`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuRadioGroup` | `@radix-ui/react-dropdown-menu` |
| `form.tsx` | `useFormField`, `Form` (= `FormProvider`), `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `FormField` | `react-hook-form`, `@radix-ui/react-slot`, `./label.tsx` |
| `input.tsx` | `Input` | native `<input>` |
| `label.tsx` | `Label` | `@radix-ui/react-label` |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent` (defaults `align="center"`, `sideOffset=4`) | `@radix-ui/react-popover` |
| `radio-group.tsx` | `RadioGroup`, `RadioGroupItem` | `@radix-ui/react-radio-group` |
| `select.tsx` | `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent` (default `position="popper"`), `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` | `@radix-ui/react-select` |
| `separator.tsx` | `Separator` (defaults `orientation="horizontal"`, `decorative=true`) | `@radix-ui/react-separator` |
| `slider.tsx` | `Slider` (adds `thumbLabel?: string`) | `@radix-ui/react-slider` |
| `switch.tsx` | `Switch` | `@radix-ui/react-switch` |
| `textarea.tsx` | `Textarea` | native `<textarea>` |
| `toast.tsx` | `ToastProvider`, `ToastViewport`, `Toast`, `ToastTitle`, `ToastDescription`, `ToastClose`, `ToastAction`, types `ToastProps`, `ToastActionElement` (variants `default`, `destructive`) | `@radix-ui/react-toast` |
| `toaster.tsx` | `Toaster` | `useToast` from `@/hooks/use-toast` and `./toast.tsx` |

## Invariants

- Dialogs. `DialogContent` always renders a `DialogPrimitive.Close` button that holds `<span className="sr-only">Close</span>`; no prop hides it. The panel is `flex flex-col` with `max-h-[calc(100dvh-2rem)]`. Children go inside a wrapper with `overflow-y-auto`, so content scrolls and the Close button does not move [dialog.tsx:DialogContent].
- Dialogs. The Close button carries its own `bg-background`, and the opacity is set on the svg (`[&>svg]:opacity-70`). A code comment says the order of these variants is load-bearing [dialog.tsx:DialogContent].
- Dialogs. A code comment records a known limit: there is no `visualViewport` listener, so the panel does not follow the on-screen keyboard [dialog.tsx:DialogContent].
- Dialogs. The overlay and content set durations with `data-[state=open]:duration-200 data-[state=closed]:duration-200`, not a bare `duration-200`. Code comments say a bare class is outranked by the `.animate-in` duration. `PopoverContent` uses the same pattern with `duration-150` [dialog.tsx, alert-dialog.tsx, popover.tsx].
- Dialogs. `AlertDialogContent` scrolls the panel itself (`max-h-[calc(100dvh-2rem)] overflow-y-auto`) and renders no close button. `AlertDialogAction` uses `buttonVariants()`; `AlertDialogCancel` uses `buttonVariants({ variant: "outline" })` [alert-dialog.tsx].
- Command. `CommandDialog` renders no `DialogTitle` or `DialogDescription`. It gets the Close button from `DialogContent` [command.tsx:CommandDialog].
- Command. `CommandEmpty` sets `className="py-6 text-center text-sm"` before `{...props}` without `cn`, so a caller's `className` replaces it [command.tsx:CommandEmpty].
- Forms. `useFormField` builds ids from the `FormItem` `React.useId()`: `${id}-form-item`, `${id}-form-item-description`, `${id}-form-item-message` [form.tsx:useFormField].
- Forms. The guard `if (!fieldContext) throw ...` never fires, because the context default is `{}`, which is truthy. `getFieldState` is also called before the guard runs [form.tsx:useFormField, FormFieldContext].
- Forms. `FormControl` sets `id`, `aria-invalid={!!error}` and `aria-describedby` on its child. The description id is always included, and the message id is added when there is an error. These are set before `{...props}`, so caller props override them [form.tsx:FormControl].
- Forms. `FormLabel` sets `htmlFor=formItemId` and adds `text-error` when there is an error. `FormMessage` renders `String(error.message)` or its children, and returns `null` when that text is empty [form.tsx].
- Slider. `Slider` renders exactly one `SliderPrimitive.Thumb` and passes `thumbLabel` to that thumb's `aria-label` [slider.tsx:Slider].
- Toasts. `ToastClose` contains `<span className="sr-only">Dismiss</span>` [toast.tsx:ToastClose].
- Toasts. `Toaster` sets `type` after `{...props}`: `'foreground'` when `variant === 'destructive'` and `'background'` otherwise. A caller cannot override it [toaster.tsx:Toaster].
- Button. `Button` renders Radix `Slot` when `asChild` is true and `"button"` otherwise. The `buttonVariants` base includes `motion-safe:active:scale-[0.97]` and `disabled:pointer-events-none disabled:opacity-50` [button.tsx].
- Alert. `Alert` renders `role="alert"`. Its destructive variant uses the `error` color tokens [alert.tsx:Alert, alertVariants].
- Card. `CardTitle` defaults to `as='div'` [card.tsx:CardTitle].
- Dropdown menu. `DropdownMenuContent` defaults to `sideOffset = 4`. An `inset` prop adds `pl-8` to SubTrigger, Item and Label [dropdown-menu.tsx].
- Separator. `Separator` uses `h-[1px] w-full` when horizontal and `h-full w-[1px]` otherwise [separator.tsx:Separator].

## Side Effects

- `AlertDialogContent`, `DialogContent`, `DropdownMenuContent`, `PopoverContent` and `SelectContent` render through their Radix `Portal`, with no `container` prop. `DropdownMenuSubContent` is not wrapped in a Portal [alert-dialog.tsx, dialog.tsx, dropdown-menu.tsx, popover.tsx, select.tsx].
- `Toaster` reads `toasts` from `useToast` (`@/hooks/use-toast`). That hook owns the toast state [toaster.tsx:Toaster].
- None of these files contains a network call or an explicit timer.

## Verification

- Run: `npm test`. This directory has no test files of its own.
