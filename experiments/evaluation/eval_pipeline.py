import sys
import json
import time
import uuid
from pathlib import Path
from datetime import datetime
import requests

# ---------- 基础配置 ----------
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "experiments" / "evaluation" / "data"

EXIT_SUCCESS = 0
EXIT_USAGE = 1
EXIT_NOFILE = 2
EXIT_STRUCT_ERR = 3
EXIT_JSON_DECODE = 4
EXIT_IO_ERR = 5
EXIT_NETWORK_ERR = 6
EXIT_HTTP_ERR = 7
EXIT_RESPONSE_ERR = 8
EXIT_DATA_FILE_CORRUPT = 9   # 结果文件损坏

API_URL = "http://localhost:3001/api/chat/completions"
REQUEST_TIMEOUT = 240
MAX_RETRIES = 4
RETRY_BACKOFF = 1

LEVEL_FILE_MAP = {
    "high": "assessment-sample-high.json",
    "mid":  "assessment-sample-mid.json",
    "low":  "assessment-sample-low.json",
}

# ---------- 结果记录函数（修复文件损坏问题）----------
def append_result(record):
    """将单条记录追加到日期命名的 JSON 文件中；若文件损坏则报错退出，不覆盖原文件"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    file_path = DATA_DIR / f"{date_str}.json"

    if file_path.exists():
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                records = json.load(f)
            if not isinstance(records, list):
                print(f"错误: 结果文件 {file_path} 内容不是列表，已损坏。请手动修复或备份后删除。", file=sys.stderr)
                sys.exit(EXIT_DATA_FILE_CORRUPT)
        except json.JSONDecodeError as e:
            print(f"错误: 结果文件 {file_path} JSON 解析失败 ({e})，已损坏。请手动修复或备份后删除。", file=sys.stderr)
            sys.exit(EXIT_DATA_FILE_CORRUPT)
    else:
        records = []

    records.append(record)

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

# ---------- 主函数 ----------
def main():
    # ----- 1. 参数检查 -----
    if len(sys.argv) != 2:
        print("用法: python eval_pipeline.py <high|mid|low>", file=sys.stderr)
        sys.exit(EXIT_USAGE)

    level = sys.argv[1].lower()
    if level not in LEVEL_FILE_MAP:
        print(f"错误: 参数必须是 high/mid/low 之一，收到 '{level}'", file=sys.stderr)
        sys.exit(EXIT_USAGE)

    task_id = str(uuid.uuid4())[:8]
    sample_filename = LEVEL_FILE_MAP[level]
    json_path = BASE_DIR / "experiments" / "temperature" / sample_filename


    # 初始化结果字典
    result = {
        "sample": level,
        "prompt_file": sample_filename,
        "run_id": 1,
        "task_id": task_id,
        "model": None,
        "temperature": None,
        "max_tokens": None,
        "attempt": 1,
        "retry_reasons": [],
        "raw_output": None,
        "parsed_result": None,
        "request_success": False,
        "parse_success": False,
        "schema_success": None,
        "error": None
    }

    # ----- 文件存在性检查 -----
    if not json_path.is_file():
        err_msg = f"文件不存在或不是普通文件 -> {json_path}"
        print(f"错误: {err_msg}", file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_NOFILE)

    # ----- 读取并解析 JSON -----
    try:
        with json_path.open('r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        err_msg = f"JSON解析失败: {e}"
        print(err_msg, file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_JSON_DECODE)
    except OSError as e:
        err_msg = f"读取文件时发生错误: {e}"
        print(err_msg, file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_IO_ERR)

    # 结构校验
    if not isinstance(data, dict):
        err_msg = "JSON 顶层必须是字典 (dict)"
        print(err_msg, file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_STRUCT_ERR)

    if "messages" not in data:
        err_msg = "JSON 缺少 'messages' 字段"
        print(err_msg, file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_STRUCT_ERR)

    messages = data["messages"]
    if not isinstance(messages, list):
        err_msg = "'messages' 必须是列表 (list)"
        print(err_msg, file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_STRUCT_ERR)

    if len(messages) == 0:
        err_msg = "'messages' 列表不能为空"
        print(err_msg, file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_STRUCT_ERR)

    result["model"] = data.get("model", "未指定")
    result["temperature"] = data.get("temperature", "未指定")
    result["max_tokens"] = data.get("max_tokens", "未指定")

    print(f"成功加载: {json_path}")
    print(f"文件名: {json_path.name}, model: {result['model']}, temperature: {result['temperature']}, "
          f"max_tokens: {result['max_tokens']}, messages数量: {len(messages)}")

    data["stream"] = False

    # ----- 带重试的请求发送 -----
    retry_count = 1
    response = None
    request_success = False
    last_exception = None
    max_attempts = MAX_RETRIES + 1

    while retry_count < max_attempts:
        try:
            if retry_count == 1:
                print(f"[任务 {task_id}] 正在向 {API_URL} 发送请求...")
            else:
                print(f"[任务 {task_id}] 重试 (第 {retry_count} 次) ...")
            response = requests.post(
                API_URL,
                json=data,
                timeout=REQUEST_TIMEOUT
            )
            response.raise_for_status()
            request_success = True
            break
        except requests.exceptions.Timeout as e:
            last_exception = e
            err_msg = f"请求超时（超过 {REQUEST_TIMEOUT} 秒）"
            print(f"警告: {err_msg}", file=sys.stderr)
            result["retry_reasons"].append(err_msg)
        except requests.exceptions.ConnectionError as e:
            last_exception = e
            err_msg = f"网络连接失败（无法连接到 {API_URL}）"
            print(f"警告: {err_msg}", file=sys.stderr)
            result["retry_reasons"].append(err_msg)
        except requests.exceptions.HTTPError as e:
            if response is not None and response.status_code >= 500:
                last_exception = e
                err_msg = f"HTTP {response.status_code} 服务端错误"
                print(f"警告: {err_msg}", file=sys.stderr)
                result["retry_reasons"].append(err_msg)
            else:
                err_msg = f"HTTP 错误: {e}"
                print(err_msg, file=sys.stderr)
                if response and response.text:
                    print(f"响应内容: {response.text[:200]}", file=sys.stderr)
                result["error"] = err_msg
                append_result(result)
                sys.exit(EXIT_HTTP_ERR)
        except requests.exceptions.RequestException as e:
            last_exception = e
            err_msg = f"请求发生未知错误: {e}"
            print(f"警告: {err_msg}", file=sys.stderr)
            result["retry_reasons"].append(err_msg)

        retry_count += 1
        result["attempt"] = retry_count
        if retry_count < max_attempts:
            wait_time = RETRY_BACKOFF * (2 ** (retry_count - 1))
            print(f"[任务 {task_id}] 将在 {wait_time} 秒后重试...", file=sys.stderr)
            time.sleep(wait_time)
        else:
            err_msg = f"请求失败，已达最大重试次数 ({MAX_RETRIES})，最后异常: {last_exception}"
            print(f"错误: {err_msg}", file=sys.stderr)
            result["error"] = err_msg
            append_result(result)
            sys.exit(EXIT_NETWORK_ERR)

    if not request_success:
        err_msg = "未知错误：请求未成功但未触发退出"
        print(err_msg, file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_NETWORK_ERR)

    result["request_success"] = True
    result["attempt"] = retry_count

    # ----- 解析整体响应并提取 content（类型检查增强）-----
    try:
        resp_data = response.json()
        # 显式检查 resp_data 是 dict（虽然 response.json() 通常返回 dict，但做防御）
        if not isinstance(resp_data, dict):
            raise TypeError("响应顶层不是 dict")
    except (json.JSONDecodeError, TypeError) as e:
        err_msg = f"响应不是有效的 JSON 或顶层类型错误: {e}"
        print(err_msg, file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_RESPONSE_ERR)

    try:
        choices = resp_data.get("choices")
        if not isinstance(choices, list) or len(choices) == 0:
            raise TypeError("choices 不是非空列表")
        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            raise TypeError("choices[0] 不是 dict")
        message = first_choice.get("message")
        if not isinstance(message, dict):
            raise TypeError("message 不是 dict")
        content = message.get("content")
        if not isinstance(content, str):
            raise TypeError(f"content 不是字符串，实际类型: {type(content).__name__}")
    except (KeyError, TypeError, ValueError) as e:
        err_msg = f"响应结构不符合预期 - {e}"
        print(err_msg, file=sys.stderr)
        print(f"原始响应片段: {response.text[:500]}", file=sys.stderr)
        result["error"] = err_msg
        append_result(result)
        sys.exit(EXIT_RESPONSE_ERR)

    # 保存 content
    result["raw_output"] = content

    # ----- 尝试将 content 解析为 JSON -----
    try:
        parsed = json.loads(content)
        result["parsed_result"] = parsed
        result["parse_success"] = True
        result["error"] = None
    except json.JSONDecodeError as e:
        result["parsed_result"] = None
        result["parse_success"] = False
        err_msg = f"content 不是有效的 JSON: {e}"
        result["error"] = err_msg
        # 记录错误并退出（不应返回成功退出码）
        print(f"错误: {err_msg}", file=sys.stderr)
        append_result(result)
        sys.exit(EXIT_RESPONSE_ERR)   # 解析失败视为响应格式错误

    # schema_success 保持 None（备用）

    # ----- 所有检查通过，记录成功结果 -----
    print(f"[任务 {task_id}] 请求成功，结果已记录。")
    append_result(result)
    sys.exit(EXIT_SUCCESS)

if __name__ == "__main__":
    main()