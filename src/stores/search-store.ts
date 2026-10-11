import { create } from 'zustand';
import { api, SearchResult } from '@/lib/tauri-api';

interface SearchStoreState {
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;

  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
}

export const useSearchStore = create<SearchStoreState>((set) => ({
  query: '',
  results: [],
  isLoading: false,
  error: null,

  setQuery: (query) => set({ query }),

  search: async (query) => {
    if (!query.trim()) {
      set({ query: '', results: [], isLoading: false });
      return;
    }
    set({ query, isLoading: true, error: null });
    try {
      const results = await api.searchNotes(query, 50, 0);
      set({ results, isLoading: false });
    } catch (err: any) {
      console.error('Failed to search notes:', err);
      set({ error: err?.toString() || '搜索失败', isLoading: false });
    }
  },

  clearSearch: () => set({ query: '', results: [], error: null, isLoading: false }),
}));
