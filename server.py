import os
import json
import csv
import base64
import time
import threading
import hmac
import hashlib
import secrets
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'data')
CSV_PATH = os.path.join(ROOT, 'cartola_jogadores_time_posicao_preco (1).csv')

# --- CONFIGURAÇÕES DE CACHE ---
JOGADORES_CACHE = {
    'data': None,
    'timestamp': 0,
    'ttl': 7200  # 2 horas de cache
}
# --- CONTROLE DE CONCORRÊNCIA ---
GITHUB_SYNC_LOCK = threading.Lock()

# Mapeamento de clube_id da API do Cartola para chave de time usada no site
# IDs verificados diretamente na API em março/2026
CLUBE_ID_TO_KEY = {
    262: 'flamengo',
    263: 'botafogo',
    264: 'corinthians',
    265: 'bahia',
    266: 'fluminense',
    267: 'vasco',
    275: 'palmeiras',
    276: 'sao-paulo',
    277: 'santos',
    280: 'red-bull-bragantino',
    282: 'atletico-mg',
    283: 'cruzeiro',
    284: 'gremio',
    285: 'internacional',
    287: 'vitoria',
    293: 'athletico-pr',
    294: 'coritiba',
    315: 'chapecoense',
    364: 'remo',
    2305: 'mirassol',
}

# Mapeamento de posicao_id da API para nome de posição
POSICAO_ID_TO_NOME = {
    1: 'Goleiro',
    2: 'Lateral',
    3: 'Zagueiro',
    4: 'Meia',
    5: 'Atacante',
    6: 'Técnico',
}

# status_id oficial da própria API do Cartola (bate com o campo "status" que
# vem na resposta de /atletas/mercado) — usado pro filtro "Status" na aba
# Líderes do Mapa de Desarmes (pedido do Renato, 2026-08): permite excluir
# do ranking quem está suspenso/contundido, ou focar só em quem é provável
# titular pra próxima rodada. Cobre o elenco inteiro (775 jogadores testado
# ao vivo), sem "jogador sumido" como acontecia tentando cruzar com o
# provaveisdocartola.com.br (que só lista titulares + desfalques, não o
# elenco inteiro).
STATUS_ID_TO_NOME = {
    2: 'Dúvida',
    3: 'Suspenso',
    5: 'Contundido',
    6: 'Nulo',
    7: 'Provável',
}

# Mapeamento de código de clube do CSV para chave de time
# Códigos verificados na API em março/2026
CSV_CLUBE_TO_KEY = {
    'FLA': 'flamengo',
    'BOT': 'botafogo',
    'COR': 'corinthians',
    'BAH': 'bahia',
    'FLU': 'fluminense',
    'VAS': 'vasco',
    'PAL': 'palmeiras',
    'SAO': 'sao-paulo',
    'SAN': 'santos',
    'RBB': 'red-bull-bragantino',
    'CAM': 'atletico-mg',
    'CRU': 'cruzeiro',
    'GRE': 'gremio',
    'INT': 'internacional',
    'VIT': 'vitoria',
    'CAP': 'athletico-pr',
    'CFC': 'coritiba',
    'CHA': 'chapecoense',
    'REM': 'remo',
    'MIR': 'mirassol',
}

def buscar_jogadores_api():
    """Busca jogadores em tempo real da API do Cartola com cache na memória."""
    global JOGADORES_CACHE

    agora = time.time()
    # Verifica se o cache ainda é válido
    if JOGADORES_CACHE['data'] is not None and (agora - JOGADORES_CACHE['timestamp'] < JOGADORES_CACHE['ttl']):
        print(f"[jogadores-api] Usando cache (idade: {int(agora - JOGADORES_CACHE['timestamp'])}s)")
        return JOGADORES_CACHE['data'], True

    try:
        print('[jogadores-api] Buscando novos dados da API do Cartola...')
        url = 'https://api.cartola.globo.com/atletas/mercado'
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
        })
        # Timeout curto de 6s para não prender a thread se a API da Globo estiver lenta
        with urllib.request.urlopen(req, timeout=6) as response:
            data = json.loads(response.read().decode('utf-8'))

        atletas = data.get('atletas', [])
        clubes = data.get('clubes', {})
        jogadores = []

        for atleta in atletas:
            clube_id = atleta.get('clube_id')
            posicao_id = atleta.get('posicao_id')
            team_key = CLUBE_ID_TO_KEY.get(clube_id)
            if not team_key:
                continue

            # Buscar abreviação do clube
            clube_info = clubes.get(str(clube_id), {})
            clube_abrev = clube_info.get('abreviacao', '')

            status_id = atleta.get('status_id')
            jogadores.append({
                'id': str(atleta.get('atleta_id', '')),
                'apelido': atleta.get('apelido', atleta.get('nome', '')),
                'nome_completo': atleta.get('nome', ''),
                'slug': atleta.get('slug', ''),
                'clube': clube_abrev,
                'clube_id': str(clube_id),
                'posicao': POSICAO_ID_TO_NOME.get(posicao_id, ''),
                'posicao_id': str(posicao_id),
                'teamKey': team_key,
                'status_id': status_id,
                'status': STATUS_ID_TO_NOME.get(status_id, ''),
                'fonte': 'api',
            })

        # Atualiza cache
        if jogadores:
            JOGADORES_CACHE['data'] = jogadores
            JOGADORES_CACHE['timestamp'] = agora
            print(f'[jogadores-api] Cache atualizado com {len(jogadores)} jogadores.')

        return jogadores, True

    except Exception as e:
        print(f'[jogadores-api] ⚠️ Erro ao buscar da API: {e}')
        # Se falhar mas tivermos cache antigo, usamos ele como fallback secundário
        if JOGADORES_CACHE['data']:
            print('[jogadores-api] Usando cache expirado devido a falha na API.')
            return JOGADORES_CACHE['data'], True
        return [], False


def buscar_jogadores_csv():
    """Carrega jogadores do CSV de fallback."""
    jogadores = []
    try:
        with open(CSV_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                clube_code = row.get('clube', '').strip()
                team_key = CSV_CLUBE_TO_KEY.get(clube_code)
                if not team_key:
                    continue
                jogadores.append({
                    'id': row.get('id', '').strip(),
                    'apelido': row.get('apelido', '').strip(),
                    'nome_completo': row.get('nome_completo', '').strip(),
                    'slug': row.get('slug', '').strip(),
                    'clube': clube_code,
                    'clube_id': row.get('clube_id', '').strip(),
                    'posicao': row.get('posicao', '').strip(),
                    'posicao_id': row.get('posicao_id', '').strip(),
                    'teamKey': team_key,
                    'fonte': 'csv',
                })
    except Exception as e:
        print(f'[jogadores-csv] Erro ao carregar CSV: {e}')
    return jogadores


def normalize_team_key(team_key):
    """Converte underscore para hífen nos nomes de arquivo"""
    key_map = {
        'athletico_pr': 'athletico-pr',
        'atletico_mg': 'atletico-mg',
        'sao_paulo': 'sao-paulo',
        'red_bull_bragantino': 'red-bull-bragantino'
    }
    return key_map.get(team_key, team_key)


# ===== PERSISTÊNCIA VIA GITHUB =====
# Cada vez que uma rodada é salva, o arquivo JSON é commitado no GitHub.
# Isso garante que os dados sobrevivam a reinicializações do Render.

GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
GITHUB_REPO = os.environ.get('GITHUB_REPO', 'renatovarges/MAPA-DE-GOLS-OFICIAL')
GITHUB_BRANCH = os.environ.get('GITHUB_BRANCH', 'main')


def github_commit_file(file_path, commit_message):
    """
    Faz commit de um arquivo JSON no GitHub via API REST.
    Usa um Lock para evitar condições de corrida com o SHA do arquivo.
    """
    if not GITHUB_TOKEN:
        print('[github-sync] GITHUB_TOKEN não configurado, pulando sync.')
        return

    with GITHUB_SYNC_LOCK:
        try:
            # Ler conteúdo do arquivo local
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            content_b64 = base64.b64encode(content.encode('utf-8')).decode('ascii')

            # Caminho relativo ao repositório
            rel_path = os.path.relpath(file_path, ROOT).replace('\\', '/')

            # Buscar SHA atual do arquivo no GitHub (necessário para atualizar)
            api_url = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{rel_path}'
            headers = {
                'Authorization': f'token {GITHUB_TOKEN}',
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MapaDeGols-Server',
            }

            sha = None
            try:
                req = urllib.request.Request(
                    f'{api_url}?ref={GITHUB_BRANCH}',
                    headers=headers
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    file_info = json.loads(resp.read().decode('utf-8'))
                    sha = file_info.get('sha')
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
            except Exception as e:
                print(f'[github-sync] Erro ao obter SHA de {rel_path}: {e}')
                return

            # Montar payload do commit
            payload = {
                'message': commit_message,
                'content': content_b64,
                'branch': GITHUB_BRANCH,
            }
            if sha:
                payload['sha'] = sha

            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                api_url,
                data=data,
                headers={**headers, 'Content-Type': 'application/json'},
                method='PUT'
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                commit_sha = result.get('commit', {}).get('sha', '?')[:7]
                print(f'[github-sync] ✅ {rel_path} commitado ({commit_sha})')

        except Exception as e:
            print(f'[github-sync] ⚠️ Erro ao sincronizar {file_path}: {e}')


def sync_to_github_async(file_paths, round_no, home_key, away_key):
    """Dispara o sync com GitHub em thread separada para não bloquear o servidor."""
    def _sync():
        msg = f'data: salvar rodada {round_no} ({home_key} x {away_key})'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_shots_to_github_async(file_paths, match_id, home_key, away_key):
    """Igual a sync_to_github_async, mas para o dataset de finalizações (data/finalizacoes/)."""
    def _sync():
        msg = f'data: finalizacoes partida {match_id} ({home_key} x {away_key})'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_patterns_to_github_async(file_paths, team_key):
    """Igual a sync_to_github_async, mas para o retrato de padrões (data/padroes/)."""
    def _sync():
        msg = f'data: padroes {team_key}'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_desarmes_to_github_async(file_paths, match_id, home_key, away_key):
    """Igual a sync_shots_to_github_async, mas para o dataset de desarmes/perda de posse (data/desarmes/)."""
    def _sync():
        msg = f'data: desarmes partida {match_id} ({home_key} x {away_key})'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_perfis_jogadores_to_github_async(file_paths):
    """Sync do banco de jogadores notáveis (data/perfis-jogadores.json) — arquivo único, sobrescrito por completo a cada rodada de harvest."""
    def _sync():
        msg = 'data: perfis-jogadores (banco de notáveis)'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_id_bridge_to_github_async(file_paths):
    """Sync da ponte idPlayer->atleta_id (data/id-bridge-footstats.json) — arquivo único, sobrescrito por completo."""
    def _sync():
        msg = 'data: id-bridge-footstats (ponte de jogador)'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_lado_inferido_to_github_async(file_paths):
    """Sync da tendência de lado por jogador (data/lado-inferido.json) — arquivo único, sobrescrito por completo."""
    def _sync():
        msg = 'data: lado-inferido (tendência de lateral)'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_proximo_confronto_to_github_async(file_paths):
    """Sync do mando do próximo confronto por time (data/proximo-confronto.json) — arquivo único, sobrescrito por completo."""
    def _sync():
        msg = 'data: proximo-confronto (mando por time)'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_raio_x_to_github_async(file_paths, match_id, home_key, away_key):
    """Igual a sync_desarmes_to_github_async, mas para o dataset da aba Raio X Ofensivo (data/raio-x/)."""
    def _sync():
        msg = f'data: raio-x partida {match_id} ({home_key} x {away_key})'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


def sync_provaveis_to_github_async(file_paths):
    """Sync da escalação provável + desfalques (data/provaveis.json) — arquivo único, sobrescrito por completo."""
    def _sync():
        msg = 'data: provaveis (escalacao + desfalques)'
        for path in file_paths:
            github_commit_file(path, msg)
    t = threading.Thread(target=_sync, daemon=True)
    t.start()


# --- AUTENTICAÇÃO (PIN no servidor) ---------------------------------------
# O PIN NUNCA fica no código: vem da variável de ambiente ACCESS_PIN (Render).
# Quem chega sem sessão só enxerga a tela de login. Coletas automáticas e o
# robô entram com o cabeçalho X-Robot-Key (variável ROBOT_KEY).
# Sem ACCESS_PIN configurado o site fica TRANCADO (falha segura), nunca aberto.
ACCESS_PIN = os.environ.get('ACCESS_PIN', '').strip()
ROBOT_KEY = os.environ.get('ROBOT_KEY', '').strip()
if os.environ.get('SESSION_SECRET'):
    _SESSION_KEY = os.environ['SESSION_SECRET'].encode('utf-8')
elif ACCESS_PIN:
    _SESSION_KEY = hashlib.sha256(f'mapa|{ACCESS_PIN}|{ROBOT_KEY}'.encode('utf-8')).digest()
else:
    _SESSION_KEY = secrets.token_bytes(32)
SESSION_COOKIE = 'mapa_session'
SESSION_TTL = 30 * 24 * 3600  # 30 dias
# Únicos arquivos servidos sem sessão (a tela de login e o logo dela).
PUBLIC_PATHS = {'/login.html', '/TCCBRANCOTRANSPARENTE.png'}
# Freio contra tentativa em massa de PIN: no máximo 20 erros a cada 10 min,
# somando todos os visitantes (não depende de IP, que dá pra falsificar).
_LOGIN_FAILS = []
_LOGIN_LOCK = threading.Lock()
LOGIN_MAX_FAILS = 20
LOGIN_WINDOW = 600


def _assinar_sessao(expira):
    return hmac.new(_SESSION_KEY, str(expira).encode('ascii'), hashlib.sha256).hexdigest()


def _criar_sessao():
    expira = int(time.time()) + SESSION_TTL
    return f'{expira}.{_assinar_sessao(expira)}'


def _sessao_valida(token):
    try:
        expira_txt, assinatura = token.split('.', 1)
        expira = int(expira_txt)
    except Exception:
        return False
    if expira < time.time():
        return False
    return hmac.compare_digest(assinatura, _assinar_sessao(expira))


def _login_bloqueado():
    agora = time.time()
    with _LOGIN_LOCK:
        _LOGIN_FAILS[:] = [t for t in _LOGIN_FAILS if agora - t < LOGIN_WINDOW]
        return len(_LOGIN_FAILS) >= LOGIN_MAX_FAILS


def _registrar_falha_login():
    with _LOGIN_LOCK:
        _LOGIN_FAILS.append(time.time())


class Handler(SimpleHTTPRequestHandler):

    # ---- autenticação ----
    def _autorizado(self):
        if ROBOT_KEY:
            chave = self.headers.get('X-Robot-Key', '')
            if chave and hmac.compare_digest(chave.encode('utf-8'), ROBOT_KEY.encode('utf-8')):
                return True
        for parte in self.headers.get('Cookie', '').split(';'):
            nome, _, valor = parte.strip().partition('=')
            if nome == SESSION_COOKIE and _sessao_valida(valor):
                return True
        return False

    def _responder_json(self, status, obj, extra_headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra_headers or []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _sem_sessao_get(self, path, head=False):
        """Sem sessão: páginas viram a tela de login; o resto leva 401."""
        if path in ('/', '/index.html') or path.endswith('/'):
            return self._servir_login(head)
        self._responder_json(401, {'error': 'nao_autorizado'})

    def _servir_login(self, head=False):
        # Sem Last-Modified/ETag e com no-store: o navegador NUNCA pode guardar
        # a tela de login como se fosse a página inicial (senão, depois de
        # entrar, ele reexibiria a tela de login via 304 "nada mudou").
        with open(os.path.join(ROOT, 'login.html'), 'rb') as f:
            corpo = f.read()
        self._cache_proprio = True
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(corpo)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if not head:
            self.wfile.write(corpo)

    def _sem_validadores(self, path):
        # Navegadores que já guardaram a tela de login (versão anterior) pedem
        # '/' de forma condicional; aqui sempre respondemos 200 com a página.
        if path in ('/', '/index.html'):
            for h in ('If-Modified-Since', 'If-None-Match'):
                if h in self.headers:
                    del self.headers[h]

    def _login(self):
        if not ACCESS_PIN:
            return self._responder_json(503, {'error': 'acesso_nao_configurado'})
        if _login_bloqueado():
            return self._responder_json(429, {'error': 'muitas_tentativas'})
        try:
            tamanho = min(int(self.headers.get('Content-Length', '0')), 1024)
            pin = str(json.loads(self.rfile.read(tamanho).decode('utf-8')).get('pin', '')).strip()
        except Exception:
            return self._responder_json(400, {'error': 'requisicao_invalida'})
        if hmac.compare_digest(pin.encode('utf-8'), ACCESS_PIN.encode('utf-8')):
            cookie = f'{SESSION_COOKIE}={_criar_sessao()}; Path=/; Max-Age={SESSION_TTL}; HttpOnly; SameSite=Lax'
            if self.headers.get('X-Forwarded-Proto', '') == 'https':
                cookie += '; Secure'
            return self._responder_json(200, {'ok': True}, [('Set-Cookie', cookie)])
        _registrar_falha_login()
        return self._responder_json(401, {'error': 'pin_incorreto'})

    def do_HEAD(self):
        path = self.path.split('?', 1)[0]
        if path in PUBLIC_PATHS or self._autorizado():
            self._sem_validadores(path)
            return super().do_HEAD()
        return self._sem_sessao_get(path, head=True)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if not (path in PUBLIC_PATHS or self._autorizado()):
            return self._sem_sessao_get(path)
        self._sem_validadores(path)
        if self.path == '/api/jogadores':
            self.handle_jogadores()
        else:
            super().do_GET()

    def end_headers(self):
        # Achado 2026-08: nenhum arquivo servido daqui tinha Cache-Control
        # próprio — o index.html sozinho já causou um deploy inteiro ficar
        # invisível pro Renato, mesmo testando em navegadores/redes
        # diferentes (Chrome, Brave, outro perfil, aba anônima — logo não
        # era cache do navegador dele, era alguma camada entre o servidor
        # e ele, provavelmente o Cloudflare que fica na frente do Render).
        # Primeira correção cobriu só HTML; essa cobre TUDO que passa por
        # aqui — script.js, style.css, data/*.json, o que for — pra fechar
        # de vez qualquer brecha de cache intermediário, não só a do
        # navegador. `no-cache, must-revalidate` obriga sempre revalidar
        # com o servidor antes de usar a cópia guardada (ele ainda responde
        # 304 quando nada mudou, então não pesa banda).
        if not getattr(self, '_cache_proprio', False):
            # Dados protegidos por login: nunca em cache compartilhado (CDN).
            self.send_header('Cache-Control', 'private, no-cache, must-revalidate')
        self.send_header('Vary', 'Cookie')
        super().end_headers()

    def handle_jogadores(self):
        """Endpoint que retorna jogadores: API em tempo real ou CSV como fallback."""
        jogadores, api_ok = buscar_jogadores_api()

        if not api_ok or len(jogadores) == 0:
            print('[jogadores] API indisponível, usando CSV como fallback.')
            jogadores = buscar_jogadores_csv()
            fonte = 'csv'
        else:
            print(f'[jogadores] API retornou {len(jogadores)} jogadores.')
            fonte = 'api'

        resposta = {
            'fonte': fonte,
            'total': len(jogadores),
            'jogadores': jogadores,
        }

        body = json.dumps(resposta, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _restaurar_do_github(self, simular):
        """Repõe data/*.json zerados ({"rounds": {}}) com a cópia do GitHub.
        Só toca em arquivo ausente ou no estado zerado; nunca sobrescreve
        arquivo que tenha conteúdo. Com simular=True só lista o que faria."""
        cab = {'User-Agent': 'mapa-de-gols', 'Accept': 'application/vnd.github+json'}
        if GITHUB_TOKEN:
            cab['Authorization'] = f'token {GITHUB_TOKEN}'
        restaurados, mantidos, erros = [], 0, []
        try:
            req = urllib.request.Request(
                f'https://api.github.com/repos/{GITHUB_REPO}/git/trees/{GITHUB_BRANCH}?recursive=1', headers=cab)
            with urllib.request.urlopen(req, timeout=30) as r:
                arvore = json.loads(r.read().decode('utf-8'))
            caminhos = [i['path'] for i in arvore.get('tree', [])
                        if i.get('type') == 'blob' and i['path'].startswith('data/')
                        and i['path'].count('/') == 1 and i['path'].endswith('.json')]
        except Exception as e:
            return self._responder_json(502, {'error': 'github_indisponivel', 'detail': str(e)})
        os.makedirs(DATA_DIR, exist_ok=True)
        for caminho in caminhos:
            destino = os.path.join(ROOT, caminho)
            try:
                zerado = True
                if os.path.exists(destino):
                    with open(destino, 'r', encoding='utf-8') as f:
                        zerado = json.load(f) == {'rounds': {}}
                if not zerado:
                    mantidos += 1
                    continue
                req = urllib.request.Request(
                    f'https://raw.githubusercontent.com/{GITHUB_REPO}/{GITHUB_BRANCH}/{caminho}', headers=cab)
                with urllib.request.urlopen(req, timeout=30) as r:
                    conteudo = r.read()
                json.loads(conteudo.decode('utf-8'))  # só grava JSON válido
                if conteudo.strip() and json.loads(conteudo.decode('utf-8')) != {'rounds': {}}:
                    if not simular:
                        tmp = destino + '.tmp'
                        with open(tmp, 'wb') as f:
                            f.write(conteudo)
                        os.replace(tmp, destino)
                    restaurados.append(os.path.basename(caminho))
                else:
                    mantidos += 1
            except Exception as e:
                erros.append(f'{os.path.basename(caminho)}: {e}')
        self._responder_json(200, {'simulacao': simular, 'restaurados': len(restaurados),
                                   'mantidos_com_conteudo': mantidos, 'erros': erros,
                                   'arquivos': restaurados})

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        if path == '/api/login':
            return self._login()
        if not self._autorizado():
            return self._responder_json(401, {'error': 'nao_autorizado'})
        if path == '/api/restore-from-github':
            return self._restaurar_do_github('dry=1' in self.path)
        return self._post_autorizado()

    def _post_autorizado(self):
        if self.path == '/api/clear-all':
            # Endpoint para limpar todos os gols de todos os times
            try:
                os.makedirs(DATA_DIR, exist_ok=True)
                cleared_files = []
                for filename in os.listdir(DATA_DIR):
                    if filename.endswith('.json'):
                        path = os.path.join(DATA_DIR, filename)
                        with open(path, 'w', encoding='utf-8') as f:
                            json.dump({'rounds': {}}, f, ensure_ascii=False, indent=2)
                        cleared_files.append(filename)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'cleared': len(cleared_files), 'files': cleared_files}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'clear_failed', 'detail': str(e)}).encode('utf-8'))

        elif self.path == '/api/save-round':
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            round_no = payload.get('roundNumber')
            home_key = payload.get('homeTeamKey')
            away_key = payload.get('awayTeamKey')
            home_obj = payload.get('home')
            away_obj = payload.get('away')

            os.makedirs(DATA_DIR, exist_ok=True)
            saved_paths = []

            def upsert_team_round(team_key, round_obj):
                normalized_key = normalize_team_key(team_key)
                path = os.path.join(DATA_DIR, f'{normalized_key}.json')
                if os.path.exists(path):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                    except Exception:
                        data = {}
                else:
                    data = {}
                rounds = data.get('rounds')
                if not isinstance(rounds, dict):
                    rounds = {}
                rounds[str(round_no)] = round_obj
                data['rounds'] = rounds
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                saved_paths.append(path)

            try:
                if home_key and home_obj:
                    upsert_team_round(home_key, home_obj)
                if away_key and away_obj:
                    upsert_team_round(away_key, away_obj)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            try:
                print(f"[save-round] round={round_no} home={home_key} away={away_key} saved={saved_paths}")
            except Exception:
                pass

            # Sincronizar com GitHub em background (persistência permanente)
            if saved_paths:
                sync_to_github_async(saved_paths, round_no, home_key, away_key)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'round': round_no, 'saved_files': saved_paths}).encode('utf-8'))

        elif self.path == '/api/delete-round':
            # Remove uma rodada de um time — diferente de /api/save-round,
            # que só sobrescreve/adiciona. Existe pra apagar dado de teste
            # ou fabricado que ficou em produção (ex.: "rodada 99" que não
            # corresponde a nenhuma partida real da FootStats — a
            # auditoria de 2026-08 achou isso no Flamengo e no Botafogo,
            # com um gol "Teste Sync" dentro). Remove a CHAVE inteira do
            # dict `rounds`, não deixa um objeto vazio no lugar.
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            team_key = payload.get('teamKey')
            round_no = payload.get('roundNumber')
            if not team_key or round_no is None:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'missing_fields', 'detail': 'teamKey e roundNumber são obrigatórios'}).encode('utf-8'))
                return

            normalized_key = normalize_team_key(team_key)
            path = os.path.join(DATA_DIR, f'{normalized_key}.json')
            try:
                if os.path.exists(path):
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                else:
                    data = {}
                rounds = data.get('rounds')
                removed = False
                if isinstance(rounds, dict) and str(round_no) in rounds:
                    del rounds[str(round_no)]
                    data['rounds'] = rounds
                    removed = True
                    with open(path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'delete_failed', 'detail': str(e)}).encode('utf-8'))
                return

            try:
                print(f"[delete-round] team={normalized_key} round={round_no} removed={removed}")
            except Exception:
                pass

            if removed:
                def _sync_delete():
                    github_commit_file(path, f'data: remover rodada {round_no} de {normalized_key}')
                threading.Thread(target=_sync_delete, daemon=True).start()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'team': normalized_key, 'round': round_no, 'removed': removed}).encode('utf-8'))

        elif self.path == '/api/save-shots':
            # Dataset novo e independente do mapa de gols: guarda TODAS as
            # finalizações (não só gols) por time, uma entrada por partida
            # (chave = matchId da FootStats). Não aparece no campinho — é
            # a base pra detectar padrão de onde/como cada time cria e cede
            # chance. Sempre sobrescreve pelo matchId: é dado 100% derivado
            # da FootStats, sem edição manual, então não precisa da mesma
            # trava de "nunca sobrescrever" do /api/save-round.
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            match_id = payload.get('matchId')
            home_key = payload.get('homeTeamKey')
            away_key = payload.get('awayTeamKey')
            home_obj = payload.get('home')
            away_obj = payload.get('away')

            shots_dir = os.path.join(DATA_DIR, 'finalizacoes')
            os.makedirs(shots_dir, exist_ok=True)
            saved_paths = []

            def upsert_team_match(team_key, match_obj):
                normalized_key = normalize_team_key(team_key)
                path = os.path.join(shots_dir, f'{normalized_key}.json')
                if os.path.exists(path):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                    except Exception:
                        data = {}
                else:
                    data = {}
                matches = data.get('matches')
                if not isinstance(matches, dict):
                    matches = {}
                matches[str(match_id)] = match_obj
                data['matches'] = matches
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                saved_paths.append(path)

            try:
                if home_key and home_obj:
                    upsert_team_match(home_key, home_obj)
                if away_key and away_obj:
                    upsert_team_match(away_key, away_obj)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            try:
                print(f"[save-shots] match={match_id} home={home_key} away={away_key} saved={saved_paths}")
            except Exception:
                pass

            if saved_paths:
                sync_shots_to_github_async(saved_paths, match_id, home_key, away_key)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'matchId': match_id, 'saved_files': saved_paths}).encode('utf-8'))

        elif self.path == '/api/save-patterns':
            # Retrato de cada time (o que cria e o que cede), calculado a
            # partir de data/finalizacoes/ — ver build_shot_patterns.mjs.
            # Um arquivo por time, sempre sobrescrito por completo (não tem
            # histórico por rodada aqui, é sempre o retrato mais atual).
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            team_key = payload.get('teamKey')
            if not team_key:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'missing_teamKey'}).encode('utf-8'))
                return

            patterns_dir = os.path.join(DATA_DIR, 'padroes')
            os.makedirs(patterns_dir, exist_ok=True)
            normalized_key = normalize_team_key(team_key)
            path = os.path.join(patterns_dir, f'{normalized_key}.json')

            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            try:
                print(f"[save-patterns] time={team_key} saved={path}")
            except Exception:
                pass

            sync_patterns_to_github_async([path], team_key)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'teamKey': team_key, 'saved_files': [path]}).encode('utf-8'))

        elif self.path == '/api/save-round-summary':
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            conclusoes = payload.get('conclusoes')
            if not isinstance(conclusoes, list):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_conclusoes'}).encode('utf-8'))
                return

            path = os.path.join(DATA_DIR, 'resumo-rodada.json')
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            sync_patterns_to_github_async([path], 'resumo-rodada')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'saved_files': [path]}).encode('utf-8'))

        elif self.path == '/api/save-desarmes':
            # Dataset do Mapa de Desarmes e Perda de Posse: guarda, por
            # partida e por time, cada evento de desarme/interceptação/
            # perda de posse já com quadrante e jogador resolvidos — ver
            # scripts/harvest_footstats_desarmes.mjs. Mesmo padrão do
            # /api/save-shots (idempotente por matchId, sempre sobrescreve).
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            match_id = payload.get('matchId')
            home_key = payload.get('homeTeamKey')
            away_key = payload.get('awayTeamKey')
            home_obj = payload.get('home')
            away_obj = payload.get('away')

            desarmes_dir = os.path.join(DATA_DIR, 'desarmes')
            os.makedirs(desarmes_dir, exist_ok=True)
            saved_paths = []

            def upsert_team_match_desarmes(team_key, match_obj):
                normalized_key = normalize_team_key(team_key)
                path = os.path.join(desarmes_dir, f'{normalized_key}.json')
                if os.path.exists(path):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                    except Exception:
                        data = {}
                else:
                    data = {}
                matches = data.get('matches')
                if not isinstance(matches, dict):
                    matches = {}
                matches[str(match_id)] = match_obj
                data['matches'] = matches
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                saved_paths.append(path)

            try:
                if home_key and home_obj:
                    upsert_team_match_desarmes(home_key, home_obj)
                if away_key and away_obj:
                    upsert_team_match_desarmes(away_key, away_obj)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            try:
                print(f"[save-desarmes] match={match_id} home={home_key} away={away_key} saved={saved_paths}")
            except Exception:
                pass

            if saved_paths:
                sync_desarmes_to_github_async(saved_paths, match_id, home_key, away_key)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'matchId': match_id, 'saved_files': saved_paths}).encode('utf-8'))

        elif self.path == '/api/save-perfis-jogadores':
            # Banco de jogadores notáveis (top 25% por posição em taxa de
            # desarme/interceptação e de perda de posse) — ver
            # scripts/build-player-profiles.mjs. Arquivo único, sempre
            # sobrescrito por completo (não é por partida).
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            if not isinstance(payload, list):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_payload_esperava_lista'}).encode('utf-8'))
                return

            path = os.path.join(DATA_DIR, 'perfis-jogadores.json')
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            print(f"[save-perfis-jogadores] {len(payload)} jogadores salvos")
            sync_perfis_jogadores_to_github_async([path])

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'total': len(payload), 'saved_files': [path]}).encode('utf-8'))

        elif self.path == '/api/save-proximo-confronto':
            # Mando do próximo confronto de cada time — insumo do filtro
            # "rodada atual" na aba Líderes. Ver
            # scripts/build_proximo_confronto.mjs. Arquivo único (objeto
            # {teamKey: {mando, adversario, data, rodada}}), sempre
            # sobrescrito por completo.
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            if not isinstance(payload, dict):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_payload_esperava_objeto'}).encode('utf-8'))
                return

            path = os.path.join(DATA_DIR, 'proximo-confronto.json')
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            print(f"[save-proximo-confronto] {len(payload)} times salvos")
            sync_proximo_confronto_to_github_async([path])

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'total': len(payload), 'saved_files': [path]}).encode('utf-8'))

        elif self.path == '/api/save-id-bridge':
            # Ponte idPlayer(FootStats)->atleta_id(Cartola), usada pelo
            # harvester de desarmes pra resolver quem fez cada evento. Vive
            # em data/ (não scripts/) pra ser servida como arquivo estático
            # e sincronizada com o GitHub igual aos outros datasets — o
            # GitHub Actions roda com checkout novo a cada execução, sem
            # disco persistente, então gravar isso só localmente faria a
            # ponte reiniciar vazia todo dia. Arquivo único, sobrescrito
            # por completo.
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            if not isinstance(payload, dict):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_payload_esperava_objeto'}).encode('utf-8'))
                return

            path = os.path.join(DATA_DIR, 'id-bridge-footstats.json')
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            print(f"[save-id-bridge] {len(payload)} jogadores salvos")
            sync_id_bridge_to_github_async([path])

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'total': len(payload), 'saved_files': [path]}).encode('utf-8'))

        elif self.path == '/api/save-lado-inferido':
            # Tendência de lado (esquerdo/direito) por jogador marcado como
            # "LAT" na escalação — a FootStats não distingue lateral-
            # esquerdo de lateral-direito nesse campo. Acumulado a partir
            # da posição média em campo (ver harvest_footstats_desarmes.mjs).
            # Mesmo padrão do id-bridge: arquivo único, sobrescrito por
            # completo, sincronizado com o GitHub.
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            if not isinstance(payload, dict):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_payload_esperava_objeto'}).encode('utf-8'))
                return

            path = os.path.join(DATA_DIR, 'lado-inferido.json')
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            print(f"[save-lado-inferido] {len(payload)} jogadores salvos")
            sync_lado_inferido_to_github_async([path])

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'total': len(payload), 'saved_files': [path]}).encode('utf-8'))

        elif self.path == '/api/save-raio-x':
            # Dataset da aba Raio X Ofensivo: por partida e por time, produção
            # ofensiva (gol/assistência/finalização/xG/xA/grande-chance) dos
            # jogadores que tiveram algum sinal — ver scripts/harvest_raio_x.mjs.
            # Mesmo padrão idempotente por matchId do /api/save-desarmes.
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            match_id = payload.get('matchId')
            home_key = payload.get('homeTeamKey')
            away_key = payload.get('awayTeamKey')
            home_obj = payload.get('home')
            away_obj = payload.get('away')

            raio_x_dir = os.path.join(DATA_DIR, 'raio-x')
            os.makedirs(raio_x_dir, exist_ok=True)
            saved_paths = []

            def upsert_team_match_raio_x(team_key, match_obj):
                normalized_key = normalize_team_key(team_key)
                path = os.path.join(raio_x_dir, f'{normalized_key}.json')
                if os.path.exists(path):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                    except Exception:
                        data = {}
                else:
                    data = {}
                matches = data.get('matches')
                if not isinstance(matches, dict):
                    matches = {}
                matches[str(match_id)] = match_obj
                data['matches'] = matches
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                saved_paths.append(path)

            try:
                if home_key and home_obj:
                    upsert_team_match_raio_x(home_key, home_obj)
                if away_key and away_obj:
                    upsert_team_match_raio_x(away_key, away_obj)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            try:
                print(f"[save-raio-x] match={match_id} home={home_key} away={away_key} saved={saved_paths}")
            except Exception:
                pass

            if saved_paths:
                sync_raio_x_to_github_async(saved_paths, match_id, home_key, away_key)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'matchId': match_id, 'saved_files': saved_paths}).encode('utf-8'))

        elif self.path == '/api/save-provaveis':
            # Escalação provável por time (provaveisdocartola.com.br, ver
            # scripts/harvest_pdc.mjs) + desfalques — insumo da aba Raio X
            # Ofensivo pra resolver o titular de um balde na "brecha sem
            # dono". Arquivo único (objeto {fonte, geradoEm, rodadaInfo,
            # teams}), sempre sobrescrito por completo.
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_json', 'detail': str(e)}).encode('utf-8'))
                return

            if not isinstance(payload, dict) or not isinstance(payload.get('teams'), dict):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'invalid_payload_esperava_objeto_com_teams'}).encode('utf-8'))
                return

            path = os.path.join(DATA_DIR, 'provaveis.json')
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'persist_failed', 'detail': str(e)}).encode('utf-8'))
                return

            print(f"[save-provaveis] {len(payload['teams'])} times salvos (rodada {payload.get('rodadaInfo')})")
            sync_provaveis_to_github_async([path])

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'total': len(payload['teams']), 'saved_files': [path]}).encode('utf-8'))

        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'not_found'}).encode('utf-8'))


def log_status():
    """Log periódico para monitorar a saúde do servidor no Render."""
    while True:
        try:
            count = threading.active_count()
            cache_status = "OK" if JOGADORES_CACHE["data"] else "Vazio"
            print(f"[status] Threads ativas: {count} | Cache: {cache_status}")
        except Exception:
            pass
        time.sleep(300)  # Log a cada 5 minutos

if __name__ == '__main__':
    os.chdir(ROOT)
    # Iniciar thread de monitoramento
    threading.Thread(target=log_status, daemon=True).start()
    
    port = int(os.environ.get('PORT', '8000'))
    # Fila de conexões pendentes: o padrão do Python é 5. Com a página pedindo
    # dezenas de arquivos de uma vez (fotos, escudos, scripts), o que passava disso
    # era derrubado e o Render devolvia 502 (visto no robô, 2026-10:
    # "dynamic-paid-error" nos primeiros segundos). Medido aqui: sem isso o servidor
    # começa a falhar com ~60 conexões simultâneas.
    class _Servidor(ThreadingHTTPServer):
        request_queue_size = 512
        daemon_threads = True
    httpd = _Servidor(('', port), Handler)
    print(f'Serving at http://localhost:{port}/')
    httpd.serve_forever()
