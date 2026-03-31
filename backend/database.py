import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'eloqua.db')


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                email       TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                salt        TEXT,
                google_id   TEXT UNIQUE,
                name        TEXT NOT NULL DEFAULT '',
                picture     TEXT NOT NULL DEFAULT '',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS user_progress (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                current_node        INTEGER NOT NULL DEFAULT 4,
                sessions_completed  INTEGER NOT NULL DEFAULT 0,
                streak_days         INTEGER NOT NULL DEFAULT 0,
                last_session_date   TEXT DEFAULT NULL,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id)
            )
        ''')
        conn.commit()
