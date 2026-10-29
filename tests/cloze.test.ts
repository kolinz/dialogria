import { describe, it, expect } from "vitest";
import {
  clozeSources,
  clozeQuestions,
  clozeSelectionSchema,
} from "../apps/api/src/cloze.js";
const text =
  "Pythonでは複数の値を順序付きで管理するデータ型をリストといいます。\n繰り返し処理にはfor文やwhile文を利用します。\n```python\nprint('コード中のリストは対象外です')\n```";
const items = [
  { id: "message-1", sequenceNo: 1, displayName: "講師", finalText: text },
];
describe("確定済み対話の穴埋め化", () => {
  it("問題と別ページの解答を必ずセットにする", () => {
    const selection = {
      draftId: "00000000-0000-4000-8000-000000000001",
      questionIds: ["q1"],
    };
    expect(clozeSelectionSchema.parse(selection).answers).toBe("SEPARATE");
    for (const answers of ["NONE", "INLINE"])
      expect(
        clozeSelectionSchema.safeParse({ ...selection, answers }).success,
      ).toBe(false);
  });
  it("出典を元文の位置で保持し、コードを対象外にする", () => {
    const { sources } = clozeSources(items);
    expect(sources).toHaveLength(2);
    for (const source of sources)
      expect(text.slice(source.start, source.end)).toBe(source.text);
    expect(sources.some((s) => s.text.includes("コード中"))).toBe(false);
  });
  it("生成文・存在しない用語・出典の捏造を受け入れない", () => {
    const { sources } = clozeSources(items);
    expect(
      clozeQuestions(
        sources,
        JSON.stringify({
          terms: [{ sourceId: "s1", term: "リスト", question: "作った文" }],
        }),
        10,
      ),
    ).toEqual([]);
    expect(
      clozeQuestions(
        sources,
        JSON.stringify({
          terms: [
            { sourceId: "s1", term: "タプル" },
            { sourceId: "s999", term: "リスト" },
          ],
        }),
        10,
      ),
    ).toEqual([]);
    expect(clozeQuestions(sources, "JSONではない返答", 10)).toEqual([]);
  });
  it("英単語の一部を空欄にせず、同じ語の全出現箇所を置換する", () => {
    const { sources } = clozeSources([
      {
        ...items[0]!,
        finalText:
          "transformではなくfor文を使い、同じ処理にはfor文を使用します。",
      },
    ]);
    const q = clozeQuestions(
      sources,
      JSON.stringify({ terms: [{ sourceId: "s1", term: "for" }] }),
      10,
    )[0]!;
    expect(q.text).toContain("transform");
    expect(q.text.match(/（　　　　　　　　）/g)).toHaveLength(2);
    expect(q.text.replaceAll("（　　　　　　　　）", q.answer)).toBe(
      q.sourceText,
    );
  });
  it("問題数・重複を制御し、元の文章を言い換えない", () => {
    const { sources } = clozeSources(items);
    const questions = clozeQuestions(
      sources,
      "```json\n" +
        JSON.stringify({
          terms: [
            { sourceId: "s1", term: "リスト" },
            { sourceId: "s1", term: "Python" },
            { sourceId: "s2", term: "for" },
          ],
        }) +
        "\n```",
      2,
    );
    expect(questions).toHaveLength(2);
    for (const q of questions)
      expect(q.text.replaceAll("（　　　　　　　　）", q.answer)).toBe(
        text.slice(q.sourceStart, q.sourceEnd),
      );
  });
});
