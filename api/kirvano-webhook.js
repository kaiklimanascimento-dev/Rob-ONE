const crypto = require("crypto");

function timingSafeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function getPresentedToken(req, body) {
  const auth = req.headers.authorization || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const queryToken = req.query && typeof req.query.token === "string" ? req.query.token : "";

  return (
    bearer ||
    req.headers["x-kirvano-token"] ||
    req.headers["x-webhook-token"] ||
    req.headers["webhook-token"] ||
    req.headers["token"] ||
    queryToken ||
    (body && typeof body.token === "string" ? body.token : "")
  );
}

function productSummary(products) {
  if (!Array.isArray(products)) return [];
  return products.slice(0, 10).map((p) => ({
    id: p?.id || null,
    name: p?.name || null,
    offer_id: p?.offer_id || null,
    offer_name: p?.offer_name || null,
    price: p?.price || null,
    is_order_bump: Boolean(p?.is_order_bump),
  }));
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "kirvano-webhook",
      tokenConfigured: Boolean(process.env.KIRVANO_WEBHOOK_TOKEN),
      accepts: ["POST application/json"],
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const expectedToken = process.env.KIRVANO_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({
      ok: false,
      error: "server_not_configured",
      message: "Configure KIRVANO_WEBHOOK_TOKEN in Vercel before activating this webhook.",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_json" });
    }
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: "invalid_payload" });
  }

  const presentedToken = getPresentedToken(req, body);
  if (!presentedToken || !timingSafeEqual(presentedToken, expectedToken)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  // Do not log buyer document, email, phone, PIX QR code or full raw payload.
  const summary = {
    source: "kirvano",
    event: body.event || null,
    event_description: body.event_description || null,
    sale_id: body.sale_id || null,
    checkout_id: body.checkout_id || null,
    status: body.status || null,
    payment_method: body.payment_method || body?.payment?.method || null,
    total_price: body.total_price || null,
    type: body.type || null,
    created_at: body.created_at || null,
    products: productSummary(body.products),
    utm: body.utm
      ? {
          src: body.utm.src || null,
          utm_source: body.utm.utm_source || null,
          utm_medium: body.utm.utm_medium || null,
          utm_campaign: body.utm.utm_campaign || null,
          utm_term: body.utm.utm_term || null,
          utm_content: body.utm.utm_content || null,
        }
      : null,
    received_at: new Date().toISOString(),
  };

  console.log("KIRVANO_EVENT", JSON.stringify(summary));

  return res.status(200).json({
    ok: true,
    received: true,
    event: summary.event,
    sale_id: summary.sale_id,
  });
};
