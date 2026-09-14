import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from pinyin_index import INDEX_METADATA, add_search_keys, chinese_only, search_keys


class PinyinIndexTests(unittest.TestCase):
    def test_non_chinese_characters_are_removed(self):
        self.assertEqual(chinese_only('权杖-V（首领形态）123'), '权杖首领形态')

    def test_full_pinyin_and_initials(self):
        self.assertEqual(search_keys('月牙雪熊'), ('yueyaxuexiong', 'yyxx'))

    def test_roman_suffix_is_not_indexed(self):
        self.assertEqual(search_keys('权杖-V'), ('quanzhang', 'qz'))

    def test_pet_fields_are_preserved(self):
        pet = {'name': '圣剑-X', 'stats': [1] * 6}
        indexed = add_search_keys(pet)
        self.assertEqual(indexed['pinyin'], 'shengjian')
        self.assertEqual(indexed['initials'], 'sj')
        self.assertEqual(indexed['stats'], [1] * 6)

    def test_name_without_chinese_is_rejected(self):
        with self.assertRaises(ValueError):
            search_keys('VII-123')

    def test_metadata_documents_reproducible_rule(self):
        self.assertEqual(INDEX_METADATA['generator'], 'pypinyin 0.55.0')
        self.assertEqual(INDEX_METADATA['fields']['initials'], 'initials')


if __name__ == '__main__':
    unittest.main()
