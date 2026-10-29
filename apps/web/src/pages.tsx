import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  ArrowRight,
  Plus,
  MessageCircle,
  Users,
  Headphones,
  BookOpen,
  Eye,
  EyeOff,
  Search,
  LockKeyhole,
  Globe,
  Mail,
  Trash2,
  Pencil,
  LogOut,
  Download,
  Upload,
  Sparkles,
  Check,
} from "lucide-react";
import { api, useApi, setCsrf } from "./api";
import {
  Avatar,
  Brand,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Badge,
  Modal,
  useToast,
} from "./ui";
import { useAuth } from "./auth";
import type {
  User,
  Room,
  RoomInput,
  Lecturer,
  ExportJob,
} from "../../../packages/shared/src";
import { roomSchema } from "../../../packages/shared/src";
import { roomBackground } from "./room-background";
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  return {
    busy,
    error,
    setError,
    act: async (fn: () => Promise<void>) => {
      setError(null);
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    },
  };
}
export function AuthPage({ register = false }: { register?: boolean }) {
  const navigate = useNavigate(),
    client = useQueryClient(),
    a = useAction(),
    [show, setShow] = useState(false),
    { register: field, handleSubmit } = useForm<{
      displayName: string;
      email: string;
      password: string;
      remember: boolean;
    }>(),
    options = useApi<{ registrationEnabled: boolean }>("/auth/options");
  return (
    <div className="auth-page">
      <header>
        <Brand />
        <Link to={register ? "/login" : "/register"}>
          {register ? "ログイン" : "アカウントを作成"} <ArrowRight size={16} />
        </Link>
      </header>
      <main className="auth-grid">
        <Card className="auth-card">
          <Badge>LEARN THROUGH DIALOGUE</Badge>
          <h1>{register ? "学びの一歩を、ここから。" : "おかえりなさい。"}</h1>
          <p className="muted">
            {register
              ? "対話を通じて、新しい理解に出会いましょう。"
              : "あなたの「知りたい」を、対話から広げよう。"}
          </p>
          <form
            onSubmit={handleSubmit((v) =>
              a.act(async () => {
                const result = await api<{ user: User; csrf: string }>(
                  register ? "/auth/register" : "/auth/login",
                  "POST",
                  v,
                );
                setCsrf(result.csrf);
                await client.invalidateQueries();
                navigate("/me");
              }),
            )}
          >
            {register && (
              <Field label="表示名">
                <input
                  {...field("displayName", { required: true, maxLength: 40 })}
                  autoComplete="nickname"
                  placeholder="学習で使う名前"
                  required
                  maxLength={40}
                />
              </Field>
            )}
            <Field label="メールアドレス">
              <div className="input-icon">
                <Mail size={18} />
                <input
                  {...field("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </Field>
            <Field
              label="パスワード"
              hint={register ? "12文字以上で設定してください" : undefined}
            >
              <div className="input-icon">
                <LockKeyhole size={18} />
                <input
                  {...field("password")}
                  type={show ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  required
                  placeholder="パスワードを入力"
                />
                <button
                  type="button"
                  aria-label="パスワード表示を切り替える"
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            {!register && (
              <label className="checkbox">
                <input {...field("remember")} type="checkbox" />
                ログイン状態を保持する
              </label>
            )}
            <ErrorBox error={a.error} />
            <Button
              className="full"
              busy={a.busy}
              disabled={register && options.data?.registrationEnabled === false}
            >
              {register ? "新規登録" : "ログイン"}
              <ArrowRight size={18} />
            </Button>
          </form>
          <div className="divider">または</div>
          <Link
            className="button outline full"
            to={register ? "/login" : "/register"}
          >
            {register ? "ログイン画面へ" : "無料で新規登録"}
          </Link>
          {!register && (
            <details>
              <summary>パスワードを忘れた場合</summary>
              <p>運用管理者にアカウントの復旧を依頼してください。</p>
            </details>
          )}
        </Card>
        <section className="auth-hero">
          <span className="eyebrow">YOUR LEARNING, CONNECTED</span>
          <h2>
            対話から広がる、
            <br />
            あたらしい学びのかたち。
          </h2>
          <p>
            問いかける。考える。分かち合う。
            <br />
            AI講師や仲間との対話が、あなたの理解を深めます。
          </p>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-book">
              <BookOpen size={92} />
            </div>
            <span className="floating a">
              <MessageCircle />
              「なぜ？」が学びのはじまり
            </span>
            <span className="floating b">
              <Sparkles />
              なるほど、がつながる。
            </span>
          </div>
          <div className="feature-grid">
            {[
              [MessageCircle, "AI講師と対話", "自分のペースで、理解を深く。"],
              [Users, "仲間と学ぶ", "視点を重ねて、新しい発見へ。"],
              [Headphones, "学びを持ち帰る", "音声・テキスト・動画で復習。"],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Users;
              return (
                <Card key={String(title)}>
                  <I size={25} />
                  <h3>{String(title)}</h3>
                  <p>{String(text)}</p>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
      <footer>Dialogria — 対話で、学びはもっと深く、面白くなる。</footer>
    </div>
  );
}
export const backgroundNames: Record<string, string> = {
  classroom: "ひだまりの教室",
  library: "静かな図書室",
  sakura: "桜のキャンパス",
  city: "街のラウンジ",
  night: "夜の書斎",
};
export function RoomCard({
  room,
  onChange,
}: {
  room: Room & { invited?: boolean };
  onChange: () => void;
}) {
  const { user } = useAuth(),
    navigate = useNavigate(),
    a = useAction(),
    [confirm, setConfirm] = useState(""),
    [consent, setConsent] = useState(false);
  return (
    <Card className="room-card">
      <div
        className={`room-cover ${roomBackground(room.background).className}`}
        style={roomBackground(room.background).style}
      >
        <BookOpen size={38} />
        <Badge>
          {room.type === "AI_LECTURER" ? "AI講師との対話" : "仲間との学習"}
        </Badge>
      </div>
      <div className="room-card-body">
        <div className="room-title">
          <h3>{room.name}</h3>
          {room.visibility === "PRIVATE" ? (
            <LockKeyhole size={16} />
          ) : (
            <Globe size={16} />
          )}
        </div>
        <p>{room.description || "対話をはじめましょう。"}</p>
        <div className="room-meta">
          <span>
            <Users size={15} />
            {room.memberCount}人
          </span>
          <span>{new Date(room.updatedAt).toLocaleDateString("ja-JP")}</span>
        </div>
        <ErrorBox error={a.error} />
        <div className="room-actions">
          {room.joined ? (
            <Link className="button soft" to={`/rooms/${room.id}`}>
              ルームを開く
              <ArrowRight size={16} />
            </Link>
          ) : (
            <Button variant="soft" onClick={() => setConfirm("join")}>
              {room.invited ? "招待を受ける" : "参加する"}
              <Plus size={16} />
            </Button>
          )}
          {user.id === room.ownerId ? (
            <>
              <Link
                className="icon-button"
                aria-label="ルームを編集"
                to={`/rooms/${room.id}/edit`}
              >
                <Pencil size={17} />
              </Link>
              <button
                className="icon-button danger-text"
                aria-label="ルームを削除"
                onClick={() => setConfirm("delete")}
              >
                <Trash2 size={17} />
              </button>
            </>
          ) : (
            room.joined && (
              <button
                className="icon-button"
                aria-label="ルームを退出"
                onClick={() => setConfirm("leave")}
              >
                <LogOut size={17} />
              </button>
            )
          )}
        </div>
      </div>
      {confirm && (
        <Modal
          title={
            confirm === "join"
              ? "ルームに参加"
              : confirm === "delete"
                ? "ルームを削除"
                : "ルームを退出"
          }
          onClose={() => setConfirm("")}
        >
          <p>
            「{room.name}」
            {confirm === "delete"
              ? "を削除します。参加者は会話と教材にアクセスできなくなります。"
              : confirm === "leave"
                ? "から退出します。会話と教材へのアクセス権を失います。"
                : "に参加します。確定した発言は参加者が教材として書き出せます。"}
          </p>
          {confirm === "join" && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              対話を設定済みの外部AI・TTSへ送信することに同意する（任意）
            </label>
          )}
          <ErrorBox error={a.error} />
          <Button
            busy={a.busy}
            variant={confirm === "delete" ? "danger" : ""}
            onClick={() =>
              a.act(async () => {
                await api(
                  confirm === "delete"
                    ? `/rooms/${room.id}`
                    : `/rooms/${room.id}/${confirm === "join" ? "join" : "leave"}`,
                  confirm === "delete" ? "DELETE" : "POST",
                  confirm === "join" ? { externalConsent: consent } : {},
                );
                setConfirm("");
                onChange();
              })
            }
          >
            確認して
            {confirm === "delete"
              ? "削除"
              : confirm === "join"
                ? "参加"
                : "退出"}
            する
          </Button>
        </Modal>
      )}
    </Card>
  );
}
export function RoomsPage() {
  const [q, setQ] = useState(""),
    rooms = useApi<Room[]>(`/rooms?q=${encodeURIComponent(q)}`);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">LEARNING ROOMS</span>
          <h1>学びの場を、見つけよう。</h1>
          <p>AI講師や仲間と、興味のあるテーマを深めましょう。</p>
        </div>
        <Link className="button" to="/rooms/new">
          <Plus size={18} />
          ルームを作成
        </Link>
      </div>
      <div className="search-bar">
        <Search size={20} />
        <input
          aria-label="ルームを検索"
          placeholder="ルーム名で検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Badge>{rooms.data?.length ?? 0} ルーム</Badge>
      </div>
      <ErrorBox error={rooms.error} />
      {rooms.isPending ? (
        <Loading />
      ) : rooms.data?.length ? (
        <div className="rooms-grid">
          {rooms.data.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              onChange={() => void rooms.refetch()}
            />
          ))}
        </div>
      ) : (
        <Empty>ルームがありません。新しい学びの場を作成しましょう。</Empty>
      )}
    </div>
  );
}
export function ProfilePage() {
  const { user, refresh } = useAuth(),
    rooms = useApi<Room[]>("/rooms"),
    exports = useApi<ExportJob[]>("/exports", true, 4000),
    [name, setName] = useState(user.displayName),
    [bio, setBio] = useState(user.bio),
    [consent, setConsent] = useState(user.avatarVideoConsent),
    a = useAction(),
    toast = useToast();
  const own = rooms.data?.filter((r) => r.ownerId === user.id) ?? [],
    joined = rooms.data?.filter((r) => r.joined && r.ownerId !== user.id) ?? [];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MY LEARNING SPACE</span>
          <h1>こんにちは、{user.displayName}さん。</h1>
          <p>今日も、新しい「なるほど」を見つけましょう。</p>
        </div>
        <Link className="button" to="/rooms/new">
          <Plus size={18} />
          ルームを作成
        </Link>
      </div>
      <div className="profile-top">
        <Card>
          <div className="section-heading">
            <h2>プロフィール</h2>
            <Badge>MY PROFILE</Badge>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void a.act(async () => {
                await api("/me", "PATCH", {
                  displayName: name,
                  bio,
                  avatarVideoConsent: consent,
                });
                await refresh();
                toast("プロフィールを保存しました");
              });
            }}
          >
            <div className="profile-avatar">
              <Avatar size="large" name={name} src={user.avatar} />
              <label className="button outline">
                <Upload size={16} />
                画像を変更
                <input
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void a.act(async () => {
                        const form = new FormData();
                        form.append("image", f);
                        await api("/me/avatar", "POST", form);
                        await refresh();
                      });
                  }}
                />
              </label>
              {user.avatar && (
                <button
                  type="button"
                  aria-label="アバターを削除"
                  onClick={() =>
                    void a.act(async () => {
                      await api("/me/avatar", "DELETE");
                      await refresh();
                    })
                  }
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <Field label="表示名">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={40}
              />
            </Field>
            <Field label="自己紹介">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                placeholder="学んでいることや、興味のあるテーマ"
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              アバター画像の教材動画への利用を許可する
            </label>
            <ErrorBox error={a.error} />
            <Button busy={a.busy}>プロフィールを保存</Button>
          </form>
        </Card>
        <Card className="learning-summary">
          <span className="eyebrow">YOUR JOURNEY</span>
          <h2>
            対話の数だけ、
            <br />
            学びが広がる。
          </h2>
          <div className="stat-row">
            <span>作成したルーム</span>
            <strong>
              {own.length}
              <small>ルーム</small>
            </strong>
          </div>
          <div className="stat-row">
            <span>参加中のルーム</span>
            <strong>
              {joined.length}
              <small>ルーム</small>
            </strong>
          </div>
          <div className="stat-row">
            <span>完成した教材</span>
            <strong>
              {exports.data?.filter((j) => j.status === "ready").length ?? 0}
              <small>件</small>
            </strong>
          </div>
          <BookOpen className="summary-book" size={90} />
        </Card>
      </div>
      <div className="section-heading">
        <h2>自分が作成したルーム</h2>
        <Link to="/rooms">
          すべて見る <ArrowRight size={16} />
        </Link>
      </div>
      {own.length ? (
        <div className="rooms-grid">
          {own.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              onChange={() => void rooms.refetch()}
            />
          ))}
        </div>
      ) : (
        <Card>
          <Empty>最初のルームを作成して、対話をはじめましょう。</Empty>
        </Card>
      )}
      <div className="section-heading">
        <h2>参加したルーム</h2>
      </div>
      {joined.length ? (
        <div className="rooms-grid">
          {joined.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              onChange={() => void rooms.refetch()}
            />
          ))}
        </div>
      ) : (
        <Card>
          <Empty>参加中のルームはありません。</Empty>
        </Card>
      )}
      <div className="section-heading">
        <h2>教材の書き出し履歴</h2>
      </div>
      <Card>
        {exports.data?.length ? (
          <div className="history-list">
            {exports.data.map((j) => (
              <div key={j.id}>
                <span className="history-icon">
                  <Download size={20} />
                </span>
                <div>
                  <strong>
                    {j.type === "CLOZE_PDF" ? "穴埋め学習PDF" : j.type} 教材
                  </strong>
                  <small>
                    {new Date(j.createdAt).toLocaleString("ja-JP")} ·{" "}
                    {j.snapshotId.slice(0, 8)}
                    {j.size ? ` · ${(j.size / 1024 / 1024).toFixed(1)} MB` : ""}
                    {j.durationMs
                      ? ` · ${(j.durationMs / 60000).toFixed(1)}分`
                      : ""}
                  </small>
                </div>
                <Badge>{j.status}</Badge>
                {j.status === "ready" && (
                  <a
                    className="button outline compact"
                    href={`/api/exports/${j.id}/download`}
                  >
                    保存
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty>対話を教材に書き出すと、ここに表示されます。</Empty>
        )}
      </Card>
    </div>
  );
}
const initialRoom: RoomInput = {
  name: "",
  description: "",
  type: "AI_LECTURER",
  visibility: "PRIVATE",
  background: "classroom",
  lecturerId: null,
  invitees: [],
  externalConsent: false,
};
export function RoomFormPage() {
  const { roomId } = useParams(),
    edit = useApi<Room>(`/rooms/${roomId}`, !!roomId),
    defaults = useApi<{ lecturerSpeechMaxChars: number }>(
      "/rooms/defaults",
      !roomId,
    ),
    lecturers = useApi<Lecturer[]>("/lecturers"),
    [form, setForm] = useState<RoomInput>(initialRoom),
    a = useAction(),
    navigate = useNavigate(),
    [search, setSearch] = useState(""),
    candidates = useApi<{ id: string; displayName: string }[]>(
      `/users/search?q=${encodeURIComponent(search)}`,
      search.length >= 2,
    );
  useEffect(() => {
    if (edit.data) setForm({ ...initialRoom, ...edit.data, invitees: [] });
  }, [edit.data]);
  useEffect(() => {
    if (!roomId && defaults.data) {
      setForm((current) => ({
        ...current,
        lecturerSpeechMaxChars:
          current.lecturerSpeechMaxChars ??
          defaults.data.lecturerSpeechMaxChars,
      }));
    }
  }, [roomId, defaults.data]);
  const set = <K extends keyof RoomInput>(k: K, v: RoomInput[K]) =>
      setForm((f) => ({ ...f, [k]: v })),
    selected = lecturers.data?.find((l) => l.id === form.lecturerId);
  return (
    <div className="page">
      <Link className="back-link" to="/rooms">
        ← 一覧に戻る
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CREATE YOUR SPACE</span>
          <h1>{roomId ? "ルーム編集" : "ルームを作成"}</h1>
          <p>問いを持ち寄って、一緒に学ぶ場所を。</p>
        </div>
      </div>
      <ErrorBox error={edit.error || defaults.error} />
      <div className="room-form-grid">
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void a.act(async () => {
                const value = roomSchema.parse(form);
                const r = await api<Room>(
                  roomId ? `/rooms/${roomId}` : "/rooms",
                  roomId ? "PATCH" : "POST",
                  value,
                );
                navigate(`/rooms/${r.id}`);
              });
            }}
          >
            <Field label="ルーム名 *" hint={`${form.name.length} / 80`}>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                maxLength={80}
                placeholder="例：Pythonの基礎を学ぶ"
              />
            </Field>
            <Field label="ルーム説明">
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={1000}
                placeholder="どんなことを学ぶルームですか？"
              />
            </Field>
            <fieldset>
              <legend>ルーム種別 *</legend>
              <div className="option-grid">
                {(["AI_LECTURER", "PEER"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`option ${form.type === type ? "selected" : ""}`}
                    aria-pressed={form.type === type}
                    onClick={() => {
                      set("type", type);
                      if (type === "PEER") set("lecturerId", null);
                    }}
                  >
                    {type === "AI_LECTURER" ? <MessageCircle /> : <Users />}
                    <strong>
                      {type === "AI_LECTURER"
                        ? "AI講師との対話"
                        : "学生同士の対話"}
                    </strong>
                    <small>
                      {type === "AI_LECTURER"
                        ? "自分のペースで、じっくり理解"
                        : "仲間と視点を持ち寄る学び"}
                    </small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>公開範囲 *</legend>
              <div className="option-grid three">
                {[
                  ["PRIVATE", "非公開", LockKeyhole],
                  ["INVITE_ONLY", "招待制", Users],
                  ["PUBLIC", "公開", Globe],
                ].map(([value, label, Icon]) => {
                  const I = Icon as typeof Users;
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      className={`option ${form.visibility === value ? "selected" : ""}`}
                      aria-pressed={form.visibility === value}
                      onClick={() =>
                        set("visibility", value as RoomInput["visibility"])
                      }
                    >
                      <I size={20} />
                      <strong>{String(label)}</strong>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset>
              <legend>背景</legend>
              <div className="background-picker">
                {Object.entries(backgroundNames).map(([key, name]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={name}
                    aria-pressed={form.background === key}
                    className={`background-tile ${key} ${form.background === key ? "selected" : ""}`}
                    onClick={() => set("background", key)}
                  >
                    <BookOpen size={22} />
                    <small>{name}</small>
                  </button>
                ))}
              </div>
              <label className="upload-link">
                <Upload size={16} />
                背景画像をアップロード
                <input
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void a.act(async () => {
                        const fd = new FormData();
                        fd.append("image", f);
                        const result = await api<{ path: string }>(
                          "/uploads",
                          "POST",
                          fd,
                        );
                        set("background", result.path);
                      });
                  }}
                />
              </label>
            </fieldset>
            {form.type === "AI_LECTURER" && (
              <fieldset>
                <legend>AI講師を選択 *</legend>
                {lecturers.data?.length ? (
                  <div className="lecturer-picker">
                    {lecturers.data.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`lecturer-option ${form.lecturerId === l.id ? "selected" : ""}`}
                        aria-pressed={form.lecturerId === l.id}
                        onClick={() => set("lecturerId", l.id)}
                      >
                        <Avatar name={l.name} src={l.avatar} />
                        <div>
                          <strong>{l.name}</strong>
                          <small>{l.subject}</small>
                          <p>{l.description}</p>
                        </div>
                        {form.lecturerId === l.id && <Check size={18} />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="notice">
                    利用できるAI講師がありません。管理者が接続設定と講師登録を行うと選択できます。学生同士のルームは作成できます。
                  </div>
                )}
              </fieldset>
            )}
            {form.type === "AI_LECTURER" && (
              <Field
                label="AI講師の発話文字数上限"
                hint="1〜4,000文字。発話ボタンでは回答の冒頭から指定文字数まで読み上げます。"
              >
                <input
                  type="number"
                  min={1}
                  max={4000}
                  step={1}
                  required
                  value={form.lecturerSpeechMaxChars ?? ""}
                  onChange={(e) =>
                    set(
                      "lecturerSpeechMaxChars",
                      e.target.value === ""
                        ? undefined
                        : e.target.valueAsNumber,
                    )
                  }
                />
                <p className="muted small">
                  回答本文と教材の書き出しは全文を保持します。作成後もルーム編集で変更できます。
                </p>
              </Field>
            )}
            {form.visibility === "INVITE_ONLY" && !roomId && (
              <Field label="招待するユーザー">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="表示名を2文字以上で検索"
                />
                {candidates.data?.map((u) => (
                  <label className="checkbox" key={u.id}>
                    <input
                      type="checkbox"
                      checked={form.invitees.includes(u.id)}
                      onChange={(e) =>
                        set(
                          "invitees",
                          e.target.checked
                            ? [...form.invitees, u.id]
                            : form.invitees.filter((v) => v !== u.id),
                        )
                      }
                    />
                    {u.displayName}
                  </label>
                ))}
              </Field>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.externalConsent}
                onChange={(e) => set("externalConsent", e.target.checked)}
              />
              設定された外部AI・TTSへ対話を送信することに同意します。
            </label>
            <p className="muted small">
              Gemini／OpenAIでのAI講師応答・拡張には、参加者全員の同意が必要です。確定済みの発言は教材として書き出されます。アバターの動画利用許諾はプロフィールで設定できます。
            </p>
            <ErrorBox error={a.error} />
            <div className="form-actions">
              <Link className="button outline" to="/rooms">
                キャンセル
              </Link>
              <Button busy={a.busy}>
                {roomId ? "変更を保存" : "ルームを作成"}
                <ArrowRight size={18} />
              </Button>
            </div>
          </form>
        </Card>
        <aside>
          <Card className="room-preview">
            <span className="eyebrow">LIVE PREVIEW</span>
            <h2>こんなルームになります</h2>
            <div
              className={`preview-cover ${roomBackground(form.background).className}`}
              style={roomBackground(form.background).style}
            >
              <BookOpen size={65} />
            </div>
            <h2>{form.name || "あなたのルーム名"}</h2>
            <Badge>
              {form.visibility === "PRIVATE"
                ? "非公開"
                : form.visibility === "PUBLIC"
                  ? "公開"
                  : "招待制"}
            </Badge>
            <p>{form.description || "ルームの紹介がここに表示されます。"}</p>
            {selected && (
              <div className="selected-lecturer">
                <Avatar name={selected.name} src={selected.avatar} />
                <div>
                  <strong>{selected.name}</strong>
                  <small>{selected.subject}</small>
                </div>
              </div>
            )}
            <p className="notice">
              {form.type === "AI_LECTURER"
                ? "講師の指導方針・モデル・音声は管理者が設定します。"
                : "参加者それぞれが、原文とAI拡張を投稿ごとに選べます。"}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
