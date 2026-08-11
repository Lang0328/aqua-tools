# -*- coding: UTF-8 -*-
from lxml import etree
import requests
import json

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'


def post(url, params):
    header = {'User-Agent': UA}
    res = requests.post(url=url, data=params, headers=header)
    res.encoding = 'utf-8'
    return res.text


def get(url, params=None):
    header = {'User-Agent': UA}
    res = requests.get(url=url, params=params, headers=header)
    res.encoding = 'utf-8'
    return res.text


class biquge:
    def __init__(self):
        self.searchUrl = "http://www.xbiquge.la/modules/article/waps.php"
        self.baseUrl = "http://www.xbiqugu.la"

    def search(self, key):
        page = get(self.searchUrl, {'searchkey': key})
        searchHtml = etree.HTML(page)
        searchList = searchHtml.xpath('//*[@id="checkform"]/table/tr')
        resList = []
        for i in searchList:
            name = i.xpath('td[1]/a/text()')
            if len(name) == 0:
                continue
            name = name[0]
            link = i.xpath('td[1]/a/@href')[0]
            author = i.xpath('td[3]/text()')
            author = author[0] if author else ''
            lastTime = i.xpath('td[4]/text()')
            lastTime = lastTime[0].strip() if lastTime else ''
            item = {'name': name, 'link': link, 'author': author, 'lastTime': lastTime}
            resList.append(item)
        return json.dumps(resList, ensure_ascii=False)

    def page(self, pageUrl):
        html = get(pageUrl)
        _data = etree.HTML(html)
        img = _data.xpath('//*[@id="fmimg"]/img/@src')
        img = img[0] if img else ''
        desc = _data.xpath('//*[@id="intro"]/p[2]/text()')
        desc = desc[0] if desc else ''
        _list = _data.xpath('//*[@id="list"]/dl/dd')
        _listArray = []
        for n in _list:
            name = n.xpath('a/text()')
            link = n.xpath('a/@href')
            if name and link:
                _listArray.append({'name': name[0], 'link': link[0]})
        item = {'img': img, 'desc': desc, 'list': _listArray}
        return json.dumps(item, ensure_ascii=False)

    def content(self, contentUrl):
        url = contentUrl if contentUrl.startswith('http') else self.baseUrl + contentUrl
        html = get(url)
        _data = etree.HTML(html)
        textTmp = ''.join(_data.xpath('//*[@id="content"]//text()'))
        textTmp = textTmp.replace(u'\xa0', u'').strip()
        item = {'str': textTmp}
        return json.dumps(item, ensure_ascii=False)
