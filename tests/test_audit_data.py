import unittest

import server


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class FakeDatabase:
    def __init__(self, rows):
        self.rows = rows
        self.query = ""

    def execute(self, query, params=()):
        self.query = query
        return FakeResult(self.rows)


class SharedCreditDatabase:
    def __init__(self):
        self.queries = []

    def execute(self, query, params=()):
        self.queries.append(query)
        if "information_schema.columns" in query:
            return FakeResult([
                {"column_name": column}
                for column in ("id", "movimiento_id", "cliente", "total", "abono_inicial", "saldo_pendiente", "estado", "local", "factura", "vendedor", "fecha", "creado_en")
            ])
        if "SELECT c.*" in query:
            if "c.cuota_inicial" in query or "c.venta_id" in query:
                raise RuntimeError("column does not exist")
            return FakeResult([{
                "id": 27,
                "movimiento_id": 91,
                "sale_id": 91,
                "cliente": "Cliente con abonos",
                "total": 500000,
                "initial": 100000,
                "saldo_pendiente": 250000,
                "estado": "PENDIENTE",
            }])
        return FakeResult([])


class AuditDataTests(unittest.TestCase):
    def test_payments_include_both_account_kinds_and_references(self):
        database = FakeDatabase([
            {"id": 1, "credito_id": 8, "apartado_id": None, "tipo_abono": "CREDITO"},
            {"id": 2, "credito_id": None, "apartado_id": 4, "tipo_abono": "APARTADO"},
        ])

        items = server._shared_domain_items(database, "payments")

        self.assertIn("UNION ALL", database.query)
        self.assertEqual(items[0]["tipo_abono"], "CREDITO")
        self.assertEqual(items[0]["creditoId"], 8)
        self.assertEqual(items[1]["tipo_abono"], "APARTADO")
        self.assertEqual(items[1]["apartadoId"], 4)

    def test_movement_edits_are_loaded_with_audit_details(self):
        database = FakeDatabase([{
            "id": 3,
            "movimiento_id": 31,
            "campo": "cantidad",
            "valor_anterior": "1",
            "valor_nuevo": "2",
            "administrador": "12345",
        }])

        items = server._shared_domain_items(database, "movementEdits")

        self.assertIn("FROM movimiento_ediciones", database.query)
        self.assertEqual(items[0]["movimientoId"], 31)
        self.assertEqual(items[0]["valor_anterior"], "1")
        self.assertEqual(items[0]["administrador"], "12345")

    def test_shared_credits_use_columns_from_the_current_finance_schema(self):
        database = SharedCreditDatabase()

        items = server._shared_domain_items(database, "credits")

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["total"], 500000)
        self.assertEqual(items[0]["initial"], 100000)
        self.assertEqual(items[0]["saldo_pendiente"], 250000)
        self.assertEqual(items[0]["customer"], "Cliente con abonos")
        self.assertTrue(any("c.abono_inicial" in query for query in database.queries))
        credit_query = next(query for query in database.queries if "SELECT c.*" in query)
        self.assertNotIn("c.cuota_inicial", credit_query)
        self.assertNotIn("c.venta_id", credit_query)
        self.assertTrue(any("FROM movimiento_productos" in query for query in database.queries))

    def test_audit_collections_are_exposed_through_domain_routes(self):
        for collection in (
            "entries",
            "exits",
            "sistecredito",
            "auditLog",
            "inventoryMovements",
            "installments",
            "payments",
            "movementEdits",
            "paymentMethods",
        ):
            self.assertIn(collection, server.DOMAIN_COLLECTIONS)


if __name__ == "__main__":
    unittest.main()
