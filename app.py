#!/usr/bin/env python3
"""
SELF BOT — QR/phone login + MiaoBet (Meowie bet) bowling auto-bettor + Meow farmer
+ Halloween Miyoui shop farmer (multi-user).

Usage:
  python app.py                 # run the bot
  python app.py --config        # show current config
  python app.py --reset         # wipe the database

In a Telegram group, send from your own account:
  .activegroupsbet   register + activate the group for bowling bets   (owner only)
  .activemeow        start the auto-meow loop in this group           (owner only)
  .stopmeow          stop the auto-meow loop                          (owner only)
  .activehalloween   start the Halloween shop loop in this group      (every logged-in user)
  .stophalloween     stop the Halloween shop loop                     (every logged-in user)

Login: QR code, or phone number (code typed by hand OR a safe-style keypad).

Then open the control bot -> MiaoBet / Halloween.
"""
from __future__ import annotations

import argparse
import asyncio
import collections
import functools
import io
import json
import logging
import logging.handlers
import os
import random
import re
import signal
import socket
import sqlite3
import statistics
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Deps
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import telethon.errors as tg_errors
    from telethon import Button, TelegramClient, events
    from telethon.errors import FloodWaitError, MessageNotModifiedError, SessionPasswordNeededError
    from telethon.sessions import StringSession
    from telethon.tl.functions.messages import GetBotCallbackAnswerRequest
    from telethon.tl.types import InputMediaDice, MessageMediaDice
except ImportError:
    print("ERROR: telethon not installed. Run: pip install telethon", file=sys.stderr)
    sys.exit(1)

try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

try:
    import socks
    HAS_SOCKS = True
except ImportError:
    HAS_SOCKS = False

try:
    from rich.console import Console
    from rich.logging import RichHandler
    from rich.table import Table
    RICH = True
except ImportError:
    RICH = False


def _errs(*names: str) -> tuple:
    """Collect telethon error classes by name (missing ones are skipped)."""
    return tuple(c for c in (getattr(tg_errors, n, None) for n in names) if isinstance(c, type))


# errors that mean "wait N seconds then retry"
WAIT_ERRORS = _errs("FloodWaitError", "SlowModeWaitError")
# errors that mean "retrying is pointless — stop the engine"
FATAL_SEND_ERRORS = _errs(
    "ChatWriteForbiddenError", "UserBannedInChannelError", "ChatAdminRequiredError",
    "ChannelPrivateError", "AuthKeyUnregisteredError", "UserDeactivatedError",
    "UserDeactivatedBanError", "SessionRevokedError", "SessionExpiredError",
)
# transient network / server errors
TRANSIENT_ERRORS = (ConnectionError, asyncio.TimeoutError, TimeoutError, OSError) + _errs("ServerError")


# phone-login errors
E_CODE_INVALID = _errs("PhoneCodeInvalidError", "PhoneCodeEmptyError")
E_CODE_EXPIRED = _errs("PhoneCodeExpiredError")
E_NUM_INVALID = _errs("PhoneNumberInvalidError")
E_NUM_BANNED = _errs("PhoneNumberBannedError")
E_UNOCCUPIED = _errs("PhoneNumberUnoccupiedError")
E_PWD_INVALID = _errs("PasswordHashInvalidError")


class FatalConfig(Exception):
    """Configuration problem that can't be fixed by retrying."""


# ===========================================================================
# 1. CONFIG
# ===========================================================================
BASE_DIR = Path(__file__).resolve().parent
DB_DIR = Path(os.environ.get("DB_PATH", str(BASE_DIR / "data"))).resolve()
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_FILE = DB_DIR / "selfbot.db"

# Public Android API — replace with your own from https://my.telegram.org
PUBLIC_API_ID = 6
PUBLIC_API_HASH = "eb06d4abfb49dc3eeb1aeb98ae0f581e"

# --- MiaoBet constants (edit if the game bot changes) -----------------------
MIN_BET = 20_000                       # minimum allowed bet
GAME_TRIGGER = "میوبت"                 # text that opens the game panel
BTN_SINGLE = "miobet_player_single"    # panel 1: single player
BTN_BOWLING = "miobet_game_bowling"    # panel 2: bowling
BTN_CHOICE = "miobet_choice_{}"        # panel 3: odd | even
GROUP_CMD = r"^\.activegroupsbet$"     # sent inside a group to activate it
MEOW_ON_CMD = r"^\.activemeow$"        # sent inside a group to start meowing
MEOW_OFF_CMD = r"^\.stopmeow$"         # sent inside a group to stop meowing
HAL_ON_CMD = r"^\.activehalloween$"    # sent inside a group to start the Halloween loop
HAL_OFF_CMD = r"^\.stophalloween$"     # sent inside a group to stop it


def _env_str(key: str, default: str = "") -> str:
    return (os.environ.get(key) or "").strip() or default


def _env_int(key: str, default: int) -> int:
    raw = (os.environ.get(key) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(key: str, default: bool) -> bool:
    """Tolerant bool: 1/true/yes/on/y/t -> True, 0/false/no/off/n/f -> False; typos like 'ture' are guessed."""
    raw = (os.environ.get(key) or "").strip().strip("\"'").lower()
    if not raw:
        return default
    if raw in ("1", "true", "yes", "on", "y", "t", "enable", "enabled"):
        return True
    if raw in ("0", "false", "no", "off", "n", "f", "disable", "disabled"):
        return False
    guess = raw[0] in "ty1"          # 'ture', 'treu', 'yse' ...
    print(f"WARNING: {key}={raw!r} is not a valid boolean — treating it as {guess}. "
          f"Use true/false.", file=sys.stderr)
    return guess


CONFIG: Dict[str, Any] = {
    "api_id": _env_int("API_ID", PUBLIC_API_ID),
    "api_hash": _env_str("API_HASH", PUBLIC_API_HASH),
    "bot_token": _env_str("BOT_TOKEN", ""),
    "owner_id": _env_int("OWNER_ID", 0),
    # True  = every user who sends /start may use the bot panel (own account + Halloween)
    # False = only owner_id (the first person who logs in) may use it
    "allow_all_users": _env_bool("ALLOW_ALL_USERS", True),
    "use_proxy": _env_bool("USE_PROXY", True),
    "proxy_url": _env_str("PROXY_URL", "socks5://127.0.0.1:1080"),
    # MiaoBet
    "bet_chat": 0,          # active group chat id
    "bet_base": 20000,      # base (first) bet
    "bet_mult": 3,          # multiplier after a loss
    "bet_choice": "odd",    # odd | even
    "bet_cooldown": 61,     # seconds to wait after each result
    "bet_max": 0,           # 0 = no cap; stop if next bet would exceed it
    "bet_current": 0,       # current stake in the martingale ladder
    "bet_delay": 1.0,       # seconds between every click / message in a round
    "bet_allin": True,      # if next bet (x mult) > balance -> bet the whole balance
    "captcha_on": True,     # auto-answer the game bot's math captcha
    "captcha_solved": 0,    # how many captchas were answered
    "captcha_all": True,    # True = answer in every group you are in, False = active group only
    # Meow farmer
    "meow_on": False,       # loop enabled (re-started automatically on boot)
    "meow_chat": 0,         # group where .activemeow was sent
    "meow_title": "",
    "meow_text": "meow",    # text that is sent to trigger the bot
    "meow_extra": 1.0,      # seconds to wait AFTER the timer ends
    "meow_count": 0,
    "meow_points": 0,
    "meow_last_balance": "",
    # Slot challenge (channel posts a 🎰 dice, people throw 🎰 in the comments)
    "slot_on": True,
    "slot_channel": "Minioons_Channel",
    "slot_interval": 1.0,   # seconds between throws
    "slot_max": 300,        # max throws per challenge (safety cap)
    "slot_challenges": 0,
    "slot_throws": 0,
    "slot_matches": 0,
    "slot_wins": 0,
    # Halloween Miyoui — per-user settings: {"<uid>": {...}}
    "hal": {},
}

CONFIG_FILE = DB_DIR / "config.json"
if CONFIG_FILE.exists():
    try:
        _saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        if isinstance(_saved, dict):
            for k, v in _saved.items():
                if not (os.environ.get(k.upper()) or "").strip():
                    CONFIG[k] = v
    except Exception as _e:  # corrupt file -> keep a copy, start from defaults
        try:
            CONFIG_FILE.replace(CONFIG_FILE.with_suffix(".corrupt"))
        except Exception:
            pass
        print(f"WARNING: config.json unreadable ({_e}); using defaults", file=sys.stderr)


def save_config() -> None:
    try:
        tmp = CONFIG_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(CONFIG, indent=2, default=str), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)  # contains the bot token
        except Exception:
            pass
        os.replace(tmp, CONFIG_FILE)
    except Exception as e:
        logging.getLogger("selfbot.main").error(f"save_config failed: {type(e).__name__}: {e}")


def validate_config() -> Tuple[List[str], List[str]]:
    """Returns (fatal problems, warnings)."""
    fatal, warn = [], []
    if not CONFIG["bot_token"]:
        fatal.append("BOT_TOKEN is empty")
    if not CONFIG["api_id"]:
        fatal.append("API_ID is empty")
    if not CONFIG["api_hash"]:
        fatal.append("API_HASH is empty")
    if CONFIG["use_proxy"] and not HAS_SOCKS:
        warn.append("USE_PROXY=true but PySocks not installed — running WITHOUT proxy")
    if not HAS_QRCODE:
        warn.append("qrcode not installed — QR login unavailable (pip install qrcode pillow)")
    return fatal, warn


# ===========================================================================
# 2. LOGGING + ERROR HANDLING
# ===========================================================================
LOG_DIR = DB_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

_fmt = logging.Formatter(
    "%(asctime)s | %(levelname)-7s | %(name)-10s | %(message)s",
    datefmt="%H:%M:%S",
)

_root = logging.getLogger("selfbot")
_root.setLevel(logging.INFO)
_root.propagate = False

_fh = logging.handlers.RotatingFileHandler(
    LOG_DIR / "app.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
)
_fh.setFormatter(_fmt)
_root.addHandler(_fh)

if RICH:
    _ch = RichHandler(rich_tracebacks=True, show_path=False, markup=False)
else:
    _ch = logging.StreamHandler(sys.stdout)
    _ch.setFormatter(_fmt)
_ch.setLevel(logging.INFO)
_root.addHandler(_ch)

# silence telethon's chatty INFO logs but keep warnings
logging.getLogger("telethon").setLevel(logging.WARNING)


def get_log(name: str) -> logging.Logger:
    return _root.getChild(name)


log = get_log("main")
log_bot = get_log("bot")
log_bet = get_log("bet")
log_meow = get_log("meow")
log_hal = get_log("halloween")

console = Console() if RICH else None


def say(msg: str, style: str = "") -> None:
    if console:
        console.print(msg, style=style)
    else:
        print(msg)


# --- error registry ---------------------------------------------------------
ERRORS: "collections.deque[dict]" = collections.deque(maxlen=50)
_last_notify: Dict[str, float] = {}
NOTIFY_EVERY = 300.0  # at most one owner notification per source every 5 min


def _short(exc: BaseException, n: int = 300) -> str:
    return f"{type(exc).__name__}: {exc}"[:n]


def record_error(where: str, exc: BaseException) -> None:
    """Log with traceback and keep it in the in-memory ring buffer."""
    ERRORS.append({
        "ts": datetime.now().strftime("%m-%d %H:%M:%S"),
        "where": where,
        "err": _short(exc),
    })
    try:
        _root.error(f"[{where}] {_short(exc)}", exc_info=exc)
    except Exception:
        pass


async def notify_error(where: str, exc: BaseException) -> None:
    """Tell the owner about an error (rate limited per source)."""
    now = time.time()
    if now - _last_notify.get(where, 0.0) < NOTIFY_EVERY:
        return
    _last_notify[where] = now
    msg = _short(exc, 250).replace("`", "'")
    await _notify_owner(f"⚠️ **Error in** `{where}`\n`{msg}`")


def guard(name: str, notify: bool = True):
    """Decorator for async handlers/tasks: never let an exception escape."""
    def deco(fn: Callable[..., Awaitable[Any]]):
        @functools.wraps(fn)
        async def wrapper(*a, **kw):
            try:
                return await fn(*a, **kw)
            except asyncio.CancelledError:
                raise
            except WAIT_ERRORS as e:
                secs = int(getattr(e, "seconds", 5) or 5)
                log.warning(f"[{name}] flood wait {secs}s")
                await asyncio.sleep(min(secs + 1, 300))
            except Exception as e:
                record_error(name, e)
                if notify:
                    try:
                        await notify_error(name, e)
                    except Exception:
                        pass
        return wrapper
    return deco


def spawn(coro: Awaitable[Any], name: str) -> "asyncio.Task":
    """create_task + log any exception the task dies with."""
    task = asyncio.create_task(coro, name=name)

    def _done(t: "asyncio.Task") -> None:
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            record_error(name, exc)

    task.add_done_callback(_done)
    return task


async def tg_call(factory: Callable[[], Awaitable[Any]], what: str = "call", tries: int = 4) -> Any:
    """
    Run a Telegram call with retries:
      * FloodWait / SlowMode -> sleep the requested time, retry
      * connection / server errors -> exponential backoff
      * everything else -> raised to the caller
    `factory` must create a NEW coroutine on every call.
    """
    delay = 1.0
    last: Optional[BaseException] = None
    for attempt in range(1, tries + 1):
        try:
            return await factory()
        except WAIT_ERRORS as e:
            secs = int(getattr(e, "seconds", 5) or 5)
            if secs > 300:
                raise
            log.warning(f"{what}: flood wait {secs}s (try {attempt}/{tries})")
            last = e
            await asyncio.sleep(secs + 1)
        except TRANSIENT_ERRORS as e:
            last = e
            if attempt == tries:
                raise
            log.warning(f"{what}: {type(e).__name__} (try {attempt}/{tries}) — retry in {delay:.0f}s")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 15)
    if last:
        raise last
    raise RuntimeError(f"{what} failed")


def _loop_exception_handler(loop, context) -> None:
    exc = context.get("exception")
    msg = context.get("message", "")
    if isinstance(exc, asyncio.CancelledError):
        return
    if exc is not None:
        record_error("asyncio", exc)
    else:
        log.error(f"asyncio: {msg}")


# ===========================================================================
# 3. DATABASE
# ===========================================================================
_local = threading.local()
_init_lock = threading.Lock()
_initialized = False


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(
        str(DB_FILE), timeout=30.0, isolation_level=None, check_same_thread=False
    )
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.row_factory = sqlite3.Row
    return conn


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = _connect()
        _local.conn = conn
    return conn


def _reset_conn() -> None:
    conn = getattr(_local, "conn", None)
    _local.conn = None
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass


def db_exec(sql: str, params: tuple = ()):
    """Execute with one automatic reconnect on a broken connection."""
    for attempt in (1, 2):
        try:
            return get_conn().execute(sql, params)
        except (sqlite3.ProgrammingError, sqlite3.InterfaceError):
            if attempt == 2:
                raise
            _reset_conn()
        except sqlite3.OperationalError as e:
            if attempt == 2 or "locked" not in str(e).lower():
                raise
            time.sleep(0.5)


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    username    TEXT    DEFAULT '',
    first_name  TEXT    DEFAULT '',
    phone       TEXT    DEFAULT '',
    banned      INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT '',
    last_seen   TEXT    DEFAULT ''
);
CREATE TABLE IF NOT EXISTS groups (
    chat_id   INTEGER PRIMARY KEY,
    title     TEXT DEFAULT '',
    added_at  TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bets (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT    DEFAULT '',
    chat_id   INTEGER DEFAULT 0,
    choice    TEXT    DEFAULT '',
    amount    INTEGER DEFAULT 0,
    dice      TEXT    DEFAULT '[]',
    total     INTEGER DEFAULT 0,
    won       INTEGER DEFAULT 0,
    net       INTEGER DEFAULT 0,
    balance   INTEGER
);
"""


def init_db() -> None:
    global _initialized
    with _init_lock:
        if _initialized:
            return
        get_conn().executescript(SCHEMA)
        _initialized = True
        log.info(f"database ready: {DB_FILE}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def db_get_user(uid: int) -> Optional[dict]:
    init_db()
    row = db_exec("SELECT * FROM users WHERE id=?", (int(uid),)).fetchone()
    return dict(row) if row else None


def db_upsert_user(uid: int, **fields) -> None:
    init_db()
    exists = db_exec("SELECT 1 FROM users WHERE id=?", (int(uid),)).fetchone()
    if exists is None:
        cols = ["id"] + list(fields.keys())
        vals = tuple([int(uid)] + list(fields.values()))
        ph = ",".join("?" * len(cols))
        db_exec(f"INSERT INTO users ({','.join(cols)}) VALUES ({ph})", vals)
    elif fields:
        sets = ",".join(f"{k}=?" for k in fields)
        db_exec(f"UPDATE users SET {sets} WHERE id=?", tuple(list(fields.values()) + [int(uid)]))


def db_count_users() -> int:
    init_db()
    r = db_exec("SELECT COUNT(*) c FROM users").fetchone()
    return int(r["c"]) if r else 0


def ensure_user(uid: int, username: str = "", first_name: str = "", phone: str = "") -> dict:
    u = db_get_user(uid)
    if u:
        updates: Dict[str, Any] = {"last_seen": _now()}
        if username and username != u.get("username"):
            updates["username"] = username
        if first_name and first_name != u.get("first_name"):
            updates["first_name"] = first_name
        if phone and phone != u.get("phone"):
            updates["phone"] = phone
        db_upsert_user(uid, **updates)
        return db_get_user(uid) or u

    db_upsert_user(
        uid,
        username=username or "",
        first_name=first_name or "",
        phone=phone or "",
        banned=0,
        created_at=_now(),
        last_seen=_now(),
    )
    return db_get_user(uid) or {}


def touch(uid: int) -> None:
    db_upsert_user(uid, last_seen=_now())


def is_banned(uid: int) -> bool:
    u = db_get_user(uid)
    return bool(u and u["banned"])


def owner_id() -> int:
    return int(CONFIG.get("owner_id") or 0)


def is_owner(uid: int) -> bool:
    """
    Who may use the panel.
    allow_all_users=True  -> everyone who started the bot (banned users are blocked earlier).
    allow_all_users=False -> only owner_id; owner_id == 0 means 'not claimed yet'.
    """
    if CONFIG.get("allow_all_users", True):
        return True
    oid = owner_id()
    return oid == 0 or uid == oid


# --- groups -----------------------------------------------------------------
def db_add_group(chat_id: int, title: str) -> None:
    init_db()
    db_exec(
        "INSERT INTO groups (chat_id, title, added_at) VALUES (?,?,?) "
        "ON CONFLICT(chat_id) DO UPDATE SET title=excluded.title",
        (int(chat_id), title or "", _now()),
    )


def db_list_groups() -> List[dict]:
    init_db()
    rows = db_exec("SELECT * FROM groups ORDER BY added_at").fetchall()
    return [dict(r) for r in rows]


def db_del_group(chat_id: int) -> None:
    init_db()
    db_exec("DELETE FROM groups WHERE chat_id=?", (int(chat_id),))


def db_group_title(chat_id: int) -> str:
    init_db()
    r = db_exec("SELECT title FROM groups WHERE chat_id=?", (int(chat_id),)).fetchone()
    return r["title"] if r else str(chat_id)


# --- bets -------------------------------------------------------------------
def db_add_bet(chat_id, choice, amount, dice, total, won, net, balance) -> None:
    init_db()
    db_exec(
        "INSERT INTO bets (ts, chat_id, choice, amount, dice, total, won, net, balance) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (_now(), int(chat_id), choice, int(amount), json.dumps(dice), int(total),
         1 if won else 0, int(net), balance),
    )


def db_all_bets() -> List[dict]:
    init_db()
    rows = db_exec("SELECT * FROM bets ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def db_last_balance() -> Optional[int]:
    init_db()
    r = db_exec("SELECT balance FROM bets WHERE balance IS NOT NULL ORDER BY id DESC LIMIT 1").fetchone()
    return int(r["balance"]) if r and r["balance"] is not None else None


def db_clear_bets() -> None:
    init_db()
    db_exec("DELETE FROM bets")


# ===========================================================================
# 4. HELPERS
# ===========================================================================
_TR = str.maketrans({
    **{c: str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")},
    **{c: str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")},
    "ي": "ی", "ك": "ک", "\u200c": "", "\u200f": "", "\u200e": "",
})


def clean(t: Optional[str]) -> str:
    """Normalize digits / Arabic letters / invisible marks for matching."""
    return (t or "").translate(_TR)


def fmt_k(n: int) -> str:
    n = int(n)
    return f"{n // 1000}k" if n % 1000 == 0 else f"{n:,}"


def fmt_mmss(secs: float) -> str:
    secs = max(int(secs), 0)
    h, rem = divmod(secs, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def amount_to_send(n: int) -> str:
    n = int(n)
    return f"{n // 1000}k" if n % 1000 == 0 else str(n)


def parse_amount(s: str) -> Optional[int]:
    s = clean(s).strip().lower().replace(",", "").replace(" ", "")
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(k|کی|m|م)?", s)
    if not m:
        return None
    mult = {"k": 1000, "کی": 1000, "m": 1_000_000, "م": 1_000_000, None: 1}[m.group(2)]
    return int(float(m.group(1)) * mult)


def sbtn(text: str, data: bytes, style: Optional[str] = None):
    """Inline button; style = primary | success | danger (coloured, if supported)."""
    if style:
        try:
            return Button.inline(text, data, style=style)
        except TypeError:
            pass
    return Button.inline(text, data)


_CAPTCHA_RE = re.compile(r"(\d+)\s*([+\-−–×xX*÷/:])\s*(\d+)\s*=\s*\?")


def solve_captcha(text: Optional[str]) -> Optional[int]:
    """Solve '🧮 کپچا ریاضی! ❓ 9 - 8 = ?' — no eval, fixed operators only."""
    t = clean(text)
    if "کپچا" not in t:
        return None
    m = _CAPTCHA_RE.search(t)
    if not m:
        return None
    a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
    if op == "+":
        return a + b
    if op in "-−–":
        return a - b
    if op in "×xX*":
        return a * b
    if op in "÷/:":
        return a // b if b and a % b == 0 else None
    return None


def btn_data(msg, key: str) -> Optional[bytes]:
    """Return callback data of the first inline button whose data contains key."""
    rm = getattr(msg, "reply_markup", None)
    for row in getattr(rm, "rows", None) or []:
        for b in getattr(row, "buttons", None) or []:
            d = getattr(b, "data", None)
            if d and key.encode() in d:
                return d
    return None


# --- meow reply parsing -----------------------------------------------------
#   `779` میو پوینت گرفتی 🐾
#   💰 میو پوینت هات : `29.92 هزار` 🪙
#   ⏳ بعد از `4:20` میتونی دوباره میو میو کنی
_MEOW_GAIN_RE = re.compile(r"([\d.,]+)\s*میو\s*پوینت\s*گرفتی")
_MEOW_BAL_RE = re.compile(r"میو\s*پوینت\s*هات\D*?([\d.,]+)\s*(هزار|میلیون|میلیارد|k|m)?", re.I)
_MEOW_TIMER_RE = re.compile(r"بعد\s*از\D{0,6}?(\d{1,2}):(\d{2})(?::(\d{2}))?")
_ANY_TIMER_RE = re.compile(r"(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)")


def parse_meow(text: Optional[str]) -> Optional[dict]:
    """Extract points gained / balance string / seconds until next meow."""
    t = clean(text).replace("`", "")
    if "میو" not in t:
        return None
    gain = None
    m = _MEOW_GAIN_RE.search(t)
    if m:
        digits = re.sub(r"\D", "", m.group(1))
        gain = int(digits) if digits else None
    bal = None
    m = _MEOW_BAL_RE.search(t)
    if m:
        bal = f"{m.group(1).strip('.,')} {m.group(2) or ''}".strip()
    secs = None
    m = _MEOW_TIMER_RE.search(t)
    if not m and ("میتونی" in t or "دوباره" in t):
        m = _ANY_TIMER_RE.search(t)
    if m:
        a, b, c = m.groups()
        secs = (int(a) * 3600 + int(b) * 60 + int(c)) if c is not None else (int(a) * 60 + int(b))
    if secs is None and gain is None:
        return None
    return {"gain": gain, "balance": bal, "secs": secs}


# ===========================================================================
# 5. RUNTIME
# ===========================================================================
class Runtime:
    def __init__(self):
        self.bot: Optional[TelegramClient] = None
        # RT.user = the OWNER's authorized account (used by MiaoBet / Meow / Captcha / Slot).
        # Every logged-in account (owner included) also lives in ACCOUNTS.
        self.user: Optional[TelegramClient] = None
        self.stop_evt: Optional[asyncio.Event] = None   # created inside the running loop
        self.qr_wait_tasks: Dict[int, asyncio.Task] = {}
        self.qr_2fa: Dict[int, bool] = {}
        self.await_input: Dict[int, str] = {}
        self.engine: Optional["BetEngine"] = None
        self.meow: Optional["MeowEngine"] = None
        self.watchdog: Optional[asyncio.Task] = None
        self.phone_flow: Dict[int, dict] = {}
        self.twofa_tries: Dict[int, int] = {}

    def is_2fa(self, uid: int) -> bool:
        return bool(self.qr_2fa.get(uid))

    def set_2fa(self, uid: int, v: bool) -> None:
        if v:
            self.qr_2fa[uid] = True
        else:
            self.qr_2fa.pop(uid, None)


RT = Runtime()


async def _notify_owner(text: str) -> None:
    oid = owner_id()
    if not (RT.bot and oid):
        return
    try:
        await RT.bot.send_message(oid, text, parse_mode="md")
    except Exception:
        try:  # markdown may have been the problem
            await RT.bot.send_message(oid, text)
        except Exception:
            pass


def _proxy_tuple() -> Optional[tuple]:
    if not CONFIG["use_proxy"]:
        return None
    if not HAS_SOCKS:
        log.warning("PySocks not installed — running without proxy")
        return None
    url = CONFIG["proxy_url"]
    try:
        u = urlparse(url)
        scheme = (u.scheme or "socks5").lower()
        host = u.hostname or "127.0.0.1"
        port = int(u.port or 1080)
    except Exception as e:
        log.warning(f"proxy parse failed: {e}")
        return None
    m = {
        "socks5": socks.SOCKS5,
        "socks4": socks.SOCKS4,
        "http": socks.HTTP,
        "https": socks.HTTP,
    }
    if scheme not in m:
        return None
    log.info(f"proxy: {scheme}://{host}:{port}")
    return (m[scheme], host, port)


def _api_creds() -> tuple:
    try:
        api_id = int(CONFIG.get("api_id") or 0) or PUBLIC_API_ID
    except (TypeError, ValueError):
        api_id = PUBLIC_API_ID
    api_hash = (str(CONFIG.get("api_hash") or "")).strip() or PUBLIC_API_HASH
    return api_id, api_hash


_CONN_KW = dict(
    auto_reconnect=True,
    connection_retries=10,
    retry_delay=2,
    request_retries=5,
    flood_sleep_threshold=30,
)


# --- per-user sessions (StringSession: one text file per user, no SQLite lock) ---
SESS_DIR = DB_DIR / "sessions"
SESS_DIR.mkdir(exist_ok=True)
ACCOUNTS: Dict[int, TelegramClient] = {}   # uid -> authorized client
PENDING: Dict[int, TelegramClient] = {}    # uid -> client in the middle of login


def load_session_str(uid: int) -> str:
    p = SESS_DIR / f"{uid}.txt"
    try:
        return p.read_text(encoding="utf-8").strip() if p.exists() else ""
    except Exception:
        return ""


def save_session(uid: int, client: TelegramClient) -> None:
    try:
        p = SESS_DIR / f"{uid}.txt"
        tmp = p.with_suffix(".tmp")
        tmp.write_text(StringSession.save(client.session), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except Exception:
            pass
        os.replace(tmp, p)
    except Exception as e:
        record_error("save_session", e)


def drop_session(uid: int) -> None:
    try:
        (SESS_DIR / f"{uid}.txt").unlink(missing_ok=True)
    except Exception:
        pass


def uid_of(client) -> Optional[int]:
    for u, c in ACCOUNTS.items():
        if c is client:
            return u
    return None


def _make_user_client(uid: int) -> TelegramClient:
    api_id, api_hash = _api_creds()
    return TelegramClient(
        StringSession(load_session_str(uid)),
        api_id,
        api_hash,
        proxy=_proxy_tuple(),
        device_model="Pixel 7 Pro",
        system_version="14",
        app_version="10.2.0",
        lang_code="en",
        system_lang_code="en-US",
        **_CONN_KW,
    )


def _make_bot_client() -> TelegramClient:
    api_id, api_hash = _api_creds()
    return TelegramClient(
        str(DB_DIR / "bot.session"),
        api_id,
        api_hash,
        proxy=_proxy_tuple(),
        **_CONN_KW,
    )


async def migrate_old_session() -> None:
    """user.session (sqlite) -> sessions/<owner>.txt, once."""
    old_f = DB_DIR / "user.session"
    if not old_f.exists() or list(SESS_DIR.glob("*.txt")):
        return
    api_id, api_hash = _api_creds()
    old = TelegramClient(str(old_f), api_id, api_hash, proxy=_proxy_tuple())
    try:
        await old.connect()
        if await old.is_user_authorized():
            me = await old.get_me()
            target = owner_id() or me.id
            ss = StringSession()
            ss.set_dc(old.session.dc_id, old.session.server_address, old.session.port)
            ss.auth_key = old.session.auth_key
            (SESS_DIR / f"{target}.txt").write_text(ss.save(), encoding="utf-8")
            if not CONFIG["owner_id"]:
                CONFIG["owner_id"] = target
                save_config()
            log.info(f"old user.session migrated -> sessions/{target}.txt")
    except Exception as e:
        record_error("migrate-session", e)
    finally:
        try:
            await old.disconnect()
        except Exception:
            pass
    try:
        old_f.replace(old_f.with_suffix(".migrated"))
    except Exception:
        pass


# ===========================================================================
# 6. MIAOBET ENGINE
# ===========================================================================
class BetEngine:
    """Martingale bowling bettor driven by the owner's account (RT.user)."""

    def __init__(self):
        self.task: Optional[asyncio.Task] = None
        self.waiters: List[Tuple[Any, asyncio.Future]] = []
        self.state = "stopped"
        self.game_bot_id = 0
        self.last_bot_text = ""
        self.last_balance: Optional[int] = None
        self.next_run_at: Optional[float] = None

    # --- control -----------------------------------------------------------
    @property
    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def start(self) -> Optional[str]:
        if self.running:
            return "Already running."
        if RT.user is None:
            return "Log in first."
        if not CONFIG.get("bet_chat"):
            return "No active group. Send .activegroupsbet inside a group."
        self.game_bot_id = 0
        self._clear_waiters()
        if self.last_balance is None:
            self.last_balance = db_last_balance()
        self.task = spawn(self._loop(), "bet-loop")
        return None

    def _clear_waiters(self) -> None:
        for _, fut in self.waiters:
            if not fut.done():
                fut.cancel()
        self.waiters.clear()

    def stop(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
        self._clear_waiters()
        self.state = "stopped"
        self.next_run_at = None

    def current_bet(self) -> int:
        base = max(int(CONFIG.get("bet_base") or MIN_BET), MIN_BET)
        cur = int(CONFIG.get("bet_current") or 0)
        amt = max(cur or base, MIN_BET)
        # all-in: the ladder asks for more than we own -> bet everything we have
        bal = self.last_balance
        if CONFIG.get("bet_allin", True) and bal is not None and bal >= MIN_BET and amt > bal:
            amt = bal
        return amt

    async def notify(self, text: str) -> None:
        await _notify_owner(text)

    # --- waiters -----------------------------------------------------------
    def feed(self, msg) -> None:
        for item in list(self.waiters):
            pred, fut = item
            if fut.done():
                self.waiters.remove(item)
                continue
            try:
                ok = pred(msg)
            except Exception:
                ok = False
            if ok:
                self.waiters.remove(item)
                fut.set_result(msg)

    def expect(self, pred) -> asyncio.Future:
        fut = asyncio.get_running_loop().create_future()
        self.waiters.append((pred, fut))
        return fut

    async def wait(self, fut: asyncio.Future, timeout: float):
        try:
            return await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            self.waiters = [w for w in self.waiters if w[1] is not fut]
            return None

    async def _click(self, msg, key: str) -> None:
        data = btn_data(msg, key)
        if data is None:
            raise RuntimeError(f"button '{key}' not found")
        client = RT.user
        if client is None:
            raise RuntimeError("logged out")
        peer = await client.get_input_entity(int(CONFIG["bet_chat"]))
        try:
            await client(GetBotCallbackAnswerRequest(peer=peer, msg_id=msg.id, data=data))
        except WAIT_ERRORS:
            raise
        except Exception as e:
            # bots that never answer the callback raise a timeout; the click still counted
            if "BotResponseTimeout" in type(e).__name__:
                return
            raise

    # --- one round ---------------------------------------------------------
    async def run_round(self) -> Tuple[str, str]:
        client = RT.user
        if client is None:
            return "stop", "Logged out."
        chat = int(CONFIG["bet_chat"])
        choice = CONFIG["bet_choice"]
        amount = self.current_bet()
        t0 = datetime.now(timezone.utc) - timedelta(seconds=20)
        delay = max(float(CONFIG.get("bet_delay") or 1.0), 0.0)

        def btn_pred(key):
            return lambda m: m.date >= t0 and btn_data(m, key) is not None

        def text_pred(sub):
            return lambda m: m.date >= t0 and sub in clean(m.raw_text)

        def result_pred(m):
            return m.date >= t0 and re.search(
                r"\[\s*\d+\s*(?:,\s*\d+\s*)+\]", clean(m.raw_text)
            ) is not None

        # 1) open the panel
        self.state = "opening panel"
        f1 = self.expect(btn_pred(BTN_SINGLE))
        await tg_call(lambda: client.send_message(chat, GAME_TRIGGER), "open panel")
        m1 = await self.wait(f1, 25)
        if not m1:
            return "fail", f"no panel after '{GAME_TRIGGER}' (last: {self.last_bot_text[:80]})"
        self.game_bot_id = m1.sender_id or 0

        # 2) single player
        self.state = "single player"
        f2 = self.expect(btn_pred(BTN_BOWLING))
        await asyncio.sleep(delay)
        await self._click(m1, BTN_SINGLE)
        m2 = await self.wait(f2, 15)
        if not m2:
            return "fail", "bowling button never appeared"

        # 3) bowling
        self.state = "bowling"
        ckey = BTN_CHOICE.format(choice)
        f3 = self.expect(btn_pred(ckey))
        await asyncio.sleep(delay)
        await self._click(m2, BTN_BOWLING)
        m3 = await self.wait(f3, 15)
        if not m3:
            return "fail", f"choice button '{ckey}' never appeared"

        # 4) odd / even
        self.state = f"choice {choice}"
        f4 = self.expect(text_pred("مبلغ شرط"))
        await asyncio.sleep(delay)
        await self._click(m3, ckey)
        m4 = await self.wait(f4, 15)
        if not m4:
            return "fail", "amount prompt never appeared"

        # 5) amount as a reply to the prompt
        self.state = f"bet {fmt_k(amount)}"
        f5 = self.expect(text_pred("ثبت شد"))
        await asyncio.sleep(delay)
        await tg_call(
            lambda: client.send_message(chat, amount_to_send(amount), reply_to=m4.id), "send amount"
        )
        m5 = await self.wait(f5, 20)
        if not m5:
            return "fail", f"bet not registered (last: {self.last_bot_text[:100]})"

        # 6) three bowling dice
        self.state = "throwing 🎳🎳🎳"
        f6 = self.expect(result_pred)
        await asyncio.sleep(delay)
        for _ in range(3):
            await tg_call(lambda: client.send_file(chat, InputMediaDice("🎳")), "throw dice")
            await asyncio.sleep(max(delay, 1.0))
        m6 = await self.wait(f6, 90)
        if not m6:
            return "fail", "no result message (timeout / penalty?)"

        # 7) parse result
        txt = clean(m6.raw_text)
        mm = re.search(r"\[([^\]]*)\]", txt)
        dice = [int(x) for x in re.findall(r"\d+", mm.group(1))] if mm else []
        total = sum(dice)
        if "باختی" in txt:
            won = False
        elif "بردی" in txt or "برنده" in txt:
            won = True
        else:
            won = (total % 2 == 1) == (choice == "odd")

        bm = re.search(r"موجودی جدید\D*([\d,]+)", txt)
        bdigits = bm.group(1).replace(",", "") if bm else ""
        balance = int(bdigits) if bdigits else None

        net = amount if won else -amount
        if balance is not None and self.last_balance is not None:
            diff = balance - self.last_balance
            if (won and diff > 0) or (not won and diff < 0):
                net = diff
        if balance is not None:
            self.last_balance = balance

        try:
            db_add_bet(chat, choice, amount, dice, total, won, net, balance)
        except Exception as e:  # never lose the ladder state because the DB hiccuped
            record_error("db_add_bet", e)

        # --- next stake ------------------------------------------------------
        base = max(int(CONFIG["bet_base"]), MIN_BET)
        mult = float(CONFIG["bet_mult"])
        nxt = base if won else int(round(amount * mult))
        all_in = False
        if (not won and balance is not None and nxt > balance
                and CONFIG.get("bet_allin", True) and balance >= MIN_BET):
            nxt = balance          # ×mult is more than we own -> put everything in
            all_in = True
        CONFIG["bet_current"] = nxt
        save_config()
        log_bet.info(
            f"{'WIN' if won else 'LOSS'} bet={amount} dice={dice} total={total} "
            f"net={net} balance={balance} next={nxt}{' ALL-IN' if all_in else ''}"
        )
        if all_in:
            await self.notify(
                f"🔥 **ALL-IN next round**\n"
                f"×{mult:g} ladder wanted {fmt_k(int(round(amount * mult)))} but your balance is "
                f"{balance:,} → betting **{balance:,}**."
            )

        mx = int(CONFIG.get("bet_max") or 0)
        if mx and nxt > mx:
            return "stop", f"Next bet {fmt_k(nxt)} exceeds your max bet {fmt_k(mx)}."
        if balance is not None and nxt > balance:
            return "stop", (
                f"Next bet {fmt_k(nxt)} is more than your balance {balance:,}"
                + (f" (and balance is below the {fmt_k(MIN_BET)} minimum)." if balance < MIN_BET else ".")
            )
        return "ok", "win" if won else "loss"

    # --- loop --------------------------------------------------------------
    async def _loop(self) -> None:
        fails = 0
        try:
            while True:
                try:
                    status, info = await self.run_round()
                except asyncio.CancelledError:
                    raise
                except FATAL_SEND_ERRORS as e:
                    record_error("bet-round", e)
                    status, info = "stop", f"Fatal Telegram error: {_short(e, 150)}"
                except Exception as e:
                    record_error("bet-round", e)
                    status, info = "fail", _short(e, 200)

                if status == "stop":
                    await self.notify(f"⏹ **MiaoBet stopped**\n{info}")
                    break
                if status == "fail":
                    fails += 1
                    log_bet.warning(f"round failed ({fails}/3): {info}")
                    if fails >= 3:
                        await self.notify(
                            f"⏹ **MiaoBet stopped** after 3 failed rounds.\n`{info.replace('`', chr(39))}`"
                        )
                        break
                else:
                    fails = 0

                cd = max(int(CONFIG.get("bet_cooldown") or 61), 5)
                self.state = f"waiting {cd}s"
                self.next_run_at = time.time() + cd
                await asyncio.sleep(cd)
        except asyncio.CancelledError:
            pass
        finally:
            self._clear_waiters()
            self.state = "stopped"
            self.next_run_at = None


RT.engine = BetEngine()


def set_active_chat(cid: int) -> None:
    if int(CONFIG.get("bet_chat") or 0) != int(cid):
        RT.engine.stop()
        CONFIG["bet_chat"] = int(cid)
        save_config()


# ===========================================================================
# 6b. MEOW ENGINE
# ===========================================================================
class MeowEngine:
    """
    Sends 'meow' in the active meow group, reads the bot's reply
    (points + 'بعد از M:SS میتونی دوباره میو میو کنی'), waits that long
    plus `meow_extra` seconds (default 1s) and meows again.
    """

    REPLY_TIMEOUT = 25.0

    def __init__(self):
        self.task: Optional[asyncio.Task] = None
        self.state = "stopped"
        self.next_at: Optional[float] = None
        self.sent_id: Optional[int] = None
        self.inbox: List[Tuple[Any, dict]] = []
        self.evt: Optional[asyncio.Event] = None

    @property
    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def start(self) -> Optional[str]:
        if self.running:
            return "Already running."
        if RT.user is None:
            return "Log in first."
        if not CONFIG.get("meow_chat"):
            return "No meow group. Send .activemeow inside a group."
        self.inbox.clear()
        self.task = spawn(self._loop(), "meow-loop")
        return None

    def stop(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
        self.state = "stopped"
        self.next_at = None

    def feed(self, msg) -> None:
        info = parse_meow(msg.raw_text)
        if info is None or info["secs"] is None:
            return
        self.inbox.append((msg, info))
        del self.inbox[:-20]
        if self.evt is not None:
            self.evt.set()

    def _pick(self) -> Optional[Tuple[Any, dict]]:
        """The bot's answer to OUR message (reply match), else an unaddressed one."""
        if self.sent_id is not None:
            for msg, info in reversed(self.inbox):
                if getattr(msg, "reply_to_msg_id", None) == self.sent_id:
                    return msg, info
        for msg, info in reversed(self.inbox):
            if getattr(msg, "reply_to_msg_id", None) is None and self.sent_id is not None:
                return msg, info
        return None

    async def _meow_once(self) -> Optional[dict]:
        client = RT.user
        if client is None:
            raise RuntimeError("logged out")
        chat = int(CONFIG["meow_chat"])
        text = (CONFIG.get("meow_text") or "meow").strip() or "meow"
        self.inbox.clear()
        self.sent_id = None
        self.evt = asyncio.Event()
        sent = await tg_call(lambda: client.send_message(chat, text), "meow send")
        self.sent_id = getattr(sent, "id", None)

        deadline = time.time() + self.REPLY_TIMEOUT
        while True:
            hit = self._pick()
            if hit:
                return hit[1]
            left = deadline - time.time()
            if left <= 0:
                return None
            self.evt.clear()
            try:
                await asyncio.wait_for(self.evt.wait(), left)
            except asyncio.TimeoutError:
                return None

    async def _loop(self) -> None:
        fails = 0
        try:
            while True:
                self.state = "meowing 🐾"
                self.next_at = None
                info: Optional[dict] = None
                try:
                    info = await self._meow_once()
                except asyncio.CancelledError:
                    raise
                except FATAL_SEND_ERRORS as e:
                    record_error("meow", e)
                    await _notify_owner(f"⏹ **Meow stopped**\n`{_short(e, 150).replace('`', chr(39))}`")
                    CONFIG["meow_on"] = False
                    save_config()
                    return
                except Exception as e:
                    record_error("meow", e)

                if info and info["secs"] is not None:
                    fails = 0
                    secs = min(int(info["secs"]), 6 * 3600)
                    extra = max(float(CONFIG.get("meow_extra") or 1.0), 0.0)
                    wait = secs + extra
                    CONFIG["meow_count"] = int(CONFIG.get("meow_count") or 0) + 1
                    if info["gain"]:
                        CONFIG["meow_points"] = int(CONFIG.get("meow_points") or 0) + int(info["gain"])
                    if info["balance"]:
                        CONFIG["meow_last_balance"] = info["balance"]
                    save_config()
                    log_meow.info(
                        f"meow ok gain={info['gain']} balance={info['balance']} "
                        f"timer={fmt_mmss(secs)} → next in {wait:.0f}s"
                    )
                else:
                    fails += 1
                    log_meow.warning(f"no usable reply to meow ({fails}/5)")
                    if fails >= 5:
                        await _notify_owner(
                            "⏹ **Meow stopped** — the bot did not answer 5 times in a row."
                        )
                        CONFIG["meow_on"] = False
                        save_config()
                        return
                    wait = min(30 * fails, 180)

                self.state = f"waiting {fmt_mmss(wait)}"
                self.next_at = time.time() + wait
                await asyncio.sleep(wait)
        except asyncio.CancelledError:
            pass
        finally:
            self.state = "stopped"
            self.next_at = None


RT.meow = MeowEngine()


# ===========================================================================
# 7. USER-ACCOUNT HANDLERS (group activation + game bot listener)
# ===========================================================================
async def _flash(event, text: str) -> None:
    """Edit our own command message, show it for a moment, then delete it."""
    try:
        await event.edit(text)
        await asyncio.sleep(4)
        await event.delete()
    except Exception:
        pass


@guard("activate-group")
async def _on_activate(event) -> None:
    if not event.is_group:
        return
    chat = await event.get_chat()
    title = getattr(chat, "title", None) or str(event.chat_id)
    db_add_group(event.chat_id, title)
    set_active_chat(event.chat_id)
    log_bet.info(f"group activated: {title} ({event.chat_id})")
    await _flash(event, f"✅ MiaoBet active in this group: {title}")


@guard("activate-meow")
async def _on_activemeow(event) -> None:
    if not event.is_group:
        return
    chat = await event.get_chat()
    title = getattr(chat, "title", None) or str(event.chat_id)
    mt = RT.meow
    if int(CONFIG.get("meow_chat") or 0) != int(event.chat_id):
        mt.stop()
    CONFIG["meow_chat"] = int(event.chat_id)
    CONFIG["meow_title"] = title
    CONFIG["meow_on"] = True
    save_config()
    err = mt.start()
    log_meow.info(f"meow active in: {title} ({event.chat_id})" + (f" — {err}" if err else ""))
    await _flash(event, f"🐾 Meow active in this group: {title}" if not err else f"⚠️ {err}")


@guard("stop-meow")
async def _on_stopmeow(event) -> None:
    if not event.is_group:
        return
    RT.meow.stop()
    CONFIG["meow_on"] = False
    save_config()
    await _flash(event, "⏹ Meow stopped.")


@guard("meow-listener", notify=False)
async def _on_meow_msg(event) -> None:
    mt = RT.meow
    if mt is None or not mt.running or not event.is_group:
        return
    if event.chat_id != int(CONFIG.get("meow_chat") or 0):
        return
    sender = await event.get_sender()
    if not getattr(sender, "bot", False):
        return
    mt.feed(event.message)


SLOT_END = "چالش اسلات تموم شد"


def slot_is_end(text: Optional[str]) -> bool:
    """'challenge over' post / edit: has a winner line or says it finished."""
    t = clean(text)
    return (SLOT_END in t
            or bool(re.search(r"برنده\s*[:：]", t))
            or ("اسلات" in t and "تموم شد" in t))


def slot_is_start(text: Optional[str]) -> bool:
    """
    Start post, e.g.
      「 🎰 میوبت 」 🎰 چالش اسلات! 🥇 اولین نفری که این اسلات رو بیاره برندس!
      💰 جایزه: 500,000 میو  💬 اسلات‌هاتون رو توی کامنت‌های همین پست بندازید.
    """
    t = clean(text)
    if not t or slot_is_end(t):
        return False
    return ("چالش اسلات" in t
            or ("اسلات" in t and "کامنت" in t)
            or ("کازینو" in t and "کامنت" in t))


_slot_task: Optional[asyncio.Task] = None


async def _slot_spam(inp, post_id: int, target: Optional[int]) -> None:
    """Throw 🎰 into the comments of the challenge post until we hit the target value."""
    client = RT.user
    if client is None:
        return
    iv = max(float(CONFIG.get("slot_interval") or 1.0), 0.5)
    mx = max(int(CONFIG.get("slot_max") or 300), 1)
    n, errors = 0, 0
    try:
        while n < mx:
            try:
                sent = await client.send_file(inp, InputMediaDice("🎰"), comment_to=post_id)
                errors = 0
            except WAIT_ERRORS as e:
                secs = int(getattr(e, "seconds", 5) or 5)
                log_bet.warning(f"slot: flood wait {secs}s")
                await asyncio.sleep(min(secs + 1, 300))
                continue
            except asyncio.CancelledError:
                raise
            except FATAL_SEND_ERRORS as e:
                record_error("slot", e)
                await _notify_owner(f"⚠️ **Slot challenge:** `{_short(e, 150).replace('`', chr(39))}`")
                return
            except Exception as e:
                errors += 1
                log_bet.warning(f"slot send failed: {type(e).__name__}: {e}")
                if errors >= 3:
                    record_error("slot", e)
                    await _notify_owner(
                        f"⚠️ **Slot challenge:** can't comment — `{_short(e, 150).replace('`', chr(39))}`\n"
                        "Make sure you joined the channel's discussion group."
                    )
                    return
                await asyncio.sleep(2)
                continue
            n += 1
            CONFIG["slot_throws"] = int(CONFIG.get("slot_throws") or 0) + 1
            val = getattr(getattr(sent, "media", None), "value", None)
            if target is not None and val == target:
                CONFIG["slot_matches"] = int(CONFIG.get("slot_matches") or 0) + 1
                save_config()
                log_bet.info(f"slot MATCH value={val} after {n} throws")
                await _notify_owner(f"🎰 **Slot match!** value {val} after {n} throws.")
                return
            await asyncio.sleep(iv)
        save_config()
        await _notify_owner(f"🎰 Slot challenge: reached the cap of {mx} throws without a match.")
    except asyncio.CancelledError:
        save_config()


def slot_stop() -> None:
    global _slot_task
    if _slot_task and not _slot_task.done():
        _slot_task.cancel()
    _slot_task = None


_slot_dice: Dict[str, Any] = {"id": 0, "value": None, "ts": 0.0}
_slot_ended: set = set()
_slot_started: set = set()


def _is_slot_dice(m) -> bool:
    media = getattr(m, "media", None)
    return isinstance(media, MessageMediaDice) and media.emoticon == "🎰"


async def _slot_find_target(event, msg) -> Optional[int]:
    """The dice value we must hit: the 🎰 post this text post replies to (or the one just before it)."""
    try:
        rep = await msg.get_reply_message()
        if rep is not None and _is_slot_dice(rep):
            return getattr(rep.media, "value", None)
        inp = await event.get_input_chat()
        for m in await RT.user.get_messages(inp, limit=6, max_id=msg.id):
            if _is_slot_dice(m) and (msg.date - m.date).total_seconds() < 600:
                return getattr(m.media, "value", None)
    except Exception as e:
        log_bet.warning(f"slot target lookup failed: {type(e).__name__}: {e}")
    return None


async def _slot_channel_ok(event) -> bool:
    if not CONFIG.get("slot_on", True) or not event.is_channel or event.is_group:
        return False
    chat = await event.get_chat()
    want = str(CONFIG.get("slot_channel") or "").lstrip("@").lower()
    return (getattr(chat, "username", None) or "").lower() == want


async def _slot_finish(event, text: str) -> None:
    """The challenge post was edited / a final message arrived: stop and report."""
    slot_stop()
    key = (event.chat_id, event.message.id)
    if key in _slot_ended:
        return
    _slot_ended.add(key)
    if len(_slot_ended) > 500:
        _slot_ended.clear()
    wm = re.search(r"برنده\s*[:：]\s*(.+)", text)
    pm = re.search(r"جایزه\s*[:：]\s*([\d,]+)", text)
    winner = wm.group(1).strip() if wm else "?"
    prize = pm.group(1) if pm else "?"
    mine = False
    try:
        me = await RT.user.get_me()
        mine = bool(me.first_name) and clean(me.first_name).strip() in clean(winner)
    except Exception:
        pass
    if mine:
        CONFIG["slot_wins"] = int(CONFIG.get("slot_wins") or 0) + 1
        save_config()
    await _notify_owner(
        f"🏁 **Slot challenge over**\n🎉 Winner: {winner}\n💰 Prize: {prize}"
        + ("\n🏆 **That's you!**" if mine else "")
    )


@guard("slot-post")
async def _on_slot_post(event) -> None:
    """
    Channel flow:  1) a 🎰 dice post (the target)  2) a text post replying to it,
    "throw 🎰 in the comments"  3) that text post is edited to "challenge over".
    We remember the dice value, then spam 🎰 in the comments of the text post.
    """
    global _slot_task
    if not event.is_channel or event.is_group:
        return
    msg = event.message
    is_dice = isinstance(msg.media, MessageMediaDice) and msg.media.emoticon == "🎰"
    text = clean(msg.raw_text)
    if not is_dice and not text:
        return
    if not await _slot_channel_ok(event):
        return

    if is_dice:
        slot_stop()
        _slot_dice.update(id=msg.id, value=getattr(msg.media, "value", None), ts=time.time())
        log_bet.info(f"slot dice post: id={msg.id} value={_slot_dice['value']}")
        return

    if slot_is_end(text):
        await _slot_finish(event, text)
        return

    # start-of-challenge text post
    recent = time.time() - float(_slot_dice["ts"]) < 300
    linked = recent and getattr(msg, "reply_to_msg_id", None) == _slot_dice["id"]
    if not (slot_is_start(text) or linked):
        return
    key = (event.chat_id, msg.id)
    if key in _slot_started:
        return
    _slot_started.add(key)
    if len(_slot_started) > 500:
        _slot_started.clear()

    slot_stop()
    target = _slot_dice["value"] if recent else None
    if target is None:
        target = await _slot_find_target(event, msg)
    CONFIG["slot_challenges"] = int(CONFIG.get("slot_challenges") or 0) + 1
    save_config()
    pm = re.search(r"جایزه\s*[:：]\s*([\d,]+)", text)
    log_bet.info(f"slot challenge: post={msg.id} target={target} prize={pm.group(1) if pm else '?'}")
    await _notify_owner(
        f"🎰 **Slot challenge started**\n💰 Prize: {pm.group(1) if pm else '?'}\n"
        + (f"🎯 Target value: {target}" if target is not None
           else "⚠️ Couldn't find the target 🎰 — throwing anyway (no auto-stop on match).")
    )
    inp = await event.get_input_chat()
    _slot_task = spawn(_slot_spam(inp, msg.id, target), "slot-spam")


@guard("slot-edit")
async def _on_slot_edit(event) -> None:
    """The challenge text post gets edited into the 'challenge over' message."""
    if not event.is_channel or event.is_group:
        return
    text = clean(event.message.raw_text)
    if not slot_is_end(text):
        return
    if not await _slot_channel_ok(event):
        return
    await _slot_finish(event, text)


_captcha_done: set = set()


@guard("captcha")
async def _on_captcha(event) -> None:
    """Answer the math captcha instantly (every group, or only the active one)."""
    if not CONFIG.get("captcha_on", True) or not event.is_group:
        return
    ans = solve_captcha(event.raw_text)
    if ans is None:
        return
    active = int(CONFIG.get("bet_chat") or 0)
    is_active = bool(active) and event.chat_id == active
    if not is_active and not CONFIG.get("captcha_all", True):
        return
    key = (event.chat_id, event.message.id)
    if key in _captcha_done:
        return
    sender = await event.get_sender()
    if not getattr(sender, "bot", False):
        return
    eng = RT.engine
    if is_active and eng and eng.game_bot_id and sender.id != eng.game_bot_id:
        return
    _captcha_done.add(key)
    if len(_captcha_done) > 2000:
        _captcha_done.clear()
    try:
        await tg_call(
            lambda: RT.user.send_message(event.chat_id, str(ans), reply_to=event.message.id),
            "captcha reply", tries=3,
        )
        CONFIG["captcha_solved"] = int(CONFIG.get("captcha_solved") or 0) + 1
        save_config()
        log_bet.info(f"captcha answered in {event.chat_id}: {ans}")
    except Exception as e:
        log_bet.warning(f"captcha reply failed in {event.chat_id}: {type(e).__name__}: {e}")


@guard("game-listener", notify=False)
async def _on_game_msg(event) -> None:
    eng = RT.engine
    if eng is None or not eng.running:
        return
    if event.chat_id != int(CONFIG.get("bet_chat") or 0):
        return
    try:
        sender = await event.get_sender()
    except Exception:
        return
    if not getattr(sender, "bot", False):
        return
    if eng.game_bot_id and sender.id != eng.game_bot_id:
        return
    eng.last_bot_text = clean(event.raw_text)[:300]
    eng.feed(event.message)


# ===========================================================================
# 7b. HALLOWEEN MIYOUI (per-user, every logged-in account)
# ===========================================================================
HAL_DEFAULT: Dict[str, Any] = {
    "on": False, "chat": 0, "title": "", "trigger": "هالووین میویی", "extra": 2.0,
    "runs": 0, "gifts": 0, "elixirs": 0, "failed": 0, "last_candy": None, "last": "",
}
HAL_FAIL_WORDS = ("کافی نیست", "آبنبات کافی", "نداری", "ناموفق", "موجود نیست")
HAL_OK_WORDS = ("خریدی", "خرید شد", "خرید موفق", "با موفقیت", "خریداری")


def hcfg(uid: int) -> dict:
    d = CONFIG.setdefault("hal", {}).setdefault(str(uid), {})
    for k, v in HAL_DEFAULT.items():
        d.setdefault(k, v)
    return d


def parse_hal_timer(text: Optional[str]) -> Optional[int]:
    """'شارژ مجدد تا : 24 دقیقه 10 ثانیه'  or  'شارژ مجدد تا : 01:24:10'."""
    t = clean(text).replace("`", "")
    m = re.search(r"شارژ\s*مجدد\s*تا\s*:?\s*([^\n]+)", t)
    if not m:
        return None
    seg = m.group(1)
    c = re.search(r"(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)", seg)
    if c:
        a, b, s = c.groups()
        return int(a) * 3600 + int(b) * 60 + int(s) if s is not None else int(a) * 60 + int(b)
    units = {"ساعت": 3600, "دقیقه": 60, "ثانیه": 1}
    found = re.findall(r"(\d+)\s*(ساعت|دقیقه|ثانیه)", seg)
    return sum(int(n) * units[u] for n, u in found) if found else None


def parse_candy(text: Optional[str]) -> Optional[int]:
    m = re.search(r"آبنبات\s*هات\s*:?\s*(\d+)", clean(text).replace("`", ""))
    return int(m.group(1)) if m else None


_HAL_ITEM_RE = re.compile(r"(?m)^\W*(\d+)\s*[─—\-–]\s*(.+?)\s*[·•]")


def parse_hal_items(text: Optional[str]) -> List[dict]:
    t = clean(text).replace("`", "")
    ms = list(_HAL_ITEM_RE.finditer(t))
    out = []
    for i, m in enumerate(ms):
        seg = t[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(t)]
        sold = "تموم شد" in seg
        out.append({"n": int(m.group(1)), "name": m.group(2).strip(),
                    "avail": ("موجود" in seg) and not sold})
    return out


def btn_by_text(msg, sub: str) -> Optional[bytes]:
    """Callback data of the first inline button whose label contains `sub`."""
    rm = getattr(msg, "reply_markup", None)
    for row in getattr(rm, "rows", None) or []:
        for b in getattr(row, "buttons", None) or []:
            d = getattr(b, "data", None)
            if d and sub in clean(getattr(b, "text", "")):
                return d
    return None


def _is_shop(m) -> bool:
    t = clean(m.raw_text)
    return "فروشگاه هالووین" in t and "شارژ مجدد" in t


class HalEngine:
    GIFT_KW = "گیفت"
    ELIXIR_KW = ("آسیب", "اکسیر")

    def __init__(self, uid: int):
        self.uid = uid
        self.task: Optional[asyncio.Task] = None
        self.waiters: List[Tuple[Any, asyncio.Future]] = []
        self.recent: "collections.deque" = collections.deque(maxlen=30)
        self.state = "stopped"
        self.next_at: Optional[float] = None

    @property
    def cfg(self) -> dict:
        return hcfg(self.uid)

    @property
    def client(self) -> Optional[TelegramClient]:
        return ACCOUNTS.get(self.uid)

    @property
    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def start(self) -> Optional[str]:
        if self.running:
            return "Already running."
        if self.client is None:
            return "Log in first."
        if not self.cfg["chat"]:
            return "No group. Send .activehalloween inside a group."
        self.recent.clear()
        self.task = spawn(self._loop(), f"hal-loop-{self.uid}")
        return None

    def stop(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
        for _, f in self.waiters:
            if not f.done():
                f.cancel()
        self.waiters.clear()
        self.state, self.next_at = "stopped", None

    # --- waiters -----------------------------------------------------------
    def feed(self, msg) -> None:
        self.recent.append((time.time(), msg))
        for item in list(self.waiters):
            pred, fut = item
            if fut.done():
                self.waiters.remove(item)
                continue
            try:
                ok = pred(msg)
            except Exception:
                ok = False
            if ok:
                self.waiters.remove(item)
                fut.set_result(msg)

    def expect(self, pred) -> asyncio.Future:
        fut = asyncio.get_running_loop().create_future()
        self.waiters.append((pred, fut))
        return fut

    async def wait(self, fut, timeout: float):
        try:
            return await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            self.waiters = [w for w in self.waiters if w[1] is not fut]
            return None

    async def tell(self, text: str) -> None:
        try:
            await RT.bot.send_message(self.uid, text, parse_mode="md")
        except Exception:
            pass

    async def _click(self, msg, data: bytes) -> str:
        """Press an inline button; returns the toast text the bot answered with (may be '')."""
        client = self.client
        if client is None:
            raise RuntimeError("logged out")
        peer = await client.get_input_entity(int(self.cfg["chat"]))
        try:
            res = await client(GetBotCallbackAnswerRequest(peer=peer, msg_id=msg.id, data=data))
            return getattr(res, "message", "") or ""
        except WAIT_ERRORS:
            raise
        except Exception as e:
            if "BotResponseTimeout" in type(e).__name__:
                return ""
            raise

    # --- choose + buy + verify ---------------------------------------------
    def _choose(self, items, panel):
        """Gift box first; otherwise the damage elixir. Only items that are in stock."""
        order = [("gift", self.GIFT_KW)] + [("elixir", k) for k in self.ELIXIR_KW]
        for kind, kw in order:
            it = next((i for i in items if kw in i["name"] and i["avail"]), None)
            if it and btn_by_text(panel, kw):
                return kind, it, kw
        return None, None, None

    async def _verify(self, item, mark, toast, candy_before):
        """Purchase counts only if we see proof: candy dropped / item sold out / success text."""
        deadline = time.time() + 8
        while True:
            other = [clean(toast)]
            newpanel = None
            for ts, m in list(self.recent):
                if ts < mark:
                    continue
                if _is_shop(m):
                    newpanel = m
                else:
                    other.append(clean(m.raw_text))
            blob = " ".join(other)
            if any(w in blob for w in HAL_FAIL_WORDS):
                return False, "refused: " + blob.strip()[:80], newpanel
            if newpanel is not None:
                t = clean(newpanel.raw_text)
                after = parse_candy(t)
                if candy_before is not None and after is not None and after < candy_before:
                    return True, "candy decreased", newpanel
                it = next((i for i in parse_hal_items(t) if i["n"] == item["n"]), None)
                if it is not None and item["avail"] and not it["avail"]:
                    return True, "item now sold out", newpanel
            if any(w in blob for w in HAL_OK_WORDS):
                return True, "success message", newpanel
            if time.time() >= deadline:
                return False, "no confirmation", newpanel
            await asyncio.sleep(0.5)

    async def _buy(self, panel, kind, kw, item, candy_before):
        for _ in (1, 2):
            data = btn_by_text(panel, kw)
            if data is None:
                return False, "button vanished"
            self.state = f"buying {kind}"
            mark = time.time()
            toast = await self._click(panel, data)
            ok, why, newpanel = await self._verify(item, mark, toast, candy_before)
            if ok:
                return True, why
            if why.startswith("refused"):
                return False, why
            if newpanel is not None:
                panel = newpanel
            await asyncio.sleep(1)
        return False, "no confirmation"

    # --- one round ---------------------------------------------------------
    async def run_round(self):
        client, c = self.client, self.cfg
        if client is None:
            return "stop", "Logged out.", None
        chat = int(c["chat"])
        t0 = datetime.now(timezone.utc) - timedelta(seconds=20)

        def fresh(m):
            return (m.edit_date or m.date) >= t0

        # 1) send the trigger text -> main panel
        self.state = "opening panel"
        f1 = self.expect(lambda m: fresh(m) and btn_by_text(m, "فروشگاه") is not None)
        await tg_call(lambda: client.send_message(chat, c["trigger"]), "hal trigger")
        m1 = await self.wait(f1, 25)
        if not m1:
            return "fail", "no panel after the trigger text", None

        # 2) open the shop -> read the recharge timer
        self.state = "opening shop"
        f2 = self.expect(lambda m: fresh(m) and _is_shop(m))
        await asyncio.sleep(0.8)
        await self._click(m1, btn_by_text(m1, "فروشگاه"))
        shop = await self.wait(f2, 15)
        if not shop:
            return "fail", "shop panel never appeared", None
        read_at = time.time()

        secs = parse_hal_timer(shop.raw_text)
        items = parse_hal_items(shop.raw_text)
        candy = parse_candy(shop.raw_text)
        c["runs"] = int(c["runs"]) + 1
        c["last_candy"] = candy

        # 3) buy gift box (priority) or elixir, verified
        kind, item, kw = self._choose(items, shop)
        if kind:
            ok, why = await self._buy(shop, kind, kw, item, candy)
            if ok:
                key = "gifts" if kind == "gift" else "elixirs"
                c[key] = int(c[key]) + 1
                c["last"] = f"{kind} ✓ ({why})"
                if kind == "gift":
                    await self.tell("🎁 **Gift box bought** ✅ (verified: " + why + ")")
            else:
                c["failed"] = int(c["failed"]) + 1
                c["last"] = f"{kind} ✗ ({why})"
                await self.tell(f"⚠️ **Halloween:** couldn't confirm the {kind} purchase — `{why}`")
        else:
            c["last"] = "nothing to buy"
        save_config()
        log_hal.info(f"[{self.uid}] run={c['runs']} timer={secs} candy={candy} last={c['last']}")

        if secs is None:
            return "fail", "couldn't read the shop timer", None
        extra = max(float(c.get("extra") or 2.0), 0.0)
        return "ok", c["last"], max(read_at + secs + extra - time.time(), 5.0)

    async def _loop(self) -> None:
        fails = 0
        try:
            while True:
                wait: float = 60
                try:
                    status, info, nxt = await self.run_round()
                except asyncio.CancelledError:
                    raise
                except FATAL_SEND_ERRORS as e:
                    record_error("halloween", e)
                    await self.tell(f"⏹ **Halloween stopped**\n`{_short(e, 150).replace('`', chr(39))}`")
                    self.cfg["on"] = False
                    save_config()
                    return
                except Exception as e:
                    record_error("halloween", e)
                    status, info, nxt = "fail", _short(e, 200), None
                if status == "stop":
                    await self.tell(f"⏹ **Halloween stopped**\n{info}")
                    return
                if status == "fail":
                    fails += 1
                    log_hal.warning(f"[{self.uid}] failed ({fails}/4): {info}")
                    if fails >= 4:
                        await self.tell(f"⏹ **Halloween stopped** after 4 failures.\n`{info.replace('`', chr(39))}`")
                        self.cfg["on"] = False
                        save_config()
                        return
                    wait = min(30 * fails, 180)
                else:
                    fails, wait = 0, nxt or 60
                self.state = f"waiting {fmt_mmss(wait)}"
                self.next_at = time.time() + wait
                await asyncio.sleep(wait)
        except asyncio.CancelledError:
            pass
        finally:
            self.state, self.next_at = "stopped", None


HAL: Dict[int, HalEngine] = {}


def hal_engine(uid: int) -> HalEngine:
    e = HAL.get(uid)
    if e is None:
        e = HAL[uid] = HalEngine(uid)
    return e


@guard("hal-on")
async def _on_halon(event) -> None:
    if not event.is_group:
        return
    uid = uid_of(event.client)
    if uid is None:
        return
    chat = await event.get_chat()
    title = getattr(chat, "title", None) or str(event.chat_id)
    c, e = hcfg(uid), hal_engine(uid)
    if int(c["chat"] or 0) != int(event.chat_id):
        e.stop()
    c.update(chat=int(event.chat_id), title=title, on=True)
    save_config()
    err = e.start()
    await _flash(event, f"🎃 Halloween active in: {title}" if not err else f"⚠️ {err}")


@guard("hal-off")
async def _on_haloff(event) -> None:
    if not event.is_group:
        return
    uid = uid_of(event.client)
    if uid is None:
        return
    hal_engine(uid).stop()
    hcfg(uid)["on"] = False
    save_config()
    await _flash(event, "⏹ Halloween stopped.")


@guard("hal-listener", notify=False)
async def _on_hal_msg(event) -> None:
    if not event.is_group:
        return
    uid = uid_of(event.client)
    eng = HAL.get(uid) if uid is not None else None
    if eng is None or not eng.running or event.chat_id != int(eng.cfg["chat"] or 0):
        return
    sender = await event.get_sender()
    if not getattr(sender, "bot", False):
        return
    eng.feed(event.message)


def hal_view(uid: int, note: str = "") -> Tuple[str, list]:
    e, c = hal_engine(uid), hcfg(uid)
    run = e.running
    left = f" ({fmt_mmss(e.next_at - time.time())})" if run and e.next_at else ""
    group = c["title"] or "— (send .activehalloween in a group)"
    candy = c["last_candy"] if c["last_candy"] is not None else "—"
    text = (
        "**🎃 Halloween Miyoui**\n\n"
        f"**Status:** {'▶️ Running' if run else '⏹ Stopped'} — {e.state}{left}\n"
        f"**Group:** {group}\n"
        f"**Trigger text:** `{c['trigger']}`\n"
        f"**Extra wait after timer:** {float(c['extra']):g}s\n\n"
        f"**Rounds:** {c['runs']}\n"
        f"**🎁 Gift boxes bought:** {c['gifts']}\n"
        f"**🧪 Elixirs bought:** {c['elixirs']}\n"
        f"**⚠️ Unconfirmed:** {c['failed']}\n"
        f"**🍬 Last candy:** {candy}\n"
        f"**Last result:** {c['last'] or '—'}"
    )
    rows = [
        [sbtn("⏹ Stop" if run else "▶️ Start", b"hal:stop" if run else b"hal:start",
              "danger" if run else "success")],
        [sbtn("✏️ Text", b"hal:set:trigger", "primary"), sbtn("⏱ Extra wait", b"hal:set:extra", "primary")],
        [Button.inline("🔄 Refresh", b"hal:menu"), sbtn("🗑 Reset counters", b"hal:reset", "danger")],
        [Button.inline("◀️ Back", b"nav:main")],
    ]
    return (f"{note}\n\n{text}" if note else text), rows


def hal_apply_input(uid: int, key: str, raw: str) -> Tuple[bool, str]:
    c = hcfg(uid)
    if key == "hal_trigger":
        v = (raw or "").strip()          # keep the text exactly as typed (no normalisation)
        if not v or len(v) > 50:
            return False, "Send 1–50 characters."
        c["trigger"] = v
        save_config()
        return True, f"✅ Trigger text = {v}"
    try:
        v = float(clean(raw).strip().replace(",", "."))
    except ValueError:
        return False, "Send a number."
    if not 0 <= v <= 30:
        return False, "Send seconds between 0 and 30."
    c["extra"] = v
    save_config()
    return True, f"✅ Extra wait = {v:g}s"


def _only_main(fn):
    """Legacy MiaoBet/Meow/Captcha/Slot handlers only react on the OWNER's account."""
    @functools.wraps(fn)
    async def w(event):
        if event.client is RT.user:
            return await fn(event)
    return w


def attach_user_handlers(client: TelegramClient) -> None:
    if getattr(client, "_bet_attached", False):
        return
    client._bet_attached = True
    A = client.add_event_handler
    A(_only_main(_on_activate), events.NewMessage(outgoing=True, pattern=GROUP_CMD))
    A(_only_main(_on_activemeow), events.NewMessage(outgoing=True, pattern=MEOW_ON_CMD))
    A(_only_main(_on_stopmeow), events.NewMessage(outgoing=True, pattern=MEOW_OFF_CMD))
    A(_only_main(_on_captcha), events.NewMessage(incoming=True))
    A(_only_main(_on_slot_post), events.NewMessage(incoming=True))
    A(_only_main(_on_slot_edit), events.MessageEdited(incoming=True))
    A(_only_main(_on_game_msg), events.NewMessage(incoming=True))
    A(_only_main(_on_game_msg), events.MessageEdited(incoming=True))
    A(_only_main(_on_meow_msg), events.NewMessage(incoming=True))
    A(_only_main(_on_meow_msg), events.MessageEdited(incoming=True))
    # Halloween: every account
    A(_on_halon, events.NewMessage(outgoing=True, pattern=HAL_ON_CMD))
    A(_on_haloff, events.NewMessage(outgoing=True, pattern=HAL_OFF_CMD))
    A(_on_hal_msg, events.NewMessage(incoming=True))
    A(_on_hal_msg, events.MessageEdited(incoming=True))
    log_bet.info("user handlers attached")


# ===========================================================================
# 8. PANELS
# ===========================================================================
def main_text(uid: int) -> str:
    logged = "✅" if uid in ACCOUNTS else "❌"
    u = db_get_user(uid) or {}
    name = u.get("first_name") or "—"
    phone = u.get("phone") or "—"
    return (
        f"**🎛 SELF BOT**\n\n"
        f"**Login:** {logged}\n"
        f"**Account:** {name}\n"
        f"**Phone:** `{phone}`"
    )


def main_buttons(uid: int):
    rows = []
    if uid not in ACCOUNTS:
        rows.append([sbtn("📷 Login with QR", b"auth:qr", "success")])
        rows.append([sbtn("📱 Login with Phone", b"auth:phone", "success")])
    else:
        if uid == owner_id() and RT.user:
            rows.append([sbtn("🎳 MiaoBet", b"nav:bet", "primary")])
        rows.append([sbtn("🎃 Halloween", b"hal:menu", "primary")])
        rows.append([sbtn("🚪 Logout", b"auth:logout", "danger")])
    return rows


def qr_prompt_text() -> str:
    return (
        "**📷 QR Login**\n\n"
        "**On your phone:**\n"
        "1. Open **Telegram**\n"
        "2. **Settings → Devices → Link Desktop Device**\n"
        "3. **Scan the QR code** that I send next\n\n"
        "_The QR refreshes every ~30s until you scan it or it expires (4 min)._"
    )


def login_success_text(first_name: str, phone: str) -> str:
    return (
        f"✅ **Logged in!**\n\n"
        f"👤 **{first_name}**\n"
        f"📞 `{phone or '—'}`"
    )


def qr_2fa_text() -> str:
    return (
        "**🔐 2FA Required**\n\n"
        "Your account has **two-step verification**.\n\n"
        "Send your **2FA password** now.\n\n"
        "_Message will be deleted immediately._"
    )


# --- MiaoBet panels ---------------------------------------------------------
def compute_stats() -> dict:
    rows = db_all_bets()
    s = {
        "rounds": len(rows), "wins": 0, "losses": 0,
        "profit": 0, "loss": 0, "odd": 0, "even": 0,
        "faces": {i: 0 for i in range(1, 7)},
        "max_bet": 0, "best_loss_streak": 0, "cur_loss_streak": 0,
        "balance": None,
    }
    cur = 0
    for r in rows:
        won, net = bool(r["won"]), int(r["net"])
        if won:
            s["wins"] += 1
            s["profit"] += max(net, 0)
            cur = 0
        else:
            s["losses"] += 1
            s["loss"] += abs(min(net, 0))
            cur += 1
            s["best_loss_streak"] = max(s["best_loss_streak"], cur)
        if int(r["total"]) % 2:
            s["odd"] += 1
        else:
            s["even"] += 1
        try:
            for d in json.loads(r["dice"] or "[]"):
                if d in s["faces"]:
                    s["faces"][d] += 1
        except Exception:
            pass
        s["max_bet"] = max(s["max_bet"], int(r["amount"]))
        if r["balance"] is not None:
            s["balance"] = int(r["balance"])
    s["cur_loss_streak"] = cur
    return s


def stats_text() -> str:
    s = compute_stats()
    if not s["rounds"]:
        return "**📊 MiaoBet Stats**\n\nNo rounds yet."
    net = s["profit"] - s["loss"]
    wr = s["wins"] * 100 / s["rounds"]
    faces = "  ".join(f"{k}:{v}" for k, v in s["faces"].items())
    bal = f"{s['balance']:,}" if s["balance"] is not None else "—"
    return (
        "**📊 MiaoBet Stats**\n\n"
        f"**Rounds:** {s['rounds']}  (✅ {s['wins']} / ❌ {s['losses']} · {wr:.1f}%)\n"
        f"**Profit:** +{s['profit']:,}\n"
        f"**Loss:** -{s['loss']:,}\n"
        f"**Net:** {'+' if net >= 0 else ''}{net:,}\n"
        f"**Balance:** {bal}\n\n"
        f"**Totals:** odd {s['odd']} · even {s['even']}\n"
        f"**Dice faces:** `{faces}`\n\n"
        f"**Loss streak:** now {s['cur_loss_streak']} · worst {s['best_loss_streak']}\n"
        f"**Highest bet:** {fmt_k(s['max_bet'])}"
    )


FORECAST_HOURS = (1, 6, 12, 24)


def forecast_params() -> dict:
    """Learn win rate / payout / round speed / pace from the bet history."""
    rows = db_all_bets()
    n = len(rows)
    wins = sum(1 for r in rows if r["won"])
    p = (wins + 10) / (n + 20)  # shrink towards 50% while data is thin
    ratios = [r["net"] / r["amount"] for r in rows if r["won"] and r["amount"] and r["net"] > 0]
    ratio = sum(ratios) / len(ratios) if ratios else 1.0
    ts = []
    for r in rows:
        try:
            ts.append(datetime.fromisoformat(r["ts"]))
        except Exception:
            pass
    gaps = [(b - a).total_seconds() for a, b in zip(ts, ts[1:])]
    gaps = [g for g in gaps if 0 < g <= 900]
    cd = max(int(CONFIG.get("bet_cooldown") or 61), 5)
    period = max(statistics.median(gaps) if gaps else cd + 20, cd)
    pace = None
    if len(ts) >= 2:
        hrs = (ts[-1] - ts[0]).total_seconds() / 3600
        if hrs >= 0.05:
            pace = sum(int(r["net"]) for r in rows) / hrs
    balance = None
    if rows and rows[-1]["balance"] is not None:
        balance = int(rows[-1]["balance"])
    elif RT.engine and RT.engine.last_balance is not None:
        balance = RT.engine.last_balance
    return {
        "rounds": n, "p": p, "raw_wr": (wins / n if n else None), "ratio": ratio,
        "period": period, "pace": pace, "balance": balance,
        "base": max(int(CONFIG.get("bet_base") or MIN_BET), MIN_BET),
        "mult": float(CONFIG.get("bet_mult") or 3),
        "bet": RT.engine.current_bet() if RT.engine else MIN_BET,
        "cap": int(CONFIG.get("bet_max") or 0),
        "allin": bool(CONFIG.get("bet_allin", True)),
    }


def simulate_forecast(par: dict, runs: int = 1000) -> dict:
    """Monte-Carlo of the real martingale ladder (incl. all-in). Returns per-horizon stats."""
    marks: Dict[int, List[int]] = {}
    for h in FORECAST_HOURS:
        marks.setdefault(max(int(h * 3600 / par["period"]), 1), []).append(h)
    max_r = max(marks)
    out = {h: {"profit": [], "stopped": 0} for h in FORECAST_HOURS}
    p, ratio, base, mult = par["p"], par["ratio"], par["base"], par["mult"]
    cap, bal0, allin = par["cap"], par["balance"], par.get("allin", True)
    for _ in range(runs):
        prof, bet, dead = 0.0, par["bet"], False
        for r in range(1, max_r + 1):
            if not dead:
                avail = None if bal0 is None else bal0 + prof
                if allin and avail is not None and bet > avail >= MIN_BET:
                    bet = int(avail)
                if (cap and bet > cap) or (avail is not None and bet > avail):
                    dead = True
                elif random.random() < p:
                    prof += bet * ratio
                    bet = base
                else:
                    prof -= bet
                    bet = int(round(bet * mult))
            if r in marks:
                for h in marks[r]:
                    out[h]["profit"].append(prof)
                    out[h]["stopped"] += 1 if dead else 0
    res = {}
    for h in FORECAST_HOURS:
        v = sorted(out[h]["profit"])
        k = len(v)
        res[h] = {
            "rounds": max(int(h * 3600 / par["period"]), 1),
            "median": v[k // 2], "p10": v[int(k * 0.10)], "p90": v[min(int(k * 0.90), k - 1)],
            "mean": sum(v) / k, "stopped": out[h]["stopped"] * 100 / k,
        }
    return res


def _sk(n: float) -> str:
    n = int(round(n))
    return ("+" if n >= 0 else "-") + fmt_k(abs(n))


def forecast_text(par: dict, sim: dict) -> str:
    wr = f"{par['raw_wr'] * 100:.0f}%" if par["raw_wr"] is not None else "—"
    lines = [
        "**🔮 Forecast** (simulation, 1000 runs)\n",
        f"**Based on:** {par['rounds']} rounds · win rate {wr} (used {par['p'] * 100:.0f}%) · "
        f"≈{par['period']:.0f}s per round · payout ×{par['ratio']:.2f}",
        f"**Ladder:** base {fmt_k(par['base'])} · ×{par['mult']:g} · next {fmt_k(par['bet'])}"
        + (f" · max {fmt_k(par['cap'])}" if par["cap"] else "")
        + (" · all-in ON" if par.get("allin") else ""),
    ]
    if par["balance"] is not None:
        lines.append(f"**Balance now:** {par['balance']:,}")
    if par["rounds"] < 30:
        lines.append("_Few rounds so far — treat this as a rough guess._")
    lines.append("")
    for h in FORECAST_HOURS:
        s = sim[h]
        line = (
            f"**{h}h** (≈{s['rounds']} rounds): median **{_sk(s['median'])}**"
            f" · range {_sk(s['p10'])} … {_sk(s['p90'])}"
        )
        if par["balance"] is not None:
            line += f"\n    → balance ≈ {int(par['balance'] + s['median']):,}"
        if s["stopped"] >= 0.5:
            line += f"\n    ⚠️ hit your stop/limit in {s['stopped']:.0f}% of runs"
        lines.append(line)
    if par["pace"] is not None:
        lines.append(
            f"\n**📈 Your real pace so far:** {_sk(par['pace'])}/h → "
            + " · ".join(f"{h}h {_sk(par['pace'] * h)}" for h in FORECAST_HOURS)
        )
    lines.append(
        "\n_This replays your own results through the bet ladder — it is not a prediction "
        "of the dice. With a ×3 ladder most runs look fine while a few lose big, so watch the "
        "low end of the range and the stop %._"
    )
    return "\n".join(lines)


def _with_note(text: str, note: str) -> str:
    return f"{note}\n\n{text}" if note else text


def bet_view(note: str = "") -> Tuple[str, list]:
    """Main MiaoBet hub: status + one button per section."""
    eng = RT.engine
    mt = RT.meow
    chat = int(CONFIG.get("bet_chat") or 0)
    gtitle = db_group_title(chat) if chat else "— (send .activegroupsbet in a group)"
    run = eng.running
    left = ""
    if run and eng.next_run_at:
        left = f" ({max(int(eng.next_run_at - time.time()), 0)}s)"
    choice = "Odd" if CONFIG["bet_choice"] == "odd" else "Even"
    text = (
        "**🎳 MiaoBet — Bowling**\n\n"
        f"**Status:** {'▶️ Running' if run else '⏹ Stopped'} — {eng.state}{left}\n"
        f"**Group:** {gtitle}\n"
        f"**Next bet:** {fmt_k(eng.current_bet())}\n"
        f"**Setup:** {choice} · base {fmt_k(CONFIG['bet_base'])} · ×{float(CONFIG['bet_mult']):g}"
        f" · all-in {'ON' if CONFIG.get('bet_allin', True) else 'OFF'}\n"
        f"**Meow:** {'▶️ Running' if mt.running else '⏹ Stopped'}"
    )
    rows = [
        [sbtn("⏹ Stop" if run else "▶️ Start",
              b"bet:stop" if run else b"bet:start",
              "danger" if run else "success")],
        [sbtn("🎮 Game", b"bet:menu:game", "primary"),
         sbtn("🧮 Captcha", b"bet:menu:cap", "primary"),
         sbtn("🎰 Slots", b"bet:menu:slot", "primary")],
        [sbtn("🐾 Meow", b"bet:menu:meow", "primary"),
         sbtn("👥 Groups", b"bet:groups", "primary"),
         sbtn("📊 Status", b"bet:stats", "primary")],
        [sbtn("🔮 Forecast", b"bet:forecast", "primary"),
         sbtn(f"🧾 Errors ({len(ERRORS)})", b"bet:errors", "danger" if ERRORS else "primary")],
        [Button.inline("🔄 Refresh", b"nav:bet"), Button.inline("◀️ Back", b"nav:main")],
    ]
    return _with_note(text, note), rows


def game_view(note: str = "") -> Tuple[str, list]:
    """Game settings: choice, base, multiplier, max bet, wait, all-in."""
    choice = CONFIG["bet_choice"]
    mx = int(CONFIG.get("bet_max") or 0)
    allin = bool(CONFIG.get("bet_allin", True))
    text = (
        "**🎮 Game settings**\n\n"
        f"**Choice:** {'Odd (فرد)' if choice == 'odd' else 'Even (زوج)'}\n"
        f"**Base bet:** {fmt_k(CONFIG['bet_base'])}  (min {fmt_k(MIN_BET)})\n"
        f"**Multiplier after a loss:** ×{float(CONFIG['bet_mult']):g}\n"
        f"**Max bet:** {fmt_k(mx) if mx else 'off'}\n"
        f"**All-in:** {'✅ ON — if the next bet is more than your balance, bet the whole balance' if allin else '⛔ OFF — stop instead'}\n"
        f"**Wait after each result:** {CONFIG['bet_cooldown']}s\n"
        f"**Delay between steps:** {float(CONFIG.get('bet_delay') or 1):g}s"
    )
    rows = [
        [sbtn(f"🎯 {'Odd' if choice == 'odd' else 'Even'} → tap to switch", b"bet:choice", "primary")],
        [sbtn(f"💰 Base: {fmt_k(CONFIG['bet_base'])}", b"bet:set:base", "success"),
         sbtn(f"✖️ Multiplier: ×{float(CONFIG['bet_mult']):g}", b"bet:set:mult", "success")],
        [sbtn(f"🛑 Max bet: {fmt_k(mx) if mx else 'off'}", b"bet:set:max", "danger"),
         sbtn(f"⏱ Wait: {CONFIG['bet_cooldown']}s", b"bet:set:cd", "primary")],
        [sbtn(f"🔥 All-in: {'ON' if allin else 'OFF'}", b"bet:allin", "success" if allin else "danger")],
        [Button.inline("◀️ Back", b"nav:bet")],
    ]
    return _with_note(text, note), rows


def captcha_view(note: str = "") -> Tuple[str, list]:
    """Captcha solver settings."""
    on = bool(CONFIG.get("captcha_on", True))
    allg = bool(CONFIG.get("captcha_all", True))
    text = (
        "**🧮 Captcha solver**\n\n"
        f"**Status:** {'✅ ON' if on else '⛔ OFF'}\n"
        f"**Where:** {'every group you are in' if allg else 'active group only'}\n"
        f"**Solved so far:** {int(CONFIG.get('captcha_solved') or 0)}"
    )
    rows = [
        [sbtn(f"🧮 Captcha: {'ON' if on else 'OFF'}", b"bet:captcha", "success" if on else "danger")],
        [sbtn("🌐 All groups" if allg else "🎯 Active group only", b"bet:captchascope", "primary")],
        [Button.inline("◀️ Back", b"nav:bet")],
    ]
    return _with_note(text, note), rows


def slot_view(note: str = "") -> Tuple[str, list]:
    """Slot challenge settings."""
    on = bool(CONFIG.get("slot_on", True))
    text = (
        "**🎰 Slot challenge**\n\n"
        f"**Status:** {'✅ ON' if on else '⛔ OFF'}\n"
        f"**Channel:** @{str(CONFIG.get('slot_channel') or '').lstrip('@')}\n"
        f"**Throw every:** {float(CONFIG.get('slot_interval') or 1):g}s  ·  "
        f"**Max per challenge:** {int(CONFIG.get('slot_max') or 300)}\n\n"
        f"**Challenges:** {int(CONFIG.get('slot_challenges') or 0)}  ·  "
        f"**Throws:** {int(CONFIG.get('slot_throws') or 0)}\n"
        f"**Matches:** {int(CONFIG.get('slot_matches') or 0)}  ·  "
        f"**Wins:** {int(CONFIG.get('slot_wins') or 0)}"
    )
    rows = [
        [sbtn(f"🎰 Slots: {'ON' if on else 'OFF'}", b"bet:slot", "success" if on else "danger")],
        [sbtn(f"⏱ Interval: {float(CONFIG.get('slot_interval') or 1):g}s", b"bet:set:slot_iv", "primary"),
         sbtn(f"🔢 Max: {int(CONFIG.get('slot_max') or 300)}", b"bet:set:slot_max", "primary")],
        [Button.inline("◀️ Back", b"nav:bet")],
    ]
    return _with_note(text, note), rows


def meow_view(note: str = "") -> Tuple[str, list]:
    """Meow farmer panel."""
    mt = RT.meow
    run = mt.running
    left = ""
    if run and mt.next_at:
        left = f" ({fmt_mmss(mt.next_at - time.time())} left)"
    chat = int(CONFIG.get("meow_chat") or 0)
    title = (CONFIG.get("meow_title") or str(chat)) if chat else "— (send .activemeow in a group)"
    bal = CONFIG.get("meow_last_balance") or "—"
    text = (
        "**🐾 Meow**\n\n"
        f"**Status:** {'▶️ Running' if run else '⏹ Stopped'} — {mt.state}{left}\n"
        f"**Group:** {title}\n"
        f"**Text sent:** `{CONFIG.get('meow_text') or 'meow'}`\n"
        f"**Extra wait after timer:** {float(CONFIG.get('meow_extra') or 1):g}s\n\n"
        f"**Meows:** {int(CONFIG.get('meow_count') or 0)}\n"
        f"**Points gained:** {int(CONFIG.get('meow_points') or 0):,}\n"
        f"**Last balance:** {bal}"
    )
    rows = [
        [sbtn("⏹ Stop" if run else "▶️ Start", b"bet:meow",
              "danger" if run else "success")],
        [sbtn("✏️ Text", b"bet:set:meow_text", "primary"),
         sbtn("⏱ Extra wait", b"bet:set:meow_extra", "primary")],
        [Button.inline("🔄 Refresh", b"bet:menu:meow"), Button.inline("◀️ Back", b"nav:bet")],
    ]
    return _with_note(text, note), rows


def errors_view() -> Tuple[str, list]:
    if not ERRORS:
        text = "**🧾 Errors**\n\nNo errors recorded. 🎉"
    else:
        lines = ["**🧾 Last errors**\n"]
        for e in list(ERRORS)[-10:][::-1]:
            err = str(e["err"]).replace("`", "'")[:160]
            lines.append(f"`{e['ts']}` **{e['where']}**\n    `{err}`")
        text = "\n".join(lines)[:3800]
        text += f"\n\n_Full tracebacks: {LOG_DIR / 'app.log'}_"
    rows = [
        [sbtn("🔄 Refresh", b"bet:errors", "primary"), sbtn("🗑 Clear", b"bet:errors:clear", "danger")],
        [Button.inline("◀️ Back", b"nav:bet")],
    ]
    return text, rows


def groups_view() -> Tuple[str, list]:
    gs = db_list_groups()
    active = int(CONFIG.get("bet_chat") or 0)
    if gs:
        text = "**👥 Groups**\n\nTap a group to make it active. 🗑 removes it."
    else:
        text = (
            "**👥 Groups**\n\nNo groups yet.\n"
            "Send `.activegroupsbet` inside a group from your own account."
        )
    rows = []
    for g in gs:
        mark = "✅" if g["chat_id"] == active else "⬜"
        title = (g["title"] or str(g["chat_id"]))[:28]
        rows.append([
            sbtn(f"{mark} {title}", f"bet:grp:{g['chat_id']}".encode(),
                 "success" if g["chat_id"] == active else "primary"),
            sbtn("🗑", f"bet:del:{g['chat_id']}".encode(), "danger"),
        ])
    rows.append([Button.inline("◀️ Back", b"nav:bet")])
    return text, rows


INPUT_PROMPTS = {
    "base": f"💰 Send the **base bet** (min {fmt_k(MIN_BET)}), e.g. `20k` or `50000`.",
    "mult": "✖️ Send the **multiplier** after a loss, e.g. `3` (min 1.1).",
    "cd": "⏱ Send the **wait time in seconds** after each result, e.g. `61`.",
    "slot_iv": "⏱ Send the **seconds between slot throws**, e.g. `1` (min 0.5).",
    "slot_max": "🔢 Send the **max throws per challenge**, e.g. `300`.",
    "max": "🛑 Send the **max bet** (stop if the next bet exceeds it), e.g. `500k`. Send `0` to disable.",
    "meow_text": "✏️ Send the **text** to send for each meow, e.g. `meow` or `میو`.",
    "meow_extra": "⏱ Send the **extra seconds** to wait after the bot's timer ends, e.g. `1` (0–30).",
}


def cancel_target(key: str) -> bytes:
    if key.startswith("slot"):
        return b"bet:menu:slot"
    if key.startswith("meow"):
        return b"bet:menu:meow"
    return b"bet:menu:game"


def apply_input(key: str, raw: str) -> Tuple[bool, str]:
    raw = clean(raw).strip()
    if key == "base":
        v = parse_amount(raw)
        if v is None:
            return False, "Couldn't read that amount."
        if v < MIN_BET:
            return False, f"Minimum is {fmt_k(MIN_BET)}."
        CONFIG["bet_base"] = v
        CONFIG["bet_current"] = v
        save_config()
        return True, f"✅ Base bet = {fmt_k(v)}"
    if key == "mult":
        try:
            v = float(raw.replace(",", "."))
        except ValueError:
            return False, "Send a number."
        if not 1.1 <= v <= 20:
            return False, "Multiplier must be between 1.1 and 20."
        CONFIG["bet_mult"] = int(v) if v == int(v) else v
        save_config()
        return True, f"✅ Multiplier = ×{v:g}"
    if key == "cd":
        if not raw.isdigit() or not 5 <= int(raw) <= 3600:
            return False, "Send seconds between 5 and 3600."
        CONFIG["bet_cooldown"] = int(raw)
        save_config()
        return True, f"✅ Wait = {raw}s"
    if key == "max":
        v = 0 if raw.lower() in ("0", "off") else parse_amount(raw)
        if v is None:
            return False, "Couldn't read that amount."
        CONFIG["bet_max"] = v
        save_config()
        return True, f"✅ Max bet = {fmt_k(v) if v else 'off'}"
    if key == "slot_iv":
        try:
            v = float(raw.replace(",", "."))
        except ValueError:
            return False, "Send a number."
        if not 0.5 <= v <= 60:
            return False, "Send seconds between 0.5 and 60."
        CONFIG["slot_interval"] = v
        save_config()
        return True, f"✅ Slot interval = {v:g}s"
    if key == "slot_max":
        if not raw.isdigit() or not 1 <= int(raw) <= 5000:
            return False, "Send a number between 1 and 5000."
        CONFIG["slot_max"] = int(raw)
        save_config()
        return True, f"✅ Slot max throws = {raw}"
    if key == "meow_text":
        v = raw.strip()
        if not v or len(v) > 50:
            return False, "Send 1–50 characters."
        CONFIG["meow_text"] = v
        save_config()
        return True, f"✅ Meow text = {v}"
    if key == "meow_extra":
        try:
            v = float(raw.replace(",", "."))
        except ValueError:
            return False, "Send a number."
        if not 0 <= v <= 30:
            return False, "Send seconds between 0 and 30."
        CONFIG["meow_extra"] = v
        save_config()
        return True, f"✅ Extra wait = {v:g}s"
    return False, "Unknown setting."


def view_for_key(key: str):
    if key.startswith("slot"):
        return slot_view
    if key.startswith("meow"):
        return meow_view
    return game_view


# ===========================================================================
# 9. QR RENDER
# ===========================================================================
def _render_qr_png(url: str) -> Optional[bytes]:
    if not HAS_QRCODE:
        return None
    try:
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        log_bot.warning(f"QR render failed: {e}")
        return None


QR_CAPTION = (
    "**📷 QR Login**\n\n"
    "1. **Telegram** on your phone\n"
    "2. **Settings → Devices → Link Desktop Device**\n"
    "3. **Scan this QR code**\n\n"
    "⏱ It refreshes automatically until you scan it (max ~4 min)."
)


async def _send_qr(uid: int, url: str):
    """Send the QR (image if possible, otherwise the raw URL)."""
    png = _render_qr_png(url)
    if png:
        bio = io.BytesIO(png)
        bio.name = "qr.png"  # telethon needs a name to send it as a photo
        try:
            return await RT.bot.send_file(uid, bio, caption=QR_CAPTION, parse_mode="md")
        except Exception as e:
            log_bot.warning(f"QR image send failed: {e}")
    return await RT.bot.send_message(
        uid, f"{QR_CAPTION}\n\nOpen this URL on your phone:\n`{url}`", parse_mode="md"
    )


# ===========================================================================
# 10. LOGIN (QR + phone)
# ===========================================================================
async def get_login_client(uid: int) -> TelegramClient:
    """Connected client for this user: the authorized one, or a pending one used for login."""
    c = ACCOUNTS.get(uid) or PENDING.get(uid)
    if c is None:
        c = _make_user_client(uid)
        PENDING[uid] = c
    if not c.is_connected():
        await c.connect()
    attach_user_handlers(c)
    return c


def _register_account(uid: int, client: TelegramClient) -> None:
    ACCOUNTS[uid] = client
    PENDING.pop(uid, None)
    save_session(uid, client)
    if not CONFIG["owner_id"]:
        CONFIG["owner_id"] = uid
        save_config()
    if uid == owner_id():
        RT.user = client
    attach_user_handlers(client)


async def adopt_if_authorized(uid: int, client: TelegramClient, event=None) -> bool:
    """If this client is already logged in, just use it (never get stuck on 'login')."""
    try:
        if not await client.is_user_authorized():
            return False
        me = await client.get_me()
    except Exception as e:
        log_bot.warning(f"is_user_authorized failed: {e}")
        return False
    _register_account(uid, client)
    ensure_user(uid, username=me.username or "", first_name=me.first_name or "", phone=me.phone or "")
    text = f"✅ Already logged in as **{me.first_name}**."
    try:
        if event is not None:
            await event.respond(text, buttons=main_buttons(uid), parse_mode="md")
        elif RT.bot:
            await RT.bot.send_message(uid, text, buttons=main_buttons(uid), parse_mode="md")
    except Exception:
        pass
    return True


async def reset_login_state(uid: int) -> None:
    """Forget every half-finished login step for this user (called on /start, cancel...)."""
    RT.phone_flow.pop(uid, None)
    RT.set_2fa(uid, False)
    RT.twofa_tries.pop(uid, None)
    RT.await_input.pop(uid, None)
    t = RT.qr_wait_tasks.pop(uid, None)
    if t and not t.done():
        t.cancel()


TWOFA_BUTTONS = [[Button.inline("✖️ Cancel", b"auth:cancel")]]


async def _finish_login(uid: int) -> None:
    """Common post-login steps (QR scan, phone code or 2FA)."""
    client = PENDING.get(uid) or ACCOUNTS.get(uid)
    if client is None:
        raise RuntimeError("no client to finish login with")
    me = await client.get_me()
    RT.phone_flow.pop(uid, None)
    RT.twofa_tries.pop(uid, None)
    RT.set_2fa(uid, False)
    ensure_user(
        uid,
        username=me.username or "",
        first_name=me.first_name or "",
        phone=me.phone or "",
    )
    # the person chatting with this bot is the owner if nobody claimed it yet
    _register_account(uid, client)
    await RT.bot.send_message(
        uid,
        login_success_text(me.first_name or "User", me.phone or ""),
        buttons=main_buttons(uid),
        parse_mode="md",
    )
    log_bot.info(f"user {uid} logged in as {me.first_name}")
    if uid == owner_id() and CONFIG.get("meow_on") and CONFIG.get("meow_chat"):
        RT.meow.start()
    if hcfg(uid)["on"] and hcfg(uid)["chat"]:
        hal_engine(uid).start()


async def _handle_qr_login(event, uid: int) -> None:
    if not HAS_QRCODE:
        await event.respond(
            "❌ QR login needs `qrcode` + `Pillow`.\n"
            "Install: `pip install qrcode pillow`"
        )
        return

    old = RT.qr_wait_tasks.pop(uid, None)
    if old and not old.done():
        old.cancel()

    RT.phone_flow.pop(uid, None)
    try:
        client = await get_login_client(uid)
    except Exception as e:
        record_error("qr-client", e)
        await event.respond(f"❌ Client error: `{_short(e, 200).replace('`', chr(39))}`")
        return
    if await adopt_if_authorized(uid, client, event):
        return

    try:
        qr = await client.qr_login()
    except Exception as e:
        record_error("qr_login", e)
        await event.respond(
            f"❌ QR start failed: `{_short(e, 200).replace('`', chr(39))}`\n\n"
            f"If this keeps happening, use your own API_ID from my.telegram.org."
        )
        return

    first = None
    try:
        first = await _send_qr(uid, qr.url)
    except Exception as e:
        record_error("qr-send", e)
        await event.respond(f"❌ Couldn't send the QR: `{_short(e, 150).replace('`', chr(39))}`")
        return

    RT.qr_wait_tasks[uid] = spawn(_qr_wait_task(uid, qr, first), f"qr-wait-{uid}")


# --- phone login --------------------------------------------------------------
PHONE_TTL = 600          # a login attempt is forgotten after 10 minutes of silence
MAX_CODE_TRIES = 5


def normalize_phone(raw: str) -> Optional[str]:
    p = re.sub(r"[^\d+]", "", clean(raw))
    if p.startswith("00"):
        p = "+" + p[2:]
    elif p.startswith("09") and len(p) == 11:      # Iranian local format
        p = "+98" + p[1:]
    elif not p.startswith("+"):
        p = "+" + p
    digits = p[1:]
    if not digits.isdigit() or not 7 <= len(digits) <= 15:
        return None
    return p


def flow_get(uid: int) -> Optional[dict]:
    f = RT.phone_flow.get(uid)
    if f and time.time() - f["ts"] > PHONE_TTL:
        RT.phone_flow.pop(uid, None)
        return None
    return f


def _code_len(sent) -> int:
    n = getattr(getattr(sent, "type", None), "length", None)
    return int(n) if isinstance(n, int) and 4 <= n <= 8 else 5


def code_text(f: dict, note: str = "") -> str:
    d = len(f["digits"])
    n = max(f["length"], d)
    dots = " ".join("●" if i < d else "○" for i in range(n))
    text = (
        "**🔐 Enter the login code**\n\n"
        f"**Phone:** `{f['phone']}`\n"
        f"**Code:** {dots}\n\n"
        "Telegram sent the code to your **Telegram app** (chat “Telegram”) or by SMS.\n"
        "Tap the keypad below — or just **type the code** here "
        "(tip: type it with spaces like `1 2 3 4 5`)."
    )
    return f"{note}\n\n{text}" if note else text


def code_buttons(f: dict) -> list:
    o = f["order"]

    def b(c):
        return sbtn(c, f"ph:d:{c}".encode(), "primary")

    return [
        [b(o[0]), b(o[1]), b(o[2])],
        [b(o[3]), b(o[4]), b(o[5])],
        [b(o[6]), b(o[7]), b(o[8])],
        [sbtn("⌫", b"ph:del", "danger"), b(o[9]), sbtn("✅", b"ph:ok", "success")],
        [sbtn("🔀 Shuffle" + (" ✓" if f["shuffle"] else ""), b"ph:shuf", "primary"),
         sbtn("🔁 Resend", b"ph:resend", "primary")],
        [Button.inline("✖️ Cancel", b"auth:cancel")],
    ]


async def phone_panel(uid: int, f: dict, note: str = "", event=None) -> None:
    text, btns = code_text(f, note), code_buttons(f)
    try:
        if event is not None:
            await event.edit(text, buttons=btns, parse_mode="md")
            f["panel"] = event.message_id
            return
        if f.get("panel"):
            await RT.bot.edit_message(uid, f["panel"], text, buttons=btns, parse_mode="md")
            return
    except MessageNotModifiedError:
        return
    except Exception:
        pass
    m = await RT.bot.send_message(uid, text, buttons=btns, parse_mode="md")
    f["panel"] = m.id


async def phone_end(uid: int, text: str) -> None:
    """Finish a failed attempt with a clear message + a way to retry (never a dead end)."""
    f = RT.phone_flow.pop(uid, None)
    if f and f.get("panel"):
        try:
            await RT.bot.delete_messages(uid, f["panel"])
        except Exception:
            pass
    await RT.bot.send_message(
        uid, text,
        buttons=[[sbtn("📱 Try again", b"auth:phone", "primary")],
                 [Button.inline("◀️ Back", b"nav:main")]],
        parse_mode="md",
    )


async def phone_start(event, uid: int, edit) -> None:
    await reset_login_state(uid)
    try:
        client = await get_login_client(uid)
    except Exception as e:
        record_error("phone-client", e)
        await edit(event, f"❌ Client error: `{_short(e, 200).replace('`', chr(39))}`", main_buttons(uid))
        return
    if await adopt_if_authorized(uid, client, event):
        return
    RT.phone_flow[uid] = {"step": "phone", "ts": time.time(), "client": client}
    await edit(
        event,
        "**📱 Phone login**\n\n"
        "Send your phone number **with country code**, e.g. `+989121234567`.\n"
        "_(Iranian numbers like `09121234567` also work.)_\n\n"
        "The number must already be registered in Telegram.",
        [[Button.inline("✖️ Cancel", b"auth:cancel")]],
    )


async def phone_got_number(event, uid: int, f: dict, raw: str) -> None:
    await _tidy(event)
    cancel_row = [[Button.inline("✖️ Cancel", b"auth:cancel")]]
    phone = normalize_phone(raw)
    if not phone:
        await event.respond("❌ That doesn't look like a phone number.\n"
                            "Send it like `+989121234567`.", buttons=cancel_row, parse_mode="md")
        return
    client = f["client"]
    try:
        sent = await client.send_code_request(phone)
    except E_NUM_INVALID:
        await event.respond("❌ Telegram says this phone number is invalid. Check it and send it again.",
                            buttons=cancel_row)
        return
    except E_NUM_BANNED:
        await phone_end(uid, "🚫 This phone number is banned by Telegram.")
        return
    except WAIT_ERRORS as e:
        await phone_end(uid, f"⏳ Too many attempts. Try again in **{fmt_mmss(getattr(e, 'seconds', 60))}**.")
        return
    except Exception as e:
        record_error("phone-send-code", e)
        await phone_end(uid, f"❌ Couldn't send the code: `{_short(e, 200).replace('`', chr(39))}`")
        return
    f.update(
        step="code", phone=phone, hash=sent.phone_code_hash, digits="", tries=0,
        length=_code_len(sent), order=list("1234567890"), shuffle=False,
        panel=None, busy=False, ts=time.time(),
    )
    await phone_panel(uid, f, note="📨 Code sent!")


async def phone_resend(uid: int, f: dict, event=None, note: str = "🔁 New code sent!") -> None:
    try:
        sent = await f["client"].send_code_request(f["phone"])
        f.update(hash=sent.phone_code_hash, digits="", tries=0, length=_code_len(sent), ts=time.time())
    except WAIT_ERRORS as e:
        note = f"⏳ Wait {fmt_mmss(getattr(e, 'seconds', 60))} before asking for another code."
    except Exception as e:
        record_error("phone-resend", e)
        note = f"❌ Resend failed: {_short(e, 120).replace('`', chr(39))}"
    await phone_panel(uid, f, note=note, event=event)


async def phone_submit_code(uid: int, f: dict, event=None) -> None:
    if f.get("busy"):
        return
    f["busy"] = True
    client = f["client"]
    try:
        await client.sign_in(phone=f["phone"], code=f["digits"], phone_code_hash=f["hash"])
    except SessionPasswordNeededError:
        f["busy"] = False
        panel = f.get("panel")
        RT.phone_flow.pop(uid, None)
        if panel:
            try:
                await RT.bot.delete_messages(uid, panel)
            except Exception:
                pass
        RT.set_2fa(uid, True)
        RT.twofa_tries[uid] = 0
        await RT.bot.send_message(uid, qr_2fa_text(), buttons=TWOFA_BUTTONS, parse_mode="md")
        return
    except E_CODE_INVALID:
        f["busy"] = False
        f["tries"] += 1
        f["digits"] = ""
        if f["tries"] >= MAX_CODE_TRIES:
            await phone_end(uid, "❌ Too many wrong codes. Start again to get a fresh code.")
            return
        await phone_panel(uid, f, note=f"❌ Wrong code ({f['tries']}/{MAX_CODE_TRIES}). Try again.", event=event)
        return
    except E_CODE_EXPIRED:
        f["busy"] = False
        await phone_resend(uid, f, event, note="⌛ That code expired — I sent you a new one.")
        return
    except E_UNOCCUPIED:
        await phone_end(
            uid,
            "❌ **This number isn't registered on Telegram.**\n"
            "Create the account in the official Telegram app first, then come back and log in.",
        )
        return
    except E_NUM_BANNED:
        await phone_end(uid, "🚫 This phone number is banned by Telegram.")
        return
    except WAIT_ERRORS as e:
        await phone_end(uid, f"⏳ Too many attempts. Try again in **{fmt_mmss(getattr(e, 'seconds', 60))}**.")
        return
    except Exception as e:
        record_error("phone-sign-in", e)
        await phone_end(uid, f"❌ Login failed: `{_short(e, 200).replace('`', chr(39))}`")
        return
    f["busy"] = False
    # success
    panel = f.get("panel")
    if panel:
        try:
            await RT.bot.delete_messages(uid, panel)
        except Exception:
            pass
    try:
        await _finish_login(uid)
    except Exception as e:
        record_error("phone-finish", e)
        await phone_end(uid, f"❌ Logged in, but finishing failed: `{_short(e, 200).replace('`', chr(39))}`")


async def route_phone_cb(event, data: str, uid: int, edit) -> None:
    f = flow_get(uid)
    if not f or f.get("step") != "code":
        await edit(event, "⌛ This login attempt expired.\n\n" + main_text(uid), main_buttons(uid))
        return
    if f.get("busy"):
        return
    f["ts"] = time.time()
    act = data.split(":")[1]

    if act == "d":
        ch = data.split(":")[2]
        if ch.isdigit() and len(f["digits"]) < 8:
            f["digits"] += ch
        if len(f["digits"]) == f["length"]:
            await phone_panel(uid, f, note="⏳ Checking the code…", event=event)
            await phone_submit_code(uid, f, event)
        else:
            await phone_panel(uid, f, event=event)
        return
    if act == "del":
        f["digits"] = f["digits"][:-1]
        await phone_panel(uid, f, event=event)
        return
    if act == "ok":
        if len(f["digits"]) < 4:
            await phone_panel(uid, f, note="⚠️ The code is too short.", event=event)
            return
        await phone_panel(uid, f, note="⏳ Checking the code…", event=event)
        await phone_submit_code(uid, f, event)
        return
    if act == "shuf":
        f["shuffle"] = not f["shuffle"]
        f["order"] = random.sample("0123456789", 10) if f["shuffle"] else list("1234567890")
        await phone_panel(uid, f, event=event)
        return
    if act == "resend":
        await phone_resend(uid, f, event)
        return


async def _qr_wait_task(uid: int, qr, last_msg) -> None:
    bot = RT.bot
    if bot is None:
        return
    deadline = time.time() + 240.0

    async def _del(m):
        if m is not None:
            try:
                await m.delete()
            except Exception:
                pass

    try:
        while True:
            left = deadline - time.time()
            if left <= 0:
                raise asyncio.TimeoutError
            try:
                await qr.wait(timeout=min(28.0, left))
                break
            except asyncio.TimeoutError:
                if time.time() >= deadline:
                    raise
                # token expires after ~30s: get a fresh one and re-send
                await qr.recreate()
                new = await _send_qr(uid, qr.url)
                await _del(last_msg)
                last_msg = new
    except asyncio.TimeoutError:
        log_bot.warning(f"QR expired for user {uid}")
        await _del(last_msg)
        try:
            await bot.send_message(uid, "⏱ **QR expired.** Tap /start to try again.", parse_mode="md")
        except Exception:
            pass
        return
    except SessionPasswordNeededError:
        log_bot.info(f"QR 2FA needed for user {uid}")
        await _del(last_msg)
        RT.set_2fa(uid, True)
        RT.twofa_tries[uid] = 0
        try:
            await bot.send_message(uid, qr_2fa_text(), buttons=TWOFA_BUTTONS, parse_mode="md")
        except Exception:
            pass
        return
    except asyncio.CancelledError:
        await _del(last_msg)
        return
    except Exception as e:
        record_error("qr-wait", e)
        await _del(last_msg)
        try:
            await bot.send_message(
                uid,
                f"❌ QR failed: `{_short(e, 200).replace('`', chr(39))}`\n"
                f"Try /start → Login with QR again.",
                parse_mode="md",
            )
        except Exception:
            pass
        return

    await _del(last_msg)
    try:
        await _finish_login(uid)
    except Exception as e:
        record_error("qr-finish", e)


# ===========================================================================
# 11. HANDLERS
# ===========================================================================
async def do_logout(uid: int) -> None:
    hal_engine(uid).stop()
    hcfg(uid)["on"] = False
    save_config()
    t = RT.qr_wait_tasks.pop(uid, None)
    if t and not t.done():
        t.cancel()
    c = ACCOUNTS.pop(uid, None) or PENDING.pop(uid, None)
    PENDING.pop(uid, None)
    if c is not None and c is RT.user:
        RT.engine.stop()
        RT.meow.stop()
        slot_stop()
        RT.user = None
    if c is not None:
        try:
            await c.log_out()
        except Exception:
            pass
        try:
            await c.disconnect()
        except Exception:
            pass
    drop_session(uid)
    RT.set_2fa(uid, False)
    RT.phone_flow.pop(uid, None)
    RT.twofa_tries.pop(uid, None)


def register_handlers(bot: TelegramClient) -> None:
    def guarded(fn):
        @functools.wraps(fn)
        async def wrapper(event, *a, **kw):
            try:
                uid = event.sender_id or 0
                if uid and is_banned(uid):
                    return
                if uid:
                    touch(uid)
                return await fn(event, *a, **kw)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                record_error(f"handler:{fn.__name__}", e)
                try:
                    await notify_error(f"handler:{fn.__name__}", e)
                except Exception:
                    pass
        return wrapper

    async def safe_answer(event, text: str = ""):
        try:
            await asyncio.wait_for(event.answer(text), timeout=5.0)
        except Exception:
            pass

    async def edit(event, text: str, buttons=None):
        try:
            await event.edit(text, buttons=buttons, parse_mode="md")
        except MessageNotModifiedError:
            pass
        except Exception:
            try:
                await event.respond(text, buttons=buttons, parse_mode="md")
            except Exception:
                pass

    @bot.on(events.NewMessage(pattern=r"^/start$"))
    @guarded
    async def _start(event):
        uid = event.sender_id
        if not is_owner(uid):
            await event.respond("🔒 This is a private bot.")
            return
        await reset_login_state(uid)
        me = await event.get_sender()
        ensure_user(
            uid,
            username=getattr(me, "username", "") or "",
            first_name=getattr(me, "first_name", "") or "",
        )
        await event.respond(main_text(uid), buttons=main_buttons(uid), parse_mode="md")

    @bot.on(events.NewMessage(pattern=r"^/logout$"))
    @guarded
    async def _logout(event):
        uid = event.sender_id
        if not is_owner(uid):
            return
        await do_logout(uid)
        await event.respond(
            "✅ Logged out. Session deleted.",
            buttons=main_buttons(uid),
            parse_mode="md",
        )

    @bot.on(events.NewMessage(pattern=r"^/errors$"))
    @guarded
    async def _errors(event):
        # error log is for the bot owner only
        if event.sender_id != owner_id():
            return
        text, btns = errors_view()
        await event.respond(text, buttons=btns, parse_mode="md")

    @bot.on(events.CallbackQuery())
    @guarded
    async def _cb(event):
        await safe_answer(event)
        data = event.data.decode() if event.data else ""
        try:
            await route_cb(event, data, edit)
        except asyncio.CancelledError:
            raise
        except WAIT_ERRORS as e:
            log_bot.warning(f"cb {data}: flood wait {getattr(e, 'seconds', '?')}s")
        except Exception as e:
            record_error(f"cb:{data}", e)
            try:
                await event.answer(f"⚠️ {type(e).__name__}", alert=False)
            except Exception:
                pass

    @bot.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    @guarded
    async def _text(event):
        uid = event.sender_id

        # --- phone login: number / typed code -------------------------------
        f = flow_get(uid)
        if f and is_owner(uid):
            raw0 = event.raw_text or ""
            if raw0.startswith("/"):
                return
            if f["step"] == "phone":
                await phone_got_number(event, uid, f, raw0)
                return
            if f["step"] == "code":
                await _tidy(event)
                if f.get("busy"):
                    return
                digits = re.sub(r"\D", "", clean(raw0))[:8]
                f["ts"] = time.time()
                if len(digits) < 4:
                    await phone_panel(uid, f, note="⚠️ Send the full code (digits only).")
                    return
                f["digits"] = digits
                await phone_panel(uid, f, note="⏳ Checking the code…")
                await phone_submit_code(uid, f)
                return

        # --- 2FA password (QR or phone login) -------------------------------
        if RT.is_2fa(uid):
            await _tidy(event)
            client = PENDING.get(uid) or ACCOUNTS.get(uid)
            if not client:
                RT.set_2fa(uid, False)
                await event.respond("❌ Session expired. Try /start again.")
                return
            try:
                await client.sign_in(password=(event.raw_text or "").strip())
            except E_PWD_INVALID:
                n = RT.twofa_tries.get(uid, 0) + 1
                RT.twofa_tries[uid] = n
                if n < 3:
                    await event.respond(f"❌ Wrong password ({n}/3). Send it again.",
                                        buttons=TWOFA_BUTTONS)
                    return
                RT.set_2fa(uid, False)
                RT.twofa_tries.pop(uid, None)
                await event.respond("❌ Too many wrong passwords. Start the login again.",
                                    buttons=main_buttons(uid))
                return
            except WAIT_ERRORS as e:
                RT.set_2fa(uid, False)
                await event.respond(f"⏳ Too many attempts. Wait {fmt_mmss(getattr(e, 'seconds', 60))}.",
                                    buttons=main_buttons(uid))
                return
            except Exception as e:
                record_error("2fa", e)
                RT.set_2fa(uid, False)
                await event.respond(
                    f"❌ 2FA failed: `{_short(e, 200).replace('`', chr(39))}`",
                    buttons=main_buttons(uid), parse_mode="md",
                )
                return
            try:
                await _finish_login(uid)
            except Exception as e:
                record_error("finish-2fa", e)
            return

        # --- Halloween settings input ---------------------------------------
        hk = RT.await_input.get(uid)
        if hk in ("hal_trigger", "hal_extra") and not (event.raw_text or "").startswith("/"):
            ok, msg = hal_apply_input(uid, hk, event.raw_text or "")
            if ok:
                RT.await_input.pop(uid, None)
                text, btns = hal_view(uid, msg)
                await event.respond(text, buttons=btns, parse_mode="md")
            else:
                await event.respond(f"❌ {msg} Try again.",
                                    buttons=[[Button.inline("◀️ Cancel", b"hal:menu")]])
            return

        # settings input (base / multiplier / wait / max / meow ...)
        key = RT.await_input.get(uid)
        raw = event.raw_text or ""
        if key and uid == owner_id() and not raw.startswith("/"):
            ok, msg = apply_input(key, raw)
            if ok:
                RT.await_input.pop(uid, None)
                text, btns = view_for_key(key)(note=msg)
                await event.respond(text, buttons=btns, parse_mode="md")
            else:
                await event.respond(
                    f"❌ {msg} Try again.",
                    buttons=[[Button.inline("◀️ Cancel", cancel_target(key))]],
                    parse_mode="md",
                )
            return

    log_bot.info("handlers registered")


async def _tidy(event) -> None:
    try:
        await event.delete()
    except Exception:
        pass


async def route_cb(event, data: str, edit):
    uid = event.sender_id

    if data == "auth:qr":
        if not is_owner(uid):
            return
        try:
            await event.edit(
                qr_prompt_text(),
                buttons=[[Button.inline("◀️ Back", b"nav:main")]],
                parse_mode="md",
            )
        except Exception:
            pass
        await _handle_qr_login(event, uid)
        return

    if data == "auth:phone":
        if not is_owner(uid):
            return
        await phone_start(event, uid, edit)
        return

    if data == "auth:cancel":
        if not is_owner(uid):
            return
        await reset_login_state(uid)
        await edit(event, main_text(uid), main_buttons(uid))
        return

    if data.startswith("ph:"):
        if not is_owner(uid):
            return
        await route_phone_cb(event, data, uid, edit)
        return

    if data == "auth:logout":
        if not is_owner(uid):
            return
        await do_logout(uid)
        await edit(event, "✅ Logged out. Session deleted.", main_buttons(uid))
        return

    if data == "nav:main":
        if not is_owner(uid):
            return
        RT.await_input.pop(uid, None)
        await edit(event, main_text(uid), main_buttons(uid))
        return

    # ---------------- Halloween (any logged-in user) ----------------
    if data.startswith("hal:"):
        if uid not in ACCOUNTS:
            return
        e = hal_engine(uid)
        if data == "hal:menu":
            RT.await_input.pop(uid, None)
            text, btns = hal_view(uid)
        elif data == "hal:start":
            hcfg(uid)["on"] = True
            err = e.start()
            if err:
                hcfg(uid)["on"] = False
            save_config()
            text, btns = hal_view(uid, f"⚠️ {err}" if err else "▶️ Started.")
        elif data == "hal:stop":
            e.stop()
            hcfg(uid)["on"] = False
            save_config()
            text, btns = hal_view(uid, "⏹ Stopped.")
        elif data == "hal:reset":
            c = hcfg(uid)
            c.update(runs=0, gifts=0, elixirs=0, failed=0, last="", last_candy=None)
            save_config()
            text, btns = hal_view(uid, "🗑 Counters reset.")
        elif data.startswith("hal:set:"):
            k = "hal_" + data.split(":")[2]
            if k not in ("hal_trigger", "hal_extra"):
                return
            RT.await_input[uid] = k
            prompt = ("✏️ Send the **text** that opens the Halloween panel."
                      if k == "hal_trigger" else
                      "⏱ Send the **extra seconds** after the shop timer ends (0–30), e.g. `2`.")
            await edit(event, prompt, [[Button.inline("◀️ Cancel", b"hal:menu")]])
            return
        else:
            return
        await edit(event, text, btns)
        return

    # ---------------- MiaoBet (owner account only) ----------------
    if data == "nav:bet" or data.startswith("bet:"):
        if uid != owner_id() or RT.user is None:
            return
        eng = RT.engine
        mt = RT.meow

        if data == "nav:bet":
            RT.await_input.pop(uid, None)
            text, btns = bet_view()
            await edit(event, text, btns)
            return

        if data == "bet:start":
            err = eng.start()
            text, btns = bet_view(note=f"⚠️ {err}" if err else "▶️ Started.")
            await edit(event, text, btns)
            return

        if data == "bet:stop":
            eng.stop()
            text, btns = bet_view(note="⏹ Stopped.")
            await edit(event, text, btns)
            return

        if data == "bet:groups":
            text, btns = groups_view()
            await edit(event, text, btns)
            return

        if data.startswith("bet:grp:"):
            set_active_chat(int(data.split(":")[2]))
            text, btns = groups_view()
            await edit(event, text, btns)
            return

        if data.startswith("bet:del:"):
            cid = int(data.split(":")[2])
            db_del_group(cid)
            if int(CONFIG.get("bet_chat") or 0) == cid:
                eng.stop()
                CONFIG["bet_chat"] = 0
                save_config()
            text, btns = groups_view()
            await edit(event, text, btns)
            return

        if data == "bet:menu:game":
            RT.await_input.pop(uid, None)
            text, btns = game_view()
            await edit(event, text, btns)
            return

        if data == "bet:menu:cap":
            text, btns = captcha_view()
            await edit(event, text, btns)
            return

        if data == "bet:menu:slot":
            RT.await_input.pop(uid, None)
            text, btns = slot_view()
            await edit(event, text, btns)
            return

        if data == "bet:menu:meow":
            RT.await_input.pop(uid, None)
            text, btns = meow_view()
            await edit(event, text, btns)
            return

        if data == "bet:meow":
            if mt.running:
                mt.stop()
                CONFIG["meow_on"] = False
                save_config()
                note = "⏹ Meow stopped."
            else:
                CONFIG["meow_on"] = True
                save_config()
                err = mt.start()
                note = f"⚠️ {err}" if err else "🐾 Meow started."
                if err:
                    CONFIG["meow_on"] = False
                    save_config()
            text, btns = meow_view(note=note)
            await edit(event, text, btns)
            return

        if data == "bet:errors":
            text, btns = errors_view()
            await edit(event, text, btns)
            return

        if data == "bet:errors:clear":
            ERRORS.clear()
            text, btns = errors_view()
            await edit(event, text, btns)
            return

        if data == "bet:allin":
            CONFIG["bet_allin"] = not CONFIG.get("bet_allin", True)
            save_config()
            text, btns = game_view()
            await edit(event, text, btns)
            return

        if data == "bet:slot":
            CONFIG["slot_on"] = not CONFIG.get("slot_on", True)
            if not CONFIG["slot_on"]:
                slot_stop()
            save_config()
            text, btns = slot_view()
            await edit(event, text, btns)
            return

        if data == "bet:captcha":
            CONFIG["captcha_on"] = not CONFIG.get("captcha_on", True)
            save_config()
            text, btns = captcha_view()
            await edit(event, text, btns)
            return

        if data == "bet:captchascope":
            CONFIG["captcha_all"] = not CONFIG.get("captcha_all", True)
            save_config()
            text, btns = captcha_view()
            await edit(event, text, btns)
            return

        if data == "bet:choice":
            CONFIG["bet_choice"] = "even" if CONFIG["bet_choice"] == "odd" else "odd"
            save_config()
            text, btns = game_view()
            await edit(event, text, btns)
            return

        if data.startswith("bet:set:"):
            key = data.split(":")[2]
            if key in INPUT_PROMPTS:
                RT.await_input[uid] = key
                await edit(
                    event,
                    INPUT_PROMPTS[key],
                    [[Button.inline("◀️ Cancel", cancel_target(key))]],
                )
            return

        if data == "bet:forecast":
            par = forecast_params()
            sim = await asyncio.to_thread(simulate_forecast, par)
            await edit(
                event,
                forecast_text(par, sim),
                [
                    [sbtn("🔄 Refresh", b"bet:forecast", "primary")],
                    [Button.inline("◀️ Back", b"nav:bet")],
                ],
            )
            return

        if data == "bet:stats":
            await edit(
                event,
                stats_text(),
                [
                    [sbtn("🔄 Refresh", b"bet:stats", "primary"),
                     sbtn("🗑 Reset", b"bet:reset", "danger")],
                    [Button.inline("◀️ Back", b"nav:bet")],
                ],
            )
            return

        if data == "bet:reset":
            await edit(
                event,
                "⚠️ **Reset all stats and the bet ladder?**",
                [[sbtn("✅ Yes, reset", b"bet:reset:yes", "danger"),
                  Button.inline("◀️ No", b"bet:stats")]],
            )
            return

        if data == "bet:reset:yes":
            db_clear_bets()
            CONFIG["bet_current"] = 0
            save_config()
            eng.last_balance = None
            await edit(
                event,
                stats_text(),
                [[Button.inline("◀️ Back", b"nav:bet")]],
            )
            return


# ===========================================================================
# 12. BOOT
# ===========================================================================
async def _watchdog() -> None:
    """Reconnect dropped clients and restart engines that died unexpectedly."""
    while True:
        await asyncio.sleep(30)
        try:
            for u_ in list(RT.phone_flow):
                flow_get(u_)  # drops expired login attempts
            clients = [("bot", RT.bot)] \
                + [(f"user{u}", c) for u, c in ACCOUNTS.items()] \
                + [(f"login{u}", c) for u, c in PENDING.items()]
            for name, c in clients:
                if c is not None and not c.is_connected():
                    log.warning(f"watchdog: {name} disconnected — reconnecting")
                    await c.connect()
            if RT.user is not None:
                if CONFIG.get("meow_on") and CONFIG.get("meow_chat") and not RT.meow.running:
                    log_meow.warning("watchdog: meow loop was not running — restarting")
                    RT.meow.start()
            for uid_, cfg_ in list(CONFIG.get("hal", {}).items()):
                try:
                    u = int(uid_)
                except ValueError:
                    continue
                if cfg_.get("on") and cfg_.get("chat") and u in ACCOUNTS and not hal_engine(u).running:
                    log_hal.warning(f"watchdog: halloween loop of {u} was not running — restarting")
                    hal_engine(u).start()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            record_error("watchdog", e)


async def _check_proxy() -> None:
    """Warn early when the configured proxy isn't listening (the #1 cause of 'connection refused')."""
    if not CONFIG["use_proxy"] or not HAS_SOCKS:
        return
    try:
        u = urlparse(CONFIG["proxy_url"])
        host, port = u.hostname or "127.0.0.1", int(u.port or 1080)
    except Exception:
        return

    def probe():
        with socket.create_connection((host, port), timeout=3):
            pass

    try:
        await asyncio.to_thread(probe)
        log.info(f"proxy {host}:{port} is reachable")
    except OSError as e:
        log.error(
            f"proxy {host}:{port} is NOT reachable ({type(e).__name__}). "
            f"Start your VPN/proxy app, or fix PROXY_URL / USE_PROXY in .env"
        )


async def boot_bot() -> None:
    fatal, warn = validate_config()
    for w in warn:
        log.warning(f"config: {w}")
    if fatal:
        for p in fatal:
            log.error(f"config: {p}")
        raise FatalConfig("; ".join(fatal))

    await _check_proxy()
    if not CONFIG["use_proxy"]:
        log.warning("USE_PROXY is off — if Telegram is blocked on your network set USE_PROXY=true in .env")
    RT.bot = _make_bot_client()
    await RT.bot.start(bot_token=CONFIG["bot_token"])
    me = await RT.bot.get_me()
    log_bot.info(f"bot started as @{me.username} (id={me.id})")

    if not CONFIG["owner_id"]:
        CONFIG["owner_id"] = _env_int("OWNER_ID", 0)
    if CONFIG["owner_id"]:
        ensure_user(CONFIG["owner_id"], first_name="Owner")

    register_handlers(RT.bot)

    # old sqlite user.session -> StringSession file (once)
    await migrate_old_session()

    # load every saved account
    for p in sorted(SESS_DIR.glob("*.txt")):
        try:
            uid = int(p.stem)
        except ValueError:
            continue
        c = _make_user_client(uid)
        try:
            await c.connect()
            if not await c.is_user_authorized():
                log_bot.warning(f"session {uid} not authorized — removed")
                await c.disconnect()
                drop_session(uid)
                continue
            me2 = await c.get_me()
            ACCOUNTS[uid] = c
            ensure_user(uid, username=me2.username or "", first_name=me2.first_name or "",
                        phone=me2.phone or "")
            attach_user_handlers(c)
            log_bot.info(f"session loaded: {me2.first_name} (uid={uid})")
            if uid == owner_id() or (not owner_id() and RT.user is None):
                if not CONFIG["owner_id"]:
                    CONFIG["owner_id"] = uid
                    save_config()
                RT.user = c
                if CONFIG.get("meow_on") and CONFIG.get("meow_chat"):
                    err = RT.meow.start()
                    log_meow.info("meow auto-started" if not err else f"meow not started: {err}")
            if hcfg(uid)["on"] and hcfg(uid)["chat"]:
                err = hal_engine(uid).start()
                log_hal.info(f"[{uid}] halloween auto-started" if not err else f"[{uid}] not started: {err}")
        except Exception as e:
            record_error(f"load-session-{uid}", e)
            try:
                await c.disconnect()
            except Exception:
                pass
    if not ACCOUNTS:
        log_bot.info("no saved sessions — login from /start")

    RT.watchdog = spawn(_watchdog(), "watchdog")
    log.info("bot ready — open Telegram and send /start")
    await RT.stop_evt.wait()


async def shutdown() -> None:
    log.info("shutting down…")
    if RT.watchdog and not RT.watchdog.done():
        RT.watchdog.cancel()
    if RT.engine:
        RT.engine.stop()
    if RT.meow:
        RT.meow.stop()
    for e in HAL.values():
        e.stop()
    slot_stop()
    for task in list(RT.qr_wait_tasks.values()):
        if task and not task.done():
            task.cancel()
    for c in list(ACCOUNTS.values()) + list(PENDING.values()):
        try:
            await c.disconnect()
        except Exception:
            pass
    ACCOUNTS.clear()
    PENDING.clear()
    RT.user = None
    if RT.bot:
        try:
            await RT.bot.disconnect()
        except Exception:
            pass
        RT.bot = None


# ===========================================================================
# 13. CLI
# ===========================================================================
async def cmd_run() -> None:
    init_db()
    loop = asyncio.get_running_loop()
    loop.set_exception_handler(_loop_exception_handler)
    RT.stop_evt = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, RT.stop_evt.set)
        except (NotImplementedError, RuntimeError):
            pass  # Windows

    say("→ SELF BOT starting…", "bold cyan")
    say(f"   db: {DB_FILE}")
    say(f"   proxy: {CONFIG['proxy_url'] if CONFIG['use_proxy'] else 'disabled'}")
    say(
        f"   api_id: {CONFIG['api_id']} · "
        f"bot_token: {'set' if CONFIG['bot_token'] else '(missing)'}"
    )

    # supervisor: if boot/run crashes, clean up and try again with backoff
    backoff = 3.0
    try:
        while not RT.stop_evt.is_set():
            started = time.time()
            try:
                await boot_bot()
                break  # stop_evt was set -> clean exit
            except FatalConfig as e:
                say(f"❌ {e}", "bold red")
                break
            except (KeyboardInterrupt, asyncio.CancelledError):
                break
            except Exception as e:
                record_error("supervisor", e)
                await shutdown()
                if time.time() - started > 120:
                    backoff = 3.0  # it ran fine for a while, so reset
                log.warning(f"restarting in {backoff:.0f}s…")
                try:
                    await asyncio.wait_for(RT.stop_evt.wait(), backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 2, 60.0)
    finally:
        await shutdown()


def cmd_config() -> None:
    fatal, warn = validate_config()
    problems = fatal + warn
    if RICH:
        t = Table(title="Config")
        t.add_column("Key")
        t.add_column("Value")
        for k, v in CONFIG.items():
            if "token" in k or "hash" in k:
                v = (str(v)[:6] + "…") if v else "(unset)"
            t.add_row(k, str(v))
        console.print(t)
        if problems:
            console.print("\n[bold red]Problems:[/]")
            for p in problems:
                console.print(f"  • {p}")
        else:
            console.print("\n[green]✓ config OK[/]")
    else:
        for k, v in CONFIG.items():
            if "token" in k or "hash" in k:
                v = (str(v)[:6] + "…") if v else "(unset)"
            print(f"{k:24} {v}")
        if problems:
            print("\nProblems:")
            for p in problems:
                print(f"  - {p}")
        else:
            print("\n✓ config OK")


def cmd_reset() -> None:
    init_db()
    n = db_count_users()
    say(f"⚠️  DELETE {n} users + groups + bet history?", "bold red")
    if input("Type 'yes' to confirm: ").strip().lower() != "yes":
        say("cancelled.")
        return
    db_exec("DELETE FROM users")
    db_exec("DELETE FROM groups")
    db_exec("DELETE FROM bets")
    db_exec("VACUUM")
    say("✅ database reset.", "green")


def main() -> int:
    p = argparse.ArgumentParser(
        prog="selfbot",
        description="SELF BOT — QR login + MiaoBet auto-bettor + Meow farmer + Halloween",
    )
    p.add_argument("--config", action="store_true")
    p.add_argument("--reset", action="store_true")
    args = p.parse_args()

    if args.config:
        cmd_config()
        return 0
    if args.reset:
        cmd_reset()
        return 0

    if not CONFIG["bot_token"]:
        say("❌ BOT_TOKEN is not set.", "bold red")
        say("   Add it to .env: BOT_TOKEN=123:ABC…")
        return 1

    try:
        asyncio.run(cmd_run())
    except KeyboardInterrupt:
        say("\n👋 bye.", "dim")
    return 0


if __name__ == "__main__":
    sys.exit(main())
