// Çizim işlemlerini yönetecek modüler sınıf (İleride veritabanı eklemek için ideal yapı)
class DrawingPad {
    constructor(pageFlipInstance) {
        this.pageFlip = pageFlipInstance; // StPageFlip referansını alıyoruz
        this.canvases = document.querySelectorAll('.drawing-layer');
        this.currentMode = 'hand'; // Seçili mod: hand, pen, eraser
        this.color = '#333333';
        this.size = 3;
        this.isDrawing = false;
        
        this.contexts = []; // Canvas 2D içeriklerini tutar

        this.initToolbar();
        this.initCanvases();
        this.initPageFlipProtector();
    }

    initToolbar() {
        const tools = document.querySelectorAll('.tool-btn:not(.danger)');
        const colorPicker = document.getElementById('color-picker');
        const sizePicker = document.getElementById('size-picker');
        const clearBtn = document.getElementById('clear-btn');

        // Mod Değiştirme (Kalem, Silgi, Sayfa Çevirme vb.)
        tools.forEach(btn => {
            btn.addEventListener('click', () => {
                // Sadece araç butonlarının active sınıfını sıfırla
                tools.forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                this.setMode(btn.dataset.tool);
            });
        });

        const colorButtons = document.querySelectorAll('.color-btn');

        // Hazır Rek Seçim Paleti Yönetimi
        colorButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Sadece butonları pasif yap ve tıklananı aktif et
                colorButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.color = btn.dataset.color;
                colorPicker.value = this.color; // color-picker kutusunu da aynı renkle güncelle
                
                // Renk seçildiyse muhtemelen kalemle çizim yapılacaktır, el aracı vb. varsa otomatik kaleme geçir
                const penBtn = document.querySelector('[data-tool="pen"]');
                if(!penBtn.classList.contains('active')) penBtn.click();
            });
        });

        // Özel Renk (Picker) ve Kalınlık Ayarları
        colorPicker.addEventListener('input', (e) => {
            this.color = e.target.value;
            // Özel renk seçildiğinde hazır renk butonlarındaki 'active' durumunu kaldır
            colorButtons.forEach(b => b.classList.remove('active'));
            // Kaleme geçir
            const penBtn = document.querySelector('[data-tool="pen"]');
            if(!penBtn.classList.contains('active')) penBtn.click();
        });
        sizePicker.addEventListener('input', (e) => this.size = e.target.value);
        
        // Temizleme Butonu
        clearBtn.addEventListener('click', () => this.clearActiveCanvas());
    }

    initCanvases() {
        this.canvases.forEach((canvas) => {
            const ctx = canvas.getContext('2d');
            this.contexts.push(ctx);

            // Z-Index ve dokunmatik eylem (Scrolling engeli) ayarları
            canvas.style.zIndex = "100";
            canvas.style.touchAction = "none";

            // Başlangıç çözünürlük ayarı (Yüksek kalite için)
            this.resizeCanvas(canvas);
            
            // Tarayıcı boyutu değiştiğinde içerideki piksellenmeyi önlemek için
            window.addEventListener('resize', () => this.resizeCanvas(canvas));

            // Pürüzsüz tablet/fare Çizim Olayları (Pointer Events)
            canvas.addEventListener('pointerdown', (e) => this.startDrawing(e, canvas, ctx), { passive: false });
            canvas.addEventListener('pointermove', (e) => this.draw(e, canvas, ctx), { passive: false });
            canvas.addEventListener('pointerup', () => this.stopDrawing());
            canvas.addEventListener('pointerout', () => this.stopDrawing());
            canvas.addEventListener('pointercancel', () => this.stopDrawing());

            // EXTRA: stPageFlip kütüphanesi mobilde veya eski tarayıcılarda touchstart/mousedown 
            // olaylarına tepki verdiğinden çizim modunda onları da blokluyoruz.
            canvas.addEventListener('touchstart', (e) => { if(this.currentMode !== 'hand') e.stopPropagation(); }, { passive: false });
            canvas.addEventListener('mousedown', (e) => { if(this.currentMode !== 'hand') e.stopPropagation(); });
        });
    }

    initPageFlipProtector() {
        // Hand Mode (El Aracı) seçili DEĞİLKEN stpageflip'i tamamen kitlemek için
        const book = document.getElementById("book");
        if(book) {
            ['pointerdown', 'touchstart', 'mousedown'].forEach(evt => {
                book.addEventListener(evt, (e) => {
                    if (this.currentMode !== 'hand') {
                        // Kritik HATA ÇÖZÜMÜ: Eğer kullanıcı Canvas üzerinden tetikliyorsa 
                        // capture phase'de durdurma! Çizim başlayabilsin.
                        if (!e.target.classList.contains('drawing-layer')) {
                            e.stopPropagation();
                        }
                    }
                }, true); 
            });
        }
    }

    resizeCanvas(canvas) {
        // Canvas'ın HTML üzerinde kapladığı yeri öğrenip kendi dahili çözünürlüğünü (width, height) buna eşitliyoruz
        // Eğer pageFlip tam render olmadığı için width 0 ise varsayılan değere ayarlanıyor
        const rect = canvas.parentElement.getBoundingClientRect();
        
        if(rect.width > 0) {
            // Çizimlerin silinmemesi için geçici bir tuvale eskiyi kaydedebiliriz
            // Ancak resize çok dinamik olduğundan performansı korumak adına
            // stpageflip genelde boyutu fixed tutar. Yine de koruma olarak alıyoruz:
            const temp = document.createElement('canvas');
            const tCtx = temp.getContext('2d');
            temp.width = canvas.width;
            temp.height = canvas.height;
            tCtx.drawImage(canvas, 0, 0);

            canvas.width = rect.width;
            canvas.height = rect.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(temp, 0, 0, temp.width, temp.height, 0, 0, canvas.width, canvas.height);
        }
    }

    setMode(mode) {
        this.currentMode = mode;
        
        // En kritik nokta: 'hand' modunda canvas eventleri yoksayılır,
        // Böylece sayfalar stPageFlip ile çevrilebilir.
        // Diğer modlarda event yakalanır, sayfa dönmez.
        this.canvases.forEach(canvas => {
            if (this.currentMode === 'hand') {
                canvas.style.pointerEvents = 'none';
            } else {
                canvas.style.pointerEvents = 'auto';
            }
        });
    }

    startDrawing(e, canvas, ctx) {
        if (this.currentMode === 'hand') return; 
        
        // StPageFlip ve tarayıcı kaydırmayı engelleme
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Mouse/Pen'i dışarı çıksa dahi takip eder
        canvas.setPointerCapture(e.pointerId);

        this.isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        
        // Ebatlar büyüp küçüldüğündeki sapmayı minimuma indirmek için scale hesabı
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        ctx.beginPath();
        ctx.moveTo(x, y);
        this.configureContext(ctx);
        
        // Tıklandığı gibi bir nokta oluşturması için:
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    draw(e, canvas, ctx) {
        if (!this.isDrawing) return;
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        ctx.lineTo(x, y);
        ctx.stroke();
    }

    stopDrawing() {
        this.isDrawing = false;
    }

    configureContext(ctx) {
        // Çizgilerin köşeli değil 'round' uçlu olmasını sağlayan ayarlar
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = this.size;

        if (this.currentMode === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = this.size * 2; // Silgi ucu kaleme göre biraz daha büyüktür
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = this.color;
        }
    }

    clearActiveCanvas() {
        // Tüm alanları siler (sadece o anki aktif görünenleri veya hepsini tercih edebilirsiniz)
        // Burada kolaylık olsun diye projede var olan tüm canvasları siliyoruz
        this.canvases.forEach(canvas => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }
}

// Sayfa yüklendiğinde çalışacak ana kurulum alanı
document.addEventListener("DOMContentLoaded", function() {
    
    // 1) Defter div'ini alıyoruz
    const bookContainer = document.getElementById("book");

    // 2) PageFlip nesnesini oluşturuyoruz
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

    // 3) PageFlip'i sayfalara uyguluyoruz
    pageFlip.loadFromHTML(document.querySelectorAll(".page"));

    // 4) Çizim Pad modülünü tam sayfa nesneleri yüklendikten sonra ayağa kaldırıyoruz
    // StPageFlip referansını DrawingPad içine yolluyoruz
    setTimeout(() => {
        window.drawingPad = new DrawingPad(pageFlip);
    }, 100);

    // PageFlip tamamlandığında canvasları refreshle (iç çözünürlük ile görüntülenen otursun diye)
    pageFlip.on('init', () => {
         // eğer timeout yetmezse...
         if(window.drawingPad) {
            window.drawingPad.canvases.forEach(c => window.drawingPad.resizeCanvas(c));
         }
    });
});
