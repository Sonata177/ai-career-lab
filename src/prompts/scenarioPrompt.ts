export function buildScenarioGenerationPrompt(jdText: string): string {
  return `你是一个专业的职场模拟场景设计师。请根据以下岗位描述（JD），生成一份沉浸式岗位体验场景配置。

【岗位描述】
${jdText}

【要求】
生成一个"该岗位实习生的三天工作"沉浸式模拟场景，共7个任务节点：
- 第1天（day=1）：3个任务节点（上午布置任务、下午核心执行、傍晚汇报总结）
- 第2天（day=2）：2个任务节点（上午、下午各一个，体现进阶或协作）
- 第3天（day=3）：2个任务节点（上午、下午各一个，体现综合或收尾）
每个任务节点需要设计一个AI扮演的角色（如主管、同事、客户等）与用户互动。
天数越往后，任务难度和综合性应逐步提升，体现成长曲线。

请严格按以下JSON格式返回（不要包含其他内容）：
{
  "jobId": "custom-xxx",
  "jobTitle": "岗位名称（简短，如：前端开发实习生）",
  "background": "公司和部门背景描述（50字以内）",
  "userIdentity": "用户的身份设定（30字以内）",
  "phases": [
    {
      "id": "day1-task1",
      "day": 1,
      "time": "09:00",
      "role": "角色名·称呼",
      "roleDescription": "角色简介（15字以内）",
      "title": "任务标题（4字以内）",
      "description": "任务描述（15字以内）",
      "messageThreshold": 3,
      "scoringDimensions": ["维度1", "维度2", "维度3"],
      "systemPrompt": "详细的角色扮演指令（包含：你扮演谁、场景是什么、你要做什么、注意事项，控制在150字以内）"
    },
    {
      "id": "day1-task2",
      "day": 1,
      "time": "14:00",
      "role": "角色名·称呼",
      "roleDescription": "角色简介",
      "title": "任务标题",
      "description": "任务描述",
      "messageThreshold": 3,
      "scoringDimensions": ["维度1", "维度2", "维度3"],
      "systemPrompt": "详细的角色扮演指令"
    },
    {
      "id": "day1-task3",
      "day": 1,
      "time": "17:00",
      "role": "角色名·称呼",
      "roleDescription": "角色简介",
      "title": "任务标题",
      "description": "任务描述",
      "messageThreshold": 3,
      "scoringDimensions": ["维度1", "维度2", "维度3"],
      "systemPrompt": "详细的角色扮演指令"
    },
    {
      "id": "day2-task1",
      "day": 2,
      "time": "09:30",
      "role": "角色名·称呼",
      "roleDescription": "角色简介",
      "title": "任务标题",
      "description": "任务描述",
      "messageThreshold": 3,
      "scoringDimensions": ["维度1", "维度2", "维度3"],
      "systemPrompt": "详细的角色扮演指令"
    },
    {
      "id": "day2-task2",
      "day": 2,
      "time": "15:00",
      "role": "角色名·称呼",
      "roleDescription": "角色简介",
      "title": "任务标题",
      "description": "任务描述",
      "messageThreshold": 3,
      "scoringDimensions": ["维度1", "维度2", "维度3"],
      "systemPrompt": "详细的角色扮演指令"
    },
    {
      "id": "day3-task1",
      "day": 3,
      "time": "10:00",
      "role": "角色名·称呼",
      "roleDescription": "角色简介",
      "title": "任务标题",
      "description": "任务描述",
      "messageThreshold": 3,
      "scoringDimensions": ["维度1", "维度2", "维度3"],
      "systemPrompt": "详细的角色扮演指令"
    },
    {
      "id": "day3-task2",
      "day": 3,
      "time": "16:00",
      "role": "角色名·称呼",
      "roleDescription": "角色简介",
      "title": "任务标题",
      "description": "任务描述",
      "messageThreshold": 3,
      "scoringDimensions": ["维度1", "维度2", "维度3"],
      "systemPrompt": "详细的角色扮演指令"
    }
  ]
}

【设计原则】
- 第1天：上午主管布置工作，下午核心执行（与同事/客户/用户互动），傍晚汇报或总结
- 第2天：在第1天基础上推进，可引入跨部门协作、新问题或更复杂的任务
- 第3天：综合性任务或收尾，体现独立处理能力，可包含复盘、汇报
- 不同任务尽量安排不同角色出场，让用户体验完整的"职场人际网络"
- systemPrompt要具体，包含角色性格、说话风格、具体要做的事
- 每个角色的回复要求控制在60-80字以内
- 场景要贴近真实职场，不要太理想化
- 务必返回完整的7个任务节点（day1×3 + day2×2 + day3×2）`
}
