import { test, expect } from "@playwright/test";
test("登録→PEERルーム→原文投稿→Markdown書き出し", async ({
  page,
}, testInfo) => {
  await page.goto("/register");
  await page.getByLabel("表示名", { exact: true }).fill("E2E検証ユーザー");
  await page
    .getByLabel("メールアドレス", { exact: true })
    .fill(`e2e-${testInfo.project.name}-${Date.now()}@dialogria.test`);
  await page
    .getByLabel("パスワード", { exact: false })
    .first()
    .fill("Disposable-e2e-password-2026!");
  await page.getByRole("button", { name: "新規登録", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "プロフィール", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "ルームを作成", exact: true })
    .last()
    .click();
  await page
    .getByLabel("ルーム名", { exact: false })
    .fill("自動検証の学習ルーム");
  await page
    .getByRole("button", { name: "学生同士の対話 仲間と視点を持ち寄る学び" })
    .click();
  await page.getByRole("button", { name: "ルームを作成", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "自動検証の学習ルーム", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "メッセージ", exact: true })
    .fill("配列とリストの違いについて学びたいです。");
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await expect(
    page.getByText("配列とリストの違いについて学びたいです。", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (testInfo.project.name === "mobile")
    await page
      .getByRole("button", { name: "ルーム情報と書き出し", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Markdownをダウンロード .md", exact: true })
    .click();
  const link = page.getByRole("link", { name: "ダウンロード", exact: true });
  await expect(link).toBeVisible({ timeout: 20000 });
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  await page.screenshot({
    path: testInfo.outputPath("learning-room.png"),
    fullPage: true,
  });
});
