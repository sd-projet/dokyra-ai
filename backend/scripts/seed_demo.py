"""Prépare une démonstration via l'API : comptes de démo + documents d'exemple (2 versions de la
politique de télétravail).

    python -m scripts.seed_demo                         # http://localhost:8000, admin / admin
    python -m scripts.seed_demo --url http://localhost:8000 --user admin --password MOTDEPASSE
    python -m scripts.seed_demo --skip-accounts         # documents seulement

Ne dépend que de la bibliothèque standard. Les comptes et documents déjà présents sont ignorés.
Les comptes de démo sont affichés sur la page de connexion (frontend/src/app/core/demo-accounts.ts) :
gardez les deux listes identiques.
"""
import argparse
import json
import mimetypes
import urllib.error
import urllib.request
import uuid
from pathlib import Path

SAMPLES = [("politique_teletravail_2023.txt", "Politique de télétravail", "2023"),
           ("politique_teletravail_2025.txt", "Politique de télétravail", "2025")]


DEMO_ACCOUNTS = [("demo.employe", "DemoEmploye2025", "user"),
                 ("demo.admin", "DemoAdmin2025", "admin")]


def call(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def multipart(fields, filename, content):
    boundary = uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                 f"Content-Type: {ctype}\r\n\r\n".encode() + content + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", default="admin")
    ap.add_argument("--skip-accounts", action="store_true", help="ne pas créer les comptes de démonstration")
    a = ap.parse_args()

    status, body = call(f"{a.url}/auth/login", json.dumps({"username": a.user, "password": a.password}).encode(),
                        {"Content-Type": "application/json"})
    if status != 200:
        raise SystemExit(f"Connexion impossible ({status}) : {body.get('detail')}")
    auth = {"Authorization": f"Bearer {body['access_token']}"}

    if not a.skip_accounts:
        for username, password, role in DEMO_ACCOUNTS:
            status, body = call(f"{a.url}/auth/users",
                                json.dumps({"username": username, "password": password, "role": role}).encode(),
                                {"Content-Type": "application/json", **auth})
            print(f"compte {username} ({role}): ", "créé" if status == 201 else f"ignoré ({status}) {body.get('detail')}")

    samples = Path(__file__).resolve().parent.parent / "samples"
    for filename, title, version in SAMPLES:
        data, headers = multipart({"title": title, "version": version}, filename, (samples / filename).read_bytes())
        status, body = call(f"{a.url}/documents", data, {**headers, **auth})
        print(f"{filename}: ", "importé" if status == 201 else f"ignoré ({status}) {body.get('detail')}")
    print("\nEssayez : « Quelles sont les conditions pour trois jours de télétravail par semaine ? »\n"
          "puis, dans l'onglet Agent : « Compare les conditions de télétravail de nos deux dernières "
          "politiques et génère un rapport. »")


if __name__ == "__main__":
    main()