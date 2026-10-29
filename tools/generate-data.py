"""Rebuild derived tables from the source data shipped in data/."""
import json,pathlib,re
root=pathlib.Path(__file__).resolve().parent.parent;data=root/'data';output=root/'upstream/McBopomofoWeb/src'
radicals={}
for line in (data/'CJKRadicals.txt').read_text(encoding='utf-8').splitlines():
    if line and not line.startswith('#'):
        fields=[x.strip() for x in line.split(';')]
        if len(fields)==3:radicals[fields[0]]=chr(int(fields[2],16))
characters={}
for line in (data/'Unihan_IRGSources.txt').read_text(encoding='utf-8').splitlines():
    fields=line.split('\t')
    if len(fields)==3 and fields[1]=='kRSUnicode':
        code=int(fields[0][2:],16)
        if code>0x9fff:continue
        radical=fields[2].split()[0].split('.')[0]
        characters[chr(code)]=[radicals.get(radical,radicals.get(radical.rstrip("'"),'')),'']
for line in (data/'ids.txt').read_text(encoding='utf-8').splitlines():
    fields=line.split('\t')
    if len(fields)>=3 and fields[1] in characters:
        choice=next((x for x in fields[2:] if '[T]' in x),fields[2])
        characters[fields[1]][1]=re.sub(r'\[[^\]]*\]','',choice)
(output/'PimeCharacterData.ts').write_text('// Unicode 17.0 Unihan (Unicode License); CJKVI/CHISE IDS (GPLv2).\nexport const characterInfo: Record<string, string[]> = '+json.dumps(characters,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
emoji=[line.split('\t')[0] for line in (data/'catalog.tsv').read_text(encoding='utf-8').splitlines()]
(output/'PimeEmojiCatalog.ts').write_text('// Unicode 17 emoji-test data; see THIRD_PARTY_NOTICES.md for credits.\nexport const paletteEmojis: readonly string[] = '+json.dumps(emoji,ensure_ascii=False)+';\n',encoding='utf-8')
print(len(characters),'characters;',len(emoji),'emoji sequences')
