# 直接依存ライブラリ

導入時のnpmパッケージメタデータ。固定版はpackage-lock.json。

| パッケージ            | バージョン | ライセンス       | 用途区分     |
| --------------------- | ---------- | ---------------- | ------------ |
| @google/genai         | 2.31.0     | Apache-2.0       | 実行・ビルド |
| @hookform/resolvers   | 6.0.1      | MIT              | 実行・ビルド |
| @playwright/test      | 1.64.1     | Apache-2.0       | 開発・検証   |
| @tanstack/react-query | 5.105.0    | MIT              | 実行・ビルド |
| @types/better-sqlite3 | 9.6.0      | MIT              | 開発・検証   |
| @types/compression    | 1.8.1      | MIT              | 開発・検証   |
| @types/cookie-parser  | 1.4.10     | MIT              | 開発・検証   |
| @types/cors           | 2.8.19     | MIT              | 開発・検証   |
| @types/express        | 5.0.6      | MIT              | 開発・検証   |
| @types/multer         | 2.3.0      | MIT              | 開発・検証   |
| @types/node           | 26.6.5     | MIT              | 開発・検証   |
| @types/react          | 19.3.0     | MIT              | 開発・検証   |
| @types/react-dom      | 19.3.0     | MIT              | 開発・検証   |
| @types/supertest      | 7.2.1      | MIT              | 開発・検証   |
| @vitejs/plugin-react  | 6.1.2      | MIT              | 実行・ビルド |
| argon2                | 0.45.1     | MIT              | 実行・ビルド |
| better-sqlite3        | 13.0.3     | MIT              | 実行・ビルド |
| compression           | 1.8.2      | MIT              | 実行・ビルド |
| concurrently          | 10.0.6     | MIT              | 開発・検証   |
| cookie-parser         | 1.4.7      | MIT              | 実行・ビルド |
| cors                  | 2.8.6      | MIT              | 実行・ビルド |
| dotenv                | 18.0.9     | BSD-2-Clause     | 実行・ビルド |
| drizzle-orm           | 0.45.4     | Apache-2.0       | 実行・ビルド |
| express               | 5.3.0      | MIT              | 実行・ビルド |
| express-rate-limit    | 8.7.1      | MIT              | 実行・ビルド |
| ffmpeg-static         | 5.3.0      | GPL-3.0-or-later | 実行・ビルド |
| ffprobe-static        | 3.1.0      | MIT              | 実行・ビルド |
| helmet                | 8.3.0      | MIT              | 実行・ビルド |
| lucide-react          | 1.62.0     | ISC              | 実行・ビルド |
| multer                | 2.5.0      | MIT              | 実行・ビルド |
| openai                | 7.45.1     | Apache-2.0       | 実行・ビルド |
| prettier              | 3.9.10     | MIT              | 開発・検証   |
| react                 | 19.3.1     | MIT              | 実行・ビルド |
| react-dom             | 19.3.1     | MIT              | 実行・ビルド |
| react-hook-form       | 7.91.0     | MIT              | 実行・ビルド |
| react-markdown        | 10.1.0     | MIT              | 実行・ビルド |
| react-router-dom      | 7.18.5     | MIT              | 実行・ビルド |
| remark-gfm            | 4.0.1      | MIT              | 実行・ビルド |
| sharp                 | 0.35.5     | Apache-2.0       | 実行・ビルド |
| socket.io             | 4.8.4      | MIT              | 実行・ビルド |
| socket.io-client      | 4.8.4      | MIT              | 実行・ビルド |
| supertest             | 7.3.1      | MIT              | 開発・検証   |
| tsx                   | 4.23.15    | MIT              | 開発・検証   |
| typescript            | 7.0.2      | Apache-2.0       | 開発・検証   |
| vite                  | 8.3.5      | MIT              | 実行・ビルド |
| vitest                | 5.0.5      | MIT              | 開発・検証   |
| ws                    | 8.22.0     | MIT              | 実行・ビルド |
| zod                   | 4.6.7      | MIT              | 実行・ビルド |

FFmpegバイナリの実ライセンスはビルド構成に依存します。ARCHITECTURE_DECISIONS.md参照。各パッケージのLICENSE/NOTICEを保持してください。

PDF出力：pdfmake 0.3.13（MIT）、marked 18.1.2（MIT）。日本語フォント：IPAexゴシック／IPAex明朝 Ver.004.01（IPA Font License v1.0）。公式配布元は https://moji.or.jp/ipafont/ipaex00401/ 。`assets/fonts/IPAexfont00401/` のTTF、README、ライセンスは無改変で同梱します。
