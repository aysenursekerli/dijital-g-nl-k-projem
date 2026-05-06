// === UYGULAMA DURUM (PHASE) YÖNETİCİSİ ===
const AppManager = {
    currentPhase: 1, // 1: Library, 2: Preview, 3: Edit
    views: {},
    activePageData: null,
    
    notebooks: [
        {
            id: 'nb-sample-1',
            name: 'Dijital Ajanda',
            coverColor: '#1e293b',
            pattern: 'blank',
            pages: 4
        }
    ],
    activeNotebookId: null,

    init() {
        this.views = {
            1: document.getElementById('view-library'),
            2: document.getElementById('view-preview'),
            3: document.getElementById('view-edit')
        };

        this.renderLibrary();

        // Kütüphane Eventleri - Yeni Ekle Modal
        const modal = document.getElementById('notebook-modal');
        document.getElementById('add-new-btn').addEventListener('click', () => {
            modal.classList.add('active');
        });
        document.getElementById('close-modal-btn').addEventListener('click', () => {
            modal.classList.remove('active');
        });
        document.getElementById('create-notebook-btn').addEventListener('click', () => {
            this.createNewNotebook();
            modal.classList.remove('active');
        });

        // Aşama 2 Eventleri
        document.getElementById('btn-return-library').addEventListener('click', () => {
            this.switchPhase(1);
        });
        
        document.getElementById('btn-add-page').addEventListener('click', () => {
            this.addNewPageToBook();
        });

        // Aşama 3 Eventleri
        document.getElementById('btn-finish-edit').addEventListener('click', () => this.closeEditMode());
        document.getElementById('btn-prev-edit-page').addEventListener('click', () => this.navigateToPage(-1));
        document.getElementById('btn-next-edit-page').addEventListener('click', () => this.navigateToPage(1));
        
        window.addEventListener('keydown', (e) => {
            if(this.currentPhase === 3 && window.drawingPad && window.drawingPad.currentMode === 'hand') {
                if(e.key === 'ArrowLeft') this.navigateToPage(-1);
                if(e.key === 'ArrowRight') this.navigateToPage(1);
            }
        });

        // Splash screen timeout
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if(splash) {
                splash.style.opacity = '0';
                setTimeout(() => splash.style.display = 'none', 500);
            }
        }, 1500);
    },

    renderLibrary() {
        const grid = document.querySelector('.library-grid');
        const addNewBtn = document.getElementById('add-new-btn');
        grid.innerHTML = '';
        grid.appendChild(addNewBtn);

        this.notebooks.forEach(nb => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.innerHTML = `
                <div class="book-cover-design" style="background: ${nb.coverColor};">
                    <h3 class="book-title">${nb.name}</h3>
                    <div class="book-date">Nisan 2026</div>
                </div>
            `;
            card.addEventListener('click', () => this.openBook(nb.id));
            grid.appendChild(card);
        });
    },

    createNewNotebook() {
        const name = document.getElementById('notebook-name').value || 'Yeni Günlük';
        const color = document.getElementById('notebook-color').value;
        const pattern = document.getElementById('notebook-pattern').value;

        const newNb = {
            id: 'nb-' + Date.now(),
            name: name,
            coverColor: color,
            pattern: pattern,
            pages: 2 
        };
        this.notebooks.push(newNb);
        this.renderLibrary();
    },

    openBook(id, startPage = 0) {
        this.activeNotebookId = id;
        const nb = this.notebooks.find(n => n.id === id);
        if(!nb) return;

        const container = document.getElementById('main-container');
        container.innerHTML = ''; 
        
        const bookDiv = document.createElement('div');
        bookDiv.className = 'book';
        bookDiv.id = 'book';
        
        bookDiv.innerHTML += `
            <div class="page page-cover page-cover-top" data-density="hard">
                <div class="page-content" style="background: ${nb.coverColor}">
                    <h2>${nb.name}</h2>
                </div>
            </div>
        `;

        for(let i = 1; i <= nb.pages; i++) {
            bookDiv.innerHTML += `
                <div class="page pattern-${nb.pattern}" data-page="${i}">
                    <div class="page-content">
                        <button class="edit-page-btn" title="Bu Sayfayı Düzenle"><i data-lucide="pencil"></i> Düzenle</button>
                        <div class="page-footer">${i}</div>
                    </div>
                    <canvas class="drawing-layer" data-page="${i}"></canvas>
                </div>
            `;
        }

        bookDiv.innerHTML += `
            <div class="page page-cover page-cover-bottom" data-density="hard">
                <div class="page-content" style="background: ${nb.coverColor}">
                    <h2>Son</h2>
                </div>
            </div>
        `;

        container.appendChild(bookDiv);

        this.bindPageEvents(bookDiv);

        if(window.pageFlip) {
            window.pageFlip.destroy();
        }
        
        window.pageFlip = new St.PageFlip(bookDiv, {
            width: 450, height: 600, size: "stretch", 
            minWidth: 300, maxWidth: 600, minHeight: 400, maxHeight: 800,
            maxShadowOpacity: 0.5, showCover: true, mobileScrollSupport: true 
        });
        window.pageFlip.loadFromHTML(bookDiv.querySelectorAll(".page"));
        
        if (startPage > 0 && typeof window.pageFlip.turnToPage === 'function') {
            window.pageFlip.turnToPage(startPage);
        }

        // PageFlip başlatıldıktan sonra tüm canvas'ları re-render et
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (window.drawingPad) {
                    bookDiv.querySelectorAll('.drawing-layer').forEach(canvas => {
                        window.drawingPad.resizeCanvas(canvas);
                        window.drawingPad.redrawCanvas(canvas);
                    });
                }
            }, 150);
        });

        this.switchPhase(2);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    bindPageEvents(container) {
        const pages = container.querySelectorAll('.page:not(.page-cover)');
        pages.forEach(page => {
            if(page.dataset.eventsBound) return;
            const btn = page.querySelector('.edit-page-btn');
            const enterEdit = () => this.openEditMode(page);
            if(btn) btn.addEventListener('click', enterEdit);
            page.addEventListener('dblclick', enterEdit);
            page.dataset.eventsBound = "true";
        });
    },

    addNewPageToBook() {
        if(!this.activeNotebookId) return;
        const nb = this.notebooks.find(n => n.id === this.activeNotebookId);
        
        let currentIndex = 0;
        if(window.pageFlip) {
            currentIndex = window.pageFlip.getCurrentPageIndex();
        }

        nb.pages += 2;
        
        // Defteri baştan oluştur, tüm DOM sorunlarını önler ve state'i temizler
        this.openBook(this.activeNotebookId, currentIndex);

        // Görsel geri bildirim: Kullanıcıyı defterin sonuna eklenen yeni sayfalara yönlendir
        setTimeout(() => {
            if(window.pageFlip) window.pageFlip.flip(nb.pages - 1);
        }, 150);
    },

    switchPhase(phase) {
        this.currentPhase = phase;
        Object.values(this.views).forEach(v => {
            if(v) {
                v.classList.remove('active');
                v.style.pointerEvents = 'none';
            }
        });
        
        const activeView = this.views[phase];
        if(activeView) {
            activeView.classList.add('active');
            activeView.style.pointerEvents = 'auto';
        }

        if(window.drawingPad) {
            window.drawingPad.setEditingState(phase === 3);
        }
    },

    openEditMode(pageElement) {
        if(this.activePageData) {
            this.closeEditMode(true); 
        }
        
        const slot = document.getElementById('edit-page-slot');
        const pageContent = pageElement.querySelector('.page-content');
        const canvas = pageElement.querySelector('.drawing-layer');

        if(!pageContent || !canvas) return;

        this.activePageData = {
            parent: pageElement,
            content: pageContent,
            canvas: canvas
        };

        const editBtn = pageContent.querySelector('.edit-page-btn');
        if(editBtn) editBtn.style.display = 'none';

        const patternClasses = Array.from(pageElement.classList).filter(c => c.startsWith('pattern-'));
        slot.className = 'fullscreen-canvas-wrapper ' + patternClasses.join(' ');

        slot.appendChild(pageContent);
        slot.appendChild(canvas);

        if(window.drawingPad) {
            window.drawingPad.attachToSinglePage(canvas, pageContent);
            window.drawingPad.refreshAllCanvasesForZoom();
        }

        if(this.currentPhase !== 3) this.switchPhase(3);
    },

    closeEditMode(skipPhaseSwitch = false) {
        if(this.activePageData) {
            const { parent, content, canvas } = this.activePageData;
            
            const editBtn = content.querySelector('.edit-page-btn');
            if(editBtn) editBtn.style.display = 'block';

            parent.appendChild(content);
            parent.appendChild(canvas);

            const slot = document.getElementById('edit-page-slot');
            slot.className = 'fullscreen-canvas-wrapper';

            if(window.drawingPad) {
                window.drawingPad.detachSinglePage();
            }

            this.activePageData = null;
        }
        if(!skipPhaseSwitch) {
            this.switchPhase(2);
            // Canvas'ları güvenli şekilde re-render et
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const book = document.getElementById('book');
                    if (book && window.drawingPad) {
                        // Tüm canvas'ları yeniden boyutlandır ve çiz
                        book.querySelectorAll('.drawing-layer').forEach(c => {
                            window.drawingPad.resizeCanvas(c);
                            window.drawingPad.redrawCanvas(c);
                        });
                        // PageFlip'i güncel sayfalarla yeniden başlat
                        if (window.pageFlip && typeof window.pageFlip.loadFromHTML === 'function') {
                            const pages = book.querySelectorAll('.page');
                            window.pageFlip.loadFromHTML(pages);
                        }
                    }
                }, 150);
            });
        }
    },

    navigateToPage(direction) {
        if(!this.activePageData) return;
        const currentPage = this.activePageData.parent;
        const pageNumber = parseInt(currentPage.dataset.page);
        if(isNaN(pageNumber)) return;

        const nb = this.notebooks.find(n => n.id === this.activeNotebookId);
        let targetPageNumber = pageNumber + direction;

        if(targetPageNumber < 1 || targetPageNumber > nb.pages) return;

        const bookDiv = document.getElementById('book');
        const targetPageElement = bookDiv.querySelector(`.page[data-page="${targetPageNumber}"]`);
        
        if(targetPageElement) {
            this.openEditMode(targetPageElement);
        }
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
        this.lastPoint = null;
        this.lastTime = null;

        this.zoomLevel = 1;
        this.pendingZoom = 1;

        // Geçici katman (Off-screen canvas) highlighter real-time fix için
        this.draftCanvas = document.createElement('canvas');
        this.draftCtx = this.draftCanvas.getContext('2d', { willReadFrequently: true });

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
                if(!btn.dataset.tool) return; // Çizim aracı değilse işlem yapma
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
            const pageNumber = parseInt(this.activeCanvas.dataset.page);
            const notebookId = AppManager.activeNotebookId;
            
            this.globalHistory = this.globalHistory.filter(s => !(s.notebookId === notebookId && s.pageNumber === pageNumber));
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
        
        const pageNumber = parseInt(this.activeCanvas.dataset.page);
        const notebookId = AppManager.activeNotebookId;

        // Aktif canvas'ın en son izini bul ve history'den çıkart
        for(let i = this.globalHistory.length -1; i >= 0; i--) {
            const stroke = this.globalHistory[i];
            if(stroke.notebookId === notebookId && stroke.pageNumber === pageNumber) {
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
        
        const pageNumber = parseInt(canvas.dataset.page);
        const notebookId = AppManager.activeNotebookId;

        const strokes = this.globalHistory.filter(s => s.notebookId === notebookId && s.pageNumber === pageNumber);
        strokes.forEach(stroke => {
            if (stroke.points.length === 0) return;
            
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            let actualLineWidth = stroke.normSize * canvas.width;
            ctx.lineWidth = actualLineWidth;

            if (stroke.mode === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = actualLineWidth * 2;
                ctx.globalAlpha = 1;
            } else if (stroke.mode === 'highlighter') {
                ctx.globalCompositeOperation = 'multiply';
                ctx.strokeStyle = stroke.color;
                ctx.globalAlpha = 0.4;
                ctx.lineWidth = actualLineWidth * 3;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = stroke.color;
                ctx.globalAlpha = 1;
            }
            
            const startX = stroke.points[0].x * canvas.width;
            const startY = stroke.points[0].y * canvas.height;
            ctx.moveTo(startX, startY);
            
            for(let i = 1; i < stroke.points.length; i++) {
                const pt = stroke.points[i];
                if(stroke.mode === 'fountain' && pt.thicknessMultiplier) {
                    ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
                    ctx.lineWidth = actualLineWidth * pt.thicknessMultiplier;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
                } else {
                    ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
                }
            }
            ctx.stroke();
            ctx.globalAlpha = 1; // reset alpha
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
            const uploadTrigger = document.getElementById('btn-upload-trigger');
            if(uploadTrigger) {
                uploadTrigger.addEventListener('click', () => uploadInput.click());
            }
            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if(file) {
                    const reader = new FileReader();
                    reader.onload = (event) => this.addMediaToPage(`<img src="${event.target.result}">`);
                    reader.readAsDataURL(file);
                }
            });
        }

        // Tüm sticker ve emoji butonlarını yakala (hem menü hem modal)
        document.querySelectorAll('.sticker-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const emoji = btn.dataset.sticker;
                this.addMediaToPage(`<div class="sticker">${emoji}</div>`);
            });
        });

        // Sticker Modal Eventleri
        const stickerModal = document.getElementById('sticker-modal');
        const stickerBtn = document.getElementById('sticker-popup-btn');
        const closeStickerBtn = document.getElementById('close-sticker-btn');

        if(stickerBtn) {
            stickerBtn.addEventListener('click', () => {
                stickerModal.classList.add('active');
                this.renderStickerLibrary('general');
            });
        }
        if(closeStickerBtn) {
            closeStickerBtn.addEventListener('click', () => stickerModal.classList.remove('active'));
        }

        // Sticker Tab Geçişleri
        document.querySelectorAll('[data-sticker-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('[data-sticker-tab]').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderStickerLibrary(tab.dataset.stickerTab);
            });
        });

        document.addEventListener('pointerdown', (e) => {
            if(!e.target.closest('.draggable-item') && this.currentMode === 'hand') {
                document.querySelectorAll('.draggable-item').forEach(el => el.classList.remove('selected'));
            }
        });
    }

    renderStickerLibrary(category) {
        const grid = document.getElementById('sticker-library-grid');
        if(!grid) return;
        grid.innerHTML = '';

        const stickerData = {
            general: ['🐱', '🐶', '🦊', '🐨', '🦁', '🐷', '🦄', '🐝', '🦋', '🐳'],
            nature: ['🌸', '🌻', '🌲', '🍀', '🍂', '🍄', '🌍', '🌙', '☀️', '🌊'],
            school: ['📚', '✏️', '🎨', '🎓', '🎒', '🔬', '📐', '🖍️', '📖', '💻']
        };

        const items = stickerData[category] || [];
        items.forEach(emoji => {
            const item = document.createElement('div');
            item.className = 'sticker-item';
            item.innerHTML = emoji;
            item.addEventListener('click', () => {
                this.addMediaToPage(`<div class="sticker">${emoji}</div>`);
                document.getElementById('sticker-modal').classList.remove('active');
            });
            grid.appendChild(item);
        });
    }

    addMediaToPage(contentHTML) {
        if(!this.activePageContent) return; // Sadece edit modundaysa eklenebilir

        const wrapper = document.createElement('div');
        wrapper.className = 'draggable-item selected';
        wrapper.style.zIndex = 10; // .page-content (150) içinde olduğu için zaten tuvalin (100) üstünde.
        
        wrapper.innerHTML = `
            <div class="media-controls">
                <button class="layer-btn" data-action="back" title="Arkaya Gönder"><i data-lucide="arrow-down-to-line"></i></button>
                <button class="layer-btn" data-action="front" title="Öne Getir"><i data-lucide="arrow-up-to-line"></i></button>
            </div>
            ${contentHTML}
        `;

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        wrapper.appendChild(handle);

        this.activePageContent.appendChild(wrapper);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        this.makeDraggable(wrapper);
    }

    makeDraggable(elem) {
        let isDragging = false, isResizing = false;
        let startX, startY, startW, startLeft, startTop;
        const handle = elem.querySelector('.resize-handle');
        const mediaControls = elem.querySelector('.media-controls');

        if(mediaControls) {
            mediaControls.addEventListener('pointerdown', (e) => {
                e.stopPropagation(); // Draggable hareketini engelle
                const action = e.target.closest('.layer-btn')?.dataset.action;
                let currentZ = parseInt(elem.style.zIndex) || 10;
                if(action === 'back') {
                    elem.style.zIndex = Math.max(-50, currentZ - 1);
                } else if(action === 'front') {
                    elem.style.zIndex = currentZ + 1;
                }
            });
        }

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
        
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        canvas.setPointerCapture(e.pointerId);
        this.isDrawing = true;
        
        const rect = canvas.getBoundingClientRect();
        const unX = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
        const unY = Math.min(Math.max(0, (e.clientY - rect.top) / rect.height), 1);
        
        let cColor = this.color;

        const pageNumber = parseInt(canvas.dataset.page);
        const notebookId = AppManager.activeNotebookId;

        this.currentStroke = {
            mode: this.currentMode,
            color: cColor,
            normSize: this.size / rect.width, 
            points: [{x: unX, y: unY, thicknessMultiplier: 1}],
            notebookId: notebookId,
            pageNumber: pageNumber
        };

        this.lastPoint = {x: e.clientX, y: e.clientY};
        this.lastTime = Date.now();

        const ctx = canvas.getContext('2d');
        
        if (this.currentMode === 'highlighter') {
            // Real-time render için canvas'ın anlık görüntüsünü al
            this.draftCanvas.width = canvas.width;
            this.draftCanvas.height = canvas.height;
            this.draftCtx.clearRect(0, 0, canvas.width, canvas.height);
            this.draftCtx.drawImage(canvas, 0, 0);
            
            // İlk noktayı görünür kıl
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            let actualLineWidth = this.currentStroke.normSize * canvas.width;
            ctx.lineWidth = actualLineWidth * 3;
            ctx.globalCompositeOperation = 'multiply';
            ctx.strokeStyle = cColor;
            ctx.globalAlpha = 0.4;
            
            const drawX = unX * canvas.width;
            const drawY = unY * canvas.height;
            ctx.moveTo(drawX, drawY);
            ctx.lineTo(drawX, drawY);
            ctx.stroke();
            
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        } else {
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            let actualLineWidth = this.currentStroke.normSize * canvas.width;
            ctx.lineWidth = actualLineWidth;

            if (this.currentMode === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = actualLineWidth * 2; 
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = cColor;
            }
            
            const drawX = unX * canvas.width;
            const drawY = unY * canvas.height;
            ctx.moveTo(drawX, drawY);
            ctx.lineTo(drawX, drawY);
            ctx.stroke();
            // Not: destination-out durumunda resetlemiyoruz, draw() içinde devam edecek
        }
    }

    draw(e, canvas) {
        if (!this.isDrawing || !this.currentStroke || !this.isEditing) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        const rect = canvas.getBoundingClientRect();
        const unX = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
        const unY = Math.min(Math.max(0, (e.clientY - rect.top) / rect.height), 1);
        
        let thicknessMultiplier = 1;
        if (this.currentMode === 'fountain') {
            const now = Date.now();
            const dist = Math.hypot(e.clientX - this.lastPoint.x, e.clientY - this.lastPoint.y);
            const timeDiff = now - this.lastTime || 1;
            const speed = dist / timeDiff;
            
            thicknessMultiplier = Math.max(0.2, 1.5 - speed * 0.2);
            
            this.lastPoint = {x: e.clientX, y: e.clientY};
            this.lastTime = now;
        }

        this.currentStroke.points.push({x: unX, y: unY, thicknessMultiplier});

        const ctx = canvas.getContext('2d');
        const drawX = unX * canvas.width;
        const drawY = unY * canvas.height;
        
        if (this.currentMode === 'highlighter') {
            // 1. Ana canvas'ı temizle ve arka planı / eski çizimleri snapshot'tan geri yükle
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(this.draftCanvas, 0, 0);
            
            // 2. Güncel highlighter vuruşunu TEK BİR PATH olarak çiz
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = this.currentStroke.normSize * canvas.width * 3;
            ctx.globalCompositeOperation = 'multiply';
            ctx.strokeStyle = this.currentStroke.color;
            ctx.globalAlpha = 0.4;
            
            const startX = this.currentStroke.points[0].x * canvas.width;
            const startY = this.currentStroke.points[0].y * canvas.height;
            ctx.moveTo(startX, startY);
            
            for(let i = 1; i < this.currentStroke.points.length; i++) {
                ctx.lineTo(this.currentStroke.points[i].x * canvas.width, this.currentStroke.points[i].y * canvas.height);
            }
            ctx.stroke();
            
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            
        } else if(this.currentMode === 'fountain') {
            ctx.beginPath();
            const prev = this.currentStroke.points[this.currentStroke.points.length - 2];
            ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height);
            ctx.lineTo(drawX, drawY);
            ctx.lineWidth = this.currentStroke.normSize * canvas.width * thicknessMultiplier;
            ctx.stroke();
        } else {
            if (this.currentMode === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = this.currentStroke.normSize * canvas.width * 2;
            } else {
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.lineTo(drawX, drawY);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over'; // İşlem sonrası her zaman sıfırla
        }
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
    AppManager.init();

    setTimeout(() => {
        window.drawingPad = new DrawingPad();
    }, 100);
});
