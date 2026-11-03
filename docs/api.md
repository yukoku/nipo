# 営業日報システム API仕様書（ドラフト v0.2）

> 前提：[要件定義書](./requirements.md)・[画面定義書](./screens.md)・[仕様決定記録](./decisions.md) に基づく。

## 1. 共通仕様

### 1.1 基本事項

| 項目 | 仕様 |
|---|---|
| 方式 | REST / JSON |
| ベースURL | `/api/v1` |
| 文字コード | UTF-8 |
| リクエスト形式 | `Content-Type: application/json` |
| 日付形式 | `YYYY-MM-DD`（例：`2026-10-31`） |
| 時刻形式 | `HH:mm`（例：`14:30`） |
| 日時形式 | ISO 8601 タイムゾーン付き（例：`2026-10-31T18:05:00+09:00`） |
| 基準タイムゾーン | Asia/Tokyo（JST）。下記「日付・時刻の扱い」を参照 |
| 命名規則 | JSON のキーは snake_case |
| レスポンスの形 | 成功時の本文は `{ "data": ... }` で包む（一覧は `meta` も付ける。§1.4）。204 は本文なし（決定事項 #21） |

**日付・時刻の扱い**
- サーバー（Cloud Run）は UTC で動くが、業務上の日付・時刻はすべて JST を基準にする
- 「今日」「未来日」の判定は JST の日付で行う。例：UTC で `2026-10-31T15:00:00Z` は JST で 11/1 の 0:00 なので、この時点の「今日」は `2026-11-01`
- 報告日（`report_date`）と訪問時刻（`visited_at`）は、タイムゾーンを持たない日付・時刻として扱い、受け取った値をそのまま保存・返却する
- 日時（`submitted_at`・`created_at` など）は DB に UTC で保存し、レスポンスでは `+09:00` 付きの JST で返す

### 1.2 認証

- セッション Cookie 方式（`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`）。`Secure` は本番だけ付ける（開発環境の http://localhost でも動くようにするため。決定事項 #26）
- セッションは DB（`sessions` テーブル）に保存する。Cloud Run は複数インスタンスで動き、インスタンスは随時入れ替わるため、メモリには保持しない
  - Cookie にはランダムなトークンを入れ、DB にはそのハッシュ（SHA-256）だけを保存する
  - 有効期限は最後のアクセスから7日間。アクセスのたびに延長する（DB への書き込みを減らすため、延長は前回から 1 時間たったときだけ行う。決定事項 #26）
  - 期限切れのセッションは、ログイン時にまとめて削除する
  - ログアウト時、または営業が無効化されたときは、DB のセッションを削除する
- ログイン（A-01）とヘルスチェック（H-01）以外の全 API で認証が必要。未認証の場合は `401`
- セッション Cookie の名前は `nipo_session`（決定事項 #24）
- 更新系（POST / PUT / PATCH / DELETE）はリクエストヘッダー `X-CSRF-Token` を必須とする。トークンは `GET /auth/me`（またはログイン A-01）のレスポンスで取得する（決定事項 #27）
  - ヘッダーがない・セッションのトークンと一致しない場合は `403 FORBIDDEN`（`reason: CSRF_TOKEN_INVALID`）
  - 追加の防御として、`Origin` ヘッダーがあればこのサイトのホストと一致することも確かめる。一致しなければ同じく `403`（`reason: CSRF_TOKEN_INVALID`）
  - ログインしていない場合は、CSRF の確認より先に `401` を返す
  - 画面の API クライアント（`src/lib/api-client.ts`）はトークンを自動で付け、`CSRF_TOKEN_INVALID` の 403 なら取り直して 1 回だけ再送する

### 1.3 ロール

| ロール | 値 |
|---|---|
| 営業 | `sales` |
| 上長 | `manager` |
| 管理者 | `admin` |

### 1.4 ページング

一覧 API は以下のクエリパラメータを受け付ける。

| パラメータ | 型 | 初期値 | 説明 |
|---|---|---|---|
| `page` | integer | 1 | ページ番号 |
| `per_page` | integer | 20 | 1ページの件数（最大 100） |

- `page` が 1 未満、`per_page` が 1〜100 の範囲外、または整数でない場合は `400 VALIDATION_ERROR`（上限に丸めない。決定事項 #22）
- 空の値（`?page=`）は指定なしとして初期値を使う

レスポンスには `meta` を含める。0 件のときの `total_pages` は `0`。

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "per_page": 20, "total_count": 53, "total_pages": 3 }
}
```

### 1.5 エラーレスポンス

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容に誤りがあります",
    "details": [
      { "field": "visit_records[0].content", "message": "訪問内容は必須です" }
    ]
  }
}
```

| HTTP ステータス | `code` | 用途 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 入力チェックエラー（`details` に項目別メッセージ） |
| 401 | `UNAUTHENTICATED` | 未ログイン・セッション切れ・認証失敗 |
| 403 | `FORBIDDEN` | 権限なし。CSRF トークン・Origin の確認に失敗した場合は `reason: CSRF_TOKEN_INVALID` を付ける（§1.2） |
| 404 | `NOT_FOUND` | 対象が存在しない（閲覧権限のない日報も 404 を返し、存在を推測させない） |
| 409 | `CONFLICT` | 一意制約違反（同日の日報が既にある、メール重複）、編集不可状態。理由を `reason` で返す（下記） |
| 429 | `TOO_MANY_ATTEMPTS` | ログイン試行回数の上限に達した（A-01） |
| 500 | `INTERNAL_ERROR` | サーバーエラー |

`details[].field` はネストした配列を `visit_records[0].content` のように表記する。リクエスト全体のエラー（本文が JSON でないなど）は `field` を空文字にする。

`details[].message` は docs/screens.md §5 のメッセージに合わせる（必須：M-02「{項目名}は必須です」、文字数：M-03「{項目名}は{n}文字以内で入力してください」）。

**409 の理由（`reason`）**（決定事項 #20）

409 は `code` を `CONFLICT` のまま、理由を `reason` で返す。画面は `reason` を見て表示を切り替える。

```json
{
  "error": {
    "code": "CONFLICT",
    "reason": "REPORT_ALREADY_EXISTS",
    "message": "この日付の日報は既に作成されています"
  }
}
```

| `reason` | 状況 | 使う API |
|---|---|---|
| `REPORT_ALREADY_EXISTS` | 同じ日付の日報が既にある（M-04） | R-02 |
| `REPORT_LOCKED` | コメントが付いているため編集できない | R-04 |
| `REPORT_NOT_DRAFT` | 提出済みのため削除できない | R-05 |
| `EMAIL_ALREADY_EXISTS` | メールアドレスが既に登録されている（M-10） | S-02, S-04 |

理由を区別する必要がない 409（S-04 の、部下がいる上長のロール変更など）は `reason` を付けない。

## 2. API 一覧

| # | メソッド | パス | 概要 | 利用ロール | 利用画面 |
|---|---|---|---|---|---|
| A-01 | POST | `/auth/login` | ログイン | 全員（未認証） | SC-01 |
| A-02 | POST | `/auth/logout` | ログアウト | 全員 | 共通 |
| A-03 | GET | `/auth/me` | ログインユーザー情報取得 | 全員 | 共通 |
| R-01 | GET | `/reports` | 日報一覧取得 | sales, manager | SC-02 |
| R-02 | POST | `/reports` | 日報作成 | sales, manager | SC-03 |
| R-03 | GET | `/reports/{id}` | 日報詳細取得 | sales, manager | SC-03, SC-04 |
| R-04 | PUT | `/reports/{id}` | 日報更新 | sales, manager（本人） | SC-03 |
| R-05 | DELETE | `/reports/{id}` | 下書き日報の削除 | sales, manager（本人） | SC-04 |
| C-01 | POST | `/reports/{id}/comments` | コメント投稿 | manager（作成者の上長） | SC-04 |
| C-02 | PUT | `/comments/{id}` | コメント更新 | manager（投稿者本人） | SC-04 |
| C-03 | DELETE | `/comments/{id}` | コメント削除 | manager（投稿者本人） | SC-04 |
| M-01 | GET | `/customers` | 顧客一覧取得 | 全員 | SC-03, SC-05 |
| M-02 | POST | `/customers` | 顧客登録 | admin | SC-06 |
| M-03 | GET | `/customers/{id}` | 顧客詳細取得 | admin | SC-06 |
| M-04 | PUT | `/customers/{id}` | 顧客更新 | admin | SC-06 |
| S-01 | GET | `/sales-staff` | 営業一覧取得 | admin（manager は部下のみ） | SC-02, SC-06, SC-07, SC-08 |
| S-02 | POST | `/sales-staff` | 営業登録 | admin | SC-08 |
| S-03 | GET | `/sales-staff/{id}` | 営業詳細取得 | admin | SC-08 |
| S-04 | PUT | `/sales-staff/{id}` | 営業更新 | admin | SC-08 |
| H-01 | GET | `/health` | ヘルスチェック | 全員（未認証） | -（Cloud Run の起動確認など） |

> マスタは論理削除（`is_active = false`）で運用するため、顧客・営業の DELETE API は設けない。

> 各 API のリクエスト・レスポンスの詳細な型は、Zod スキーマから生成した [OpenAPI 定義（docs/openapi.yaml）](./openapi.yaml) を参照する。開発サーバーでは http://localhost:3000/dev/api-docs で見られる。本書と食い違う場合は本書を正とし、スキーマを直す。

---

## 3. 認証 API

### A-01 ログイン

`POST /auth/login`

**リクエスト**

```json
{
  "email": "yamada@example.com",
  "password": "********"
}
```

| 項目 | 型 | 必須 | 説明 |
|---|---|---|---|
| `email` | string | ○ | メールアドレス |
| `password` | string | ○ | パスワード |

**レスポンス** `200 OK`（セッション Cookie を発行）

A-03 と同じ形式のユーザー情報を返す。

- メールアドレスは大文字・小文字を区別せずに照合する
- 存在しない・無効なアカウントでも、パスワードの照合と同じ時間をかけてから 401 を返す（応答時間からアカウントの有無を推測させない）
- パスワードのハッシュのパラメーターが古い場合は、ログイン成功時に今の設定で作り直す（決定事項 #25）

**エラー**
- `400 VALIDATION_ERROR`：メールアドレス・パスワードが空（T-AUTH-05）
- `401 UNAUTHENTICATED`：メールアドレス・パスワード不一致、または無効化されたアカウント（同一メッセージ。M-01）
- `403 FORBIDDEN`（`reason: CSRF_TOKEN_INVALID`）：別のサイトの `Origin` からのリクエスト（ログイン CSRF の防止。セッションがまだないため CSRF トークンは確かめない）
- `429 TOO_MANY_ATTEMPTS`：同じメールアドレスで5回連続して失敗した後、15分以内のログイン（正しいパスワードでも不可。#43 で実装）

**ログイン試行回数の制限**（決定事項 #18）
- 失敗回数はメールアドレスの文字列ごとに DB に記録する。存在しないメールアドレスも同じように数え、ロックする（ロックの有無からアカウントの存在を推測させない）
- 5回連続で失敗したら、最後の失敗から15分間ロックする。15分たつと自動で解除する
- ログインに成功したら失敗回数をリセットする
- メールアドレスは大文字・小文字を区別せずに数える

---

### A-02 ログアウト

`POST /auth/logout`

**レスポンス** `204 No Content`（このリクエストのセッションだけを破棄し、セッション Cookie を消す。別の端末のセッションは残る）

---

### A-03 ログインユーザー情報取得

`GET /auth/me`

**レスポンス** `200 OK`

```json
{
  "data": {
    "id": 2,
    "name": "山田太郎",
    "email": "yamada@example.com",
    "department": "営業1課",
    "role": "sales",
    "manager": { "id": 1, "name": "鈴木一郎" },
    "subordinates": [],
    "csrf_token": "a1b2c3..."
  }
}
```

| 項目 | 説明 |
|---|---|
| `manager` | 上長。未設定なら `null` |
| `subordinates` | 直属の部下（有効な者のみ）の `{id, name}` 配列。SC-02 の担当者セレクトに使う |
| `csrf_token` | 更新系 API の `X-CSRF-Token` ヘッダーに設定する値 |

- セッションの有効期限を延ばしたときは、セッション Cookie を送り直して Cookie の有効期限も延ばす（決定事項 #26）

---

## 4. 日報 API

### 共通：日報オブジェクト

```json
{
  "id": 101,
  "report_date": "2026-10-31",
  "sales_staff": { "id": 2, "name": "山田太郎" },
  "status": "submitted",
  "submitted_at": "2026-10-31T18:05:00+09:00",
  "problem": "XYZ工業の値引き要求にどこまで応じるべきか相談したい。",
  "plan": "ABC商事へ資料送付、DEF社アポ取り",
  "visit_records": [
    {
      "id": 501,
      "customer": { "id": 10, "name": "ABC商事" },
      "visited_at": "10:00",
      "content": "新商品の提案。先方部長が興味あり。",
      "sort_order": 1
    }
  ],
  "comments": [
    {
      "id": 801,
      "target": "problem",
      "body": "5%までなら即決OK。それ以上は相談して。",
      "commenter": { "id": 1, "name": "鈴木一郎" },
      "created_at": "2026-10-31T19:10:00+09:00",
      "updated_at": "2026-10-31T19:10:00+09:00"
    }
  ],
  "permissions": {
    "can_edit": false,
    "can_delete": false,
    "can_comment": false
  },
  "created_at": "2026-10-31T17:40:00+09:00",
  "updated_at": "2026-10-31T18:05:00+09:00"
}
```

| 項目 | 説明 |
|---|---|
| `status` | `draft`（下書き） / `submitted`（提出済み） |
| `submitted_at` | 下書きの場合は `null` |
| `visit_records` | `sort_order` の昇順 |
| `comments` | `created_at` の昇順。画面側で `target` ごとに振り分けて表示する |
| `permissions.can_edit` | ログインユーザーが本人かつ編集可能な状態なら `true`（SC-04 の編集ボタン表示制御） |
| `permissions.can_delete` | ログインユーザーが本人かつ下書きなら `true`（SC-04 の削除ボタン表示制御） |
| `permissions.can_comment` | ログインユーザーが作成者の上長かつ提出済みなら `true`（コメント欄の表示制御） |

### 共通：閲覧権限

| ログインユーザー | 閲覧できる日報 |
|---|---|
| 本人 | 自分の日報（下書き含む） |
| 上長 | 上記 ＋ 直属の部下の **提出済み** 日報 |
| 管理者 | なし（決定事項 #7） |

### 共通：編集可能条件

- 本人の日報であること
- 下書き、または提出済みでもコメントが 0 件であること（コメント付きの日報は編集不可）

### 共通：削除可能条件

- 本人の日報であること
- 下書きであること（提出済みの日報は削除できない）

---

### R-01 日報一覧取得

`GET /reports`

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `date_from` | date | | 報告日（開始）。省略時は制限なし |
| `date_to` | date | | 報告日（終了）。省略時は制限なし |
| `sales_staff_id` | integer | | 担当者で絞り込み。自分か直属の部下（無効になった部下も含む。決定事項 #16）だけ指定できる。それ以外・存在しない ID は `403` |
| `customer_name` | string | | 顧客名の部分一致。該当顧客の訪問記録を含む日報を抽出 |
| `page`, `per_page` | integer | | ページング |

並び順：`report_date` 降順 → 担当者名昇順

- `date_from`・`date_to` は両端の日を含む。`date_to` が `date_from` より前なら `400`（SC-02「開始日以降であること」）
- `customer_name` は大文字・小文字を区別しない

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 101,
      "report_date": "2026-10-31",
      "sales_staff": { "id": 2, "name": "山田太郎" },
      "status": "submitted",
      "visit_count": 3,
      "customers": [
        { "id": 10, "name": "ABC商事" },
        { "id": 11, "name": "XYZ工業" }
      ],
      "comment_count": 2,
      "needs_comment": false
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total_count": 53, "total_pages": 3 }
}
```

| 項目 | 説明 |
|---|---|
| `visit_count` | 訪問記録の件数 |
| `customers` | 訪問した顧客の `{id, name}` 配列。重複なし・訪問記録の順。無効になった顧客も含む。訪問記録が 0 件なら空配列（SC-02 の「顧客」欄） |
| `comment_count` | コメント件数 |
| `needs_comment` | ログインユーザーが上長で、部下の提出済み日報にコメントが 0 件の場合 `true`（SC-02 の「●」表示） |

> SC-02「今日の日報を書く」ボタンは `GET /reports?sales_staff_id={自分のID}&date_from={今日}&date_to={今日}` で今日の日報の有無を確認し、あれば編集・なければ新規作成へ遷移する。

**エラー**
- `400 VALIDATION_ERROR`：日付の形式が正しくない、`date_to` が `date_from` より前、ページングの値が範囲外
- `403 FORBIDDEN`：管理者（決定事項 #7）、閲覧権限のない `sales_staff_id` を指定した

---

### R-02 日報作成

`POST /reports`

**リクエスト**

```json
{
  "report_date": "2026-10-31",
  "status": "submitted",
  "problem": "XYZ工業の値引き要求にどこまで応じるべきか相談したい。",
  "plan": "ABC商事へ資料送付、DEF社アポ取り",
  "visit_records": [
    {
      "customer_id": 10,
      "visited_at": "10:00",
      "content": "新商品の提案。先方部長が興味あり。"
    },
    {
      "customer_id": 12,
      "visited_at": "14:30",
      "content": "見積提出。来週回答予定。"
    }
  ]
}
```

| 項目 | 型 | 必須 | チェック |
|---|---|---|---|
| `report_date` | date | ○ | 未来日不可。本人の同日付日報が既にあれば `409` |
| `status` | string | ○ | `draft` / `submitted` |
| `problem` | string | 提出時○ | 最大 2,000 文字 |
| `plan` | string | 提出時○ | 最大 2,000 文字 |
| `visit_records` | array | ○ | 0〜20 件（訪問がない日は空配列で提出できる。決定事項 #8） |
| `visit_records[].customer_id` | integer | ○ | 有効な顧客であること |
| `visit_records[].visited_at` | string | | `HH:mm` 形式 |
| `visit_records[].content` | string | ○ | 最大 2,000 文字 |

- 担当者はログインユーザーで固定（リクエストでは指定しない）
- `sort_order` は配列の順番で 1 から採番する
- `status = submitted` の場合は `submitted_at` に現在日時を設定する
- 下書き保存時も、入力された訪問記録の行については `customer_id`・`content` の必須チェックを行う（空行は画面側で除外して送信する）

**レスポンス** `201 Created`

作成した日報オブジェクト。`Location: /api/v1/reports/{id}` ヘッダーを付与。

**エラー**
- `400 VALIDATION_ERROR`：入力チェックエラー、存在しない・無効な顧客を指定（その行の `visit_records[n].customer_id` のエラー）
- `403 FORBIDDEN`：管理者（T-RPT-16）
- `409 CONFLICT`（`reason`：`REPORT_ALREADY_EXISTS`）：同日付の日報が既に存在。同時に作成された場合（ボタンの 2 度押しなど）も、1 件だけ作成し、残りは同じ 409 にする

---

### R-03 日報詳細取得

`GET /reports/{id}`

**レスポンス** `200 OK`：日報オブジェクト

- 無効になった顧客の訪問記録も、顧客名をそのまま返す（T-CUS-09）
- 無効になった部下の提出済み日報も、上長は閲覧できる（決定事項 #16）

**エラー**
- `404 NOT_FOUND`：存在しない（数字でない ID も含む。決定事項 #30）、または閲覧権限がない（管理者を含む。決定事項 #7）。どれも同じレスポンス

---

### R-04 日報更新

`PUT /reports/{id}`

**リクエスト**：R-02 と同じ形式。ただし `report_date` は指定不可（送られても無視）。

- `visit_records` は **全件置き換え**。既存行を残す場合は `id` を含めて送信する

```json
{
  "status": "submitted",
  "problem": "...",
  "plan": "...",
  "visit_records": [
    { "id": 501, "customer_id": 10, "visited_at": "10:00", "content": "（修正後）" },
    { "customer_id": 15, "visited_at": "16:00", "content": "（追加した行）" }
  ]
}
```

| 動作 | 条件 |
|---|---|
| 更新 | `id` 付きで送られた既存行 |
| 追加 | `id` なしの行 |
| 削除 | 既存行のうち、送られなかった行 |

- 同じ `visit_records[].id` を 2 回以上送った場合は `400`（2 回目以降の行の `id` のエラー。どの行で更新するか決まらないため）
- `sort_order` は送られた順に 1 から振り直す
- 顧客は有効であること。ただし、`id` 付きの既存の行で顧客を変えていなければ、無効になった顧客のままでもよい（決定事項 #36）
- `submitted` → `draft` への差し戻しは不可（`400`）
- 初めて `submitted` になったときのみ `submitted_at` を設定する
- 日報の行をロックしてから読み込み、その値で権限・コメントの有無を判定する（決定事項 #15）

**レスポンス** `200 OK`：更新後の日報オブジェクト

**エラー**
- `400 VALIDATION_ERROR`：入力チェックエラー、他の日報に属する `visit_records[].id` を指定（その行の `visit_records[n].id` のエラー）、同じ `visit_records[].id` を重複して指定、無効・存在しない顧客を指定、提出済みを下書きに戻そうとした
- `403 FORBIDDEN`：本人以外（閲覧はできる上長）
- `404 NOT_FOUND`：存在しない、または閲覧権限がない（管理者を含む）
- `409 CONFLICT`（`reason`：`REPORT_LOCKED`）：コメントが付いているため編集不可

---

### R-05 下書き日報の削除

`DELETE /reports/{id}`

本人の下書きだけを削除できる（決定事項 #13）。誤った日付で下書きを作った場合に、作り直せるようにするため。

- 訪問記録も一緒に削除する（物理削除）
- 削除した日付の日報は、あらためて作成できる

**レスポンス** `204 No Content`

**エラー**
- `403 FORBIDDEN`：本人以外（閲覧はできる上長など）
- `404 NOT_FOUND`：存在しない、または閲覧権限がない
- `409 CONFLICT`（`reason`：`REPORT_NOT_DRAFT`）：提出済みの日報

---

## 5. コメント API

### 共通：コメント可能条件

- ログインユーザーが日報作成者の **直属の上長** であること
- 日報が提出済みであること

### C-01 コメント投稿

`POST /reports/{id}/comments`

**リクエスト**

```json
{
  "target": "problem",
  "body": "5%までなら即決OK。それ以上は相談して。"
}
```

| 項目 | 型 | 必須 | チェック |
|---|---|---|---|
| `target` | string | ○ | `problem` / `plan` |
| `body` | string | ○ | 最大 1,000 文字。空白のみ不可 |

- 本文は前後の空白を除いて保存する
- 日報の行をロックしてから、コメント可能条件を確かめて作成する（決定事項 #15）

**レスポンス** `201 Created`：コメントオブジェクト（日報オブジェクト内の `comments[]` と同形式）。`Location: /api/v1/comments/{id}` ヘッダーを付与

**エラー**
- `400 VALIDATION_ERROR`
- `403 FORBIDDEN`：日報は閲覧できるが、コメント可能条件を満たさない（日報を書いた本人など）
- `404 NOT_FOUND`：日報が存在しない、または閲覧権限がない（他チームの上長・同僚・管理者・部下の下書き）

---

### C-02 コメント更新

`PUT /comments/{id}`

**リクエスト**

```json
{ "body": "5%までなら即決OK。7%までは私に一報を。" }
```

- `target` は変更不可（送られても無視する）

**レスポンス** `200 OK`：更新後のコメントオブジェクト

**エラー**
- `400 VALIDATION_ERROR`
- `403 FORBIDDEN`：コメントが付いた日報は閲覧できるが、投稿者本人ではない（日報を書いた本人など）
- `404 NOT_FOUND`：コメントが存在しない、またはコメントが付いた日報を閲覧できない（決定事項 #37）

---

### C-03 コメント削除

`DELETE /comments/{id}`

**レスポンス** `204 No Content`

- 物理削除とする（決定事項 #14）
- 削除の結果コメントが 0 件になった日報は、再び編集可能になる

**エラー**
- `403 FORBIDDEN`：C-02 と同じ
- `404 NOT_FOUND`：C-02 と同じ

---

## 6. 顧客マスタ API

### 共通：顧客オブジェクト

```json
{
  "id": 10,
  "name": "ABC商事",
  "contact_person": "田中様",
  "phone": "03-1234-5678",
  "address": "東京都千代田区...",
  "assigned_sales": { "id": 2, "name": "山田太郎" },
  "is_active": true,
  "created_at": "2026-04-01T10:00:00+09:00",
  "updated_at": "2026-04-01T10:00:00+09:00"
}
```

### M-01 顧客一覧取得

`GET /customers`

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | | 顧客名の部分一致 |
| `assigned_sales_id` | integer | | 担当営業で絞り込み |
| `include_inactive` | boolean | | `true` で無効な顧客も含める。admin 以外は指定しても無視（常に有効のみ） |
| `page`, `per_page` | integer | | ページング |

並び順：顧客名昇順

- sales / manager は日報入力の顧客選択（SC-03）のために利用する。その場合のレスポンスは `id`・`name` のみでもよいが、実装簡略化のため同一形式で返す

**レスポンス** `200 OK`：顧客オブジェクトの配列 ＋ `meta`

---

### M-02 顧客登録

`POST /customers`

**リクエスト**

```json
{
  "name": "ABC商事",
  "contact_person": "田中様",
  "phone": "03-1234-5678",
  "address": "東京都千代田区...",
  "assigned_sales_id": 2
}
```

| 項目 | 型 | 必須 | チェック |
|---|---|---|---|
| `name` | string | ○ | 最大 100 文字 |
| `contact_person` | string | | 最大 50 文字 |
| `phone` | string | | 日本の電話番号の形式（`0` で始まる 10〜11 桁の数字。ハイフンなしか「市外局番-市内局番-加入者番号」の形。例：`03-1234-5678`・`090-1234-5678`・`0120-123-456`）、最大 20 文字（決定事項 #32） |
| `address` | string | | 最大 200 文字 |
| `assigned_sales_id` | integer | | 有効な営業担当者（`sales`・`manager`）であること。管理者は指定できない（決定事項 #30） |

- `is_active` は `true` で登録
- 任意項目は、省略・`null`・空文字のどれでも未設定（`null`）として保存する（決定事項 #30）

**レスポンス** `201 Created`：顧客オブジェクト。`Location: /api/v1/customers/{id}` ヘッダーを付与

**エラー**
- `400 VALIDATION_ERROR`：入力チェックエラー、担当営業が有効な営業担当者でない（T-CUS-04）
- `403 FORBIDDEN`：管理者以外（T-CUS-05）

---

### M-03 顧客詳細取得

`GET /customers/{id}`

**レスポンス** `200 OK`：顧客オブジェクト

**エラー**
- `403 FORBIDDEN`：管理者以外
- `404 NOT_FOUND`：存在しない（数字でない ID も含む。決定事項 #30）

---

### M-04 顧客更新

`PUT /customers/{id}`

**リクエスト**：M-02 の項目 ＋ `is_active`（boolean, 必須）

- 無効化しても、過去の訪問記録からの参照は維持する
- 全項目の置き換え。省略した任意項目は未設定（`null`）になる（決定事項 #30）
- 担当営業が今と同じ値なら、その営業が無効になっていても更新できる（決定事項 #30）

**レスポンス** `200 OK`：更新後の顧客オブジェクト

**エラー**
- `400 VALIDATION_ERROR`：入力チェックエラー、担当営業を有効でない営業担当者に変えた
- `403 FORBIDDEN`：管理者以外（T-CUS-11）
- `404 NOT_FOUND`：存在しない

---

## 7. 営業マスタ API

### 共通：営業オブジェクト

```json
{
  "id": 2,
  "name": "山田太郎",
  "email": "yamada@example.com",
  "department": "営業1課",
  "role": "sales",
  "manager": { "id": 1, "name": "鈴木一郎" },
  "is_active": true,
  "created_at": "2026-04-01T10:00:00+09:00",
  "updated_at": "2026-04-01T10:00:00+09:00"
}
```

※ `password_hash` はいかなる API でも返さない。

### S-01 営業一覧取得

`GET /sales-staff`

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | | 氏名の部分一致 |
| `department` | string | | 部署の完全一致 |
| `role` | string | | ロールで絞り込み（SC-08 の上長セレクトでは `manager` を指定） |
| `include_inactive` | boolean | | `true` で無効な担当者も含める |
| `page`, `per_page` | integer | | ページング |

並び順：部署昇順 → 氏名昇順

**権限**
- admin：全件
- manager：自分と直属の部下のみ（`include_inactive` などの条件は、この範囲の中で絞り込む）
- sales：`403`

- 並び順の「部署昇順」では、部署が未設定の担当者を最後にする（決定事項 #31）

**レスポンス** `200 OK`：営業オブジェクトの配列 ＋ `meta`

---

### S-02 営業登録

`POST /sales-staff`

**リクエスト**

```json
{
  "name": "山田太郎",
  "email": "yamada@example.com",
  "password": "Passw0rd",
  "department": "営業1課",
  "role": "sales",
  "manager_id": 1
}
```

| 項目 | 型 | 必須 | チェック |
|---|---|---|---|
| `name` | string | ○ | 最大 50 文字 |
| `email` | string | ○ | メール形式、最大 255 文字。重複時は `409` |
| `password` | string | ○ | 8〜64 文字、英字と数字を各 1 文字以上含む（決定事項 #25）。Argon2id でハッシュ化して保存する |
| `department` | string | | 最大 50 文字 |
| `role` | string | ○ | `sales` / `manager` / `admin` |
| `manager_id` | integer | | 有効な `manager` ロールの担当者であること。`role` が `manager` のときは指定できない（`null` か省略のみ。決定事項 #35） |

- `is_active` は `true` で登録する
- メールアドレスは前後の空白を除き、小文字にそろえて保存する。重複は大文字・小文字を区別せずに確かめる（ログインが大文字・小文字を区別しないため。決定事項 #31）
- 部署は省略・空文字なら未設定（`null`）にする

**レスポンス** `201 Created`：営業オブジェクト。`Location: /api/v1/sales-staff/{id}` ヘッダーを付与

**エラー**
- `400 VALIDATION_ERROR`：入力チェックエラー、`manager_id` が有効な `manager` でない、`role` が `manager` なのに `manager_id` を指定した
- `403 FORBIDDEN`：管理者以外
- `409 CONFLICT`（`reason`：`EMAIL_ALREADY_EXISTS`）

---

### S-03 営業詳細取得

`GET /sales-staff/{id}`

**レスポンス** `200 OK`：営業オブジェクト ＋ `subordinate_count`（直属の部下の人数。有効な部下だけを数える。決定事項 #17。SC-08 の無効化警告に使う）

**エラー**
- `403 FORBIDDEN`：管理者以外（存在しない ID でも 403。有無を推測させない）
- `404 NOT_FOUND`：存在しない

---

### S-04 営業更新

`PUT /sales-staff/{id}`

**リクエスト**：S-02 の項目 ＋ `is_active`（boolean, 必須）

- `password` は任意。省略または空文字なら変更しない
- `role` が `manager` のときは `manager_id` を指定できない（`400`。営業を上長に変えるときは `manager_id` を `null` にして送る。決定事項 #35）
- `manager_id` に自分自身、または自分の配下（部下・部下の部下…）を指定した場合は `400`（循環防止）
- `role` を `manager` 以外に変更する場合、有効な部下がいれば `409`（`reason` なし。先に部下の上長を付け替える必要がある。無効な部下だけなら変更できる。決定事項 #31）
- 無効化するとその担当者の既存セッションを破棄する
- 管理者が自分自身を無効化・ロール変更することは不可（`400`）
- `manager_id` が今と同じなら、上長が有効かどうかを確かめない（上長が無効になった後でも、付け替えずに他の項目を直せるようにするため。決定事項 #30 と同じ考え方）
- 部下がいる上長も無効にできる（警告 M-11 は画面で出す）

**レスポンス** `200 OK`：更新後の営業オブジェクト

**エラー**
- `400 VALIDATION_ERROR`：入力チェックエラー、上長の循環・`manager` 以外の上長、`role` が `manager` の人への上長の指定、管理者の自己無効化・自己ロール変更
- `403 FORBIDDEN`：管理者以外
- `404 NOT_FOUND`：存在しない
- `409 CONFLICT`：メールアドレスの重複（`reason`：`EMAIL_ALREADY_EXISTS`）、有効な部下がいる上長のロール変更（`reason` なし）

---

## 8. ヘルスチェック API

### H-01 ヘルスチェック

`GET /health`

アプリが動いているかを返す（決定事項 #23）。Cloud Run の起動確認や、デプロイ後の動作確認に使う。**認証不要**。

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `check` | string | | `db` を指定すると、DB に接続できるかも確認する |

**レスポンス** `200 OK`

```json
{ "data": { "status": "ok" } }
```

`check=db` のとき：

```json
{ "data": { "status": "ok", "checks": { "db": "ok" } } }
```

**エラー**
- `400 VALIDATION_ERROR`：`check` が `db` 以外
- `500 INTERNAL_ERROR`：DB に接続できない（詳細はレスポンスに含めず、ログにだけ出す）

---

## 9. 決定事項

作成時の未決事項は、[仕様決定記録](./decisions.md) の #12〜#15・#18、実装時に #20〜#24・#30〜#32・#35〜#37 で決定した。要点は次のとおり。

- 認証はセッション Cookie 方式。セッションは DB に保存する（#12）
- 本人は下書きの日報を削除できる（R-05、#13）
- コメントの削除は物理削除（C-03、#14）
- 日報の更新（R-04）とコメントの投稿（C-01）は、どちらも日報の行をロックしてから処理する。更新時にコメントが付いていれば `409 REPORT_LOCKED` を返す（#15）
- ログインは同じメールアドレスで5回連続失敗すると15分ロックする（A-01、#18）
