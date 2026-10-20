from server import (
    _build_purchase_payable,
    _purchase_can_be_received,
    _sequence_number,
    match_purchase_payables,
    update_purchase_payable,
)


def payable(account_id, purchase_id, invoice, supplier, paid=0):
    return (
        {"id": account_id},
        {
            "id": account_id,
            "purchaseId": purchase_id,
            "invoiceNumber": invoice,
            "supplierName": supplier,
            "totalAmount": 1300506,
            "paidAmount": paid,
            "balance": 1300506 - paid,
            "status": "PARCIAL" if paid else "PENDIENTE",
        },
    )


def test_purchase_payable_finds_invoice_when_purchase_reference_is_legacy():
    expected = payable("CXP-00018", "COM-00002", "BV1O3500640", "MEICO S.A")
    unrelated = payable("CXP-00019", "COM-00003", "OTRA-FACTURA", "OTRO PROVEEDOR")

    matches = match_purchase_payables(
        [expected, unrelated], {"1038"}, "BV1O3500640", "MEICO S.A"
    )

    assert matches == [expected]


def test_purchase_payable_update_recalculates_balance_and_preserves_abonos():
    account = payable("CXP-00018", "COM-00002", "BV1O3500640", "MEICO S.A", 100000)[1]

    update_purchase_payable(
        account, 2601012, "SUP-00009", "MEICO S.A", "INV CRR 5 3 26", "BV1O3500640"
    )

    assert account["totalAmount"] == 2601012
    assert account["paidAmount"] == 100000
    assert account["balance"] == 2501012
    assert account["status"] == "PARCIAL"


def test_purchase_payable_does_not_guess_between_duplicate_invoice_matches():
    accounts = [
        payable("CXP-1", "COM-1", "BV1O3500640", "MEICO S.A"),
        payable("CXP-2", "COM-2", "BV1O3500640", "MEICO S.A"),
    ]

    assert match_purchase_payables(
        accounts, {"1038"}, "BV1O3500640", "MEICO S.A"
    ) == []


def test_purchase_sequence_parsing_ignores_non_matching_ids():
    assert _sequence_number("COM-00104", "COM") == 104
    assert _sequence_number("COM-00002", "CXP") == 0
    assert _sequence_number("entrada-967", "COM") == 0


def test_new_draft_purchase_can_be_received_immediately():
    assert _purchase_can_be_received("BORRADOR")
    assert _purchase_can_be_received("ordenada")
    assert not _purchase_can_be_received("RECIBIDA")
    assert not _purchase_can_be_received("CANCELADA")


def test_received_credit_purchase_payable_uses_due_date_and_full_total():
    purchase = {
        "id": "COM-00104",
        "supplierId": "SUP-00009",
        "supplierName": "MEICO S.A",
        "storeId": "INV CRR 5 3 26",
        "supplierInvoice": "BV1O3500640",
        "createdAt": "2026-10-20T08:00:00Z",
        "paymentMethod": "Credito",
    }

    account = _build_purchase_payable("CXP-00019", purchase, 2601012, "2026-12-08")

    assert account["purchaseId"] == "COM-00104"
    assert account["dueDate"] == "2026-12-08"
    assert account["totalAmount"] == 2601012
    assert account["balance"] == 2601012
    assert account["status"] == "PENDIENTE"
