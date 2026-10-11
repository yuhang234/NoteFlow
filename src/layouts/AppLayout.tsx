import * as React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { CreateNoteDialog } from "@/components/CreateNoteDialog";

export function AppLayout() {
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground antialiased">
      <Sidebar onCreateNote={() => setCreateDialogOpen(true)} />
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
      <CreateNoteDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
