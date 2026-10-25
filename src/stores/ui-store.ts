import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'paper';
export type EditMode = 'source' | 'preview' | 'split';

interface UIStoreState {
  sidebarOpen: boolean;
  noteListOpen: boolean;
  /** Focus mode hides the sidebar and the note list, leaving only the note. */
  focusMode: boolean;
  theme: Theme;
  editMode: EditMode;
  fontSize: number;
  autoSaveInterval: number; // in seconds
  weekStartDay: 0 | 1; // 0 = Sunday, 1 = Monday
  quickCaptureOpen: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleNoteList: () => void;
  setNoteListOpen: (open: boolean) => void;
  toggleFocusMode: () => void;
  setFocusMode: (focusMode: boolean) => void;
  setTheme: (theme: Theme) => void;
  setEditMode: (mode: EditMode) => void;
  setFontSize: (size: number) => void;
  setAutoSaveInterval: (seconds: number) => void;
  setWeekStartDay: (day: 0 | 1) => void;
  setQuickCaptureOpen: (open: boolean) => void;
}

/** Keep the preview/editor font size in one CSS variable so both stay in sync. */
export function applyFontSize(size: number) {
  document.documentElement.style.setProperty('--noteflow-font-size', `${size}px`);
}

const initialFontSize = Number(localStorage.getItem('noteflow-font-size')) || 15;
applyFontSize(initialFontSize);

export const useUIStore = create<UIStoreState>((set) => ({
  sidebarOpen: true,
  noteListOpen: true,
  focusMode: false,
  theme: (localStorage.getItem('noteflow-theme') as Theme) || 'light',
  editMode: (localStorage.getItem('noteflow-edit-mode') as EditMode) || 'split',
  fontSize: initialFontSize,
  autoSaveInterval: Number(localStorage.getItem('noteflow-autosave-interval')) || 2,
  weekStartDay: localStorage.getItem('noteflow-week-start') === '0' ? 0 : 1,
  quickCaptureOpen: false,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleNoteList: () => set((state) => ({ noteListOpen: !state.noteListOpen })),
  setNoteListOpen: (open) => set({ noteListOpen: open }),
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setFocusMode: (focusMode) => set({ focusMode }),
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
    applyFontSize(fontSize);
    set({ fontSize });
  },
  setAutoSaveInterval: (seconds) => {
    const clamped = Math.min(Math.max(seconds, 1), 30);
    localStorage.setItem('noteflow-autosave-interval', clamped.toString());
    set({ autoSaveInterval: clamped });
  },
  setWeekStartDay: (weekStartDay) => {
    localStorage.setItem('noteflow-week-start', weekStartDay.toString());
    set({ weekStartDay });
  },
  setQuickCaptureOpen: (quickCaptureOpen) => set({ quickCaptureOpen }),
}));
