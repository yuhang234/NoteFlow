import * as React from "react";
import { Outlet } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { CreateNoteDialog } from "@/components/CreateNoteDialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useVaultEvents } from "@/lib/vault-events";

export function AppLayout() {
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const { sidebarOpen, toggleSidebar } = useUIStore();

  // React to edits made outside NoteFlow (other editors, sync clients).
  useVaultEvents();

  // Ctrl/⌘+B toggles the sidebar, Ctrl/⌘+Shift+N creates a note.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key.toLowerCase() === "b" && !event.shiftKey) {
        event.preventDefault();
        toggleSidebar();
      } else if (event.key.toLowerCase() === "n" && event.shiftKey) {
        event.preventDefault();
        setCreateDialogOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground antialiased">
      {sidebarOpen ? (
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
      <main className="relative flex flex-1 overflow-hidden">
        <Outlet />
      </main>
      <CreateNoteDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
