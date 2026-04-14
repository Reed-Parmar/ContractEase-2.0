"""Security primitives for password hashing and stateless API tokens."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import time
from typing import Any


AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY")
if not AUTH_SECRET_KEY or AUTH_SECRET_KEY.strip() == "dev-change-this-secret":
    raise RuntimeError(
        "AUTH_SECRET_KEY must be set to a strong secret value; insecure defaults are not allowed"
    )
ACCESS_TOKEN_TTL_SECONDS = int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "3600"))
PASSWORD_HASH_ITERATIONS = int(os.getenv("PASSWORD_HASH_ITERATIONS", "200000"))


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}"
        f"${_b64url_encode(salt)}${_b64url_encode(digest)}"
    )


def needs_rehash(password_hash: str) -> bool:
    return not str(password_hash or "").startswith("pbkdf2_sha256$")


def verify_password_with_rehash(password: str, stored_value: str) -> tuple[bool, str | None]:
    if not stored_value:
        return False, None

    if needs_rehash(stored_value):
        matched = hmac.compare_digest(str(stored_value), str(password))
        if not matched:
            return False, None
        return True, hash_password(password)

    try:
        _, iter_text, salt_text, digest_text = stored_value.split("$", 3)
        iterations = int(iter_text)
        salt = _b64url_decode(salt_text)
        expected = _b64url_decode(digest_text)
    except Exception:
        return False, None

    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual, expected), None


def verify_password(password: str, stored_value: str) -> bool:
    matched, _new_hash = verify_password_with_rehash(password, stored_value)
    return matched


def create_access_token(subject: str, role: str, email: str) -> str:
    now = int(time.time())
    payload = {
        "sub": str(subject),
        "role": str(role),
        "email": str(email),
        "iat": now,
        "exp": now + ACCESS_TOKEN_TTL_SECONDS,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_text = _b64url_encode(payload_bytes)
    signature = hmac.new(
        AUTH_SECRET_KEY.encode("utf-8"),
        payload_text.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"{payload_text}.{_b64url_encode(signature)}"


def verify_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload_text, signature_text = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = hmac.new(
        AUTH_SECRET_KEY.encode("utf-8"),
        payload_text.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    try:
        actual_signature = _b64url_decode(signature_text)
    except (ValueError, binascii.Error):
        return None
    if not hmac.compare_digest(actual_signature, expected_signature):
        return None

    try:
        payload = json.loads(_b64url_decode(payload_text).decode("utf-8"))
    except Exception:
        return None

    now = int(time.time())
    if int(payload.get("exp", 0)) < now:
        return None

    if not payload.get("sub") or not payload.get("role"):
        return None

    return payload
