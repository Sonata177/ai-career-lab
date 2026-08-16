"""
analyze_results.py - 统计 eval_pipeline 生成的批次结果（按温度 / level 分组）

用法:
    python analyze_results.py                 # 自动读取 data/ 下最新的 JSON
    python analyze_results.py <batch_id>      # 指定批次: data/<batch_id>.json
    python analyze_results.py <文件路径>       # 直接指定文件

任务定义: 一次 eval_pipeline 运行 = 一个任务（由 task_id 唯一标识）。
任务最终状态取该任务 attempt 最大（最后）的一条记录。

指标定义:
    - 成功率(包含失败任务)    = schema成功任务数 / 总任务数
    - 最终成功率(不包含失败任务) = schema成功任务数 / (总任务数 - 请求或解析失败的任务数)
    - 重试率                  = 发生过重试(attempt>1)的任务数 / 总任务数
    - 最终重试率              = 最终成功且经历过重试的任务数 / 最终成功任务数
    - overallScore / jobFitPercentage: 平均值、标准差(样本, n-1)、最小值、最大值
      （仅统计最终成功(schema_success=True)的任务，取该任务最后一次 attempt 的解析结果；
       失败结果不计入）
    - 七个维度: 各维度得分的平均值与标准差（同样仅统计最终成功的任务）

分组: level x temperature 交叉表 + level 边际 + temperature 边际 + 总计
"""

import sys
import json
import statistics
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"

DIMENSION_NAMES = [
    "沟通表达", "问题拆解", "执行落地", "用户同理心",
    "数据敏感度", "优先级判断", "协作与求助",
]

PCT = lambda x: "100.0%" if x >= 1 else f"{x * 100:.1f}%"


# ---------- 数据加载 ----------
def load_records(arg):
    """根据参数选择文件并加载记录列表。arg 为空 -> 取 data/ 最新文件。"""
    if arg:
        p = Path(arg)
        if not p.is_file():
            p = DATA_DIR / f"{arg}.json"
        if not p.is_file():
            print(f"错误: 找不到结果文件 {p}", file=sys.stderr)
            sys.exit(1)
    else:
        files = sorted(DATA_DIR.glob("*.json"),
                       key=lambda p: p.stat().st_mtime, reverse=True)
        if not files:
            print("错误: data/ 目录下没有 JSON 结果文件", file=sys.stderr)
            sys.exit(1)
        p = files[0]
    with p.open('r', encoding='utf-8') as f:
        records = json.load(f)
    if not isinstance(records, list):
        print(f"错误: {p} 顶层不是列表", file=sys.stderr)
        sys.exit(1)
    return p, records


# ---------- 任务聚合 ----------
def group_by_task(records):
    """按 task_id 聚合成 {task_id: [attempt记录...]}。"""
    tasks = {}
    for r in records:
        tasks.setdefault(r.get("task_id"), []).append(r)
    return tasks


def task_outcome(attempts):
    """根据某任务的全部 attempt 记录，提取该任务的结果字典。"""
    last = max(attempts, key=lambda r: r.get("attempt") or 0)
    parsed = last.get("parsed_result")
    return {
        "sample": last.get("sample"),
        "temperature": last.get("temperature"),
        "retried": len(attempts) > 1,                     # 发生过重试
        "got_result": parsed is not None,                 # 请求+解析成功，拿到了评估结果
        "final_success": last.get("schema_success") is True,
        "parsed": parsed,
    }


# ---------- 分组统计 ----------
def stats_of(values):
    """返回 (n, mean, std, min, max)；std 为样本标准差，n<2 时为 0。"""
    n = len(values)
    if n == 0:
        return (0, None, None, None, None)
    mean = statistics.mean(values)
    std = statistics.stdev(values) if n > 1 else 0.0
    return (n, mean, std, min(values), max(values))


def aggregate(tasks):
    """对一组任务计算全部指标。tasks: [task_outcome dict...]"""
    total = len(tasks)
    success = sum(1 for t in tasks if t["final_success"])
    no_result = sum(1 for t in tasks if not t["got_result"])
    retried = sum(1 for t in tasks if t["retried"])
    succ_retried = sum(1 for t in tasks if t["retried"] and t["final_success"])

    parsed_tasks = [t for t in tasks if t["final_success"]]
    overall = stats_of([t["parsed"]["overallScore"] for t in parsed_tasks])
    jobfit = stats_of([t["parsed"]["jobFitPercentage"] for t in parsed_tasks])
    dims = {name: stats_of(
        [d["score"] for t in parsed_tasks
         for d in t["parsed"].get("dimensions", []) if d.get("name") == name])
        for name in DIMENSION_NAMES}

    return {
        "total": total,
        "success": success,
        "no_result": no_result,
        "retried": retried,
        "succ_retried": succ_retried,
        "sr_incl": success / total if total else 0,          # 成功率(包含失败任务)
        "sr_excl": success / (total - no_result) if total > no_result else 0,
        "rr": retried / total if total else 0,               # 重试率
        "frr": succ_retried / success if success else 0,     # 最终重试率
        "overall": overall,
        "jobfit": jobfit,
        "dims": dims,
    }


# ---------- 输出 ----------
def fmt_ss(s):
    """格式化统计值: mean ± std (min~max)"""
    n, mean, std, lo, hi = s
    if n == 0:
        return "-"
    return f"{mean:.1f} ± {std:.1f} ({lo:.0f}~{hi:.0f})"


def print_rate_table(title, groups):
    """打印成功率/重试率表格。groups: [(label, agg), ...]"""
    print(f"\n---------- {title} ----------")
    print(f"{'分组':<22}{'任务':>5}{'成功':>5}{'成功含失败':>10}"
          f"{'成功不含失败':>12}{'重试率':>9}{'最终重试率':>11}")
    for label, agg in groups:
        print(f"{label:<22}{agg['total']:>5}{agg['success']:>5}"
              f"{PCT(agg['sr_incl']):>10}{PCT(agg['sr_excl']):>12}"
              f"{PCT(agg['rr']):>9}{PCT(agg['frr']):>11}")


def print_score_table(title, groups):
    """打印 overallScore / jobFitPercentage 表格。"""
    print(f"\n---------- {title} ----------")
    print(f"{'分组':<22}{'n':>4}{'overallScore (mean±std, min~max)':<32}"
          f"{'jobFitPercentage (mean±std, min~max)':<32}")
    for label, agg in groups:
        print(f"{label:<22}{agg['overall'][0]:>4}"
              f"{fmt_ss(agg['overall']):<32}{fmt_ss(agg['jobfit']):<32}")


def print_dim_table(title, groups):
    """打印七个维度 mean±std 表格。"""
    print(f"\n---------- {title} ----------")
    header = f"{'分组':<22}{'n':>4}"
    for name in DIMENSION_NAMES:
        header += f"{name:>12}"
    print(header)
    for label, agg in groups:
        row = f"{label:<22}{agg['overall'][0]:>4}"
        for name in DIMENSION_NAMES:
            n, mean, std, lo, hi = agg["dims"][name]
            row += f"{(f'{mean:.1f}±{std:.1f}' if n else '-'):>12}"
        print(row)


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    path, records = load_records(arg)

    tasks = [task_outcome(a) for a in group_by_task(records).values()]
    total = len(tasks)
    print(f"结果文件: {path}")
    print(f"attempt 记录: {len(records)} | 任务数: {total} "
          f"| 请求/解析失败任务: {sum(1 for t in tasks if not t['got_result'])}")

    # 分组键构建
    groups = {}  # (level, temp) -> [tasks]
    for t in tasks:
        groups.setdefault((t["sample"], t["temperature"]), []).append(t)

    def agg_of(label, task_list):
        return (label, aggregate(task_list))

    cross = [agg_of(f"{lv} x {tp:g}", ts)
             for (lv, tp), ts in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1]))]
    by_level = [agg_of(f"level={lv}", [t for t in tasks if t["sample"] == lv])
                for lv in sorted({t["sample"] for t in tasks})]
    by_temp = [agg_of(f"temp={tp:g}", [t for t in tasks if t["temperature"] == tp])
               for tp in sorted({t["temperature"] for t in tasks})]
    grand = agg_of("合计", tasks)

    print_rate_table("成功率 / 重试率（按 level x temperature）", cross + [grand])
    print_rate_table("成功率 / 重试率（按 level 边际）", by_level + [grand])
    print_rate_table("成功率 / 重试率（按 temperature 边际）", by_temp + [grand])

    print_score_table("overallScore / jobFitPercentage（按 level x temperature）", cross + [grand])
    print_score_table("overallScore / jobFitPercentage（按 level 边际）", by_level + [grand])
    print_score_table("overallScore / jobFitPercentage（按 temperature 边际）", by_temp + [grand])

    print_dim_table("七个维度 mean ± std（按 level x temperature）", cross + [grand])
    print_dim_table("七个维度 mean ± std（按 level 边际）", by_level + [grand])
    print_dim_table("七个维度 mean ± std（按 temperature 边际）", by_temp + [grand])


if __name__ == "__main__":
    main()