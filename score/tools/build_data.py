"""產生計分系統的 score/data.js：相撲對戰表（相撲自動組循環賽程.md）＋各組隊伍（隊伍組別及賽程公告.docx）。
用法：py build_data.py 賽程.md 公告.docx 輸出data.js"""
import re, sys, json, docx

md_path, docx_path, out = sys.argv[1:4]

# ---- 相撲對戰表 ----
SECTIONS = [("國小自動組 A 組賽程表", "EA"), ("國小自動組 B 組賽程表", "EB"), ("國中自動組賽程表", "J"), ("遙控組（下午）賽程表", "R")]
sched, cur = {k: [] for _, k in SECTIONS}, None
for line in open(md_path, encoding="utf-8"):
    if line.startswith("## "):
        cur = next((k for t, k in SECTIONS if t in line), None)
        continue
    m = re.match(r"\|\s*第\s*(\d+)\s*輪\s*\|\s*場地(\d+)\s*\|\s*(\w+)\s*\|\s*(\w+)\s*\|", line)
    if cur and m:
        sched[cur].append([int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)])
counts = {k: len(v) for k, v in sched.items()}
assert counts == {"EA": 45, "EB": 55, "J": 136, "R": 91}, counts

# ---- 隊伍 ----
d = docx.Document(docx_path)
team_tables = [t for t in d.tables if t.rows[0].cells[0].text.strip() == "序號"]
assert len(team_tables) == 5, len(team_tables)
keys = ["E", "J", "R", "L", "M"]
teams = {}
for key, t in zip(keys, team_tables):
    rows = []
    for i, r in enumerate(t.rows[1:], 1):
        c = [x.text.strip() for x in r.cells]
        if not c[1]:
            continue
        item = {"id": "%s%02d" % (key, i), "name": c[1], "unit": c[2]}
        note = c[3]
        if key == "M":
            item["mr"] = "MR2" if "MR2" in note else "MR3"
        else:
            item["level"] = "國小" if "國小" in note else "高中" if "高中" in note else "國中"
        rows.append(item)
    teams[key] = rows
assert [len(teams[k]) for k in keys] == [21, 17, 14, 9, 8], [len(teams[k]) for k in keys]

# 主辦調整的出賽順序（和公告表格不同時寫在這裡）（10/9）：MR 的 JGJHS02 排在 JGJHS03 前面；循跡高中組依尾碼 01→02→03
ORDER = {"M": ["這次一定行", "再次同一隊", "程風破浪", "合作無間", "KCIS ARK", "JGJHS", "JGJHS02", "JGJHS03"],
         "L": ["福克斯好棒棒", "福克斯好棒棒02", "福克斯好棒棒03", "六和酷比6", "六和酷比7", "六和酷比8", "桃園好棒棒01", "桃園好棒棒02", "治平好棒棒03"]}
for key, names in ORDER.items():
    by = {t["name"]: t for t in teams[key]}
    assert sorted(by) == sorted(names), (key, sorted(by))
    teams[key] = [by[n] for n in names]
    for i, t in enumerate(teams[key], 1):
        t["id"] = "%s%02d" % (key, i)

data = {
    "version": "2026-10-25",
    "groups": {
        "EA": {"name": "國小自動組 A 組", "short": "國小 A 組", "session": "am", "pool": "E", "codes": ["EA%02d" % i for i in range(1, 11)], "fields": [1, 2, 3]},
        "EB": {"name": "國小自動組 B 組", "short": "國小 B 組", "session": "am", "pool": "E", "codes": ["EB%02d" % i for i in range(1, 12)], "fields": [4, 5, 6, 7]},
        "J": {"name": "國高中自動組", "short": "國高中組", "session": "am", "pool": "J", "codes": ["J%02d" % i for i in range(1, 18)], "fields": list(range(8, 16))},
        "R": {"name": "遙控組", "short": "遙控組", "session": "pm", "pool": "R", "codes": ["R%02d" % i for i in range(1, 15)], "fields": list(range(1, 7))},
    },
    "schedule": sched,
    "teams": teams,
}
with open(out, "w", encoding="utf-8") as f:
    f.write("// 自動產生（score_tools/build_data.py），請勿手改：相撲對戰表與各組隊伍\n")
    f.write("window.GRG_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("ok", counts, {k: len(v) for k, v in teams.items()})
