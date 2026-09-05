"""
build_dataset.py — Iteração 1: constrói o fighters.json a partir dos dados
round-a-round do ufcstats (via repo Greco1899/scrape_ufc_stats).

Por que calcular em vez de raspar as médias prontas do site:
  1. ufcstats.com está atrás de verificação de browser
  2. dá pra calcular métricas que o site NÃO publica (taxa de knockdown)
  3. controle total sobre o filtro de amostra mínima

Saída: fighters.json com os campos exatos que o fightsim.js espera.
"""
import json, re, math
import pandas as pd

DATA = "data/"

# --- normalização de divisão -------------------------------------------------
DIVISIONS = {
    "Flyweight": "flyweight", "Bantamweight": "bantamweight",
    "Featherweight": "featherweight", "Lightweight": "lightweight",
    "Welterweight": "welterweight", "Middleweight": "middleweight",
    "Light Heavyweight": "light_heavyweight", "Heavyweight": "heavyweight",
    "Women's Strawweight": "w_strawweight", "Women's Flyweight": "w_flyweight",
    "Women's Bantamweight": "w_bantamweight", "Women's Featherweight": "w_featherweight",
}

def norm_division(wc):
    if not isinstance(wc, str):
        return None
    wc = wc.replace(" Bout", "").replace("UFC ", "").replace("Interim ", "")
    wc = re.sub(r"\s*Title\s*", " ", wc).strip()
    for k, v in DIVISIONS.items():
        if wc == k:
            return v
    return None

def parse_x_of_y(s):
    """'7 of 10' -> (7, 10)"""
    if not isinstance(s, str):
        return (0, 0)
    m = re.match(r"\s*(\d+)\s+of\s+(\d+)", s)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)

def num(v):
    """CSV traz esses campos como float64 (por causa de NaN). int(str) quebra."""
    try:
        f = float(v)
        return 0 if f != f else int(f)   # f != f detecta NaN
    except (TypeError, ValueError):
        return 0

def parse_clock(s):
    if not isinstance(s, str):
        return 0
    m = re.match(r"\s*(\d+):(\d+)", s)
    return int(m.group(1)) * 60 + int(m.group(2)) if m else 0

def round_lengths(time_format):
    """'5 Rnd (5-5-5-5-5)' -> [300,300,300,300,300]"""
    if not isinstance(time_format, str):
        return [300] * 5
    m = re.search(r"\(([\d\-\s]+)\)", time_format)
    if not m:
        return [300] * 5
    try:
        return [int(x.strip()) * 60 for x in m.group(1).split("-") if x.strip()]
    except ValueError:
        return [300] * 5


# --- carregar ---------------------------------------------------------------
stats = pd.read_csv(DATA + "ufc_fight_stats.csv")
results = pd.read_csv(DATA + "ufc_fight_results.csv")
tott = pd.read_csv(DATA + "ufc_fighter_tott.csv")

for df in (stats, results):
    for c in ("EVENT", "BOUT"):
        df[c] = df[c].astype(str).str.strip()

# tempo real de cada round de cada luta
fight_time = {}
for _, r in results.iterrows():
    key = (r["EVENT"], r["BOUT"])
    lens = round_lengths(r["TIME FORMAT"])
    try:
        last = int(r["ROUND"])
    except (ValueError, TypeError):
        continue
    secs = {}
    for i in range(1, last + 1):
        secs[i] = lens[i - 1] if i < last and i - 1 < len(lens) else parse_clock(r["TIME"])
    fight_time[key] = {"rounds": secs, "division": norm_division(r["WEIGHTCLASS"])}

# --- agregar por lutador ----------------------------------------------------
acc = {}

def blank():
    return dict(secs=0, sl=0, sa=0, absorbed=0, opp_att=0, tdl=0, tda=0,
                opp_tdl=0, opp_tda=0, sub=0, kd=0, kd_abs=0, ctrl=0,
                fights=set(), divs={})

# indexa as linhas por (evento, bout, round) pra achar o oponente
stats["_rnum"] = stats["ROUND"].astype(str).str.extract(r"(\d+)").astype(float)
grouped = stats.groupby(["EVENT", "BOUT", "_rnum"])

for (event, bout, rnum), grp in grouped:
    if len(grp) != 2 or math.isnan(rnum):
        continue
    ft = fight_time.get((event, bout))
    if not ft:
        continue
    secs = ft["rounds"].get(int(rnum), 0)
    if secs <= 0:
        continue

    rows = grp.to_dict("records")
    for i in (0, 1):
        me, opp = rows[i], rows[1 - i]
        name = str(me["FIGHTER"]).strip()
        a = acc.setdefault(name, blank())

        sl, sa = parse_x_of_y(me["SIG.STR."])
        osl, osa = parse_x_of_y(opp["SIG.STR."])
        tdl, tda = parse_x_of_y(me["TD"])
        otdl, otda = parse_x_of_y(opp["TD"])

        a["secs"] += secs
        a["sl"] += sl;            a["sa"] += sa
        a["absorbed"] += osl;     a["opp_att"] += osa
        a["tdl"] += tdl;          a["tda"] += tda
        a["opp_tdl"] += otdl;     a["opp_tda"] += otda
        a["sub"] += num(me["SUB.ATT"])
        a["kd"] += num(me["KD"])
        a["kd_abs"] += num(opp["KD"])
        a["ctrl"] += parse_clock(me["CTRL"])
        a["fights"].add(bout + event)
        if ft["division"]:
            a["divs"][ft["division"]] = a["divs"].get(ft["division"], 0) + 1

# --- tale of the tape -------------------------------------------------------
def parse_reach(s):
    if not isinstance(s, str):
        return None
    m = re.match(r'\s*(\d+)', s)
    return float(m.group(1)) if m else None

tape = {}
for _, r in tott.iterrows():
    tape[str(r["FIGHTER"]).strip()] = {
        "reach": parse_reach(r["REACH"]),
        "stance": r["STANCE"] if isinstance(r["STANCE"], str) else None,
    }

# --- montar saída -----------------------------------------------------------
MIN_FIGHTS = 4
MIN_MINUTES = 25

# Item 7 (override de amostra curta): nomes famosos que o filtro acima
# derruba injustamente por finalizarem rápido demais, não por terem lutado
# pouco de menos pra existir de verdade. Conferido nos dados brutos
# (data/ufc_fight_results.csv) antes de entrar aqui — cada um tem pelo
# menos 2 lutas reais no UFC, não é gente com 1 luta isolada (esse caso
# (ex.: James Toney, 1 luta, 3 minutos) fica de fora de propósito: amostra
# de 1 luta é ruído, não dá pra ratear com confiança nenhuma).
#   Ronda Rousey   8 lutas, 24.7min — perde só por MIN_MINUTES (por pouco)
#   CM Punk        2 lutas, 17.2min
#   Ben Askren     3 lutas, 17.3min
#   Bas Rutten     2 lutas, 20.2min — resto da carreira foi Pancrase, fora deste dataset
#   Genki Sudo     3 lutas, 25.1min — perde só por MIN_FIGHTS (por pouco)
OVERRIDE_AMOSTRA_CURTA = {
    "Ronda Rousey", "CM Punk", "Ben Askren", "Bas Rutten", "Genki Sudo",
}

fighters = []
for name, a in acc.items():
    minutes = a["secs"] / 60
    if name not in OVERRIDE_AMOSTRA_CURTA and (len(a["fights"]) < MIN_FIGHTS or minutes < MIN_MINUTES):
        continue
    if not a["divs"]:
        continue

    division = max(a["divs"], key=a["divs"].get)
    t = tape.get(name, {})
    reach = t.get("reach") or 72.0

    def safe(n, d, default):
        return n / d if d > 0 else default

    fighters.append({
        "name": name,
        "division": division,
        "slpm":   round(a["sl"] / minutes, 2),
        "sapm":   round(a["absorbed"] / minutes, 2),
        "strAcc": round(safe(a["sl"], a["sa"], 0.42), 3),
        "strDef": round(1 - safe(a["absorbed"], a["opp_att"], 0.42), 3),
        "tdAvg":  round(a["tdl"] / minutes * 15, 2),
        "tdAcc":  round(safe(a["tdl"], a["tda"], 0.35), 3),
        "tdDef":  round(1 - safe(a["opp_tdl"], a["opp_tda"], 0.35), 3),
        "subAvg": round(a["sub"] / minutes * 15, 2),
        "kdAvg":  round(a["kd"] / minutes * 15, 2),
        "reach":  reach,
        "stance": t.get("stance"),
        "_kd_abs": a["kd_abs"],
        "fights": len(a["fights"]),
        "minutes": round(minutes, 1),
    })

# --- durabilidade: knockdown é evento raro, então fórmula linear satura ------
# Suavização bayesiana: puxa a taxa observada na direção da média da população
# proporcionalmente à pouca exposição do lutador. Quem tem 30 min e zero KD
# sofrido não provou nada; quem tem 300 min e zero KD provou muito.
tot_kd = sum(f["_kd_abs"] for f in fighters)
tot_min = sum(f["minutes"] for f in fighters)
pop_rate = tot_kd / tot_min                      # KD sofridos por minuto
PRIOR_MIN = 75                                   # ~5 lutas de peso do prior

for f in fighters:
    smoothed = ((f["_kd_abs"] + pop_rate * PRIOR_MIN)
                / (f["minutes"] + PRIOR_MIN)) * 15
    pop15 = pop_rate * 15
    # razão em relação à média: <1 significa queixo acima da média
    ratio = smoothed / pop15 if pop15 > 0 else 1.0
    f["durability"] = round(max(0.78, min(1.28, 1.0 + (1 - ratio) * 0.42)), 3)
    del f["_kd_abs"]

fighters.sort(key=lambda f: (f["division"], -f["fights"]))

with open("fighters.json", "w", encoding="utf-8") as f:
    json.dump(fighters, f, ensure_ascii=False, indent=1)

# --- relatório --------------------------------------------------------------
print(f"{len(fighters)} lutadores no dataset\n")
print(f"{'divisão':22} {'n':>4}  {'SLpM':>5} {'StrAcc':>7} {'TDdef':>6} {'dur':>5}")
by_div = {}
for f in fighters:
    by_div.setdefault(f["division"], []).append(f)
for d in sorted(by_div, key=lambda k: -len(by_div[k])):
    g = by_div[d]
    avg = lambda k: sum(x[k] for x in g) / len(g)
    print(f"{d:22} {len(g):>4}  {avg('slpm'):>5.2f} {avg('strAcc'):>7.3f} "
          f"{avg('tdDef'):>6.3f} {avg('durability'):>5.2f}")


# ===========================================================================
# ENRIQUECIMENTO: títulos, era e arquétipo.
# Fica AQUI e não num script separado — se estivesse fora, regenerar o dataset
# apagaria esses campos e as fichas de lutador ficariam vazias sem aviso.
# ===========================================================================
import csv as _csv, collections as _col

datas={}
for r in _csv.DictReader(open(D+"ufc_event_details.csv")):
    m=re.search(r"(\d{4})",r.get("DATE") or "")
    if m: datas[r["EVENT"].strip()]=int(m.group(1))

tit=_col.defaultdict(lambda:{"d":0,"v":0})
anos=_col.defaultdict(list)
for r in _csv.DictReader(open(D+"ufc_fight_results.csv")):
    bout=(r.get("BOUT") or "").strip()
    if " vs. " not in bout: continue
    a,b=[x.strip() for x in bout.split(" vs. ",1)]
    ano=datas.get((r.get("EVENT") or "").strip())
    if ano: anos[a].append(ano); anos[b].append(ano)
    if "Title" not in (r.get("WEIGHTCLASS") or ""): continue
    out=(r.get("OUTCOME") or "").strip()
    for nome,venceu in ((a,out.startswith("W")),(b,out.startswith("L"))):
        tit[nome]["d"]+=1
        if venceu: tit[nome]["v"]+=1

F=json.load(open("fighters.json"))
por_div=_col.defaultdict(list)
for f in F: por_div[f["division"]].append(f)

def pct(pool,k,v):
    arr=sorted(x[k] for x in pool)
    lo,hi=0,len(arr)
    while lo<hi:
        m=(lo+hi)//2
        if arr[m]<v: lo=m+1
        else: hi=m
    return lo/len(arr)

# arquétipo: o eixo em que ele mais se destaca na própria divisão
# Peso por eixo: o que DEFINE um lutador é o que ele faz, não o que ele aguenta.
# Sem isso todo mundo com queixo bom virava "Queixo de ferro", inclusive Jon Jones.
EIXOS=[("tdAvg","Wrestler","quedas por 15 min",1.00),
       ("subAvg","Finalizador","tentativas de finalização",1.00),
       ("kdAvg","Nocauteador","knockdowns por 15 min",0.97),
       ("slpm","Pressão","volume de golpes",0.94),
       ("strDef","Contragolpeador","defesa de golpes",0.72),
       ("tdDef","Antiqueda","defesa de queda",0.70),
       ("durability","Queixo de ferro","durabilidade",0.62)]

for f in F:
    pool=por_div[f["division"]]
    t=tit[f["name"]]; a=anos[f["name"]]
    f["titulos"]={"disputas":t["d"],"vitorias":t["v"]}
    f["era"]=[min(a),max(a)] if a else None
    marcas=[]
    for k,rot,desc,peso in EIXOS:
        p=pct(pool,k,f[k])
        marcas.append((p*peso,p,rot,desc,k))
    marcas.sort(reverse=True)
    _,p1,rot1,desc1,k1=marcas[0]
    _,p2,rot2,desc2,k2=marcas[1]
    OFENSIVOS={"tdAvg","subAvg","kdAvg","slpm"}
    if p1<.72:
        f["arquetipo"]="Completo"; f["destaque"]=None
    elif p2>=.82 and rot2!=rot1 and k1 in OFENSIVOS and k2 in OFENSIVOS:
        # só combinamos eixos OFENSIVOS. "Finalizador queixo de ferro" não diz
        # nada e fragmentava o dataset em 36 categorias, 19 quase vazias.
        # dois eixos fortes definem melhor do que um: "Wrestler nocauteador"
        f["arquetipo"]=f"{rot1} {rot2.lower()}"
        f["destaque"]={"eixo":desc1,"pct":round(p1,3),"eixo2":desc2,"pct2":round(p2,3)}
    else:
        f["arquetipo"]=rot1
        f["destaque"]={"eixo":desc1,"pct":round(p1,3)}

json.dump(F,open("fighters.json","w"),ensure_ascii=False,indent=1)
c=_col.Counter(f["arquetipo"] for f in F)
print(f"{len(F)} lutadores enriquecidos\n")
for k,v in c.most_common(): print(f"  {k:18} {v:4}")
print()
for n in ["Jon Jones","Charles Oliveira","Khabib Nurmagomedov","Israel Adesanya"]:
    f=next((x for x in F if x["name"]==n),None)
    if f: print(f"  {n:24} {f['arquetipo']:16} {f['era']} titulos {f['titulos']['vitorias']}/{f['titulos']['disputas']}")
