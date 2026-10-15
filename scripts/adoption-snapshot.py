#!/usr/bin/env python3
"""Save aggregate adoption observations; never instruments library users.

Python 3.11+ standard library only. No installs, retries or scheduled execution.
Context7 and GitHub owner metrics are opt-in; raw feedback bodies are not fetched.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = 'kerberosmansour/hulumi'
ECOSYSTEM = 'npm'
MAX_BYTES = 8 * 1024 * 1024
HOSTS = {'api.npmjs.org', 'crates.io', 'context7.com'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Redirect refused; do not forward credentials')


OPENER = urllib.request.build_opener(NoRedirect())


def fetch_json(url, token=None):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc not in HOSTS:
        raise ValueError('Unapproved metrics endpoint')
    if token and parsed.netloc != 'context7.com':
        raise ValueError('Context7 credentials cannot be sent to another host')
    headers = {'User-Agent': 'Sunlit-adoption-snapshot (github.com/' + REPOSITORY + ')', 'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    with OPENER.open(urllib.request.Request(url, headers=headers), timeout=20) as response:
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError('Metrics response exceeds 8 MiB')
    return json.loads(body)


def count(value):
    if type(value) is not int or value < 0:
        raise ValueError('Expected non-negative integer count')
    return value


def day(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Expected ISO calendar date')
    date.fromisoformat(value)
    return value


def crates_daily(data):
    if not isinstance(data, dict) or not isinstance(data.get('version_downloads'), list):
        raise ValueError('Missing crate download records')
    meta = data.get('meta')
    if not isinstance(meta, dict) or not isinstance(meta.get('extra_downloads'), list):
        raise ValueError('Missing older-version counts; partial totals refused')
    totals = {}
    for row in data['version_downloads'] + meta['extra_downloads']:
        if not isinstance(row, dict):
            raise ValueError('Malformed crate record')
        stamp = day(row.get('date'))
        totals[stamp] = totals.get(stamp, 0) + count(row.get('downloads'))
    return [{'date': stamp, 'downloads': totals[stamp]} for stamp in sorted(totals)]


def unavailable(error):
    # Error bodies may echo credentials or private service details. Never retain them.
    return {'status': 'unavailable', 'reason': 'HTTP ' + str(error.code) if isinstance(error, urllib.error.HTTPError) else type(error).__name__}


def public_metric(ecosystem, name):
    identity = {'ecosystem': ecosystem, 'package': name}
    try:
        if ecosystem == 'npm':
            url = 'https://api.npmjs.org/downloads/range/last-month/' + urllib.parse.quote(name, safe='')
            data = fetch_json(url)
            if not isinstance(data, dict) or data.get('package') != name or not isinstance(data.get('downloads'), list):
                raise ValueError('Mismatched npm response')
            start, end = day(data.get('start')), day(data.get('end'))
            rows = [{'date': day(row['day']), 'downloads': count(row['downloads'])} for row in data['downloads']]
            if start > end or len(rows) != (date.fromisoformat(end) - date.fromisoformat(start)).days + 1 or len({row['date'] for row in rows}) != len(rows) or any(not start <= row['date'] <= end for row in rows):
                raise ValueError('Inconsistent npm reporting window')
        elif ecosystem == 'crates.io':
            url = 'https://crates.io/api/v1/crates/' + urllib.parse.quote(name, safe='') + '/downloads'
            rows = crates_daily(fetch_json(url))
            start, end = (rows[0]['date'], rows[-1]['date']) if rows else (None, None)
        else:
            raise ValueError('Unsupported ecosystem')
        return {**identity, 'status': 'ok', 'source': url, 'start': start, 'end': end, 'daily': rows,
                'reported_downloads': sum(row['downloads'] for row in rows)}
    except (OSError, ValueError, KeyError, TypeError) as error:
        return {**identity, **unavailable(error)}


def package_names():
    names = []
    if ECOSYSTEM == 'npm':
        for path in sorted((ROOT / 'packages').glob('*/package.json')):
            data = json.loads(path.read_text())
            if not data.get('private', False):
                names.append(data['name'])
        pattern = r'@hulumi/[a-z0-9][a-z0-9-]*'
    else:
        for path in sorted((ROOT / 'crates').glob('*/Cargo.toml')):
            data = tomllib.loads(path.read_text())['package']
            if data.get('publish', True) is not False:
                names.append(data['name'])
        pattern = r'(?:secure|security)_[a-z0-9_]+'
    if not 1 <= len(names) <= 32 or len(set(names)) != len(names) or not all(isinstance(n, str) and re.fullmatch(pattern, n) for n in names):
        raise ValueError('Invalid or empty published package inventory')
    return names


def github_metric(kind):
    if kind not in {'clones', 'views'}:
        raise ValueError('Unsupported traffic metric')
    try:
        result = subprocess.run(['gh', 'api', '--hostname', 'github.com', f'repos/{REPOSITORY}/traffic/{kind}'], capture_output=True, timeout=20, check=True, shell=False, env={key: value for key, value in os.environ.items() if key != 'CONTEXT7_API_KEY'})
        if len(result.stdout) > MAX_BYTES:
            raise ValueError('Traffic response too large')
        data = json.loads(result.stdout)
        count(data['count']); count(data['uniques'])
        if not isinstance(data.get(kind), list):
            raise ValueError('Missing daily traffic')
        return {'status': 'ok', 'data': data, 'window': 'GitHub rolling 14 days; uniques are provider-defined'}
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        return unavailable(error)


def label(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 1000 or any(ord(char) < 32 for char in value):
        raise ValueError('Invalid aggregate label')
    return value


def context7_metric():
    token = os.environ.get('CONTEXT7_API_KEY')
    if not token:
        return {'status': 'unavailable', 'reason': 'CONTEXT7_API_KEY not set'}
    try:
        url = 'https://context7.com/api/v2/libs/metrics?' + urllib.parse.urlencode({'libraryId': '/' + REPOSITORY, 'days': 30})
        data = fetch_json(url, token)
        total = {key: count(data['total'][key]) for key in ('page', 'txt', 'mcp', 'cli')}
        if not all(isinstance(data.get(key), list) for key in ('daily', 'topics', 'countries')) or not isinstance(data.get('mcpClients'), dict) or not isinstance(data['mcpClients'].get('dailyData'), list):
            raise ValueError('Malformed Context7 metrics')
        daily = [
            {'date': day(row['date']), **{key: count(row[key]) for key in ('page', 'txt', 'mcp', 'cli', 'total')}}
            for row in data['daily']
        ]
        clients = []
        for row in data['mcpClients']['dailyData']:
            if not isinstance(row['uniqueUsersByClient'], dict):
                raise ValueError('Invalid MCP client aggregate')
            counts = {label(key): count(value) for key, value in row['uniqueUsersByClient'].items()}
            clients.append({'date': day(row['date']), 'uniqueUsersByClient': counts,
                            'totalUniqueUsers': count(row['totalUniqueUsers'])})
        topics = [{'topic': label(row['topic']), 'count': count(row['count'])} for row in data['topics']]
        countries = [{'country': label(row['country']), 'count': count(row['count'])} for row in data['countries']]
        # Keep only documented aggregates. Unknown response fields are not saved.
        # Topic/country distributions are lifetime, not the daily reporting window.
        return {'status': 'ok', 'total_lifetime': total, 'daily': daily,
                'mcpClients': {'dailyData': clients}, 'topics_lifetime': topics,
                'countries_lifetime': countries, 'source': url}
    except (OSError, ValueError, KeyError, TypeError) as error:
        return unavailable(error)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New local JSON file; existing files are never overwritten')
    parser.add_argument('--github', action='store_true', help='Read owner-only traffic using existing gh authentication')
    parser.add_argument('--context7', action='store_true', help='Read claimed-library metrics using CONTEXT7_API_KEY')
    args = parser.parse_args()
    if args.output.exists() or args.output.is_symlink():
        raise FileExistsError('Snapshot output already exists')
    names = package_names()
    with ThreadPoolExecutor(max_workers=4) as pool:
        packages = list(pool.map(lambda name: public_metric(ECOSYSTEM, name), names))
    snapshot = {'schema_version': 1, 'observed_at': datetime.now(timezone.utc).isoformat(), 'repository': REPOSITORY,
                'packages': packages, 'github': {kind: github_metric(kind) for kind in ('clones', 'views')} if args.github else {'status': 'not_requested'},
                'context7': context7_metric() if args.context7 else {'status': 'not_requested'},
                'limitations': ['Downloads, requests, installs and successful integrations are separate populations.',
                                'CI, bots, mirrors and maintainer tests can contribute; no human/bot split is inferred.',
                                'Missing sources are unavailable, not zero; date windows may differ.']}
    with args.output.open('x', encoding='utf-8') as out:
        json.dump(snapshot, out, indent=2)
        out.write('\n')
    failures = sum(item['status'] != 'ok' for item in packages)
    failures += sum(item.get('status') == 'unavailable' for item in snapshot['github'].values() if isinstance(item, dict))
    failures += snapshot['context7'].get('status') == 'unavailable'
    print(f'Saved {len(packages)} package observations; {failures} unavailable sources; {args.output}')
    return 1 if failures else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        print('Snapshot failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(2)
