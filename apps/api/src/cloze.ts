import { z } from "zod";
import type {
  Message,
  ClozeQuestion,
} from "../../../packages/shared/src/index.js";

export type ClozeSource = {
  id: string;
  messageId: string;
  sequenceNo: number;
  displayName: string;
  start: number;
  end: number;
  text: string;
};
// Sources are literal slices of committed text. No generated sentence is accepted.
export function clozeSources(
  items: Pick<Message, "id" | "sequenceNo" | "displayName" | "finalText">[],
) {
  const sources: ClozeSource[] = [];
  let length = 0,
    limited = false;
  for (const item of items) {
    let fenced: string | null = null;
    for (const line of item.finalText.matchAll(/[^\n]+/g)) {
      const fence = line[0].trim().match(/^(`{3,}|~{3,})/);
      if (fence) {
        if (!fenced) fenced = fence[1]![0]!;
        else if (fenced === fence[1]![0]) fenced = null;
        continue;
      }
      if (fenced || /^( {4}|\t|\s*\|)/.test(line[0])) continue;
      for (const sentence of line[0].matchAll(/[^。！？]+[。！？]?/g)) {
        const raw = sentence[0],
          text = raw.trim();
        if (text.length < 18 || text.length > 600) continue;
        if (sources.length >= 180 || length + text.length > 24000) {
          limited = true;
          continue;
        }
        const start = line.index! + sentence.index! + raw.indexOf(text);
        sources.push({
          id: `s${sources.length + 1}`,
          messageId: item.id,
          sequenceNo: item.sequenceNo,
          displayName: item.displayName,
          start,
          end: start + text.length,
          text,
        });
        length += text.length;
      }
    }
  }
  return { sources, limited };
}
const termSchema = z
  .object({
    terms: z
      .array(
        z
          .object({
            sourceId: z.string().max(20),
            term: z.string().trim().min(1).max(80),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
const asciiWord = (s: string) => /[A-Za-z0-9_]/.test(s);
function occurrences(text: string, term: string) {
  const result: number[] = [];
  for (
    let at = text.indexOf(term);
    at >= 0;
    at = text.indexOf(term, at + term.length)
  ) {
    if (
      (asciiWord(term[0]!) && asciiWord(text[at - 1] || "")) ||
      (asciiWord(term.at(-1)!) && asciiWord(text[at + term.length] || ""))
    )
      continue;
    result.push(at);
  }
  return result;
}
export function clozeQuestions(
  sources: ClozeSource[],
  response: string,
  count: number,
): ClozeQuestion[] {
  const json = response
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: z.infer<typeof termSchema>;
  try {
    value = termSchema.parse(JSON.parse(json));
  } catch {
    return [];
  }
  const result: ClozeQuestion[] = [],
    terms = new Set<string>(),
    sentences = new Set<string>();
  for (const candidate of value.terms) {
    const source = sources.find((s) => s.id === candidate.sourceId),
      term = candidate.term;
    if (
      !source ||
      terms.has(term.toLowerCase()) ||
      sentences.has(source.id) ||
      !/[\p{L}\p{N}]/u.test(term) ||
      /[\r\n`*<>\[\]{}|]/.test(term) ||
      /https?:/i.test(term)
    )
      continue;
    const places = occurrences(source.text, term);
    if (!places.length || term.length > source.text.length / 2) continue;
    let text = "",
      cursor = 0;
    for (const at of places) {
      text += source.text.slice(cursor, at) + "（　　　　　　　　）";
      cursor = at + term.length;
    }
    text += source.text.slice(cursor);
    result.push({
      id: `q${result.length + 1}`,
      sourceId: source.id,
      messageId: source.messageId,
      sequenceNo: source.sequenceNo,
      displayName: source.displayName,
      sourceStart: source.start,
      sourceEnd: source.end,
      sourceText: source.text,
      text,
      answer: term,
    });
    terms.add(term.toLowerCase());
    sentences.add(source.id);
    if (result.length >= count) break;
  }
  return result;
}
export const clozeSelectionSchema = z.object({
  draftId: z.uuid(),
  questionIds: z.array(z.string().min(1).max(20)).min(1).max(20),
  answers: z.literal("SEPARATE").default("SEPARATE"),
});
export type ClozeExport = {
  draftId: string;
  answers: "SEPARATE" | "INLINE" | "NONE";
  questions: ClozeQuestion[];
};
