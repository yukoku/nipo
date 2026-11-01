/** API のベースパス（docs/api.md §1.1） */
export const API_BASE_PATH = '/api/v1'

/** セッション Cookie の名前（docs/api.md §1.2。発行・検証は #16 で実装する） */
export const SESSION_COOKIE_NAME = 'nipo_session'

/** 更新系 API で必須の CSRF トークンのヘッダー名（docs/api.md §1.2。検証は #17 で実装する） */
export const CSRF_HEADER_NAME = 'X-CSRF-Token'
