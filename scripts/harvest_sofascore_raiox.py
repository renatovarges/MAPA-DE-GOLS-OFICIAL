#!/usr/bin/env python3
"""
Harvester SofaScore (via soccerdata) -> cache local pro Raio X Ofensivo
------------------------------------------------------------------------
Achado real (2026-08-19): a API do SofaScore bloqueia com 403 QUALQUER
Chromium "cru" do Playwright (mesmo a home page, sem nem chegar na API) —
fingerprint de automação detectável pelo Cloudflare deles, não é limite de
volume. O projeto "dash-analise-futebol-main" já tinha resolvido isso com a
lib `soccerdata`, que usa um cliente HTTP com TLS impersonation (engana no
nível de rede, não de fingerprint de página) em vez de um navegador de
verdade — portado aqui em vez de reinventar.

Grava um cache local (não é dado público do site, é só ponte entre os dois
scripts do pipeline): scripts/.cache/sofascore-raiox.json, com:
  - eventos: [{eventId, date (BRT), homeSlug, awaySlug, status}]
  - stats: {eventId: [{nome, xg, xa, grandeChanceCriada}]}

harvest_raio_x.mjs (Node) lê esse arquivo em vez de falar com o SofaScore
diretamente. Rodar ESTE script primeiro, sempre, antes do harvest_raio_x.mjs.

Torneio Brasileirão Série A 2026: tournament=325, season=87678 (mesmo par
usado no harvest_sofascore.py de referência).
"""
import json
import sys
import time
import unicodedata
import re
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

import soccerdata as sd

TID, SID = 325, 87678
API = "https://api.sofascore.com/api/v1/"
OUT = Path(__file__).resolve().parent / ".cache" / "sofascore-raiox.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

SLUG_FIX = {
    "Athletico": "athletico-pr",
    "Atlético Mineiro": "atletico-mg",
    "Vasco da Gama": "vasco",
}


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower().strip()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def team_slug(name):
    return SLUG_FIX.get(name, slugify(name))


_ss = sd.Sofascore(leagues="ITA-Serie A", seasons="2024")


def get(path, cache_name, no_cache=False):
    return json.load(_ss.get(API + path, _ss.data_dir / ("hv_raiox_" + cache_name + ".json"), no_cache=no_cache))


def data_hora_brt(timestamp):
    """data (YYYY-MM-DD) em horário de Brasília -- jogo noturno já é dia
    seguinte em UTC, e isso quebrava o cruzamento com a FootStats até
    corrigir (84% -> 100% de acerto, ver nota em scripts/lib/sofascore.mjs)."""
    import datetime
    import zoneinfo
    dt = datetime.datetime.fromtimestamp(timestamp, tz=zoneinfo.ZoneInfo("America/Sao_Paulo"))
    return dt.strftime("%Y-%m-%d")


def main():
    print("→ calendário (todas as rodadas) ...")
    eventos = []
    for rnd in range(1, 39):
        try:
            ev = get(f"unique-tournament/{TID}/season/{SID}/events/round/{rnd}", f"events_r{rnd}", no_cache=True)["events"]
        except Exception:
            continue
        for e in ev:
            status = e["status"]["type"]
            ts = e.get("startTimestamp")
            eventos.append({
                "eventId": e["id"],
                "rodada": rnd,
                "status": status,
                "homeSlug": team_slug(e["homeTeam"]["name"]),
                "awaySlug": team_slug(e["awayTeam"]["name"]),
                "date": data_hora_brt(ts) if ts else None,
            })
    finished = [e for e in eventos if e["status"] == "finished"]
    print(f"  {len(eventos)} eventos | {len(finished)} finalizados")

    print(f"→ stats por jogador de {len(finished)} eventos (lineups) ...")
    stats = {}
    for i, e in enumerate(finished):
        eid = e["eventId"]
        try:
            data = get(f"event/{eid}/lineups", f"lineups_{eid}")
            rows = []
            for side in ("home", "away"):
                for p in data.get(side, {}).get("players", []):
                    st = p.get("statistics") or {}
                    if st.get("minutesPlayed") is None:
                        continue
                    rows.append({
                        "nome": p.get("player", {}).get("name"),
                        "side": side,
                        "xg": st.get("expectedGoals", 0) or 0,
                        "xa": st.get("expectedAssists", 0) or 0,
                        "grandeChanceCriada": st.get("bigChanceCreated", 0) or 0,
                    })
            stats[str(eid)] = rows
        except Exception as ex:
            print(f"  ! {eid}: {ex}")
        if (i + 1) % 30 == 0:
            print(f"  {i + 1}/{len(finished)}")
        time.sleep(0.3)

    OUT.write_text(json.dumps({"eventos": finished, "stats": stats}, ensure_ascii=False), encoding="utf-8")
    print(f"✓ {OUT} — {len(finished)} eventos, {sum(len(v) for v in stats.values())} linhas de stats")


if __name__ == "__main__":
    main()
