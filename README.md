# Top Gun: Maverick · Noche de Cine

Invitación web estática (HTML/CSS/JS vanilla, sin build) para una noche de cine de *Top Gun: Maverick*.

**Sitio publicado:** https://rafafdz.github.io/top-gun-maverick-invite/

## Qué incluye

- **Pantalla de cine en 3D** con un caza original en SVG que sale de la pantalla, contrails, starfield en canvas, grilla de radar, scanlines, bloom y parallax con el mouse.
- **Reloj de Chile en vivo** (`America/Santiago`, con horario de verano) y **estado del evento** con cuenta regresiva: *En espera → Hoy · pre-vuelo → En vuelo → Misión cumplida*. El texto de estado se refresca en cada cambio de hora y la línea de tiempo marca la ventana 07:30–22:00.
- **Experiencia inmersiva**: ambientación sonora sintetizada en tiempo real con Web Audio API (turbinas, viento, pad, pings de radar y pasadas de avión), ubicada con paneo HRTF en posiciones L/C/R/SL/SR + LFE. Es una **mezcla 5.1 simulada** (binaural/estéreo), no audio de la película. Nunca se reproduce sin que el usuario presione el botón. Incluye silencio y volumen.
- **RSVP sin recolección de datos**: botón “Confirmar misil · Voy” que abre WhatsApp (`wa.me/?text=…`) con un mensaje listo — el invitado elige el chat —, copiar mensaje y descarga de un `.ics` generado en el navegador.
- Accesible (HTML semántico, foco visible, `aria-live`, etiquetas) y respeta `prefers-reduced-motion`.
- Fuentes de Google Fonts (Chakra Petch, Inter, JetBrains Mono) con fallbacks del sistema.

## Correr localmente

```bash
python3 -m http.server 8080
# abre http://localhost:8080/
```

Para previsualizar otros estados del evento agrega `?now=` con una fecha ISO:

- `?now=2026-09-29T20:00:00-03:00` → en espera
- `?now=2026-09-30T06:00:00-03:00` → hoy, antes de abrir
- `?now=2026-09-30T20:15:00-03:00` → en vuelo
- `?now=2026-09-30T23:00:00-03:00` → misión cumplida

## Personalizar el evento

- **Fecha, horario y zona:** objeto `EVENT` al inicio de `app.js` (`date`, `start`, `end`, `timeZone`). Actualiza también los textos visibles en `index.html` (sección hero, plan de vuelo, footer) y la franja del timeline en `styles.css` (`.timeline__window`: `left` = hora de inicio / 24, `width` = duración / 24).
- **Mensaje de RSVP:** `EVENT.rsvpText` en `app.js`. Para enviar a un número fijo usa `https://wa.me/569XXXXXXXX?text=…`.
- **Plan de vuelo:** los `<li data-start data-end>` de `#plan` en `index.html`; el bloque actual se resalta automáticamente durante el evento.
- **Colores:** variables CSS en `:root` de `styles.css`.

## Despliegue

GitHub Pages vía GitHub Actions (`.github/workflows/pages.yml`): cada push a `main` sube el sitio como artifact de Pages y lo despliega.

---

Animaciones, ilustraciones y sonido originales. *Top Gun: Maverick* es marca de sus respectivos dueños; este sitio no usa material de la película.
