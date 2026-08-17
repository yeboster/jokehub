"use client";

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';

export interface UseUserCategoriesResult {
  /** The signed-in user's category names: trimmed, de-duplicated case-insensitively, sorted. */
  categoryNames: string[];
  /** True while the category subscription has yet to deliver its first snapshot. */
  loadingCategories: boolean;
}

/**
 * The category list every category picker needs, in one shape. Both the
 * creatable combobox on the add/edit forms and the multi-select in the joke
 * filter dialog used to derive this separately (and slightly differently).
 */
export function useUserCategories(): UseUserCategoriesResult {
  const { categories, loadingCategories } = useJokes();
  const { user } = useAuth();

  const categoryNames = useMemo(() => {
    if (!categories || !user) return [];
    // Case-insensitive uniqueness, original casing preserved for display.
    const nameByLowercase = new Map<string, string>();
    for (const category of categories) {
      if (category.userId !== user.uid) continue;
      const trimmedName = category.name.trim();
      if (trimmedName && !nameByLowercase.has(trimmedName.toLowerCase())) {
        nameByLowercase.set(trimmedName.toLowerCase(), trimmedName);
      }
    }
    return Array.from(nameByLowercase.values()).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }, [categories, user]);

  return { categoryNames, loadingCategories };
}
