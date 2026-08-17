import { describe, it, expect, vi } from 'vitest'
import { runAssessmentWithRetry } from './assessmentRetry'
import { parseAssessmentResult } from './assessmentParsing'
import { createValidAssessment } from '../test/assessmentFixture'

describe('runAssessmentWithRetry（重试流程）', () => {
  it('第一次返回无效结果、第二次返回有效结果：请求恰好调用两次并返回有效结果', async () => {
    const valid = createValidAssessment()
    const requestOnce = vi.fn()
      .mockResolvedValueOnce('这不是合法 JSON 输出')          // 第 1 次：解析/校验失败
      .mockResolvedValueOnce(JSON.stringify(valid))           // 第 2 次：合法结果

    const result = await runAssessmentWithRetry(
      requestOnce, parseAssessmentResult, '评估提示词', 2
    )

    expect(requestOnce).toHaveBeenCalledTimes(2)
    expect(result).toEqual(valid)
  })

  it('两次都返回无效结果：请求恰好调用两次并返回 null', async () => {
    const requestOnce = vi.fn()
      .mockResolvedValueOnce('第一次：没有 JSON')
      .mockResolvedValueOnce('第二次：还是没有 JSON')

    const result = await runAssessmentWithRetry(
      requestOnce, parseAssessmentResult, '评估提示词', 2
    )

    expect(requestOnce).toHaveBeenCalledTimes(2)
    expect(result).toBeNull()
  })

  it('第一次就返回有效结果：请求只调用一次', async () => {
    const valid = createValidAssessment()
    const requestOnce = vi.fn().mockResolvedValue(JSON.stringify(valid))

    const result = await runAssessmentWithRetry(
      requestOnce, parseAssessmentResult, '评估提示词', 2
    )

    expect(requestOnce).toHaveBeenCalledTimes(1)
    expect(result).toEqual(valid)
  })

  it('请求本身失败：立即终止不重试，请求只调用一次并返回 null', async () => {
    const requestOnce = vi.fn().mockRejectedValue(new Error('网络中断'))

    const result = await runAssessmentWithRetry(
      requestOnce, parseAssessmentResult, '评估提示词', 2
    )

    expect(requestOnce).toHaveBeenCalledTimes(1)
    expect(result).toBeNull()
  })

  it('失败钩子按 attempt 顺序收到回调（解析失败 error 为 null，请求失败为异常）', async () => {
    const valid = createValidAssessment()
    const requestOnce = vi.fn()
      .mockResolvedValueOnce('第一次：非法输出')              // 第 1 次：解析失败
      .mockResolvedValueOnce('第二次：还是非法输出')          // 第 2 次：解析失败
      .mockResolvedValueOnce(JSON.stringify(valid))           // 第 3 次：合法结果

    const failures: Array<{ attempt: number; error: unknown }> = []
    const onAttemptFail = (attempt: number, error: unknown) => {
      failures.push({ attempt, error })
    }

    const result = await runAssessmentWithRetry(
      requestOnce, parseAssessmentResult, '评估提示词', 3, onAttemptFail
    )

    expect(result).toEqual(valid)
    expect(failures).toHaveLength(2)
    expect(failures[0]).toEqual({ attempt: 1, error: null })
    expect(failures[1]).toEqual({ attempt: 2, error: null })
    expect(requestOnce).toHaveBeenCalledTimes(3)
  })
})
