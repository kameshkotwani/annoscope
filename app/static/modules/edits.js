import { state } from './state.js';
import { postEdit, deleteEdit, clearEdits } from './api.js';
import { synthesizeCocoFromYolo, redraw } from './renderer.js';
import { loadImage } from './loader.js';

// ── shared helper ──────────────────────────────────────────────────────────────

function findDeleteEdit(box, source) {
    return state.currentEdits.find(e => {
        if (e.action !== 'delete' || e.data.source !== source) return false;
        return source === 'yolo'
            ? e.data.line_index === box.line_index
            : e.data.ann_id    === box.ann_id;
    });
}

// ── operations ─────────────────────────────────────────────────────────────────

export async function deleteSelection() {
    if (!state.editMode || !state.selection || !state.currentFilename) return;

    const { source, idx } = state.selection;
    const box = source === 'yolo' ? state.currentYolo[idx] : state.currentCoco[idx];

    const existing = findDeleteEdit(box, source);
    if (existing) return restoreEdit(existing.id);

    const payload = { action: 'delete', data: { source } };
    if (source === 'yolo') payload.data.line_index = box.line_index;
    else                   payload.data.ann_id     = box.ann_id;

    // optimistic update — capture index for safe rollback
    const editIdx = state.currentEdits.push(payload) - 1;
    state.selection = null;
    redraw();

    try {
        const data = await postEdit(state.currentFilename, payload);
        if (data.ok) { state.currentEdits = data.edits; redraw(); }
    } catch (err) {
        console.error('Failed to delete box:', err);
        state.currentEdits.splice(editIdx, 1);
        redraw();
    }
}

export async function restoreBoxEdit(box, source) {
    if (!state.currentFilename) return;
    const existing = findDeleteEdit(box, source);
    if (existing) await restoreEdit(existing.id);
}

export async function restoreEdit(editId) {
    if (!state.currentFilename) return;
    try {
        const data = await deleteEdit(state.currentFilename, editId);
        if (data.ok) { state.currentEdits = data.edits; state.selection = null; redraw(); }
    } catch (err) {
        console.error('Failed to restore edit:', err);
    }
}

export async function clearCurrentEdits() {
    if (!state.currentFilename) return;
    if (!confirm('Are you sure you want to revert all changes for this image?')) return;
    try {
        const data = await clearEdits(state.currentFilename);
        if (data.ok) {
            state.currentEdits = [];
            state.selection    = null;
            const filename     = state.currentFilename;
            state.currentFilename = null;  // force re-fetch
            loadImage(filename);
        }
    } catch (err) {
        console.error('Failed to clear edits:', err);
    }
}

export async function moveBox(box, newCx, newCy) {
    if (!state.currentFilename) return;
    const payload = {
        action: 'move',
        data:   { source: 'yolo', line_index: box.line_index, cx: newCx, cy: newCy, w: box.w, h: box.h },
    };
    const oldCx = box.cx, oldCy = box.cy;
    box.cx = newCx;
    box.cy = newCy;
    const editIdx = state.currentEdits.push(payload) - 1;

    try {
        const data = await postEdit(state.currentFilename, payload);
        if (data.ok) {
            state.currentEdits = data.edits;
            if (state.isSyntheticCoco) {
                state.currentCoco = synthesizeCocoFromYolo(state.currentYolo, state.currentImgWidth, state.currentImgHeight);
            }
            redraw();
        }
    } catch (err) {
        console.error('Failed to move box:', err);
        box.cx = oldCx;
        box.cy = oldCy;
        state.currentEdits.splice(editIdx, 1);
        redraw();
    }
}
