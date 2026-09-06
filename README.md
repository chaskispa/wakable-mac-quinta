# MAC Caminable

Visor 3D del MAC Quinta con Three.js y Vite.

**[Explorar el museo → https://mac-quinta.chsk.net/](https://mac-quinta.chsk.net/)**

## Controles

En móvil, toca para explorar: usa el joystick izquierdo para caminar y desliza
otro dedo sobre la escena para mirar. El botón **Pausa** detiene la navegación.
En escritorio, usa WASD o flechas y el mouse; ESC libera el cursor.

En iPhone, abre el visor con **Compartir → Añadir a pantalla de inicio** y
lánzalo desde su icono para usarlo sin las barras de Safari. En navegadores que
admiten pantalla completa, el visor la solicita al tocar para explorar.

La compilación genera una copia comprimida del OBJ (aproximadamente 12 MB frente
a 49 MB). La carga muestra progreso de descarga y el estado de preparación de la
escena; los navegadores sin descompresión compatible usan el OBJ original.

## Desarrollo local

```bash
npm install
npm run dev
```

## Más información

- [Despliegue en Coolify](DEPLOY.md)
- [Créditos y atribuciones](models/CREDITS.md)
