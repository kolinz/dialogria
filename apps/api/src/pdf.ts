import pdfmake from "pdfmake";
import { marked, type Token, type Tokens } from "marked";
import type {
  Content,
  ContentText,
  TDocumentDefinitions,
} from "pdfmake/interfaces.js";
import { z } from "zod";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";
import { getSetting } from "./db.js";
import type { ClozeExport } from "./cloze.js";
import type { Message } from "../../../packages/shared/src/index.js";

export const pdfSettingsSchema = z.object({
  font: z.enum(["IPAexGothic", "IPAexMincho"]),
  codeFont: z.enum(["IPAexGothic", "IPAexMincho"]),
  fontSize: z.number().int().min(8).max(18),
  pageSize: z.enum(["A4", "LETTER"]),
});
export type PdfSettings = z.infer<typeof pdfSettingsSchema>;
export const pdfDefaults = (): PdfSettings => ({
  font: config.PDF_FONT,
  codeFont: config.PDF_CODE_FONT,
  fontSize: config.PDF_FONT_SIZE,
  pageSize: config.PDF_PAGE_SIZE,
});
export const pdfSettings = () =>
  pdfSettingsSchema.parse(getSetting("pdf", pdfDefaults()));
const bundledFonts = path.join(
  config.projectRoot,
  "assets/fonts/IPAexfont00401",
);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((file) =>
  ["ipaexg.ttf", "ipaexm.ttf"].some(
    (name) => path.resolve(file) === path.join(bundledFonts, name),
  ),
);
for (const [name, file] of Object.entries({
  IPAexGothic: "ipaexg.ttf",
  IPAexMincho: "ipaexm.ttf",
})) {
  const font = path.join(
    config.projectRoot,
    "assets/fonts/IPAexfont00401",
    file,
  );
  pdfmake.addFonts({
    [name]: { normal: font, bold: font, italics: font, bolditalics: font },
  });
}
// Convert tokens directly. Raw HTML and remote images are never executed or fetched.
function inline(
  tokens: Token[] | undefined,
  fallback = "",
  depth = 0,
): ContentText["text"] {
  if (!tokens || depth > 30) return fallback;
  return tokens.map((token): ContentText => {
    if (token.type === "br") return { text: "\n" };
    if (token.type === "image")
      return { text: `画像：${token.text || "画像"}` };
    const text =
      "tokens" in token
        ? inline(
            token.tokens as Token[],
            "text" in token ? String(token.text) : token.raw,
            depth + 1,
          )
        : "text" in token
          ? String(token.text)
          : token.raw;
    return {
      text,
      ...(token.type === "strong" ? { bold: true } : {}),
      ...(token.type === "em" ? { italics: true } : {}),
      ...(token.type === "codespan" ? { background: "#edf2f8" } : {}),
      ...(token.type === "link"
        ? { color: "#345f98", decoration: "underline" as const }
        : {}),
    };
  });
}
function markdown(text: string, settings: PdfSettings, depth = 0): Content[] {
  if (depth > 20) return [{ text }];
  return marked.lexer(text, { gfm: true }).flatMap((token): Content[] => {
    switch (token.type) {
      case "space":
        return [];
      case "heading":
        return [
          {
            text: inline(token.tokens),
            fontSize: settings.fontSize + Math.max(1, 7 - token.depth * 2),
            color: "#253d62",
            margin: [0, 10, 0, 5],
          },
        ];
      case "code":
        return [
          {
            text: token.text.replace(/([^\n]{35})/gu, "$1\u200b"),
            font: settings.codeFont,
            fontSize: Math.max(8, settings.fontSize - 1),
            lineHeight: 1.2,
            background: "#edf2f8",
            margin: [8, 7, 8, 9],
            preserveLeadingSpaces: true,
          },
        ];
      case "list": {
        const entries = token.items.map((item: Tokens.ListItem) => ({
          stack: markdown(item.text, settings, depth + 1),
        }));
        return [
          token.ordered
            ? { ol: entries, start: token.start || 1, margin: [0, 3, 0, 7] }
            : { ul: entries, margin: [0, 3, 0, 7] },
        ];
      }
      case "blockquote":
        return [
          {
            stack: markdown(token.text, settings, depth + 1),
            margin: [14, 4, 0, 8],
            color: "#55657b",
          },
        ];
      case "table": {
        if (token.header.length > 8)
          return [{ text: token.raw, margin: [0, 5, 0, 8] }];
        return [
          {
            table: {
              headerRows: 1,
              widths: token.header.map(() => "*"),
              body: [
                token.header.map((cell: Tokens.TableCell) => ({
                  text: inline(cell.tokens),
                  fillColor: "#e9eff9",
                })),
                ...token.rows.map((row: Tokens.TableCell[]) =>
                  row.map((cell) => ({ text: inline(cell.tokens) })),
                ),
              ],
            },
            layout: "lightHorizontalLines",
            fontSize: Math.max(8, settings.fontSize - 1),
            margin: [0, 5, 0, 10],
          },
        ];
      }
      case "hr":
        return [
          {
            text: "────────────────────────",
            color: "#b2bfd1",
            margin: [0, 6, 0, 6],
          },
        ];
      default:
        return [
          {
            text:
              "tokens" in token
                ? inline(token.tokens as Token[])
                : "text" in token
                  ? String(token.text)
                  : token.raw,
            margin: [0, 0, 0, 7],
          },
        ];
    }
  });
}
async function localImage(file: string | null | undefined) {
  if (!file || path.basename(file) !== file || !file.endsWith(".webp"))
    return null;
  try {
    return await sharp(path.join(config.storage, file)).png().toBuffer();
  } catch {
    return null;
  }
}
async function avatarIcon(
  file: string | null | undefined,
  lecturer: boolean,
): Promise<Content> {
  const source = await localImage(file);
  if (source) {
    const image = await sharp(source)
      .resize(100, 100, { fit: "cover" })
      .composite([
        {
          input: Buffer.from(
            '<svg width="100" height="100"><circle cx="50" cy="50" r="49" fill="white"/></svg>',
          ),
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();
    return {
      image: `data:image/png;base64,${image.toString("base64")}`,
      width: 38,
      height: 38,
    };
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="19" fill="${lecturer ? "#e6ddfa" : "#dceafb"}"/><circle cx="20" cy="15" r="6" fill="#6883b4"/><path d="M9 33 Q9 23 20 23 Q31 23 31 33" fill="#6883b4"/></svg>`,
    width: 38,
    height: 38,
  };
}
async function roomBackdrop(
  background: string | undefined,
  pageSize: PdfSettings["pageSize"],
) {
  const width = pageSize === "A4" ? 595 : 612,
    height = pageSize === "A4" ? 842 : 792;
  const colors: Record<string, string> = {
    classroom: "#dcebf7",
    library: "#eee5cc",
    sakura: "#f2def0",
    city: "#d5edf6",
    night: "#a5b2d0",
  };
  const source = await localImage(background);
  const base = source
    ? sharp(source).resize(width, height, { fit: "cover" })
    : sharp({
        create: {
          width,
          height,
          channels: 4,
          background: colors[background || "classroom"] || colors.classroom!,
        },
      });
  const image = await base
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="white" fill-opacity="0.55"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();
  return `data:image/png;base64,${image.toString("base64")}`;
}
export async function conversationPdf(
  room: { name: string; description?: string; background?: string },
  items: (Pick<
    Message,
    "sequenceNo" | "displayName" | "createdAt" | "mode" | "finalText"
  > & { avatar?: string | null; pdfAvatar?: string | null })[],
  snapshot: { id: string; createdAt: string },
  settings = pdfSettings(),
) {
  const backdrop = await roomBackdrop(room.background, settings.pageSize);
  const icons = await Promise.all(
    items.map((m) =>
      avatarIcon(m.pdfAvatar ?? m.avatar, m.mode === "AI_LECTURER"),
    ),
  );
  const date = (value: string) =>
    new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const definition: TDocumentDefinitions = {
    pageSize: settings.pageSize,
    pageMargins: [42, 48, 42, 48],
    pageBreakBefore: (node) =>
      node.headlineLevel === 99 && node.startPosition.verticalRatio > 0.78,
    background: (_page, size) => ({
      image: backdrop,
      width: size.width,
      height: size.height,
    }),
    info: { title: room.name, author: "Dialogria", subject: "対話学習教材" },
    defaultStyle: {
      font: settings.font,
      fontSize: settings.fontSize,
      lineHeight: 1.35,
      color: "#24334a",
    },
    footer: (page, count) => ({
      text: `Dialogria  |  ${page} / ${count}`,
      fontSize: 8,
      color: "#718096",
      alignment: "center",
      margin: [0, 15, 0, 0],
    }),
    content: [
      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                fillColor: "#ffffff",
                stack: [
                  {
                    text: "DIALOGRIA / 対話学習教材",
                    color: "#526db1",
                    fontSize: 10,
                    margin: [0, 0, 0, 10],
                  },
                  {
                    text: room.name,
                    fontSize: 23,
                    color: "#253d62",
                    margin: [0, 0, 0, 10],
                  },
                  { text: room.description || "", margin: [0, 0, 0, 10] },
                  {
                    text: `基準時刻：${date(snapshot.createdAt)}（日本時間）\n投稿数：${items.length}\nスナップショット：${snapshot.id}`,
                    fontSize: 8,
                    color: "#64748b",
                    margin: [0, 0, 0, 0],
                  },
                ],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.7,
          vLineWidth: () => 0.7,
          hLineColor: () => "#dce5f1",
          vLineColor: () => "#dce5f1",
          paddingLeft: () => 16,
          paddingRight: () => 16,
          paddingTop: () => 16,
          paddingBottom: () => 16,
        },
        margin: [0, 0, 0, 18],
      },
      ...items.map((m, index): Content => ({
        headlineLevel: 99,
        columns: [
          { width: 38, stack: [icons[index]!] },
          {
            width: "*",
            table: {
              widths: ["*"],
              body: [
                [
                  {
                    fillColor: m.mode === "AI_LECTURER" ? "#ffffff" : "#edf3ff",
                    stack: [
                      {
                        text: `${m.sequenceNo}. ${m.displayName}${m.mode === "AI_LECTURER" ? "（AI講師）" : ""}`,
                        fontSize: settings.fontSize + 3,
                        color: "#345487",
                        margin: [0, 0, 0, 4],
                      },
                      {
                        text: date(m.createdAt),
                        fontSize: 8,
                        color: "#718096",
                        margin: [0, 0, 0, 9],
                      },
                      ...markdown(m.finalText, settings),
                    ],
                  },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingLeft: () => 12,
              paddingRight: () => 12,
              paddingTop: () => 12,
              paddingBottom: () => 10,
            },
          },
        ],
        columnGap: 10,
        margin: [0, 5, 0, 15],
      })),
    ],
  };
  return pdfmake.createPdf(definition).getBuffer();
}
export async function worksheetPdf(
  room: { name: string },
  exercise: ClozeExport,
  snapshot: { id: string; createdAt: string },
  settings = pdfSettings(),
) {
  const content: Content[] = [
    {
      text: "DIALOGRIA / 復習プリント",
      color: "#64748b",
      fontSize: 9,
      margin: [0, 0, 0, 8],
    },
    {
      text: `${room.name} — 専門用語穴埋め問題`,
      color: "#253d62",
      fontSize: 19,
      margin: [0, 0, 0, 12],
    },
    {
      text: "氏名：____________________　日付：________________",
      fontSize: 11,
      margin: [0, 5, 0, 18],
    },
    {
      text: "確定済み対話の原文から、専門用語だけを空欄にしています。",
      fontSize: 9,
      color: "#64748b",
      margin: [0, 0, 0, 15],
    },
    ...exercise.questions.map((q, i): Content => ({
      headlineLevel: 98,
      stack: [
        {
          text: [{ text: `問${i + 1}. `, bold: true }, { text: q.text }],
          margin: [0, 0, 0, 7],
        },
        { text: `出典：投稿 ${q.sequenceNo}`, color: "#718096", fontSize: 8 },
        ...(exercise.answers === "INLINE"
          ? [
              {
                text: `解答：${q.answer}`,
                color: "#345487",
                fontSize: settings.fontSize,
                margin: [0, 7, 0, 0],
              } as Content,
            ]
          : []),
      ],
      margin: [0, 0, 0, 20],
    })),
  ];
  if (exercise.answers === "SEPARATE")
    content.push(
      {
        text: `${room.name} — 解答・元の文章`,
        fontSize: 19,
        color: "#253d62",
        pageBreak: "before",
        margin: [0, 0, 0, 18],
      },
      ...exercise.questions.map((q, i): Content => ({
        headlineLevel: 98,
        stack: [
          {
            text: `問${i + 1}. ${q.answer}`,
            color: "#345487",
            fontSize: settings.fontSize + 1,
            margin: [0, 0, 0, 5],
          },
          { text: q.sourceText, margin: [0, 0, 0, 5] },
          { text: `出典：投稿 ${q.sequenceNo}`, fontSize: 8, color: "#718096" },
        ],
        margin: [0, 0, 0, 18],
      })),
    );
  return pdfmake
    .createPdf({
      pageSize: settings.pageSize,
      pageMargins: [42, 44, 42, 48],
      info: { title: `${room.name} — 専門用語穴埋め問題`, author: "Dialogria" },
      defaultStyle: {
        font: settings.font,
        fontSize: settings.fontSize,
        lineHeight: 1.5,
        color: "#24334a",
      },
      pageBreakBefore: (node) =>
        node.headlineLevel === 98 && node.startPosition.verticalRatio > 0.8,
      footer: (page, count) => ({
        text: `Dialogria | ${page} / ${count} | 対話 ${snapshot.id.slice(0, 8)}`,
        fontSize: 8,
        color: "#718096",
        alignment: "center",
        margin: [0, 15, 0, 0],
      }),
      content,
    })
    .getBuffer();
}
export const pdfPreview = (settings: PdfSettings) =>
  conversationPdf(
    {
      name: "日本語PDFのプレビュー",
      description: "保存前の設定でフォント・文字サイズ・用紙を確認できます。",
    },
    [
      {
        sequenceNo: 1,
        displayName: "AI講師",
        mode: "AI_LECTURER",
        createdAt: new Date().toISOString(),
        finalText:
          "## 学びを振り返る\n日本語の文章と **強調** を読みやすく表示します。\n\n- 見出し・箇条書き\n- 表とコード例\n\n|項目|内容|\n|---|---|\n|本文|日本語フォントを埋め込み|\n|用紙|選択したサイズ|\n\n```python\n# 日本語のコメント\nprint('こんにちは、Dialogria！')\n```",
      },
    ],
    { id: "preview", createdAt: new Date().toISOString() },
    settings,
  );
