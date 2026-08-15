import sys
import math
import subprocess
from pathlib import Path

# ---------- 基础配置 ----------
BASE_DIR = Path(__file__).resolve().parent            # experiments/evaluation/
PIPELINE = BASE_DIR / "eval_pipeline.py"              # 子脚本（必填三个参数）

EXIT_SUCCESS = 0
EXIT_FAILURE = 1        # 存在失败任务时的批处理退出码

VALID_LEVELS = {"high", "mid", "low"}

# 可调参数（仅剩超时保护）
TIMEOUT_PER_TASK = 600                      # 单个子任务超时（秒），防止卡死拖垮整批

# ---------- 参数解析 ----------
def split_csv(raw):
    """把逗号分隔的字符串拆成去空白、去重（保持顺序）的列表。"""
    seen = []
    for part in raw.split(","):
        item = part.strip()
        if item and item not in seen:
            seen.append(item)
    return seen


def parse_levels(raw):
    """解析 level 列表：全部必须是 high/mid/low 之一，否则报错。"""
    levels = split_csv(raw)
    if not levels:
        print("错误: levels 不能为空", file=sys.stderr)
        sys.exit(EXIT_FAILURE)
    for lv in levels:
        if lv not in VALID_LEVELS:
            print(f"错误: level 必须是 high/mid/low 之一，收到 '{lv}'", file=sys.stderr)
            sys.exit(EXIT_FAILURE)
    return levels


def parse_temperatures(raw):
    """解析温度列表：每个必须是 0~2 之间的数字（含 0 和 2），否则报错。"""
    temps = []
    for item in split_csv(raw):
        try:
            t = float(item)
        except ValueError:
            print(f"错误: temperature 必须是 0~2 之间的数字，收到 '{item}'", file=sys.stderr)
            sys.exit(EXIT_FAILURE)
        if not math.isfinite(t) or not (0 <= t <= 2):
            print(f"错误: temperature 必须在 0~2 之间（含 0 和 2），收到 '{item}'", file=sys.stderr)
            sys.exit(EXIT_FAILURE)
        if t not in temps:                  # 去重（浮点相等即可，避免重复任务）
            temps.append(t)
    if not temps:
        print("错误: temperatures 不能为空", file=sys.stderr)
        sys.exit(EXIT_FAILURE)
    return temps


def parse_run_id(raw):
    """解析 run_id：每个 level×温度组合重复执行的次数，必须为大于 0 的整数。"""
    try:
        run_id = int(raw)
    except ValueError:
        print(f"错误: run_id 必须是大于 0 的整数（每个组合重复执行的次数），收到 '{raw}'", file=sys.stderr)
        sys.exit(EXIT_FAILURE)
    if run_id <= 0:
        print(f"错误: run_id 必须是大于 0 的整数（每个组合重复执行的次数），收到 '{raw}'", file=sys.stderr)
        sys.exit(EXIT_FAILURE)
    return run_id


def parse_args(argv):
    """
    用法: python run_batch.py <levels> <temperatures> <run_id>
      levels:       逗号分隔的 high/mid/low 列表，如 high,mid,low
      temperatures: 逗号分隔的 0~2 数字列表，如 1,0.8,0.2
      run_id:       每个 level×温度组合重复执行的次数（>0 整数），
                    组合内部子脚本的 run_id 依次取 1,2,...,run_id
    示例: python run_batch.py high,mid,low 1,0.8,0.2 5
    """
    if len(argv) != 4:
        print("用法: python run_batch.py <levels> <temperatures> <run_id>", file=sys.stderr)
        print("  levels:       逗号分隔的 high/mid/low 列表，如 high,mid,low", file=sys.stderr)
        print("  temperatures: 逗号分隔的 0~2 数字列表，如 1,0.8,0.2", file=sys.stderr)
        print("  run_id:       每个 level×温度组合重复执行的次数（>0 整数）", file=sys.stderr)
        print("示例: python run_batch.py high,mid,low 1,0.8,0.2 5", file=sys.stderr)
        sys.exit(EXIT_FAILURE)
    return parse_levels(argv[1]), parse_temperatures(argv[2]), parse_run_id(argv[3])


# ---------- 单任务执行 ----------
def run_one(level, temperature, run_id):
    """
    执行一次 eval_pipeline.py（子脚本 run_id 取本次重复的序号）。
    返回 (level, temperature, run_id, returncode, tail)：
      - returncode: 子脚本退出码（int）；超时则为字符串 "timeout"
      - tail:       失败时子脚本 stderr 尾部内容（用于定位问题）
    """
    cmd = [
        sys.executable,                     # 当前正在使用的 Python 解释器路径
        str(PIPELINE),
        level,
        str(run_id),
        f"{temperature:g}",                 # 格式化：1 / 0.8 / 0.2，避免浮点尾数
    ]
    print(f"[批处理] 开始任务: level={level} temperature={temperature:g} run_id={run_id}")
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=TIMEOUT_PER_TASK,
        )
        returncode = proc.returncode        # 记录子脚本退出码
        tail = ""
        if returncode != EXIT_SUCCESS:
            tail = proc.stderr.strip()[-800:] if proc.stderr.strip() else ""
            if tail:
                print(f"  └─ 子脚本 stderr(尾部):\n{tail}", file=sys.stderr)
        return (level, temperature, run_id, returncode, tail)
    except subprocess.TimeoutExpired:
        return (level, temperature, run_id, "timeout",
                f"超过 {TIMEOUT_PER_TASK}s 未结束")


# ---------- 主流程 ----------
def main():
    levels, temperatures, repeats = parse_args(sys.argv)
    # 每个 level×温度组合重复 repeats 次，组合内 run_id 依次取 1..repeats
    total = len(levels) * len(temperatures) * repeats
    print(f"[批处理] levels={levels} 温度集合={temperatures} 每个组合跑 {repeats} 次，"
          f"共 {total} 个任务")

    failures = []
    done = 0
    # 三层循环：外层 level，中层温度，内层重复次数（run_id 1..repeats）
    for level in levels:
        for temperature in temperatures:
            for run_id in range(1, repeats + 1):
                done += 1
                lv, temp, rid, rc, tail = run_one(level, temperature, run_id)
                if rc == EXIT_SUCCESS:
                    print(f"[批处理] ({done}/{total}) level={lv} temp={temp:g} run={rid} -> 成功")
                else:
                    # 记录失败，继续执行剩余任务（不中断循环）
                    failures.append({
                        "level": lv, "temperature": temp, "run_id": rid,
                        "returncode": rc, "stderr_tail": tail,
                    })
                    print(f"[批处理] ({done}/{total}) level={lv} temp={temp:g} run={rid} "
                          f"-> 失败 (退出码 {rc})", file=sys.stderr)

    # ----- 汇总 -----
    print("-" * 60)
    print(f"批处理完成: 共 {total} 个任务，成功 {total - len(failures)}，失败 {len(failures)}")
    if failures:
        print("失败明细:")
        for f in failures:
            print(f"  - level={f['level']} temperature={f['temperature']:g} "
                  f"run_id={f['run_id']} 退出码={f['returncode']}")
        sys.exit(EXIT_FAILURE)
    sys.exit(EXIT_SUCCESS)


if __name__ == "__main__":
    main()