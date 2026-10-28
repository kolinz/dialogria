import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  X,
  LoaderCircle,
  BookOpen,
  UserRound,
  CheckCircle2,
  TriangleAlert,
} from "lucide-react";
export const ToastContext = createContext<(s: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  return (
    <ToastContext.Provider
      value={(v) => {
        setText(v);
        setTimeout(() => setText(""), 6000);
      }}
    >
      {children}
      {text && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          {text}
          <button aria-label="通知を閉じる" onClick={() => setText("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function Button({
  children,
  variant = "",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${props.className ?? ""}`}
    >
      {busy && <LoaderCircle className="spin" size={18} />}
      {children}
    </button>
  );
}
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <BookOpen size={27} />
      </span>
      <span>
        Dialogria<small>AI対話学習プラットフォーム</small>
      </span>
    </span>
  );
}
export function Avatar({
  name = "",
  src,
  size = "",
}: {
  name?: string;
  src?: string | null;
  size?: string;
}) {
  return (
    <span className={`avatar ${size}`} aria-label={name}>
      {src ? (
        <img src={`/api/images/${src}`} alt="" />
      ) : name ? (
        name.slice(0, 1)
      ) : (
        <UserRound size={22} />
      )}
    </span>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Empty({
  children = "まだデータがありません",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <p>{children}</p>
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="error" role="alert">
      <TriangleAlert size={18} />
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" />
      読み込み中…
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        ref={ref}
        open
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const list = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),a[href],input,textarea,select",
              ) ?? [],
            );
            const first = list[0],
              last = list.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button autoFocus onClick={onClose} aria-label="閉じる">
            <X />
          </button>
        </header>
        {children}
      </dialog>
    </div>
  );
}
export function Badge({
  children,
  color = "",
}: {
  children: ReactNode;
  color?: string;
}) {
  return <span className={`badge ${color}`}>{children}</span>;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
