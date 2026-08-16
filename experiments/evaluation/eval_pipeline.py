import sys
import json
import time
import uuid
import math
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
EXIT_DATA_FILE_CORRUPT = 9
EXIT_VALIDATION_ERR = 10

API_URL = "http://localhost:3001/api/chat/completions"
REQUEST_TIMEOUT = 240
MAX_RETRIES = 3
RETRY_BACKOFF = 1

# 是否把每次请求的完整 body（含全部 messages）也写入记录。
# 注意：messages 可能很大（数万字符），开启后结果文件会显著膨胀。
SAVE_REQUEST_BODY = False

# batch_id 允许的字符集（它会用作结果文件名，必须杜绝路径穿越）
BATCH_ID_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")

LEVEL_FILE_MAP = {
    "high": "assessment-sample-high.json",
    "mid":  "assessment-sample-mid.json",
    "low":  "assessment-sample-low.json",
}

# ---------- 工具函数 ----------
def now_iso():
    """返回带秒精度的本地时间 ISO 字符串（记录每次请求的发送时刻）。"""
    return datetime.now().isoformat(timespec="seconds")


def elapsed_ms(t0):
    """自 t0 起的毫秒耗时（保留 1 位小数）。"""
    return round((time.perf_counter() - t0) * 1000, 1)


def parse_args(argv):
    """
    解析命令行参数（前三个必填，batch_id 可选）：
      python eval_pipeline.py <high|mid|low> <run_id> <temperature> [batch_id]

    - level:       必填，high/mid/low 之一
    - run_id:      必填，必须为大于 0 的整数（该任务第几次运行）
    - temperature: 必填，0~2 之间的数字（含 0 和 2），覆盖样本文件中的 temperature
    - batch_id:    可选，本次批次标识（仅允许字母/数字/下划线/连字符）；
                   提供后结果文件命名为 data/{batch_id}.json，
                   不提供则回退为按日期命名 data/YYYY-MM-DD.json

    校验失败时打印错误信息并退出 EXIT_USAGE。
    返回 (level, run_id, temperature, batch_id)，batch_id 为 None 表示未指定。
    """
    if len(argv) not in (4, 5):
        print("用法: python eval_pipeline.py <high|mid|low> <run_id> <temperature> [batch_id]", file=sys.stderr)
        print("  run_id:      必填，大于 0 的整数（该任务第几次运行）", file=sys.stderr)
        print("  temperature: 必填，0~2 之间的数字（含 0 和 2）", file=sys.stderr)
        print("  batch_id:    可选，批次标识，决定结果文件名（默认按日期命名）", file=sys.stderr)
        print("示例: python eval_pipeline.py high 1 0.2", file=sys.stderr)
        print("      python eval_pipeline.py high 1 0.2 20260816-153000", file=sys.stderr)
        sys.exit(EXIT_USAGE)

    level = argv[1].lower()
    if level not in LEVEL_FILE_MAP:
        print(f"错误: 参数必须是 high/mid/low 之一，收到 '{level}'", file=sys.stderr)
        sys.exit(EXIT_USAGE)

    try:
        run_id = int(argv[2])
    except ValueError:
        print(f"错误: run_id 必须是大于 0 的整数，收到 '{argv[2]}'", file=sys.stderr)
        sys.exit(EXIT_USAGE)
    if run_id <= 0:
        print(f"错误: run_id 必须是大于 0 的整数，收到 '{argv[2]}'", file=sys.stderr)
        sys.exit(EXIT_USAGE)

    try:
        temperature = float(argv[3])
    except ValueError:
        print(f"错误: temperature 必须是 0~2 之间的数字，收到 '{argv[3]}'", file=sys.stderr)
        sys.exit(EXIT_USAGE)
    if not math.isfinite(temperature) or not (0 <= temperature <= 2):
        print(f"错误: temperature 必须在 0~2 之间（含 0 和 2），收到 '{argv[3]}'", file=sys.stderr)
        sys.exit(EXIT_USAGE)

    batch_id = None
    if len(argv) == 5:
        batch_id = argv[4].strip()
        if not batch_id or any(c not in BATCH_ID_ALLOWED for c in batch_id):
            print(f"错误: batch_id 只能包含字母/数字/下划线/连字符，收到 '{argv[4]}'", file=sys.stderr)
            sys.exit(EXIT_USAGE)

    return level, run_id, temperature, batch_id


def build_base_record(level, sample_filename, task_id, run_id, batch_id, data):
    """
    构建一条记录骨架：
    - run 级元信息：同一 run 的所有 attempt 记录共享（run_id / sample / model 等）
    - attempt 级信息：每次实际请求单独一条记录，逐字段填充
    """
    record = {
        # ---- run 级元信息 ----
        "record_schema": "v2-attempt",      # 记录格式版本，用于区分旧数据
        "sample": level,
        "prompt_file": sample_filename,
        "batch_id": batch_id,               # 批次标识（None = 单独运行，结果按日期命名）
        "run_id": run_id,                   # 该任务第几次运行（1-based 运行计数，命令行可指定）
        "task_id": task_id,                 # 本次运行实例标识（uuid 前 8 位），每次运行唯一
        "model": data.get("model", "未指定"),
        "temperature": data.get("temperature", "未指定"),
        "max_tokens": data.get("max_tokens", "未指定"),
        "message_count": len(data.get("messages", [])),

        # ---- attempt 级信息 ----
        "stage": "request",                 # request | pre_request
        "attempt": None,                    # 第几次实际请求（从 1 起）
        "is_last_attempt": False,           # 是否为该 run 的最后一次请求
        "request_sent_at": None,            # 请求发出时刻（ISO）
        "request_duration_ms": None,        # 本次请求耗时（毫秒）
        "request_success": False,
        "failure_type": None,               # timeout|connection|http_5xx|http_client|unknown|parse
        "http_status": None,                # HTTP 状态码（如有）
        "response_snippet": None,           # 失败时响应体前 200 字符（如有）
        "retry_delay_s": None,              # 本次失败后到下次重试的等待秒数（仅失败且还会重试时）
        "retry_reasons": [],                # 本 run 累计的所有失败原因（每次失败追加）
        "raw_output": None,
        "parse_success": False,
        "parsed_result": None,
        "schema_success": None,
        "validation_errors": [],
        "error": None,
    }
    if SAVE_REQUEST_BODY:
        record["request_body"] = data
    return record


# ---------- 失败处理函数（不变）----------
def handle_failure(record, retry_count, max_attempts, exit_code, exit_msg):
    """
    处理一次失败的尝试（请求失败或响应解析失败）：
    - 未达到最大尝试次数：累计 retry_reasons、记录退避延迟、立即落盘失败记录，
      等待后返回新的 retry_count 供循环继续（请求继续重试）。
    - 已达到最大尝试次数：标记 is_last_attempt、落盘最后一次失败记录，
      以 exit_code 退出（请求失败 -> EXIT_NETWORK_ERR，解析失败 -> EXIT_RESPONSE_ERR）。
    """
    new_retry = retry_count + 1
    record["retry_reasons"].append(record["error"])

    if new_retry < max_attempts:
        record["retry_delay_s"] = RETRY_BACKOFF * (2 ** (new_retry - 1))
        print(f"[任务 {record['task_id']}] 第 {record['attempt']} 次尝试失败，"
              f"将在 {record['retry_delay_s']} 秒后重试...", file=sys.stderr)
        append_result(record)            # 保存本次失败记录
        time.sleep(record["retry_delay_s"])
        return new_retry

    # 最后一次尝试也失败：以对应退出码结束
    record["is_last_attempt"] = True
    record["error"] = exit_msg
    print(f"错误: {exit_msg}", file=sys.stderr)
    append_result(record)                # 保存最后一次失败记录
    sys.exit(exit_code)


# ---------- Schema 校验函数（不变）----------
def validate_schema(parsed):
    """
    校验解析后的 JSON 是否符合预期 Schema。
    返回 (is_valid, errors_list)，errors_list 包含所有错误信息。
    """
    errors = []

    if not isinstance(parsed, dict):
        errors.append("顶层不是字典")
        return False, errors

    required_keys = ["overallScore", "jobFitPercentage", "dimensions",
                     "strengths", "improvements", "suggestions", "fitAdvice"]
    for key in required_keys:
        if key not in parsed:
            errors.append(f"缺少必要字段: {key}")

    # 校验 overallScore 和 jobFitPercentage
    for field in ["overallScore", "jobFitPercentage"]:
        if field in parsed:
            val = parsed[field]
            if not isinstance(val, (int, float)):
                errors.append(f"{field} 不是数字")
            elif not (0 <= val <= 100):
                errors.append(f"{field} 不在 0~100 之间")

    # 校验 dimensions
    dims = parsed.get("dimensions")
    if "dimensions" not in parsed:
        pass
    elif not isinstance(dims, list):
        errors.append("dimensions 不是列表")
    else:
        if len(dims) != 7:
            errors.append(f"dimensions 长度应为 7，实际为 {len(dims)}")
        expected_names = {"沟通表达", "问题拆解", "执行落地", "用户同理心",
                          "数据敏感度", "优先级判断", "协作与求助"}
        dim_names = set()
        for idx, d in enumerate(dims):
            if not isinstance(d, dict):
                errors.append(f"dimensions[{idx}] 不是字典")
                continue
            for subkey in ["name", "score", "evidence", "color"]:
                if subkey not in d:
                    errors.append(f"dimensions[{idx}] 缺少字段 '{subkey}'")
            name = d.get("name")
            if name not in expected_names:
                errors.append(f"dimensions[{idx}].name '{name}' 不在预期列表中")
            else:
                dim_names.add(name)
            score = d.get("score")
            if not isinstance(score, (int, float)) or not (0 <= score <= 100):
                errors.append(f"dimensions[{idx}].score 不在 0~100 之间")
            evidence = d.get("evidence")
            if not isinstance(evidence, str) or evidence.strip() == "":
                errors.append(f"dimensions[{idx}].evidence 为空或不是字符串")
        if dim_names != expected_names:
            missing = expected_names - dim_names
            extra = dim_names - expected_names
            if missing:
                errors.append(f"缺少维度: {missing}")
            if extra:
                errors.append(f"额外维度: {extra}")

    # 校验 strengths / improvements / suggestions 为字符串列表
    for field in ["strengths", "improvements", "suggestions"]:
        val = parsed.get(field)
        if val is None:
            pass
        elif not isinstance(val, list):
            errors.append(f"{field} 不是列表")
        else:
            for idx, item in enumerate(val):
                if not isinstance(item, str):
                    errors.append(f"{field}[{idx}] 不是字符串")
                elif item.strip() == "":
                    errors.append(f"{field}[{idx}] 为空字符串")

    # 校验 fitAdvice 为非空字符串
    fit_advice = parsed.get("fitAdvice")
    if fit_advice is None:
        pass
    elif not isinstance(fit_advice, str) or fit_advice.strip() == "":
        errors.append("fitAdvice 为空或不是字符串")

    return len(errors) == 0, errors

# ---------- 结果记录函数（修改：文件名 = 批次）----------
def append_result(record):
    """
    将单条记录追加到 JSON 文件中；若文件损坏则报错退出，不覆盖原文件。
    文件名：优先使用 record 中的 batch_id -> data/{batch_id}.json；
    未指定 batch_id 时按日期命名 -> data/YYYY-MM-DD.json（兼容单独运行）。
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    batch_id = record.get("batch_id")
    if batch_id:
        file_name = f"{batch_id}.json"
    else:
        file_name = datetime.now().strftime("%Y-%m-%d") + ".json"
    file_path = DATA_DIR / file_name

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
    level, run_id, temperature, batch_id = parse_args(sys.argv)

    task_id = str(uuid.uuid4())[:8]
    sample_filename = LEVEL_FILE_MAP[level]
    json_path = BASE_DIR / "experiments" / "temperature" / sample_filename

    # 记录骨架（预请求阶段错误也会用它落盘，stage=pre_request，保证每个 run 至少一条记录）
    record = build_base_record(level, sample_filename, task_id, run_id, batch_id, {})
    record["stage"] = "pre_request"

    # ----- 文件存在性检查 -----
    if not json_path.is_file():
        err_msg = f"文件不存在或不是普通文件 -> {json_path}"
        print(f"错误: {err_msg}", file=sys.stderr)
        record["error"] = err_msg
        append_result(record)
        sys.exit(EXIT_NOFILE)

    # ----- 读取并解析 JSON -----
    try:
        with json_path.open('r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        err_msg = f"JSON解析失败: {e}"
        print(err_msg, file=sys.stderr)
        record["error"] = err_msg
        append_result(record)
        sys.exit(EXIT_JSON_DECODE)
    except OSError as e:
        err_msg = f"读取文件时发生错误: {e}"
        print(err_msg, file=sys.stderr)
        record["error"] = err_msg
        append_result(record)
        sys.exit(EXIT_IO_ERR)

    # 结构校验
    if not isinstance(data, dict):
        err_msg = "JSON 顶层必须是字典 (dict)"
        print(err_msg, file=sys.stderr)
        record["error"] = err_msg
        append_result(record)
        sys.exit(EXIT_STRUCT_ERR)

    if "messages" not in data:
        err_msg = "JSON 缺少 'messages' 字段"
        print(err_msg, file=sys.stderr)
        record["error"] = err_msg
        append_result(record)
        sys.exit(EXIT_STRUCT_ERR)

    messages = data["messages"]
    if not isinstance(messages, list):
        err_msg = "'messages' 必须是列表 (list)"
        print(err_msg, file=sys.stderr)
        record["error"] = err_msg
        append_result(record)
        sys.exit(EXIT_STRUCT_ERR)

    if len(messages) == 0:
        err_msg = "'messages' 列表不能为空"
        print(err_msg, file=sys.stderr)
        record["error"] = err_msg
        append_result(record)
        sys.exit(EXIT_STRUCT_ERR)

    # 命令行 temperature 覆盖样本文件配置（同时作用于请求体与记录字段）
    data["temperature"] = temperature

    # 用真实数据补齐 run 级元信息
    record["model"] = data.get("model", "未指定")
    record["temperature"] = data.get("temperature", "未指定")
    record["max_tokens"] = data.get("max_tokens", "未指定")
    record["message_count"] = len(messages)
    record["stage"] = "request"

    print(f"成功加载: {json_path}")
    print(f"文件名: {json_path.name}, batch_id: {batch_id}, run_id: {record['run_id']}, "
          f"model: {record['model']}, temperature: {record['temperature']}, "
          f"max_tokens: {record['max_tokens']}, messages数量: {len(messages)}")

    data["stream"] = False

    # ----- 带重试的"请求 + 解析"循环：每次实际尝试单独落盘 -----
    # 请求失败（timeout/connection/http_5xx/unknown）与响应解析失败（parse）
    # 都参与重试；4xx 不重试直接退出；Schema 校验失败不重试（见下方）。
    retry_count = 0
    response = None
    last_exception = None
    max_attempts = MAX_RETRIES + 1

    while retry_count < max_attempts:
        # 每次尝试前重置本次特有的字段
        record["attempt"] = retry_count + 1          # attempt 每次 +1
        record["is_last_attempt"] = False
        record["request_sent_at"] = now_iso()
        record["request_duration_ms"] = None
        record["request_success"] = False
        record["failure_type"] = None
        record["http_status"] = None
        record["response_snippet"] = None
        record["retry_delay_s"] = None
        record["raw_output"] = None
        record["parse_success"] = False
        record["parsed_result"] = None

        if retry_count == 0:
            print(f"[任务 {task_id}] 正在向 {API_URL} 发送请求...")
        else:
            print(f"[任务 {task_id}] 重试 (第 {retry_count} 次) ...")

        # ---- 1. 发送请求 ----
        t0 = time.perf_counter()
        try:
            response = requests.post(
                API_URL,
                json=data,
                timeout=REQUEST_TIMEOUT
            )
            record["request_duration_ms"] = elapsed_ms(t0)
            response.raise_for_status()
            record["request_success"] = True
            record["http_status"] = response.status_code
        except requests.exceptions.Timeout as e:
            last_exception = e
            record["request_duration_ms"] = elapsed_ms(t0)
            err_msg = f"请求超时（超过 {REQUEST_TIMEOUT} 秒）"
            record["failure_type"] = "timeout"
            record["error"] = err_msg
            print(f"警告: {err_msg}", file=sys.stderr)
        except requests.exceptions.ConnectionError as e:
            last_exception = e
            record["request_duration_ms"] = elapsed_ms(t0)
            err_msg = f"网络连接失败（无法连接到 {API_URL}）"
            record["failure_type"] = "connection"
            record["error"] = err_msg
            print(f"警告: {err_msg}", file=sys.stderr)
        except requests.exceptions.HTTPError as e:
            record["request_duration_ms"] = elapsed_ms(t0)
            if response is not None and response.status_code >= 500:
                last_exception = e
                err_msg = f"HTTP {response.status_code} 服务端错误"
                record["failure_type"] = "http_5xx"
                record["http_status"] = response.status_code
                record["error"] = err_msg
                print(f"警告: {err_msg}", file=sys.stderr)
            else:
                # 4xx 不重试：保存本次请求记录后退出
                err_msg = f"HTTP 错误: {e}"
                record["failure_type"] = "http_client"
                record["http_status"] = response.status_code if response is not None else None
                record["error"] = err_msg
                print(err_msg, file=sys.stderr)
                if response is not None and response.text:
                    record["response_snippet"] = response.text[:200]
                    print(f"响应内容: {response.text[:200]}", file=sys.stderr)
                record["is_last_attempt"] = True
                append_result(record)
                sys.exit(EXIT_HTTP_ERR)
        except requests.exceptions.RequestException as e:
            last_exception = e
            record["request_duration_ms"] = elapsed_ms(t0)
            err_msg = f"请求发生未知错误: {e}"
            record["failure_type"] = "unknown"
            record["error"] = err_msg
            print(f"警告: {err_msg}", file=sys.stderr)

        # ---- 2. 请求失败：落盘并决定是否重试 ----
        if not record["request_success"]:
            retry_count = handle_failure(
                record, retry_count, max_attempts,
                exit_code=EXIT_NETWORK_ERR,
                exit_msg=f"请求失败，已达最大重试次数 ({MAX_RETRIES})，最后异常: {last_exception}",
            )
            continue

        # ---- 3. 请求成功：解析整体响应（失败计入 parse，参与重试）----
        try:
            resp_data = response.json()
            if not isinstance(resp_data, dict):
                raise TypeError("响应顶层不是 dict")
        except (json.JSONDecodeError, TypeError) as e:
            err_msg = f"响应不是有效的 JSON 或顶层类型错误: {e}"
            print(err_msg, file=sys.stderr)
            record["failure_type"] = "parse"
            record["error"] = err_msg
            record["response_snippet"] = response.text[:200]
            retry_count = handle_failure(
                record, retry_count, max_attempts,
                exit_code=EXIT_RESPONSE_ERR,
                exit_msg=f"响应解析失败，已达最大重试次数 ({MAX_RETRIES})，最后错误: {err_msg}",
            )
            continue

        # ---- 4. 提取 content（结构不符也计入 parse，参与重试）----
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
            record["failure_type"] = "parse"
            record["error"] = err_msg
            record["response_snippet"] = response.text[:200]
            retry_count = handle_failure(
                record, retry_count, max_attempts,
                exit_code=EXIT_RESPONSE_ERR,
                exit_msg=f"响应结构不符合预期，已达最大重试次数 ({MAX_RETRIES})，最后错误: {err_msg}",
            )
            continue

        record["raw_output"] = content

        # ---- 5. 将 content 解析为 JSON（解析失败计入 parse，参与重试）----
        try:
            parsed = json.loads(content)
            record["parsed_result"] = parsed
            record["parse_success"] = True
        except json.JSONDecodeError as e:
            record["parsed_result"] = None
            record["parse_success"] = False
            err_msg = f"content 不是有效的 JSON: {e}"
            record["failure_type"] = "parse"
            record["error"] = err_msg
            print(f"错误: {err_msg}", file=sys.stderr)
            retry_count = handle_failure(
                record, retry_count, max_attempts,
                exit_code=EXIT_RESPONSE_ERR,
                exit_msg=f"content 解析失败，已达最大重试次数 ({MAX_RETRIES})，最后错误: {err_msg}",
            )
            continue

        # ---- 6. 请求 + 解析全部成功 ----
        break

    # 请求与解析成功：这条记录就是本 run 的最后一条
    record["is_last_attempt"] = True
    record["error"] = None

    # ----- Schema 校验（不重试，直接记录并退出）-----
    valid, errors = validate_schema(parsed)
    record["validation_errors"] = errors
    if valid:
        record["schema_success"] = True
        record["error"] = None
        print(f"[任务 {task_id}] 请求成功，结果已记录。")
        append_result(record)
        sys.exit(EXIT_SUCCESS)
    else:
        record["schema_success"] = False
        record["error"] = f"Schema 校验失败，共 {len(errors)} 个错误"
        print(f"错误: {record['error']}", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        append_result(record)
        sys.exit(EXIT_VALIDATION_ERR)

if __name__ == "__main__":
    main()