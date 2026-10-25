import * as React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Pin, Archive, Trash2, MoreHorizontal, Calendar, Tag as TagIcon, Smile } from "lucide-react";
import { NoteFile } from "@/lib/tauri-api";
import { useNoteStore } from "@/stores/note-store";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TagBadge } from "@/components/TagBadge";
import { useToast } from "@/components/ui/toast";
import { toPlainText } from "@/lib/markdown-text";

interface NoteCardProps {
  note: NoteFile;
  isSelected?: boolean;
  onClick?: () => void;
}

export function NoteCard({ note, isSelected = false, onClick }: NoteCardProps) {
  const { pinNote, archiveNote, deleteNote } = useNoteStore();
  const { toast } = useToast();

  // Extract title and snippet from markdown content
  const lines = note.content.trim().split("\n");
  const firstLine = lines[0] || "";
  const title = toPlainText(firstLine) || "无标题笔记";
  // Only the head of the body is needed for the snippet, and running the
  // Markdown stripper over a whole long note for every card is wasteful.
  const preview = toPlainText(lines.slice(1).join(" ").slice(0, 600)).slice(0, 120);

  // Extract tags: #tag pattern
  const tags = React.useMemo(() => {
    const matches = note.content.match(/#([\w\u4e00-\u9fa5]+)/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map((m) => m.slice(1))));
  }, [note.content]);

  // Show the last modification time; the creation time stays available on hover.
  const updatedAt = note.meta.updated_at || note.meta.created_at;
  const formattedDate = React.useMemo(() => {
    try {
      return format(new Date(updatedAt), "yyyy-MM-dd HH:mm", { locale: zhCN });
    } catch {
      return updatedAt;
    }
  }, [updatedAt]);

  const createdTitle = React.useMemo(() => {
    try {
      return `创建于 ${format(new Date(note.meta.created_at), "yyyy-MM-dd HH:mm", { locale: zhCN })}`;
    } catch {
      return "";
    }
  }, [note.meta.created_at]);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col gap-2 p-3.5 rounded-lg border text-card-foreground bg-card cursor-pointer transition-all hover:shadow-xs",
        isSelected
          ? "border-primary bg-primary/5 shadow-xs"
          : "hover:border-border/80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm line-clamp-1 leading-snug flex-1">
          {note.meta.pinned && (
            <Pin className="inline-block h-3.5 w-3.5 text-primary mr-1 fill-primary rotate-45" />
          )}
          {title}
        </h3>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  pinNote(note.meta.id, !note.meta.pinned);
                }}
              >
                <Pin className="mr-2 h-4 w-4" />
                {note.meta.pinned ? "取消置顶" : "置顶笔记"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  const archiving = !note.meta.archived;
                  void archiveNote(note.meta.id, archiving).then(() =>
                    toast({
                      title: archiving ? "已归档" : "已取消归档",
                      description: archiving
                        ? "可在「归档记录」中查看或恢复"
                        : undefined,
                      type: "success",
                    })
                  );
                }}
              >
                <Archive className="mr-2 h-4 w-4" />
                {note.meta.archived ? "取消归档" : "归档笔记"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNote(note.meta.id);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                放入废纸篓
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {preview && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {preview}
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {tags.slice(0, 3).map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground self-center">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1 pt-1 border-t border-border/40">
        <div className="flex items-center gap-1" title={createdTitle}>
          <Calendar className="h-3 w-3" />
          <span>{formattedDate}</span>
        </div>

        {note.meta.reactions && note.meta.reactions.length > 0 && (
          <div className="flex items-center gap-1">
            {note.meta.reactions.map((r, i) => (
              <span key={i} className="text-xs">
                {r.emoji} {r.count}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
