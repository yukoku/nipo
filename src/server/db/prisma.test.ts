import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma Client とアダプターを差し替え、作られたタイミング・回数だけを確かめる
const { PrismaClientMock, PrismaPgMock } = vi.hoisted(() => {
  class PrismaClientMock {
    salesStaff = { count: vi.fn(async () => 3) }
    $queryRaw = vi.fn(function (this: unknown) {
      return Promise.resolve(this)
    })
    constructor(readonly options: unknown) {}
  }
  return { PrismaClientMock: vi.fn(PrismaClientMock), PrismaPgMock: vi.fn(class {}) }
})
vi.mock('@/generated/prisma/client', () => ({ PrismaClient: PrismaClientMock }))
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: PrismaPgMock }))

const DATABASE_URL = 'postgresql://nipo:nipo@localhost:55432/nipo_test'

/** モジュールを読み込み直す（モジュールの中の状態と globalThis の Client を消してから） */
async function importFresh() {
  vi.resetModules()
  delete (globalThis as { prisma?: unknown }).prisma
  return import('@/server/db/prisma')
}

describe('prisma（#67）', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', DATABASE_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as { prisma?: unknown }).prisma
  })

  it('import しただけでは Prisma Client を作らない（DATABASE_URL がなくてもよい）', async () => {
    vi.stubEnv('DATABASE_URL', '')

    const { prisma } = await importFresh()

    expect(prisma).toBeDefined()
    expect(PrismaClientMock).not.toHaveBeenCalled()
  })

  it('最初に使ったときに 1 回だけ作り、以降は同じ Client を使い回す', async () => {
    const { prisma } = await importFresh()

    expect(await prisma.salesStaff.count()).toBe(3)
    await prisma.salesStaff.count()

    expect(PrismaClientMock).toHaveBeenCalledOnce()
    expect(PrismaPgMock).toHaveBeenCalledWith(expect.objectContaining({ connectionString: DATABASE_URL }))
  })

  it('メソッドは本物の Client を this にして呼ぶ（$queryRaw のタグ付きテンプレートなど）', async () => {
    const { prisma, getPrismaClient } = await importFresh()

    expect(await prisma.$queryRaw`SELECT 1`).toBe(getPrismaClient())
  })

  it('DATABASE_URL が未設定なら、使ったときに分かりやすいエラーになる', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const { prisma } = await importFresh()

    expect(() => prisma.salesStaff).toThrow('環境変数 DATABASE_URL が設定されていません')
  })

  it('then を調べられても Client を作らない（await prisma で接続しない）', async () => {
    const { prisma } = await importFresh()

    expect((prisma as unknown as { then?: unknown }).then).toBeUndefined()
    expect(PrismaClientMock).not.toHaveBeenCalled()
  })

  it('本番以外では globalThis に保持し、モジュールを読み込み直しても同じ Client を使う（ホットリロード対策）', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const first = (await importFresh()).getPrismaClient()

    // globalThis は消さずに、モジュールだけ読み込み直す
    vi.resetModules()
    const second = (await import('@/server/db/prisma')).getPrismaClient()

    expect(second).toBe(first)
    expect(PrismaClientMock).toHaveBeenCalledOnce()
  })

  it('本番では globalThis に保持しない', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { getPrismaClient } = await importFresh()

    getPrismaClient()

    expect((globalThis as { prisma?: unknown }).prisma).toBeUndefined()
  })
})
