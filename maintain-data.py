#!/usr/bin/env python3
"""Maintain remote catalog/evolution LFS data entirely in memory. See MAINTENANCE.md."""
import argparse
import base64
import copy
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

from pinyin_index import INDEX_METADATA, add_search_keys

REPO = 'buaa-yaoqiu/ForestallBear'
TYPES = {'普通','草','火','水','光','地','冰','龙','电','毒','虫','武','翼','萌','幽','恶','机械','幻'}


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


class RemoteError(Exception):
    pass


def request(url, method='GET', headers=None, data=None, missing=False):
    """No downloads/logs/temp files. urllib supports standard proxy environment variables."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https':
        raise RemoteError('拒绝非 HTTPS 请求')
    combined = {'User-Agent': 'ForestallBear-Maintenance/1.0', 'Cache-Control': 'no-cache'}
    combined.update(headers or {})
    if isinstance(data, (dict, list)):
        data = encode(data)
        combined.setdefault('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=combined, method=method), timeout=40) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        if missing and exc.code == 404:
            return None
        raise RemoteError(f'{parsed.hostname} HTTP {exc.code}；请求未完成') from None
    except (urllib.error.URLError, TimeoutError, OSError):
        # Do not print signed upload URLs, headers or credentials in exception text.
        raise RemoteError(f'{parsed.hostname} 连接失败；请检查网络或代理') from None


def read_json(url, **kwargs):
    data = request(url, **kwargs)
    if data is None:
        return None
    try:
        return json.loads(data)
    except (ValueError, UnicodeError):
        raise RemoteError('远程响应不是 JSON（可能是访问限制页或 LFS 指针）') from None


def credential():
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if token:
        return token
    result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                            text=True, encoding='utf-8', capture_output=True,
                            env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'Never'})
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if result.returncode or not fields.get('password'):
        raise RemoteError('未找到 GitHub 凭据。请先在本机登录 Git/GitHub，或设置当前终端的 GH_TOKEN；不要把令牌发给他人。')
    return fields['password']


class GitHub:
    def __init__(self, repo, branch):
        self.repo, self.branch = repo, branch
        self.api = f'https://api.github.com/repos/{repo}'
        self.headers = {}

    def authorize(self):
        self.token = credential()
        self.headers = {'Authorization': 'Bearer ' + self.token, 'Accept': 'application/vnd.github+json'}
        user = read_json('https://api.github.com/user', headers=self.headers)
        print('GitHub 登录账号：' + user['login'])

    def call(self, route, method='GET', data=None):
        return read_json(self.api + route, method=method, data=data, headers=self.headers)

    def head(self):
        return self.call('/git/ref/heads/' + urllib.parse.quote(self.branch, safe='/'))['object']['sha']

    def load(self, path, sha, missing=False):
        url = f'https://media.githubusercontent.com/media/{self.repo}/{sha}/' + urllib.parse.quote(path, safe='/')
        return read_json(url, missing=missing)

    def lfs(self, content):
        oid, size = hashlib.sha256(content).hexdigest(), len(content)
        auth = base64.b64encode(('git:' + self.token).encode()).decode()
        batch = read_json(f'https://github.com/{self.repo}.git/info/lfs/objects/batch', method='POST',
                          headers={'Authorization': 'Basic ' + auth, 'Accept': 'application/vnd.git-lfs+json',
                                   'Content-Type': 'application/vnd.git-lfs+json'},
                          data={'operation': 'upload', 'transfers': ['basic'], 'objects': [{'oid': oid, 'size': size}]})
        obj = batch['objects'][0]
        if obj.get('error'):
            raise RemoteError('LFS 拒绝上传：请检查凭据、额度和仓库权限')
        actions = obj.get('actions', {})
        if 'upload' in actions:
            action = actions['upload']
            request(action['href'], method='PUT', headers=action.get('header', {}), data=content)
        if 'verify' in actions:
            action = actions['verify']
            request(action['href'], method='POST', headers=action.get('header', {}), data={'oid': oid, 'size': size})
        return f'version https://git-lfs.github.com/spec/v1\noid sha256:{oid}\nsize {size}\n'

    def publish(self, head, changes):
        """Upload LFS content, then atomically advance branch with one Git commit."""
        if self.head() != head:
            raise RemoteError('远程分支已变化，请重新运行预览；没有覆盖远程提交')
        tree = self.call('/git/commits/' + head)['tree']['sha']
        items = []
        for path, content in changes.items():
            print(f'上传 LFS：{path}（{len(content):,} bytes）')
            pointer = self.lfs(content)
            blob = self.call('/git/blobs', 'POST', {'content': pointer, 'encoding': 'utf-8'})
            items.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        new_tree = self.call('/git/trees', 'POST', {'base_tree': tree, 'tree': items})
        commit = self.call('/git/commits', 'POST', {'message': 'Maintain pet catalog and wiki evolution chains',
                                                  'tree': new_tree['sha'], 'parents': [head]})
        self.call('/git/refs/heads/' + urllib.parse.quote(self.branch, safe='/'), 'PATCH',
                  {'sha': commit['sha'], 'force': False})
        print('发布完成：https://github.com/' + self.repo + '/commit/' + commit['sha'])
        # Read from the immutable revision; verify the metadata can actually be downloaded.
        for path, content in changes.items():
            if path.startswith('data/') and path.endswith('.json'):
                actual = self.load(path, commit['sha'])
                if actual != json.loads(content):
                    raise RemoteError('发布后的远程数据校验不一致')
        return commit['sha']


class Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children, self.parts = tag, dict(attrs or []), [], []

    def has(self, name):
        return name in self.attrs.get('class', '').split()

    def text(self):
        return ''.join(p.text() if isinstance(p, Node) else p for p in self.parts).strip()

    def find(self, cls):
        return next(iter(self.all(cls)), None)

    def all(self, cls):
        result = [self] if self.has(cls) else []
        for child in self.children:
            result.extend(child.all(cls))
        return result

    def links(self):
        result = [self] if self.tag == 'a' else []
        for child in self.children:
            result.extend(child.links())
        return result


class Document(HTMLParser):
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        self.stack[-1].parts.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack)-1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].parts.append(data)


def wiki_page(url):
    html = request(url).decode('utf-8')
    if any(t in html for t in ['请求已被拦截', '请求已被站点的安全策略拦截', 'Access Restricted']):
        raise RemoteError('WIKI 访问受限：停止请求，不换 IP、账号或自动绕过限制')
    return Document(html).root


def wiki_timelines(doc, url):
    chains = []
    for timeline in doc.all('roco-evo-timeline'):
        nodes = []
        for node in timeline.all('roco-evo-node'):
            main, sub = node.find('roco-evo-name-main'), node.find('roco-evo-name-sub')
            if not main:
                continue
            link = next(iter(main.links()), None)
            nodes.append({'name': main.text(), 'sub': sub.text() if sub else '',
                          'href': link.attrs.get('href') if link else None})
        if nodes:
            chains.append({'nodes': nodes})
    return {'url': url, 'chains': chains}


def resolve_node(node, page_url, pets):
    href = node.get('href') or page_url
    raw = urllib.parse.unquote(urllib.parse.urlparse(href).path.rsplit('/', 1)[-1]) if href else node['name']
    names = {p['name'] for p in pets}
    if raw in names:
        return raw
    if raw + '（首领形态）' in names:
        return raw + '（首领形态）'
    candidates = [p['name'] for p in pets if p['name'].startswith(node['name']+'（')
                  and p['name'].split('（',1)[1].rstrip('）') in node.get('sub','')]
    return candidates[0] if len(candidates) == 1 else None


def merge_evolutions(old, pages, pets):
    edges, unknown = {}, set()
    for page in pages:
        for chain in page.get('chains', []):
            resolved = [resolve_node(n, page.get('url',''), pets) for n in chain['nodes']]
            if any(n is None for n in resolved):
                unknown.update(n['name'] for n, r in zip(chain['nodes'], resolved) if r is None)
                continue  # Never mark a broken chain's middle node as a first stage.
            for index, name in enumerate(resolved):
                edges.setdefault(name, set())
                if index and resolved[index-1] != name:
                    edges[name].add(resolved[index-1])
    result = copy.deepcopy(old)
    entries = result.setdefault('entries', {})
    changed = []
    for name, previous in edges.items():
        entry = {'previous': sorted(previous), 'verified': True}
        if entries.get(name) != entry:
            entries[name] = entry
            changed.append(name)
    # Reject cycles from malformed pages instead of publishing an infinite morph loop.
    visiting, visited = set(), set()
    def visit(name):
        if name in visiting:
            raise RemoteError('进化链存在循环：' + name)
        if name in visited:
            return
        visiting.add(name)
        for parent in entries.get(name, {}).get('previous', []):
            visit(parent)
        visiting.remove(name)
        visited.add(name)
    for name in entries:
        visit(name)
    if changed:
        result.update(source='https://wiki.biligame.com/nrc', retrievedAt=datetime.now(timezone.utc).isoformat(),
                      method='All branches in per-pet evolution timeline; unknown nodes preserve prior snapshot')
    return result, changed, sorted(unknown)


def descendants(node):
    yield node
    for child in node.children:
        yield from descendants(child)


def wiki_catalog(doc, pets):
    names = {p['name'] for p in pets}
    links = {}
    for card in doc.all('npc-card'):
        target = card.find('npc-card-target')
        anchor = next(iter(target.links()), None) if target else None
        if not anchor:
            continue
        title = anchor.attrs.get('title', '')
        url = urllib.parse.urljoin('https://wiki.biligame.com', anchor.attrs.get('href', ''))
        if not title or urllib.parse.urlparse(url).hostname != 'wiki.biligame.com':
            continue
        name = title
        if title + '（首领形态）' in names and title not in names:
            name += '（首领形态）'
        elif card.attrs.get('data-form') == 'lord' and not title.endswith('（首领形态）'):
            name += '（首领形态）'
        if name in links and links[name] != url:
            raise RemoteError('WIKI 索引名称冲突：' + name)
        links[name] = url
    if not links:
        raise RemoteError('WIKI索引卡片结构变化，未找到精灵链接')
    return links


def wiki_pet(doc, name, url):
    values = {}
    for stat in doc.all('roco-stat'):
        label, value = stat.find('roco-stat-name'), stat.find('roco-stat-val')
        if label and value:
            values[label.text()] = int(value.attrs.get('data-val') or value.text())
    labels = ['生命', '攻击', '魔攻', '物防', '魔防', '速度']
    if any(label not in values or not 0 < values[label] < 10000 for label in labels):
        raise RemoteError('WIKI 六维种族值不完整，保留旧条目：' + name)
    ident = doc.find('roco-ident-types')
    types = [n.attrs.get('data-type') or n.text() for n in ident.all('roco-type')] if ident else []
    trait = doc.find('roco-feature-name')
    art = next((n for n in doc.all('roco-art') if n.attrs.get('data-view') == 'pet'), None)
    image = next((n.attrs.get('src') for n in descendants(art) if n.tag == 'img'), None) if art else None
    if not types or not set(types).issubset(TYPES) or not trait or not trait.text():
        raise RemoteError('WIKI 属性或特性缺失，保留旧条目：' + name)
    if not image or urllib.parse.urlparse(image).hostname != 'patchwiki.biligame.com':
        raise RemoteError('WIKI 头像缺失或不在素材域名：' + name)
    if re.search(r'[<>\x00-\x1f]', name + trait.text()):
        raise RemoteError('WIKI 名称／特性字段无效：' + name)
    return {'name': name, 'stats': [values[k] for k in labels], 'types': types,
            'trait': trait.text(), 'image': image, 'wikiSource': url}


def imported_pet(pet, page_url):
    if not isinstance(pet, dict):
        raise RemoteError('浏览器精灵资料格式不正确')
    name, stats, types, trait, image = (pet.get(k) for k in ['name', 'stats', 'types', 'trait', 'image'])
    if not isinstance(name, str) or re.search(r'[<>\x00-\x1f]', name):
        raise RemoteError('浏览器精灵名称无效')
    if not isinstance(stats, list) or len(stats) != 6 or any(type(n) not in [int, float] or not 0 < n < 10000 for n in stats):
        raise RemoteError('浏览器六维种族值不完整：' + name)
    if not isinstance(types, list) or not types or not set(types).issubset(TYPES):
        raise RemoteError('浏览器属性字段无效：' + name)
    if not isinstance(trait, str) or not trait or re.search(r'[<>\x00-\x1f]', trait):
        raise RemoteError('浏览器特性字段无效：' + name)
    if urllib.parse.urlparse(image or '').hostname != 'patchwiki.biligame.com':
        raise RemoteError('浏览器头像不在 WIKI 素材域名：' + name)
    if urllib.parse.urlparse(page_url or '').hostname != 'wiki.biligame.com':
        raise RemoteError('浏览器页面不是指定 WIKI：' + name)
    return {'name': name, 'stats': stats, 'types': types, 'trait': trait,
            'image': image, 'wikiSource': page_url}


def merge_catalog(old, incoming, selected):
    result = copy.deepcopy(old)
    slots = {p['name']: i for i, p in enumerate(result['pets'])}
    additions, updates = [], []
    for pet in incoming:
        pet = add_search_keys(pet)
        if selected and pet['name'] not in selected:
            continue
        if pet['name'] in slots:
            existing = result['pets'][slots[pet['name']]]
            merged = {**existing, **pet}
            if merged != existing:
                result['pets'][slots[pet['name']]] = merged
                updates.append(pet['name'])
        else:
            result['pets'].append(pet)
            additions.append(pet['name'])
    # Preserve removed/missing source records and every existing index for saved configs.
    if additions or updates:
        result.update(count=len(result['pets']), source='https://wiki.biligame.com/nrc',
                      retrievedAt=datetime.now(timezone.utc).isoformat(), searchIndex=INDEX_METADATA)
    return result, additions, updates


def args_parser():
    parser = argparse.ArgumentParser(description='远程维护精灵与WIKI进化链；默认只预览，不下载数据到本地文件')
    parser.add_argument('mode', choices=['pets', 'evolutions', 'all', 'import-wiki', 'check'])
    parser.add_argument('--repo', default=REPO)
    parser.add_argument('--branch', default='master')
    parser.add_argument('--name', action='append', default=[], help='精确精灵名称，可重复；形态括号必须保留')
    parser.add_argument('--limit', type=int, default=12, help='本次最多读取WIKI页面数，默认12')
    parser.add_argument('--delay', type=float, default=3, help='WIKI页面请求间隔秒数，最低2秒')
    parser.add_argument('--refresh', action='store_true', help='重新核对已有精灵／进化链；默认仅补缺')
    parser.add_argument('--refresh-images', action='store_true', help='重取本次指定精灵图片，不指定名字时禁止')
    parser.add_argument('--publish', action='store_true', help='明确发布到远程（非强制推送）')
    parser.add_argument('--allow-partial', action='store_true', help='站点中断时允许发布已完成部分，未完成记录保留')
    return parser


def main():
    args = args_parser().parse_args()
    if args.limit < 1 or args.delay < 2:
        raise RemoteError('--limit 必须大于0，--delay 不能小于2秒')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repo):
        raise RemoteError('仓库格式应为 owner/repository')
    if args.refresh_images and not args.name:
        raise RemoteError('--refresh-images 必须配合 --name，避免意外全量重传')
    github = GitHub(args.repo, args.branch)
    try:
        github.authorize()
    except RemoteError:
        if args.publish:
            raise
    head = github.head()
    old = github.load('data/pets.json', head)
    old_evo = github.load('data/evolutions.json', head)
    catalog, evolutions = copy.deepcopy(old), copy.deepcopy(old_evo)
    if args.mode == 'evolutions':
        missing = set(args.name) - {p['name'] for p in catalog['pets']}
        if missing:
            raise RemoteError('远程图鉴未找到指定精灵，请先添加：' + '、'.join(sorted(missing)))
    print(f'远程基线 {head[:10]}，{len(old["pets"])} 个精灵／形态；{sum(bool(v.get("verified")) for v in old_evo["entries"].values())} 个已核实进化条目')
    if args.mode == 'check':
        print('远程数据读取成功；未保存本地数据。')
        return 0
    additions, updates, evo_changes, warnings, notices = [], [], [], [], []
    changes = {}
    pages, incoming = [], []
    if args.mode == 'import-wiki':
        print('请粘贴浏览器精灵资料／进化链 JSON，完成后发送 EOF（Windows: Enter、Ctrl+Z、Enter）：')
        pages = json.load(sys.stdin)
        if isinstance(pages, dict):
            pages = [pages]
        if not isinstance(pages, list) or not all(isinstance(p, dict) and isinstance(p.get('chains'), list) for p in pages):
            raise RemoteError('进化链 JSON 格式不正确')
        incoming = [imported_pet(page['pet'], page.get('url')) for page in pages if page.get('pet')]
        if not incoming and not any(page['chains'] for page in pages):
            raise RemoteError('没有可导入的精灵资料或进化链')
    elif args.mode in ['pets', 'evolutions', 'all']:
        try:
            index = wiki_page('https://wiki.biligame.com/nrc/' + urllib.parse.quote('精灵图鉴'))
            links = wiki_catalog(index, old['pets'])
            missing = set(args.name) - set(links)
            if missing:
                raise RemoteError('WIKI 索引未找到指定精灵：' + '、'.join(sorted(missing)))
            existing = {p['name']: p for p in old['pets']}
            count = 0
            covered = set()
            for name, url in links.items():
                if args.name and name not in args.name:
                    continue
                pet_needed = args.mode in ['pets', 'all'] and (args.name or args.refresh or not existing.get(name, {}).get('wikiSource'))
                evo_needed = args.mode in ['evolutions', 'all'] and (args.name or args.refresh or not old_evo['entries'].get(name, {}).get('verified'))
                if args.mode == 'evolutions' and name not in existing:
                    continue
                if not pet_needed and (not evo_needed or name in covered):
                    continue
                time.sleep(args.delay)
                doc = wiki_page(url)
                count += 1
                if pet_needed:
                    try:
                        incoming.append(wiki_pet(doc, name, url))
                    except (RemoteError, ValueError) as error:
                        warnings.append(str(error))
                if evo_needed:
                    page = wiki_timelines(doc, url)
                    if page['chains']:
                        pages.append(page)
                        for chain in page['chains']:
                            matches = [resolve_node(n, url, old['pets']) for n in chain['nodes']]
                            if all(matches):
                                covered.update(matches)
                    else:
                        warnings.append('未找到进化链栏（保留旧数据）：' + name)
                print(f'WIKI {count}/{args.limit}：{name}')
                if count >= args.limit:
                    break
        except RemoteError as error:
            warnings.append(str(error))
    if incoming:
        catalog, additions, updates = merge_catalog(old, incoming, set(args.name))
        for pet in catalog['pets']:
            previous = next((p for p in old['pets'] if p['name'] == pet['name']), None)
            if pet['name'] not in {p['name'] for p in incoming}:
                continue
            if previous and pet['image'] == previous.get('image') and not args.refresh_images:
                continue
            path = 'assets/remote/' + hashlib.sha256(pet['image'].encode()).hexdigest()[:16] + '.png'
            pet['portraitPath'] = path
            if args.publish:
                content = request(pet['image'])
                if not content.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise RemoteError('头像不是预期的 PNG：' + pet['name'])
                changes[path] = content
            print('待上传头像：' + pet['name'])
        print(f'精灵：新增 {len(additions)}，更新 {len(updates)}（已有序号不变，缺失条目不删除）')
        for name in additions + updates:
            print('  ' + name)
    if pages:
        evolutions, evo_changes, unmatched = merge_evolutions(old_evo, pages, catalog['pets'])
        messages = ['进化链成员尚未加入图鉴，当前精灵可先发布：' + name for name in unmatched]
        if args.mode == 'import-wiki' and incoming:
            notices.extend(messages)
        else:
            warnings.extend(messages)
    if catalog != old:
        changes['data/pets.json'] = encode(catalog)
        changes['data/pets.js'] = b'globalThis.BEAR_PETS=' + encode(catalog['pets']) + b';'
    if evolutions != old_evo:
        changes['data/evolutions.json'] = encode(evolutions)
    print(f'进化条目变更 {len(evo_changes)}；待发布文件 {len(changes)}')
    for notice in notices:
        print('待补：' + notice)
    for warning in warnings:
        print('注意：' + warning)
    if warnings and args.publish and not args.allow_partial:
        raise RemoteError('存在未完成项，本次未发布；确认接受部分更新后可加 --allow-partial 重跑')
    if not changes:
        print('没有可发布的变化。')
    elif args.publish:
        github.publish(head, changes)
    else:
        print('这是预览；加 --publish 才会上传。图片与数据未写入本地文件。')
    return 1 if warnings and not args.allow_partial else 0


if __name__ == '__main__':
    sys.stdin.reconfigure(encoding='utf-8-sig')
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        raise SystemExit(main())
    except (RemoteError, KeyError, RuntimeError, ValueError, OSError) as error:
        print('停止：' + str(error), file=sys.stderr)
        raise SystemExit(1)
