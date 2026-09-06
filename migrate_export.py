from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "exportacion_datos_famimuebles.txt"
DATABASE = ROOT / "famimuebles.sqlite3"


def clean(value: str) -> str:
    return value.strip()


def number(value: Any, default: float = 0) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def integer(value: Any, default: int = 0) -> int:
    return int(number(value, default))


def key(value: Any) -> str:
    return re.sub(r"\s+", " ", clean(str(value or ""))).upper()


def store_key(value: Any) -> str:
    return re.sub(r"^(INV|NV)\s+", "", key(str(value).replace("_", " ").replace("-", " ")))


def slug(value: str) -> str:
    result = re.sub(r"[^a-zA-Z0-9_]+", "_", value.lower()).strip("_")
    return result or "tabla"


def sections(text: str) -> dict[str, list[dict[str, str]]]:
    lines = text.splitlines()
    result: dict[str, list[dict[str, str]]] = {}
    index = 0
    while index < len(lines):
        match = re.match(r"TABLA: POSTGRESQL / (.+)$", lines[index])
        if not match:
            index += 1
            continue
        table_name = match.group(1).strip()
        index += 1
        while index < len(lines) and not lines[index].startswith("REGISTROS:"):
            index += 1
        index += 1
        while index < len(lines) and not lines[index].strip().startswith("id |") and " | " not in lines[index]:
            index += 1
        if index >= len(lines):
            continue
        header_parts = [lines[index].strip()]
        index += 1
        while index < len(lines) and not set(lines[index].strip()) <= {"-"}:
            header_parts.append(lines[index].strip())
            index += 1
        headers = [clean(part) for part in "".join(header_parts).split("|")]
        while index < len(lines) and set(lines[index].strip()) <= {"-"}:
            index += 1
        rows: list[dict[str, str]] = []
        if table_name in {"movimientos", "movimiento_productos"}:
            records: list[str] = []
            for line in lines[index:]:
                if line.startswith("TABLA:"):
                    break
                if re.match(r"^\d+\s+\|", line):
                    records.append(line.strip())
                elif records and line.strip():
                    records[-1] += line.strip()
            for record in records:
                values = [clean(item) for item in record.split("|")]
                values.extend([""] * max(0, len(headers) - len(values)))
                rows.append(dict(zip(headers, values[:len(headers)])))
            result[table_name] = rows
            continue
        buffer = ""
        while index < len(lines) and not lines[index].startswith("TABLA:"):
            line = lines[index]
            index += 1
            if not line.strip():
                continue
            buffer += line.strip()
            if buffer.count("|") >= len(headers) - 1:
                values = [clean(item) for item in buffer.split("|")]
                if len(values) >= len(headers):
                    rows.append(dict(zip(headers, values[:len(headers)])))
                    buffer = "|".join(values[len(headers):]).strip("|")
        result[table_name] = rows
    return result


def row_value(row: dict[str, str], *names: str) -> str:
    for name in names:
        if name in row:
            return row[name]
    return ""


def id_for(prefix: str, value: Any) -> str:
    return f"{prefix}-{integer(value):05d}"


def import_raw(database: sqlite3.Connection, data: dict[str, list[dict[str, str]]]) -> None:
    for name, rows in data.items():
        table = f"import_{slug(name)}"
        columns = sorted({column for row in rows for column in row}) or ["raw"]
        database.execute(f'DROP TABLE IF EXISTS "{table}"')
        database.execute(f'CREATE TABLE "{table}" ({", ".join(f"\"{slug(column)}\" TEXT" for column in columns)}, raw_json TEXT NOT NULL)')
        for row in rows:
            values = [row.get(column, "") for column in columns]
            database.execute(f'INSERT INTO "{table}" ({", ".join(f"\"{slug(column)}\"" for column in columns)}, raw_json) VALUES ({", ".join("?" for _ in values)}, ?)', (*values, json.dumps(row, ensure_ascii=False)))


def build_state(data: dict[str, list[dict[str, str]]]) -> dict[str, Any]:
    stores: list[dict[str, Any]] = []
    store_by_source_id: dict[str, str] = {}
    store_by_name: dict[str, str] = {}
    for row in data.get("locales", []):
        source_id = row_value(row, "id")
        store_id = id_for("LOC", source_id)
        name = row_value(row, "nombre", "name") or f"Local {source_id}"
        store = {"id": store_id, "sourceId": source_id, "code": name, "sourceCode": source_id, "name": name, "status": "Activo" if key(row_value(row, "activo")) not in {"FALSE", "NO", "0"} else "Inactivo", "createdAt": row_value(row, "creado_en")}
        stores.append(store)
        store_by_source_id[source_id] = store_id
        store_by_name[store_key(name)] = store_id
    for row in data.get("inventarios", []):
        name = row_value(row, "local")
        if store_key(name) not in store_by_name:
            source_id = str(len(stores) + 1)
            store_id = id_for("LOC", source_id)
            store = {"id": store_id, "sourceId": source_id, "code": name, "sourceCode": source_id, "name": name, "status": "Activo", "createdAt": ""}
            stores.append(store)
            store_by_name[store_key(name)] = store_id
            store_by_source_id[source_id] = store_id
    products: list[dict[str, Any]] = []
    product_by_code: dict[str, str] = {}
    catalog_by_name = {
        key(row_value(row, "nombre", "nombre_producto")): row
        for row in data.get("productos_catalogo", [])
        if row_value(row, "nombre", "nombre_producto")
    }
    historical_prices_by_code: dict[str, float] = {}
    for row in [*data.get("ventas_detalles", []), *data.get("movimiento_productos", [])]:
        code = key(row_value(row, "codigo"))
        price = number(row_value(row, "valor_unitario", "precio_unitario"))
        if code and price > 0 and code not in historical_prices_by_code:
            historical_prices_by_code[code] = price
    for row in data.get("productos", []):
        code = row_value(row, "codigo")
        product_id = f"PROD-{code.zfill(5)}"
        cost = number(row_value(row, "precio_compra", "costo"))
        stated_price = number(row_value(row, "precio_venta", "precio"))
        catalog_row = catalog_by_name.get(key(row_value(row, "nombre_producto", "nombre")), {})
        catalog_cost = number(row_value(catalog_row, "precio_compra", "costo"))
        catalog_price = number(row_value(catalog_row, "precio_venta", "precio"))
        if cost <= 0 and catalog_cost > 0:
            cost = catalog_cost
        if stated_price <= 0 and catalog_price > 0:
            stated_price = catalog_price
        if stated_price <= 0:
            stated_price = historical_prices_by_code.get(key(code), 0)
        fallback_price = max(cost * 1.5, 100000.0) if cost > 0 else 700000.0
        sale_price = stated_price if stated_price > 0 else fallback_price
        product = {"id": product_id, "sourceCode": code, "code": code, "reference": code, "name": row_value(row, "nombre_producto", "nombre") or f"Producto {code}", "category": "General", "categoryName": "General", "cost": cost, "price": sale_price, "salePrice": sale_price, "minimumPrice": max(sale_price * 0.8, cost), "minimum": 0, "minStock": 0, "maximum": 0, "maxStock": 0, "active": key(row_value(row, "activo")) not in {"FALSE", "NO", "0"}, "activo": key(row_value(row, "activo")) not in {"FALSE", "NO", "0"}, "estado": "Activo"}
        products.append(product)
        product_by_code[key(code)] = product_id
    inventory: list[dict[str, Any]] = []
    for index, row in enumerate(data.get("inventarios", []), 1):
        product_id = product_by_code.get(key(row_value(row, "codigo")))
        store_id = store_by_name.get(store_key(row_value(row, "local")))
        if not product_id or not store_id:
            continue
        inventory.append({"id": f"INV-{index:05d}", "productId": product_id, "storeId": store_id, "quantity": integer(row_value(row, "cantidad")), "minimumStock": 0, "minimum": 0, "maximumStock": 0, "maximum": 0, "updatedAt": row_value(row, "actualizado")})
    customers = [{"id": id_for("CLI", row_value(row, "id")), "sourceId": row_value(row, "id"), "name": row_value(row, "nombre"), "phone": row_value(row, "telefono"), "document": row_value(row, "documento"), "address": row_value(row, "direccion"), "status": "Activo"} for row in data.get("clientes", [])]
    customer_by_name = {key(row["name"]): row["id"] for row in customers}
    details_by_sale: dict[str, list[dict[str, Any]]] = {}
    for row in data.get("ventas_detalles", []):
        details_by_sale.setdefault(row_value(row, "venta_id"), []).append({"productId": product_by_code.get(key(row_value(row, "codigo")), ""), "name": row_value(row, "producto_nombre"), "quantity": integer(row_value(row, "cantidad")), "price": number(row_value(row, "valor_unitario")), "priceVenta": number(row_value(row, "valor_unitario")), "subtotal": number(row_value(row, "subtotal"))})
    sales = []
    for row in data.get("ventas", []):
        source_id = row_value(row, "id")
        sales.append({"id": id_for("VEN", source_id), "sourceId": source_id, "invoiceId": row_value(row, "numero_factura") or f"FAC-{source_id}", "customerId": customer_by_name.get(key(row_value(row, "cliente_nombre")), ""), "customer": row_value(row, "cliente_nombre") or "Cliente contado", "storeId": store_by_source_id.get(row_value(row, "local_id"), ""), "items": details_by_sale.get(source_id, []), "paymentMethod": row_value(row, "metodo_pago"), "total": number(row_value(row, "total_venta")), "date": row_value(row, "fecha_venta", "creado_en"), "status": "Completada"})
    movement_by_id = {str(row_value(row, "id")).lstrip("0") or "0": row for row in data.get("movimientos", [])}
    movement_items: dict[str, list[dict[str, Any]]] = {}
    for row in data.get("movimiento_productos", []):
        movement_items.setdefault(str(row_value(row, "movimiento_id")).lstrip("0") or "0", []).append({"productId": product_by_code.get(key(row_value(row, "codigo")), ""), "name": row_value(row, "descripcion"), "quantity": integer(row_value(row, "cantidad")), "price": number(row_value(row, "precio_unitario")), "priceVenta": number(row_value(row, "precio_unitario")), "subtotal": number(row_value(row, "precio_total"))})
    known_movement_ids = {str(row.get("sourceMovementId", "")).lstrip("0") for row in sales}
    for movement_id in {str(row_value(row, "movimiento_id")).lstrip("0") or "0" for row in data.get("pagos_detalle", []) if row_value(row, "movimiento_id")}:
        if movement_id in known_movement_ids:
            continue
        movement = movement_by_id.get(movement_id, {})
        payment_rows = [row for row in data.get("pagos_detalle", []) if (str(row_value(row, "movimiento_id")).lstrip("0") or "0") == movement_id]
        items = movement_items.get(movement_id, [])
        total = sum(item["subtotal"] for item in items) or sum(number(row_value(row, "valor")) for row in payment_rows)
        customer = row_value(movement, "telefono") or row_value(movement, "cliente") or "Cliente contado"
        sales.append({"id": f"VEN-MOV-{movement_id}", "sourceId": movement_id, "sourceMovementId": movement_id, "invoiceId": row_value(movement, "referencia", "factura") or f"MOV-{movement_id}", "customerId": customer_by_name.get(key(customer), ""), "customer": customer, "storeId": store_by_name.get(store_key(row_value(payment_rows[0], "local"))) if payment_rows else store_by_name.get(store_key(row_value(movement, "local_origen")), ""), "items": items, "paymentMethod": ", ".join(dict.fromkeys(row_value(row, "metodo_pago") for row in payment_rows if row_value(row, "metodo_pago"))), "total": total, "date": row_value(payment_rows[0], "fecha") if payment_rows else row_value(movement, "fecha"), "status": "Completada"})
    users = [{"id": id_for("USR", row_value(row, "id")), "sourceId": row_value(row, "id"), "telegramId": row_value(row, "telegram_id"), "name": row_value(row, "nombre"), "status": "Activo" if key(row_value(row, "activo")) not in {"FALSE", "NO", "0"} else "Inactivo", "role": "Administrador"} for row in data.get("usuarios", [])]
    users.extend({"id": f"USR-TG-{row_value(row, 'id_telegram')}", "telegramId": row_value(row, "id_telegram"), "name": row_value(row, "nombre"), "role": row_value(row, "rol") or "Vendedor", "status": "Activo" if key(row_value(row, "activo")) not in {"NO", "FALSE", "0"} else "Inactivo"} for row in data.get("empleados", []) if row_value(row, "id_telegram"))
    expenses = [{"id": id_for("GAS", row_value(row, "id")), "date": row_value(row, "fecha"), "storeId": store_by_name.get(store_key(row_value(row, "local")), ""), "category": row_value(row, "categoria"), "description": row_value(row, "detalle"), "amount": number(row_value(row, "valor")), "createdBy": row_value(row, "empleado")} for row in data.get("gastos", [])]
    fuel = [{"id": id_for("FUE", row_value(row, "id")), "date": row_value(row, "fecha"), "vehicle": row_value(row, "carro"), "driver": row_value(row, "conductor"), "amount": number(row_value(row, "valor"))} for row in data.get("gasolina", [])]
    movements = [{"id": id_for("MOV", row_value(row, "id")), "sourceId": row_value(row, "id"), "type": row_value(row, "tipo"), "storeId": store_by_source_id.get(row_value(row, "local_id"), store_by_name.get(store_key(row_value(row, "local_origen")), "")), "quantity": integer(row_value(row, "cantidad")), "reference": row_value(row, "referencia", "factura"), "description": row_value(row, "descripcion"), "createdAt": row_value(row, "fecha", "creado_en")} for row in data.get("movimientos", [])]
    movement_items_by_id = movement_items
    for movement in movements:
        movement["items"] = movement_items_by_id.get(str(movement["sourceId"]).lstrip("0") or "0", [])
        movement["productId"] = movement["items"][0].get("productId", "") if movement["items"] else ""
    transfers = []
    for row in data.get("movimientos", []):
        if key(row_value(row, "tipo")) != "TRASLADO":
            continue
        movement_id = str(row_value(row, "id")).lstrip("0") or "0"
        transfers.append({"id": f"TRS-{movement_id.zfill(5)}", "sourceMovementId": movement_id, "originStoreId": store_by_name.get(store_key(row_value(row, "local_origen")), ""), "destinationStoreId": store_by_name.get(store_key(row_value(row, "local_destino")), ""), "status": "RECIBIDO" if key(row_value(row, "estado")) == "COMPLETADO" else key(row_value(row, "estado")), "createdAt": row_value(row, "fecha", "creado_en"), "createdBy": row_value(row, "empleado", "usuario_id"), "items": movement_items_by_id.get(movement_id, [])})
    apartado_items = {}
    for row in data.get("apartado_detalles", []):
        apartado_items.setdefault(row_value(row, "apartado_id"), []).append({"productId": product_by_code.get(key(row_value(row, "codigo")), ""), "name": row_value(row, "producto", "producto_nombre"), "quantity": integer(row_value(row, "cantidad")), "price": number(row_value(row, "valor_unitario")), "subtotal": number(row_value(row, "subtotal"))})
    apartados = [{"id": id_for("APT", row_value(row, "id")), "sourceId": row_value(row, "id"), "customer": row_value(row, "cliente_nombre", "cliente"), "customerId": customer_by_name.get(key(row_value(row, "cliente_nombre", "cliente")), ""), "storeId": store_by_source_id.get(row_value(row, "local_id"), store_by_name.get(store_key(row_value(row, "local")), "")), "total": number(row_value(row, "valor_total", "total_apartado", "total")), "initial": number(row_value(row, "abono_inicial")), "paid": number(row_value(row, "valor_pagado")), "status": row_value(row, "estado"), "date": row_value(row, "creado_en", "fecha"), "items": apartado_items.get(row_value(row, "id"), [])} for row in data.get("apartados", [])]
    credits = [{"id": id_for("CR", row_value(row, "id")), "sourceId": row_value(row, "id"), "total": number(row_value(row, "saldo_pendiente")), "originalAmount": number(row_value(row, "saldo_pendiente")) + number(row_value(row, "cuota_inicial")), "paid": number(row_value(row, "cuota_inicial")), "customer": "", "status": row_value(row, "estado") or "Pendiente", "date": row_value(row, "creado_en")} for row in data.get("creditos", [])]
    installments = [{"id": id_for("CUO", row_value(row, "id")), "creditId": id_for("CR", row_value(row, "credito_id")), "number": integer(row_value(row, "numero_cuota")), "dueDate": row_value(row, "fecha_vencimiento"), "amount": number(row_value(row, "valor_programado")), "paidAmount": number(row_value(row, "valor_pagado")), "status": row_value(row, "estado")} for row in data.get("cuotas_credito", [])]
    payments = [{"id": id_for("PAY", row_value(row, "id")), "creditId": id_for("CR", row_value(row, "credito_id")), "date": row_value(row, "fecha"), "amount": number(row_value(row, "valor_abono")), "method": row_value(row, "metodo_pago"), "reference": row_value(row, "numero_recibo")} for row in data.get("abonos_creditos", [])]
    payments.extend({"id": f"PAY-MOV-{row_value(row, 'id')}", "saleId": f"VEN-MOV-{str(row_value(row, 'movimiento_id')).lstrip('0') or '0'}", "date": row_value(row, "fecha"), "amount": number(row_value(row, "valor")), "method": row_value(row, "metodo_pago"), "reference": row_value(row, "referencia_id"), "user": row_value(row, "usuario")} for row in data.get("pagos_detalle", []) if row_value(row, "id"))
    audit = [{"id": id_for("AUD", row_value(row, "id")), "type": row_value(row, "accion"), "description": row_value(row, "detalle"), "createdAt": row_value(row, "fecha"), "user": row_value(row, "usuario")} for row in data.get("bitacora", [])]
    audit.extend({"id": f"AUD-MOV-{row_value(row, 'id')}", "type": "MOVIMIENTO", "action": row_value(row, "tipo"), "description": row_value(row, "descripcion", "referencia", "observacion"), "createdAt": row_value(row, "fecha", "creado_en"), "user": row_value(row, "empleado", "vendedor"), "storeId": store_by_source_id.get(row_value(row, "local_id"), store_by_name.get(store_key(row_value(row, "local_origen")), "")), "quantity": integer(row_value(row, "cantidad")), "reference": row_value(row, "referencia", "factura")} for row in data.get("movimientos", []))
    audit.extend({"id": f"AUD-ED-{row_value(row, 'id')}", "type": "EDICION_MOVIMIENTO", "action": row_value(row, "motivo", "campo"), "description": f"{row_value(row, 'producto_anterior')} -> {row_value(row, 'producto_nuevo')} | {row_value(row, 'valor_anterior')} -> {row_value(row, 'valor_nuevo')}", "createdAt": row_value(row, "fecha"), "user": row_value(row, "administrador"), "storeId": store_by_name.get(store_key(row_value(row, "local_origen")), ""), "reference": row_value(row, "movimiento_id")} for row in data.get("movimiento_ediciones", []))
    audit.extend({"id": f"AUD-CONTEO-{row_value(row, 'id')}", "type": "CONTEO_FISICO", "action": row_value(row, "estado"), "description": f"{row_value(row, 'descripcion')} | Sistema: {row_value(row, 'cantidad_sistema')} | Fisico: {row_value(row, 'cantidad_fisica')} | Diferencia: {row_value(row, 'diferencia')}", "createdAt": row_value(row, "fecha"), "user": row_value(row, "empleado"), "storeId": store_by_name.get(store_key(row_value(row, "local")), ""), "reference": row_value(row, "cod")} for row in data.get("conteo_fisico", []))
    historical_purchases = []
    for row in data.get("movimientos", []):
        if key(row_value(row, "tipo")) not in {"ENTRADA", "ENTRADAS"}:
            continue
        movement_id = str(row_value(row, "id")).lstrip("0") or "0"
        items = movement_items.get(movement_id, [])
        total = sum(item["subtotal"] for item in items) or number(row_value(row, "total", "subtotal"))
        historical_purchases.append({"id": f"ENTR-{movement_id}", "sourceMovementId": movement_id, "createdAt": row_value(row, "fecha", "creado_en"), "supplierName": row_value(row, "empleado", "vendedor") or "Entrada historica", "storeId": store_by_source_id.get(row_value(row, "local_id"), store_by_name.get(store_key(row_value(row, "local_origen")), "")), "total": total, "status": "RECIBIDA", "items": items, "notes": row_value(row, "observacion", "referencia")})
    return {"products": products, "customers": customers, "sales": sales, "credits": credits, "installments": installments, "payments": payments, "apartados": apartados, "stores": stores, "inventory": inventory, "inventoryByStore": inventory, "transfers": transfers, "users": users, "roles": [], "paymentMethods": ["Efectivo", "Transferencia", "Tarjeta", "Credito", "QR", "DaviPlata"], "expenses": expenses, "fuelRecords": fuel, "auditLog": audit, "inventoryMovements": movements, "suppliers": [], "purchases": historical_purchases, "accountsPayable": [], "supplierPayments": [], "permissionMatrix": [], "notifications": [], "demoMode": False}


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"No existe {SOURCE}")
    data = sections(SOURCE.read_text(encoding="utf-8"))
    state = build_state(data)
    with sqlite3.connect(DATABASE) as database:
        import_raw(database, data)
        database.execute("CREATE TABLE IF NOT EXISTS migration_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, tables_count INTEGER NOT NULL, state_json TEXT NOT NULL)")
        serialized = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        database.execute("INSERT INTO migration_runs (source, tables_count, state_json) VALUES (?, ?, ?)", (SOURCE.name, len(data), serialized))
        database.execute("INSERT INTO app_state (id, state_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP", (serialized,))
    print(json.dumps({"tables": len(data), "products": len(state["products"]), "stores": len(state["stores"]), "inventory": len(state["inventoryByStore"]), "sales": len(state["sales"]), "customers": len(state["customers"]), "apartados": len(state["apartados"]), "database": str(DATABASE)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
