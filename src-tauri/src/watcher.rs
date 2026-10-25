use crate::error::{AppError, Result};
use notify::{
    event::{ModifyKind, RenameMode},
    Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone)]
pub enum FileEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
    Renamed {
        from: Option<PathBuf>,
        to: PathBuf,
    },
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
}

impl FileWatcher {
    pub fn start_watching(path: &Path, tx: Sender<FileEvent>) -> Result<Self> {
        let tx_clone = tx;
        let mut watcher = RecommendedWatcher::new(
            move |res: std::result::Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    Self::handle_raw_event(event, &tx_clone);
                }
            },
            notify::Config::default(),
        )
        .map_err(AppError::Notify)?;

        watcher
            .watch(path, RecursiveMode::Recursive)
            .map_err(AppError::Notify)?;

        Ok(FileWatcher { _watcher: watcher })
    }

    pub(crate) fn handle_raw_event(event: Event, tx: &Sender<FileEvent>) {
        match event.kind {
            EventKind::Create(_) => {
                for p in event.paths {
                    let _ = tx.send(FileEvent::Created(p));
                }
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                if event.paths.len() >= 2 {
                    let _ = tx.send(FileEvent::Renamed {
                        from: Some(event.paths[0].clone()),
                        to: event.paths[1].clone(),
                    });
                } else if let Some(first) = event.paths.first() {
                    let _ = tx.send(FileEvent::Renamed {
                        from: None,
                        to: first.clone(),
                    });
                }
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                if let Some(first) = event.paths.first() {
                    let _ = tx.send(FileEvent::Renamed {
                        from: None,
                        to: first.clone(),
                    });
                }
            }
            EventKind::Modify(_) => {
                for p in event.paths {
                    let _ = tx.send(FileEvent::Modified(p));
                }
            }
            EventKind::Remove(_) => {
                for p in event.paths {
                    let _ = tx.send(FileEvent::Deleted(p));
                }
            }
            _ => {}
        }
    }
}

/// Coarse change kind reported to the frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Created,
    Modified,
    Deleted,
}

impl ChangeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ChangeKind::Created => "created",
            ChangeKind::Modified => "modified",
            ChangeKind::Deleted => "deleted",
        }
    }
}

/// Long lived watcher that batches raw file events into debounced callbacks.
pub struct VaultWatcher {
    _watcher: RecommendedWatcher,
    stop: Arc<AtomicBool>,
}

impl VaultWatcher {
    /// Watch the `notes/` directory and report debounced markdown changes.
    ///
    /// `on_change` runs on a background thread and receives one batch per quiet
    /// period, which keeps a burst of editor saves from triggering a storm of
    /// frontend refreshes.
    pub fn start<F>(path: &Path, on_change: F) -> Result<Self>
    where
        F: Fn(Vec<(PathBuf, ChangeKind)>) + Send + 'static,
    {
        let (tx, rx) = mpsc::channel::<FileEvent>();
        let mut watcher = RecommendedWatcher::new(
            move |res: std::result::Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    FileWatcher::handle_raw_event(event, &tx);
                }
            },
            notify::Config::default(),
        )
        .map_err(AppError::Notify)?;

        watcher
            .watch(path, RecursiveMode::Recursive)
            .map_err(AppError::Notify)?;

        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let root = path.to_path_buf();

        std::thread::spawn(move || {
            let mut pending: HashMap<PathBuf, ChangeKind> = HashMap::new();
            while !thread_stop.load(Ordering::Relaxed) {
                match rx.recv_timeout(Duration::from_millis(350)) {
                    Ok(event) => {
                        if let Some((file, kind)) = Self::classify(&event, &root) {
                            pending.insert(file, kind);
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        if !pending.is_empty() {
                            let batch: Vec<(PathBuf, ChangeKind)> = pending.drain().collect();
                            on_change(batch);
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        Ok(VaultWatcher {
            _watcher: watcher,
            stop,
        })
    }

    fn classify(event: &FileEvent, root: &Path) -> Option<(PathBuf, ChangeKind)> {
        let (path, kind) = match event {
            FileEvent::Created(path) => (path.clone(), ChangeKind::Created),
            FileEvent::Modified(path) => (path.clone(), ChangeKind::Modified),
            FileEvent::Deleted(path) => (path.clone(), ChangeKind::Deleted),
            FileEvent::Renamed { to, .. } => (to.clone(), ChangeKind::Modified),
        };

        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            return None;
        }
        if path.parent() != Some(root) {
            return None;
        }
        Some((path, kind))
    }
}

impl Drop for VaultWatcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

/// Watch the vault and emit `vault:changed` for edits made outside NoteFlow.
///
/// Saves performed by the app itself are filtered out through
/// [`crate::storage::is_self_write`], so the editor is never reloaded while the
/// user is typing.
pub fn watch_vault(app: tauri::AppHandle, notes_dir: &Path) -> Result<VaultWatcher> {
    VaultWatcher::start(notes_dir, move |batch| {
        for (path, kind) in batch {
            if crate::storage::is_self_write(&path) {
                continue;
            }
            let payload = serde_json::json!({
                "path": path.to_string_lossy(),
                "kind": kind.as_str(),
            });
            let _ = app.emit("vault:changed", payload);
        }
    })
}
