import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Volume2,
  Square,
  Settings,
  Download,
  FileText,
  Film,
  Headphones,
  Sparkles,
  RefreshCw,
  ChevronDown,
  Users,
  Plus,
  Copy,
} from "lucide-react";
import { api, useApi, csrfToken } from "./api";
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
import { useAuth } from "./auth";
import { useAction } from "./pages";
import type {
  Room,
  Message,
  User,
  VideoOptions,
  ExportJob,
} from "../../../packages/shared/src";
type Caps = Record<
  "MP3" | "MARKDOWN" | "PDF" | "MP4",
  { available: boolean; reason: string }
>;
import { roomBackground } from "./room-background";
type RoomDetail = Room & { members: (User & { externalConsent: boolean })[] };
let playing: HTMLAudioElement | null = null;
function Speak({ message, allowed }: { message: Message; allowed: boolean }) {
  const a = useAction(),
    [active, setActive] = useState(false),
    toast = useToast();
  return (
    <div>
      <button
        className={`speak ${active ? "active" : ""}`}
        disabled={a.busy || !allowed}
        title={
          allowed
            ? "AI合成音声で読み上げ"
            : "管理者の音声有効化と接続確認が必要です"
        }
        onClick={() =>
          void a.act(async () => {
            if (active) {
              playing?.pause();
              setActive(false);
              return;
            }
            playing?.pause();
            const result = await api<{ url: string }>(
              `/rooms/${message.roomId}/messages/${message.id}/speak`,
              "POST",
            );
            playing = new Audio(result.url);
            const audio = playing;
            audio.onended = () => setActive(false);
            audio.onpause = () => setActive(false);
            audio.onerror = () => {
              setActive(false);
              toast("音声を再生できませんでした");
            };
            await audio.play();
            setActive(true);
          })
        }
      >
        {active ? <Square size={15} /> : <Volume2 size={16} />}
        {a.busy ? "生成中" : active ? "停止" : "発話"}
      </button>
      <ErrorBox error={a.error} />
    </div>
  );
}
function Bubble({ m, allowed }: { m: Message; allowed: boolean }) {
  const { user } = useAuth(),
    toast = useToast();
  return (
    <article className={`message ${m.authorId === user.id ? "mine" : ""}`}>
      <Avatar name={m.displayName} src={m.avatar} />
      <div className="message-content">
        <div className="message-meta">
          <strong>{m.displayName}</strong>
          <time>
            {new Date(m.createdAt).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          <Badge color={m.mode === "AI_EXPANDED" ? "purple" : ""}>
            {m.mode === "AI_EXPANDED"
              ? "AI拡張"
              : m.mode === "AI_LECTURER"
                ? "AI講師"
                : "原文投稿"}
          </Badge>
        </div>
        <div className="message-body">
          <ReactMarkdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ alt }) => (
                <span className="notice">
                  画像：{alt || "外部画像は自動取得しません"}
                </span>
              ),
              a: (props) => (
                <a {...props} target="_blank" rel="noopener noreferrer" />
              ),
              pre: (props) => (
                <div className="code-wrap">
                  <button
                    aria-label="コードをコピー"
                    onClick={(e) => {
                      const code =
                        e.currentTarget.parentElement?.querySelector(
                          "pre",
                        )?.textContent;
                      if (code)
                        void navigator.clipboard
                          .writeText(code)
                          .then(() => toast("コードをコピーしました"));
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <pre {...props} />
                </div>
              ),
            }}
          >
            {m.finalText}
          </ReactMarkdown>
        </div>
        {m.mode === "AI_EXPANDED" && m.authorId === user.id && (
          <details className="original">
            <summary>入力した原文</summary>
            <p>{m.originalText}</p>
          </details>
        )}
      </div>
      <Speak message={m} allowed={allowed} />
    </article>
  );
}
export function ChatPage() {
  const { roomId } = useParams(),
    room = useApi<RoomDetail>(`/rooms/${roomId}`),
    caps = useApi<Caps>("/export-capabilities", true, 5000),
    [messages, setMessages] = useState<Message[]>([]),
    [connected, setConnected] = useState(false),
    [text, setText] = useState(""),
    [mode, setMode] = useState("ORIGINAL"),
    [preview, setPreview] = useState<string | null>(null),
    [expandedOriginal, setExpandedOriginal] = useState(""),
    [snapshot, setSnapshot] = useState<{
      id: string;
      count: number;
      at: string;
    } | null>(null),
    [showVideo, setShowVideo] = useState(false),
    [showSide, setShowSide] = useState(false),
    [options, setOptions] = useState<VideoOptions>({
      mode: "GENERATED_SCENES",
      aspectRatio: "16:9",
      subtitles: true,
      externalConsent: false,
      budget: 1,
    }),
    [jobs, setJobs] = useState<ExportJob[]>([]),
    [invite, setInvite] = useState(false),
    [search, setSearch] = useState(""),
    users = useApi<{ id: string; displayName: string }[]>(
      `/users/search?q=${encodeURIComponent(search)}`,
      invite && search.length >= 2,
    ),
    a = useAction(),
    exportAction = useAction(),
    toast = useToast(),
    { user } = useAuth(),
    navigate = useNavigate(),
    bottom = useRef<HTMLDivElement>(null),
    sideToggle = useRef<HTMLButtonElement>(null),
    last = useRef(0),
    clientId = useRef(crypto.randomUUID());
  const merge = (items: Message[]) =>
    setMessages((old) => {
      const map = new Map([...old, ...items].map((m) => [m.id, m]));
      const result = [...map.values()].sort(
        (x, y) => x.sequenceNo - y.sequenceNo,
      );
      last.current = result.at(-1)?.sequenceNo ?? 0;
      return result;
    });
  useEffect(() => {
    setMessages([]);
    last.current = 0;
    let cancelled = false;
    async function catchup() {
      let after = last.current;
      while (!cancelled) {
        const rows = await api<Message[]>(
          `/rooms/${roomId}/messages?after=${after}`,
        );
        if (cancelled) return;
        merge(rows);
        if (rows.length < 500) break;
        after = rows.at(-1)!.sequenceNo;
      }
    }
    void catchup().catch(a.setError);
    const socket = io({ auth: { csrf: csrfToken } });
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:join", roomId);
      void catchup().catch(a.setError);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("message:committed", (m: Message) => {
      if (m.roomId === roomId) merge([m]);
    });
    socket.on("room:revoked", () => {
      toast("参加権限が変更されました");
      navigate("/rooms");
    });
    return () => {
      cancelled = true;
      socket.disconnect();
      playing?.pause();
    };
  }, [roomId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);
  useEffect(() => {
    const active = jobs.filter((j) =>
      ["queued", "processing"].includes(j.status),
    );
    if (!active.length) return;
    const timer = setInterval(() => {
      void Promise.all(active.map((j) => api<ExportJob>(`/exports/${j.id}`)))
        .then((updated) =>
          setJobs((old) =>
            old.map((j) => updated.find((v) => v.id === j.id) ?? j),
          ),
        )
        .catch(exportAction.setError);
    }, 2000);
    return () => clearInterval(timer);
  }, [jobs]);
  if (room.isPending) return <Loading />;
  if (!room.data)
    return (
      <div className="page">
        <ErrorBox error={room.error} />
        <Link to="/rooms">ルーム一覧へ</Link>
      </div>
    );
  const r = room.data,
    canManage = r.ownerId === user.id || user.role === "ADMIN";
  async function send() {
    await a.act(async () => {
      const original = preview !== null ? expandedOriginal : text,
        final = preview ?? text;
      const m = await api<Message>(`/rooms/${roomId}/messages`, "POST", {
        mode: preview !== null ? "AI_EXPANDED" : "ORIGINAL",
        originalText: original,
        finalText: final,
        clientId: clientId.current,
      });
      merge([m]);
      clientId.current = crypto.randomUUID();
      setText("");
      setPreview(null);
    });
  }
  async function startExport(type: string, video?: VideoOptions) {
    await exportAction.act(async () => {
      let snap = snapshot;
      if (!snap) {
        const s = await api<{ id: string; count: number; at: string }>(
          `/rooms/${roomId}/snapshots`,
          "POST",
        );
        snap = {
          id: s.id,
          count: s.count,
          at: s.at,
        };
        setSnapshot(snap);
      }
      const job = await api<ExportJob>(`/rooms/${roomId}/exports`, "POST", {
        type,
        snapshotId: snap.id,
        ...(video ? { options: video } : {}),
      });
      setJobs((old) => [job, ...old.filter((j) => j.id !== job.id)]);
      setShowVideo(false);
    });
  }
  return (
    <div className="chat-layout">
      <section className="chat-main">
        <header className="chat-header">
          <span className="room-symbol">
            <BookMark type={r.type} />
          </span>
          <div>
            <h1>{r.name}</h1>
            <p>{r.description}</p>
            <div className="chat-status">
              <Badge color="green">{connected ? "接続中" : "再接続中"}</Badge>
              <span>
                <Users size={14} />
                {r.memberCount}人
              </span>
            </div>
          </div>
          <button
            className="icon-button side-toggle"
            ref={sideToggle}
            aria-expanded={showSide}
            aria-label="ルーム情報と書き出し"
            onClick={() => setShowSide(!showSide)}
          >
            <ChevronDown />
          </button>
          {canManage && (
            <Link
              className="icon-button"
              aria-label="ルーム設定"
              to={`/rooms/${roomId}/edit`}
            >
              <Settings size={19} />
            </Link>
          )}
        </header>
        <div
          className={`messages room-backdrop ${roomBackground(r.background).className}`}
          style={roomBackground(r.background).style}
          aria-live="polite"
        >
          {messages.length ? (
            messages.map((m) => (
              <Bubble key={m.id} m={m} allowed={!!caps.data?.MP3.available} />
            ))
          ) : (
            <Empty>最初の質問やアイデアを投稿してみましょう。</Empty>
          )}
          {r.type === "AI_LECTURER" && messages.at(-1)?.authorId && (
            <div className="reply-state">
              <span>AI講師の回答が届かない場合</span>
              <Button
                variant="outline compact"
                busy={a.busy}
                onClick={() =>
                  void a.act(async () => {
                    await api(
                      `/rooms/${roomId}/messages/${messages.at(-1)!.id}/reply`,
                      "POST",
                    );
                    merge(
                      await api<Message[]>(
                        `/rooms/${roomId}/messages?after=${last.current}`,
                      ),
                    );
                  })
                }
              >
                <RefreshCw size={14} />
                回答を再試行
              </Button>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <div className="composer">
          <ErrorBox error={a.error} />
          {preview !== null && (
            <div className="expansion-preview">
              <div className="section-heading">
                <strong>
                  <Sparkles size={16} /> AI拡張の候補
                </strong>
                <button
                  onClick={() => {
                    setPreview(null);
                    setMode("ORIGINAL");
                  }}
                >
                  キャンセル
                </button>
              </div>
              <textarea
                aria-label="AI拡張候補を編集"
                value={preview}
                maxLength={4000}
                onChange={(e) => setPreview(e.target.value)}
              />
              <small>
                内容を確認・編集してから送信してください。未採用の候補は投稿されません。
              </small>
            </div>
          )}
          <textarea
            aria-label="メッセージ"
            placeholder="質問や考えを入力してください…（Shift + Enterで改行）"
            value={text}
            maxLength={2000}
            disabled={preview !== null}
            onChange={(e) => {
              setText(e.target.value);
              clientId.current = crypto.randomUUID();
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (text.trim() && !a.busy && mode === "ORIGINAL") void send();
              }
            }}
          />
          <div className="composer-toolbar">
            <div className="mode-switch">
              <button
                aria-pressed={mode === "ORIGINAL"}
                onClick={() => {
                  setMode("ORIGINAL");
                  setPreview(null);
                }}
              >
                原文のまま
              </button>
              <button
                aria-pressed={mode === "AI_EXPANDED"}
                onClick={() => setMode("AI_EXPANDED")}
              >
                <Sparkles size={15} />
                AIで膨らませる
              </button>
            </div>
            <small>{text.length}/2000</small>
            {mode === "AI_EXPANDED" && preview === null ? (
              <Button
                disabled={!text.trim()}
                busy={a.busy}
                onClick={() =>
                  void a.act(async () => {
                    const original = text;
                    const v = await api<{ text: string }>(
                      "/ai/expand",
                      "POST",
                      { roomId, text: original },
                    );
                    setExpandedOriginal(original);
                    setPreview(v.text);
                  })
                }
              >
                <Sparkles size={17} />
                拡張案を生成
              </Button>
            ) : (
              <Button
                busy={a.busy}
                disabled={!(preview ?? text).trim()}
                onClick={() => void send()}
              >
                <Send size={17} />
                {preview !== null ? "この内容で送信" : "送信"}
              </Button>
            )}
          </div>
          <small className="disclosure">
            AIの回答は誤りを含む場合があります。発話ボタンではAI合成音声が再生されます。
          </small>
        </div>
      </section>
      <aside className={`chat-side ${showSide ? "visible" : ""}`}>
        {showSide && (
          <Button
            autoFocus
            variant="outline full"
            aria-label="ルーム情報を閉じる"
            onClick={() => {
              setShowSide(false);
              sideToggle.current?.focus();
            }}
          >
            閉じる
          </Button>
        )}
        <Card>
          <h2>
            <Download size={20} />
            教材を書き出す
          </h2>
          <p className="muted small">確定した対話を、あとから学べる教材に。</p>
          <div className="snapshot-info">
            対象：{snapshot?.count ?? messages.length} 投稿
            <br />
            {snapshot
              ? `基準：${new Date(snapshot.at).toLocaleTimeString("ja-JP")}`
              : "最初の書き出し時に対話を固定します"}
            {snapshot && <small>ID: {snapshot.id.slice(0, 8)}</small>}
          </div>
          {snapshot && messages.length > snapshot.count && (
            <Button
              variant="outline compact full"
              onClick={() => setSnapshot(null)}
            >
              <RefreshCw size={14} />
              新しい投稿を含めて再生成
            </Button>
          )}
          {[
            ["MP3", "音声をダウンロード", Headphones],
            ["MARKDOWN", "Markdownをダウンロード", FileText],
            ["PDF", "PDFをダウンロード", FileText],
            ["MP4", "動画を作成", Film],
          ].map(([type, label, Icon]) => {
            const key = type as keyof Caps,
              I = Icon as typeof Film,
              c = caps.data?.[key];
            return (
              <div className="export-option" key={key}>
                <Button
                  variant={`outline full ${key.toLowerCase()}`}
                  disabled={
                    !messages.length || !c?.available || exportAction.busy
                  }
                  onClick={() =>
                    key === "MP4" ? setShowVideo(true) : void startExport(key)
                  }
                >
                  <I size={22} />
                  <span>
                    {String(label)}
                    <small>{key === "MARKDOWN" ? ".md" : key}</small>
                  </span>
                  <Download size={15} />
                </Button>
                {!c?.available && (
                  <small className="disabled-reason">
                    {c?.reason || "接続状態を確認中"}
                  </small>
                )}
              </div>
            );
          })}
          <ErrorBox error={exportAction.error} />
          {jobs.map((j) => (
            <div className="job-card" key={j.id}>
              <div>
                <strong>{j.type}</strong>
                <Badge>{j.status}</Badge>
              </div>
              {["queued", "processing"].includes(j.status) && (
                <progress max={100} value={j.progress} />
              )}
              <ErrorBox error={j.error} />
              {j.status === "ready" && (
                <>
                  <a
                    className="button soft compact full"
                    href={`/api/exports/${j.id}/download`}
                  >
                    ダウンロード
                  </a>
                  {j.type === "MP4" && (
                    <video
                      controls
                      preload="metadata"
                      src={`/api/exports/${j.id}/preview`}
                    />
                  )}
                </>
              )}
              {j.status === "failed" && (
                <Button
                  variant="outline compact"
                  onClick={() =>
                    void exportAction.act(async () => {
                      await api(`/exports/${j.id}/retry`, "POST", {
                        confirmCharge: window.confirm(
                          "再試行します。生成AI動画は追加費用がかかる場合があります。",
                        ),
                      });
                      setJobs((old) =>
                        old.map((x) =>
                          x.id === j.id ? { ...x, status: "queued" } : x,
                        ),
                      );
                    })
                  }
                >
                  再試行
                </Button>
              )}
            </div>
          ))}
        </Card>
        <Card>
          <div className="section-heading">
            <h2>ルーム情報</h2>
            {canManage && (
              <Link aria-label="ルームを編集" to={`/rooms/${roomId}/edit`}>
                <Settings size={17} />
              </Link>
            )}
          </div>
          <Badge>
            {r.type === "PEER" ? "学生同士の対話" : "AI講師との対話"}
          </Badge>
          <p>{r.description}</p>
          {r.type === "AI_LECTURER" && (
            <p className="muted small">
              AI講師の発話：最大{r.lecturerSpeechMaxChars}文字
            </p>
          )}
          <div className="section-heading">
            <h3>メンバー（{r.members.length}）</h3>
            {canManage && r.visibility === "INVITE_ONLY" && (
              <button
                aria-label="メンバーを招待"
                onClick={() => setInvite(true)}
              >
                <Plus size={18} />
              </button>
            )}
          </div>
          {r.members.map((m) => (
            <div className="member" key={m.id}>
              <Avatar name={m.displayName} src={m.avatar} />
              <span>
                {m.displayName}
                {m.id === r.ownerId && <small>ルームオーナー</small>}
              </span>
              {canManage && m.id !== r.ownerId && (
                <button
                  aria-label={`${m.displayName}を退出させる`}
                  onClick={() =>
                    void a.act(async () => {
                      if (!window.confirm("この参加者を退出させますか？"))
                        return;
                      await api(`/rooms/${roomId}/members/${m.id}`, "DELETE");
                      await room.refetch();
                    })
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={
                !!r.members.find((m) => m.id === user.id)?.externalConsent
              }
              onChange={(e) =>
                void a.act(async () => {
                  await api(`/rooms/${roomId}/consent`, "PATCH", {
                    externalConsent: e.target.checked,
                  });
                  await room.refetch();
                })
              }
            />
            外部AI・TTSへの送信に同意
          </label>
          <p className="muted small">
            送信先は管理設定のGemini／OpenAIです。ローカル接続は運用者のサーバーで処理します。確定した発言は参加者が教材として書き出せます。
          </p>
        </Card>
      </aside>
      {showVideo && (
        <Modal title="対話動画を作成" onClose={() => setShowVideo(false)}>
          <p>
            対象：{snapshot?.count ?? messages.length}{" "}
            投稿。同じスナップショットの音声・字幕を使います。
          </p>
          <Field label="動画形式">
            <select
              value={options.mode}
              onChange={(e) =>
                setOptions({
                  ...options,
                  mode: e.target.value as VideoOptions["mode"],
                })
              }
            >
              <option value="GENERATED_SCENES">
                生成AIシーン動画（Gemini・標準）
              </option>
              <option value="AVATAR_DIALOGUE">
                アバター対話動画（ローカル合成）
              </option>
            </select>
          </Field>
          <Field label="画面比率">
            <select
              value={options.aspectRatio}
              onChange={(e) =>
                setOptions({
                  ...options,
                  aspectRatio: e.target.value as VideoOptions["aspectRatio"],
                })
              }
            >
              <option>16:9</option>
              <option>9:16</option>
            </select>
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={options.subtitles}
              onChange={(e) =>
                setOptions({ ...options, subtitles: e.target.checked })
              }
            />
            字幕を表示
          </label>
          {options.mode === "GENERATED_SCENES" && (
            <>
              <Field label="今回の費用上限（USD・管理者設定の上限も適用）">
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={options.budget}
                  onChange={(e) =>
                    setOptions({ ...options, budget: Number(e.target.value) })
                  }
                />
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={options.externalConsent}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      externalConsent: e.target.checked,
                    })
                  }
                />
                確定対話をGeminiへ送り、映像生成費用が発生することを確認しました。
              </label>
            </>
          )}
          <p className="notice">
            許可されたアバターだけを動画に利用します。未許可の画像は匿名表示になります。
          </p>
          <ErrorBox error={exportAction.error} />
          <Button
            busy={exportAction.busy}
            onClick={() => void startExport("MP4", options)}
          >
            動画生成を開始
          </Button>
        </Modal>
      )}
      {invite && (
        <Modal title="メンバーを招待" onClose={() => setInvite(false)}>
          <Field label="表示名で検索">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="2文字以上で検索"
            />
          </Field>
          {users.data?.map((u) => (
            <div className="member" key={u.id}>
              <span>{u.displayName}</span>
              <Button
                variant="outline compact"
                onClick={() =>
                  void a.act(async () => {
                    await api(`/rooms/${roomId}/members`, "POST", {
                      userId: u.id,
                    });
                    toast("招待しました");
                    setInvite(false);
                  })
                }
              >
                招待
              </Button>
            </div>
          ))}
          <ErrorBox error={a.error} />
        </Modal>
      )}
    </div>
  );
}
function BookMark({ type }: { type: string }) {
  return type === "PEER" ? <Users size={25} /> : <Sparkles size={25} />;
}
