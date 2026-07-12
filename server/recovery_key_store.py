"""
recovery_key_store.py

Secure storage/verification of the BankGuard owner recovery key.

- Hashing algorithm: Argon2id (argon2-cffi) -- OWASP-recommended, memory-hard,
  resistant to GPU/ASIC brute-force and side-channel timing attacks.
- The plaintext recovery key is NEVER stored, logged, or returned by any
  function here. Only the Argon2id hash string (which embeds the salt,
  algorithm version, and cost parameters) is persisted, in SQLite.
- A random salt is generated automatically per hash by argon2-cffi.
"""

import sqlite3
import time
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHash

DB_PATH = Path(__file__).resolve().parents[1] / "bankguard.db"

# Cost parameters tuned for ~250-400ms/hash on typical server hardware.
# Raise time_cost/memory_cost over time as hardware improves.
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
        CREATE TABLE IF NOT EXISTS recovery_key (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            key_hash TEXT NOT NULL,
            updated_at REAL NOT NULL
        )
        """
    )
    return conn


def set_recovery_key(plaintext_key: str) -> None:
    """Hash and store a new recovery key, overwriting any existing one."""
    if not plaintext_key or len(plaintext_key) < 8:
        raise ValueError("Recovery key must be at least 8 characters.")

    key_hash = ph.hash(plaintext_key)

    conn = _get_conn()
    try:
        conn.execute(
            """
            INSERT INTO recovery_key (id, key_hash, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET key_hash = excluded.key_hash,
                                           updated_at = excluded.updated_at
            """,
            (key_hash, time.time()),
        )
        conn.commit()
    finally:
        conn.close()


def verify_recovery_key(attempt: str) -> bool:
    """Verify an attempted recovery key against the stored hash."""
    conn = _get_conn()
    try:
        row = conn.execute("SELECT key_hash FROM recovery_key WHERE id = 1").fetchone()
    finally:
        conn.close()

    if row is None:
        return False

    stored_hash = row[0]
    try:
        ph.verify(stored_hash, attempt)
    except (VerifyMismatchError, InvalidHash):
        return False

    if ph.check_needs_rehash(stored_hash):
        set_recovery_key(attempt)

    return True


def has_recovery_key_set() -> bool:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT 1 FROM recovery_key WHERE id = 1").fetchone()
    finally:
        conn.close()
    return row is not None