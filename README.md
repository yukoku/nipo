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
| Docker | Docker Compose が使えるもの | ローカルの PostgreSQL（[#7](https://github.com/yukoku/nipo/issues/7) で導入予定） |

## セットアップ

```bash
# 1. リポジトリを取得する
git clone git@github.com:yukoku/nipo.git
cd nipo

# 2. パッケージをインストールする
npm ci

# 3. 環境変数ファイルを作る（DATABASE_URL を自分の環境に合わせて書き換える）
cp .env.example .env

# 4. 動作を確認する
npm run lint            # ESLint がエラーなく終わること
npm run typecheck       # 型エラーがないこと
npm test                # テストがすべて通ること
npx prisma validate     # 「The schema at prisma/schema.prisma is valid」と表示されること

# 5. 開発サーバーを起動する
npm run dev             # http://localhost:3000 を開くとトップページが表示される
```

開発サーバーで http://localhost:3000/dev/ui-sample を開くと、UI 部品（shadcn/ui）の見た目と動作を確認できます（本番環境では 404 になります）。

`npx prisma validate` は DB に接続しないため、DB を用意していなくても `.env` があれば実行できます。

Node.js のバージョンは `.nvmrc` で 22 系を指定しています。nvm を使っている場合は `nvm use` で切り替えられます。

ローカル DB の起動、マイグレーション、開発サーバーの起動手順は、各 Issue の対応に合わせてこの節に追記します。

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

今後、次のコマンドを追加する予定です。

| コマンド | 内容 | 追加する Issue |
|---|---|---|
| `npm run db:migrate` / `db:deploy` / `db:reset` / `db:studio` | Prisma のマイグレーション・DB 操作 | [#8](https://github.com/yukoku/nipo/issues/8) |
| `npm run openapi:generate` | Zod スキーマから OpenAPI 定義を出力 | [#11](https://github.com/yukoku/nipo/issues/11) |

## ディレクトリ構成

```
.
├── src/
│   ├── app/              # 画面（App Router）と API（app/api/v1/）
│   ├── components/ui/    # shadcn/ui の部品（npx shadcn add で生成）
│   └── lib/utils.ts      # cn()（クラス名の結合）
├── components.json       # shadcn/ui の設定
├── docs/                 # 仕様書
├── prisma/
│   └── schema.prisma     # DB スキーマ
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
