document.addEventListener('DOMContentLoaded', function() {
    const barcodeInput = document.getElementById('barcode');
    const searchBarcodeBtn = document.getElementById('search-barcode');
    const quickBtns = document.querySelectorAll('.quick-btn');
    const clearBtn = document.getElementById('clear-product');
    const quantityMinusBtn = document.getElementById('quantity-minus');
    const quantityPlusBtn = document.getElementById('quantity-plus');
    const quantityInput = document.getElementById('quantity');
    const stockInBtn = document.getElementById('stock-in');
    const stockOutBtn = document.getElementById('stock-out');
    const productDetail = document.getElementById('product-detail');
    const productSection = document.getElementById('product-section');
    const notifications = document.getElementById('notifications');

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
    quantityMinusBtn.addEventListener('click', () => adjustQuantity(-1));
    quantityPlusBtn.addEventListener('click', () => adjustQuantity(1));
    quantityInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (val < 1) e.target.value = 1;
    });

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
        document.getElementById('category-label').textContent = product.category;
        document.getElementById('product-name').textContent = product.name;

        const tagsContainer = document.getElementById('product-tags');
        tagsContainer.innerHTML = `
            <span class="tag maker">Maker: ${product.manufacturer}</span>
            <span class="tag id">ID: ${product.id}</span>
        `;

        // Update quick button active state
        quickBtns.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.productId) === productId);
        });

        // Show product detail
        productDetail.style.display = 'flex';
    }

    function clearProduct() {
        currentProduct = null;
        document.getElementById('category-label').textContent = 'カテゴリ';
        document.getElementById('product-name').textContent = '製品を選択してください';
        document.getElementById('product-tags').innerHTML = '';
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
        const current = parseInt(quantityInput.value);
        const newVal = Math.max(1, current + delta);
        quantityInput.value = newVal;
    }

    function updateStock(action) {
        if (!currentProduct) {
            showNotification('製品を選択してください', 'out');
            return;
        }

        const quantity = parseInt(quantityInput.value);

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