#!/usr/bin/env python3
"""Add pinyin search keys to the remote LFS catalog without local data files."""
import argparse
import json
import runpy
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='给远程图鉴补全拼音和拼音首字母；默认只预览')
    parser.add_argument('--repo', default='buaa-yaoqiu/ForestallBear')
    parser.add_argument('--branch', default='master')
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    from pinyin_index import INDEX_METADATA, add_search_keys
    maintenance = runpy.run_path(str(Path(__file__).with_name('maintain-data.py')))
    github = maintenance['GitHub'](args.repo, args.branch)
    github.authorize()
    head = github.head()
    catalog = github.load('data/pets.json', head)
    changed = []
    for index, pet in enumerate(catalog['pets']):
        indexed = add_search_keys(pet)
        if indexed != pet:
            catalog['pets'][index] = indexed
            changed.append(pet['name'])
    metadata_changed = catalog.get('searchIndex') != INDEX_METADATA
    catalog['searchIndex'] = INDEX_METADATA
    print(f'远程基线 {head[:10]}；共 {len(catalog["pets"])} 条，需更新 {len(changed)} 条。')
    if not changed and not metadata_changed:
        print('拼音索引已经完整。')
        return 0
    if not args.publish:
        print('这是预览；加 --publish 才会更新远程 LFS 数据。')
        return 0
    encode = maintenance['encode']
    commit = github.publish(head, {
        'data/pets.json': encode(catalog),
        'data/pets.js': b'globalThis.BEAR_PETS=' + encode(catalog['pets']) + b';',
    })
    verified = github.load('data/pets.json', commit)
    if any(not pet.get('pinyin') or not pet.get('initials') for pet in verified['pets']):
        raise maintenance['RemoteError']('发布后拼音索引校验失败')
    print(f'已校验 {len(verified["pets"])} 条拼音索引。')
    return 0


if __name__ == '__main__':
    sys.stdin.reconfigure(encoding='utf-8-sig')
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        raise SystemExit(main())
    except Exception as error:
        print('停止：' + str(error), file=sys.stderr)
        raise SystemExit(1)
