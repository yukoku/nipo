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
