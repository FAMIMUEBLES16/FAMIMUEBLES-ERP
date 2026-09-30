import io
import json
import unittest
import zipfile
from unittest.mock import patch

import server
from server import _create_shared_sale, _shared_domain_items, canonical_request_hash, password_hash, password_matches, specialized_xlsx


class BackendSafetyTests(unittest.TestCase):
    def test_idempotency_hash_is_order_independent(self):
        first = canonical_request_hash({"id": "VEN-1", "items": [{"productId": "P-1", "quantity": 2}], "requestId": "a"})
        second = canonical_request_hash({"items": [{"productId": "P-1", "quantity": 2}], "id": "VEN-1", "requestId": "b"})
        self.assertEqual(first, second)

    def test_idempotency_hash_changes_with_business_data(self):
        first = canonical_request_hash({"id": "VEN-1", "total": 100})
        second = canonical_request_hash({"id": "VEN-1", "total": 101})
        self.assertNotEqual(first, second)

    def test_empty_domain_payload_is_ignored_without_validating_record_id(self):
        self.assertFalse(server.has_meaningful_domain_payload({"tenantId": "tenant-default", "requestId": "abc"}))
        self.assertFalse(server.has_meaningful_domain_payload({"id": "TAL-1", "tenantId": "tenant-default", "status": "EN_USO"}))
        self.assertTrue(server.has_meaningful_domain_payload({"id": "TAL-1", "tenantId": "tenant-default", "status": "EN_USO", "type": "REMISION"}))

    def test_user_update_preserves_telegram_link_unless_field_is_sent(self):
        existing = {"telegram_id": "123456"}

        self.assertEqual(server.updated_user_telegram_id({}, existing), "123456")
        self.assertEqual(server.updated_user_telegram_id({"telegramId": "654321"}, existing), "654321")
        self.assertIsNone(server.updated_user_telegram_id({"telegramId": ""}, existing))

    def test_fuel_record_values_validate_and_normalize_registration(self):
        values = server.fuel_record_values({
            "date": "2026-09-28",
            "driver": "Ana",
            "vehicle": "Van",
            "mileage": "123",
            "quantity": "4.5",
            "amount": "89000",
            "storeId": "LOC-1",
            "invoiceNumber": "FAC-001",
        })

        self.assertEqual(values, {
            "date": "2026-09-28",
            "driver": "Ana",
            "vehicle": "Van",
            "mileage": 123,
            "quantity": 4.5,
            "amount": 89000,
            "storeId": "",
            "invoiceNumber": "FAC-001",
        })
        item = server.fuel_record_item({
            "id": 42,
            "fecha": "2026-09-28",
            "conductor": "Ana",
            "carro": "Van",
            "kilometraje": 123,
            "galones": 4.5,
            "valor": 89000,
            "local": "LOC-1",
            "factura": "FAC-001",
        })
        self.assertEqual(item["invoiceNumber"], "FAC-001")

    def test_paid_fuel_account_records_marks_paid_state_and_registers_payment(self):
        account, payment = server.paid_fuel_account_records({
            "id": "42",
            "amount": 125000,
            "driver": "Ana",
            "vehicle": "Van",
            "date": "2026-09-28",
            "invoiceNumber": "FAC-042",
            "storeId": "LOC-1",
        }, "TARJETA", {"username": "Admin"})

        self.assertEqual(account["status"], "PAGADA")
        self.assertEqual(account["paidAmount"], 125000)
        self.assertEqual(account["balance"], 0)
        self.assertEqual(account["storeId"], "")
        self.assertEqual(payment["accountId"], account["id"])
        self.assertEqual(payment["method"], "TARJETA")
        self.assertEqual(payment["reference"], "FAC-042")

    def test_pending_fuel_account_records_creates_open_account_without_payment(self):
        account, payment = server.pending_fuel_account_records({
            "id": "43",
            "amount": 98000,
            "driver": "Marta",
            "vehicle": "Camioneta",
            "date": "2026-09-21",
            "invoiceNumber": "FAC-043",
            "storeId": "LOC-2",
        })

        self.assertEqual(account["status"], "PENDIENTE")
        self.assertEqual(account["paidAmount"], 0)
        self.assertEqual(account["balance"], 98000)
        self.assertEqual(account["storeId"], "")
        self.assertIsNone(payment)

    def test_fuel_record_crud_uses_gasoline_permissions(self):
        self.assertEqual(server.permission_target("/api/parity/gasolina", "POST"), ("Gasolina", "create"))
        self.assertEqual(server.permission_target("/api/parity/gasolina/42", "PUT"), ("Gasolina", "edit"))
        self.assertEqual(server.permission_target("/api/parity/gasolina/42", "DELETE"), ("Gasolina", "delete"))

    def test_schedule_collections_are_admin_only(self):
        self.assertIn("workSchedules", server.DOMAIN_COLLECTIONS)
        self.assertIn("staffAbsences", server.DOMAIN_COLLECTIONS)

        class FakeHandler:
            headers = {}

        handler = FakeHandler()
        with patch.object(server, "authenticated_user", return_value={"role": "GERENTE", "tenant_id": "tenant-default"}), \
             patch.object(server, "tenant_id", return_value="tenant-default"):
            self.assertFalse(server.can_access(handler, "/api/domain/workSchedules", "POST"))

        with patch.object(server, "authenticated_user", return_value={"role": "ADMINISTRADOR", "tenant_id": "tenant-default"}), \
             patch.object(server, "tenant_id", return_value="tenant-default"):
            self.assertTrue(server.can_access(handler, "/api/domain/staffAbsences", "POST"))

    def test_delete_fuel_route_reaches_database_and_deletes_unlinked_record(self):
        class FakeResult:
            def __init__(self, row=None, rows=None):
                self.row = row
                self.rows = rows or []

            def fetchone(self):
                return self.row

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def __init__(self):
                self.deleted = False

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def execute(self, query, params=()):
                if "SELECT * FROM gasolina" in query:
                    return FakeResult({"id": 42, "fecha": "2026-09-28", "conductor": "Ana", "carro": "Van", "kilometraje": 123, "galones": 4.5, "valor": 89000, "local": "LOC-1", "factura": "FAC-001"})
                if "SELECT id, data_json FROM domain_records" in query:
                    return FakeResult(rows=[])
                if "DELETE FROM gasolina" in query:
                    self.deleted = True
                return FakeResult()

        class FakeHandler:
            path = "/api/parity/gasolina/42"
            headers = {}

            def send_json(self, status, payload):
                self.response = (status, payload)

        database = FakeDatabase()
        handler = FakeHandler()
        with patch.object(server, "authenticated_user", return_value={"id": "USR-1"}), \
             patch.object(server, "requested_tenant_allowed", return_value=True), \
             patch.object(server, "can_access", return_value=True), \
             patch.object(server, "_postgres_enabled", return_value=True), \
             patch.object(server, "connection", return_value=database), \
             patch.object(server, "tenant_id", return_value="tenant-default"):
            server.AppHandler.do_DELETE(handler)

        self.assertEqual(handler.response[0], 200)
        self.assertTrue(database.deleted)

    def test_delete_fuel_route_rejects_records_linked_to_payables(self):
        class FakeResult:
            def __init__(self, row=None, rows=None):
                self.row = row
                self.rows = rows or []

            def fetchone(self):
                return self.row

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def __init__(self):
                self.deleted = False

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def execute(self, query, params=()):
                if "SELECT * FROM gasolina" in query:
                    return FakeResult({"id": 42, "fecha": "2026-09-28", "conductor": "Ana", "carro": "Van", "kilometraje": 123, "galones": 4.5, "valor": 89000, "local": "LOC-1", "factura": "FAC-001"})
                if "SELECT id, data_json FROM domain_records" in query:
                    return FakeResult(rows=[{"id": "CXP-GAS-42", "data_json": json.dumps({"fuelRecordId": "42"})}])
                if "DELETE FROM gasolina" in query:
                    self.deleted = True
                return FakeResult()

        class FakeHandler:
            path = "/api/parity/gasolina/42"
            headers = {}

            def send_json(self, status, payload):
                self.response = (status, payload)

        database = FakeDatabase()
        handler = FakeHandler()
        with patch.object(server, "authenticated_user", return_value={"id": "USR-1"}), \
             patch.object(server, "requested_tenant_allowed", return_value=True), \
             patch.object(server, "can_access", return_value=True), \
             patch.object(server, "_postgres_enabled", return_value=True), \
             patch.object(server, "connection", return_value=database), \
             patch.object(server, "tenant_id", return_value="tenant-default"):
            server.AppHandler.do_DELETE(handler)

        self.assertEqual(handler.response[0], 409)
        self.assertFalse(database.deleted)

    def test_password_hash_round_trip(self):
        stored = password_hash("ClaveSegura123")
        self.assertTrue(password_matches("ClaveSegura123", stored))
        self.assertFalse(password_matches("otra-clave", stored))

    def test_password_hash_uses_unique_salts(self):
        self.assertNotEqual(password_hash("ClaveSegura123"), password_hash("ClaveSegura123"))

    def test_specialized_xlsx_is_a_valid_zip_package(self):
        content = specialized_xlsx(["codigo", "descripcion"], [["001", "Mueble <demo>"]])
        with zipfile.ZipFile(io.BytesIO(content)) as package:
            self.assertIn("[Content_Types].xml", package.namelist())
            self.assertIn("xl/worksheets/sheet1.xml", package.namelist())
            self.assertIn("Mueble &lt;demo&gt;", package.read("xl/worksheets/sheet1.xml").decode("utf-8"))

    def test_shared_domain_items_keeps_credit_domain_records_when_creditos_table_is_empty(self):
        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def execute(self, query, params=()):
                if "information_schema.columns" in query:
                    return FakeResult([])
                if "FROM creditos" in query and "INTO" not in query:
                    return FakeResult([])
                if "FROM domain_records" in query:
                    return FakeResult([
                        {"data_json": json.dumps({"id": "CR-1", "customer": "Cliente Demo", "total": 150000, "initial": 0, "paid": 0, "status": "Al dia"})}
                    ])
                raise AssertionError(f"Unexpected query: {query}")

        items = _shared_domain_items(FakeDatabase(), "credits")

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], "CR-1")
        self.assertEqual(items[0]["customer"], "Cliente Demo")

    def test_shared_domain_items_merges_canonical_and_historical_customers(self):
        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def execute(self, query, params=()):
                if "FROM clientes" in query:
                    return FakeResult([{"id": "CLI-1", "name": "Ana Canonica", "document": "1", "phone": "", "email": "", "status": "Activo"}])
                if "information_schema.columns" in query:
                    table = params[0] if params else "creditos"
                    if table == "movimientos":
                        return FakeResult([{"column_name": "cliente"}])
                    return FakeResult([])
                if "SELECT DISTINCT name, document, phone, customer, id" in query:
                    return FakeResult([
                        {"id": "Ana Canonica", "name": "Ana Canonica", "document": "", "phone": "", "customer": "Ana Canonica"},
                        {"id": "Beatriz Historica", "name": "Beatriz Historica", "document": "", "phone": "", "customer": "Beatriz Historica"},
                    ])
                raise AssertionError(f"Unexpected query: {query}")

        items = _shared_domain_items(FakeDatabase(), "customers")

        self.assertEqual([item["name"] for item in items], ["Ana Canonica", "Beatriz Historica"])

    def test_shared_domain_items_maps_warranties_collection_to_garantias_table(self):
        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def execute(self, query, params=()):
                if "FROM garantias" in query:
                    return FakeResult([
                        {
                            "id": 2,
                            "fecha": "2026-09-12T16:54:13",
                            "local": "INV CRR 5 3 17",
                            "producto": "0373",
                            "cliente": "NEVECON",
                            "cantidad": 1,
                            "estado": "PENDIENTE",
                            "descripcion": "Salida por garantía | Factura: - | Registrado por Michael Díaz",
                        }
                    ])
                if "information_schema.columns" in query:
                    return FakeResult([])
                return FakeResult([])

        items = _shared_domain_items(FakeDatabase(), "warranties")

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], 2)
        self.assertEqual(items[0]["local"], "INV CRR 5 3 17")
        self.assertEqual(items[0]["estado"], "PENDIENTE")
        self.assertEqual(items[0]["storeId"], "INV CRR 5 3 17")
        self.assertEqual(items[0]["status"], "PENDIENTE")

    def test_warranty_trace_query_uses_received_code_and_date(self):
        source = open(server.__file__, encoding="utf-8").read()
        self.assertIn("/api/domain/warranties/([^/]+)/trace", source)
        self.assertIn("mp.codigo = %s AND m.fecha >= %s", source)

    def test_damaged_stock_includes_received_warranties(self):
        source = open(server.__file__, encoding="utf-8").read()
        self.assertIn("'RECIBIDO', 'RECIBIDA'", source)

    def test_shared_domain_items_exposes_telegram_warranty_frontend_aliases(self):
        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def execute(self, query, params=()):
                if "FROM garantias" in query:
                    return FakeResult([
                        {
                            "id": 9,
                            "fecha": "2026-09-13T10:15:00",
                            "local": "LOCAL 01",
                            "codigo": "0373",
                            "cliente": "NEVECON",
                            "cantidad": 1,
                            "estado": "PENDIENTE",
                            "descripcion": "Salida por garantía | Factura: FAC-300 | Registrado por Michael Díaz",
                            "factura": "FAC-300",
                            "precio_total": 245000,
                        }
                    ])
                return FakeResult([])

        items = _shared_domain_items(FakeDatabase(), "warranties")

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["productId"], "0373")
        self.assertEqual(items[0]["productName"], "0373")
        self.assertEqual(items[0]["customerName"], "NEVECON")
        self.assertEqual(items[0]["invoiceNumber"], "FAC-300")
        self.assertEqual(items[0]["amount"], 245000)
        self.assertEqual(items[0]["storeId"], "LOCAL 01")
        self.assertEqual(items[0]["status"], "PENDIENTE")

    def test_shared_domain_items_uses_real_garantias_schema_columns(self):
        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def execute(self, query, params=()):
                if "FROM garantias" in query:
                    self.last_query = query
                    return FakeResult([])
                return FakeResult([])

        fake_database = FakeDatabase()
        _shared_domain_items(fake_database, "warranties")

        self.assertIn("local_origen", fake_database.last_query)
        self.assertIn("local_recibido", fake_database.last_query)
        self.assertIn("COALESCE(local_origen, local_recibido)", fake_database.last_query)

    def test_create_shared_sale_creates_credit_record_for_credit_payment(self):
        class FakeCursor:
            def __init__(self, row=None):
                self._row = row

            def fetchone(self):
                return self._row

        class FakeDatabase:
            def execute(self, query, params=()):
                if "SELECT nombre FROM locales" in query:
                    return FakeCursor({"nombre": "LOCAL-01"})
                if "SELECT nombre_producto FROM productos" in query:
                    return FakeCursor({"nombre_producto": "Mesa Test"})
                if "SELECT cantidad FROM inventarios" in query:
                    return FakeCursor({"cantidad": 5})
                if "INSERT INTO movimientos" in query:
                    return FakeCursor((1,))
                return FakeCursor()

        payload = {
            "id": "VEN-1",
            "storeId": "LOCAL-01",
            "invoiceNumber": "FAC-001",
            "customer": "Cliente Demo",
            "paymentMethod": "Crédito",
            "creditInitial": 100000,
            "items": [
                {"productId": "PROD-1", "quantity": 1, "unitPrice": 200000},
            ],
        }

        with patch("server.claim_idempotency", return_value=(None, None)), \
             patch("server.complete_idempotency"), \
             patch("server.record_id", return_value="VEN-1"), \
             patch("server._create_shared_credit_record", return_value={"id": 42}) as credit_helper:
            result = _create_shared_sale(FakeDatabase(), payload, {"username": "erp-user", "id": "ERP-1", "store_id": "LOCAL-01", "role": "ADMINISTRADOR"}, object())

        self.assertEqual(result["creditId"], 42)
        self.assertEqual(credit_helper.call_args.args[2], 1)
        self.assertEqual(credit_helper.call_args.args[6], 200000)

    def test_create_shared_sale_persists_selected_date(self):
        class FakeCursor:
            def __init__(self, row=None):
                self._row = row

            def fetchone(self):
                return self._row

        class FakeDatabase:
            def __init__(self):
                self.insert_params = None

            def execute(self, query, params=()):
                if "SELECT nombre FROM locales" in query:
                    return FakeCursor({"nombre": "LOCAL-01"})
                if "SELECT nombre_producto FROM productos" in query:
                    return FakeCursor({"nombre_producto": "Mesa Test"})
                if "SELECT cantidad FROM inventarios" in query:
                    return FakeCursor({"cantidad": 5})
                if "INSERT INTO movimientos" in query:
                    self.insert_params = params
                    return FakeCursor((1,))
                return FakeCursor()

        payload = {
            "id": "VEN-2",
            "storeId": "LOCAL-01",
            "invoiceNumber": "FAC-002",
            "customer": "Cliente Demo",
            "paymentMethod": "Efectivo",
            "date": "2026-09-14",
            "items": [{"productId": "PROD-1", "quantity": 1, "unitPrice": 200000}],
        }

        database = FakeDatabase()
        with patch("server.claim_idempotency", return_value=(None, None)), \
             patch("server.complete_idempotency"), \
             patch("server.record_id", return_value="VEN-2"), \
             patch("server._create_shared_credit_record", return_value=None):
            _create_shared_sale(database, payload, {"username": "erp-user", "id": "ERP-1", "store_id": "LOCAL-01", "role": "ADMINISTRADOR"}, object())

        self.assertEqual(database.insert_params[-1], "2026-09-14")

    def test_non_admin_user_can_access_sales_and_tenants(self):
        class FakeHandler:
            headers = {"X-Tenant-ID": "tenant-default"}

        fake_user = {"id": "USR-1", "role": "VENDEDOR", "tenant_id": "tenant-default"}

        with patch("server.authenticated_user", return_value=fake_user), \
             patch("server.has_user_permission", return_value=True):
            self.assertTrue(server.can_access(FakeHandler(), "/api/catalog/sale", "POST"))
            self.assertTrue(server.can_access(FakeHandler(), "/api/tenants", "GET"))

    def test_non_admin_user_can_access_action_specific_domain_permission(self):
        class FakeHandler:
            headers = {"X-Tenant-ID": "tenant-default"}

        fake_user = {"id": "USR-1", "role": "CAJERO", "tenant_id": "tenant-default"}

        def fake_has_permission(handler, resource, action="view"):
            return resource == "Compras" and action == "create"

        with patch("server.authenticated_user", return_value=fake_user), \
             patch("server.has_user_permission", side_effect=fake_has_permission):
            self.assertTrue(server.can_access(FakeHandler(), "/api/domain/purchases", "POST"))

    def test_non_admin_user_can_access_own_permissions_endpoint(self):
        class FakeHandler:
            headers = {"X-Tenant-ID": "tenant-default"}

        fake_user = {"id": "USR-1", "role": "VENDEDOR", "tenant_id": "tenant-default"}

        with patch("server.authenticated_user", return_value=fake_user):
            self.assertTrue(server.can_access(FakeHandler(), "/api/users/USR-1/permissions", "GET"))
            self.assertFalse(server.can_access(FakeHandler(), "/api/users/USR-2/permissions", "GET"))

    def test_non_default_tenant_cannot_access_shared_operational_routes(self):
        class FakeHandler:
            headers = {"X-Tenant-ID": "tenant-other"}

        fake_user = {"id": "USR-1", "role": "ADMINISTRADOR", "tenant_id": "tenant-default"}

        with patch("server.authenticated_user", return_value=fake_user), \
             patch("server._postgres_enabled", return_value=True):
            self.assertFalse(server.can_access(FakeHandler(), "/api/catalog", "GET"))
            self.assertFalse(server.can_access(FakeHandler(), "/api/parity/nomina", "GET"))
            self.assertFalse(server.can_access(FakeHandler(), "/api/report-pdf/sales.pdf", "GET"))

    def test_default_tenant_can_access_shared_operational_routes(self):
        class FakeHandler:
            headers = {"X-Tenant-ID": "tenant-default"}

        fake_user = {"id": "USR-1", "role": "ADMINISTRADOR", "tenant_id": "tenant-default"}

        with patch("server.authenticated_user", return_value=fake_user), \
             patch("server._postgres_enabled", return_value=True):
            self.assertTrue(server.can_access(FakeHandler(), "/api/catalog", "GET"))
            self.assertTrue(server.can_access(FakeHandler(), "/api/parity/nomina", "GET"))

    def test_non_admin_user_without_permission_rows_is_denied(self):
        fake_user = {"id": "USR-1", "role": "VENDEDOR", "tenant_id": "tenant-default"}

        class FakeCursor:
            def __init__(self, value):
                self.value = value

            def fetchone(self):
                return (self.value,)

        class FakeDatabase:
            def execute(self, query, params=()):
                if "SELECT COUNT(*) FROM user_permissions" in query:
                    return FakeCursor(0)
                raise AssertionError(f"Unexpected query: {query}")

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_val, exc_tb):
                return False

        with patch("server.authenticated_user", return_value=fake_user), \
             patch("server.connection", return_value=FakeDatabase()):
            self.assertFalse(server.has_user_permission(object(), "Compras", "create"))


if __name__ == "__main__":
    unittest.main()