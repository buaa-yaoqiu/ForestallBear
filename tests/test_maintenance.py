import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('maintenance', pathlib.Path(__file__).parents[1] / 'maintain-data.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.pets = [{'name': name} for name in ['幼兽','幼兽（冬季）','成兽','成兽（冬季）','王兽（首领形态）']]

    def test_self_link_preserves_exact_form(self):
        self.assertEqual(m.resolve_node({'name':'幼兽','href':None}, 'https://wiki.biligame.com/nrc/幼兽（冬季）', self.pets), '幼兽（冬季）')

    def test_lord_alias(self):
        self.assertEqual(m.resolve_node({'name':'王兽','href':'/nrc/王兽'}, '', self.pets), '王兽（首领形态）')

    def test_html_all_branches(self):
        def node(name, href):
            return f'<div class="roco-evo-node"><div class="roco-evo-name-main"><a href="{href}">{name}</a></div><div class="roco-evo-name-sub">二阶</div></div>'
        html = '<div class="roco-evo-timeline is-on">' + node('幼兽','/nrc/幼兽') + node('成兽','/nrc/成兽') + '</div>'
        html += '<div class="roco-evo-timeline">' + node('幼兽','/nrc/幼兽（冬季）') + node('成兽','/nrc/成兽（冬季）') + '</div>'
        page = m.wiki_timelines(m.Document(html).root, 'https://wiki.biligame.com/nrc/成兽')
        self.assertEqual(len(page['chains']), 2)
        out, changed, unknown = m.merge_evolutions({'entries':{}}, [page], self.pets)
        self.assertEqual(out['entries']['成兽（冬季）']['previous'], ['幼兽（冬季）'])
        self.assertFalse(unknown)

    def test_unknown_branch_preserves_old(self):
        old = {'entries':{'成兽':{'previous':['幼兽'],'verified':True}}}
        page = {'url':'', 'chains':[{'nodes':[{'name':'未知','href':'/nrc/未知'}, {'name':'成兽','href':'/nrc/成兽'}]}]}
        new, changed, unknown = m.merge_evolutions(old, [page], self.pets)
        self.assertEqual(new, old)
        self.assertEqual(changed, [])
        self.assertEqual(unknown, ['未知'])

    def test_empty_does_not_erase(self):
        old = {'entries':{'成兽':{'previous':['幼兽'],'verified':True}}}
        self.assertEqual(m.merge_evolutions(old, [], self.pets)[0], old)

    def test_catalog_preserves_indices_and_missing(self):
        old = {'pets':[{'name':'甲','stats':[1]*6},{'name':'乙','stats':[2]*6}]}
        incoming = [{'name':'丙','stats':[3]*6},{'name':'甲','stats':[4]*6}]
        new, added, updated = m.merge_catalog(old, incoming, set())
        self.assertEqual([p['name'] for p in new['pets']], ['甲','乙','丙'])
        self.assertEqual(added, ['丙'])
        self.assertEqual(updated, ['甲'])

    def test_selective_catalog(self):
        old = {'pets':[{'name':'甲','stats':[1]*6}]}
        new, added, _ = m.merge_catalog(old, [{'name':'乙','stats':[2]*6},{'name':'丙','stats':[3]*6}], {'乙'})
        self.assertEqual(added, ['乙'])
        self.assertEqual(len(new['pets']), 2)

    def test_cycle_rejected(self):
        old = {'entries':{'幼兽':{'previous':['成兽'],'verified':True}}}
        page = {'url':'','chains':[{'nodes':[{'name':'幼兽','href':'/nrc/幼兽'},{'name':'成兽','href':'/nrc/成兽'}]}]}
        # Build a second contradictory branch after the first.
        page['chains'].append({'nodes':[{'name':'成兽','href':'/nrc/成兽'},{'name':'幼兽','href':'/nrc/幼兽'}]})
        with self.assertRaises(m.RemoteError):
            m.merge_evolutions(old, [page], self.pets)

    def test_preview_default(self):
        args = m.args_parser().parse_args(['all'])
        self.assertFalse(args.publish)
        self.assertEqual(args.limit, 12)
        self.assertGreaterEqual(args.delay, 2)

    def test_powershell_wrapper_is_ascii_for_windows_powershell(self):
        wrapper = pathlib.Path(__file__).parents[1] / 'maintain-data.ps1'
        wrapper.read_bytes().decode('ascii')

    def test_changed_remote_head_does_not_upload(self):
        github = m.GitHub('example/test', 'master')
        with patch.object(github, 'head', return_value='new'), patch.object(github, 'lfs') as upload:
            with self.assertRaises(m.RemoteError):
                github.publish('old', {'data/test.json': b'{}'})
            upload.assert_not_called()

    def test_lfs_failure_does_not_commit_or_update_ref(self):
        github = m.GitHub('example/test', 'master')
        with patch.object(github, 'head', return_value='old'), patch.object(github, 'call', return_value={'tree': {'sha': 'tree'}}) as call:
            with patch.object(github, 'lfs', side_effect=m.RemoteError('upload failed')):
                with self.assertRaises(m.RemoteError):
                    github.publish('old', {'data/test.json': b'{}'})
            self.assertEqual(call.call_args_list, [unittest.mock.call('/git/commits/old')])

    def test_atomic_publish_uses_lfs_pointer_and_nonforce_ref(self):
        github = m.GitHub('example/test', 'master')
        replies = [{'tree': {'sha': 'oldtree'}}, {'sha': 'blob'}, {'sha': 'tree'}, {'sha': 'commit'}, {}]
        pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 2\n'
        with patch.object(github, 'head', return_value='old'), patch.object(github, 'lfs', return_value=pointer), patch.object(github, 'call', side_effect=replies) as call, patch.object(github, 'load', return_value={}):
            self.assertEqual(github.publish('old', {'data/test.json': b'{}'}), 'commit')
        self.assertEqual(call.call_args_list[1].args[2]['content'], pointer)
        self.assertEqual(call.call_args_list[3].args[2]['parents'], ['old'])
        self.assertEqual(call.call_args_list[4].args[2], {'sha': 'commit', 'force': False})


if __name__ == '__main__':
    unittest.main()
