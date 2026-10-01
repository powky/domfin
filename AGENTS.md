# Domfin

Finanzas personales para República Dominicana: cuentas, tarjetas, préstamos
y certificados, en pesos y dólares, leídos de los estados de cuenta en PDF.
Todo corre en la computadora de quien lo usa.

| Carpeta | Qué es | Léelo antes de tocarla |
| --- | --- | --- |
| `api/` | domfin-api, en Go: lee los PDF, los guarda en SQLite, clasifica los movimientos y trae la tasa del BCRD. | `api/CLAUDE.md`, `api/docs/` |
| `app/` | La app, en Expo (web, iOS y Android). | `app/AGENTS.md`, `app/docs/desarrollo.md` |

La app habla con la API por HTTP (`EXPO_PUBLIC_API_URL`, por defecto
`http://localhost:8080`). Los endpoints con datos del banco solo responden a
la misma computadora.

## Comandos

```bash
./domfin setup                                # instala lo que falte y salta lo demás
./domfin start [--demo]                       # API y app juntas, en 8080 y 8081 o los siguientes libres
cd api && go run ./cmd/api                    # :8080
cd api && go test ./... && gofmt -l .         # gofmt debe salir vacío
cd app && npm run web                         # :8081
cd app && npm run typecheck && npm run lint
```

## Reglas

- Las de [CONTRIBUTING.md](CONTRIBUTING.md), empezando por la primera: nada
  de datos reales en el repositorio (ni PDF, ni bases, ni números de
  cuenta, nombres o montos de estados de verdad, tampoco en tests, ejemplos
  o placeholders).
- Corre los tests de la parte que cambiaste antes de dar algo por terminado,
  y di qué cambiaste y cómo revisarlo.
- Commits en Conventional Commits, en inglés. Lo que ve el usuario, en
  español neutro, de "tú", y en inglés.
- La app y la API comparten la versión (ver *Publicar una versión* en
  CONTRIBUTING).
- El lanzador tiene dos versiones: `domfin` (bash 3.2, para macOS y Linux) y
  `scripts/domfin.ps1` (Windows PowerShell 5.1, por `domfin.cmd`). Un cambio
  va en las dos.
