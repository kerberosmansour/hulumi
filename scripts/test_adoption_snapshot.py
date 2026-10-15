"""Synthetic adoption metrics regressions; no packages or network required."""
import importlib.util
import io
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('adoption', Path(__file__).with_name('adoption-snapshot.py'))
adoption = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adoption)

class SnapshotTests(unittest.TestCase):
    def test_crates_aggregates_all_versions_including_extra(self):
        data = {'version_downloads': [{'date': '2026-10-01', 'downloads': 3}, {'date': '2026-10-01', 'downloads': 4}], 'meta': {'extra_downloads': [{'date': '2026-10-01', 'downloads': 5}, {'date': '2026-10-02', 'downloads': 0}]}}
        self.assertEqual(adoption.crates_daily(data), [{'date': '2026-10-01', 'downloads': 12}, {'date': '2026-10-02', 'downloads': 0}])

    def test_missing_extra_or_invalid_count_is_not_zero(self):
        for data in ({'version_downloads': []}, {'version_downloads': [{'date': '2026-10-01', 'downloads': -1}], 'meta': {'extra_downloads': []}}, {'version_downloads': [{'date': 'yesterday', 'downloads': 4}], 'meta': {'extra_downloads': []}}):
            with self.assertRaises(ValueError):
                adoption.crates_daily(data)

    def test_unavailable_source_has_no_fabricated_count(self):
        with patch.object(adoption, 'fetch_json', side_effect=ValueError('bad response')):
            value = adoption.public_metric('npm', '@hulumi/baseline')
        self.assertEqual(value['status'], 'unavailable')
        self.assertNotIn('downloads', value)
        self.assertNotIn('daily', value)

    def test_partial_npm_window_is_not_reported_as_complete(self):
        data = {'package': '@hulumi/baseline', 'start': '2026-10-01', 'end': '2026-10-02', 'downloads': [{'day': '2026-10-01', 'downloads': 2}]}
        with patch.object(adoption, 'fetch_json', return_value=data):
            result = adoption.public_metric('npm', '@hulumi/baseline')
        self.assertEqual(result['status'], 'unavailable')

    def test_fixed_hosts_and_no_redirect_credentials(self):
        for url in ('http://api.npmjs.org/data', 'https://example.invalid/data', 'https://context7.com.evil.invalid/api'):
            with self.assertRaises(ValueError):
                adoption.fetch_json(url)
        with self.assertRaises(ValueError):
            adoption.NoRedirect().redirect_request(None, None, 302, 'redirect', {}, 'https://example.invalid')

    def test_oversized_response_is_rejected(self):
        with patch.object(adoption, 'MAX_BYTES', 3), patch.object(adoption, 'OPENER') as opener:
            opener.open.return_value.__enter__.return_value = io.BytesIO(b'{}  ')
            with self.assertRaises(ValueError):
                adoption.fetch_json('https://api.npmjs.org/downloads/range/last-month/test')

    def test_context7_rejects_invalid_counts_and_retains_only_aggregate_fields(self):
        data = {'total': dict.fromkeys(('page', 'txt', 'mcp', 'cli'), 0),
                'daily': [{'date': '2026-10-01', 'page': 0, 'txt': 0, 'mcp': 1, 'cli': 0, 'total': 1, 'unexpected': 'private'}],
                'mcpClients': {'dailyData': [{'date': '2026-10-01', 'uniqueUsersByClient': {'codex': 1}, 'totalUniqueUsers': 1}], 'unexpected': 'private'},
                'topics': [{'topic': 'encryption', 'count': 1, 'unexpected': 'private'}],
                'countries': [{'country': 'GB', 'count': 1}]}
        with patch.dict(adoption.os.environ, {'CONTEXT7_API_KEY': 'synthetic-test-key'}), patch.object(adoption, 'fetch_json', return_value=data):
            result = adoption.context7_metric()
            self.assertEqual(result['status'], 'ok')
            self.assertNotIn('unexpected', result['daily'][0])
            self.assertNotIn('unexpected', result['mcpClients'])
            self.assertNotIn('unexpected', result['topics_lifetime'][0])
            data['daily'][0]['mcp'] = -1
            self.assertEqual(adoption.context7_metric()['status'], 'unavailable')

    def test_context7_uses_verified_canonical_library_id(self):
        data = {'total': dict.fromkeys(('page', 'txt', 'mcp', 'cli'), 0),
                'daily': [], 'mcpClients': {'dailyData': []}, 'topics': [], 'countries': []}
        with patch.dict(adoption.os.environ, {'CONTEXT7_API_KEY': 'synthetic-test-key'}), patch.object(adoption, 'fetch_json', return_value=data) as fetch:
            self.assertEqual(adoption.context7_metric()['status'], 'ok')
            query = adoption.urllib.parse.parse_qs(adoption.urllib.parse.urlsplit(fetch.call_args.args[0]).query)
            self.assertEqual(query['libraryId'], ['/' + adoption.REPOSITORY.lower()])

    def test_no_context7_key_is_explicitly_unavailable(self):
        with patch.dict(adoption.os.environ, {}, clear=True):
            result = adoption.context7_metric()
        self.assertEqual(result['status'], 'unavailable')
        self.assertNotIn('total', result)

if __name__ == '__main__':
    unittest.main()
