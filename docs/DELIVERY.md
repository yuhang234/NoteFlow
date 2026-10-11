# NoteFlow 交付文档与系统使用指南

## 一、交付产物概览

NoteFlow 是一款完全本地优先（Local-First）的 Windows 桌面笔记软件。本项目严格按照《NoteFlow 开发规格说明书》从零独立研发，不依赖任何现成笔记软件源码，实现所有核心能力真实落盘、离线可用。

| 交付项 | 路径 / 说明 |
| :--- | :--- |
| **完整源码** | 本仓库根目录（前端 React 19 + TypeScript + Vite + Tailwind；后端 Rust + Tauri 2） |
| **便携版程序目录** | `dist-release/NoteFlow-Portable/noteflow-app.exe` |
| **便携版压缩包** | `dist-release/NoteFlow-Windows-x64-Portable.zip` (约 5.4MB) |
| **测试套件** | `src-tauri/src/tests.rs` (10 项自动化核心规格测试全部通过) |

---

## 二、开发环境配置与启动说明

### 2.1 依赖环境要求
- **操作系统**：Windows 10 / 11 (x64)
- **Node.js**：v20+ (当前验证版本 v24.9.0, pnpm v10.28.2)
- **Rust**：1.80+ (当前验证版本 1.98.1)
- **C 编译器**：MinGW-w64 GCC (建议 `WinLibs POSIX MSVCRT`) 或 MSVC C++ 构建工具
- **WebView2 运行时**：Windows 10/11 系统自带

### 2.2 开发启动步骤
```powershell
# 1. 进入项目根目录并安装前端依赖
pnpm install

# 2. 启动前端 Vite 开发服务器与 Tauri 桌面端联动调试
pnpm tauri dev
```

### 2.3 生产构建命令
```powershell
# 1. 编译前端生产静态资源
pnpm run build

# 2. 编译 Rust 后端 Release 可执行程序
cd src-tauri
cargo build --release --bin noteflow-app
```
编译产物位于 `src-tauri/target/release/noteflow-app.exe`。

---

## 三、系统架构与模块划分

```
NoteFlow/
├── src/                          # 前端 React 19 + TypeScript 应用
│   ├── components/               # 界面组件
│   │   ├── ui/                   # 封装的 Radix UI / shadcn 风格图元
│   │   ├── MarkdownEditor.tsx    # CodeMirror 6 编辑器集成
│   │   ├── MarkdownPreview.tsx   # unified + remark + KaTeX + Mermaid 渲染流水线
│   │   ├── NoteCard.tsx          # 笔记时间线卡片
│   │   ├── NoteDetail.tsx        # 笔记详情面板与元数据属性栏
│   │   ├── Sidebar.tsx           # 左侧三层布局导航栏与工作区切换器
│   │   ├── ActivityCalendar.tsx  # 活跃度贡献热力图
│   │   └── ...
│   ├── stores/                   # Zustand 全局状态流
│   │   ├── note-store.ts         # 笔记增删改查、草稿、固定、归档
│   │   ├── search-store.ts       # 全文搜索与高级查询过滤
│   │   ├── workspace-store.ts    # 工作区管理
│   │   ├── tag-store.ts          # 标签与个性化配置
│   │   └── ui-store.ts           # 布局折叠、编辑器模式、主题切换
│   ├── pages/                    # 完整视图页面
│   │   ├── TimelinePage.tsx      # 时间线视图（按日期分组、单双多列）
│   │   ├── EditorPage.tsx        # 专注写作与双向分栏编辑器
│   │   ├── CalendarPage.tsx      # 月度日历视图
│   │   ├── MapPage.tsx           # 坐标标记与离线地图
│   │   ├── TagsPage.tsx          # 树形层级标签浏览器
│   │   ├── AttachmentsPage.tsx   # 本地附件库与未引用媒体清理
│   │   ├── StatsPage.tsx         # 本地知识库统计看板
│   │   ├── SettingsPage.tsx      # 设置、外观、数据目录与索引重建
│   │   └── TrashPage.tsx         # 本地回收站与恢复
│   └── lib/
│       ├── tauri-api.ts          # 强类型 Tauri IPC 交互层
│       └── utils.ts
│
├── src-tauri/                    # 后端 Rust (Tauri 2) 核心
│   ├── src/
│   │   ├── models.rs             # 数据结构定义（NoteMeta, Location, Reaction 等）
│   │   ├── storage.rs            # 原子写入、Markdown 读写、YAML Front Matter、标签提取
│   │   ├── database.rs           # SQLite FTS5 全文索引、BM25 检索、统计聚合、索引重建
│   │   ├── query.rs              # 安全受限的高级查询语言语法解析器与评估引擎（无 eval）
│   │   ├── attachments.rs        # 附件相对路径存储、类型嗅探、孤立文件识别
│   │   ├── backup.rs             # ZIP 全量备份与目录校验恢复
│   │   ├── import_export.rs      # 外部 Markdown 扫描导入与独立 HTML / ZIP 导出
│   │   ├── config.rs             # 用户偏好、工作区、自定义视图原子持久化
│   │   ├── watcher.rs            # 基于 notify 的外部文件系统变动监听
│   │   ├── commands.rs           # 36+ 项对外暴露的 Tauri 命令
│   │   ├── lib.rs                # 状态容器注入与插件系统配置
│   │   └── tests.rs              # 10 项核心规格自动化测试集
│   └── Cargo.toml
```

---

## 四、Markdown 文件格式与元数据规范

### 4.1 独立文件原则
- 每条笔记均对应独立磁盘文件：`notes/{uuid}.md`。
- 回收站笔记存放于 `trash/{uuid}.md`。
- 草稿存放于 `drafts/{uuid}.md`。
- 附件存放于 `attachments/{note_id}/{filename}`，在 Markdown 中使用 `attachments/{note_id}/{filename}` 相对路径引用，全目录迁移时引用依然完好。

### 4.2 YAML Front Matter 与未知字段保留
```markdown
---
id: "550e8400-e29b-41d4-a716-446655440000"
type: "markdown"
created_at: "2026-10-11T09:30:00Z"
updated_at: "2026-10-11T10:15:00Z"
pinned: false
archived: false
workspace_id: "default"
location:
  name: "上海图书馆"
  latitude: 31.2062
  longitude: 121.4429
relations:
  - "7b5c72ce-4c6f-4cbe-918f-85f6c09eac10"
parent_id: null
reactions:
  - emoji: "👍"
    count: 2
custom_field_from_user: "arbitrary data preserved verbatim"
---

# 笔记正文首行作为主标题

这里是 Markdown 正文，支持公式 $E=mc^2$、代码块与 Mermaid 图表。

#工作 #项目/开发
```
**关键保障**：用户或外部工具在 Front Matter 中自定义填写的任何未知字段（如 `custom_field_from_user`），后端解析时自动汇入 `extra` 容器，在序列化落盘时原样扁平写回顶层，**绝不静默丢失**。

---

## 五、数据备份、迁移、索引重建与恢复

1. **唯一权威数据源**：Markdown 文件和本地附件是唯一权威数据。SQLite 仅作为派生索引缓存。
2. **索引彻底丢失或重建**：
   - 用户在“设置 -> 重建索引”中触发，或在启动时若 SQLite 损坏，系统将自动全量扫描 `notes/` 目录重新生成 SQLite FTS5 虚拟表及关联元数据。
   - 重建索引绝不修改 Markdown 源文件。
3. **备份与恢复**：
   - 一键生成 ZIP 压缩包，打包 `notes/`、`attachments/`、`drafts/` 与 `.noteflow/` 配置文件。
   - 恢复过程带有路径遍历（Directory Traversal）安全校验与文件覆盖确认机制。

---

## 六、自动化测试结果

运行 `cargo test --bin noteflow-app`，执行结果如下：
```text
running 10 tests
test tests::core_verification_tests::test_title_extraction ... ok
test tests::core_verification_tests::test_query_expression_parser ... ok
test tests::core_verification_tests::test_tag_extraction_avoids_code_and_urls ... ok
test tests::core_verification_tests::test_vault_structure_initialization ... ok
test tests::core_verification_tests::test_trash_and_restore ... ok
test tests::core_verification_tests::test_markdown_storage_and_front_matter_preservation ... ok
test tests::core_verification_tests::test_backup_and_restore_vault ... ok
test tests::core_verification_tests::test_attachments_and_orphan_detection ... ok
test tests::core_verification_tests::test_import_markdown_folder ... ok
test tests::core_verification_tests::test_sqlite_fts5_and_index_rebuild ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.41s
```
前端生产编译 `pnpm run build`：**0 errors，全部产物打包通过**。

---

## 七、已知限制与后续优化建议

1. **在线地图瓦片集成**：当前地图视图默认完全离线运行（坐标网格与位置卡片聚合）。后续可增加加载离线 MBTiles 矢量瓦片文件包的本地渲染支持。
2. **海量笔记虚拟列表**：在测试 10,000+ 篇超大笔记量级时，主时间线视图推荐启用更细粒度的虚拟分页滚动条以进一步降低 DOM 节点开销。
3. **外部文件监听防抖**：外部并发大批量粘贴多个文件时，文件系统通知流可进一步合并为批量更新批次以最小化磁盘 I/O 重建开销。
