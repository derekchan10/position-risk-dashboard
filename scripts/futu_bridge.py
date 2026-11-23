#!/usr/bin/env python3
"""Personal, loopback-only Futu OAuth bridge. Tokens stay in process memory."""
import base64
import hashlib
import json
import math
import secrets
import threading
import time
from datetime import datetime, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://localhost:8768'
CALLBACK = ORIGIN + '/auth/callback'
HOST = 'https://webapi.futunn.com'
STATE = {}
LOCK = threading.Lock()

def remote(path, payload=None, token=None):
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if payload is not None:
        headers['Content-Type'] = 'application/json' if path.endswith('/register') else 'application/x-www-form-urlencoded'
        body = json.dumps(payload).encode() if path.endswith('/register') else urlencode(payload).encode()
    else:
        body = None
    try:
        with urlopen(Request(HOST + path, data=body, headers=headers), timeout=25) as r:
            result = json.load(r)
    except HTTPError as e:
        raise ValueError('富途接口返回 HTTP ' + str(e.code) + '，请重试或重新授权。') from None
    if result.get('error') or result.get('ret_code', 0) != 0:
        raise ValueError('富途未接受请求，请确认行情权限、授权状态及额度。')
    return result

def check_scope(token):
    scopes = set(token.get('scope', '').split())
    if 'quote:read' not in scopes or any(s.startswith('trade:') or s == 'quote:write' for s in scopes):
        raise ValueError('授权范围不符合只读行情要求，请重新授权，仅勾选读取行情。')

def normalize(j, symbol, cutoff):
    bars = []
    for b in j.get('data', {}).get('kline_list', []):
        d = str(b.get('date', ''))
        if len(d) == 8 and d.isdigit():
            d = d[:4] + '-' + d[4:6] + '-' + d[6:]
        else:
            d = datetime.fromtimestamp(b['time_key'] / 1000, ZoneInfo('America/New_York')).date().isoformat()
        if d >= cutoff:
            continue
        row = {k: float(b[k]) for k in ('open', 'high', 'low', 'close')}
        if not all(math.isfinite(v) and v > 0 for v in row.values()):
            raise ValueError('富途返回无效价格，已停止分析。')
        row.update(date=d, volume=float(b.get('volume', 0)))
        bars.append(row)
    bars = sorted({b['date']: b for b in bars}.values(), key=lambda b: b['date'])
    if not bars:
        raise ValueError('所选日期没有可用历史日线。')
    return {'symbol': symbol, 'currency': 'USD', 'source': 'Futu OpenAPI / 前复权日线',
            'sourceUrl': 'https://open.futunn.com/api/quote/basic-data/history-kline',
            'fetchedAt': datetime.now(ZoneInfo('UTC')).isoformat(), 'bars': bars}

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log authorization codes or query strings.

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def reply(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def valid_host(self):
        return self.headers.get('Host') == 'localhost:8768'

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') != ORIGIN:
            return self.reply(403, {'error': '仅接受本机看板请求。'})
        try:
            with LOCK:
                if self.path == '/auth/disconnect':
                    STATE.clear()
                    return self.reply(200, {'ok': True})
                if self.path != '/auth/start':
                    return self.reply(404, {'error': 'Not found'})
                if 'client' not in STATE:
                    j = remote('/oauth2/register', {'redirect_uris': [CALLBACK],
                        'token_endpoint_auth_method': 'none', 'grant_types': ['authorization_code', 'refresh_token'],
                        'response_types': ['code'], 'client_name': 'CW 仓位看板（只读行情）', 'scope': 'quote:read'})
                    STATE['client'] = j['client_id']
                verifier = secrets.token_urlsafe(48)
                state = secrets.token_urlsafe(32)
                STATE.update(verifier=verifier, state=state, started=time.time())
                challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
                url = HOST + '/oauth2/authorize/confirm?' + urlencode({'client_id': STATE['client'],
                    'redirect_uri': CALLBACK, 'response_type': 'code', 'scope': 'quote:read', 'state': state,
                    'code_challenge': challenge, 'code_challenge_method': 'S256'})
                self.reply(200, {'url': url})
        except Exception:
            self.reply(502, {'error': '富途授权初始化失败，请稍后重试。'})

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, {'error': '请使用 localhost 地址打开。'})
        u = urlsplit(self.path)
        q = parse_qs(u.query)
        try:
            if u.path == '/auth/status':
                return self.reply(200, {'connected': 'token' in STATE})
            if u.path == '/auth/callback':
                with LOCK:
                    incoming = q.get('state', [''])[0]
                    if not incoming or not secrets.compare_digest(incoming, STATE.get('state', '')) or time.time() - STATE.get('started', 0) > 600:
                        raise ValueError('授权会话已失效，请回到看板重新连接。')
                    STATE.pop('state', None)
                    if 'code' not in q:
                        raise ValueError('授权未完成，请回到看板重试。')
                    token = remote('/oauth2/token', {'grant_type': 'authorization_code', 'code': q['code'][0],
                        'client_id': STATE['client'], 'redirect_uri': CALLBACK, 'code_verifier': STATE.pop('verifier')})
                    check_scope(token)
                    STATE.update(token=token, expires=time.time() + token.get('expires_in', 7200) - 60)
                self.send_response(303)
                self.send_header('Location', '/?futu=connected')
                self.end_headers()
                return
            if u.path == '/api/futu/bars':
                symbol = q.get('symbol', [''])[0].upper()
                import re
                if not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,14}', symbol):
                    raise ValueError('当前富途入口仅支持美股代码，例如 NVDA、GOOGL。')
                cutoff = q.get('date', [''])[0]
                day = datetime.strptime(cutoff, '%Y-%m-%d').date()
                today = datetime.now(ZoneInfo('America/New_York')).date()
                if day > today:
                    raise ValueError('不能选择未来日期。')
                with LOCK:
                    if 'token' not in STATE:
                        return self.reply(401, {'error': '请先连接富途并授权读取行情。'})
                    if time.time() >= STATE['expires']:
                        token = remote('/oauth2/token', {'grant_type': 'refresh_token',
                            'client_id': STATE['client'], 'refresh_token': STATE['token']['refresh_token']})
                        check_scope(token)
                        token.setdefault('refresh_token', STATE['token']['refresh_token'])
                        STATE.update(token=token, expires=time.time() + token.get('expires_in', 7200) - 60)
                    params = urlencode({'end': (day - timedelta(days=1)).isoformat(), 'ktype': 2, 'autype': 1, 'num': 370, 'extended_time': 0})
                    j = remote('/api/v1.0/quote/US.' + symbol + '/history-kline?' + params, token=STATE['token']['access_token'])
                return self.reply(200, normalize(j, symbol, cutoff))
            if u.path.startswith(('/auth/', '/api/')):
                return self.reply(404, {'error': 'Not found'})
            # Serve only website assets, not scripts, git files or arbitrary vault files.
            if u.path not in ('/', '/index.html', '/app.js', '/planner.js', '/planner-ui.js') and not (u.path.startswith('/data/') and u.path.endswith('.json') and '..' not in u.path):
                return self.reply(404, {'error': 'Not found'})
            super().do_GET()
        except ValueError as e:
            self.reply(400, {'error': str(e)})
        except Exception:
            self.reply(502, {'error': '富途连接失败，请稍后重试；凭证不会写入日志。'})

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8768), partial(Handler, directory=str(ROOT)))
    print('本机富途看板：' + ORIGIN, flush=True)
    server.serve_forever()
