import { test, expect } from '@playwright/test'
import { ASSESSMENT_RESULT } from './helpers'

/** 构造列表项（GET /api/experiences 返回的轻量字段，不含 messages/result） */
function makeListItem(id: string, jobTitle: string, overallScore: number, daysAgo = 1) {
  return {
    id,
    jobTitle,
    completedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    overallScore,
    jobFitPercentage: 82,
  }
}

/** 构造详情（GET /api/experiences/:id 返回：对话 + 报告） */
function makeDetail(item: ReturnType<typeof makeListItem>) {
  return {
    ...item,
    finishedAt: item.completedAt,
    scenario: {
      jobId: 'operations-intern',
      jobTitle: item.jobTitle,
      background: '背景',
      userIdentity: '身份',
      phases: [],
    },
    messages: [{ id: 'm1', role: 'user', content: '主管好', timestamp: 1 }],
    colleagueMessages: [],
    result: ASSESSMENT_RESULT,
  }
}

/** 构造带定制维度分数的评估结果（对比用例用） */
function makeResult(overallScore: number, dimScores: Record<string, number> = {}) {
  return {
    ...ASSESSMENT_RESULT,
    overallScore,
    dimensions: ASSESSMENT_RESULT.dimensions.map((d) => ({
      ...d,
      score: dimScores[d.name] ?? d.score,
    })),
  }
}

/** 列表接口 URL：可带查询串（glob 末尾不能匹配 ?query，需用正则） */
const LIST_URL = /\/api\/experiences(\?.*)?$/

/** 拦截 GET /api/experiences 列表 */
function mockList(page: import('@playwright/test').Page, items: unknown[], status = 200) {
  return page.route(LIST_URL, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ items }),
    })
  )
}

/** 拦截 GET /api/experiences/:id 详情（按 id 查表；未命中回 404） */
function mockDetail(
  page: import('@playwright/test').Page,
  details: Record<string, unknown>,
  status = 200
) {
  return page.route('**/api/experiences/*', (route) => {
    const id = route.request().url().split('/').pop() ?? ''
    const detail = details[id]
    if (!detail) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Experience not found' }),
      })
    }
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    })
  })
}

/** 拦截 GET /api/experiences 列表（可按 query 挑选不同数据，模拟后端筛选） */
function mockListWithQuery(
  page: import('@playwright/test').Page,
  pick: (url: URL) => unknown[],
  status = 200
) {
  return page.route(LIST_URL, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ items: pick(new URL(route.request().url())) }),
    })
  )
}

test('无历史记录：显示空状态，可通过"开始岗位体验"进入选岗页', async ({ page }) => {
  await mockList(page, [])
  await mockDetail(page, {})

  await page.goto('/history')

  await expect(page.getByText('还没有评估记录')).toBeVisible()
  await page.getByRole('button', { name: '开始岗位体验' }).click()
  await expect(page).toHaveURL(/\/select$/)
})

test('有历史记录（云端数据）：展示岗位名称、完成时间、综合评分与岗位适配度', async ({ page }) => {
  await mockList(page, [
    makeListItem('r1', '运营实习生的一天', 78),
    makeListItem('r2', '销售代表的一天', 88),
  ])
  await mockDetail(page, {})

  await page.goto('/history')

  await expect(page.getByText('共 2 条评估记录')).toBeVisible()
  await expect(page.locator('.history-card')).toHaveCount(2)
  await expect(page.getByText('运营实习生的一天')).toBeVisible()
  await expect(page.getByText('销售代表的一天')).toBeVisible()
  await expect(page.getByText('78', { exact: true })).toBeVisible()
  await expect(page.getByText('88', { exact: true })).toBeVisible()
  // 完成时间已渲染（日期非空）
  await expect(page.locator('.history-card-date').first()).not.toHaveText('')
})

test('不填条件：请求不带查询参数，列出全部', async ({ page }) => {
  const urls: string[] = []
  await page.route(LIST_URL, (route) => {
    urls.push(route.request().url())
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [makeListItem('r1', '运营实习生的一天', 78)] }),
    })
  })
  await mockDetail(page, {})

  await page.goto('/history')
  await expect(page.locator('.history-card')).toHaveCount(1)
  expect(urls.every((u) => !u.includes('?'))).toBe(true)
})

test('按岗位筛选：mock 带 query 的 GET，列表只剩匹配项', async ({ page }) => {
  const all = [
    makeListItem('r1', '运营实习生的一天', 78),
    makeListItem('r2', '销售代表的一天', 88),
  ]
  await mockListWithQuery(page, (url) => {
    const q = url.searchParams.get('jobTitle')
    return q === '运营' ? [all[0]] : all
  })
  await mockDetail(page, {})

  await page.goto('/history')
  await expect(page.locator('.history-card')).toHaveCount(2)

  // 输入岗位名称，点「筛选」后才发请求
  await page.getByLabel('按岗位名称筛选').fill('运营')
  await expect(page.locator('.history-card')).toHaveCount(2) // 未点筛选：数据不变
  await page.getByRole('button', { name: '筛选' }).click()

  await expect(page.locator('.history-card')).toHaveCount(1)
  await expect(page.getByText('运营实习生的一天')).toBeVisible()
  await expect(page.getByText('销售代表的一天')).toBeHidden()
})

test('时间范围外：显示「没有符合条件的记录」（空状态，不是加载失败），可清除筛选恢复', async ({ page }) => {
  const item = makeListItem('r1', '运营实习生的一天', 78)
  await mockListWithQuery(page, (url) => {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    // 模拟：带 from/to 的时间范围查不到数据
    return from && to ? [] : [item]
  })
  await mockDetail(page, {})

  await page.goto('/history')
  await expect(page.locator('.history-card')).toHaveCount(1)

  // 选择一个必然查不到的时间范围
  const pastFrom = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10)
  const pastTo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
  await page.getByLabel('开始日期').fill(pastFrom)
  await page.getByLabel('结束日期').fill(pastTo)
  await page.getByRole('button', { name: '筛选' }).click()

  await expect(page.getByText('没有符合条件的记录')).toBeVisible()
  await expect(page.getByText('历史记录加载失败')).toBeHidden()

  // 清除筛选后恢复全部
  await page.getByRole('button', { name: '清除筛选' }).click()
  await expect(page.locator('.history-card')).toHaveCount(1)
})

test('开始日期晚于结束日期：前端拦截提示，不发请求', async ({ page }) => {
  let requestCount = 0
  await page.route(LIST_URL, (route) => {
    requestCount++
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [makeListItem('r1', '运营实习生的一天', 78)] }),
    })
  })
  await mockDetail(page, {})

  await page.goto('/history')
  await expect(page.locator('.history-card')).toHaveCount(1)
  const before = requestCount

  await page.getByLabel('开始日期').fill('2026-08-10')
  await page.getByLabel('结束日期').fill('2026-08-01')
  await page.getByRole('button', { name: '筛选' }).click()

  await expect(page.getByText('开始日期不能晚于结束日期')).toBeVisible()
  expect(requestCount).toBe(before) // 没有发出新请求
  // 数据未被破坏：列表仍在
  await expect(page.locator('.history-card')).toHaveCount(1)
})

test('查看报告：按 URL id 调详情接口，展示岗位名称、综合评分与七维结果', async ({ page }) => {
  const item = makeListItem('r-history-1', '运营实习生的一天', 78)
  await mockList(page, [item])
  await mockDetail(page, { 'r-history-1': makeDetail(item) })

  await page.goto('/history')
  await page.getByRole('button', { name: '查看报告' }).click()

  await expect(page).toHaveURL(/\/history\/r-history-1$/)

  // 岗位名称
  await expect(page.getByRole('heading', { name: '运营实习生的一天' })).toBeVisible()

  // 综合评分与岗位适配度（限定在分数区，避免与维度分数撞车）
  const scoresBlock = page.locator('.history-detail-scores')
  await expect(scoresBlock).toContainText('78')
  await expect(scoresBlock).toContainText('82%')

  // 七维结果：维度名与分数均展示
  for (const d of ASSESSMENT_RESULT.dimensions) {
    await expect(page.getByText(d.name, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('能力维度评估')).toBeVisible()

  // 每个维度都带 evidence 证据文本（与正式结果页一致）
  await expect(page.locator('.history-dim-evidence')).toHaveCount(7)
  await expect(page.locator('.history-dim-evidence').first()).toHaveText('模拟评估证据。')
})

test('详情接口 404：显示"报告不存在"与返回入口', async ({ page }) => {
  await mockDetail(page, {})

  await page.goto('/history/nonexistent-id')

  await expect(page.getByRole('heading', { name: '报告不存在' })).toBeVisible()
  await page.getByRole('button', { name: '返回历史记录' }).click()
  await expect(page).toHaveURL(/\/history$/)
})

test('列表接口 503（后端未配置库）：提示而不是白屏，可重试', async ({ page }) => {
  await mockList(page, [], 503)
  await mockDetail(page, {})

  await page.goto('/history')

  await expect(page.getByText('历史记录加载失败')).toBeVisible()
  await expect(page.getByText('历史服务未配置数据库')).toBeVisible()
  const retryBtn = page.getByRole('button', { name: '重试' })
  await expect(retryBtn).toBeVisible()

  // 重试成功：恢复正常列表（再次拦截改为 200 后刷新重试 → 直接重新 mock）
  await mockList(page, [makeListItem('r1', '运营实习生的一天', 78)])
  await retryBtn.click()
  await expect(page.getByText('运营实习生的一天')).toBeVisible()
})

test('详情接口 503：提示错误并可重试，不展示空白页', async ({ page }) => {
  const item = makeListItem('r-history-1', '运营实习生的一天', 78)
  await mockDetail(page, { 'r-history-1': makeDetail(item) }, 503)

  await page.goto('/history/r-history-1')

  await expect(page.getByRole('heading', { name: '报告加载失败' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回历史记录' })).toBeVisible()
})

test('移动端窄屏：历史卡片纵向排列（媒体查询生效）', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockList(page, [makeListItem('r1', '运营实习生的一天', 78)])
  await mockDetail(page, {})

  await page.goto('/history')

  const card = page.locator('.history-card')
  await expect(card).toBeVisible()
  // 卡片 flex-direction 应为 column（横向排列会溢出窄屏）
  const flexDirection = await card.evaluate((el) => getComputedStyle(el).flexDirection)
  expect(flexDirection).toBe('column')
  // 查看报告按钮通栏：宽度等于卡片内容盒（100% 相对内容盒，需扣除内边距）
  const cardContentWidth = await card.evaluate((el) => {
    const style = getComputedStyle(el)
    return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  })
  const btnWidth = await page.locator('.history-view-btn').evaluate(
    (el) => el.getBoundingClientRect().width
  )
  expect(btnWidth).toBeCloseTo(cardContentWidth, 0)
})

test('清空历史：按钮禁用（无删除接口），并注明云端记录仍保留', async ({ page }) => {
  await mockList(page, [makeListItem('r1', '运营实习生的一天', 78)])
  await mockDetail(page, {})

  await page.goto('/history')
  await expect(page.locator('.history-card')).toHaveCount(1)

  const clearBtn = page.getByRole('button', { name: '清空历史' })
  await expect(clearBtn).toBeDisabled()
  // 注明云端记录还在（未做删除接口，避免用户误以为已删）
  await expect(page.getByText('云端记录仍保留')).toBeVisible()
  // 记录仍在列表里
  await expect(page.getByText('运营实习生的一天')).toBeVisible()
})

test('首页导航提供"历史记录"入口', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: '历史记录' }).click()
  await expect(page).toHaveURL(/\/history$/)
})

test('少于两条记录：对比报告按钮禁用', async ({ page }) => {
  await mockList(page, [makeListItem('r1', '运营实习生的一天', 78)])
  await mockDetail(page, {})

  await page.goto('/history')
  await expect(page.getByRole('button', { name: '对比报告' })).toBeDisabled()
})

test('对比报告：勾选两条后按云端详情对比，分数与提升/下降不变', async ({ page }) => {
  // 旧记录：2 天前（默认分数：沟通表达 85、数据敏感度 65）；新记录：1 天前（95/50，总分 88）
  const item1 = makeListItem('r1', '运营实习生的一天', 78, 2)
  const item2 = makeListItem('r2', '销售代表的一天', 88, 1)
  await mockList(page, [item1, item2])
  await mockDetail(page, {
    r1: { ...makeDetail(item1), result: makeResult(78) },
    r2: { ...makeDetail(item2), result: makeResult(88, { 沟通表达: 95, 数据敏感度: 50 }) },
  })

  await page.goto('/history')

  const compareBtn = page.getByRole('button', { name: '对比报告' })
  await expect(compareBtn).toBeDisabled()

  // 勾选一条仍禁用，勾选两条启用
  await page.getByRole('checkbox', { name: '选择 运营实习生的一天' }).check()
  await expect(compareBtn).toBeDisabled()
  await page.getByRole('checkbox', { name: '选择 销售代表的一天' }).check()
  await expect(compareBtn).toBeEnabled()

  await compareBtn.click()

  // 对比页：URL 携带两条 id（逗号经 encodeURIComponent 编码为 %2C），展示两次评分与差值
  await expect(page).toHaveURL(/\/history\/compare\?ids=r1%2Cr2$/)
  const overall = page.locator('.compare-overall')
  await expect(overall).toContainText('综合评分：78 → 88')
  await expect(overall).toContainText('（+10）')
  await expect(overall).toContainText('岗位适配度：82% → 82%')

  // 维度趋势：提升 / 下降 / 不变
  const dimRow = (name: string) => page.locator('.compare-dim-table tbody tr', { hasText: name })
  await expect(dimRow('沟通表达')).toContainText('提升')
  await expect(dimRow('数据敏感度')).toContainText('下降')
  await expect(dimRow('执行落地')).toContainText('不变')
  // 两次分数列
  await expect(dimRow('沟通表达')).toContainText('85')
  await expect(dimRow('沟通表达')).toContainText('95')
  await expect(dimRow('数据敏感度')).toContainText('65')
  await expect(dimRow('数据敏感度')).toContainText('50')
})

test('对比的前后次按 completedAt 排序，不按 URL 里 id 的顺序', async ({ page }) => {
  const item1 = makeListItem('r1', '运营实习生的一天', 78, 2)
  const item2 = makeListItem('r2', '销售代表的一天', 88, 1)
  await mockDetail(page, {
    r1: { ...makeDetail(item1), result: makeResult(78) },
    r2: { ...makeDetail(item2), result: makeResult(88, { 沟通表达: 95, 数据敏感度: 50 }) },
  })

  // URL 顺序 r2 在前（r2 实际更新）：前后次仍按 completedAt 排序
  await page.goto('/history/compare?ids=r2,r1')
  await expect(page.locator('.compare-overall')).toContainText('综合评分：78 → 88')
  // 前次卡片是较早的运营实习生，后次是较新的销售代表
  await expect(page.locator('.compare-card').first()).toContainText('运营实习生的一天')
  await expect(page.locator('.compare-card').last()).toContainText('销售代表的一天')
})

test('对比中一条 404：显示「无法对比」', async ({ page }) => {
  const item1 = makeListItem('r1', '运营实习生的一天', 78)
  await mockDetail(page, { r1: { ...makeDetail(item1), result: makeResult(78) } }) // r2 未命中 → 404

  await page.goto('/history/compare?ids=r1,r2')

  await expect(page.getByRole('heading', { name: '无法对比' })).toBeVisible()
})

test('对比详情加载失败（503）：显示加载失败与重试，不展示空白页', async ({ page }) => {
  const item1 = makeListItem('r1', '运营实习生的一天', 78)
  const item2 = makeListItem('r2', '销售代表的一天', 88, 1)
  await mockDetail(page, { r1: makeDetail(item1), r2: makeDetail(item2) }, 503)

  await page.goto('/history/compare?ids=r1,r2')

  await expect(page.getByRole('heading', { name: '对比加载失败' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回历史记录' })).toBeVisible()
})

test('最多选择两条；取消选择后对比按钮回到禁用', async ({ page }) => {
  await mockList(page, [
    makeListItem('r1', '运营实习生的一天', 78),
    makeListItem('r2', '销售代表的一天', 88),
    makeListItem('r3', '产品助理的一天', 65),
  ])
  await mockDetail(page, {})

  await page.goto('/history')
  const compareBtn = page.getByRole('button', { name: '对比报告' })

  await page.getByRole('checkbox', { name: '选择 运营实习生的一天' }).check()
  await page.getByRole('checkbox', { name: '选择 销售代表的一天' }).check()
  await expect(compareBtn).toBeEnabled()

  // 已选两条时，第三条复选框禁用（最多两条）
  await expect(page.getByRole('checkbox', { name: '选择 产品助理的一天' })).toBeDisabled()

  // 取消一条 → 按钮回到禁用
  await page.getByRole('checkbox', { name: '选择 运营实习生的一天' }).uncheck()
  await expect(compareBtn).toBeDisabled()
})

test('两条 id 相同（ids=r1,r1）：显示"无法对比"而非重复对比同一记录', async ({ page }) => {
  const item = makeListItem('r1', '运营实习生的一天', 78)
  await mockDetail(page, { r1: makeDetail(item) })

  await page.goto('/history/compare?ids=r1,r1')

  await expect(page.getByRole('heading', { name: '无法对比' })).toBeVisible()
  await page.getByRole('button', { name: '返回历史记录' }).click()
  await expect(page).toHaveURL(/\/history$/)
})
