import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const temp = await mkdtemp(path.join(tmpdir(), "dialogria-cloze-qa-"));
process.env.DATABASE_PATH = path.join(temp, "qa.sqlite");
process.env.STORAGE_ROOT = path.join(temp, "storage");
const { worksheetPdf } = await import("../apps/api/src/pdf.js");
const { clozeSources, clozeQuestions } =
  await import("../apps/api/src/cloze.js");
const { sqlite } = await import("../apps/api/src/db.js");
const sourceText = [
  "Pythonで複数の値を順序付きで管理するデータ型をリストといいます。",
  "繰り返し処理にはfor文やwhile文を利用します。",
  "Pythonで処理をまとめて再利用する仕組みを関数といいます。",
  "値を名前と対応付けて保存するデータ型を辞書といいます。",
].join("\n");
const { sources } = clozeSources([
  {
    id: "sample-message",
    sequenceNo: 1,
    displayName: "AI講師",
    finalText: sourceText,
  },
]);
const questions = clozeQuestions(
  sources,
  JSON.stringify({
    terms: ["リスト", "for", "関数", "辞書"].map((term, i) => ({
      sourceId: sources[i]!.id,
      term,
    })),
  }),
  4,
);
if (questions.length !== 4)
  throw new Error("サンプル原文と用語の照合に失敗しました");
const options = { draftId: "sample", questions };
const settings = {
  font: "IPAexGothic" as const,
  codeFont: "IPAexGothic" as const,
  fontSize: 12,
  pageSize: "A4" as const,
};
await mkdir("output/pdf", { recursive: true });
await writeFile(
  "output/pdf/dialogria-cloze-answers.pdf",
  await worksheetPdf(
    { name: "Python基礎" },
    { ...options, answers: "SEPARATE" },
    { id: "sample", createdAt: new Date().toISOString() },
    settings,
  ),
);
sqlite.close();
await rm(temp, { recursive: true, force: true });
console.log("Created question-and-answer set PDF under output/pdf");
