"""Run against local, disposable Aslibooks API and web servers. See docs/integration-testing.md."""
from pathlib import Path
import os
from uuid import uuid4
from playwright.sync_api import expect, sync_playwright


def test_chart():
    run = uuid4().hex[:12]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1100, "height": 850})
        def assert_no_horizontal_overflow():
            assert page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth"), "Page overflows the viewport horizontally"
        try:
            page.goto(os.environ.get("ASLIBOOKS_WEB_URL", "http://127.0.0.1:5176"))
            page.wait_for_load_state("networkidle", timeout=90000)
            page.get_by_role("button", name="Create account", exact=True).click()
            page.get_by_label("Full name").fill("Test Owner")
            page.get_by_label("Email", exact=False).fill(f"chart-{run}@example.com")
            page.get_by_label("Password").fill(f"Fixture-{run}!")
            page.get_by_role("button", name="Create account", exact=True).click()
            page.get_by_label("Business name").fill(f"Fixture Shop {run}")
            page.get_by_role("button", name="Create workspace").click()
            primary_navigation = page.get_by_role("navigation", name="Primary navigation")
            expect(primary_navigation.get_by_role("button", name="Overview", exact=True)).to_have_attribute("aria-current", "page")
            page.get_by_role("button", name="Overview", exact=True).focus()
            page.keyboard.press("Tab")
            sales_navigation = primary_navigation.get_by_role("button", name="Sales", exact=True)
            expect(sales_navigation).to_be_focused()
            page.keyboard.press("Enter")
            expect(page.get_by_role("heading", name="Sales", exact=True)).to_be_visible()
            expect(sales_navigation).to_have_attribute("aria-current", "page")
            page.get_by_role("button", name="Accounting", exact=True).click()
            page.get_by_role("button", name="Add starter chart").click()
            expect(page.get_by_text("Added 25 starter accounts", exact=False)).to_be_visible()
            page.get_by_role("button", name="Opening balances", exact=True).click()
            page.get_by_label("Account 1").click()
            page.get_by_role("option", name="1000 · Cash on hand (asset)").click()
            page.get_by_label("Amount (INR) · Debit").fill("100.00")
            page.get_by_label("Account 2").click()
            page.get_by_role("option", name="3000 · Owner capital (equity)").click()
            page.get_by_label("Amount (INR) · Credit").fill("100.00")
            page.get_by_role("button", name="Review opening balances").click()
            page.get_by_role("button", name="Confirm and post").click()
            expect(page.get_by_text("Opening balances posted to the ledger", exact=False)).to_be_visible()
            page.get_by_role("button", name="Settings", exact=True).click()
            page.get_by_label("Business name").fill(f"Fixture Shop {run} Books")
            page.locator("form").get_by_label("GSTIN (optional)").fill("22AAAAA0000A1Z5")
            page.get_by_role("button", name="Save settings").click()
            expect(page.get_by_text("Organization settings saved.")).to_be_visible()
            page.get_by_role("button", name="Accounting", exact=True).click()
            page.get_by_label("Account code").fill("E2E-BANK")
            page.get_by_label("Account name").fill("Operating bank")
            page.get_by_role("button", name="Create account").click()
            expect(page.get_by_role("heading", name="E2E-BANK · Operating bank")).to_be_visible()
            page.get_by_label("Account code").fill("E2E-EXP")
            page.get_by_label("Account name").fill("Office expenses")
            page.get_by_label("Account type").click()
            page.get_by_role("option", name="expense", exact=True).click()
            page.get_by_label("Account group").click()
            page.get_by_role("option", name="Cost of sales", exact=True).click()
            page.get_by_role("button", name="Create account").click()
            expect(page.get_by_role("heading", name="E2E-EXP · Office expenses")).to_be_visible()
            expense_card = page.get_by_role("heading", name="E2E-EXP · Office expenses").locator("..")
            expect(expense_card.get_by_text("Cost of sales · expense · Normal balance: debit · Active", exact=True)).to_be_visible()
            page.get_by_role("heading", name="E2E-BANK · Operating bank").locator("..").get_by_role("button", name="Rename").click()
            page.get_by_label("Account name").fill("Current account")
            page.get_by_role("button", name="Save name").click()
            expect(page.get_by_role("heading", name="E2E-BANK · Current account")).to_be_visible()
            page.set_viewport_size({"width": 390, "height": 844})
            page.reload()
            assert_no_horizontal_overflow()
            mobile_navigation_button = page.get_by_role("button", name="Open navigation")
            expect(mobile_navigation_button).to_have_attribute("aria-expanded", "false")
            mobile_navigation_button.click()
            expect(page.get_by_role("button", name="Accounting", exact=True)).to_be_visible()
            page.keyboard.press("Escape")
            expect(page.get_by_role("button", name="Open navigation")).to_have_attribute("aria-expanded", "false")
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Accounting", exact=True).click()
            assert_no_horizontal_overflow()
            page.get_by_role("heading", name="E2E-BANK · Current account").locator("..").get_by_role("button", name="Archive", exact=True).click()
            expect(page.get_by_text("Current asset · asset · Normal balance: debit · Archived", exact=True)).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Contacts", exact=True).click()
            assert_no_horizontal_overflow()
            page.locator("form").get_by_label("Name").fill("Test Customer")
            page.locator("form").get_by_label("Email").fill(f"customer-{run}@example.com")
            page.locator("form").get_by_label("Phone").fill("+91 9876543210")
            page.locator("form").get_by_label("GSTIN (optional)").fill("22AAAAA0000A1Z5")
            page.locator("form").get_by_label("Billing address").fill("1 Harbor Road, Mumbai")
            page.locator("form").get_by_role("checkbox", name="Customer").check()
            page.get_by_role("button", name="Save contact").click()
            expect(page.get_by_role("heading", name="Test Customer")).to_be_visible()
            expect(page.get_by_text("GSTIN: 22AAAAA0000A1Z5")).to_be_visible()
            page.get_by_role("heading", name="Test Customer").locator("..").get_by_role("button", name="Edit details").click()
            page.get_by_label("Billing address").last.fill("2 New Harbor Road, Mumbai")
            page.get_by_role("button", name="Save changes").click()
            expect(page.get_by_text("Billing address: 2 New Harbor Road, Mumbai")).to_be_visible()
            page.locator("form").get_by_label("Name").fill("Test Vendor")
            page.locator("form").get_by_label("Email").fill(f"vendor-{run}@example.com")
            page.locator("form").get_by_role("checkbox", name="Vendor").check()
            with page.expect_response(lambda response: response.url.endswith("/contacts") and response.request.method == "POST") as vendor_response:
                page.get_by_role("button", name="Save contact").click()
            assert vendor_response.value.status == 201, vendor_response.value.text()
            page.reload()
            page.wait_for_load_state("networkidle", timeout=90000)
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Contacts", exact=True).click()
            expect(page.get_by_role("heading", name="Test Vendor")).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Products", exact=True).click()
            page.get_by_label("Code", exact=False).first.fill("E2E-SERVICE")
            page.get_by_label("Name", exact=False).first.fill("Consulting service")
            page.locator("input[maxlength=\"24\"]").fill("hour")
            page.get_by_label("Unit price (₹)").fill("50.00")
            page.get_by_role("button", name="Save service").click()
            expect(page.get_by_text("E2E-SERVICE · Consulting service")).to_be_visible()
            page.get_by_role("button", name="Edit service").click()
            page.locator("#edit-service-form").get_by_label("Unit", exact=False).first.fill("hours")
            page.get_by_role("button", name="Save service changes").click()
            expect(page.get_by_text("₹50.00 / hours", exact=True)).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Sales", exact=True).click()
            assert_no_horizontal_overflow()
            page.get_by_label("Customer").click()
            page.get_by_role("option", name="Test Customer").click()
            page.get_by_label("Service").click()
            page.get_by_role("option", name="E2E-SERVICE · Consulting service").click()
            due_date = page.evaluate("new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())")
            page.get_by_label("Due date").fill(due_date)
            draft_keys = []
            def lose_invoice_draft_response(route):
                if route.request.method != "POST":
                    route.continue_()
                    return
                payload = route.request.post_data_json
                draft_keys.append(payload["idempotencyKey"])
                response = route.fetch()
                if len(draft_keys) == 1:
                    route.abort()
                else:
                    route.fulfill(response=response)
            page.route("**/api/organizations/*/invoices", lose_invoice_draft_response)
            page.get_by_role("button", name="Save draft").click()
            expect(page.get_by_role("alert").filter(has_text="Failed to fetch")).to_be_visible()
            with page.expect_response(lambda response: response.url.endswith("/invoices") and response.request.method == "POST") as draft_retry_response:
                page.get_by_role("button", name="Save draft").click()
            assert draft_retry_response.value.status == 200, draft_retry_response.value.text()
            assert draft_retry_response.value.json()["replayed"] is True
            assert len(draft_keys) == 2 and draft_keys[0] == draft_keys[1]
            page.unroute("**/api/organizations/*/invoices", lose_invoice_draft_response)
            expect(page.get_by_text("Draft saved. No journal or income has been recorded.")).to_be_visible()
            page.get_by_role("button", name="Review and issue").click()
            issue_keys = []
            def lose_invoice_issue_response(route):
                if route.request.method != "POST":
                    route.continue_()
                    return
                issue_keys.append(route.request.post_data_json["idempotencyKey"])
                response = route.fetch()
                if len(issue_keys) == 1:
                    route.abort()
                else:
                    route.fulfill(response=response)
            page.route("**/api/organizations/*/invoices/*/issue", lose_invoice_issue_response)
            page.get_by_role("button", name="Confirm and issue").click()
            expect(page.locator('[role="alert"]').filter(has_text="Failed to fetch")).to_be_visible()
            with page.expect_response(lambda response: response.url.endswith("/issue") and response.request.method == "POST") as issue_retry:
                page.get_by_role("button", name="Confirm and issue").click()
            assert issue_retry.value.status == 200, issue_retry.value.text()
            assert issue_retry.value.json()["replayed"] is True
            assert len(issue_keys) == 2 and issue_keys[0] == issue_keys[1]
            page.unroute("**/api/organizations/*/invoices/*/issue", lose_invoice_issue_response)
            expect(page.get_by_text("issued and posted to the ledger.", exact=False)).to_be_visible()
            page.get_by_role("button", name="Attachments", exact=True).first.click()
            expect(page.get_by_text("No attachments yet.", exact=True)).to_be_visible()
            attachment_bytes = b"%PDF-1.7\nAslibooks E2E source document\n%%EOF"
            page.locator('input[type="file"]').set_input_files({"name": "invoice-source.pdf", "mimeType": "application/pdf", "buffer": attachment_bytes})
            page.get_by_role("button", name="Upload privately").click()
            expect(page.get_by_text("invoice-source.pdf uploaded privately.", exact=True)).to_be_visible()
            with page.expect_download() as attachment_download:
                page.get_by_role("button", name="Download", exact=True).click()
            assert Path(attachment_download.value.path()).read_bytes() == attachment_bytes
            page.get_by_role("button", name="Issue credit note").click()
            page.get_by_label("Credit amount (INR)").fill("5.00")
            page.get_by_label("Reason").fill("Scope adjustment")
            page.get_by_role("button", name="Confirm and issue").click()
            expect(page.get_by_text("Credit note issued for ₹5.00", exact=False)).to_be_visible()
            page.get_by_role("button", name="Print invoice").click()
            expect(page.get_by_text("Consulting service × 1 hours")).to_be_visible()
            with page.expect_popup() as print_page_info:
                page.get_by_role("button", name="Print", exact=True).click()
            print_page = print_page_info.value
            expect(print_page.get_by_role("heading", name="Invoice ASL/")).to_be_visible()
            expect(print_page.locator("body")).to_contain_text("Credits: ₹5.00")
            expect(print_page.locator("body")).to_contain_text("Balance due: ₹45.00")
            print_page.close()
            page.get_by_role("button", name="Close", exact=True).click()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Products", exact=True).click()
            page.get_by_role("button", name="Archive service", exact=True).first.click()
            expect(page.get_by_role("heading", name="Archive service?")).to_be_visible()
            page.get_by_role("button", name="Confirm archive", exact=True).click()
            expect(page.get_by_text("E2E-SERVICE · Consulting service", exact=True)).not_to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Receipts", exact=True).click()
            amount_field = page.get_by_label("Amount received (₹)", exact=False).first
            expect(amount_field).to_be_enabled()
            expect(amount_field).to_have_value("45.00")
            amount_field.fill("20.00")
            page.get_by_role("button", name="Review receipt").click()
            receipt_keys = []
            def lose_receipt_response(route):
                if route.request.method != "POST":
                    route.continue_()
                    return
                receipt_keys.append(route.request.post_data_json["idempotencyKey"])
                if len(receipt_keys) == 1:
                    route.abort()
                else:
                    route.continue_()
            page.route("**/api/organizations/*/receipts", lose_receipt_response)
            page.get_by_role("button", name="Confirm and record").click()
            expect(page.locator('[role="alert"]').filter(has_text="Failed to fetch")).to_be_visible()
            with page.expect_response(lambda response: response.url.endswith("/receipts") and response.request.method == "POST") as receipt_retry:
                page.get_by_role("button", name="Confirm and record").click()
            assert receipt_retry.value.status == 201, receipt_retry.value.text()
            assert receipt_retry.value.json()["replayed"] is False
            assert len(receipt_keys) == 2 and receipt_keys[0] == receipt_keys[1]
            page.unroute("**/api/organizations/*/receipts", lose_receipt_response)
            expect(page.get_by_text("₹20.00 received and allocated", exact=False)).to_be_visible()
            amount_field.fill("25.00")
            page.get_by_role("button", name="Review receipt").click()
            page.get_by_role("button", name="Confirm and record").click()
            expect(page.get_by_text("₹25.00 received and allocated", exact=False)).to_be_visible()
            expect(page.get_by_text("No issued invoices have an outstanding balance.")).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Products", exact=True).click()
            page.get_by_label("Code", exact=False).first.fill("E2E-TAX-SERVICE")
            page.get_by_label("Name", exact=False).first.fill("Tax review service")
            page.get_by_label("Unit price (₹)").fill("10.00")
            page.get_by_label("HSN/SAC code").fill("998314")
            page.get_by_label("Tax category").click()
            page.get_by_role("option", name="Taxable", exact=True).click()
            page.get_by_label("Configured total rate (%)").fill("18")
            page.get_by_role("button", name="Save service").click()
            expect(page.get_by_text("E2E-TAX-SERVICE · Tax review service")).to_be_visible()
            page.get_by_role("button", name="Edit service", exact=True).last.click()
            page.locator("#edit-service-form").get_by_label("HSN/SAC code").fill("998315")
            page.locator("#edit-service-form").get_by_label("Configured total rate (%)").fill("12")
            page.get_by_role("button", name="Save service changes").click()
            expect(page.get_by_text("HSN/SAC 998315 · taxable · 12.00% configured", exact=True)).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Sales", exact=True).click()
            page.get_by_label("Customer").click()
            page.get_by_role("option", name="Test Customer").click()
            page.get_by_label("Service").click()
            page.get_by_role("option", name="E2E-TAX-SERVICE · Tax review service").click()
            page.get_by_role("button", name="Add service line").click()
            page.get_by_label("Service 2").click()
            page.get_by_role("option", name="E2E-TAX-SERVICE · Tax review service").click()
            page.get_by_label("Quantity 2").fill("2")
            page.get_by_label("Configured tax price basis").click()
            page.get_by_role("option", name="Price excludes configured tax").click()
            page.get_by_label("Place-of-supply state code").fill("29")
            with page.expect_response(lambda response: response.url.endswith("/invoices") and response.request.method == "POST") as tax_draft_response:
                page.get_by_role("button", name="Save draft").click()
            assert tax_draft_response.value.status == 201, tax_draft_response.value.text()
            assert len(tax_draft_response.value.request.post_data_json["lines"]) == 2
            expect(page.get_by_text("Tax-bearing drafts are retained for review", exact=False)).to_be_visible()
            expect(page.get_by_text("Taxable ₹30.00", exact=False)).to_be_visible()
            expect(page.get_by_role("button", name="Tax review required before issue")).to_be_disabled()
            expect(page.get_by_text("Draft invoice · Test Customer")).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Expenses", exact=True).click()
            assert_no_horizontal_overflow()
            bill_source = "Test Vendor invoice AI-42. Total INR 12.34 for monthly office supplies. Due date 30 November 2026."
            page.get_by_label("Paste bill text").fill(bill_source)
            ai_suggest_button = page.get_by_role("button", name="Suggest bill fields")
            expect(ai_suggest_button).to_be_disabled()
            consent_checkbox = page.get_by_role("checkbox", name="I consent to send this text to OpenAI to produce a bill suggestion.")
            consent_checkbox.focus()
            consent_checkbox.press("Space")
            expect(consent_checkbox).to_be_checked()
            ai_requests = []
            bill_writes_during_ai = []
            def track_bill_write(request):
                if request.method == "POST" and request.url.rstrip("/").endswith("/bills"):
                    bill_writes_during_ai.append(request.url)
            page.on("request", track_bill_write)
            def suggest_bill_fields(route):
                ai_requests.append(route.request.post_data_json)
                tax_status = "present" if len(ai_requests) == 1 else "none_seen"
                route.fulfill(status=200, content_type="application/json", body=f'{{"vendorName":"Test Vendor","vendorReference":"AI-42","description":"Monthly office supplies","amountPaise":1234,"dueDate":"2026-11-30","currency":"INR","taxStatus":"{tax_status}","confidence":"high","uncertainties":[]}}')
            page.route("**/api/organizations/*/bills/ai-draft-assistance", suggest_bill_fields)
            with page.expect_response(lambda response: response.url.endswith("/bills/ai-draft-assistance")) as ai_response:
                ai_suggest_button.focus()
                ai_suggest_button.press("Enter")
            assert ai_response.value.status == 200 and ai_requests == [{"sourceText": bill_source}]
            expect(page.get_by_text("Suggested vendor: Test Vendor · confidence: high")).to_be_visible()
            expect(page.get_by_role("button", name="Copy eligible suggestions into editable fields")).to_be_disabled()
            expect(page.get_by_text("Tax is present or unclear", exact=False)).to_be_visible()
            with page.expect_response(lambda response: response.url.endswith("/bills/ai-draft-assistance")) as second_ai_response:
                ai_suggest_button.click()
            assert second_ai_response.value.status == 200 and len(ai_requests) == 2
            assert bill_writes_during_ai == []
            expect(page.get_by_role("button", name="Copy eligible suggestions into editable fields")).to_be_enabled()
            expect(page.get_by_role("button", name="Save bill draft")).to_have_count(1)
            page.get_by_role("button", name="Copy eligible suggestions into editable fields").click()
            expect(page.get_by_text("Suggestions copied into editable fields", exact=False)).to_be_visible()
            assert bill_writes_during_ai == []
            page.unroute("**/api/organizations/*/bills/ai-draft-assistance", suggest_bill_fields)
            def unavailable_bill_assistance(route):
                route.fulfill(status=503, content_type="application/json", body='{"error":"AI bill assistance is not configured."}')
            page.route("**/api/organizations/*/bills/ai-draft-assistance", unavailable_bill_assistance)
            with page.expect_response(lambda response: response.url.endswith("/bills/ai-draft-assistance")) as unavailable_response:
                page.get_by_role("button", name="Suggest bill fields").click()
            assert unavailable_response.value.status == 503
            expect(page.get_by_role("alert").filter(has_text="AI bill assistance is not configured.")).to_be_visible()
            expect(page.get_by_role("button", name="Save bill draft")).to_be_enabled()
            assert bill_writes_during_ai == []
            page.remove_listener("request", track_bill_write)
            page.unroute("**/api/organizations/*/bills/ai-draft-assistance", unavailable_bill_assistance)
            page.get_by_role("combobox", name="Vendor", exact=True).first.click()
            page.get_by_role("option", name="Test Vendor").click()
            page.get_by_label("Vendor bill reference").fill(f"V-{run}")
            page.get_by_label("Expense category").click()
            page.get_by_role("option", name="E2E-EXP · Office expenses").click()
            page.get_by_label("Description").fill("Monthly office supplies")
            page.get_by_role("spinbutton", name="Amount (INR)", exact=True).fill("12.34")
            bill_draft_keys = []
            def lose_bill_draft_response(route):
                if route.request.method != "POST":
                    route.continue_()
                    return
                bill_draft_keys.append(route.request.post_data_json["idempotencyKey"])
                response = route.fetch()
                if len(bill_draft_keys) == 1:
                    route.abort()
                else:
                    route.fulfill(response=response)
            page.route("**/api/organizations/*/bills", lose_bill_draft_response)
            page.get_by_role("button", name="Save bill draft").click()
            expect(page.get_by_role("alert").filter(has_text="Failed to fetch")).to_be_visible()
            with page.expect_response(lambda response: response.url.endswith("/bills") and response.request.method == "POST") as bill_retry:
                page.get_by_role("button", name="Save bill draft").click()
            assert bill_retry.value.status == 200, bill_retry.value.text()
            assert bill_retry.value.json()["replayed"] is True
            assert len(bill_draft_keys) == 2 and bill_draft_keys[0] == bill_draft_keys[1]
            page.unroute("**/api/organizations/*/bills", lose_bill_draft_response)
            expect(page.get_by_text("Bill draft saved. It has not affected the ledger.")).to_be_visible()
            expect(page.get_by_text(f"V-{run} · Test Vendor")).to_be_visible()
            page.get_by_role("button", name="Review and post").click()
            page.get_by_role("button", name="Confirm and post").click()
            expect(page.get_by_text("posted to accounts payable.", exact=False)).to_be_visible()
            expect(page.get_by_text("Loading bills…")).not_to_be_visible()
            page.get_by_role("button", name="Issue vendor credit").click()
            page.get_by_label("Credit amount (INR)").fill("2.00")
            page.get_by_label("Reason").fill("Returned supplies")
            credit_keys = []
            def lose_vendor_credit_response(route):
                if route.request.method != "POST":
                    route.continue_()
                    return
                credit_keys.append(route.request.post_data_json["idempotencyKey"])
                response = route.fetch()
                if len(credit_keys) == 1:
                    route.abort()
                else:
                    route.fulfill(response=response)
            page.route("**/api/organizations/*/bills/*/credit-notes", lose_vendor_credit_response)
            page.get_by_role("button", name="Confirm and issue").click()
            expect(page.locator('[role="alert"]').filter(has_text="Failed to fetch")).to_be_visible()
            with page.expect_response(lambda response: response.url.endswith("/bills") and response.request.method == "GET"):
                with page.expect_response(lambda response: response.url.endswith("/credit-notes") and response.request.method == "POST") as credit_retry:
                    page.get_by_role("button", name="Confirm and issue").click()
            assert credit_retry.value.status == 200, credit_retry.value.text()
            assert credit_retry.value.json()["replayed"] is True
            assert len(credit_keys) == 2 and credit_keys[0] == credit_keys[1]
            page.unroute("**/api/organizations/*/bills/*/credit-notes", lose_vendor_credit_response)
            expect(page.get_by_text("Vendor credit of ₹2.00 issued", exact=False)).to_be_visible()
            expect(page.get_by_role("button", name="Record payment")).to_be_visible()
            page.get_by_role("button", name="Record payment").click(force=True)
            expect(page.get_by_role("heading", name="Record vendor payment")).to_be_visible()
            payment_amount = page.get_by_label("Amount paid (INR)")
            payment_amount.fill("6.17")
            with page.expect_response(lambda response: response.url.endswith("/bills") and response.request.method == "GET"):
                with page.expect_response(lambda response: response.url.endswith("/vendor-payments") and response.request.method == "POST") as partial_payment_response:
                    page.get_by_role("button", name="Review and record payment").click(force=True)
            assert partial_payment_response.value.status == 201, partial_payment_response.value.text()
            expect(page.get_by_text("₹6.17 paid to Test Vendor", exact=False)).to_be_visible()
            expect(page.get_by_role("heading", name="Record vendor payment")).not_to_be_visible()
            expect(page.get_by_text("Loading bills…")).not_to_be_visible()
            expect(page.get_by_role("button", name="Record payment")).to_be_visible()
            page.get_by_role("button", name="Record payment").click(force=True)
            expect(page.get_by_role("heading", name="Record vendor payment")).to_be_visible()
            payment_amount = page.get_by_label("Amount paid (INR)")
            payment_amount.fill("4.17")
            expect(page.get_by_role("button", name="Review and record payment")).to_be_enabled()
            with page.expect_response(lambda response: response.url.endswith("/bills") and response.request.method == "GET"):
                with page.expect_response(lambda response: response.url.endswith("/vendor-payments") and response.request.method == "POST") as final_payment_response:
                    page.get_by_role("button", name="Review and record payment").click(force=True)
            assert final_payment_response.value.status == 201, final_payment_response.value.text()
            expect(page.get_by_text("₹4.17 paid to Test Vendor", exact=False)).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Accounting", exact=True).click()
            page.get_by_role("button", name="Journals", exact=True).click()
            page.get_by_label("Description", exact=False).fill("Opening cash entry")
            page.get_by_label("Account", exact=False).nth(0).click()
            page.get_by_role("option", name="1000 · Cash on hand").click()
            page.get_by_label("Account", exact=False).nth(1).click()
            page.get_by_role("option", name="3000 · Owner capital").click()
            page.get_by_label("Amount (INR)").nth(0).fill("125.00")
            page.get_by_label("Amount (INR)").nth(1).fill("125.00")
            with page.expect_response(lambda response: response.url.endswith("/journals/drafts") and response.request.method == "POST") as journal_draft_response:
                page.get_by_role("button", name="Save journal draft").click()
            assert journal_draft_response.value.status == 201, journal_draft_response.value.text()
            expect(page.get_by_role("heading", name="Saved journal drafts")).to_be_visible()
            expect(page.get_by_text("Opening cash entry", exact=True)).to_be_visible()
            page.get_by_role("button", name="Review and post").click()
            with page.expect_response(lambda response: "/journals/drafts/" in response.url and response.url.endswith("/post") and response.request.method == "POST") as journal_draft_post_response:
                page.get_by_role("button", name="Confirm and post").click()
            assert journal_draft_post_response.value.status == 201, journal_draft_post_response.value.text()
            expect(page.get_by_text("Journal posted and recorded in the audit trail.")).to_be_visible()
            page.get_by_text("Opening cash entry", exact=False).locator("xpath=../..").get_by_role("button", name="View details").click()
            expect(page.get_by_text("1000 · Cash on hand — Debit ₹125.00 / Credit ₹0.00")).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Reports", exact=True).click()
            assert_no_horizontal_overflow()
            expect(page.get_by_role("heading", name="Trial balance")).to_be_visible()
            expect(page.get_by_role("heading", name="Receivables and payables aging")).to_be_visible()
            expect(page.get_by_role("heading", name="Receivable and payable control reconciliation")).to_be_visible()
            expect(page.get_by_text("Difference ₹0.00 · Reconciled", exact=False)).to_have_count(2)
            expect(page.get_by_text("Balanced", exact=True)).to_be_visible()
            expect(page.get_by_text("Net profit ₹34.66", exact=False)).to_be_visible()
            expect(page.get_by_text("Balance sheet balances", exact=True)).to_be_visible()
            with page.expect_popup() as printable_popup:
                page.get_by_role("button", name="Print reports / Save as PDF").click()
            printable_page = printable_popup.value
            expect(printable_page.get_by_role("heading", name="Financial reports")).to_be_visible()
            expect(printable_page.get_by_role("heading", name="Trial balance")).to_be_visible()
            expect(printable_page.get_by_role("heading", name="Profit and loss")).to_be_visible()
            expect(printable_page.get_by_role("heading", name="Balance sheet")).to_be_visible()
            expect(printable_page.get_by_text("Fixture Shop", exact=False)).to_be_visible()
            printable_page.close()
            with page.expect_download() as csv_download:
                page.get_by_role("button", name="Download trial balance CSV").click()
            report_download = csv_download.value
            assert report_download.suggested_filename.startswith("trial-balance-")
            downloaded_bytes = Path(report_download.path()).read_bytes()
            assert downloaded_bytes.startswith(b"\xef\xbb\xbf")
            exported = downloaded_bytes.decode("utf-8-sig")
            assert '"Account code","Account","Type","Debit paise","Credit paise"' in exported
            assert '"TOTAL"' in exported and '"Cash on hand"' in exported
            page.get_by_role("button", name="Load ledger").click()
            expect(page.get_by_text("Opening cash entry", exact=False)).to_be_visible()
            with page.expect_download() as ledger_download:
                page.get_by_role("button", name="Download full ledger CSV").click()
            ledger_bytes = Path(ledger_download.value.path()).read_bytes()
            ledger_csv = ledger_bytes.decode("utf-8-sig")
            assert '"Opening balance"' in ledger_csv and '"Opening cash entry"' in ledger_csv
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Accounting", exact=True).click()
            page.get_by_role("button", name="Journals", exact=True).click()
            page.get_by_label("Description", exact=False).fill("E2E bank statement deposit")
            page.get_by_label("Account", exact=False).nth(0).click()
            page.get_by_role("option", name="1010 · Bank account").click()
            page.get_by_label("Account", exact=False).nth(1).click()
            page.get_by_role("option", name="1000 · Cash on hand").click()
            page.get_by_label("Amount (INR)").nth(0).fill("25.00")
            page.get_by_label("Amount (INR)").nth(1).fill("25.00")
            page.get_by_role("button", name="Save journal draft").click()
            page.get_by_role("button", name="Review and post").click()
            with page.expect_response(lambda response: "/journals/drafts/" in response.url and response.url.endswith("/post") and response.request.method == "POST") as bank_journal_response:
                page.get_by_role("button", name="Confirm and post").click()
            assert bank_journal_response.value.status == 201, bank_journal_response.value.text()
            journal_id = bank_journal_response.value.json()["journalId"]
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Banking", exact=True).click()
            today = page.evaluate("new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())")
            csv = f"transactionDate,amountPaise,description\r\n{today},2500,E2E deposit\r\n"
            with page.expect_response(lambda response: response.url.endswith("/bank-statements/import") and response.request.method == "POST") as bank_import_response:
                page.locator('input[type="file"]').set_input_files({"name": "statement.csv", "mimeType": "text/csv", "buffer": csv.encode()})
            assert bank_import_response.value.status == 201, bank_import_response.value.text()
            assert bank_import_response.value.json() == {"imported": 1, "duplicates": 0}
            expect(page.get_by_text("E2E deposit", exact=True)).to_be_visible()
            page.get_by_label("Journal ID for E2E deposit").fill(journal_id)
            with page.expect_response(lambda response: response.url.endswith("/match") and response.request.method == "POST") as bank_match_response:
                page.get_by_role("button", name="Match", exact=True).click()
            assert bank_match_response.value.status == 200, bank_match_response.value.text()
            page.locator("input[type=\"date\"]:visible").nth(0).fill(today)
            page.locator("input[type=\"date\"]:visible").nth(1).fill(today)
            page.get_by_label("Opening balance (₹)").fill("0.00")
            page.get_by_label("Closing balance (₹)").fill("25.00")
            with page.expect_response(lambda response: response.url.endswith("/reconcile") and response.request.method == "POST") as bank_reconcile_response:
                page.get_by_role("button", name="Reconcile statement").click()
            assert bank_reconcile_response.value.status == 201, bank_reconcile_response.value.text()
            expect(page.get_by_text("reconciled to ledger", exact=False)).to_be_visible()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Overview", exact=True).click()
            page.locator("input[type=\"date\"]:visible").nth(0).fill(today)
            page.locator("input[type=\"date\"]:visible").nth(1).fill(today)
            expect(page.get_by_text("Ledger-derived values", exact=False)).to_be_visible()
            expect(page.get_by_text("Net profit", exact=True)).to_be_visible()
            expect(page.get_by_text("₹34.66", exact=True)).to_be_visible()
            expect(page.get_by_role("heading", name="Recent ledger activity")).to_be_visible()
            gst_products_route = "**/api/organizations/*/products*"
            def gst_product_page(route):
                if "after=" in route.request.url:
                    body = '{"products":[{"_id":"000000000000000000000002","code":"GST-PAGE-2","name":"GST pagination second page","unit":"unit","unitPricePaise":200,"taxCategory":"not_configured","active":true}],"next":null}'
                else:
                    body = '{"products":[{"_id":"000000000000000000000001","code":"GST-PAGE-1","name":"GST pagination first page","unit":"unit","unitPricePaise":100,"taxCategory":"not_configured","active":true}],"next":"000000000000000000000001"}'
                route.fulfill(status=200, content_type="application/json", body=body)
            page.route(gst_products_route, gst_product_page)
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="GST", exact=True).click()
            expect(page.get_by_role("heading", name="GST setup review")).to_be_visible()
            expect(page.get_by_text("does not certify GST compliance", exact=False)).to_be_visible()
            expect(page.get_by_text("Checked 2 active catalog items", exact=False)).to_be_visible()
            expect(page.get_by_text("GST-PAGE-1 · GST pagination first page", exact=True)).to_be_visible()
            expect(page.get_by_text("GST-PAGE-2 · GST pagination second page", exact=True)).to_be_visible()
            page.unroute(gst_products_route, gst_product_page)
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Period close", exact=True).click()
            expect(page.get_by_role("heading", name="Fiscal period close")).to_be_visible()
            expect(page.get_by_text("Posted ledger debits equal credits", exact=True)).to_be_visible()
            expect(page.get_by_text("Imported bank entries are reconciled", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Review and close period")).to_be_enabled()
            product_list_route = "**/api/organizations/*/products*"
            def product_page(route):
                if "after=" in route.request.url:
                    body = '{"products":[{"_id":"000000000000000000000002","code":"PAGE-2","name":"Pagination service two","unit":"unit","unitPricePaise":200,"taxCategory":"not_configured","active":true}],"next":null}'
                else:
                    body = '{"products":[{"_id":"000000000000000000000001","code":"PAGE-1","name":"Pagination service one","unit":"unit","unitPricePaise":100,"taxCategory":"not_configured","active":true}],"next":"000000000000000000000001"}'
                route.fulfill(status=200, content_type="application/json", body=body)
            page.route(product_list_route, product_page)
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Products", exact=True).click()
            expect(page.get_by_text("PAGE-1 · Pagination service one", exact=True)).to_be_visible()
            page.get_by_role("button", name="Load more services").click()
            expect(page.get_by_text("PAGE-2 · Pagination service two", exact=True)).to_be_visible()
            page.unroute(product_list_route)
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Contacts", exact=True).click()
            page.get_by_role("button", name="Archive contact", exact=True).first.click()
            expect(page.get_by_role("heading", name="Archive contact?")).to_be_visible()
            page.get_by_role("button", name="Confirm archive", exact=True).click()
            expect(page.get_by_role("button", name="Archive contact", exact=True)).to_have_count(1)
            page.get_by_role("button", name="Archive contact", exact=True).click()
            page.get_by_role("button", name="Confirm archive", exact=True).click()
            expect(page.get_by_text("No matching contacts.", exact=True)).to_be_visible()
            contact_list_route = "**/api/organizations/*/contacts**"
            def contact_page(route):
                if "/ledger?" in route.request.url:
                    if "after=" in route.request.url:
                        body = '{"contact":{"id":"000000000000000000000003","displayName":"Pagination contact one"},"currency":"INR","rows":[{"eventId":"advance-1","date":"2026-01-02T00:00:00.000Z","type":"customer_advance","reference":"ADV-1","description":"Customer advance received","debitPaise":0,"creditPaise":2500,"balancePaise":10000}],"openingBalancePaise":12500,"balancePaise":10000,"next":null,"subledger":{"openDocumentBalancePaise":12500,"unallocatedAdvancePaise":2500,"netBalancePaise":10000,"differencePaise":0,"reconciled":true}}'
                    else:
                        body = '{"contact":{"id":"000000000000000000000003","displayName":"Pagination contact one"},"currency":"INR","rows":[{"eventId":"invoice-1","date":"2026-01-01T00:00:00.000Z","type":"invoice","reference":"INV-1","description":"Invoice INV-1","debitPaise":12500,"creditPaise":0,"balancePaise":12500}],"openingBalancePaise":0,"balancePaise":10000,"next":"cursor2","subledger":{"openDocumentBalancePaise":12500,"unallocatedAdvancePaise":2500,"netBalancePaise":10000,"differencePaise":0,"reconciled":true}}'
                elif "after=" in route.request.url:
                    body = '{"contacts":[{"_id":"000000000000000000000004","displayName":"Pagination contact two","roles":["customer"],"active":true}],"next":null}'
                else:
                    body = '{"contacts":[{"_id":"000000000000000000000003","displayName":"Pagination contact one","roles":["customer"],"active":true}],"next":"000000000000000000000003"}'
                route.fulfill(status=200, content_type="application/json", body=body)
            page.route(contact_list_route, contact_page)
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Overview", exact=True).click()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Contacts", exact=True).click()
            expect(page.get_by_text("Pagination contact one", exact=True)).to_be_visible()
            page.get_by_role("button", name="Load more contacts").click()
            expect(page.get_by_text("Pagination contact two", exact=True)).to_be_visible()
            page.get_by_role("button", name="Customer statement").first.click()
            expect(page.get_by_text("Outstanding balance: ₹100.00", exact=True)).to_be_visible()
            expect(page.get_by_text("Statement and subledger reconcile.", exact=True)).to_be_visible()
            expect(page.get_by_text("Invoice INV-1", exact=True)).to_be_visible()
            page.get_by_role("button", name="Load more statement entries", exact=True).click()
            expect(page.get_by_text("Customer advance received", exact=True)).to_be_visible()
            with page.expect_download() as statement_download:
                page.get_by_role("button", name="Download statement CSV", exact=True).click()
            statement_bytes = Path(statement_download.value.path()).read_bytes()
            statement_csv = statement_bytes.decode("utf-8-sig")
            assert statement_bytes.startswith(b"\xef\xbb\xbf")
            assert '"Opening balance"' in statement_csv and '"Invoice INV-1"' in statement_csv and '"Customer advance received"' in statement_csv
            page.get_by_role("button", name="Close", exact=True).click()
            page.unroute(contact_list_route)
            organizations = page.evaluate("""async () => {
                const response = await fetch('http://127.0.0.1:4000/api/organizations', { credentials: 'include' });
                return response.json();
            }""")
            first_organization_id = organizations["organizations"][0]["id"]
            create_organization = page.evaluate("""async ({ name, slug }) => {
                const response = await fetch('http://127.0.0.1:4000/api/organizations', {
                    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, slug }),
                });
                return { status: response.status, body: await response.json() };
            }""", {"name": f"Isolation Check {run}", "slug": f"isolation-check-{run}"})
            assert create_organization["status"] == 201, create_organization
            second_organization_id = create_organization["body"]["id"]
            page.reload()
            organization_picker = page.get_by_label("Active organization")
            expect(organization_picker).to_be_visible()
            organization_picker.select_option(second_organization_id)
            expect(page.get_by_text("No posted journals in this date range.", exact=True)).to_be_visible()
            organization_picker.select_option(first_organization_id)
            expect(organization_picker).to_have_value(first_organization_id)
            page.route("**/api/organizations/**", lambda route: route.fulfill(status=401, content_type="application/json", body='{"error":"Unauthorized"}'), times=1)
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Reports", exact=True).click()
            expect(page.get_by_text("Your session expired. Sign in again to continue.", exact=True)).to_be_visible()
            expect(page.get_by_text("Sign in to your workspace", exact=True)).to_be_visible()
            print("Verified signup, tenant switching/isolation, starter chart/opening balances, customer/vendor/service setup, edit/archive and catalog pagination, invoice/vendor credits and print views, receipts, partial/final bill payments, account lifecycle, manual journals, bank CSV import/matching/reconciliation, date-filtered ledger dashboard, fiscal close review, session-expiry handling, responsive navigation, CSV export and reconciled reports (INR 34.66 net profit)")
        finally:
            browser.close()


if __name__ == "__main__":
    test_chart()

