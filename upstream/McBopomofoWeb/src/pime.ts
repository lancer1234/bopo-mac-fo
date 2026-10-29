/**
 * @license
 * Copyright (c) 2022 and onwards The McBopomofo Authors.
 * This code is released under the MIT license.
 * SPDX-License-Identifier: MIT
 * The main entrance of the IME for ChromeOS.
 */

/// <reference lib="es2021.weakref" />
import child_process from "child_process";
import fs from "fs";
import { List } from "lodash";
import path from "path";
import process from "process";

import {
  InputController,
  MovingCursorOption,
} from "./McBopomofo/InputController";
import { Empty, Inputting, NotEmpty } from "./McBopomofo/InputState";
import { InputUI } from "./McBopomofo/InputUI";
import { KeyFromKeyboardEvent, VK_Keys } from "./pime_keys";
import { characterInfo } from "./PimeCharacterData";
import { paletteEmojis } from "./PimeEmojiCatalog";

/**
 * The McBopomofo Settings.
 * @interface
 */
interface Settings {
  input_mode: string;
  /** The font size of the candidate window. */
  candidate_font_size: number;
  /** Font family used by the Windows candidate window. */
  candidate_font_name: string;
  /**
   * The keyboard layout.
   * @remarks
   * Valid options: "Standard", "Hsu", "ETen", "ETen26", "IBM", "HanyuPinyin"
   */
  layout: string;
  /**
   * The selection phrase.
   * @remarks
   * Valid options: "before_cursor" and "after_cursor".
   */
  select_phrase: string;
  /** The candidate keys like "123456789", "asdfghjkl" and so on. */
  candidate_keys: string;
  /** The number of candidate keys. */
  candidate_keys_count: number;
  /** Whether ESC key clears all of the composing buffer. */
  esc_key_clear_entire_buffer: boolean;
  /** Whether to use jk key to move cursor. */
  moving_cursor_option: MovingCursorOption;
  /** Whether Shift key toggles the BPMF/Alphabet mode. */
  shift_key_toggle_alphabet_mode: boolean;
  /** Whether Traditional/Simplified Chinese conversion is on. */
  chineseConversion: boolean;
  /**
   * Whether the input method moves the cursor to the place of the end of the
   * selected candidate.
   * @remarks
   * Only works when select_phrase is "after_cursor"
   */
  move_cursor: boolean;
  /** Inputs upper case or lower case letters when shift key is pressed. */
  letter_mode: string;
  /**
   * Whether input half width punctuation instead of default full width
   * punctuation.
   */
  half_width_punctuation: boolean;
  /** Whether the input method is deactivated on Windows 8 and above. */
  by_default_deactivated: boolean;
  /** Whether prompts sound alerts when a user inputs invalid keys. */
  beep_on_error: boolean;
  /** The behavior for handling Ctrl+ Enter key. */
  ctrl_enter_option: number;
  /** Whether to use repeated punctuation to choose candidate. */
  repeated_punctuation_choose_candidate: boolean;
  /** Whether BPMF font annotation support is enabled. */
  bopomofo_font_annotation_support_enabled: boolean;
}

/**
 * A middle data structure between McBopomofo input controller and PIME.
 * @interface
 */
interface UiState {
  /** The string to be committed. */
  commitString: string;
  /** The composition string. */
  compositionString: string;
  /** The cursor position in the composition string. */
  compositionCursor: number;
  /** Whether to show the candidate window. */
  showCandidates: boolean;
  /** The list of candidates. */
  candidateList: List<string>;
  /** The cursor position in the candidate list. */
  candidateCursor: number;
  /** The message to be shown. */
  showMessage: any;
  /** Whether to hide the message. */
  hideMessage: boolean;
}

/**  The default settings. */
const defaultSettings: Settings = {
  input_mode: "use_mcbopomofo",
  candidate_font_size: 16,
  candidate_font_name: "Microsoft JhengHei UI",
  layout: "standard",
  select_phrase: "before_cursor",
  candidate_keys: "123456789",
  candidate_keys_count: 9,
  esc_key_clear_entire_buffer: false,
  shift_key_toggle_alphabet_mode: true,
  chineseConversion: false,
  move_cursor: true,
  letter_mode: "upper",
  half_width_punctuation: false,
  by_default_deactivated: false,
  beep_on_error: true,
  ctrl_enter_option: 0,
  moving_cursor_option: MovingCursorOption.Disabled,
  repeated_punctuation_choose_candidate: false,
  bopomofo_font_annotation_support_enabled: false,
};

/**
 * The commands for PIME McBopomofo.
 * @enum
 */
enum PimeMcBopomofoCommand {
  Separator = 0,
  ModeIcon = 1,
  SwitchLanguage = 2,
  OpenHomepage = 3,
  OpenBugReport = 4,
  OpenOptions = 5,
  EditUserPhrase = 6,
  OpenUserPhrase = 7,
  OpenExcludedPhrase = 8,
  ToggleChineseConversion = 9,
  ToggleHalfWidthPunctuation = 10,
  Help = 11,
  OpenMcBopomofoUserDataFolder = 12,
  ReloadUserPhrase = 13,
  ToggleBpmfFontAnnotationSupport = 14,
}

/** Wraps InputController and required states.  */
class PimeMcBopomofo {
  /** Active candidate information tab: frequency, radical, emoji, decomposition. */
  candidateTab = 0;
  /** Literal reading appended after ordinary Chinese candidates. */
  readingChoice: { reading: string; text: string; index: number } | undefined;
  /** Unmodified engine candidates retained while viewing information tabs. */
  baseCandidateState: UiState | undefined;
  /** Emoji page offset. */
  emojiPage = 0;
  /** Emoji choices; paging uses Page Up and Page Down. */
  paletteBank = 0;
  readonly emojis = ["😀","🙂","😂","🥰","😍","😎","😭","👍","🙏","❤️","🎉","✨","🔥","💪","👌","🤔","😅","🥹","😊","😴","😡","😱","👀","✅","❌","💯","👏"];
  /** The input controller. */
  readonly inputController: InputController;
  /** The UI state. */
  uiState: UiState = {
    commitString: "",
    compositionString: "",
    compositionCursor: 0,
    showCandidates: false,
    candidateList: [],
    candidateCursor: 0,
    showMessage: {},
    hideMessage: true,
  };
  /** The settings in memory. */
  settings: Settings = { ...defaultSettings };
  /**
   * Whether the input method is in Alphabet mode or Chinese mode. True for
   * Alphabet mode, false for Chinese mode.
   */
  isAlphabetMode: boolean = false;
  /** The last request from PIME. */
  lastRequest: any = {};
  /** Whether the last key down event was handled. */
  isLastFilterKeyDownHandled: boolean = false;
  /** Whether the input method is opened. */
  isOpened: boolean = true;
  /**
   * Helps to remember if Shift key is pressed on when key down event is
   * triggered. It would be reset on key on.
   */
  isShiftHold: boolean = false;

  constructor() {
    this.inputController = new InputController(this.makeUI(this));
    this.inputController.setUserVerticalCandidates(true);
    this.inputController.setOnOpenUrl((url: string) => {
      const command = `start "" "${url}"`;
      child_process.exec(command);
    });
    this.inputController.setOnPhraseChange((map: Map<string, string[]>) => {
      this.writeUserPhrases(map);
    });
    this.inputController.setOnExcludedPhraseChange(
      (map: Map<string, string[]>) => {
        this.writeExcludedPhrases(map);
      },
    );
    this.inputController.setOnError(() => {
      if (this.settings.beep_on_error) {
        child_process.exec(`rundll32 user32.dll,MessageBeep`);
      }
    });
    this.loadSettings(() => {
      this.isOpened = !this.settings.by_default_deactivated;
    });

    this.loadUserPhrases();
  }

  /** Resets the UI state before handling a key. */
  public resetBeforeHandlingKey(): void {
    this.isLastFilterKeyDownHandled = false;
    this.uiState = {
      commitString: "",
      compositionString: "",
      compositionCursor: 0,
      showCandidates: false,
      candidateList: [],
      candidateCursor: 0,
      showMessage: {},
      hideMessage: true,
    };
  }

  /** Resets the input controller. */
  public resetController(): void {
    this.inputController.reset();
  }

  /** The path to the PIME user data folder. */
  readonly pimeUserDataPath: string = path.join(
    process.env.APPDATA || "",
    "PIME",
  );

  /** The path to the McBopomofo user data folder. */
  readonly mcBopomofoUserDataPath: string = path.join(
    this.pimeUserDataPath,
    "mcbopomofo",
  );

  /** The path to the user phrases file. */
  readonly userPhrasesPath: string = path.join(
    this.mcBopomofoUserDataPath,
    "data.txt",
  );

  /** The path to the excluded phrases file. */
  readonly excludedPhrasesPath: string = path.join(
    this.mcBopomofoUserDataPath,
    "exclude-phrases.txt",
  );

  /** The path to the user settings file. */
  readonly userSettingsPath: string = path.join(
    this.mcBopomofoUserDataPath,
    "config.json",
  );

  /** Loads user phrases from disk. */
  public loadUserPhrases(): void {
    fs.readFile(this.userPhrasesPath, (err, data) => {
      if (err) {
        console.error(
          "Unable to read user phrases from " + this.userPhrasesPath,
        );
        return;
      }
      try {
        const string = data.toString("utf8");
        this.inputController.setUserPhrases(string);
      } catch {
        console.error("Failed to parse user phrases");
      }
    });

    fs.readFile(this.excludedPhrasesPath, (err, data) => {
      if (err) {
        console.error(
          "Unable to read excluded phrases from " + this.excludedPhrasesPath,
        );
        return;
      }
      try {
        const string = data.toString("utf8");
        this.inputController.setExcludedPhrases(string);
      } catch {
        console.error("Failed to parse user phrases");
      }
    });
  }

  private writeUserPhrases(map: Map<string, string[]>): void {
    if (!fs.existsSync(this.mcBopomofoUserDataPath)) {
      console.log(
        "User data folder not found, creating " + this.mcBopomofoUserDataPath,
      );
      console.log("Creating one");
      fs.mkdirSync(this.mcBopomofoUserDataPath);
    }

    let string = "";
    for (const key of map.keys()) {
      const phrases = map.get(key);
      if (phrases === undefined) {
        continue;
      }
      for (const phrase of phrases) {
        string += phrase + " " + key + "\n";
      }
    }

    console.log("Writing user phrases to " + this.userPhrasesPath);
    fs.writeFile(this.userPhrasesPath, string, (err) => {
      if (err) {
        console.error("Failed to write user phrases");
        console.error(err);
      }
    });
  }

  private writeExcludedPhrases(map: Map<string, string[]>): void {
    if (!fs.existsSync(this.mcBopomofoUserDataPath)) {
      console.log(
        "User data folder not found, creating " + this.mcBopomofoUserDataPath,
      );
      console.log("Creating one");
      fs.mkdirSync(this.mcBopomofoUserDataPath);
    }

    let string = "";
    for (const key of map.keys()) {
      const phrases = map.get(key);
      if (phrases === undefined) {
        continue;
      }
      for (const phrase of phrases) {
        string += phrase + " " + key + "\n";
      }
    }

    console.log("Writing user phrases to " + this.userPhrasesPath);
    fs.writeFile(this.excludedPhrasesPath, string, (err) => {
      if (err) {
        console.error("Failed to write user phrases");
        console.error(err);
      }
    });
  }

  /** Toggles the alphabet mode. */
  public toggleAlphabetMode(): void {
    // Changes the alphabet mode, also commits current composing buffer.
    this.isAlphabetMode = !this.isAlphabetMode;
    this.resetController();
  }

  /** Applies the settings to the input controller. */
  public applySettings(): void {
    const useTraditionalMode = this.settings.input_mode === "use_plainbopomofo";
    this.inputController.setTraditionalMode(useTraditionalMode);
    this.inputController.setKeyboardLayout(this.settings.layout);
    this.inputController.setSelectPhrase(this.settings.select_phrase);
    this.inputController.setCandidateKeys(this.settings.candidate_keys);
    this.inputController.setCandidateKeysCount(
      Math.max(4, this.settings.candidate_keys_count - 1),
    );
    this.inputController.setChineseConversionEnabled(
      this.settings.chineseConversion,
    );
    this.inputController.setEscClearEntireBuffer(
      this.settings.esc_key_clear_entire_buffer,
    );
    this.inputController.setMoveCursorAfterSelection(this.settings.move_cursor);
    this.inputController.setLetterMode(this.settings.letter_mode);
    this.inputController.setHalfWidthPunctuationEnabled(
      this.settings.half_width_punctuation,
    );
    this.inputController.setCtrlEnterOption(this.settings.ctrl_enter_option);
    this.inputController.setMovingCursorOption(
      this.settings.moving_cursor_option,
    );
    this.inputController.setRepeatedPunctuationChooseCandidate(
      this.settings.repeated_punctuation_choose_candidate,
    );
    this.inputController.setBopomofoFontAnnotationSupportEnabled(
      this.settings.bopomofo_font_annotation_support_enabled,
    );
    this.inputController.setLanguageCode("zh-TW");
  }

  /**
   * Load settings from disk.
   * @param callback The callback function.
   */
  public loadSettings(callback: () => void): void {
    fs.readFile(this.userSettingsPath, (err, data) => {
      if (err) {
        console.log(
          "Unable to read user settings from " + this.userSettingsPath,
        );
        this.writeSettings();
        return;
      }
      console.log(data);
      try {
        console.log("Try to load settings");
        const newSettings = JSON.parse(data.toString());
        this.settings = Object.assign({}, defaultSettings, newSettings);
        console.log(
          "Loaded settings: " + JSON.stringify(this.settings, null, 2),
        );
        this.applySettings();
      } catch {
        console.error("Failed to parse settings");
        this.writeSettings();
      }
    });
  }

  /** Write settings to disk */
  public writeSettings() {
    if (!fs.existsSync(this.mcBopomofoUserDataPath)) {
      console.log(
        "User data folder not found, creating " + this.mcBopomofoUserDataPath,
      );
      console.log("Creating one");
      fs.mkdirSync(this.mcBopomofoUserDataPath);
    }

    console.log("Writing user settings to " + this.userSettingsPath);
    const string = JSON.stringify(this.settings, null, 2);
    fs.writeFile(this.userSettingsPath, string, (err) => {
      if (err) {
        console.error("Failed to write settings");
        console.error(err);
      }
    });
  }

  /**
   * Creates an InputUI object.
   * @param instance The PimeMcBopomofo instance.
   * @returns The InputUI object.
   */
  public makeUI(instance: PimeMcBopomofo): InputUI {
    const that: InputUI = {
      reset: () => {
        instance.readingChoice = undefined;
        instance.uiState = {
          // A key may commit text and then redraw its remaining composition.
          commitString: instance.uiState.commitString,
          compositionString: "",
          compositionCursor: 0,
          showCandidates: false,
          candidateList: [],
          candidateCursor: 0,
          showMessage: {},
          hideMessage: true,
        };
      },
      commitString(text: string) {
        const joinedCommitString = instance.uiState.commitString + text;
        instance.uiState = {
          commitString: joinedCommitString,
          compositionString: "",
          compositionCursor: 0,
          showCandidates: false,
          candidateList: [],
          candidateCursor: 0,
          showMessage: {},
          hideMessage: true,
        };
      },
      update(stateString: string) {
        instance.readingChoice = undefined;
        instance.candidateTab = 0;
        instance.baseCandidateState = undefined;
        const state = JSON.parse(stateString);
        const composingBuffer = state.composingBuffer;
        const candidates = state.candidates;
        let selectedIndex = 0;
        let index = 0;
        const candidateList = [];
        for (const candidate of state.candidates) {
          if (candidate.selected) {
            selectedIndex = index;
          }
          candidateList.push(candidate.candidate.displayedText);
          index++;
        }
        if (candidates.length > 0 && /^[\u3105-\u312f]/.test(candidates[0].candidate.reading)) {
          const replacement = instance.inputController.literalReadingReplacement();
          if (replacement) {
            instance.readingChoice = { ...replacement, index: candidateList.length };
            candidateList.push(replacement.reading);
          }
        }

        // Note: McBopomofo's composing buffer are composed by segments so
        // it allows an input method framework to draw underlines
        let compositionString = "";
        for (const item of composingBuffer) {
          compositionString += item.text;
        }

        const tooltip = state.tooltip;
        let showMessage = {};
        let hideMessage = true;
        if (tooltip) {
          showMessage = { message: tooltip, duration: 3 };
          hideMessage = false;
        }

        // Note: A quick fix for the cursor index when BPMF font support is
        // enabled.
        //
        // The cursor index now includes additional control characters, but PIME
        // does not count these characters. We use JavaScript's `for...of`
        // syntax, which correctly iterates over Unicode code points instead of
        // code units, to skip these control characters and recalculate the
        // cursor index for PIME.
        let reportedCursorIndex = state.cursorIndex;
        let subString = compositionString.substring(0, reportedCursorIndex);
        let exactCharacterCount = 0;
        for (let c of subString) {
          exactCharacterCount++;
        }

        const commitString = instance.uiState.commitString;
        instance.uiState = {
          commitString: commitString,
          compositionString: compositionString,
          compositionCursor: exactCharacterCount,
          showCandidates: candidates.length > 0,
          candidateList: candidateList,
          candidateCursor: selectedIndex,
          showMessage: showMessage,
          hideMessage: hideMessage,
        };
      },
    };
    return that;
  }

  /** Whether the button has been added to the UI. */
  alreadyAddButton: boolean = false;
  /** Whether the OS is Windows 8 or above. */
  isWindows8Above: boolean = false;

  /**
   * Creates the button UI response.
   * @returns The button UI response.
   */
  public buttonUiResponse(): any {
    const modeText = this.isOpened && !this.isAlphabetMode ? "中" : "英";
    let windowsModeIcon = "close.ico";
    if (this.isOpened) {
      if (this.isAlphabetMode) {
        windowsModeIcon = "eng.ico";
      } else {
        if (this.settings.chineseConversion) {
          windowsModeIcon = "simC.ico";
        } else {
          windowsModeIcon = "traC.ico";
        }
      }
    }

    const windowsModeIconPath = path.join(__dirname, "icons", windowsModeIcon);
    const settingsIconPath = path.join(__dirname, "icons", "config.ico");
    const object: any = {};

    if (!this.alreadyAddButton) {
      const addButton: any[] = [];
      if (this.isWindows8Above) {
        addButton.push({
          id: "windows-mode-icon",
          text: modeText,
          icon: windowsModeIconPath,
          commandId: PimeMcBopomofoCommand.ModeIcon,
          tooltip: "中英文切換",
        });
      }

      addButton.push({
        id: "switch-lang",
        text: modeText,
        icon: windowsModeIconPath,
        commandId: PimeMcBopomofoCommand.SwitchLanguage,
        tooltip: "中英文切換",
      });
      addButton.push({
        id: "settings",
        icon: settingsIconPath,
        type: "menu",
        tooltip: "設定",
      });
      object.addButton = addButton;
    } else {
      const changeButton: any[] = [];
      if (this.isWindows8Above) {
        changeButton.push({
          icon: windowsModeIconPath,
          id: "windows-mode-icon",
          text: modeText,
        });
      }
      changeButton.push({ icon: windowsModeIconPath, id: "switch-lang", text: modeText });
      object.changeButton = changeButton;
    }
    return object;
  }

  /**
   * Creates the custom UI response.
   * @returns The custom UI response.
   */
  public customUiResponse(): any {
    let fontSize = this.settings.candidate_font_size;
    if (fontSize === undefined) {
      fontSize = 16;
    } else if (fontSize < 10) {
      fontSize = 10;
    } else if (fontSize > 32) {
      fontSize = 32;
    }

    return {
      openKeyboard: this.isOpened,
      customizeUI: {
        candPerRow: 1,
        candFontSize: fontSize,
        candFontName: this.settings.candidate_font_name,
        candUseCursor: true,
      },
      setSelKeys: this.settings.candidate_keys,
      keyboardOpen: this.isOpened,
    };
  }

  /** Creates the user phrases file if it does not exist. */
  public createUserPhrasesIfNotExists(): void {
    if (!fs.existsSync(pimeMcBopomofo.pimeUserDataPath)) {
      fs.mkdirSync(pimeMcBopomofo.pimeUserDataPath);
    }

    if (!fs.existsSync(pimeMcBopomofo.mcBopomofoUserDataPath)) {
      fs.mkdirSync(pimeMcBopomofo.mcBopomofoUserDataPath);
    }

    const userPhrasesUrl = pimeMcBopomofo.userPhrasesPath;
    if (!fs.existsSync(userPhrasesUrl)) {
      fs.writeFileSync(
        userPhrasesUrl,
        "# 一個詞彙一行，格式為：\n# 詞彙 注音\n# 例如：\n# 小麥注音 ㄒㄧㄠˇ-ㄇㄞˋ-ㄓㄨˋ-ㄧㄣ\n",
      );
      console.log("Created empty user phrase file at " + userPhrasesUrl);
    }

    const excludedPhrasesUrl = pimeMcBopomofo.excludedPhrasesPath;
    if (!fs.existsSync(excludedPhrasesUrl)) {
      fs.writeFileSync(
        excludedPhrasesUrl,
        "# 一個詞彙一行，格式為：\n# 詞彙 注音\n# 例如：\n# 小麥注音 ㄒㄧㄠˇ-ㄇㄞˋ-ㄓㄨˋ-ㄧㄣ\n",
      );
      console.log("Created empty user phrase file at " + excludedPhrasesUrl);
    }
  }

  /**
   * Handles a command.
   * @param id The command ID.
   */
  public handleCommand(id: PimeMcBopomofoCommand): void {
    switch (id) {
      case PimeMcBopomofoCommand.ModeIcon:
      case PimeMcBopomofoCommand.SwitchLanguage:
        {
          if (this.isOpened === false) {
            return;
          }
          this.toggleAlphabetMode();
        }
        break;
      case PimeMcBopomofoCommand.OpenHomepage:
        {
          const url = "https://mcbopomofo.openvanilla.org/";
          const command = `start ${url}`;
          console.log("Run " + command);
          child_process.exec(command);
        }
        break;
      case PimeMcBopomofoCommand.OpenBugReport:
        {
          const url = "https://github.com/openvanilla/McBopomofoWeb/issues";
          const command = `start ${url}`;
          console.log("Run " + command);
          child_process.exec(command);
        }
        break;
      case PimeMcBopomofoCommand.OpenOptions:
        {
          this.createUserPhrasesIfNotExists();
          const python3 = path.join(
            __dirname,
            "..",
            "..",
            "..",
            "python",
            "python3",
            "python.exe",
          );
          const script = path.join(__dirname, "config_tool.py");
          const command = `"${python3}" "${script}"`;
          console.log("Run " + command);
          child_process.exec(command);
        }
        break;
      case PimeMcBopomofoCommand.EditUserPhrase:
        {
          this.createUserPhrasesIfNotExists();
          const python3 = path.join(
            __dirname,
            "..",
            "..",
            "..",
            "python",
            "python3",
            "python.exe",
          );
          const script = path.join(__dirname, "config_tool.py");
          const command = `"${python3}" "${script}" user_phrases`;
          console.log("Run " + command);
          child_process.exec(command);
        }
        break;
      case PimeMcBopomofoCommand.OpenUserPhrase:
        {
          this.createUserPhrasesIfNotExists();
          const url = pimeMcBopomofo.userPhrasesPath;
          const command = `start ${url}`;
          console.log("Run " + command);
          child_process.exec(command);
        }
        break;
      case PimeMcBopomofoCommand.OpenExcludedPhrase:
        {
          this.createUserPhrasesIfNotExists();
          const url = pimeMcBopomofo.excludedPhrasesPath;
          const command = `start ${url}`;
          console.log("Run " + command);
          child_process.exec(command);
        }
        break;
      case PimeMcBopomofoCommand.ToggleChineseConversion:
        pimeMcBopomofo.settings.chineseConversion =
          !pimeMcBopomofo.settings.chineseConversion;
        pimeMcBopomofo.applySettings();
        pimeMcBopomofo.writeSettings();
        break;
      case PimeMcBopomofoCommand.ToggleHalfWidthPunctuation:
        pimeMcBopomofo.settings.half_width_punctuation =
          !pimeMcBopomofo.settings.half_width_punctuation;
        pimeMcBopomofo.applySettings();
        pimeMcBopomofo.writeSettings();
        break;
      case PimeMcBopomofoCommand.Help:
        {
          const python3 = path.join(
            __dirname,
            "..",
            "..",
            "..",
            "python",
            "python3",
            "python.exe",
          );
          const script = path.join(__dirname, "config_tool.py");
          const command = `"${python3}" "${script}" help`;
          console.log("Run " + command);
          child_process.exec(command);
        }
        break;
      case PimeMcBopomofoCommand.OpenMcBopomofoUserDataFolder: {
        if (!fs.existsSync(pimeMcBopomofo.mcBopomofoUserDataPath)) {
          fs.mkdirSync(pimeMcBopomofo.mcBopomofoUserDataPath);
        }
        const url = pimeMcBopomofo.mcBopomofoUserDataPath;
        const command = `start ${url}`;
        console.log("Run " + command);
        child_process.exec(command);
        break;
      }
      case PimeMcBopomofoCommand.ReloadUserPhrase:
        {
          pimeMcBopomofo.loadUserPhrases();
        }
        break;
      case PimeMcBopomofoCommand.ToggleBpmfFontAnnotationSupport: {
        let currentSetting =
          pimeMcBopomofo.settings.bopomofo_font_annotation_support_enabled;
        pimeMcBopomofo.settings.bopomofo_font_annotation_support_enabled =
          !currentSetting;
        pimeMcBopomofo.applySettings();
        pimeMcBopomofo.writeSettings();
      }
      default:
        break;
    }
  }
}

let pimeMcBopomofo = new PimeMcBopomofo();
// Installed PIME uses Node 22. Weak references avoid retaining disconnected apps.
const pimeClients = new Set<WeakRef<PimeMcBopomofo>>([new WeakRef(pimeMcBopomofo)]);
const livePimeClients = (): PimeMcBopomofo[] => {
  const clients: PimeMcBopomofo[] = [];
  for (const reference of pimeClients) {
    const client = reference.deref();
    if (client) clients.push(client);
    else pimeClients.delete(reference);
  }
  return clients;
};

try {
  pimeMcBopomofo.createUserPhrasesIfNotExists();

  if (!fs.existsSync(pimeMcBopomofo.userSettingsPath)) {
    fs.writeFileSync(
      pimeMcBopomofo.userSettingsPath,
      JSON.stringify(defaultSettings),
    );
  }

  fs.watch(pimeMcBopomofo.userSettingsPath, (event, filename) => {
    if (filename) {
      for (const client of livePimeClients()) client.loadSettings(() => {});
    }
  });

  fs.watch(pimeMcBopomofo.userPhrasesPath, (event, filename) => {
    if (filename) {
      for (const client of livePimeClients()) client.loadUserPhrases();
    }
  });

  fs.watch(pimeMcBopomofo.excludedPhrasesPath, (event, filename) => {
    if (filename) {
      for (const client of livePimeClients()) client.loadUserPhrases();
    }
  });
} catch (e) {
  console.error(e);
}

module.exports = {
  textReducer(_: any, preState: any) {
    // Note: textReducer and response are the pattern of NIME. Actually, PIME
    // only care about the response. Since we let pimeMcBopomofo to do
    // everything, we just left textReducer as an empty implementation to let
    // NIME to call it.
    return preState;
  },

  response(request: any, clientState: any) {
    // NIME supplies one state object per pipe connection. Sharing the engine
    // across connections leaks mode, composition and duplicate-key probes.
    if (clientState) {
      if (!clientState.mcbopomofo) {
        clientState.mcbopomofo = new PimeMcBopomofo();
        pimeClients.add(new WeakRef(clientState.mcbopomofo));
      }
      pimeMcBopomofo = clientState.mcbopomofo;
    }
    const lastRequest = pimeMcBopomofo.lastRequest;
    pimeMcBopomofo.lastRequest = request;
    const responseTemplate = {
      return: false,
      success: true,
      seqNum: request.seqNum,
    };
    if (request.method === "init") {
      // This customization targets Windows 10/11, regardless of the host's manifest.
      pimeMcBopomofo.isWindows8Above = true;
      pimeMcBopomofo.alreadyAddButton = false;
      const response = Object.assign({}, responseTemplate);
      return response;
    }
    if (request.method === "close") {
      const response = Object.assign({}, responseTemplate, {});
      return response;
    }

    if (request.method === "onActivate") {
      const customUi = pimeMcBopomofo.customUiResponse();
      const buttonUi = pimeMcBopomofo.buttonUiResponse();
      pimeMcBopomofo.alreadyAddButton = true;
      const response = Object.assign({}, responseTemplate, customUi, buttonUi);
      return response;
    }

    if (request.method === "onDeactivate") {
      const response = Object.assign({}, responseTemplate, {
        removeButton: ["windows-mode-icon", "switch-lang", "settings"],
      });
      pimeMcBopomofo.alreadyAddButton = false;
      return response;
    }

    if (request.method === "onPreservedKey") {
      console.log(request);
      const response = Object.assign({}, responseTemplate);
      return response;
    }

    if (request.method === "filterKeyUp") {
      const state = pimeMcBopomofo.inputController.state;
      const handled = state instanceof Empty === false || pimeMcBopomofo.isShiftHold;
      if (
        lastRequest &&
        lastRequest.method === "filterKeyUp" &&
        lastRequest.keyCode === request.keyCode
      ) {
        // NOTE: Some app, like MS Word, may send repeated key up event.
        // We should ignore such events.
        const response = Object.assign({}, responseTemplate, {
          return: handled,
        });
        return response;
      }

      if (pimeMcBopomofo.isShiftHold) {
        // Only onKeyUp has an editable TSF session for committing pending text.
        return Object.assign({}, responseTemplate, { return: true });
      }
      let response = Object.assign({}, responseTemplate, {
        return: handled,
      });
      return response;
    }

    if (request.method === "onKeyUp") {
      if (pimeMcBopomofo.isShiftHold) {
        pimeMcBopomofo.isShiftHold = false;
        pimeMcBopomofo.resetBeforeHandlingKey();
        pimeMcBopomofo.toggleAlphabetMode();
        return Object.assign({}, responseTemplate,
          pimeMcBopomofo.customUiResponse(),
          pimeMcBopomofo.buttonUiResponse(),
          pimeMcBopomofo.uiState, { return: true });
      }
    }

    if (request.method === "filterKeyDown") {
      if (
        lastRequest &&
        lastRequest.method === "filterKeyDown" &&
        lastRequest.keyCode === request.keyCode
      ) {
        // NOTE: Some app, like MS Word, may send repeated key down event.
        // We should ignore such events.
        const response = Object.assign({}, responseTemplate, {
          return: pimeMcBopomofo.isLastFilterKeyDownHandled,
        });
        return response;
      }

      const { keyCode, charCode, keyStates } = request;

      // The non-activating local emoji palette relays F19 with a one-based
      // scan code, so complete Unicode strings commit in one TSF edit session.
      if (keyCode === 131) {
        pimeMcBopomofo.paletteBank = Number.isInteger(request.scanCode) && request.scanCode >= 0 &&
          request.scanCode <= Math.floor((paletteEmojis.length - 1) / 128) ? request.scanCode : 0;
        pimeMcBopomofo.isLastFilterKeyDownHandled = true;
        return Object.assign({}, responseTemplate, { return: true });
      }
      if (keyCode === 130) {
        const emoji = Number.isInteger(request.scanCode) && request.scanCode >= 1 && request.scanCode <= 128
          ? paletteEmojis[pimeMcBopomofo.paletteBank * 128 + request.scanCode - 1] : undefined;
        pimeMcBopomofo.paletteBank = 0;
        if (emoji) {
          pimeMcBopomofo.resetBeforeHandlingKey();
          pimeMcBopomofo.resetController();
          pimeMcBopomofo.makeUI(pimeMcBopomofo).commitString(emoji);
        }
        pimeMcBopomofo.isLastFilterKeyDownHandled = Boolean(emoji);
        return Object.assign({}, responseTemplate, { return: Boolean(emoji) });
      }

      // The local Caps Lock relay emits F18 for a short press.
      if (keyCode === 129) {
        pimeMcBopomofo.isShiftHold = false;
        pimeMcBopomofo.resetBeforeHandlingKey();
        if (!pimeMcBopomofo.isOpened) {
          pimeMcBopomofo.isOpened = true;
          pimeMcBopomofo.isAlphabetMode = false;
          pimeMcBopomofo.resetController();
        } else {
          pimeMcBopomofo.toggleAlphabetMode();
        }
        pimeMcBopomofo.isLastFilterKeyDownHandled = true;
        return Object.assign({}, responseTemplate, { return: true });
      }

      const ime = pimeMcBopomofo;
      const readingChoice = ime.readingChoice;
      if (readingChoice && ime.uiState.showCandidates && ime.candidateTab === 0 &&
          (keyStates[16] & 128) === 0 && (keyStates[17] & 128) === 0) {
        if (keyCode === 38 || keyCode === 40) {
          const count = ime.uiState.candidateList.length;
          ime.uiState = { ...ime.uiState, commitString: "", candidateCursor:
            (ime.uiState.candidateCursor + (keyCode === 40 ? 1 : count - 1)) % count };
          ime.isLastFilterKeyDownHandled = true;
          return Object.assign({}, responseTemplate, { return: true });
        }
        if (keyCode === 13 && ime.uiState.candidateCursor !== readingChoice.index) {
          const index = ime.uiState.candidateCursor;
          ime.resetBeforeHandlingKey();
          ime.inputController.selectCandidateAtIndex(index);
          ime.isLastFilterKeyDownHandled = true;
          return Object.assign({}, responseTemplate, { return: true });
        }
      }
      if (readingChoice && ime.uiState.showCandidates && ime.candidateTab !== 2 &&
          (keyStates[16] & 128) === 0 && (keyStates[17] & 128) === 0 &&
          ((keyCode === 49 + readingChoice.index) ||
           (keyCode === 13 && ime.uiState.candidateCursor === readingChoice.index))) {
        ime.resetBeforeHandlingKey();
        ime.resetController();
        ime.uiState.commitString = readingChoice.text;
        ime.isLastFilterKeyDownHandled = true;
        return Object.assign({}, responseTemplate, { return: true });
      }
      const tabKey = keyCode >= 124 && keyCode <= 127;
      if ((tabKey && ime.uiState.showCandidates) || ime.candidateTab !== 0) {
        if (!ime.baseCandidateState) ime.baseCandidateState = { ...ime.uiState, commitString: "" };
        const base = ime.baseCandidateState;
        if (tabKey) {
          ime.candidateTab = keyCode - 124;
          ime.emojiPage = 0;
        } else if (keyCode === 27) {
          ime.candidateTab = 0;
        } else if (keyCode === 33 || keyCode === 34) {
          if (ime.candidateTab === 2) ime.emojiPage = (ime.emojiPage + (keyCode === 34 ? 1 : 2)) % 3;
        } else if (keyCode === 38 || keyCode === 40) {
          ime.uiState.candidateCursor = (ime.uiState.candidateCursor + (keyCode === 40 ? 1 : 8)) % ime.uiState.candidateList.length;
        } else if (keyCode === 13 || (keyCode >= 49 && keyCode <= 57 &&
            (keyStates[16] & 128) === 0 && (keyStates[17] & 128) === 0)) {
          const index = keyCode === 13 ? ime.uiState.candidateCursor : keyCode - 49;
          if (index < ime.uiState.candidateList.length) {
            const emoji = ime.emojis[ime.emojiPage * 9 + index];
            const tab = ime.candidateTab;
            ime.resetBeforeHandlingKey();
            if (tab === 2) {
              ime.resetController();
              ime.makeUI(ime).commitString(emoji);
            } else {
              ime.inputController.selectCandidateAtIndex(index);
            }
            ime.candidateTab = 0;
            ime.baseCandidateState = undefined;
          }
          ime.isLastFilterKeyDownHandled = true;
          return Object.assign({}, responseTemplate, { return: true });
        } else {
          ime.uiState = { ...base };
          ime.candidateTab = 0;
          ime.baseCandidateState = undefined;
        }
        if (tabKey || [27,33,34,38,40].includes(keyCode)) {
          const cursor = tabKey ? base.candidateCursor : ime.uiState.candidateCursor;
          let entries = base.candidateList;
          if (ime.candidateTab === 2) entries = ime.emojis.slice(ime.emojiPage * 9, ime.emojiPage * 9 + 9);
          else if (ime.candidateTab === 1 || ime.candidateTab === 3) {
            entries = Array.from(base.candidateList).map((word, index) => index === ime.readingChoice?.index ? word : word + "　" + Array.from(word).map((c) => {
              const info = characterInfo[c];
              return ime.candidateTab === 1 ? (info?.[0] ? info[0] + "部" : "—") : Array.from((info?.[1] || "—").replace(/[⿰-⿻]/g, "").replace(/&[^;]+;/g, "?" )).join(" + ");
            }).join(" · "));
          }
          ime.uiState = { ...base, commitString: "", candidateList: entries,
            candidateCursor: Math.min(cursor, entries.length - 1), showCandidates: true };
          ime.isShiftHold = false;
          ime.isLastFilterKeyDownHandled = true;
          return Object.assign({}, responseTemplate, { return: true });
        }
      }

      // Caps Lock controls English capitalization, never the Chinese mode.
      const normalizedCharCode = !pimeMcBopomofo.isAlphabetMode &&
        (keyStates[VK_Keys.VK_CAPITAL] & 1) !== 0 &&
        (keyStates[VK_Keys.VK_SHIFT] & 128) === 0 && charCode >= 65 && charCode <= 90
        ? charCode + 32 : charCode;
      const key = KeyFromKeyboardEvent(
        keyCode,
        keyStates,
        String.fromCharCode(normalizedCharCode),
        normalizedCharCode,
      );

      // Handles special key combinations for toggling input settings:
      // - Ctrl + Shift + G: Toggles Chinese conversion mode (between
      //   traditional and simplified Chinese)
      // - Ctrl + Shift + H: Toggles half-width punctuation mode
      if (
        key.ctrlPressed &&
        key.shiftPressed &&
        (key.ascii === "G" || key.ascii === "H")
      ) {
        pimeMcBopomofo.isShiftHold = false;
        if (key.ascii === "G") {
          pimeMcBopomofo.settings.chineseConversion =
            !pimeMcBopomofo.settings.chineseConversion;
        } else if (key.ascii === "H") {
          pimeMcBopomofo.settings.half_width_punctuation =
            !pimeMcBopomofo.settings.half_width_punctuation;
        }
        pimeMcBopomofo.applySettings();
        pimeMcBopomofo.writeSettings();
        pimeMcBopomofo.resetController();
        pimeMcBopomofo.isLastFilterKeyDownHandled = true;

        const customUi = pimeMcBopomofo.customUiResponse();
        const buttonUi = pimeMcBopomofo.buttonUiResponse();

        const response = Object.assign(
          {},
          responseTemplate,
          customUi,
          buttonUi,
          {
            return: true,
          },
        );
        return response;
      }

      const isShiftKey = keyCode === VK_Keys.VK_SHIFT ||
        keyCode === VK_Keys.VK_LSHIFT || keyCode === VK_Keys.VK_RSHIFT;
      const isRightShift = keyCode === VK_Keys.VK_RSHIFT ||
        request.scanCode === 54 ||
        ((keyStates[VK_Keys.VK_RSHIFT] & 128) !== 0 &&
          (keyStates[VK_Keys.VK_LSHIFT] & 128) === 0);
      const shouldHandleShift =
        pimeMcBopomofo.settings.shift_key_toggle_alphabet_mode === true &&
        isRightShift && !key.ctrlPressed &&
        (keyStates[VK_Keys.VK_MENU] & 128) === 0;

      // Note: The way we detect if a user is trying to press a single Shift key
      // to toggle Alphabet/Chinese mode, is to check if there is any key other
      // than the Shift key is received before the key up event.
      //
      // We set isShiftHold to true here. It means the user is pressing Shift
      // key only. Then, if there is any other key coming, we will reset
      // isShiftHold. Finally, if isShiftHold is still true in the key up event,
      // we will toggle Alphabet/Chinese.
      if (isShiftKey) {
        pimeMcBopomofo.isShiftHold = shouldHandleShift;
        pimeMcBopomofo.isLastFilterKeyDownHandled = false;
        return Object.assign({}, responseTemplate, { return: false });
      }
      pimeMcBopomofo.isShiftHold = false;

      if (keyCode === VK_Keys.VK_CAPITAL) {
        pimeMcBopomofo.isLastFilterKeyDownHandled = false;
        return Object.assign({}, responseTemplate, { return: false });
      }

      pimeMcBopomofo.resetBeforeHandlingKey();

      if (pimeMcBopomofo.isAlphabetMode) {
        const response = Object.assign({}, responseTemplate, { return: false });
        return response;
      }

      const pendingState = pimeMcBopomofo.inputController.state;
      if (keyCode === 13 && !key.ctrlPressed && !key.shiftPressed &&
          pendingState instanceof Inputting && /[\u3105-\u312f\u31a0-\u31bf]/.test(pendingState.composingBuffer)) {
        // Confirm unfinished readings exactly as displayed instead of rejecting Enter.
        pimeMcBopomofo.resetController();
        pimeMcBopomofo.isLastFilterKeyDownHandled = true;
        return Object.assign({}, responseTemplate, { return: true });
      }

      // Shift follows the upper keyboard legend; Ctrl keeps Chinese punctuation.
      if (key.shiftPressed && !key.ctrlPressed &&
          (keyStates[VK_Keys.VK_MENU] & 128) === 0 &&
          /^[~!@#$%^&*()_+{}|:"<>?]$/.test(key.ascii)) {
        pimeMcBopomofo.resetController();
        pimeMcBopomofo.makeUI(pimeMcBopomofo).commitString(key.ascii);
        pimeMcBopomofo.isLastFilterKeyDownHandled = true;
        return Object.assign({}, responseTemplate, { return: true });
      }

      const handled = pimeMcBopomofo.inputController.mcbopomofoKeyEvent(key);
      pimeMcBopomofo.isLastFilterKeyDownHandled = handled;
      const response = Object.assign({}, responseTemplate, {
        return: handled,
      });
      return response;
    }

    if (request.method === "onKeyDown") {
      if (
        lastRequest &&
        lastRequest.method === "onKeyDown" &&
        lastRequest.keyCode === request.keyCode
      ) {
        // NOTE: Some app, like MS Word, may send repeated key up event.
        // We should ignore such events.
        const response = Object.assign({}, responseTemplate, {
          return: true,
        });
        return response;
      }
      const uiState: any = pimeMcBopomofo.uiState;
      let response = Object.assign({}, responseTemplate, uiState, {
        ...(request.keyCode === 129 ? { openKeyboard: true } : {}),
        ...pimeMcBopomofo.buttonUiResponse(),
        customizeUI: { candTab: pimeMcBopomofo.candidateTab },
        return: pimeMcBopomofo.isLastFilterKeyDownHandled,
      });
      return response;
    }

    if (request.method === "onKeyboardStatusChanged") {
      const { opened } = request;
      pimeMcBopomofo.isOpened = opened;
      pimeMcBopomofo.resetController();
      const customUi = pimeMcBopomofo.customUiResponse();
      const buttonUi = pimeMcBopomofo.buttonUiResponse();
      const response = Object.assign({}, responseTemplate, customUi, buttonUi);
      return response;
    }

    if (request.method === "onCompositionTerminated") {
      pimeMcBopomofo.resetController();
      const uiState = pimeMcBopomofo.uiState;
      const customUi = pimeMcBopomofo.customUiResponse();
      const buttonUi = pimeMcBopomofo.buttonUiResponse();
      const response = Object.assign(
        {},
        responseTemplate,
        uiState,
        customUi,
        buttonUi,
      );
      pimeMcBopomofo.resetBeforeHandlingKey();
      return response;
    }

    if (request.method === "onCommand") {
      const { id } = request;
      pimeMcBopomofo.handleCommand(id);
      const uiState = pimeMcBopomofo.uiState;
      const customUi = pimeMcBopomofo.customUiResponse();
      const buttonUi = pimeMcBopomofo.buttonUiResponse();
      const response = Object.assign(
        {},
        responseTemplate,
        uiState,
        customUi,
        buttonUi,
      );
      return response;
    }

    if (request.method === "onMenu") {
      const menu = [
        {
          text: "小麥注音輸入法網站",
          id: PimeMcBopomofoCommand.OpenHomepage,
        },
        {
          text: "問題回報",
          id: PimeMcBopomofoCommand.OpenBugReport,
        },
        {
          text: "輔助說明",
          id: PimeMcBopomofoCommand.Help,
        },
        {},
        {
          text:
            "簡繁模式：" +
            (pimeMcBopomofo.settings.chineseConversion ? "簡體" : "繁體"),
          id: PimeMcBopomofoCommand.ToggleChineseConversion,
        },
        {
          text:
            "標點模式：" +
            (pimeMcBopomofo.settings.half_width_punctuation ? "半形" : "全形"),
          id: PimeMcBopomofoCommand.ToggleHalfWidthPunctuation,
        },
        {},
        {
          text: "偏好設定 (&O)",
          id: PimeMcBopomofoCommand.OpenOptions,
        },
        {
          text: "編輯使用者詞庫 (&U)",
          id: PimeMcBopomofoCommand.EditUserPhrase,
        },
        {
          text: "用編輯器打開使用者詞庫",
          id: PimeMcBopomofoCommand.OpenUserPhrase,
        },
        {
          text: "用編輯器打開排除的詞彙",
          id: PimeMcBopomofoCommand.OpenExcludedPhrase,
        },
        {
          text: "打開使用者資料夾",
          id: PimeMcBopomofoCommand.OpenMcBopomofoUserDataFolder,
        },
        {
          text: "打開注音字體支援",
          id: PimeMcBopomofoCommand.ToggleBpmfFontAnnotationSupport,
          checked:
            pimeMcBopomofo.settings.bopomofo_font_annotation_support_enabled,
        },
        {},
        {
          text: "小麥注音輸入法 for PIME 2.1.0",
        },
      ];
      const response = Object.assign({}, responseTemplate, { return: menu });
      return response;
    }

    return responseTemplate;
  },
};

