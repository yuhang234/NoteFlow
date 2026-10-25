# Build NoteFlow and refresh the portable folder + zip in dist-release/.
#
# Why this script exists:
#   Linking with the external MinGW gcc (C:/mingw64/bin/gcc.exe) produces
#   binaries whose base relocations are broken. They crash during
#   `std::rt::init` (inside GetModuleHandleA) and inside chrono's
#   `Local::now()` with STATUS_ACCESS_VIOLATION (0xc0000005).
#   Rust's bundled `rust-lld` links the same crates correctly, so the
#   build below forces `-C linker=rust-lld` (it ships with the toolchain).
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-portable.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sysroot = (& rustc --print sysroot).Trim()
$lldDir = Join-Path $sysroot "lib\rustlib\x86_64-pc-windows-gnu\bin"

if (-not (Test-Path (Join-Path $lldDir "rust-lld.exe"))) {
    throw "rust-lld.exe not found in $lldDir - is the x86_64-pc-windows-gnu toolchain installed?"
}

$env:PATH = "$lldDir;$env:PATH"
$env:RUSTFLAGS = "-C linker=rust-lld"
$env:CARGO_TARGET_DIR = Join-Path $root "src-tauri\target"

Push-Location $root
try {
    Write-Host "==> 1/4 frontend (vite)" -ForegroundColor Cyan
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed" }

    Write-Host "==> 2/4 rust release build" -ForegroundColor Cyan
    cargo build --release --manifest-path src-tauri\Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw "cargo build --release failed" }

    Write-Host "==> 3/4 copy portable files" -ForegroundColor Cyan
    $releaseDir = Join-Path $env:CARGO_TARGET_DIR "release"
    $portableDir = Join-Path $root "dist-release\NoteFlow-Portable"
    New-Item -ItemType Directory -Force -Path $portableDir | Out-Null
    Copy-Item (Join-Path $releaseDir "noteflow-app.exe") $portableDir -Force
    $loader = Join-Path $releaseDir "WebView2Loader.dll"
    if (Test-Path $loader) { Copy-Item $loader $portableDir -Force }

    Write-Host "==> 4/4 zip" -ForegroundColor Cyan
    $zip = Join-Path $root "dist-release\NoteFlow-Windows-x64-Portable.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path (Join-Path $portableDir "*") -DestinationPath $zip -Force

    $exe = Get-Item (Join-Path $portableDir "noteflow-app.exe")
    Write-Host ""
    Write-Host ("done: {0} ({1:N1} MB)" -f $exe.FullName, ($exe.Length / 1MB)) -ForegroundColor Green
}
finally {
    Pop-Location
}
