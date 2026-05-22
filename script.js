document.addEventListener('DOMContentLoaded', function () {
    var barcodeInput = document.getElementById('barcode');
    var searchBarcodeBtn = document.getElementById('search-barcode');
    var categorySelect = document.getElementById('category-select');
    var makerSelect = document.getElementById('maker-select');
    var deviceList = document.getElementById('device-list');
    var productDetail = document.getElementById('product-detail');
    var stockInBtn = document.getElementById('stock-in');
    var stockOutBtn = document.getElementById('stock-out');
    var stockDisposeBtn = document.getElementById('stock-dispose');
    var notifications = document.getElementById('notifications');

    var categories = [];
    var makers = [];
    var inventoryItems = [];
    var selectedCategory = '';
    var selectedMaker = '';
    var currentProduct = null;
    var currentPhase = 'category';
    var numpadRoot = null;

    function requestJSON(url, options, onSuccess, onError) {
        fetch(url, options || {})
            .then(function (res) {
                return res.json().then(function (json) {
                    if (!res.ok) throw json;
                    return json;
                });
            })
            .then(onSuccess)
            .catch(function (err) {
                if (onError) onError(err);
            });
    }

    function normalizeBarcodeInput(value) {
        if (!value) return '';
        return value.replace(/[\u3000]/g, ' ').replace(/[！-～]/g, function (ch) {
            return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
        }).trim();
    }

    function buildBarcodeNumpad() {
        if (numpadRoot) return;

        var root = document.createElement('div');
        root.id = 'barcode-numpad';
        root.className = 'barcode-numpad';
        root.setAttribute('aria-hidden', 'true');

        root.innerHTML =
            '<div class="barcode-numpad-panel" role="dialog" aria-label="バーコード入力テンキー">' +
            '<div class="barcode-numpad-head">' +
            '<span>テンキー入力</span>' +
            '<button type="button" class="numpad-close" data-key="close" aria-label="閉じる">×</button>' +
            '</div>' +
            '<div class="barcode-numpad-grid">' +
            '<button type="button" data-key="7">7</button>' +
            '<button type="button" data-key="8">8</button>' +
            '<button type="button" data-key="9">9</button>' +
            '<button type="button" data-key="4">4</button>' +
            '<button type="button" data-key="5">5</button>' +
            '<button type="button" data-key="6">6</button>' +
            '<button type="button" data-key="1">1</button>' +
            '<button type="button" data-key="2">2</button>' +
            '<button type="button" data-key="3">3</button>' +
            '<button type="button" class="numpad-secondary" data-key="clear">C</button>' +
            '<button type="button" data-key="0">0</button>' +
            '<button type="button" class="numpad-secondary" data-key="backspace">⌫</button>' +
            '</div>' +
            '<div class="barcode-numpad-foot">' +
            '<button type="button" class="numpad-enter" data-key="enter">検索</button>' +
            '</div>' +
            '</div>';

        root.addEventListener('click', function (event) {
            var target = event.target;
            if (!(target instanceof HTMLElement)) return;
            var key = target.dataset ? target.dataset.key : '';
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

    function showNotification(message, type) {
        if (!notifications) return;
        var notification = document.createElement('div');
        notification.className = 'notification ' + (type || 'in');
        notification.innerHTML = '<div class="notification-icon"></div><span class="notification-message">' + message + '</span>';
        notifications.appendChild(notification);
        setTimeout(function () {
            if (notification && notification.parentNode) notification.parentNode.removeChild(notification);
        }, 3000);
    }

    function renderDefaultPlaceholder() {
        productDetail.innerHTML =
            '<div class="placeholder">' +
            '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">' +
            '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>' +
            '</svg>' +
            '<p>製品を選択してください</p>' +
            '<p class="description">左側の機器一覧から、製品を選択してください。</p>' +
            '</div>';
    }

    function renderCategorySelect() {
        categorySelect.innerHTML = '';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '選択してください';
        categorySelect.appendChild(defaultOpt);
        for (var i = 0; i < categories.length; i++) {
            var cat = categories[i];
            var opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            if (selectedCategory === cat.id) opt.selected = true;
            categorySelect.appendChild(opt);
        }
        // イベント
        categorySelect.onchange = function () {
            selectedCategory = categorySelect.value;
            selectedMaker = '';
            currentPhase = selectedCategory ? 'maker' : 'category';
            currentProduct = null;
            renderDefaultPlaceholder();
            if (selectedCategory) {
                loadMakers(selectedCategory);
            } else {
                makers = [];
                renderMakerSelect();
                renderDeviceList();
            }
        };
    }

    function renderMakerSelect() {
        makerSelect.innerHTML = '';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '選択してください';
        makerSelect.appendChild(defaultOpt);
        if (currentPhase === 'category' || !makers.length) {
            makerSelect.disabled = true;
            return;
        }
        makerSelect.disabled = false;
        for (var i = 0; i < makers.length; i++) {
            var maker = makers[i];
            var opt = document.createElement('option');
            opt.value = maker.id;
            opt.textContent = maker.name;
            if (selectedMaker === maker.id) opt.selected = true;
            makerSelect.appendChild(opt);
        }
        makerSelect.onchange = function () {
            selectedMaker = makerSelect.value;
            currentPhase = selectedMaker ? 'product' : 'maker';
            currentProduct = null;
            renderDefaultPlaceholder();
            if (selectedMaker) {
                loadInventory(selectedCategory, selectedMaker);
            } else {
                inventoryItems = [];
                renderDeviceList();
            }
        };
    }

    function renderDeviceList() {
        deviceList.innerHTML = '';

        if (currentPhase === 'category') {
            deviceList.innerHTML = '<div class="placeholder"><p>カテゴリを選択してください</p></div>';
            return;
        }
        if (currentPhase === 'maker') {
            deviceList.innerHTML = '<div class="placeholder"><p>メーカーを選択してください</p></div>';
            return;
        }
        if (!inventoryItems || inventoryItems.length === 0) {
            deviceList.innerHTML = '<div class="placeholder"><p>該当する製品がありません。</p></div>';
            return;
        }

        for (var i = 0; i < inventoryItems.length; i++) {
            (function (item) {
                var card = document.createElement('button');
                card.type = 'button';
                card.className = 'device-card';
                card.innerHTML =
                    '<div class="device-card-header">' +
                    '<div class="device-name">' + (item.product.product_name || '-') + '</div>' +
                    '<div class="device-meta device-stock"><span><strong>' + item.stock_quantity + '</strong> 在庫</span></div>' +
                    '</div>' +
                    '<div class="device-meta">' +
                    '<span><strong>コード:</strong> ' + (item.product.product_cd || '-') + '</span>' +
                    '<span><strong>カテゴリー:</strong> ' + (item.product.category_name || '-') + '</span>' +
                    '<span><strong>メーカー:</strong> ' + (item.product.maker_name || '-') + '</span>' +
                    '</div>';
                card.addEventListener('click', function () {
                    var cards = document.querySelectorAll('.device-card');
                    for (var j = 0; j < cards.length; j++) cards[j].classList.remove('active');
                    card.classList.add('active');
                    selectProduct(item);
                });
                deviceList.appendChild(card);
            })(inventoryItems[i]);
        }
    }

    function selectProduct(item) {
        currentProduct = item;
        productDetail.innerHTML =
            '<div class="product-header">' +
            '<div class="product-info">' +
            '<span class="category-label">' + (item.product.category_name || '-') + '</span>' +
            '<h1 class="product-name">' + (item.product.product_name || '-') + '</h1>' +
            '</div>' +
            '<button id="clear-product" class="clear-btn">CLEAR</button>' +
            '</div>' +
            '<div class="product-tags">' +
            '<span class="tag maker">コード: ' + (item.product.product_cd || '-') + '</span>' +
            '<span class="tag id">メーカー: ' + (item.product.maker_name || '-') + '</span>' +
            '<span class="tag id">現在庫: ' + item.stock_quantity + '</span>' +
            '</div>' +
            '<div class="quantity-adjust">' +
            '<span class="section-label">Adjust Quantity</span>' +
            '<div class="quantity-controls">' +
            '<button id="quantity-minus" class="quantity-btn">-</button>' +
            '<input type="number" id="quantity" min="1" value="1" class="quantity-input">' +
            '<button id="quantity-plus" class="quantity-btn">+</button>' +
            '</div>' +
            '</div>';

        document.getElementById('clear-product').addEventListener('click', function () {
            currentProduct = null;
            renderDefaultPlaceholder();
        });

        document.getElementById('quantity-minus').addEventListener('click', function () {
            var input = document.getElementById('quantity');
            var value = parseInt(input.value, 10) || 1;
            input.value = Math.max(1, value - 1);
        });

        document.getElementById('quantity-plus').addEventListener('click', function () {
            var input = document.getElementById('quantity');
            var value = parseInt(input.value, 10) || 1;
            input.value = value + 1;
        });
    }

    function loadCategories() {
        requestJSON('/api/categories', {}, function (data) {
            categories = data || [];
            currentPhase = 'category';
            selectedCategory = '';
            selectedMaker = '';
            renderCategorySelect();
            renderMakerSelect();
            renderDeviceList();
        }, function () {
            showNotification('カテゴリの取得に失敗しました', 'out');
        });
    }

    function loadMakers(categoryId) {
        requestJSON('/api/makers?category_id=' + encodeURIComponent(categoryId), {}, function (data) {
            makers = data || [];
            renderMakerSelect();
            renderDeviceList();
        }, function () {
            showNotification('メーカーの取得に失敗しました', 'out');
        });
    }

    function loadInventory(categoryId, makerId) {
        var url = '/api/inventory?category_id=' + encodeURIComponent(categoryId) + '&maker_id=' + encodeURIComponent(makerId);
        requestJSON(url, {}, function (data) {
            inventoryItems = data || [];
            renderDeviceList();
        }, function () {
            showNotification('在庫一覧の取得に失敗しました', 'out');
        });
    }

    function updateStock(action) {
        if (!currentProduct) {
            showNotification('製品を選択してください', 'out');
            return;
        }

        var quantityInput = document.getElementById('quantity');
        var quantity = quantityInput ? parseInt(quantityInput.value, 10) || 1 : 1;
        quantity = Math.max(1, quantity);

        requestJSON('/api/inventory/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_cd: currentProduct.product.product_cd,
                action: action,
                quantity: quantity
            })
        }, function () {
            var actionLabel = '出庫';
            if (action === 'in') actionLabel = '入庫';
            if (action === 'dispose') actionLabel = '廃棄';
            showNotification((currentProduct.product.product_name || '-') + ' を ' + quantity + '個 ' + actionLabel + 'しました。', action === 'in' ? 'in' : 'out');
            loadInventory(selectedCategory, selectedMaker);
        }, function (err) {
            var msg = (err && err.error) ? err.error : '更新に失敗しました';
            showNotification(msg, 'out');
        });
    }

    function searchByBarcode() {
        var barcode = normalizeBarcodeInput(barcodeInput.value);
        if (!barcode) {
            showNotification('バーコードを入力してください', 'out');
            return;
        }
        requestJSON('/api/barcode/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: barcode })
        }, function (item) {
            selectProduct(item);
        }, function (err) {
            var msg = (err && err.error) ? err.error : '製品が見つかりません';
            showNotification(msg, 'out');
        });
    }

    buildBarcodeNumpad();

    barcodeInput.addEventListener('focus', showBarcodeNumpad);
    barcodeInput.addEventListener('click', showBarcodeNumpad);
    barcodeInput.addEventListener('touchstart', showBarcodeNumpad, { passive: true });

    document.addEventListener('mousedown', function (event) {
        if (!numpadRoot || !numpadRoot.classList.contains('visible')) return;
        var target = event.target;
        if (!(target instanceof Node)) return;
        if (target === barcodeInput || barcodeInput.contains(target) || numpadRoot.contains(target)) return;
        hideBarcodeNumpad();
    });

    document.addEventListener('touchstart', function (event) {
        if (!numpadRoot || !numpadRoot.classList.contains('visible')) return;
        var target = event.target;
        if (!(target instanceof Node)) return;
        if (target === barcodeInput || barcodeInput.contains(target) || numpadRoot.contains(target)) return;
        hideBarcodeNumpad();
    }, { passive: true });

    searchBarcodeBtn.addEventListener('click', function () {
        hideBarcodeNumpad();
        searchByBarcode();
    });
    barcodeInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') searchByBarcode();
    });
    stockInBtn.addEventListener('click', function () { updateStock('in'); });
    stockOutBtn.addEventListener('click', function () { updateStock('out'); });
    if (stockDisposeBtn) {
        stockDisposeBtn.addEventListener('click', function () { updateStock('dispose'); });
    }

    renderDefaultPlaceholder();
    loadCategories();
});