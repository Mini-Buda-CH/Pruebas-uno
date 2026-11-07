"""Traza por capas de color las cartas de arte completo (Ataque final y Muerte súbita) -> tools/art.json.

Uso: PYTHONPATH=tools python3 tools/trace_art.py [carpeta_para_previsualizaciones]
Misma base que trace_symbols.py: foto enderezada a 720x1120, k-means de color, una capa por tono y trazado con potrace.
"""
import colorsys
import json
import os
import sys

import cv2
import numpy as np

import trace_symbols as t

W2, H2, S = t.W2, t.H2, t.S
# Fotos cercanas: la carta ocupa casi todo el cuadro. Caja de la carta (x0, y0, x1, y1), con proporción 0.643; la de
# Muerte súbita sale del cuadro por todos lados y su foto está estirada en horizontal: la caja se calculó contra la foto
# completa de la carta (esa parte queda negra)
MANUAL = {"ATAQUE FINAL (cerca)": (0, 28, 866, 1388), "MUERTE SÚBITA (cerca)": (-100, -102, 999, 1453)}
CANON = {"white": "#ffffff", "black": "#0b0b0f", "red": "#e23548", "orange": "#f08a1c", "yellow": "#f6c12b", "green": "#33a94c",
         "blue": "#2f7fc9", "purple": "#4a2d8f"}


def warp(path):
    for k, (x0, y0, x1, y1) in MANUAL.items():
        if k in path:
            q = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], np.float32)
            dst = np.array([[0, 0], [W2, 0], [W2, H2], [0, H2]], np.float32)
            return cv2.warpPerspective(cv2.imread(path), cv2.getPerspectiveTransform(q, dst), (W2, H2), flags=cv2.INTER_CUBIC)
    return t.warp(path)


def canon_name(b, g, r):
    h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    h *= 360
    if v >= 0.18 and sat > 0.4 and 240 < h < 335:  # morado oscuro (fondo de Muerte súbita), no negro
        return "purple"
    if v < 0.30:
        return "black"
    if sat < 0.22:
        return "white" if v > 0.55 else "black"
    if h < 16 or h > 335:
        return "red"
    return "orange" if h < 38 else "yellow" if h < 70 else "green" if h < 175 else "blue" if h < 245 else "purple"


def layers(w, k, canon, blur=3, boost=1.3, center_only=False, min_area=40):
    """Una capa por tono (de mayor a menor área; líneas finas encima). Se ignora el fondo negro: ya lo pone el marco."""
    cv2.setRNGSeed(7)  # resultado reproducible
    region = np.zeros((H2, W2), np.uint8)
    region[30:1090, 30:690] = 1
    if center_only:  # solo el icono central: sin lo que la foto pone en las esquinas ni la marca de mazo
        region[:300, :290] = 0
        region[800:, 470:] = 0
        region[1030:, :110] = 0
    w = cv2.medianBlur(w, blur)
    ys, xs = np.where(region > 0)
    _, lab, cen = cv2.kmeans(w[ys, xs].astype(np.float32), k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3), 3, cv2.KMEANS_PP_CENTERS)
    lab = lab.ravel()
    groups = {}
    for i in range(k):
        groups.setdefault(canon_name(*cen[i]) if canon else i, []).append(i)
    res = []
    for name, idx in groups.items():
        b, g, r = cen[idx[0]]
        if canon:
            hx = CANON[name]
            r, g, b = int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16)
        lum = 0.114 * b + 0.587 * g + 0.299 * r
        sat_ = (max(b, g, r) - min(b, g, r)) / max(max(b, g, r), 1)
        if lum < 40 or name == "black" or (center_only and name == "purple") or (center_only and not canon and lum > 195 and sat_ < 0.2):  # sin mancha morada; el blanco va aparte
            continue
        m = np.zeros((H2, W2), np.uint8)
        for j in idx:
            m[ys[lab == j], xs[lab == j]] = 1
        if center_only and name == "white":  # el delineado blanco se toma por umbral y se cierra para que no queden huecos
            wb = cv2.medianBlur(w, 3)
            mn_, mx_ = wb.min(axis=2).astype(int), wb.max(axis=2).astype(int)
            m = ((mn_ > 105) & ((mx_ - mn_) < 75) & (region > 0)).astype(np.uint8)
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
        if canon and name == "purple":  # el fondo morado es apagado: se toma por tono, no por centro de grupo
            hsv = cv2.cvtColor(cv2.medianBlur(w, 7), cv2.COLOR_BGR2HSV_FULL)
            m = ((hsv[..., 0] >= 166) & (hsv[..., 0] <= 212) & (hsv[..., 1] > 56) & (hsv[..., 2] > 51) & (region > 0)).astype(np.uint8)
            m = (cv2.medianBlur(cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((45, 45), np.uint8)) * 255, 35) > 127).astype(np.uint8)  # mancha lisa
        m = cv2.morphologyEx(t.clean(m, 3, min_area), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        holes, hl, hs, _ = cv2.connectedComponentsWithStats(1 - m)  # rellena huecos pequeños (rayones)
        for j in range(1, holes):
            if hs[j, cv2.CC_STAT_AREA] < 200:
                m[hl == j] = 1
        m = cv2.dilate(m, np.ones((3, 3), np.uint8))
        if m.sum() < 100:
            continue
        if not canon:
            h_, s_, v_ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            r, g, b = [c * 255 for c in colorsys.hsv_to_rgb(h_, min(1, s_ * boost), min(1, v_ * 1.1))]
        res.append({"fill": "#%02x%02x%02x" % (int(r), int(g), int(b)), "d": t.to_path(m, 360 * S, 560 * S), "area": int(m.sum())})
    res.sort(key=lambda L: -L["area"])
    for L in res:
        del L["area"]
    if center_only and not canon:  # óvalo, cruces y destellos: blanco por umbral, encima de la llama
        wb = cv2.medianBlur(w, 3)
        mn_, mx_ = wb.min(axis=2).astype(int), wb.max(axis=2).astype(int)
        wm = ((mn_ > 150) & ((mx_ - mn_) < 45) & (region > 0)).astype(np.uint8)
        wm = t.clean(cv2.morphologyEx(wm, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)), 3, 150)
        res.append({"fill": "#ffffff", "d": t.to_path(wm, 360 * S, 560 * S)})
    return res


def eye_layers(w):
    """Muerte súbita: iris por tono (azul, verde, rojo, amarillo) y delineado blanco por umbral; sin fondo ni esquinas."""
    cv2.setRNGSeed(7)
    region = np.zeros((H2, W2), np.uint8)
    region[30:1090, 30:690] = 1
    region[:300, :290] = 0
    region[800:, 470:] = 0
    region[1030:, :110] = 0
    wb = cv2.medianBlur(w, 5)
    hsv = cv2.cvtColor(wb, cv2.COLOR_BGR2HSV_FULL).astype(int)
    h, sat, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    masks = {
        "#3a8fdc": (h > 185) & (h < 235) & (sat > 0.4) & (v > 0.4),
        "#33a94c": (h > 85) & (h < 170) & (sat > 0.35) & (v > 0.3),
        "#e23548": ((h < 14) | (h > 340)) & (sat > 0.5) & (v > 0.4),
        "#f6c12b": (h > 32) & (h < 62) & (sat > 0.5) & (v > 0.5),
    }
    mn, mx = wb.min(axis=2).astype(int), wb.max(axis=2).astype(int)
    weak = ((mn > 80) & ((mx - mn) < 48)).astype(np.uint8)  # blanco tenue solo si toca blanco seguro (histéresis)
    strong = ((mn > 140) & ((mx - mn) < 48)).astype(np.uint8)
    n, lab = cv2.connectedComponents(weak)
    keep = np.unique(lab[strong > 0])
    masks["#ffffff"] = np.isin(lab, keep[keep > 0])
    res = []
    for fill, m in masks.items():
        m = (m & (region > 0)).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11 if fill == "#ffffff" else 7,) * 2))
        m = t.clean(m, 3, 3000 if fill == "#ffffff" else 400)  # sin rayones sueltos
        holes, hl, hs, _ = cv2.connectedComponentsWithStats(1 - m)
        for j in range(1, holes):
            if hs[j, cv2.CC_STAT_AREA] < 300:
                m[hl == j] = 1
        res.append({"fill": fill, "d": t.to_path(m, 360 * S, 560 * S)})
    return res


def main():
    prev = sys.argv[1] if len(sys.argv) > 1 else None
    out = {}
    for key, fn, k, canon, blur in [("final", "COMODÍN ATAQUE FINAL (cerca).webp", 18, False, 7), ("sudden", "MUERTE SÚBITA (cerca).webp", 12, True, 3)]:
        w = warp(t.find("Paquete de expansi*", "Cartas", fn))
        out[key] = eye_layers(w) if key == "sudden" else layers(w, k, canon, blur, center_only=True)
        if prev:
            cv2.imwrite(os.path.join(prev, f"ref-{key}.png"), cv2.resize(w, (360, 560), interpolation=cv2.INTER_AREA))
    with open(os.path.join(t.ROOT, "tools", "art.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print({k: len(v) for k, v in out.items()}, os.path.getsize(os.path.join(t.ROOT, "tools", "art.json")) // 1024, "KB")


if __name__ == "__main__":
    main()
