"""Public daily-bar cache; no credentials. Incomplete current sessions are excluded."""
import argparse, concurrent.futures, datetime as dt, json, time, urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo
BASE=Path(__file__).resolve().parents[1]
DEFAULT=['NVDA','GOOGL','AMD','AAPL','MSFT','AMZN','META','TSLA','CRCL','NBIS','SPY','QQQ']
def get(symbol):
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=2y&interval=1d'
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
            j=json.load(urllib.request.urlopen(req,timeout=30))
            r=j['chart']['result'][0]; meta=r['meta']; q=r['indicators']['quote'][0]
            zone=ZoneInfo(meta.get('exchangeTimezoneName','America/New_York'))
            now=dt.datetime.now(dt.timezone.utc);session=meta.get('currentTradingPeriod',{}).get('regular',{})
            bars=[]
            for i,t in enumerate(r['timestamp']):
                day=dt.datetime.fromtimestamp(t,zone).date()
                if day>now.astimezone(zone).date():continue
                # Exclude the same-day daily candle until the regular session has ended.
                if day==now.astimezone(zone).date() and now.timestamp()<session.get('end',float('inf')):continue
                vals=[q[k][i] for k in ['open','high','low','close','volume']]
                if any(v is None for v in vals):continue
                bars.append(dict(zip(['date','open','high','low','close','volume'],[str(day)]+vals)))
            if len(bars)<20:raise ValueError('Not enough completed daily bars')
            out={'symbol':symbol,'currency':meta.get('currency','USD'),'timezone':str(zone),'source':'Yahoo Finance daily OHLC','sourceUrl':f'https://finance.yahoo.com/quote/{symbol}/history/','fetchedAt':now.isoformat(),'lastBar':bars[-1]['date'],'bars':bars}
            (BASE/'data'/f'{symbol}.json').write_text(json.dumps(out,separators=(',',':')))
            return symbol,out['lastBar'],None
        except Exception as e:
            if attempt==2:return symbol,None,str(e)
            time.sleep(attempt+1)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--symbols',default='');args=parser.parse_args()
    path=BASE/'data'/'symbols.json';existing=json.loads(path.read_text()) if path.exists() else DEFAULT
    extra=[s.strip().upper() for s in args.symbols.split(',') if s.strip()]
    symbols=sorted(set(existing+extra))
    import re
    if any(not re.fullmatch(r'[A-Z0-9.^=-]{1,16}',s) for s in symbols):raise ValueError('Invalid symbol')
    results=list(concurrent.futures.ThreadPoolExecutor(max_workers=3).map(get,symbols))
    valid=[s for s in symbols if (BASE/'data'/f'{s}.json').exists()]
    path.write_text(json.dumps(valid))
    report={'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'results':[{'symbol':s,'lastBar':d,'error':e} for s,d,e in results]}
    (BASE/'data'/'status.json').write_text(json.dumps(report))
    for s,d,e in results:print(s,d or e)
    if not any(d for _,d,_ in results):raise SystemExit('All data updates failed; preserving old cache')
if __name__=='__main__':main()
