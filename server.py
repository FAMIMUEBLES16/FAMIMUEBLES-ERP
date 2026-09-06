from __future__ import annotations

import json
import os
import csv
import hashlib
import io
import secrets
import threading
from decimal import Decimal
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote, parse_qs

from report_pdf import make_pdf

ROOT = Path(__file__).resolve().parent


def _load_environment_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


for environment_file in (ROOT / ".env", ROOT.parent / "FAMIMUEBLES APP" / ".env"):
    _load_environment_file(environment_file)

try:
    import psycopg2
    import psycopg2.extras
except ImportError as error:
    raise RuntimeError("Falta psycopg2-binary. PostgreSQL es obligatorio para FAMIMUEBLES ERP.") from error

HOST = os.environ.get("FAMIMUEBLES_HOST", "127.0.0.1")
PORT = int(os.environ.get("FAMIMUEBLES_PORT", "8024"))
DB_BACKEND = "postgres"
configured_backend = os.environ.get("FAMIMUEBLES_DB_BACKEND", "postgres").strip().lower()
if configured_backend not in {"postgres", "postgresql", "pg"}:
    raise RuntimeError("SQLite ya no esta soportado. Configure FAMIMUEBLES_DB_BACKEND=postgres.")
POSTGRES_CONFIG = {
    "host": os.environ.get("POSTGRES_HOST", "localhost"),
    "port": int(os.environ.get("POSTGRES_PORT", "5432")),
    "dbname": os.environ.get("POSTGRES_DBNAME", "Famimuebles"),
    "user": os.environ.get("POSTGRES_USER", "postgres"),
    "password": os.environ.get("POSTGRES_PASSWORD", ""),
}
ALLOWED_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.environ.get(
        "FAMIMUEBLES_ALLOWED_ORIGINS",
        "https://famimuebles16.github.io,http://127.0.0.1:8024,http://localhost:8024",
    ).split(",")
    if origin.strip()
}
DOMAIN_COLLECTIONS = {
    "customers", "suppliers", "purchases", "credits", "apartados", "expenses", "notifications", "users",
    "accountsPayable", "supplierPayments", "customerAccounts", "suppliers", "accounts-payable", "supplier-payments", "customer-accounts",
    "returns", "supplier-returns", "supplierReturns", "stock-counts", "stockCounts", "reservations", "warranties",
    "damaged-stock", "damagedStock", "cash-sessions", "cashSessions", "cash-movements", "cashMovements", "bank-accounts", "bankAccounts",
    "quotes", "orders", "deliveries", "transfers", "credit-notes", "creditNotes", "company-settings", "companySettings",
}
DEFAULT_TENANT = "tenant-default"
SCHEMA_LOCK = threading.Lock()
SCHEMA_READY = False


def _json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    raise TypeError(f"Tipo no serializable: {type(value).__name__}")


def product_category(name: str) -> str:
    value = str(name or "").upper()
    categories = (
        ("COLCHONES", ("COLCHON", "COLCHONES")),
        ("CAMAS", ("CAMA", "BASE CAMA", "CAMAROTE")),
        ("SOFAS", ("SOFA", "SALA", "POLTRONA", "BUTACA")),
        ("COMEDORES", ("COMEDOR", "MESA COMEDOR", "SILLAS COMEDOR")),
        ("MUEBLES", ("MUEBLE", "ALACENA", "ARMARIO", "ROPERO", "BIBLIOTECA", "VITRINA", "MESA", "BAUL", "ZAPATERO", "CABECERO", "CUNA")),
        ("ELECTRODOMESTICOS", ("TV ", "TELEVISOR", "NEVERA", "LAVADORA", "LICUADORA", "VENTILADOR")),
        ("OFICINA", ("ESCRITORIO", "SILLA OFICINA", "COMPUTO", "ARCHIVADOR")),
        ("HOGAR", ("COCINA", "VAJILLA", "CORTINA", "ESPEJO", "RELOJ")),
    )
    for category, terms in categories:
        if any(term in value for term in terms):
            return category
    return "OTROS"


def _postgres_enabled() -> bool:
    return True


def _postgres_connection():
    if not POSTGRES_CONFIG["password"]:
        raise RuntimeError("POSTGRES_PASSWORD no esta configurada para el ERP.")
    return psycopg2.connect(**POSTGRES_CONFIG)


def _postgres_sql(sql: str) -> str:
    """Adapta placeholders heredados al controlador PostgreSQL."""
    insert_ignore = "INSERT OR IGNORE" in sql
    sql = sql.replace("INSERT OR IGNORE", "INSERT")
    sql = sql.replace("datetime(auth_tokens.expires_at)", "auth_tokens.expires_at")
    sql = sql.replace("datetime('now', '+12 hours')", "CURRENT_TIMESTAMP + INTERVAL '12 hours'")
    sql = sql.replace("datetime('now')", "CURRENT_TIMESTAMP")
    output = []
    index = 0
    while index < len(sql):
        if sql[index] == "?":
            output.append("%s")
        else:
            output.append(sql[index])
        index += 1
    converted = "".join(output)
    if insert_ignore and "ON CONFLICT" not in converted:
        converted = converted.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    return converted


class _PostgresCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, sql: str, params=()):
        self._cursor.execute(_postgres_sql(sql), params)
        return self

    def executemany(self, sql: str, params_list):
        self._cursor.executemany(_postgres_sql(sql), params_list)
        return self

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __iter__(self):
        return iter(self._cursor)

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def description(self):
        return self._cursor.description

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self._cursor.close()
        return False

    def close(self):
        self._cursor.close()


class _PostgresConnection:
    def __init__(self):
        self._connection = _postgres_connection()

    def execute(self, sql: str, params=()):
        cursor = self.cursor()
        cursor.execute(sql, params)
        return cursor

    def cursor(self):
        return _PostgresCursor(self._connection.cursor(cursor_factory=psycopg2.extras.DictCursor))

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def close(self):
        self._connection.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()
        return False


def _open_database():
    return _PostgresConnection()


def connection():
    global SCHEMA_READY
    if SCHEMA_READY:
        return _open_database()
    with SCHEMA_LOCK:
        if SCHEMA_READY:
            return _open_database()
        database = _initialize_schema()
        SCHEMA_READY = True
        return database


def _initialize_schema() -> sqlite3.Connection:
    return _initialize_postgres_schema()
    database = _open_database()
    database.execute(
        "CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    database.execute(
        "CREATE TABLE IF NOT EXISTS domain_records (collection TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (collection, id))"
    )
    database.execute(
        "CREATE TABLE IF NOT EXISTS auth_users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, store_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    user_columns = {row[1] for row in database.execute("PRAGMA table_info(auth_users)")}
    if "tenant_id" not in user_columns:
        database.execute("ALTER TABLE auth_users ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-default'")
    if "email" not in user_columns:
        database.execute("ALTER TABLE auth_users ADD COLUMN email TEXT NOT NULL DEFAULT ''")
    if "phone" not in user_columns:
        database.execute("ALTER TABLE auth_users ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
    database.execute(
        "CREATE TABLE IF NOT EXISTS auth_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)"
    )
    database.execute(
        "CREATE TABLE IF NOT EXISTS user_permissions (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, resource TEXT NOT NULL, action TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, user_id, resource, action))"
    )
    database.execute(
        "CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL, collection TEXT, record_id TEXT, data_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    database.execute(
        "CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, plan TEXT NOT NULL DEFAULT 'starter', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    database.execute(
        "CREATE TABLE IF NOT EXISTS tenant_states (tenant_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    database.executescript("""
        CREATE TABLE IF NOT EXISTS stores (
            id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, code TEXT NOT NULL,
            name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (tenant_id, code)
        );
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, code TEXT NOT NULL,
            name TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '', cost REAL NOT NULL DEFAULT 0,
            sale_price REAL NOT NULL DEFAULT 0, tax_rate REAL NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (tenant_id, code)
        );
        CREATE TABLE IF NOT EXISTS inventory (
            tenant_id TEXT NOT NULL, product_id TEXT NOT NULL, store_id TEXT NOT NULL,
            quantity REAL NOT NULL DEFAULT 0, reserved_quantity REAL NOT NULL DEFAULT 0,
            minimum_quantity REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, product_id, store_id),
            FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (store_id) REFERENCES stores(id)
        );
        CREATE TABLE IF NOT EXISTS inventory_movements (
            id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, product_id TEXT NOT NULL,
            store_id TEXT NOT NULL, movement_type TEXT NOT NULL, quantity REAL NOT NULL,
            reference_id TEXT, note TEXT NOT NULL DEFAULT '', user_id TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, store_id TEXT NOT NULL,
            customer_id TEXT, total REAL NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'COMPLETED', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sale_items (
            sale_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity REAL NOT NULL,
            unit_price REAL NOT NULL, tax_rate REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (sale_id, product_id)
        );
        CREATE INDEX IF NOT EXISTS idx_inventory_tenant_store ON inventory(tenant_id, store_id);
        CREATE INDEX IF NOT EXISTS idx_movements_tenant_date ON inventory_movements(tenant_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON sales(tenant_id, created_at);
    """)
    sales_columns = {row[1] for row in database.execute("PRAGMA table_info(sales)")}
    if "invoice_number" not in sales_columns:
        database.execute("ALTER TABLE sales ADD COLUMN invoice_number TEXT NOT NULL DEFAULT ''")
    sales_columns = {row[1] for row in database.execute("PRAGMA table_info(sales)")}
    if "invoice_number" not in sales_columns:
        database.execute("ALTER TABLE sales ADD COLUMN invoice_number TEXT NOT NULL DEFAULT ''")
    columns = {row[1] for row in database.execute("PRAGMA table_info(domain_records)")}
    if "tenant_id" not in columns:
        database.execute("ALTER TABLE domain_records ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-default'")
    primary_key = [row[1] for row in database.execute("PRAGMA table_info(domain_records)") if row[5]]
    if primary_key != ["tenant_id", "collection", "id"]:
        database.execute("ALTER TABLE domain_records RENAME TO domain_records_legacy")
        database.execute("CREATE TABLE domain_records (tenant_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (tenant_id, collection, id))")
        database.execute("INSERT INTO domain_records (tenant_id, collection, id, data_json, created_at, updated_at) SELECT tenant_id, collection, id, data_json, created_at, updated_at FROM domain_records_legacy")
        database.execute("DROP TABLE domain_records_legacy")
    database.execute("INSERT OR IGNORE INTO tenants (id, name, slug) VALUES (?, ?, ?)", (DEFAULT_TENANT, "FAMIMUEBLES", "famimuebles"))
    return database


def _initialize_postgres_schema() -> _PostgresConnection:
    database = _PostgresConnection()
    statements = [
        "CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, state_json TEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS domain_records (tenant_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (tenant_id, collection, id))",
        "CREATE TABLE IF NOT EXISTS auth_users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, store_id TEXT, active INTEGER NOT NULL DEFAULT 1, tenant_id TEXT NOT NULL DEFAULT 'tenant-default', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS auth_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TIMESTAMP NOT NULL)",
        "CREATE TABLE IF NOT EXISTS user_permissions (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, resource TEXT NOT NULL, action TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, user_id, resource, action))",
        "CREATE TABLE IF NOT EXISTS audit_events (id BIGSERIAL PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, collection TEXT, record_id TEXT, data_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS previous_hash TEXT",
        "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS event_hash TEXT",
        "CREATE TABLE IF NOT EXISTS idempotency_keys (tenant_id TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, response_status INTEGER, response_json TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (tenant_id, request_key))",
        "ALTER TABLE domain_records ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1",
        "CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, plan TEXT NOT NULL DEFAULT 'starter', active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS tenant_states (tenant_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (tenant_id, code))",
        "CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', cost DOUBLE PRECISION NOT NULL DEFAULT 0, sale_price DOUBLE PRECISION NOT NULL DEFAULT 0, tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (tenant_id, code))",
        "CREATE TABLE IF NOT EXISTS inventory (tenant_id TEXT NOT NULL, product_id TEXT NOT NULL, store_id TEXT NOT NULL, quantity DOUBLE PRECISION NOT NULL DEFAULT 0, reserved_quantity DOUBLE PRECISION NOT NULL DEFAULT 0, minimum_quantity DOUBLE PRECISION NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (tenant_id, product_id, store_id))",
        "CREATE TABLE IF NOT EXISTS inventory_movements (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, product_id TEXT NOT NULL, store_id TEXT NOT NULL, movement_type TEXT NOT NULL, quantity DOUBLE PRECISION NOT NULL, reference_id TEXT, note TEXT NOT NULL DEFAULT '', user_id TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, store_id TEXT NOT NULL, customer_id TEXT, invoice_number TEXT NOT NULL DEFAULT '', total DOUBLE PRECISION NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'COMPLETED', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS sale_items (sale_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity DOUBLE PRECISION NOT NULL, unit_price DOUBLE PRECISION NOT NULL, tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0, PRIMARY KEY (sale_id, product_id))",
    ]
    for statement in statements:
        database.execute(statement)
    database.execute("""
        CREATE OR REPLACE FUNCTION protect_audit_events() RETURNS trigger AS $$
        BEGIN
            IF TG_OP IN ('UPDATE', 'DELETE') THEN
                RAISE EXCEPTION 'audit_events es inmutable';
            END IF;
            IF NEW.event_hash IS NULL THEN
                SELECT event_hash INTO NEW.previous_hash FROM audit_events ORDER BY id DESC LIMIT 1;
                NEW.event_hash := md5(concat_ws('|', COALESCE(NEW.previous_hash, ''), NEW.user_id, NEW.action, NEW.collection, NEW.record_id, NEW.data_json, NEW.created_at::text));
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    database.execute("DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events")
    database.execute("""
        CREATE TRIGGER audit_events_immutable
        BEFORE INSERT OR UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION protect_audit_events()
    """)
    database.execute("INSERT INTO tenants (id, name, slug) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING", (DEFAULT_TENANT, "FAMIMUEBLES", "famimuebles"))
    database.commit()
    return database


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${digest}"


def password_matches(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return secrets.compare_digest(candidate, digest)


def request_json(handler: "AppHandler") -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    payload = json.loads(handler.rfile.read(length).decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("El cuerpo debe ser un objeto JSON")
    return payload


def idempotency_request_key(handler: "AppHandler", payload: dict) -> str:
    return str(
        handler.headers.get("Idempotency-Key")
        or payload.get("idempotencyKey")
        or payload.get("requestId")
        or payload.get("id")
        or ""
    ).strip()


def canonical_request_hash(payload: dict) -> str:
    normalized = {key: value for key, value in payload.items() if key not in {"idempotencyKey", "requestId"}}
    return hashlib.sha256(json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def claim_idempotency(database: _PostgresConnection, handler: "AppHandler", payload: dict, path: str) -> tuple[str, dict | None]:
    """Claims a request key inside the same transaction as the business write."""
    request_key = idempotency_request_key(handler, payload)
    if not request_key:
        return "", None
    tenant = tenant_id(handler, payload)
    request_hash = canonical_request_hash(payload)
    database.execute(
        "INSERT INTO idempotency_keys (tenant_id, request_key, request_hash) VALUES (?, ?, ?) ON CONFLICT(tenant_id, request_key) DO NOTHING",
        (tenant, f"{path}:{request_key}", request_hash),
    )
    row = database.execute(
        "SELECT request_hash, response_status, response_json FROM idempotency_keys WHERE tenant_id = ? AND request_key = ? FOR UPDATE",
        (tenant, f"{path}:{request_key}"),
    ).fetchone()
    if row and row[0] != request_hash:
        raise ValueError("La clave de idempotencia ya fue usada con otro contenido")
    if row and row[2]:
        return request_key, json.loads(row[2])
    return request_key, None


def complete_idempotency(database: _PostgresConnection, handler: "AppHandler", payload: dict, path: str, status: int, response: dict) -> None:
    request_key = idempotency_request_key(handler, payload)
    if not request_key:
        return
    database.execute(
        "UPDATE idempotency_keys SET response_status = ?, response_json = ? WHERE tenant_id = ? AND request_key = ?",
        (status, json.dumps(response, ensure_ascii=False, separators=(",", ":")), tenant_id(handler, payload), f"{path}:{request_key}"),
    )


def record_id(payload: dict) -> str:
    value = str(payload.get("id", "")).strip()
    if not value:
        raise ValueError("El registro requiere un id")
    return value


def tenant_id(handler: "AppHandler", payload: dict | None = None) -> str:
    user = authenticated_user(handler)
    requested = handler.headers.get("X-Tenant-ID") or (payload or {}).get("tenantId")
    value = requested if user and user["role"] == "ADMINISTRADOR" and requested else (user["tenant_id"] if user else requested or DEFAULT_TENANT)
    return str(value).strip() or DEFAULT_TENANT


def requested_tenant_allowed(handler: "AppHandler", payload: dict | None = None) -> bool:
    user = authenticated_user(handler)
    if not user:
        return False
    requested = str((handler.headers.get("X-Tenant-ID") or (payload or {}).get("tenantId") or user["tenant_id"])).strip()
    return user["role"] == "ADMINISTRADOR" or requested == str(user["tenant_id"])


def authenticated_user(handler: "AppHandler") -> sqlite3.Row | None:
    token = handler.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        return None
    with connection() as database:
        return database.execute("SELECT auth_users.* FROM auth_tokens JOIN auth_users ON auth_users.id = auth_tokens.user_id WHERE auth_tokens.token = ? AND auth_users.active = 1 AND datetime(auth_tokens.expires_at) > datetime('now')", (token,)).fetchone()


def has_user_permission(handler: "AppHandler", resource: str, action: str = "view") -> bool:
    user = authenticated_user(handler)
    if not user:
        return True
    with connection() as database:
        configured = database.execute("SELECT COUNT(*) FROM user_permissions WHERE tenant_id = ? AND user_id = ?", (user["tenant_id"], user["id"])).fetchone()[0] > 0
        if not configured:
            return True
        if not configured:
            return True
        row = database.execute("SELECT allowed FROM user_permissions WHERE tenant_id = ? AND user_id = ? AND resource = ? AND action = ?", (user["tenant_id"], user["id"], resource, action)).fetchone()
    return bool(row and row[0])


def permission_target(path: str, method: str) -> tuple[str, str] | None:
    action = {"GET": "view", "POST": "create", "PUT": "edit", "DELETE": "delete"}.get(method, "view")
    if "/catalog/sale" in path:
        return "Ventas", action
    if "/catalog/product" in path:
        return "Productos", action
    if "/catalog/store" in path:
        return "Locales", action
    if "/catalog/inventory" in path:
        return "Inventario", action
    if "/report" in path:
        return "Reportes", "view"
    if "/domain/" in path:
        collection = path.split("/domain/", 1)[1].split("/", 1)[0]
        resources = {"customers":"Clientes", "suppliers":"Proveedores", "purchases":"Compras", "credits":"Creditos", "apartados":"Apartados", "expenses":"Gastos", "returns":"Devoluciones", "supplierReturns":"Devoluciones", "stockCounts":"Inventario", "reservations":"Inventario", "warranties":"Inventario", "damagedStock":"Inventario"}
        resource = resources.get(collection)
        return (resource, action) if resource else None
    return None


def can_access(handler: "AppHandler", path: str, method: str = "GET") -> bool:
    user = authenticated_user(handler)
    if not user:
        return False
    if path.startswith("/api/users") and user["role"] != "ADMINISTRADOR":
        return False
    target = permission_target(path, method)
    if target and not has_user_permission(handler, *target):
        return False
    if user["role"] == "ADMINISTRADOR":
        return True
    if "/catalog/sale" in path:
        return False
    if path == "/api/tenants":
        return False
    if "/report/" in path or path == "/api/state":
        return user["role"] in {"GERENTE", "CONTADOR", "SUPERVISOR"}
    if "/domain/" in path:
        collection = path.split("/domain/", 1)[1].split("/", 1)[0]
        resource_names = {"customers":"Clientes", "suppliers":"Proveedores", "purchases":"Compras", "credits":"Creditos", "apartados":"Apartados", "expenses":"Gastos", "returns":"Devoluciones", "supplierReturns":"Devoluciones", "stockCounts":"Inventario", "reservations":"Inventario", "warranties":"Inventario", "damagedStock":"Inventario"}
        resource = resource_names.get(collection)
        if resource and not has_user_permission(handler, resource):
            return False
        finance = {"accounts-payable", "supplier-payments", "customer-accounts", "cash-sessions", "cash-movements", "bank-accounts"}
        inventory = {"returns", "supplier-returns", "stock-counts", "reservations", "warranties", "damaged-stock"}
        if collection in finance:
            return user["role"] in {"GERENTE", "CONTADOR", "CAJERO"}
        if collection in inventory:
            return user["role"] in {"GERENTE", "SUPERVISOR", "BODEGA"}
    return user["role"] in {"GERENTE", "SUPERVISOR", "VENDEDOR", "CAJERO", "BODEGA"}


def filter_report_items(items: list[dict], date_from: str = "", date_to: str = "", store_filter: str = "") -> list[dict]:
    result = []
    for item in items:
        item_store = str(item.get("storeId") or item.get("store_id") or item.get("local_id") or item.get("localId") or "")
        item_date = str(item.get("createdAt") or item.get("date") or item.get("fecha") or item.get("created_at") or "")[:10]
        if store_filter and item_store != store_filter:
            continue
        if date_from and item_date and item_date < date_from:
            continue
        if date_to and item_date and item_date > date_to:
            continue
        result.append(item)
    return result


def enforce_user_store(handler: "AppHandler", store_id: str) -> None:
    user = authenticated_user(handler)
    assigned_store = str(user["store_id"] or "") if user else ""
    if assigned_store and user["role"] != "ADMINISTRADOR" and assigned_store != str(store_id):
        raise ValueError("El usuario no puede operar en este local")


def sync_catalog_state(database: sqlite3.Connection, tenant: str, state: dict) -> None:
    for store in state.get("stores", []):
        if not isinstance(store, dict) or not store.get("id") or not store.get("name"):
            continue
        database.execute("INSERT INTO stores (id, tenant_id, code, name, address, phone, active) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, address=excluded.address, phone=excluded.phone, active=excluded.active", (str(store["id"]), tenant, str(store.get("code") or store["id"]), str(store["name"]), str(store.get("address") or ""), str(store.get("phone") or ""), 0 if store.get("status") == "Inactivo" else 1))
    for product in state.get("products", []):
        if not isinstance(product, dict) or not product.get("id") or not product.get("name"):
            continue
        database.execute("INSERT INTO products (id, tenant_id, code, name, reference, barcode, category, cost, sale_price, tax_rate, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, reference=excluded.reference, barcode=excluded.barcode, category=excluded.category, cost=excluded.cost, sale_price=excluded.sale_price, tax_rate=excluded.tax_rate, active=excluded.active", (str(product["id"]), tenant, str(product.get("code") or product["id"]), str(product["name"]), str(product.get("reference") or ""), str(product.get("barcode") or ""), str(product.get("category") or product.get("categoryName") or ""), float(product.get("cost") or 0), float(product.get("salePrice") or product.get("price") or 0), float(product.get("iva") or 0), 0 if product.get("active") is False else 1))
    for row in state.get("inventoryByStore", []):
        if not isinstance(row, dict) or not row.get("productId") or not row.get("storeId"):
            continue
        database.execute("INSERT INTO inventory (tenant_id, product_id, store_id, quantity, reserved_quantity, minimum_quantity) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, product_id, store_id) DO UPDATE SET quantity=excluded.quantity, reserved_quantity=excluded.reserved_quantity, minimum_quantity=excluded.minimum_quantity, updated_at=CURRENT_TIMESTAMP", (tenant, str(row["productId"]), str(row["storeId"]), float(row.get("quantity") or 0), float(row.get("reservedQuantity") or row.get("reservedStock") or 0), float(row.get("minimum") or row.get("minimumStock") or 0)))
    for collection in DOMAIN_COLLECTIONS:
        items = state.get(collection)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and item.get("id"):
                database.execute("INSERT INTO domain_records (tenant_id, collection, id, data_json) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, collection, id) DO UPDATE SET data_json=excluded.data_json, updated_at=CURRENT_TIMESTAMP", (tenant, collection, str(item["id"]), json.dumps(item, ensure_ascii=False, separators=(",", ":"))))


def _shared_catalog(database: _PostgresConnection) -> dict:
    """Lee catalogo, existencias y ventas desde el esquema operativo del bot."""
    stores = [
        {"id": row["nombre"], "code": str(row["id"]), "name": row["nombre"], "address": "", "phone": "", "active": bool(row["activo"])}
        for row in database.execute("SELECT id, nombre, activo FROM locales ORDER BY nombre").fetchall()
    ]
    products = [
        {"id": str(row["codigo"]).strip(), "code": str(row["codigo"]).strip(), "name": row["nombre_producto"], "reference": "", "barcode": "", "category": product_category(row["nombre_producto"]), "categoryName": product_category(row["nombre_producto"]), "cost": row["precio_compra"] or 0, "salePrice": 0, "taxRate": 0, "active": str(row["activo"] or "SI").upper() != "NO"}
        for row in database.execute("SELECT BTRIM(codigo) AS codigo, nombre_producto, precio_compra, activo FROM productos ORDER BY nombre_producto").fetchall()
    ]
    inventory_rows = database.execute(
        "SELECT BTRIM(local) AS local, BTRIM(codigo) AS codigo, SUM(cantidad) AS cantidad FROM inventarios GROUP BY BTRIM(local), BTRIM(codigo) ORDER BY local, codigo"
    ).fetchall()
    inventory_by_key = {
        (str(row["local"]), str(row["codigo"])): float(row["cantidad"] or 0)
        for row in inventory_rows
    }
    ledger_rows = database.execute(
        """
        SELECT BTRIM(COALESCE(m.local_origen, '')) AS local, BTRIM(mp.codigo) AS codigo,
               COALESCE(SUM(COALESCE(mp.entrada, 0) - COALESCE(mp.salida, 0)), 0) AS cantidad
        FROM movimientos m
        JOIN movimiento_productos mp ON mp.movimiento_id = m.id
        WHERE NULLIF(BTRIM(COALESCE(m.local_origen, '')), '') IS NOT NULL
        GROUP BY BTRIM(COALESCE(m.local_origen, '')), BTRIM(mp.codigo)
        """
    ).fetchall()
    for row in ledger_rows:
        key = (str(row["local"]), str(row["codigo"]))
        ledger_quantity = float(row["cantidad"] or 0)
        if key not in inventory_by_key or (inventory_by_key[key] == 0 and ledger_quantity != 0):
            inventory_by_key[key] = ledger_quantity
    inventory = [
        {"productId": product_id, "storeId": store_id, "quantity": quantity, "reservedQuantity": 0, "minimumQuantity": 0}
        for (store_id, product_id), quantity in sorted(inventory_by_key.items())
    ]
    sales_by_id = {}
    rows = database.execute(
        """
        SELECT m.id, m.fecha, COALESCE(m.local_origen, l.nombre) AS local, m.vendedor, m.cliente,
               m.factura, m.metodo_pago, mp.codigo, mp.descripcion, mp.cantidad,
               mp.precio_unitario, mp.precio_total
        FROM movimientos m
        LEFT JOIN locales l ON l.id = m.local_id
        JOIN movimiento_productos mp ON mp.movimiento_id = m.id
        WHERE UPPER(COALESCE(m.tipo, '')) = 'VENTA'
        ORDER BY m.fecha
        """
    ).fetchall()
    for row in rows:
        sale = sales_by_id.setdefault(row["id"], {"id": row["id"], "storeId": row["local"], "customerId": row["cliente"], "invoiceNumber": row["factura"], "paymentMethod": row["metodo_pago"], "date": row["fecha"], "total": 0, "items": []})
        sale["total"] += float(row["precio_total"] or 0)
        sale["items"].append({"productId": row["codigo"], "quantity": row["cantidad"], "unitPrice": row["precio_unitario"], "price": row["precio_unitario"], "name": row["descripcion"]})
    return {"stores": stores, "products": products, "inventory": inventory, "sales": list(sales_by_id.values())}


def _with_frontend_aliases(row: dict) -> dict:
    """Conserva nombres SQL y agrega aliases camelCase usados por la SPA."""
    result = dict(row)
    for key, value in row.items():
        if "_" in key:
            parts = key.split("_")
            result[parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])] = value
    return result


def _shared_domain_items(database: _PostgresConnection, collection: str) -> list[dict] | None:
    """Convierte tablas operativas del bot al contrato de colecciones del ERP."""
    table_map = {
        "users": "empleados",
        "roles": "roles",
        "expenses": "gastos",
        "fuelRecords": "gasolina",
        "entries": "entradas",
        "exits": "salidas",
        "sistecredito": "sistecredito",
        "returns": "devoluciones",
        "stockCounts": "conteo_fisico",
        "credits": "creditos",
        "apartados": "apartados",
        "auditLog": "bitacora",
        "companySettings": "configuracion",
        "inventoryMovements": "movimientos",
        "transfers": "traslados",
        "installments": "abonos_creditos",
        "payments": "abonos_creditos",
    }
    if collection == "customers":
        query = """
            SELECT DISTINCT cliente AS id, cliente AS name, cliente AS customer
            FROM movimientos
            WHERE NULLIF(BTRIM(COALESCE(cliente, '')), '') IS NOT NULL
            UNION
            SELECT DISTINCT cliente AS id, cliente AS name, cliente AS customer
            FROM apartados
            WHERE NULLIF(BTRIM(COALESCE(cliente, '')), '') IS NOT NULL
            ORDER BY name
        """
    elif collection == "inventoryMovements":
        query = """
            SELECT m.id, m.fecha, m.tipo, m.estado, m.local_origen, m.local_destino,
                   m.empleado, m.referencia, m.observacion, mp.codigo,
                   mp.descripcion, mp.cantidad, mp.precio_unitario, mp.precio_total,
                   mp.entrada, mp.salida
            FROM movimientos m
            LEFT JOIN movimiento_productos mp ON mp.movimiento_id = m.id
            ORDER BY m.fecha DESC, m.id DESC
        """
    elif collection == "entries":
        query = """
            SELECT m.id, m.fecha AS created_at, m.estado, m.local_origen AS local,
                   m.empleado AS supplier_name, m.vendedor, m.factura,
                   m.referencia, m.observacion, COALESCE(SUM(mp.precio_total), 0) AS total
            FROM movimientos m
            LEFT JOIN movimiento_productos mp ON mp.movimiento_id = m.id
            WHERE UPPER(COALESCE(m.tipo, '')) = 'ENTRADA'
            GROUP BY m.id, m.fecha, m.estado, m.local_origen, m.empleado,
                     m.vendedor, m.factura, m.referencia, m.observacion
            ORDER BY m.fecha DESC, m.id DESC
        """
    elif collection == "payments":
        query = """
            SELECT id_abono AS id, credito_id, fecha, usuario, vendedor, local,
                   valor_abono, saldo_anterior, saldo_nuevo, metodo_pago,
                   observacion, numero_recibo
            FROM abonos_creditos
            UNION ALL
            SELECT id_abono AS id, apartado_id AS credito_id, fecha, usuario,
                   vendedor, local, valor_abono, saldo_anterior, saldo_nuevo,
                   metodo_pago, observacion, numero_recibo
            FROM abonos_apartados
            ORDER BY fecha DESC
        """
    elif collection == "installments":
        query = "SELECT id_abono AS id, credito_id, fecha, usuario, vendedor, local, valor_abono, saldo_anterior, saldo_nuevo, metodo_pago, observacion, numero_recibo FROM abonos_creditos ORDER BY fecha DESC"
    elif collection == "paymentMethods":
        query = "SELECT DISTINCT metodo_pago AS name FROM movimientos WHERE NULLIF(BTRIM(COALESCE(metodo_pago, '')), '') IS NOT NULL ORDER BY name"
    elif collection == "credits":
        credit_columns = {
            row["column_name"]
            for row in database.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'creditos'"
            ).fetchall()
        }
        customer_candidates = [
            f"NULLIF(BTRIM(COALESCE(c.{column}::text, '')), '')"
            for column in ("cliente", "cliente_nombre", "nombre_cliente", "customer", "customer_name")
            if column in credit_columns
        ]
        customer_candidates.extend([
            "NULLIF(BTRIM(COALESCE(v.cliente_nombre::text, '')), '')",
            "NULLIF(BTRIM(COALESCE(m.cliente::text, '')), '')",
        ])
        customer_expression = "COALESCE(" + ", ".join(customer_candidates) + ", '')"
        query = """
            SELECT c.*, COALESCE(c.cuota_inicial, 0) + COALESCE(c.saldo_pendiente, 0) AS total,
                     CUSTOMER_EXPRESSION AS customer, COALESCE(v.id, m.id) AS sale_id,
                     COALESCE(v.numero_factura, m.factura) AS invoice_number
            FROM creditos c
                 LEFT JOIN ventas v ON v.id = c.venta_id
            LEFT JOIN movimientos m ON m.id = c.venta_id
            ORDER BY c.creado_en DESC NULLS LAST, c.id DESC
        """.replace("CUSTOMER_EXPRESSION", customer_expression)
    elif collection in table_map:
        query = f"SELECT * FROM {table_map[collection]} ORDER BY 1 DESC"
    else:
        return None
    try:
        items = [_with_frontend_aliases(dict(row)) for row in database.execute(query).fetchall()]
        if collection == "customers":
            credit_columns = {
                row["column_name"]
                for row in database.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'creditos'"
                ).fetchall()
            }
            name_columns = [column for column in ("cliente", "cliente_nombre", "nombre_cliente", "customer", "customer_name") if column in credit_columns]
            if name_columns:
                name_expression = "COALESCE(" + ", ".join(f"c.{column}::text" for column in name_columns) + ", '')"
                balance_columns = [column for column in ("saldo_pendiente", "saldo", "saldo_restante", "saldo_actual") if column in credit_columns]
                balance_expression = "COALESCE(" + ", ".join(f"c.{column}" for column in balance_columns) + ", 0)" if balance_columns else "0"
                credit_rows = database.execute(f"SELECT {name_expression} AS customer, {balance_expression} AS balance FROM creditos c").fetchall()
                balances = {}
                for row in credit_rows:
                    key = str(row["customer"] or "").strip().lower()
                    if key:
                        balances[key] = balances.get(key, 0) + max(0, float(row["balance"] or 0))
                for item in items:
                    item["balance"] = balances.get(str(item.get("name") or item.get("customer") or "").strip().lower(), 0)
        if collection == "transfers":
            stored = database.execute(
                "SELECT data_json FROM domain_records WHERE tenant_id = %s AND collection = %s ORDER BY created_at",
                (DEFAULT_TENANT, collection),
            ).fetchall()
            existing_ids = {str(item.get("id")) for item in items}
            items.extend(
                json.loads(row[0])
                for row in stored
                if str(json.loads(row[0]).get("id")) not in existing_ids
            )
        if collection == "credits":
            for item in items:
                sale_id = item.get("sale_id") or item.get("saleId") or item.get("venta_id") or item.get("ventaId")
                if not sale_id:
                    continue
                movement = database.execute(
                    """
                    SELECT COALESCE(v.id, m.id) AS id,
                           COALESCE(v.numero_factura, m.factura) AS factura,
                           COALESCE(v.cliente_nombre, m.cliente) AS cliente,
                           COALESCE(v.fecha_venta, m.fecha) AS fecha,
                           m.local_origen AS local_origen
                    FROM creditos c
                    LEFT JOIN ventas v ON v.id = c.venta_id
                    LEFT JOIN movimientos m ON m.id = c.venta_id
                    WHERE c.id = %s
                    """,
                    (item.get("id"),),
                ).fetchone()
                if movement:
                    item["saleId"] = str(movement["id"])
                    item["invoiceNumber"] = movement["factura"] or ""
                    item["customer"] = item.get("customer") or movement["cliente"] or ""
                    item["saleDate"] = movement["fecha"]
                    lines = database.execute(
                        """
                        SELECT producto_nombre AS descripcion, cantidad, valor_unitario AS precio_unitario,
                               subtotal AS precio_total, '' AS codigo
                        FROM ventas_detalles WHERE venta_id = %s ORDER BY id
                        """,
                        (sale_id,),
                    ).fetchall()
                    if not lines:
                        lines = database.execute(
                            "SELECT codigo, descripcion, cantidad, precio_unitario, precio_total FROM movimiento_productos WHERE movimiento_id = %s ORDER BY codigo",
                            (sale_id,),
                        ).fetchall()
                    item["items"] = [
                        {
                            "productId": str(line["codigo"] or ""),
                            "name": line["descripcion"] or line["codigo"] or "Producto",
                            "quantity": line["cantidad"] or 0,
                            "unitPrice": line["precio_unitario"] or 0,
                            "subtotal": line["precio_total"] or 0,
                        }
                        for line in lines
                    ]
        if collection == "entries":
            for item in items:
                lines = database.execute(
                    "SELECT codigo, descripcion, cantidad, precio_unitario, precio_total, entrada, salida FROM movimiento_productos WHERE movimiento_id = %s ORDER BY codigo",
                    (item["id"],),
                ).fetchall()
                item["items"] = [
                    {
                        "productId": str(line["codigo"] or ""),
                        "name": str(line["descripcion"] or line["codigo"] or "Producto"),
                        "quantity": line["cantidad"] or 0,
                        "unitCost": line["precio_unitario"] or 0,
                        "price": line["precio_unitario"] or 0,
                        "subtotal": line["precio_total"] or 0,
                        "entrada": line["entrada"] or 0,
                        "salida": line["salida"] or 0,
                    }
                    for line in lines
                ]
        return items
    except Exception as error:
        database.rollback()
        print(f"[ERP] Coleccion compartida no disponible ({collection}): {error}")
        return []


def _shared_state(database: _PostgresConnection) -> dict:
    catalog = _shared_catalog(database)
    state = {
        **catalog,
        "inventoryByStore": catalog["inventory"],
        "demoMode": False,
    }
    for collection in DOMAIN_COLLECTIONS | {"users", "roles", "expenses", "fuelRecords", "entries", "exits", "sistecredito", "auditLog", "inventoryMovements", "transfers", "installments", "payments", "customers", "paymentMethods"}:
        items = _shared_domain_items(database, collection)
        if items is not None:
            state[collection] = items
    stored_state = database.execute("SELECT state_json FROM tenant_states WHERE tenant_id = %s", (DEFAULT_TENANT,)).fetchone()
    if stored_state:
        saved = json.loads(stored_state["state_json"])
        if isinstance(saved.get("notifications"), list):
            state["notifications"] = saved["notifications"]
    return state


def _create_shared_sale(database: _PostgresConnection, payload: dict, user: dict, handler: "AppHandler") -> dict:
    """Registra una venta del ERP como movimiento del esquema del bot."""
    _, cached = claim_idempotency(database, handler, payload, "/api/catalog/sale")
    if cached is not None:
        return cached
    sale_id = record_id(payload)
    store_id = str(payload.get("storeId", "")).strip()
    invoice_number = str(payload.get("invoiceNumber", "")).strip()
    items = payload.get("items")
    if not store_id or not invoice_number or not isinstance(items, list) or not items:
        raise ValueError("La venta requiere local, numero de factura fisica y productos")
    enforce_user_store_proxy(user, store_id)
    store = database.execute("SELECT nombre FROM locales WHERE nombre = %s AND activo = TRUE", (store_id,)).fetchone()
    if not store:
        raise ValueError("El local no existe en PostgreSQL")
    total = 0
    normalized = []
    for item in items:
        code = str(item.get("productId") or item.get("code") or "").strip()
        quantity = int(float(item.get("quantity", 0)))
        price = int(float(item.get("unitPrice", item.get("price", 0))))
        product = database.execute("SELECT nombre_producto FROM productos WHERE codigo = %s AND UPPER(COALESCE(activo, 'SI')) <> 'NO'", (code,)).fetchone()
        stock = database.execute("SELECT cantidad FROM inventarios WHERE local = %s AND codigo = %s FOR UPDATE", (store_id, code)).fetchone()
        if not product or quantity <= 0 or price < 0 or not stock or int(stock["cantidad"] or 0) < quantity:
            raise ValueError("Producto inexistente o stock insuficiente")
        total += quantity * price
        normalized.append((code, product["nombre_producto"], quantity, price))
    customer_name = str(payload.get("customer") or payload.get("customerId") or "").strip()
    movement_cursor = database.execute("INSERT INTO movimientos (tipo, estado, local_origen, empleado, vendedor, factura, cliente, metodo_pago) VALUES ('VENTA', 'COMPLETADO', %s, %s, %s, %s, %s, %s) RETURNING id", (store_id, str(user["username"] or user["id"] or "ERP"), str(user["username"] or "ERP"), invoice_number, customer_name, str(payload.get("paymentMethod", ""))))
    movement_id = movement_cursor.fetchone()
    if movement_id is None:
        raise RuntimeError("No se pudo crear el movimiento de venta")
    movement_id = movement_id[0]
    for code, description, quantity, price in normalized:
        database.execute("UPDATE inventarios SET cantidad = cantidad - %s, actualizado = CURRENT_TIMESTAMP WHERE local = %s AND codigo = %s", (quantity, store_id, code))
        database.execute("INSERT INTO movimiento_productos (movimiento_id, codigo, descripcion, cantidad, precio_unitario, precio_total, entrada, salida) VALUES (%s, %s, %s, %s, %s, %s, 0, %s)", (movement_id, code, description, quantity, price, quantity * price, quantity))
    result = {"id": movement_id, "total": total}
    complete_idempotency(database, handler, payload, "/api/catalog/sale", 201, {"ok": True, **result})
    return result


def enforce_user_store_proxy(user: dict, store_id: str) -> None:
    assigned_store = str(user["store_id"] or "")
    if assigned_store and user["role"] != "ADMINISTRADOR" and assigned_store != store_id:
        raise ValueError("El usuario no puede operar en este local")


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=_json_default).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def _send_cors_headers(self) -> None:
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-Tenant-ID, Idempotency-Key, ngrok-skip-browser-warning")

    def do_GET(self) -> None:
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        if path == "/api/health":
            self.send_json(200, {"ok": True, "database": "postgresql", "backend": DB_BACKEND})
            return
        if path == "/api/auth/status":
            with connection() as database:
                configured = database.execute("SELECT 1 FROM auth_users WHERE active = 1 LIMIT 1").fetchone() is not None
            self.send_json(200, {"configured": configured})
            return
        if path.startswith("/api/") and not authenticated_user(self):
            self.send_json(401, {"error": "Autenticacion requerida"})
            return
        if path.startswith("/api/") and not requested_tenant_allowed(self):
            self.send_json(403, {"error": "Empresa no autorizada"})
            return
        if path.startswith("/api/") and not can_access(self, path, "GET"):
            self.send_json(403, {"error": "Permiso insuficiente"})
            return
        if path == "/api/state":
            if _postgres_enabled():
                with connection() as database:
                    state = _shared_state(database)
                self.send_json(200, {"state": state, "updatedAt": None})
                return
            with connection() as database:
                row = database.execute("SELECT state_json, updated_at FROM tenant_states WHERE tenant_id = ?", (tenant_id(self),)).fetchone()
                if row is None and tenant_id(self) == DEFAULT_TENANT:
                    row = database.execute("SELECT state_json, updated_at FROM app_state WHERE id = 1").fetchone()
            if row is None:
                self.send_json(200, {"state": None})
                return
            self.send_json(200, {"state": json.loads(row[0]), "updatedAt": row[1]})
            return
        if path == "/api/catalog":
            if _postgres_enabled():
                with connection() as database:
                    catalog = _shared_catalog(database)
                self.send_json(200, {"tenantId": DEFAULT_TENANT, **catalog})
                return
            current_tenant = tenant_id(self)
            with connection() as database:
                stores = [dict(row) for row in database.execute("SELECT id, code, name, address, phone, active FROM stores WHERE tenant_id = ? ORDER BY name", (current_tenant,))]
                products = [dict(row) for row in database.execute("SELECT id, code, name, reference, barcode, category, cost, sale_price AS salePrice, tax_rate AS taxRate, active FROM products WHERE tenant_id = ? ORDER BY name", (current_tenant,))]
                inventory = [dict(row) for row in database.execute("SELECT product_id AS productId, store_id AS storeId, quantity, reserved_quantity AS reservedQuantity, minimum_quantity AS minimumQuantity FROM inventory WHERE tenant_id = ?", (current_tenant,))]
                sales = []
                for row in database.execute("SELECT id, store_id AS storeId, customer_id AS customerId, invoice_number AS invoiceNumber, total, payment_method AS paymentMethod, created_at AS date FROM sales WHERE tenant_id = ? ORDER BY created_at", (current_tenant,)):
                    sale = dict(row)
                    sale["items"] = [dict(item) for item in database.execute("SELECT sale_items.product_id AS productId, sale_items.quantity, sale_items.unit_price AS unitPrice, sale_items.unit_price AS price, sale_items.tax_rate AS taxRate, products.name FROM sale_items LEFT JOIN products ON products.id = sale_items.product_id AND products.tenant_id = ? WHERE sale_items.sale_id = ? ORDER BY sale_items.rowid", (current_tenant, sale["id"]))]
                    sales.append(sale)
            self.send_json(200, {"tenantId": current_tenant, "stores": stores, "products": products, "inventory": inventory, "sales": sales})
            return
        if path == "/api/tenants":
            with connection() as database:
                rows = database.execute("SELECT id, name, slug, plan, active FROM tenants WHERE active = 1 ORDER BY name").fetchall()
            self.send_json(200, {"items": [dict(row) for row in rows]})
            return
        if path == "/api/users":
            with connection() as database:
                rows = database.execute("SELECT id, username, email, phone, role, store_id AS storeId, tenant_id AS tenantId, active, created_at AS createdAt FROM auth_users WHERE tenant_id = ? ORDER BY username", (tenant_id(self),)).fetchall()
            self.send_json(200, {"items": [dict(row) for row in rows]})
            return
        if path.startswith("/api/users/") and path.endswith("/permissions"):
            user_id = unquote(path.removeprefix("/api/users/").removesuffix("/permissions")).strip("/")
            with connection() as database:
                rows = database.execute("SELECT resource, action, allowed FROM user_permissions WHERE tenant_id = ? AND user_id = ? ORDER BY resource, action", (tenant_id(self), user_id)).fetchall()
            self.send_json(200, {"items": [dict(row) for row in rows]})
            return
        if path.startswith("/api/domain/"):
            collection = unquote(path.removeprefix("/api/domain/")).strip("/")
            if collection not in DOMAIN_COLLECTIONS:
                self.send_json(404, {"error": "Coleccion no disponible"})
                return
            with connection() as database:
                if _postgres_enabled():
                    shared_items = _shared_domain_items(database, collection)
                    if shared_items is not None:
                        self.send_json(200, {"collection": collection, "items": shared_items})
                        return
                rows = database.execute("SELECT data_json, version FROM domain_records WHERE tenant_id = ? AND collection = ? ORDER BY created_at", (tenant_id(self), collection)).fetchall()
            items = []
            for row in rows:
                item = json.loads(row[0])
                item["_version"] = row[1]
                items.append(item)
            self.send_json(200, {"collection": collection, "items": items})
            return
        if path.startswith("/api/report/") and path.endswith(".csv"):
            collection = unquote(path.removeprefix("/api/report/").removesuffix(".csv"))
            if collection not in DOMAIN_COLLECTIONS:
                self.send_json(404, {"error": "Reporte no disponible"})
                return
            with connection() as database:
                rows = database.execute("SELECT data_json FROM domain_records WHERE tenant_id = ? AND collection = ? ORDER BY created_at", (tenant_id(self), collection)).fetchall()
            items = filter_report_items([json.loads(row[0]) for row in rows], (parse_qs(parsed_url.query).get("from") or [""])[0], (parse_qs(parsed_url.query).get("to") or [""])[0], (parse_qs(parsed_url.query).get("storeId") or [""])[0])
            columns = sorted({key for item in items for key in item})
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=columns or ["id"])
            writer.writeheader()
            writer.writerows({key: json.dumps(item.get(key), ensure_ascii=False) if isinstance(item.get(key), (dict, list)) else item.get(key, "") for key in columns} for item in items)
            body = output.getvalue().encode("utf-8-sig")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="{collection}.csv"')
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if path.startswith("/api/report-pdf/") and path.endswith(".pdf"):
            collection = unquote(path.removeprefix("/api/report-pdf/").removesuffix(".pdf"))
            standard = {"sales", "customers", "stores", "inventory", "inventoryByStore", "products", "credits"}
            if collection not in DOMAIN_COLLECTIONS and collection not in standard:
                self.send_json(404, {"error": "Reporte no disponible"})
                return
            current_tenant = tenant_id(self)
            filters = parse_qs(parsed_url.query)
            date_from = (filters.get("from") or [""])[0]
            date_to = (filters.get("to") or [""])[0]
            store_filter = (filters.get("storeId") or [""])[0]
            if collection in DOMAIN_COLLECTIONS:
                with connection() as database:
                    items = filter_report_items([json.loads(row[0]) for row in database.execute("SELECT data_json FROM domain_records WHERE tenant_id = ? AND collection = ? ORDER BY created_at", (current_tenant, collection)).fetchall()], date_from, date_to, store_filter)
            elif collection == "sales":
                query = "SELECT id, store_id AS storeId, customer_id AS customerId, total, payment_method AS paymentMethod, created_at AS date FROM sales WHERE tenant_id = ?"
                params = [current_tenant]
                if date_from:
                    query += " AND date(created_at) >= date(?)"
                    params.append(date_from)
                if date_to:
                    query += " AND date(created_at) <= date(?)"
                    params.append(date_to)
                if store_filter:
                    query += " AND store_id = ?"
                    params.append(store_filter)
                query += " ORDER BY created_at"
                with connection() as database:
                    items = [dict(row) for row in database.execute(query, params).fetchall()]
            elif collection in {"inventory", "inventoryByStore"}:
                query = "SELECT product_id AS productId, store_id AS storeId, quantity, reserved_quantity AS reservedQuantity, minimum_quantity AS minimumQuantity FROM inventory WHERE tenant_id = ?"
                params = [current_tenant]
                if store_filter:
                    query += " AND store_id = ?"
                    params.append(store_filter)
                query += " ORDER BY store_id, product_id"
                with connection() as database:
                    items = [dict(row) for row in database.execute(query, params).fetchall()]
            else:
                with connection() as database:
                    state_row = database.execute("SELECT state_json FROM tenant_states WHERE tenant_id = ?", (current_tenant,)).fetchone()
                state = json.loads(state_row[0]) if state_row else {}
                items = state.get(collection, []) if isinstance(state.get(collection, []), list) else []
            columns = sorted({key for item in items if isinstance(item, dict) for key in item}) or ["id"]
            rows = [[item.get(column, "") if isinstance(item, dict) else "" for column in columns] for item in items]
            pdf = make_pdf(f"Reporte de {collection}", columns, rows, usuario=authenticated_user(self)["username"])
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", f'attachment; filename="famimuebles-{collection}.pdf"')
            self.send_header("Content-Length", str(len(pdf)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(pdf)
            return
        if path.startswith("/api/report/") and path.endswith(".html"):
            collection = unquote(path.removeprefix("/api/report/").removesuffix(".html"))
            if collection not in DOMAIN_COLLECTIONS:
                self.send_json(404, {"error": "Reporte no disponible"})
                return
            with connection() as database:
                rows = database.execute("SELECT data_json FROM domain_records WHERE tenant_id = ? AND collection = ? ORDER BY created_at", (tenant_id(self), collection)).fetchall()
            items = [json.loads(row[0]) for row in rows]
            columns = sorted({key for item in items for key in item}) or ["id"]
            body = """<!doctype html><meta charset='utf-8'><title>Reporte FAMIMUEBLES</title><style>body{font:14px Arial;color:#172b3a}h1{font-size:22px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd6dc;padding:7px;text-align:left}th{background:#e9f1f4}@media print{button{display:none}}</style><button onclick='print()'>Imprimir / Guardar PDF</button>"""
            body += f"<h1>FAMIMUEBLES - Reporte de {collection}</h1><table><thead><tr>{''.join(f'<th>{key}</th>' for key in columns)}</tr></thead><tbody>"
            escape_html = lambda value: (str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))
            body += "".join(f"<tr>{''.join(f'<td>{escape_html(item.get(key, ''))}</td>' for key in columns)}</tr>" for item in items) + "</tbody></table>"
            encoded = body.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)
            return
        if path == "/api/backup":
            with connection() as database:
                current_tenant = tenant_id(self)
                state = database.execute("SELECT state_json FROM tenant_states WHERE tenant_id = ?", (current_tenant,)).fetchone()
                if state is None and current_tenant == DEFAULT_TENANT:
                    state = database.execute("SELECT state_json FROM app_state WHERE id = 1").fetchone()
                records = database.execute("SELECT collection, id, data_json FROM domain_records WHERE tenant_id = ?", (current_tenant,)).fetchall()
            payload = {"tenantId": current_tenant, "state": json.loads(state[0]) if state else None, "domainRecords": [{"collection": row[0], "id": row[1], "data": json.loads(row[2])} for row in records]}
            self.send_json(200, payload)
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            payload = request_json(self)
            if path == "/api/auth/logout":
                token = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
                with connection() as database:
                    database.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
                self.send_json(200, {"ok": True})
                return
            if path not in {"/api/auth/setup", "/api/auth/login"} and not authenticated_user(self):
                self.send_json(401, {"error": "Autenticacion requerida"})
                return
            if path not in {"/api/auth/setup", "/api/auth/login"} and not requested_tenant_allowed(self, payload):
                self.send_json(403, {"error": "Empresa no autorizada"})
                return
            if path not in {"/api/auth/setup", "/api/auth/login"} and not can_access(self, path, "POST"):
                self.send_json(403, {"error": "Permiso insuficiente"})
                return
            if path == "/api/tenants":
                name = str(payload.get("name", "")).strip()
                slug = str(payload.get("slug", "")).strip().lower()
                if len(name) < 2 or len(slug) < 2:
                    raise ValueError("La empresa requiere nombre y slug validos")
                new_id = secrets.token_hex(10)
                with connection() as database:
                    database.execute("INSERT INTO tenants (id, name, slug, plan) VALUES (?, ?, ?, ?)", (new_id, name, slug, str(payload.get("plan") or "starter")))
                self.send_json(201, {"id": new_id, "name": name, "slug": slug})
                return
            if path == "/api/users":
                if authenticated_user(self)["role"] != "ADMINISTRADOR":
                    self.send_json(403, {"error": "Solo el administrador puede crear usuarios"})
                    return
                username = str(payload.get("username", "")).strip()
                password = str(payload.get("password", ""))
                role = str(payload.get("role", "VENDEDOR")).strip().upper()
                if len(username) < 3 or len(password) < 8:
                    raise ValueError("El usuario requiere 3 caracteres y la clave 8")
                if role not in {"ADMINISTRADOR", "GERENTE", "CONTADOR", "SUPERVISOR", "BODEGA", "CAJERO", "VENDEDOR"}:
                    raise ValueError("Rol no valido")
                user_id = secrets.token_hex(8)
                with connection() as database:
                    database.execute("INSERT INTO auth_users (id, username, email, phone, password_hash, role, store_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (user_id, username, str(payload.get("email", "")).strip(), str(payload.get("phone", "")).strip(), password_hash(password), role, payload.get("storeId"), tenant_id(self, payload)))
                self.send_json(201, {"ok": True, "id": user_id, "username": username, "role": role})
                return
            if path.startswith("/api/users/") and path.endswith("/permissions"):
                current_user = authenticated_user(self)
                if current_user["role"] != "ADMINISTRADOR":
                    self.send_json(403, {"error": "Solo el administrador puede cambiar permisos"})
                    return
                user_id = unquote(path.removeprefix("/api/users/").removesuffix("/permissions")).strip("/")
                permissions = payload.get("permissions")
                if not isinstance(permissions, list):
                    raise ValueError("Los permisos deben ser una lista")
                with connection() as database:
                    database.execute("DELETE FROM user_permissions WHERE tenant_id = ? AND user_id = ?", (tenant_id(self), user_id))
                    for permission in permissions:
                        resource = str(permission.get("resource", "")).strip()
                        action = str(permission.get("action", "")).strip().lower()
                        if resource and action in {"view", "create", "edit", "delete"}:
                            database.execute("INSERT INTO user_permissions (tenant_id, user_id, resource, action, allowed) VALUES (?, ?, ?, ?, ?)", (tenant_id(self), user_id, resource, action, 1 if permission.get("allowed") else 0))
                    database.execute("INSERT INTO audit_events (user_id, action, collection, record_id, data_json) VALUES (?, ?, ?, ?, ?)", (current_user["id"], "UPDATE", "user_permissions", user_id, json.dumps(permissions, ensure_ascii=False)))
                self.send_json(200, {"ok": True})
                return
            if path == "/api/auth/setup":
                username = str(payload.get("username", "")).strip()
                password = str(payload.get("password", ""))
                if len(username) < 3 or len(password) < 8:
                    raise ValueError("El usuario requiere 3 caracteres y la clave 8")
                with connection() as database:
                    if database.execute("SELECT 1 FROM auth_users LIMIT 1").fetchone():
                        raise ValueError("El usuario inicial ya fue configurado")
                    user_id = secrets.token_hex(8)
                    database.execute("INSERT INTO auth_users (id, username, password_hash, role, store_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?)", (user_id, username, password_hash(password), "ADMINISTRADOR", payload.get("storeId"), payload.get("tenantId") or DEFAULT_TENANT))
                    token = secrets.token_urlsafe(32)
                    database.execute("INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+12 hours'))", (token, user_id))
                self.send_json(201, {"ok": True, "token": token, "user": {"id": user_id, "username": username, "email": str(payload.get("email", "")).strip(), "phone": str(payload.get("phone", "")).strip(), "role": "ADMINISTRADOR", "storeId": payload.get("storeId")}})
                return
            if path == "/api/auth/login":
                username = str(payload.get("username", "")).strip()
                password = str(payload.get("password", ""))
                with connection() as database:
                    user = database.execute("SELECT * FROM auth_users WHERE LOWER(username) = LOWER(?) AND active = 1", (username,)).fetchone()
                    if not user or not password_matches(password, user["password_hash"]):
                        self.send_json(401, {"error": "Credenciales invalidas"})
                        return
                    token = secrets.token_urlsafe(32)
                    database.execute("INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+12 hours'))", (token, user["id"]))
                self.send_json(200, {"token": token, "user": {"id": user["id"], "username": user["username"], "email": user["email"], "phone": user["phone"], "role": user["role"], "storeId": user["store_id"]}})
                return
            if path == "/api/state":
                state = payload.get("state")
                if not isinstance(state, dict):
                    raise ValueError("El estado debe ser un objeto JSON")
                serialized = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
                with connection() as database:
                    database.execute("INSERT OR IGNORE INTO tenants (id, name, slug) VALUES (?, ?, ?)", (tenant_id(self, payload), "Nueva empresa", tenant_id(self, payload)))
                    database.execute("INSERT INTO tenant_states (tenant_id, state_json) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP", (tenant_id(self, payload), serialized))
                self.send_json(200, {"ok": True, "backend": "postgres"})
                return
            if path in {"/api/catalog/store", "/api/catalog/product"}:
                if _postgres_enabled():
                    identifier = record_id(payload)
                    with connection() as database:
                        if path.endswith("/store"):
                            code = str(payload.get("code") or identifier).strip()
                            name = str(payload.get("name", "")).strip()
                            if not code or not name:
                                raise ValueError("El local requiere codigo y nombre")
                            database.execute("INSERT INTO locales (codigo, nombre, fecha_creacion, creado_por, activo) VALUES (%s, %s, CURRENT_TIMESTAMP, %s, %s) ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, activo = EXCLUDED.activo", (code, name, authenticated_user(self)["username"], "NO" if payload.get("active") is False else "SI"))
                        else:
                            code = str(payload.get("code") or identifier).strip()
                            name = str(payload.get("name", "")).strip()
                            if not code or not name:
                                raise ValueError("El producto requiere codigo y nombre")
                            database.execute("INSERT INTO productos (codigo, nombre_producto, precio_compra, activo) VALUES (%s, %s, %s, %s) ON CONFLICT (codigo) DO UPDATE SET nombre_producto = EXCLUDED.nombre_producto, precio_compra = EXCLUDED.precio_compra, activo = EXCLUDED.activo", (code, name, int(float(payload.get("cost", 0) or 0)), "NO" if payload.get("active") is False else "SI"))
                    self.send_json(201, {"ok": True, "id": identifier})
                    return
                current_tenant = tenant_id(self, payload)
                identifier = record_id(payload)
                with connection() as database:
                    if path.endswith("/store"):
                        code = str(payload.get("code", "")).strip()
                        name = str(payload.get("name", "")).strip()
                        if not code or not name:
                            raise ValueError("El local requiere codigo y nombre")
                        database.execute("INSERT INTO stores (id, tenant_id, code, name, address, phone) VALUES (?, ?, ?, ?, ?, ?)", (identifier, current_tenant, code, name, str(payload.get("address", "")), str(payload.get("phone", ""))))
                    else:
                        code = str(payload.get("code", "")).strip()
                        name = str(payload.get("name", "")).strip()
                        if not code or not name:
                            raise ValueError("El producto requiere codigo y nombre")
                        database.execute("INSERT INTO products (id, tenant_id, code, name, reference, barcode, category, cost, sale_price, tax_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (identifier, current_tenant, code, name, str(payload.get("reference", "")), str(payload.get("barcode", "")), str(payload.get("category", "")), float(payload.get("cost", 0)), float(payload.get("salePrice", 0)), float(payload.get("taxRate", 0))))
                self.send_json(201, {"ok": True, "id": identifier})
                return
            if path == "/api/catalog/inventory-movement":
                if _postgres_enabled():
                    product_id = str(payload.get("productId", "")).strip()
                    store_id = str(payload.get("storeId", "")).strip()
                    raw_quantity = float(payload.get("quantity", 0) or 0)
                    if not __import__("math").isfinite(raw_quantity) or raw_quantity != int(raw_quantity):
                        raise ValueError("La cantidad debe ser un numero entero finito")
                    quantity = int(raw_quantity)
                    movement_type = str(payload.get("movementType", "ENTRADA")).upper()
                    if not product_id or not store_id or quantity <= 0:
                        raise ValueError("Producto, local y cantidad valida son obligatorios")
                    enforce_user_store_proxy(authenticated_user(self), store_id)
                    signed = quantity if movement_type in {"ENTRADA", "COMPRA", "TRASLADO_ENTRADA", "DEVOLUCION_CLIENTE"} else -quantity
                    with connection() as database:
                        _, cached = claim_idempotency(database, self, payload, path)
                        if cached is not None:
                            self.send_json(200, cached)
                            return
                        if not database.execute("SELECT 1 FROM locales WHERE nombre = %s AND activo = TRUE", (store_id,)).fetchone():
                            raise ValueError("El local no existe o esta inactivo")
                        if not database.execute("SELECT 1 FROM productos WHERE codigo = %s AND UPPER(COALESCE(activo, 'SI')) <> 'NO'", (product_id,)).fetchone():
                            raise ValueError("El producto no existe o esta inactivo")
                        row = database.execute("SELECT cantidad FROM inventarios WHERE local = %s AND codigo = %s FOR UPDATE", (store_id, product_id)).fetchone()
                        current = int(row["cantidad"] or 0) if row else 0
                        if current + signed < 0:
                            raise ValueError("El stock no puede quedar negativo")
                        if row:
                            database.execute("UPDATE inventarios SET cantidad = cantidad + %s, actualizado = CURRENT_TIMESTAMP WHERE local = %s AND codigo = %s", (signed, store_id, product_id))
                        else:
                            database.execute("INSERT INTO inventarios (local, codigo, descripcion, cantidad) SELECT %s, codigo, nombre_producto, %s FROM productos WHERE codigo = %s", (store_id, signed, product_id))
                        cursor = database.execute("INSERT INTO movimientos (tipo, estado, local_origen, empleado, observacion) VALUES (%s, 'COMPLETADO', %s, %s, %s) RETURNING id", (movement_type, store_id, authenticated_user(self)["username"], str(payload.get("note", ""))))
                        movement_id = cursor.fetchone()[0]
                        database.execute("INSERT INTO movimiento_productos (movimiento_id, codigo, cantidad, entrada, salida) VALUES (%s, %s, %s, %s, %s)", (movement_id, product_id, quantity, quantity if signed > 0 else 0, quantity if signed < 0 else 0))
                        response = {"ok": True, "id": movement_id, "quantity": current + signed}
                        complete_idempotency(database, self, payload, path, 201, response)
                    self.send_json(201, response)
                    return
                current_tenant = tenant_id(self, payload)
                product_id = str(payload.get("productId", "")).strip()
                store_id = str(payload.get("storeId", "")).strip()
                enforce_user_store(self, store_id)
                quantity = float(payload.get("quantity", 0))
                if not product_id or not store_id or not quantity or not __import__("math").isfinite(quantity):
                    raise ValueError("Producto, local y cantidad valida son obligatorios")
                movement_type = str(payload.get("movementType", "ENTRADA")).upper()
                signed_quantity = abs(quantity) if movement_type in {"ENTRADA", "COMPRA", "TRASLADO_ENTRADA", "DEVOLUCION_CLIENTE"} else -abs(quantity)
                movement_id = record_id(payload)
                with connection() as database:
                    if not database.execute("SELECT 1 FROM products WHERE id = ? AND tenant_id = ?", (product_id, current_tenant)).fetchone() or not database.execute("SELECT 1 FROM stores WHERE id = ? AND tenant_id = ?", (store_id, current_tenant)).fetchone():
                        raise ValueError("El producto o local no pertenece a la empresa")
                    database.execute("INSERT OR IGNORE INTO inventory (tenant_id, product_id, store_id) VALUES (?, ?, ?)", (current_tenant, product_id, store_id))
                    row = database.execute("SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (current_tenant, product_id, store_id)).fetchone()
                    next_quantity = float(row[0]) + signed_quantity
                    if next_quantity < 0:
                        raise ValueError("El stock no puede quedar negativo")
                    database.execute("UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (next_quantity, current_tenant, product_id, store_id))
                    database.execute("INSERT INTO inventory_movements (id, tenant_id, product_id, store_id, movement_type, quantity, reference_id, note, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (movement_id, current_tenant, product_id, store_id, movement_type, signed_quantity, payload.get("referenceId"), str(payload.get("note", "")), authenticated_user(self)["id"]))
                self.send_json(201, {"ok": True, "id": movement_id, "quantity": next_quantity})
                return
            if path == "/api/catalog/sale-item":
                sale_id = str(payload.get("saleId", "")).strip()
                product_id = str(payload.get("productId", "")).strip()
                quantity = float(payload.get("quantity", 0) or 0)
                price = float(payload.get("unitPrice", payload.get("price", 0)) or 0)
                if not sale_id or not product_id or quantity <= 0 or quantity != int(quantity) or price < 0 or not __import__("math").isfinite(quantity + price):
                    raise ValueError("Venta, producto, cantidad y valor son obligatorios y validos")
                quantity = int(quantity)
                if _postgres_enabled():
                    with connection() as database:
                        sale = database.execute("SELECT id, local_origen AS store_id, factura, cliente, metodo_pago FROM movimientos WHERE (id = %s OR factura = %s) AND UPPER(COALESCE(tipo, '')) = 'VENTA' ORDER BY id DESC LIMIT 1 FOR UPDATE", (sale_id, sale_id)).fetchone()
                        if not sale:
                            raise ValueError("No se encontro la factura")
                        store_id = str(sale["store_id"] or "").strip()
                        enforce_user_store_proxy(authenticated_user(self), store_id)
                        product = database.execute("SELECT nombre_producto FROM productos WHERE codigo = %s AND UPPER(COALESCE(activo, 'SI')) <> 'NO'", (product_id,)).fetchone()
                        stock = database.execute("SELECT cantidad FROM inventarios WHERE local = %s AND codigo = %s FOR UPDATE", (store_id, product_id)).fetchone()
                        if not product or not stock or int(stock["cantidad"] or 0) < quantity:
                            raise ValueError("Producto inexistente o stock insuficiente")
                        database.execute("UPDATE inventarios SET cantidad = cantidad - %s, actualizado = CURRENT_TIMESTAMP WHERE local = %s AND codigo = %s", (quantity, store_id, product_id))
                        database.execute("INSERT INTO movimiento_productos (movimiento_id, codigo, descripcion, cantidad, precio_unitario, precio_total, entrada, salida) VALUES (%s, %s, %s, %s, %s, %s, 0, %s)", (sale["id"], product_id, product["nombre_producto"], quantity, price, quantity * price, quantity))
                    self.send_json(201, {"ok": True, "saleId": sale_id, "quantity": quantity})
                    return
                current_tenant = tenant_id(self, payload)
                with connection() as database:
                    sale = database.execute("SELECT store_id FROM sales WHERE tenant_id = ? AND id = ?", (current_tenant, sale_id)).fetchone()
                    if not sale:
                        raise ValueError("No se encontro la factura")
                    store_id = str(sale[0])
                    enforce_user_store(self, store_id)
                    product = database.execute("SELECT 1 FROM products WHERE tenant_id = ? AND id = ? AND active = 1", (current_tenant, product_id)).fetchone()
                    stock = database.execute("SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (current_tenant, product_id, store_id)).fetchone()
                    if not product or not stock or float(stock[0]) < quantity:
                        raise ValueError("Producto inexistente o stock insuficiente")
                    database.execute("INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax_rate) VALUES (?, ?, ?, ?, 0) ON CONFLICT(sale_id, product_id) DO UPDATE SET quantity = sale_items.quantity + excluded.quantity, unit_price = excluded.unit_price", (sale_id, product_id, quantity, price))
                    database.execute("UPDATE sales SET total = total + ? WHERE tenant_id = ? AND id = ?", (quantity * price, current_tenant, sale_id))
                    database.execute("UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (quantity, current_tenant, product_id, store_id))
                    movement_id = f"{sale_id}-ADIC-{product_id}-{int(__import__('time').time() * 1000)}"
                    database.execute("INSERT INTO inventory_movements (id, tenant_id, product_id, store_id, movement_type, quantity, reference_id, note, user_id) VALUES (?, ?, ?, ?, 'VENTA', ?, ?, ?, ?)", (movement_id, current_tenant, product_id, store_id, -quantity, sale_id, f"Producto agregado a venta {sale_id}", authenticated_user(self)["id"]))
                self.send_json(201, {"ok": True, "saleId": sale_id, "quantity": quantity})
                return
            if path == "/api/catalog/sale":
                if _postgres_enabled():
                    with connection() as database:
                        result = _create_shared_sale(database, payload, authenticated_user(self), self)
                    self.send_json(201, {"ok": True, **result})
                    return
                current_tenant = tenant_id(self, payload)
                sale_id = record_id(payload)
                store_id = str(payload.get("storeId", "")).strip()
                enforce_user_store(self, store_id)
                items = payload.get("items")
                transport = float(payload.get("transport", 0) or 0)
                invoice_number = str(payload.get("invoiceNumber", "")).strip()
                if not store_id or not isinstance(items, list) or not items or not invoice_number:
                    raise ValueError("La venta requiere local, numero de factura fisica y productos")
                if transport < 0 or not __import__("math").isfinite(transport):
                    raise ValueError("El transporte no es valido")
                with connection() as database:
                    if not database.execute("SELECT 1 FROM stores WHERE id = ? AND tenant_id = ?", (store_id, current_tenant)).fetchone():
                        raise ValueError("El local no pertenece a la empresa")
                    total = 0.0
                    for item in items:
                        product_id = str(item.get("productId", "")).strip()
                        quantity = float(item.get("quantity", 0))
                        price = float(item.get("unitPrice", item.get("price", 0)))
                        if not product_id or quantity <= 0 or price < 0 or not __import__("math").isfinite(quantity + price):
                            raise ValueError("Producto, cantidad y precio invalidos")
                        product = database.execute("SELECT 1 FROM products WHERE id = ? AND tenant_id = ?", (product_id, current_tenant)).fetchone()
                        row = database.execute("SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (current_tenant, product_id, store_id)).fetchone()
                        if not product or not row or float(row[0]) < quantity:
                            raise ValueError("Stock insuficiente o producto inexistente")
                        total += quantity * price
                    total += transport
                    database.execute("INSERT INTO sales (id, tenant_id, store_id, customer_id, invoice_number, total, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)", (sale_id, current_tenant, store_id, payload.get("customerId"), invoice_number, total, str(payload.get("paymentMethod", ""))))
                    for item in items:
                        product_id = str(item["productId"])
                        quantity = float(item["quantity"])
                        price = float(item.get("unitPrice", item.get("price", 0)))
                        database.execute("INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax_rate) VALUES (?, ?, ?, ?, ?)", (sale_id, product_id, quantity, price, float(item.get("taxRate", 0))))
                        database.execute("UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (quantity, current_tenant, product_id, store_id))
                        database.execute("INSERT INTO inventory_movements (id, tenant_id, product_id, store_id, movement_type, quantity, reference_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (f"{sale_id}-{product_id}", current_tenant, product_id, store_id, "VENTA", -quantity, sale_id, authenticated_user(self)["id"]))
                    payment_method = str(payload.get("paymentMethod", "")).lower()
                    if "credito" in payment_method or "crédito" in payment_method:
                        credit_id = f"CR-{sale_id}"
                        credit_initial = float(payload.get("creditInitial", 0) or 0)
                        credit_installments = int(payload.get("creditInstallments", 6) or 6)
                        if credit_initial < 0 or credit_initial > total or not __import__("math").isfinite(credit_initial):
                            raise ValueError("La cuota inicial no es valida")
                        if credit_installments < 1:
                            raise ValueError("El numero de cuotas debe ser mayor que cero")
                        financed_amount = total - credit_initial
                        credit = {"id": credit_id, "saleId": sale_id, "customerId": payload.get("customerId"), "total": total, "originalAmount": total, "initial": credit_initial, "downPayment": credit_initial, "paid": 0, "financedAmount": financed_amount, "installmentsCount": credit_installments, "installmentAmount": financed_amount / credit_installments, "status": "Al dia", "createdAt": payload.get("date")}
                        database.execute("INSERT INTO domain_records (tenant_id, collection, id, data_json) VALUES (?, ?, ?, ?)", (current_tenant, "credits", credit_id, json.dumps(credit, ensure_ascii=False)))
                    elif "apartado" in payment_method:
                        apart_id = f"APT-{sale_id}"
                        apart = {"id": apart_id, "saleId": sale_id, "customerId": payload.get("customerId"), "storeId": store_id, "total": total, "paid": 0, "status": "Activo", "items": items, "createdAt": payload.get("date")}
                        database.execute("INSERT INTO domain_records (tenant_id, collection, id, data_json) VALUES (?, ?, ?, ?)", (current_tenant, "apartados", apart_id, json.dumps(apart, ensure_ascii=False)))
                self.send_json(201, {"ok": True, "id": sale_id, "total": total})
                return
            if path == "/api/shared-payment":
                kind = str(payload.get("kind", "")).lower()
                record_id_value = str(payload.get("id", "")).strip()
                amount = float(payload.get("amount", 0) or 0)
                if not __import__("math").isfinite(amount):
                    raise ValueError("El monto del abono debe ser finito")
                if kind == "credit":
                    if not record_id_value or amount <= 0:
                        raise ValueError("El abono requiere un credito y un monto valido")
                    with connection() as database:
                        _, cached = claim_idempotency(database, self, payload, path)
                        if cached is not None:
                            self.send_json(200, cached)
                            return
                        credit = database.execute("SELECT * FROM creditos WHERE id = %s FOR UPDATE", (record_id_value,)).fetchone()
                        if not credit:
                            raise ValueError("No se encontro el credito en PostgreSQL")
                        columns = {row[0] for row in database.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'creditos'").fetchall()}
                        current_paid = float(credit.get("valor_pagado") or credit.get("pagado") or credit.get("abonos") or 0)
                        explicit_balance = credit.get("saldo_pendiente")
                        if explicit_balance is None:
                            explicit_balance = credit.get("saldo")
                        if explicit_balance is None:
                            explicit_balance = credit.get("saldo_restante")
                        if explicit_balance is None:
                            total = float(credit.get("total") or credit.get("valor_total") or credit.get("monto") or 0)
                            initial = float(credit.get("cuota_inicial") or credit.get("abono_inicial") or credit.get("inicial") or 0)
                            explicit_balance = total - initial - current_paid
                        current_balance = max(0, float(explicit_balance or 0))
                        if amount > current_balance:
                            raise ValueError("El abono no puede superar el saldo pendiente")
                        next_balance = max(0, current_balance - amount)
                        updates = []
                        params = []
                        if "valor_pagado" in columns:
                            updates.append("valor_pagado = %s"); params.append(current_paid + amount)
                        if "saldo_pendiente" in columns:
                            updates.append("saldo_pendiente = %s"); params.append(next_balance)
                        if "saldo" in columns:
                            updates.append("saldo = %s"); params.append(next_balance)
                        if "estado" in columns and next_balance == 0:
                            updates.append("estado = %s"); params.append("PAGADO")
                        if updates:
                            params.append(record_id_value)
                            database.execute(f"UPDATE creditos SET {', '.join(updates)} WHERE id = %s", tuple(params))
                        database.execute("INSERT INTO abonos_creditos (credito_id, fecha, usuario, vendedor, local, valor_abono, saldo_anterior, saldo_nuevo, metodo_pago, observacion, numero_recibo) VALUES (%s, CURRENT_TIMESTAMP, %s, %s, %s, %s, %s, %s, %s, %s, %s)", (record_id_value, str(authenticated_user(self)["username"]), str(authenticated_user(self)["username"]), str(credit.get("local") or ""), amount, current_balance, next_balance, str(payload.get("method") or "Efectivo"), "Abono registrado desde ERP", str(payload.get("receiptNumber") or "")))
                        response = {"ok": True, "id": record_id_value, "balance": next_balance}
                        complete_idempotency(database, self, payload, path, 201, response)
                    self.send_json(201, response)
                    return
                if kind != "apartado" or not record_id_value or amount <= 0:
                    raise ValueError("El abono requiere un apartado y un monto valido")
                with connection() as database:
                    _, cached = claim_idempotency(database, self, payload, path)
                    if cached is not None:
                        self.send_json(200, cached)
                        return
                    apartado = database.execute("SELECT valor_total, valor_pagado, saldo_pendiente, estado, local, numero_recibo FROM apartados WHERE id = %s FOR UPDATE", (record_id_value,)).fetchone()
                    if not apartado:
                        raise ValueError("No se encontro el apartado en PostgreSQL")
                    balance = float(apartado["saldo_pendiente"] or 0)
                    if amount > balance:
                        raise ValueError("El abono no puede superar el saldo pendiente")
                    previous_paid = float(apartado["valor_pagado"] or 0)
                    next_paid = previous_paid + amount
                    next_balance = max(0, balance - amount)
                    database.execute("UPDATE apartados SET valor_pagado = %s, saldo_pendiente = %s, estado = %s, actualizado_en = CURRENT_TIMESTAMP WHERE id = %s", (next_paid, next_balance, "ENTREGADO" if next_balance == 0 else apartado["estado"], record_id_value))
                    next_receipt = payload.get("receiptNumber") or apartado["numero_recibo"]
                    database.execute("INSERT INTO abonos_apartados (apartado_id, fecha, usuario, vendedor, local, valor_abono, saldo_anterior, saldo_nuevo, metodo_pago, observacion, numero_recibo) VALUES (%s, CURRENT_TIMESTAMP, %s, %s, %s, %s, %s, %s, %s, %s, %s)", (record_id_value, str(authenticated_user(self)["username"]), str(authenticated_user(self)["username"]), apartado["local"], amount, balance, next_balance, str(payload.get("method") or "Efectivo"), "Abono registrado desde ERP", next_receipt))
                    response = {"ok": True, "id": record_id_value, "balance": next_balance}
                    complete_idempotency(database, self, payload, path, 201, response)
                self.send_json(201, response)
                return
            if path == "/api/shared-apartado":
                record_id_value = str(payload.get("id", "")).strip()
                if not record_id_value:
                    raise ValueError("El apartado requiere un identificador")
                with connection() as database:
                    apartado = database.execute("SELECT id FROM apartados WHERE id = %s FOR UPDATE", (record_id_value,)).fetchone()
                    if not apartado:
                        raise ValueError("No se encontro el apartado en PostgreSQL")
                    database.execute("UPDATE apartados SET cliente_nombre = %s, cliente = %s, cliente_telefono = %s, telefono = %s, direccion = %s, estado = %s, actualizado_en = CURRENT_TIMESTAMP WHERE id = %s", (str(payload.get("customer") or "").strip(), str(payload.get("customer") or "").strip(), str(payload.get("phone") or "").strip(), str(payload.get("phone") or "").strip(), str(payload.get("address") or "").strip(), str(payload.get("status") or "PENDIENTE").strip(), record_id_value))
                self.send_json(200, {"ok": True, "id": record_id_value})
                return
            if path.startswith("/api/domain/"):
                collection = unquote(path.removeprefix("/api/domain/")).strip("/")
                if collection not in DOMAIN_COLLECTIONS:
                    self.send_json(404, {"error": "Coleccion no disponible"})
                    return
                identifier = record_id(payload)
                serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                with connection() as database:
                    database.execute("INSERT OR IGNORE INTO tenants (id, name, slug) VALUES (?, ?, ?)", (tenant_id(self, payload), "Nueva empresa", tenant_id(self, payload)))
                    current_tenant = tenant_id(self, payload)
                    _, cached = claim_idempotency(database, self, payload, path)
                    if cached is not None:
                        self.send_json(200, cached)
                        return
                    status = str(payload.get("status", "")).upper()
                    previous = database.execute("SELECT data_json, version FROM domain_records WHERE tenant_id = ? AND collection = ? AND id = ? FOR UPDATE", (current_tenant, collection, identifier)).fetchone()
                    previous_status = str(json.loads(previous[0]).get("status", "")).upper() if previous else ""
                    expected_version = payload.get("_version", payload.get("version"))
                    if previous and expected_version is not None and int(expected_version) != int(previous[1]):
                        raise ValueError("El registro cambio mientras lo editabas. Recarga la informacion e intenta nuevamente.")
                    product_id = str(payload.get("productId", "")).strip()
                    store_id = str(payload.get("storeId", "")).strip()
                    quantity = float(payload.get("quantity", 0) or 0)
                    processed_statuses = {"PROCESADA", "RECIBIDA", "APROBADA"}
                    if collection in {"returns", "supplierReturns", "damaged-stock"} and status in processed_statuses and previous_status not in processed_statuses:
                        if not product_id or not store_id or quantity <= 0 or not __import__("math").isfinite(quantity):
                            raise ValueError("La operacion requiere producto, local y cantidad valida")
                        if not database.execute("SELECT 1 FROM products WHERE id = ? AND tenant_id = ?", (product_id, current_tenant)).fetchone() or not database.execute("SELECT 1 FROM stores WHERE id = ? AND tenant_id = ?", (store_id, current_tenant)).fetchone():
                            raise ValueError("El producto o local no pertenece a la empresa")
                        database.execute("INSERT OR IGNORE INTO inventory (tenant_id, product_id, store_id) VALUES (?, ?, ?)", (current_tenant, product_id, store_id))
                        signed_quantity = quantity if collection == "returns" else -quantity
                        row = database.execute("SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND store_id = ? FOR UPDATE", (current_tenant, product_id, store_id)).fetchone()
                        next_quantity = float(row[0]) + signed_quantity
                        if next_quantity < 0:
                            raise ValueError("El stock no puede quedar negativo")
                        database.execute("UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (next_quantity, current_tenant, product_id, store_id))
                        movement_type = "DEVOLUCION_CLIENTE" if collection == "returns" else "DEVOLUCION_PROVEEDOR" if collection == "supplierReturns" else "MERCANCIA_DANADA"
                        database.execute("INSERT INTO inventory_movements (id, tenant_id, product_id, store_id, movement_type, quantity, reference_id, note, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (f"{identifier}-{product_id}", current_tenant, product_id, store_id, movement_type, signed_quantity, identifier, str(payload.get("description", "")), authenticated_user(self)["id"]))
                        if collection == "supplierReturns":
                            return_amount = float(payload.get("amount") or payload.get("total") or payload.get("value") or 0)
                            purchase_id = str(payload.get("purchaseId") or "").strip()
                            account_id = str(payload.get("accountPayableId") or "").strip()
                            accounts = database.execute("SELECT collection, id, data_json FROM domain_records WHERE tenant_id = ? AND collection IN ('accountsPayable', 'accounts-payable') FOR UPDATE", (current_tenant,)).fetchall()
                            account = next((item for item in accounts if (account_id and str(item[1]) == account_id) or (purchase_id and str(json.loads(item[2]).get("purchaseId")) == purchase_id)), None)
                            if account and return_amount > 0:
                                account_data = json.loads(account[2])
                                total_amount = max(0, float(account_data.get("totalAmount", account_data.get("total", 0)) or 0) - return_amount)
                                paid_amount = float(account_data.get("paidAmount", account_data.get("paid", 0)) or 0)
                                account_data["totalAmount"] = total_amount
                                account_data["balance"] = max(0, total_amount - paid_amount)
                                account_data["status"] = "PAGADA" if account_data["balance"] == 0 else "PARCIAL" if paid_amount > 0 else "PENDIENTE"
                                database.execute("UPDATE domain_records SET data_json = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND collection = ? AND id = ?", (json.dumps(account_data, ensure_ascii=False, separators=(",", ":")), current_tenant, account[0], account[1]))
                    if collection == "reservations" and product_id and store_id and quantity > 0:
                        if status in {"ACTIVA", "ABIERTA", "REGISTRADA"} and previous_status not in {"ACTIVA", "ABIERTA", "REGISTRADA"}:
                            database.execute("INSERT OR IGNORE INTO inventory (tenant_id, product_id, store_id) VALUES (?, ?, ?)", (current_tenant, product_id, store_id))
                            row = database.execute("SELECT quantity, reserved_quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (current_tenant, product_id, store_id)).fetchone()
                            if not row or float(row[0]) - float(row[1]) < quantity:
                                raise ValueError("Stock disponible insuficiente para reservar")
                            database.execute("UPDATE inventory SET reserved_quantity = reserved_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (quantity, current_tenant, product_id, store_id))
                    if collection == "cash-movements":
                        session_id = str(payload.get("cashSessionId", "")).strip()
                        amount = float(payload.get("amount", 0) or 0)
                        if not session_id or amount <= 0 or not __import__("math").isfinite(amount):
                            raise ValueError("El movimiento de caja requiere sesion y valor valido")
                        session = database.execute("SELECT data_json FROM domain_records WHERE tenant_id = ? AND collection = 'cash-sessions' AND id = ?", (current_tenant, session_id)).fetchone()
                        if not session or str(json.loads(session[0]).get("status", "")).upper() not in {"ABIERTA", "ABIERTO"}:
                            raise ValueError("La caja no esta abierta")
                    if collection == "cash-sessions" and status in {"CERRADA", "CERRADO"} and previous_status not in {"CERRADA", "CERRADO"}:
                        if not payload.get("closingAmount") and payload.get("closingAmount") != 0:
                            raise ValueError("El cierre de caja requiere valor de cierre")
                    database.execute("INSERT INTO domain_records (tenant_id, collection, id, data_json, version) VALUES (?, ?, ?, ?, 1) ON CONFLICT(tenant_id, collection, id) DO UPDATE SET data_json = excluded.data_json, version = domain_records.version + 1, updated_at = CURRENT_TIMESTAMP", (tenant_id(self, payload), collection, identifier, serialized))
                    database.execute("INSERT INTO audit_events (user_id, action, collection, record_id, data_json) VALUES (?, ?, ?, ?, ?)", (payload.get("userId"), "UPSERT", collection, identifier, serialized))
                    response = {"ok": True, "item": payload}
                    complete_idempotency(database, self, payload, path, 201, response)
                self.send_json(201, response)
                return
            if path == "/api/restore":
                backup = payload.get("backup")
                if not isinstance(backup, dict) or not isinstance(backup.get("domainRecords", []), list):
                    raise ValueError("Respaldo invalido")
                with connection() as database:
                    database.execute("DELETE FROM domain_records WHERE tenant_id = ?", (tenant_id(self, payload),))
                    if isinstance(backup.get("state"), dict):
                        database.execute("INSERT INTO tenant_states (tenant_id, state_json) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP", (tenant_id(self, payload), json.dumps(backup["state"], ensure_ascii=False)))
                    for item in backup["domainRecords"]:
                        database.execute("INSERT INTO domain_records (tenant_id, collection, id, data_json) VALUES (?, ?, ?, ?)", (tenant_id(self, payload), item["collection"], item["id"], json.dumps(item["data"], ensure_ascii=False)))
                self.send_json(200, {"ok": True})
                return
            self.send_json(404, {"error": "Ruta no encontrada"})
            return
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": f"No se pudo guardar el estado: {error}"})

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if not authenticated_user(self):
            self.send_json(401, {"error": "Autenticacion requerida"})
            return
        if not requested_tenant_allowed(self):
            self.send_json(403, {"error": "Empresa no autorizada"})
            return
        if not can_access(self, path, "DELETE"):
            self.send_json(403, {"error": "Permiso insuficiente"})
            return
        if path.startswith("/api/catalog/store/"):
            user = authenticated_user(self)
            if user["role"] != "ADMINISTRADOR":
                self.send_json(403, {"error": "Solo el administrador puede eliminar locales"})
                return
            identifier = unquote(path.removeprefix("/api/catalog/store/")).strip()
            current_tenant = tenant_id(self)
            with connection() as database:
                exists = database.execute("SELECT 1 FROM stores WHERE tenant_id = ? AND id = ?", (current_tenant, identifier)).fetchone()
                if not exists:
                    self.send_json(404, {"error": "Local no encontrado"})
                    return
                linked = any(database.execute(query, (current_tenant, identifier)).fetchone() for query in (
                    "SELECT 1 FROM inventory WHERE tenant_id = ? AND store_id = ? LIMIT 1",
                    "SELECT 1 FROM sales WHERE tenant_id = ? AND store_id = ? LIMIT 1",
                ))
                if linked:
                    self.send_json(409, {"error": "No se puede eliminar un local con inventario o ventas relacionadas. Desactivalo en su lugar."})
                    return
                database.execute("DELETE FROM stores WHERE tenant_id = ? AND id = ?", (current_tenant, identifier))
                database.execute("INSERT INTO audit_events (user_id, action, collection, record_id, data_json) VALUES (?, ?, ?, ?, ?)", (user["id"], "DELETE", "stores", identifier, "{}"))
            self.send_json(200, {"ok": True, "deleted": True})
            return
        if path.startswith("/api/catalog/sale/"):
            user = authenticated_user(self)
            if user["role"] != "ADMINISTRADOR":
                self.send_json(403, {"error": "Solo el administrador puede eliminar ventas"})
                return
            identifier = unquote(path.removeprefix("/api/catalog/sale/")).strip()
            with connection() as database:
                sale = database.execute("SELECT store_id FROM sales WHERE tenant_id = ? AND id = ?", (tenant_id(self), identifier)).fetchone()
                if not sale:
                    self.send_json(404, {"error": "Venta no encontrada"})
                    return
                items = database.execute("SELECT product_id, quantity FROM sale_items WHERE sale_id = ?", (identifier,)).fetchall()
                for item in items:
                    database.execute("UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (float(item[1]), tenant_id(self), item[0], sale[0]))
                    database.execute("INSERT INTO inventory_movements (id, tenant_id, product_id, store_id, movement_type, quantity, reference_id, user_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (f"REV-{identifier}-{item[0]}", tenant_id(self), item[0], sale[0], "ANULACION_VENTA", float(item[1]), identifier, user["id"], "Reversion por eliminacion de venta"))
                database.execute("DELETE FROM sale_items WHERE sale_id = ?", (identifier,))
                database.execute("DELETE FROM sales WHERE tenant_id = ? AND id = ?", (tenant_id(self), identifier))
                database.execute("INSERT INTO audit_events (user_id, action, collection, record_id, data_json) VALUES (?, ?, ?, ?, ?)", (user["id"], "DELETE", "sales", identifier, "{}"))
            self.send_json(200, {"ok": True, "deleted": True})
            return
        if path.startswith("/api/shared-entry/"):
            user = authenticated_user(self)
            if user["role"] != "ADMINISTRADOR":
                self.send_json(403, {"error": "Solo el administrador puede eliminar entradas"})
                return
            identifier = unquote(path.removeprefix("/api/shared-entry/")).strip()
            if not identifier:
                self.send_json(400, {"error": "Entrada invalida"})
                return
            if not _postgres_enabled():
                with connection() as database:
                    row = database.execute("SELECT state_json FROM tenant_states WHERE tenant_id = ?", (tenant_id(self),)).fetchone()
                    if not row:
                        self.send_json(404, {"error": "Entrada no encontrada"})
                        return
                    state = json.loads(row[0])
                    entries = state.get("entries") or []
                    entry = next((item for item in entries if str(item.get("id")) == identifier), None)
                    if not entry:
                        self.send_json(404, {"error": "Entrada no encontrada"})
                        return
                    store_id = str(entry.get("storeId") or entry.get("local_id") or entry.get("local") or "")
                    inventory = state.get("inventoryByStore") or state.get("inventory") or []
                    for line in entry.get("items") or []:
                        product_id = str(line.get("productId") or line.get("codigo") or "")
                        quantity = float(line.get("quantity") or line.get("cantidad") or 0)
                        stock = next((item for item in inventory if str(item.get("productId") or item.get("product_id") or item.get("codigo")) == product_id and str(item.get("storeId") or item.get("store_id") or item.get("local")) == store_id), None)
                        if stock and float(stock.get("quantity") or stock.get("cantidad") or 0) < quantity:
                            raise ValueError("No se puede eliminar la entrada porque el stock actual es menor que la cantidad registrada")
                    for line in entry.get("items") or []:
                        product_id = str(line.get("productId") or line.get("codigo") or "")
                        quantity = float(line.get("quantity") or line.get("cantidad") or 0)
                        stock = next((item for item in inventory if str(item.get("productId") or item.get("product_id") or item.get("codigo")) == product_id and str(item.get("storeId") or item.get("store_id") or item.get("local")) == store_id), None)
                        if stock:
                            if "quantity" in stock:
                                stock["quantity"] = float(stock.get("quantity") or 0) - quantity
                            elif "cantidad" in stock:
                                stock["cantidad"] = float(stock.get("cantidad") or 0) - quantity
                    state["entries"] = [item for item in entries if str(item.get("id")) != identifier]
                    serialized = json.dumps(state, ensure_ascii=False)
                    database.execute("UPDATE tenant_states SET state_json = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?", (serialized, tenant_id(self)))
                self.send_json(200, {"ok": True, "deleted": True})
                return
            with connection() as database:
                movement = database.execute("SELECT id, local_origen, tipo FROM movimientos WHERE id = %s FOR UPDATE", (identifier,)).fetchone()
                if not movement or str(movement["tipo"] or "").upper() != "ENTRADA":
                    self.send_json(404, {"error": "Entrada no encontrada"})
                    return
                lines = database.execute("SELECT codigo, cantidad FROM movimiento_productos WHERE movimiento_id = %s", (identifier,)).fetchall()
                for line in lines:
                    stock = database.execute("SELECT cantidad FROM inventarios WHERE local = %s AND codigo = %s FOR UPDATE", (movement["local_origen"], line["codigo"])).fetchone()
                    if not stock or float(stock["cantidad"] or 0) < float(line["cantidad"] or 0):
                        raise ValueError("No se puede eliminar la entrada porque el stock actual es menor que la cantidad registrada")
                for line in lines:
                    database.execute("UPDATE inventarios SET cantidad = cantidad - %s, actualizado = CURRENT_TIMESTAMP WHERE local = %s AND codigo = %s", (line["cantidad"], movement["local_origen"], line["codigo"]))
                database.execute("DELETE FROM movimiento_productos WHERE movimiento_id = %s", (identifier,))
                database.execute("DELETE FROM movimientos WHERE id = %s", (identifier,))
            self.send_json(200, {"ok": True, "deleted": True})
            return
        if path.startswith("/api/catalog/store/"):
            user = authenticated_user(self)
            if user["role"] != "ADMINISTRADOR":
                self.send_json(403, {"error": "Solo el administrador puede eliminar locales"})
                return
            identifier = unquote(path.removeprefix("/api/catalog/store/")).strip()
            current_tenant = tenant_id(self)
            with connection() as database:
                exists = database.execute("SELECT 1 FROM stores WHERE tenant_id = ? AND id = ?", (current_tenant, identifier)).fetchone()
                if not exists:
                    self.send_json(404, {"error": "Local no encontrado"})
                    return
                linked = any(database.execute(query, (current_tenant, identifier)).fetchone() for query in (
                    "SELECT 1 FROM inventory WHERE tenant_id = ? AND store_id = ? LIMIT 1",
                    "SELECT 1 FROM sales WHERE tenant_id = ? AND store_id = ? LIMIT 1",
                ))
                if linked:
                    self.send_json(409, {"error": "No se puede eliminar un local con inventario o ventas relacionadas. Desactivalo en su lugar."})
                    return
                database.execute("DELETE FROM stores WHERE tenant_id = ? AND id = ?", (current_tenant, identifier))
                database.execute("INSERT INTO audit_events (user_id, action, collection, record_id, data_json) VALUES (?, ?, ?, ?, ?)", (user["id"], "DELETE", "stores", identifier, "{}"))
            self.send_json(200, {"ok": True, "deleted": True})
            return
        if path.startswith("/api/catalog/product/"):
            identifier = unquote(path.removeprefix("/api/catalog/product/")).strip()
            if not identifier:
                self.send_json(400, {"error": "Producto invalido"})
                return
            with connection() as database:
                existing = database.execute("SELECT id FROM products WHERE tenant_id = ? AND id = ?", (tenant_id(self), identifier)).fetchone()
                if not existing:
                    self.send_json(404, {"error": "Producto no encontrado"})
                    return
                database.execute("DELETE FROM inventory WHERE tenant_id = ? AND product_id = ?", (tenant_id(self), identifier))
                database.execute("DELETE FROM products WHERE tenant_id = ? AND id = ?", (tenant_id(self), identifier))
                database.execute("INSERT INTO audit_events (action, collection, record_id, data_json) VALUES (?, ?, ?, ?)", ("DELETE", "products", identifier, "{}"))
            self.send_json(200, {"ok": True, "deleted": True})
            return
        if not path.startswith("/api/domain/"):
            self.send_json(404, {"error": "Ruta no encontrada"})
            return
        if authenticated_user(self)["role"] != "ADMINISTRADOR":
            self.send_json(403, {"error": "Solo el administrador puede eliminar movimientos"})
            return
        parts = path.removeprefix("/api/domain/").strip("/").split("/", 1)
        collection = unquote(parts[0])
        identifier = unquote(parts[1]) if len(parts) == 2 else ""
        if collection not in DOMAIN_COLLECTIONS or not identifier:
            self.send_json(400, {"error": "Coleccion o id invalido"})
            return
        with connection() as database:
            deleted = database.execute("DELETE FROM domain_records WHERE tenant_id = ? AND collection = ? AND id = ?", (tenant_id(self), collection, identifier)).rowcount
            database.execute("INSERT INTO audit_events (action, collection, record_id, data_json) VALUES (?, ?, ?, ?)", ("DELETE", collection, identifier, "{}"))
        self.send_json(200, {"ok": True, "deleted": bool(deleted)})

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        try:
            payload = request_json(self)
            if not authenticated_user(self):
                self.send_json(401, {"error": "Autenticacion requerida"})
                return
            if not requested_tenant_allowed(self, payload):
                self.send_json(403, {"error": "Empresa no autorizada"})
                return
            if not can_access(self, path, "PUT"):
                self.send_json(403, {"error": "Permiso insuficiente"})
                return
            if path == "/api/users":
                current_user = authenticated_user(self)
                if current_user["role"] != "ADMINISTRADOR":
                    self.send_json(403, {"error": "Solo el administrador puede editar usuarios"})
                    return
                identifier = record_id(payload)
                username = str(payload.get("username", "")).strip()
                role = str(payload.get("role", "VENDEDOR")).strip().upper()
                password = str(payload.get("password", ""))
                active = 0 if payload.get("active") is False else 1
                valid_roles = {"ADMINISTRADOR", "GERENTE", "CONTADOR", "SUPERVISOR", "BODEGA", "CAJERO", "VENDEDOR"}
                if len(username) < 3 or role not in valid_roles:
                    raise ValueError("Usuario o rol no valido")
                if password and len(password) < 8:
                    raise ValueError("La clave debe tener al menos 8 caracteres")
                with connection() as database:
                    existing = database.execute("SELECT id FROM auth_users WHERE id = ? AND tenant_id = ?", (identifier, tenant_id(self, payload))).fetchone()
                    if not existing:
                        self.send_json(404, {"error": "Usuario no encontrado"})
                        return
                    if password:
                        database.execute("UPDATE auth_users SET username = ?, email = ?, phone = ?, role = ?, store_id = ?, active = ?, password_hash = ? WHERE id = ? AND tenant_id = ?", (username, str(payload.get("email", "")).strip(), str(payload.get("phone", "")).strip(), role, payload.get("storeId"), active, password_hash(password), identifier, tenant_id(self, payload)))
                    else:
                        database.execute("UPDATE auth_users SET username = ?, email = ?, phone = ?, role = ?, store_id = ?, active = ? WHERE id = ? AND tenant_id = ?", (username, str(payload.get("email", "")).strip(), str(payload.get("phone", "")).strip(), role, payload.get("storeId"), active, identifier, tenant_id(self, payload)))
                    if not active:
                        database.execute("DELETE FROM auth_tokens WHERE user_id = ?", (identifier,))
                self.send_json(200, {"ok": True, "id": identifier})
                return
            if path == "/api/shared-entry":
                user = authenticated_user(self)
                if user["role"] != "ADMINISTRADOR":
                    self.send_json(403, {"error": "Solo el administrador puede editar entradas"})
                    return
                identifier = record_id(payload)
                if not _postgres_enabled():
                    with connection() as database:
                        row = database.execute("SELECT state_json FROM tenant_states WHERE tenant_id = ?", (tenant_id(self),)).fetchone()
                        state = json.loads(row[0]) if row else {}
                        entries = state.get("entries") or []
                        entry = next((item for item in entries if str(item.get("id")) == identifier), None)
                        if not entry:
                            self.send_json(404, {"error": "Entrada no encontrada"})
                            return
                        entry.update({key: payload[key] for key in ("estado", "local", "supplier_name", "vendedor", "factura", "referencia", "observacion") if key in payload})
                        database.execute("UPDATE tenant_states SET state_json = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?", (json.dumps(state, ensure_ascii=False), tenant_id(self)))
                    self.send_json(200, {"ok": True, "id": identifier, "updated": True})
                    return
                with connection() as database:
                    movement = database.execute("SELECT id, tipo FROM movimientos WHERE id = %s FOR UPDATE", (identifier,)).fetchone()
                    if not movement or str(movement["tipo"] or "").upper() != "ENTRADA":
                        self.send_json(404, {"error": "Entrada no encontrada"})
                        return
                    updated = database.execute(
                        "UPDATE movimientos SET estado = %s, local_origen = %s, empleado = %s, vendedor = %s, factura = %s, referencia = %s, observacion = %s WHERE id = %s",
                        (str(payload.get("estado") or payload.get("status") or "COMPLETADO"), str(payload.get("local") or payload.get("local_origen") or ""), str(payload.get("supplier_name") or payload.get("supplierName") or payload.get("empleado") or ""), str(payload.get("vendedor") or ""), str(payload.get("factura") or payload.get("supplierInvoice") or ""), str(payload.get("referencia") or ""), str(payload.get("observacion") or payload.get("notes") or ""), identifier),
                    ).rowcount
                self.send_json(200, {"ok": True, "id": identifier, "updated": bool(updated)})
                return
            if path == "/api/catalog/sale":
                current_user = authenticated_user(self)
                if current_user["role"] != "ADMINISTRADOR":
                    self.send_json(403, {"error": "Solo el administrador puede editar ventas"})
                    return
                identifier = record_id(payload)
                items = payload.get("items", [])
                if isinstance(items, str):
                    items = json.loads(items)
                if _postgres_enabled():
                    with connection() as database:
                        updated = database.execute(
                            "UPDATE movimientos SET cliente = %s, metodo_pago = %s WHERE id = %s AND UPPER(COALESCE(tipo, '')) = 'VENTA'",
                            (payload.get("customerId") or payload.get("cliente") or "", str(payload.get("paymentMethod") or payload.get("metodo_pago") or ""), identifier),
                        ).rowcount
                    if not updated:
                        self.send_json(404, {"error": "Venta no encontrada"})
                        return
                    self.send_json(200, {"ok": True, "id": identifier})
                    return
                with connection() as database:
                    sale = database.execute("SELECT store_id, total FROM sales WHERE id = ? AND tenant_id = ?", (identifier, tenant_id(self, payload))).fetchone()
                    if not sale:
                        self.send_json(404, {"error": "Venta no encontrada"})
                        return
                    if items:
                        old_items = database.execute("SELECT product_id, quantity FROM sale_items WHERE sale_id = ?", (identifier,)).fetchall()
                        for item in old_items:
                            database.execute("UPDATE inventory SET quantity = quantity + ? WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (float(item[1]), tenant_id(self, payload), item[0], sale[0]))
                        total = float(payload.get("transport", 0) or 0)
                        database.execute("DELETE FROM sale_items WHERE sale_id = ?", (identifier,))
                        for item in items:
                            product_id, quantity, price = str(item.get("productId", "")).strip(), float(item.get("quantity", 0)), float(item.get("unitPrice", item.get("price", 0)))
                            if not product_id or quantity <= 0 or price < 0:
                                raise ValueError("Producto, cantidad y precio invalidos")
                            stock = database.execute("SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (tenant_id(self, payload), product_id, sale[0])).fetchone()
                            if not stock or float(stock[0]) < quantity:
                                raise ValueError("Stock insuficiente para la venta editada")
                            database.execute("INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax_rate) VALUES (?, ?, ?, ?, ?)", (identifier, product_id, quantity, price, float(item.get("taxRate", 0))))
                            database.execute("UPDATE inventory SET quantity = quantity - ? WHERE tenant_id = ? AND product_id = ? AND store_id = ?", (quantity, tenant_id(self, payload), product_id, sale[0]))
                            total += quantity * price
                        updated = database.execute("UPDATE sales SET customer_id = ?, invoice_number = ?, payment_method = ?, total = ? WHERE id = ? AND tenant_id = ?", (payload.get("customerId"), str(payload.get("invoiceNumber", "")), str(payload.get("paymentMethod", "")), total, identifier, tenant_id(self, payload))).rowcount
                    else:
                        updated = database.execute("UPDATE sales SET customer_id = ?, invoice_number = ?, payment_method = ? WHERE id = ? AND tenant_id = ?", (payload.get("customerId"), str(payload.get("invoiceNumber", "")), str(payload.get("paymentMethod", "")), identifier, tenant_id(self, payload))).rowcount
                    if not updated:
                        self.send_json(404, {"error": "Venta no encontrada"})
                        return
                    database.execute("INSERT INTO audit_events (user_id, action, collection, record_id, data_json) VALUES (?, ?, ?, ?, ?)", (current_user["id"], "UPDATE", "sales", identifier, json.dumps(payload, ensure_ascii=False)))
                self.send_json(200, {"ok": True, "id": identifier})
                return
            if path not in {"/api/catalog/product", "/api/catalog/store"}:
                self.send_json(404, {"error": "Ruta no encontrada"})
                return

            current_tenant = tenant_id(self, payload)
            identifier = record_id(payload)
            with connection() as database:
                if path.endswith("/product"):
                    name = str(payload.get("name", "")).strip()
                    code = str(payload.get("code", "")).strip()
                    if not name or not code:
                        raise ValueError("El producto requiere codigo y nombre")
                    updated = database.execute(
                        "UPDATE products SET code = ?, name = ?, reference = ?, barcode = ?, category = ?, cost = ?, sale_price = ?, tax_rate = ?, active = ? WHERE id = ? AND tenant_id = ?",
                        (code, name, str(payload.get("reference", "")), str(payload.get("barcode", "")), str(payload.get("category", "")), float(payload.get("cost", 0)), float(payload.get("salePrice", 0)), float(payload.get("taxRate", 0)), 0 if payload.get("active") is False else 1, identifier, current_tenant),
                    ).rowcount
                else:
                    name = str(payload.get("name", "")).strip()
                    code = str(payload.get("code", "")).strip()
                    if not name or not code:
                        raise ValueError("El local requiere codigo y nombre")
                    updated = database.execute(
                        "UPDATE stores SET code = ?, name = ?, address = ?, phone = ?, active = ? WHERE id = ? AND tenant_id = ?",
                        (code, name, str(payload.get("address", "")), str(payload.get("phone", "")), 0 if payload.get("active") is False or payload.get("status") == "Inactivo" else 1, identifier, current_tenant),
                    ).rowcount
            if not updated:
                self.send_json(404, {"error": "Registro no encontrado"})
                return
            self.send_json(200, {"ok": True, "id": identifier})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": f"No se pudo actualizar el registro: {error}"})

    def log_message(self, format: str, *args) -> None:
        if self.path.startswith("/api/"):
            super().log_message(format, *args)


if __name__ == "__main__":
    with connection():
        print(f"PostgreSQL verificado: {POSTGRES_CONFIG['host']}:{POSTGRES_CONFIG['port']}/{POSTGRES_CONFIG['dbname']}")
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"FAMIMUEBLES ERP: http://{HOST}:{PORT}")
    print(f"Base de datos: PostgreSQL {POSTGRES_CONFIG['host']}:{POSTGRES_CONFIG['port']}/{POSTGRES_CONFIG['dbname']}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido")
    finally:
        server.server_close()
