use crate::error::Result;
use crate::models::{AppConfig, SavedView, TagSetting, Workspace};
use crate::storage::atomic_write;
use std::fs;
use std::path::Path;

pub fn load_config(base: &Path) -> Result<AppConfig> {
    let config_path = base.join(".noteflow").join("config.json");
    if !config_path.exists() {
        let mut default_cfg = AppConfig::default();
        default_cfg.data_dir = base.to_path_buf();
        save_config(base, &default_cfg)?;
        return Ok(default_cfg);
    }

    let content = fs::read_to_string(&config_path)?;
    let mut config: AppConfig = serde_json::from_str(&content).unwrap_or_default();
    if config.data_dir.as_os_str().is_empty() {
        config.data_dir = base.to_path_buf();
    }
    Ok(config)
}

pub fn save_config(base: &Path, config: &AppConfig) -> Result<()> {
    let config_path = base.join(".noteflow").join("config.json");
    let content = serde_json::to_string_pretty(config)?;
    atomic_write(&config_path, content.as_bytes())?;
    Ok(())
}

pub fn load_workspaces(base: &Path) -> Result<Vec<Workspace>> {
    let path = base.join(".noteflow").join("workspaces.json");
    if !path.exists() {
        let defaults = vec![
            Workspace {
                id: "default".to_string(),
                name: "Personal".to_string(),
                description: "Personal workspace".to_string(),
                icon: "user".to_string(),
                color: Some("#3B82F6".to_string()),
                order: 0,
            },
            Workspace {
                id: "work".to_string(),
                name: "Work".to_string(),
                description: "Work and projects".to_string(),
                icon: "briefcase".to_string(),
                color: Some("#10B981".to_string()),
                order: 1,
            },
        ];
        save_workspaces(base, &defaults)?;
        return Ok(defaults);
    }

    let content = fs::read_to_string(&path)?;
    let workspaces: Vec<Workspace> = serde_json::from_str(&content).unwrap_or_default();
    Ok(workspaces)
}

pub fn save_workspaces(base: &Path, workspaces: &[Workspace]) -> Result<()> {
    let path = base.join(".noteflow").join("workspaces.json");
    let content = serde_json::to_string_pretty(workspaces)?;
    atomic_write(&path, content.as_bytes())?;
    Ok(())
}

pub fn load_views(base: &Path) -> Result<Vec<SavedView>> {
    let path = base.join(".noteflow").join("views.json");
    if !path.exists() {
        let default_views = vec![
            SavedView {
                id: "view-tasks".to_string(),
                name: "Tasks".to_string(),
                icon: "check-square".to_string(),
                filter_expression: "has_tasks".to_string(),
                description: "Notes with task lists".to_string(),
                sort_by: "updated_at".to_string(),
                sort_order: "desc".to_string(),
                show_in_sidebar: true,
            },
            SavedView {
                id: "view-code".to_string(),
                name: "Code Snippets".to_string(),
                icon: "code".to_string(),
                filter_expression: "has_code".to_string(),
                description: "Notes containing code blocks".to_string(),
                sort_by: "updated_at".to_string(),
                sort_order: "desc".to_string(),
                show_in_sidebar: true,
            },
        ];
        save_views(base, &default_views)?;
        return Ok(default_views);
    }

    let content = fs::read_to_string(&path)?;
    let views: Vec<SavedView> = serde_json::from_str(&content).unwrap_or_default();
    Ok(views)
}

pub fn save_views(base: &Path, views: &[SavedView]) -> Result<()> {
    let path = base.join(".noteflow").join("views.json");
    let content = serde_json::to_string_pretty(views)?;
    atomic_write(&path, content.as_bytes())?;
    Ok(())
}

pub fn load_tag_settings(base: &Path) -> Result<Vec<TagSetting>> {
    let path = base.join(".noteflow").join("tags.json");
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)?;
    let settings: Vec<TagSetting> = serde_json::from_str(&content).unwrap_or_default();
    Ok(settings)
}

pub fn save_tag_settings(base: &Path, settings: &[TagSetting]) -> Result<()> {
    let path = base.join(".noteflow").join("tags.json");
    let content = serde_json::to_string_pretty(settings)?;
    atomic_write(&path, content.as_bytes())?;
    Ok(())
}
