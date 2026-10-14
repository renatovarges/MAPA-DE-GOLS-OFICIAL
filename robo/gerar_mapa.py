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
import json
import os
import re
import sys
import zipfile

SITE_URL = os.environ.get("SITE_URL", "https://mapa-de-gols-oficial.onrender.com").rstrip("/")


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
        pg = ctx.new_page()
        pg.set_default_timeout(180000)
        pg.on("console", lambda m: print("[site]", m.text[:160]) if m.type == "error" else None)
        print(f"Abrindo {SITE_URL} ...")
        resp = pg.goto(SITE_URL + "/", wait_until="networkidle", timeout=240000)  # acorda o Render, se estiver dormindo
        if resp is None or resp.status != 200 or pg.locator("#baixarTudoBtn").count() == 0:
            raise SystemExit(f"Não consegui abrir o site (status {resp.status if resp else '?'}). Chave do robô correta?")
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
