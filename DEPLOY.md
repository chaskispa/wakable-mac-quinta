# Coolify

Este proyecto necesita compilarse con Vite antes de publicarse. El `index.html`
de la raíz carga código fuente; no se debe servir directamente como sitio estático.

## Dockerfile

Después de subir los cambios al repositorio conectado a Coolify:

- Build Pack: **Dockerfile**.
- Base Directory: `/`.
- Dockerfile Location: `/Dockerfile`.
- Ports Exposes: `80`.
- Mantener el dominio de la aplicación y volver a desplegar.

El Dockerfile ejecuta `npm ci` y `npm run build`, y publica solamente `dist`
con Nginx. Incluye Three.js empaquetado, modelos, texturas y créditos.
No requiere un proceso de Vite ni variables de entorno en producción.

## Si la aplicación ya usa Nixpacks

También se puede corregir desde Coolify sin cambiar de Build Pack:

- Build Pack: **Nixpacks**.
- Install Command: `npm ci`.
- Build Command: `npm run build`.
- Activar **Is it a static site?**.
- Publish Directory: `dist`.
- Volver a desplegar.

No usar el Build Pack **Static** para publicar la raíz sin compilar.
La página desplegada debe cargar `/assets/index-….js`, no `/main.js`.

Referencia: https://coolify.io/docs/applications/vite
