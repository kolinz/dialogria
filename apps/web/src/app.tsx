import { useState, lazy } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  Link,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Home,
  MessageCircle,
  Plus,
  Settings,
  LogOut,
  Menu,
  LayoutDashboard,
  Users,
  BookOpen,
  ScrollText,
  Trophy,
  AudioLines,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { api, useApi, setCsrf } from "./api";
import { Brand, Avatar, Button, Loading, ToastProvider, useToast } from "./ui";
import { AuthPage, ProfilePage, RoomsPage, RoomFormPage } from "./pages";
const ChatPage = lazy(() =>
  import("./chat").then((m) => ({ default: m.ChatPage })),
);
const AdminPage = lazy(() =>
  import("./admin").then((m) => ({ default: m.AdminPage })),
);
import type { User } from "../../../packages/shared/src";
import { AuthContext, useAuth } from "./auth";
function Protected({ admin = false }: { admin?: boolean }) {
  const query = useApi<{ user: User; csrf: string }>("/me");
  if (query.isPending) return <Loading />;
  if (!query.data) return <Navigate to="/login" replace />;
  setCsrf(query.data.csrf);
  if (admin && query.data.user.role !== "ADMIN")
    return (
      <div className="empty">
        <h1>403</h1>
        <p>管理者権限が必要です</p>
        <Link to="/me">マイページへ</Link>
      </div>
    );
  return (
    <AuthContext.Provider
      value={{
        user: query.data.user,
        refresh: async () => {
          await query.refetch();
        },
      }}
    >
      <Outlet />
    </AuthContext.Provider>
  );
}
function Shell() {
  const { user } = useAuth(),
    navigate = useNavigate(),
    client = useQueryClient(),
    toast = useToast(),
    [open, setOpen] = useState(false);
  const links = [
    ["/me", "マイページ", Home],
    ["/rooms", "ルーム一覧", MessageCircle],
    ["/rooms/new", "ルームを作成", Plus],
  ] as const;
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="mobile-menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          aria-label="メニュー"
        >
          <Menu />
        </button>
        <Link to="/me">
          <Brand />
        </Link>
        <div className="topbar-right">
          <span className="header-tag">対話から、学びを深く。</span>
          <Link className="user-pill" to="/me">
            <Avatar name={user.displayName} src={user.avatar} />
            <span>{user.displayName}</span>
          </Link>
        </div>
      </header>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <p className="nav-label">WORKSPACE</p>
        {links.map(([to, label, Icon]) => (
          <NavLink key={to} end to={to} onClick={() => setOpen(false)}>
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <div className="sidebar-note">
          <BookOpen size={26} />
          <strong>学びを、教材に。</strong>
          <p>対話を音声・テキスト・動画として振り返りましょう。</p>
        </div>
        {user.role === "ADMIN" && (
          <>
            <p className="nav-label">ADMINISTRATION</p>
            {[
              ["/admin", "ダッシュボード", LayoutDashboard],
              ["/admin/users", "ユーザー管理", Users],
              ["/admin/rooms", "ルーム管理", MessageCircle],
              ["/admin/lecturers", "AI講師管理", BookOpen],
              ["/admin/logs", "ログ", ScrollText],
              ["/admin/rankings", "人気のルーム", Trophy],
              ["/admin/providers", "AI・TTS設定", AudioLines],
              ["/admin/system", "システム設定", Settings],
              ["/admin/account", "管理者アカウント", ShieldCheck],
            ].map(([to, label, Icon]) => {
              const I = Icon as typeof Home;
              return (
                <NavLink
                  key={String(to)}
                  to={String(to)}
                  end={to === "/admin"}
                  onClick={() => setOpen(false)}
                >
                  <I size={19} />
                  {String(label)}
                </NavLink>
              );
            })}
          </>
        )}
        <button
          className="logout"
          onClick={async () => {
            try {
              await api("/auth/logout", "POST");
              setCsrf("");
              client.clear();
              navigate("/login");
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          <LogOut size={18} />
          ログアウト
        </button>
        <small className="sidebar-footer">
          <ShieldCheck size={14} /> あなたの学びを安全に
        </small>
      </aside>
      {open && <div className="nav-overlay" onClick={() => setOpen(false)} />}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route element={<Protected />}>
        <Route element={<Shell />}>
          <Route path="/me" element={<ProfilePage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/new" element={<RoomFormPage />} />
          <Route path="/rooms/:roomId/edit" element={<RoomFormPage />} />
          <Route path="/rooms/:roomId" element={<ChatPage />} />
        </Route>
      </Route>
      <Route element={<Protected admin />}>
        <Route element={<Shell />}>
          <Route path="/admin/*" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/me" replace />} />
      <Route
        path="*"
        element={
          <div className="empty">
            <h1>404</h1>
            <Link to="/me">ホームに戻る</Link>
          </div>
        }
      />
    </Routes>
  );
}
