export const state = {
    overlayMode:      false,
    editMode:         false,
    activeTab:        'viewer',
    activeSlug:       '',
    allImages:        [],
    seenSet:          new Set(),
    filteredImages:   [],
    currentIndex:     0,
    searchTerm:       '',

    zoomLevel:  1.0,
    panX:       0,
    panY:       0,
    isPanning:  false,
    panStart:   { x: 0, y: 0 },
    panMoved:   false,

    currentFilename:   null,
    currentImgSrc:     null,
    currentImgWidth:   0,
    currentImgHeight:  0,
    currentExifOrient: 1,
    currentYolo:       [],
    currentCoco:       [],
    isSyntheticCoco:   false,
    currentEdits:      [],

    classColors: {},  // class_id → hex string, built from YAML classes on load

    selection: null,  // { stageId, source, idx }
    hovered:   null,  // { stageId, source, idx }
};
