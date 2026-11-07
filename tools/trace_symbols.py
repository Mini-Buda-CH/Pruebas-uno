"""Traza a vectores (Bézier) los símbolos de las fotos de Cartas/ -> tools/symbols.json.

Uso: pip install opencv-python-headless potracer && python3 tools/trace_symbols.py [carpeta_para_previsualizaciones]
Cada foto se endereza (perspectiva) a 720x1120; las coordenadas de salida están en el sistema de la carta
final de 360x560. Símbolo blanco aislado por umbral (acciones de color); de los números solo se extraen subrayado, flechas e iconos.
"""
import colorsys
import glob
import json
import os
import sys

import cv2
import numpy as np
import potrace

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Cartas")
W2, H2 = 720, 1120
S = 0.5  # 720x1120 -> 360x560


def find(*parts):
    return glob.glob(os.path.join(SRC, *parts))[0]


def warp(path):
    img = cv2.imread(path)
    mx, mn = img.max(axis=2).astype(int), img.min(axis=2).astype(int)
    dark = ((mx < 75) & ((mx - mn) < 0.28 * np.maximum(mx, 1))).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((15, 15), np.uint8))
    cs, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull = cv2.convexHull(max(cs, key=cv2.contourArea))
    peri = cv2.arcLength(hull, True)
    quad = None
    for k in np.linspace(0.01, 0.1, 30):
        a = cv2.approxPolyDP(hull, k * peri, True)
        if len(a) == 4:
            quad = a.reshape(4, 2).astype(np.float32)
            break
    if quad is None:
        quad = cv2.boxPoints(cv2.minAreaRect(hull)).astype(np.float32)
    wq, hq = np.linalg.norm(quad[0] - quad[1]), np.linalg.norm(quad[1] - quad[2])
    if not (0.5 < min(wq, hq) / max(wq, hq) < 0.75) or cv2.contourArea(quad) < 0.2 * img.shape[0] * img.shape[1]:
        rows = np.where(dark.sum(axis=1) > 0.10 * 255 * img.shape[1])[0]  # respaldo: caja por proyecciones
        cols = np.where(dark.sum(axis=0) > 0.05 * 255 * img.shape[0])[0]
        x0, x1, y0, y1 = cols.min(), cols.max(), rows.min(), rows.max()
        quad = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], np.float32)
    s, d = quad.sum(axis=1), np.diff(quad, axis=1).ravel()
    src = np.array([quad[np.argmin(s)], quad[np.argmin(d)], quad[np.argmax(s)], quad[np.argmax(d)]], np.float32)  # TL TR BR BL
    dst = np.array([[0, 0], [W2, 0], [W2, H2], [0, H2]], np.float32)
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (W2, H2), flags=cv2.INTER_CUBIC)


def to_path(mask, ox=0, oy=0):
    """Máscara -> 'd' de SVG con curvas, en coordenadas de carta 360x560 menos (ox, oy)."""
    bm = potrace.Bitmap(~mask.astype(bool))  # potracer traza los píxeles False
    out = []
    f = lambda p: f"{p.x * S - ox:.1f},{p.y * S - oy:.1f}"
    for curve in bm.trace(turdsize=25, alphamax=1.0, opticurve=True, opttolerance=0.6):
        out.append("M" + f(curve.start_point))
        for seg in curve.segments:
            out.append(f"L{f(seg.c)}L{f(seg.end_point)}" if seg.is_corner else f"C{f(seg.c1)} {f(seg.c2)} {f(seg.end_point)}")
        out.append("Z")
    return "".join(out)


def clean(mask, open_k=5, min_area=150):
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_k, open_k)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= min_area:
            keep[lab == i] = 1
    return keep


def split_regions(mask):
    """Separa los componentes blancos en símbolo central y esquina superior izquierda (la inferior es su giro)."""
    n, lab, st, cen = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    center, corner = np.zeros_like(mask, np.uint8), np.zeros_like(mask, np.uint8)
    for i in range(1, n):
        cx, cy = cen[i]
        if abs(cx - 360) < 60 and (cy < 140 or cy > 980):  # triángulos del borde
            continue
        if st[i, cv2.CC_STAT_TOP] < 14 or st[i, cv2.CC_STAT_TOP] + st[i, cv2.CC_STAT_HEIGHT] > H2 - 14:  # rayones del borde
            continue
        if cx < 285 and cy < 400:
            corner[lab == i] = 1
        elif cx > 440 and cy > 720:
            continue  # esquina inferior derecha
        else:
            center[lab == i] = 1
    return center, corner


def white_masks(path):
    w = cv2.medianBlur(warp(path), 3)
    mn, mx = w.min(axis=2).astype(int), w.max(axis=2).astype(int)
    c, _ = split_regions(clean((mn > 150) & ((mx - mn) < 70), 5, 500))  # símbolo central: umbral estricto
    cm = clean((mn > 128) & ((mx - mn) < 80), 3, 120)  # iconos finos de la esquina
    cm[:64], cm[-64:] = 0, 0  # rayones pegados al borde de la carta
    _, k = split_regions(cm)
    _, k2 = split_regions(np.ascontiguousarray(cm[::-1, ::-1]))  # la esquina inferior es la superior girada 180°
    return c, (k2 if k2.sum() > k.sum() else k), w


def big_boxes(mask):
    """Componentes 'grandes' (el dígito, sin subrayado ni iconos) y su caja conjunta."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    mh = max(st[i, cv2.CC_STAT_HEIGHT] for i in range(1, n))
    sel = [i for i in range(1, n) if st[i, cv2.CC_STAT_HEIGHT] >= 0.6 * mh]
    x0, y0 = min(st[i, 0] for i in sel), min(st[i, 1] for i in sel)
    x1, y1 = max(st[i, 0] + st[i, 2] for i in sel), max(st[i, 1] + st[i, 3] for i in sel)
    return sel, lab, (x0, y0, x1, y1)


def place(mask, box, cx, cy, h):
    """Escala y mueve `mask` para que la caja `box` quede centrada en (cx, cy) con altura h."""
    x0, y0, x1, y1 = box
    sc = h / (y1 - y0)
    M = np.float32([[sc, 0, cx - sc * (x0 + x1) / 2], [0, sc, cy - sc * (y0 + y1) / 2]])
    return (cv2.warpAffine(mask.astype(np.float32), M, (W2, H2), flags=cv2.INTER_LINEAR) > 0.5).astype(np.uint8)


def black_arrow(c, w):
    """Flecha negra de Tira un color: píxeles oscuros entre el abanico y el mazo, sin sombras de las figuras ni el aro del óvalo."""
    dark = (cv2.medianBlur(w, 5).max(axis=2) < 80).astype(np.uint8)
    ys, xs = np.where(c > 0)
    box = np.zeros_like(dark)
    box[ys.min() - 30:ys.max() + 30, xs.min() - 30:xs.max() + 30] = 1
    near = cv2.dilate(c, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (27, 27)))
    ring = np.zeros_like(dark)
    cv2.ellipse(ring, (360, 560), (248, 436), 28, 0, 360, 1, 44)
    m = clean(((dark > 0) & (box > 0) & (near == 0) & (ring == 0)).astype(np.uint8), 5, 300)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    inner = [i for i in range(1, n) if abs(cen[i][0] - 360) < 150 and 520 < cen[i][1] < 800]
    return np.isin(lab, inner).astype(np.uint8)


def normalize_numbers(masks):
    """Todos los números con la misma altura, centrados en el óvalo; esquinas alineadas entre sí."""
    keys = [str(n) for n in range(10)] + ["10"]
    boxes = {k: (big_boxes(masks[k][0]), big_boxes(masks[k][1])) for k in keys}
    hc = float(np.median([boxes[k][0][2][3] - boxes[k][0][2][1] for k in keys[:10]]))
    hk = float(np.median([boxes[k][1][2][3] - boxes[k][1][2][1] for k in keys[:10]]))
    icon = masks["skipall"][1]  # la flecha circular de Salta a todos sustituye a la de 0 y 10
    n, lab, st, _ = cv2.connectedComponentsWithStats(icon)
    ix0, iy0 = min(st[i, 0] for i in range(1, n)), min(st[i, 1] for i in range(1, n))
    ix1, iy1 = max(st[i, 0] + st[i, 2] for i in range(1, n)), max(st[i, 1] + st[i, 3] for i in range(1, n))
    icon = icon[iy0:iy1, ix0:ix1]
    for k in keys:
        (selc, labc, bc), (selk, labk, bk) = boxes[k]
        c, kk = masks[k][0], masks[k][1]
        if k in ("0", "10"):  # solo el dígito en la esquina; el icono se añade abajo
            kk = np.isin(labk, selk).astype(np.uint8)
        cx_k = 132 if k == "10" else 118
        newc = place(c, bc, 360, 560, hc * (0.93 if k == "10" else 1.0))
        newk = place(kk, bk, cx_k, 150, hk)
        if k in ("0", "10"):
            ih = int(hk * 0.42)
            ic = cv2.resize(icon, (max(1, int(icon.shape[1] * ih / icon.shape[0])), ih), interpolation=cv2.INTER_AREA)
            top = int(150 + hk / 2 + 18)
            x = int(cx_k - ic.shape[1] / 2)
            newk[top:top + ih, x:x + ic.shape[1]] |= ic[: H2 - top, : W2 - x]
        masks[k] = (newc, newk, masks[k][2])
    return hc, hk


def main():
    prev = sys.argv[1] if len(sys.argv) > 1 else None
    jobs = {str(n): ("Uno No Mercy", "Mazos", f"{n}.jpeg") for n in range(10)}
    jobs.update({"skipall": ("Uno No Mercy", "Mazos", "Salta a todos.jpeg"), "rev": ("Uno No Mercy", "Mazos", "Reversa.jpeg"),
                 "skip": ("Uno No Mercy", "Mazos", "Salta.jpeg"), "discard": ("Uno No Mercy", "Mazos", "Tira un color.jpeg"),
                 "d2": ("Uno No Mercy", "Mazos", "Toma 2.jpeg"), "d4": ("Uno No Mercy", "Mazos", "Toma 4.jpeg"),
                 "10": ("Colores", "Rojo.jpeg")})
    def save_ref(key, w):
        if prev:
            cv2.imwrite(os.path.join(prev, f"ref-{key}.png"), cv2.resize(w, (360, 560), interpolation=cv2.INTER_AREA))

    masks = {}
    for key, parts in jobs.items():
        masks[key] = white_masks(find(*parts))
        save_ref(key, masks[key][2])
    hc, hk = normalize_numbers(masks)

    def extras(m):  # lo que no es el dígito (subrayado del 6/9, flechas del 7, icono del 0/10)
        n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8))
        mh = max(st[i, cv2.CC_STAT_HEIGHT] for i in range(1, n))
        ex = [i for i in range(1, n) if st[i, cv2.CC_STAT_HEIGHT] < 0.6 * mh]
        big = max(st[i, cv2.CC_STAT_AREA] for i in ex) if ex else 0
        return np.isin(lab, [i for i in ex if st[i, cv2.CC_STAT_AREA] >= 0.3 * big]).astype(np.uint8)  # sin restos de rayones

    out = {"_num": {"hc": round(hc * S, 1), "hk": round(hk * S, 1)}}
    for key, (c, k, _) in masks.items():
        if key.isdigit() or key == "10":  # los dígitos los genera build_cards.cjs; aquí solo sus extras
            out[key] = {"cicon": to_path(extras(c), 360 * S, 560 * S) if key in ("6", "9") else "", "icon": to_path(extras(k)) if key in ("0", "6", "7", "9", "10") else "", "kind": "num"}
        else:
            out[key] = {"center": to_path(c, 360 * S, 560 * S), "corner": to_path(k), "kind": "white"}
    out["discard"]["arrow"] = to_path(black_arrow(masks["discard"][0], masks["discard"][2]), 360 * S, 560 * S)
    with open(os.path.join(ROOT, "tools", "symbols.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(len(out), "símbolos,", os.path.getsize(os.path.join(ROOT, "tools", "symbols.json")) // 1024, "KB")


if __name__ == "__main__":
    main()
