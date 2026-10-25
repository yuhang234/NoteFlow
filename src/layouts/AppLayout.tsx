import * as React from "react";
import { Outlet } from "react-router-dom";
import { PanelLeftOpen, Minimize2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { CreateNoteDialog } from "@/components/CreateNoteDialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useVaultEvents } from "@/lib/vault-events";

export function AppLayout() {
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const { sidebarOpen, toggleSidebar, focusMode, toggleFocusMode } = useUIStore();

  // React to edits made outside NoteFlow (other editors, sync clients).
  useVaultEvents();

  // Ctrl/⌘+B toggles the sidebar, Ctrl/⌘+Shift+N creates a note,
  // Ctrl/⌘+Shift+F toggles focus mode, Esc leaves it.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusMode) {
        const target = event.target as HTMLElement | null;
        // Do not steal Esc from an open popover/dialog.
        if (target?.closest("[role='dialog'], [role='menu'], [role='listbox']")) return;
        toggleFocusMode();
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key.toLowerCase() === "b" && !event.shiftKey) {
        event.preventDefault();
        toggleSidebar();
      } else if (event.key.toLowerCase() === "n" && event.shiftKey) {
        event.preventDefault();
        setCreateDialogOpen(true);
      } else if (event.key.toLowerCase() === "f" && event.shiftKey) {
        event.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar, toggleFocusMode, focusMode]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground antialiased">
      {focusMode ? null : sidebarOpen ? (
        <Sidebar onCreateNote={() => setCreateDialogOpen(true)} />
      ) : (
        <div className="flex flex-col items-center gap-1 border-r border-border bg-card py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            title="展开侧栏 (Ctrl/⌘+B)"
            className="h-8 w-8"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}
      <main className="relative flex flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
      {focusMode && (
        <button
          onClick={toggleFocusMode}
          title="退出专注模式 (Esc)"
          className="fixed right-3 bottom-3 z-50 h-7 px-2.5 rounded-md flex items-center gap-1.5 bg-card/90 border border-border text-[11px] text-muted-foreground hover:text-foreground shadow-xs backdrop-blur-sm"
        >
          <Minimize2 className="h-3 w-3" />
          退出专注 (Esc)
        </button>
      )}
      <CreateNoteDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
