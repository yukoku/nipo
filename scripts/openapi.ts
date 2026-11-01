/**
 * OpenAPI 定義（docs/openapi.yaml）を生成・確認する。
 *
 *   npm run openapi:generate  … 生成して上書きする
 *   npm run openapi:check     … 生成した内容とファイルが一致するか確認する（古ければ終了コード 1）
 */
import { readFile, writeFile } from 'node:fs/promises'

import { OPENAPI_OUTPUT_PATH, renderOpenApiYaml } from '@/openapi/render'

const mode = process.argv[2]
const yaml = renderOpenApiYaml()

if (mode === 'generate') {
  await writeFile(OPENAPI_OUTPUT_PATH, yaml)
  process.stdout.write(`${OPENAPI_OUTPUT_PATH} を生成しました\n`)
} else if (mode === 'check') {
  const current = await readFile(OPENAPI_OUTPUT_PATH, 'utf8').catch(() => '')
  if (current !== yaml) {
    process.stderr.write(`${OPENAPI_OUTPUT_PATH} が古くなっています。npm run openapi:generate を実行してコミットしてください\n`)
    process.exit(1)
  }
  process.stdout.write(`${OPENAPI_OUTPUT_PATH} は最新です\n`)
} else {
  process.stderr.write('使い方：tsx scripts/openapi.ts generate|check\n')
  process.exit(2)
}
