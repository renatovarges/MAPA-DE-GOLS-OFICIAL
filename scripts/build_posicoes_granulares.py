"""
Consolida as três fontes de posição granular num mapa único atleta_id -> posição.

Fontes (todas fornecidas pelo Renato, 2026-08-07):
  1. Scouts Pós R21 2026.xlsx, aba "Por jogo", coluna PosReal — desdobra APENAS
     os laterais: 2.2 = lateral direito, 2.6 = lateral esquerdo. As demais
     posições vêm iguais ao PosID do Cartola, então essa planilha só serve pra
     isso mesmo. Conferido: 107 laterais, nenhum joga dos dois lados.
  2. classificacao_meias_volantes.csv — MEIA vs VOLANTE.
  3. separação atacantes.txt — Ponta esquerda / Ponta direita / Atacante de área.

Goleiro e zagueiro não precisam de desdobramento (vêm do Cartola direto).
"""
import csv
import json
from collections import defaultdict, Counter

import openpyxl

XLSX = r"D:\cartoon brasil\2026\API 2026\Scouts Pós R21 2026.xlsx"
CSV_MEIAS = r"C:\Users\User\.gemini\antigravity\scratch\PONTOS-CEDIDOS-E-CONQUISTADOS\classificacao_meias_volantes.csv"
TXT_ATA = r"C:\Users\User\.gemini\antigravity\scratch\PONTOS-CEDIDOS-E-CONQUISTADOS\separação atacantes.txt"
OUT = r"C:\Users\User\AppData\Local\Temp\claude\C--Users-User--gemini-antigravity-scratch-dash-analise-futebol-main\fc761c46-e69b-4a60-8fc0-bcd62abef0e8\scratchpad\posicoes.json"

pos = {}
origem = Counter()

# --- 1. laterais (xlsx) ---
wb = openpyxl.load_workbook(XLSX, read_only=True)
ws = wb["Por jogo"]
lat = defaultdict(Counter)
for r in ws.iter_rows(min_row=2, values_only=True):
    pid, posreal = r[0], r[3]
    if posreal in (2.2, 2.6):
        lat[int(pid)][posreal] += 1
for pid, c in lat.items():
    pos[str(pid)] = "lateral-direito" if c.most_common(1)[0][0] == 2.2 else "lateral-esquerdo"
    origem["lateral (xlsx)"] += 1

# --- 2. meias / volantes (csv) ---
with open(CSV_MEIAS, encoding="utf-8") as f:
    for row in csv.DictReader(f):
        pid = row["ATLETA_ID"].strip()
        if not pid:
            continue
        pos[pid] = "volante" if row["CLASSIFICACAO"].strip().upper() == "VOLANTE" else "meia"
        origem["meia/volante (csv)"] += 1

# --- 3. atacantes (txt, separado por |) ---
CAT = {
    "Ponta esquerda": "ponta-esquerda",
    "Ponta direita": "ponta-direita",
    "Atacante de área": "atacante-area",
}
with open(TXT_ATA, encoding="utf-8") as f:
    for row in csv.DictReader(f, delimiter="|"):
        pid = (row.get("atleta_id") or "").strip()
        cat = (row.get("categoria") or "").strip()
        if pid and cat in CAT:
            pos[pid] = CAT[cat]
            origem["atacante (txt)"] += 1

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(pos, f, ensure_ascii=False, indent=1, sort_keys=True)

print(f"{len(pos)} jogadores com posição granular")
for k, v in origem.items():
    print(f"  {k}: {v}")
print()
print("distribuição final:")
for k, v in Counter(pos.values()).most_common():
    print(f"  {k}: {v}")
