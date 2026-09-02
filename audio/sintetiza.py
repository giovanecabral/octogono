"""
sintetiza.py — gera os áudios do jogo por síntese, sem sample nem licença.

Regras que guiam todas as escolhas aqui:
  - peso em grave e médio; nada de brilho metálico
  - passa-baixa em tudo acima de ~6 kHz
  - sem chimbal brilhante, sem synth agudo
  - a trilha tem que fechar em loop perfeito (a cauda soma na cabeça)
  - grave presente mas SEM distorcer: limitador macio no fim

Saída: WAV 44.1 kHz 16 bits + versão OGG/MP3 da trilha.
"""
import numpy as np
from scipy import signal
import wave, struct, os

SR = 44100

# ---------------------------------------------------------------- utilidades
def lp(x, corte, ordem=4):
    b, a = signal.butter(ordem, min(corte / (SR / 2), 0.99), "low")
    return signal.filtfilt(b, a, x)

def hp(x, corte, ordem=2):
    b, a = signal.butter(ordem, max(corte / (SR / 2), 1e-4), "high")
    return signal.filtfilt(b, a, x)

def bp(x, lo, hi, ordem=2):
    b, a = signal.butter(ordem, [max(lo/(SR/2),1e-4), min(hi/(SR/2),0.99)], "band")
    return signal.filtfilt(b, a, x)

def env_ad(n, atq, dec, curva=2.5):
    """ataque linear curto, decaimento exponencial"""
    a = max(1, int(atq * SR)); d = max(1, n - a)
    return np.concatenate([np.linspace(0, 1, a), np.exp(-np.linspace(0, curva, d))])[:n]

def ruido(n, semente=None):
    rng = np.random.default_rng(semente)
    return rng.standard_normal(n)

def add(base, x, pos):
    """soma x em base na amostra pos, com wrap-around: é isso que fecha o loop.
    A cauda que passaria do fim reaparece no começo, então o ponto de emenda
    não tem corte nem silêncio."""
    n = len(base); i = int(pos) % n
    if i + len(x) <= n:
        base[i:i + len(x)] += x
    else:
        corte = n - i
        base[i:] += x[:corte]
        resto = x[corte:]
        base[:min(len(resto), n)] += resto[:n]
    return base

BANDAS = [(20, 60), (60, 250), (250, 2000), (2000, 6000)]

def energia(x):
    """fração da energia em cada banda"""
    f, P = signal.welch(x, SR, nperseg=min(8192, max(256, len(x) // 2)))
    tot = P.sum() or 1.0
    return [P[(f >= a) & (f < b)].sum() / tot for a, b in BANDAS]

def equilibra(x, alvo, passos=6):
    """Ajusta o ganho de cada banda até a distribuição bater no alvo.

    Existe porque adivinhar ganho no olho não funcionou: a primeira versão saiu
    com 83% da energia abaixo de 60 Hz e 0,2% de médio — ronco no fone e nada
    no alto-falante de celular. Aqui a gente MEDE e corrige, em vez de supor.
    """
    alvo = np.array(alvo, float); alvo /= alvo.sum()
    partes = []
    for a, b in BANDAS:
        if a <= 20:
            partes.append(lp(x, b))
        elif b >= 6000:
            partes.append(hp(x, a))
        else:
            partes.append(bp(x, a, b, 3))
    resto = x - sum(partes)
    g = np.ones(len(BANDAS))
    for _ in range(passos):
        y = sum(gi * p for gi, p in zip(g, partes)) + resto
        atual = np.array(energia(y))
        atual = np.maximum(atual, 1e-6)
        g *= np.sqrt(alvo / atual) ** 0.7      # passo amortecido, evita oscilar
        g = np.clip(g, 0.05, 12)
    return sum(gi * p for gi, p in zip(g, partes)) + resto

def limitador(x, teto=0.89, joelho=0.72):
    """compressão macia acima do joelho: segura o pico sem achatar o grave"""
    s = np.sign(x); m = np.abs(x)
    acima = m > joelho
    m[acima] = joelho + (teto - joelho) * np.tanh((m[acima] - joelho) / (teto - joelho))
    return s * m

def salva(nome, x, ganho=1.0):
    x = limitador(x * ganho)
    pico = np.max(np.abs(x)) or 1.0
    if pico > 0.97:
        x = x * (0.97 / pico)
    dados = (x * 32767).astype(np.int16)
    with wave.open(nome, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(dados.tobytes())
    dur = len(x) / SR
    print(f"  {os.path.basename(nome):20} {dur:6.2f}s  pico {np.max(np.abs(x)):.2f}  "
          f"RMS {np.sqrt(np.mean(x**2)):.3f}")
    return x

# ---------------------------------------------------------------- instrumentos
def bumbo(dur=0.55, f0=115, f1=44, pico=1.0):
    """corpo senoidal com queda rápida de altura + estalo curto do batente"""
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 26)
    corpo = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = lp(ruido(n, 1), 2200) * np.exp(-t * 220) * 0.22
    sub = np.sin(2 * np.pi * 41 * t) * np.exp(-t * 5.5) * 0.22
    return (corpo + click + sub) * pico

def taiko(dur=0.9, f0=95, pico=1.0):
    """tambor de arena: pele em ruído filtrado + corpo grave"""
    n = int(dur * SR); t = np.arange(n) / SR
    f = f0 * (1 + 0.35 * np.exp(-t * 18))
    corpo = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
    pele = bp(ruido(n, 7), 120, 900) * np.exp(-t * 16) * 0.5
    return lp(corpo + pele, 3500) * pico

def caixa_surda(dur=0.35, pico=1.0):
    """caixa sem brilho: banda média, nada acima de 3 kHz"""
    n = int(dur * SR); t = np.arange(n) / SR
    corpo = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22) * 0.5
    pele = bp(ruido(n, 3), 220, 2600) * np.exp(-t * 24)
    return (corpo + pele) * pico

def perc_seca(dur=0.13, pico=1.0):
    """marcação leve no lugar do chimbal: filtrada em banda média"""
    n = int(dur * SR); t = np.arange(n) / SR
    return bp(ruido(n, 11), 400, 2400) * np.exp(-t * 55) * pico

def sub_bass(dur, freq, pico=1.0, glide=None):
    n = int(dur * SR); t = np.arange(n) / SR
    f = np.full(n, float(freq))
    if glide is not None:
        f = glide + (freq - glide) * (1 - np.exp(-t * 9))
    fase = 2 * np.pi * np.cumsum(f) / SR
    onda = np.sin(fase) + 0.14 * np.sin(2 * fase)   # 2º harmônico dá presença em fone pequeno
    ataque = 1 - np.exp(-t * 60)
    solta = np.exp(-np.maximum(0, t - (dur - 0.10)) * 22)
    # 3º harmônico leve: o baixo passa a existir em caixa pequena
    onda = onda + 0.09 * np.sin(3 * fase)
    return lp(onda, 520) * ataque * solta * pico

def pad(dur, freqs, pico=1.0, corte=900):
    """serras desafinadas por passa-baixa: o 'synth escuro'"""
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.13, 0.0, 0.15):
            ph = 2 * np.pi * (f + det) * t + np.random.default_rng(int(f * 10)).random() * 6.28
            s += signal.sawtooth(ph) * 0.33
    s = lp(s / max(1, len(freqs)), corte)
    entra = 1 - np.exp(-t * 2.2)
    sai = np.exp(-np.maximum(0, t - (dur - 0.5)) * 4)
    return s * entra * sai * pico

# ================================================================ 1. BGM
def bgm():
    BPM = 92.0
    bat = 60.0 / BPM                 # 0.652 s
    compasso = 4 * bat
    N_COMP = 44                      # 44 compassos ≈ 1:55
    total = int(N_COMP * compasso * SR)
    mix = np.zeros(total)

    # progressão em Lá menor que volta para Am no fim: o loop fecha na harmonia
    # (Am, Am, F, G) x 11 — a última leva de volta ao começo naturalmente
    prog = [("Am", [55, 65.41, 82.41]), ("Am", [55, 65.41, 82.41]),
            ("F",  [43.65, 65.41, 87.31]), ("G", [49.0, 73.42, 98.0])]
    raiz = {"Am": 55.0, "F": 43.65, "G": 49.0}

    for c in range(N_COMP):
        t0 = c * compasso
        nome, notas = prog[c % 4]

        # --- colchão harmônico (entra depois do compasso 4, sai perto do fim
        #     e volta: variação sem quebrar o loop)
        if 4 <= c < N_COMP - 2:
            vol = 0.30 if (c % 8) < 4 else 0.21
            add(mix, pad(compasso * 1.02, [f * 4 for f in notas], vol, corte=2200),
                t0 * SR)
            # camada média que dá corpo em caixa de celular
            add(mix, pad(compasso * 1.02, [f * 8 for f in notas], vol * 0.42,
                         corte=3200), t0 * SR)

        # --- sub bass: nota longa + pulso no contratempo
        add(mix, sub_bass(bat * 1.9, raiz[nome], 0.34), t0 * SR)
        add(mix, sub_bass(bat * 0.7, raiz[nome], 0.22), (t0 + bat * 2.5) * SR)

        # --- bumbo: padrão fixo, é a âncora que não muda nunca
        for p in (0.0, 1.5, 2.0, 3.5):
            add(mix, bumbo(pico=0.85 if p in (0.0, 2.0) else 0.6), (t0 + p * bat) * SR)

        # --- caixa surda nos tempos 2 e 4
        for p in (1.0, 3.0):
            add(mix, caixa_surda(pico=0.62), (t0 + p * bat) * SR)

        # --- taiko de arena a cada 4 compassos, marcando a virada
        if c % 4 == 3:
            add(mix, taiko(pico=0.55), (t0 + 3.5 * bat) * SR)
        if c % 8 == 0:
            add(mix, taiko(1.2, 78, 0.45), t0 * SR)

        # --- percussão seca em colcheias, bem baixa (no lugar do chimbal)
        if c >= 8:
            for i in range(8):
                if i % 2 == 1 or (i % 4 == 0):
                    add(mix, perc_seca(pico=0.16 if i % 2 else 0.10),
                        (t0 + i * bat / 2) * SR)

    # --- movimento lento do filtro no conjunto: 1 ciclo inteiro no loop,
    #     então o timbre no ponto de emenda é idêntico
    t = np.arange(total) / SR
    ciclo = 0.5 + 0.5 * np.sin(2 * np.pi * t / (total / SR))
    grave = lp(mix, 240)
    resto = mix - grave
    mix = grave + resto * (0.55 + 0.45 * ciclo)

    # equilíbrio final: corta o excesso de sub e devolve presença nos médios,
    # senão a trilha vira ronco no fone e some no alto-falante do celular
    mix = mix - 0.55 * lp(mix, 55)
    mix = mix + 0.30 * bp(mix, 300, 2000)
    mix = lp(mix, 6200)              # teto: nada de brilho metálico
    mix = hp(mix, 28)                # tira o inaudível que só consome headroom
    # sub contido, grave e médio dominando: é o que soa forte no fone E no
    # alto-falante pequeno, que é onde a maioria vai jogar
    mix = equilibra(mix, [0.16, 0.40, 0.36, 0.08])

    # A emenda ainda dava um salto 2,5x maior que a batida mais forte, porque o
    # ataque do bumbo cai exatamente na amostra 0. 12 ms de crossfade de
    # potência constante resolvem sem tirar o soco da primeira batida.
    x = int(0.012 * SR)
    jan = np.linspace(0, np.pi / 2, x)
    mix[:x] = mix[:x] * np.sin(jan) + mix[-x:] * np.cos(jan)
    mix = mix[:-x]
    return mix * 0.72

# ================================================================ 2. clique
def clique():
    dur = 0.14; n = int(dur * SR); t = np.arange(n) / SR
    f = 420 * np.exp(-t * 34) + 132
    corpo = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(n, 0.0015, dur, 5.5)
    medio = np.sin(2 * np.pi * (660 * np.exp(-t * 40) + 240) * t) * np.exp(-t * 46) * 0.30
    bat = bp(ruido(n, 5), 400, 2600) * np.exp(-t * 120) * 0.40
    sub = np.sin(2 * np.pi * 72 * t) * np.exp(-t * 30) * 0.26
    return equilibra(lp(corpo * 0.6 + medio + bat + sub, 3400), [0.08, 0.44, 0.44, 0.04])

# ================================================================ 3. vitória
def vitoria():
    dur = 2.6; n = int(dur * SR)
    out = np.zeros(n)
    add(out, bumbo(0.9, 130, 40, 1.0), 0)                  # o impacto primeiro
    add(out, taiko(1.4, 88, 0.62), 0.02 * SR)
    # subida em Lá menor -> Dó maior: fecha em terça maior, soa conquista
    for i, f in enumerate([110.0, 130.81, 164.81, 220.0]):
        d = dur - 0.35 - i * 0.13
        add(out, pad(d, [f, f * 1.5], 0.30, corte=1100), (0.22 + i * 0.13) * SR)
        add(out, sub_bass(0.6, f / 2, 0.30), (0.22 + i * 0.13) * SR)
    add(out, sub_bass(1.9, 55, 0.55), 0.05 * SR)           # peso embaixo o tempo todo
    add(out, taiko(1.1, 70, 0.4), 1.55 * SR)
    t = np.arange(n) / SR
    out = lp(out, 4800) * np.minimum(1, np.exp(-np.maximum(0, t - (dur - 0.7)) * 3.4))
    return equilibra(out, [0.18, 0.40, 0.35, 0.07])

# ================================================================ 4. derrota
def derrota():
    dur = 2.8; n = int(dur * SR)
    out = np.zeros(n)
    add(out, bumbo(1.0, 105, 33, 0.85), 0)
    add(out, taiko(1.6, 66, 0.5), 0.04 * SR)
    # queda em menor: Lá -> Fá -> Ré, terminando na fundamental sozinha
    # O acorde estava em 73-110 Hz com filtro em 680: não havia médio nenhum
    # para o equalizador realçar. Sobe uma oitava; o sub segue embaixo.
    for i, f in enumerate([220.0, 174.61, 146.83]):
        add(out, pad(dur - 0.5 - i * 0.22, [f, f * 1.19, f * 2], 0.26, corte=1900),
            (0.25 + i * 0.22) * SR)
    add(out, sub_bass(2.3, 55, 0.34, glide=62), 0.1 * SR)
    # 36,7 Hz é sub demais: quase toda a energia ia para uma nota que o
    # alto-falante de celular nem reproduz. Uma oitava acima ainda dá o
    # "chão cedendo" e continua audível.
    add(out, sub_bass(1.5, 73.42, 0.30), 1.15 * SR)
    t = np.arange(n) / SR
    out = lp(out, 3400) * np.minimum(1, np.exp(-np.maximum(0, t - (dur - 0.9)) * 2.6))
    return equilibra(out, [0.22, 0.42, 0.33, 0.03])

# ================================================================
if __name__ == "__main__":
    os.makedirs("saida", exist_ok=True)
    print("gerando:\n")
    salva("saida/button_click.wav", clique(), 0.85)
    salva("saida/victory.wav",      vitoria(), 0.92)
    salva("saida/defeat.wav",       derrota(), 0.92)
    m = salva("saida/bgm_fight.wav", bgm(), 1.0)

    # verificação do loop: a emenda tem que ser contínua
    borda = np.abs(m[-1] - m[0])
    janela = int(0.05 * SR)
    rms_ini = np.sqrt(np.mean(m[:janela] ** 2))
    rms_fim = np.sqrt(np.mean(m[-janela:] ** 2))
    print(f"\n  emenda do loop: salto {borda:.4f} | RMS início {rms_ini:.3f} "
          f"vs fim {rms_fim:.3f} (diferença {abs(rms_ini-rms_fim)/max(rms_ini,1e-9)*100:.0f}%)")
