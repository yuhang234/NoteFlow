import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNoteStore } from "@/stores/note-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

interface CreateNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateNoteDialog({ open, onOpenChange }: CreateNoteDialogProps) {
  const [content, setContent] = React.useState("");
  const { createNote } = useNoteStore();
  const { activeWorkspaceId } = useWorkspaceStore();

  const handleCreate = async () => {
    if (!content.trim()) return;
    await createNote(content, activeWorkspaceId || undefined);
    setContent("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>新建笔记</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Textarea
            rows={8}
            placeholder="# 笔记标题&#10;&#10;写下今天的新想法、任务或者灵感..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full font-mono text-sm resize-none"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!content.trim()}>
            创建笔记
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
