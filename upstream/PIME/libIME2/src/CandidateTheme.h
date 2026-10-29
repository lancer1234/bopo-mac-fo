#pragma once
#include <windows.h>
#include <gdiplus.h>
#include <string>

namespace Ime { namespace CandidateTheme {
inline int scaled(HWND window, int value) {
    return MulDiv(value, GetDpiForWindow(window), 96);
}
class PaintSession {
    ULONG_PTR token_ = 0;
public:
    PaintSession() { Gdiplus::GdiplusStartupInput input; Gdiplus::GdiplusStartup(&token_, &input, nullptr); }
    ~PaintSession() { if (token_) Gdiplus::GdiplusShutdown(token_); }
};
inline void rounded(HDC dc, const RECT& bounds, int diameter, bool panel) {
    using namespace Gdiplus;
    Graphics graphics(dc);
    graphics.SetSmoothingMode(SmoothingModeAntiAlias);
    const REAL x = bounds.left + 0.5f, y = bounds.top + 0.5f;
    const REAL w = bounds.right - bounds.left - 1.0f, h = bounds.bottom - bounds.top - 1.0f;
    const REAL d = static_cast<REAL>(diameter);
    GraphicsPath path;
    path.AddArc(x,y,d,d,180,90); path.AddArc(x+w-d,y,d,d,270,90);
    path.AddArc(x+w-d,y+h-d,d,d,0,90); path.AddArc(x,y+h-d,d,d,90,90); path.CloseFigure();
    SolidBrush fill(panel ? Color(255,36,36,40) : Color(255,0,102,226));
    graphics.FillPath(&fill,&path);
    if(panel) { Pen border(Color(255,82,82,88),1.0f); graphics.DrawPath(&border,&path); }
}
inline void frame(HDC dc, const RECT& bounds, int radius) {
    rounded(dc,bounds,radius,true);
}
inline bool emoji(HDC dc, const RECT& bounds, const wchar_t* text) {
    static const wchar_t* symbols[] = {L"😀",L"🙂",L"😂",L"🥰",L"😍",L"😎",L"😭",L"👍",L"🙏",L"❤️",L"🎉",L"✨",L"🔥",L"💪",L"👌",L"🤔",L"😅",L"🥹",L"😊",L"😴",L"😡",L"😱",L"👀",L"✅",L"❌",L"💯",L"👏"};
    int index=-1;
    for(int i=0;i<27;++i) if(wcscmp(text,symbols[i])==0){index=i;break;}
    if(index<0)return false;
    wchar_t folder[1024]; DWORD count=GetEnvironmentVariableW(L"LOCALAPPDATA",folder,1024);
    if(!count||count>=1024)return false;
    std::wstring path=std::wstring(folder)+L"\\McBopomofoCustom\\Emoji\\"+std::to_wstring(index)+L".png";
    Gdiplus::Image picture(path.c_str());
    if(picture.GetLastStatus()!=Gdiplus::Ok)return false;
    int side=bounds.bottom-bounds.top-2;
    if(side>24)side=24;
    Gdiplus::Graphics graphics(dc);
    graphics.SetInterpolationMode(Gdiplus::InterpolationModeHighQualityBicubic);
    graphics.DrawImage(&picture,bounds.left+1,bounds.top+(bounds.bottom-bounds.top-side)/2,side,side);
    return true;
}
inline void item(HDC dc, const RECT& bounds, wchar_t key,
                 const wchar_t* text, int keyWidth, bool selected, int radius) {
    int oldMode = SetBkMode(dc, TRANSPARENT);
    COLORREF oldColor = GetTextColor(dc);
    if (selected) {
        rounded(dc,bounds,radius,false);
    }
    HFONT mainFont = (HFONT)GetCurrentObject(dc, OBJ_FONT);
    LOGFONTW numberStyle = {};
    GetObjectW(mainFont, sizeof(numberStyle), &numberStyle);
    numberStyle.lfHeight = MulDiv(numberStyle.lfHeight, 4, 5);
    numberStyle.lfQuality = CLEARTYPE_QUALITY;
    lstrcpynW(numberStyle.lfFaceName, L"Segoe UI", LF_FACESIZE);
    HFONT numberFont = CreateFontIndirectW(&numberStyle);
    if (numberFont) SelectObject(dc, numberFont);
    RECT numberRect = bounds;
    numberRect.right = numberRect.left + keyWidth;
    SetTextColor(dc, selected ? RGB(230, 241, 255) : RGB(157, 157, 165));
    wchar_t number[] = { key, 0 };
    DrawTextW(dc, number, 1, &numberRect, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    SelectObject(dc, mainFont);
    if (numberFont) DeleteObject(numberFont);
    RECT wordRect = bounds;
    wordRect.left += keyWidth;
    wordRect.right -= 8;
    SetTextColor(dc, selected ? RGB(255, 255, 255) : RGB(239, 239, 243));
    if(!emoji(dc,wordRect,text))
        DrawTextW(dc, text, -1, &wordRect, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    SetTextColor(dc, oldColor); SetBkMode(dc, oldMode);
}
} }
