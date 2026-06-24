export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response("", { headers: corsHeaders() });
    }

    const editorKey = request.headers.get("X-Editor-Key") || "";
    const isWrite = request.method === "PUT";

    if (url.pathname === "/auth" && request.method === "POST") {
      return editorKey === env.EDITOR_KEY
        ? json({ authorized: true })
        : json({ error: "Not authorized" }, 403);
    }

    if (isWrite && editorKey !== env.EDITOR_KEY) {
      return json({ error: "Not authorized" }, 403);
    }

    try {
      if (url.pathname === "/events") {
        if (request.method === "GET") return await getFile(env, "data/events.json");
        if (request.method === "PUT") return await putFile(env, "data/events.json", request);
      }

      if (url.pathname === "/cats") {
        if (request.method === "GET") return await getFile(env, "data/cats.json");
        if (request.method === "PUT") return await putFile(env, "data/cats.json", request);
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: e?.message || String(e) }, 500);
    }
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Editor-Key"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders()
    }
  });
}

function githubHeaders(env) {
  return {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "Cloudflare-Worker"
  };
}

function githubContentsUrl(env, path) {
  return `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
}

// Unicode-safe Base64 decode for GitHub contents API responses.
function base64DecodeUnicode(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Unicode-safe Base64 encode for GitHub contents API writes.
// Required because btoa() only accepts Latin-1 strings.
function base64EncodeUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function getFile(env, path) {
  const res = await fetch(githubContentsUrl(env, path), {
    headers: githubHeaders(env)
  });

  if (!res.ok) {
    const text = await res.text();
    return json({ error: text }, res.status);
  }

  const file = await res.json();
  const decoded = base64DecodeUnicode(file.content);

  return json(JSON.parse(decoded));
}

async function putFile(env, path, request) {
  const body = await request.json();

  const getRes = await fetch(githubContentsUrl(env, path), {
    headers: githubHeaders(env)
  });

  if (!getRes.ok) {
    return json({ error: await getRes.text() }, getRes.status);
  }

  const file = await getRes.json();

  const putRes = await fetch(githubContentsUrl(env, path), {
    method: "PUT",
    headers: {
      ...githubHeaders(env),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Update ${path}`,
      content: base64EncodeUnicode(JSON.stringify(body, null, 2) + "\n"),
      sha: file.sha
    })
  });

  const putText = await putRes.text();

  if (!putRes.ok) {
    return json({ error: putText }, putRes.status);
  }

  return json({
    success: true,
    github: JSON.parse(putText)
  });
}