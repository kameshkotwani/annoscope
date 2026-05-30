import { MIN_DRAG_PX, GHOST_COLOR, STAGE_IDS, PALETTE } from './constants.js';
import { state } from './state.js';

// ── stage map ──────────────────────────────────────────────────────────────────
// stageMap[id] = { stage, imgLayer, annotLayer, fit: {ox,oy,bs,imgW,imgH}|null }
export const stageMap = {};

// Injected from app.js to avoid circular deps (renderer ↔ edits)
let _onGhostClick = () => {};
let _onDragEnd    = () => {};
export function setBoxCallbacks({ onGhostClick, onDragEnd }) {
    _onGhostClick = onGhostClick;
    _onDragEnd    = onDragEnd;
}

// ── coord helpers ──────────────────────────────────────────────────────────────

export function classColor(id) {
    return state.classColors[id] ?? PALETTE[id % PALETTE.length];
}

export function toKonvaPos(box, source, fit) {
    if (source === 'yolo') return {
        x: fit.ox + (box.cx - box.w / 2) * fit.imgW * fit.bs,
        y: fit.oy + (box.cy - box.h / 2) * fit.imgH * fit.bs,
        w: box.w * fit.imgW * fit.bs,
        h: box.h * fit.imgH * fit.bs,
    };
    return {
        x: fit.ox + box.x * fit.bs,
        y: fit.oy + box.y * fit.bs,
        w: box.w * fit.bs,
        h: box.h * fit.bs,
    };
}

export function getDeletedSets() {
    const yoloLines = new Set(state.currentEdits.filter(e => e.action === 'delete' && e.data.source === 'yolo').map(e => e.data.line_index));
    const annIds    = new Set(state.currentEdits.filter(e => e.action === 'delete' && e.data.source === 'coco').map(e => e.data.ann_id));
    return { yoloLines, annIds };
}

export function isBoxDeleted(box, source, yoloLines, annIds) {
    if (source === 'yolo') return yoloLines.has(box.line_index);
    return box._yolo_line_index !== undefined
        ? yoloLines.has(box._yolo_line_index)
        : annIds.has(box.ann_id);
}

export function synthesizeCocoFromYolo(yoloBoxes, imgW, imgH) {
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

const elTooltip = document.getElementById('tooltip');

export function showTooltip(nativeEvt, box, source) {
    const classId = source === 'yolo' ? box.class_id : box.category_id;
    const idStr   = source === 'yolo' ? `line ${box.line_index + 1}` : `ann_id ${box.ann_id}`;
    elTooltip.textContent   = `[${classId}] ${box.class_name}  (${idStr})`;
    elTooltip.style.display = 'block';
    elTooltip.style.left    = (nativeEvt.clientX + 14) + 'px';
    elTooltip.style.top     = (nativeEvt.clientY - 10) + 'px';
}

export function hideTooltip() { elTooltip.style.display = 'none'; }

// ── stage init + resize ────────────────────────────────────────────────────────

export function initStages() {
    STAGE_IDS.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        const stage      = new Konva.Stage({ container: id, width: 1, height: 1 });
        const imgLayer   = new Konva.Layer({ listening: false });
        const annotLayer = new Konva.Layer();
        stage.add(imgLayer);
        stage.add(annotLayer);
        stageMap[id] = { stage, imgLayer, annotLayer, fit: null };
        _attachStageEvents(id);
    });
}

export function resizeStages() {
    STAGE_IDS.forEach(id => {
        const entry = stageMap[id];
        if (!entry) return;
        const el = document.getElementById(id);
        if (!el) return;
        const w = el.clientWidth, h = el.clientHeight;
        if (w > 0 && h > 0) { entry.stage.width(w); entry.stage.height(h); }
    });
}

export function syncAllStageTransforms() {
    STAGE_IDS.forEach(id => {
        const entry = stageMap[id];
        if (!entry) return;
        entry.stage.position({ x: state.panX, y: state.panY });
        entry.stage.scale({ x: state.zoomLevel, y: state.zoomLevel });
        entry.stage.batchDraw();
    });
}

export function resetView() {
    state.zoomLevel = 1.0;
    state.panX      = 0;
    state.panY      = 0;
    syncAllStageTransforms();
}

// ── stage events ───────────────────────────────────────────────────────────────

function _attachStageEvents(stageId) {
    const { stage } = stageMap[stageId];

    stage.on('wheel', e => {
        e.evt.preventDefault();
        const rect   = stage.container().getBoundingClientRect();
        const mx     = e.evt.clientX - rect.left;
        const my     = e.evt.clientY - rect.top;
        const wx     = (mx - state.panX) / state.zoomLevel;
        const wy     = (my - state.panY) / state.zoomLevel;
        const factor = e.evt.deltaY < 0 ? 1.15 : 1 / 1.15;
        state.zoomLevel = Math.min(Math.max(state.zoomLevel * factor, 0.5), 20);
        state.panX      = mx - wx * state.zoomLevel;
        state.panY      = my - wy * state.zoomLevel;
        syncAllStageTransforms();
    });

    stage.on('mousedown', e => {
        if (e.target !== stage) return;
        state.isPanning = true;
        state.panMoved  = false;
        state.panStart  = { x: e.evt.clientX - state.panX, y: e.evt.clientY - state.panY };
        stage.container().style.cursor = 'grabbing';
    });

    stage.on('mousemove', e => {
        if (!state.isPanning) return;
        const dx = Math.abs(e.evt.clientX - (state.panStart.x + state.panX));
        const dy = Math.abs(e.evt.clientY - (state.panStart.y + state.panY));
        if (dx > MIN_DRAG_PX || dy > MIN_DRAG_PX) state.panMoved = true;
        if (state.panMoved) {
            state.panX = e.evt.clientX - state.panStart.x;
            state.panY = e.evt.clientY - state.panStart.y;
            syncAllStageTransforms();
        }
    });

    stage.on('mouseup', e => {
        const wasDrag   = state.panMoved;
        state.isPanning = false;
        state.panMoved  = false;
        stage.container().style.cursor = state.hovered ? 'pointer' : 'grab';
        if (!wasDrag && e.evt.button === 0 && !state.hovered) {
            state.selection = null;
            updateAllBoxSelections();
        }
    });

    stage.on('mouseleave', () => {
        state.isPanning = false;
        state.panMoved  = false;
        if (state.hovered) {
            const prev    = state.hovered;
            state.hovered = null;
            updateBoxVisual(prev.stageId, prev.source, prev.idx);
        }
        hideTooltip();
        stage.container().style.cursor = 'grab';
    });

    stage.container().style.cursor = 'grab';
}

// ── box node construction ──────────────────────────────────────────────────────

function _makeOutlineRect(w, h, dash) {
    return new Konva.Rect({
        x: 0, y: 0, width: w, height: h,
        stroke: 'rgba(0,0,0,0.55)', strokeWidth: 4, strokeScaleEnabled: false,
        fill: 'transparent', listening: false, ...(dash ? { dash } : {}),
    });
}

function _makeBoxRect(w, h, col, isDeleted) {
    const lw = w < 20 || h < 20 ? 3 : 2;
    return isDeleted
        ? new Konva.Rect({
            x: 0, y: 0, width: w, height: h,
            stroke: col, strokeWidth: lw, strokeScaleEnabled: false,
            dash: [6, 3], fill: 'rgba(255,255,255,0.1)', name: 'box-rect',
        })
        : new Konva.Rect({
            x: 0, y: 0, width: w, height: h,
            stroke: col, strokeWidth: lw, strokeScaleEnabled: false,
            fill: 'transparent', name: 'box-rect',
        });
}

function _attachBoxInteraction(rect, stageId, box, source, idx, isDeleted) {
    rect.on('mouseenter', e => {
        state.hovered = { stageId, source, idx };
        updateBoxVisual(stageId, source, idx);
        showTooltip(e.evt, box, source);
        stageMap[stageId].stage.container().style.cursor =
            state.editMode && !isDeleted ? 'move' : 'pointer';
    });
    rect.on('mousemove', e => showTooltip(e.evt, box, source));
    rect.on('mouseleave', () => {
        state.hovered = null;
        updateBoxVisual(stageId, source, idx);
        hideTooltip();
        stageMap[stageId].stage.container().style.cursor = state.isPanning ? 'grabbing' : 'grab';
    });
    rect.on('click', () => {
        if (!state.editMode) return;
        if (isDeleted) { _onGhostClick(box, source); return; }
        const sel = state.selection;
        state.selection = (sel?.stageId === stageId && sel.source === source && sel.idx === idx)
            ? null
            : { stageId, source, idx };
        updateAllBoxSelections();
    });
}

function _attachDragBehavior(group, stageId, box, source, idx, w, h) {
    group.draggable(true);

    group.dragBoundFunc(absPos => {
        const fit      = stageMap[stageId].fit;
        if (!fit) return absPos;
        const scale    = stageMap[stageId].stage.scaleX();
        const stagePos = stageMap[stageId].stage.position();
        const lx = (absPos.x - stagePos.x) / scale;
        const ly = (absPos.y - stagePos.y) / scale;
        const cx = Math.max(fit.ox, Math.min(lx, fit.ox + fit.imgW * fit.bs - w));
        const cy = Math.max(fit.oy, Math.min(ly, fit.oy + fit.imgH * fit.bs - h));
        return { x: cx * scale + stagePos.x, y: cy * scale + stagePos.y };
    });

    group.on('dragstart', () => {
        state.isPanning = false;
        state.panMoved  = false;
        hideTooltip();
        state.selection = { stageId, source, idx };
        updateAllBoxSelections();
        stageMap[stageId].stage.container().style.cursor = 'grabbing';
    });

    group.on('dragend', () => {
        state.isPanning = false;
        state.panMoved  = false;
        const fit = stageMap[stageId].fit;
        if (!fit || !state.currentFilename) return;
        stageMap[stageId].stage.container().style.cursor = 'move';
        const newCx = ((group.x() - fit.ox) / fit.bs + box.w * fit.imgW / 2) / fit.imgW;
        const newCy = ((group.y() - fit.oy) / fit.bs + box.h * fit.imgH / 2) / fit.imgH;
        _onDragEnd(box, newCx, newCy);
    });
}

function makeBoxGroup(stageId, box, source, idx, pos, isDeleted) {
    const { x, y, w, h } = pos;
    const col   = isDeleted ? GHOST_COLOR : classColor(source === 'yolo' ? box.class_id : box.category_id);
    const group = new Konva.Group({ x, y });
    group.setAttr('isGhost', isDeleted);
    group.setAttr('_source', source);
    group.setAttr('_idx',    idx);

    group.add(_makeOutlineRect(w, h, isDeleted ? [6, 3] : null));
    const rect = _makeBoxRect(w, h, col, isDeleted);
    group.add(rect);

    if (isDeleted) {
        group.add(new Konva.Text({
            x: 4, y: 4, text: '✕', fontSize: 12,
            fontFamily: 'Inter, sans-serif', fill: '#fff', listening: false,
        }));
    }

    _attachBoxInteraction(rect, stageId, box, source, idx, isDeleted);

    if (state.editMode && !isDeleted && source === 'yolo' && stageId === 'stage-yolo-source') {
        _attachDragBehavior(group, stageId, box, source, idx, w, h);
    }

    return group;
}

// ── box visual update ──────────────────────────────────────────────────────────

export function updateBoxVisual(stageId, source, idx) {
    const entry = stageMap[stageId];
    if (!entry) return;
    // KISS: store source+idx as attrs, no string parsing
    const group = entry.annotLayer.find('Group').find(
        g => g.getAttr('_source') === source && g.getAttr('_idx') === idx
    );
    if (!group) return;

    const isSelected = state.selection?.stageId === stageId && state.selection.source === source && state.selection.idx === idx;
    const isHovered  = state.hovered?.stageId   === stageId && state.hovered.source  === source && state.hovered.idx  === idx;
    const rect       = group.findOne('.box-rect');
    if (!rect) return;

    if (group.getAttr('isGhost')) {
        rect.stroke(isSelected ? '#fff' : GHOST_COLOR);
        rect.strokeWidth(isSelected ? 3 : 1.5);
    } else {
        const box = source === 'yolo' ? state.currentYolo[idx] : state.currentCoco[idx];
        if (!box) return;
        const col = classColor(source === 'yolo' ? box.class_id : box.category_id);
        const lw  = rect.width() < 20 || rect.height() < 20 ? 2.5 : 1.5;

        if (isSelected) {
            rect.stroke('#fff'); rect.strokeWidth(lw + 1.5); rect.dash([5, 3]); rect.fill('rgba(255,255,255,0.08)');
        } else if (isHovered) {
            rect.stroke(col);   rect.strokeWidth(lw);        rect.dash([]);     rect.fill(col + '80');
        } else {
            rect.stroke(col);   rect.strokeWidth(lw);        rect.dash([]);     rect.fill('transparent');
        }
    }

    entry.annotLayer.batchDraw();
}

export function updateAllBoxSelections() {
    STAGE_IDS.forEach(id => {
        const entry = stageMap[id];
        if (!entry) return;
        entry.annotLayer.find('Group').forEach(group => {
            const source = group.getAttr('_source');
            const idx    = group.getAttr('_idx');
            if (source === undefined || idx === undefined) return;
            updateBoxVisual(id, source, idx);
        });
    });
}

// ── render boxes ───────────────────────────────────────────────────────────────

export function renderBoxNodes(stageId, boxes, source, allowGhosts) {
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
        annotLayer.add(group);
    });

    annotLayer.batchDraw();
}

export function renderOverlayNodes(stageId, yoloBoxes, cocoBoxes) {
    const entry = stageMap[stageId];
    if (!entry || !entry.fit) return;
    const { annotLayer, fit } = entry;

    annotLayer.destroyChildren();
    const { yoloLines, annIds } = getDeletedSets();

    yoloBoxes.forEach((box, idx) => {
        if (yoloLines.has(box.line_index)) return;
        const pos   = toKonvaPos(box, 'yolo', fit);
        const group = makeBoxGroup(stageId, box, 'yolo', idx, pos, false);
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

const _imgCache = new Map();

function _loadImg(src, callback) {
    if (_imgCache.has(src)) { callback(_imgCache.get(src)); return; }
    const img = new window.Image();
    img.onload = () => {
        if (_imgCache.size >= 30) _imgCache.delete(_imgCache.keys().next().value);
        _imgCache.set(src, img);
        callback(img);
    };
    img.src = src;
}

export function setStageImage(stageId, src, imgW, imgH) {
    return new Promise(resolve => {
        const entry = stageMap[stageId];
        if (!entry) { resolve(); return; }
        const { stage, imgLayer } = entry;

        const oldImg = imgLayer.findOne('Image');
        if (oldImg) oldImg.destroy();

        if (!src || !imgW || !imgH) { imgLayer.batchDraw(); resolve(); return; }

        const sw = stage.width(), sh = stage.height();
        if (sw <= 0 || sh <= 0) { resolve(); return; }

        const bs = Math.min(sw / imgW, sh / imgH);
        const ox = (sw - imgW * bs) / 2;
        const oy = (sh - imgH * bs) / 2;
        entry.fit = { ox, oy, bs, imgW, imgH };

        _loadImg(src, htmlImg => {
            imgLayer.add(new Konva.Image({
                x: ox, y: oy, width: imgW * bs, height: imgH * bs,
                image: htmlImg, listening: false,
            }));
            imgLayer.batchDraw();
            resolve();
        });
    });
}

// ── redraw ─────────────────────────────────────────────────────────────────────

let _redrawGen = 0;

export async function redraw() {
    if (!state.currentImgSrc) return;
    const gen = ++_redrawGen;
    const stale = () => gen !== _redrawGen;

    resizeStages();
    const { currentImgSrc: src, currentImgWidth: w, currentImgHeight: h } = state;

    if (state.activeTab === 'viewer') {
        await setStageImage('stage-yolo-source', src, w, h);
        if (stale()) return;
        renderBoxNodes('stage-yolo-source', state.currentYolo, 'yolo', true);
        await setStageImage('stage-yolo-final', src, w, h);
        if (stale()) return;
        renderBoxNodes('stage-yolo-final', state.currentYolo, 'yolo', false);
    } else if (state.activeTab === 'comparison') {
        if (state.overlayMode) {
            await setStageImage('stage-overlay', src, w, h);
            if (stale()) return;
            renderOverlayNodes('stage-overlay', state.currentYolo, state.currentCoco);
        } else {
            await setStageImage('stage-comp-yolo', src, w, h);
            if (stale()) return;
            renderBoxNodes('stage-comp-yolo', state.currentYolo, 'yolo', true);
            await setStageImage('stage-comp-coco', src, w, h);
            if (stale()) return;
            renderBoxNodes('stage-comp-coco', state.currentCoco, 'coco', false);
        }
    }
}
