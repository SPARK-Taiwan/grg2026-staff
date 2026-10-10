"""10/10 魏文瑜（老莫機器人）棄賽 → 國小組 21→20 隊，B 組 11→10 隊。
B 組改用和 A 組同樣性質的 10 隊賽程（15 輪、每輪 3 場、每隊輪空 6 輪、最長連打 2 輪），
代號重新對應、場地 4–7 每輪輪流休息 1 張（裁判不用調動）。就地改寫 相撲自動組循環賽程.md 的 B 組段落與摘要。
用法：py regen_eb.py 賽程.md [另一份.md ...]"""
import re, sys
from collections import defaultdict

PERM = {1: 6, 2: 3, 3: 9, 4: 1, 5: 8, 6: 10, 7: 4, 8: 2, 9: 7, 10: 5}   # EA 代號 → EB 代號
IDLE = [7, 6, 5, 4]                                                     # 第 1、2、3、4… 輪休息的場地（循環）


def parse(lines, title):
    out, on = [], False
    for ln in lines:
        if ln.startswith("## "):
            on = title in ln
            continue
        m = re.match(r"\|\s*第\s*(\d+)\s*輪\s*\|\s*場地(\d+)\s*\|\s*(\w+)\s*\|\s*(\w+)\s*\|", ln)
        if on and m:
            out.append([int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)])
    return out


def build_eb(ea):
    rounds = defaultdict(list)
    for r, f, a, b in ea:
        rounds[r].append((f, "EB%02d" % PERM[int(a[2:])], "EB%02d" % PERM[int(b[2:])]))
    eb = []
    for r in sorted(rounds):
        fields = [x for x in (4, 5, 6, 7) if x != IDLE[(r - 1) % 4]]
        for (f0, a, b), f in zip(sorted(rounds[r]), fields):
            eb.append([r, f, a, b])
    return eb


def check(rows, codes):
    pairs, per = set(), defaultdict(list)
    for r, f, a, b in rows:
        assert frozenset((a, b)) not in pairs; pairs.add(frozenset((a, b)))
        per[r] += [a, b]
    assert len(pairs) == len(codes) * (len(codes) - 1) // 2
    for r, ts in per.items(): assert len(ts) == len(set(ts)), r
    nr = max(per)
    worst = 0
    for c in codes:
        run = best = 0
        for r in range(1, nr + 1):
            run = run + 1 if c in per[r] else 0; best = max(best, run)
        worst = max(worst, best)
    reds = defaultdict(int)
    for r, f, a, b in rows: reds[a] += 1
    return nr, worst, min(reds[c] for c in codes), max(reds[c] for c in codes)


def table(rows, codes):
    per = defaultdict(list)
    for r, f, a, b in rows: per[r] += [a, b]
    out = ["| 輪次 | 場地 | 紅方隊伍 | 藍方隊伍 | 紅方得分(R1/R2/R3) | 藍方得分(R1/R2/R3) | 備註 |",
           "| :---: | :---: | :---: | :---: | :---: | :---: | :---: |"]
    first = set()
    for r, f, a, b in rows:
        note = []
        if r not in first:
            first.add(r)
            idle = [c for c in codes if c not in per[r]]
            note.append("輪空：" + ", ".join(idle) + "（場地%d 休息）" % IDLE[(r - 1) % 4])
        back = [c for c in (a, b) if c in per.get(r - 1, [])]
        if back: note.append("⚠ 連打：" + ", ".join(back))
        out.append("| 第 %d 輪 | 場地%d | %s | %s | [ ][ ][ ] | [ ][ ][ ] | %s |" % (r, f, a, b, "；".join(note)))
    return out


for path in sys.argv[1:]:
    lines = open(path, encoding="utf-8").read().split("\n")
    ea = parse(lines, "國小自動組 A 組賽程表")
    assert len(ea) == 45
    eb = build_eb(ea)
    codes = ["EB%02d" % i for i in range(1, 11)]
    print(path[-20:], "EA", check(ea, ["EA%02d" % i for i in range(1, 11)]), "EB", check(eb, codes))
    # 換掉 B 組段落
    s = next(i for i, l in enumerate(lines) if l.startswith("## 國小自動組 B 組賽程表"))
    e = next(i for i in range(s + 1, len(lines)) if lines[i].startswith("## "))
    lines[s:e] = ["## 國小自動組 B 組賽程表（場地4～場地7，代號 EB01～EB10；每輪 3 場，4 張場地輪流休息）", ""] + table(eb, codes) + [""]
    txt = "\n".join(lines)
    txt = re.sub(r"\| 國小自動組 B 組 \| 11 \| 55 \|[^\n]*",
                 "| 國小自動組 B 組 | 10 | 45 | 場地4～場地7（4 張，每輪用 3 張輪替） | 15 | 9:45～11:00 | 11:12 | 每隊輪空 6 輪，最長連續 2 輪 |", txt)
    txt = txt.replace("A 組（10 隊）、B 組（11 隊）", "A 組（10 隊）、B 組（10 隊）（10/10 魏文瑜（老莫機器人）棄賽，國小組由 21 隊改為 20 隊）")
    txt = txt.replace("除最後一輪外每輪場地全滿", "除最後一輪外每輪場地全滿（國小 B 組每輪 3 場、場地 4–7 輪流休息 1 張）")
    open(path, "w", encoding="utf-8").write(txt)
print("ok")
