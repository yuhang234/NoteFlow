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
  Paperclip,
  Save,
  Check,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { NoteFile, api } from "@/lib/tauri-api";
import { useNoteStore } from "@/stores/note-store";
import { useUIStore, EditMode } from "@/stores/ui-store";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { TagInput } from "@/components/TagInput";
import { useExternalNoteChange } from "@/lib/vault-events";
import { Button } from "@/components/ui/button";

interface NoteDetailProps {
  note: NoteFile;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function NoteDetail({ note }: NoteDetailProps) {
  const { updateNote, deleteNote, pinNote, archiveNote } = useNoteStore();
  const { editMode, setEditMode, autoSaveInterval } = useUIStore();

  const [content, setContent] = React.useState(note.content);
  const [saveStatus, setSaveStatus] = React.useState<"saved" | "saving" | "unsaved">("saved");
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const splitRef = React.useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = React.useState(() => {
    const stored = Number(localStorage.getItem("noteflow-split-ratio"));
    return Number.isFinite(stored) && stored >= 0.2 && stored <= 0.8 ? stored : 0.5;
  });
  const [isResizing, setIsResizing] = React.useState(false);
  const contentRef = React.useRef(content);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  contentRef.current = content;

  const saveStatusRef = React.useRef(saveStatus);
  saveStatusRef.current = saveStatus;

  // Sync state if active note changes
  React.useEffect(() => {
    setContent(note.content);
    setSaveStatus("saved");
  }, [note.meta.id]);

  // Follow the store when the note is refreshed from disk, but never while
  // there are unsaved local edits.
  React.useEffect(() => {
    if (saveStatusRef.current !== "saved") return;
    setContent(note.content);
  }, [note.content]);

  // External edits (another editor, sync client) are reloaded instead of being
  // silently overwritten by the next autosave.
  useExternalNoteChange(note.file_path, note.meta.id, () => {
    if (saveStatusRef.current !== "saved") return;
    api
      .getNote(note.meta.id)
      .then((fresh) => {
        setContent(fresh.content);
        setSaveStatus("saved");
      })
      .catch((err) => console.error("Reload note failed:", err));
  });

  // Flush save on unmount or note switch
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        updateNote(note.meta.id, contentRef.current);
      }
    };
  }, [note.meta.id, updateNote]);

  const handleSave = React.useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setSaveStatus("saving");
    try {
      await updateNote(note.meta.id, contentRef.current);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Save note failed:", err);
      setSaveStatus("unsaved");
    }
  }, [note.meta.id, updateNote]);

  // Drag the divider between editor and preview.
  React.useEffect(() => {
    if (!isResizing) return;
    const handleMove = (event: MouseEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)));
    };
    const handleUp = () => {
      setIsResizing(false);
      setSplitRatio((ratio) => {
        localStorage.setItem("noteflow-split-ratio", ratio.toFixed(3));
        return ratio;
      });
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing]);

  // Keyboard shortcut Ctrl+S / Cmd+S
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setSaveStatus("unsaved");
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // Auto save debounced
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await updateNote(note.meta.id, newContent);
        setSaveStatus("saved");
      } catch (err) {
        console.error("Auto save failed:", err);
        setSaveStatus("unsaved");
      }
    }, Math.max(autoSaveInterval, 1) * 1000);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    let insertedMarkdown = "";

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const info = await api.uploadAttachment(note.meta.id, file.name, bytes);
        const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
        if (isImage) {
          insertedMarkdown += `\n\n![${info.filename}](${info.path})\n`;
        } else {
          insertedMarkdown += `\n\n[📎 ${info.filename}](${info.path})\n`;
        }
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }

    if (insertedMarkdown) {
      const newContent = content + insertedMarkdown;
      handleContentChange(newContent);
    }
    setIsUploading(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const filesToUpload: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          const filename =
            file.name === "image.png"
              ? `screenshot_${format(new Date(), "yyyyMMdd_HHmmss")}.png`
              : file.name;
          filesToUpload.push(new File([file], filename, { type: file.type }));
        }
      }
    }

    if (filesToUpload.length > 0) {
      e.preventDefault();
      await uploadFiles(filesToUpload);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  };

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
    const removed = tags.filter((t) => !newTags.includes(t));
    const added = newTags.filter((t) => !tags.includes(t));
    if (removed.length === 0 && added.length === 0) return;

    let next = content;
    for (const tag of removed) {
      // Remove the `#tag` token (plus one separating space) wherever it appears.
      const pattern = new RegExp(
        `[ \\t]*#${escapeRegExp(tag)}(?![\\w\\u4e00-\\u9fa5])`,
        "g"
      );
      next = next.replace(pattern, "");
    }
    if (added.length > 0) {
      const suffix = added.map((t) => `#${t}`).join(" ");
      next = `${next.replace(/\s*$/, "")}\n\n${suffix}\n`;
    }
    handleContentChange(next);
  };

  return (
    <div
      className="flex flex-col h-full bg-background relative"
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for uploading attachments */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Dragging Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center backdrop-blur-xs pointer-events-none">
          <div className="bg-card p-4 rounded-xl shadow-lg border border-border flex items-center gap-3 text-sm font-medium">
            <Paperclip className="h-5 w-5 text-primary animate-bounce" />
            松开鼠标将文件上传到此笔记
          </div>
        </div>
      )}

      {/* Top action bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {/* Save Status Badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border bg-background/80">
            {saveStatus === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                <span className="text-amber-500">保存中...</span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-muted-foreground">未保存修改</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span className="text-muted-foreground">已保存</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 hidden sm:flex">
            <Clock className="h-3.5 w-3.5" />
            <span>更新: {formattedUpdated}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Manual Save Button */}
          <Button
            variant={saveStatus === "unsaved" ? "default" : "outline"}
            size="sm"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            title="保存修改 (Ctrl+S)"
            className="h-7 text-xs gap-1.5 px-2.5 font-medium"
          >
            {saveStatus === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span>保存</span>
          </Button>

          {/* Upload Attachment Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="上传附件/图片 (支持直接拖拽或Ctrl+V截图粘贴)"
            className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            <span>附件</span>
          </Button>

          {/* Open Attachment Folder Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => api.openAttachmentFolder(note.meta.id)}
            title="在文件夹中查看此笔记的附件"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>

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
            className="h-7 w-7"
          >
            <Pin
              className={`h-3.5 w-3.5 ${
                note.meta.pinned ? "text-primary fill-primary" : ""
              }`}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => archiveNote(note.meta.id, !note.meta.archived)}
            title={note.meta.archived ? "取消归档" : "归档笔记"}
            className="h-7 w-7"
          >
            <Archive
              className={`h-3.5 w-3.5 ${
                note.meta.archived ? "text-primary fill-primary" : ""
              }`}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteNote(note.meta.id)}
            title="放入废纸篓"
            className="h-7 w-7 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
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
          <div
            ref={splitRef}
            className={`flex h-full ${isResizing ? "select-none cursor-col-resize" : ""}`}
          >
            <div className="h-full min-w-0" style={{ width: `${splitRatio * 100}%` }}>
              <MarkdownEditor value={content} onChange={handleContentChange} />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              title="拖动调整分栏宽度（双击恢复 50/50）"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsResizing(true);
              }}
              onDoubleClick={() => {
                setSplitRatio(0.5);
                localStorage.setItem("noteflow-split-ratio", "0.5");
              }}
              className="w-1.5 shrink-0 cursor-col-resize bg-border/60 hover:bg-primary/60 transition-colors"
            />
            <div className="h-full min-w-0 flex-1 bg-muted/10 overflow-hidden">
              <MarkdownPreview content={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
