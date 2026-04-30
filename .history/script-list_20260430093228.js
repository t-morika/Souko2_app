document.addEventListener('DOMContentLoaded', function() {
    const barcodeInput = document.getElementById('barcode');
    const searchBarcodeBtn = document.getElementById('search-barcode');
    const deviceList = document.getElementById('device-list');
    const productDetail = document.getElementById('product-detail');
    const stockInBtn = document.getElementById('stock-in');
    const stockOutBtn = document.getElementById('stock-out');
    const notifications = document.getElementById('notifications');

    let inventoryItems = [];
    let currentProduct = null;

    fetchInventory();

    searchBarcodeBtn.addEventListener('click', searchByBarcode);
    barcodeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchByBarcode();
        }
    });

    stockInBtn.addEventListener('click', () => updateStock('in'));
    stockOutBtn.addEventListener('click', () => updateStock('out'));

    function fetchInventory() {
        fetch('/api/inventory')
            .then(response => response.json())
            .then(data => {
                inventoryItems = data.map(item => ({
                    ...item.product,
                    quantity: item.quantity,
                    displayCategory: mapCategory(item.product.category)
                }));
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

    function renderDeviceList() {
        deviceList.innerHTML = '';
        const displayOrder = ['消耗品', 'ノートPC', '一体型PC', 'モニター'];
        const grouped = inventoryItems.reduce((acc, item) => {
            acc[item.displayCategory] = acc[item.displayCategory] || [];
            acc[item.displayCategory].push(item);
            return acc;
        }, {});

        displayOrder.forEach(category => {
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
                        <div class="device-meta">
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
    }

    function selectProduct(productId) {
        const product = inventoryItems.find(item => item.id === productId);
        if (!product) return;
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

    function clearProduct() {
        currentProduct = null;
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

    function adjustQuantity(delta) {
        const quantityElement = document.getElementById('quantity');
        if (!quantityElement) return;
        const current = parseInt(quantityElement.value) || 1;
        quantityElement.value = Math.max(1, current + delta);
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
        .catch(() => showNotification('製品が見つかりません', 'out'));
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