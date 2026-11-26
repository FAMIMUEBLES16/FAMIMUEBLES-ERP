import unittest
import json
from unittest.mock import patch

import server
from server import _catalog_product_prices, _rentabilidad_bulk_price_items, _rentabilidad_product_prices
from migrate_export import build_state


class CatalogProductPricingTests(unittest.TestCase):
    def test_keeps_an_independent_minimum(self):
        self.assertEqual(
            _catalog_product_prices({"salePrice": 150, "minimumPrice": 100}),
            (150, 100),
        )

    def test_sale_price_update_preserves_minimum_when_omitted(self):
        self.assertEqual(
            _catalog_product_prices({"salePrice": 140}, existing_minimum_price=90),
            (140, 90),
        )

    def test_rejects_sale_below_minimum(self):
        with self.assertRaisesRegex(ValueError, "precio minimo configurado"):
            _catalog_product_prices({"salePrice": 99, "minimumPrice": 100})

    def test_rejects_invalid_values(self):
        payloads = (
            {"salePrice": -1, "minimumPrice": 0},
            {"salePrice": 100, "minimumPrice": -1},
            {"salePrice": "not a price", "minimumPrice": 0},
        )
        for payload in payloads:
            with self.subTest(payload=payload):
                with self.assertRaisesRegex(
                    ValueError, "precio de venta y el precio minimo"
                ):
                    _catalog_product_prices(payload)

    def test_rentabilidad_prices_require_integer_cop_and_respect_minimum(self):
        self.assertEqual(
            _rentabilidad_product_prices({"salePrice": "1234567", "minimumPrice": "1000000"}),
            (1234567, 1000000),
        )
        for payload in (
            {"salePrice": "1.5", "minimumPrice": "0"},
            {"salePrice": "100", "minimumPrice": ""},
            {"salePrice": "-1", "minimumPrice": "0"},
            {"salePrice": "99", "minimumPrice": "100"},
            {"salePrice": "100"},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                _rentabilidad_product_prices(payload)

    def test_rentabilidad_endpoint_updates_only_pricing_fields(self):
        class FakeResult:
            rowcount = 1

            def __init__(self, row=None):
                self.row = row

            def fetchone(self):
                return self.row

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, params=()):
                self.queries.append((query, params))
                if query.startswith("SELECT id, name, sale_price, minimum_price"):
                    return FakeResult({"id": "PROD-00001", "name": "Mesa", "sale_price": 1000, "minimum_price": 900})
                return FakeResult()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class FakeHandler:
            path = "/api/catalog/product/pricing"
            headers = {}
            rfile = None

            def send_json(self, status, payload):
                self.response = (status, payload)

        payload = {"id": "PROD-00001", "salePrice": 1500, "minimumPrice": 1200}
        handler = FakeHandler()
        database = FakeDatabase()
        with patch("server.request_json", return_value=payload), \
             patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=True), \
             patch("server._postgres_enabled", return_value=False), \
             patch("server.tenant_id", return_value="TENANT-1"), \
             patch("server.connection", return_value=database):
            server.AppHandler.do_PUT(handler)

        self.assertEqual(handler.response, (200, {"ok": True, "id": "PROD-00001"}))
        product_select, product_update, audit_insert = database.queries
        self.assertIn("SELECT id, name, sale_price, minimum_price", product_select[0])
        self.assertEqual(
            product_update,
            ("UPDATE products SET sale_price = ?, minimum_price = ? WHERE id = ? AND tenant_id = ?", (1500, 1200, "PROD-00001", "TENANT-1")),
        )
        self.assertIn("audit_events", audit_insert[0])
        self.assertEqual(json.loads(audit_insert[1][-1]), {
            "tenantId": "TENANT-1",
            "operationType": "individual",
            "productId": "PROD-00001",
            "productCode": "PROD-00001",
            "productName": "Mesa",
            "salePriceBefore": 1000,
            "salePriceAfter": 1500,
            "minimumPriceBefore": 900,
            "minimumPriceAfter": 1200,
        })

    def test_rentabilidad_endpoint_updates_only_shared_pricing_columns(self):
        class FakeResult:
            rowcount = 1

            def __init__(self, row=None):
                self.row = row

            def fetchone(self):
                return self.row

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, params=()):
                self.queries.append((query, params))
                if query.startswith("SELECT BTRIM(codigo)"):
                    return FakeResult({"id": "P-001", "name": "Mesa", "sale_price": 1000, "minimum_price": 900})
                return FakeResult()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class FakeHandler:
            path = "/api/catalog/product/pricing"
            headers = {}
            rfile = None

            def send_json(self, status, payload):
                self.response = (status, payload)

        handler = FakeHandler()
        database = FakeDatabase()
        with patch("server.request_json", return_value={"id": "P-001", "salePrice": 1500, "minimumPrice": 1200}), \
             patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=True), \
             patch("server._postgres_enabled", return_value=True), \
             patch("server.tenant_id", return_value=server.DEFAULT_TENANT), \
             patch("server.connection", return_value=database):
            server.AppHandler.do_PUT(handler)

        self.assertEqual(handler.response, (200, {"ok": True, "id": "P-001"}))
        _product_select, product_update, audit_insert = database.queries
        self.assertEqual(
            product_update,
            ("UPDATE productos SET precio_venta = %s, precio_minimo = %s WHERE BTRIM(codigo) = BTRIM(%s)", (1500, 1200, "P-001")),
        )
        self.assertEqual(json.loads(audit_insert[1][-1])["salePriceBefore"], 1000)

    def test_general_product_editor_records_price_changes(self):
        class FakeResult:
            rowcount = 1

            def __init__(self, row=None):
                self.row = row

            def fetchone(self):
                return self.row

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, params=()):
                self.queries.append((query, params))
                if query.startswith("SELECT id, name, sale_price, minimum_price"):
                    return FakeResult({"id": "P-1", "name": "Mesa", "sale_price": 100, "minimum_price": 80})
                return FakeResult()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class FakeHandler:
            path = "/api/catalog/product"
            headers = {}
            rfile = None

            def send_json(self, status, payload):
                self.response = (status, payload)

        handler = FakeHandler()
        database = FakeDatabase()
        payload = {
            "id": "P-1",
            "code": "001",
            "name": "Mesa nueva",
            "reference": "",
            "barcode": "",
            "category": "Sala",
            "cost": 60,
            "salePrice": 150,
            "minimumPrice": 120,
            "taxRate": 0,
            "active": True,
        }
        with patch("server.request_json", return_value=payload), \
             patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=True), \
             patch("server._postgres_enabled", return_value=False), \
             patch("server.tenant_id", return_value="TENANT-1"), \
             patch("server.connection", return_value=database):
            server.AppHandler.do_PUT(handler)

        self.assertEqual(handler.response, (200, {"ok": True, "id": "P-1"}))
        audit_event = next(params for query, params in database.queries if query.startswith("INSERT INTO audit_events"))
        self.assertEqual(json.loads(audit_event[-1]), {
            "tenantId": "TENANT-1",
            "operationType": "individual",
            "productId": "P-1",
            "productCode": "001",
            "productName": "Mesa nueva",
            "salePriceBefore": 100,
            "salePriceAfter": 150.0,
            "minimumPriceBefore": 80,
            "minimumPriceAfter": 120.0,
        })

    def test_bulk_price_payload_rejects_empty_duplicate_and_oversized_batches(self):
        self.assertEqual(
            _rentabilidad_bulk_price_items({"items": [{"id": "P-1", "salePrice": 1500}]}),
            [{"id": "P-1", "salePrice": 1500}],
        )
        for items in (
            [],
            [{"id": "P-1", "salePrice": 100}, {"id": "P-1", "salePrice": 200}],
            [{"id": "P-1", "salePrice": "not a price"}],
            [{"id": "P-1", "salePrice": 100}] * 1001,
        ):
            with self.subTest(count=len(items)), self.assertRaises(ValueError):
                _rentabilidad_bulk_price_items({"items": items})

    def test_bulk_price_route_uses_product_edit_permission(self):
        self.assertEqual(
            server.permission_target("/api/catalog/product/pricing/bulk", "PUT"),
            ("Productos", "edit"),
        )
        self.assertEqual(
            server.permission_target("/api/catalog/product/pricing/history", "GET"),
            ("Productos", "view"),
        )

    def test_pricing_write_rejects_users_without_edit_permission(self):
        class FakeHandler:
            path = "/api/catalog/product/pricing"
            headers = {}
            rfile = None

            def send_json(self, status, payload):
                self.response = (status, payload)

        handler = FakeHandler()
        with patch("server.request_json", return_value={"id": "P-1", "salePrice": 150, "minimumPrice": 100}), \
             patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=False), \
             patch("server.connection") as connection:
            server.AppHandler.do_PUT(handler)

        self.assertEqual(handler.response, (403, {"error": "Permiso insuficiente"}))
        connection.assert_not_called()

    def test_price_history_get_filters_by_tenant_and_returns_audited_fields(self):
        class FakeDatabase:
            query = None
            params = None

            def execute(self, query, params=()):
                self.query = query
                self.params = params
                return self

            def fetchall(self):
                return [{
                    "id": 7,
                    "userId": "USR-1",
                    "userName": "Ana",
                    "createdAt": "2026-01-02T03:04:05",
                    "dataJson": json.dumps({
                        "operationType": "importacion",
                        "productId": "P-1",
                        "productCode": "P-1",
                        "productName": "Mesa",
                        "salePriceBefore": 100,
                        "salePriceAfter": 150,
                        "minimumPriceBefore": 80,
                        "minimumPriceAfter": 80,
                        "tenantId": "TENANT-1",
                    }),
                }]

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class FakeHandler:
            path = "/api/catalog/product/pricing/history?limit=50"
            headers = {}

            def send_json(self, status, payload):
                self.response = (status, payload)

        handler = FakeHandler()
        database = FakeDatabase()
        with patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=True), \
             patch("server._postgres_enabled", return_value=False), \
             patch("server.tenant_id", return_value="TENANT-1"), \
             patch("server.connection", return_value=database):
            server.AppHandler.do_GET(handler)

        self.assertIn("json_extract(ae.data_json, '$.tenantId') = ?", database.query)
        self.assertEqual(database.params, ("TENANT-1", "TENANT-1", 0, 0, 51))
        self.assertEqual(handler.response, (200, {
            "items": [{
                "eventId": 7,
                "userId": "USR-1",
                "userName": "Ana",
                "createdAt": "2026-01-02T03:04:05",
                "operationType": "importacion",
                "productId": "P-1",
                "productCode": "P-1",
                "productName": "Mesa",
                "salePriceBefore": 100,
                "salePriceAfter": 150,
                "minimumPriceBefore": 80,
                "minimumPriceAfter": 80,
            }],
            "hasMore": False,
            "nextBeforeId": None,
        }))

    def test_price_history_get_rejects_users_without_view_permission(self):
        class FakeHandler:
            path = "/api/catalog/product/pricing/history"
            headers = {}

            def send_json(self, status, payload):
                self.response = (status, payload)

        handler = FakeHandler()
        with patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=False), \
             patch("server.connection") as connection:
            server.AppHandler.do_GET(handler)

        self.assertEqual(handler.response, (403, {"error": "Permiso insuficiente"}))
        connection.assert_not_called()

    def test_bulk_price_endpoint_rechecks_minimum_and_reports_per_product(self):
        class FakeResult:
            rowcount = 1

            def __init__(self, row=None):
                self.row = row

            def fetchone(self):
                return self.row

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, params=()):
                self.queries.append((query, params))
                if query.startswith("SELECT id, name, sale_price, minimum_price"):
                    return FakeResult({"id": params[0], "name": f"Producto {params[0]}", "sale_price": 95, "minimum_price": 100})
                return FakeResult()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class FakeHandler:
            path = "/api/catalog/product/pricing/bulk"
            headers = {}
            rfile = None

            def send_json(self, status, payload):
                self.response = (status, payload)

        handler = FakeHandler()
        database = FakeDatabase()
        payload = {"items": [{"id": "P-1", "salePrice": 90}, {"id": "P-2", "salePrice": 110}]}
        with patch("server.request_json", return_value=payload), \
             patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=True), \
             patch("server._postgres_enabled", return_value=False), \
             patch("server.tenant_id", return_value="TENANT-1"), \
             patch("server.connection", return_value=database):
            server.AppHandler.do_PUT(handler)

        self.assertEqual(handler.response, (200, {
            "ok": True,
            "total": 2,
            "updated": [{"id": "P-2", "salePrice": 110}],
            "notUpdated": [{"id": "P-1", "reason": "El precio resultante es inferior al precio mínimo configurado."}],
        }))
        product_updates = [query for query, _params in database.queries if query.startswith("UPDATE products")]
        self.assertEqual(product_updates, ["UPDATE products SET sale_price = ? WHERE id = ? AND tenant_id = ?"])

    def test_bulk_price_endpoint_updates_shared_catalog_products(self):
        class FakeResult:
            rowcount = 1

            def __init__(self, row=None):
                self.row = row

            def fetchone(self):
                return self.row

        class FakeDatabase:
            def __init__(self):
                self.queries = []

            def execute(self, query, params=()):
                self.queries.append((query, params))
                if "FROM productos" in query:
                    return FakeResult({"id": params[0], "name": "Mesa", "sale_price": 100, "minimum_price": 50})
                return FakeResult()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class FakeHandler:
            path = "/api/catalog/product/pricing/bulk"
            headers = {}
            rfile = None

            def send_json(self, status, payload):
                self.response = (status, payload)

        handler = FakeHandler()
        database = FakeDatabase()
        payload = {"items": [{"id": "P-001", "salePrice": 150}]}
        with patch("server.request_json", return_value=payload), \
             patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=True), \
             patch("server._postgres_enabled", return_value=True), \
             patch("server.tenant_id", return_value=server.DEFAULT_TENANT), \
             patch("server.connection", return_value=database):
            server.AppHandler.do_PUT(handler)

        self.assertEqual(handler.response, (
            200,
            {
                "ok": True,
                "total": 1,
                "updated": [{"id": "P-001", "salePrice": 150}],
                "notUpdated": [],
            },
        ))
        product_updates = [query for query, _params in database.queries if query.startswith("UPDATE productos")]
        self.assertEqual(product_updates, ["UPDATE productos SET precio_venta = %s WHERE BTRIM(codigo) = BTRIM(%s)"])
        audit_event = next(params for query, params in database.queries if query.startswith("INSERT INTO audit_events"))
        self.assertEqual(json.loads(audit_event[-1])["operationType"], "masiva")

    def test_bulk_price_database_error_reports_atomic_rollback(self):
        class FakeResult:
            rowcount = 0

            def fetchone(self):
                return {"id": "P-1", "name": "Mesa", "sale_price": 100, "minimum_price": 0}

        class FakeDatabase:
            rolled_back = False

            def execute(self, _query, _params=()):
                return FakeResult()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, *_args):
                self.rolled_back = exc_type is not None
                return False

        class FakeHandler:
            path = "/api/catalog/product/pricing/bulk"
            headers = {}
            rfile = None

            def send_json(self, status, payload):
                self.response = (status, payload)

        handler = FakeHandler()
        database = FakeDatabase()
        payload = {"items": [{"id": "P-1", "salePrice": 150}, {"id": "P-2", "salePrice": 160}]}
        with patch("server.request_json", return_value=payload), \
             patch("server.authenticated_user", return_value={"id": "USR-1"}), \
             patch("server.requested_tenant_allowed", return_value=True), \
             patch("server.can_access", return_value=True), \
             patch("server._postgres_enabled", return_value=False), \
             patch("server.tenant_id", return_value="TENANT-1"), \
             patch("server.connection", return_value=database):
            server.AppHandler.do_PUT(handler)

        self.assertTrue(database.rolled_back)
        self.assertEqual(handler.response[0], 500)
        self.assertEqual(handler.response[1]["updated"], [])
        self.assertEqual([item["id"] for item in handler.response[1]["notUpdated"]], ["P-1", "P-2"])

    def test_legacy_import_does_not_invent_minimum_prices(self):
        state = build_state({
            "productos": [
                {"codigo": "100", "nombre_producto": "Mesa", "precio_compra": "50", "precio_venta": "100", "activo": "SI"},
                {"codigo": "101", "nombre_producto": "Silla", "precio_compra": "40", "precio_venta": "80", "activo": "SI"},
            ],
            "productos_catalogo": [{"nombre": "Silla", "precio_minimo": "60"}],
        })

        self.assertEqual(state["products"][0]["minimumPrice"], 0)
        self.assertEqual(state["products"][1]["minimumPrice"], 60)


if __name__ == "__main__":
    unittest.main()
