import unittest

from server import canonical_request_hash, password_hash, password_matches


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


if __name__ == "__main__":
    unittest.main()