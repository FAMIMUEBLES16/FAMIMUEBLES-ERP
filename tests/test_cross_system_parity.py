import json
import os
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = os.environ.get("FAMIMUEBLES_PARITY_BASE_URL", "").rstrip("/")
TOKEN = os.environ.get("FAMIMUEBLES_PARITY_TOKEN", "")


@unittest.skipUnless(BASE_URL and TOKEN, "Define FAMIMUEBLES_PARITY_BASE_URL y FAMIMUEBLES_PARITY_TOKEN para pruebas cruzadas")
class CrossSystemParityTests(unittest.TestCase):
    def request(self, path):
        request = Request(
            f"{BASE_URL}{path}",
            headers={"Authorization": f"Bearer {TOKEN}", "X-Tenant-ID": "tenant-default"},
        )
        try:
            with urlopen(request, timeout=10) as response:
                return response.status, json.load(response)
        except (HTTPError, URLError) as error:
            self.fail(f"API ERP no disponible para paridad: {error}")

    def test_shared_collections_are_readable(self):
        for path in ("/api/parity/nomina", "/api/parity/conteos", "/api/parity/sistecredito"):
            status, payload = self.request(path)
            self.assertEqual(status, 200)
            self.assertIsInstance(payload.get("items"), list)

    def test_specialized_reports_are_readable(self):
        for name in ("disponibilidad", "inventario-bajo", "sistecredito", "gastos", "gasolina", "historial-empleado"):
            status, payload = self.request(f"/api/parity/report/{name}")
            self.assertEqual(status, 200)
            self.assertEqual(payload.get("report"), name)
            self.assertIsInstance(payload.get("items"), list)


if __name__ == "__main__":
    unittest.main()
