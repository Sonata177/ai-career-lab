import type { AssessmentResult } from '../types/assessment'

/**
 * 带重试的评估结果获取（纯逻辑，不操作 Zustand / 导航 / Loading）。
 *
 * 语义（与 ChatPage 现有流程保持一致）：
 * - 最多尝试 maxAttempts 次（如 2 = 首次请求 + 1 次重试）
 * - 每次尝试 = requestOnce(prompt) -> parse(raw)
 * - 解析/校验失败（parse 返回 null）→ 继续下一次尝试
 * - 请求本身失败（requestOnce 抛错）→ 立即终止，不重试
 * - 任一次成功立即返回结果；全部失败返回 null
 *
 * @param requestOnce  单次请求函数（如包装 streamChatCompletion 的 Promise 版本）
 * @param parse        解析+校验函数（成功返回 AssessmentResult，失败返回 null）
 * @param prompt       请求使用的提示词（每次尝试相同）
 * @param maxAttempts  总尝试次数上限
 * @param onAttemptFail 每次尝试失败的钩子：(attempt, error) => void，
 *                      error 为 null 表示请求成功但解析/校验失败，
 *                      否则为请求抛出的异常。留给调用方打日志，本函数不打印。
 */
export async function runAssessmentWithRetry(
  requestOnce: (prompt: string) => Promise<string>,
  parse: (raw: string) => AssessmentResult | null,
  prompt: string,
  maxAttempts: number,
  onAttemptFail?: (attempt: number, error: unknown) => void
): Promise<AssessmentResult | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: string
    try {
      raw = await requestOnce(prompt)
    } catch (err) {
      // 请求失败：立即终止，不重试
      onAttemptFail?.(attempt, err)
      return null
    }
    const parsed = parse(raw)
    if (parsed) return parsed
    // 解析/校验失败：继续下一次尝试
    onAttemptFail?.(attempt, null)
  }
  return null
}
