import { state } from './state.js';
import { redraw } from './renderer.js';

// ── DOM refs ───────────────────────────────────────────────────────────────────

const elDataset        = document.getElementById('dataset-select');
const btnEditMode      = document.getElementById('btn-edit-mode');
const btnClearEdits    = document.getElementById('btn-clear-edits');
const btnOverlay       = document.getElementById('btn-overlay');
const elExifBadge      = document.getElementById('exif-badge');
const elBoxInfo        = document.getElementById('box-info');
const elProgress       = document.getElementById('progress');
const elImgCount       = document.getElementById('img-count');
const elImgList        = document.getElementById('img-list');
const elViewerPanels   = document.getElementById('viewer-panels');
const elCompPanels     = document.getElementById('comparison-panels');
const elOverlayWrap    = document.getElementById('overlay-panel-wrap');
const elCocoPanelTitle = document.getElementById('coco-panel-title');

// ── helpers ────────────────────────────────────────────────────────────────────

function _toggleButton(btn, val, onText, offText) {
    btn.classList.toggle('active', val);
    btn.textContent = val ? onText : offText;
}

function _updateListItems(fn) {
    elImgList.querySelectorAll('.item').forEach((el, i) => fn(el, i));
}

// ── mode setters ───────────────────────────────────────────────────────────────

export function setTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    const isViewer     = tab === 'viewer';
    const isComparison = tab === 'comparison';
    btnEditMode.style.display   = isViewer     ? '' : 'none';
    btnClearEdits.style.display = isViewer     ? '' : 'none';
    btnOverlay.style.display    = isComparison ? '' : 'none';
    elViewerPanels.style.display  = isViewer                           ? '' : 'none';
    elCompPanels.style.display    = isComparison && !state.overlayMode ? '' : 'none';
    elOverlayWrap.style.display   = isComparison && state.overlayMode  ? '' : 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => redraw()));
}

export function setEditMode(val) {
    state.editMode = val;
    document.body.classList.toggle('edit-mode-active', val);
    _toggleButton(btnEditMode, val, 'Edit Mode: ON', 'Edit Mode: OFF');
    redraw();
}

export function setOverlayMode(val) {
    state.overlayMode = val;
    _toggleButton(btnOverlay, val, 'Overlay: ON', 'Overlay: OFF');
    elCompPanels.style.display  = !val ? '' : 'none';
    elOverlayWrap.style.display =  val ? '' : 'none';
    state.selection = null;
    requestAnimationFrame(() => requestAnimationFrame(() => redraw()));
}

// ── list ───────────────────────────────────────────────────────────────────────

export function renderImageList(onClickImage) {
    elImgCount.textContent = `${state.filteredImages.length} image(s)`;
    elImgList.innerHTML    = '';
    state.filteredImages.forEach((f, i) => {
        const div = document.createElement('div');
        div.className = 'item';
        if (i === state.currentIndex) div.classList.add('active');
        if (state.seenSet.has(f))     div.classList.add('seen');
        div.textContent = f;
        div.title       = f;
        div.addEventListener('click', () => { state.currentIndex = i; onClickImage(f); });
        elImgList.appendChild(div);
    });
}

export function updateListSelection() {
    _updateListItems((el, i) => el.classList.toggle('active', i === state.currentIndex));
}

export function updateListSeen() {
    _updateListItems((el, i) => el.classList.toggle('seen', state.seenSet.has(state.filteredImages[i])));
}

// ── info displays ──────────────────────────────────────────────────────────────

export const elFilename = document.getElementById('filename');

export function showLoadingBoxInfo() {
    elBoxInfo.textContent = '…';
}

export function showErrorBoxInfo(status, detail) {
    elBoxInfo.textContent = status === 500
        ? `${detail} — click "Clear Edits" to recover`
        : detail;
}

export function updateImageUI(data, isSyntheticCoco) {
    elExifBadge.style.display    = (data.exif_orientation ?? 1) !== 1 ? 'inline' : 'none';
    const pct                    = Math.round(state.seenSet.size / state.allImages.length * 100);
    elProgress.textContent       = `${state.seenSet.size} / ${state.allImages.length} seen (${pct}%)`;
    elBoxInfo.textContent        = `YOLO: ${data.yolo.length} | COCO: ${data.coco.length}${isSyntheticCoco ? ' (synth)' : ''}`;
    elCocoPanelTitle.textContent = isSyntheticCoco ? 'COCO (synthesized from YOLO)' : 'COCO annotations';
}

export function resetDatasetUI() {
    elFilename.textContent    = '—';
    elExifBadge.style.display = 'none';
    elBoxInfo.textContent     = '';
    elProgress.textContent    = '';
}

// ── dataset select ─────────────────────────────────────────────────────────────

export function populateDatasetSelect(datasets) {
    datasets.forEach(ds => {
        const opt       = document.createElement('option');
        opt.value       = ds.slug;
        opt.textContent = ds.name;
        elDataset.appendChild(opt);
    });
}

export function setDatasetSelectValue(slug) { elDataset.value = slug; }
