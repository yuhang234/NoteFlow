import { invoke } from '@tauri-apps/api/core';

// Type definitions matching Rust structs
export interface NoteMeta {
  id: string;
  type: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  archived: boolean;
  workspace_id: string | null;
  location: Location | null;
  relations: string[];
  parent_id: string | null;
  reactions: Reaction[];
}

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  note: string | null;
}

export interface Reaction {
  emoji: string;
  count: number;
}

export interface NoteFile {
  meta: NoteMeta;
  content: string;
  file_path: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string | null;
  order: number;
}

export interface SearchResult {
  note_id: string;
  title: string;
  snippet: string;
  score: number;
  created_at: string;
  tags: string[];
}

export interface TagSetting {
  tag: string;
  color: string | null;
  blur: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  icon: string;
  filter_expression: string;
  description: string;
  sort_by: string;
  sort_order: string;
  show_in_sidebar: boolean;
}

export interface NoteStats {
  total: number;
  recent_created: number;
  recent_modified: number;
  pinned: number;
  archived: number;
  with_attachments: number;
  with_code: number;
  with_links: number;
  with_location: number;
  with_tasks: number;
  incomplete_tasks: number;
}

export interface AttachmentInfo {
  filename: string;
  path: string;
  size: number;
  mime_type: string;
  note_id: string;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  created_at: string;
}

export interface AppConfig {
  data_dir: string;
  theme: string;
  language: string;
  editor_font_size: number;
  week_start_day: number;
  auto_save_interval: number;
  close_to_tray: boolean;
  auto_backup: boolean;
  backup_interval_hours: number;
  max_backups: number;
  file_watch_enabled: boolean;
}

// API functions
export const api = {
  createNote: (content: string, workspace_id?: string) =>
    invoke<NoteFile>('create_note', { content, workspaceId: workspace_id }),
  getNote: (id: string) => invoke<NoteFile>('get_note', { id }),
  updateNote: (id: string, content: string, meta: Partial<NoteMeta>) =>
    invoke<void>('update_note', { id, content, meta }),
  deleteNote: (id: string) => invoke<void>('delete_note', { id }),
  restoreNote: (id: string) => invoke<void>('restore_note', { id }),
  permanentDeleteNote: (id: string) =>
    invoke<void>('permanent_delete_note', { id }),
  listNotes: (
    workspace_id?: string,
    sort_by?: string,
    sort_order?: string,
    limit?: number,
    offset?: number
  ) =>
    invoke<NoteFile[]>('list_notes', {
      workspaceId: workspace_id,
      sortBy: sort_by,
      sortOrder: sort_order,
      limit,
      offset,
    }),
  listTrash: () => invoke<NoteFile[]>('list_trash'),
  pinNote: (id: string, pinned: boolean) =>
    invoke<void>('pin_note', { id, pinned }),
  archiveNote: (id: string, archived: boolean) =>
    invoke<void>('archive_note', { id, archived }),
  moveNoteToWorkspace: (id: string, workspace_id: string | null) =>
    invoke<void>('move_note_to_workspace', { id, workspaceId: workspace_id }),
  addRelation: (id: string, related_id: string) =>
    invoke<void>('add_relation', { id, relatedId: related_id }),
  removeRelation: (id: string, related_id: string) =>
    invoke<void>('remove_relation', { id, relatedId: related_id }),
  addReaction: (id: string, emoji: string) =>
    invoke<void>('add_reaction', { id, emoji }),
  removeReaction: (id: string, emoji: string) =>
    invoke<void>('remove_reaction', { id, emoji }),
  searchNotes: (query: string, limit?: number, offset?: number) =>
    invoke<SearchResult[]>('search_notes', { query, limit, offset }),
  getAllTags: () => invoke<[string, number][]>('get_all_tags'),
  getWorkspaces: () => invoke<Workspace[]>('get_workspaces'),
  createWorkspace: (
    name: string,
    description: string,
    icon: string,
    color?: string
  ) =>
    invoke<Workspace>('create_workspace', { name, description, icon, color }),
  updateWorkspace: (workspace: Workspace) =>
    invoke<void>('update_workspace', { workspace }),
  deleteWorkspace: (id: string) => invoke<void>('delete_workspace', { id }),
  getConfig: () => invoke<AppConfig>('get_config'),
  saveConfig: (config: AppConfig) => invoke<void>('save_config', { config }),
  getStats: () => invoke<NoteStats>('get_stats'),
  getNotesByDate: (date: string) =>
    invoke<string[]>('get_notes_by_date', { date }),
  getNotesCountByMonth: (year: number, month: number) =>
    invoke<[number, number][]>('get_notes_count_by_month', { year, month }),
  addAttachment: (noteId: string, sourcePath: string) =>
    invoke<string>('add_attachment', { noteId, sourcePath }),
  listAttachments: (noteId: string) =>
    invoke<AttachmentInfo[]>('list_attachments', { noteId }),
  getViews: () => invoke<SavedView[]>('get_views'),
  saveView: (view: SavedView) => invoke<void>('save_view', { view }),
  deleteView: (id: string) => invoke<void>('delete_view', { id }),
  createBackup: () => invoke<string>('create_backup'),
  listBackups: () => invoke<BackupInfo[]>('list_backups'),
  rebuildIndex: () => invoke<number>('rebuild_index'),
  saveDraft: (id: string, content: string, workspaceId?: string) =>
    invoke<void>('save_draft', { id, content, workspaceId }),
  getDraft: (id: string) => invoke<string | null>('get_draft', { id }),
  listDrafts: () => invoke<any[]>('list_drafts'),
  deleteDraft: (id: string) => invoke<void>('delete_draft', { id }),
};
