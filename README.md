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
| デプロイ | Google Cloud Run + Cloud SQL |

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

# 5. 開発用DB にテーブルを作る（マイグレーションを適用する）
npm run db:migrate

# 6. 動作を確認する
npm run lint            # ESLint がエラーなく終わること
npm run typecheck       # 型エラーがないこと
npm test                # テストがすべて通ること
npx prisma validate     # 「The schema at prisma/schema.prisma is valid」と表示されること

# 7. 開発サーバーを起動する
npm run dev             # http://localhost:3000 を開くとトップページが表示される
```

開発サーバーで http://localhost:3000/dev/ui-sample を開くと、UI 部品（shadcn/ui）の見た目と動作を確認できます。http://localhost:3000/dev/api-docs では、API の OpenAPI 定義をドキュメントとして見られます（どちらも本番環境では 404 になります）。

アプリから DB を使うときは、`src/server/db/prisma.ts` の `prisma` を import します（`import { prisma } from '@/server/db/prisma'`）。接続数の上限は環境変数 `DATABASE_POOL_MAX`（既定 10）で変えられます。

Node.js のバージョンは `.nvmrc` で 22 系を指定しています。nvm を使っている場合は `nvm use` で切り替えられます。

テストデータの投入の手順は、[#14](https://github.com/yukoku/nipo/issues/14) の対応に合わせてこの節に追記します。

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

**テスト用DB ができていないとき**：`nipo_test` は、ボリュームが空の状態で初めて起動したときだけ作られます。以前に別の手順で起動していた場合は、上の「作り直し」を実行してください。

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
| `npm run db:reset` | DB を空にして、マイグレーションを最初から適用し直す（データはすべて消える） |
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
