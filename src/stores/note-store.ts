import { create } from 'zustand';
import { api, NoteFile, NoteMeta } from '@/lib/tauri-api';

interface NoteStoreState {
  notes: NoteFile[];
  trashNotes: NoteFile[];
  currentNote: NoteFile | null;
  isLoading: boolean;
  error: string | null;
  selectedWorkspaceId: string | null;
  sortBy: string;
  sortOrder: string;

  // Actions
  fetchNotes: (workspaceId?: string) => Promise<void>;
  fetchTrash: () => Promise<void>;
  selectNote: (note: NoteFile | null) => void;
  getNoteById: (id: string) => Promise<NoteFile | null>;
  createNote: (content: string, workspaceId?: string) => Promise<NoteFile | null>;
  updateNote: (id: string, content: string, meta?: Partial<NoteMeta>) => Promise<NoteFile | undefined>;
  deleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentDeleteNote: (id: string) => Promise<void>;
  pinNote: (id: string, pinned: boolean) => Promise<void>;
  archiveNote: (id: string, archived: boolean) => Promise<void>;
  moveNoteToWorkspace: (id: string, workspaceId: string | null) => Promise<void>;
  setWorkspaceFilter: (workspaceId: string | null) => void;
  setSort: (sortBy: string, sortOrder: string) => void;
}

export const useNoteStore = create<NoteStoreState>((set, get) => ({
  notes: [],
  trashNotes: [],
  currentNote: null,
  isLoading: false,
  error: null,
  selectedWorkspaceId: null,
  sortBy: 'updated_at',
  sortOrder: 'desc',

  fetchNotes: async (workspaceId) => {
    set({ isLoading: true, error: null });
    try {
      const activeWs = workspaceId !== undefined ? workspaceId : (get().selectedWorkspaceId || undefined);
      const notes = await api.listNotes(
        activeWs,
        get().sortBy,
        get().sortOrder
      );
      set({ notes, isLoading: false });
    } catch (err: any) {
      console.error('Failed to fetch notes:', err);
      set({ error: err?.toString() || '加载笔记失败', isLoading: false });
    }
  },

  fetchTrash: async () => {
    set({ isLoading: true, error: null });
    try {
      const trashNotes = await api.listTrash();
      set({ trashNotes, isLoading: false });
    } catch (err: any) {
      console.error('Failed to fetch trash:', err);
      set({ error: err?.toString() || '加载废纸篓失败', isLoading: false });
    }
  },

  selectNote: (note) => {
    set({ currentNote: note });
  },

  getNoteById: async (id: string) => {
    try {
      const note = await api.getNote(id);
      set({ currentNote: note });
      return note;
    } catch (err) {
      console.error(`Failed to get note ${id}:`, err);
      return null;
    }
  },

  createNote: async (content: string, workspaceId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const targetWorkspace = workspaceId ?? (get().selectedWorkspaceId || undefined);
      const newNote = await api.createNote(content, targetWorkspace);
      set((state) => ({
        notes: [newNote, ...state.notes],
        currentNote: newNote,
        isLoading: false,
      }));
      return newNote;
    } catch (err: any) {
      console.error('Failed to create note:', err);
      set({ error: err?.toString() || '创建笔记失败', isLoading: false });
      return null;
    }
  },

  updateNote: async (id: string, content: string, meta?: Partial<NoteMeta>) => {
    try {
      const updatedNote = await api.updateNote(id, content, meta);
      set((state) => {
        const updatedNotes = state.notes.map((n) => {
          if (n.meta.id === id) {
            return updatedNote || {
              ...n,
              content,
              meta: {
                ...n.meta,
                ...meta,
                updated_at: new Date().toISOString(),
              },
            };
          }
          return n;
        });

        const updatedCurrent =
          state.currentNote?.meta.id === id
            ? (updatedNote || {
                ...state.currentNote,
                content,
                meta: {
                  ...state.currentNote.meta,
                  ...meta,
                  updated_at: new Date().toISOString(),
                },
              })
            : state.currentNote;

        return { notes: updatedNotes, currentNote: updatedCurrent, error: null };
      });
      return updatedNote;
    } catch (err: any) {
      console.error(`Failed to update note ${id}:`, err);
      set({ error: err?.toString() || '更新笔记失败' });
      throw err;
    }
  },

  deleteNote: async (id: string) => {
    try {
      await api.deleteNote(id);
      set((state) => ({
        notes: state.notes.filter((n) => n.meta.id !== id),
        currentNote: state.currentNote?.meta.id === id ? null : state.currentNote,
      }));
    } catch (err: any) {
      console.error(`Failed to delete note ${id}:`, err);
      set({ error: err?.toString() || '删除笔记失败' });
    }
  },

  restoreNote: async (id: string) => {
    try {
      await api.restoreNote(id);
      await get().fetchTrash();
      await get().fetchNotes();
    } catch (err: any) {
      console.error(`Failed to restore note ${id}:`, err);
      set({ error: err?.toString() || '恢复笔记失败' });
    }
  },

  permanentDeleteNote: async (id: string) => {
    try {
      await api.permanentDeleteNote(id);
      set((state) => ({
        trashNotes: state.trashNotes.filter((n) => n.meta.id !== id),
      }));
    } catch (err: any) {
      console.error(`Failed to permanently delete note ${id}:`, err);
      set({ error: err?.toString() || '彻底删除笔记失败' });
    }
  },

  pinNote: async (id: string, pinned: boolean) => {
    try {
      await api.pinNote(id, pinned);
      set((state) => ({
        notes: state.notes.map((n) =>
          n.meta.id === id
            ? { ...n, meta: { ...n.meta, pinned } }
            : n
        ),
        currentNote:
          state.currentNote?.meta.id === id
            ? {
                ...state.currentNote,
                meta: { ...state.currentNote.meta, pinned },
              }
            : state.currentNote,
      }));
    } catch (err: any) {
      console.error(`Failed to pin note ${id}:`, err);
    }
  },

  archiveNote: async (id: string, archived: boolean) => {
    try {
      await api.archiveNote(id, archived);
      set((state) => ({
        notes: state.notes.map((n) =>
          n.meta.id === id
            ? { ...n, meta: { ...n.meta, archived } }
            : n
        ),
        currentNote:
          state.currentNote?.meta.id === id
            ? {
                ...state.currentNote,
                meta: { ...state.currentNote.meta, archived },
              }
            : state.currentNote,
      }));
    } catch (err: any) {
      console.error(`Failed to archive note ${id}:`, err);
    }
  },

  moveNoteToWorkspace: async (id: string, workspaceId: string | null) => {
    try {
      await api.moveNoteToWorkspace(id, workspaceId);
      await get().fetchNotes();
    } catch (err: any) {
      console.error(`Failed to move note ${id}:`, err);
    }
  },

  setWorkspaceFilter: (workspaceId: string | null) => {
    set({ selectedWorkspaceId: workspaceId });
    get().fetchNotes(workspaceId || undefined);
  },

  setSort: (sortBy: string, sortOrder: string) => {
    set({ sortBy, sortOrder });
    get().fetchNotes();
  },
}));
