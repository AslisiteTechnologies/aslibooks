"""Run against local, disposable Aslibooks API and web servers. See docs/integration-testing.md."""
from uuid import uuid4
from playwright.sync_api import expect, sync_playwright


def test_chart():
    run = uuid4().hex[:12]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1100, "height": 850})
        try:
            page.goto("http://127.0.0.1:5176")
            page.wait_for_load_state("networkidle", timeout=90000)
            page.get_by_role("button", name="Create account", exact=True).click()
            page.get_by_label("Full name").fill("Test Owner")
            page.get_by_label("Email", exact=False).fill(f"chart-{run}@example.com")
            page.get_by_label("Password").fill(f"Fixture-{run}!")
            page.get_by_role("button", name="Create account", exact=True).click()
            page.get_by_label("Business name").fill(f"Fixture Shop {run}")
            page.get_by_role("button", name="Create workspace").click()
            page.get_by_role("button", name="Accounting", exact=True).click()
            page.get_by_label("Account code").fill("BANK")
            page.get_by_label("Account name").fill("Operating bank")
            page.get_by_role("button", name="Create account").click()
            expect(page.get_by_role("heading", name="BANK · Operating bank")).to_be_visible()
            page.get_by_role("button", name="Rename").click()
            page.get_by_label("Account name").fill("Current account")
            page.get_by_role("button", name="Save name").click()
            expect(page.get_by_role("heading", name="BANK · Current account")).to_be_visible()
            page.set_viewport_size({"width": 390, "height": 844})
            page.reload()
            page.get_by_role("button", name="Open navigation").click()
            page.get_by_role("button", name="Accounting", exact=True).click()
            page.get_by_role("button", name="Archive", exact=True).click()
            expect(page.get_by_text("asset · Archived", exact=True)).to_be_visible()
            page.get_by_label("Account code").fill("CASH")
            page.get_by_label("Account name").fill("Cash on hand")
            page.get_by_role("button", name="Create account").click()
            page.get_by_label("Account code").fill("CAPITAL")
            page.get_by_label("Account name").fill("Opening capital")
            page.get_by_label("Account type", exact=False).click()
            page.get_by_role("option", name="equity", exact=True).click()
            page.get_by_role("button", name="Create account").click()
            page.get_by_role("button", name="Journals", exact=True).click()
            page.get_by_label("Description", exact=False).fill("Opening cash entry")
            page.get_by_label("Account", exact=False).nth(0).click()
            page.get_by_role("option", name="CASH · Cash on hand").click()
            page.get_by_label("Account", exact=False).nth(1).click()
            page.get_by_role("option", name="CAPITAL · Opening capital").click()
            page.get_by_label("Amount (INR)").nth(0).fill("125.00")
            page.get_by_label("Amount (INR)").nth(1).fill("125.00")
            page.get_by_role("button", name="Review journal").click()
            page.get_by_role("button", name="Confirm and post").click()
            expect(page.get_by_text("Journal posted and recorded in the audit trail.")).to_be_visible()
            page.get_by_role("button", name="View details").click()
            expect(page.get_by_text("CASH · Cash on hand — Debit ₹125.00 / Credit ₹0.00")).to_be_visible()
            print("Verified signup, onboarding, account lifecycle, mobile navigation and human-confirmed journal posting")
        finally:
            browser.close()


if __name__ == "__main__":
    test_chart()
