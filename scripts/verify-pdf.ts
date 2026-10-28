import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const temp = await mkdtemp(path.join(tmpdir(), "dialogria-pdf-qa-"));
process.env.DATABASE_PATH = path.join(temp, "qa.sqlite");
process.env.STORAGE_ROOT = path.join(temp, "storage");
const { conversationPdf } = await import("../apps/api/src/pdf.js");
const { sqlite } = await import("../apps/api/src/db.js");
const { default: sharp } = await import("sharp");
await mkdir(process.env.STORAGE_ROOT!, { recursive: true });
await sharp(
  Buffer.from(
    '<svg width="600" height="840"><rect width="600" height="840" fill="#d5e7f5"/><rect x="380" y="30" width="190" height="650" fill="#fff3cf"/><path d="M380 240H570M380 450H570M475 30V680" stroke="#a7b9c9" stroke-width="10"/><path d="M0 700H600V840H0Z" fill="#dbc7a5"/><path d="M0 750H600M0 810H600" stroke="#bdab91" stroke-width="4"/></svg>',
  ),
)
  .webp()
  .toFile(path.join(process.env.STORAGE_ROOT!, "sample-background.webp"));
await sharp(
  Buffer.from(
    '<svg width="100" height="100"><rect width="100" height="100" fill="#a8bff2"/><circle cx="50" cy="42" r="25" fill="#ffe1bb"/><path d="M18 100 Q15 69 50 69 Q85 69 82 100" fill="#6077b5"/><circle cx="41" cy="40" r="2"/><circle cx="59" cy="40" r="2"/><path d="M41 52 Q50 59 59 52" fill="none" stroke="#916f66" stroke-width="2"/></svg>',
  ),
)
  .webp()
  .toFile(path.join(process.env.STORAGE_ROOT!, "sample-avatar.webp"));
const text =
  "## 日本語の学習記録\n質問への回答を **全文** 保存します。表・箇条書き・コード例も含みます。\n\n- 学習内容を確認\n- 復習に活用\n\n| 項目 | 説明 |\n| --- | --- |\n| 日本語 | フォントを埋め込みます |\n| 改ページ | 長い会話も保存します |\n\n```python\n# 日本語コメントと長い行\n" +
  "print('こんにちは、Dialogria！')\n".repeat(25) +
  "```\n" +
  "段落の終わりまで読みやすく整形します。".repeat(50);
const items = Array.from({ length: 5 }, (_, i) => ({
  sequenceNo: i + 1,
  displayName: i % 2 ? "参加者" : "日本語のAI講師",
  createdAt: "2026-10-28T12:00:00Z",
  mode: i % 2 ? "ORIGINAL" : "AI_LECTURER",
  finalText: text,
  pdfAvatar: i % 2 ? null : "sample-avatar.webp",
}));
await mkdir("output/pdf", { recursive: true });
await writeFile(
  "output/pdf/dialogria-sample.pdf",
  await conversationPdf(
    {
      name: "対話から学ぶ、日本語PDF",
      description: "複数ページ・長いコード・表の表示確認用サンプル",
      background: "sample-background.webp",
    },
    items,
    { id: "sample", createdAt: "2026-10-28T12:00:00Z" },
    {
      font: "IPAexGothic",
      codeFont: "IPAexGothic",
      fontSize: 11,
      pageSize: "A4",
    },
  ),
);
sqlite.close();
await rm(temp, { recursive: true, force: true });
console.log("Created output/pdf/dialogria-sample.pdf");
