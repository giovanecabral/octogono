# Relevo anatômico fino da pele (etapa e da anatomia, 2026-11-26): esterno, borda de baixo do peito, linha central e
# divisões leves do abdômen, umbigo, serrátil, clavícula e tendões do antebraço, com 1 a 2 cm de largura, que a malha do
# corpo (um vértice a cada 2 cm no tronco) não carrega. Cada traço é um campo de altura (mm) no espaço do bind do corpo,
# posicionado pelas juntas do esqueleto, rasterizado no UV da pele e somado ao mapa de normal do corpo escaneado
# (derivada da altura no espaço tangente). Sai também a oclusão das cavidades (axila, esterno, dobra do cotovelo, umbigo),
# que escurece a cor da pele, e a aspereza da pele (luta3d/pele_aspereza.webp). Cabeça, pescoço, mãos e pernas não mudam.
# Uso: python3 ferramentas/corpo3d/relevo.py <lutador.glb> <hbm_normal.png | glb> <pasta de saída> [--embutir]
#   --embutir: troca dentro do próprio lutador.glb o mapa de normal (com o relevo) e a cor da pele (com a oclusão), em JPEG
#   do tamanho de antes, e marca asset.extras.relevo; um GLB já marcado é recusado (o relevo somaria duas vezes). O
#   gerar.sh chama assim depois dos alvos de forma. A aspereza vai pra luta3d/pele_aspereza.webp (o jogo lê à parte).
#   (glb: o mapa de normal que está dentro do lutador.glb; o hbm_normal.png de uma pasta de trabalho pode ser outro)
#   (escreve hbm_normal_relevo.png, hbm_oclusao.png e pele_aspereza.webp; o hbm_trocar.py usa os dois primeiros se existirem)
import json, struct, sys, os
import numpy as np
from PIL import Image
np.seterr(all="ignore")   # o matmul do Accelerate (macOS) avisa divisão por zero à toa; o nan_to_num cuida do resto

glb, normal_png, saida = sys.argv[1:4]; EMBUTIR = "--embutir" in sys.argv[4:]
os.makedirs(saida, exist_ok=True)

def ler_glb(arq):
    b = open(arq, "rb").read(); nj = struct.unpack_from("<I", b, 12)[0]; j = json.loads(b[20:20 + nj]); binc = b[20 + nj + 8:]
    def acc(i):
        a = j["accessors"][i]; v = j["bufferViews"][a["bufferView"]]; n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        t = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a["componentType"]]
        off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return np.frombuffer(binc, dtype=t, count=a["count"] * n, offset=off).reshape(a["count"], n) if n > 1 else np.frombuffer(binc, dtype=t, count=a["count"], offset=off)
    no = next(x for x in j["nodes"] if x.get("name") == "corpo"); pr = j["meshes"][no["mesh"]]["primitives"][0]; sk = j["skins"][no["skin"]]
    W = acc(pr["attributes"]["WEIGHTS_0"]).astype(np.float32)
    if W.max() > 1.5: W = W / (255.0 if W.max() <= 255 else 65535.0)
    return dict(P=acc(pr["attributes"]["POSITION"]).astype(np.float64), UV=acc(pr["attributes"]["TEXCOORD_0"]).astype(np.float64),
                I=acc(pr["indices"]).astype(np.int64).reshape(-1, 3), J=acc(pr["attributes"]["JOINTS_0"]).astype(np.int64), W=W,
                nomes=[j["nodes"][k]["name"] for k in sk["joints"]], IB=acc(sk["inverseBindMatrices"]).astype(np.float64).reshape(-1, 4, 4))

if (json.loads(open(glb, "rb").read()[20:20 + struct.unpack_from("<I", open(glb, "rb").read(), 12)[0]]).get("asset", {}).get("extras") or {}).get("relevo"):
    sys.exit("relevo: " + glb + " já tem o relevo (asset.extras.relevo); gere o corpo de novo (gerar.sh) antes de rodar outra vez")
g = ler_glb(glb)
junta = {n: np.linalg.inv(g["IB"][k].T)[:3, 3] for k, n in enumerate(g["nomes"])}   # (glTF guarda a matriz por coluna)
dom = np.array([g["nomes"][g["J"][i][np.argmax(g["W"][i])]] for i in range(len(g["P"]))])
FORA = ("Head", "neck", "hand", "thumb", "index", "middle", "ring", "pinky", "thigh", "calf", "foot", "ball")
fora_osso = np.array([n.startswith(FORA) for n in g["nomes"]])
dentro_v = 1.0 - (g["W"] * fora_osso[g["J"]]).sum(1)   # 1 no tronco e no braço, 0 no que não muda (a borda vira rampa)

# ---------------- rasterização no UV: posição do bind, osso dominante e metros por unidade de UV ----------------
N = 2048
pos = np.zeros((N, N, 3)); dentro = np.zeros((N, N)); cobre = np.zeros((N, N), bool); mpu = np.zeros((N, N, 2)); osso = np.full((N, N), -1, np.int32)
nomes_dom = sorted(set(dom)); id_dom = {n: i for i, n in enumerate(nomes_dom)}; dom_id = np.array([id_dom[n] for n in dom])
for tri in g["I"]:
    uv = g["UV"][tri] * N; p = g["P"][tri]
    x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, N - 1), min(y1, N - 1)
    if x1 < x0 or y1 < y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    a, b_, c = uv
    den = (b_[1] - c[1]) * (a[0] - c[0]) + (c[0] - b_[0]) * (a[1] - c[1])
    if abs(den) < 1e-12: continue
    l0 = ((b_[1] - c[1]) * (xs - c[0]) + (c[0] - b_[0]) * (ys - c[1])) / den; l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den; l2 = 1 - l0 - l1
    m = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
    if not m.any(): continue
    pp = l0[..., None] * p[0] + l1[..., None] * p[1] + l2[..., None] * p[2]
    # metros por unidade de UV ao longo de u e de v (o jacobiano do triângulo)
    D = np.array([[uv[1][0] - uv[0][0], uv[2][0] - uv[0][0]], [uv[1][1] - uv[0][1], uv[2][1] - uv[0][1]]]) / N
    E = np.stack([p[1] - p[0], p[2] - p[0]], 1)
    try: Jm = E @ np.linalg.inv(D)
    except np.linalg.LinAlgError: continue
    ys_i, xs_i = np.nonzero(m); ys_i += y0; xs_i += x0
    pos[ys_i, xs_i] = pp[m]; cobre[ys_i, xs_i] = True
    dentro[ys_i, xs_i] = (l0[m] * dentro_v[tri[0]] + l1[m] * dentro_v[tri[1]] + l2[m] * dentro_v[tri[2]])
    mpu[ys_i, xs_i] = [np.linalg.norm(Jm[:, 0]), np.linalg.norm(Jm[:, 1])]
    osso[ys_i, xs_i] = dom_id[tri][np.argmax(np.stack([l0[m], l1[m], l2[m]], 1), 1)]   # o do vértice mais perto

X, Y, Z = pos[..., 0], pos[..., 1], pos[..., 2]
nome_de = np.array(nomes_dom)
# rampa, nunca corte: pelo osso dominante de cada texel a altura caía a zero num texel só e virava serrilhado no pescoço
regiao = cobre * np.clip((dentro - 0.35) / 0.5, 0, 1) ** 2

# ---------------- os traços (mm) ----------------
gauss = lambda d, w: np.exp(-(d / w) ** 2)
faixa = lambda v, a, b, borda: np.clip((v - a) / borda, 0, 1) * np.clip((b - v) / borda, 0, 1)
s3, pel, nk = junta["spine_03"], junta["pelvis"], junta["neck_01"]
frente = np.clip((Z - (s3[2] + 0.04)) / 0.03, 0, 1)   # a frente do tronco
ax = np.abs(X)
H = np.zeros((N, N)); AO = np.zeros((N, N))

# esterno: sulco no meio do peito, do manúbrio ao processo xifoide
y_man, y_xif = nk[1] - 0.075, s3[1] + 0.06
H += -1.0 * gauss(X, 0.018) * faixa(Y, y_xif, y_man, 0.03) * frente
# borda de baixo do peitoral: a dobra sobe do esterno até a axila
y_borda = y_xif + 0.005 + 3.5 * np.clip(ax - 0.03, 0, None) ** 2
dobra = gauss(Y - y_borda, 0.016) * faixa(ax, 0.02, 0.165, 0.03) * frente
H += -1.1 * dobra; AO += 0.07 * dobra
# linha central e divisões leves do abdômen (três intersecções tendíneas), do xifoide ao umbigo
y_umb = pel[1] + 0.12
H += -0.7 * gauss(X, 0.013) * faixa(Y, y_umb + 0.01, y_xif, 0.03) * frente
for k, yy in enumerate(np.linspace(y_xif - 0.035, y_umb + 0.035, 3)):
    H += -0.45 * gauss(Y - yy - 0.01 * (ax / 0.06) ** 2, 0.011) * faixa(ax, 0.008, 0.065, 0.02) * frente
# umbigo
d_umb = np.sqrt(X ** 2 + (Y - y_umb) ** 2)
H += -2.5 * gauss(d_umb, 0.008) * frente; AO += 0.15 * gauss(d_umb, 0.007) * frente
# serrátil: três dedos em diagonal no flanco, embaixo do peito
lado = np.clip((ax - 0.11) / 0.02, 0, 1) * (1 - np.clip((ax - 0.17) / 0.02, 0, 1)) * np.clip((Z - (s3[2] - 0.02)) / 0.03, 0, 1)
for yy in (y_xif + 0.02, y_xif - 0.01, y_xif - 0.04):
    H += -0.45 * gauss(Y - yy - 0.6 * (ax - 0.11), 0.009) * lado * faixa(Y, y_xif - 0.07, y_xif + 0.06, 0.02)
# clavícula: relevo sobre o osso e a cova acima dela
for s in (1, -1):
    c0, c1 = junta["clavicle_l" if s > 0 else "clavicle_r"], junta["upperarm_l" if s > 0 else "upperarm_r"]
    eixo = (c1 - c0); L = np.linalg.norm(eixo); eixo = eixo / L
    rel = pos - c0; t = (rel @ eixo) / L
    perp = rel - (rel @ eixo)[..., None] * eixo; dy = perp[..., 1]   # acima (+) ou abaixo (-) da linha
    # refinamento do tronco superior (2026-11-27): a clavícula vai até perto do acrômio e marca mais (osso e cova)
    lado_c = (X * s > 0) * faixa(t, 0.05, 0.92, 0.12)   # pontas em rampa (o corte seco riscava a frente do ombro)
    na_frente = np.clip((Z - c0[2]) / 0.02 + 1, 0, 1)
    H += lado_c * (1.1 * gauss(dy - 0.012, 0.011) - 0.8 * gauss(dy - 0.038, 0.013)) * na_frente
    AO += lado_c * 0.07 * gauss(dy - 0.035, 0.01)
    # acrômio: a ponta do ombro, onde a clavícula encontra o deltoide
    acromio = c1 + np.array([s * 0.012, 0.045, 0.0])
    H += 0.5 * gauss(np.linalg.norm(pos - acromio, axis=-1), 0.016) * (X * s > 0)
    # sulco deltopeitoral: do terço de fora da clavícula, descendo pela frente do ombro até a dobra da axila
    # (separa o deltoide do peitoral e marca a entrada do braço no tronco)
    p0 = c0 + 0.72 * (c1 - c0) + np.array([0.0, -0.01, 0.02]); p1 = c1 + np.array([-s * 0.015, -0.115, 0.035])
    seg = p1 - p0; ls = seg @ seg
    k = np.clip(((pos - p0) @ seg) / ls, 0, 1)
    d_dp = np.linalg.norm(pos - (p0 + k[..., None] * seg), axis=-1)
    sulco = gauss(d_dp, 0.008) * (X * s > 0) * na_frente * faixa(k, 0.0, 1.0, 0.15)
    H += -0.9 * sulco; AO += 0.06 * sulco
# axila: cavidade
for s in (1, -1):
    u = junta["upperarm_l" if s > 0 else "upperarm_r"]; cav = u + np.array([-s * 0.035, -0.07, -0.01])
    AO += 0.18 * gauss(np.linalg.norm(pos - cav, axis=-1), 0.045)
# antebraço: dobra do cotovelo (oclusão) e dois tendões no terço perto do pulso, do lado da palma
for s in (1, -1):
    l0, l1 = junta["lowerarm_l" if s > 0 else "lowerarm_r"], junta["hand_l" if s > 0 else "hand_r"]
    u0 = junta["upperarm_l" if s > 0 else "upperarm_r"]
    eixo = l1 - l0; L = np.linalg.norm(eixo); eixo = eixo / L
    rel = pos - l0; t = (rel @ eixo) / L; perp = rel - (rel @ eixo)[..., None] * eixo
    frente_a = np.cross(eixo, (u0 - l0) / np.linalg.norm(u0 - l0)); frente_a = np.cross(frente_a, eixo); frente_a /= np.linalg.norm(frente_a)   # perpendicular ao antebraço, no plano do braço
    lat = np.cross(eixo, frente_a)
    cos_f = (perp @ frente_a) / np.maximum(np.linalg.norm(perp, axis=-1), 1e-6)
    braco = (X * s > 0.12)
    AO += braco * 0.12 * gauss(t + 0.02, 0.05) * np.clip(-cos_f, 0, 1)   # o lado de dentro da dobra
    for off in (-0.008, 0.008):
        H += braco * 0.35 * np.nan_to_num(gauss((perp @ lat) - off, 0.006) * np.clip(-cos_f, 0, 1) ** 2 * faixa(t, 0.5, 0.92, 0.12))

if os.environ.get("ZERO"): H[:] = 0; AO[:] = 0   # ZERO=1: só a troca do mapa (controle)
H = np.nan_to_num(H) * regiao * float(os.environ.get("GANHO", "2.5"))   # 2,5: medido nas fotos (com 4 o abdômen parece desenhado, com 2 some na câmera da luta)
AO = np.clip(np.nan_to_num(AO) * regiao * float(os.environ.get("AO_GANHO", "2")), 0, 0.6)   # AO_GANHO: exagero pra conferir o lugar
def estender(A, cob, passadas=12):
    """leva o valor de cada ilha do UV pros texels de fora dela (média dos vizinhos já preenchidos)"""
    A = A.copy(); feito = cob.copy()
    for _ in range(passadas):
        soma = sum(np.roll(A * feito, d, a) for d in (1, -1) for a in (0, 1)); n = sum(np.roll(feito, d, a).astype(np.float64) for d in (1, -1) for a in (0, 1))
        novo = ~feito & (n > 0); A[novo] = soma[novo] / n[novo]; feito |= novo
    return A
H = estender(H, cobre); mpu = np.stack([estender(mpu[..., k], cobre) for k in range(2)], -1)

# ---------------- mapa de normal: soma a derivada da altura ao do corpo escaneado ----------------
def imagem_do_glb(arq, nome):
    import io
    b = open(arq, "rb").read(); nj = struct.unpack_from("<I", b, 12)[0]; j = json.loads(b[20:20 + nj]); binc = b[20 + nj + 8:]
    im = next(x for x in j["images"] if x.get("name") == nome); v = j["bufferViews"][im["bufferView"]]
    return Image.open(io.BytesIO(binc[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]))
fonte = imagem_do_glb(glb, "hbm_normal") if normal_png == "glb" else Image.open(normal_png)
nm = np.asarray(fonte.convert("RGB"), np.float32) / 127.5 - 1.0
M = nm.shape[0]; esc = M // N
Hs = np.asarray(Image.fromarray(H.astype(np.float32)).resize((M, M), Image.BICUBIC), np.float32)
mu = np.asarray(Image.fromarray(mpu[..., 0].astype(np.float32)).resize((M, M), Image.NEAREST), np.float32)
mv = np.asarray(Image.fromarray(mpu[..., 1].astype(np.float32)).resize((M, M), Image.NEAREST), np.float32)
dHx = np.gradient(Hs, axis=1); dHy = np.gradient(Hs, axis=0)   # mm por texel
su = dHx / np.maximum(mu / M * 1000.0, 1e-4); sv = dHy / np.maximum(mv / M * 1000.0, 1e-4)   # inclinação (mm/mm)
SINAL_V = float(os.environ.get("SINAL_V", "-1"))   # o verde do mapa escaneado cresce contra as linhas da imagem: a correlação de d(nx)/dlinha com d(ny)/dcoluna é -0,35 (rotacional nulo pede o sinal dela); com +1 a inclinação em v saía invertida e o esterno, na costura das duas ilhas do peito (giradas 90 graus), virava risco
nm[..., 0] -= su; nm[..., 1] -= SINAL_V * sv
nm /= np.linalg.norm(nm, axis=-1, keepdims=True)
Image.fromarray(np.clip((nm + 1.0) * 127.5, 0, 255).astype(np.uint8)).save(os.path.join(saida, "hbm_normal_relevo.png"))
# ---------------- oclusão (multiplica a cor da pele) e aspereza ----------------
ao = 1.0 - AO
Image.fromarray(np.clip(ao * 255, 0, 255).astype(np.uint8)).save(os.path.join(saida, "hbm_oclusao.png"))
rug = np.full((N, N), 0.58)
rug = rug - regiao * (0.02 * frente * faixa(Y, y_umb, nk[1], 0.05) + 0.015 * np.clip((Y - s3[1] - 0.15) / 0.05, 0, 1))
# variação lenta (3 a 8 cm) calculada na posição do corpo, não no UV (sem costura): brilho uniforme é o que lê plástico
rg = np.random.default_rng(7); var = np.zeros((N, N))
for lam in (0.03, 0.05, 0.08):
    for _ in range(3):
        d = rg.normal(size=3); d /= np.linalg.norm(d); var += np.sin(pos @ d * (2 * np.pi / lam) + rg.uniform(0, 2 * np.pi))
rug = rug + 0.035 * var / 3.0 * cobre   # peito e ombro com um pouco de suor
for s in (1, -1):
    l0 = junta["lowerarm_l" if s > 0 else "lowerarm_r"]
    rug = rug + 0.08 * gauss(np.linalg.norm(pos - l0, axis=-1), 0.04) * cobre   # cotovelo mais áspero
Image.fromarray(np.clip(rug * 255, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR).convert("RGB").save(os.path.join(saida, "pele_aspereza.webp"), quality=90)
if EMBUTIR:
    import io
    b = open(glb, "rb").read(); nj = struct.unpack_from("<I", b, 12)[0]; j = json.loads(b[20:20 + nj]); binc = b[20 + nj + 8:]
    def jpeg(im, ref, tam):
        """a maior qualidade que cabe em 10% a mais que a imagem de antes, com a mesma amostragem de cor (o GLB não cresce)"""
        from PIL import JpegImagePlugin
        amostra = JpegImagePlugin.get_sampling(ref); im = im.resize(ref.size, Image.LANCZOS); dado = None
        for q in range(95, 49, -3):
            o = io.BytesIO(); im.save(o, "JPEG", quality=q, subsampling=amostra if amostra >= 0 else 2); dado = o.getvalue()
            if len(dado) <= tam * 1.1: break
        return dado
    pele0 = imagem_do_glb(glb, "hbm_pele"); nrm0 = imagem_do_glb(glb, "hbm_normal")
    aoP = np.asarray(Image.fromarray((ao * 255).astype(np.uint8)).resize(pele0.size, Image.BILINEAR), np.float32) / 255.0
    tam = {im["name"]: j["bufferViews"][im["bufferView"]]["byteLength"] for im in j["images"] if im.get("name")}
    novo = {"hbm_normal": jpeg(Image.open(os.path.join(saida, "hbm_normal_relevo.png")), nrm0, tam["hbm_normal"]),
            "hbm_pele": jpeg(Image.fromarray(np.clip(np.asarray(pele0.convert("RGB"), np.float32) * aoP[..., None], 0, 255).astype(np.uint8)), pele0, tam["hbm_pele"])}
    vista = {j["images"][k]["bufferView"]: novo[im["name"]] for k, im in enumerate(j["images"]) if im.get("name") in novo}
    partes = []; pos_b = 0
    for k, v in enumerate(j["bufferViews"]):   # reempacota o binário (alinhado em 4) com as duas imagens novas
        dado = vista.get(k, binc[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
        v["byteOffset"] = pos_b; v["byteLength"] = len(dado); partes.append(dado + b"\0" * (-len(dado) % 4)); pos_b += len(partes[-1])
    j["buffers"][0]["byteLength"] = pos_b
    j.setdefault("asset", {}).setdefault("extras", {})["relevo"] = 1
    js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * (-len(js) % 4); bn = b"".join(partes)
    with open(glb, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack("<II", len(bn), 0x004E4942)); f.write(bn)
    print("relevo: embutido em", glb, {k: len(v) for k, v in novo.items()}, "bytes")
if os.environ.get("PREVIA"):   # PREVIA=1: a altura (vermelho sobe, azul desce) e a oclusão sobre a pele, pra conferir o lugar dos traços
    pele = np.asarray(imagem_do_glb(glb, "hbm_pele").convert("RGB").resize((N, N)), np.float32)
    v = np.zeros((N, N, 3), np.float32); v[..., 0] = np.clip(H, 0, None) / 1.0; v[..., 2] = np.clip(-H, 0, None) / 1.5; v[..., 1] = AO / 0.2
    Image.fromarray(np.clip(pele * 0.45 + v * 255 * 0.8, 0, 255).astype(np.uint8)).save(os.path.join(saida, "previa_relevo.jpg"), quality=85)
print("relevo: altura", round(float(H.min()), 2), "a", round(float(H.max()), 2), "mm; oclusão máx", round(float(AO.max()), 2), "; texels no tronco e braço", int(regiao.sum()))
