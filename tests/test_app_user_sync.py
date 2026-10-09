import unittest

import server


class SharedAppUserSyncTests(unittest.TestCase):
    class FakeDatabase:
        def __init__(self):
            self.statements = []
            self.rowcount = 0
            self.schema = [
                {"table_name": "empleados", "column_name": "id_telegram", "data_type": "text"},
                {"table_name": "empleados", "column_name": "nombre", "data_type": "text"},
                {"table_name": "empleados", "column_name": "rol", "data_type": "text"},
                {"table_name": "empleados", "column_name": "local_asignado", "data_type": "text"},
                {"table_name": "empleados", "column_name": "activo", "data_type": "text"},
                {"table_name": "administradores", "column_name": "id_telegram", "data_type": "text"},
                {"table_name": "administradores", "column_name": "nombre", "data_type": "text"},
                {"table_name": "administradores", "column_name": "rol", "data_type": "text"},
                {"table_name": "administradores", "column_name": "activo", "data_type": "boolean"},
            ]
            self.rows = {
                "empleados": [
                    {"id_telegram": "10001", "nombre": "Ana", "rol": "VENDEDOR", "local_asignado": "Norte", "activo": "NO"},
                ],
                "administradores": [
                    {"id_telegram": "20001", "nombre": "Luis", "rol": "ADMINISTRADOR", "activo": True},
                ],
            }

        def execute(self, query, params=()):
            self.statements.append((query, params))
            if query.startswith("UPDATE "):
                table_name = query.split()[1]
                self.rowcount = int(any(
                    str(row.get("id_telegram")) == str(params[-1])
                    for row in self.rows.get(table_name, [])
                ))
            else:
                self.rowcount = 0
            if "information_schema.columns" in query:
                return self
            if query.startswith("SELECT * FROM "):
                self.result = self.rows[query.split()[3]]
                return self
            return self

        def fetchall(self):
            if self.statements[-1][0].startswith("SELECT * FROM "):
                return self.result
            return self.schema

    def test_shared_users_include_inactive_employees_and_administrators(self):
        database = self.FakeDatabase()

        users = server._shared_app_user_items(database)

        self.assertEqual(
            [(user["id"], user["name"], user["active"], user["status"]) for user in users],
            [
                ("10001", "Ana", False, "Inactivo"),
                ("20001", "Luis", True, "Activo"),
            ],
        )

    def test_erp_status_changes_sync_to_app_tables(self):
        database = self.FakeDatabase()

        updated = server._sync_shared_app_user(database, "10001", False, "Ana Updated", "SUPERVISOR", "Sur")

        self.assertTrue(updated)
        updates = [(query, params) for query, params in database.statements if query.startswith("UPDATE ")]
        self.assertEqual(len(updates), 2)
        self.assertIn("UPDATE empleados SET activo = %s, nombre = %s, rol = %s, local_asignado = %s", updates[0][0])
        self.assertEqual(updates[0][1], ("NO", "Ana Updated", "SUPERVISOR", "Sur", "10001"))
        self.assertIn("UPDATE administradores SET activo = %s, nombre = %s, rol = %s", updates[1][0])
        self.assertEqual(updates[1][1], (False, "Ana Updated", "SUPERVISOR", "10001"))

    def test_erp_status_sync_reports_unknown_employee(self):
        database = self.FakeDatabase()

        updated = server._sync_shared_app_user(database, "missing-id", False, "Missing", "VENDEDOR", "Sur")

        self.assertFalse(updated)


if __name__ == "__main__":
    unittest.main()
