from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "famimuebles.sqlite3"
DEFAULT_TENANT = "tenant-default"


def empty_state() -> dict:
    collections = [
        "products", "customers", "sales", "credits", "installments", "payments",
        "apartados", "stores", "inventory", "inventoryByStore", "transfers", "users",
        "roles", "paymentMethods", "expenses", "fuelRecords", "auditLog", "suppliers",
        "purchases", "accountsPayable", "supplierPayments", "customerAccounts", "returns",
        "supplierReturns", "stockCounts", "reservations", "warranties", "damagedStock",
        "cashSessions", "cashMovements", "bankAccounts", "quotes", "orders", "deliveries",
        "creditNotes", "companySettings", "permissionMatrix", "notifications",
    ]
    return {key: [] for key in collections} | {"demoMode": False}


def reset_database(tenant: str) -> Path:
    if not DATABASE.exists():
        raise SystemExit(f"No existe la base de datos: {DATABASE}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = DATABASE.with_name(f"{DATABASE.stem}_respaldo_{timestamp}{DATABASE.suffix}")
    shutil.copy2(DATABASE, backup)

    with sqlite3.connect(DATABASE) as database:
        database.execute("CREATE TABLE IF NOT EXISTS tenant_states (tenant_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        database.execute("CREATE TABLE IF NOT EXISTS domain_records (tenant_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (tenant_id, collection, id))")
        serialized = json.dumps(empty_state(), ensure_ascii=False, separators=(",", ":"))
        database.execute("INSERT INTO tenant_states (tenant_id, state_json) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP", (tenant, serialized))
        database.execute("DELETE FROM domain_records WHERE tenant_id = ?", (tenant,))
        if tenant == DEFAULT_TENANT:
            database.execute("INSERT INTO app_state (id, state_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP", (serialized,))
            database.execute("DELETE FROM sqlite_sequence WHERE name = 'audit_events'")
            database.execute("DELETE FROM sale_items")
            database.execute("DELETE FROM inventory_movements WHERE tenant_id = ?", (tenant,))
            database.execute("DELETE FROM sales WHERE tenant_id = ?", (tenant,))
            database.execute("DELETE FROM inventory WHERE tenant_id = ?", (tenant,))
            database.execute("DELETE FROM products WHERE tenant_id = ?", (tenant,))
            database.execute("DELETE FROM stores WHERE tenant_id = ?", (tenant,))
            database.execute("DELETE FROM audit_events WHERE user_id IN (SELECT id FROM auth_users WHERE tenant_id = ?)", (tenant,))
            for table in database.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'import_%'").fetchall():
                database.execute(f'DROP TABLE "{table[0].replace(chr(34), chr(34) * 2)}"')
        database.commit()

    return backup


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Respalda y elimina todos los datos operativos de FAMIMUEBLES."
    )
    parser.add_argument(
        "--confirmar",
        action="store_true",
        help="confirma el vaciado irreversible de la base original",
    )
    parser.add_argument("--tenant", default=DEFAULT_TENANT, help="empresa que se limpiara")
    args = parser.parse_args()
    if not args.confirmar:
        raise SystemExit(
            "No se realizo ningun cambio. Ejecuta con --confirmar para respaldar y vaciar la base."
        )

    backup = reset_database(args.tenant)
    print(json.dumps({"ok": True, "tenant": args.tenant, "backup": str(backup), "database": str(DATABASE)}))


if __name__ == "__main__":
    main()
