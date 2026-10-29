<div align="center">
  <img src="public/party/assets/wordmark-v3-ink.png" alt="Trick or Take" width="420">
  <p><strong>Coge los caramelos. Que no te pillen.</strong></p>
  <p>Un pequeño robo de caramelos de Halloween en tu navegador. Juega a solas o con amigos por chat de voz.</p>
  <p><a href="https://trickortake.com/">Jugar ahora</a> · <a href="docs/deployment.md">Guía de despliegue</a></p>
</div>

[English](README.md) · [简体中文](README.zh-CN.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Português (Brasil)](README.pt-BR.md)

[![Agora RTC](https://img.shields.io/badge/Agora-RTC-0099FF)](https://www.agora.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
![Node.js 22.13+](https://img.shields.io/badge/Node.js-22.13%2B-339933)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020)

[![Trick or Take](public/party/assets/og-home-v3-en.png)](https://trickortake.com/)

## El juego

Lily está ocupada en la cocina. Los caramelos están ahí mismo. No se dará cuenta si falta uno, ¿verdad?

Mantén pulsado para robar. Suelta para guardar los caramelos y poner cara de inocente. Si Lily se gira y sigues robando, te dará un escobazo y perderás **todos los caramelos**. Tienes 60 segundos para conseguir el mejor resultado.

Elige el fantasma, la calabaza o el gato murciélago. Juega a solas o comparte un código de sala de seis dígitos con tus amigos. El chat de voz es opcional.

| Función | Qué incluye |
| --- | --- |
| Un jugador | Récords locales, pausa y música sintetizada |
| Multijugador | 2–6 jugadores, salas de seis dígitos, confirmación de preparación y revanchas |
| Voz | Agora RTC con micrófono, silencio y reconexión |
| Actualizaciones | Avisos de Agora RTM y consultas periódicas como alternativa |
| Dificultad | Tres niveles; en Difícil, Lily se gira más rápido sin hacerlo constantemente |
| Clasificación | Una tabla común; tú decides si publicas tu nombre y puntuación |
| Compartir | Enlaces a resultados verificados y tarjetas descargables |
| Móvil | Controles táctiles, diseño adaptable e iconos de pantalla de inicio |
| Idiomas del juego | Inglés en `/` y chino simplificado en `/zh`, incluidos los metadatos y las imágenes OG |

## Cómo jugar

1. Elige personaje y dificultad. En multijugador, crea una sala o únete a una y espera a que todos estén listos.
2. Mantén pulsado el botón grande, la escena o **Espacio**. Cuanto más tiempo mantengas pulsado, más rápido robas.
3. Suelta cuando Lily empiece a girarse. Tu personaje pone cara de inocente inmediatamente.
4. Si te descubre, tu cuenta vuelve a cero. Tras un breve aturdimiento, puedes volver a intentarlo.
5. Al terminar, también cuentan los caramelos que aún tienes en las manos. Gana quien tenga más; los empates se mantienen.

| Dificultad | Tiempo de reacción | Ritmo |
| --- | --- | --- |
| Fácil | 1,50–2,10 segundos | Pausas largas y aviso generoso |
| Media | 0,90–1,35 segundos | Ritmo variado y equilibrado |
| Difícil | 0,36–0,58 segundos | Frecuencia similar a Media, giros mucho más rápidos |

Los tiempos cambian en cada ronda. El servidor no revela el siguiente giro antes de que empiece el aviso. La música permanece desactivada en multijugador para facilitar la conversación.

## Ejecutar en local

Necesitas **Node.js 22.13 o posterior** y npm. El juego local y las salas no requieren una cuenta de Cloudflare ni credenciales de Agora.

```bash
git clone https://github.com/zicojiao/trick-or-take.git
cd trick-or-take
npm ci
npm run db:migrate
npm run dev
```

Abre **http://localhost:5173**. Para probar una sala, abre otra pestaña, únete con el mismo código y marca ambos jugadores como listos. Para evaluar el audio real, usa dos dispositivos.

El ID de base de datos de ceros en `wrangler.json` es un valor de ejemplo para desarrollo local. Sustitúyelo por tu propio ID de D1 antes de desplegar.

### Activar Agora RTC y RTM

```bash
cp .dev.vars.example .dev.vars
```

Configura `AGORA_APP_ID` y `AGORA_APP_CERTIFICATE` en `.dev.vars` y reinicia el servidor. Activa RTC y Signaling/RTM en tu proyecto de Agora. El servidor emite tokens de corta duración para los miembros autenticados; el certificado nunca se envía al navegador.

Cada jugador debe pulsar **Join voice** y permitir el micrófono. Se necesita localhost o HTTPS. Consulta la [guía de despliegue](docs/deployment.md), en inglés, para la configuración de producción.

### Analítica opcional

Está **desactivada por defecto**. Para activarla, configura tus propios `POSTHOG_PROJECT_TOKEN` y `POSTHOG_HOST`. `/config.js` solo expone la configuración pública de recepción de eventos.

PostHog utiliza cookies propias y almacenamiento local. La captura automática y la grabación de sesiones están desactivadas. Se eliminan códigos de sala, identificadores de desafíos y parámetros de las URL de los eventos; no se envían los nombres de los jugadores. Adapta las páginas de privacidad a tu despliegue.

## Cómo funciona

El cliente utiliza JavaScript y Canvas 2D. Un Cloudflare Worker sirve páginas, recursos, API e imágenes OG; D1 guarda salas y resultados. Agora RTC transporta el audio y RTM avisa de cambios en la sala.

- **Motor compartido:** `public/party/engine.mjs` ejecuta las mismas reglas en solitario y en el servidor.
- **Estado del servidor:** las actualizaciones condicionadas por versión evitan sobrescribir comandos simultáneos. RTM no decide el estado de la partida.
- **Resultados verificados:** el servidor reproduce las acciones de las partidas individuales y obtiene los resultados multijugador del estado de la sala.
- **Publicación voluntaria:** terminar una partida no publica tu nombre ni tu puntuación automáticamente. Los enlaces de desafío no incluyen el nombre.
- **Reglas versionadas:** los resultados de versiones anteriores compatibles siguen siendo verificables.

Consulta la [arquitectura](docs/architecture.md), en inglés. La verificación rechaza puntuaciones inconsistentes, pero no impide por completo los jugadores automatizados.

## Estructura

```text
public/party/    Juego, Canvas, controles, voz, traducciones y arte
public/          Iconos, manifiesto y archivos para buscadores
server/          Salas, tokens, verificación e imágenes OG
worker/          Rutas y HTML localizado
drizzle/         Migraciones D1
scripts/         Generación de iconos y comprobaciones
tests/           Pruebas automatizadas
docs/            Despliegue y arquitectura, en inglés
```

## Licencia

[MIT](LICENSE)
