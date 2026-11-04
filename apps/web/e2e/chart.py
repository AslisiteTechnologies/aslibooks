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
            print("Verified signup, onboarding, account creation, rename, reload and mobile archive")
        finally:
            browser.close()


if __name__ == "__main__":
    test_chart()
