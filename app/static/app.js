// ── constants ──────────────────────────────────────────────────────────────────

const CLASS_COLORS  = { 0: '#E63946', 1: '#2bd82b', 2: '#f4a261', 3: '#a8dadc', 4: '#c084fc' };
const DEFAULT_COLOR = '#aaaaaa';
const MIN_DRAG_PX   = 4;
const GHOST_COLOR   = 'rgba(255,255,255,0.6)';

// ── state ──────────────────────────────────────────────────────────────────────

let overlayMode    = false;
let editMode       = false;
let activeTab      = 'viewer';
let activeSlug     = '';
let allImages      = [];
let seenSet        = new Set();
let filteredImages = [];
let currentIndex   = 0;
let searchTerm     = '';

let zoomLevel = 1.0;
let panX = 0, panY = 0;
let isPanning = false;
let panStart  = { x: 0, y: 0 };
let panMoved  = false;

let currentFilename   = null;
let currentImgSrc     = null;
let currentImgWidth   = 0;
let currentImgHeight  = 0;
let currentExifOrient = 1;
let currentYolo       = [];
let currentCoco       = [];
let isSyntheticCoco   = false;
let currentEdits      = [];

let selection = null;  // { stageId, source, idx }
let hovered   = null;  // { stageId, source, idx }

// ── DOM refs ───────────────────────────────────────────────────────────────────

const elDataset        = document.getElementById('dataset-select');
const elSearch         = document.getElementById('search');
const btnPrev          = document.getElementById('btn-prev');
const btnNext          = document.getElementById('btn-next');
const btnClearEdits    = document.getElementById('btn-clear-edits');
const btnEditMode      = document.getElementById('btn-edit-mode');
const btnOverlay       = document.getElementById('btn-overlay');
const elTooltip        = document.getElementById('tooltip');
const elFilename       = document.getElementById('filename');
const elBoxInfo        = document.getElementById('box-info');
const elProgress       = document.getElementById('progress');
const elImgCount       = document.getElementById('img-count');
const elImgList        = document.getElementById('img-list');
const elViewerPanels   = document.getElementById('viewer-panels');
const elCompPanels     = document.getElementById('comparison-panels');
const elOverlayWrap    = document.getElementById('overlay-panel-wrap');
const elCocoPanelTitle = document.getElementById('coco-panel-title');

// ── Konva stages ───────────────────────────────────────────────────────────────

// stageMap[stageId] = { stage, imgLayer, annotLayer, fit: {ox,oy,bs,imgW,imgH} | null }
const stageMap  = {};
const STAGE_IDS = ['stage-yolo-source', 'stage-yolo-final', 'stage-overlay', 'stage-comp-yolo', 'stage-comp-coco'];

function initStages() {
    STAGE_IDS.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        const stage      = new Konva.Stage({ container: id, width: 1, height: 1 });
        const imgLayer   = new Konva.Layer({ listening: false });
        const annotLayer = new Konva.Layer();
        stage.add(imgLayer);
        stage.add(annotLayer);
        stageMap[id] = { stage, imgLayer, annotLayer, fit: null };
        attachStageEvents(id);
    });
}

function resizeStages() {
    STAGE_IDS.forEach(id => {
        const entry = stageMap[id];
        if (!entry) return;
        const el = document.getElementById(id);
        if (!el) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w > 0 && h > 0) {
            entry.stage.width(w);
            entry.stage.height(h);
        }
    });
}

// ── stage events ───────────────────────────────────────────────────────────────

function attachStageEvents(stageId) {
    const { stage } = stageMap[stageId];

    stage.on('wheel', e => {
        e.evt.preventDefault();
        const rect   = stage.container().getBoundingClientRect();
        const mx     = e.evt.clientX - rect.left;
        const my     = e.evt.clientY - rect.top;
        const wx     = (mx - panX) / zoomLevel;
        const wy     = (my - panY) / zoomLevel;
        const factor = e.evt.deltaY < 0 ? 1.15 : 1 / 1.15;
        zoomLevel    = Math.min(Math.max(zoomLevel * factor, 0.5), 20);
        panX         = mx - wx * zoomLevel;
        panY         = my - wy * zoomLevel;
        syncAllStageTransforms();
    });

    stage.on('mousedown', e => {
        if (e.target !== stage) return;
        isPanning = true;
        panMoved  = false;
        panStart  = { x: e.evt.clientX - panX, y: e.evt.clientY - panY };
        stage.container().style.cursor = 'grabbing';
    });

    stage.on('mousemove', e => {
        if (!isPanning) return;
        const dx = Math.abs(e.evt.clientX - (panStart.x + panX));
        const dy = Math.abs(e.evt.clientY - (panStart.y + panY));
        if (dx > MIN_DRAG_PX || dy > MIN_DRAG_PX) panMoved = true;
        if (panMoved) {
            panX = e.evt.clientX - panStart.x;
            panY = e.evt.clientY - panStart.y;
            syncAllStageTransforms();
        }
    });

    stage.on('mouseup', e => {
        const wasDrag = panMoved;
        isPanning = false;
        panMoved  = false;
        stage.container().style.cursor = hovered ? 'pointer' : 'grab';
        if (!wasDrag && e.evt.button === 0 && !hovered) {
            selection = null;
            updateAllBoxSelections();
        }
    });

    stage.on('mouseleave', () => {
        isPanning = false;
        panMoved  = false;
        if (hovered) {
            const prev = hovered;
            hovered = null;
            updateBoxVisual(prev.stageId, prev.source, prev.idx);
        }
        hideTooltip();
        stage.container().style.cursor = 'grab';
    });

    stage.on('dblclick', () => resetView());
    stage.container().style.cursor = 'grab';
}

function syncAllStageTransforms() {
    STAGE_IDS.forEach(id => {
        const entry = stageMap[id];
        if (!entry) return;
        entry.stage.position({ x: panX, y: panY });
        entry.stage.scale({ x: zoomLevel, y: zoomLevel });
        entry.stage.batchDraw();
    });
}

// ── coordinate helpers ─────────────────────────────────────────────────────────

function classColor(id) { return CLASS_COLORS[id] ?? DEFAULT_COLOR; }

function toKonvaPos(box, source, fit) {
    if (source === 'yolo') {
        return {
            x: fit.ox + (box.cx - box.w / 2) * fit.imgW * fit.bs,
            y: fit.oy + (box.cy - box.h / 2) * fit.imgH * fit.bs,
            w: box.w * fit.imgW * fit.bs,
            h: box.h * fit.imgH * fit.bs,
        };
    }
    return {
        x: fit.ox + box.x * fit.bs,
        y: fit.oy + box.y * fit.bs,
        w: box.w * fit.bs,
        h: box.h * fit.bs,
    };
}

function getDeletedSets() {
    const yoloLines = new Set(currentEdits.filter(e => e.action === 'delete' && e.data.source === 'yolo').map(e => e.data.line_index));
    const annIds    = new Set(currentEdits.filter(e => e.action === 'delete' && e.data.source === 'coco').map(e => e.data.ann_id));
    return { yoloLines, annIds };
}

function isBoxDeleted(box, source, yoloLines, annIds) {
    if (source === 'yolo') return yoloLines.has(box.line_index);
    return box._yolo_line_index !== undefined
        ? yoloLines.has(box._yolo_line_index)
        : annIds.has(box.ann_id);
}

// ── COCO synthesis ─────────────────────────────────────────────────────────────

function synthesizeCocoFromYolo(yoloBoxes, imgW, imgH) {
    return yoloBoxes.map((box, i) => ({
        ann_id:           -(i + 1),
        category_id:      box.class_id,
        class_name:       box.class_name,
        x: (box.cx - box.w / 2) * imgW,
        y: (box.cy - box.h / 2) * imgH,
        w: box.w * imgW,
        h: box.h * imgH,
        _yolo_line_index: box.line_index,
    }));
}

// ── tooltip ────────────────────────────────────────────────────────────────────

function showTooltip(nativeEvt, box, source) {
    const classId = source === 'yolo' ? box.class_id : box.category_id;
    const idStr   = source === 'yolo' ? `line ${box.line_index + 1}` : `ann_id ${box.ann_id}`;
    elTooltip.textContent   = `[${classId}] ${box.class_name}  (${idStr})`;
    elTooltip.style.display = 'block';
    elTooltip.style.left    = (nativeEvt.clientX + 14) + 'px';
    elTooltip.style.top     = (nativeEvt.clientY - 10) + 'px';
}

function hideTooltip() { elTooltip.style.display = 'none'; }

// ── Konva box nodes ────────────────────────────────────────────────────────────

function makeBoxGroup(stageId, box, source, idx, pos, isDeleted) {
    const { x, y, w, h } = pos;
    const col = isDeleted ? GHOST_COLOR : classColor(source === 'yolo' ? box.class_id : box.category_id);
    const lw  = w < 20 || h < 20 ? 2.5 : 1.5;

    const group = new Konva.Group({ x, y });
    group.setAttr('isGhost', isDeleted);

    if (isDeleted) {
        const rect = new Konva.Rect({
            x: 0, y: 0, width: w, height: h,
            stroke: col, strokeWidth: lw, strokeScaleEnabled: false,
            dash: [6, 3], fill: 'rgba(255,255,255,0.1)', name: 'box-rect',
        });
        const mark = new Konva.Text({
            x: 4, y: 4, text: '✕', fontSize: 12,
            fontFamily: 'Inter, sans-serif', fill: '#fff', listening: false,
        });
        group.add(rect, mark);
    } else {
        const rect = new Konva.Rect({
            x: 0, y: 0, width: w, height: h,
            stroke: col, strokeWidth: lw, strokeScaleEnabled: false,
            fill: 'transparent', name: 'box-rect',
        });
        group.add(rect);
    }

    const rect = group.findOne('.box-rect');
    rect.on('mouseenter', e => {
        hovered = { stageId, source, idx };
        updateBoxVisual(stageId, source, idx);
        showTooltip(e.evt, box, source);
        stageMap[stageId].stage.container().style.cursor = 'pointer';
    });
    rect.on('mousemove', e => { showTooltip(e.evt, box, source); });
    rect.on('mouseleave', () => {
        hovered = null;
        updateBoxVisual(stageId, source, idx);
        hideTooltip();
        stageMap[stageId].stage.container().style.cursor = isPanning ? 'grabbing' : 'grab';
    });
    rect.on('click', () => {
        if (!editMode) return;
        if (isDeleted) { restoreBoxEdit(box, source); return; }
        if (selection?.stageId === stageId && selection.source === source && selection.idx === idx) {
            selection = null;
        } else {
            selection = { stageId, source, idx };
        }
        updateAllBoxSelections();
    });

    return group;
}

function updateBoxVisual(stageId, source, idx) {
    const entry = stageMap[stageId];
    if (!entry) return;
    const group = entry.annotLayer.find('Group').find(g => g.getAttr('boxKey') === `${source}|${idx}`);
    if (!group) return;

    const isSelected = selection?.stageId === stageId && selection.source === source && selection.idx === idx;
    const isHovered  = hovered?.stageId   === stageId && hovered.source  === source && hovered.idx  === idx;
    const rect       = group.findOne('.box-rect');
    if (!rect) return;

    if (group.getAttr('isGhost')) {
        rect.stroke(isSelected ? '#fff' : GHOST_COLOR);
        rect.strokeWidth(isSelected ? 3 : 1.5);
    } else {
        const box = source === 'yolo' ? currentYolo[idx] : currentCoco[idx];
        if (!box) return;
        const col = classColor(source === 'yolo' ? box.class_id : box.category_id);
        const lw  = rect.width() < 20 || rect.height() < 20 ? 2.5 : 1.5;

        if (isSelected) {
            rect.stroke('#fff');
            rect.strokeWidth(lw + 1.5);
            rect.dash([5, 3]);
            rect.fill('rgba(255,255,255,0.08)');
        } else if (isHovered) {
            rect.stroke(col);
            rect.strokeWidth(lw);
            rect.dash([]);
            rect.fill(col + '28');
        } else {
            rect.stroke(col);
            rect.strokeWidth(lw);
            rect.dash([]);
            rect.fill('transparent');
        }

    }

    entry.annotLayer.batchDraw();
}

function updateAllBoxSelections() {
    STAGE_IDS.forEach(id => {
        const entry = stageMap[id];
        if (!entry) return;
        entry.annotLayer.find('Group').forEach(group => {
            const key = group.getAttr('boxKey');
            if (!key) return;
            const sep = key.indexOf('|');
            const src = key.slice(0, sep);
            const idx = parseInt(key.slice(sep + 1));
            updateBoxVisual(id, src, idx);
        });
    });
}

// ── render boxes ───────────────────────────────────────────────────────────────

function renderBoxNodes(stageId, boxes, source, allowGhosts) {
    const entry = stageMap[stageId];
    if (!entry || !entry.fit) return;
    const { annotLayer, fit } = entry;

    annotLayer.destroyChildren();
    const { yoloLines, annIds } = getDeletedSets();

    boxes.forEach((box, idx) => {
        const isDeleted = isBoxDeleted(box, source, yoloLines, annIds);
        if (isDeleted && !allowGhosts) return;
        const pos   = toKonvaPos(box, source, fit);
        const group = makeBoxGroup(stageId, box, source, idx, pos, isDeleted);
        group.setAttr('boxKey', `${source}|${idx}`);
        annotLayer.add(group);
    });

    annotLayer.batchDraw();
}

function renderOverlayNodes(stageId, yoloBoxes, cocoBoxes) {
    const entry = stageMap[stageId];
    if (!entry || !entry.fit) return;
    const { annotLayer, fit } = entry;

    annotLayer.destroyChildren();
    const { yoloLines, annIds } = getDeletedSets();

    yoloBoxes.forEach((box, idx) => {
        if (yoloLines.has(box.line_index)) return;
        const pos   = toKonvaPos(box, 'yolo', fit);
        const group = makeBoxGroup(stageId, box, 'yolo', idx, pos, false);
        group.setAttr('boxKey', `yolo|${idx}`);
        annotLayer.add(group);
    });

    cocoBoxes.forEach(box => {
        if (annIds.has(box.ann_id)) return;
        const pos = toKonvaPos(box, 'coco', fit);
        annotLayer.add(new Konva.Rect({
            x: pos.x, y: pos.y, width: pos.w, height: pos.h,
            stroke: '#ffffff88', strokeWidth: 1.5, strokeScaleEnabled: false,
            dash: [6, 4], fill: 'transparent', listening: false,
        }));
    });

    annotLayer.batchDraw();
}

// ── image cache + stage image ──────────────────────────────────────────────────

const _htmlImgCache = new Map();

function _loadImg(src, callback) {
    if (_htmlImgCache.has(src)) { callback(_htmlImgCache.get(src)); return; }
    const img = new window.Image();
    img.onload = () => {
        if (_htmlImgCache.size >= 30) _htmlImgCache.delete(_htmlImgCache.keys().next().value);
        _htmlImgCache.set(src, img);
        callback(img);
    };
    img.src = src;
}

function setStageImage(stageId, src, imgW, imgH, callback) {
    const entry = stageMap[stageId];
    if (!entry) { if (callback) callback(); return; }
    const { stage, imgLayer } = entry;

    const oldImg = imgLayer.findOne('Image');
    if (oldImg) oldImg.destroy();

    if (!src || !imgW || !imgH) { imgLayer.batchDraw(); if (callback) callback(); return; }

    const sw = stage.width();
    const sh = stage.height();
    if (sw <= 0 || sh <= 0) { if (callback) callback(); return; }

    const bs = Math.min(sw / imgW, sh / imgH);
    const ox = (sw - imgW * bs) / 2;
    const oy = (sh - imgH * bs) / 2;
    entry.fit = { ox, oy, bs, imgW, imgH };

    _loadImg(src, htmlImg => {
        const konvaImg = new Konva.Image({
            x: ox, y: oy, width: imgW * bs, height: imgH * bs,
            image: htmlImg, listening: false,
        });
        imgLayer.add(konvaImg);
        imgLayer.batchDraw();
        if (callback) callback();
    });
}

// ── redraw ─────────────────────────────────────────────────────────────────────

function redraw() {
    if (!currentImgSrc) return;
    resizeStages();

    if (activeTab === 'viewer') {
        setStageImage('stage-yolo-source', currentImgSrc, currentImgWidth, currentImgHeight, () => {
            renderBoxNodes('stage-yolo-source', currentYolo, 'yolo', true);
        });
        setStageImage('stage-yolo-final', currentImgSrc, currentImgWidth, currentImgHeight, () => {
            renderBoxNodes('stage-yolo-final', currentYolo, 'yolo', false);
        });
    } else if (activeTab === 'comparison') {
        if (overlayMode) {
            setStageImage('stage-overlay', currentImgSrc, currentImgWidth, currentImgHeight, () => {
                renderOverlayNodes('stage-overlay', currentYolo, currentCoco);
            });
        } else {
            setStageImage('stage-comp-yolo', currentImgSrc, currentImgWidth, currentImgHeight, () => {
                renderBoxNodes('stage-comp-yolo', currentYolo, 'yolo', true);
            });
            setStageImage('stage-comp-coco', currentImgSrc, currentImgWidth, currentImgHeight, () => {
                renderBoxNodes('stage-comp-coco', currentCoco, 'coco', false);
            });
        }
    }
}

// ── reset view ─────────────────────────────────────────────────────────────────

function resetView() {
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    syncAllStageTransforms();
}

// ── UI update helpers ─────────────────────────────────────────────────────────

function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const isViewer     = tab === 'viewer';
    const isComparison = tab === 'comparison';
    btnEditMode.style.display   = isViewer     ? '' : 'none';
    btnClearEdits.style.display = isViewer     ? '' : 'none';
    btnOverlay.style.display    = isComparison ? '' : 'none';
    elViewerPanels.style.display  = isViewer                     ? '' : 'none';
    elCompPanels.style.display    = isComparison && !overlayMode ? '' : 'none';
    elOverlayWrap.style.display   = isComparison && overlayMode  ? '' : 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => redraw()));
}

function setEditMode(val) {
    editMode = val;
    document.body.classList.toggle('edit-mode-active', editMode);
    btnEditMode.classList.toggle('active', editMode);
    btnEditMode.textContent = editMode ? 'Edit Mode: ON' : 'Edit Mode: OFF';
}

function setOverlayMode(val) {
    overlayMode = val;
    btnOverlay.classList.toggle('active', overlayMode);
    btnOverlay.textContent = overlayMode ? 'Overlay: ON' : 'Overlay: OFF';
    elCompPanels.style.display  = !overlayMode ? '' : 'none';
    elOverlayWrap.style.display =  overlayMode ? '' : 'none';
    selection = null;
    requestAnimationFrame(() => requestAnimationFrame(() => redraw()));
}

function renderImageList() {
    elImgCount.textContent = `${filteredImages.length} image(s)`;
    elImgList.innerHTML = '';
    filteredImages.forEach((f, i) => {
        const div = document.createElement('div');
        div.className = 'item';
        if (i === currentIndex) div.classList.add('active');
        if (seenSet.has(f))     div.classList.add('seen');
        div.textContent = f;
        div.title = f;
        div.addEventListener('click', () => { currentIndex = i; loadImage(f); });
        elImgList.appendChild(div);
    });
}

function updateListSelection() {
    elImgList.querySelectorAll('.item').forEach((el, i) => {
        el.classList.toggle('active', i === currentIndex);
    });
}

function updateListSeen() {
    elImgList.querySelectorAll('.item').forEach((el, i) => {
        el.classList.toggle('seen', seenSet.has(filteredImages[i]));
    });
}

// ── image state ────────────────────────────────────────────────────────────────

function resetImageState() {
    currentImgSrc     = null;
    currentFilename   = null;
    currentImgWidth   = 0;
    currentImgHeight  = 0;
    currentExifOrient = 1;
    currentYolo       = [];
    currentCoco       = [];
    isSyntheticCoco   = false;
    allImages         = [];
    filteredImages    = [];
    seenSet           = new Set();
    currentIndex      = 0;
    selection         = null;
    hovered           = null;
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

// ── list ──────────────────────────────────────────────────────────────────────

function applyFilter() {
    const term = searchTerm.toLowerCase();
    filteredImages = term ? allImages.filter(f => f.toLowerCase().includes(term)) : allImages.slice();
    currentIndex   = Math.min(currentIndex, Math.max(0, filteredImages.length - 1));
    renderImageList();
    const next = filteredImages[currentIndex];
    if (next && next !== currentFilename) loadImage(next);
}

// ── load image ────────────────────────────────────────────────────────────────

async function loadImage(filename) {
    if (filename === currentFilename) return;
    currentFilename = filename;
    selection = null;
    hovered   = null;
    hideTooltip();
    elFilename.textContent = filename;
    elBoxInfo.textContent  = '…';

    let data;
    try {
        const res = await fetch(`/api/annotations/${encodeURIComponent(filename)}`);
        if (!res.ok) { elBoxInfo.textContent = `Error ${res.status} loading annotations`; return; }
        data = await res.json();
    } catch (err) {
        elBoxInfo.textContent = 'Network error loading annotations';
        return;
    }

    currentImgWidth   = data.width;
    currentImgHeight  = data.height;
    currentExifOrient = data.exif_orientation ?? 1;
    currentYolo       = data.yolo;
    currentEdits      = data.edits || [];

    if (data.has_coco_file) {
        currentCoco     = data.coco;
        isSyntheticCoco = false;
    } else if (data.yolo.length > 0 && data.width > 0) {
        currentCoco     = synthesizeCocoFromYolo(data.yolo, data.width, data.height);
        isSyntheticCoco = true;
    } else {
        currentCoco     = [];
        isSyntheticCoco = false;
    }

    seenSet.add(filename);
    const pct = Math.round(seenSet.size / allImages.length * 100);
    elProgress.textContent       = `${seenSet.size} / ${allImages.length} seen (${pct}%)`;
    elBoxInfo.textContent        = `YOLO: ${data.yolo.length} | COCO: ${data.coco.length}${isSyntheticCoco ? ' (synth)' : ''}`;
    elCocoPanelTitle.textContent = isSyntheticCoco ? 'COCO (synthesized from YOLO)' : 'COCO annotations';
    updateListSeen();

    currentImgSrc = `/imgs/${activeSlug}/${encodeURIComponent(filename)}`;
    resetView();
    redraw();
}

// ── navigation ────────────────────────────────────────────────────────────────

function navigate(delta) {
    if (!filteredImages.length) return;
    currentIndex    = (currentIndex + delta + filteredImages.length) % filteredImages.length;
    currentFilename = null;
    updateListSelection();
    loadImage(filteredImages[currentIndex]);
}

// ── dataset ───────────────────────────────────────────────────────────────────

function applyInitialState(data) {
    activeSlug   = data.slug;
    allImages    = data.images;
    seenSet      = new Set(data.seen);
    currentIndex = data.last_seen_index ?? 0;
    applyFilter();
}

async function switchDataset(slug) {
    resetImageState();
    elFilename.textContent = '—';
    elBoxInfo.textContent  = '';
    elProgress.textContent = '';
    try {
        const res = await fetch(`/api/switch/${slug}`, { method: 'POST' });
        if (!res.ok) { elFilename.textContent = `Error switching dataset (${res.status})`; return; }
        applyInitialState(await res.json());
    } catch (err) {
        elFilename.textContent = 'Network error switching dataset';
    }
}

// ── init ──────────────────────────────────────────────────────────────────────

async function init() {
    initStages();
    setTab('viewer');
    try {
        const dsRes    = await fetch('/api/datasets');
        const datasets = await dsRes.json();
        datasets.forEach(ds => {
            const opt       = document.createElement('option');
            opt.value       = ds.slug;
            opt.textContent = ds.name;
            elDataset.appendChild(opt);
        });

        const res  = await fetch('/api/images');
        const data = await res.json();
        elDataset.value = data.slug;
        applyInitialState(data);
    } catch (err) {
        console.error('Failed to initialize app:', err);
        elFilename.textContent = 'Failed to load — check server';
    }
}

// ── edit operations ───────────────────────────────────────────────────────────

async function deleteSelection() {
    if (!editMode || !selection || !currentFilename) return;

    const { source, idx } = selection;
    const box = source === 'yolo' ? currentYolo[idx] : currentCoco[idx];

    const existingEdit = currentEdits.find(e => {
        if (e.action !== 'delete' || e.data.source !== source) return false;
        return source === 'yolo' ? e.data.line_index === box.line_index : e.data.ann_id === box.ann_id;
    });

    if (existingEdit) return restoreEdit(existingEdit.id);

    const payload = { action: 'delete', data: { source } };
    if (source === 'yolo') payload.data.line_index = box.line_index;
    else payload.data.ann_id = box.ann_id;

    currentEdits.push(payload);
    selection = null;
    redraw();

    try {
        const res = await fetch(`/api/edit/${encodeURIComponent(currentFilename)}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) { currentEdits = data.edits; redraw(); }
    } catch (err) {
        console.error('Failed to delete box:', err);
        currentEdits.pop();
        redraw();
    }
}

async function restoreBoxEdit(box, source) {
    if (!currentFilename) return;
    const existingEdit = currentEdits.find(e => {
        if (e.action !== 'delete' || e.data.source !== source) return false;
        return source === 'yolo' ? e.data.line_index === box.line_index : e.data.ann_id === box.ann_id;
    });
    if (existingEdit) await restoreEdit(existingEdit.id);
}

async function restoreEdit(editId) {
    if (!currentFilename) return;
    try {
        const res  = await fetch(`/api/edit/${encodeURIComponent(currentFilename)}/${editId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) { currentEdits = data.edits; selection = null; redraw(); }
    } catch (err) {
        console.error('Failed to restore edit:', err);
    }
}

async function clearCurrentEdits() {
    if (!currentFilename) return;
    if (!confirm('Are you sure you want to revert all changes for this image?')) return;
    try {
        const res  = await fetch(`/api/edit/${encodeURIComponent(currentFilename)}/clear`, { method: 'POST' });
        const data = await res.json();
        if (data.ok) { currentEdits = []; selection = null; redraw(); }
    } catch (err) {
        console.error('Failed to clear edits:', err);
    }
}

// ── event wiring ──────────────────────────────────────────────────────────────

elDataset.onchange    = e => switchDataset(e.target.value);
btnPrev.onclick       = () => navigate(-1);
btnNext.onclick       = () => navigate(+1);
btnClearEdits.onclick = clearCurrentEdits;
elSearch.oninput      = e => { searchTerm = e.target.value; currentIndex = 0; applyFilter(); };
btnEditMode.onclick   = () => { setEditMode(!editMode); selection = null; updateAllBoxSelections(); };
btnOverlay.onclick    = () => setOverlayMode(!overlayMode);
document.querySelectorAll('.tab').forEach(btn => {
    btn.onclick = () => setTab(btn.dataset.tab);
});

document.addEventListener('keydown', e => {
    if (e.target === elSearch) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigate(+1); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); navigate(-1); }
    if (e.key === 'e' || e.key === 'E') {
        setEditMode(!editMode);
        selection = null;
        updateAllBoxSelections();
    }
    if (e.key === 'r' || e.key === 'R') resetView();
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
    if (e.key === 'Escape') { selection = null; hovered = null; hideTooltip(); updateAllBoxSelections(); }
});

window.addEventListener('resize', () => redraw());

init();
