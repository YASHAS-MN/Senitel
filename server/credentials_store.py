"""
credentials_store.py

Secure storage/verification of the BankGuard login credentials.

- Password hashing: Argon2id (argon2-cffi) -- same rationale as
  recovery_key_store.py: memory-hard, resistant to GPU/ASIC brute-force.
- The plaintext password is NEVER stored, logged, or returned.
- Username is not a secret, but is kept server-side (SQLite) too, rather
  than in the browser, so the frontend has no locally-editable source of
  truth for who the "owner" account is.
"""

import sqlite3
import time
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHash

DB_PATH = Path(__file__).resolve().parents[1] / "bankguard.db"

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,   # 64 MB
    parallelism=2,
    hash_len=32,
    salt_len=16,
)


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS credentials (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            updated_at REAL NOT NULL
        )
        """
    )
    return conn


def set_credentials(username: str, plaintext_password: str) -> None:
    """Set/overwrite the owner's username + password (hashed)."""
    if not username or not username.strip():
        raise ValueError("Username cannot be empty.")
    if not plaintext_password or len(plaintext_password) < 8:
        raise ValueError("Password must be at least 8 characters.")

    password_hash = ph.hash(plaintext_password)

    conn = _get_conn()
    try:
        conn.execute(
            """
            INSERT INTO credentials (id, username, password_hash, updated_at)
            VALUES (1, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET username = excluded.username,
                                           password_hash = excluded.password_hash,
                                           updated_at = excluded.updated_at
            """,
            (username.strip(), password_hash, time.time()),
        )
        conn.commit()
    finally:
        conn.close()


def set_username_only(username: str) -> None:
    """Update just the username, leaving the existing password hash intact.
    No-ops (raises) if credentials haven't been set yet -- use set_credentials
    for the first-time seed."""
    if not username or not username.strip():
        raise ValueError("Username cannot be empty.")

    conn = _get_conn()
    try:
        cur = conn.execute(
            "UPDATE credentials SET username = ?, updated_at = ? WHERE id = 1",
            (username.strip(), time.time()),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("No credentials set yet -- call set_credentials first.")
    finally:
        conn.close()


def verify_credentials(username: str, attempt: str) -> bool:
    """Verify a username + password attempt against the stored record."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT username, password_hash FROM credentials WHERE id = 1"
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        return False

    stored_username, stored_hash = row
    if username != stored_username:
        return False

    try:
        ph.verify(stored_hash, attempt)
    except (VerifyMismatchError, InvalidHash):
        return False

    if ph.check_needs_rehash(stored_hash):
        set_credentials(stored_username, attempt)

    return True


def get_username() -> str | None:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT username FROM credentials WHERE id = 1").fetchone()
    finally:
        conn.close()
    return row[0] if row else None


def has_credentials_set() -> bool:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT 1 FROM credentials WHERE id = 1").fetchone()
    finally:
        conn.close()
    return row is not None