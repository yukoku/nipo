/**
 * テスト用DB の接続先かを確かめる。
 *
 * APIテストはテストのたびに DB の全データを消して入れ直すため、`.env.test` の設定ミスなどで
 * 開発用DB や本番DB に向いていたら、何もせずに止める。DB 名が `_test` で終わるものだけを許可する
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL が設定されていません。テスト用DB の接続先は .env.test（または .env.test.local）に書いてください',
    )
  }

  let databaseName: string
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  } catch {
    throw new Error('DATABASE_URL の形式が正しくありません')
  }

  if (!databaseName.endsWith('_test')) {
    // 接続先にはパスワードが含まれるため、DB 名だけを表示する
    throw new Error(
      `APIテストは DB の全データを削除するため、DB 名が "_test" で終わるテスト用DB でしか実行できません（今の DB 名：${databaseName || '（なし）'}）`,
    )
  }
  return url
}
