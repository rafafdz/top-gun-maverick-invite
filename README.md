# Top Gun: Maverick · Noche de Cine

Invitación web estática (HTML/CSS/JS vanilla, sin build) para una noche de cine de *Top Gun: Maverick*.

**Sitio publicado:** https://rafafdz.github.io/top-gun-maverick-invite/

## Qué incluye

Diseño minimalista y editorial: grafito, blanco roto y un único acento azul eléctrico.

- **Pantalla central:** marco oscuro, radar en perspectiva dibujado en canvas (anillos, un barrido, blips), una línea de escaneo y un único jet SVG que entra desde el espacio del espectador hacia la pantalla.
- **Info mínima:** título, fecha/horario (miércoles 30 SEP · 07:30 — 22:00), una frase y el CTA. Estado del evento, countdown y hora de Chile (`America/Santiago`, DST-aware) en una línea discreta; texto para lectores de pantalla actualizado cada hora.
- **Experiencia inmersiva / Sound system:** panel modal (`<dialog>`) con una mezcla **5.1 simulada** sintetizada en vivo con Web Audio API (turbinas, viento, pad, pings de radar y la pasada del jet sincronizada con la animación), paneo HRTF L/C/R/SL/SR + LFE. No es audio de la película; nunca suena sin un clic. Incluye silencio y volumen.
- **RSVP sin recolección de datos:** “Confirmar asistencia” abre WhatsApp con un mensaje listo (el invitado elige el chat) y “Agregar al calendario” descarga un `.ics` generado en el navegador.
- Accesible (HTML semántico, foco visible, modal nativo con Esc) y respeta `prefers-reduced-motion` (escena estática).
- Fuentes Geist / Geist Mono desde Google Fonts con fallbacks del sistema.

## Correr localmente

```bash
python3 -m http.server 8080
# abre http://localhost:8080/
```

Para previsualizar otros estados del evento agrega `?now=` con una fecha ISO:

- `?now=2026-09-29T20:00:00-03:00` → próximamente
- `?now=2026-09-30T06:00:00-03:00` → hoy (antes de abrir)
- `?now=2026-09-30T20:15:00-03:00` → en curso
- `?now=2026-09-30T23:00:00-03:00` → finalizado

## Personalizar el evento

- **Fecha, horario y zona:** objeto `EVENT` al inicio de `app.js` (`date`, `start`, `end`, `timeZone`). Actualiza también la línea de fecha en `index.html` (`.when`) y el favicon/marca `30.09` si cambias el día.
- **Mensaje de RSVP:** `EVENT.rsvpText` en `app.js`. Para enviar a un número fijo usa `https://wa.me/569XXXXXXXX?text=…`.
- **Colores:** variables CSS en `:root` de `styles.css` (`--accent` es el único color).

## Despliegue

GitHub Pages vía GitHub Actions (`.github/workflows/pages.yml`): cada push a `main` sube el sitio como artifact de Pages y lo despliega.

---

Animaciones, ilustraciones y sonido originales. *Top Gun: Maverick* es marca de sus respectivos dueños; este sitio no usa material de la película.
