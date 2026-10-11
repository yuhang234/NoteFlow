import { create } from 'zustand';
import { api } from '@/lib/tauri-api';

interface TagStoreState {
  tags: [string, number][];
  selectedTag: string | null;
  isLoading: boolean;
  error: string | null;

  fetchTags: () => Promise<void>;
  selectTag: (tag: string | null) => void;
}

export const useTagStore = create<TagStoreState>((set) => ({
  tags: [],
  selectedTag: null,
  isLoading: false,
  error: null,

  fetchTags: async () => {
    set({ isLoading: true, error: null });
    try {
      const tags = await api.getAllTags();
      set({ tags, isLoading: false });
    } catch (err: any) {
      console.error('Failed to fetch tags:', err);
      set({ error: err?.toString() || '加载标签失败', isLoading: false });
    }
  },

  selectTag: (tag) => set({ selectedTag: tag }),
}));
