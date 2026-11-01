import { afterEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/server/logger'
import { setupFixedTime } from '@/test/time'

function spyOutputs() {
  return {
    stdout: vi.spyOn(process.stdout, 'write').mockReturnValue(true),
    stderr: vi.spyOn(process.stderr, 'write').mockReturnValue(true),
  }
}

function lastLine(spy: ReturnType<typeof spyOutputs>['stdout']): Record<string, unknown> {
  const line = String(spy.mock.calls.at(-1)?.[0])
  expect(line.endsWith('\n')).toBe(true)
  return JSON.parse(line) as Record<string, unknown>
}

describe('logger', () => {
  setupFixedTime()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('severity・message・time を含む 1 行の JSON を標準出力に出す', () => {
    const { stdout, stderr } = spyOutputs()

    logger.info('日報を提出しました', { report_id: 101 })

    expect(lastLine(stdout)).toEqual({
      severity: 'INFO',
      message: '日報を提出しました',
      time: '2026-10-31T01:00:00.000Z',
      report_id: 101,
    })
    expect(stderr).not.toHaveBeenCalled()
  })

  it('DEBUG は標準出力、WARNING・ERROR は標準エラー出力に出す', () => {
    const { stdout, stderr } = spyOutputs()

    logger.debug('デバッグ')
    logger.warn('警告')
    logger.error('エラー')

    expect(lastLine(stdout).severity).toBe('DEBUG')
    expect(stderr.mock.calls.map(([line]) => (JSON.parse(String(line)) as { severity: string }).severity)).toEqual([
      'WARNING',
      'ERROR',
    ])
  })

  it('fields の severity・message で本来の値を上書きしない', () => {
    const { stdout } = spyOutputs()

    logger.info('本来のメッセージ', { severity: 'ERROR', message: '上書き' })

    expect(lastLine(stdout)).toMatchObject({ severity: 'INFO', message: '本来のメッセージ' })
  })

  it('Error を渡すと、名前・メッセージと stack_trace を出す', () => {
    const { stderr } = spyOutputs()
    const error = new TypeError('想定外')

    logger.error('失敗しました', { error })

    expect(lastLine(stderr)).toMatchObject({
      error: { name: 'TypeError', message: '想定外' },
      stack_trace: error.stack,
    })
  })

  it('Error 以外の例外は文字列にして出し、スタックのない Error は stack_trace を出さない', () => {
    const { stderr } = spyOutputs()
    const noStack = new Error('スタックなし')
    noStack.stack = undefined

    logger.error('文字列の例外', { error: 'oops' })
    expect(lastLine(stderr)).toMatchObject({ error: 'oops' })

    logger.error('スタックなし', { error: noStack })
    expect(lastLine(stderr)).not.toHaveProperty('stack_trace')
  })

  it('循環参照・BigInt があっても例外にせずに出す', () => {
    const { stdout } = spyOutputs()
    const circular: Record<string, unknown> = { name: 'a' }
    circular.self = circular

    logger.info('循環', { circular, count: 10n })

    expect(lastLine(stdout)).toMatchObject({ circular: { name: 'a', self: '[Circular]' }, count: '10' })
  })
})
