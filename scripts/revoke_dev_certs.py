#!/usr/bin/env python3
"""Revoke all iOS development certificates via App Store Connect API."""
import jwt, time, requests, os, sys

KEY_ID = "XX5239JSR5"
ISSUER_ID = os.environ["APPLE_ISSUER_ID"]
KEY_PATH = os.environ.get("APPLE_KEY_PATH", "ios/fastlane/AuthKey_XX5239JSR5.p8")

with open(KEY_PATH) as f:
    private_key = f.read()

now = int(time.time())
token = jwt.encode(
    {"iss": ISSUER_ID, "iat": now - 10, "exp": now + 600, "aud": "appstoreconnect-v1"},
    private_key,
    algorithm="ES256",
    headers={"kid": KEY_ID, "typ": "JWT"},
)

headers = {"Authorization": f"Bearer {token}"}
resp = requests.get(
    "https://api.appstoreconnect.apple.com/v1/certificates?limit=200",
    headers=headers,
)
resp.raise_for_status()

count = 0
for cert in resp.json().get("data", []):
    cert_type = cert["attributes"]["certificateType"]
    if cert_type in ("IOS_DEVELOPMENT", "DEVELOPMENT"):
        rid = cert["id"]
        name = cert["attributes"]["name"]
        serial = cert["attributes"]["serialNumber"][:12]
        r = requests.delete(
            f"https://api.appstoreconnect.apple.com/v1/certificates/{rid}",
            headers=headers,
        )
        print(f"Revoked [{cert_type}] {name} ({serial}...) status={r.status_code}")
        count += 1

print(f"Done. Revoked {count} development certificate(s).")
