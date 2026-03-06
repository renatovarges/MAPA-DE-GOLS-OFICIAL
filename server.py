import os
import json
import csv
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, HTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'data')
CSV_PATH = os.path.join(ROOT, 'cartola_jogadores_time_posicao_preco (1).csv')

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
    """Busca jogadores em tempo real da API do Cartola."""
    try:
        url = 'https://api.cartola.globo.com/atletas/mercado'
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
        })
        with urllib.request.urlopen(req, timeout=10) as response:
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
                'fonte': 'api',
            })

        return jogadores, True  # (dados, sucesso)

    except Exception as e:
        print(f'[jogadores-api] Erro ao buscar da API: {e}')
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


class Handler(SimpleHTTPRequestHandler):

    def do_GET(self):
        if self.path == '/api/jogadores':
            self.handle_jogadores()
        else:
            super().do_GET()

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

    def do_POST(self):
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

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'round': round_no, 'saved_files': saved_paths}).encode('utf-8'))

        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'not_found'}).encode('utf-8'))


if __name__ == '__main__':
    os.chdir(ROOT)
    port = int(os.environ.get('PORT', '8000'))
    httpd = HTTPServer(('', port), Handler)
    print(f'Serving at http://localhost:{port}/')
    httpd.serve_forever()
