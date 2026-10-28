# 設計判断と公式資料

更新日：2026-10-28（Asia/Tokyo）。UI仕様書第20・22章を旧記述より優先する。

## ADR-001 実行構成

Node.js 24 LTS / npm workspaces / TypeScript strict / React 19 / Vite / Express 5。Web・API・共有Zodスキーマを分離した。TanStack Queryでサーバーデータを取得し、認証フォームにReact Hook Formを使う。アプリはブラウザ利用。Dockerや外部DBを初期起動の必須条件にしない。

## ADR-002 データと排他

SQLite WAL・外部キーON。Drizzleの型付きread modelと、better-sqlite3の同期トランザクションを併用。DDLは`apps/api/src/db.ts`の明示的・冪等なv1マイグレーションを正本にする。連番採番・投稿確定・講師版保存・スナップショット作成をトランザクションで原子化する。講師設定版とスナップショット項目へのUPDATEをDBトリガーで禁止。ユーザーのプロフィールは1対1のためusersへ統合した。設定はsettingsテーブルの用途別レコードに保存し、APIキーはAES-256-GCMで暗号化する。

## ADR-003 認証と権限

Argon2id、署名付きHTTP-onlyセッションCookie、DB側の期限・ユーザー状態照合、CSRFトークン、送信元検証、レート制限。一般管理APIは管理者専用。管理者でもチャット本文は自動的に閲覧可能にしない。ファイルは非公開ストレージに置き、取得時にルーム・出力フラグ・保存期限・画像許諾を再検査。Socket.IOは接続・ルーム参加・配信ごとに検査し、退出・停止時に購読解除。

## ADR-004 AIと音声

文章・音声・動画は独立した設定とアダプターを持つ。文章初期値はGemini、代替はOllama/LM Studio。TTSはOpenAIまたはVOICEVOX。ユーザーの「推奨で」という指定を受け、公式資料を確認し、2026-10-28の初期値を`gemini-3.8-flash`／`gpt-realtime-2.1-mini`（voice: marin）とした。

OpenAIの従来Speech APIモデルには2027-01-06の停止予定が案内されているため、Realtime APIでのサーバー側TTSを追加した。これは内部の音声合成手段であり、ユーザーのマイク配信機能は追加しない。PCM24kHzをWAVへ格納し既存FFmpeg処理に渡す。生成音声の返却トランスクリプトを入力と照合し、文言の追加・省略があれば成果物に採用しない（空白・記号・表記幅は正規化）。既存のAudio Speech API対応モデル名を選ぶと従来エンドポイントも利用可能。VOICEVOXは従来どおり選択できる。実API疎通はキー登録後に別途検証が必要。

参考：[Geminiモデル一覧](https://ai.google.dev/gemini-api/docs/models)、[OpenAI TTSガイド](https://developers.openai.com/api/docs/guides/text-to-speech)、[Realtime音声出力](https://developers.openai.com/api/docs/guides/realtime-conversations)、[音声用テキスト入力](https://developers.openai.com/api/docs/guides/custom-voices)、[VOICEVOX API](https://voicevox.github.io/voicevox_engine/api/)、[Ollama API](https://docs.ollama.com/api)、[LM Studio OpenAI互換API](https://lmstudio.ai/docs/developer/openai-compat)。

## ADR-005 動画

動画初期値は`gemini-omni-1.1-flash`。Interactions APIのREST契約を使い、SDKの対応版への依存を局所化した。`generateVideos`やOpenAI動画APIは使わない。固定発話にひもづく映像素材だけを生成し、その音声は捨てる。確定TTSとASS字幕をFFmpegで結合する。既定のGeminiシーン生成と、代替のローカルアバター合成の両方に同じ動画ON条件を適用する。生成・再試行・プレビュー・ダウンロード時には実際のGeminiモデルアクセスも検査する。利用権限の確認に失敗すると保存済み検証状態を失効させる。

費用の実請求額はAPIの返却保証がないため、管理者が保守的な「1シーン費用上限」を最新料金に合わせて設定する。シーン数×費用上限をジョブ受付前に照合する。ジョブ同時数は初期値1に固定。中断後の課金を伴う自動リトライはしない。外部へアバター画像は送らない。

参考：[Gemini Omni](https://ai.google.dev/gemini-api/docs/omni)、[動画モデル](https://ai.google.dev/gemini-api/docs/video)。

## ADR-006 デザインと不足素材

仕様書の色トークン・カード半径16px・トップバー68px・PCサイドバー236pxを採用。参照画像に含まれる人物・背景の独立素材がないため、初期アバターはイニシャル、背景はCSSプリセット。ユーザー提供の独立画像は安全なアップロードで利用できる。料金やPDFなど、画像中の未確定機能は追加しない。マイページ画像と機能別12枚は未提供であり、確認済みとは扱わない。

## ライセンス

導入時にnpmの現行安定版とパッケージメタデータを確認し、具体的なバージョンはpackage-lock.jsonで固定。直接依存の一覧は`DEPENDENCIES.md`に記録する。MIT/Apache-2.0/ISC/BSD等のパッケージは著作権表示とライセンスを維持する。FFmpegバイナリはビルド構成によってGPL／nonfreeの扱いが異なる。今回のffmpeg-staticのmacOSバイナリはGPLとnonfreeフラグを含むため、バイナリをアプリとして再配布しない。配布形態を変える場合は運用者のライセンス適合バイナリを`FFMPEG_PATH`で指定する。日本語フォントはOSまたは運用者が利用権を持つものを使い、リポジトリに同梱しない。

管理画面の上書き→プロセス環境変数→.envの順に優先する。接続検証は秘密値を露出しないSHA-256指紋を保持し、キー・モデル・voice・速度・URLが変わると無効化する。

## 追加判断：OpenAI文章生成と.envによる管理者初期化

OpenAIを文章生成の追加選択肢として公式Responses APIで実装。モデルIDは`OPENAI_TEXT_MODEL`または管理画面で指定し、勝手なモデル置換をしない。API側保存を無効にし、指示と履歴を分離する。参考：[OpenAI公式テキスト生成ガイド](https://developers.openai.com/api/docs/guides/text)。

初期管理者は.envから一度だけ作成し、`initialAdminBootstrapped`レコードで再適用を防ぐ。既存ユーザーは自動昇格しない。管理者アカウント変更とユーザー作成・編集は再認証、監査、セッション失効を伴う。パスワード照合・ハッシュ化後にもトランザクション内で実行者の有効な管理者セッションと最後の管理者制約を再評価する。
