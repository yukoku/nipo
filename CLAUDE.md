## 1. 要件定義（ER図を含む）

@docs/requirements.md

## 2. 画面設計

@docs/screens.md

## 3. API仕様書

@docs/api.md

## 4. テスト仕様書

@docs/test-spec.md

## 5. 仕様決定記録

@docs/decisions.md

# 使用技術
**言語:** TypeScript
**フレームワーク** Next.js(App Router)
**UIコンポーネント** shadcn/ui + Tailwind CSS
**APIスキーマ定義** OpenAPI(Zodによる検証)
**DBスキーマ定義** Prisma.js
**テスト** Vitest
**デプロイ** Google Cloud Run

# アーキテクチャ

## ディレクトリ構成
```
src/
  app/            # 画面（App Router）と Route Handlers
    api/v1/       #   REST API（docs/api.md）。Route Handler は薄くし、処理は server/services に置く
  components/     # 機能をまたいで使う UI 部品
    ui/           #   shadcn/ui が生成する部品（手で大きく書き換えない）
  features/       # 機能ごとの画面部品・フック（reports / customers / staff / auth）
  schemas/        # Zod スキーマ。API の入力検証・OpenAPI 定義・フォームの入力チェックで共有する
  server/         # サーバー専用のコード（先頭で `import 'server-only'` する）
    services/     #   業務ロジック（日報の作成・更新など）。Server Component と Route Handler の両方から呼ぶ
    authz/        #   権限判定（DB にアクセスしない純粋関数）
    auth/         #   セッション・パスワード
    db/           #   Prisma Client
  lib/            # サーバー・ブラウザの両方で使う汎用ユーティリティ（日付、API クライアントなど）
```
- import はパスエイリアス `@/` を使う（例：`import { prisma } from '@/server/db/prisma'`）。`../../` のような深い相対パスは使わない
- `src/server/` 配下のファイルは先頭で `import 'server-only'` し、Client Component から誤って import されたらビルドエラーになるようにする

## データ取得の方針
- **表示（読み取り）**：Server Component から `src/server/services` の関数を直接呼ぶ。自分の REST API を HTTP で呼び出さない（無駄な通信と二重の認証処理を避けるため）
- **登録・更新・削除**：Client Component から REST API（`/api/v1/...`）を呼ぶ。入力チェックは API 側で Zod スキーマにより必ず行い、画面側でも同じスキーマで事前にチェックする
- 画面から API を呼ぶときは `api.get / post / put / delete`（`@/lib/api-client`）を使い、`fetch` を直接使わない。更新系には CSRF トークンが自動で付く（トークンが古ければ取り直して 1 回だけ再送する。ログイン API だけはトークンを付けない）。エラーは `ApiClientError`（`status`・`code`・`reason`・`details`）で投げられる。ログイン API で受け取ったトークンは `setCsrfToken()` で入れ、ログアウトしたら `setCsrfToken(null)` で消す
- Server Actions は使わない（API 仕様書・OpenAPI 定義と別の入口ができ、権限チェックの漏れにつながるため）
- 権限チェックは services の中で行う（画面・API のどちらから呼ばれても同じ判定になるようにする）

## 日付・時刻
- 業務上の日付・時刻はすべて JST（Asia/Tokyo）基準。サーバーは UTC で動くため、「今日」の判定や表示は必ず JST に変換する
- **日付・時刻の変換と表示は `@/lib/date` の関数を使う。`toLocaleDateString`・`toLocaleString`・`getDate()`・`getHours()` などを直接使わない**（実行環境のタイムゾーンで結果が変わるため）
- 2種類の値を区別する
  - **暦の日付・時刻**（報告日 `report_date`・訪問時刻 `visited_at`）：`YYYY-MM-DD`・`HH:mm` の文字列のまま扱う。タイムゾーンの変換をしない
  - **瞬間**（`submitted_at`・`created_at` など）：`Date` で扱い、表示は `formatDateTimeForDisplay()`、API のレスポンスは `toApiDateTime()`（`+09:00` 付き）
- Prisma の `@db.Date`・`@db.Time` 列への保存・読み込みは、必ず `dateStringToDbDate()`・`dbDateToDateString()`・`timeStringToDbTime()`・`dbTimeToTimeString()` を通す（`new Date('2026-11-05T00:00:00+09:00')` をそのまま保存すると、前日の 11/4 になる）
- 「今日」は `todayInJst()`、未来日の判定は `isFutureDate()`、当月1日は `startOfMonthInJst()` を使う

## API の実装
- Route Handler は `withApi()`（`@/server/api/with-api`）で包む。例外は docs/api.md §1.5 の形式に変換され、想定外の例外は 500 `INTERNAL_ERROR`（詳細はログにだけ出す）になる
- エラーは `@/server/api/errors` のクラスを throw する（`ValidationError`・`UnauthenticatedError`・`ForbiddenError`・`NotFoundError`・`ConflictError`（理由 `reason` 付き）・`TooManyAttemptsError`）。`NextResponse.json()` でエラーを直接返さない
- 入力は `parseJsonBody()`・`parseSearchParams()`（`@/server/api/validation`）で読む。Zod スキーマは API と同じ snake_case のキーで書き、結果は camelCase で受け取る。`schema.parse()` を直接使うとエラーメッセージが日本語にならない
- レスポンスは `ok()`・`okList()`・`created()`・`noContent()`（`@/server/api/response`）で返す。services からは camelCase・`Date` のまま渡す。キーの snake_case への変換と、`Date`（瞬間）の `+09:00` 付き文字列への変換はここで行う（`@/server/api/serialize`）
- 報告日（`@db.Date`）・訪問時刻（`@db.Time`）は Prisma から `Date` で返るが瞬間ではないので、services で `dbDateToDateString()`・`dbTimeToTimeString()` で文字列にしてから渡す
- エラーメッセージの項目名は `@/lib/validation/field-labels` の辞書で決まる。新しい項目を足したら辞書にも追加する。API ごとに名前が違う項目（`name` など）は `labels` で上書きする
- フォームでも同じメッセージを出すには、`zodResolver(schema, { error: createErrorMap() })`（`@/lib/validation/error-map`）とする
- 一覧 API のクエリは `paginationQuerySchema`（`@/schemas/pagination`）を `.extend()` して作り、`toPrismaPagination()`・`buildPageMeta()`（`@/server/api/pagination`）を使う
- ログは `logger`（`@/server/logger`）で出す（Cloud Logging 用の構造化 JSON）。`console.log` は使わない

## セッション（認証）
- セッションは `@/server/auth/session` の関数で扱う。DB にはトークンの SHA-256 だけを保存し、生のトークンをログ・DB・レスポンスに出さない
- **ログインが必要な API は、Route Handler の最初で `const { user } = await requireAuth(request)`（`@/server/auth/require-auth`）を呼ぶ**。未ログインなら 401、更新系（POST・PUT・PATCH・DELETE）なら CSRF トークンと Origin も確かめて、失敗したら 403（`reason: CSRF_TOKEN_INVALID`）。`requireCurrentUser()` は CSRF を確かめないので、API では使わない
- ログイン中のユーザーは `getCurrentUser()`（Server Component）で取得する
- ログイン API（セッションがまだない）では、`verifyOrigin(request)`（`@/server/auth/csrf`）で Origin だけを確かめる
- ログイン時は `createSession()` → `setSessionCookie()`、ログアウト時は `deleteSession()` → `clearSessionCookie()`。営業を無効化したら `deleteSessionsForStaff()` を呼ぶ
- Server Component では Cookie を書き換えられないため、Cookie の有効期限の延長は Route Handler と proxy（`src/proxy.ts`。画面へのリクエストのたびに DB を見ずに延ばす。決定事項 #28）で行う。Route Handler では、レスポンスを返す直前に `refreshSessionCookie(response.cookies, request, auth)` を呼ぶ（`auth` は `requireAuth()` の戻り値。延ばしたときだけ Cookie を送り直す。決定事項 #26）
- ログインユーザーの情報（上長・部下・CSRF トークン）は `getCurrentUserProfile()`（`@/server/services/auth`）で取得する。DB のロール（`SALES`）を API の値（`sales`）にするときは `toApiRole()`、画面で API の値を DB の値に戻すときは `fromApiRole()`（`@/lib/roles`）を使う

## 画面のアクセス制御
- 画面の URL は docs/screens.md §1 のとおり。パスとロールごとのトップ画面は `@/lib/routes`（`LOGIN_PATH`・`homePathForRole()`）を使い、文字列を直接書かない
- proxy（`src/proxy.ts`）は、セッション Cookie がなければログイン画面（`/login?next=元の画面`）へリダイレクトするだけ。セッションが正しいかやロールは見ない
- **画面（page.tsx）は、最初に必ず `await requirePageUser()` か `await requirePageRole('ADMIN')`（`@/server/auth/page-auth`）を呼ぶ**。ログインしていなければログイン画面へ、ロールが違えば 403 画面（`src/app/forbidden.tsx`）になる。呼び忘れは `src/app/page-auth-guard.test.ts` で見つかる（認証なしで開ける画面は、そのテストの `PUBLIC_PAGES` に足す）
  - 管理者用の画面（SC-05〜SC-08）は `requirePageRole('ADMIN')`、日報の画面（SC-02〜SC-04）は `requirePageRole('SALES', 'MANAGER')`
  - layout.tsx では権限を確かめない（画面を移動しても描画し直されず、ページの描画も止められないため。決定事項 #28）
- 画面から services を呼んで `NotFoundError`・`ForbiddenError` が投げられたら、`.catch(rethrowAsPageError)` で 404 画面・403 画面にする（閲覧できない日報は 404 画面。SC-T-04）
- ログイン後の戻り先などのリダイレクト先にユーザーの入力を使うときは、`safeRedirectPath()`（`@/lib/routes`）を通す（オープンリダイレクトの防止）

## 権限判定
- 権限の判定は `src/server/authz/` の純粋関数で行い、services や画面で条件を書き直さない（DB にはアクセスしないので、判定に必要な値は呼び出し側で読み込んで渡す）
- 日報の閲覧・編集・削除・コメントは `requireReportAccess(user, report, 'view' | 'edit' | 'delete' | 'comment')`（`@/server/authz/report`）で確かめる。日報がない・閲覧できないなら `NotFoundError`（404）、閲覧はできるがその操作ができないなら `ForbiddenError`（403）
  - `report` には `{ salesStaffId, authorManagerId（日報を書いた人の manager_id）, status, commentCount }` を渡す
  - 編集・コメントは、決定事項 #15 のとおり日報の行をロックしてから読み込んだ値で判定する
- R-03 の `permissions` は `reportPermissions(user, report)` で作る
- 一覧（R-01）は `viewableReportsWhere(user)` を Prisma の `where` に入れて絞り込む（`canViewReport` と同じ規則であることを `report.api.test.ts` で確かめている。規則を変えたら両方を直す）
- ロールで決まる操作（マスタ管理は管理者だけ、日報の作成は営業・上長だけ など）は `requireRole(user, 'ADMIN')`（`@/server/authz/role`）

## パスワード
- パスワードは `hashPassword()`（`@/server/auth/password`）でハッシュ化して保存する。平文をログ・DB・レスポンスに出さない
- 照合は `verifyPassword(hash, password)` を使う。ユーザーがいない・無効なときも `verifyPassword(null, password)` を呼んで同じだけ時間をかける（応答時間からアカウントの有無を推測させない）
- 登録・変更時の入力チェックは `passwordSchema`（`@/schemas/password`）を使う。ログイン（A-01）では使わない

## OpenAPI 定義
- Zod スキーマを唯一の定義元にする。Route Handler の入力チェック・OpenAPI 定義（`docs/openapi.yaml`）・フォームの入力チェックで、`src/schemas/` の同じスキーマを使う
- **API を追加・変更したら、Zod スキーマを直し、`npm run openapi:generate` を実行して `docs/openapi.yaml` もコミットする**（古いままだと `npm test` と `npm run openapi:check` が失敗する）
- API を追加するときは、`src/openapi/paths/` に `registerApi()` で登録する関数を作り、`src/openapi/document.ts` の `REGISTRARS` に足す。`request` には Route Handler で使うスキーマをそのまま渡す
  - エラーレスポンス（400・401・403・500）と、セッション Cookie・CSRF ヘッダーの要求は `auth` と `method` から自動で付く。それ以外に返すエラー（404・409 など）は `errors` に書く
- レスポンスのスキーマは API の形（snake_case、日時は文字列）で書き、`dataResponseSchema()`・`listResponseSchema()`（`@/schemas/response`）で包む
- 名前を付けて `components.schemas` に出したいスキーマは `.meta({ id: 'Report' })` を付ける。`src/schemas/` では `.openapi()`（zod-to-openapi の拡張）を使わない
- `docs/openapi.yaml` は手で編集しない。開発サーバーの http://localhost:3000/dev/api-docs で見られる（本番では 404）

## UI
- 部品は shadcn/ui を使う。足りない部品は `npx shadcn@latest add <名前>` で追加する（`src/components/ui/` に生成される）
- `src/components/ui/` のファイルは手で書き換えない。見た目を変えたいときは、使う側で `className` を渡すか、`src/components/` に包む部品を作る
- フォームは react-hook-form + Zod + shadcn/ui の `Field` 部品（`Field`・`FieldLabel`・`FieldError`）で作る。旧来の `form` 部品は使わない
- クラス名の結合には `cn()`（`@/lib/utils`）を使う
- テーマはライトモードのみ（ダークモードの切り替えは作らない）
- アイコンは lucide-react を使う
- 部品の見た目は開発環境の `/dev/ui-sample` で確認できる（本番では 404）
- ログイン後の画面は `src/app/(app)/` の下に置く（共通ヘッダー付きのレイアウト `src/app/(app)/layout.tsx` が付く）。ページの中では `<main>` を使わない（レイアウトが出す）
- 画面に出す文言（docs/screens.md §5）は `@/lib/messages` の定数を使い、直接書かない
- 完了メッセージ（M-09）は `notifySuccess('saved' | 'submitted' | 'commented')`、項目に結び付けられないエラーは `notifyError(apiErrorMessage(error))`（`@/lib/notify`・`@/lib/form-errors`）。画面を移動してもトーストは消えないので、保存したら `notifySuccess()` の後に `router.push()` してよい
- 確認ダイアログは `const confirm = useConfirm()`（`@/components/confirm-dialog`）で `if (await confirm(CONFIRM_MESSAGES.submitReport)) { ... }` とする。`AlertDialog` を画面ごとに組み立てない
- フォームの項目は `FormField`（`@/components/form-field`）で包む。`required` で `*` が付き、`error` を渡すと項目のすぐ下に赤字で出る。入力欄には `{...controlProps(id, fieldState.error)}` を付ける
- API が 400 を返したら `applyApiErrors(error, form.setError, { fields: [...] })`（`@/lib/form-errors`）で各項目のエラーにする。項目に結び付けられないものは `<FormRootError errors={form.formState.errors} />` に出る。`false` が返ったら（409・500 など）`notifyError(apiErrorMessage(error))` を出す
- 入力画面では `const { confirmLeave } = useUnsavedChangesGuard(form.formState.isDirty)`（`@/components/unsaved-changes`）を呼ぶ。リンクでの移動とブラウザを閉じる操作は自動で確かめる。キャンセルボタンなどコードで移動するときは `if (await confirmLeave()) router.push(...)` とする（決定事項 #29）

## テスト
- テストは Vitest で書く。`npm test` で全件、`npm run test:watch` で変更を監視しながら実行する
- テストファイルは対象ファイルと同じ場所に置く。ファイル名で実行環境（Vitest のプロジェクト）が決まる

| ファイル名 | プロジェクト | 環境 | 対象 |
|---|---|---|---|
| `*.test.ts` | `unit` | Node | 純粋なロジック（権限判定・入力チェック・日付など） |
| `*.test.tsx` | `component` | jsdom | React コンポーネント（Testing Library） |
| `*.api.test.ts` | `api` | Node + テスト用DB | Route Handler の結合テスト（ファイルは直列実行） |

- テスト名は日本語で、期待する動作を書く（例：`it('空のまま保存すると、各項目の下にエラーが表示される')`）。docs/test-spec.md のケースを実装するときは、テスト名の先頭に ID を付ける（例：`it('T-RPT-03: 同日の日報があれば 409 を返す')`）
- テストは UTC で動く（本番の Cloud Run と同じ）。現在日時を使うテストは `setupFixedTime()`（`@/test/time`）で基準日時 2026-10-31 10:00 JST に固定する
- `vi.fn()` の呼び出し履歴は各テストの前に自動で消える（Vitest 5 の既定）
- テストデータ（docs/test-spec.md §2.2）は `src/server/db/seed/data.ts` に定義している。ID は数値を直接書かず、定数で参照する（例：`SEED_STAFF.yamada.id`・`SEED_REPORTS.draft.id`）。テストデータを変えるときは、テスト仕様書も同じ PR で直す
- `*.api.test.ts`（`api` プロジェクト）は、テスト用DB を自動で準備する。テストファイルで準備の処理を書く必要はない
  - 実行前に 1 回だけ、テスト用DB にマイグレーションを適用する（`src/test/api/global-setup.ts`）
  - **各テストの前に、テスト用DB をテストデータの状態に戻す**（`src/test/api/setup-api.ts`）。テストの中でデータを変えても次のテストには残らないので、テストは実行順に依存しないように書く
  - DB 名が `_test` で終わる接続先でしか動かない（開発用DB を誤って消さないため）
- Route Handler は `callRoute(GET, '/api/v1/health', { query, body, params, headers })`（`@/test/api/route`）で、HTTP サーバーなしに呼び出す。結果は `{ status, headers, body }`（`body` は JSON を解析した値。204 なら `null`）
- ログインが必要な API のテストは `const yamada = await loginAs('yamada')`（`@/test/api/auth`）でログイン状態を作り、`callRoute(handler, path, { headers: yamada.headers })` で呼ぶ（`headers` にはセッション Cookie と CSRF トークンが入っている）。ログイン API を通さず DB に直接セッションを作る
- DB のデータを直接確かめるときは、アプリと同じ `prisma`（`@/server/db/prisma`）を使う
- git worktree で複数の作業を並行するときは、各作業ディレクトリの `.env.test.local` で別のテスト用DB（例：`nipo_issue15_test`）を指定する。同じテスト用DB を同時に使うと、テスト同士がデータを消し合う
- 権限判定（`src/server/authz/`）と入力チェック（`src/schemas/`）は分岐網羅 100% が必須。`npm run test:coverage` で下回るとエラーになる
- コンポーネントテストは、要素を役割やラベルで取得する（`getByRole`・`getByLabelText`）。クラス名や DOM 構造に依存しない

# 開発ルール

## 作業の進め方
- 作業は GitHub の Issue 単位で行う。1 Issue につき 1 ブランチ・1 Pull Request
- `main` に直接コミットしない。必ずブランチを切って PR を作る
- 仕様と異なる実装をする場合は、同じ PR で仕様書（docs/）も更新する。方針の判断が必要なものは docs/decisions.md に追記する

## ブランチ名
`<種別>/<Issue番号>-<内容を表す英語>`（英小文字・数字・ハイフンのみ）

| 種別 | 用途 | 例 |
|---|---|---|
| `feature` | 機能の追加 | `feature/31-report-create-api` |
| `fix` | 不具合の修正 | `fix/60-report-date-timezone` |
| `docs` | ドキュメントのみの変更 | `docs/1-decide-open-items` |
| `chore` | 環境構築・設定・依存関係 | `chore/3-repo-setup` |
| `test` | テストのみの追加・修正 | `test/41-scenario-tests` |
| `refactor` | 動作を変えないコードの整理 | `refactor/70-report-service` |
| `ci` | CI/CD の設定 | `ci/12-github-actions` |

## コミットメッセージ
[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/) の形式で、説明は日本語で書く。

```
<種別>(<範囲>): <変更内容の要約> (#<Issue番号>)

<必要なら本文：変更の理由や詳細を箇条書きで>
```

- 種別はブランチ名と同じもの（`feat` は機能追加。ブランチの `feature` に対応）
- 範囲は任意（例：`report`・`auth`・`customer`・`db`・`ui`）
- 例：`feat(report): 日報作成APIを実装 (#31)`、`fix(auth): 無効化したユーザーのセッションが残る問題を修正 (#60)`

## Pull Request
- タイトルはコミットメッセージの1行目と同じ形式にする
- 本文の先頭に `Closes #<Issue番号>` を書き、マージで Issue が閉じるようにする
- `.github/pull_request_template.md` の項目を埋める。確認したテストは docs/test-spec.md のテストIDで書く
