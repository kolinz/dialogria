import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AudioLines,
  BookOpen,
  Check,
  CheckCircle2,
  ExternalLink,
  Film,
  KeyRound,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api, useApi, usePagedApi, setCsrf, csrfToken } from "./api";
import { useAuth } from "./auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  useToast,
} from "./ui";
import { useAction } from "./pages";
import type { Lecturer, Room, User } from "../../../packages/shared/src";
type RecordData = Record<string, unknown>;
export function AdminPage() {
  const location = useLocation(),
    page = location.pathname.slice("/admin".length).split("/").filter(Boolean);
  return (
    <div className="page admin-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>
            {(
              {
                users: "ユーザー管理",
                rooms: "ルーム管理",
                lecturers: "AI講師管理",
                logs: "運用ログ",
                rankings: "人気のルーム",
                providers: "AI・TTS・動画の接続設定",
                system: "システム設定",
                account: "管理者アカウント",
              } as Record<string, string>
            )[page[0]] ?? "管理ダッシュボード"}
          </h1>
          <p>学びを支える環境を、安全に管理しましょう。</p>
        </div>
        <Badge>
          <ShieldCheck size={14} />
          管理者
        </Badge>
      </div>
      {!page.length ? (
        <Dashboard />
      ) : page[0] === "providers" ? (
        <ProviderSettings />
      ) : page[0] === "system" ? (
        <SystemSettings />
      ) : page[0] === "account" ? (
        <AdminAccountSettings />
      ) : page[0] === "lecturers" ? (
        page.length > 1 ? (
          <LecturerForm id={page[1] === "new" ? undefined : page[1]} />
        ) : (
          <LecturerList />
        )
      ) : (
        <AdminTable kind={page[0]} />
      )}
    </div>
  );
}
function AdminAccountSettings() {
  const { user, refresh } = useAuth(),
    client = useQueryClient(),
    navigate = useNavigate(),
    toast = useToast(),
    a = useAction();
  const [email, setEmail] = useState(user.email),
    [displayName, setDisplayName] = useState(user.displayName),
    [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState("");
  return (
    <Card>
      <h2>ログイン情報の変更</h2>
      <p className="notice">
        .envは初回作成時だけ使います。ここで変更した情報は、サーバー再起動後も維持されます。メールアドレス・パスワードを変更すると、すべての端末で再ログインが必要です。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void a.act(async () => {
            const result = await api<{ requiresLogin: boolean }>(
              "/admin/account",
              "PATCH",
              {
                email,
                displayName,
                currentPassword,
                ...(newPassword ? { newPassword } : {}),
              },
            );
            setCurrentPassword("");
            setNewPassword("");
            if (result.requiresLogin) {
              setCsrf("");
              client.clear();
              navigate("/login", { replace: true });
              toast(
                "ログイン情報を変更しました。新しい情報でログインしてください。",
              );
            } else {
              await refresh();
              toast("管理者アカウントを更新しました");
            }
          });
        }}
      >
        <Field label="ログインメールアドレス">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
          />
        </Field>
        <Field label="表示名">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={40}
          />
        </Field>
        <Field label="現在のパスワード（再認証）">
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            maxLength={128}
          />
        </Field>
        <Field
          label="新しいパスワード"
          hint="変更する場合だけ入力。12〜128文字。"
        >
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <ErrorBox error={a.error} />
        <Button busy={a.busy}>管理者アカウントを変更</Button>
      </form>
    </Card>
  );
}
function Dashboard() {
  const [days, setDays] = useState("all");
  const q = useApi<{
      users: number;
      rooms: number;
      exports: number;
      usage: number;
    }>(`/admin/overview?days=${days}`),
    rooms = useApi<Room[]>("/admin/rooms");
  return (
    <>
      <div className="dashboard-period">
        <label>
          集計期間{" "}
          <select
            aria-label="管理集計期間"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            <option value="all">全期間</option>
            <option value="30">直近30日</option>
            <option value="7">直近7日</option>
          </select>
        </label>
      </div>
      <div className="stats-grid">
        {[
          ["登録ユーザー", "users", Users],
          ["稼働中のルーム", "rooms", BookOpen],
          ["完成した教材", "exports", AudioLines],
          ["文章生成の利用回数", "usage", Film],
        ].map(([label, key, Icon]) => {
          const I = Icon as typeof Users;
          return (
            <Card key={String(key)} className="stat-card">
              <span>
                <I size={24} />
              </span>
              <p>{String(label)}</p>
              <strong>{q.data?.[key as "users"] ?? "—"}</strong>
              <small>現在の利用状況</small>
              <div className="stat-decoration" />
            </Card>
          );
        })}
      </div>
      <ErrorBox error={q.error} />
      <div className="admin-dashboard-grid">
        <Card>
          <div className="section-heading">
            <h2>最近のルーム</h2>
            <Link to="/admin/rooms">管理する →</Link>
          </div>
          {rooms.data?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ルーム名</th>
                    <th>種別</th>
                    <th>参加人数</th>
                    <th>公開範囲</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.data.slice(0, 8).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td>
                        <Badge>
                          {r.type === "PEER" ? "学生同士" : "AI講師"}
                        </Badge>
                      </td>
                      <td>{r.memberCount}人</td>
                      <td>{r.visibility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>作成されたルームがここに表示されます。</Empty>
          )}
        </Card>
        <Card className="admin-guide">
          <span className="eyebrow">GET STARTED</span>
          <h2>学習環境を整える</h2>
          <p>接続先と出力機能を設定したら、AI講師を登録しましょう。</p>
          {[
            ["/admin/providers", "1", "AI・TTSを接続する"],
            ["/admin/system", "2", "教材出力を有効にする"],
            ["/admin/lecturers", "3", "AI講師を登録する"],
          ].map(([to, n, label]) => (
            <Link key={to} to={to}>
              <span>{n}</span>
              {label}
              <ExternalLink size={15} />
            </Link>
          ))}
        </Card>
      </div>
    </>
  );
}
type Provider = {
  speed: number;
  textProvider: string;
  textModel: string;
  textUrl: string;
  ttsProvider: string;
  ttsModel: string;
  voice: string;
  voicevoxUrl: string;
  videoModel: string;
  geminiConfigured: boolean;
  openaiConfigured: boolean;
  verified: Record<string, boolean>;
  sources?: { gemini: string; openai: string };
  textModelDefaults?: Record<string, string>;
  geminiKey?: string;
  openaiKey?: string;
};
function ProviderSettings() {
  const q = useApi<Provider>("/admin/providers"),
    [form, setForm] = useState<Provider | null>(null),
    a = useAction(),
    toast = useToast(),
    [choices, setChoices] = useState<
      Record<
        string,
        { models: string[]; voices: { id: string; name: string }[] }
      >
    >({});
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);
  if (!form)
    return (
      <>
        <ErrorBox error={q.error} />
        <Loading />
      </>
    );
  const set = (k: keyof Provider, v: string) => setForm({ ...form, [k]: v });
  async function save() {
    await api("/admin/providers", "PATCH", form);
    await q.refetch();
    toast("接続設定を保存しました。変更後は接続テストを実行してください。");
  }
  return (
    <>
      <Card className="provider-secrets">
        <div className="section-heading">
          <h2>
            <KeyRound size={21} />
            API認証情報
          </h2>
          <Badge>サーバーで暗号化保存</Badge>
        </div>
        <div className="two-cols">
          <Field
            label={`Gemini APIキー ${form.geminiConfigured ? "（登録済み）" : "（未登録）"}`}
            hint={`設定元：${form.sources?.gemini ?? "未設定"}。入力しなければ現在のキーを維持します。`}
          >
            <input
              type="password"
              autoComplete="new-password"
              value={form.geminiKey ?? ""}
              onChange={(e) => set("geminiKey", e.target.value)}
              placeholder="新しいキーを入力"
            />
            <Button
              variant="outline compact"
              onClick={() =>
                void a.act(async () => {
                  if (
                    !window.confirm(
                      "Geminiキーを削除すると、既存MP4の取得も停止します。削除しますか？",
                    )
                  )
                    return;
                  await api("/admin/providers", "PATCH", {
                    ...form,
                    geminiKey: "",
                  });
                  await q.refetch();
                })
              }
            >
              登録キーを削除
            </Button>
          </Field>
          <Field
            label={`OpenAI APIキー ${form.openaiConfigured ? "（登録済み）" : "（未登録）"}`}
            hint={`設定元：${form.sources?.openai ?? "未設定"}。入力しなければ現在のキーを維持します。`}
          >
            <input
              type="password"
              autoComplete="new-password"
              value={form.openaiKey ?? ""}
              onChange={(e) => set("openaiKey", e.target.value)}
              placeholder="新しいキーを入力"
            />
            <Button
              variant="outline compact"
              onClick={() =>
                void a.act(async () => {
                  if (!window.confirm("OpenAIキーを削除しますか？")) return;
                  await api("/admin/providers", "PATCH", {
                    ...form,
                    openaiKey: "",
                  });
                  await q.refetch();
                })
              }
            >
              登録キーを削除
            </Button>
          </Field>
        </div>
        <p className="muted small">
          秘密値は画面に再表示しません。キーとモデルを保存してから接続を検証してください。
        </p>
        <Button busy={a.busy} onClick={() => void a.act(save)}>
          接続設定を保存
        </Button>
        <Button
          variant="outline"
          busy={a.busy}
          onClick={() =>
            void a.act(async () => {
              if (
                !window.confirm(
                  "管理画面での上書きを解除し、環境変数の設定に戻します。接続テストのやり直しが必要です。続けますか？",
                )
              )
                return;
              await api("/admin/providers/reset-env", "POST");
              await q.refetch();
              toast("環境変数の設定に戻しました");
            })
          }
        >
          環境変数の設定に戻す
        </Button>
        <p className="muted small">
          .envを変更した場合はAPIサーバーを再起動してください。キーを削除すると、環境変数のキーも含めて利用を停止します。「環境変数の設定に戻す」で再利用できます。
        </p>
        <ErrorBox error={a.error} />
      </Card>
      <div className="provider-grid">
        {(["TEXT", "TTS", "VIDEO"] as const).map((purpose) => (
          <Card key={purpose}>
            <div className="section-heading">
              <h2>
                {purpose === "TEXT"
                  ? "AI文章生成"
                  : purpose === "TTS"
                    ? "音声合成"
                    : "動画生成"}
              </h2>
              <Badge color={form.verified[purpose] ? "green" : ""}>
                {form.verified[purpose] ? "接続検証済み" : "未検証"}
              </Badge>
            </div>
            {purpose === "TEXT" ? (
              <>
                <Field label="プロバイダー">
                  <select
                    value={form.textProvider}
                    onChange={(e) => {
                      const provider = e.target.value;
                      setForm({
                        ...form,
                        textProvider: provider,
                        textModel: form.textModelDefaults?.[provider] ?? "",
                      });
                      setChoices((old) => ({
                        ...old,
                        TEXT: { models: [], voices: [] },
                      }));
                    }}
                  >
                    <option value="GEMINI">Gemini（標準）</option>
                    <option value="OPENAI">OpenAI</option>
                    <option value="OLLAMA">Ollama</option>
                    <option value="LM_STUDIO">LM Studio</option>
                  </select>
                </Field>
                {["OLLAMA", "LM_STUDIO"].includes(form.textProvider) && (
                  <Field label="ローカルサーバーURL">
                    <input
                      value={form.textUrl}
                      onChange={(e) => set("textUrl", e.target.value)}
                    />
                  </Field>
                )}
                <Field label="文章モデル">
                  <input
                    list="text-models"
                    value={form.textModel}
                    onChange={(e) => set("textModel", e.target.value)}
                    placeholder="利用するモデル名"
                  />
                  <datalist id="text-models">
                    {choices.TEXT?.models.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </datalist>
                </Field>
              </>
            ) : purpose === "TTS" ? (
              <>
                <Field label="プロバイダー">
                  <select
                    value={form.ttsProvider}
                    onChange={(e) => set("ttsProvider", e.target.value)}
                  >
                    <option value="OPENAI_TTS">OpenAI TTS</option>
                    <option value="VOICEVOX">VOICEVOX ENGINE</option>
                  </select>
                </Field>
                {form.ttsProvider === "VOICEVOX" ? (
                  <Field label="VOICEVOXサーバーURL">
                    <input
                      value={form.voicevoxUrl}
                      onChange={(e) => set("voicevoxUrl", e.target.value)}
                    />
                  </Field>
                ) : (
                  <Field label="TTSモデル">
                    <input
                      list="tts-models"
                      value={form.ttsModel}
                      onChange={(e) => set("ttsModel", e.target.value)}
                    />
                    <datalist id="tts-models">
                      {choices.TTS?.models.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </datalist>
                  </Field>
                )}
                <Field label="音声 / 話者ID">
                  <input
                    list="tts-voices"
                    value={form.voice}
                    onChange={(e) => set("voice", e.target.value)}
                  />
                  <datalist id="tts-voices">
                    {choices.TTS?.voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field label="読み上げ速度（0.5〜1.5倍）">
                  <input
                    type="number"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={form.speed ?? 1}
                    onChange={(e) =>
                      setForm({ ...form, speed: Number(e.target.value) })
                    }
                  />
                </Field>
                <p className="muted small">
                  VOICEVOXを使う場合は、採用話者の利用規約・クレジット条件を確認してください。
                </p>
              </>
            ) : (
              <>
                <div className="notice">
                  映像素材：Gemini
                  <br />
                  音声と字幕は、確定した対話から合成します。
                </div>
                <Field label="動画モデル">
                  <input
                    list="video-models"
                    value={form.videoModel}
                    onChange={(e) => set("videoModel", e.target.value)}
                  />
                  <datalist id="video-models">
                    {choices.VIDEO?.models.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </datalist>
                </Field>
                <p className="muted small">
                  実接続テストは短い映像を1本生成します。API利用料が発生します。
                </p>
              </>
            )}
            <div className="button-stack">
              <Button
                variant="outline"
                busy={a.busy}
                onClick={() =>
                  void a.act(async () => {
                    const result = await api<{
                      models: string[];
                      voices: { id: string; name: string }[];
                    }>(
                      `/admin/providers/models?purpose=${purpose}${purpose === "TEXT" ? `&textProvider=${form.textProvider}` : ""}`,
                    );
                    setChoices((old) => ({ ...old, [purpose]: result }));
                    toast("利用できるモデル・音声を取得しました");
                  })
                }
              >
                モデル・音声を取得
              </Button>
              <Button
                busy={a.busy}
                onClick={() =>
                  void a.act(async () => {
                    if (
                      purpose === "VIDEO" &&
                      !window.confirm(
                        "短い動画を1本実生成し、利用料が発生します。接続テストを実行しますか？",
                      )
                    )
                      return;
                    await api("/admin/providers/test", "POST", {
                      purpose,
                      allowCharge: purpose === "VIDEO",
                    });
                    await q.refetch();
                    toast("実接続テストに成功しました");
                  })
                }
              >
                <CheckCircle2 size={17} />
                接続テスト
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
const systemLabels: Record<string, string> = {
  exportVideoEnabled: "動画教材（MP4）",
  exportAudioEnabled: "音声教材（MP3・個別発話）",
  exportTextEnabled: "テキスト教材（Markdown・PDF）",
  registrationEnabled: "新規ユーザー登録",
  maxRooms: "ユーザーごとのルーム上限",
  maxMembers: "ルームの参加人数上限",
  maxMessageLength: "投稿文字数上限",
  maxAudioMinutes: "音声の最長時間（分）",
  maxVideoMinutes: "動画の最長時間（分）",
  maxVideoScenes: "動画1本の最大シーン数",
  maxExportMb: "教材ファイルの最大容量（MB）",
  retentionDays: "教材の保存期間（日）",
  maxDailyScenes: "動画APIの日次シーン上限",
  maxVideoBudget: "動画1本の費用上限（USD）",
  sceneCostCeiling: "1シーンの費用見積上限（USD）",
};
type PdfForm = {
  font: string;
  codeFont: string;
  fontSize: number;
  pageSize: string;
};
function PdfSettingsPanel() {
  const q = useApi<{ settings: PdfForm; defaults: PdfForm; source: string }>(
      "/admin/pdf",
    ),
    [form, setForm] = useState<PdfForm | null>(null),
    a = useAction(),
    toast = useToast();
  useEffect(() => {
    if (q.data) setForm(q.data.settings);
  }, [q.data]);
  const fonts = [
    ["IPAexGothic", "IPAexゴシック"],
    ["IPAexMincho", "IPAex明朝"],
  ];
  return (
    <Card>
      <h2>PDF出力設定</h2>
      <p className="muted">
        日本語フォントをPDFに埋め込みます。管理画面の保存値を優先し、未保存時は.envの標準値を使います。
      </p>
      <ErrorBox error={q.error || a.error} />
      {form && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void a.act(async () => {
              await api("/admin/pdf", "PATCH", form);
              await q.refetch();
              toast("PDF出力設定を保存しました");
            });
          }}
        >
          <p className="muted small">
            設定元：
            {q.data?.source === "database"
              ? "管理画面の保存値"
              : ".env・環境変数の標準値"}
            。保存済みのPDFは変更されません。
          </p>
          <div className="two-cols">
            {(["font", "codeFont"] as const).map((key) => (
              <Field
                key={key}
                label={
                  key === "font" ? "PDF本文フォント" : "PDFコード用フォント"
                }
              >
                <select
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                >
                  {fonts.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <Field label="PDF本文サイズ（pt）">
              <input
                type="number"
                min={8}
                max={18}
                step={1}
                required
                value={form.fontSize}
                onChange={(e) =>
                  setForm({ ...form, fontSize: e.target.valueAsNumber })
                }
              />
            </Field>
            <Field label="PDF用紙サイズ">
              <select
                value={form.pageSize}
                onChange={(e) => setForm({ ...form, pageSize: e.target.value })}
              >
                <option value="A4">A4</option>
                <option value="LETTER">Letter</option>
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <Button busy={a.busy}>PDF設定を保存</Button>
            <Button
              type="button"
              variant="outline"
              disabled={a.busy}
              onClick={() =>
                void a.act(async () => {
                  const response = await fetch("/api/admin/pdf/preview", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                      "Content-Type": "application/json",
                      "X-CSRF-Token": csrfToken,
                    },
                    body: JSON.stringify(form),
                  });
                  if (!response.ok) {
                    const result = await response.json();
                    throw new Error(
                      result.error?.message ||
                        "PDFプレビューを生成できませんでした",
                    );
                  }
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "dialogria-pdf-preview.pdf";
                  document.body.append(link);
                  link.click();
                  link.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                })
              }
            >
              プレビューPDFをダウンロード
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={a.busy}
              onClick={() =>
                void a.act(async () => {
                  await api("/admin/pdf", "DELETE");
                  await q.refetch();
                  toast("PDF設定を環境変数の標準値に戻しました");
                })
              }
            >
              環境変数の設定に戻す
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
function SystemSettings() {
  const q = useApi<RecordData>("/admin/system"),
    [form, setForm] = useState<RecordData>({}),
    a = useAction(),
    toast = useToast();
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);
  return (
    <>
      <PdfSettingsPanel />
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void a.act(async () => {
              await api("/admin/system", "PATCH", form);
              await q.refetch();
              toast("システム設定を保存しました");
            });
          }}
        >
          <h2>教材出力機能</h2>
          <p className="muted">
            無効にすると、新規生成と保存済み教材のダウンロードを停止します。
          </p>
          {Object.entries(systemLabels)
            .filter(([key]) => typeof form[key] === "boolean")
            .map(([key, label]) => {
              const type =
                  key === "exportVideoEnabled"
                    ? "MP4"
                    : key === "exportAudioEnabled"
                      ? "MP3"
                      : "MARKDOWN",
                caps = form.capabilities as
                  | Record<string, { available: boolean; reason: string }>
                  | undefined;
              return (
                <div className="setting-row" key={key}>
                  <div>
                    <strong>{label}</strong>
                    {key.startsWith("export") && (
                      <small>
                        実効状態：
                        {caps?.[type]?.available
                          ? "利用可能"
                          : (caps?.[type]?.reason ?? "確認中")}
                      </small>
                    )}
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      aria-label={label}
                      checked={!!form[key]}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.checked })
                      }
                    />
                    <span />
                  </label>
                </div>
              );
            })}
          <div className="notice">
            MP4はGemini動画とTTSの実接続検証が必要です。音声は選択中TTSの検証が必要です。検証の有効期間は24時間です。
            <Link to="/admin/providers">接続設定へ →</Link>
          </div>
          <h2>利用上限と保存</h2>
          <div className="two-cols">
            {Object.entries(systemLabels)
              .filter(([key]) => typeof form[key] === "number")
              .map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    required
                    min={
                      key.includes("Budget") || key === "sceneCostCeiling"
                        ? 0.001
                        : 1
                    }
                    step={
                      key.includes("Budget") || key === "sceneCostCeiling"
                        ? 0.001
                        : 1
                    }
                    value={Number(form[key])}
                    onChange={(e) =>
                      setForm({ ...form, [key]: Number(e.target.value) })
                    }
                  />
                </Field>
              ))}
          </div>
          <p className="muted small">
            費用は事業者の最新料金から運用者が上限を設定してください。シーン数×費用見積上限が利用者の予算内に収まるジョブだけを受け付けます。
          </p>
          <ErrorBox error={a.error} />
          <Button busy={a.busy}>設定を保存</Button>
        </form>
      </Card>
    </>
  );
}
function LecturerList() {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    q = usePagedApi<Lecturer>(
      `/admin/lecturers?q=${encodeURIComponent(search)}&limit=12&offset=${page * 12}`,
    ),
    a = useAction();
  return (
    <>
      <div className="section-heading">
        <div className="search-bar">
          <Search size={18} />
          <input
            aria-label="講師を検索"
            placeholder="講師名・専門分野で検索"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Link className="button" to="/admin/lecturers/new">
          <Plus size={18} />
          講師を登録
        </Link>
      </div>
      <ErrorBox error={q.error || a.error} />
      <div className="rooms-grid">
        {q.data?.data.map((l) => (
          <Card key={l.id} className="lecturer-card">
            <Avatar name={l.name} src={l.avatar} size="large" />
            <h2>{l.name}</h2>
            <Badge>{l.status === "ACTIVE" ? "有効" : "無効"}</Badge>
            <p>{l.subject}</p>
            <p className="muted">{l.description}</p>
            <small>
              {l.provider} · {l.model}
              <br />
              音声：{l.voice} · 設定版 {l.version}
            </small>
            <div className="form-actions">
              <Link
                className="button outline compact"
                to={`/admin/lecturers/${l.id}/edit`}
              >
                編集
              </Link>
              {l.status === "ACTIVE" && (
                <Button
                  variant="outline compact"
                  onClick={() =>
                    void a.act(async () => {
                      if (
                        !window.confirm(
                          "新しいルームでこの講師を選べなくします。既存ルームの設定と履歴は保持されます。",
                        )
                      )
                        return;
                      await api(`/admin/lecturers/${l.id}`, "DELETE");
                      await q.refetch();
                    })
                  }
                >
                  無効化
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {q.data?.data.length === 0 && (
        <Card>
          <Empty>講師を登録すると、学習者がルーム作成時に選べます。</Empty>
        </Card>
      )}
      <div className="pagination">
        <span>{q.data?.pageInfo.total ?? 0}件</span>
        <Button
          variant="outline compact"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          前へ
        </Button>
        <Button
          variant="outline compact"
          disabled={!q.data?.pageInfo.nextCursor}
          onClick={() => setPage(page + 1)}
        >
          次へ
        </Button>
      </div>
    </>
  );
}
type LecturerFormData = {
  name: string;
  subject: string;
  description: string;
  systemPrompt: string;
  tone: string;
  provider: string;
  model: string;
  voice: string;
  avatar: string;
  status: string;
  version: number;
};
function LecturerForm({ id }: { id?: string }) {
  const q = useApi<LecturerFormData>(`/admin/lecturers/${id}`, !!id),
    p = useApi<Provider>("/admin/providers"),
    [form, setForm] = useState<LecturerFormData>({
      name: "",
      subject: "",
      description: "",
      systemPrompt:
        "学習者の理解を確認しながら、具体例を交えて丁寧に説明してください。",
      tone: "やさしく・丁寧",
      provider: "GEMINI",
      model: "",
      voice: "coral",
      avatar: "",
      status: "INACTIVE",
      version: 0,
    }),
    a = useAction(),
    navigate = useNavigate();
  useEffect(() => {
    if (q.data) setForm(q.data);
    else if (p.data)
      setForm((f) => ({
        ...f,
        provider: p.data!.textProvider,
        model: p.data!.textModel,
        voice: p.data!.voice,
      }));
  }, [q.data, p.data]);
  return (
    <div className="room-form-grid">
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void a.act(async () => {
              if (
                !window.confirm(
                  "この設定で保存します。既存ルームの設定版は変更されません。",
                )
              )
                return;
              await api(
                id ? `/admin/lecturers/${id}` : "/admin/lecturers",
                id ? "PATCH" : "POST",
                form,
              );
              navigate("/admin/lecturers");
            });
          }}
        >
          {[
            ["name", "講師名", 80],
            ["subject", "専門分野", 100],
            ["description", "公開プロフィール", 1000],
            ["systemPrompt", "システムプロンプト（管理者のみ閲覧）", 12000],
            ["tone", "口調", 100],
            ["model", "文章生成モデル", 150],
            ["voice", "TTS音声ID", 100],
          ].map(([key, label, max]) => (
            <Field key={String(key)} label={String(label)}>
              {["description", "systemPrompt"].includes(String(key)) ? (
                <textarea
                  value={String(form[key as keyof LecturerFormData])}
                  maxLength={Number(max)}
                  required={key === "systemPrompt"}
                  rows={key === "systemPrompt" ? 6 : 3}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              ) : (
                <input
                  value={String(form[key as keyof LecturerFormData])}
                  required
                  maxLength={Number(max)}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              )}
            </Field>
          ))}
          <Field label="文章生成プロバイダー">
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            >
              {["GEMINI", "OPENAI", "OLLAMA", "LM_STUDIO"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="利用状態">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="INACTIVE">無効（下書き）</option>
              <option value="ACTIVE">有効</option>
            </select>
          </Field>
          <Field label="アバター画像">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void a.act(async () => {
                    const fd = new FormData();
                    fd.append("image", f);
                    const r = await api<{ path: string }>(
                      "/uploads",
                      "POST",
                      fd,
                    );
                    setForm({ ...form, avatar: r.path });
                  });
              }}
            />
          </Field>
          <p className="notice">
            有効化には、利用可能なモデルと音声、および文章・TTSの接続検証が必要です。既存ルームは登録時の設定版を継続します。
          </p>
          <ErrorBox error={a.error || q.error} />
          <div className="form-actions">
            <Link className="button outline" to="/admin/lecturers">
              キャンセル
            </Link>
            <Button busy={a.busy}>講師を保存</Button>
          </div>
        </form>
      </Card>
      <Card className="lecturer-preview">
        <span className="eyebrow">PUBLIC PROFILE</span>
        <Avatar name={form.name} src={form.avatar} size="large" />
        <h2>{form.name || "講師名"}</h2>
        <Badge>{form.subject || "専門分野"}</Badge>
        <p>{form.description || "学習者に表示されるプロフィールです。"}</p>
      </Card>
    </div>
  );
}
function AdminTable({ kind }: { kind: string }) {
  const { user, refresh } = useAuth(),
    client = useQueryClient(),
    navigate = useNavigate();
  const [q, setQ] = useState(""),
    [days, setDays] = useState("30"),
    [metric, setMetric] = useState("posts"),
    [page, setPage] = useState(0),
    [filter, setFilter] = useState(""),
    [roomStatus, setRoomStatus] = useState("ACTIVE"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    query = usePagedApi<RecordData>(
      `/admin/${kind}?q=${encodeURIComponent(q)}&days=${days}&metric=${metric}&limit=15&offset=${page * 15}&${kind === "rooms" ? "visibility" : kind === "logs" ? "level" : "status"}=${filter}${kind === "rooms" ? `&status=${roomStatus}` : ""}&from=${from}&to=${to || "9999-12-31"}`,
    ),
    [target, setTarget] = useState<RecordData | null>(null),
    [password, setPassword] = useState(""),
    [editEmail, setEditEmail] = useState(""),
    [editName, setEditName] = useState(""),
    [editBio, setEditBio] = useState(""),
    [newUserPassword, setNewUserPassword] = useState(""),
    [reason, setReason] = useState(""),
    [role, setRole] = useState("USER"),
    [status, setStatus] = useState("ACTIVE"),
    a = useAction(),
    toast = useToast();
  useEffect(() => {
    setPage(0);
    setFilter("");
  }, [kind]);
  const data = query.data?.data ?? [],
    total = query.data?.pageInfo.total ?? 0,
    rows = data,
    columns =
      kind === "users"
        ? ["displayName", "email", "role", "status", "createdAt"]
        : kind === "rooms"
          ? [
              "name",
              "type",
              "visibility",
              "memberCount",
              "updatedAt",
              "deletedAt",
            ]
          : kind === "logs"
            ? ["createdAt", "level", "event", "actorId", "targetId", "detail"]
            : ["name", "visibility", "score"];
  const names: Record<string, string> = {
    displayName: "表示名",
    email: "メール",
    role: "権限",
    status: "状態",
    createdAt: "日時",
    name: "ルーム名",
    type: "種別",
    visibility: "公開範囲",
    memberCount: "人数",
    updatedAt: "更新日",
    deletedAt: "削除日",
    level: "レベル",
    event: "操作",
    actorId: "実行者ID",
    targetId: "対象ID",
    detail: "詳細",
    score:
      metric === "posts"
        ? "投稿数"
        : metric === "members"
          ? "投稿者ユニーク数"
          : "アクティブ日数",
  };
  return (
    <Card>
      <div className="section-heading">
        {kind === "users" && (
          <Button
            onClick={() => {
              setTarget({ id: "", new: true });
              setEditEmail("");
              setEditName("");
              setEditBio("");
              setRole("USER");
              setStatus("ACTIVE");
              setPassword("");
              setNewUserPassword("");
              a.setError(null);
            }}
          >
            <Plus size={17} />
            ユーザーを作成
          </Button>
        )}
        <div className="search-bar">
          <Search size={18} />
          <input
            aria-label="検索"
            placeholder="検索…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {["users", "rooms", "logs"].includes(kind) && (
          <div className="filter-row">
            <select
              aria-label="状態・公開範囲の絞り込み"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">すべて</option>
              {(kind === "rooms"
                ? [
                    ["PRIVATE", "非公開"],
                    ["INVITE_ONLY", "招待制"],
                    ["PUBLIC", "公開"],
                  ]
                : kind === "logs"
                  ? [
                      ["INFO", "INFO"],
                      ["WARN", "WARN"],
                      ["ERROR", "ERROR"],
                    ]
                  : [
                      ["ACTIVE", "利用可能"],
                      ["SUSPENDED", "利用停止"],
                    ]
              ).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === "rooms" && (
          <select
            aria-label="ルームの削除状態"
            value={roomStatus}
            onChange={(e) => {
              setRoomStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="ACTIVE">未削除</option>
            <option value="DELETED">削除済み</option>
            <option value="">すべての状態</option>
          </select>
        )}
        {kind === "logs" && (
          <div className="filter-row">
            <input
              aria-label="開始日"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
            />
            <input
              aria-label="終了日"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
            />
          </div>
        )}
        {kind === "rankings" && (
          <div className="filter-row">
            <select
              aria-label="集計期間"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              <option value="7">7日間</option>
              <option value="30">30日間</option>
              <option value="all">全期間</option>
            </select>
            <select
              aria-label="順位の指標"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              <option value="posts">投稿数</option>
              <option value="members">投稿者ユニーク数</option>
              <option value="days">アクティブ日数</option>
            </select>
          </div>
        )}
      </div>
      <ErrorBox error={query.error || a.error} />
      {query.isPending ? (
        <Loading />
      ) : rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{names[c]}</th>
                ))}
                {["users", "rooms"].includes(kind) && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={String(row.id ?? i)}>
                  {columns.map((c) => (
                    <td key={c}>
                      {c.toLowerCase().endsWith("at") && row[c]
                        ? new Date(String(row[c])).toLocaleString("ja-JP")
                        : String(row[c] ?? "—")}
                    </td>
                  ))}
                  {["users", "rooms"].includes(kind) && (
                    <td>
                      {kind === "rooms" && row.deletedAt ? (
                        <span>削除済み</span>
                      ) : (
                        <Button
                          variant="outline compact"
                          onClick={() => {
                            setTarget(row);
                            setRole(String(row.role));
                            setStatus(String(row.status));
                            setReason("");
                            setPassword("");
                            setEditEmail(String(row.email ?? ""));
                            setEditName(String(row.displayName ?? ""));
                            setEditBio(String(row.bio ?? ""));
                            setNewUserPassword("");
                            a.setError(null);
                          }}
                        >
                          {kind === "users" ? "編集" : "削除"}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty />
      )}
      <div className="pagination">
        <span>
          {total}件中 {total ? page * 15 + 1 : 0}–
          {Math.min((page + 1) * 15, total)}
        </span>
        <Button
          variant="outline compact"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          前へ
        </Button>
        <Button
          variant="outline compact"
          disabled={!query.data?.pageInfo.nextCursor}
          onClick={() => setPage(page + 1)}
        >
          次へ
        </Button>
      </div>
      {target && (
        <Modal
          title={
            kind === "users"
              ? target.new
                ? "ユーザーを作成"
                : "ユーザーを編集"
              : "ルームの強制削除"
          }
          onClose={() => {
            setTarget(null);
            setPassword("");
            setNewUserPassword("");
          }}
        >
          <p>
            {target.new
              ? "新しいユーザー情報を入力してください。"
              : String(target.displayName ?? target.name ?? "")}
          </p>
          {kind === "users" ? (
            <>
              <Field label="表示名（必須）">
                <input
                  value={editName}
                  required
                  maxLength={40}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </Field>
              <Field label="メールアドレス（必須）">
                <input
                  type="email"
                  value={editEmail}
                  required
                  maxLength={254}
                  autoComplete="off"
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </Field>
              <Field label="自己紹介">
                <textarea
                  value={editBio}
                  maxLength={500}
                  onChange={(e) => setEditBio(e.target.value)}
                />
              </Field>
              <Field label="権限">
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="USER">一般ユーザー</option>
                  <option value="ADMIN">管理者</option>
                </select>
              </Field>
              <Field label="状態">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="ACTIVE">利用可能</option>
                  <option value="SUSPENDED">利用停止</option>
                </select>
              </Field>
              <Field
                label={
                  target.new
                    ? "初期パスワード（必須）"
                    : "新しいパスワード（変更時のみ）"
                }
                hint="12〜128文字で設定してください。保存済みパスワードは表示しません。"
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
              </Field>
              <Field label="管理者のパスワード（再認証）">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <p className="notice">
                会話と既存教材へのアクセスを停止します。削除理由は監査ログに記録します。
              </p>
              <Field label="削除理由（必須）">
                <textarea
                  required
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </>
          )}
          <ErrorBox error={a.error} />
          <Button
            variant={kind === "rooms" ? "danger" : ""}
            busy={a.busy}
            disabled={
              kind === "rooms"
                ? !reason.trim()
                : !password ||
                  !editName.trim() ||
                  !editEmail.trim() ||
                  (!!target.new && newUserPassword.length < 12)
            }
            onClick={() =>
              void a.act(async () => {
                const result = await api<{ requiresLogin?: boolean }>(
                  kind === "users" && target.new
                    ? "/admin/users"
                    : `/admin/${kind}/${target.id}`,
                  kind === "users" ? (target.new ? "POST" : "PATCH") : "DELETE",
                  kind === "users"
                    ? {
                        role,
                        status,
                        password,
                        email: editEmail,
                        displayName: editName,
                        bio: editBio,
                        ...(newUserPassword
                          ? { newPassword: newUserPassword }
                          : {}),
                      }
                    : { reason },
                );
                setTarget(null);
                setPassword("");
                setNewUserPassword("");
                if (result.requiresLogin) {
                  setCsrf("");
                  client.clear();
                  navigate("/login", { replace: true });
                  toast("ログイン情報を変更しました。再ログインしてください。");
                  return;
                }
                if (kind === "users" && target.id === user.id) await refresh();
                if (
                  kind === "rooms" &&
                  roomStatus === "ACTIVE" &&
                  rows.length === 1 &&
                  page > 0
                ) {
                  setPage(page - 1);
                } else {
                  await query.refetch();
                }
                toast(
                  kind === "rooms"
                    ? "ルームを削除しました"
                    : "変更を反映しました",
                );
              })
            }
          >
            確認して{kind === "users" ? (target.new ? "作成" : "変更") : "削除"}
            する
          </Button>
        </Modal>
      )}
    </Card>
  );
}
