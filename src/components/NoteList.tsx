import * as React from "react";
import { NoteFile } from "@/lib/tauri-api";
import { NoteCard } from "@/components/NoteCard";
import { ArrowDownUp, FileText, PanelLeftClose } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNoteStore } from "@/stores/note-store";
import { useUIStore } from "@/stores/ui-store";

interface NoteListProps {
  notes: NoteFile[];
  selectedNoteId?: string;
  onSelectNote: (note: NoteFile) => void;
}

export function NoteList({ notes, selectedNoteId, onSelectNote }: NoteListProps) {
  const { sortBy, sortOrder, setSort } = useNoteStore();
  const toggleNoteList = useUIStore((state) => state.toggleNoteList);

  return (
    <div className="flex flex-col h-full bg-muted/20 border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/50 backdrop-blur-xs">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          笔记列表 ({notes.length})
        </span>

        <div className="flex items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">
              <ArrowDownUp className="h-3.5 w-3.5" />
              <span>排序</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSort("updated_at", "desc")}>
              修改时间 (最新优先)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSort("created_at", "desc")}>
              创建时间 (最新优先)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSort("title", "asc")}>
              标题 (A-Z)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={toggleNoteList}
          title="收起列表"
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <FileText className="h-8 w-8 opacity-40" />
            <p className="text-xs">暂无笔记</p>
          </div>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.meta.id}
              note={note}
              isSelected={note.meta.id === selectedNoteId}
              onClick={() => onSelectNote(note)}
            />
          ))
        )}
      </div>
    </div>
  );
}
