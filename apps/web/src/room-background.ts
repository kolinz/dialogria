import type { CSSProperties } from "react";

export function roomBackground(background: string): {
  className: string;
  style?: CSSProperties;
} {
  if (background.endsWith(".webp")) {
    return {
      className: "uploaded-background",
      style: {
        backgroundImage: `url("/api/images/${encodeURIComponent(background)}")`,
      },
    };
  }
  return {
    className: ["classroom", "library", "sakura", "city", "night"].includes(
      background,
    )
      ? background
      : "classroom",
  };
}
