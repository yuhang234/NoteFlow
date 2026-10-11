import * as React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Calendar,
  Clock,
  Pin,
  Archive,
  Trash2,
  Columns2,
  FileCode,
  Eye,
  MapPin,
  Smile,
  Paperclip,
  Share2,
} from "lucide-react";
import { NoteFile } from "@/lib/tauri-api";
import { useNoteStore } from "@/stores/note-store";
import { useUIStore, EditMode } from "@/stores/ui-store";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { TagInput } from "@/components/TagInput";
import { Button } from "@/components/ui/button";

interface NoteDetailProps {
  note: NoteFile;
}

export function NoteDetail({ note }: NoteDetailProps) {
  const { updateNote, deleteNote, pinNote, archiveNote } = useNoteStore();
  const { editMode, setEditMode } = useUIStore();

  const [content, setContent] = React.useState(note.content);
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state if active note changes
  React.useEffect(() => {
    setContent(note.content);
  }, [note.meta.id]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // Auto save debounced
    saveTimeoutRef.current = setTimeout(() => {
      updateNote(note.meta.id, newContent);
    }, 1000);
  };

  const formattedCreated = React.useMemo(() => {
    try {
      return format(new Date(note.meta.created_at), "yyyy-MM-dd HH:mm:ss", {
        locale: zhCN,
      });
    } catch {
      return note.meta.created_at;
    }
  }, [note.meta.created_at]);

  const formattedUpdated = React.useMemo(() => {
    try {
      return format(new Date(note.meta.updated_at), "yyyy-MM-dd HH:mm:ss", {
        locale: zhCN,
      });
    } catch {
      return note.meta.updated_at;
    }
  }, [note.meta.updated_at]);

  // Extract tags
  const tags = React.useMemo(() => {
    const matches = content.match(/#([\w\u4e00-\u9fa5]+)/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map((m) => m.slice(1))));
  }, [content]);

  const handleTagsChange = (newTags: string[]) => {
    // Append any newly added tags to content
    const existingTags = tags;
    const added = newTags.filter((t) => !existingTags.includes(t));
    if (added.length > 0) {
      const appendStr = "\n\n" + added.map((t) => `#${t}`).join(" ");
      handleContentChange(content + appendStr);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top action bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>更新: {formattedUpdated}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Edit mode toggle */}
          <div className="flex items-center bg-muted rounded-md p-0.5 border">
            <button
              onClick={() => setEditMode("source")}
              className={`p-1.5 rounded-xs transition-colors ${
                editMode === "source"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="源码编辑模式"
            >
              <FileCode className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditMode("split")}
              className={`p-1.5 rounded-xs transition-colors ${
                editMode === "split"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="分屏双向预览"
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditMode("preview")}
              className={`p-1.5 rounded-xs transition-colors ${
                editMode === "preview"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="阅读预览模式"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => pinNote(note.meta.id, !note.meta.pinned)}
            title={note.meta.pinned ? "取消置顶" : "置顶笔记"}
          >
            <Pin
              className={`h-4 w-4 ${
                note.meta.pinned ? "text-primary fill-primary" : ""
              }`}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => archiveNote(note.meta.id, !note.meta.archived)}
            title={note.meta.archived ? "取消归档" : "归档笔记"}
          >
            <Archive
              className={`h-4 w-4 ${
                note.meta.archived ? "text-primary fill-primary" : ""
              }`}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteNote(note.meta.id)}
            title="删除"
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tags line */}
      <div className="px-4 py-2 border-b border-border/50">
        <TagInput tags={tags} onChange={handleTagsChange} />
      </div>

      {/* Editor & Preview Workspace */}
      <div className="flex-1 overflow-hidden">
        {editMode === "source" && (
          <MarkdownEditor value={content} onChange={handleContentChange} />
        )}
        {editMode === "preview" && <MarkdownPreview content={content} />}
        {editMode === "split" && (
          <div className="flex h-full divide-x divide-border">
            <div className="w-1/2 h-full">
              <MarkdownEditor value={content} onChange={handleContentChange} />
            </div>
            <div className="w-1/2 h-full bg-muted/10">
              <MarkdownPreview content={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
