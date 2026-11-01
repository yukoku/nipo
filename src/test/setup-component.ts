// コンポーネントテスト（jsdom）の共通設定
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// グローバル API（globals）を使わないため、描画した DOM の後片付けを明示的に登録する
afterEach(() => {
  cleanup()
})
