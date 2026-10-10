"""10/10 魏文瑜棄賽：公告 docx 刪除該列、序號遞補、隊數 21→20、總數 69→68。只換 run 內文字，保留格式。
用法：py withdraw_docx.py 公告.docx"""
import sys, docx

path = sys.argv[1]
d = docx.Document(path)


def rep_para(p, old, new):
    for r in p.runs:
        if old in r.text:
            r.text = r.text.replace(old, new); return True
    if old in p.text:                                   # 跨 run：整段併到第一個 run
        t = p.text.replace(old, new)
        for k, r in enumerate(p.runs): r.text = t if k == 0 else ""
        return True
    return False


def set_cell(c, val):
    p = c.paragraphs[0]
    if p.runs:
        p.runs[0].text = val
        for r in p.runs[1:]: r.text = ""
    else:
        p.add_run(val)


done = []
for p in d.paragraphs:
    if "共計 69 隊" in p.text: done.append(rep_para(p, "69", "68"))
    if "國小組（21 隊）" in p.text: done.append(rep_para(p, "21 隊", "20 隊"))
t2 = d.tables[2]
assert t2.rows[1].cells[2].text.strip() == "21" and t2.rows[6].cells[2].text.strip() == "69"
set_cell(t2.rows[1].cells[2], "20"); set_cell(t2.rows[6].cells[2], "68")
t3 = d.tables[3]
row = t3.rows[8]
assert row.cells[1].text.strip() == "魏文瑜", row.cells[1].text
t3._tbl.remove(row._tr)
for i, r in enumerate(t3.rows[1:], 1):
    set_cell(r.cells[0], str(i))
assert len(t3.rows) == 21 and t3.rows[20].cells[0].text == "20"
assert done == [True, True], done
d.save(path)
print("ok")
