"""Deterministic pet-name search keys. Only Chinese characters are indexed."""
import re

CHINESE = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')
INDEX_METADATA = {
    'generator': 'pypinyin 0.55.0',
    'normalization': 'Remove all non-Chinese characters before conversion',
    'fields': {'full': 'pinyin', 'initials': 'initials'},
}


def chinese_only(name):
    return ''.join(CHINESE.findall(name))


def search_keys(name):
    try:
        from pypinyin import Style, lazy_pinyin
    except ImportError as error:
        raise RuntimeError('Missing pypinyin. Run: py -3 -m pip install -r requirements-maintenance.txt') from error
    text = chinese_only(name)
    if not text:
        raise ValueError('Pet name has no Chinese characters: ' + repr(name))
    syllables = lazy_pinyin(text, style=Style.NORMAL, errors='ignore', strict=False)
    initials = lazy_pinyin(text, style=Style.FIRST_LETTER, errors='ignore', strict=False)
    if len(syllables) != len(text) or len(initials) != len(text):
        raise ValueError('Pinyin conversion incomplete: ' + repr(name))
    return ''.join(syllables).lower(), ''.join(initials).lower()


def add_search_keys(pet):
    pinyin, initials = search_keys(pet['name'])
    return {**pet, 'pinyin': pinyin, 'initials': initials}
