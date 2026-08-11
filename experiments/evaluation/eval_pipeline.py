import sys
import json
from pathlib import Path
import requests  # 第三方库，需先执行 pip install requests

# 脚本所在目录的项目根目录（根据你的实际结构调整）
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# 退出码定义
EXIT_SUCCESS = 0
EXIT_USAGE = 1          # 参数错误
EXIT_NOFILE = 2         # 文件不存在
EXIT_STRUCT_ERR = 3     # JSON 结构错误
EXIT_JSON_DECODE = 4    # JSON 解析失败
EXIT_IO_ERR = 5         # 文件 I/O 错误
EXIT_NETWORK_ERR = 6    # 网络请求失败（超时、连接错误等）
EXIT_HTTP_ERR = 7       # HTTP 状态码非 2xx
EXIT_RESPONSE_ERR = 8   # 响应格式不符（如缺少 choices）

# 目标 API 地址
API_URL = "http://localhost:3001/api/chat/completions"
REQUEST_TIMEOUT = 240  # 秒

def main():
    # ----- 参数检查 -----
    if len(sys.argv) != 2:
        print("用法: python eval_pipeline.py <相对项目根目录的JSON路径>", file=sys.stderr)
        sys.exit(EXIT_USAGE)

    user_input = sys.argv[1]
    input_path = Path(user_input)
    json_path = input_path if input_path.is_absolute() else BASE_DIR / user_input

    # ----- 文件检查 -----
    if not json_path.is_file():
        print(f"错误: 文件不存在或不是普通文件 -> {json_path}", file=sys.stderr)
        sys.exit(EXIT_NOFILE)

    # ----- 读取并解析 JSON -----
    try:
        with json_path.open('r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"JSON解析失败: {e}", file=sys.stderr)
        sys.exit(EXIT_JSON_DECODE)
    except OSError as e:
        print(f"读取文件时发生错误: {e}", file=sys.stderr)
        sys.exit(EXIT_IO_ERR)

    # ----- 结构校验（必须为 dict，且 messages 存在且为非空列表） -----
    if not isinstance(data, dict):
        print("错误: JSON 顶层必须是字典 (dict)，而不是列表或其它类型", file=sys.stderr)
        sys.exit(EXIT_STRUCT_ERR)

    if "messages" not in data:
        print("错误: JSON 缺少 'messages' 字段", file=sys.stderr)
        sys.exit(EXIT_STRUCT_ERR)

    messages = data["messages"]
    if not isinstance(messages, list):
        print("错误: 'messages' 必须是列表 (list)", file=sys.stderr)
        sys.exit(EXIT_STRUCT_ERR)

    if len(messages) == 0:
        print("错误: 'messages' 列表不能为空", file=sys.stderr)
        sys.exit(EXIT_STRUCT_ERR)

    # ----- 结构完全正确，打印信息 -----
    print(f"成功加载: {json_path}")
    model = data.get("model", "未指定")
    temp = data.get("temperature", "未指定")
    max_tokens = data.get("max_tokens", "未指定")
    msg_count = len(messages)
    print(f"文件名: {json_path.name}, model: {model}, temperature: {temp}, "
          f"max_tokens: {max_tokens}, messages数量: {msg_count}")

    # ----- 强制 stream 为 False（确保一次返回完整响应）-----
    data["stream"] = False

    # ----- 发送 POST 请求 -----
    try:
        print(f"正在向 {API_URL} 发送请求...")
        response = requests.post(
            API_URL,
            json=data,                     # 自动序列化为 JSON 并设置 Content-Type
            timeout=REQUEST_TIMEOUT
        )
        # 检查 HTTP 状态码
        response.raise_for_status()        # 非 2xx 会抛出 HTTPError
        resquest_success = True
    except requests.exceptions.Timeout:
        print(f"错误: 请求超时（超过 {REQUEST_TIMEOUT} 秒）", file=sys.stderr)
        request_success = False
        sys.exit(EXIT_NETWORK_ERR)
    except requests.exceptions.ConnectionError:
        print(f"错误: 网络连接失败（无法连接到 {API_URL}）", file=sys.stderr)
        request_success = False
        sys.exit(EXIT_NETWORK_ERR)
    except requests.exceptions.HTTPError as e:
        print(f"HTTP 错误: {e}", file=sys.stderr)
        request_success = False
        # 可选打印响应内容
        if response.text:
            print(f"响应内容: {response.text[:200]}", file=sys.stderr)
        sys.exit(EXIT_HTTP_ERR)
    except requests.exceptions.RequestException as e:
        print(f"请求发生未知错误: {e}", file=sys.stderr)
        request_success = False
        sys.exit(EXIT_NETWORK_ERR)

    # ----- 解析响应 JSON -----
    try:
        raw_output = response.text
        parsed_result = response.json()
        parse_success = True
    except json.JSONDecodeError:
        print("错误: 响应不是有效的 JSON 格式", file=sys.stderr)
        sys.exit(EXIT_RESPONSE_ERR)

    # ----- 提取 choices[0].message.content -----
    try:
        choices = parsed_result.get("choices")
        if not choices or not isinstance(choices, list) or len(choices) == 0:
            raise ValueError("choices 为空或不是列表")
        first_choice = choices[0]
        message = first_choice.get("message")
        if not message or not isinstance(message, dict):
            raise ValueError("choices[0].message 无效")
        raw_output = message.get("content")
        if raw_output is None:
            raise ValueError("choices[0].message.content 不存在")
    except (KeyError, ValueError, IndexError) as e:
        print(f"错误: 响应结构不符合预期 - {e}", file=sys.stderr)
        print(f"原始响应: {response.text[:500]}", file=sys.stderr)
        sys.exit(EXIT_RESPONSE_ERR)

    # ----- 输出结果 -----
    print("\n===== 模型返回结果 =====\n")
    print(raw_output)
    print("\n========================\n")

    # 此处可继续将 raw_output 用于后续评估逻辑（如与预期答案对比）
    # ...

    sys.exit(EXIT_SUCCESS)

if __name__ == "__main__":
    main()