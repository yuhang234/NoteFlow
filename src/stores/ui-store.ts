import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'paper';
export type EditMode = 'source' | 'preview' | 'split';

interface UIStoreState {
  sidebarOpen: boolean;
  noteListOpen: boolean;
  theme: Theme;
  editMode: EditMode;
  fontSize: number;
  autoSaveInterval: number; // in seconds
  quickCaptureOpen: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleNoteList: () => void;
  setNoteListOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  setEditMode: (mode: EditMode) => void;
  setFontSize: (size: number) => void;
  setQuickCaptureOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  sidebarOpen: true,
  noteListOpen: true,
  theme: (localStorage.getItem('noteflow-theme') as Theme) || 'light',
  editMode: (localStorage.getItem('noteflow-edit-mode') as EditMode) || 'split',
  fontSize: Number(localStorage.getItem('noteflow-font-size')) || 15,
  autoSaveInterval: 2,
  quickCaptureOpen: false,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleNoteList: () => set((state) => ({ noteListOpen: !state.noteListOpen })),
  setNoteListOpen: (open) => set({ noteListOpen: open }),
  setTheme: (theme) => {
    localStorage.setItem('noteflow-theme', theme);
    const root = document.documentElement;
    root.classList.remove('dark', 'paper');
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'paper') {
      root.classList.add('paper');
    }
    set({ theme });
  },
  setEditMode: (editMode) => {
    localStorage.setItem('noteflow-edit-mode', editMode);
    set({ editMode });
  },
  setFontSize: (fontSize) => {
    localStorage.setItem('noteflow-font-size', fontSize.toString());
    set({ fontSize });
  },
  setQuickCaptureOpen: (quickCaptureOpen) => set({ quickCaptureOpen }),
}));
