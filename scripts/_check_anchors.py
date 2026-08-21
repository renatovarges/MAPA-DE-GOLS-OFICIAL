"""
Verifica se RX_ANCORA_CONFRONTO (raiox.js) tem folga segura entre TODOS os
pares de ancora -- >= min_x_gap_pct em X OU >= min_y_gap_pct em Y. Rode
depois de qualquer mudanca nas ancoras (RX_ANCORA_CONFRONTO em raiox.js),
antes de testar no navegador. Achado real (2026-08-20 e 2026-08-21):
calcular essas distancias de cabeca errou 2 vezes -- por isso este script.

Uso: copie os valores de RX_ANCORA_CONFRONTO pra ANCHORS abaixo e rode:
    python scripts/_check_anchors.py
"""
import itertools

RX_PITCH_W = 2200
RX_PITCH_H = 2600
RX_CARD_W = 450
RX_CARD_H = 600
RX_CARD_H_SEGURA = 660

inset_x = RX_PITCH_W - RX_CARD_W
inset_y = RX_PITCH_H - RX_CARD_H
MIN_X_GAP_PCT = RX_CARD_W / inset_x * 100
MIN_Y_GAP_PCT = RX_CARD_H_SEGURA / inset_y * 100

# Mantenha isso em sincronia com RX_ANCORA_CONFRONTO em raiox.js.
ANCHORS = {
    'CENTROAVANTE': (50, 8),
    'PONTA-ESQ': (14, 22),
    'PONTA-DIR': (86, 22),
    'MEI': (35, 55),
    'VOL': (65, 55),
    'LAT-ESQ': (4, 80),
    'ZAG-A': (35, 88),
    'ZAG-B': (65, 88),
    'LAT-DIR': (96, 80),
}


def safe(a, b):
    dx = abs(a[0] - b[0])
    dy = abs(a[1] - b[1])
    return (dx >= MIN_X_GAP_PCT or dy >= MIN_Y_GAP_PCT), dx, dy


if __name__ == '__main__':
    print(f"min_x_gap_pct={MIN_X_GAP_PCT:.2f}  min_y_gap_pct={MIN_Y_GAP_PCT:.2f}")
    ok = True
    for (na, a), (nb, b) in itertools.combinations(ANCHORS.items(), 2):
        is_safe, dx, dy = safe(a, b)
        if not is_safe:
            ok = False
            print(f"COLISAO: {na} vs {nb}  dx={dx:.1f}  dy={dy:.1f}")
    print("TUDO SEGURO" if ok else "TEM COLISAO -- ajuste as ancoras antes de testar")
