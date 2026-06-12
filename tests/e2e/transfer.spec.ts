import { expect, test } from "@playwright/test";

// Depo yönetimi smoke testi: depo oluştur + listede gör + sil.
// (Gerçek lot transferi seed lot gerektirir; RPC kuralları DB'de zorlanır.)
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("depolar ve transfer", () => {
  test.skip(!email || !password, "E2E_EMAIL / E2E_PASSWORD tanımlı değil");

  test("depo oluştur, varsayılan korunur, boş depo silinir", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-posta").fill(email!);
    await page.getByLabel("Şifre").fill(password!);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page).toHaveURL(/\/c\//, { timeout: 15_000 });

    const companyId = page.url().match(/\/c\/([0-9a-f-]+)/)?.[1];
    expect(companyId).toBeTruthy();

    await page.goto(`/c/${companyId}/settings/locations`);
    await expect(
      page.getByRole("heading", { name: "Depolar" }),
    ).toBeVisible();
    await expect(page.getByText("Varsayılan", { exact: true })).toBeVisible();

    const code = `E2E${String(Date.now()).slice(-6)}`;
    await page.getByLabel("Kod *").fill(code);
    await page.getByLabel("Ad *").fill(`E2E Test Deposu ${code}`);
    await page.getByRole("button", { name: "Depo Ekle" }).click();

    await expect(page.getByText("Kayıt oluşturuldu.")).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(code) });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Sil" }).click();
    await expect(page.getByText("Kayıt silindi.")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(code) })).toHaveCount(0);
  });
});
