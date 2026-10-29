# ㄅㄆMac ㄈ · bopo MAC fo

**Mac-style Bopomofo typing logic, brought to Windows.**

An open-source Windows Traditional Chinese input project by [MAKOTO LAB](https://makotolab.tw/), built on [McBopomofoWeb](https://github.com/openvanilla/McBopomofoWeb) and [PIME](https://github.com/EasyIME/PIME). It is designed for people switching between a Mac and a Windows PC who want a familiar candidate-selection and language-switching workflow.

[Official project page](https://makotolab.tw/projects/bopo-mac-fo/) · [Download the preview](https://github.com/lancer1234/bopo-mac-fo/releases) · [Traditional Chinese guide](QUICKSTART.md) · [Credits and licenses](../THIRD_PARTY_NOTICES.md)

## Features

- Press Down with the cursor after a Chinese character to choose candidates.
- Tap CapsLock to switch Chinese/English; holding it for approximately 500 ms toggles capitalization immediately at the threshold.
- A compact dark candidate window with frequency, radical, emoji and decomposition tabs.
- Enter commits unfinished Bopomofo; a toned phonetic option appears after the Chinese candidates.
- Ctrl + Alt + E opens a floating, searchable emoji palette with 3,944 sequences, including skin-tone and compound variants.
- Preserve pending text when changing language or inserting an emoji.

## Install

Download `bopo-mac-fo-0.1.0-windows-x64.zip` from Releases, extract the whole archive, and run `Setup.exe`. Choose whether to keep other input methods, approve the Windows administrator prompt yourself, and reopen your applications.

Node and the customized native services are bundled. If needed, setup downloads the official PIME prerequisite and verifies its SHA-256. First installation requires Internet access. The preview supports Windows 10/11 x64 and x86 applications on those systems; Windows ARM64 is not supported.

## What this project is

This is a customized integration of McBopomofoWeb and PIME, not Apple's input engine. It shares the PIME McBopomofo profile identifier and updates the shared PIME service. Candidate ordering may differ from the macOS app. The 2,840 matched palette images use Microsoft Fluent Emoji; inserted Unicode characters are rendered by the target application or device. Apple artwork and fonts are not included.

Added integration code is GPL-2.0; upstream MIT/LGPL notices remain intact, and the CJKVI/CHISE-derived IDS data retains its GPLv2 terms. Modified sources, source data, build scripts, credits and license texts are provided. No personal dictionary or typing history is included in the distribution, and typed text is processed locally.

This is a preview. Core behavior, isolated backend startup, native DLL loading, builds and package integrity have been tested; a full clean-Windows installation/uninstallation matrix and all applications have not.
