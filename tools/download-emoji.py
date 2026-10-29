"""Fetch only the public Fluent PNG paths in the checked-in catalog."""
import pathlib,urllib.request,urllib.parse,concurrent.futures
root=pathlib.Path(__file__).resolve().parent.parent
target=root/'runtime/Emoji';target.mkdir(parents=True,exist_ok=True)
revision='1ffb34c752ecf5d402f04cfb4b392c77f57c54bc'
def fetch(item):
    index,line=item;fields=line.split('\t');output=target/(str(index)+'.png')
    if len(fields)<4 or not fields[3]:return 0
    if output.exists() and output.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):return 1
    url='https://raw.githubusercontent.com/microsoft/fluentui-emoji/'+revision+'/'+urllib.parse.quote(fields[3],safe='/')
    data=urllib.request.urlopen(url,timeout=60).read()
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Invalid PNG for '+str(index))
    temp=output.with_suffix('.tmp');temp.write_bytes(data);temp.replace(output);return 1
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    count=sum(pool.map(fetch,enumerate((root/'data/catalog.tsv').read_text(encoding='utf-8').splitlines())))
print('Verified',count,'Fluent emoji images')
