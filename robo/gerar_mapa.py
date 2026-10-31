"""Robô da Rodada — Mapa de Gols e Raio-X (sem ninguém clicando).

O site já tem o botão "Baixar tudo desta rodada (ZIP)": gera o mapa "Cedidas x Conquistadas" de cada time,
o Raio-X de cada confronto e o campinho geral. O robô entra no site (com a chave do robô, porque o site
agora exige login), escolhe as mesmas opções da tela, clica nesse botão, recebe o ZIP e o abre.

Variáveis de ambiente:
    SITE_URL   endereço do site (padrão: o site no Render)
    ROBOT_KEY  chave do robô (a mesma cadastrada no servidor)

Uso:
    python robo/gerar_mapa.py --saida saida/ [--jogos 3] [--modo seguidas|mando]
"""
import argparse
import datetime
import json
import os
import re
import sys
import unicodedata
import zipfile

SITE_URL = os.environ.get("SITE_URL", "https://mapa-de-gols-oficial.onrender.com").rstrip("/")


# ---------------------------------------------------------------------------
# DADOS DA RODADA em arquivo (para o robô de respostas do grupo conferir números sem ler imagem).
# O robô "escuta" o que o próprio site calcula ao montar as artes (sem mexer no site nem nas imagens):
#  - Mapa de Gols: embrulha a função que devolve os gols de cada time, só para guardar uma cópia;
#  - Raio X e campinho geral: acrescenta ao raiox.js, na hora em que o navegador o baixa, duas linhas que
#    guardam o resultado do confronto. Se o site mudar e o trecho não for encontrado, o arquivo de dados fica
#    sem essa parte e as artes saem normalmente.
# ---------------------------------------------------------------------------
JS_GANCHO_MAPA = r"""() => {
    const orig = window.getTeamAggregatedData;
    if (typeof orig !== 'function') return false;
    window.__dadosMapa = {};
    window.getTeamAggregatedData = async function (teamKey) {
        const r = await orig.apply(this, arguments);
        try { window.__dadosMapa[teamKey] = JSON.parse(JSON.stringify(r)); } catch (e) {}
        return r;
    };
    return true;
}"""

JS_LER_DADOS = r"""() => {
    const copia = (x) => { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; } };
    return {mapa: copia(window.__dadosMapa || {}), raiox: copia(window.__rxDados || null)};
}"""

REMENDOS_RAIOX = [
    # (trecho procurado, em regex; texto que entra DEPOIS dele, com \g<0> = o trecho)
    (r"const imgMandante = await gerarLado\(mandante, visitante, rMandante, mandoMandante\);",
     r"(window.__rxDados = window.__rxDados || {confrontos: []}).confrontos.push("
     r"{mandante, visitante, mandoMandante, mandoVisitante, rMandante, rVisitante});\n        \g<0>", True),
    (r"async function rxMontarHtmlRodadaGeral\(ultimosN, respeitarMando\) \{\s*const \[porBalde, fotosIds\] = await Promise\.all\(\[[^\]]*\]\);",
     r"\g<0>\n    (window.__rxDados = window.__rxDados || {confrontos: []}).rodadaGeral = "
     r"RX_R_ORDEM_BALDES.map((b) => [b, porBalde.get(b) || []]);", False),
]


def _remendar_raiox(route):
    """Entrega o raiox.js do site com as duas linhas de gravação acrescentadas (se achar os trechos)."""
    resp = route.fetch()
    corpo = resp.text()
    achados = 0
    for padrao, troca, _ in REMENDOS_RAIOX:
        corpo2, n = re.subn(padrao, troca, corpo, count=1)
        if n == 1:
            corpo = corpo2
            achados += 1
    if achados < len(REMENDOS_RAIOX):
        print(f"AVISO: o raiox.js do site mudou ({achados} de {len(REMENDOS_RAIOX)} trechos achados); "
              "o arquivo de dados terá só parte do Raio X.", flush=True)
    cabecalhos = {k: v for k, v in resp.headers.items() if k.lower() not in ("content-encoding", "content-length", "transfer-encoding")}
    route.fulfill(status=resp.status, headers=cabecalhos, body=corpo)



def _slug(nome):
    t = unicodedata.normalize("NFD", str(nome)).encode("ascii", "ignore").decode().lower()
    return "-".join("".join(c if c.isalnum() else " " for c in t).split())


def _r(v, casas=2):
    return round(v, casas) if isinstance(v, float) else v


def _jogador_do_evento(j):
    if not j:
        return None
    return {"nome": j.get("name"), "nome_completo": j.get("fullName"), "posicao": j.get("position"),
            "lado": j.get("side"), "time": j.get("team")}


def _evento_do_mapa(ev):
    m = ev.get("match") or {}
    casa = m.get("isHome")
    return {
        "jogo": {"mandante": m.get("homeName"), "visitante": m.get("awayName"),
                 "adversario": (m.get("awayName") if casa else m.get("homeName")) if m else None,
                 "mando_do_time": ("casa" if casa else "fora") if m else None},
        "autor_do_gol": _jogador_do_evento(ev.get("shotPlayer")),
        "assistente": _jogador_do_evento(ev.get("assistPlayer")),
        "de_cabeca": bool(ev.get("isHeader")),
        "penalti": bool(ev.get("isPenalty")),
        "gol_contra": bool(ev.get("isOwnGoal")),
        "local_do_chute": {k: _r(v, 1) for k, v in (ev.get("shot") or {}).items() if isinstance(v, (int, float))} or None,
        "local_do_passe": {k: _r(v, 1) for k, v in (ev.get("pass") or {}).items() if isinstance(v, (int, float))} or None,
        "campo": {k: v for k, v in ev.items()
                  if k not in ("match", "shot", "pass", "shotPlayer", "assistPlayer", "isHeader", "isPenalty", "isOwnGoal",
                               "own_goal", "is_penalty") and not isinstance(v, (dict, list))},
    }


def _resumo_por_posicao(eventos):
    cont = {}
    for e in eventos:
        pos = (e["autor_do_gol"] or {}).get("posicao") or "?"
        cont[pos] = cont.get(pos, 0) + 1
    return cont


def _jogador_raiox(j):
    if not j:
        return None
    return {k: _r(v, 3) for k, v in j.items() if isinstance(v, (str, int, float, bool)) or v is None}


def _posto_raiox(p):
    cede = p.get("cede")
    return {
        "balde": p.get("balde"), "balde_do_cedido": p.get("baldeCede"),
        "jogador": _jogador_raiox(p.get("jogador")),
        "rival_cedeu": ({**{k: _r(v, 3) for k, v in cede.items() if isinstance(v, (int, float))},
                         "eventos": [{k: _r(v, 3) for k, v in e.items()} for e in cede.get("eventos", [])]} if cede else None),
    }


def _lado_raiox(time, rival, mando, r):
    return {
        "time": {"nome": time, "slug": _slug(time)}, "rival": {"nome": rival, "slug": _slug(rival)},
        "mando_considerado": mando,
        "jogos_usados_do_time": r.get("partidasUsadasA"), "jogos_usados_do_rival": r.get("partidasUsadasB"),
        "ataque": [_posto_raiox(p) for p in r.get("postosAtaque", [])],
        "meio": [_posto_raiox(p) for p in r.get("postosMeio", [])],
        "defesa": [_posto_raiox(p) for p in r.get("postosDefesa", [])],
    }


COMO_LER = {
    "recorte": "Recorte de jogos: os últimos N jogos de cada time (por data) e, no modo 'mando', só os jogos no mesmo mando do próximo "
               "jogo (em casa ou fora). O recorte não aparece escrito nas artes.",
    "mapa_de_gols": "Por time: 'gols_conquistados' são os gols que o time fez e 'gols_cedidos' os que sofreu, no recorte, com autor, "
                    "assistente, tipo (de cabeça, pênalti, gol contra) e o local do chute e do passe no campo (x/y em 0 a 100). "
                    "'por_posicao_do_autor' conta os gols pela posição de quem fez o gol (gol contra incluso).",
    "raio_x": "Um item por time e jogo (o time do Raio X contra o seu rival da rodada). 'ataque', 'meio' e 'defesa' são os jogadores da "
              "escalação provável com o que cada um CONQUISTOU no recorte (gol, assistencia, finalizacoes, xg, xa, grandeChanceCriada) e, "
              "em 'rival_cedeu', o que o rival CEDEU à mesma posição (com os jogadores que fizeram gol ou assistência contra ele).",
    "campinho_geral": "Ranking da rodada por posição (balde): 'tier' 1 = cruzamento forte (o jogador produz e o rival cede), 2 = só produção "
                      "do jogador, 3 = só fragilidade do rival; dentro do tier, mais gols primeiro. A ordem da lista é a da arte.",
}


def montar_dados(rodada, jogos, modo, dados):
    mapa, rx = dados.get("mapa") or {}, dados.get("raiox") or {}
    times = {}
    for chave, d in mapa.items():
        cons = [_evento_do_mapa(e) for e in d.get("created", [])]
        ced = [_evento_do_mapa(e) for e in d.get("conceded", [])]
        times[chave] = {"time": {"nome": d.get("name"), "slug": _slug(chave)},
                        "gols_conquistados": cons, "gols_cedidos": ced,
                        "por_posicao_do_autor": {"conquistados": _resumo_por_posicao(cons), "cedidos": _resumo_por_posicao(ced)}}
    raio = []
    for c in rx.get("confrontos", []):
        raio.append({"mandante": c["mandante"], "visitante": c["visitante"],
                     "lado_mandante": _lado_raiox(c["mandante"], c["visitante"], c.get("mandoMandante"), c["rMandante"]),
                     "lado_visitante": _lado_raiox(c["visitante"], c["mandante"], c.get("mandoVisitante"), c["rVisitante"])})
    geral = []
    for balde, lista in rx.get("rodadaGeral", []):
        geral.append({"balde": balde, "candidatos": [{
            "posicao_na_lista": i + 1, "tier": c.get("tier"), "time": c.get("timeKey"), "rival": c.get("rivalKey"),
            "jogador": _jogador_raiox(c), "rival_cedeu": _posto_raiox({"cede": c.get("cede")})["rival_cedeu"],
        } for i, c in enumerate(lista)]})
    return {
        "plataforma": "mapa_de_gols_e_raio_x",
        "material": "11. Mapa de Gols / Raio X / 11.1 Resumo (campinho geral)",
        "rodada_alvo": rodada,
        "gerado_em": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "recorte": {"jogos": int(jogos), "modo": modo,
                    "descricao": f"Últimos {jogos} jogos " + ("no mesmo mando do próximo jogo" if modo == "mando" else "seguidos (todos os mandos)")},
        "fonte": "FootStats (gols, assistências, finalizações) + provaveisdocartola.com.br (escalação provável)",
        "versao_dados": 1,
        "como_ler": COMO_LER,
        "mapa_de_gols": times,
        "raio_x": raio,
        "campinho_geral": geral,
    }


def gerar(saida, jogos="3", modo="seguidas"):
    from playwright.sync_api import sync_playwright
    chave = os.environ.get("ROBOT_KEY", "")
    if not chave:
        raise SystemExit("Falta a variável ROBOT_KEY (chave do robô do site).")
    os.makedirs(saida, exist_ok=True)
    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 1500, "height": 1000}, accept_downloads=True,
                              extra_http_headers={"X-Robot-Key": chave})
        try:
            ctx.route("**/raiox.js*", _remendar_raiox)
        except Exception as e:  # noqa: BLE001
            print(f"AVISO: não consegui preparar a leitura do Raio X ({e})", flush=True)
        pg = ctx.new_page()
        pg.set_default_timeout(180000)
        pg.on("console", lambda m: print("[site]", m.text[:160]) if m.type == "error" else None)
        # Diagnóstico dos erros do servidor (502 etc.): quais endereços, quando e com que resposta.
        import time
        t0 = time.time()
        erros = []
        total_pedidos = [0]

        def _resp(r):
            total_pedidos[0] += 1
            if r.status >= 400:
                erros.append((round(time.time() - t0), r.status, r.url.replace(SITE_URL, "")[:90],
                              r.headers.get("x-render-routing", ""), r.headers.get("server", "")))

        pg.on("response", _resp)
        print(f"Abrindo {SITE_URL} ...")
        resp = pg.goto(SITE_URL + "/", wait_until="networkidle", timeout=240000)  # acorda o Render, se estiver dormindo
        if resp is None or resp.status != 200 or pg.locator("#baixarTudoBtn").count() == 0:
            raise SystemExit(f"Não consegui abrir o site (status {resp.status if resp else '?'}). Chave do robô correta?")
        try:
            if not pg.evaluate(JS_GANCHO_MAPA):
                print("AVISO: o site mudou; não consegui preparar a leitura do Mapa de Gols.", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"AVISO: não consegui preparar a leitura do Mapa de Gols ({e})", flush=True)
        pg.select_option("#roundCountSelect", str(jogos))
        pg.select_option("#selectionMode", modo)
        print(f"Opções: {jogos} jogos, modo '{modo}'. Gerando o pacote (leva alguns minutos)...", flush=True)
        with pg.expect_download(timeout=1500000) as dl:  # até 25 min
            pg.click("#baixarTudoBtn")
        nome = dl.value.suggested_filename
        zip_path = os.path.join(saida, "_" + nome)
        dl.value.save_as(zip_path)
        print("Pacote recebido:", nome, f"({os.path.getsize(zip_path) / 1e6:.1f} MB)")
        print("Mensagem final do site:", pg.inner_text("#baixarTudoProgressoTexto")[:250])
        dados_lidos = None
        try:
            dados_lidos = pg.evaluate(JS_LER_DADOS)
        except Exception as e:  # noqa: BLE001
            print(f"AVISO: não consegui ler os dados da página ({e})", flush=True)
        print(f"Pedidos ao site: {total_pedidos[0]} | com erro (>=400): {len(erros)}")
        import collections
        por_tipo = collections.Counter((e[1], "/".join(e[2].split("/")[:2]) or "/") for e in erros)
        for (st, tipo), n in por_tipo.most_common(12):
            print(f"  erro {st} em {tipo}: {n}x")
        if erros:
            print("  quando (segundos desde o início):", sorted({e[0] for e in erros})[:40])
            print("  exemplos:", [(e[1], e[2], e[3], e[4]) for e in erros[:4]])
        nav.close()

    m = re.search(r"rodada-(\d+)-", nome)
    if not m:
        raise SystemExit(f"Não consegui descobrir a rodada pelo nome do pacote: {nome}")
    rodada = int(m.group(1))
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(saida)
        arquivos = [i.filename for i in z.infolist() if not i.is_dir()]
    os.remove(zip_path)
    print(f"Rodada {rodada}: {len(arquivos)} imagens extraídas.")
    try:
        if dados_lidos and (dados_lidos.get("mapa") or dados_lidos.get("raiox")):
            caminho = os.path.join(saida, f"dados_mapa_R{rodada}.json")
            with open(caminho, "w", encoding="utf-8") as f:
                json.dump(montar_dados(rodada, jogos, modo, dados_lidos), f, ensure_ascii=False, indent=1)
            arquivos.append(os.path.basename(caminho))
            print(f"OK {os.path.basename(caminho)} ({os.path.getsize(caminho) / 1e3:.0f} KB)", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"AVISO: não consegui gravar o arquivo de dados ({e}); as imagens seguem normalmente.", flush=True)
    return rodada, arquivos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", required=True)
    ap.add_argument("--jogos", default="3", help="últimos N jogos (padrão do site: 3)")
    ap.add_argument("--modo", default="seguidas", choices=["seguidas", "mando"])
    a = ap.parse_args()
    rodada, _ = gerar(a.saida, a.jogos, a.modo)
    with open(os.path.join(a.saida, "_info.json"), "w", encoding="utf-8") as f:
        json.dump({"rodada": rodada}, f)


if __name__ == "__main__":
    main()
