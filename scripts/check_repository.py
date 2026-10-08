"""Dependency-free repository checks; this is not a comprehensive secret scanner."""
from pathlib import Path, PurePosixPath
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "AGENTS.md", "CONTRIBUTING.md", "docs/architecture.md",
    "docs/api-contract.md", "docs/decisions.md", "docs/team-workflow.md",
    "docs/github-setup.md", ".github/CODEOWNERS",
    ".github/pull_request_template.md",
)


def main():
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    )
    tracked = result.stdout.decode("utf-8").strip("\0").split("\0")
    errors = []
    for name in REQUIRED:
        path = ROOT / name
        if not path.is_file() or not path.read_text(encoding="utf-8-sig").strip():
            errors.append(f"Missing or empty required document: {name}")
    for name in filter(None, tracked):
        path = PurePosixPath(name)
        leaf = path.name.lower()
        example = leaf in {".env.example", ".env.sample", ".env.template"}
        if (leaf == ".env" or leaf.startswith(".env.")) and not example:
            errors.append(f"Environment file must not be tracked: {name}")
        if leaf in {"id_rsa", "id_ed25519", "id_ecdsa", "credentials.json"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}:
            errors.append(f"Potential credential file requires removal from Git: {name}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Repository checks passed (documents and sensitive file paths only).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
