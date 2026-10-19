# Generuje mapy SVG parków z server/data/parki-osm.json (OSM, ODbL). Uruchom z katalogu brand/:  python -X utf8 -I build-mapa.py
# Uwaga: kontur "Planty Bieńczyckie" jest dziś tym samym obiektem OSM co "Planty Krakowskie" (błąd dopasowania w build-parki-osm.mjs).
import json,math
d=json.load(open(r'../server/data/parki-osm.json',encoding='utf-8'))
P=[p for p in d['parki'] if p.get('osm')]
def dp(pts,eps):
    if len(pts)<3: return pts
    a,b=pts[0],pts[-1]; dx,dy=b[0]-a[0],b[1]-a[1]; n=math.hypot(dx,dy)
    dm,i=-1,0
    for k in range(1,len(pts)-1):
        if n<1e-12: dist=math.hypot(pts[k][0]-a[0],pts[k][1]-a[1])
        else: dist=abs(dy*pts[k][0]-dx*pts[k][1]+b[0]*a[1]-b[1]*a[0])/n
        if dist>dm: dm,i=dist,k
    if dm>eps or n<1e-12: return dp(pts[:i+1],eps)[:-1]+dp(pts[i:],eps)
    return [a,b]
def cen(r):
    xs=[q[0] for q in r]; ys=[q[1] for q in r]; return (sum(xs)/len(xs),sum(ys)/len(ys))
def build(box,W,H,fill,op,sel=None,selfill=None,eps=0.00004,circle=None,stroke=None):
    lon0,lat0,lon1,lat1=box; c=math.cos(math.radians((lat0+lat1)/2))
    s=min(W/((lon1-lon0)*c),H/(lat1-lat0))
    X=lambda lon:(lon-lon0)*c*s; Y=lambda lat:(lat1-lat)*s
    out=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
    cents={}
    for p in P:
        isel=sel and p['lp']==sel; ds=[]
        for r in p['osm']['rings']:
            pts=dp([tuple(q) for q in r],eps)
            if not any(lon0<=q[0]<=lon1 and lat0<=q[1]<=lat1 for q in pts): continue
            ds.append('M'+' '.join(f'{X(q[0]):.1f} {Y(q[1]):.1f}' for q in pts)+'Z')
        if not ds: continue
        cc=cen(p['osm']['rings'][0]); cents[p['nazwa_od']]=(round(X(cc[0])),round(Y(cc[1])))
        f=selfill if isel else fill; o=1 if isel else op
        st=f' stroke="{stroke}" stroke-width="2"' if isel and stroke else ''
        out.append(f'<path d="{" ".join(ds)}" fill="{f}" fill-opacity="{o}" fill-rule="evenodd"{st}/>')
    if circle:
        lon,lat,m=circle
        out.append(f'<circle cx="{X(lon):.1f}" cy="{Y(lat):.1f}" r="{(m/111320)*s:.1f}" fill="#0063AF" fill-opacity="0.08" stroke="#0063AF" stroke-width="2" stroke-dasharray="7 5"/>')
    out.append('</svg>'); return '\n'.join(out),cents,s
allr=[q for p in P for r in p['osm']['rings'] for q in r]
b=(min(q[0] for q in allr),min(q[1] for q in allr),max(q[0] for q in allr),max(q[1] for q in allr))
pad=0.004; box=(b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad)
for name,fill,op in (('mapa-parki-biala','#FFFFFF',0.92),('mapa-parki-zielona','#2E7D32',0.85)):
    svg,c,s=build(box,900,600,fill,op,eps=0.0001); open(name+'.svg','w',encoding='utf-8').write(svg); print(name,len(svg))
jc=cen([p for p in P if p['lp']==17][0]['osm']['rings'][0])
box2=(jc[0]-0.034,jc[1]-0.0108,jc[0]+0.034,jc[1]+0.0108)
svg3,c3,s3=build(box2,680,300,'#2E7D32',0.8,sel=17,selfill='#FFCC00',eps=0.00002,circle=(jc[0],jc[1],500),stroke='#071F32')
open('mapa-parki-park-jordana.svg','w',encoding='utf-8').write(svg3); print('park-jordana',len(svg3))
# Środki parków w pikselach widżetu (680x300), do ustawienia etykiet w HTML:
print(json.dumps(c3,ensure_ascii=False))
