import json, subprocess
from pathlib import Path

workdir = Path(__file__).resolve().parent
cli_entry = ["design-cli"]
workspace_id = "cws_60032681936790530"
xml_text = (workdir / "item.xml").read_text(encoding="utf-8-sig")
payload = xml_text.encode("utf-8")
argv = cli_entry + ["design-workspace", "+create", "--canvas-workspace-id", workspace_id, "--input", "-"]
result = subprocess.run(argv, input=payload, shell=False, cwd=workdir, capture_output=True, timeout=120)
(workdir / "submit.stdout.bin").write_bytes(result.stdout)
(workdir / "submit.stderr.bin").write_bytes(result.stderr)
(workdir / "submit.exitcode.txt").write_text(str(result.returncode), encoding="utf-8")
if result.returncode != 0:
    raise SystemExit(f"CLI exit {result.returncode}; see submit.*")
print(result.stdout.decode("utf-8", errors="strict"))
