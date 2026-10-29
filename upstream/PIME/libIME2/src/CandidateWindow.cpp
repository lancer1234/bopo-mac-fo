//
//    Copyright (C) 2013 - 2020 Hong Jen Yee (PCMan) <pcman.tw@gmail.com>
//
//    This library is free software; you can redistribute it and/or
//    modify it under the terms of the GNU Library General Public
//    License as published by the Free Software Foundation; either
//    version 2 of the License, or (at your option) any later version.
//
//    This library is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
//    Library General Public License for more details.
//
//    You should have received a copy of the GNU Library General Public
//    License along with this library; if not, write to the
//    Free Software Foundation, Inc., 51 Franklin St, Fifth Floor,
//    Boston, MA  02110-1301, USA.
//

#include "CandidateWindow.h"
#include "DrawUtils.h"
#include "TextService.h"
#include "EditSession.h"
#include "CandidateTheme.h"

#include <algorithm>
#include <cassert>

#include <tchar.h>
#include <windows.h>

using namespace std;

namespace Ime {

CandidateWindow::CandidateWindow(TextService* service, EditSession* session):
    ImeWindow(service),
    shown_(false),
    candPerRow_(1),
    textWidth_(0),
    itemHeight_(0),
    currentSel_(0),
    hasResult_(false),
    useCursor_(true),
    selKeyWidth_(0) {

    HWND parent = service->compositionWindow(session);
    create(parent, WS_POPUP|WS_CLIPCHILDREN, WS_EX_TOOLWINDOW|WS_EX_TOPMOST);
    margin_ = CandidateTheme::scaled(hwnd_, 5);
    rowSpacing_ = CandidateTheme::scaled(hwnd_, 0);
    colSpacing_ = CandidateTheme::scaled(hwnd_, 10);
}

CandidateWindow::~CandidateWindow(void) {
}

// ITfUIElement
STDMETHODIMP CandidateWindow::GetDescription(BSTR *pbstrDescription) {
    if (!pbstrDescription)
        return E_INVALIDARG;
    *pbstrDescription = SysAllocString(L"Candidate window~");
    return S_OK;
}

// {BD7CCC94-57CD-41D3-A789-AF47890CEB29}
STDMETHODIMP CandidateWindow::GetGUID(GUID *pguid) {
    if (!pguid)
        return E_INVALIDARG;
    *pguid = { 0xbd7ccc94, 0x57cd, 0x41d3, { 0xa7, 0x89, 0xaf, 0x47, 0x89, 0xc, 0xeb, 0x29 } };
    return S_OK;
}

STDMETHODIMP CandidateWindow::Show(BOOL bShow) {
    shown_ = bShow;
    if (shown_)
        show();
    else
        hide();
    return S_OK;
}

STDMETHODIMP CandidateWindow::IsShown(BOOL *pbShow) {
    if (!pbShow)
        return E_INVALIDARG;
    *pbShow = shown_;
    return S_OK;
}

// ITfCandidateListUIElement
STDMETHODIMP CandidateWindow::GetUpdatedFlags(DWORD *pdwFlags) {
    if (!pdwFlags)
        return E_INVALIDARG;
    /// XXX update all!!!
    *pdwFlags = TF_CLUIE_DOCUMENTMGR | TF_CLUIE_COUNT | TF_CLUIE_SELECTION | TF_CLUIE_STRING | TF_CLUIE_PAGEINDEX | TF_CLUIE_CURRENTPAGE;
    return S_OK;
}

STDMETHODIMP CandidateWindow::GetDocumentMgr(ITfDocumentMgr **ppdim) {
    if (!textService_)
        return E_FAIL;
    return textService_->currentContext()->GetDocumentMgr(ppdim);
}

STDMETHODIMP CandidateWindow::GetCount(UINT *puCount) {
    if (!puCount)
        return E_INVALIDARG;
    *puCount = std::min<UINT>(10, items_.size());
    return S_OK;
}

STDMETHODIMP CandidateWindow::GetSelection(UINT *puIndex) {
    assert(currentSel_ >= 0);
    if (!puIndex)
        return E_INVALIDARG;
    *puIndex = static_cast<UINT>(currentSel_);
    return S_OK;
}

STDMETHODIMP CandidateWindow::GetString(UINT uIndex, BSTR *pbstr) {
    if (!pbstr)
        return E_INVALIDARG;
    if (uIndex >= items_.size())
        return E_INVALIDARG;
    *pbstr = SysAllocString(items_[uIndex].c_str());
    return S_OK;
}

STDMETHODIMP CandidateWindow::GetPageIndex(UINT *puIndex, UINT uSize, UINT *puPageCnt) {
    /// XXX Always return the same single page index.
    if (!puPageCnt)
        return E_INVALIDARG;
    *puPageCnt = 1;
    if (puIndex) {
        if (uSize < *puPageCnt) {
            return E_INVALIDARG;
        }
        puIndex[0] = 0;
    }
    return S_OK;
}

STDMETHODIMP CandidateWindow::SetPageIndex(UINT *puIndex, UINT uPageCnt) {
    /// XXX Do not let app set page indices.
    if (!puIndex)
        return E_INVALIDARG;
    return S_OK;
}

STDMETHODIMP CandidateWindow::GetCurrentPage(UINT *puPage) {
    if (!puPage)
        return E_INVALIDARG;
    *puPage = 0;
    return S_OK;
}

LRESULT CandidateWindow::wndProc(UINT msg, WPARAM wp , LPARAM lp) {
    switch (msg) {
        case WM_PAINT:
            onPaint(wp, lp);
            break;
        case WM_ERASEBKGND:
            return TRUE;
            break;
        case WM_LBUTTONDOWN:
            {
                RECT client; GetClientRect(hwnd_, &client);
                int x = (short)LOWORD(lp), y = (short)HIWORD(lp);
                WORD key = 0;
                int footer = CandidateTheme::scaled(hwnd_, 27);
                if(y >= client.bottom - footer) {
                    int tab = max<int>(0, min<int>(3, (x - margin_) * 4 / max(1L,client.right - 2 * margin_)));
                    key = VK_F13 + tab;
                } else {
                    int row = (y - margin_) / max(1,itemHeight_ + rowSpacing_);
                    if(y >= margin_ && row >= 0 && row < selKeys_.size()) key = selKeys_[row];
                }
                if(key) {
                    INPUT input[2] = {};
                    input[0].type = input[1].type = INPUT_KEYBOARD;
                    input[0].ki.wVk = input[1].ki.wVk = key;
                    input[1].ki.dwFlags = KEYEVENTF_KEYUP;
                    SendInput(2,input,sizeof(INPUT));
                }
            }
            break;
        case WM_MOUSEMOVE:
            onMouseMove(wp, lp);
            break;
        case WM_LBUTTONUP:
            onLButtonUp(wp, lp);
            break;
        case WM_MOUSEACTIVATE:
            return MA_NOACTIVATE;
        default:
            return Window::wndProc(msg, wp, lp);
    }
    return 0;
}

void CandidateWindow::onPaint(WPARAM wp, LPARAM lp) {
    PAINTSTRUCT ps;
    BeginPaint(hwnd_, &ps);
    RECT bounds;
    GetClientRect(hwnd_, &bounds);
    HDC hDC = CreateCompatibleDC(ps.hdc);
    HBITMAP bitmap = CreateCompatibleBitmap(ps.hdc, max(1L,bounds.right), max(1L,bounds.bottom));
    HGDIOBJ oldBitmap = SelectObject(hDC, bitmap);
    CandidateTheme::PaintSession themeSession;
    HFONT oldFont;
    RECT rc;

    oldFont = (HFONT)SelectObject(hDC, font_);

    GetClientRect(hwnd_,&rc);
    ::FillSolidRect(hDC, 0, 0, rc.right, rc.bottom, RGB(36,36,40));
    CandidateTheme::frame(hDC, rc, CandidateTheme::scaled(hwnd_, 14));

    // paint items
    int col = 0;
    int x = margin_, y = margin_;
    for(int i = 0, n = items_.size(); i < n; ++i) {
        paintItem(hDC, i, x, y);
        ++col; // go to next column
        if(col >= candPerRow_) {
            col = 0;
            x = margin_;
            y += itemHeight_ + rowSpacing_;
        }
        else {
            x += colSpacing_ + selKeyWidth_ + textWidth_;
        }
    }
    {
        const wchar_t* labels[] = { L"詞頻",L"部首",L"表情",L"拆字" };
        int footer = CandidateTheme::scaled(hwnd_,27), top = rc.bottom - footer;
        HPEN pen = CreatePen(PS_SOLID,1,RGB(65,65,70));
        HGDIOBJ oldPen = SelectObject(hDC,pen);
        MoveToEx(hDC,1,top,nullptr); LineTo(hDC,rc.right-1,top);
        SelectObject(hDC,oldPen); DeleteObject(pen);
        LOGFONTW style = {}; GetObjectW(font_,sizeof(style),&style);
        style.lfHeight = -MulDiv(9,GetDpiForWindow(hwnd_),72);
        style.lfWidth=0; style.lfCharSet=DEFAULT_CHARSET; style.lfQuality=CLEARTYPE_QUALITY;
        lstrcpynW(style.lfFaceName,L"Microsoft JhengHei UI",LF_FACESIZE);
        HFONT footerFont = CreateFontIndirectW(&style);
        HGDIOBJ previous = SelectObject(hDC,footerFont);
        SetBkMode(hDC,TRANSPARENT);
        for(int tab=0;tab<4;++tab) {
            RECT tabRect = { margin_ + tab*(rc.right-2*margin_)/4, top+4,
                            margin_ + (tab+1)*(rc.right-2*margin_)/4, rc.bottom-4 };
            if(tab == tab_) {
                HBRUSH brush=CreateSolidBrush(RGB(78,78,84));
                HGDIOBJ oldBrush=SelectObject(hDC,brush), outline=SelectObject(hDC,GetStockObject(NULL_PEN));
                RoundRect(hDC,tabRect.left,tabRect.top,tabRect.right,tabRect.bottom,6,6);
                SelectObject(hDC,oldBrush);SelectObject(hDC,outline);DeleteObject(brush);
            }
            SetTextColor(hDC,tab==tab_?RGB(255,255,255):RGB(176,176,184));
            DrawTextW(hDC,labels[tab],-1,&tabRect,DT_CENTER|DT_VCENTER|DT_SINGLELINE|DT_NOPREFIX);
        }
        SelectObject(hDC,previous);DeleteObject(footerFont);
    }
    SelectObject(hDC, oldFont);
    BitBlt(ps.hdc, 0, 0, rc.right, rc.bottom, hDC, 0, 0, SRCCOPY);
    SelectObject(hDC, oldBitmap);
    DeleteObject(bitmap);
    DeleteDC(hDC);
    EndPaint(hwnd_, &ps);
}

void CandidateWindow::recalculateSize() {
    if(items_.empty()) {
        resize(margin_ * 2, margin_ * 2);
        return;
    }

    HDC hDC = ::GetWindowDC(hwnd());
    int height = 0;
    int width = 0;
    selKeyWidth_ = 0;
    textWidth_ = 0;
    itemHeight_ = 0;

    HGDIOBJ oldFont = ::SelectObject(hDC, font_);
    vector<wstring>::const_iterator it;
    for(int i = 0, n = items_.size(); i < n; ++i) {
        SIZE selKeySize;
        int lineHeight = 0;
        // the selection key string
        wchar_t selKey[] = L"?. ";
        selKey[0] = selKeys_[i];
        ::GetTextExtentPoint32W(hDC, selKey, 3, &selKeySize);
        if(selKeySize.cx > selKeyWidth_)
            selKeyWidth_ = selKeySize.cx;

        // the candidate string
        SIZE candidateSize;
        wstring& item = items_.at(i);
        ::GetTextExtentPoint32W(hDC, item.c_str(), item.length(), &candidateSize);
        if(candidateSize.cx > textWidth_)
            textWidth_ = candidateSize.cx;
        int itemHeight = max(candidateSize.cy, selKeySize.cy);
        if(itemHeight > itemHeight_)
            itemHeight_ = itemHeight;
    }
    ::SelectObject(hDC, oldFont);
    ::ReleaseDC(hwnd(), hDC);
    selKeyWidth_ = CandidateTheme::scaled(hwnd_, 22);
    textWidth_ = max(textWidth_ + CandidateTheme::scaled(hwnd_, 14), CandidateTheme::scaled(hwnd_, 54));
    itemHeight_ += CandidateTheme::scaled(hwnd_, 6);

    if(items_.size() <= candPerRow_) {
        width = items_.size() * (selKeyWidth_ + textWidth_);
        width += colSpacing_ * (items_.size() - 1);
        width += margin_ * 2;
        height = itemHeight_ + margin_ * 2;
    }
    else {
        width = candPerRow_ * (selKeyWidth_ + textWidth_);
        width += colSpacing_ * (candPerRow_ - 1);
        width += margin_ * 2;
        int rowCount = items_.size() / candPerRow_;
        if(items_.size() % candPerRow_)
            ++rowCount;
        height = itemHeight_ * rowCount + rowSpacing_ * (rowCount - 1) + margin_ * 2;
    }
    width = max(width,CandidateTheme::scaled(hwnd_,148));
    height += CandidateTheme::scaled(hwnd_,27);
    // Fill the panel width with the selection band, including short candidates.
    textWidth_ = max(textWidth_,width - margin_*2 - selKeyWidth_);
    resize(width, height);
    int radius = CandidateTheme::scaled(hwnd_, 14);
    HRGN region = CreateRoundRectRgn(0, 0, width + 1, height + 1, radius, radius);
    if (!SetWindowRgn(hwnd_, region, TRUE)) DeleteObject(region);
}

void CandidateWindow::setCandPerRow(int n) {
    if(n != candPerRow_) {
        candPerRow_ = n;
        recalculateSize();
    }
}

bool CandidateWindow::filterKeyEvent(KeyEvent& keyEvent) {
    // select item with arrow keys
    int oldSel = currentSel_;
    switch(keyEvent.keyCode()) {
    case VK_UP:
        if(currentSel_ - candPerRow_ >=0)
            currentSel_ -= candPerRow_;
        break;
    case VK_DOWN:
        if(currentSel_ + candPerRow_ < items_.size())
            currentSel_ += candPerRow_;
        break;
    case VK_LEFT:
        if(currentSel_ - 1 >=0)
            --currentSel_;
        break;
    case VK_RIGHT:
        if(currentSel_ + 1 < items_.size())
            ++currentSel_;
        break;
    case VK_RETURN:
        hasResult_ = true;
        return true;
    default:
        return false;
    }
    // if currently selected item is changed, redraw
    if(currentSel_ != oldSel) {
        // repaint the old and new items
        RECT rect;
        itemRect(oldSel, rect);
        ::InvalidateRect(hwnd_, &rect, TRUE);
        itemRect(currentSel_, rect);
        ::InvalidateRect(hwnd_, &rect, TRUE);
        return true;
    }
    return false;
}

void CandidateWindow::setCurrentSel(int sel) {
    if(sel >= items_.size())
        sel = 0;
    if (currentSel_ != sel) {
        currentSel_ = sel;
        if (isVisible())
            ::InvalidateRect(hwnd_, NULL, TRUE);
    }
}

void CandidateWindow::clear() {
    items_.clear();
    selKeys_.clear();
    currentSel_ = 0;
    hasResult_ = false;
}

void CandidateWindow::setUseCursor(bool use) {
    useCursor_ = use;
    if(isVisible())
        ::InvalidateRect(hwnd_, NULL, TRUE);
}

void CandidateWindow::paintItem(HDC hDC, int i,  int x, int y) {
    RECT row = { x, y, x + selKeyWidth_ + textWidth_, y + itemHeight_ };
    CandidateTheme::item(hDC, row, selKeys_[i], items_[i].c_str(), selKeyWidth_,
                         useCursor_ && i == currentSel_, CandidateTheme::scaled(hwnd_, 8));
}

void CandidateWindow::itemRect(int i, RECT& rect) {
    int row, col;
    row = i / candPerRow_;
    col = i % candPerRow_;
    rect.left = margin_ + col * (selKeyWidth_ + textWidth_ + colSpacing_);
    rect.top = margin_ + row * (itemHeight_ + rowSpacing_);
    rect.right = rect.left + (selKeyWidth_ + textWidth_);
    rect.bottom = rect.top + itemHeight_;
}


} // namespace Ime
