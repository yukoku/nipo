// コンポーネントテスト（jsdom）の共通設定
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// グローバル API（globals）を使わないため、描画した DOM の後片付けを明示的に登録する
afterEach(() => {
  cleanup()
})

// jsdom にないブラウザの API を補う。Radix UI の Select・Popover などが使う（使わないので中身は空でよい）
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined
Element.prototype.scrollIntoView ??= () => undefined
