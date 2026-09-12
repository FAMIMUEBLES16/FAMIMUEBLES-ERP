import io
import json
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import server
from server import _create_shared_sale, _shared_domain_items, canonical_request_hash, password_hash, password_matches, specialized_xlsx


class BackendSafetyTests(unittest.TestCase):
    def test_active_flag_string_false_is_normalized_to_inactive_in_server_contract(self):
        self.assertEqual(server.normalize_active_flag("false"), 0)
        self.assertEqual(server.normalize_active_flag("true"), 1)
        self.assertEqual(server.normalize_active_flag(False), 0)
        self.assertEqual(server.normalize_active_flag(True), 1)

    def test_resolve_transfer_movement_from_transfer_reference_string(self):
        class FakeCursor:
            def __init__(self, rows=None):
                self.rows = rows or []

            def fetchone(self):
                return self.rows[0] if self.rows else None

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, params=()):
                self.queries.append((query, params))
                if "WHERE referencia = %s" in query:
                    return FakeCursor([{"id": 368, "tipo": "TRASLADO", "local_origen": "INV CRR 5 3 26", "local_destino": "INV BODEGA MANABLANCA"}])
                if "WHERE id = %s" in query:
                    return FakeCursor([])
                return FakeCursor([])

        database = FakeDatabase()
        movement = server.resolve_transfer_movement_for_delete(database, "TRA-00360")

        self.assertEqual(movement["id"], 368)
        self.assertEqual(movement["local_origen"], "INV CRR 5 3 26")
        self.assertEqual(movement["local_destino"], "INV BODEGA MANABLANCA")

    def test_idempotency_hash_is_order_independent(self):
        first = canonical_request_hash({"id": "VEN-1", "items": [{"productId": "P-1", "quantity": 2}], "requestId": "a"})
        second = canonical_request_hash({"items": [{"productId": "P-1", "quantity": 2}], "id": "VEN-1", "requestId": "b"})
        self.assertEqual(first, second)

    def test_idempotency_hash_changes_with_business_data(self):
        first = canonical_request_hash({"id": "VEN-1", "total": 100})
        second = canonical_request_hash({"id": "VEN-1", "total": 101})
        self.assertNotEqual(first, second)

    def test_password_hash_round_trip(self):
        stored = password_hash("ClaveSegura123")
        self.assertTrue(password_matches("ClaveSegura123", stored))
        self.assertFalse(password_matches("otra-clave", stored))

    def test_password_hash_uses_unique_salts(self):
        self.assertNotEqual(password_hash("ClaveSegura123"), password_hash("ClaveSegura123"))

    def test_user_contract_supports_document_field_in_server_source(self):
        server_source = Path(server.__file__).read_text(encoding="utf-8")
        self.assertIn("SELECT id, username, email, phone, document, role, store_id AS storeId", server_source)
        self.assertIn("INSERT INTO auth_users (id, username, email, phone, document, password_hash, role, store_id, tenant_id)", server_source)
        self.assertIn("UPDATE auth_users SET username = ?, email = ?, phone = ?, document = ?, role = ?, store_id = ?, active = ?", server_source)

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

    def test_shared_domain_items_customer_route_reads_postgres_customer_fields(self):
        class FakeCursor:
            def __init__(self, rows=None):
                self.rows = rows or []

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, params=()):
                self.queries.append(query)
                if "FROM clientes c" in query:
                    return FakeCursor([
                        {"id": 5, "name": "Fernando Suárez", "document": "123456", "phone": "3017439000", "address": "Calle 1", "email": "", "purchases": 2, "credits": 1, "balance": 150000, "status": "Activo"}
                    ])
                if "information_schema.columns" in query:
                    return FakeCursor([])
                return FakeCursor([])

        items = _shared_domain_items(FakeDatabase(), "customers")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], 5)
        self.assertEqual(items[0]["name"], "Fernando Suárez")
        self.assertEqual(items[0]["document"], "123456")
        self.assertEqual(items[0]["phone"], "3017439000")
        self.assertEqual(items[0]["address"], "Calle 1")

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