#!/usr/bin/env python3
"""Apply OpenObserve dashboards from a directory into a folder — declaratively.

Dashboards-as-code: JSON files in git are the source of truth; this upserts them
by title (create if absent, update in place if present), so re-running is a no-op
when nothing changed. OpenObserve has no Terraform provider for dashboards, so
this small script is the apply step (used by the observe ansible role, and
reusable from app-repo CI).

Env:  O2_URL  O2_ORG(=default)  O2_EMAIL  O2_PASSWORD
Usage: o2-dashboards.py <dir-of-json> <folder-name>
"""
import base64
import glob
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ["O2_URL"].rstrip("/")
ORG = os.environ.get("O2_ORG", "default")
AUTH = base64.b64encode(
    f'{os.environ["O2_EMAIL"]}:{os.environ["O2_PASSWORD"]}'.encode()
).decode()


def api(method, path, body=None):
    req = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Basic {AUTH}",
            "Content-Type": "application/json",
            # Cloudflare fronts observe.iedora.com and 403s (error 1010) the
            # default python-urllib User-Agent as a bot signature. Use a plain UA.
            "User-Agent": "iedora-o2-dashboards/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"  ! {method} {path} -> {e.code}: {e.read().decode()[:300]}\n")
        raise


def ensure_folder(name):
    """Return the folderId for `name`, creating the folder if it doesn't exist."""
    if name in ("default", "Default"):
        return "default"
    try:
        f = api("GET", f"/api/v2/{ORG}/folders/dashboards/name/{name}")
        fid = f.get("folderId") or f.get("folder_id")
        if fid:
            return fid
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    created = api("POST", f"/api/v2/{ORG}/folders/dashboards", {"name": name, "description": ""})
    return created.get("folderId") or created.get("folder_id")


def existing_by_title(folder_id):
    """title -> (dashboard_id, hash, folder_id) for dashboards IN this folder.

    The list endpoint is folder-scoped — passing the target folder is what makes
    re-applies idempotent (otherwise titles are matched against the default
    folder and every run creates duplicates in a custom folder).
    """
    out = {}
    for e in api("GET", f"/api/{ORG}/dashboards?folder={folder_id}").get("dashboards", []):
        if e.get("title"):
            out[e["title"]] = (e["dashboard_id"], e.get("hash"), e.get("folder_id"))
    return out


def main():
    src_dir, folder_name = sys.argv[1], sys.argv[2]
    folder_id = ensure_folder(folder_name)
    existing = existing_by_title(folder_id)
    files = sorted(glob.glob(os.path.join(src_dir, "*.json")))
    if not files:
        print(f"  (no dashboards in {src_dir})")
        return
    for fp in files:
        dash = json.load(open(fp))
        title = dash["title"]
        if title in existing:
            did, h, fid = existing[title]
            api("PUT", f"/api/{ORG}/dashboards/{did}?folder={fid or folder_id}&hash={h}", dash)
            print(f"  updated  {title}")
        else:
            api("POST", f"/api/{ORG}/dashboards?folder={folder_id}", dash)
            print(f"  created  {title}  [{folder_name}]")


if __name__ == "__main__":
    main()
