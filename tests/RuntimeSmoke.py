"""Exercise the packaged NIME process using only an isolated temporary profile."""
import json,os,pathlib,queue,subprocess,sys,tempfile,threading
root=pathlib.Path(__file__).resolve().parent.parent
runtime=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'runtime/node'
with tempfile.TemporaryDirectory(prefix='bopomacfo-runtime-') as temporary:
    environment=os.environ.copy();environment['APPDATA']=str(pathlib.Path(temporary)/'Roaming');environment['LOCALAPPDATA']=str(pathlib.Path(temporary)/'Local')
    folder=pathlib.Path(environment['APPDATA'])/'PIME/mcbopomofo';folder.mkdir(parents=True)
    (folder/'config.json').write_text(json.dumps({'shift_key_toggle_alphabet_mode':False,'candidate_keys':'123456789','candidate_keys_count':9,'candidate_font_size':11,'candidate_font_name':'Microsoft JhengHei UI','select_phrase':'before_cursor'}),encoding='utf-8')
    process=subprocess.Popen([str(runtime/'node.exe'),'server.js'],cwd=runtime,env=environment,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
    replies=queue.Queue();sequence=0
    def read():
        for line in process.stdout:
            if line.startswith('PIME_MSG|smoke|'):replies.put(json.loads(line.split('|',2)[2]))
    threading.Thread(target=read,daemon=True).start()
    def send(method,**fields):
        global sequence
        sequence+=1
        request={'method':method,'seqNum':sequence,**fields}
        process.stdin.write('smoke|'+json.dumps(request,ensure_ascii=False)+'\n');process.stdin.flush()
        response=replies.get(timeout=15)
        assert response.get('success'),('unsuccessful request',method)
        assert response.get('seqNum')==sequence,('out-of-order response',method)
        return response
    def key(code,char='',scan=0):
        fields={'keyCode':code,'charCode':ord(char) if char else 0,'scanCode':scan,'keyStates':[0]*256}
        response=send('filterKeyDown',**fields)
        result=send('onKeyDown',**fields) if response.get('return') else None
        if send('filterKeyUp',**fields).get('return'):send('onKeyUp',**fields)
        return result
    try:
        send('init',id='{5340c1d9-706e-4b6b-b022-2e763fa5f674}',isWindows8Above=True,isMetroApp=False,isUiLess=False,isConsole=False)
        send('onActivate',isKeyboardOpen=True)
        key(83,'s');key(85,'u')
        chinese=key(51,'3')
        assert chinese['compositionString']=='你',ascii(chinese)
        for button in chinese.get('changeButton',[]):
            if button.get('icon'):assert pathlib.Path(button['icon']).is_file(),'Missing mode-indicator icon'
        key(131,scan=0)
        assert key(130,scan=1)['commitString']=='你😀'
        key(83,'s');key(85,'u')
        assert key(13)['commitString']=='ㄋㄧ'
        key(129)
        key(131,scan=0)
        assert key(130,scan=10)['commitString']=='❤️'
        assert key(65,'a') is None
        print('PASS packaged NIME runtime: Chinese, unfinished Bopomofo, atomic emoji and English mode')
    finally:
        process.terminate();process.wait(timeout=10)
