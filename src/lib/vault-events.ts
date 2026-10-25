import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/tauri-api";
import { useNoteStore } from "@/stores/note-store";

export interface VaultChange {
  path: string;
  kind: "created" | "modified" | "deleted";
}

/** Normalise Windows/Unix separators and case for path comparison. */
export function sameVaultPath(a: string, b: string) {
  const norm = (value: string) => value.replace(/\\/g, "/").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Subscribe to `vault:changed` events emitted by the Rust file watcher.
 *
 * NoteFlow filters out its own writes on the backend, so anything arriving here
 * came from another editor or a sync client: refresh the note list and rebuild
 * the search index (debounced).
 */
export function useVaultEvents() {
  const fetchNotes = useNoteStore((state) => state.fetchNotes);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let indexTimer: ReturnType<typeof setTimeout> | undefined;

    listen<VaultChange>("vault:changed", () => {
      void fetchNotes();
      if (indexTimer) clearTimeout(indexTimer);
      indexTimer = setTimeout(() => {
        api.rebuildIndex().catch((err) => console.error("Rebuild index failed:", err));
      }, 1500);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // Not running inside Tauri (e.g. plain browser preview).
      });

    return () => {
      disposed = true;
      if (indexTimer) clearTimeout(indexTimer);
      unlisten?.();
    };
  }, [fetchNotes]);
}

/**
 * Subscribe to external edits of a single note.
 *
 * `onExternalChange` is only called when the note was not modified locally, so
 * an incoming change can never clobber unsaved edits.
 */
export function useExternalNoteChange(
  filePath: string,
  noteId: string,
  onExternalChange: () => void
) {
  const handlerRef = React.useRef(onExternalChange);
  handlerRef.current = onExternalChange;

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    listen<VaultChange>("vault:changed", (event) => {
      const payload = event.payload;
      if (!payload || payload.kind === "deleted") return;
      if (!sameVaultPath(payload.path, filePath)) return;
      handlerRef.current();
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [filePath, noteId]);
}
