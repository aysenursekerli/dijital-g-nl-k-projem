// === UYGULAMA DURUM (PHASE) YÖNETİCİSİ ===
const AppManager = {
    currentPhase: 1, // 1: Library, 2: Preview, 3: Edit
    views: {},
    activePageData: null,

    init() {
        this.views = {
            1: document.getElementById('view-library'),
            2: document.getElementById('view-preview'),
            3: document.getElementById('view-edit')
        };

        // Kütüphane Eventleri
        document.getElementById('open-sample-book').addEventListener('click', () => this.switchPhase(2));
        document.getElementById('add-new-btn').addEventListener('click', () => {
            alert('Yeni Günlük ekleme özelliği ve veritabanı altyapısı yakında gelecek!');
        });

        // Aşama 2 Eventleri
        document.getElementById('btn-return-library').addEventListener('click', () => {
            // Kitap başa dönsün istersen pageFlip.flip(0) yapılabilir
            this.switchPhase(1);
        });
        
        const pages = document.querySelectorAll('.page:not(.page-cover)');
        pages.forEach(page => {
            const btn = page.querySelector('.edit-page-btn');
            // Çift tık veya butona tıklama ile editör moduna (Aşama 3) geçiş
            const enterEdit = () => this.openEditMode(page);
            if(btn) btn.addEventListener('click', enterEdit);
            page.addEventListener('dblclick', enterEdit);
        });

        // Aşama 3 Eventleri
        document.getElementById('btn-finish-edit').addEventListener('click', () => this.closeEditMode());
    },

    switchPhase(phase) {
        this.currentPhase = phase;
        Object.values(this.views).forEach(v => {
            v.classList.remove('active');
            v.style.pointerEvents = 'none';
        });
        
        const activeView = this.views[phase];
        activeView.classList.add('active');
        activeView.style.pointerEvents = 'auto';

        // DrawingPad'i sadece Edit modunda aktif edeceğiz
        if(window.drawingPad) {
            window.drawingPad.setEditingState(phase === 3);
        }
    },

    openEditMode(pageElement) {
        const slot = document.getElementById('edit-page-slot');
        const pageContent = pageElement.querySelector('.page-content');
        const canvas = pageElement.querySelector('.drawing-layer');

        if(!pageContent || !canvas) return;

        // Teleport (DOM taşıma) Verileri
        this.activePageData = {
            parent: pageElement,
            content: pageContent,
            canvas: canvas
        };

        // UI temiziği: Düzenle butonunu gizle
        const editBtn = pageContent.querySelector('.edit-page-btn');
        if(editBtn) editBtn.style.display = 'none';

        // StPageFlip'ten kopartıp Tam Ekran slotuna append ediyoruz. (DOM yapısı bozulmaz, elemanlar taşınır)
        slot.appendChild(pageContent);
        slot.appendChild(canvas);

        if(window.drawingPad) {
            window.drawingPad.attachToSinglePage(canvas, pageContent);
            window.drawingPad.refreshAllCanvasesForZoom();
        }

        this.switchPhase(3);
    },

    closeEditMode() {
        if(this.activePageData) {
            const { parent, content, canvas } = this.activePageData;
            
            // Edit butonunu geri getir
            const editBtn = content.querySelector('.edit-page-btn');
            if(editBtn) editBtn.style.display = 'block';

            // Elemanları StPageFlip içindeki orijinal konumuna iade et
            parent.appendChild(content);
            parent.appendChild(canvas);

            if(window.drawingPad) {
                window.drawingPad.detachSinglePage();
                // Orijinal konteynera dönünce boyutları güncelle
                window.drawingPad.resizeCanvas(canvas);
                window.drawingPad.redrawCanvas(canvas);
            }

            this.activePageData = null;
        }
        this.switchPhase(2);
    }
};

// === ÇİZİM İŞLEMLERİ YÖNETİCİSİ (Aşama 3'e Optimize Edildi) ===
class DrawingPad {
    constructor() {
        this.currentMode = 'hand'; 
        this.color = '#333333';
        this.size = 3;
        
        this.globalHistory = []; 
        this.currentStroke = null;

        this.zoomLevel = 1;
        this.pendingZoom = 1;

        // Sadece tek sayfa düzenlendiği için bu değişkenler kullanılır
        this.activeCanvas = null;
        this.activePageContent = null;
        this.isEditing = false;

        this.initToolbar();
        this.initZoomLogic();
        this.setupMediaManager();

        window.addEventListener('resize', () => {
             if(this.isEditing && this.activeCanvas) {
                this.resizeCanvas(this.activeCanvas);
                this.redrawCanvas(this.activeCanvas);
             }
        });
    }

    initToolbar() {
        const tools = document.querySelectorAll('.tool-btn:not(.danger):not(#undo-btn)');
        const colorPicker = document.getElementById('color-picker');
        const sizePicker = document.getElementById('size-picker');
        const clearBtn = document.getElementById('clear-btn');
        const undoBtn = document.getElementById('undo-btn');

        if(undoBtn) undoBtn.addEventListener('click', () => this.undo());

        tools.forEach(btn => {
            btn.addEventListener('click', () => {
                if(btn.parentElement.classList.contains('dropdown')) return; 
                tools.forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                this.setMode(btn.dataset.tool);
            });
        });

        const colorButtons = document.querySelectorAll('.color-btn');
        colorButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                colorButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.color = btn.dataset.color;
                colorPicker.value = this.color; 
                const penBtn = document.querySelector('[data-tool="pen"]');
                if(!penBtn.classList.contains('active')) penBtn.click();
            });
        });

        colorPicker.addEventListener('input', (e) => {
            this.color = e.target.value;
            colorButtons.forEach(b => b.classList.remove('active'));
            const penBtn = document.querySelector('[data-tool="pen"]');
            if(!penBtn.classList.contains('active')) penBtn.click();
        });
        
        sizePicker.addEventListener('input', (e) => this.size = e.target.value);
        
        clearBtn.addEventListener('click', () => {
            if(!this.activeCanvas) return;
            // Sadece mevcut sayfanın geçmişini sil
            this.globalHistory = this.globalHistory.filter(s => s.canvas !== this.activeCanvas);
            this.redrawCanvas(this.activeCanvas);
        });
    }

    attachToSinglePage(canvas, pageContent) {
        this.activeCanvas = canvas;
        this.activePageContent = pageContent;
        
        canvas.style.zIndex = "100";
        canvas.style.touchAction = "none";
        
        if(!canvas.dataset.hasEvents) {
            canvas.addEventListener('pointerdown', (e) => this.startDrawing(e, canvas), { passive: false });
            canvas.addEventListener('pointermove', (e) => this.draw(e, canvas), { passive: false });
            canvas.addEventListener('pointerup', () => this.stopDrawing());
            canvas.addEventListener('pointerout', () => this.stopDrawing());
            canvas.addEventListener('pointercancel', () => this.stopDrawing());
            canvas.addEventListener('touchstart', (e) => { if(this.currentMode !== 'hand') e.stopPropagation(); }, { passive: false });
            canvas.addEventListener('mousedown', (e) => { if(this.currentMode !== 'hand') e.stopPropagation(); });
            canvas.dataset.hasEvents = 'true';
        }

        this.setEditingState(true);
    }

    detachSinglePage() {
        if(this.activeCanvas) {
            this.activeCanvas.style.pointerEvents = 'none'; // Aşama 2'ye dönüş
        }
        // Zoom sıfırla
        this.zoomLevel = 1;
        this.pendingZoom = 1;
        const zoomWrapper = document.getElementById('zoom-wrapper');
        if(zoomWrapper) zoomWrapper.style.transform = `scale(1)`;
        
        this.activeCanvas = null;
        this.activePageContent = null;
        this.setEditingState(false);
    }

    setEditingState(state) {
        this.isEditing = state;
        if(this.activeCanvas) {
            this.activeCanvas.style.pointerEvents = state && this.currentMode !== 'hand' ? 'auto' : 'none';
        }
    }

    undo() {
        if(this.globalHistory.length === 0 || !this.activeCanvas) return;
        
        // Aktif canvas'ın en son izini bul ve history'den çıkart
        for(let i = this.globalHistory.length -1; i >= 0; i--) {
            if(this.globalHistory[i].canvas === this.activeCanvas) {
                this.globalHistory.splice(i, 1);
                break;
            }
        }
        
        requestAnimationFrame(() => this.redrawCanvas(this.activeCanvas));
    }

    redrawCanvas(canvas) {
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        
        const strokes = this.globalHistory.filter(s => s.canvas === canvas);
        strokes.forEach(stroke => {
            if (stroke.points.length === 0) return;
            
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = stroke.normSize * canvas.width;

            if (stroke.mode === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = stroke.normSize * canvas.width * 2;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = stroke.color;
            }
            
            const startX = stroke.points[0].x * canvas.width;
            const startY = stroke.points[0].y * canvas.height;
            ctx.moveTo(startX, startY);
            
            for(let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
            }
            ctx.stroke();
        });
    }

    initZoomLogic() {
        // Zoom sadece Aşama 3 edit-workspace içinde çalışır
        const zoomWrapper = document.querySelector('#view-edit #zoom-wrapper');
        const container = document.getElementById('edit-workspace');
        if(!zoomWrapper || !container) return;

        let initialDist = null;
        let activePointers = new Map();

        const getDistance = (p1, p2) => Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);

        // --- DOKUNMATİK / MULTI-TOUCH ZOOM ---
        container.addEventListener('pointerdown', (e) => {
            if(!this.isEditing) return;
            if(this.currentMode === 'hand') activePointers.set(e.pointerId, e);
        });

        container.addEventListener('pointermove', (e) => {
            if(activePointers.has(e.pointerId)) activePointers.set(e.pointerId, e);

            if(activePointers.size === 2) {
                const ptrs = Array.from(activePointers.values());
                const dist = getDistance(ptrs[0], ptrs[1]);

                if(initialDist === null) {
                    initialDist = dist;
                } else {
                    const scaleChange = dist / initialDist;
                    let newZoom = this.zoomLevel * scaleChange;
                    newZoom = Math.min(Math.max(1, newZoom), 4);

                    zoomWrapper.style.transform = `scale(${newZoom})`;
                    this.pendingZoom = newZoom;
                }
            }
        });

        const pointerEnd = (e) => {
            activePointers.delete(e.pointerId);
            if(activePointers.size < 2) {
                initialDist = null;
                if(this.pendingZoom && this.pendingZoom !== this.zoomLevel) {
                    this.zoomLevel = this.pendingZoom;
                    this.refreshAllCanvasesForZoom();
                }
            }
        };

        container.addEventListener('pointerup', pointerEnd);
        container.addEventListener('pointercancel', pointerEnd);
        container.addEventListener('pointerout', pointerEnd);

        // --- FARE TEKERLEĞİ (MOUSE WHEEL) İLE ZOOM ---
        container.addEventListener('wheel', (e) => {
            if(!this.isEditing || this.currentMode !== 'hand') return;
            e.preventDefault(); // Sayfanın normalde kaymasını engeller
            
            const zoomSpeed = 0.15;
            // e.deltaY negatifse yukarı kaydırma (yakınlaş), pozitifse aşağı (uzaklaş)
            const direction = e.deltaY > 0 ? -1 : 1;
            
            let newZoom = this.zoomLevel + (direction * zoomSpeed);
            newZoom = Math.min(Math.max(1, newZoom), 4);
            
            this.pendingZoom = newZoom;
            zoomWrapper.style.transform = `scale(${newZoom})`;
            
            clearTimeout(this.wheelTimeout);
            this.wheelTimeout = setTimeout(() => {
                if(this.pendingZoom !== this.zoomLevel) {
                    this.zoomLevel = this.pendingZoom;
                    this.refreshAllCanvasesForZoom();
                }
            }, 300); // Scroll bitiminden 300ms sonra kaliteyi yeniden işle
            
        }, { passive: false });
    }

    refreshAllCanvasesForZoom() {
        if(this.activeCanvas) {
            this.resizeCanvas(this.activeCanvas);
            this.redrawCanvas(this.activeCanvas);
        }
    }

    setupMediaManager() {
        const uploadInput = document.getElementById('image-upload');
        const stickerBtns = document.querySelectorAll('.sticker-btn');

        if(uploadInput) {
            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if(file) {
                    const reader = new FileReader();
                    reader.onload = (event) => this.addMediaToPage(`<img src="${event.target.result}">`);
                    reader.readAsDataURL(file);
                }
            });
        }

        stickerBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.dataset.sticker;
                this.addMediaToPage(`<div class="sticker">${emoji}</div>`);
            });
        });

        document.addEventListener('pointerdown', (e) => {
            if(!e.target.closest('.draggable-item') && this.currentMode === 'hand') {
                document.querySelectorAll('.draggable-item').forEach(el => el.classList.remove('selected'));
            }
        });
    }

    addMediaToPage(contentHTML) {
        if(!this.activePageContent) return; // Sadece edit modundaysa eklenebilir

        const wrapper = document.createElement('div');
        wrapper.className = 'draggable-item selected';
        wrapper.innerHTML = contentHTML;

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        wrapper.appendChild(handle);

        this.activePageContent.appendChild(wrapper);
        this.makeDraggable(wrapper);
    }

    makeDraggable(elem) {
        let isDragging = false, isResizing = false;
        let startX, startY, startW, startLeft, startTop;
        const handle = elem.querySelector('.resize-handle');

        elem.addEventListener('pointerdown', (e) => {
            if(this.currentMode !== 'hand') return; 
            
            e.stopPropagation(); 
            e.preventDefault();
            
            document.querySelectorAll('.draggable-item').forEach(el => el.classList.remove('selected'));
            elem.classList.add('selected');

            if (e.target === handle) {
                isResizing = true;
                startW = elem.offsetWidth;
            } else {
                isDragging = true;
                startLeft = elem.offsetLeft;
                startTop = elem.offsetTop;
            }
            startX = e.clientX;
            startY = e.clientY;
            elem.setPointerCapture(e.pointerId);
        });

        elem.addEventListener('pointermove', (e) => {
            if (!isDragging && !isResizing) return;
            e.stopPropagation();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const zoomCorrectedDx = dx / this.zoomLevel;
            const zoomCorrectedDy = dy / this.zoomLevel;

            if (isDragging) {
                elem.style.left = `${startLeft + zoomCorrectedDx}px`;
                elem.style.top = `${startTop + zoomCorrectedDy}px`;
            } else if (isResizing) {
                elem.style.width = `${Math.max(50, startW + zoomCorrectedDx)}px`;
                const sticker = elem.querySelector('.sticker');
                if(sticker) sticker.style.fontSize = `${(startW + zoomCorrectedDx)/20}rem`; 
            }
        });

        elem.addEventListener('pointerup', () => { isDragging = false; isResizing = false; });
    }

    resizeCanvas(canvas) {
        const rect = canvas.parentElement.getBoundingClientRect();
        if(rect.width > 0) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }
    }

    setMode(mode) {
        this.currentMode = mode;
        if(this.activeCanvas) {
            this.activeCanvas.style.pointerEvents = (this.currentMode === 'hand') ? 'none' : 'auto';
        }
    }

    startDrawing(e, canvas) {
        if (this.currentMode === 'hand' || !this.isEditing) return; 
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        canvas.setPointerCapture(e.pointerId);

        this.isDrawing = true;
        
        const rect = canvas.getBoundingClientRect();
        const unX = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
        const unY = Math.min(Math.max(0, (e.clientY - rect.top) / rect.height), 1);
        
        this.currentStroke = {
            mode: this.currentMode,
            color: this.color,
            normSize: this.size / rect.width, 
            points: [{x: unX, y: unY}],
            canvas: canvas
        };

        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        
        const actualLineWidth = this.currentStroke.normSize * canvas.width;
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (this.currentMode === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = actualLineWidth * 2; 
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = this.currentStroke.color;
            ctx.lineWidth = actualLineWidth;
        }
        
        const drawX = unX * canvas.width;
        const drawY = unY * canvas.height;
        ctx.moveTo(drawX, drawY);
        ctx.lineTo(drawX, drawY);
        ctx.stroke();
    }

    draw(e, canvas) {
        if (!this.isDrawing || !this.currentStroke || !this.isEditing) return;
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const rect = canvas.getBoundingClientRect();
        const unX = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
        const unY = Math.min(Math.max(0, (e.clientY - rect.top) / rect.height), 1);
        
        this.currentStroke.points.push({x: unX, y: unY});

        const ctx = canvas.getContext('2d');
        const drawX = unX * canvas.width;
        const drawY = unY * canvas.height;
        ctx.lineTo(drawX, drawY);
        ctx.stroke();
    }

    stopDrawing() {
        if(!this.isDrawing) return;
        this.isDrawing = false;
        if(this.currentStroke && this.currentStroke.points.length > 0) {
            this.globalHistory.push(this.currentStroke);
        }
        this.currentStroke = null;
    }
}

// Ana Kurulum
document.addEventListener("DOMContentLoaded", function() {
    // 1. App Manager Başlat
    AppManager.init();

    // 2. Kitap Altyapısını Başlat
    const bookContainer = document.getElementById("book");
    const pageFlip = new St.PageFlip(bookContainer, {
        width: 450, 
        height: 600, 
        size: "stretch", 
        minWidth: 300, 
        maxWidth: 600, 
        minHeight: 400,
        maxHeight: 800,
        maxShadowOpacity: 0.5, 
        showCover: true, 
        mobileScrollSupport: true 
    });

    pageFlip.loadFromHTML(document.querySelectorAll("#view-preview .page"));

    // 3. Çizim Altyapısını Başlat
    setTimeout(() => {
        window.drawingPad = new DrawingPad();
    }, 100);
});
