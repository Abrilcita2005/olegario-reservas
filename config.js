// Dirección de la API del servidor de Olegario (PHP + MySQL, el mismo de la app). Es pública: no es una
// contraseña. La seguridad la pone el servidor (cada persona entra con su cuenta).
//   - Vacía: modo prueba (las reservas no se guardan en ningún lado).
//   - Local con Docker: 'http://localhost:8080'.
//   - Producción: la dirección del servidor en Hostinger (con https), cuando esté publicado.
export const API_URL = '';
