"use client";

import { useMemo, useState, type Ref } from 'react';
import { Check, ChevronsUpDown, Filter as FilterIcon, XIcon } from 'lucide-react';

import type { FilterParams } from '@/services/jokeService';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCategories } from '@/hooks/useUserCategories';
import { hasActiveFilters } from '@/lib/jokeFilters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface JokeFilterDialogProps {
  /** The applied filters; the dialog opens with a copy of these as its draft. */
  value: FilterParams;
  /** Called with the edited filters when "Apply Filters" is pressed. */
  onApply: (filters: FilterParams) => void;
  /** Forwarded to the trigger button, so the page can return focus here when
   *  the last filter chip is removed and its row disappears. */
  triggerRef?: Ref<HTMLButtonElement>;
}

/**
 * The joke feed's filter controls: one toolbar button plus the dialog it
 * opens. Search is a field on the page, not a control in here — it is the
 * primary discovery path and was two interactions and one occluding surface
 * deep. Scope is a toolbar toggle for the same reason: it is the difference
 * between "the app" and "my collection", so it belongs in view. The single
 * opener is a `DialogTrigger`, so Radix returns focus to the control the user
 * actually pressed.
 *
 * All editing happens on one `draft` object that is seeded from `value` each
 * time the dialog opens — replacing the five parallel `temp*` states the page
 * used to hold and reset in three different places. Nothing is committed until
 * "Apply Filters", so Cancel/dismiss simply discards the draft.
 */
export default function JokeFilterDialog({ value, onApply, triggerRef }: JokeFilterDialogProps) {
  const { categoryNames, loadingCategories } = useUserCategories();
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<FilterParams>(value);
  const [categorySearch, setCategorySearch] = useState('');
  const [isCategoryPopoverOpen, setIsCategoryPopoverOpen] = useState(false);

  const openDialog = () => {
    setDraft({ ...value, selectedCategories: [...value.selectedCategories] });
    setCategorySearch('');
    setIsOpen(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) openDialog();
    else setIsOpen(false);
  };

  const handleApply = () => {
    onApply({
      ...draft,
      // Drop categories that no longer exist (a stale deep link, or a category
      // deleted while the dialog was open). Skipped while the subscription is
      // still loading: `categoryNames` is [] until the first snapshot lands, so
      // pruning then would silently discard every selection the user can see.
      selectedCategories: loadingCategories
        ? draft.selectedCategories
        : draft.selectedCategories.filter((category) => categoryNames.includes(category)),
    });
    setIsOpen(false);
  };

  const toggleCategory = (categoryName: string) => {
    setDraft((prev) => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(categoryName)
        ? prev.selectedCategories.filter((category) => category !== categoryName)
        : [...prev.selectedCategories, categoryName],
    }));
  };

  const visibleCategories = useMemo(() => {
    if (!categorySearch) return categoryNames;
    return categoryNames.filter((name) => name.toLowerCase().includes(categorySearch.toLowerCase()));
  }, [categoryNames, categorySearch]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button ref={triggerRef} variant="outline" size="sm" onClick={openDialog} className="h-9">
          <FilterIcon className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters(value) && <span className="ml-2 h-2 w-2 rounded-full bg-primary" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Filter Jokes</DialogTitle>
          <DialogDescription>
            Refine the joke feed. Search lives on the page itself.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4 pr-3">
          {/* Only when there is something to choose. Signed out — and signed in
              before the first joke — this rendered a permanently disabled
              combobox reading "Select categories…" with "No categories
              available." behind it: a control that could not do anything on
              this page load, taking the top slot in the dialog. */}
          {(loadingCategories || categoryNames.length > 0) && (
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="modal-category-filter" className="text-right pt-2">
              Categories
            </Label>
            {/* The selected-category chips live *beside* the trigger, not
                inside it: their remove controls used to be `role="button"`
                spans nested in the combobox button — invalid HTML, and both
                keyboard traversal and screen-reader behavior were ambiguous. */}
            <div className="col-span-3 space-y-2">
              <Popover open={isCategoryPopoverOpen} onOpenChange={setIsCategoryPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="modal-category-filter"
                    variant="outline"
                    role="combobox"
                    aria-expanded={isCategoryPopoverOpen}
                    className="w-full justify-between text-left font-normal"
                    disabled={loadingCategories || categoryNames.length === 0}
                  >
                    <span className={cn(draft.selectedCategories.length === 0 && 'text-muted-foreground')}>
                      {draft.selectedCategories.length === 0
                        ? 'Select categories…'
                        : `${draft.selectedCategories.length} categor${draft.selectedCategories.length === 1 ? 'y' : 'ies'} selected`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0 max-h-60 overflow-hidden"
                  align="start"
                >
                  <Command>
                    <CommandInput
                      placeholder="Search categories…"
                      value={categorySearch}
                      onValueChange={setCategorySearch}
                      className="h-9"
                    />
                    <CommandList className="max-h-[204px]">
                      <CommandEmpty>
                        {categoryNames.length === 0 ? 'No categories available.' : 'No categories found.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {visibleCategories.map((categoryName) => (
                          <CommandItem
                            key={categoryName}
                            value={categoryName}
                            onSelect={() => toggleCategory(categoryName)}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                draft.selectedCategories.includes(categoryName) ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {categoryName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {draft.selectedCategories.length > 0 && (
                <ul className="flex flex-wrap gap-1 list-none p-0 m-0">
                  {draft.selectedCategories.map((category) => (
                    <li key={category}>
                      <Badge variant="secondary" className="py-0.5 pl-2 pr-0.5 gap-1">
                        {category}
                        <button
                          type="button"
                          aria-label={`Remove category ${category}`}
                          // 24px — the WCAG 2.5.8 floor. It was a bare 12px
                          // icon with no padding, which on a phone is a miss.
                          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                          onClick={() => toggleCategory(category)}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          )}

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="modal-funny-rate-filter" className="text-right pt-2">Own rating</Label>
            <div className="col-span-3 space-y-1.5">
              <Select
                value={draft.filterFunnyRate.toString()}
                onValueChange={(rate) =>
                  setDraft((prev) => ({ ...prev, filterFunnyRate: Number.parseInt(rate, 10) }))
                }
              >
                <SelectTrigger id="modal-funny-rate-filter">
                  <SelectValue placeholder="Select rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">Any Rating</SelectItem>
                  <SelectItem value="0">Unrated</SelectItem>
                  {[1, 2, 3, 4, 5].map((rate) => (
                    <SelectItem key={rate} value={rate.toString()}>
                      {rate} Star{rate > 1 ? 's' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* This filters `funnyRate` — the score the joke's own author gave
                  it — not the community average shown on every card. Labelled
                  "Rating", it read as a filter on the number the user was
                  looking at, and returned nothing for every joke added through
                  the app. */}
              <p id="modal-funny-rate-hint" className="text-xs text-muted-foreground">
                The score a joke&apos;s author gave it, not the community average.
              </p>
            </div>
          </div>

          {/* `used` is the owner's own bookkeeping — whether they have told this
              joke. A signed-out visitor filtering the public feed by it is
              filtering strangers' private notes. */}
          {user && (
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Usage Status</Label>
            <RadioGroup
              value={draft.usageStatus}
              onValueChange={(usageStatus: FilterParams['usageStatus']) =>
                setDraft((prev) => ({ ...prev, usageStatus }))
              }
              className="col-span-3 space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="usage-all" />
                <Label htmlFor="usage-all" className="font-normal">Show All</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="used" id="usage-used" />
                <Label htmlFor="usage-used" className="font-normal">Only Used</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unused" id="usage-unused" />
                <Label htmlFor="usage-unused" className="font-normal">Only Unused</Label>
              </div>
            </RadioGroup>
          </div>
          )}
        </div>
        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleApply}>Apply Filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
