#include "../upstream/PIME/libIME2/src/KeyEvent.h"
#include <cstdio>
#include <initializer_list>
int main(){for(unsigned int scan: {1u,27u,54u,128u,255u}){Ime::KeyEvent key(WM_KEYDOWN,VK_F19,1|(scan<<16));if(key.scanCode()!=scan){std::printf("FAIL scan code %u became %u\n",scan,key.scanCode());return 1;}}std::puts("PASS native scan-code extraction");}
