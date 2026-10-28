# UIと仕様の対応表

参照元：提供されたUI実装仕様書v1.0（追加20〜22章を含む）。画像は5枚確認。UI-02と機能別12枚は未提供。

| ID               | 参照画像／仕様                                  | 実装                               | 検証                                            |
| ---------------- | ----------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| UI-01            | pastel_ai_learning_platform_ui.png / 4章        | pages.AuthPage、styles.css         | 登録・ログイン、1440/375スクリーンショット      |
| UI-02            | 画像未提供 / 5章                                | pages.ProfilePage                  | プロフィール、ルーム・教材履歴の実表示          |
| UI-03 / M-08     | japanese_ai_learning_room_creator.png / 6・22章 | pages.RoomFormPage                 | ライブプレビュー、講師選択、作成、権限API試験   |
| UI-04            | anime_python_learning_chat_interface.png / 7章  | chat.ChatPage、Bubble、Speak       | 共通チャットUI、AI回答APIテスト                 |
| UI-05            | japanese_ai_learning_chatroom.png / 8章         | 同じChatPage / MessageComposer相当 | 2クライアント同期、原文／拡張、連番、退出後拒否 |
| UI-06            | ai対話学習管理ダッシュボード.png / 11章         | admin.Dashboard、AdminTable        | 実集計、管理API拒否、削除理由と監査             |
| UI-07 / M-05〜07 | 専用画像なし / 10章                             | chatの書き出しパネル・動画Modal    | 0投稿無効、固定スナップショット、状態、再試行   |
| M-04             | 個別PNG未提供 / 9章                             | chatのExpansionPreview             | 候補のみ生成し、確認後に確定するAPI試験         |
| A-01             | 個別PNG未提供 / 20章                            | admin.SystemSettings               | 3形式の独立フラグ、既存DLも拒否                 |
| A-02 / A-03      | 個別PNG未提供 / 11.5・20章                      | admin.ProviderSettings             | 用途別設定、接続テスト、モデルと音声取得        |
| A-06 / A-07      | 専用画像未作成 / 22章                           | admin.LecturerList、LecturerForm   | 版固定、無効講師拒否、秘密指示の非公開          |

共通トークン：背景 #F5F8FE、本文 #142653、主色 #367DF5、紫 #8C5AF5、規定グラデーション、カード16px、PC左ナビ236px、ヘッダー68px。幅1279以下で右パネルを開閉、767以下で左ナビをメニュー化。対話入力はdvhの画面内下部に保持する。

画像との残差：独立したアニメ人物／背景素材がなく、イニシャルアバターとCSS背景を使う。ダミー統計を埋めず、実データまたは空状態を表示する。配色・主要画面構造・カード・入力・書き出しを基準に再現し、イラスト部分の完全一致とは扱わない。

ローカル検証ハーネス `http://127.0.0.1:5173/qa.html` はiframe内に375/768/1024/1440pxの実際のCSSビューポートを作る。開発時だけ利用し、本番ビルドに含めない。スクリーンショットは`docs/screenshots/`へ保存する。

追加依頼の画面：`/admin/users`の新規作成／編集モーダル、`/admin/account`のメール・表示名・パスワード変更、`/admin/providers`の文章生成OpenAI選択肢。`users-create-1440.jpg`、`users-edit-1440.jpg`に実画面を記録。管理者再認証のため、実ユーザーの資格情報はUI検証で入力していない。
