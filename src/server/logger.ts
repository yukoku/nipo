import 'server-only'

/** Cloud Logging の重大度（https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity） */
export type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

export type LogFields = Record<string, unknown>

/**
 * 構造化ログを 1 行の JSON で出す。
 *
 * Cloud Run は標準出力・標準エラー出力の JSON を解析し、`severity` を重大度、`message` を本文として Cloud Logging に記録する。
 * `error` に Error を渡すと、スタックトレースを `stack_trace` に入れる（Error Reporting がエラーとして集計する）
 *
 * @example
 * logger.info('日報を提出しました', { report_id: 101 })
 * logger.error('想定外のエラー', { error, method: 'POST', path: '/api/v1/reports' })
 */
export const logger = {
  debug: (message: string, fields?: LogFields) => writeLog('DEBUG', message, fields),
  info: (message: string, fields?: LogFields) => writeLog('INFO', message, fields),
  warn: (message: string, fields?: LogFields) => writeLog('WARNING', message, fields),
  error: (message: string, fields?: LogFields) => writeLog('ERROR', message, fields),
}

export function writeLog(severity: LogSeverity, message: string, fields: LogFields = {}): void {
  const { error, ...rest } = fields
  const entry = {
    ...rest,
    severity,
    message,
    time: new Date().toISOString(),
    ...(error !== undefined && serializeError(error)),
  }
  const line = `${safeStringify(entry)}\n`
  if (severity === 'ERROR' || severity === 'WARNING') {
    process.stderr.write(line)
  } else {
    process.stdout.write(line)
  }
}

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      error: { name: error.name, message: error.message },
      ...(error.stack !== undefined && { stack_trace: error.stack }),
    }
  }
  return { error: String(error) }
}

/** 循環参照や BigInt があっても例外にせず、ログを出す */
function safeStringify(entry: LogFields): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(entry, (_key, value: unknown) => {
    if (typeof value === 'bigint') {
      return value.toString()
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]'
      }
      seen.add(value)
    }
    return value
  })
}
