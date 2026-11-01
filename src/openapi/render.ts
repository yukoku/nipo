import { stringify } from 'yaml'

import { createOpenApiDocument } from '@/openapi/document'

/** 出力先（リポジトリのルートからのパス） */
export const OPENAPI_OUTPUT_PATH = 'docs/openapi.yaml'

const HEADER = [
  '# 営業日報システム API の OpenAPI 定義',
  '# このファイルは `npm run openapi:generate` で生成する。手で編集しない（定義元：src/openapi/・src/schemas/）',
  '',
].join('\n')

/** docs/openapi.yaml の内容を作る */
export function renderOpenApiYaml(): string {
  // lineWidth: 0 で長い説明文を折り返さない（差分を読みやすくするため）
  return HEADER + stringify(createOpenApiDocument(), { lineWidth: 0 })
}
