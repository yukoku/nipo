# 営業日報システム（nipo）

営業担当者が日々の顧客訪問・課題（Problem）・翌日の予定（Plan）を報告し、上長がコメントでフィードバックするための Web アプリケーションです。

- 営業：その日に訪問した顧客と訪問内容（1日に複数件）、Problem、Plan を日報として提出する
- 上長：直属の部下の日報を閲覧し、Problem・Plan にコメントする
- 管理者：顧客マスタ・営業マスタを管理する

> **開発状況**：仕様書の作成が完了し、開発基盤を構築中です（マイルストーン M1）。アプリ本体はまだありません。進捗は [ロードマップ Issue #51](https://github.com/yukoku/nipo/issues/51) を参照してください。

## 仕様書

| 資料 | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 要件定義（機能要件・非機能要件・ER図） |
| [docs/screens.md](docs/screens.md) | 画面定義（画面一覧・遷移図・各画面の項目） |
| [docs/api.md](docs/api.md) | API 仕様（REST / JSON） |
| [docs/test-spec.md](docs/test-spec.md) | テスト仕様（テストデータ・テストケース） |
| [docs/decisions.md](docs/decisions.md) | 仕様決定記録（未決事項の決定内容と理由） |

## 使用技術

| 分類 | 技術 |
|---|---|
| 言語 | TypeScript |
| フレームワーク | Next.js（App Router） |
| UI | shadcn/ui + Tailwind CSS |
| API スキーマ | OpenAPI（Zod による検証） |
| DB | PostgreSQL + Prisma |
| テスト | Vitest |
| 実行環境 | ローカルのみ（本番環境へのデプロイは行わない。決定事項 #33） |

## 必要なツール

| ツール | バージョン | 用途 |
|---|---|---|
| Node.js | 22 系 | アプリの実行・ビルド |
| npm | 10 系（Node.js に同梱） | パッケージ管理 |
| Docker | Docker Compose が使えるもの | ローカルの PostgreSQL |

## セットアップ

```bash
# 1. リポジトリを取得する
git clone git@github.com:yukoku/nipo.git
cd nipo

# 2. パッケージをインストールする
npm ci

# 3. 環境変数ファイルを作る（そのままで docker compose の DB につながる）
cp .env.example .env

# 4. PostgreSQL（開発用DB・テスト用DB）を起動する
docker compose up -d --wait

# 5. 開発用DB にテーブルを作り（マイグレーションを適用し）、テストデータを入れる
npm run db:migrate
npm run db:seed

# 6. 動作を確認する
npm run lint            # ESLint がエラーなく終わること
npm run typecheck       # 型エラーがないこと
npm test                # テストがすべて通ること（テスト用DB へのマイグレーションは自動で行われる）
npx prisma validate     # 「The schema at prisma/schema.prisma is valid」と表示されること

# 7. 開発サーバーを起動する
npm run dev             # http://localhost:3000 を開くとトップページが表示される
```

開発サーバーで http://localhost:3000/dev/ui-sample を開くと、UI 部品（shadcn/ui）の見た目と動作を確認できます。http://localhost:3000/dev/api-docs では、API の OpenAPI 定義をドキュメントとして見られます（どちらも本番環境では 404 になります）。

アプリから DB を使うときは、`src/server/db/prisma.ts` の `prisma` を import します（`import { prisma } from '@/server/db/prisma'`）。接続数の上限は環境変数 `DATABASE_POOL_MAX`（既定 10）で変えられます。

Node.js のバージョンは `.nvmrc` で 22 系を指定しています。nvm を使っている場合は `nvm use` で切り替えられます。

## テストデータ

`npm run db:seed` で、[テスト仕様書 §2.2](docs/test-spec.md) のテストデータを開発用DB に入れます。

- **既存のデータはすべて削除されます**（何度実行しても同じデータになります）。本番環境（`NODE_ENV=production`、または Cloud Run 上）では実行できません
- 営業 7 人・顧客 4 社・日報 6 件（訪問記録・コメント付き）。ID はテスト仕様書と同じです（営業 1〜7、顧客 10〜13、日報 100〜105）
- ログインするときのパスワードは全員 `Passw0rd`

| ID | メールアドレス | 名前 | ロール |
|---|---|---|---|
| 1 | suzuki@example.com | 鈴木一郎 | 上長（山田・佐藤の上長） |
| 2 | yamada@example.com | 山田太郎 | 営業 |
| 3 | sato@example.com | 佐藤花子 | 営業 |
| 4 | tanaka@example.com | 田中次郎 | 上長（伊藤の上長） |
| 5 | ito@example.com | 伊藤三郎 | 営業 |
| 6 | admin@example.com | 管理者 | 管理者 |
| 7 | retired@example.com | 退職者 | 営業（無効。ログインできない） |

データの中身は `src/server/db/seed/data.ts` にあります。テストでは、このファイルの定数で ID を参照します（例：`SEED_STAFF.yamada.id`、`SEED_REPORTS.draft.id`）。

**DB を空にしたいとき**：`npm run db:reset` でマイグレーションを最初から適用し直した後、`npm run db:seed` を実行します（Prisma 7 の `migrate reset` は、テストデータを自動では入れません）。

## ローカルの DB

`docker compose` で PostgreSQL 17 を1つ起動し、その中に2つの DB を作ります。

| DB 名 | 用途 | 接続先を指定するファイル |
|---|---|---|
| `nipo_dev` | 開発用（`npm run dev` など） | `.env`（`.env.example` をコピーして作る。Git 管理外） |
| `nipo_test` | テスト用（`npm test`） | `.env.test`（リポジトリに含まれる） |

- ユーザー名・パスワードはどちらも `nipo`（ローカル専用）
- ホスト側のポートは **55432**（PC で別の PostgreSQL が 5432 番を使っていても衝突しないようにするため）

| 操作 | コマンド |
|---|---|
| 起動 | `docker compose up -d --wait` |
| 停止（データは残る） | `docker compose stop` |
| 状態の確認 | `docker compose ps` |
| psql で接続 | `docker compose exec db psql -U nipo -d nipo_dev` |
| 作り直し（**データをすべて削除**） | `docker compose down -v && docker compose up -d --wait` |

**ポートを変えたいとき**：55432 番も使われている場合は、`.env` の `POSTGRES_PORT` と `DATABASE_URL` のポート番号を書き換えます。テスト用の接続先は `.env.test.local`（Git 管理外）を作り、`DATABASE_URL` を上書きしてください。`.env.test.local` は `.env.test` より優先されます。

**テスト用DB について**：`npm test` を実行すると、APIテスト（`*.api.test.ts`）の前にテスト用DB へマイグレーションが自動で適用され（DB がなければ作られ）、各テストの前にテストデータの状態に戻されます。そのため、テスト用DB のデータは毎回すべて消えます。安全のため、DB 名が `_test` で終わる接続先でしか APIテストは動きません。

**複数の作業ディレクトリ（git worktree）で同時にテストするとき**：すべてが同じ `nipo_test` を使うと、テスト同士がデータを消し合って失敗します。作業ディレクトリごとに `.env.test.local` を作り、別のテスト用DB を指定してください（DB は `npm test` の実行時に自動で作られます）。

```bash
# 例：issue-15/.env.test.local
DATABASE_URL="postgresql://nipo:nipo@localhost:55432/nipo_issue15_test"
```

## npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動する（http://localhost:3000） |
| `npm run build` | 本番用にビルドする（`.next/standalone` に Cloud Run 用の出力ができる） |
| `npm run start` | ビルドしたアプリを起動する |
| `npm run typecheck` | ルートの型を生成してから TypeScript の型チェックをする |
| `npm run lint` | ESLint でコードをチェックする |
| `npm run lint:fix` | ESLint で自動修正できる問題を直す |
| `npm test` | Vitest でテストを全件実行する |
| `npm run test:watch` | ファイルの変更を監視しながらテストを実行する |
| `npm run test:coverage` | カバレッジ付きでテストを実行する（レポートは `coverage/index.html`） |
| `npm run db:migrate` | スキーマの変更からマイグレーションを作り、開発用DBに適用する（`prisma migrate dev`） |
| `npm run db:deploy` | 未適用のマイグレーションを DB に適用する（`prisma migrate deploy`。本番・テスト用DBで使う） |
| `npm run db:reset` | DB を空にして、マイグレーションを最初から適用し直す（データはすべて消える。テストデータは入らないので、続けて `db:seed` を実行する） |
| `npm run db:seed` | テストデータを投入する（既存のデータはすべて消える。本番では実行できない） |
| `npm run db:studio` | Prisma Studio（ブラウザで DB の中身を見る・編集するツール）を起動する |
| `npm run openapi:generate` | Zod スキーマから OpenAPI 定義（`docs/openapi.yaml`）を生成する。API を追加・変更したら実行してコミットする |
| `npm run openapi:check` | `docs/openapi.yaml` が最新か確認する（古ければ失敗する。CI で使う） |

`npm install` / `npm ci` の後には、`postinstall` で `prisma generate` が自動で実行され、Prisma Client が `generated/prisma/` に生成されます（Git 管理外）。`prisma/schema.prisma` を変えたときは `npm run db:migrate` で Client も作り直されます。

## ディレクトリ構成

```
.
├── src/
│   ├── app/              # 画面（App Router）と API（app/api/v1/）
│   ├── components/ui/    # shadcn/ui の部品（npx shadcn add で生成）
│   ├── lib/utils.ts      # cn()（クラス名の結合）
│   ├── openapi/          # OpenAPI 定義の登録と生成（API ごとの登録は openapi/paths/）
│   └── schemas/          # Zod スキーマ（入力チェック・OpenAPI・フォームで共有）
├── scripts/openapi.ts    # docs/openapi.yaml の生成・確認（npm run openapi:generate / openapi:check）
├── components.json       # shadcn/ui の設定
├── docker/postgres/      # ローカル DB の初期化スクリプト（テスト用DB の作成）
├── compose.yaml          # ローカルの PostgreSQL（docker compose）
├── docs/                 # 仕様書（docs/openapi.yaml は生成物。手で編集しない）
├── prisma/
│   ├── schema.prisma     # DB スキーマ
│   └── migrations/       # マイグレーション（npm run db:migrate で生成）
├── generated/prisma/     # Prisma Client（自動生成・Git 管理外。import は `@/generated/prisma/client`）
├── next.config.ts        # Next.js の設定（Cloud Run 向けに standalone 出力）
├── tsconfig.json         # TypeScript の設定（strict、パスエイリアス @/* → src/*）
├── prisma.config.ts      # Prisma CLI の設定（DB 接続先は環境変数 DATABASE_URL）
├── eslint.config.mjs     # ESLint の設定
├── CLAUDE.md             # 開発ルール（Claude Code が読み込む）
└── .github/              # PR・Issue テンプレート、Dependabot の設定
```

`src/` 配下の構成とデータ取得の方針は [CLAUDE.md の「アーキテクチャ」](CLAUDE.md) を参照してください。

## 開発の進め方

- 作業は Issue 単位で行い、Issue ごとにブランチを切って Pull Request を作成します
- ブランチ名・コミットメッセージ・PR の規約は [CLAUDE.md の「開発ルール」](CLAUDE.md) を参照してください

## CI（GitHub Actions）

Pull Request と `main` への push のたびに、[.github/workflows/ci.yml](.github/workflows/ci.yml) が次の順に実行されます。1つでも失敗すると CI は失敗します。

| # | 内容 | コマンド |
|---|---|---|
| 1 | 依存パッケージのインストール（Prisma Client の生成を含む） | `npm ci` |
| 2 | Prisma スキーマの検証 | `npx prisma validate` |
| 3 | Lint | `npm run lint` |
| 4 | 型チェック | `npm run typecheck` |
| 5 | マイグレーションの適用（空の DB に適用できるか） | `npx prisma migrate deploy` |
| 6 | マイグレーションの作り忘れの確認 | `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` |
| 7 | テスト | `npm test` |
| 8 | OpenAPI 定義（`docs/openapi.yaml`）が最新かの確認 | `npm run openapi:generate` の後、差分がないこと |
| 9 | ビルド | `npm run build` |

- テスト用の DB は、PostgreSQL 17 のサービスコンテナを使います（接続先は `.env.test` と同じ）
- **6 で失敗したとき**：`prisma/schema.prisma` を変えたのにマイグレーションを作っていません。`npm run db:migrate -- --name <変更内容>` でマイグレーションを作ってコミットしてください
- **8 で失敗したとき**：API の Zod スキーマを変えたのに OpenAPI 定義を更新していません。`npm run openapi:generate` を実行して、`docs/openapi.yaml` をコミットしてください
- PR を出す前にローカルで確認するときは、1〜4・7・9 を実行すれば十分です（5・6 は空の DB が必要なため CI に任せてかまいません）
