import { initStages, setBoxCallbacks, updateAllBoxSelections, hideTooltip, resetView, redraw } from './modules/renderer.js';
import { setTab, setEditMode, setOverlayMode, populateDatasetSelect, setDatasetSelectValue } from './modules/ui.js';
import { applyInitialState, applyFilter, navigate, switchDataset } from './modules/loader.js';
import { deleteSelection, clearCurrentEdits, restoreBoxEdit, moveBox } from './modules/edits.js';
import { fetchDatasets, fetchImages } from './modules/api.js';
import { state } from './modules/state.js';

// ── init ───────────────────────────────────────────────────────────────────────

async function init() {
    initStages();
    setBoxCallbacks({ onGhostClick: restoreBoxEdit, onDragEnd: moveBox });
    setTab('viewer');
    try {
        populateDatasetSelect(await fetchDatasets());
        const data = await fetchImages();
        setDatasetSelectValue(data.slug);
        applyInitialState(data);
    } catch (err) {
        console.error('Failed to initialize app:', err);
        document.getElementById('filename').textContent = 'Failed to load — check server';
    }
}

// ── event wiring ───────────────────────────────────────────────────────────────

document.getElementById('dataset-select').onchange = e => switchDataset(e.target.value);
document.getElementById('btn-prev').onclick        = () => navigate(-1);
document.getElementById('btn-next').onclick        = () => navigate(+1);
document.getElementById('btn-clear-edits').onclick = clearCurrentEdits;
document.getElementById('search').oninput          = e => {
    state.searchTerm  = e.target.value;
    state.currentIndex = 0;
    applyFilter();
};
document.getElementById('btn-edit-mode').onclick = () => {
    setEditMode(!state.editMode);
    state.selection = null;
    updateAllBoxSelections();
};
document.getElementById('btn-overlay').onclick = () => setOverlayMode(!state.overlayMode);
document.querySelectorAll('.tab').forEach(btn => {
    btn.onclick = () => setTab(btn.dataset.tab);
});

document.addEventListener('keydown', e => {
    if (e.target === document.getElementById('search')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigate(+1); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); navigate(-1); }
    if (e.key === 'e' || e.key === 'E') { setEditMode(!state.editMode); state.selection = null; updateAllBoxSelections(); }
    if (e.key === 'r' || e.key === 'R') resetView();
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
    if (e.key === 'Escape') { state.selection = null; state.hovered = null; hideTooltip(); updateAllBoxSelections(); }
});

window.addEventListener('resize', () => redraw());

init();
