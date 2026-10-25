//! Minimal stand-in for the `tauri` crate, used only to type check command modules
//! in environments where the real Tauri build script cannot run.
pub use tauri_macros::command;

pub struct State<'a, T>(pub &'a T);

impl<'a, T> std::ops::Deref for State<'a, T> {
    type Target = T;
    fn deref(&self) -> &T {
        self.0
    }
}

#[derive(Clone)]
pub struct AppHandle;

impl AppHandle {
    pub fn emit<S: serde::Serialize + Clone>(
        &self,
        _event: &str,
        _payload: S,
    ) -> std::result::Result<(), String> {
        Ok(())
    }
}
