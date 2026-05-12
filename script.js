document.addEventListener('DOMContentLoaded', function() {
    const barcodeInput = document.getElementById('barcode');
    const searchBarcodeBtn = document.getElementById('search-barcode');
    const categoryButtons = document.getElementById('category-buttons');
    const deviceList = document.getElementById('device-list');
    const productDetail = document.getElementById('product-detail');
    const stockInBtn = document.getElementById('stock-in');
    const stockOutBtn = document.getElementById('stock-out');
    const notifications = document.getElementById('notifications');

    let inventoryItems = [];
    let currentProduct = null;
    let currentCategoryFilter = 'all';
    let numpadRoot = null;
    let isBarcodeNotFoundState = false;

    fetchInventory();

    function buildBarcodeNumpad() {
        if (numpadRoot) return;

        const root = document.createElement('div');
        root.id = 'barcode-numpad';
        root.className = 'barcode-numpad';
        root.setAttribute('aria-hidden', 'true');

        root.innerHTML = `
            <div class="barcode-numpad-panel" role="dialog" aria-label="バーコード入力テンキー">
                <div class="barcode-numpad-head">
                    <button type="button" class="numpad-close" data-key="close" aria-label="閉じる">×</button>
                </div>
                <div class="barcode-numpad-grid">
                    <button type="button" data-key="7">7</button>
                    <button type="button" data-key="8">8</button>
                    <button type="button" data-key="9">9</button>
                    <button type="button" data-key="4">4</button>
                    <button type="button" data-key="5">5</button>
                    <button type="button" data-key="6">6</button>
                    <button type="button" data-key="1">1</button>
                    <button type="button" data-key="2">2</button>
                    <button type="button" data-key="3">3</button>
                    <button type="button" class="numpad-secondary" data-key="clear">C</button>
                    <button type="button" data-key="0">0</button>
                    <button type="button" class="numpad-secondary" data-key="backspace">⌫</button>
                </div>
                <div class="barcode-numpad-foot">
                    <button type="button" class="numpad-enter" data-key="enter">検索</button>
                </div>
            </div>
        `;

        root.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            const key = target.dataset.key;
            if (!key) return;

            if (key === 'close') {
                hideBarcodeNumpad();
                return;
            }

            if (key === 'clear') {
                barcodeInput.value = '';
                barcodeInput.focus();
                return;
            }

            if (key === 'backspace') {
                barcodeInput.value = barcodeInput.value.slice(0, -1);
                barcodeInput.focus();
                return;
            }

            if (key === 'enter') {
                hideBarcodeNumpad();
                searchByBarcode();
                return;
            }

            barcodeInput.value += key;
            barcodeInput.focus();
        });

        document.body.appendChild(root);
        numpadRoot = root;
    }

    function showBarcodeNumpad() {
        if (!numpadRoot) return;
        numpadRoot.classList.add('visible');
        numpadRoot.setAttribute('aria-hidden', 'false');
    }

    function hideBarcodeNumpad() {
        if (!numpadRoot) return;
        numpadRoot.classList.remove('visible');
        numpadRoot.setAttribute('aria-hidden', 'true');
    }

    buildBarcodeNumpad();

    barcodeInput.addEventListener('focus', () => {
        showBarcodeNumpad();
        if (isBarcodeNotFoundState && !currentProduct) {
            isBarcodeNotFoundState = false;
            clearProduct();
        }
    });
    barcodeInput.addEventListener('touchstart', showBarcodeNumpad, { passive: true });

    document.addEventListener('mousedown', (event) => {
        if (!numpadRoot || !numpadRoot.classList.contains('visible')) return;
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (target === barcodeInput || barcodeInput.contains(target) || numpadRoot.contains(target)) return;
        hideBarcodeNumpad();
    });

    document.addEventListener('touchstart', (event) => {
        if (!numpadRoot || !numpadRoot.classList.contains('visible')) return;
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (target === barcodeInput || barcodeInput.contains(target) || numpadRoot.contains(target)) return;
        hideBarcodeNumpad();
    }, { passive: true });

    // External barcode reader (keyboard wedge) or manual text search.
    searchBarcodeBtn.addEventListener('click', () => {
        hideBarcodeNumpad();
        if (!barcodeInput.value.trim()) {
            showNotification('外付けバーコードリーダーで読み取り、またはコードを入力してください', 'out');
            return;
        }
        searchByBarcode();
    });
    barcodeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchByBarcode();
        }
    });

    stockInBtn.addEventListener('click', () => updateStock('in'));
    stockOutBtn.addEventListener('click', () => updateStock('out'));

    function normalizeBarcodeInput(value) {
        if (!value) return '';
        return value
            .replace(/[\u3000]/g, ' ')
            .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
            .trim();
    }

    async function openCameraScanner() {
        // Secure context is required for camera on most devices.
        if (!window.isSecureContext) {
            showNotification('カメラを使うには https または localhost で開いてください', 'out');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            showNotification('この端末/ブラウザはカメラに対応していません', 'out');
            return;
        }
        if (!('BarcodeDetector' in window)) {
            showNotification('この端末/ブラウザはカメラ読取に未対応です', 'out');
            return;
        }

        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,0.75)',
            'z-index:9999',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:16px'
        ].join(';');

        const panel = document.createElement('div');
        panel.style.cssText = [
            'width:min(720px, 100%)',
            'background:rgba(23,23,23,0.95)',
            'border:1px solid rgba(255,255,255,0.14)',
            'border-radius:16px',
            'overflow:hidden',
            'box-shadow:0 25px 50px -12px rgba(0,0,0,0.65)'
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:space-between',
            'padding:12px 14px',
            'border-bottom:1px solid rgba(255,255,255,0.10)',
            'gap:12px'
        ].join(';');

        const title = document.createElement('div');
        title.textContent = 'カメラでバーコード読み取り';
        title.style.cssText = 'font-weight:900;color:#f5f5f5;font-size:14px;';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '閉じる';
        closeBtn.style.cssText = [
            'border:1px solid rgba(255,255,255,0.14)',
            'background:rgba(255,255,255,0.06)',
            'color:#f5f5f5',
            'padding:8px 12px',
            'border-radius:12px',
            'font-weight:900',
            'cursor:pointer'
        ].join(';');

        const videoWrap = document.createElement('div');
        videoWrap.style.cssText = 'position:relative;background:#000;';

        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.autoplay = true;
        video.style.cssText = 'width:100%;height:auto;display:block;aspect-ratio:16/10;object-fit:cover;';

        const hint = document.createElement('div');
        hint.textContent = 'バーコードを枠内に入れてください';
        hint.style.cssText = [
            'position:absolute',
            'left:12px',
            'right:12px',
            'bottom:12px',
            'background:rgba(0,0,0,0.45)',
            'color:#fff',
            'padding:10px 12px',
            'border-radius:12px',
            'font-weight:700',
            'font-size:12px'
        ].join(';');

        header.appendChild(title);
        header.appendChild(closeBtn);
        videoWrap.appendChild(video);
        videoWrap.appendChild(hint);
        panel.appendChild(header);
        panel.appendChild(videoWrap);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        let stream;
        let rafId = 0;
        const detector = new BarcodeDetector({
            formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'qr_code']
        });

        const cleanup = () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
                stream = undefined;
            }
            overlay.remove();
        };

        closeBtn.addEventListener('click', cleanup);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup();
        });

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            });
            video.srcObject = stream;
            await video.play();
        } catch (e) {
            cleanup();
            showNotification('カメラ権限が拒否されました', 'out');
            return;
        }

        const tick = async () => {
            if (!video.videoWidth) {
                rafId = requestAnimationFrame(tick);
                return;
            }
            try {
                const barcodes = await detector.detect(video);
                if (barcodes && barcodes.length > 0) {
                    const value = (barcodes[0].rawValue || '').trim();
                    if (value) {
                        barcodeInput.value = value;
                        cleanup();
                        searchByBarcode();
                        return;
                    }
                }
            } catch {
                // ignore transient detection errors
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    }

    function fetchInventory() {
        fetch('/api/inventory')
            .then(response => response.json())
            .then(data => {
                inventoryItems = data.map(item => ({
                    ...item.product,
                    quantity: item.quantity,
                    displayCategory: mapCategory(item.product.category)
                }));
                renderCategoryButtons();
                renderDeviceList();
            })
            .catch(error => console.error('Error loading inventory:', error));
    }

    function mapCategory(category) {
        if (category === 'マウス' || category === 'セキュリティワイヤー') {
            return '消耗品';
        }
        if (category === '一体型PC') {
            return '一体型';
        }
        return category;
    }

    function renderCategoryButtons() {
        const categories = ['all', '消耗品', 'ノートPC', '一体型', 'モニター'];
        categoryButtons.innerHTML = '';

        categories.forEach(category => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'category-button';
            button.textContent = category === 'all' ? 'すべて' : category;
            if (category === currentCategoryFilter) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                currentCategoryFilter = category;
                renderCategoryButtons();
                renderDeviceList();
            });
            categoryButtons.appendChild(button);
        });
    }

    function renderDeviceList() {
        deviceList.innerHTML = '';
        const displayOrder = ['消耗品', 'ノートPC', '一体型', 'モニター'];
        const grouped = inventoryItems.reduce((acc, item) => {
            acc[item.displayCategory] = acc[item.displayCategory] || [];
            acc[item.displayCategory].push(item);
            return acc;
        }, {});

        displayOrder.forEach(category => {
            if (currentCategoryFilter !== 'all' && currentCategoryFilter !== category) return;
            if (!grouped[category] || grouped[category].length === 0) return;

            const heading = document.createElement('div');
            heading.className = 'list-section-heading';
            heading.textContent = category;
            deviceList.appendChild(heading);

            grouped[category].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
            grouped[category].forEach(item => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'device-card';
                card.innerHTML = `
                    <div class="device-card-header">
                        <div class="device-name">${item.name}</div>
                        <div class="device-meta device-stock">
                            <span><strong>${item.quantity}</strong> 在庫</span>
                        </div>
                    </div>
                    <div class="device-meta">
                        <span><strong>ID:</strong> ${item.barcode}</span>
                        <span><strong>カテゴリー:</strong> ${item.displayCategory}</span>
                        <span><strong>メーカー:</strong> ${item.manufacturer}</span>
                    </div>
                `;
                card.addEventListener('click', () => {
                    document.querySelectorAll('.device-card').forEach(node => node.classList.remove('active'));
                    card.classList.add('active');
                    selectProduct(item.id);
                });
                deviceList.appendChild(card);
            });
        });

        if (deviceList.innerHTML === '') {
            deviceList.innerHTML = '<div class="placeholder"><p>選択中のカテゴリに該当する製品はありません。</p></div>';
        }
    }

    function selectProduct(productId) {
        const product = inventoryItems.find(item => item.id === productId);
        if (!product) return;
        isBarcodeNotFoundState = false;
        currentProduct = product;

        productDetail.innerHTML = `
            <div class="product-header">
                <div class="product-info">
                    <span class="category-label">${product.displayCategory}</span>
                    <h1 class="product-name">${product.name}</h1>
                </div>
                <button id="clear-product" class="clear-btn">CLEAR</button>
            </div>
            <div class="product-tags">
                <span class="tag maker">バーコードID: ${product.barcode}</span>
                <span class="tag id">メーカー: ${product.manufacturer}</span>
                <span class="tag id">現在庫: ${product.quantity}</span>
            </div>
            <div class="quantity-adjust">
                <span class="section-label">Adjust Quantity</span>
                <div class="quantity-controls">
                    <button id="quantity-minus" class="quantity-btn">-</button>
                    <input type="number" id="quantity" min="1" value="1" class="quantity-input">
                    <button id="quantity-plus" class="quantity-btn">+</button>
                </div>
            </div>
        `;

        document.getElementById('clear-product').addEventListener('click', clearProduct);
        document.getElementById('quantity-minus').addEventListener('click', () => adjustQuantity(-1));
        document.getElementById('quantity-plus').addEventListener('click', () => adjustQuantity(1));
        document.getElementById('quantity').addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (val < 1) e.target.value = 1;
        });
    }

    function renderDefaultPlaceholder() {
        productDetail.innerHTML = `
            <div class="placeholder">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <p>製品を選択してください</p>
                <p class="description">左側の機器一覧から、バーコードを使わずに製品を選択できます。</p>
            </div>
        `;
    }

    function renderBarcodeNotFoundPlaceholder() {
        productDetail.innerHTML = `
            <div class="placeholder">
                <p>このバーコードは存在しません。もう一度正しく入力してください。</p>
            </div>
        `;
    }

    function clearProduct() {
        currentProduct = null;
        isBarcodeNotFoundState = false;
        renderDefaultPlaceholder();
    }

    function adjustQuantity(delta) {
        const quantityElement = document.getElementById('quantity');
        if (!quantityElement) return;
        const current = parseInt(quantityElement.value) || 1;
        quantityElement.value = Math.max(1, current + delta);
    }

    function searchByBarcode() {
        const barcode = normalizeBarcodeInput(barcodeInput.value);
        if (!barcode) return;

        // Keep the visible input consistent with what is searched.
        barcodeInput.value = barcode;

        fetch('/api/barcode/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode })
        })
        .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Product not found');
            }
            return payload;
        })
        .then(product => {
            isBarcodeNotFoundState = false;
            selectProduct(product.id);
            barcodeInput.value = '';
        })
        .catch(() => {
            currentProduct = null;
            isBarcodeNotFoundState = true;
            renderBarcodeNotFoundPlaceholder();
        });
    }

    function updateStock(action) {
        if (!currentProduct) {
            showNotification('製品を選択してください', 'out');
            return;
        }

        const quantityElement = document.getElementById('quantity');
        const quantity = Math.max(1, parseInt(quantityElement.value) || 1);

        fetch('/api/inventory/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: currentProduct.id, action, quantity })
        })
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                showNotification(`${currentProduct.name} を ${quantity}個 ${action === 'in' ? '入庫' : '出庫'}しました。`, action);
                clearProduct();
                fetchInventory();
            } else {
                showNotification(data.error, 'out');
            }
        })
        .catch(error => console.error('Error updating stock:', error));
    }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `<div class="notification-icon"></div><span class="notification-message">${message}</span>`;
        notifications.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    }
});