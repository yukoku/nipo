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
- レスポンスは `ok()`・`okList()`・`created()`・`noContent()`（`@/server/api/response`）で返す。services からは camelCase のまま渡し、snake_case への変換はここに任せる（変換は `@/lib/case` の1か所だけ）
- エラーメッセージの項目名は `@/lib/validation/field-labels` の辞書で決まる。新しい項目を足したら辞書にも追加する。API ごとに名前が違う項目（`name` など）は `labels` で上書きする
- フォームでも同じメッセージを出すには、`zodResolver(schema, { error: createErrorMap() })`（`@/lib/validation/error-map`）とする
- 一覧 API のクエリは `paginationQuerySchema`（`@/schemas/pagination`）を `.extend()` して作り、`toPrismaPagination()`・`buildPageMeta()`（`@/server/api/pagination`）を使う
- ログは `logger`（`@/server/logger`）で出す（Cloud Logging 用の構造化 JSON）。`console.log` は使わない

## UI
- 部品は shadcn/ui を使う。足りない部品は `npx shadcn@latest add <名前>` で追加する（`src/components/ui/` に生成される）
- `src/components/ui/` のファイルは手で書き換えない。見た目を変えたいときは、使う側で `className` を渡すか、`src/components/` に包む部品を作る
- フォームは react-hook-form + Zod + shadcn/ui の `Field` 部品（`Field`・`FieldLabel`・`FieldError`）で作る。旧来の `form` 部品は使わない
- クラス名の結合には `cn()`（`@/lib/utils`）を使う
- テーマはライトモードのみ（ダークモードの切り替えは作らない）
- アイコンは lucide-react を使う
- 部品の見た目は開発環境の `/dev/ui-sample` で確認できる（本番では 404）

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
