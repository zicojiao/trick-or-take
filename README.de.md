<div align="center">
  <img src="public/party/assets/wordmark-v3-ink.png" alt="Trick or Take" width="420">
  <p><strong>Schnapp dir die Süßigkeiten. Lass dich nicht erwischen.</strong></p>
  <p>Ein kleines Halloween-Spiel im Browser. Spiele allein oder mit Freunden im Sprachchat.</p>
  <p><a href="https://trickortake.com/">Jetzt spielen</a> · <a href="docs/deployment.md">Bereitstellungsanleitung</a></p>
</div>

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Português (Brasil)](README.pt-BR.md)

[![Agora RTC](https://img.shields.io/badge/Agora-RTC-0099FF)](https://www.agora.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
![Node.js 22.13+](https://img.shields.io/badge/Node.js-22.13%2B-339933)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020)

[![Trick or Take](public/party/assets/og-home-v3-en.png)](https://trickortake.com/)

## Das Spiel

Lily ist in der Küche beschäftigt. Die Süßigkeiten stehen direkt vor dir. Eine weniger wird ihr doch nicht auffallen, oder?

Halte gedrückt, um zu naschen. Lass los, um die Süßigkeiten zu verstecken und unschuldig zu schauen. Dreht Lily sich um, während du noch zugreifst, gibt es einen Besenhieb und du verlierst **alle Süßigkeiten**. Du hast 60 Sekunden, um möglichst viele zu behalten.

Wähle den Geist, den Kürbis oder die Fledermauskatze. Spiele allein oder teile einen sechsstelligen Raumcode mit Freunden. Der Sprachchat ist optional.

| Funktion | Inhalt |
| --- | --- |
| Solo | Lokale Bestleistungen, Pause und synthetisierte Musik |
| Mehrspieler | 2–6 Spieler, sechsstellige Codes, Bereitschaftsanzeige und Revanche |
| Sprache | Agora RTC mit Mikrofon, Stummschaltung und Wiederverbindung |
| Raumupdates | Agora-RTM-Hinweise, bei Bedarf regelmäßige Serverabfragen |
| Eine gemeinsame Herausforderung | Zufällige Pausen und klare Warnungen, mit denselben Regeln für alle |
| Bestenliste | Gemeinsame Rangliste; Name und Punktzahl werden nur auf Wunsch veröffentlicht |
| Teilen | Links zu geprüften Ergebnissen und herunterladbare Ergebniskarten |
| Mobilgeräte | Touch-Steuerung, anpassbares Layout und Startbildschirm-Symbole |
| Spielsprachen | Oberfläche und Metadaten in 12 Sprachen; OG-Bilder auf Englisch und Chinesisch |

## So wird gespielt

1. Wähle eine Figur. Erstelle im Mehrspielermodus einen Raum oder tritt einem bei und warte, bis alle bereit sind.
2. Halte die große Taste, die Spielszene oder die **Leertaste** gedrückt. Je länger du hältst, desto schneller sammelst du.
3. Lass los, sobald Lily sich umdreht. Deine Figur schaut sofort unschuldig.
4. Wirst du erwischt, fällt dein Zähler auf null. Nach einer kurzen Betäubung kannst du weitermachen.
5. Am Ende zählen auch die Süßigkeiten in deinen Händen. Die höchste Anzahl gewinnt; gleiche Ergebnisse bleiben unentschieden.

Jede Runde dauert 60 Sekunden. Lily wechselt zwischen kurzen und langen Pausen und warnt 0,55–1,90 Sekunden vor ihrem Blick. Es gibt keine Schwierigkeitsauswahl.

Die Zeiten variieren pro Runde. Der Server verrät die nächste Drehung erst mit Beginn der Warnung. Im Mehrspielermodus bleibt die Musik aus, damit Gespräche gut hörbar sind.

## Lokal starten

Du brauchst **Node.js 22.13 oder neuer** und npm. Für das lokale Spiel und die Räume sind weder ein Cloudflare-Konto noch Agora-Zugangsdaten nötig.

```bash
git clone https://github.com/zicojiao/trick-or-take.git
cd trick-or-take
npm ci
npm run db:migrate
npm run dev
```

Öffne **http://localhost:5173**. Öffne zum Testen einen zweiten Tab, tritt demselben Raum bei und setze beide Spieler auf bereit. Prüfe die tatsächliche Sprachqualität mit zwei Geräten.

Die Datenbank-ID aus Nullen in `wrangler.json` ist ein Platzhalter für die lokale Entwicklung. Ersetze sie vor der Bereitstellung durch deine eigene D1-ID.

### Agora RTC und RTM aktivieren

```bash
cp .dev.vars.example .dev.vars
```

Trage `AGORA_APP_ID` und `AGORA_APP_CERTIFICATE` in `.dev.vars` ein und starte den Server neu. Aktiviere RTC und Signaling/RTM in deinem Agora-Projekt. Der Server erstellt kurzlebige Tokens für authentifizierte Raummitglieder; das Zertifikat gelangt nicht in den Browser.

Jeder Spieler muss **Join voice** wählen und den Mikrofonzugriff erlauben. Verwende localhost oder HTTPS. Details für den Produktivbetrieb stehen in der englischen [Bereitstellungsanleitung](docs/deployment.md).

### Optionale Analyse

Die Analyse ist **standardmäßig deaktiviert**. Setze zum Aktivieren deine eigenen Werte für `POSTHOG_PROJECT_TOKEN` und `POSTHOG_HOST`. `/config.js` enthält nur die öffentliche Konfiguration zur Ereigniserfassung.

PostHog verwendet Erstanbieter-Cookies und lokalen Speicher. Automatische Erfassung und Sitzungsaufzeichnung sind ausgeschaltet. Raumcodes, Challenge-IDs und URL-Parameter werden aus den Ereignissen entfernt; Spielernamen werden nicht mitgesendet. Passe die Datenschutzhinweise an deinen Betrieb an.

## Technik

Der Client nutzt JavaScript und Canvas 2D. Ein Cloudflare Worker liefert Seiten, Dateien, API und OG-Bilder; D1 speichert Räume und Ergebnisse. Agora RTC überträgt Audio, RTM meldet Raumänderungen.

- **Gemeinsame Regeln:** `public/party/engine.mjs` wird im Solospiel und auf dem Server verwendet.
- **Servergesteuerter Zustand:** Versionsabhängige Updates verhindern, dass gleichzeitige Befehle sich überschreiben. RTM legt den Spielzustand nicht fest.
- **Geprüfte Ergebnisse:** Der Server spielt Solo-Eingaben nach; Mehrspielerergebnisse stammen aus dem Raumzustand.
- **Freiwillige Veröffentlichung:** Ein Spielende veröffentlicht weder Namen noch Ergebnis automatisch. Challenge-Links enthalten keinen Spielernamen.
- **Versionierte Regeln:** Unterstützte ältere Runden bleiben nach Änderungen überprüfbar.

Weitere Details stehen in der englischen [Architekturbeschreibung](docs/architecture.md). Die Prüfung weist widersprüchliche Ergebnisse zurück, verhindert aber nicht jede Form automatisierten Spielens.

## Verzeichnisstruktur

```text
public/party/    Spiel, Canvas, Eingaben, Sprache, Übersetzungen und Grafiken
public/          Symbole, Manifest und Suchmaschinen-Dateien
server/          Räume, Tokens, Ergebnisprüfung und OG-Bilder
worker/          Routing und übersetztes HTML
drizzle/         D1-Migrationen
scripts/         Symbolgenerierung und Prüfungen
tests/           Automatisierte Tests
docs/            Bereitstellung und Architektur auf Englisch
```

## Lizenz

[MIT](LICENSE)
