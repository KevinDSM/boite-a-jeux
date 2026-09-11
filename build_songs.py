# Construit songs.json depuis l'API iTunes Search (gratuite, sans cle).
# Usage : python build_songs.py   -> lit playlists.txt, ecrit songs.json
import json, urllib.request, urllib.parse, re, time, sys
SRC=sys.argv[1] if len(sys.argv)>1 else "playlists.txt"; DST=sys.argv[2] if len(sys.argv)>2 else "songs.json"
sys.stdout.reconfigure(encoding="utf-8")
BAD = re.compile(r"remix|mix|live|remaster|karaoke|version|edit|acoustic|instrumental|symphon|orch|cover|tribute|demo|radio", re.I)
def base(t):
    b=re.sub(r"\s*[\(\[].*", "", t).strip()
    return b or re.sub(r"\s*[\(\[][^\)\]]*[\)\]]\s*", " ", t).strip()
def norm(t): return re.sub(r"[^a-z0-9]+"," ",t.lower().translate(str.maketrans("éèêàâçùûôîïëœ","eeeaacuuoiieo"))).strip()
def lookup(q):
    artist,title=[x.strip() for x in q.split("|")]
    u="https://itunes.apple.com/search?"+urllib.parse.urlencode({"term":artist+" "+title,"entity":"song","limit":50,"country":"FR"})
    res=[]
    for i in range(3):
        try: res=json.load(urllib.request.urlopen(u,timeout=20))["results"]; break
        except Exception as e: print("   (retry", i+1, type(e).__name__, getattr(e,"code",""), ")"); time.sleep(45 if getattr(e,"code",0)==403 else 5)
    res=[r for r in res if r.get("previewUrl")]
    if not res: return None
    res=[r for r in res if norm(title) in norm(r["trackName"]) and norm(artist).split()[0] in norm(r["artistName"])]
    if not res: return None
    clean=[r for r in res if not BAD.search(r["trackName"][len(base(r["trackName"])):])] or res
    pick=clean[0]
    art0=lambda r: r["artistName"].split("&")[0].split(",")[0].strip().lower()
    same=[r for r in res if base(r["trackName"]).lower()==base(pick["trackName"]).lower() and art0(r)==art0(pick)]
    ys=sorted(int(r["releaseDate"][:4]) for r in same)
    year=ys[0]
    if len(ys)>1 and ys.count(ys[0])==1 and ys[1]-ys[0]>10: year=ys[1]
    return {"artist":pick["artistName"],"title":base(pick["trackName"]),"year":year,
            "preview":pick["previewUrl"],"art":pick["artworkUrl100"].replace("100x100","300x300")}
import os
cache={}
if os.path.exists(DST):
    for x in json.load(open(DST,encoding="utf-8")):
        if x.get("_q"): cache[x["_q"]]=x
out=[]; seen=set(); cat=None
for line in open(SRC,encoding="utf-8"):
    line=line.strip()
    if not line: continue
    if line.startswith("#"): cat=line[1:].strip(); continue
    s=cache.get(line) or lookup(line)
    if not s: print("  KO  ",line); continue
    s["_q"]=line
    key=(s["artist"].lower(),s["title"].lower())
    if key in seen: continue
    seen.add(key); s["cat"]=cat; out.append(s)
    print(f'{s["year"]}  {s["artist"]} - {s["title"]}')
    time.sleep(4 if line not in cache else 0)
json.dump(out,open(DST,"w",encoding="utf-8"),ensure_ascii=False,indent=0)
print(len(out),"chansons")
