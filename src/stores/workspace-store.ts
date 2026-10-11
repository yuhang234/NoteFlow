import { create } from 'zustand';
import { api, Workspace } from '@/lib/tauri-api';

interface WorkspaceStoreState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description: string, icon: string, color?: string) => Promise<Workspace | null>;
  updateWorkspace: (workspace: Workspace) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  setActiveWorkspace: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await api.getWorkspaces();
      set({ workspaces, isLoading: false });
    } catch (err: any) {
      console.error('Failed to fetch workspaces:', err);
      set({ error: err?.toString() || '加载工作区失败', isLoading: false });
    }
  },

  createWorkspace: async (name, description, icon, color) => {
    try {
      const ws = await api.createWorkspace(name, description, icon, color);
      set((state) => ({ workspaces: [...state.workspaces, ws] }));
      return ws;
    } catch (err: any) {
      console.error('Failed to create workspace:', err);
      return null;
    }
  },

  updateWorkspace: async (workspace) => {
    try {
      await api.updateWorkspace(workspace);
      set((state) => ({
        workspaces: state.workspaces.map((w) => (w.id === workspace.id ? workspace : w)),
      }));
    } catch (err: any) {
      console.error('Failed to update workspace:', err);
    }
  },

  deleteWorkspace: async (id) => {
    try {
      await api.deleteWorkspace(id);
      set((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== id),
        activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
      }));
    } catch (err: any) {
      console.error('Failed to delete workspace:', err);
    }
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id });
  },
}));
