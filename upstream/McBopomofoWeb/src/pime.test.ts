jest.mock("fs", () => ({
  existsSync: jest.fn(() => true),
  readFile: jest.fn((file: string, callback: Function) =>
    callback(null, Buffer.from(file.endsWith("config.json") ? "{}" : "")),
  ),
  readFileSync: jest.fn(() => Buffer.from("{}")),
  watch: jest.fn(),
  writeFile: jest.fn(),
}));

const adapter = (prepare?: () => void) => {
  jest.resetModules();
  prepare?.();
  const service = require("./pime");
  let seqNum = 0;
  const send = (method: string, extra: any = {}) =>
    service.response({ method, seqNum: ++seqNum, ...extra });
  send("init", { isWindows8Above: true });
  send("onActivate", { isKeyboardOpen: true });
  const key = (code: number, char = "", options: any = {}) => {
    const keyStates = Array(256).fill(0);
    if (options.shift) keyStates[16] = 128;
    if (options.shift === "right") keyStates[161] = 128;
    if (options.shift === "left") keyStates[160] = 128;
    if (options.caps) keyStates[20] = 1;
    if (options.ctrl) keyStates[17] = 128;
    const fields = { keyCode: code, charCode: char.charCodeAt(0) || 0,
      scanCode: options.scanCode || 0, keyStates };
    const filterDown = send("filterKeyDown", fields);
    const down = filterDown.return ? send("onKeyDown", fields) : undefined;
    const upFields = { ...fields, keyStates: Array(256).fill(0) };
    const filterUp = send("filterKeyUp", upFields);
    const up = filterUp.return ? send("onKeyUp", upFields) : undefined;
    return { filterDown, down, filterUp, up };
  };
  const type = (text: string, options: any = {}) => {
    let result: any;
    for (const c of text) result = key(c.toUpperCase().charCodeAt(0), c, options);
    return result;
  };
  const shift = (side: string) => key(16, "", { shift: side,
    scanCode: side === "right" ? 54 : 42 });
  return { send, key, type, shift };
};

beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test("initial settings cannot arrive late and erase the first phonetic key", () => {
  const pending: Array<() => void> = [];
  const ime=adapter(() => {
    const fs=require("fs");
    fs.readFile.mockImplementation((file: string,callback: Function) => {
      if(file.endsWith("config.json")) pending.push(() => callback(null,Buffer.from("{}")));
      else callback(null,Buffer.from(""));
    });
  });
  ime.type("s");pending.forEach(complete => complete());
  expect(ime.type("u3").down.compositionString).toBe("你");
});

test("floating emoji relay preserves pending Chinese and language mode", () => {
  const ime=adapter();ime.type("su3cl3");
  const inserted=ime.key(130,"",{scanCode:1}).down;
  expect(inserted.commitString).toBe("你好😀");
  expect(inserted.return).toBe(true);
  expect(ime.type("su3").down.compositionString).toBe("你");
  ime.key(129);
  expect(ime.key(130,"",{scanCode:10}).down.commitString).toBe("❤️");
  expect(ime.type("a").filterDown.return).toBe(false);
});
test("floating emoji relay handles unfinished phonetics and rejects invalid indices", () => {
  const ime=adapter();ime.type("su");
  expect(ime.key(130,"",{scanCode:27}).down.commitString).toBe("ㄋㄧ👏");
  expect(ime.key(130,"",{scanCode:0}).filterDown.return).toBe(false);
  expect(ime.key(130,"",{scanCode:129}).filterDown.return).toBe(false);
});
test("floating emoji relay supports the full catalog beyond the first bank", () => {
  const ime=adapter();const {paletteEmojis}=require("./PimeEmojiCatalog");
  expect(paletteEmojis.length).toBeGreaterThan(3900);
  const index=paletteEmojis.length-1;
  ime.key(131,"",{scanCode:Math.floor(index/128)});
  expect(ime.key(130,"",{scanCode:index%128+1}).down.commitString).toBe(paletteEmojis[index]);
  // Each selection resets the bank so a dropped bank key cannot leak forward.
  expect(ime.key(130,"",{scanCode:1}).down.commitString).toBe("😀");
});

test("right Shift commits pending Chinese through the editable key-up response", () => {
  const ime = adapter();
  ime.type("su3cl3");
  const change = ime.shift("right");
  expect(change.filterUp.return).toBe(true);
  expect(change.up.commitString).toBe("你好");
  expect(ime.type("a").filterDown.return).toBe(false);
});

test("left Shift does not change language", () => {
  const ime = adapter();
  ime.shift("left");
  expect(ime.type("su3").down.compositionString).toBe("你");
});

test("both Shift punctuation shortcuts preserve the pending sentence", () => {
  for (const side of ["left", "right"]) {
    const ime = adapter();
    ime.type("su3cl3");
    const states = Array(256).fill(0);
    states[16] = 128;
    states[side === "right" ? 161 : 160] = 128;
    ime.send("filterKeyDown", {keyCode:16,charCode:0,scanCode:side === "right" ? 54 : 42,keyStates:states});
    expect(ime.key(188, "<", { shift: side }).down.commitString).toBe("你好<");
    ime.send("filterKeyUp", {keyCode:16,charCode:0,scanCode:side === "right" ? 54 : 42,keyStates:Array(256).fill(0)});
    expect(ime.type("su3").down.compositionString).toBe("你");
  }
});

test("Caps Lock keeps Chinese composition and only affects English capitalization", () => {
  const ime = adapter();
  ime.type("su3");
  ime.key(20, "", { caps: true });
  expect(ime.type("CL3", { caps: true }).down.compositionString).toBe("你好");
  ime.shift("right");
  expect(ime.key(65, "A", { caps: true }).filterDown.return).toBe(false);
});

test("candidate UI uses the configured sans-serif font", () => {
  const ime = adapter();
  expect(ime.send("onActivate").customizeUI.candFontName).toBe("Microsoft JhengHei UI");
});

test("Caps Lock plus punctuation preserves pending Chinese exactly once", () => {
  const ime = adapter();
  ime.type("su3cl3");
  ime.key(20, "", { caps: true });
  expect(ime.key(190, ">", { shift: "right", caps: true }).down.commitString).toBe("你好>");
  expect(ime.key(13).down?.commitString).toBeUndefined();
  expect(ime.type("su3").down.compositionString).toBe("你");
});

test("right Shift changes back to Chinese and left Shift keeps English mode", () => {
  const ime = adapter();
  ime.shift("right");
  ime.shift("left");
  expect(ime.type("a").filterDown.return).toBe(false);
  ime.shift("right");
  expect(ime.type("su3").down.compositionString).toBe("你");
});

test("duplicate TSF key-up probes still switch back from empty English mode", () => {
  const ime = adapter();
  ime.shift("right");
  const states = Array(256).fill(0);
  states[16] = states[161] = 128;
  const down = { keyCode: 16, charCode: 0, scanCode: 54, keyStates: states };
  ime.send("filterKeyDown", down);
  const up = { ...down, keyStates: Array(256).fill(0) };
  expect(ime.send("filterKeyUp", up).return).toBe(true);
  expect(ime.send("filterKeyUp", up).return).toBe(true);
  ime.send("onKeyUp", up);
  expect(ime.type("su3").down.compositionString).toBe("你");
});

test("repeated Shift key-down probes leave text pending until key-up", () => {
  const ime = adapter();
  ime.type("su3cl3");
  const states = Array(256).fill(0);
  states[16] = states[161] = 128;
  const fields = { keyCode: 16, charCode: 0, scanCode: 54, keyStates: states };
  expect(ime.send("filterKeyDown", fields).return).toBe(false);
  expect(ime.send("filterKeyDown", fields).return).toBe(false);
  const up = { ...fields, keyStates: Array(256).fill(0) };
  expect(ime.send("filterKeyUp", up).return).toBe(true);
  expect(ime.send("filterKeyUp", up).return).toBe(true);
  expect(ime.send("onKeyUp", up).commitString).toBe("你好");
  expect(ime.send("onKeyUp", up).commitString).toBeUndefined();
});

test.each([[186, ":"], [188, "<"], [190, ">"], [222, '"'], [191, "?"], [49, "!"]])("Shift symbol %s uses the upper keyboard legend", (code, symbol) => {
  const ime = adapter();
  ime.type("su3");
  const result = ime.key(code as number, symbol as string, {shift:"left"});
  expect(result.down.commitString).toBe("你" + symbol);
  expect(result.down.compositionString).toBe("");
  expect(ime.type("su3").down.compositionString).toBe("你");
});

test("Ctrl punctuation retains Chinese punctuation", () => {
  const ime = adapter();
  ime.type("su3");
  ime.key(188, ",", {ctrl:true});
  expect(ime.key(13).down.commitString).toBe("你，");
});

test("Caps relay switches language and commits pending text", () => {
  const ime=adapter();ime.type("su3");
  expect(ime.key(129).down.commitString).toBe("你");
  expect(ime.type("a").filterDown.return).toBe(false);
  ime.key(129);expect(ime.type("su3").down.compositionString).toBe("你");
});
test("radical and decomposition tabs retain selectable original candidates", () => {
  const ime=adapter();ime.type("su3");ime.key(40);
  const radical=ime.key(125).down;
  expect(radical.candidateList[0]).toContain("人部");
  const ids=ime.key(127).down;expect(ids.candidateList[0]).toContain("亻 + 尔");
  ime.key(49,"1");expect(ime.key(13).down.commitString).toBe("你");
});
test("emoji tab inserts a real emoji after pending Chinese", () => {
  const ime=adapter();ime.type("su3");ime.key(40);
  expect(ime.key(126).down.candidateList[0]).toBe("😀");
  expect(ime.key(49,"1").down.commitString).toBe("你😀");
  expect(ime.type("su3").down.compositionString).toBe("你");
});

test("mode indicator text follows the Caps relay", () => {
  const ime=adapter();
  const english=ime.key(129).down;
  expect(english.changeButton.find((b: any)=>b.id==="windows-mode-icon").text).toBe("英");
  const chinese=ime.key(129).down;
  expect(chinese.changeButton.find((b: any)=>b.id==="windows-mode-icon").text).toBe("中");
});
test("Caps relay reopens a disabled IME in Chinese", () => {
  const ime=adapter();ime.key(129);
  ime.send("onKeyboardStatusChanged", {opened:false});
  const recover=ime.key(129).down;
  expect(recover.openKeyboard).toBe(true);
  expect(recover.changeButton.find((b: any)=>b.id==="windows-mode-icon").text).toBe("中");
  expect(ime.type("su3").down.compositionString).toBe("你");
});

test("Enter commits unfinished Bopomofo literally", () => {
  const ime=adapter();ime.type("su");
  expect(ime.key(13).down.commitString).toBe("ㄋㄧ");
  expect(ime.type("su3").down.compositionString).toBe("你");
});
test("Enter preserves Chinese followed by unfinished Bopomofo", () => {
  const ime=adapter();ime.type("su3cl");
  expect(ime.key(13).down.commitString).toBe("你ㄏㄠ");
});

test("toned Bopomofo is the last candidate and preserves sentence context", () => {
  const ime=adapter();ime.type("su3cl3");ime.key(37); // cursor after 你, before 好
  const candidates=ime.key(40).down.candidateList;
  expect(candidates[0]).not.toMatch(/^[ㄅ-ㄯ]/);
  expect(candidates[candidates.length-1]).toContain("ㄋㄧˇ");
  const choose=ime.key(48+candidates.length,String(candidates.length)).down;
  expect(choose.commitString).toContain("ㄋㄧˇ");
  expect(choose.commitString).toContain("ㄏㄠˇ");
});
test("single-character toned reading can be selected without learning it as Chinese", () => {
  const ime=adapter();ime.type("su3");
  const list=ime.key(40).down.candidateList;
  expect(list[list.length-1]).toBe("ㄋㄧˇ");
  expect(ime.key(48+list.length,String(list.length)).down.commitString).toBe("ㄋㄧˇ");
  expect(ime.type("su3").down.compositionString).toBe("你");
});

test("arrow navigation can reach and confirm the final reading option", () => {
  const ime=adapter();ime.type("su3");const list=ime.key(40).down.candidateList;
  for(let i=1;i<list.length;i++)ime.key(40);
  expect(ime.key(13).down.commitString).toBe("ㄋㄧˇ");
});
test("arrow navigation still confirms the highlighted Chinese candidate", () => {
  const ime=adapter();ime.type("su3");ime.key(40);ime.key(40);ime.key(13);
  expect(ime.key(13).down.commitString).toBe("妳");
});
test("reading option makes first and neutral tones explicit", () => {
  for(const [keys,expected] of [["g0 ","ㄕㄢˉ"],["a87","˙ㄇㄚ"]]){
    const ime=adapter();ime.type(keys);const list=ime.key(40).down.candidateList;
    expect(list[list.length-1]).toBe(expected);
  }
});

test("separate Windows input clients do not share language mode or key probes", () => {
  jest.resetModules();const service=require("./pime");let seq=0;
  const a={env:{}},b={env:{}};
  const send=(client:any,method:string,extra:any={})=>service.response({method,seqNum:++seq,...extra},client);
  const key=(client:any,code:number,char:string="")=>{
    const fields={keyCode:code,charCode:char.charCodeAt(0)||0,keyStates:Array(256).fill(0)};
    const filter=send(client,"filterKeyDown",fields);
    const result=filter.return?send(client,"onKeyDown",fields):undefined;
    send(client,"filterKeyUp",fields);return {filter,result};
  };
  send(a,"init",{isWindows8Above:true});send(a,"onActivate");key(a,129);
  send(b,"init",{isWindows8Above:false});
  expect(send(b,"onActivate").addButton.some((v:any)=>v.id==="windows-mode-icon")).toBe(true);
  expect(key(a,65,"a").filter.return).toBe(false);
  key(b,83,"s");key(b,85,"u");expect(key(b,51,"3").result.compositionString).toBe("你");
});
