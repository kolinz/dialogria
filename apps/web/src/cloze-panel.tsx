import { useState } from "react";
import { api } from "./api";
import { useAction } from "./pages";
import { Button, Modal, Field, ErrorBox } from "./ui";
import type { ClozeDraft, ExportJob } from "../../../packages/shared/src";

type Source = {
  id: string;
  text: string;
  sequenceNo: number;
  displayName: string;
};
type SourceList = { sources: Source[]; limited: boolean; provider: string };
type Term = { sourceId: string; term: string };
export function ClozePanel({
  roomId,
  available,
  reason,
  hasMessages,
  ensureSnapshot,
  onJob,
}: {
  roomId: string;
  available: boolean;
  reason: string;
  hasMessages: boolean;
  ensureSnapshot: () => Promise<{ id: string }>;
  onJob: (job: ExportJob) => void;
}) {
  const [open, setOpen] = useState(false),
    [sourceList, setSourceList] = useState<SourceList | null>(null),
    [snapshotId, setSnapshotId] = useState(""),
    [mode, setMode] = useState("AUTO"),
    [count, setCount] = useState(10),
    [consent, setConsent] = useState(false),
    [draft, setDraft] = useState<ClozeDraft | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [manualTerms, setManualTerms] = useState<Term[]>([]),
    [sourceId, setSourceId] = useState(""),
    [term, setTerm] = useState(""),
    action = useAction();
  const source = sourceList?.sources.find((s) => s.id === sourceId);
  async function makeDraft(terms?: Term[]) {
    const result = await api<ClozeDraft>(
      `/rooms/${roomId}/cloze-drafts`,
      "POST",
      {
        snapshotId,
        mode: terms ? "MANUAL" : "AUTO",
        count,
        consent,
        ...(terms ? { terms } : {}),
      },
    );
    setDraft(result);
    setSelected(result.questions.map((q) => q.id));
    if (terms) {
      setManualTerms(terms);
      setTerm("");
    }
  }
  return (
    <>
      <div className="export-option">
        <Button
          variant="outline full pdf"
          disabled={!available || !hasMessages || action.busy}
          onClick={() => {
            setOpen(true);
            action.setError(null);
            void action.act(async () => {
              const snapshot = await ensureSnapshot();
              const data = await api<SourceList>(
                `/rooms/${roomId}/cloze-sources?snapshotId=${snapshot.id}`,
              );
              if (snapshot.id !== snapshotId) {
                setDraft(null);
                setSelected([]);
                setManualTerms([]);
                setConsent(false);
              }
              setSnapshotId(snapshot.id);
              setSourceList(data);
              setSourceId(data.sources[0]?.id || "");
              if (!["GEMINI", "OLLAMA", "LM_STUDIO"].includes(data.provider))
                setMode("MANUAL");
            });
          }}
        >
          穴埋め学習PDFを作成
        </Button>
        {!available && (
          <small className="disabled-reason">
            {reason || "管理者により無効"}
          </small>
        )}
      </div>
      {open && (
        <Modal
          title="AI専門用語抽出・穴埋め学習PDF生成"
          onClose={() => setOpen(false)}
        >
          <p className="notice">
            確定済み対話の原文だけを使います。AIに問題文は作らせず、抽出した用語を「（　　　　　　　　）」に置き換えます。
          </p>
          <ErrorBox error={action.error} />
          {sourceList && (
            <>
              {!sourceList.sources.length && (
                <p className="notice">
                  穴埋めにできる説明文がありません。18〜600文字の説明文を含む対話で利用してください。
                </p>
              )}
              <p className="muted small">
                対象：固定済み対話から {sourceList.sources.length}{" "}
                文。コード・表・短すぎる文は除外します。
                {sourceList.limited &&
                  "長い対話のため、先頭から180文・24,000文字までを対象にしています。"}
              </p>
              <Field label="用語の選び方">
                <select
                  value={mode}
                  disabled={action.busy}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="AUTO">AIで自動抽出</option>
                  <option value="MANUAL">元文から手動選択</option>
                </select>
              </Field>
              {mode === "AUTO" ? (
                <>
                  <p className="muted small">
                    使用する文章AI：{sourceList.provider}。Ollama・LM
                    StudioではGemini APIキーは不要です。
                  </p>
                  {!["GEMINI", "OLLAMA", "LM_STUDIO"].includes(
                    sourceList.provider,
                  ) && (
                    <p className="notice">
                      自動抽出には管理画面でGemini・Ollama・LM
                      Studioを選択してください。手動選択はAI接続なしで利用できます。
                    </p>
                  )}
                  <Field label="抽出する用語数（最大20）">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      value={count}
                      onChange={(e) => setCount(e.target.valueAsNumber)}
                    />
                  </Field>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    設定中の文章AIに対象文を送り、専門用語の抽出を依頼することを確認しました。
                  </label>
                  <Button
                    busy={action.busy}
                    disabled={
                      !consent ||
                      !Number.isInteger(count) ||
                      count < 1 ||
                      count > 20 ||
                      !sourceList.sources.length ||
                      !["GEMINI", "OLLAMA", "LM_STUDIO"].includes(
                        sourceList.provider,
                      )
                    }
                    onClick={() => void action.act(() => makeDraft())}
                  >
                    専門用語を自動抽出
                  </Button>
                </>
              ) : (
                <>
                  <Field label="用語を選ぶ元の文章">
                    <select
                      value={sourceId}
                      disabled={action.busy}
                      onChange={(e) => {
                        setSourceId(e.target.value);
                        setTerm("");
                      }}
                    >
                      {sourceList.sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          投稿{s.sequenceNo}：{s.text.slice(0, 60)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {source && (
                    <blockquote className="cloze-source">
                      {source.text}
                    </blockquote>
                  )}
                  <Field
                    label="穴埋めにする専門用語"
                    hint="元文からコピーするなど、表記をそのまま指定してください。1文につき1用語、最大20用語。"
                  >
                    <input
                      value={term}
                      maxLength={80}
                      onChange={(e) => setTerm(e.target.value)}
                      placeholder="例：リスト"
                    />
                  </Field>
                  <Button
                    busy={action.busy}
                    disabled={
                      !source?.text.includes(term.trim()) ||
                      !term.trim() ||
                      manualTerms.length >= 20
                    }
                    onClick={() =>
                      void action.act(() =>
                        makeDraft([
                          ...manualTerms,
                          { sourceId, term: term.trim() },
                        ]),
                      )
                    }
                  >
                    この用語を候補に追加
                  </Button>
                  <p className="muted small">
                    手動選択ではAI・外部APIを使用しません。指定の用語が元の文章にない場合は追加できません。
                  </p>
                </>
              )}
              {draft && (
                <div className="cloze-candidates">
                  <h3>
                    問題候補を確認・選択（{selected.length} /{" "}
                    {draft.questions.length}）
                  </h3>
                  <p className="muted small">
                    抽出された用語が学習内容に合っているか確認してください。不要な候補はチェックを外せます。
                  </p>
                  {draft.questions.map((q) => (
                    <div className="cloze-candidate" key={q.id}>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={selected.includes(q.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, q.id]
                                : selected.filter((id) => id !== q.id),
                            )
                          }
                        />
                        専門用語：{q.answer}
                      </label>
                      <p>{q.text}</p>
                      <details>
                        <summary>元の文章・出典を確認</summary>
                        <p>{q.sourceText}</p>
                        <small>
                          投稿{q.sequenceNo} / {q.displayName}
                        </small>
                      </details>
                    </div>
                  ))}
                  <p className="notice">
                    問題ページと解答ページを、1つのPDFにまとめて出力します。
                  </p>
                  <Button
                    busy={action.busy}
                    disabled={!selected.length || !available}
                    onClick={() =>
                      void action.act(async () => {
                        const job = await api<ExportJob>(
                          `/rooms/${roomId}/exports`,
                          "POST",
                          {
                            type: "CLOZE_PDF",
                            snapshotId: draft.snapshotId,
                            options: {
                              draftId: draft.id,
                              questionIds: selected,
                              answers: "SEPARATE",
                            },
                          },
                        );
                        onJob(job);
                        setOpen(false);
                      })
                    }
                  >
                    問題・解答セットのPDFを生成
                  </Button>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
