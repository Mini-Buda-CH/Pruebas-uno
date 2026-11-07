# UNO No Mercy Online

UNO No Mercy multijugador en el navegador, con paquete de expansión y monedas. Sitio 100 % estático (HTML + JS sin build), pensado para GitHub Pages.

## Cómo se juega
1. Una persona pulsa **Crear partida**: elige de 1 a 10 mazos (168 cartas c/u), si usa expansión, cuántos paquetes (1–4, 24 cartas c/u) y si hay monedas.
2. Comparte el **código de 5 caracteres** (o el enlace) con los demás (2–20 jugadores).
3. Quien tenga el código pulsa **Unirme con código**. El anfitrión inicia la partida.

## Cómo funciona
- **Red P2P (WebRTC con PeerJS)**: el navegador del anfitrión es el servidor. Solo se usa el broker público gratuito de PeerJS para el apretón de manos inicial.
- El anfitrión envía a cada jugador **solo su propia mano** (`viewFor` en `js/rules.js`).
- Reglas: `js/rules.js` (sin DOM, con pruebas en `tests/`). Interfaz: `js/main.js`. Estilo "Portal" del archivo `Estilo.md`.

## Desplegar en GitHub Pages
*Settings → Pages → Source: **GitHub Actions***. El workflow `.github/workflows/pages.yml` ejecuta las pruebas y publica al hacer push a `main`.

## Desarrollo
```bash
node --test                        # pruebas del motor de reglas
NODE_PATH=$(npm root -g) node tools/build_cards.cjs   # regenera assets/cards/*.webp (SVG propio + dorso de Cartas/Dorso.jpg; requiere playwright e Inter)
python3 -m http.server 8000        # servir en local
```

## Limitaciones conocidas
- Si el anfitrión cierra la pestaña, la partida termina. Un invitado puede reconectarse recargando y entrando con el mismo código (misma pestaña).
- Sin servidor TURN propio: redes con NAT muy estricto pueden no conectar.
- Las caras de las cartas están dibujadas por código (SVG → webp) tomando las fotos como referencia; el dorso es tu foto real. Los iconos son interpretaciones, no copias exactas.
- Probado con simulaciones de 2 a 20 jugadores y con 20 navegadores conectados por P2P; con muchos jugadores el anfitrión debe tener buena conexión.
- *Ataque final* cuenta las cartas de acción/comodín de **tu** mano revelada (≥ 7 → 25 al siguiente y 5 a los demás).
- Con 2 jugadores, *Reversa +4/+8* devuelve la sanción a quien la jugó (puede apilar para devolverla).
