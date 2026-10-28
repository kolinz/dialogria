# データモデル

DDLと索引は`apps/api/src/db.ts`、read modelは`schema.ts`を参照。

| テーブル               | 責務                              | 制約・保持                                              |
| ---------------------- | --------------------------------- | ------------------------------------------------------- |
| users                  | 認証、プロフィール、アバター許諾  | email一意、Argon2id、物理削除しない                     |
| auth_sessions          | Cookieセッション                  | users参照、期限、CSRF、ログアウト時失効                 |
| rooms                  | ルームと講師版                    | AI講師時は有効版必須、PEERは講師null、論理削除          |
| room_members           | 参加と外部送信同意                | room/user複合主キー                                     |
| room_invites           | 招待と受諾状態                    | room/user一意                                           |
| room_sequence_counters | ルーム内連番                      | 投稿確定と同一トランザクション                          |
| messages               | 原文・確定文・方式・話者          | room/sequence一意、room/author/client一意、reply_to一意 |
| ai_lecturers           | 現行講師カタログ                  | ACTIVE/INACTIVE、単調増加version                        |
| ai_lecturer_versions   | 不変の講師設定                    | lecturer/version複合主キー、UPDATE禁止                  |
| settings               | 用途別provider・出力フラグ・上限  | APIキーは別レコードの暗号文、秘密値はDTOに返さない      |
| export_snapshots       | ルームと対象範囲                  | room参照、作成者、基準時刻、最終連番                    |
| export_snapshot_items  | 発話・話者・voice・許諾画像の固定 | snapshot/sequence主キー、message一意、UPDATE禁止        |
| export_jobs            | 永続出力ジョブ                    | snapshot参照、形式、設定、進捗、試行回数、期限          |
| audio_segments         | TTSキャッシュと実測長             | 文章hash/provider/model/voice/変換版でキー化            |
| video_scenes           | シーンと外部interaction           | job/message/model/interactionを追跡                     |
| audit_logs             | 操作主体・対象・理由              | 本文、パスワード、キーを記録しない                      |
| system_events          | エラー分類                        | code/requestIdのみ、機密本文を記録しない                |
| usage_records          | API用途と利用量                   | provider/purpose/units/日時                             |
| schema_migrations      | スキーマ版                        | バックアップから復元する前進マイグレーション            |

マイグレーションは複数回実行可能。外部キーは常時ON。投稿順はcreated_atではなくsequence_noを正本にする。講師更新とスナップショットの過去内容は変更しない。プロフィールはusersに、TTS設定はsettingsに、動画レンダリング設定はexport_jobs.optionsに統合して、重複する管理テーブルを避けた。

ルームを削除すると取得・投稿・ファイル取得を拒否するが、監査と参照整合性のため元の行は保持する。期限切れ成果物はcleanupで物理削除できる。本人の画像利用許諾を撤回した場合は、画像を含むMP4を再取得不可にし、新スナップショットで匿名表示へ再生成する。
