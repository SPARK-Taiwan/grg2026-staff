"""把 score/rules.js、score/server.js、tools/score_glue.gs 合成 apps-script/Score.gs（貼到 Apps Script 用）。
用法：py score/tools/build_gs.py（在 staff-site 資料夾執行）"""
import pathlib

root = pathlib.Path(__file__).resolve().parents[2]
parts = [
    "/**\n * GRG2026 即時計分後台（自動產生：score/tools/build_gs.py，請勿手改）\n"
    " * 來源：score/rules.js（規則）＋ score/server.js（寫入權限）＋ score/tools/score_glue.gs（試算表）\n"
    " * 和 Code.gs 放在同一個 Apps Script 專案；Code.gs 的 doGet / doPost 會把計分的請求轉過來。\n */\n",
    (root / "score/rules.js").read_text(encoding="utf-8"),
    (root / "score/server.js").read_text(encoding="utf-8"),
    (root / "score/tools/score_glue.gs").read_text(encoding="utf-8"),
]
out = root / "apps-script/Score.gs"
out.write_text("\n".join(parts), encoding="utf-8", newline="\n")
print("ok", out, out.stat().st_size, "bytes")
