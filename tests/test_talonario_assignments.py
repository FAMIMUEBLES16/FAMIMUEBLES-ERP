import json
import unittest

from server import validate_talonario_assignment


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


if __name__ == "__main__":
    unittest.main()
