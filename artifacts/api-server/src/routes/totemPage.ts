/**
 * routes/totemPage.ts
 * Serve o SPA do totem com token validado e config injetada no HTML.
 * GET /totem/:token → valida → injeta vars → retorna HTML personalizado
 */
import { Router, Request, Response } from 'express';
import { resolveToken } from '../services/totem.js';
import path from 'path';
import fs   from 'fs';
import { fileURLToPath } from 'url';

const r = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, '../../public/concierge/index.html');

r.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const condoId = await resolveToken(token);
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    const out  = html.replace(
      '<!-- [[TOTEM_CONFIG]] -->',
      `<script>
        window.__TOTEM__ = {
          token:   "${token}",
          condoId: "${condoId}",
          apiBase: "/api/concierge",
          ttsUrl:  "/api/di/tts",
        };
      </script>`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.send(out);
  } catch (e) {
    const msg = (e as Error).message;
    res.status(403).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Totem · Acesso Negado</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Nunito',system-ui,sans-serif;background:#04040c;color:#f0eeff;
         min-height:100vh;display:flex;align-items:center;justify-content:center;
         flex-direction:column;gap:16px;padding:24px;text-align:center}
    .box{background:#12122a;border:1.5px solid #1e1e40;border-radius:16px;padding:20px 28px;max-width:380px;width:100%}
    .ico{font-size:56px;margin-bottom:12px}
    .title{font-size:22px;font-weight:900;color:#fff;margin-bottom:8px}
    .sub{font-size:13px;color:#8884b8;line-height:1.6}
  </style>
</head>
<body>
  <div class="box">
    <div class="ico">🔒</div>
    <div class="title">Totem Indisponível</div>
    <div class="sub">${msg}.<br><br>Verifique o link com o administrador do sistema ImobCore.</div>
  </div>
</body>
</html>`);
  }
});

export default r;
