// === VERİTABANI YÖNETİCİSİ (IndexedDB) ===
const DatabaseManager = {
    dbName: 'diaryDB',
    version: 2,
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (db.objectStoreNames.contains('notebooks')) db.deleteObjectStore('notebooks');
                if (db.objectStoreNames.contains('drawings')) db.deleteObjectStore('drawings');
                
                db.createObjectStore('notebooks', { keyPath: 'id' });
                db.createObjectStore('drawings', { keyPath: 'id', autoIncrement: true });
            };
        });
    },

    async saveNotebooks(notebooks) {
        if (!this.db) return;
        const tx = this.db.transaction('notebooks', 'readwrite');
        const store = tx.objectStore('notebooks');
        
        for (let nb of notebooks) {
            await new Promise((resolve, reject) => {
                const req = store.put(nb);
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        }
    },

    async loadNotebooks() {
        if (!this.db) return [];
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('notebooks', 'readonly');
            const store = tx.objectStore('notebooks');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async saveDrawing(drawing) {
        if (!this.db) return;
        const tx = this.db.transaction('drawings', 'readwrite');
        const store = tx.objectStore('drawings');
        
        return new Promise((resolve, reject) => {
            const req = store.add(drawing);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    },

    async loadDrawings() {
        if (!this.db) return [];
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('drawings', 'readonly');
            const store = tx.objectStore('drawings');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async clearAll() {
        if (!this.db) return;
        const tx = this.db.transaction(['notebooks', 'drawings'], 'readwrite');
        await new Promise((resolve, reject) => {
            const req1 = tx.objectStore('notebooks').clear();
            const req2 = tx.objectStore('drawings').clear();
            req1.onsuccess = resolve;
            req1.onerror = reject;
        });
    },

    async syncDrawings(notebookId, pageId, currentHistory) {
        if (!this.db) return;
        
        const tx = this.db.transaction('drawings', 'readwrite');
        const store = tx.objectStore('drawings');
        
        // İlgili sayfa ve defter için tüm eski çizimleri sil
        return new Promise((resolve, reject) => {
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = async () => {
                const allDrawings = getAllRequest.result;
                
                // Silmek için de transaction gerekli
                const deletePromises = allDrawings
                    .filter(d => d.notebookId === notebookId && d.pageId === pageId)
                    .map(d => {
                        return new Promise((resolveDelete, rejectDelete) => {
                            const deleteReq = store.delete(d.id);
                            deleteReq.onsuccess = resolveDelete;
                            deleteReq.onerror = rejectDelete;
                        });
                    });
                
                await Promise.all(deletePromises);
                
                // Yeni çizimleri ekle
                const savePromises = currentHistory
                    .filter(h => h.notebookId === notebookId && h.pageId === pageId)
                    .map(h => {
                        return new Promise((resolveSave, rejectSave) => {
                            const saveReq = store.add(h);
                            saveReq.onsuccess = resolveSave;
                            saveReq.onerror = rejectSave;
                        });
                    });
                
                await Promise.all(savePromises);
                resolve();
            };
            
            getAllRequest.onerror = reject;
        });
    }
};

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
            pages: [
                { id: 'pg-sample-1', snapshot: null },
                { id: 'pg-sample-2', snapshot: null },
                { id: 'pg-sample-3', snapshot: null },
                { id: 'pg-sample-4', snapshot: null }
            ]
        }
    ],
    activeNotebookId: null,

    init() {
        this.views = {
            1: document.getElementById('view-library'),
            2: document.getElementById('view-preview'),
            3: document.getElementById('view-edit')
        };

        // Veritabanını başlat ve verileri yükle
        DatabaseManager.init().then(async () => {
            const savedNotebooks = await DatabaseManager.loadNotebooks();
            if (savedNotebooks && savedNotebooks.length > 0) {
                this.notebooks = savedNotebooks;
            }
            
            this.renderLibrary();
            
            // çizimleri yükle ve globalHistory'ye ekle
            if (window.drawingPad) {
                const savedDrawings = await DatabaseManager.loadDrawings();
                window.drawingPad.globalHistory = savedDrawings || [];
            }
        }).catch(err => {
            console.error('Database initialization failed:', err);
            this.renderLibrary();
        });

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
        document.getElementById('btn-finish-edit').addEventListener('click', () => {
            this.closeEditMode();
            this.switchPhase(1);
        });
        document.getElementById('btn-prev-edit-page').addEventListener('click', () => this.navigateToPage(-1));
        document.getElementById('btn-next-edit-page').addEventListener('click', () => this.navigateToPage(1));
        
        window.addEventListener('keydown', (e) => {
            if(this.currentPhase === 3 && window.drawingPad && window.drawingPad.currentMode === 'hand') {
                if(e.key === 'ArrowLeft') this.navigateToPage(-1);
                if(e.key === 'ArrowRight') this.navigateToPage(1);
            }
        });

        // Yan Panel Eventleri
        const sidebar = document.getElementById('sidebar-navigator');
        const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
        if(toggleSidebarBtn && sidebar) {
            toggleSidebarBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
            });
        }
        
        const sidebarAddPageBtn = document.getElementById('sidebar-add-page-btn');
        if(sidebarAddPageBtn) {
            sidebarAddPageBtn.addEventListener('click', () => {
                this.addNewPageToBook();
            });
        }

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
            
            let lockHtml = nb.isLocked ? `<i data-lucide="lock" class="book-lock-icon"></i>` : '';
            
            card.innerHTML = `
                <div class="book-cover-design" style="background: ${nb.coverColor}; position: relative;">
                    ${lockHtml}
                    <div class="book-settings" title="Defter Ayarları" data-id="${nb.id}">
                        <i data-lucide="more-vertical"></i>
                    </div>
                    <div class="book-settings-menu" id="menu-${nb.id}">
                        <button class="toggle-pin-btn" data-id="${nb.id}">${nb.isLocked ? 'Şifreyi Kaldır' : 'Şifre Koy'}</button>
                    </div>
                    <h3 class="book-title">${nb.name}</h3>
                    <div class="book-date">Nisan 2026</div>
                </div>
            `;
            
            card.addEventListener('click', (e) => {
                if (e.target.closest('.book-settings') || e.target.closest('.book-settings-menu')) return;
                this.handleBookClick(nb);
            });

            const settingsBtn = card.querySelector('.book-settings');
            const settingsMenu = card.querySelector('.book-settings-menu');
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.book-settings-menu.active').forEach(m => {
                    if(m !== settingsMenu) m.classList.remove('active');
                });
                settingsMenu.classList.toggle('active');
            });

            const togglePinBtn = card.querySelector('.toggle-pin-btn');
            togglePinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                settingsMenu.classList.remove('active');
                this.openPinSetupModal(nb);
            });

            grid.appendChild(card);
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.book-settings-menu.active').forEach(m => m.classList.remove('active'));
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    createNewNotebook() {
        const name = document.getElementById('notebook-name').value || 'Yeni Günlük';
        const color = document.getElementById('notebook-color').value;
        const pattern = document.getElementById('notebook-pattern').value;

        const pages = [];
        for(let i = 1; i <= 2; i++) {
            pages.push({ id: 'pg-' + Date.now() + '-' + i, snapshot: null });
        }

        const newNb = {
            id: 'nb-' + Date.now(),
            name: name,
            coverColor: color,
            pattern: pattern,
            pages: pages,
            isLocked: false,
            pinCode: ''
        };
        this.notebooks.push(newNb);
        DatabaseManager.saveNotebooks(this.notebooks);
        this.renderLibrary();
    },

    handleBookClick(nb) {
        if(nb.isLocked && nb.pinCode) {
            this.openPinEntryModal(nb);
        } else {
            this.openBook(nb.id);
        }
    },

    openPinSetupModal(nb) {
        const modal = document.getElementById('pin-modal');
        const title = document.getElementById('pin-modal-title');
        const input = document.getElementById('pin-input');
        const btnSubmit = document.getElementById('btn-submit-pin');
        const btnCancel = document.getElementById('btn-cancel-pin');

        modal.classList.add('active');
        input.value = '';
        input.focus();

        if (nb.isLocked) {
            title.innerText = 'Mevcut PIN\'i Girin (Kaldırmak için)';
        } else {
            title.innerText = 'Yeni PIN Belirleyin';
        }

        const cleanup = () => {
            modal.classList.remove('active');
            btnSubmit.replaceWith(btnSubmit.cloneNode(true));
            btnCancel.replaceWith(btnCancel.cloneNode(true));
            input.classList.remove('shake');
        };

        const handleSubmit = () => {
            const val = input.value.trim();
            if(val.length !== 4 || isNaN(val)) {
                input.classList.add('shake');
                setTimeout(() => input.classList.remove('shake'), 300);
                return;
            }

            if(nb.isLocked) {
                if(val === nb.pinCode) {
                    nb.isLocked = false;
                    nb.pinCode = '';
                    DatabaseManager.saveNotebooks(this.notebooks);
                    this.renderLibrary();
                    cleanup();
                } else {
                    input.classList.add('shake');
                    input.value = '';
                    setTimeout(() => input.classList.remove('shake'), 300);
                }
            } else {
                nb.isLocked = true;
                nb.pinCode = val;
                DatabaseManager.saveNotebooks(this.notebooks);
                this.renderLibrary();
                cleanup();
            }
        };

        document.getElementById('btn-submit-pin').addEventListener('click', handleSubmit);
        document.getElementById('btn-cancel-pin').addEventListener('click', cleanup);
    },

    openPinEntryModal(nb) {
        const modal = document.getElementById('pin-modal');
        const title = document.getElementById('pin-modal-title');
        const input = document.getElementById('pin-input');
        const btnSubmit = document.getElementById('btn-submit-pin');
        const btnCancel = document.getElementById('btn-cancel-pin');

        modal.classList.add('active');
        input.value = '';
        input.focus();
        title.innerText = 'PIN Girin';

        const cleanup = () => {
            modal.classList.remove('active');
            btnSubmit.replaceWith(btnSubmit.cloneNode(true));
            btnCancel.replaceWith(btnCancel.cloneNode(true));
            input.classList.remove('shake');
        };

        const handleSubmit = () => {
            const val = input.value.trim();
            if(val === nb.pinCode) {
                cleanup();
                this.openBook(nb.id);
            } else {
                input.classList.add('shake');
                input.value = '';
                setTimeout(() => input.classList.remove('shake'), 300);
            }
        };

        document.getElementById('btn-submit-pin').addEventListener('click', handleSubmit);
        document.getElementById('btn-cancel-pin').addEventListener('click', cleanup);
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

        nb.pages.forEach((pageObj, index) => {
            let mediaHTML = '';
            if(pageObj.media && pageObj.media.length > 0) {
                pageObj.media.forEach(m => {
                    let inner = '';
                    if (m.type === 'text') inner = `<div class="media-content text-content">${m.content}</div>`;
                    else if (m.type === 'shape') {
                        let shapeClass = '';
                        if(m.content === 'square') shapeClass = 'shape-square';
                        else if(m.content === 'circle') shapeClass = 'shape-circle';
                        else if(m.content === 'line') shapeClass = 'shape-line';
                        else if(m.content === 'triangle') shapeClass = 'shape-triangle';
                        else if(m.content === 'star') shapeClass = 'shape-star';
                        else if(m.content === 'arrow') shapeClass = 'shape-arrow';
                        else if(m.content === 'diamond') shapeClass = 'shape-diamond';
                        inner = `<div class="media-content ${shapeClass}"></div>`;
                    }
                    else if (m.type === 'sticker') inner = `<div class="media-content"><div class="sticker" style="font-size: ${m.width/20}rem;">${m.content}</div></div>`;
                    else if (m.type === 'image') inner = `<div class="media-content"><img src="${m.content}"></div>`;

                    mediaHTML += `<div class="static-media" style="position:absolute; left:${m.x}px; top:${m.y}px; width:${m.width}px; height:${m.height}px; transform:rotate(${m.rotation || 0}deg); z-index:${m.zIndex}; pointer-events:none;">${inner}</div>`;
                });
            }

            bookDiv.innerHTML += `
                <div class="page pattern-${nb.pattern}" data-page="${pageObj.id}">
                    <div class="page-content">
                        ${mediaHTML}
                        <button class="edit-page-btn" title="Bu Sayfayı Düzenle"><i data-lucide="pencil"></i> Düzenle</button>
                        <div class="page-footer">${index + 1}</div>
                    </div>
                    <canvas class="drawing-layer" data-page="${pageObj.id}"></canvas>
                </div>
            `;
        });

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

        // Tüm canvas'ları re-render et
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

        // onFlip event'i: sayfa çevrildiğinde ekranda görünen canvas'ları redraw et
        if (window.pageFlip) {
            window.pageFlip.on('flip', (data) => {
                // Aktif (ekranda görünen) sayfaları al ve redraw et
                setTimeout(() => {
                    if (window.drawingPad) {
                        const pages = bookDiv.querySelectorAll('.page');
                        pages.forEach(page => {
                            const canvas = page.querySelector('.drawing-layer');
                            if (canvas) {
                                window.drawingPad.resizeCanvas(canvas);
                                window.drawingPad.redrawCanvas(canvas);
                            }
                        });
                    }
                }, 50);
            });
        }

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

        const timestamp = Date.now();
        const newPageId1 = 'pg-' + timestamp + '-1';
        const newPageId2 = 'pg-' + timestamp + '-2';
        nb.pages.push({ id: newPageId1, snapshot: null });
        nb.pages.push({ id: newPageId2, snapshot: null });
        
        // Notebooks'u DB'ye kaydet
        DatabaseManager.saveNotebooks(this.notebooks);
        
        if (this.currentPhase === 3) {
            this.refreshBookStructure(newPageId1);
        } else {
            this.openBook(this.activeNotebookId, currentIndex);
            setTimeout(() => {
                if(window.pageFlip) window.pageFlip.flip(nb.pages.length - 1);
            }, 150);
        }
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

        // Phase 2'ye dönüşte verileri DB'ye kaydet
        if(phase === 2) {
            DatabaseManager.saveNotebooks(this.notebooks);
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
        this.renderSidebar();
    },

    closeEditMode(skipPhaseSwitch = false) {
        if(this.activePageData) {
            const { parent, content, canvas } = this.activePageData;
            
            // Revert dynamic media to static to clean up DOM for Phase 2
            content.querySelectorAll('.transform-box').forEach(el => el.remove());
            
            const pageId = canvas.dataset.page;
            const nb = this.notebooks.find(n => n.id === this.activeNotebookId);
            if(nb) {
                const page = nb.pages.find(p => p.id === pageId);
                if(page && page.media) {
                    page.media.forEach(m => {
                        let inner = '';
                        if (m.type === 'text') inner = `<div class="media-content text-content">${m.content}</div>`;
                        else if (m.type === 'shape') {
                            let shapeClass = '';
                            if(m.content === 'square') shapeClass = 'shape-square';
                            else if(m.content === 'circle') shapeClass = 'shape-circle';
                            else if(m.content === 'line') shapeClass = 'shape-line';
                            else if(m.content === 'triangle') shapeClass = 'shape-triangle';
                            else if(m.content === 'star') shapeClass = 'shape-star';
                            else if(m.content === 'arrow') shapeClass = 'shape-arrow';
                            else if(m.content === 'diamond') shapeClass = 'shape-diamond';
                            inner = `<div class="media-content ${shapeClass}"></div>`;
                        }
                        else if (m.type === 'sticker') inner = `<div class="media-content"><div class="sticker" style="font-size: ${m.width/20}rem;">${m.content}</div></div>`;
                        else if (m.type === 'image') inner = `<div class="media-content"><img src="${m.content}"></div>`;

                        const staticDiv = document.createElement('div');
                        staticDiv.className = 'static-media';
                        staticDiv.style.cssText = `position:absolute; left:${m.x}px; top:${m.y}px; width:${m.width}px; height:${m.height}px; transform:rotate(${m.rotation || 0}deg); z-index:${m.zIndex}; pointer-events:none;`;
                        staticDiv.innerHTML = inner;
                        content.insertBefore(staticDiv, content.querySelector('.edit-page-btn'));
                    });
                }
            }

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
            // Canvas'ı orijinal yerine taşıdıktan hemen sonra redraw et
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const book = document.getElementById('book');
                    const nb = this.notebooks.find(n => n.id === this.activeNotebookId);
                    if (book && window.drawingPad && nb) {
                        // Tüm canvas'ları yeniden boyutlandır ve çiz
                        book.querySelectorAll('.drawing-layer').forEach(c => {
                            window.drawingPad.resizeCanvas(c);
                            window.drawingPad.redrawCanvas(c);
                        });
                        // PageFlip'i refresh et
                        if (window.pageFlip && typeof window.pageFlip.loadFromHTML === 'function') {
                            const pages = book.querySelectorAll('.page');
                            window.pageFlip.loadFromHTML(pages);
                        }
                        
                        // Veritabanını senkronize et: tüm sayfalar için globalHistory'yi kaydet
                        nb.pages.forEach(pageObj => {
                            const pageDrawings = window.drawingPad.globalHistory.filter(
                                d => d.notebookId === this.activeNotebookId && d.pageId === pageObj.id
                            );
                            DatabaseManager.syncDrawings(this.activeNotebookId, pageObj.id, window.drawingPad.globalHistory);
                        });
                    }
                    // Notebook bilgilerini kaydet
                    DatabaseManager.saveNotebooks(this.notebooks);
                }, 150);
            });
        }
    },

    navigateToPage(direction) {
        if(!this.activePageData) return;
        const currentPage = this.activePageData.parent;
        const pageId = currentPage.dataset.page;
        if(!pageId) return;

        const nb = this.notebooks.find(n => n.id === this.activeNotebookId);
        if(!nb) return;

        const currentIndex = nb.pages.findIndex(p => p.id === pageId);
        if(currentIndex === -1) return;

        const targetIndex = currentIndex + direction;
        if(targetIndex < 0 || targetIndex >= nb.pages.length) return;

        const targetPageId = nb.pages[targetIndex].id;
        const bookDiv = document.getElementById('book');
        const targetPageElement = bookDiv.querySelector(`.page[data-page="${targetPageId}"]`);
        
        if(targetPageElement) {
            this.openEditMode(targetPageElement);
        }
    },

    refreshBookStructure(targetPageId) {
        if (this.currentPhase === 3 && this.activePageData) {
            this.closeEditMode(true);
        }
        
        let currentIndex = 0;
        if(window.pageFlip) {
            currentIndex = window.pageFlip.getCurrentPageIndex();
        }
        
        this.openBook(this.activeNotebookId, currentIndex);
        if (this.currentPhase !== 3) {
            this.switchPhase(3);
        }
        
        if(targetPageId) {
            setTimeout(() => {
                const bookDiv = document.getElementById('book');
                const targetPageElement = bookDiv.querySelector(`.page[data-page="${targetPageId}"]`);
                if(targetPageElement) {
                    this.openEditMode(targetPageElement);
                }
            }, 100);
        }
        
        this.renderSidebar();
    },

    renderSidebar() {
        const container = document.getElementById('thumbnails-container');
        if(!container || !this.activeNotebookId) return;
        
        container.innerHTML = '';
        const nb = this.notebooks.find(n => n.id === this.activeNotebookId);
        if(!nb) return;

        const activePageId = this.activePageData ? this.activePageData.parent.dataset.page : null;

        nb.pages.forEach((pageObj, index) => {
            const card = document.createElement('div');
            card.className = 'thumbnail-card';
            card.draggable = true;
            if(pageObj.id === activePageId) {
                card.classList.add('active');
            }

            // Thumbnail içeriği
            card.innerHTML = `
                <div class="thumbnail-preview pattern-${nb.pattern}"></div>
                <div class="thumbnail-page-num">Sayfa ${index + 1}</div>
                <button class="delete-page-btn" title="Sayfayı Sil"><i data-lucide="trash-2"></i></button>
            `;

            // Mini Canvas oluştur
            const previewDiv = card.querySelector('.thumbnail-preview');
            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 450; 
            miniCanvas.height = 600;
            miniCanvas.style.width = '100%';
            miniCanvas.style.height = '100%';
            previewDiv.appendChild(miniCanvas);
            
            // Çizimleri yükle
            if (window.drawingPad && window.drawingPad.globalHistory) {
                const ctx = miniCanvas.getContext('2d');
                const strokes = window.drawingPad.globalHistory.filter(s => s.notebookId === nb.id && s.pageId === pageObj.id);
                strokes.forEach(stroke => {
                    if (stroke.points.length === 0) return;
                    ctx.beginPath();
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    let actualLineWidth = stroke.normSize * miniCanvas.width;
                    ctx.lineWidth = actualLineWidth;
                    if (stroke.mode === 'eraser') {
                        ctx.globalCompositeOperation = 'destination-out';
                        ctx.lineWidth = actualLineWidth * 2;
                    } else if (stroke.mode === 'highlighter') {
                        ctx.globalCompositeOperation = 'multiply';
                        ctx.strokeStyle = stroke.color;
                        ctx.globalAlpha = 0.4;
                        ctx.lineWidth = actualLineWidth * 3;
                    } else {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.strokeStyle = stroke.color;
                    }
                    ctx.moveTo(stroke.points[0].x * miniCanvas.width, stroke.points[0].y * miniCanvas.height);
                    for(let i = 1; i < stroke.points.length; i++) {
                        ctx.lineTo(stroke.points[i].x * miniCanvas.width, stroke.points[i].y * miniCanvas.height);
                    }
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = 'source-over';
                });
            }

            // Olaylar
            card.addEventListener('click', () => {
                if(pageObj.id !== activePageId) {
                    const bookDiv = document.getElementById('book');
                    const targetPageElement = bookDiv.querySelector(`.page[data-page="${pageObj.id}"]`);
                    if(targetPageElement) this.openEditMode(targetPageElement);
                }
            });

            const deleteBtn = card.querySelector('.delete-page-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if(nb.pages.length <= 1) {
                    alert('Bir defterde en az 1 sayfa bulunmalıdır!');
                    return;
                }
                
                // Silme işlemi
                nb.pages.splice(index, 1);
                
                // DB'den çizimleri sil
                if (window.drawingPad) {
                    window.drawingPad.globalHistory = window.drawingPad.globalHistory.filter(s => !(s.notebookId === nb.id && s.pageId === pageObj.id));
                    DatabaseManager.syncDrawings(nb.id, pageObj.id, []);
                }
                DatabaseManager.saveNotebooks(this.notebooks);
                
                // Eğer silinen sayfa şu an aktif olan sayfaysa, ilk sayfayı aç
                let targetPageId = activePageId;
                if(activePageId === pageObj.id) {
                    targetPageId = nb.pages[0].id;
                }
                this.refreshBookStructure(targetPageId);
            });

            // Sürükle Bırak (Drag & Drop)
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                card.classList.add('dragging');
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                container.querySelectorAll('.thumbnail-card').forEach(c => c.classList.remove('drag-over'));
            });
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                card.classList.add('drag-over');
            });
            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;
                if(fromIndex !== toIndex && !isNaN(fromIndex)) {
                    // Sayfaların yerini değiştir
                    const movedPage = nb.pages.splice(fromIndex, 1)[0];
                    nb.pages.splice(toIndex, 0, movedPage);
                    DatabaseManager.saveNotebooks(this.notebooks);
                    this.refreshBookStructure(activePageId);
                }
            });

            container.appendChild(card);
        });
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
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
            
            // Canvas sayfa numarası kontrolü
            if (!this.activeCanvas.dataset.page) {
                console.warn('Canvas sayfa numarası bulunamadı');
                return;
            }
            
            const pageId = this.activeCanvas.dataset.page;
            const notebookId = AppManager.activeNotebookId;
            
            this.globalHistory = this.globalHistory.filter(s => !(s.notebookId === notebookId && s.pageId === pageId));
            
            // Veritabanını senkronize et
            DatabaseManager.syncDrawings(notebookId, pageId, this.globalHistory);
            
            this.redrawCanvas(this.activeCanvas);
            if(typeof AppManager !== 'undefined') AppManager.renderSidebar();
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

        // Clear static media and spawn transform boxes
        pageContent.querySelectorAll('.static-media').forEach(el => el.remove());
        
        const pageId = canvas.dataset.page;
        const nb = AppManager.notebooks.find(n => n.id === AppManager.activeNotebookId);
        if(nb) {
            const page = nb.pages.find(p => p.id === pageId);
            if(page && page.media) {
                page.media.forEach(m => this.addMediaToPage(m, true));
            }
        }
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
        
        // Canvas sayfa numarası kontrolü
        if (!this.activeCanvas.dataset.page) {
            console.warn('Canvas sayfa numarası bulunamadı');
            return;
        }
        
        const pageId = this.activeCanvas.dataset.page;
        const notebookId = AppManager.activeNotebookId;

        // Aktif canvas'ın en son izini bul ve history'den çıkart
        for(let i = this.globalHistory.length -1; i >= 0; i--) {
            const stroke = this.globalHistory[i];
            if(stroke.notebookId === notebookId && stroke.pageId === pageId) {
                this.globalHistory.splice(i, 1);
                break;
            }
        }
        
        // Veritabanını senkronize et
        DatabaseManager.syncDrawings(notebookId, pageId, this.globalHistory);
        
        requestAnimationFrame(() => this.redrawCanvas(this.activeCanvas));
        if(typeof AppManager !== 'undefined') AppManager.renderSidebar();
    }

    redrawCanvas(canvas) {
        if(!canvas) return;
        
        // Canvas sayfa numarası kontrolü
        if (!canvas.dataset.page) {
            console.warn('Canvas sayfa numarası bulunamadı');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        
        const pageId = canvas.dataset.page;
        const notebookId = AppManager.activeNotebookId;

        const strokes = this.globalHistory.filter(s => s.notebookId === notebookId && s.pageId === pageId);
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
            ctx.globalAlpha = 1;
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
            activePointers.set(e.pointerId, e);
            if(activePointers.size >= 2) this.stopDrawing();
        }, { capture: true });

        container.addEventListener('pointermove', (e) => {
            if(activePointers.has(e.pointerId)) activePointers.set(e.pointerId, e);

            if(activePointers.size === 2) {
                e.preventDefault(); e.stopPropagation();
                const ptrs = Array.from(activePointers.values());
                const dist = getDistance(ptrs[0], ptrs[1]);

                if(initialDist === null) {
                    initialDist = dist;
                } else {
                    const scaleChange = dist / initialDist;
                    let newZoom = this.zoomLevel * scaleChange;
                    newZoom = Math.min(Math.max(1, newZoom), 10);

                    zoomWrapper.style.transform = `scale(${newZoom})`;
                    this.pendingZoom = newZoom;
                }
            }
        }, { capture: true });

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

        container.addEventListener('pointerup', pointerEnd, { capture: true });
        container.addEventListener('pointercancel', pointerEnd, { capture: true });
        container.addEventListener('pointerout', pointerEnd, { capture: true });

        // --- FARE TEKERLEĞİ (MOUSE WHEEL) İLE ZOOM ---
        container.addEventListener('wheel', (e) => {
            if(!this.isEditing) return;
            e.preventDefault(); // Sayfanın normalde kaymasını engeller
            
            const zoomSpeed = 0.15;
            // e.deltaY negatifse yukarı kaydırma (yakınlaş), pozitifse aşağı (uzaklaş)
            const direction = e.deltaY > 0 ? -1 : 1;
            
            let newZoom = this.zoomLevel + (direction * zoomSpeed);
            newZoom = Math.min(Math.max(1, newZoom), 10);
            
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
                    reader.onload = (event) => this.addMediaToPage({ type: 'image', content: event.target.result, width: 200, height: 200 });
                    reader.readAsDataURL(file);
                }
            });
        }

        // Tüm sticker ve emoji butonlarını yakala (hem menü hem modal)
        document.querySelectorAll('.sticker-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const emoji = btn.dataset.sticker;
                this.addMediaToPage({ type: 'sticker', content: emoji, width: 100, height: 100 });
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

        // Text ve Şekil Araçları
        const btnAddText = document.getElementById('btn-add-text');
        if (btnAddText) {
            btnAddText.addEventListener('click', () => {
                this.addMediaToPage({
                    type: 'text',
                    content: 'Yeni Metin',
                    width: 150,
                    height: 50
                });
            });
        }

        const shapeBtns = document.querySelectorAll('.shape-btn');
        shapeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const shapeType = btn.dataset.shape;
                this.addMediaToPage({
                    type: 'shape',
                    content: shapeType,
                    width: 100,
                    height: 100
                });
                // Dropdown'ı kapat (CSS hover ile hallediliyor olabilir, ama garanti olsun)
                const dropdown = document.getElementById('shape-dropdown');
                if (dropdown) {
                    const content = dropdown.querySelector('.dropdown-content');
                    content.style.display = 'none';
                    setTimeout(() => content.style.display = '', 100);
                }
            });
        });

        document.addEventListener('pointerdown', (e) => {
            if(!e.target.closest('.transform-box') && this.currentMode === 'hand') {
                document.querySelectorAll('.transform-box').forEach(el => {
                    el.classList.remove('selected');
                    // Eğer text edit modundaysa çık
                    const textContent = el.querySelector('.text-content');
                    if (textContent && textContent.isContentEditable) {
                        textContent.contentEditable = "false";
                        const zoomWrapper = document.getElementById('zoom-wrapper');
                        if(zoomWrapper) zoomWrapper.classList.remove('zoom-active');
                        // İçeriği güncelle ve kaydet
                        this.updateMediaData(el.dataset.id, { content: textContent.innerText });
                    }
                });
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
                this.addMediaToPage({ type: 'sticker', content: emoji, width: 100, height: 100 });
                document.getElementById('sticker-modal').classList.remove('active');
            });
            grid.appendChild(item);
        });
    }

    addMediaToPage(mediaData, isInitialLoad = false) {
        if(!this.activePageContent) return; 
        
        if (!mediaData.id) {
            mediaData.id = 'media-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            mediaData.x = 50;
            mediaData.y = 50;
            mediaData.width = mediaData.width || 100;
            mediaData.height = mediaData.height || 100;
            mediaData.rotation = 0;
            mediaData.zIndex = 10;
        }

        const wrapper = document.createElement('div');
        wrapper.className = isInitialLoad ? 'transform-box' : 'transform-box selected';
        wrapper.dataset.id = mediaData.id;
        wrapper.style.left = `${mediaData.x}px`;
        wrapper.style.top = `${mediaData.y}px`;
        wrapper.style.width = `${mediaData.width}px`;
        wrapper.style.height = `${mediaData.height}px`;
        wrapper.style.transform = `rotate(${mediaData.rotation}deg)`;
        wrapper.style.zIndex = mediaData.zIndex;
        
        let innerHTML = '';
        if (mediaData.type === 'text') {
            innerHTML = `<div class="media-content text-content" contenteditable="false">${mediaData.content}</div>`;
        } else if (mediaData.type === 'shape') {
            let shapeClass = '';
            if(mediaData.content === 'square') shapeClass = 'shape-square';
            else if(mediaData.content === 'circle') shapeClass = 'shape-circle';
            else if(mediaData.content === 'line') shapeClass = 'shape-line';
            else if(mediaData.content === 'triangle') shapeClass = 'shape-triangle';
            else if(mediaData.content === 'star') shapeClass = 'shape-star';
            else if(mediaData.content === 'arrow') shapeClass = 'shape-arrow';
            else if(mediaData.content === 'diamond') shapeClass = 'shape-diamond';
            innerHTML = `<div class="media-content ${shapeClass}"></div>`;
        } else if (mediaData.type === 'sticker') {
            innerHTML = `<div class="media-content"><div class="sticker" style="font-size: ${mediaData.width/20}rem;">${mediaData.content}</div></div>`;
        } else if (mediaData.type === 'image') {
            innerHTML = `<div class="media-content"><img src="${mediaData.content}"></div>`;
        }

        wrapper.innerHTML = `
            <div class="settings-toggle" title="Katman Ayarları"><i data-lucide="more-vertical"></i></div>
            <div class="media-controls">
                <button class="layer-btn" data-action="front" title="Öne Getir"><i data-lucide="arrow-up-to-line"></i></button>
                <button class="layer-btn" data-action="back" title="Arkaya Gönder"><i data-lucide="arrow-down-to-line"></i></button>
            </div>
            <div class="rotate-handle" title="Döndür"><i data-lucide="rotate-cw"></i></div>
            <div class="resize-handle resize-nw" data-resize="nw"></div>
            <div class="resize-handle resize-n" data-resize="n"></div>
            <div class="resize-handle resize-ne" data-resize="ne"></div>
            <div class="resize-handle resize-w" data-resize="w"></div>
            <div class="resize-handle resize-e" data-resize="e"></div>
            <div class="resize-handle resize-sw" data-resize="sw"></div>
            <div class="resize-handle resize-s" data-resize="s"></div>
            <div class="resize-handle resize-se" data-resize="se"></div>
            ${innerHTML}
        `;

        this.activePageContent.appendChild(wrapper);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        if (mediaData.type === 'text') {
            const textContent = wrapper.querySelector('.text-content');
            wrapper.addEventListener('dblclick', (e) => {
                if (this.currentMode !== 'hand') return;
                textContent.contentEditable = "true";
                textContent.focus();
                document.execCommand('selectAll', false, null);
                document.getSelection().collapseToEnd();
                
                const zoomWrapper = document.getElementById('zoom-wrapper');
                if(zoomWrapper) zoomWrapper.classList.add('zoom-active');
            });
            textContent.addEventListener('pointerdown', (e) => {
                if (textContent.isContentEditable) e.stopPropagation();
            });
            textContent.addEventListener('blur', () => {
                const zoomWrapper = document.getElementById('zoom-wrapper');
                if(zoomWrapper) zoomWrapper.classList.remove('zoom-active');
                
                this.updateMediaData(mediaData.id, { content: textContent.innerText });
            });
        }

        const settingsToggle = wrapper.querySelector('.settings-toggle');
        const mediaControls = wrapper.querySelector('.media-controls');
        if(settingsToggle && mediaControls) {
            settingsToggle.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                mediaControls.classList.toggle('active');
            });
        }

        this.setupTransformEngine(wrapper);

        if (!isInitialLoad) {
            this.saveMediaToDB(mediaData);
        }
    }

    setupTransformEngine(elem) {
        let isDragging = false, isResizing = false, isRotating = false;
        let startX, startY, startW, startH, startLeft, startTop, startAngle;
        let resizeDir = '';

        const rotateHandle = elem.querySelector('.rotate-handle');
        const resizeHandles = elem.querySelectorAll('.resize-handle');
        const mediaControls = elem.querySelector('.media-controls');

        if(mediaControls) {
            mediaControls.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                const action = e.target.closest('.layer-btn')?.dataset.action;
                let currentZ = parseInt(elem.style.zIndex) || 10;
                if(action === 'back') {
                    elem.style.zIndex = Math.max(-50, currentZ - 1);
                } else if(action === 'front') {
                    elem.style.zIndex = currentZ + 1;
                }
                this.updateMediaData(elem.dataset.id, { zIndex: parseInt(elem.style.zIndex) });
            });
        }

        elem.addEventListener('pointerdown', (e) => {
            if(this.currentMode !== 'hand') return; 
            e.stopPropagation(); 
            e.preventDefault();
            
            document.querySelectorAll('.transform-box').forEach(el => el.classList.remove('selected'));
            elem.classList.add('selected');

            startX = e.clientX;
            startY = e.clientY;
            startLeft = elem.offsetLeft;
            startTop = elem.offsetTop;
            startW = elem.offsetWidth;
            startH = elem.offsetHeight;

            // Extract current rotation
            const tr = window.getComputedStyle(elem).getPropertyValue("transform");
            if(tr !== 'none') {
                const values = tr.split('(')[1].split(')')[0].split(',');
                const a = values[0];
                const b = values[1];
                startAngle = Math.round(Math.atan2(b, a) * (180/Math.PI));
            } else {
                startAngle = 0;
            }

            if (e.target === rotateHandle) {
                isRotating = true;
            } else if (e.target.classList.contains('resize-handle')) {
                isResizing = true;
                resizeDir = e.target.dataset.resize;
            } else {
                isDragging = true;
            }
            elem.setPointerCapture(e.pointerId);
        });

        elem.addEventListener('pointermove', (e) => {
            if (!isDragging && !isResizing && !isRotating) return;
            e.stopPropagation();

            const dx = (e.clientX - startX) / this.zoomLevel;
            const dy = (e.clientY - startY) / this.zoomLevel;

            if (isDragging) {
                elem.style.left = `${startLeft + dx}px`;
                elem.style.top = `${startTop + dy}px`;
            } else if (isResizing) {
                let newW = startW, newH = startH, newL = startLeft, newT = startTop;
                
                // Calculate dimensions and positions based on direction
                if (resizeDir.includes('e')) {
                    newW = startW + dx;
                }
                if (resizeDir.includes('w')) {
                    newW = startW - dx;
                    newL = startLeft + dx;
                }
                if (resizeDir.includes('s')) {
                    newH = startH + dy;
                }
                if (resizeDir.includes('n')) {
                    newH = startH - dy;
                    newT = startTop + dy;
                }
                
                // Enforce minimum size (prevent flipping)
                if(newW < 20) { newW = 20; if(resizeDir.includes('w')) newL = startLeft + startW - 20; }
                if(newH < 20) { newH = 20; if(resizeDir.includes('n')) newT = startTop + startH - 20; }
                
                elem.style.width = `${newW}px`;
                elem.style.left = `${newL}px`;
                elem.style.height = `${newH}px`;
                elem.style.top = `${newT}px`;
                
                // Update sticker font size
                const sticker = elem.querySelector('.sticker');
                if(sticker) sticker.style.fontSize = `${Math.max(20, newW)/20}rem`; 
            } else if (isRotating) {
                const rect = elem.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                elem.style.transform = `rotate(${angle + 90}deg)`;
            }
        });

        elem.addEventListener('pointerup', () => { 
            if(isDragging || isResizing || isRotating) {
                // Save state to DB
                const currentAngleStr = elem.style.transform.match(/rotate\(([-\d.]+)deg\)/);
                const currentAngle = currentAngleStr ? parseFloat(currentAngleStr[1]) : startAngle;
                this.updateMediaData(elem.dataset.id, {
                    x: elem.offsetLeft,
                    y: elem.offsetTop,
                    width: elem.offsetWidth,
                    height: elem.offsetHeight,
                    rotation: currentAngle
                });
            }
            isDragging = false; isResizing = false; isRotating = false; 
        });
    }

    saveMediaToDB(mediaData) {
        if (!AppManager.activeNotebookId || !this.activeCanvas) return;
        const pageId = this.activeCanvas.dataset.page;
        const nb = AppManager.notebooks.find(n => n.id === AppManager.activeNotebookId);
        if(!nb) return;
        const page = nb.pages.find(p => p.id === pageId);
        if(!page) return;
        if(!page.media) page.media = [];
        page.media.push(mediaData);
        DatabaseManager.saveNotebooks(AppManager.notebooks);
    }

    updateMediaData(mediaId, updates) {
        if (!AppManager.activeNotebookId || !this.activeCanvas) return;
        const pageId = this.activeCanvas.dataset.page;
        const nb = AppManager.notebooks.find(n => n.id === AppManager.activeNotebookId);
        if(!nb) return;
        const page = nb.pages.find(p => p.id === pageId);
        if(!page || !page.media) return;
        const media = page.media.find(m => m.id === mediaId);
        if(media) {
            Object.assign(media, updates);
            DatabaseManager.saveNotebooks(AppManager.notebooks);
        }
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
        
        // Canvas sayfa numarası kontrolü
        if (!canvas.dataset.page) {
            console.warn('Canvas sayfa numarası bulunamadı');
            return;
        }
        
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        canvas.setPointerCapture(e.pointerId);
        this.isDrawing = true;
        
        const rect = canvas.getBoundingClientRect();
        const unX = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
        const unY = Math.min(Math.max(0, (e.clientY - rect.top) / rect.height), 1);
        
        let cColor = this.color;

        const pageId = canvas.dataset.page;
        const notebookId = AppManager.activeNotebookId;

        this.currentStroke = {
            mode: this.currentMode,
            color: cColor,
            normSize: this.size / rect.width, 
            points: [{x: unX, y: unY, thicknessMultiplier: 1}],
            notebookId: notebookId,
            pageId: pageId,
            _saved: false
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
            // Veritabanını senkronize et (tüm diziyi güvenli şekilde kaydet)
            const notebookId = this.currentStroke.notebookId;
            const pageId = this.currentStroke.pageId;
            DatabaseManager.syncDrawings(notebookId, pageId, this.globalHistory);
            
            if(typeof AppManager !== 'undefined') AppManager.renderSidebar();
        }
        this.currentStroke = null;
    }
}

// Ana Kurulum
document.addEventListener("DOMContentLoaded", async function() {
    // Veritabanını başlat
    await DatabaseManager.init();
    
    // AppManager ve DrawingPad'ı başlat
    AppManager.init();

    setTimeout(async () => {
        window.drawingPad = new DrawingPad();
        
        // Veritabanından çizimleri yükle
        const savedDrawings = await DatabaseManager.loadDrawings();
        if (savedDrawings && savedDrawings.length > 0) {
            window.drawingPad.globalHistory = savedDrawings;
        }
    }, 100);
});
