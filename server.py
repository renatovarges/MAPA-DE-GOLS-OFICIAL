import os
import json
from http.server import SimpleHTTPRequestHandler, HTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'data')

def normalize_team_key(team_key):
    """Converte underscore para hífen nos nomes de arquivo"""
    # Mapeamento específico para times com nomes compostos
    key_map = {
        'athletico_pr': 'athletico-pr',
        'atletico_mg': 'atletico-mg',
        'sao_paulo': 'sao-paulo',
        'red_bull_bragantino': 'red-bull-bragantino'
    }
    return key_map.get(team_key, team_key)

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/clear-all':
            # Endpoint para limpar todos os gols de todos os times
            try:
                os.makedirs(DATA_DIR, exist_ok=True)
                cleared_files = []
                for filename in os.listdir(DATA_DIR):
                    if filename.endswith('.json'):
                        path = os.path.join(DATA_DIR, filename)
                        # Resetar o arquivo para estrutura vazia
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
                # Normalizar o nome do arquivo
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
                # salva sob a chave da rodada
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

            # Log simples no console para depuração
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
