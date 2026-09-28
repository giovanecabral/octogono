#!/usr/bin/env python3
"""Prepara os arquivos de som do jogo (revamp fase 6).

Baixa as fontes para audio/bruto/ (fora do git), conferindo a licença na
página de cada uma (só CC0 ou CC-BY entram), corta, normaliza e codifica
os MP3 finais em audio/ e escreve audio/LICENCAS.md. Rodar de novo refaz
tudo igual. Precisa de ffmpeg (brew install ffmpeg).

Uso: python3 audio/preparar.py
"""
import html
import json
import os
import re
import subprocess
import sys
import urllib.request
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
BRUTO = os.path.join(AQUI, "bruto")
UA = {"User-Agent": "Mozilla/5.0"}
ORCAMENTO_KB = 8 * 1024

CC0 = ("CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/")
CCBY = ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/")
FMA = "https://freemusicarchive.org/music/holiznacc0/"

# Fontes: de onde vem cada arquivo bruto, quem fez e com que licença.
FONTES = {
    "nine-to-death": dict(tipo="fma", pagina=FMA + "public-domain-lofi/nine-to-death/", autor="HoliznaCC0",
                          obra="Nine To Death", lic=CC0),
    "busted-jazz": dict(tipo="fma", pagina=FMA + "lo-fi-and-chill/busted-jazz/", autor="HoliznaCC0",
                        obra="Busted Jazz", lic=CC0),
    "phonk-re-adjustment": dict(tipo="fma", pagina=FMA + "phonk-aura-farming/re-adusjtment/", autor="HoliznaCC0",
                                obra="Re Adusjtment", lic=CC0),
    "phonk-pantheon": dict(tipo="fma", pagina=FMA + "phonk-aura-farming/pantheon/", autor="HoliznaCC0",
                           obra="Pantheon", lic=CC0),
    "chills": dict(tipo="fma", pagina=FMA + "sad-beats/chills/", autor="HoliznaCC0", obra="Chills", lic=CC0),
    "quendel-crowd": dict(tipo="zip", url="https://opengameart.org/sites/default/files/gregor_quendel_-_free_crowd_cheering_sounds_-_mp3.zip",
                          pagina="https://opengameart.org/content/free-crowd-cheering-sounds", autor="Gregor Quendel",
                          obra="Free Crowd Cheering Sounds", lic=CCBY),
    "kenney-impact": dict(tipo="zip", url="https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
                          pagina="https://kenney.nl/assets/impact-sounds", autor="Kenney (kenney.nl)", obra="Impact Sounds", lic=CC0),
    "kenney-interface": dict(tipo="zip", url="https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
                             pagina="https://kenney.nl/assets/interface-sounds", autor="Kenney (kenney.nl)", obra="Interface Sounds", lic=CC0),
    "kenney-ui": dict(tipo="zip", url="https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip",
                      pagina="https://kenney.nl/assets/ui-audio", autor="Kenney (kenney.nl)", obra="UI Audio", lic=CC0),
    "kenney-casino": dict(tipo="zip", url="https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip",
                          pagina="https://kenney.nl/assets/casino-audio", autor="Kenney (kenney.nl)", obra="Casino Audio", lic=CC0),
    "kenney-jingles": dict(tipo="zip", url="https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip",
                           pagina="https://kenney.nl/assets/music-jingles", autor="Kenney (kenney.nl)", obra="Music Jingles", lic=CC0),
    "sino": dict(tipo="direto", url="https://bigsoundbank.com/UPLOAD/mp3/1926.mp3", arquivo="bigsoundbank-boxing-bell-1926.mp3",
                 pagina="https://bigsoundbank.com/boxing-bell-1-s1926.html", autor="Joseph Sardin (BigSoundBank)",
                 obra="Boxing bell #1", lic=CC0),
    "paparazzi": dict(tipo="direto", url="https://bigsoundbank.com/UPLOAD/mp3/2390.mp3", arquivo="bigsoundbank-paparazzi-2390.mp3",
                      pagina="https://bigsoundbank.com/paparazzi-2-s2390.html", autor="Joseph Sardin (BigSoundBank)",
                      obra="Paparazzi #2", lic=CC0),
    "vaia": dict(tipo="zip", url="https://www.freesoundslibrary.com/wp-content/uploads/2018/02/crowd-booing.zip",
                 pagina="https://www.freesoundslibrary.com/crowd-booing/", autor="Free Sounds Library (freesoundslibrary.com)",
                 obra="Crowd Booing", lic=CCBY),
}

QUENDEL = "quendel-crowd/Gregor Quendel - Free Crowd Cheering Sounds - MP3/Gregor Quendel - Crowd Cheering Sounds - "

# Saídas: arquivo final em audio/, fonte, entrada dentro da fonte e receita.
# m = música (loudnorm, estéreo); s = efeito (pico em -1 dBFS, mono)
SAIDAS = [
    dict(arq="musica-menu.mp3", fonte="nine-to-death", tipo="m", fin=2, fout=4, papel="Trilha do menu e das páginas"),
    dict(arq="musica-hub.mp3", fonte="busted-jazz", tipo="m", fin=1, fout=3, papel="Trilha do hub da carreira"),
    dict(arq="musica-noite.mp3", fonte="phonk-re-adjustment", tipo="m", t=155, fout=4, papel="Noite de luta (oferta, camp, coletiva, resultado)"),
    dict(arq="musica-walkout.mp3", fonte="phonk-pantheon", tipo="m", ss=10, t=120, fin=.3, fout=4, papel="Walkout na entrada; abafada por baixo da torcida na luta"),
    dict(arq="torcida-ambiente.mp3", fonte="quendel-crowd", entrada=QUENDEL + "10 - Ambience.mp3", tipo="m", lufs=-20, kbps=80, fin=.5, fout=.5, papel="Torcida de fundo durante a luta (loop)"),
    dict(arq="vinheta-vitoria.mp3", fonte="quendel-crowd", tipo="vitoria", papel="Vinheta de vitória (acento da Kenney + torcida)",
         extra=("kenney-jingles", "Hit jingles/jingles_HIT09.ogg")),
    dict(arq="vinheta-derrota.mp3", fonte="chills", tipo="m", ss=10, t=6, fin=.3, fout=2.5, lowpass=3500, kbps=96, papel="Vinheta de derrota"),
    dict(arq="torcida-explode.mp3", fonte="quendel-crowd", entrada=QUENDEL + "03 - Strong cheering - I.mp3", tipo="s", t=5, fin=.08, fout=2, mono=False, papel="Torcida no knockdown e no nocaute"),
    dict(arq="torcida-sobe.mp3", fonte="quendel-crowd", entrada=QUENDEL + "05 - Soft cheering - I.mp3", tipo="s", t=4, fin=.3, fout=1.5, mono=False, papel="Torcida na quase finalização"),
    dict(arq="vaia.mp3", fonte="vaia", entrada="Crowd-booing.mp3", tipo="s", papel="Vaia na derrota por decisão"),
    dict(arq="flashes.mp3", fonte="paparazzi", tipo="s", pico=-6, papel="Flashes na coletiva"),
    dict(arq="golpe-leve-1.mp3", fonte="kenney-impact", entrada="impactPunch_medium_000.ogg", tipo="s", papel="Golpe leve"),
    dict(arq="golpe-leve-2.mp3", fonte="kenney-impact", entrada="impactPunch_medium_001.ogg", tipo="s", papel="Golpe leve"),
    dict(arq="golpe-leve-3.mp3", fonte="kenney-impact", entrada="impactPunch_medium_002.ogg", tipo="s", papel="Golpe leve"),
    dict(arq="golpe-pesado-1.mp3", fonte="kenney-impact", entrada="impactPunch_heavy_000.ogg", tipo="s", papel="Golpe pesado"),
    dict(arq="golpe-pesado-2.mp3", fonte="kenney-impact", entrada="impactPunch_heavy_001.ogg", tipo="s", papel="Golpe pesado"),
    dict(arq="golpe-pesado-3.mp3", fonte="kenney-impact", entrada="impactPunch_heavy_002.ogg", tipo="s", papel="Golpe pesado"),
    dict(arq="queda-1.mp3", fonte="kenney-impact", entrada="impactSoft_heavy_000.ogg", tipo="s", papel="Queda (derrubada)"),
    dict(arq="queda-2.mp3", fonte="kenney-impact", entrada="impactSoft_heavy_001.ogg", tipo="s", papel="Queda (derrubada)"),
    dict(arq="sino-inicio.mp3", fonte="sino", tipo="s", ss=.45, t=1.95, fout=1, mono=False, papel="Sino do começo do round"),
    dict(arq="sino-fim.mp3", fonte="sino", tipo="s", t=4.5, fout=1.5, mono=False, papel="Sino do fim do round"),
    dict(arq="ui-clique.mp3", fonte="kenney-interface", entrada="select_001.ogg", tipo="s", pico=-8, papel="Clique"),
    dict(arq="ui-hover.mp3", fonte="kenney-ui", entrada="rollover2.ogg", tipo="s", pico=-16, papel="Passar o mouse"),
    dict(arq="ui-aba.mp3", fonte="kenney-interface", entrada="switch_002.ogg", tipo="s", pico=-8, papel="Troca de aba"),
    dict(arq="carta.mp3", fonte="kenney-casino", entrada="card-slide-1.ogg", tipo="s", pico=-6, papel="Carta entrando"),
    dict(arq="caixa.mp3", fonte="kenney-casino", entrada="chips-stack-1.ogg", tipo="s", pico=-4, papel="Compra na loja (fichas)"),
    dict(arq="conquista.mp3", fonte="kenney-interface", entrada="confirmation_002.ogg", tipo="s", pico=-4, papel="Conquista desbloqueada"),
]


def baixar(url, destino):
    if os.path.exists(destino):
        return
    dados = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()
    open(destino, "wb").write(dados)


def buscar_fontes():
    os.makedirs(BRUTO, exist_ok=True)
    for chave, f in FONTES.items():
        if f["tipo"] == "fma":
            destino = os.path.join(BRUTO, chave + ".mp3")
            if not os.path.exists(destino):
                pag = urllib.request.urlopen(urllib.request.Request(f["pagina"], headers=UA), timeout=60).read().decode("utf-8", "ignore")
                lic = re.search(r'rel="license" href="([^"]+)"', pag)
                assert lic and lic.group(1).rstrip("/") == f["lic"][1].rstrip("/"), (chave, lic and lic.group(1))
                info = json.loads(html.unescape(re.search(r"data-track-info='([^']+)'", pag).group(1)))
                baixar(info["fileUrl"], destino)
            f["local"] = destino
        elif f["tipo"] == "zip":
            zipado = os.path.join(BRUTO, chave + ".zip")
            baixar(f["url"], zipado)
            pasta = os.path.join(BRUTO, chave)
            if not os.path.isdir(pasta):
                zipfile.ZipFile(zipado).extractall(pasta)
            f["local"] = pasta
        else:
            destino = os.path.join(BRUTO, f["arquivo"])
            baixar(f["url"], destino)
            f["local"] = destino


def achar(pasta, nome):
    for raiz, _, arquivos in os.walk(pasta):
        for a in arquivos:
            if os.path.join(raiz, a).endswith(nome):
                return os.path.join(raiz, a)
    raise FileNotFoundError(nome)


def entrada_de(s):
    f = FONTES[s["fonte"]]
    if "entrada" in s:
        return achar(f["local"], s["entrada"]) if os.path.isdir(f["local"]) else f["local"]
    return f["local"]


def pico_db(arq):
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", arq, "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True)
    return float(re.search(r"max_volume: (-?[\d.]+) dB", p.stderr).group(1))


def ffmpeg(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y"] + args, check=True)


def preparar(s):
    saida = os.path.join(AQUI, s["arq"])
    ent = entrada_de(s)
    corte = []
    if s.get("ss"):
        corte += ["-ss", str(s["ss"])]
    if s.get("t"):
        corte += ["-t", str(s["t"])]
    if s["tipo"] == "vitoria":
        acento = achar(FONTES[s["extra"][0]]["local"], s["extra"][1])
        torcida = achar(FONTES["quendel-crowd"]["local"], "04 - Strong cheering - II - Short.mp3")
        ffmpeg(["-i", acento, "-i", torcida, "-filter_complex",
                "[1:a]atrim=0:7,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.15,afade=t=out:st=4.5:d=2.5,volume=0.75[c];"
                "[0:a]aformat=channel_layouts=stereo[h];[h][c]amix=inputs=2:duration=longest:normalize=0,"
                "loudnorm=I=-16:TP=-1.5",
                "-ar", "44100", "-ac", "2", "-b:a", "96k", saida])
        return saida
    filtros = []
    dur = s.get("t")
    if s.get("fin"):
        filtros.append(f"afade=t=in:st=0:d={s['fin']}")
    if s.get("fout"):
        if dur is None:
            dur = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", ent],
                                       capture_output=True, text=True).stdout) - (s.get("ss") or 0)
        filtros.append(f"afade=t=out:st={max(0, dur - s['fout']):.2f}:d={s['fout']}")
    if s.get("lowpass"):
        filtros.append(f"lowpass=f={s['lowpass']}")
    if s["tipo"] == "m":
        filtros.append(f"loudnorm=I={s.get('lufs', -18)}:TP=-1.5:LRA=11")
        ffmpeg(corte + ["-i", ent, "-af", ",".join(filtros), "-ar", "44100", "-ac", "2", "-b:a", f"{s.get('kbps', 96)}k", saida])
    else:
        tmp = saida + ".tmp.wav"
        ffmpeg(corte + ["-i", ent] + (["-af", ",".join(filtros)] if filtros else []) + ["-ar", "44100",
               "-ac", "1" if s.get("mono", True) else "2", tmp])
        ganho = s.get("pico", -1) - pico_db(tmp)
        ffmpeg(["-i", tmp, "-af", f"volume={ganho:.2f}dB", "-b:a", "64k" if s.get("mono", True) else "96k", saida])
        os.remove(tmp)
    return saida


def escrever_licencas():
    linhas = ["# Licenças dos sons (revamp fase 6)", "",
              "Gerado por `audio/preparar.py`. Só entra som com licença de uso comercial:",
              "CC0 (domínio público) ou CC BY (crédito obrigatório, dado na página Créditos",
              "do jogo e aqui). Cada arquivo final, de onde veio e com que licença:", "",
              "| Arquivo | Uso no jogo | Obra original | Autor | Licença | Página |",
              "|---|---|---|---|---|---|"]
    for s in SAIDAS:
        f = FONTES[s["fonte"]]
        obra = f["obra"] + (f" ({os.path.basename(s['entrada'])})" if s.get("entrada") else "")
        if s["tipo"] == "vitoria":
            k = FONTES[s["extra"][0]]
            obra = f"{k['obra']} (jingles_HIT09) + {f['obra']} (04 - Strong cheering - II - Short)"
            linhas.append(f"| `{s['arq']}` | {s['papel']} | {obra} | {k['autor']} ({k['lic'][0]}) + {f['autor']} | "
                          f"[{k['lic'][0]}]({k['lic'][1]}) + [{f['lic'][0]}]({f['lic'][1]}) | {k['pagina']} + {f['pagina']} |")
            continue
        linhas.append(f"| `{s['arq']}` | {s['papel']} | {obra} | {f['autor']} | [{f['lic'][0]}]({f['lic'][1]}) | {f['pagina']} |")
    linhas += ["", "Cortes, fades, normalização e mixagem são obra derivada feita para o jogo;",
               "as licenças acima permitem isso (CC0 sem condição; CC BY com crédito)."]
    open(os.path.join(AQUI, "LICENCAS.md"), "w").write("\n".join(linhas) + "\n")


def main():
    buscar_fontes()
    total = 0
    for s in SAIDAS:
        arq = preparar(s)
        kb = os.path.getsize(arq) / 1024
        total += kb
        print(f"{s['arq']:26s} {kb:7.0f} KB  {s['papel']}")
    print(f"{'total':26s} {total:7.0f} KB  (orçamento {ORCAMENTO_KB} KB)")
    escrever_licencas()
    if total > ORCAMENTO_KB:
        sys.exit("passou do orçamento de som")


if __name__ == "__main__":
    main()
