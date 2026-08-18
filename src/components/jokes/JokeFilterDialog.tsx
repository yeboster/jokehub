"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronsUpDown, Filter as FilterIcon, Search, User, Users, XIcon } from 'lucide-react';

import type { FilterParams } from '@/services/jokeService';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCategories } from '@/hooks/useUserCategories';
import { useToast } from '@/hooks/use-toast';
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
import { Input } from '@/components/ui/input';
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
}

/**
 * The joke feed's search/filter controls: the two toolbar buttons plus the
 * dialog they open.
 *
 * All editing happens on one `draft` object that is seeded from `value` each
 * time the dialog opens — replacing the five parallel `temp*` states the page
 * used to hold and reset in three different places. Nothing is committed until
 * "Apply Filters", so Cancel/dismiss simply discards the draft.
 */
export default function JokeFilterDialog({ value, onApply }: JokeFilterDialogProps) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { categoryNames, loadingCategories } = useUserCategories();

  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<FilterParams>(value);
  const [categorySearch, setCategorySearch] = useState('');
  const [isCategoryPopoverOpen, setIsCategoryPopoverOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const openDialog = (focusSearch: boolean) => {
    setDraft({ ...value, selectedCategories: [...value.selectedCategories] });
    setCategorySearch('');
    setIsOpen(true);
    if (focusSearch) {
      // Small delay so the input exists before we reach for it.
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) openDialog(false);
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

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleApply();
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
      <Button
        variant="outline"
        size="icon"
        onClick={() => openDialog(true)}
        className="h-9 w-9 shrink-0"
      >
        <Search className="h-4 w-4" />
        <span className="sr-only">Search</span>
      </Button>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={() => openDialog(false)} className="h-9">
          <FilterIcon className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters(value) && <span className="ml-2 h-2 w-2 rounded-full bg-primary" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Filter &amp; Search Jokes</DialogTitle>
          <DialogDescription>
            Select preferences to refine the joke feed. Press Enter in search to apply.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4 pr-3">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="modal-search-input" className="text-right">
              Search
            </Label>
            <Input
              ref={searchInputRef}
              id="modal-search-input"
              placeholder="Search by keyword…"
              value={draft.search}
              onChange={(event) => setDraft((prev) => ({ ...prev, search: event.target.value }))}
              onKeyDown={handleSearchKeyDown}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="filter-scope-select" className="text-right">
              Show Jokes
            </Label>
            <Select
              value={draft.scope}
              onValueChange={(scope: FilterParams['scope']) => {
                if (scope === 'user' && !user) {
                  toast({ title: 'Login Required', description: 'Log in to see your jokes.', variant: 'destructive' });
                  setDraft((prev) => ({ ...prev, scope: 'public' }));
                } else {
                  setDraft((prev) => ({ ...prev, scope }));
                }
              }}
              disabled={authLoading}
            >
              <SelectTrigger id="filter-scope-select" className="col-span-3 text-sm">
                <SelectValue placeholder="Select view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public" className="text-sm">
                  <div className="flex items-center gap-2"> <Users className="h-4 w-4" /> All Jokes</div>
                </SelectItem>
                <SelectItem value="user" disabled={!user || authLoading} className="text-sm">
                  <div className="flex items-center gap-2"> <User className="h-4 w-4" /> My Jokes</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                      <Badge variant="secondary" className="py-0.5 pl-1.5 pr-1 gap-1">
                        {category}
                        <button
                          type="button"
                          aria-label={`Remove category ${category}`}
                          className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                          onClick={() => toggleCategory(category)}
                        >
                          <XIcon className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="modal-funny-rate-filter" className="text-right">Rating</Label>
            <Select
              value={draft.filterFunnyRate.toString()}
              onValueChange={(rate) =>
                setDraft((prev) => ({ ...prev, filterFunnyRate: Number.parseInt(rate, 10) }))
              }
            >
              <SelectTrigger id="modal-funny-rate-filter" className="col-span-3">
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
          </div>

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
        </div>
        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleApply}>Apply Filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
