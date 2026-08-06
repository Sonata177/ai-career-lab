import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';


export async function ChatCompletionTest() {
    const variant = process.argv[3];
    if (!variant || !['high', 'mid', 'low'].includes(variant)) {
      console.error('❌ 错误：必须指定 variant 参数，且只能为 high、mid 或 low');
      console.error('用法示例：node run-once.mjs 0.8 low');
      process.exit(1);
    }
    const fileName = `./assessment-sample-${variant}.json`;
    const fileUrl = new URL(fileName, import.meta.url);
    const argument = process.argv[2];
    const temperature = argument === undefined ? undefined : Number(argument);

    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
        throw new Error('temperature 必须是 0 到 2 之间的数字')
    }
    const fileContent = await readFile(fileUrl, { encoding: 'utf8' });
    const payload = JSON.parse(fileContent);
    payload.temperature = temperature;

    const response = await fetch('http://localhost:3001/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
     })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    return response
}

try{
  const response = await ChatCompletionTest();
  
  // 判断响应类型，决定输出方式
  const contentType = response.headers.get('content-type') || '';
  
  if (contentType.includes('text/event-stream')) {
    // ---- SSE 流式输出（实时逐块打印） ----
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // 将二进制块转为文本
      buffer += decoder.decode(value, { stream: true });
      
      // 按行分割并输出（SSE 通常以 \n\n 分隔事件）
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留不完整的行
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            // 根据你的实际数据结构提取内容（这里示例取 delta）
            const content = json.choices?.[0]?.delta?.content || '';
            process.stdout.write(content); // 实时打印
          } catch {
            // 如果非 JSON，直接打印原始行
            console.log(line);
          }
        } else if (line.trim()) {
          // 非 data 行（如 event: 等）可按需打印
          // console.log(line);
        }
      }
    }
    console.log('\n'); // 结束时换行
  } else {
    // ---- 普通 JSON 响应（一次性输出） ----
    const text = await response.text();
    console.log(text);
  }
}catch (error) {
  console.error('❌ 错误：', error.message);
  process.exit(1);
}
