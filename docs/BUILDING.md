# 從原始碼建置

本庫保留修改後的 McBopomofoWeb、PIME／libIME2／jsoncpp、C# 輔助程式、原始資料與安裝腳本。上游基準見 `upstream/UPSTREAM.json`。建置不需要個人詞庫或開發者電腦上的設定。

## 環境

- Windows x64、PowerShell、.NET Framework 4.8（使用系統的 `csc.exe`）。
- Node.js 22 或更新版本，以及 pnpm 11。前端完整相依版本鎖在 `upstream/McBopomofoWeb/pnpm-lock.yaml`。
- Python 3（只用標準函式庫生成資料與下載公開 PNG）。
- [LLVM-MinGW 20261020 UCRT x86_64](https://github.com/mstorsjo/llvm-mingw/releases/tag/20261020)，解壓縮即可。
- Windows SDK 的 `msctf.h`、`ctffunc.h`、`ctfutb.h`。可使用已安裝 SDK 的 `Include/<version>/um/`，或參考 [Microsoft win32metadata](https://github.com/microsoft/win32metadata/tree/main/generation/WinSDK/RecompiledIdlHeaders/um)。這些標頭的原始授權不因本庫而改變，未隨本庫散布。

## 1. 資料與引擎

```powershell
python tools/generate-data.py
Set-Location upstream/McBopomofoWeb
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec jest src/pime.test.ts --runInBand
pnpm run build:pime
Set-Location ../..
```

產生的 `PimeCharacterData.ts` 包含 GPLv2 拆字資料；保留資料註記與授權。表情順序必須與 `data/catalog.tsv` 一致，因為面板與輸入法以相同索引溝通。

## 2. 原生服務

```powershell
$compiler = 'D:\tools\llvm-mingw-20261020-ucrt-x86_64'
$sdkHeaders = 'C:\Program Files (x86)\Windows Kits\10\Include\<SDK版本>\um'
./tools/build-native.ps1 -Architecture x64 -CompilerRoot $compiler -SdkHeadersDirectory $sdkHeaders
./tools/build-native.ps1 -Architecture x86 -CompilerRoot $compiler -SdkHeadersDirectory $sdkHeaders
```

腳本從 `upstream/PIME/` 編譯，輸出到 `build/native-x64/` 與 `build/native-x86/`。`CompilerCompat.h` 補上 MinGW 的 COM GUID 特化；`ThemeGuids.cpp` 提供所需的 GUID 定義。使用路徑映射避免把開發者家目錄寫入 DLL。

## 3. 執行環境、圖片與安裝包

```powershell
./tools/prepare-runtime.ps1
python tools/download-emoji.py
./tests/Package.Tests.ps1
./tools/build-package.ps1
```

執行環境腳本下載官方 Node.js 22.14.0，依官方 SHA-256 清單驗證；NIME 依 `package-lock.json` 安裝執行期相依。Fluent 圖片依 catalog 內的公開路徑與固定上游 commit 下載，確認 PNG 格式。這些步驟需要網路。

`dist/bopo-mac-fo-0.1.0-windows-x64.zip` 包含 Setup.exe、載入所需的 DLL／Node／圖片、使用教學、授權文件與逐檔 SHA-256 manifest。若重打包，請指定新的輸出目錄；腳本不會自動刪除既有輸出。

## 驗證

- `src/pime.test.ts`：中英狀態、未完成注音、Shift 符號、詞彙／聲調候選、每個輸入連線的狀態隔離、完整表情索引。
- `tests/CapsGestureTest.cs`：500ms 時立即切換、放開不重複、短按與取消。
- `tests/KeyEventTest.cpp`：原生掃描碼擷取。與 `upstream/PIME/libIME2/src/KeyEvent.cpp` 一起編譯，連結 user32。
- `tests/Package.Tests.ps1`：manifest 損壞、缺檔／越界路徑拒絕，以及預設鍵盤設定。
- `installer/Install.ps1 -ValidateOnly`：只驗證解壓後安裝包，不寫登錄、不變更系統。

GitHub Actions 執行 adapter 測試、C# 編譯與安裝腳本檢查；不會在 runner 註冊輸入法或改變機器的輸入設定。

## 發行範圍與限制

本次 0.1.0-preview.1 已驗證 Windows 開發機核心輸入、原生 DLL 載入、CapsLock 邏輯、面板互動、C# 編譯與安裝包完整性。未完成乾淨 Windows VM 的首次安裝／解除安裝測試，也未測試 Windows ARM64、多使用者、每一個應用程式或實體重開機後的啟動行為。不要把 `-ValidateOnly` 當作完整安裝成功證據。

本庫採元件各自授權。發布時保留 `LICENSES/`、`THIRD_PARTY_NOTICES.md`、完整修改後的來源與建置腳本；不要上傳個人 `%APPDATA%/PIME`、個人詞庫、輸入測試紀錄或含帳號的設定快照。
