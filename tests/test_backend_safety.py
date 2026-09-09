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


if __name__ == "__main__":
    unittest.main()