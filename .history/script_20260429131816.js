document.addEventListener('DOMContentLoaded', function() {
    const barcodeInput = document.getElementById('barcode');
    const searchBarcodeBtn = document.getElementById('search-barcode');
    const quickBtns = document.querySelectorAll('.quick-btn');
    const clearBtn = document.getElementById('clear-product');
    const quantityMinusBtn = document.getElementById('quantity-minus');
    const quantityPlusBtn = document.getElementById('quantity-plus');
    const stockInBtn = document.getElementById('stock-in');
    const stockOutBtn = document.getElementById('stock-out');
    const productDetail = document.getElementById('product-detail');
    const productSection = document.getElementById('product-section');
    const notifications = document.getElementById('notifications');

    function getQuantityInput() {
        return document.getElementById('quantity');
    }

    let products = [];
    let currentProduct = null;
    let notificationsList = [];

    // Load products
    loadProducts();

    // Event listeners
    searchBarcodeBtn.addEventListener('click', searchByBarcode);
    barcodeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchByBarcode();
        }
    });

    quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const productId = parseInt(btn.dataset.productId);
            selectProduct(productId);
        });
    });

    clearBtn.addEventListener('click', clearProduct);
    if (quantityMinusBtn) quantityMinusBtn.addEventListener('click', () => adjustQuantity(-1));
    if (quantityPlusBtn) quantityPlusBtn.addEventListener('click', () => adjustQuantity(1));
    const initialQuantityInput = getQuantityInput();
    if (initialQuantityInput) {
        initialQuantityInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (val < 1) e.target.value = 1;
        });
    }

    stockInBtn.addEventListener('click', () => updateStock('in'));
    stockOutBtn.addEventListener('click', () => updateStock('out'));

    // Focus barcode input on load
    barcodeInput.focus();

    function loadProducts() {
        fetch('/api/products')
            .then(response => response.json())
            .then(data => {
                products = data;
                // Map quick buttons to products (assuming first 5 products)
                quickBtns.forEach((btn, index) => {
                    if (products[index]) {
                        btn.dataset.productId = products[index].id;
                    }
                });
            })
            .catch(error => console.error('Error loading products:', error));
    }

    function searchByBarcode() {
        const barcode = barcodeInput.value.trim();
        if (!barcode) return;

        fetch('/api/barcode/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode })
        })
        .then(response => response.json())
        .then(product => {
            selectProduct(product.id);
            barcodeInput.value = '';
        })
        .catch(error => {
            showNotification('製品が見つかりません', 'out');
            console.error('Error searching by barcode:', error);
        });
    }

    function selectProduct(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        currentProduct = product;

        // Update UI
        productDetail.innerHTML = `
            <div class="product-header">
                <div class="product-info">
                    <span class="category-label">${product.category}</span>
                    <h1 class="product-name">${product.name}</h1>
                </div>
                <button id="clear-product" class="clear-btn">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                </button>
            </div>

            <div class="product-tags">
                <span class="tag maker">Maker: ${product.manufacturer}</span>
                <span class="tag id">ID: ${product.id}</span>
            </div>

            <div class="quantity-adjust">
                <span class="section-label">Adjust Quantity</span>
                <div class="quantity-controls">
                    <button id="quantity-minus" class="quantity-btn">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M5 12h14"></path>
                        </svg>
                    </button>
                    <input type="number" id="quantity" min="1" value="1" class="quantity-input">
                    <button id="quantity-plus" class="quantity-btn">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M12 5v14"></path>
                            <path d="M5 12h14"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Re-attach event listeners
        document.getElementById('clear-product').addEventListener('click', clearProduct);
        document.getElementById('quantity-minus').addEventListener('click', () => adjustQuantity(-1));
        document.getElementById('quantity-plus').addEventListener('click', () => adjustQuantity(1));
        document.getElementById('quantity').addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (val < 1) e.target.value = 1;
        });

        // Update quick button active state
        quickBtns.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.productId) === productId);
        });
    }

    function clearProduct() {
        currentProduct = null;
        quantityInput.value = 1;

        quickBtns.forEach(btn => btn.classList.remove('active'));

        // Show placeholder
        showPlaceholder();
    }

    function showPlaceholder() {
        productDetail.innerHTML = `
            <div class="placeholder">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <p>スキャンしてください</p>
                <p class="description">製品バーコードを読み取るか、左のリストから消耗品を選択してください</p>
            </div>
        `;
    }

    function adjustQuantity(delta) {
        const quantityElement = getQuantityInput();
        if (!quantityElement) return;
        const current = parseInt(quantityElement.value) || 1;
        const newVal = Math.max(1, current + delta);
        quantityElement.value = newVal;
    }

    function updateStock(action) {
        if (!currentProduct) {
            showNotification('製品を選択してください', 'out');
            return;
        }

        const quantityElement = getQuantityInput();
        if (!quantityElement) {
            showNotification('数量入力が見つかりません', 'out');
            return;
        }
        const quantity = Math.max(1, parseInt(quantityElement.value) || 1);

        fetch('/api/inventory/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: currentProduct.id, action, quantity })
        })
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                const actionStr = action === 'in' ? '入庫' : '出庫';
                showNotification(`${currentProduct.name} を ${quantity}個、${actionStr}しました。`, action);
                clearProduct();
                barcodeInput.focus();
            } else {
                showNotification(data.error, 'out');
            }
        })
        .catch(error => console.error('Error updating stock:', error));
    }

    function showNotification(message, type) {
        const id = Date.now();
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    ${type === 'in' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22,4 12,14.01 9,11.01"></polyline>' : '<circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path>'}
                </svg>
            </div>
            <span class="notification-message">${message}</span>
        `;

        notifications.appendChild(notification);

        // Animate in
        setTimeout(() => notification.style.transform = 'translateX(0)', 10);

        // Auto remove
        setTimeout(() => {
            notification.style.transform = 'translateX(200px)';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // Initialize placeholder
    showPlaceholder();
});