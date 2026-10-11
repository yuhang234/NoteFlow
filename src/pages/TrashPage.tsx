import * as React from "react";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { useNoteStore } from "@/stores/note-store";
import { Button } from "@/components/ui/button";

export function TrashPage() {
  const { trashNotes, fetchTrash, restoreNote, permanentDeleteNote } = useNoteStore();

  React.useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            废纸篓
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            已被删除的笔记会保留在这里，你可以选择将其彻底粉碎或恢复至原处。
          </p>
        </div>

        {trashNotes.length === 0 ? (
          <div className="border rounded-lg p-12 text-center bg-card/40">
            <Trash2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-sm font-semibold">废纸篓是空的</h3>
            <p className="text-xs text-muted-foreground mt-1">
              没有被删除的笔记。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {trashNotes.map((note) => {
              const title =
                note.content.trim().split("\n")[0].replace(/^#+\s*/, "") ||
                "无标题笔记";
              const snippet = note.content.slice(0, 100);

              return (
                <div
                  key={note.meta.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex-1 pr-4">
                    <h3 className="text-sm font-semibold truncate">{title}</h3>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {snippet}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restoreNote(note.meta.id)}
                      className="text-xs gap-1"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> 恢复
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("确定要永久删除此笔记吗？该操作不可逆！")) {
                          permanentDeleteNote(note.meta.id);
                        }
                      }}
                      className="text-xs gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 彻底删除
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
