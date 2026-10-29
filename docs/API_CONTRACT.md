# API契約

成功：`{data: ...}`、失敗：`{error:{code,message,requestId}}`。401認証、403権限／CSRF／出力無効、404対象なし、409状態競合、422入力不正、429上限、502外部API失敗。

Cookie `sid` はHttpOnly、SameSite=Lax、本番Secure。`GET /api/me`のcsrfを更新系リクエストの`X-CSRF-Token`に付ける。認証操作以外の全APIに認証・CSRF検査を適用。ファイルも同じCookie認証を使用する。

| メソッド・パス                                | 責務                                               |
| --------------------------------------------- | -------------------------------------------------- |
| GET /api/health                               | 非認証ヘルス                                       |
| GET /api/auth/options                         | 登録可否                                           |
| POST /api/auth/register, /login, /logout      | 認証                                               |
| GET/PATCH /api/me                             | 本人プロフィール                                   |
| POST/DELETE /api/me/avatar                    | 画像設定／削除                                     |
| POST /api/uploads                             | 背景・講師画像を検証しWebP化                       |
| GET /api/images/:file                         | 認可された画像取得                                 |
| GET /api/users/search?q=                      | 表示名による招待候補検索、メール非公開             |
| GET/POST /api/rooms                           | 公開／参加／招待一覧、作成                         |
| GET/PATCH/DELETE /api/rooms/:id               | 詳細、編集、論理削除                               |
| POST /api/rooms/:id/join, /leave              | 入室／退出                                         |
| POST /api/rooms/:id/members                   | 招待                                               |
| DELETE /api/rooms/:id/members/:userId         | 参加者除外                                         |
| PATCH /api/rooms/:id/consent                  | 本人の外部送信許諾                                 |
| GET /api/rooms/:id/messages?after=            | 連番順、最大500件、最終連番から追加取得            |
| POST /api/rooms/:id/messages                  | 原文／採用済みAI拡張の確定、clientId必須           |
| POST /api/rooms/:id/messages/:messageId/reply | 講師回答を再試行、二重回答防止                     |
| POST /api/ai/expand                           | 候補生成のみ、投稿しない                           |
| POST /api/rooms/:id/messages/:messageId/speak | 確定文の音声生成／再利用                           |
| GET /api/rooms/:id/messages/:messageId/audio  | 音声取得                                           |
| POST /api/rooms/:id/snapshots                 | 全確定投稿を固定し、id/count/at/lastSequenceを返す |
| POST /api/rooms/:id/exports                   | type=MP3/MARKDOWN/MP4、snapshotIdとvideo options   |
| GET /api/exports, /api/exports/:jobId         | 履歴／状態                                         |
| POST /api/exports/:jobId/retry                | 最大3回、動画は課金確認                            |
| GET /api/exports/:jobId/download, /preview    | 認可済み成果物、MP4プレビューRange対応             |
| GET /api/export-capabilities                  | 形式ごとの実効可否と理由                           |
| GET /api/lecturers                            | 有効講師の公開プロフィール                         |
| GET /api/admin/overview                       | 管理集計                                           |
| GET /api/admin/users                          | ユーザー検索                                       |
| PATCH /api/admin/users/:id                    | 管理者再認証つきロール／状態変更                   |
| GET/DELETE /api/admin/rooms[/:id]             | 全ルーム管理、削除理由必須                         |
| GET /api/rooms/defaults | 新規ルームの標準値 `lecturerSpeechMaxChars`（認証必須） |
| GET /api/rooms/:roomId/cloze-sources?snapshotId=UUID | 参加者向け、固定済み対話の出典文一覧 |
| POST /api/rooms/:roomId/cloze-drafts | `snapshotId, mode:AUTO/MANUAL, count?, consent?, terms?:[{sourceId,term}]`。用語を元文と照合し問題候補を保存 |
| GET/PATCH/DELETE /api/admin/pdf | 管理者用PDF設定の取得・保存・環境変数へのリセット |
| POST /api/admin/pdf/preview | 入力設定のプレビューPDF（CSRF必須、保存しない） |
| GET /api/admin/logs, /rankings                | 操作ログ／期間・指標別順位                         |
| GET/POST /api/admin/lecturers                 | 講師管理                                           |
| GET/PATCH/DELETE /api/admin/lecturers/:id     | 版の作成、DELETEは無効化                           |
| GET/PATCH /api/admin/providers                | 用途別設定、秘密値は取得不可                       |
| GET /api/admin/providers/models?purpose=      | 実際に取得したモデル・音声                         |
| POST /api/admin/providers/test                | 実接続検証、VIDEOはallowCharge必要                 |
| GET/PATCH /api/admin/system                   | 独立出力フラグ・利用制限                           |

Socket.IO：Cookieとhandshake.auth.csrfを検証。`room:join(roomId,ack)`で購読。サーバーは`message:committed`と`room:revoked`を配信。再接続時はRESTのafterで欠落を補完し、message.idで重複排除。

管理一覧は`limit`（最大200）と`offset`を受付け、`pageInfo:{total,limit,offset,nextCursor}`を返す。フロントは15件単位（講師カードは12件）でサーバーページング。ユーザーはstatus/role、ルームはvisibility/type/status、ログはfrom/to/levelで絞り込める。

## 追加：OpenAI文章生成・管理者とユーザーのアカウント

- `GET /api/admin/account`：ログイン中の管理者自身の公開アカウント情報。
- `PATCH /api/admin/account`：`email, displayName, currentPassword, newPassword?`。再認証し、メール／パスワード変更後は`requiresLogin:true`を返して全セッションを失効。
- `POST /api/admin/users`：`email, displayName, bio?, role, status, newPassword, password`。`password`は実行する管理者の再認証用、`newPassword`は新ユーザー用。作成された安全なDTOを201で返す。
- `PATCH /api/admin/users/:id`：既存の`role, status, password`に加え、`email?, displayName?, bio?, newPassword?`を受け付ける。秘密値を返さず、他の更新との競合を拒否する。
- `GET /api/admin/providers/models?purpose=TEXT&textProvider=OPENAI`：OpenAIの文章モデル候補取得。実際のResponses API対応は接続テストで確認する。
- 文章プロバイダーとAI講師のproviderに`OPENAI`を追加。システム指示と利用者の発言を分離し、`store:false`でResponses APIを呼ぶ。

穴埋めPDFは `POST /api/rooms/:roomId/exports` に `type:CLOZE_PDF, snapshotId, options:{draftId,questionIds,answers:SEPARATE（省略時もSEPARATE）}` を送信します。クライアントから問題本文を受け取らず、作成者が確認した候補だけを採用します。ジョブは既存の取得・再試行・ダウンロードAPIで管理し、参加権限・期限・管理者ON/OFFを毎回適用します。システム設定の `exportClozeEnabled` は未保存時true、`exportTextEnabled` と合わせて実効状態を判定します。

`POST /api/admin/providers/test` は任意の `settings`（プロバイダー設定）を受け付けます。指定した場合は検証対象の設定を暗号化保存を含めて永続化した後、その設定で接続テストします。接続に失敗しても選択は保持し、変更された設定の検証状態は無効になります。未指定の場合は従来どおり保存済み設定をテストします。設定変更時は用途ごとの接続フィンガープリントを比較し、無関係な用途の検証状態を維持します。
