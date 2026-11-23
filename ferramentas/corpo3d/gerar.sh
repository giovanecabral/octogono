#!/bin/sh
# Corpo realista do 3D (2026-11-20): gera luta3d/lutador.glb, luta3d/pecas/*.glb (cabelo, barba, roupas) e as
# texturas de fios (luta3d/fios.webp, luta3d/cachos.webp). Tudo CC0 (malha da Blender Studio, pele e pesos do
# MakeHuman, o resto gerado aqui). Pede o Blender 4.5 com a extensão MPFB2 e, nos dados de usuário dela, a pele
# young_caucasian_male e as sobrancelhas mindfront (pacotes CC0 do MakeHuman); e o Human Base Meshes da Blender
# Studio (HBM). Uso: sh ferramentas/corpo3d/gerar.sh [pasta de trabalho, fora do repositório]
# Mexeu em corpo, roupa ou cabelo: rode de novo e confira na bancada (RETRATO=... node ferramentas/bancada3d.mjs).
set -e
AQUI=$(cd "$(dirname "$0")" && pwd); RAIZ=$(cd "$AQUI/../.." && pwd)
TRAB=${1:-$HOME/octogono-3d/trab}
B=${BLENDER:-$HOME/octogono-3d/Blender.app/Contents/MacOS/Blender}
HBM=${HBM:-$HOME/octogono-3d/assets/hbm/human_base_meshes_bundle.blend}
mkdir -p "$TRAB"
echo "1/5 texturas de fios e de cachos"
python3 "$AQUI/atlas_fios.py" "$TRAB/fios.png"
python3 "$AQUI/atlas_cachos.py" "$TRAB/cachos.webp"
python3 "$AQUI/atlas_mecha.py" "$TRAB"
for t in mecha mecha_n crespo crespo_n; do python3 -c "import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], quality=92, method=6)" "$TRAB/$t.png" "$TRAB/$t.webp"; done
python3 -c "import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], quality=90, method=6)" "$TRAB/fios.png" "$TRAB/fios.webp"
echo "2/5 corpo escaneado: UV num quadro só e o relevo assado (só na primeira vez)"
[ -f "$TRAB/hbm_base.blend" ] || "$B" --background "$HBM" --python-exit-code 1 --python "$AQUI/hbm_base.py" -- "$TRAB" > "$TRAB/hbm_base.log" 2>&1
echo "3/5 corpo, calção, luva, cabelo, barba e roupas (Blender)"
CFG=$(python3 -c "import json,sys; c=json.load(open(sys.argv[1])); c['saida']=sys.argv[2]; c['modelo']=sys.argv[3]; print(json.dumps(c))" \
  "$AQUI/corpo.json" "$TRAB/corpo_bruto.glb" "$AQUI/esqueleto_referencia.glb")
rm -rf "$TRAB/pecas"
"$B" --background --python-exit-code 1 --python "$AQUI/corpo.py" -- "$CFG" > "$TRAB/corpo.log" 2>&1 || { tail -30 "$TRAB/corpo.log"; exit 1; }
grep -E "^(CABELOS|ROUPAS|EXPORTADO)" "$TRAB/corpo.log"
echo "4/5 esqueleto do jogo no corpo novo (e o pivô da cabeça)"
node "$AQUI/transplante.mjs" "$TRAB/corpo_bruto.glb" "$AQUI/esqueleto_referencia.glb" "$TRAB/lutador.glb" "$TRAB/bind_corpo.json"
echo "5/5 copia pro jogo"
cp "$TRAB/lutador.glb" "$RAIZ/luta3d/lutador.glb"
rm -rf "$RAIZ/luta3d/pecas"; mkdir -p "$RAIZ/luta3d/pecas"; cp "$TRAB"/pecas/*.glb "$RAIZ/luta3d/pecas/"
cp "$TRAB/fios.webp" "$TRAB/cachos.webp" "$TRAB"/mecha*.webp "$TRAB"/crespo*.webp "$RAIZ/luta3d/"
ls -la "$RAIZ/luta3d/lutador.glb"; du -sh "$RAIZ/luta3d/pecas"
