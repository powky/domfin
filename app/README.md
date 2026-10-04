# La app de Domfin

La app de [Domfin](../README.md), en Expo (React Native) para la web, iOS y
Android, con Expo Router, Unistyles, Reanimated e i18next. Todo lo que
muestra sale de domfin-api ([`../api`](../api)).

Para montar Domfin completo, sigue el [README principal](../README.md#cómo-montarlo).

```bash
npm install
npm run web          # http://localhost:8081
npx expo run:ios     # development build (Expo Go no sirve: usa módulos nativos)
npx expo run:android
npm run typecheck
npm run lint
npm run contrast     # el contraste de los colores, en el tema claro y el oscuro
```

Por dentro (de dónde sale cada dato, la estructura de carpetas, el design
system, las monedas y las animaciones): [docs/desarrollo.md](docs/desarrollo.md).
