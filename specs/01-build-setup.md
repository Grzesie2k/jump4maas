# Spec 01 — Build Setup & Project Scaffolding

**Równolegle z spec-00.**  
Nie wymaga żadnej logiki gry — tylko konfiguracja toolchaina.

## Pliki do stworzenia

```
/
├── package.json                  # npm workspaces root
├── shared/
│   └── tsconfig.json
├── client/
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
└── server/
    └── tsconfig.json
```

## `package.json` (root)

```json
{
  "name": "jump4maas",
  "private": true,
  "workspaces": ["client", "server", "shared"],
  "scripts": {
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client",
    "build:client": "npm run build --workspace=client"
  }
}
```

## `shared/package.json`

```json
{
  "name": "@jump4maas/shared",
  "version": "1.0.0",
  "main": "types.ts",
  "types": "types.ts"
}
```

## `server/package.json`

```json
{
  "name": "@jump4maas/server",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc"
  },
  "dependencies": {
    "colyseus": "0.15.x",
    "@colyseus/ws-transport": "0.15.x",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

## `client/package.json`

```json
{
  "name": "@jump4maas/client",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "colyseus.js": "0.15.x",
    "phaser": "^3.60.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

## `client/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 3000,
  },
  define: {
    // Umożliwia nadpisanie URL serwera przez env przy buildzie produkcyjnym
    "import.meta.env.VITE_SERVER_URL": JSON.stringify(
      process.env.VITE_SERVER_URL ?? "ws://localhost:2567"
    ),
  },
});
```

## `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

> `experimentalDecorators` i `emitDecoratorMetadata` są **wymagane** przez Colyseus Schema.

## `client/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

## `client/index.html`

Szkielet HTML. Warstwy UI (spec-06) uzupełnią `#ui-root`. Phaser (spec-08) zajmie `<canvas>`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Platformer Party</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #1a1a2e;
      color: #eee;
      font-family: 'Segoe UI', sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #game-container {
      position: relative;
      width: 800px;
      height: 576px;
    }

    /* Phaser canvas trafia tutaj automatycznie */
    #game-container canvas {
      position: absolute;
      top: 0; left: 0;
    }

    /* Warstwa UI — nad canvasem */
    #ui-root {
      position: absolute;
      top: 0; left: 0;
      width: 800px;
      height: 576px;
      pointer-events: none;   /* domyślnie nie blokuje kliknięć canvasa */
    }

    #ui-root .screen {
      position: absolute;
      inset: 0;
      display: none;
      pointer-events: all;
    }

    #ui-root .screen.active {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(26, 26, 46, 0.97);
    }

    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div id="game-container">
    <!-- Phaser wstrzykuje canvas tutaj -->
    <div id="ui-root">
      <div id="screen-landing"  class="screen active"></div>
      <div id="screen-lobby"    class="screen"></div>
      <div id="screen-room"     class="screen"></div>
    </div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

## Uwagi

- `shared/` jest workspace — importuj jako `import { Tile } from "@shared/types"` po skonfigurowaniu aliasów.
- Phaser canvas jest tworzony przez `GameScene` (spec-08) i automatycznie dołączany do `#game-container`.
- Przy `vite dev` client działa na porcie 3000, serwer Colyseus na 2567.
