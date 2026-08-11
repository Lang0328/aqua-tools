import requests, json, urllib.parse, sys
sys.stdout.reconfigure(encoding='utf-8')
base = 'http://127.0.0.1:8088'

r = requests.get(base + '/search/' + urllib.parse.quote('凡人修仙传'))
print('搜索状态', r.status_code)
books = json.loads(r.text)
print('书数', len(books))
for b in books[:3]:
    print('  书:', b['name'], '|', b['link'], '|', b.get('author'))

if books:
    b = books[0]
    pu = base + '/page?url=' + urllib.parse.quote(b['link'])
    pg = json.loads(requests.get(pu).text)
    lst = pg.get('list', [])
    print('\n目录章节数', len(lst), '| 简介:', pg.get('desc', '')[:40])
    if lst:
        c = lst[0]
        print('首章:', c['name'], '|', c['link'])
        cu = base + '/content?link=' + urllib.parse.quote(c['link'])
        ct = json.loads(requests.get(cu).text)
        print('正文长度', len(ct.get('str', '')), '| 片段:', ct.get('str', '')[:120])
