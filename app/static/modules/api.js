async function _get(url, signal) {
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) {
        let detail = `Error ${res.status}`;
        try { const body = await res.json(); if (body.detail) detail = body.detail; } catch (_) {}
        throw Object.assign(new Error(detail), { status: res.status });
    }
    return res.json();
}

async function _post(url, body = null) {
    const opts = { method: 'POST' };
    if (body !== null) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body    = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw Object.assign(new Error(`Error ${res.status}`), { status: res.status });
    return res.json();
}

export const fetchDatasets    = ()        => _get('/api/datasets');
export const fetchImages      = ()        => _get('/api/images');
export const fetchAnnotations = (file, signal) => _get(`/api/annotations/${encodeURIComponent(file)}`, signal);
export const switchDataset    = slug      => _post(`/api/switch/${slug}`);
export const postEdit         = (file, p) => _post(`/api/edit/${encodeURIComponent(file)}`, p);

export async function deleteEdit(file, id) {
    const res = await fetch(`/api/edit/${encodeURIComponent(file)}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
}

export async function clearEdits(file) {
    const res = await fetch(`/api/edit/${encodeURIComponent(file)}/clear`, { method: 'POST' });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
}
