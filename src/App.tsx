import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { TimelinePage } from "@/pages/TimelinePage";
import { EditorPage } from "@/pages/EditorPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { SearchPage } from "@/pages/SearchPage";
import { TagsPage } from "@/pages/TagsPage";
import { AttachmentsPage } from "@/pages/AttachmentsPage";
import { StatsPage } from "@/pages/StatsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TrashPage } from "@/pages/TrashPage";
import { MapPage } from "@/pages/MapPage";
import { ArchivePage } from "@/pages/ArchivePage";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<TimelinePage />} />
              <Route path="/note/:id" element={<EditorPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/tags" element={<TagsPage />} />
              <Route path="/attachments" element={<AttachmentsPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/trash" element={<TrashPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
