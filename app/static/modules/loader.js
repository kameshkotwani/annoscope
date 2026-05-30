import { state } from './state.js';
import { STAGE_IDS, PALETTE } from './constants.js';
import { fetchAnnotations, switchDataset as apiSwitchDataset } from './api.js';
import { synthesizeCocoFromYolo, stageMap, resetView, redraw, hideTooltip } from './renderer.js';
import {
    renderImageList, updateListSelection, updateListSeen,
    updateImageUI, showLoadingBoxInfo, showErrorBoxInfo,
    resetDatasetUI, elFilename,
} from './ui.js';

// ── image state reset ──────────────────────────────────────────────────────────

export function resetImageState() {
    state.currentImgSrc     = null;
    state.currentFilename   = null;
    state.currentImgWidth   = 0;
    state.currentImgHeight  = 0;
    state.currentExifOrient = 1;
    state.currentYolo       = [];
    state.currentCoco       = [];
    state.isSyntheticCoco   = false;
    state.allImages         = [];
    state.filteredImages    = [];
    state.seenSet           = new Set();
    state.currentIndex      = 0;
    state.selection         = null;
    state.hovered           = null;
    STAGE_IDS.forEach(id => {
        const entry = stageMap[id];
        if (!entry) return;
        entry.annotLayer.destroyChildren();
        entry.annotLayer.batchDraw();
        const oldImg = entry.imgLayer.findOne('Image');
        if (oldImg) { oldImg.destroy(); entry.imgLayer.batchDraw(); }
        entry.fit = null;
    });
}

// ── filter + navigation ────────────────────────────────────────────────────────

export function applyFilter() {
    const term = state.searchTerm.toLowerCase();
    state.filteredImages = term
        ? state.allImages.filter(f => f.toLowerCase().includes(term))
        : state.allImages.slice();
    state.currentIndex = Math.min(state.currentIndex, Math.max(0, state.filteredImages.length - 1));
    renderImageList(loadImage);
    const next = state.filteredImages[state.currentIndex];
    if (next && next !== state.currentFilename) loadImage(next);
}

export function navigate(delta) {
    if (!state.filteredImages.length) return;
    state.currentIndex    = (state.currentIndex + delta + state.filteredImages.length) % state.filteredImages.length;
    state.currentFilename = null;
    updateListSelection();
    loadImage(state.filteredImages[state.currentIndex]);
}

// ── load image ────────────────────────────────────────────────────────────────

function _parseCoco(data) {
    if (data.has_coco_file) {
        return { coco: data.coco, isSynthetic: false };
    }
    if (data.yolo.length > 0 && data.width > 0) {
        return { coco: synthesizeCocoFromYolo(data.yolo, data.width, data.height), isSynthetic: true };
    }
    return { coco: [], isSynthetic: false };
}

let _loadAbort = null;

export async function loadImage(filename) {
    if (filename === state.currentFilename) return;

    // cancel any in-flight annotation fetch
    if (_loadAbort) _loadAbort.abort();
    _loadAbort = new AbortController();
    const { signal } = _loadAbort;

    state.currentFilename = filename;
    state.selection       = null;
    state.hovered         = null;
    hideTooltip();

    elFilename.textContent = filename;
    showLoadingBoxInfo();

    let data;
    try {
        data = await fetchAnnotations(filename, signal);
    } catch (err) {
        if (err.name === 'AbortError') return;
        if (state.currentFilename !== filename) return;
        showErrorBoxInfo(err.status ?? 0, err.message);
        return;
    }

    // guard: user navigated away while fetch was in-flight
    if (state.currentFilename !== filename) return;

    state.currentImgWidth   = data.width;
    state.currentImgHeight  = data.height;
    state.currentExifOrient = data.exif_orientation ?? 1;
    state.currentYolo       = data.yolo;
    state.currentEdits      = data.edits || [];

    const { coco, isSynthetic } = _parseCoco(data);
    state.currentCoco     = coco;
    state.isSyntheticCoco = isSynthetic;

    state.seenSet.add(filename);
    updateImageUI(data, isSynthetic);
    updateListSeen();

    state.currentImgSrc = `/imgs/${state.activeSlug}/${encodeURIComponent(filename)}`;
    resetView();
    redraw();
}

// ── dataset switch ─────────────────────────────────────────────────────────────

function _buildClassColors(classes) {
    const colors = {};
    for (const id of Object.keys(classes)) {
        colors[id] = PALETTE[Number(id) % PALETTE.length];
    }
    return colors;
}

export function applyInitialState(data) {
    state.activeSlug   = data.slug;
    state.allImages    = data.images;
    state.seenSet      = new Set(data.seen);
    state.currentIndex = data.last_seen_index ?? 0;
    state.classColors  = _buildClassColors(data.classes ?? {});
    applyFilter();
}

export async function switchDataset(slug) {
    resetImageState();
    resetDatasetUI();
    try {
        applyInitialState(await apiSwitchDataset(slug));
    } catch (_) {
        elFilename.textContent = 'Network error switching dataset';
    }
}
