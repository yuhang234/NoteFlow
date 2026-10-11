use crate::error::{AppError, Result};
use notify::{
    event::{ModifyKind, RenameMode},
    Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;

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

    fn handle_raw_event(event: Event, tx: &Sender<FileEvent>) {
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
