#!/bin/bash
# uma variante: matriz + duração + cartas, resumido (uso: sim/rodada.sh '<SIM_AJUSTE>' [lutas])
cd "$(dirname "$0")/.."
SIM_AJUSTE="$1" SIM_PARTES=${SIM_PARTES:-matriz} node sim/simular.mjs ${2:-600} > /dev/null 2>&1
grep -E "^\| (Striker|Wrestler|Grappler|Counter) \|" sim/relatorio.md | sed 's/| \*\*/ agg /' | tr -s ' ' | cut -c1-80
awk '/Trocas por luta/{getline; getline; print}' sim/relatorio.md
grep -E "^Trocas com velocidade" sim/relatorio.md | cut -c1-120
grep -E "^\| (Jab|Cruzado|Chute alto|Bloqueio|Contra-ataque|Queda|Antiqueda|Pressão|Puxar|Segurar|Guarda|Raspar|Levantar|Golpes por|Ground|Avançar|Finaliza)" sim/relatorio.md | awk -F'|' '{printf "%s:%s/%s/%s  ", $2, $4, $5, $6} END {print ""}' | tr -s ' '
grep -E "^\| (Striker|Wrestler|Grappler|Counter) \| [0-9.]+% \|" sim/relatorio.md | tr -s ' '
