"""Create a source-only, credential-free server installation archive."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "downloads" / "qa-dashboard-server.zip"
EXCLUDED = {"node_modules", "dist", ".git", ".cache", ".replit-artifact", "_uploads_tmp", "__pycache__"}
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yaml", ".yml", ".css", ".html", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".sh"}
files = set()
for name in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.base.json"):
    files.add(ROOT / name)
for directory in ("artifacts/api-server", "artifacts/qa-dashboard", "lib", "scripts"):
    for path in (ROOT / directory).rglob("*"):
        relative = path.relative_to(ROOT)
        if path.is_file() and not path.is_symlink() and not any(part in EXCLUDED or part.startswith(".") for part in relative.parts):
            if path.suffix in SOURCE_EXTENSIONS and not path.name.endswith((".tsbuildinfo", ".d.ts", ".d.ts.map")):
                files.add(path)
for path in (ROOT / "Data").rglob("*.xlsx"):
    if path.is_file() and not path.is_symlink() and "_uploads_tmp" not in path.parts and not path.name.startswith("~$"):
        files.add(path)
for name in ("README.md",):
    if (ROOT / name).is_file():
        files.add(ROOT / name)
for path in (ROOT / "docs").rglob("*.md") if (ROOT / "docs").is_dir() else []:
    files.add(path)
for path in (ROOT / "server-install").iterdir():
    if path.is_file() and not path.is_symlink() and (not path.name.startswith(".") or path.name == ".env.example"):
        files.add(path)

# Generated JS declaration outputs are not needed: package exports use TypeScript source.
# No files are ever collected from private agent state, environment files, or build output.
assert all(path.is_file() for path in files)
assert not any(path.name == ".env" or path.suffix in {".pem", ".key"} for path in files)
manifest = {
    str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
    for path in sorted(files)
}
OUTPUT.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(files):
        archive.write(path, "qa-dashboard/" + str(path.relative_to(ROOT)))
    archive.writestr("qa-dashboard/START-HERE.md", (ROOT / "server-install/INSTALL.md").read_text())
    archive.writestr("qa-dashboard/SHA256-MANIFEST.json", json.dumps(manifest, indent=2) + "\n")
with zipfile.ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
    assert len([name for name in archive.namelist() if name.endswith(".xlsx")]) == len([p for p in files if p.suffix == ".xlsx"])
print(f"Created {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size / 1024 / 1024:.1f} MiB)")
print(f"Included {len(files)} source/setup files, including {sum(p.suffix == '.xlsx' for p in files)} Excel workbooks.")
print("Archive integrity verified. Source manifest included.")