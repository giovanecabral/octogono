#!/bin/bash
# resumo do relatório: agregado por estilo em cada matriz, métodos e evolução
cd "$(dirname "$0")/.."
awk '
/^## /{sec=$0}
/^Deck padrão:/{sub_="padrão"} /^Com a carta nova/{sub_="nova"}
/^\| (Striker|Wrestler|Grappler|Counter) \|/ && /\*\*/ { split($0,c,"|"); gsub(/\*| /,"",c[7]); ag[sec sub_]=ag[sec sub_] substr(c[2],2,4) c[7] " " }
/^\| [0-9.]+ \| [0-9.]+%/ {met=$0}
/^\| (Striker|Wrestler|Grappler|Counter) \| [0-9.]+% \| [0-9.]+% \| [0-9.]+% \|( [0-9.]+% \|)?$/ && sec ~ /Evolu/ {ev=ev $0 "\n"}
END { for (k in ag) print k ": " ag[k]; print "métodos " met; printf "%s", ev }' sim/relatorio.md | sed 's/## //'
