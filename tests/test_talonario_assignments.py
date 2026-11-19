import json
import unittest
from unittest.mock import patch

from server import _update_talonario_for_sale, validate_talonario_assignment


class TalonarioAssignmentTests(unittest.TestCase):
    class FakeResult:
        def __init__(self, rows):
            self.rows = rows

        def fetchall(self):
            return self.rows

    class FakeDatabase:
        def __init__(self, rows):
            self.rows = rows

        def execute(self, query, params=()):
            if "SELECT id, data_json FROM domain_records" in query:
                return TalonarioAssignmentTests.FakeResult(self.rows)
            return None

    @staticmethod
    def row(identifier, item):
        return (identifier, json.dumps(item))

    def make_talonario(self, identifier, **values):
        return {
            "id": identifier,
            "type": "REMISION",
            "startNumber": 90001,
            "endNumber": 90050,
            "status": "EN_USO",
            "storeId": "INV FUTURO",
            "destinationName": "INV FUTURO",
            **values,
        }

    def test_rejects_duplicate_active_range_for_the_same_local(self):
        existing = self.make_talonario("EXISTING")
        candidate = self.make_talonario("DUPLICATE")
        database = self.FakeDatabase([self.row(existing["id"], existing)])

        with self.assertRaisesRegex(ValueError, "ya esta asignado a INV FUTURO"):
            validate_talonario_assignment(database, "tenant-default", candidate["id"], candidate)

    def test_rejects_active_range_assigned_to_another_local(self):
        existing = self.make_talonario(
            "EXISTING",
            storeId="INV CARTAGENITA",
            destinationName="INV CARTAGENITA",
        )
        candidate = self.make_talonario("DUPLICATE")
        database = self.FakeDatabase([self.row(existing["id"], existing)])

        with self.assertRaisesRegex(ValueError, "ya esta asignado a INV CARTAGENITA"):
            validate_talonario_assignment(database, "tenant-default", candidate["id"], candidate)

    def test_allows_the_matching_destination_for_its_sent_source_record(self):
        source_id = "SOURCE-1"
        destination_id = f"TAL-{source_id}-INVFUTURO"
        source = self.make_talonario(
            source_id,
            status="ENVIADO",
            storeId="INV CRR 5 3 26",
            destinationName="INV CRR 5 3 26",
            destinationStoreId="INV FUTURO",
        )
        destination = self.make_talonario(destination_id)
        database = self.FakeDatabase([self.row(source_id, source)])

        validate_talonario_assignment(database, "tenant-default", destination_id, destination)

    def test_sale_updates_talonario_consecutively_without_regressing(self):
        class FakeResult:
            def __init__(self, rows=None):
                self.rows = rows or []

            def fetchall(self):
                return self.rows

        class FakeDatabase:
            def __init__(self, item):
                self.item = item

            def execute(self, query, params=()):
                if query.startswith("SELECT id, data_json"):
                    return FakeResult([(
                        self.item["id"],
                        json.dumps(self.item),
                    )])
                if query.startswith("UPDATE domain_records SET data_json"):
                    self.item = json.loads(params[0])
                    return FakeResult()
                raise AssertionError(f"Unexpected query: {query}")

        database = FakeDatabase({
            "id": "TAL-90001",
            "type": "REMISION",
            "startNumber": 90001,
            "endNumber": 90050,
            "currentNumber": 90001,
            "status": "EN_USO",
        })
        with patch("server._postgres_enabled", return_value=False):
            first = _update_talonario_for_sale(
                database,
                "tenant-default",
                {"invoiceNumber": "90005", "documentType": "REMISION"},
            )
            second = _update_talonario_for_sale(
                database,
                "tenant-default",
                {"invoiceNumber": "90003", "documentType": "REMISION"},
            )

        self.assertEqual(first["currentNumber"], 90005)
        self.assertEqual(first["consecutiveBaseline"], 90001)
        self.assertEqual(second["currentNumber"], 90005)
        self.assertEqual(database.item["currentNumber"], 90005)


if __name__ == "__main__":
    unittest.main()
