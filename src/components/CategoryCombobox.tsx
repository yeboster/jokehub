"use client";

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useUserCategories } from '@/hooks/useUserCategories';
import { cn } from '@/lib/utils';

type TriggerProps = Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  'value' | 'onChange' | 'placeholder' | 'children'
>;

export interface CategoryComboboxProps extends TriggerProps {
  /** The currently selected category name (may be one the user just typed). */
  value: string;
  /** Called with the chosen name — an existing category or a newly typed one. */
  onChange: (category: string) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
}

/**
 * Creatable single-select over the signed-in user's categories.
 *
 * Shared by the add-joke form and the edit-joke page, which each carried a
 * near-identical copy that had already drifted apart. Filtering is explicit
 * (`shouldFilter={false}`) rather than cmdk's built-in matching, so the
 * synthetic `Create "…"` row can't be filtered out by its own label — this is
 * the edit page's behaviour, now the only one.
 *
 * Forwards its ref and extra props to the trigger button so it can be dropped
 * inside a `<FormControl>` and still receive the id/aria wiring.
 */
export const CategoryCombobox = React.forwardRef<HTMLButtonElement, CategoryComboboxProps>(
  (
    { value, onChange, disabled, className, placeholder = 'Select or type category…', ...triggerProps },
    ref
  ) => {
    const { categoryNames, loadingCategories } = useUserCategories();
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState(value);

    const selectedValue = value ?? '';

    const options = React.useMemo(() => {
      const term = search.trim();
      const matches = term
        ? categoryNames.filter((name) => name.toLowerCase().includes(term.toLowerCase()))
        : categoryNames;
      const nextOptions = matches.map((name) => ({ value: name, label: name }));

      const exactMatchFound = categoryNames.some((name) => name.toLowerCase() === term.toLowerCase());
      if (term && !exactMatchFound) {
        nextOptions.unshift({ value: term, label: `Create "${term}"` });
      }
      return nextOptions;
    }, [categoryNames, search]);

    const handleOpenChange = (nextOpen: boolean) => {
      // The search box mirrors the committed value every time the popover
      // opens, so an externally set category (AI suggestion, form reset) shows
      // up there instead of a stale term from the last time it was open.
      if (nextOpen) setSearch(selectedValue);
      setOpen(nextOpen);
    };

    const selectedLabel =
      categoryNames.find((name) => name.toLowerCase() === selectedValue.toLowerCase()) ?? selectedValue;

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || loadingCategories}
            className={cn('w-full justify-between', !selectedValue && 'text-muted-foreground', className)}
            {...triggerProps}
          >
            <span className="truncate">
              {loadingCategories ? 'Loading categories…' : selectedValue ? selectedLabel : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0 max-h-60 overflow-y-auto"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or create category…"
              value={search}
              onValueChange={setSearch}
              className="h-9"
            />
            <CommandList>
              {/*
                The only way to reach this: no categories and an empty search
                box. A non-empty term always keeps the synthetic `Create "…"`
                row in `options` (filtering is ours, not cmdk's), and the
                trigger is disabled while categories load, so the popover can't
                be open then.
              */}
              <CommandEmpty>No personal categories found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onChange(option.value);
                      setSearch(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedValue.toLowerCase() === option.value.toLowerCase()
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);
CategoryCombobox.displayName = 'CategoryCombobox';

export default CategoryCombobox;
