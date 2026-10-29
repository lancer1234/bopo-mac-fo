# 致謝與第三方授權

ㄅㄆMac ㄈ（bopo MAC fo）由 [MAKOTO LAB](https://makotolab.tw/)／[lancer1234](https://github.com/lancer1234) 整合與維護，開發過程使用 OpenAI Codex 協助。注音引擎、詞庫、Windows 輸入法框架和表情圖案來自下列專案；本專案不主張這些是自行原創。

| 專案與作者 | 使用範圍 | 授權／本專案保存位置 |
|---|---|---|
| [McBopomofo 小麥注音](https://github.com/openvanilla/McBopomofo)、[McBopomofoWeb](https://github.com/openvanilla/McBopomofoWeb) — The McBopomofo Authors、OpenVanilla 社群 | 注音組字、選字、詞庫、使用者學習、PIME adapter；本地修改 Enter、Shift、候選注音、每連線狀態、分頁與表情提交 | MIT；`upstream/McBopomofoWeb/LICENSE.txt`、`LICENSES/McBopomofo-MIT.txt`。產生資料另有下列授權 |
| [PIME](https://github.com/EasyIME/PIME) — Hong Jen-Yee／PCMan 與 EasyIME 貢獻者 | Windows TSF 服務、安裝時使用的官方前置元件；本地修改候選框、中英指示與鍵盤事件 | 依原檔案 LGPL 條款；保留 `upstream/PIME/LICENSE.txt` 及檔頭。前置安裝程式由官方下載，不重新包入本專案 |
| [libIME2](https://github.com/EasyIME/libIME2) — Hong Jen-Yee／PCMan 與貢獻者 | TSF 包裝、視窗與候選字繪製；本地修改字型生命週期、暗色介面、分頁與掃描碼擷取 | LGPL-2.1-or-later；`LICENSES/LGPL-2.1.txt`、`upstream/PIME/libIME2/` |
| [NIME](https://github.com/EasyIME/NIME) — Lee／jessy1092 與貢獻者 | Node 後端通訊與服務載入程式 | MIT；`LICENSES/NIME-MIT.txt`，原文擷取自上游 README 的 License 區段 |
| [jsoncpp](https://github.com/open-source-parsers/jsoncpp) — Baptiste Lepilleur 與貢獻者 | 原生服務 JSON 處理 | MIT／上游公有領域選項，保留原文 `LICENSES/jsoncpp.txt` |
| [CJKVI IDS](https://github.com/cjkvi/cjkvi-ids)、[CHISE](https://www.chise.org/) | `ids.txt` 拆字資料與衍生的 `PimeCharacterData.ts` | 上游表示 `ids.txt` 沿用 CHISE 的 GPLv2；`data/ids.txt`、`LICENSES/GPL-2.0.txt`。未將此資料重新宣告為 MIT |
| [Unicode Consortium](https://www.unicode.org/) | Unicode 17 Unihan、CJKRadicals、emoji-test；部首與 3,944 項 emoji 序列 | Unicode License；`LICENSES/Unicode-3.0.txt`，資料在 `data/` |
| [CLDR](https://github.com/unicode-org/cldr-json) — Unicode Consortium 與貢獻者 | 繁體中文表情名稱及搜尋關鍵字 | Unicode License；`data/zh-Hant-annotations.json`、`LICENSES/Unicode-3.0.txt` |
| [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) — Microsoft | 3D 表情預覽圖片，2,840 個序列能對應圖像 | MIT；`LICENSES/Fluent-Emoji-MIT.txt`。圖片放在 Release 安裝包，原始碼保留圖像來源路徑 |
| [Node.js](https://nodejs.org/) — Node.js contributors | 安裝包內 Node.js 22.14.0 Windows x64 執行環境 | Node.js 與內含元件原授權完整保留於 `LICENSES/Node.js-LICENSE.txt` |
| Lodash、Day.js、core-js、chinese_convert、lunar-typescript | McBopomofoWeb 編譯後的相依套件 | 對應原文保留於 `LICENSES/`，bundle 註記保留在 `index.js.LICENSE.txt` |
| debug、ms、stdio | NIME 執行期相依套件 | MIT；`LICENSES/nime-*` |
| [LLVM-MinGW](https://github.com/mstorsjo/llvm-mingw)、LLVM／libc++、mingw-w64 contributors | 原生 DLL 的編譯工具與靜態執行期 | 完整工具鏈通知保留於 `LICENSES/LLVM-runtime.txt`；編譯器不放進安裝包 |

## 操作參考與沒有重新散布的內容

- 介面與 CapsLock 操作習慣參考 macOS／iOS；**沒有散布 Apple Color Emoji 字型、Apple 原始圖像或系統程式碼**。
- 微軟注音與新酷音用於操作比較、相容性與回復測試；本專案的注音引擎仍是 McBopomofoWeb。感謝 [libchewing／新酷音](https://github.com/chewing/libchewing) 社群；若 PIME 官方前置安裝程式安裝它，依該官方發行包的授權處理。
- Windows、.NET Framework、Segoe UI／Microsoft JhengHei 字型與 Windows SDK 為系統或開發環境提供，不隨本專案重新散布。SDK headers 由開發者自行取得，並未改成 GPL 或 MIT。

## 授權範圍與對應原始碼

本專案新增的安裝／整合程式碼與輔助程式採 GPL-2.0。上游 MIT／LGPL 原始檔、版權標頭與各元件的授權維持原狀；CJKVI／CHISE 拆字資料及其衍生資料保留 GPLv2 義務。Node.js 和其他獨立元件按各自授權散布。

修改後的 TypeScript／C++／C#、原始資料、建置腳本與版本基準均隨 GitHub 原始碼提供；Release 同時附本版的來源壓縮檔。`upstream/UPSTREAM.json` 記錄來源與 commit。請保留這份文件及 `LICENSES/`，勿將整個發行包標示成僅採 MIT。
