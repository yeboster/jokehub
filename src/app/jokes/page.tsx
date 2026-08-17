
"use client";

import { useState, useMemo, useEffect, Suspense, type KeyboardEvent, useRef } from 'react';
import type { FilterParams } from '@/contexts/JokeContext';
import { useJokes } from '@/contexts/JokeContext';
import { useAuth } from '@/contexts/AuthContext';
import JokeList from '@/components/joke-list';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ChevronDown, RotateCcw, Filter as FilterIcon, Check, ChevronsUpDown, XIcon, PlusCircle, Users, User, Search } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogTrigger, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const defaultPageFilters: FilterParams = {
  scope: 'public',
  selectedCategories: [],
  filterFunnyRate: -1,
  usageStatus: 'all',
  search: '',
};

function JokesPageComponent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const {
    jokes,
    categories: allCategoriesFromContext,
    loadJokesWithFilters,
    loadMoreFilteredJokes,
    hasMoreJokes,
    loadingInitialJokes,
    loadingMoreJokes
   } = useJokes();

  const [activeFilters, setActiveFilters] = useState<FilterParams>(defaultPageFilters);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isCategoryPopoverOpen, setIsCategoryPopoverOpen] = useState(false);

  // State for controls inside the modal
  const [tempSearch, setTempSearch] = useState<string>('');
  const [tempScope, setTempScope] = useState<FilterParams['scope']>(defaultPageFilters.scope);
  const [tempSelectedCategories, setTempSelectedCategories] = useState<string[]>(defaultPageFilters.selectedCategories);
  const [tempFilterFunnyRate, setTempFilterFunnyRate] = useState<number>(defaultPageFilters.filterFunnyRate);
  const [tempUsageStatus, setTempUsageStatus] = useState<FilterParams['usageStatus']>(defaultPageFilters.usageStatus);
  const [categorySearch, setCategorySearch] = useState('');

  const modalSearchInputRef = useRef<HTMLInputElement>(null);

  // Serialized filters last applied from the URL. The fetch effect below stays
  // idle until `activeFilters` matches this, so a filtered deep link doesn't
  // fire one query with the defaults and a second with the synced filters.
  const syncedFiltersRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const queryScope = searchParams.get('scope') as FilterParams['scope'] || defaultPageFilters.scope;
    const queryCategoriesRaw = searchParams.get('categories');
    const queryCategories = queryCategoriesRaw ? queryCategoriesRaw.split(',').filter(c => c.trim() !== '') : defaultPageFilters.selectedCategories;

    const queryFunnyRateRaw = searchParams.get('funnyRate');
    let parsedFunnyRate = defaultPageFilters.filterFunnyRate;
    if (queryFunnyRateRaw !== null) {
        const tempRate = parseInt(queryFunnyRateRaw, 10);
        if (!isNaN(tempRate) && tempRate >= -1 && tempRate <= 5) {
            parsedFunnyRate = tempRate;
        }
    }

    const queryUsageStatus = searchParams.get('usageStatus') as FilterParams['usageStatus'] || defaultPageFilters.usageStatus;
    const querySearch = searchParams.get('search') || defaultPageFilters.search;

    let effectiveScope = queryScope;
    if (queryScope === 'user' && !user) {
        effectiveScope = 'public';
    }

    const filtersFromUrl: FilterParams = {
      scope: effectiveScope,
      selectedCategories: queryCategories,
      filterFunnyRate: parsedFunnyRate,
      usageStatus: ['all', 'used', 'unused'].includes(queryUsageStatus) ? queryUsageStatus : defaultPageFilters.usageStatus,
      search: querySearch,
    };

    syncedFiltersRef.current = JSON.stringify(filtersFromUrl);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync of filter state from the URL query string on mount/navigation.
    setActiveFilters(prevFilters => {
      if (JSON.stringify(prevFilters) === JSON.stringify(filtersFromUrl)) {
        return prevFilters;
      }
      return filtersFromUrl;
    });

    // Update temp states for modal
    setTempScope(filtersFromUrl.scope);
    setTempSelectedCategories([...filtersFromUrl.selectedCategories]);
    setTempFilterFunnyRate(filtersFromUrl.filterFunnyRate);
    setTempUsageStatus(filtersFromUrl.usageStatus);
    setTempSearch(filtersFromUrl.search);

  }, [searchParams, user, authLoading]);

  // This page owns its fetch — the provider no longer loads jokes on its own.
  // Categories only feed the filter dialog, so the list no longer waits on
  // them; we do wait for auth, because the URL→filter sync above resolves
  // `scope` against `user` and we'd otherwise fetch a scope we're about to change.
  // We also wait for that sync to land in state: the effect above runs first in
  // the same commit, but `activeFilters` here is still the pre-sync value, so
  // fetching now would bill a full paginated query we immediately discard.
  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (syncedFiltersRef.current !== JSON.stringify(activeFilters)) {
      return;
    }
    loadJokesWithFilters(activeFilters);

  }, [authLoading, activeFilters, loadJokesWithFilters]);

  const updateUrlWithFilters = (filters: FilterParams) => {
    const queryParams = new URLSearchParams();
    if (filters.scope !== defaultPageFilters.scope) {
      queryParams.set('scope', filters.scope);
    }
    if (filters.selectedCategories.length > 0) {
      queryParams.set('categories', filters.selectedCategories.join(','));
    }
    if (filters.filterFunnyRate !== defaultPageFilters.filterFunnyRate) {
      queryParams.set('funnyRate', filters.filterFunnyRate.toString());
    }
    if (filters.usageStatus !== defaultPageFilters.usageStatus) {
      queryParams.set('usageStatus', filters.usageStatus);
    }
    if (filters.search) {
      queryParams.set('search', filters.search);
    }

    const queryString = queryParams.toString();
    router.push(queryString ? `/jokes?${queryString}` : '/jokes');
  };

  const handleApplyFilters = () => {
    const validatedSelectedCategories = tempSelectedCategories.filter(cat => modalCategoryNames.includes(cat));

    const newFilters: FilterParams = {
      ...activeFilters,
      scope: tempScope,
      selectedCategories: validatedSelectedCategories,
      filterFunnyRate: tempFilterFunnyRate,
      usageStatus: tempUsageStatus,
      search: tempSearch,
    };

    updateUrlWithFilters(newFilters);
    setIsFilterModalOpen(false);
  };
  
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        handleApplyFilters();
    }
  };


  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- early-return guard inside useMemo is intentional; compiler inference is too conservative here.
  const modalCategoryNames = useMemo(() => {
    if (!allCategoriesFromContext || allCategoriesFromContext.length === 0) {
        return [];
    }
    // Ensure unique category names, case-insensitive for uniqueness check but preserve original casing for display
    const nameMap = new Map<string, string>();
    allCategoriesFromContext.forEach(cat => {
      const trimmedName = cat.name.trim();
      if (trimmedName && !nameMap.has(trimmedName.toLowerCase())) {
        nameMap.set(trimmedName.toLowerCase(), trimmedName);
      }
    });
    return Array.from(nameMap.values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [allCategoriesFromContext]);


  const jokesToDisplay = useMemo(() => jokes ?? [], [jokes]);

  const handleOpenFilterModal = (focusSearch: boolean = false) => {
    setTempScope(activeFilters.scope);
    setTempSelectedCategories([...activeFilters.selectedCategories]);
    setTempFilterFunnyRate(activeFilters.filterFunnyRate);
    setTempUsageStatus(activeFilters.usageStatus);
    setTempSearch(activeFilters.search);
    setCategorySearch('');
    setIsFilterModalOpen(true);

    if (focusSearch) {
        setTimeout(() => {
            modalSearchInputRef.current?.focus();
        }, 100); // Small delay to allow dialog to render
    }
  };

  const handleClearFilters = () => {
    router.push('/jokes');
  };


  const getFunnyRateLabel = (rate: number): string => {
    if (rate === 0) return "Unrated";
    if (rate === -1) return "Any Rating";
    return `${rate} Star${rate > 1 ? 's' : ''}`;
  };

  const toggleCategorySelectionInModal = (categoryName: string) => {
    setTempSelectedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  const filteredCategoryOptionsForModal = useMemo(() => {
    if (!modalCategoryNames) return [];
    if (!categorySearch) return modalCategoryNames;
    return modalCategoryNames.filter(name =>
      name.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [modalCategoryNames, categorySearch]);

  const hasActiveAppliedFilters = useMemo(() =>
    activeFilters.scope !== defaultPageFilters.scope ||
    activeFilters.selectedCategories.length > 0 ||
    activeFilters.filterFunnyRate !== defaultPageFilters.filterFunnyRate ||
    activeFilters.usageStatus !== defaultPageFilters.usageStatus ||
    activeFilters.search !== defaultPageFilters.search,
  [activeFilters]);

  const pageTitle = activeFilters.scope === 'user' && user ? "My Joke Collection" : "All Jokes Feed";
  const pageDescription = activeFilters.scope === 'user' && user
    ? "Manage and filter your personal joke collection."
    : "Browse, filter, and enjoy jokes from the community. Add your own too!";

  const isPageLoading = authLoading || (loadingInitialJokes && jokes === null) || allCategoriesFromContext === null;

  if (isPageLoading) {
    return (
      <div className="container mx-auto p-4 md:p-8 flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2 text-muted-foreground">Loading jokes and categories...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-5xl">{pageTitle}</h1>
        <p className="mt-3 text-lg text-muted-foreground sm:text-xl">
          {pageDescription}
        </p>
      </header>

      <div className="mb-6 p-4 flex items-center gap-x-2 gap-y-3 border-b pb-6">
        <Dialog open={isFilterModalOpen} onOpenChange={(isOpen) => {
          if (!isOpen) {
            setTempScope(activeFilters.scope);
            setTempSelectedCategories([...activeFilters.selectedCategories]);
            setTempFilterFunnyRate(activeFilters.filterFunnyRate);
            setTempUsageStatus(activeFilters.usageStatus);
            setTempSearch(activeFilters.search);
            setCategorySearch('');
          }
          setIsFilterModalOpen(isOpen);
        }}>
            <Button variant="outline" size="icon" onClick={() => handleOpenFilterModal(true)} className="h-9 w-9 shrink-0">
                <Search className="h-4 w-4" />
                <span className="sr-only">Search</span>
            </Button>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => handleOpenFilterModal(false)} className="h-9">
                <FilterIcon className="mr-2 h-4 w-4" />
                Filters
                {hasActiveAppliedFilters && <span className="ml-2 h-2 w-2 rounded-full bg-primary" />}
                </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Filter & Search Jokes</DialogTitle>
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
                  ref={modalSearchInputRef}
                  id="modal-search-input"
                  placeholder="Search joke text..."
                  value={tempSearch}
                  onChange={(e) => setTempSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="filter-scope-select" className="text-right">
                  Show Jokes
                </Label>
                <Select
                  value={tempScope}
                  onValueChange={(value: FilterParams['scope']) => {
                    if (value === 'user' && !user) {
                      toast({ title: 'Login Required', description: 'Log in to see your jokes.', variant: 'destructive'});
                      setTempScope('public');
                    } else {
                      setTempScope(value);
                    }
                  }}
                  disabled={authLoading}
                >
                  <SelectTrigger id="filter-scope-select" className="col-span-3 text-sm">
                    <SelectValue placeholder="Select view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public" className="text-sm">
                      <div className="flex items-center gap-2"> <Users className="h-4 w-4"/> All Jokes</div>
                    </SelectItem>
                    <SelectItem value="user" disabled={!user || authLoading} className="text-sm">
                       <div className="flex items-center gap-2"> <User className="h-4 w-4"/> My Jokes</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="modal-category-filter" className="text-right pt-2">
                  Categories
                </Label>
                <Popover open={isCategoryPopoverOpen} onOpenChange={setIsCategoryPopoverOpen}>
                  <PopoverTrigger asChild className="col-span-3">
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isCategoryPopoverOpen}
                      className="w-full justify-between text-left font-normal h-auto min-h-10"
                       disabled={allCategoriesFromContext === null || modalCategoryNames.length === 0}
                    >
                      <div className="flex flex-wrap gap-1">
                        {tempSelectedCategories.length === 0 && <span className="text-muted-foreground">Select categories...</span>}
                        {tempSelectedCategories.map(cat => (
                          <Badge key={cat} variant="secondary" className="py-0.5 px-1.5">
                            {cat}
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Remove category ${cat}`}
                              className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); toggleCategorySelectionInModal(cat);}}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleCategorySelectionInModal(cat);
                                }
                              }}
                            >
                              <XIcon className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </span>
                          </Badge>
                        ))}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-60 overflow-hidden" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search categories..."
                        value={categorySearch}
                        onValueChange={setCategorySearch}
                        className="h-9"
                      />
                      <CommandList className="max-h-[204px]"> {/* This ensures internal scroll for categories */}
                        <CommandEmpty>{modalCategoryNames.length === 0 ? "No categories available." : "No categories found."}</CommandEmpty>
                        <CommandGroup>
                          {filteredCategoryOptionsForModal.map((categoryName) => (
                            <CommandItem
                              key={categoryName}
                              value={categoryName}
                              onSelect={() => {
                                toggleCategorySelectionInModal(categoryName);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  tempSelectedCategories.includes(categoryName) ? "opacity-100" : "opacity-0"
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
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-funny-rate-filter" className="text-right">Rating</Label>
                <Select
                  value={tempFilterFunnyRate.toString()}
                  onValueChange={(value) => setTempFilterFunnyRate(parseInt(value, 10))}
                >
                  <SelectTrigger id="modal-funny-rate-filter" className="col-span-3">
                    <SelectValue placeholder="Select rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">Any Rating</SelectItem>
                    <SelectItem value="0">Unrated</SelectItem>
                    {[1, 2, 3, 4, 5].map(rate => (
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
                  value={tempUsageStatus}
                  onValueChange={(value: FilterParams['usageStatus']) => setTempUsageStatus(value)}
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
              <Button variant="outline" onClick={() => setIsFilterModalOpen(false)}>Cancel</Button>
              <Button onClick={handleApplyFilters}>Apply Filters</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex flex-wrap items-center gap-2 flex-grow min-h-[36px]">
          {activeFilters.search && (
            <Badge variant="secondary" className="py-1 px-2">Search: &quot;{activeFilters.search}&quot;</Badge>
          )}
          {activeFilters.scope === 'user' && user && (
            <Badge variant="secondary" className="py-1 px-2 bg-primary/10 text-primary border-primary/30">Showing: My Jokes</Badge>
          )}
          {activeFilters.selectedCategories.map(category => (
             <Badge key={category} variant="secondary" className="py-1 px-2">Category: {category}</Badge>
          ))}
          {activeFilters.filterFunnyRate !== -1 && (
            <Badge variant="secondary" className="py-1 px-2">Rating: {getFunnyRateLabel(activeFilters.filterFunnyRate)}</Badge>
          )}
          {activeFilters.usageStatus === 'used' && (
            <Badge variant="secondary" className="py-1 px-2">Status: Used</Badge>
          )}
          {activeFilters.usageStatus === 'unused' && (
            <Badge variant="secondary" className="py-1 px-2">Status: Unused</Badge>
          )}
        </div>

        <div className="flex items-center ml-auto">
            {user ? (
                <Button variant="default" size="sm" className="h-9" asChild>
                    <Link href="/add-joke">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add New Joke
                    </Link>
                </Button>
            ) : (
                <Button variant="default" size="sm" asChild className="h-9">
                    <Link href="/auth?redirect=/add-joke">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Log in to Add Jokes
                    </Link>
                </Button>
            )}

            {hasActiveAppliedFilters && (
                <Button variant="ghost" onClick={handleClearFilters} className="ml-2 text-sm p-2 h-auto self-center">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear All
                </Button>
            )}
        </div>
      </div>

      <JokeList jokes={jokesToDisplay} />

      <div className="mt-8 text-center">
        {hasMoreJokes ? (
          <Button
            onClick={loadMoreFilteredJokes}
            disabled={loadingMoreJokes}
            variant="outline"
            size="lg"
          >
            {loadingMoreJokes ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <ChevronDown className="mr-2 h-5 w-5" />
            )}
            {loadingMoreJokes ? 'Loading...' : 'Load More Jokes'}
          </Button>
        ) : (
          jokesToDisplay.length > 0 && !loadingInitialJokes && <p className="text-muted-foreground">No more jokes to load for the current filters.</p>
        )}
      </div>
    </div>
  );
}

export default function JokesPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 md:p-8 flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2 text-muted-foreground">Loading page...</p>
      </div>
    }>
      <JokesPageComponent />
    </Suspense>
  );
}

    
