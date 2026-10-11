import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNoteStore } from "@/stores/note-store";
import { NoteDetail } from "@/components/NoteDetail";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentNote, getNoteById, isLoading } = useNoteStore();

  React.useEffect(() => {
    if (id) {
      getNoteById(id);
    }
  }, [id, getNoteById]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentNote) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-4">
        <p className="text-muted-foreground">未找到该笔记或已被删除</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> 返回时间线
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center px-4 py-2 border-b bg-card/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <NoteDetail key={currentNote.meta.id} note={currentNote} />
      </div>
    </div>
  );
}
